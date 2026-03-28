/**
 * claude-md-manager.ts — CLAUDE.md lifecycle management
 *
 * Three modes:
 * 1. No CLAUDE.md → create from AKB template
 * 2. User-owned CLAUDE.md (no tycono:managed marker) → append AKB section
 * 3. Tycono-managed CLAUDE.md → full replace on version change
 *
 * Also installs methodology/agentic-knowledge-base.md if missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../templates');

const AKB_SECTION_MARKER = '<!-- tycono:akb-guide -->';

function getPackageVersion(): string {
  const pkgPath = path.resolve(__dirname, '../../../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function generateClaudeMd(version: string): string {
  const tmplPath = path.join(TEMPLATES_DIR, 'CLAUDE.md.tmpl');
  const template = fs.readFileSync(tmplPath, 'utf-8');
  return template.replaceAll('{{VERSION}}', version);
}

/**
 * Generate the AKB appendix section for user-owned CLAUDE.md files.
 * This is a condensed version of the key AKB principles.
 */
function generateAkbAppendix(version: string): string {
  return `
${AKB_SECTION_MARKER}

---

## AKB Knowledge Navigation (Tycono)

> Auto-appended by Tycono v${version}. Your content above is untouched.
> Full reference: \`methodology/agentic-knowledge-base.md\`

### Structure: Root → Hub → Node

| Layer | Role | AI Usage |
|-------|------|----------|
| **Root** (CLAUDE.md) | Minimal routing | Auto-injected as system prompt |
| **Hub** ({folder}.md) | Human TOC + guides | **Check before starting work** |
| **Node** (*.md) | Actual information | Direct search via Grep/Glob |

### Hub-First Principle

> ⛔ **Read Hub document BEFORE implementing/testing**

| Situation | Read First | What to Find |
|-----------|------------|--------------|
| Debugging/Testing | Hub → guides/ | Existing debug tools |
| API Calls | Hub → related Node | Documented methods |
| New Feature | Hub | Similar existing features |
| Strategy/Design | Hub + detail docs | Design philosophy, past decisions |

### Anti-Patterns

\`\`\`
❌ Skip Hub → code directly
❌ Skip Hub → Write from scratch
❌ Read only Hubs → "sufficient" judgment → superficial answers
\`\`\`

### Exploration Depth

| Question Type | Minimum | Additional |
|---------------|---------|------------|
| Implementation | Hub | Related Nodes |
| **Strategy/Ideas** | Hub | **Design philosophy, core problems, phase docs** |
| **Connecting A and B** | **Both Hubs** | **Both core docs** |

### Knowledge Gate

> Before creating a new document, search existing docs first (grep 3+ keywords).

<!-- tycono:akb-guide-end -->
`;
}

/**
 * Install methodology/agentic-knowledge-base.md if not present.
 */
function ensureAkbMethodology(companyRoot: string): void {
  const targetDir = path.join(companyRoot, 'knowledge', 'methodology');
  const targetPath = path.join(targetDir, 'agentic-knowledge-base.md');

  if (fs.existsSync(targetPath)) return;

  // Also check methodologies/ (plural)
  const altDir = path.join(companyRoot, 'knowledge', 'methodologies');
  const altPath = path.join(altDir, 'agentic-knowledge-base.md');
  if (fs.existsSync(altPath)) return;

  // Try to copy from templates
  const srcPath = path.join(TEMPLATES_DIR, 'agentic-knowledge-base.md');
  if (!fs.existsSync(srcPath)) return;

  // Use whichever directory exists, or create methodology/
  const dir = fs.existsSync(altDir) ? altDir : fs.existsSync(targetDir) ? targetDir : targetDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.copyFileSync(srcPath, path.join(dir, 'agentic-knowledge-base.md'));
  console.log(`[AKB] Installed methodology/agentic-knowledge-base.md`);
}

/**
 * Ensure CLAUDE.md has AKB navigation guide.
 *
 * Two modes:
 * 1. No CLAUDE.md → create from full AKB template
 * 2. CLAUDE.md exists (any) → append/update AKB section only, never touch user content
 *
 * No full replacement ever. User content is always preserved.
 */
export function ensureClaudeMd(companyRoot: string): void {
  const tyconoDir = path.join(companyRoot, '.tycono');
  const rulesVersionPath = path.join(tyconoDir, 'rules-version');
  const claudeMdPath = path.join(companyRoot, 'knowledge', 'CLAUDE.md');
  const knowledgeDir = path.join(companyRoot, 'knowledge');
  const customRulesPath = path.join(knowledgeDir, 'custom-rules.md');

  // Skip if not initialized (no .tycono/ directory)
  if (!fs.existsSync(tyconoDir)) return;

  const currentVersion = getPackageVersion();

  // Read stored version
  let storedVersion = '0.0.0';
  if (fs.existsSync(rulesVersionPath)) {
    storedVersion = fs.readFileSync(rulesVersionPath, 'utf-8').trim();
  }

  // Skip if already up-to-date
  if (storedVersion === currentVersion) return;

  // No knowledge/ directory → don't create anything (plugin mode: zero footprint)
  if (!fs.existsSync(knowledgeDir)) {
    console.log(`[CLAUDE.md] Skipping — no knowledge/ directory (plugin mode)`);
    fs.writeFileSync(rulesVersionPath, currentVersion);
    return;
  }

  // No CLAUDE.md → don't create (user hasn't set up AKB)
  if (!fs.existsSync(claudeMdPath)) {
    console.log(`[CLAUDE.md] Skipping — no CLAUDE.md found`);
    fs.writeFileSync(rulesVersionPath, currentVersion);
    return;
  }

  // CLAUDE.md exists → append/update AKB section only, never create files
  ensureAkbMethodology(companyRoot);

  const existing = fs.readFileSync(claudeMdPath, 'utf-8');

  if (existing.includes(AKB_SECTION_MARKER)) {
    // Already has AKB section → replace just that section
    const before = existing.split(AKB_SECTION_MARKER)[0].trimEnd();
    const afterMarker = existing.indexOf('<!-- tycono:akb-guide-end -->');
    const after = afterMarker >= 0
      ? existing.substring(afterMarker + '<!-- tycono:akb-guide-end -->'.length).trimStart()
      : '';
    const updated = before + generateAkbAppendix(currentVersion) + (after ? '\n' + after : '');
    fs.writeFileSync(claudeMdPath, updated);
    console.log(`[CLAUDE.md] Updated AKB section (v${currentVersion})`);
  } else {
    // No AKB section yet → append
    const updated = existing.trimEnd() + '\n' + generateAkbAppendix(currentVersion);
    fs.writeFileSync(claudeMdPath, updated);
    console.log(`[CLAUDE.md] Appended AKB guide (v${currentVersion})`);
  }

  fs.writeFileSync(rulesVersionPath, currentVersion);
}
