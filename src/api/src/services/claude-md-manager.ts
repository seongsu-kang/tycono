/**
 * claude-md-manager.ts — CLAUDE.md lifecycle management
 *
 * CLAUDE.md is 100% Tycono-managed. This module handles:
 * - Version tracking via .tycono/rules-version
 * - Auto-regeneration on version mismatch (server startup)
 * - Backup of pre-existing CLAUDE.md (first time only)
 * - Stub creation for knowledge/custom-rules.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(__dirname, '../../../../templates');

/**
 * Read the current package version from package.json
 */
function getPackageVersion(): string {
  const pkgPath = path.resolve(__dirname, '../../../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Generate CLAUDE.md content from template with version marker
 */
function generateClaudeMd(version: string): string {
  const tmplPath = path.join(TEMPLATES_DIR, 'CLAUDE.md.tmpl');
  const template = fs.readFileSync(tmplPath, 'utf-8');
  return template.replaceAll('{{VERSION}}', version);
}

/**
 * Ensure CLAUDE.md is up-to-date with the current package version.
 *
 * Called on server startup. Compares .tycono/rules-version with package version.
 * If different, regenerates CLAUDE.md from template (safe because CLAUDE.md
 * contains 0% user data — all user customization is in knowledge/custom-rules.md).
 */
export function ensureClaudeMd(companyRoot: string): void {
  const tyconoDir = path.join(companyRoot, '.tycono');
  const rulesVersionPath = path.join(tyconoDir, 'rules-version');
  const claudeMdPath = path.join(companyRoot, 'CLAUDE.md');
  const knowledgeDir = path.join(companyRoot, 'knowledge');
  const customRulesPath = path.join(knowledgeDir, 'custom-rules.md');
  const backupPath = path.join(tyconoDir, 'CLAUDE.md.backup');

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

  // Backup existing CLAUDE.md (first time only — don't overwrite previous backup)
  if (fs.existsSync(claudeMdPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(claudeMdPath, backupPath);
    console.log(`[CLAUDE.md] Backed up existing CLAUDE.md to .tycono/CLAUDE.md.backup`);
  }

  // Regenerate CLAUDE.md from template
  const content = generateClaudeMd(currentVersion);
  fs.writeFileSync(claudeMdPath, content);

  // Update rules-version
  fs.writeFileSync(rulesVersionPath, currentVersion);

  // Create custom-rules.md stub if not exists
  if (!fs.existsSync(customRulesPath)) {
    fs.writeFileSync(customRulesPath, `# Custom Rules

> Company-specific rules, constraints, and processes.
> This file is owned by you — Tycono will never overwrite it.

<!-- Add your custom rules below -->
`);
  }

  console.log(`[CLAUDE.md] System rules updated to v${currentVersion} (was v${storedVersion})`);
}
