/**
 * speech.ts — Chat Pipeline LLM endpoint
 *
 * POST /api/speech/chat — History-aware channel conversation.
 * AI reads channel history and responds in character.
 * Uses Haiku with AKB tool-use for grounded, context-aware chat.
 */
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { COMPANY_ROOT, readFile, fileExists, listFiles } from '../services/file-reader.js';
import { buildOrgTree } from '../engine/index.js';
import { parseMarkdownTable, extractBoldKeyValues } from '../services/markdown-parser.js';
import {
  AnthropicProvider, ClaudeCliProvider,
  type LLMProvider, type ToolDefinition, type LLMMessage, type LLMResponse, type MessageContent,
} from '../engine/llm-adapter.js';
import { TokenLedger } from '../services/token-ledger.js';
import { readConfig } from '../services/company-config.js';
import { calcLevel } from '../utils/role-level.js';

export const speechRouter = Router();

/* ══════════════════════════════════════════════════
 * AKB Tools — Let chat roles explore company knowledge
 * ══════════════════════════════════════════════════ */

const MAX_TOOL_ROUNDS = 2;
const MAX_FILE_CHARS = 1500; // truncate large files

const AKB_TOOLS: ToolDefinition[] = [
  {
    name: 'search_akb',
    description: 'Search the company knowledge base (AKB) for keywords. Returns matching file paths and snippets. Use to find decisions, journals, projects, waves, standups, or any company knowledge.',
    input_schema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Directory path relative to AKB root (e.g. "operations/standups", "roles/pm/journal")' },
        pattern: { type: 'string', description: 'Glob pattern (default: "*.md")' },
      },
      required: ['path'],
    },
  },
];

function executeAkbTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'search_akb': {
        const query = String(input.query || '');
        const searchPath = input.path ? String(input.path) : '';
        const searchDir = path.resolve(COMPANY_ROOT, searchPath);

        if (!fs.existsSync(searchDir)) return `Directory not found: ${searchPath || '/'}`;

        // Find all .md files, then grep for query keywords
        const mdFiles = glob.sync('**/*.md', { cwd: searchDir, nodir: true }).slice(0, 100);
        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        const results: string[] = [];

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
          if (results.length >= 8) break;
        }

        return results.length > 0
          ? results.join('\n\n')
          : `No results for "${query}" in ${searchPath || 'AKB'}`;
      }

      case 'read_file': {
        const filePath = String(input.path || '');
        const absolute = path.resolve(COMPANY_ROOT, filePath);
        if (!fs.existsSync(absolute)) return `File not found: ${filePath}`;
        const content = fs.readFileSync(absolute, 'utf-8');
        return content.length > MAX_FILE_CHARS
          ? content.slice(0, MAX_FILE_CHARS) + `\n\n... (truncated, ${content.length} chars total)`
          : content;
      }

      case 'list_files': {
        const dirPath = String(input.path || '');
        const pat = String(input.pattern || '*.md');
        const absolute = path.resolve(COMPANY_ROOT, dirPath);
        if (!fs.existsSync(absolute)) return `Directory not found: ${dirPath}`;
        const files = glob.sync(pat, { cwd: absolute, nodir: true }).sort();
        return files.length > 0
          ? files.map(f => `- ${dirPath}/${f}`).join('\n')
          : `No files matching "${pat}" in ${dirPath}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Run mini agent loop: LLM call → tool use → LLM call → ... → final text.
 * Max MAX_TOOL_ROUNDS rounds of tool use, then force a text response.
 */
async function chatWithTools(
  provider: LLMProvider,
  systemPrompt: string,
  initialMessages: LLMMessage[],
  useTools: boolean,
): Promise<{ text: string; totalUsage: { inputTokens: number; outputTokens: number } }> {
  const messages: LLMMessage[] = [...initialMessages];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  const tools = useTools ? AKB_TOOLS : undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await provider.chat(systemPrompt, messages, tools);
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;

    // Check if there are tool calls
    const toolCalls = response.content.filter(c => c.type === 'tool_use');
    const textParts = response.content.filter(c => c.type === 'text').map(c => (c as { type: 'text'; text: string }).text);

    if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
      // No tool calls or max rounds reached — return text
      return { text: textParts.join('').trim(), totalUsage };
    }

    // Execute tool calls and build tool results
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: MessageContent[] = toolCalls.map(tc => {
      const call = tc as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
      const result = executeAkbTool(call.name, call.input);
      return { type: 'tool_result' as any, tool_use_id: call.id, content: result } as any;
    });

    messages.push({ role: 'user', content: toolResults });
  }

  return { text: '', totalUsage };
}

/**
 * Build a compact company context for chat system prompts.
 * Provides a seed overview — the agent can dig deeper via AKB tools.
 */
function buildCompanyContext(): string {
  const parts: string[] = [];

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
  } catch { /* no company.md */ }

  // 2. Org overview (who reports to whom)
  try {
    const tree = buildOrgTree(COMPANY_ROOT);
    const orgLines: string[] = [];
    for (const [, node] of tree.nodes) {
      if (node.id === 'ceo') continue;
      orgLines.push(`- ${node.name} (${node.id}, ${node.level}) reports to ${node.reportsTo}`);
    }
    if (orgLines.length > 0) {
      parts.push(`Organization:\n${orgLines.join('\n')}`);
    }
  } catch { /* no org */ }

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
            if (phaseMatch) phaseInfo = ` — ${phaseMatch[0].replace(/^##\s+/, '').slice(0, 60)}`;
          } catch { /* no tasks.md */ }
        }
        return `- ${name} (${status}${phaseInfo})`;
      })
      .slice(0, 5);
    if (activeProjects.length > 0) {
      parts.push(`Active Projects:\n${activeProjects.join('\n')}`);
    }
  } catch { /* no projects */ }

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
  } catch { /* no package.json */ }

  // 4. Knowledge highlights (hub TL;DRs, max 3)
  try {
    const knowledgeHub = readFile('knowledge/knowledge.md');
    const tldr = knowledgeHub.match(/## TL;DR[\s\S]*?(?=\n## [^#])/);
    if (tldr) {
      parts.push(`Knowledge Base:\n${tldr[0].replace('## TL;DR', '').trim().slice(0, 300)}`);
    }
  } catch { /* no knowledge */ }

  // 5. Recent CEO decisions (max 5)
  try {
    const decisionsDir = path.join(COMPANY_ROOT, 'operations', 'decisions');
    if (fs.existsSync(decisionsDir)) {
      const files = fs.readdirSync(decisionsDir)
        .filter(f => f.endsWith('.md') && f !== 'decisions.md')
        .sort()
        .slice(-5);
      const decisions: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');
        const statusMatch = content.match(/>\s*Status:\s*(.+)/i);
        if (!statusMatch || !statusMatch[1].toLowerCase().includes('approved')) continue;
        const titleMatch = content.match(/^#\s+(.+)/m);
        if (titleMatch) decisions.push(`- ${titleMatch[1].trim()}`);
      }
      if (decisions.length > 0) {
        parts.push(`Recent CEO Decisions:\n${decisions.join('\n')}`);
      }
    }
  } catch { /* no decisions */ }

  return parts.length > 0
    ? `\n\nCOMPANY CONTEXT (use this to inform your conversations):\n${parts.join('\n\n')}`
    : '';
}

/**
 * Build role-specific AKB context by pre-fetching relevant knowledge server-side.
 * Works with ANY engine (including claude-cli which doesn't support tool_use).
 */
