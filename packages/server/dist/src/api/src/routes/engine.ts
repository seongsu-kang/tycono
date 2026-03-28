import { Router, Request, Response, NextFunction } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import {
  buildOrgTree,
  assembleContext,
  validateDispatch,
  RoleLifecycleManager,
  formatOrgChart,
} from '../engine/index.js';
import { createRunner } from '../engine/runners/index.js';

export const engineRouter = Router();

/* ─── GET /api/engine/org — Org tree ─────────── */

engineRouter.get('/org', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tree = buildOrgTree(COMPANY_ROOT);

    // Serialize Map to plain object
    const nodes: Record<string, unknown> = {};
    for (const [id, node] of tree.nodes) {
      nodes[id] = {
        id: node.id,
        name: node.name,
        level: node.level,
        reportsTo: node.reportsTo,
        children: node.children,
      };
    }

    res.json({
      root: tree.root,
      nodes,
      chart: formatOrgChart(tree),
    });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /api/engine/context/:roleId — Preview assembled context ── */

engineRouter.get('/context/:roleId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const roleId = String(req.params.roleId ?? '');
    const sourceRole = String(req.query.source ?? 'ceo');
    const task = String(req.query.task ?? '(preview — no task specified)');

    const tree = buildOrgTree(COMPANY_ROOT);
    const context = assembleContext(COMPANY_ROOT, roleId as string, task, sourceRole, tree);

    res.json({
      targetRole: context.targetRole,
      sourceRole: context.sourceRole,
      metadata: context.metadata,
      systemPromptLength: context.systemPrompt.length,
      systemPromptPreview: context.systemPrompt.slice(0, 3000),
      task: context.task,
    });
  } catch (err) {
    next(err);
  }
});

/* ─── POST /api/engine/dispatch/validate — Check dispatch authority ── */

engineRouter.post('/dispatch/validate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceRole, targetRole } = req.body;

    if (!sourceRole || !targetRole) {
      res.status(400).json({ error: 'sourceRole and targetRole are required' });
      return;
    }

    const tree = buildOrgTree(COMPANY_ROOT);
    const result = validateDispatch(tree, sourceRole, targetRole);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ─── POST /api/engine/roles — Create a new role ── */

engineRouter.post('/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const def = req.body;

    if (!def.id || !def.name || !def.reportsTo) {
      res.status(400).json({ error: 'id, name, and reportsTo are required' });
      return;
    }

    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    await manager.createRole(def);

    res.status(201).json({ ok: true, roleId: def.id });
  } catch (err) {
    next(err);
  }
});

/* ─── PATCH /api/engine/roles/:id — Update a role ── */

engineRouter.patch('/roles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const changes = req.body;

    if (!changes || Object.keys(changes).length === 0) {
      res.status(400).json({ error: 'No changes provided' });
      return;
    }

    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    await manager.updateRole(id, changes);

    res.json({ ok: true, roleId: id });
  } catch (err) {
    next(err);
  }
});

/* ─── DELETE /api/engine/roles/:id — Remove a role ── */

engineRouter.delete('/roles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    await manager.removeRole(id);

    res.json({ ok: true, removed: id });
  } catch (err) {
    next(err);
  }
});

/* ─── GET /api/engine/roles/validate — Validate all roles ── */

engineRouter.get('/roles/validate', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    const results = manager.validateAll();

    const output: Record<string, unknown> = {};
    for (const [id, result] of results) {
      output[id] = result;
    }

    res.json(output);
  } catch (err) {
    next(err);
  }
});

/* ─── POST /api/engine/roles/:id/skill/regenerate — Regenerate SKILL.md ── */

engineRouter.post('/roles/:id/skill/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const manager = new RoleLifecycleManager(COMPANY_ROOT);
    await manager.regenerateSkill(id);

    res.json({ ok: true, roleId: id });
  } catch (err) {
    next(err);
  }
});

/* ─── POST /api/engine/ask/:roleId — Ask a role a question (read-only) ── */

engineRouter.post('/ask/:roleId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roleId = String(req.params.roleId);
    const { question, sourceRole } = req.body;

    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const source = sourceRole || 'ceo';
    const orgTree = buildOrgTree(COMPANY_ROOT);

    if (!orgTree.nodes.has(roleId)) {
      res.status(404).json({ error: `Role not found: ${roleId}` });
      return;
    }

    // Ask is read-only: no authority check required (anyone can ask anyone)
    const handle = createRunner().execute(
      {
        companyRoot: COMPANY_ROOT,
        roleId,
        task: `[Question from ${source}] ${question}`,
        sourceRole: source,
        orgTree,
        readOnly: true,
        maxTurns: 5,
        sessionId: `ask-${Date.now()}`,
      },
      {},
    );

    const result = await handle.promise;

    res.json({
      roleId,
      question,
      answer: result.output,
      turns: result.turns,
      tokens: result.totalTokens,
    });
  } catch (err) {
    next(err);
  }
});
