import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { Router, Request, Response, NextFunction } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { buildOrgTree, type RoleSource } from '../engine/org-tree.js';
import { RoleLifecycleManager } from '../engine/role-lifecycle.js';
import { getTokenLedger } from '../services/token-ledger.js';
import { estimateCost } from '../services/pricing.js';
import { calcLevel, calcProgress, formatTokens } from '../utils/role-level.js';

export const syncRouter = Router();

/* ─── GET /api/sync/roles — List roles with source tracking ─── */

syncRouter.get('/roles', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = buildOrgTree(COMPANY_ROOT);
    const trackedRoles: Array<{
      roleId: string;
      name: string;
      level: string;
      source: RoleSource;
      persona: string;
      authority: { autonomous: string[]; needsApproval: string[] };
      skills?: string[];
    }> = [];

    for (const [id, node] of tree.nodes) {
      if (id === 'ceo' || !node.source) continue;
      trackedRoles.push({
        roleId: id,
        name: node.name,
        level: node.level,
        source: node.source,
        persona: node.persona,
        authority: node.authority,
        skills: node.skills,
      });
    }

    res.json({ roles: trackedRoles });
  } catch (err) {
    next(err);
  }
});

/* ─── POST /api/sync/apply — Apply upstream changes to a role ─── */

syncRouter.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roleId, changes, upstreamVersion } = req.body as {
      roleId: string;
      changes: { persona?: string; authority?: { autonomous: string[]; needsApproval: string[] }; skills?: string[] };
      upstreamVersion?: string;
    };

    if (!roleId || !changes) {
      res.status(400).json({ error: 'roleId and changes are required' });
      return;
    }

    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    await manager.updateRole(roleId, changes);

    // Update source.upstream_version if provided
    if (upstreamVersion) {
      const yamlPath = path.join(COMPANY_ROOT, 'knowledge', 'roles', roleId, 'role.yaml');
      const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8')) as Record<string, unknown>;
      if (raw.source && typeof raw.source === 'object') {
        (raw.source as Record<string, unknown>).upstream_version = upstreamVersion;
      }
      fs.writeFileSync(yamlPath, YAML.stringify(raw));
    }

    res.json({ ok: true, roleId, applied: Object.keys(changes) });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /api/sync/stats — Company-wide gamification stats ─── */

syncRouter.get('/stats', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = buildOrgTree(COMPANY_ROOT);
    const ledger = getTokenLedger(COMPANY_ROOT);
    const summary = ledger.query();

    // Aggregate by role
    const byRole: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }> = {};
    const byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }> = {};

    for (const entry of summary.entries) {
      if (!byRole[entry.roleId]) {
        byRole[entry.roleId] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      byRole[entry.roleId].inputTokens += entry.inputTokens;
      byRole[entry.roleId].outputTokens += entry.outputTokens;
      byRole[entry.roleId].costUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);

      if (!byModel[entry.model]) {
        byModel[entry.model] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      byModel[entry.model].inputTokens += entry.inputTokens;
      byModel[entry.model].outputTokens += entry.outputTokens;
      byModel[entry.model].costUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
    }

    // Role count (excluding CEO)
    const roleCount = tree.nodes.size - 1;

    // Compute per-role levels
    const roleLevels: Array<{
      roleId: string;
      name: string;
      level: number;
      totalTokens: number;
      progress: number;
      formattedTokens: string;
      costUsd: number;
    }> = [];

    for (const [id, node] of tree.nodes) {
      if (id === 'ceo') continue;
      const roleData = byRole[id];
      const totalTokens = roleData ? roleData.inputTokens + roleData.outputTokens : 0;
      roleLevels.push({
        roleId: id,
        name: node.name,
        level: calcLevel(totalTokens),
        totalTokens,
        progress: calcProgress(totalTokens),
        formattedTokens: formatTokens(totalTokens),
        costUsd: roleData?.costUsd ?? 0,
      });
    }

    // Sort by totalTokens desc (leaderboard)
    roleLevels.sort((a, b) => b.totalTokens - a.totalTokens);

    // Company aggregate
    const totalTokens = summary.totalInput + summary.totalOutput;
    let totalCostUsd = 0;
    for (const entry of summary.entries) {
      totalCostUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
    }

    res.json({
      company: {
        roleCount,
        totalTokens,
        formattedTokens: formatTokens(totalTokens),
        totalCostUsd,
        avgLevel: roleLevels.length > 0
          ? Math.round(roleLevels.reduce((sum, r) => sum + r.level, 0) / roleLevels.length * 10) / 10
          : 1,
      },
      roles: roleLevels,
      byModel,
    });
  } catch (err) {
    next(err);
  }
});
