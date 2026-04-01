/**
 * team-recommender.ts — Recommend team composition for a Wave directive
 *
 * Analyzes the directive text + org tree to suggest optimal team size.
 * Uses Haiku for AI classification, falls back to keyword heuristic.
 *
 * Returns ranked options: Quick / Standard / Full + custom saved teams.
 */
import { buildOrgTree, getSubordinates, getDescendants, type OrgTree, type OrgNode } from '../engine/org-tree.js';
import { readConfig } from './company-config.js';
import { COMPANY_ROOT } from './file-reader.js';
import { ClaudeCliProvider } from '../engine/llm-adapter.js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

/* ─── Types ──────────────────────────────────── */

export interface TeamOption {
  id: string;
  name: string;
  description: string;
  roles: string[];           // role IDs to include as targetRoles
  roleDetails: { id: string; name: string; level: string; subordinates: string[] }[];
  totalAgents: number;       // total agents including subordinates
  estimatedSpeed: 'fast' | 'medium' | 'slow';
  recommended?: boolean;
}

export interface TeamRecommendation {
  directive: string;
  analysis: {
    domains: string[];       // detected domains: code, design, planning, testing, business
    complexity: 'simple' | 'moderate' | 'complex';
    reasoning: string;
  };
  options: TeamOption[];
  customTeams: SavedTeam[];
  recommendedId: string;     // ID of the recommended option
}

export interface SavedTeam {
  id: string;
  name: string;
  roles: string[];
  createdAt: string;
  usageCount: number;
}

interface TeamPresetsFile {
  teams: SavedTeam[];
}

/* ─── Constants ──────────────────────────────── */

const TEAM_PRESETS_PATH = () => path.join(COMPANY_ROOT, '.tycono', 'team-presets.json');

const CLASSIFY_SYSTEM = `You analyze a CEO directive and determine what domains of work it requires.

Reply with a JSON object (no markdown, no explanation):
{
  "domains": ["code", "design"],
  "complexity": "moderate",
  "reasoning": "Needs implementation + visual design but scope is clear"
}

Domain options: "code", "design", "planning", "testing", "business", "research", "writing"
Complexity options: "simple" (one person can do it), "moderate" (2-3 roles needed), "complex" (full team coordination)

Examples:
"버그 고쳐" → {"domains":["code"],"complexity":"simple","reasoning":"Single code fix, engineer only"}
"랜딩페이지 만들어" → {"domains":["code","design"],"complexity":"moderate","reasoning":"Frontend + design needed"}
"타워 디펜스 게임 만들어" → {"domains":["code","design","planning"],"complexity":"moderate","reasoning":"Game needs balance design + visual + code"}
"Q2 사업 전략 수립하고 신규 기능 개발해" → {"domains":["code","design","planning","business"],"complexity":"complex","reasoning":"Cross-domain: business strategy + product development"}
"README 업데이트해" → {"domains":["writing"],"complexity":"simple","reasoning":"Documentation only, single agent task"}`;

/* ─── Domain → Role Mapping ──────────────────── */

/**
 * Map detected domains to required role capabilities.
 * This uses the org tree to find which roles handle which domains.
 */
function mapDomainsToRoles(domains: string[], orgTree: OrgTree): Set<string> {
  const needed = new Set<string>();

  // Domain → role mapping based on typical role responsibilities
  const DOMAIN_ROLES: Record<string, string[]> = {
    code: ['engineer', 'cto'],
    design: ['designer'],
    planning: ['pm'],
    testing: ['qa'],
    business: ['cbo', 'data-analyst'],
    research: ['cbo', 'data-analyst'],
    writing: ['engineer'],   // simple writing = engineer can handle
  };

  for (const domain of domains) {
    const candidates = DOMAIN_ROLES[domain] ?? [];
    for (const roleId of candidates) {
      if (orgTree.nodes.has(roleId)) {
        needed.add(roleId);
      }
    }
  }

  return needed;
}

/**
 * Build team options from org tree based on analysis.
 */
