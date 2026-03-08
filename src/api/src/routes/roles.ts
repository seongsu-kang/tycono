import { Router, Request, Response, NextFunction } from 'express';
import { readFile, fileExists, listFiles } from '../services/file-reader.js';
import { parseMarkdownTable } from '../services/markdown-parser.js';
import YAML from 'yaml';

export const rolesRouter = Router();

// GET /api/roles — Role 목록
rolesRouter.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const content = readFile('roles/roles.md');
    const rows = parseMarkdownTable(content);

    const roles = rows.map(row => {
      const id = row.id ?? '';
      let name = row.role ?? row.name ?? '';

      // role.yaml의 name이 있으면 우선 사용 (rename 반영)
      const yamlPath = `roles/${id}/role.yaml`;
      if (id && fileExists(yamlPath)) {
        try {
          const raw = YAML.parse(readFile(yamlPath)) as Record<string, unknown>;
          if (raw.name) name = raw.name as string;
        } catch { /* fallback to roles.md name */ }
      }

      return {
        id,
        name,
        level: row.level ?? '',
        reportsTo: row.reports_to ?? '',
        status: row.상태 ?? row.status ?? '',
      };
    });

    res.json(roles);
  } catch (err) {
    next(err);
  }
});

// GET /api/roles/:id — Role 상세
rolesRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 기본 정보 (roles.md 테이블에서)
    const listContent = readFile('roles/roles.md');
    const rows = parseMarkdownTable(listContent);
    const roleRow = rows.find(r => r.id === id);

    if (!roleRow) {
      res.status(404).json({ error: `Role not found: ${id}` });
      return;
    }

    const role: Record<string, unknown> = {
      id: roleRow.id,
      name: roleRow.role ?? roleRow.name ?? '',
      level: roleRow.level ?? '',
      reportsTo: roleRow.reports_to ?? '',
      status: roleRow.상태 ?? roleRow.status ?? '',
      persona: '',
      authority: { autonomous: [] as string[], needsApproval: [] as string[] },
      journal: '',
    };

    // role.yaml에서 name + persona + authority + skills 읽기
    const yamlPath = `roles/${id}/role.yaml`;
    if (fileExists(yamlPath)) {
      const raw = YAML.parse(readFile(yamlPath)) as Record<string, unknown>;
      if (raw.name) role.name = raw.name;
      if (raw.persona) role.persona = raw.persona;
      if (Array.isArray(raw.skills)) role.skills = raw.skills;
      const auth = raw.authority as Record<string, string[]> | undefined;
      if (auth) {
        role.authority = {
          autonomous: auth.autonomous ?? [],
          needsApproval: auth.needs_approval ?? [],
        };
      }
    }

    // 오늘 저널 읽기
    const today = new Date().toISOString().slice(0, 10);
    const journalPath = `roles/${id}/journal/${today}.md`;
    if (fileExists(journalPath)) {
      role.journal = readFile(journalPath).slice(0, 3000);
    }

    res.json(role);
  } catch (err) {
    next(err);
  }
});
