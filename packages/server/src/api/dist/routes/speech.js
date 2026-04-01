/**
 * speech.ts — Chat Pipeline LLM endpoint
 *
 * POST /api/speech/chat — History-aware channel conversation.
 * AI reads channel history and responds in character.
 * Uses Haiku with AKB tool-use for grounded, context-aware chat.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { COMPANY_ROOT, readFile } from '../services/file-reader.js';
import { buildOrgTree } from '../engine/index.js';
import { parseMarkdownTable, extractBoldKeyValues } from '../services/markdown-parser.js';
import { AnthropicProvider, ClaudeCliProvider, } from '../engine/llm-adapter.js';
import { TokenLedger } from '../services/token-ledger.js';
import { readConfig } from '../services/company-config.js';
import { readPreferences } from '../services/preferences.js';
import { calcLevel } from '../utils/role-level.js';
export const speechRouter = Router();
/* ══════════════════════════════════════════════════
 * Post-processing — OpenClaw-inspired filtering layer
 * ══════════════════════════════════════════════════ */
const MIN_DUPLICATE_TEXT_LENGTH = 10;
/** Exact match: entire message is [SILENT] (with optional whitespace) */
function isSilentReply(text) {
    return /^\s*\[SILENT\]\s*$/i.test(text);
}
/** Strip trailing [SILENT] from mixed content */
function stripSilentToken(text) {
    return text.replace(/(?:^|\s+)\[SILENT\]\s*$/i, '').trim();
}
/** Normalize for duplicate comparison (OpenClaw pattern) */
function normalizeForComparison(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/** Check if message is a duplicate of any history message (substring match) */
function isDuplicateMessage(text, historyTexts) {
    const normalized = normalizeForComparison(text);
    if (!normalized || normalized.length < MIN_DUPLICATE_TEXT_LENGTH)
        return false;
    return historyTexts.some(sent => {
        const normSent = normalizeForComparison(sent);
        if (!normSent || normSent.length < MIN_DUPLICATE_TEXT_LENGTH)
            return false;
        return normalized.includes(normSent) || normSent.includes(normalized);
    });
}
/** Post-process LLM chat output: sanitize, detect silence, check duplicates */
function postProcessChatMessage(raw, historyTexts) {
    // 1. Clean quotes
    let text = raw.replace(/^["']|["']$/g, '').trim();
    // 2. Strip CLI noise
    if (text.startsWith('Error: Reached max turns') || !text)
        return '';
    // 3. Exact [SILENT] → suppress
    if (isSilentReply(text))
        return '';
    // 4. Trailing [SILENT] → strip it
    text = stripSilentToken(text);
    if (!text)
        return '';
    // 5. Duplicate detection (substring match against recent history)
    if (isDuplicateMessage(text, historyTexts))
        return '';
    return text;
}
/* ══════════════════════════════════════════════════
 * AKB Tools — Let chat roles explore company knowledge
 * ══════════════════════════════════════════════════ */
const MAX_TOOL_ROUNDS = 50;
const MAX_FILE_CHARS = 1500; // truncate large files
const AKB_TOOLS = [
    {
        name: 'search_akb',
        description: 'Search the company knowledge base (AKB) for keywords. Returns matching file paths and snippets. Use to find decisions, journals, projects, waves, standups, or any company knowledge.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search keywords (e.g. "landing deploy", "refactoring decision", "Store Import")' },
                path: { type: 'string', description: 'Optional subdirectory to search in (e.g. "operations/decisions", "projects", "knowledge"). Defaults to entire AKB.' },
            },
            required: ['query'],
        },
    },
    {
        name: 'read_file',
        description: 'Read a specific file from the AKB. Use after search_akb to read full content of interesting files.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to AKB root (e.g. "operations/decisions/008-repo-structure.md", "projects/projects.md")' },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_files',
        description: 'List files in a directory. Useful to discover what exists (e.g. "operations/waves/", "roles/engineer/journal/").',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Directory path relative to AKB root (e.g. "operations/standups", "roles/pm/journal")' },
                pattern: { type: 'string', description: 'Glob pattern (default: "*.md")' },
            },
            required: ['path'],
        },
    },
];
function executeAkbTool(name, input) {
    try {
        switch (name) {
            case 'search_akb': {
                const query = String(input.query || '');
                const searchPath = input.path ? String(input.path) : '';
                const searchDir = path.resolve(COMPANY_ROOT, searchPath);
                if (!fs.existsSync(searchDir))
                    return `Directory not found: ${searchPath || '/'}`;
                // Find all .md files, then grep for query keywords
                const mdFiles = glob.sync('**/*.md', { cwd: searchDir, nodir: true }).slice(0, 100);
                const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
                const results = [];
                for (const file of mdFiles) {
                    const fullPath = path.join(searchDir, file);
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const lower = content.toLowerCase();
                    const matchCount = keywords.filter(k => lower.includes(k)).length;
                    if (matchCount >= Math.max(1, Math.ceil(keywords.length * 0.5))) {
                        // Extract a relevant snippet (first matching line + context)
                        const lines = content.split('\n');
                        let snippet = '';
                        for (let i = 0; i < lines.length; i++) {
                            const ll = lines[i].toLowerCase();
                            if (keywords.some(k => ll.includes(k))) {
                                snippet = lines.slice(Math.max(0, i - 1), i + 3).join('\n').slice(0, 200);
                                break;
                            }
                        }
                        const relPath = searchPath ? `${searchPath}/${file}` : file;
                        results.push(`📄 ${relPath} (${matchCount}/${keywords.length} keywords)\n${snippet}`);
                    }
                    if (results.length >= 8)
                        break;
                }
                return results.length > 0
                    ? results.join('\n\n')
                    : `No results for "${query}" in ${searchPath || 'AKB'}`;
            }
            case 'read_file': {
                const filePath = String(input.path || '');
                const absolute = path.resolve(COMPANY_ROOT, filePath);
                if (!fs.existsSync(absolute))
                    return `File not found: ${filePath}`;
                const content = fs.readFileSync(absolute, 'utf-8');
                return content.length > MAX_FILE_CHARS
                    ? content.slice(0, MAX_FILE_CHARS) + `\n\n... (truncated, ${content.length} chars total)`
                    : content;
            }
            case 'list_files': {
                const dirPath = String(input.path || '');
                const pat = String(input.pattern || '*.md');
                const absolute = path.resolve(COMPANY_ROOT, dirPath);
                if (!fs.existsSync(absolute))
                    return `Directory not found: ${dirPath}`;
                const files = glob.sync(pat, { cwd: absolute, nodir: true }).sort();
                return files.length > 0
                    ? files.map(f => `- ${dirPath}/${f}`).join('\n')
                    : `No files matching "${pat}" in ${dirPath}`;
            }
            default:
                return `Unknown tool: ${name}`;
        }
    }
    catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
}
/**
 * Run mini agent loop: LLM call → tool use → LLM call → ... → final text.
 * Max MAX_TOOL_ROUNDS rounds of tool use, then force a text response.
 */