function buildOptions(
  orgTree: OrgTree,
  neededRoles: Set<string>,
  complexity: 'simple' | 'moderate' | 'complex',
): { options: TeamOption[]; recommendedId: string } {
  const ceo = orgTree.nodes.get('ceo')!;
  const cLevelIds = ceo.children;
  const options: TeamOption[] = [];

  // Helper: build role details for an option
  const buildRoleDetails = (roleIds: string[]) => {
    return roleIds.map(id => {
      const node = orgTree.nodes.get(id);
      return {
        id,
        name: node?.name ?? id,
        level: node?.level ?? 'member',
        subordinates: getSubordinates(orgTree, id),
      };
    });
  };

  const totalAgents = (roleIds: string[]) => {
    let count = 0;
    for (const id of roleIds) {
      count += 1 + getDescendants(orgTree, id).length;
    }
    return count;
  };

  // ── Quick: minimum viable team (just the most needed C-Level) ──
  // Find the C-Level that covers the most needed roles
  let quickCLevel: string | null = null;
  let maxCoverage = 0;

  for (const cId of cLevelIds) {
    const descendants = new Set([cId, ...getDescendants(orgTree, cId)]);
    const coverage = [...neededRoles].filter(r => descendants.has(r)).length;
    if (coverage > maxCoverage) {
      maxCoverage = coverage;
      quickCLevel = cId;
    }
  }

  if (quickCLevel) {
    const quickRoles = [quickCLevel];
    options.push({
      id: 'quick',
      name: '⚡ Quick',
      description: `${orgTree.nodes.get(quickCLevel)?.name ?? quickCLevel} 팀만 투입. 빠르고 저비용.`,
      roles: quickRoles,
      roleDetails: buildRoleDetails(quickRoles),
      totalAgents: totalAgents(quickRoles),
      estimatedSpeed: 'fast',
    });
  }

  // ── Standard: C-Levels that cover all needed roles ──
  const standardCLevels: string[] = [];
  const coveredRoles = new Set<string>();

  for (const cId of cLevelIds) {
    const descendants = new Set([cId, ...getDescendants(orgTree, cId)]);
    const covers = [...neededRoles].filter(r => descendants.has(r) && !coveredRoles.has(r));
    if (covers.length > 0) {
      standardCLevels.push(cId);
      covers.forEach(r => coveredRoles.add(r));
    }
  }

  if (standardCLevels.length > 0 && standardCLevels.length < cLevelIds.length) {
    options.push({
      id: 'standard',
      name: '⭐ Standard',
      description: `필요 역할만 투입. ${standardCLevels.map(id => orgTree.nodes.get(id)?.name ?? id).join(' + ')}.`,
      roles: standardCLevels,
      roleDetails: buildRoleDetails(standardCLevels),
      totalAgents: totalAgents(standardCLevels),
      estimatedSpeed: 'medium',
    });
  }

  // ── Full: all C-Levels ──
  options.push({
    id: 'full',
    name: '🔥 Full Team',
    description: '전체 팀 투입. 느리지만 가장 정교한 결과.',
    roles: cLevelIds,
    roleDetails: buildRoleDetails(cLevelIds),
    totalAgents: totalAgents(cLevelIds),
    estimatedSpeed: 'slow',
  });

  // Determine recommendation
  let recommendedId: string;
  if (complexity === 'simple' && options.find(o => o.id === 'quick')) {
    recommendedId = 'quick';
  } else if (complexity === 'complex') {
    recommendedId = 'full';
  } else {
    recommendedId = options.find(o => o.id === 'standard')?.id ?? options[0].id;
  }

  // Mark recommended
  for (const opt of options) {
    opt.recommended = opt.id === recommendedId;
  }

  return { options, recommendedId };
}

/* ─── AI Classification ──────────────────────── */

interface AnalysisResult {
  domains: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  reasoning: string;
}