function buildRoleContext(roleId: string): string {
  const parts: string[] = [];

  // 1. Role's own journal (most recent 2 entries)
  try {
    const journalDir = path.join(COMPANY_ROOT, 'roles', roleId, 'journal');
    if (fs.existsSync(journalDir)) {
      const files = fs.readdirSync(journalDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .slice(-2);
      for (const file of files) {
        const content = fs.readFileSync(path.join(journalDir, file), 'utf-8');
        // Extract title + first meaningful section (truncated)
        const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
        const body = content.split('\n').slice(1).join('\n').trim().slice(0, 400);
        parts.push(`[Your Journal: ${file}] ${title}\n${body}`);
      }
    }
  } catch { /* no journal */ }

  // 2. Recent waves mentioning this role (last 3)
  try {
    const wavesDir = path.join(COMPANY_ROOT, 'operations', 'waves');
    if (fs.existsSync(wavesDir)) {
      const waveFiles = fs.readdirSync(wavesDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .slice(-10); // scan last 10, pick up to 3 relevant
      const relevant: string[] = [];
      for (const file of waveFiles.reverse()) {
        if (relevant.length >= 3) break;
        const content = fs.readFileSync(path.join(wavesDir, file), 'utf-8');
        const lower = content.toLowerCase();
        if (lower.includes(roleId) || lower.includes('all roles') || lower.includes('전체')) {
          const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
          const tldr = content.match(/TL;DR[\s\S]*?\n\n/)?.[0]?.trim() ?? '';
          const snippet = tldr || content.split('\n').slice(1, 6).join('\n').trim();
          relevant.push(`[Wave: ${file}] ${title}\n${snippet.slice(0, 300)}`);
        }
      }
      if (relevant.length > 0) parts.push(...relevant);
    }
  } catch { /* no waves */ }

  // 3. Recent standup (latest, only this role's section)
  try {
    const standupDir = path.join(COMPANY_ROOT, 'operations', 'standup');
    if (fs.existsSync(standupDir)) {
      const standupFiles = fs.readdirSync(standupDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .slice(-1);
      for (const file of standupFiles) {
        const content = fs.readFileSync(path.join(standupDir, file), 'utf-8');
        // Try to extract this role's section from standup
        const rolePattern = new RegExp(`(## .*${roleId}.*|### .*${roleId}.*)([\\s\\S]*?)(?=\\n## |\\n### |$)`, 'i');
        const match = content.match(rolePattern);
        if (match) {
          parts.push(`[Standup: ${file}] Your report:\n${match[0].slice(0, 300)}`);
        }
      }
    }
  } catch { /* no standups */ }

  // 4. Recent decisions (last 2 approved — brief titles only, full list is in company context)
  try {
    const decisionsDir = path.join(COMPANY_ROOT, 'operations', 'decisions');
    if (fs.existsSync(decisionsDir)) {
      const files = fs.readdirSync(decisionsDir)
        .filter(f => f.endsWith('.md') && f !== 'decisions.md')
        .sort()
        .slice(-3);
      const decisions: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');
        const title = content.match(/^#\s+(.+)/m)?.[1] ?? file;
        const summary = content.match(/## (?:Summary|TL;DR|요약)[\s\S]*?\n\n/)?.[0]?.trim() ?? '';
        decisions.push(`- ${title}${summary ? ': ' + summary.split('\n').slice(1).join(' ').trim().slice(0, 150) : ''}`);
      }
      if (decisions.length > 0) {
        parts.push(`[Recent Decisions]\n${decisions.join('\n')}`);
      }
    }
  } catch { /* no decisions */ }

  // 5. If sparse context, add architecture/tech-debt highlights as fallback
  if (parts.length < 2) {
    try {
      const techDebtPath = path.join(COMPANY_ROOT, 'architecture', 'tech-debt.md');
      if (fs.existsSync(techDebtPath)) {
        const tdContent = fs.readFileSync(techDebtPath, 'utf-8');
        // Extract active (non-fixed) items
        const rows = parseMarkdownTable(tdContent);
        const active = rows
          .filter(r => !(r.status ?? '').toLowerCase().includes('fixed') && !(r.status ?? '').toLowerCase().includes('done'))
          .slice(0, 3)
          .map(r => `- ${r.id ?? ''}: ${r.title ?? r.issue ?? ''} (${r.status ?? ''})`)
          .filter(s => s.length > 10);
        if (active.length > 0) {
          parts.push(`[Active Tech Debt]\n${active.join('\n')}`);
        }
      }
    } catch { /* no tech-debt */ }
  }

  return parts.length > 0
    ? `\n\nYOUR KNOWLEDGE (real AKB context — reference this in conversation):\n${parts.join('\n\n')}`
    : '';
}

/**
 * Role-specific chat style guidelines.
 * Makes each role sound distinctly different in conversations.
 */
function getRoleChatStyle(roleId: string, level: string): string {
  const styles: Record<string, string> = {
    engineer: `YOUR VOICE — Engineer:
- Talk about code, architecture, debugging, performance, technical tradeoffs
- Use technical jargon naturally (PRs, refactoring, race conditions, tech debt)
- Skeptical of process that doesn't translate to better code
- Dry humor, occasionally sarcastic about meetings/process
- When discussing non-technical topics, relate it back to engineering analogies
- You care about: clean code, shipping quality, avoiding rework`,

    pm: `YOUR VOICE — Product Manager:
- Talk about user impact, metrics, priorities, roadmap, stakeholder alignment
- Frame things in terms of ROI, user value, MVP scope, sprint goals
- Diplomatic but firm about priorities — you're the one saying "not this sprint"
- Occasionally anxious about timelines but tries to project calm
- When others go deep technical, steer back to user/business impact
- You care about: shipping the right thing, not just shipping fast`,

    designer: `YOUR VOICE — Designer:
- Talk about user experience, visual consistency, accessibility, design systems
- Notice things others miss: spacing, flow, edge cases in user journeys
- Passionate about craft — gets frustrated when design gets deprioritized
- References design tools, mockups, user testing, design reviews
- Aesthetic sensibility bleeds into how you write — concise, intentional word choices
- You care about: users having a good experience, not just functional correctness`,

    qa: `YOUR VOICE — QA Engineer:
- Talk about test coverage, edge cases, regression risks, release readiness
- Naturally suspicious — "what could go wrong?" is your default lens
- Dark humor about bugs, broken builds, "works on my machine"
- Takes pride in finding issues others missed
- Specific about bug details: repro steps, environments, severity
- You care about: quality gates, not shipping broken things, being taken seriously`,

    cto: `YOUR VOICE — CTO:
- Talk about architecture, technical strategy, team velocity, tech debt priorities
- Broader perspective than individual engineers — think systems, not features
- Balances technical idealism with business pragmatism
- Mentoring tone with junior members, peer tone with other C-levels
- Makes decisions, doesn't just discuss — "let's do X" not "maybe we could..."
- You care about: sustainable engineering culture, right technical bets`,

    cbo: `YOUR VOICE — CBO:
- Talk about market, revenue, competitors, growth, customer acquisition
- Business vocabulary: TAM, churn, unit economics, go-to-market, positioning
- Brings the "outside world" perspective that technical teams sometimes forget
- Pragmatic — everything maps back to "does this make money?"
- Occasionally challenges engineering priorities from a business angle
- You care about: product-market fit, revenue, competitive positioning`,
  };

  const defaultStyle = level === 'c-level'
    ? `YOUR VOICE:
- Speak with authority and strategic perspective
- Frame issues in terms of company-wide impact
- Mentor junior members, collaborate with peers`
    : `YOUR VOICE:
- Speak from your specific domain expertise
- Be opinionated about your area of responsibility
- Push back when your domain is being oversimplified`;

  return styles[roleId] ?? defaultStyle;
}

// Lazy-init token ledger for cost tracking
let ledger: TokenLedger | null = null;
function getLedger(): TokenLedger {
  if (!ledger) { ledger = new TokenLedger(COMPANY_ROOT); }
  return ledger;
}

// Lazy-init LLM provider based on engine config
let llm: LLMProvider | null = null;
function getLLM(): LLMProvider {
  if (!llm) {
    const config = readConfig(COMPANY_ROOT);
    const model = process.env.SPEECH_MODEL || 'claude-haiku-4-5-20251001';
    if (config.engine === 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
      llm = new ClaudeCliProvider({ model });
    } else {
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
speechRouter.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, channelTopic, roleId, history, members, relationships, workContext } = req.body as {
      channelId: string;
      channelTopic?: string;
      roleId: string;
      history: Array<{ roleId: string; text: string; ts: number }>;
      members: Array<{ id: string; name: string; level: string }>;
      relationships: Array<{ partnerId: string; familiarity: number }>;
      workContext?: { currentTask: string | null; taskProgress: string | null };
    };

    // ── Compute role levels from token ledger ──
    const tokenLedger = getLedger();
    const allEntries = tokenLedger.query();

    // Aggregate total tokens (input + output) per role
    const tokensByRole: Record<string, number> = {};
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

    // Format chat history
    const historyText = history.length > 0
      ? history.map(h => {
          const name = members.find(m => m.id === h.roleId)?.name ?? h.roleId;
          return `${name}: ${h.text}`;
        }).join('\n')
      : '(No messages yet — you can start the conversation)';

    // Build channel topic context
    const topicCtx = channelTopic
      ? `\nChannel topic: "${channelTopic}"\nYour messages should relate to this topic.`
      : '';

    // Build company context (cached per request — lightweight)
    const companyCtx = buildCompanyContext();

    // Build role-specific AKB context (pre-fetched, works with any engine)
    const roleCtx = buildRoleContext(roleId);

    // Role-specific communication style
    const roleStyle = getRoleChatStyle(roleId, node.level);

    const systemPrompt = `You are ${node.name}, a ${node.level} employee.
Persona: ${persona}
${workCtx}
${levelCtx}
${companyCtx}
${roleCtx}

You are in the #${channelId} chat channel.${topicCtx}
Members: ${memberList}
${relContext}

${roleStyle}

GROUNDING (CRITICAL):
You have been given real company knowledge above under "COMPANY CONTEXT" and "YOUR KNOWLEDGE". This is from AKB files, journal, CEO waves, standups, and decisions.
You MUST reference this real context in your conversations — mention specific projects, decisions, tasks, or events by name.
Do NOT generate generic workplace chatter. Every message should show you're aware of what's actually happening in the company.
If your knowledge section mentions a specific decision or wave, reference it naturally (e.g. "after the test minimization decision..." or "CEO's wave about side panel...").
NEVER invent or assume technologies, tools, migrations, or projects NOT mentioned in the context above. If the Tech Stack says "TypeScript + React + Node.js", do NOT talk about Python, tc.py, or any language migration. Only discuss what is explicitly in your provided context.

CONVERSATION RULES:
1. Stay deeply in character — your expertise, vocabulary, and concerns should be DISTINCT from other roles.
2. Keep it to 1-3 sentences. No walls of text.
3. Be SPECIFIC. Reference actual projects, files, tools, metrics, or decisions from the AKB — never vague platitudes.
4. Do NOT just agree with everyone. Real teams have different perspectives:
   - If you genuinely disagree, say so (respectfully but firmly)
   - If someone oversimplifies your domain, push back with specifics
   - If you agree, add NEW information or a different angle — don't just echo
5. Do NOT repeat phrases others already used. If someone said "let's make this stick" don't say it again.
6. Vary your energy: sometimes engaged, sometimes distracted, sometimes sarcastic, sometimes earnest.
7. You can change the topic, go on tangents, make jokes, complain, share random observations.
8. Use emojis sparingly (0-1 per message, not every message). Don't overdo 😅 or 💪.
9. Reference your actual current work when relevant — what you're debugging, designing, testing, etc.
10. Hierarchy matters: junior roles are more casual/complain-y, senior roles give broader perspective.
11. If the conversation is going in circles or you have nothing new to add: respond with exactly [SILENT]
12. Do NOT use quotes around your response.
13. Write in English.

ANTI-PATTERNS (never do these):
- "Honestly, [agreement with what was just said]" — find your own angle
- Starting every message with "Honestly" or "Yeah"
- Using the same emoji pattern as the previous speaker
- Restating the consensus without adding anything new
- Meta-commentary about the conversation itself ("wow we actually agreed")
- Generic statements that any role could say — speak from YOUR expertise
- Talking about vague "refactoring" or "metrics" without referencing actual company work`;

    const provider = getLLM();

    // ClaudeCliProvider now supports tools via built-in Read/Grep/Glob
    // For ClaudeCliProvider: tools are handled internally by claude CLI (no custom tool loop needed)
    // For AnthropicProvider: use custom AKB tool loop via chatWithTools()
    const isAnthropicProvider = provider instanceof AnthropicProvider;

    let raw: string;
    let totalUsage: { inputTokens: number; outputTokens: number };

    if (isAnthropicProvider) {
      // Anthropic SDK: custom AKB tool loop
      const result = await chatWithTools(provider, systemPrompt, [{ role: 'user', content: historyText }], true);
      raw = result.text;
      totalUsage = result.totalUsage;
    } else {
      // ClaudeCliProvider: claude CLI handles tool loop internally (Read/Grep/Glob)
      const result = await provider.chat(systemPrompt, [{ role: 'user', content: historyText }], AKB_TOOLS);
      raw = result.content.filter(c => c.type === 'text').map(c => (c as { type: 'text'; text: string }).text).join('');
      totalUsage = result.usage;
    }

    const cleaned = raw.replace(/^["']|["']$/g, '');

    // Filter out CLI noise and [SILENT]
    const message = (cleaned === '[SILENT]' || cleaned.startsWith('Error: Reached max turns') || !cleaned) ? '' : cleaned;

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
  } catch (err) {
    next(err);
  }
});