async function chatWithTools(provider, systemPrompt, initialMessages, useTools, maxTokens) {
    const messages = [...initialMessages];
    const totalUsage = { inputTokens: 0, outputTokens: 0 };
    const tools = useTools ? AKB_TOOLS : undefined;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        // During tool exploration use higher limit; cap only final text response
        const isToolPhase = tools && round < MAX_TOOL_ROUNDS;
        const opts = isToolPhase ? { maxTokens: 1024 } : maxTokens ? { maxTokens } : undefined;
        const response = await provider.chat(systemPrompt, messages, tools, undefined, opts);
        totalUsage.inputTokens += response.usage.inputTokens;
        totalUsage.outputTokens += response.usage.outputTokens;
        // Check if there are tool calls
        const toolCalls = response.content.filter(c => c.type === 'tool_use');
        const textParts = response.content.filter(c => c.type === 'text').map(c => c.text);
        if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
            // No tool calls or max rounds reached — return text
            return { text: textParts.join('').trim(), totalUsage };
        }
        // Execute tool calls and build tool results
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = toolCalls.map(tc => {
            const call = tc;
            const result = executeAkbTool(call.name, call.input);
            return { type: 'tool_result', tool_use_id: call.id, content: result };
        });
        messages.push({ role: 'user', content: toolResults });
    }
    return { text: '', totalUsage };
}
/**
 * Build a compact company context for chat system prompts.
 * Provides a seed overview — the agent can dig deeper via AKB tools.
 */
