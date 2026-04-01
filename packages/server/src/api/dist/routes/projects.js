import { Router } from 'express';
import { readFile, fileExists } from '../services/file-reader.js';
import { parseMarkdownTable } from '../services/markdown-parser.js';
export const projectsRouter = Router();
// GET /api/projects — 프로젝트 목록
projectsRouter.get('/', (_req, res, next) => {
    try {
        const content = readFile('projects/projects.md');
        const rows = parseMarkdownTable(content);
        const projects = rows.map(row => {
            const name = row.project ?? '';
            const id = name.toLowerCase().replace(/\s+/g, '-');
            return {
                id,
                name,
                status: row.status ?? '',
                created: row.created ?? '',
            };
        });
        res.json(projects);
    }
    catch (err) {
        next(err);
    }
});
// GET /api/projects/:id — 프로젝트 상세
projectsRouter.get('/:id', (req, res, next) => {
    try {
        const { id } = req.params;
        // 기본 정보
        const listContent = readFile('projects/projects.md');
        const rows = parseMarkdownTable(listContent);
        const projectRow = rows.find(r => {
            const name = r.project ?? '';
            return name.toLowerCase().replace(/\s+/g, '-') === id;
        });
        if (!projectRow) {
            res.status(404).json({ error: `Project not found: ${id}` });
            return;
        }
        const name = projectRow.project ?? '';
        const project = {
            id,
            name,
            status: projectRow.status ?? '',
            created: projectRow.created ?? '',
            prd: '',
            tasks: [],
        };
        // PRD 읽기
        const prdPath = `projects/${id}/prd.md`;
        if (fileExists(prdPath)) {
            project.prd = readFile(prdPath);
        }
        // Tasks 읽기
        const tasksPath = `projects/${id}/tasks.md`;
        if (fileExists(tasksPath)) {
            const tasksContent = readFile(tasksPath);
            const taskRows = parseMarkdownTable(tasksContent);
            project.tasks = taskRows.map(row => ({
                id: row.id ?? '',
                title: row.task ?? row.title ?? '',
                role: row.role ?? '',
                status: row.status ?? '',
                description: row.설명 ?? row.description ?? '',
            }));
        }
        res.json(project);
    }
    catch (err) {
        next(err);
    }
});