async function classifyDirective(text: string): Promise<AnalysisResult> {
  try {
    const config = readConfig(COMPANY_ROOT);
    const engine = config.engine || process.env.EXECUTION_ENGINE || 'claude-cli';

    let reply: string;
    if (engine === 'claude-cli') {
      const provider = new ClaudeCliProvider({ model: 'claude-haiku-4-5-20251001' });
      const response = await provider.chat(
        CLASSIFY_SYSTEM,
        [{ role: 'user', content: text }],
      );
      reply = response.content.find(c => c.type === 'text')?.text?.trim() ?? '';
    } else if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: CLASSIFY_SYSTEM,
        messages: [{ role: 'user', content: text }],
      });
      reply = (response.content[0] as { type: 'text'; text: string }).text.trim();
    } else {
      return classifyDirectiveFallback(text);
    }

    // Parse JSON response
    const parsed = JSON.parse(reply) as AnalysisResult;
    if (Array.isArray(parsed.domains) && parsed.complexity && parsed.reasoning) {
      return parsed;
    }
    return classifyDirectiveFallback(text);
  } catch (err) {
    console.warn('[TeamRecommender] AI classification failed, using fallback:', err);
    return classifyDirectiveFallback(text);
  }
}

function classifyDirectiveFallback(text: string): AnalysisResult {
  const t = text.toLowerCase();
  const domains: string[] = [];

  // Keyword-based domain detection
  if (/코드|구현|개발|빌드|build|implement|develop|fix|bug|api|서버|deploy|refactor/.test(t)) domains.push('code');
  if (/디자인|design|ui|ux|css|스타일|비주얼|visual|레이아웃/.test(t)) domains.push('design');
  if (/기획|plan|prd|스펙|spec|기능\s*정의|요구사항|밸런/.test(t)) domains.push('planning');
  if (/테스트|test|qa|검증|verify|플레이테스트/.test(t)) domains.push('testing');
  if (/사업|business|매출|revenue|시장|market|경쟁|전략|strategy|pricing/.test(t)) domains.push('business');
  if (/조사|research|분석|analy|리서치/.test(t)) domains.push('research');
  if (/문서|doc|readme|작성|write|블로그|blog/.test(t)) domains.push('writing');

  // Fallback: if no domain detected, assume code
  if (domains.length === 0) domains.push('code');

  // Complexity based on domain count and text length
  let complexity: 'simple' | 'moderate' | 'complex';
  if (domains.length <= 1 && t.length < 50) {
    complexity = 'simple';
  } else if (domains.length >= 3 || t.length > 200) {
    complexity = 'complex';
  } else {
    complexity = 'moderate';
  }

  return {
    domains,
    complexity,
    reasoning: `Detected ${domains.length} domain(s) via keyword matching: ${domains.join(', ')}`,
  };
}

/* ─── Custom Teams CRUD ──────────────────────── */

function readTeamPresets(): TeamPresetsFile {
  const filePath = TEAM_PRESETS_PATH();
  if (!fs.existsSync(filePath)) return { teams: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TeamPresetsFile;
  } catch {
    return { teams: [] };
  }
}

function writeTeamPresets(data: TeamPresetsFile): void {
  const filePath = TEAM_PRESETS_PATH();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getSavedTeams(): SavedTeam[] {
  return readTeamPresets().teams;
}

export function saveCustomTeam(name: string, roles: string[]): SavedTeam {
  const data = readTeamPresets();
  const team: SavedTeam = {
    id: `custom-${Date.now()}`,
    name,
    roles,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };
  data.teams.push(team);
  writeTeamPresets(data);
  return team;
}

export function deleteCustomTeam(teamId: string): boolean {
  const data = readTeamPresets();
  const idx = data.teams.findIndex(t => t.id === teamId);
  if (idx === -1) return false;
  data.teams.splice(idx, 1);
  writeTeamPresets(data);
  return true;
}

export function incrementTeamUsage(teamId: string): void {
  const data = readTeamPresets();
  const team = data.teams.find(t => t.id === teamId);
  if (team) {
    team.usageCount += 1;
    writeTeamPresets(data);
  }
}

/* ─── Main: Recommend ────────────────────────── */

export async function recommendTeam(directive: string): Promise<TeamRecommendation> {
  // 1. Build org tree
  const orgTree = buildOrgTree(COMPANY_ROOT);

  // 2. Classify directive
  const analysis = await classifyDirective(directive);

  // 3. Map domains to needed roles
  const neededRoles = mapDomainsToRoles(analysis.domains, orgTree);

  // 4. Build team options
  const { options, recommendedId } = buildOptions(orgTree, neededRoles, analysis.complexity);

  // 5. Load custom teams
  const customTeams = getSavedTeams();

  return {
    directive,
    analysis,
    options,
    customTeams,
    recommendedId,
  };
}
