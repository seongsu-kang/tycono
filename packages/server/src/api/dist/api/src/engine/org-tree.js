import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
/* ─── Default Roles (fallback when no roles/ directory) ── */
const DEFAULT_ROLES = [
    { id: 'cto', name: 'CTO', level: 'c-level', reportsTo: 'ceo', persona: 'Chief Technology Officer. Leads technical architecture and manages Engineer + QA.' },
    { id: 'cbo', name: 'CBO', level: 'c-level', reportsTo: 'ceo', persona: 'Chief Business Officer. Leads product vision and manages PM + Designer.' },
    { id: 'engineer', name: 'Engineer', level: 'member', reportsTo: 'cto', persona: 'Software Engineer. Writes working code.' },
    { id: 'qa', name: 'QA', level: 'member', reportsTo: 'cto', persona: 'QA Engineer. Tests and validates.' },
    { id: 'pm', name: 'PM', level: 'member', reportsTo: 'cbo', persona: 'Product Manager. Writes specs and requirements.' },
    { id: 'designer', name: 'Designer', level: 'member', reportsTo: 'cbo', persona: 'UI/UX Designer.' },
];
/* ─── Build ──────────────────────────────────── */
export function buildOrgTree(companyRoot, presetId) {
    const rolesDir = path.join(companyRoot, 'knowledge', 'roles');
    const tree = { root: 'ceo', nodes: new Map() };
    // CEO is implicit (not a role.yaml file)
    tree.nodes.set('ceo', {
        id: 'ceo',
        name: 'CEO',
        level: 'c-level',
        reportsTo: '',
        children: [],
        persona: '',
        authority: { autonomous: [], needsApproval: [] },
        knowledge: { reads: ['*'], writes: ['*'] },
        reports: { daily: '', weekly: '' },
    });
    // Collect role directories to scan: base roles/ + preset roles/
    const roleDirs = [];
    if (fs.existsSync(rolesDir))
        roleDirs.push(rolesDir);
    // If preset specified, also scan preset/agency roles directories (2-Layer Knowledge)
    // Search order: local presets > local agencies > global agencies
    if (presetId && presetId !== 'default') {
        const presetRoleCandidates = [
            path.join(companyRoot, 'knowledge', 'presets', presetId, 'roles'),
            path.join(companyRoot, '.tycono', 'agencies', presetId, 'roles'),
            path.join(os.homedir(), '.tycono', 'agencies', presetId, 'roles'),
        ];
        for (const candidateDir of presetRoleCandidates) {
            if (fs.existsSync(candidateDir))
                roleDirs.push(candidateDir);
        }
    }
    // Read all role.yaml files from all role directories
    for (const dir of roleDirs) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const yamlPath = path.join(dir, entry.name, 'role.yaml');
            if (!fs.existsSync(yamlPath))
                continue;
            try {
                const raw = YAML.parse(fs.readFileSync(yamlPath, 'utf-8'));
                const nodeId = raw.id || entry.name;
                // Skip if already loaded (base roles take precedence over preset roles)
                if (tree.nodes.has(nodeId))
                    continue;
                const node = {
                    id: nodeId,
                    name: raw.name || entry.name,
                    level: raw.level || 'member',
                    reportsTo: (raw.reports_to || 'ceo').toLowerCase(),
                    children: [],
                    persona: raw.persona || '',
                    authority: {
                        autonomous: raw.authority?.autonomous ?? [],
                        needsApproval: raw.authority?.needs_approval ?? [],
                    },
                    knowledge: {
                        reads: raw.knowledge?.reads ?? [],
                        writes: raw.knowledge?.writes ?? [],
                    },
                    reports: {
                        daily: raw.reports?.daily ?? '',
                        weekly: raw.reports?.weekly ?? '',
                    },
                    skills: raw.skills,
                    model: raw.model,
                    source: raw.source ? {
                        id: raw.source.id || '',
                        sync: raw.source.sync || 'manual',
                        forked_at: raw.source.forked_at,
                        upstream_version: raw.source.upstream_version,
                    } : undefined,
                    heartbeat: raw.heartbeat ? {
                        enabled: raw.heartbeat.enabled ?? false,
                        intervalSec: raw.heartbeat.intervalSec ?? 120,
                        maxTicks: raw.heartbeat.maxTicks ?? 60,
                    } : undefined,
                };
                tree.nodes.set(node.id, node);
            }
            catch {
                // Skip malformed YAML
            }
        }
    }
    // Fallback: if no C-Level roles found, use built-in defaults
    const hasCLevel = Array.from(tree.nodes.values()).some(n => n.id !== 'ceo' && n.level === 'c-level');
    if (!hasCLevel) {
        for (const def of DEFAULT_ROLES) {
            if (tree.nodes.has(def.id))
                continue;
            tree.nodes.set(def.id, {
                id: def.id,
                name: def.name,
                level: def.level,
                reportsTo: def.reportsTo,
                children: [],
                persona: def.persona,
                authority: { autonomous: [], needsApproval: [] },
                knowledge: { reads: [], writes: [] },
                reports: { daily: '', weekly: '' },
            });
        }
    }
    // Wire up children from reportsTo
    for (const [id, node] of tree.nodes) {
        if (id === 'ceo')
            continue;
        const parent = tree.nodes.get(node.reportsTo);
        if (parent) {
            parent.children.push(id);
        }
    }
    return tree;
}
/* ─── Queries ────────────────────────────────── */
/** Direct reports */
export function getSubordinates(tree, roleId) {
    return tree.nodes.get(roleId)?.children ?? [];
}
/** All descendants (recursive) */
export function getDescendants(tree, roleId) {
    const result = [];
    const stack = [...getSubordinates(tree, roleId)];
    while (stack.length > 0) {
        const id = stack.pop();
        result.push(id);
        stack.push(...getSubordinates(tree, id));
    }
    return result;
}
/** Chain from role up to CEO: [roleId, ..., ceo] */
export function getChainOfCommand(tree, roleId) {
    const chain = [];
    let current = roleId;
    const visited = new Set();
    while (current && !visited.has(current)) {
        visited.add(current);
        chain.push(current);
        const node = tree.nodes.get(current);
        if (!node || !node.reportsTo)
            break;
        current = node.reportsTo;
    }
    return chain;
}
/** Can source dispatch a task to target? */
export function canDispatchTo(tree, source, target) {
    if (source === target)
        return false;
    // CEO can dispatch to direct reports only
    if (source === 'ceo') {
        return tree.nodes.get(target)?.reportsTo === 'ceo';
    }
    // Others can dispatch to anyone in their subtree
    const descendants = getDescendants(tree, source);
    return descendants.includes(target);
}
/** Can source consult (ask a question to) target? Peers, direct manager, or subordinates. */
export function canConsult(tree, source, target) {
    if (source === target)
        return false;
    const sourceNode = tree.nodes.get(source);
    const targetNode = tree.nodes.get(target);
    if (!sourceNode || !targetNode)
        return false;
    // 1. Peers — same parent
    if (sourceNode.reportsTo === targetNode.reportsTo)
        return true;
    // 2. Direct manager
    if (sourceNode.reportsTo === target)
        return true;
    // 3. Subordinates (same as dispatch scope)
    const descendants = getDescendants(tree, source);
    return descendants.includes(target);
}
/** Refresh tree (re-read all role.yaml files) */
export function refreshOrgTree(companyRoot, presetId) {
    return buildOrgTree(companyRoot, presetId);
}
/** Get a human-readable org chart string for context injection */
export function formatOrgChart(tree, perspective) {
    const lines = [];
    function render(nodeId, indent) {
        const node = tree.nodes.get(nodeId);
        if (!node)
            return;
        const marker = perspective === nodeId ? ' ← YOU' : '';
        const prefix = indent === 0 ? '' : '  '.repeat(indent) + '└─ ';
        lines.push(`${prefix}${node.name} (${node.id})${marker}`);
        for (const childId of node.children) {
            render(childId, indent + 1);
        }
    }
    render('ceo', 0);
    return lines.join('\n');
}