function buildCompanyContext() {
    const parts = [];
    // 1. Company info (name, mission)
    try {
        const companyContent = readFile('company/company.md');
        const companyName = companyContent.split('\n').find(l => l.startsWith('# '))?.replace(/^#\s+/, '') ?? '';
        const missionMatch = companyContent.match(/^>\s*(.+)/m);
        const mission = missionMatch ? missionMatch[1].trim() : '';
        const kv = extractBoldKeyValues(companyContent);
        const domain = kv['도메인'] ?? kv['domain'] ?? '';
        if (companyName) {
            parts.push(`Company: ${companyName}${domain ? ` (${domain})` : ''}${mission ? `\nMission: ${mission}` : ''}`);
        }
    }
    catch { /* no company.md */ }
    // 2. Org overview (who reports to whom)
    try {
        const tree = buildOrgTree(COMPANY_ROOT);
        const orgLines = [];
        for (const [, node] of tree.nodes) {
            if (node.id === 'ceo')
                continue;
            orgLines.push(`- ${node.name} (${node.id}, ${node.level}) reports to ${node.reportsTo}`);
        }
        if (orgLines.length > 0) {
            parts.push(`Organization:\n${orgLines.join('\n')}`);
        }
    }
    catch { /* no org */ }
    // 3. Active projects + current phase from tasks.md
    try {
        const projectsContent = readFile('projects/projects.md');
        const rows = parseMarkdownTable(projectsContent);
        const activeProjects = rows
            .filter(r => (r.status ?? r.상태 ?? '').toLowerCase() !== 'archived')
            .map(r => {
            const name = r.name ?? r.project ?? r.프로젝트 ?? '';
            const status = r.status ?? r.상태 ?? '';
            const folder = r.folder ?? r.path ?? r.경로 ?? '';
            // Try to read tasks.md for current phase info
            let phaseInfo = '';
            if (folder) {
                try {
                    const tasksPath = `${folder.replace(/^\//, '')}/tasks.md`;
                    const tasksContent = readFile(tasksPath);
                    // Extract current phase (look for "Current" or latest non-done phase)
                    const phaseMatch = tasksContent.match(/##\s+(Phase\s+\S+[^\n]*)/gi);
                    if (phaseMatch)
                        phaseInfo = ` — ${phaseMatch[0].replace(/^##\s+/, '').slice(0, 60)}`;
                }
                catch { /* no tasks.md */ }
            }
            return `- ${name} (${status}${phaseInfo})`;
        })
            .slice(0, 5);
        if (activeProjects.length > 0) {
            parts.push(`Active Projects:\n${activeProjects.join('\n')}`);
        }
    }
    catch { /* no projects */ }
    // 3b. Tech stack reality check (prevent hallucination about wrong tech)
    try {
        const config = readConfig(COMPANY_ROOT);
        if (config.codeRoot) {
            const pkgPath = path.join(config.codeRoot, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                const name = pkg.name ?? '';
                const version = pkg.version ?? '';
                parts.push(`Tech Stack: ${name}@${version} — TypeScript + React + Node.js (Express). NO Python in codebase. NO ongoing language migration.`);
            }
        }
    }
    catch { /* no package.json */ }
    // 4. Knowledge highlights (hub TL;DRs, max 3)
    try {
        const knowledgeHub = readFile('knowledge/knowledge.md');
        const tldr = knowledgeHub.match(/## TL;DR[\s\S]*?(?=\n## [^#])/);
        if (tldr) {
            parts.push(`Knowledge Base:\n${tldr[0].replace('## TL;DR', '').trim().slice(0, 300)}`);
        }
    }
    catch { /* no knowledge */ }
    // 5. Recent CEO decisions (max 5)
    try {
        const decisionsDir = path.join(COMPANY_ROOT, 'operations', 'decisions');
        if (fs.existsSync(decisionsDir)) {
            const files = fs.readdirSync(decisionsDir)
                .filter(f => f.endsWith('.md') && f !== 'decisions.md')
                .sort()
                .slice(-5);
            const decisions = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');
                const statusMatch = content.match(/>\s*Status:\s*(.+)/i);
                if (!statusMatch || !statusMatch[1].toLowerCase().includes('approved'))
                    continue;
                const titleMatch = content.match(/^#\s+(.+)/m);
                if (titleMatch)
                    decisions.push(`- ${titleMatch[1].trim()}`);
            }
            if (decisions.length > 0) {
                parts.push(`Recent CEO Decisions:\n${decisions.join('\n')}`);
            }
        }
    }
    catch { /* no decisions */ }
    return parts.length > 0
        ? `\n\nCOMPANY CONTEXT (use this to inform your conversations):\n${parts.join('\n\n')}`
        : '';
}
/**
 * Build role-specific AKB context by pre-fetching relevant knowledge server-side.
 * This is the PRIMARY source of grounding for chat — must be rich enough that
 * agents don't need to use tools (Haiku won't proactively search).
 */
function buildRoleContext(roleId) {
    const parts = [];
    // 0. Role profile — gives the agent its identity and work context
    try {
        const profilePath = path.join(COMPANY_ROOT, 'roles', roleId, 'profile.md');
        if (fs.existsSync(profilePath)) {
            const content = fs.readFileSync(profilePath, 'utf-8').trim();
            if (content.length > 20) {
                parts.push(`[Your Profile]\n${content.slice(0, 600)}`);
            }
        }
    }
    catch { /* no profile */ }
    // 1. Role's journal — latest entry only, compact summary (not full header dump)
    try {
        const journalDir = path.join(COMPANY_ROOT, 'roles', roleId, 'journal');
        if (fs.existsSync(journalDir)) {
            const files = fs.readdirSync(journalDir)
                .filter(f => f.endsWith('.md'))
                .sort()
                .slice(-1); // Only latest entry
            for (const file of files) {
                const content = fs.readFileSync(path.join(journalDir, file), 'utf-8');
                const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
                // Take first 300 chars of actual content (skip title line)
                const body = content.split('\n').slice(1).join('\n').trim().slice(0, 300);
                parts.push(`[Your Recent Work: ${file}] ${title}\n${body}`);
            }
        }
    }
    catch { /* no journal */ }
    // 2. Current tasks assigned to this role (from all project tasks.md files)
    try {
        const projectsDir = path.join(COMPANY_ROOT, 'projects');
        if (fs.existsSync(projectsDir)) {
            const taskFiles = glob.sync('**/tasks.md', { cwd: projectsDir, absolute: false });
            const roleTasks = [];
            for (const tf of taskFiles.slice(0, 3)) {
                const content = fs.readFileSync(path.join(projectsDir, tf), 'utf-8');
                const rows = parseMarkdownTable(content);
                const myTasks = rows.filter(r => {
                    const role = (r.role ?? r.Role ?? '').toLowerCase();
                    return role.includes(roleId);
                });
                for (const t of myTasks.slice(0, 5)) {
                    const id = t.id ?? t.ID ?? '';
                    const task = t.task ?? t.Task ?? t.title ?? '';
                    const status = t.status ?? t.Status ?? '';
                    if (task)
                        roleTasks.push(`- ${id}: ${task} [${status}]`);
                }
            }
            if (roleTasks.length > 0) {
                parts.push(`[Your Assigned Tasks]\n${roleTasks.join('\n')}`);
            }
        }
    }
    catch { /* no tasks */ }
    // 3. Recent waves — only from last 7 days (stale waves cause repetitive references)
    try {
        const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
        if (fs.existsSync(wavesDir)) {
            const tree = buildOrgTree(COMPANY_ROOT);
            const node = tree.nodes.get(roleId);
            const roleName = node?.name?.toLowerCase() ?? '';
            const roleLevel = node?.level?.toLowerCase() ?? '';
            // Parse date from filename: "20260310-1200.md" or "wave-2026-03-10-xxx.md" or "2026-03-10-xxx.md"
            const now = Date.now();
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            function parseDateFromFilename(f) {
                // Format: 20260310-xxxx.md
                let m = f.match(/^(\d{4})(\d{2})(\d{2})/);
                if (m)
                    return new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
                // Format: wave-2026-03-10-xxx.md or 2026-03-10-xxx.md
                m = f.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (m)
                    return new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime();
                return null;
            }
            const waveFiles = fs.readdirSync(wavesDir)
                .filter(f => f.endsWith('.md'))
                .filter(f => {
                const fileDate = parseDateFromFilename(f);
                if (!fileDate)
                    return false;
                return (now - fileDate) < SEVEN_DAYS;
            })
                .sort();
            const relevant = [];
            for (const file of waveFiles.reverse()) {
                if (relevant.length >= 2)
                    break;
                const content = fs.readFileSync(path.join(wavesDir, file), 'utf-8');
                const lower = content.toLowerCase();
                if (lower.includes(roleId) || lower.includes('all roles') || lower.includes('전체')
                    || (roleName && lower.includes(roleName))
                    || (roleLevel && lower.includes(roleLevel))) {
                    const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
                    const snippet = content.split('\n').slice(1, 8).join('\n').trim();
                    relevant.push(`[CEO Wave: ${file}] ${title}\n${snippet.slice(0, 400)}`);
                }
            }
            if (relevant.length > 0)
                parts.push(...relevant);
        }
    }
    catch { /* no waves */ }
    // 4. Recent standup (latest, this role's section)
    try {
        const standupDir = path.join(COMPANY_ROOT, 'operations', 'standup');
        if (fs.existsSync(standupDir)) {
            const files = fs.readdirSync(standupDir).filter(f => f.endsWith('.md')).sort().slice(-1);
            for (const file of files) {
                const content = fs.readFileSync(path.join(standupDir, file), 'utf-8');
                const rolePattern = new RegExp(`(## .*${roleId}.*|### .*${roleId}.*)([\\s\\S]*?)(?=\\n## |\\n### |$)`, 'i');
                const match = content.match(rolePattern);
                if (match) {
                    parts.push(`[Standup: ${file}] Your report:\n${match[0].slice(0, 300)}`);
                }
            }
        }
    }
    catch { /* no standups */ }
    // 5. Recent decisions (last 3)
    try {
        const decisionsDir = path.join(COMPANY_ROOT, 'operations', 'decisions');
        if (fs.existsSync(decisionsDir)) {
            const files = fs.readdirSync(decisionsDir)
                .filter(f => f.endsWith('.md') && f !== 'decisions.md')
                .sort()
                .slice(-3);
            const decisions = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');
                const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
                decisions.push(`- ${title}`);
            }
            if (decisions.length > 0) {
                parts.push(`[Recent Decisions]\n${decisions.join('\n')}`);
            }
        }
    }
    catch { /* no decisions */ }
    // 6. Architecture highlights (always include — not just fallback)
    try {
        const techDebtPath = path.join(COMPANY_ROOT, 'architecture', 'tech-debt.md');
        if (fs.existsSync(techDebtPath)) {
            const tdContent = fs.readFileSync(techDebtPath, 'utf-8');
            const rows = parseMarkdownTable(tdContent);
            const active = rows
                .filter(r => !(r.status ?? '').toLowerCase().includes('fixed') && !(r.status ?? '').toLowerCase().includes('done'))
                .slice(0, 3)
                .map(r => `- ${r.id ?? ''}: ${r.title ?? r.issue ?? ''} (${r.status ?? ''})`)
                .filter(s => s.length > 10);
            if (active.length > 0) {
                parts.push(`[Active Tech Issues]\n${active.join('\n')}`);
            }
        }
    }
    catch { /* no tech-debt */ }
    return parts.length > 0
        ? `\n\nYOUR KNOWLEDGE (real AKB context — you MUST reference this in conversation):\n${parts.join('\n\n')}`
        : '';
}
/**
 * SOUL Pattern — Few-shot example dialogues per role.
 * 2-3 example exchanges teach the model tone + length naturally.
 * (See knowledge/soul-pattern-chat-quality.md)
 */
function getRoleChatStyle(roleId, level, persona) {
    // SOUL-006: Persona Priority + Fallback (Plan C from persona-system-design.md)
    // If persona has personality/tone keywords → persona drives the tone
    // If persona is only work instructions → hardcoded few-shot as fallback
    const hasPersonalityContent = persona && persona.length > 50 &&
        /humor|sarcastic|cheerful|serious|calm|energetic|blunt|warm|cold|cynical|optimistic|dry|witty|chill|confident|anxious|grumpy|friendly|formal|casual|direct|shy|bold|quirky/i.test(persona);
    if (hasPersonalityContent) {
        return `YOUR VOICE (from your persona — this defines how you talk):
${persona}

Example response format (match this LENGTH only — your TONE comes from the persona above):
[Other]: something happened at work
[You]: (1-2 sentences in YOUR voice from persona above)

[Other]: unrelated topic to your expertise
[You]: [SILENT]`;
    }
    const souls = {
        engineer: `YOUR VOICE — Engineer (code, architecture, DX, tech debt)

Example conversations (match this exact tone and length):
[Other]: CEO just greenlit 3 new features for next sprint
[You]: we haven't closed the 12 bugs from last sprint but sure let's add more

[Other]: Should we refactor the context assembler before adding new features?
[You]: it works fine rn. refactoring now is procrastination with extra steps

[Other]: The leaderboard page looks great!
[You]: [SILENT]`,
        pm: `YOUR VOICE — Product Manager (scope, priorities, roadmap, user impact)

Example conversations (match this exact tone and length):
[Other]: Can we also add dark mode while we're at it?
[You]: that's a P2. we ship the coin system first or nothing ships

[Other]: CTO wants to refactor the entire auth layer before launch
[You]: cool so what are we dropping from the sprint then

[Other]: Quest board is getting good user feedback
[You]: [SILENT]`,
        designer: `YOUR VOICE — Designer (UX, visual consistency, user flows, design debt)

Example conversations (match this exact tone and length):
[Other]: The furniture shop UI is done, it works!
[You]: "works" and "good" are different things. the grid alignment is off and the hover states are inconsistent

[Other]: We're shipping the save modal without the scope selector
[You]: so we're just not designing the most confusing part. love that for us

[Other]: API response times improved by 30%
[You]: [SILENT]`,
        qa: `YOUR VOICE — QA Engineer (test coverage, edge cases, regression risk, bugs)

Example conversations (match this exact tone and length):
[Other]: We shipped the coin system, all manual tests passed
[You]: "manual tests passed" means "i clicked around and it didn't explode." what about edge cases

[Other]: No bugs reported this week!
[You]: that means nobody's testing, not that there's no bugs

[Other]: Designer wants to tweak the button colors
[You]: [SILENT]`,
        cto: `YOUR VOICE — CTO (architecture, tech strategy, eng culture, technical bets)

Example conversations (match this exact tone and length):
[Other]: Why are we using file-based state instead of a real database?
[You]: at our scale a DB is overhead we don't need. revisit when we have concurrent users

[Other]: Engineer says the dispatch bridge needs a rewrite
[You]: it needs better error handling not a rewrite. let's not burn a sprint on aesthetics

[Other]: The landing page copy got updated
[You]: [SILENT]`,
        cbo: `YOUR VOICE — CBO (market, revenue, competitors, growth, go-to-market)

Example conversations (match this exact tone and length):
[Other]: We added 5 new special furniture items to the shop
[You]: who's paying for this? show me the conversion funnel not the feature list

[Other]: OpenClaw just raised their Series A
[You]: their moat is thin. they have tooling, we have organizational intelligence. different game

[Other]: Test coverage went up to 80%
[You]: [SILENT]`,
        'data-analyst': `YOUR VOICE — Data Analyst (metrics, data quality, measurement, insights)

Example conversations (match this exact tone and length):
[Other]: We shipped 5 features this sprint!
[You]: shipped is not adopted. show me the usage numbers

[Other]: Revenue is up 20% this month
[You]: what's the baseline? 20% of what. context matters

[Other]: Designer updated the color palette
[You]: [SILENT]`,
    };
    const defaultSoul = level === 'c-level'
        ? `YOUR VOICE — Senior Leader

Example conversations (match this exact tone and length):
[Other]: The sprint is overloaded again
[You]: then we cut scope. what's the lowest-impact item?

[Other]: New competitor launched yesterday
[You]: [SILENT]`
        : `YOUR VOICE — Team Member

Example conversations (match this exact tone and length):
[Other]: CEO wants this done by Friday
[You]: that's ambitious. which corners are we allowed to cut?

[Other]: Company all-hands is tomorrow
[You]: [SILENT]`;
    const baseSoul = souls[roleId] ?? defaultSoul;
    // Append persona as additional context when it exists but isn't personality-driven
    if (persona && persona.length > 10) {
        return `${baseSoul}\n\nYour persona for additional context: ${persona}`;
    }
    return baseSoul;
}
// Lazy-init token ledger for cost tracking
let ledger = null;
function getLedger() {
    if (!ledger) {
        ledger = new TokenLedger(COMPANY_ROOT);
    }
    return ledger;
}
// Lazy-init LLM provider based on engine config
let llm = null;
function getLLM() {
    if (!llm) {
        const config = readConfig(COMPANY_ROOT);
        const model = process.env.SPEECH_MODEL || 'claude-haiku-4-5-20251001';
        if (config.engine === 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
            llm = new ClaudeCliProvider({ model });
        }
        else {
            llm = new AnthropicProvider({ model });
        }
    }
    return llm;
}
/**
 * POST /api/speech/chat
 *
 * Body: {
 *   channelId: string,
 *   roleId: string,
 *   history: Array<{ roleId: string, text: string, ts: number }>,
 *   members: Array<{ id: string, name: string, level: string }>,
 *   relationships: Array<{ partnerId: string, familiarity: number }>,
 *   workContext?: { currentTask: string | null, taskProgress: string | null }
 * }
 * Returns: { message: string, tokens: { input: number, output: number } }
 */
speechRouter.post('/chat', async (req, res, next) => {
    try {
        const { channelId, channelTopic, roleId, history, members, relationships, workContext } = req.body;
        // ── Compute role levels from token ledger ──
        const tokenLedger = getLedger();
        const allEntries = tokenLedger.query();
        // Aggregate total tokens (input + output) per role
        const tokensByRole = {};
        for (const entry of allEntries.entries) {
            tokensByRole[entry.roleId] = (tokensByRole[entry.roleId] ?? 0) + entry.inputTokens + entry.outputTokens;
        }
        const roleLevel = calcLevel(tokensByRole[roleId] ?? 0);
        // Team stats
        const roleIds = Object.keys(tokensByRole);
        const levels = roleIds.map(id => ({ id, level: calcLevel(tokensByRole[id]) }));
        const avgLevel = levels.length > 0
            ? Math.round(levels.reduce((sum, r) => sum + r.level, 0) / levels.length)
            : 1;
        const topEntry = levels.reduce((best, r) => r.level > best.level ? r : best, { id: roleId, level: roleLevel });
        const totalTokens = allEntries.totalInput + allEntries.totalOutput;
        const teamStats = { avgLevel, topRole: topEntry.id, totalTokens };
        if (!roleId || !channelId) {
            res.status(400).json({ error: 'roleId and channelId are required' });
            return;
        }
        const config = readConfig(COMPANY_ROOT);
        if (config.engine !== 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
            res.status(503).json({ error: 'Chat requires ANTHROPIC_API_KEY or claude-cli engine', message: '' });
            return;
        }
        // Build org tree to get persona
        const tree = buildOrgTree(COMPANY_ROOT);
        const node = tree.nodes.get(roleId);
        if (!node) {
            res.status(404).json({ error: `Role not found: ${roleId}` });
            return;
        }
        const persona = node.persona || `${node.name} (${node.level})`;
        // Build member context
        const memberList = members
            .map(m => `${m.name} (${m.level})`)
            .join(', ');
        // Build relationship context
        const relContext = relationships.length > 0
            ? `\nYour relationships:\n${relationships.map(r => {
                const memberName = members.find(m => m.id === r.partnerId)?.name ?? r.partnerId;
                const level = r.familiarity >= 80 ? 'best friends'
                    : r.familiarity >= 50 ? 'close colleagues'
                        : r.familiarity >= 20 ? 'coworkers'
                            : 'barely acquainted';
                return `- ${memberName}: ${level} (${r.familiarity}/100)`;
            }).join('\n')}`
            : '';
        // Build work context
        const workCtx = workContext?.currentTask
            ? `\nYou are currently working on: "${workContext.currentTask}"${workContext.taskProgress ? ` (${workContext.taskProgress})` : ''}`
            : '\nYou are currently idle (no active task).';
        // Build level context
        const levelCtx = `\nYour current level is Lv.${roleLevel}. Team average is Lv.${avgLevel}. ${topEntry.id} is the highest-leveled team member.`;
        // Build multi-turn messages from history (OpenClaw pattern)
        // This role's messages → assistant, others → user (with sender attribution)
        // LLM naturally maintains voice consistency with its own "previous" messages
        const chatMessages = [];
        if (history.length > 0) {
            // Group consecutive messages from same "side" (self vs others)
            let pendingOthers = [];
            const flushOthers = () => {
                if (pendingOthers.length > 0) {
                    chatMessages.push({ role: 'user', content: pendingOthers.join('\n') });
                    pendingOthers = [];
                }
            };
            for (const h of history) {
                const name = members.find(m => m.id === h.roleId)?.name ?? h.roleId;
                if (h.roleId === roleId) {
                    // This agent's previous message → assistant role
                    flushOthers();
                    // Anthropic requires alternating roles — merge consecutive assistant messages
                    const last = chatMessages[chatMessages.length - 1];
                    if (last?.role === 'assistant') {
                        last.content = `${last.content}\n${h.text}`;
                    }
                    else {
                        chatMessages.push({ role: 'assistant', content: h.text });
                    }
                }
                else {
                    // Other agent's message → accumulate as user role
                    pendingOthers.push(`${name}: ${h.text}`);
                }
            }
            flushOthers();
            // Final instruction — append to last user message if exists, otherwise add new
            const lastMsg = chatMessages[chatMessages.length - 1];
            if (lastMsg?.role === 'user') {
                lastMsg.content = `${lastMsg.content}\n\n---\nRespond as ${node.name}. New angle or [SILENT].`;
            }
            else {
                chatMessages.push({ role: 'user', content: `Respond as ${node.name}. New angle or [SILENT].` });
            }
        }
        else {
            chatMessages.push({ role: 'user', content: 'Start the conversation. 1-2 sentences.' });
        }
        // Ensure messages start with user role (Anthropic API requirement)
        if (chatMessages.length > 0 && chatMessages[0].role === 'assistant') {
            chatMessages.unshift({ role: 'user', content: '(conversation context)' });
        }
        // Build channel topic context
        const topicCtx = channelTopic
            ? `\nChannel topic: "${channelTopic}"\nYour messages should relate to this topic.`
            : '';
        // Build company context (cached per request — lightweight)
        const companyCtx = buildCompanyContext();
        // Build role-specific AKB context (pre-fetched, works with any engine)
        const roleCtx = buildRoleContext(roleId);
        // Role-specific communication style (SOUL-006: persona-priority)
        const roleStyle = getRoleChatStyle(roleId, node.level, node.persona);
        // Language preference
        const prefs = readPreferences(COMPANY_ROOT);
        const chatLang = prefs.language && prefs.language !== 'auto' ? prefs.language : 'en';
        const chatLangNames = { en: 'English', ko: 'Korean (한국어)', ja: 'Japanese (日本語)' };
        const chatLangName = chatLangNames[chatLang] ?? chatLang;
        const systemPrompt = `You are ${node.name}, ${node.level}. ${persona.slice(0, 800)}
${workCtx}${levelCtx}
Channel: #${channelId}${topicCtx} | Members: ${memberList}${relContext}

${roleStyle}

CONTEXT (from company AKB — reference by name):
${companyCtx}
${roleCtx}

You have search_akb, read_file, list_files tools. AKB root: ${COMPANY_ROOT}/
Optionally explore 1-2 for fresh context: operations/waves/, operations/decisions/, roles/${roleId}/journal/

RULES:
1. Match the tone and length from the example conversations above. 1-3 sentences MAX.
2. Reference actual projects, tasks, decisions by name.
3. NEVER invent technologies or projects not in AKB.
4. Nothing new to add? respond exactly: [SILENT]
5. Do NOT repeat others' points. New angle or silent.
6. No quotes around response.
7. NEVER start with "Honestly" or "Yeah".
8. You MUST respond in ${chatLangName}. All messages must be in ${chatLangName}.`;
        // ── Chat debug logging ──
        const chatDebug = process.env.CHAT_DEBUG === '1';
        if (chatDebug) {
            console.log('\n' + '═'.repeat(80));
            console.log(`[CHAT] Role: ${roleId} (${node.name}) | Channel: #${channelId}`);
            console.log('─'.repeat(80));
            console.log('[SYSTEM PROMPT]');
            console.log(systemPrompt);
            console.log('─'.repeat(80));
            console.log('[MESSAGES]');
            for (const m of chatMessages) {
                const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                console.log(`  [${m.role}] ${text.slice(0, 500)}`);
            }
            console.log('─'.repeat(80));
        }
        const provider = getLLM();
        // ClaudeCliProvider now supports tools via built-in Read/Grep/Glob
        // For ClaudeCliProvider: tools are handled internally by claude CLI (no custom tool loop needed)
        // For AnthropicProvider: use custom AKB tool loop via chatWithTools()
        const isAnthropicProvider = provider instanceof AnthropicProvider;
        let raw;
        let totalUsage;
        // SOUL-001: max_tokens safety net (not primary length control — few-shot handles that)
        const CHAT_MAX_TOKENS = 300;
        if (isAnthropicProvider) {
            // Anthropic SDK: custom AKB tool loop with multi-turn history
            const result = await chatWithTools(provider, systemPrompt, chatMessages, true, CHAT_MAX_TOKENS);
            raw = result.text;
            totalUsage = result.totalUsage;
        }
        else {
            // ClaudeCliProvider: flatten to single message (CLI doesn't support multi-turn)
            const flatHistory = history.map(h => {
                const name = members.find(m => m.id === h.roleId)?.name ?? h.roleId;
                return `${name}: ${h.text}`;
            }).join('\n');
            const cliPrompt = history.length > 0
                ? `CHAT LOG:\n${flatHistory}\n\n---\nRespond as ${node.name}. New angle or [SILENT].`
                : 'Start the conversation. 1-2 sentences.';
            const result = await provider.chat(systemPrompt, [{ role: 'user', content: cliPrompt }], AKB_TOOLS);
            raw = result.content.filter(c => c.type === 'text').map(c => c.text).join('');
            totalUsage = result.usage;
        }
        // Post-process: sanitize, [SILENT] detection, duplicate filtering
        const historyTexts = history.map(h => h.text);
        if (chatDebug) {
            console.log(`[RAW RESPONSE] ${raw}`);
        }
        const message = postProcessChatMessage(raw, historyTexts);
        if (chatDebug) {
            console.log(`[FINAL] ${message || '(empty — filtered out)'}`);
            console.log('═'.repeat(80) + '\n');
        }
        // Record usage in token ledger (category: chat)
        if (totalUsage) {
            getLedger().record({
                ts: new Date().toISOString(),
                jobId: `chat-${channelId}`,
                roleId,
                model: process.env.SPEECH_MODEL || 'claude-haiku-4-5-20251001',
                inputTokens: totalUsage.inputTokens ?? 0,
                outputTokens: totalUsage.outputTokens ?? 0,
            });
        }
        res.json({
            message,
            tokens: totalUsage,
        });
    }
    catch (err) {
        next(err);
    }
});
