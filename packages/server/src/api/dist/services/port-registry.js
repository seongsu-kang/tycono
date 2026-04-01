/**
 * port-registry.ts — Session port allocation and tracking
 *
 * Manages port assignments for parallel dev server sessions.
 * Each job/session gets unique API + Vite ports to avoid conflicts.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { COMPANY_ROOT } from './file-reader.js';
/* ─── Port Pools ─────────────────────────── */
const API_PORT_START = 3001;
const VITE_PORT_START = 5173;
const HMR_PORT_START = 24678;
const POOL_SIZE = 10;
/* ─── Helpers ────────────────────────────── */
function getRegistryPath() {
    return path.join(COMPANY_ROOT, '.tycono', 'port-registry.json');
}
function readRegistry() {
    const filePath = getRegistryPath();
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    }
    catch { /* ignore corrupt file */ }
    return { sessions: [] };
}
function writeRegistry(data) {
    const filePath = getRegistryPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
}
/* ─── PortRegistry ───────────────────────── */
class PortRegistry {
    /** Allocate ports for a new session */
    async allocate(sessionId, roleId, task) {
        const registry = readRegistry();
        const usedApi = new Set(registry.sessions.map(s => s.ports.api));
        const usedVite = new Set(registry.sessions.map(s => s.ports.vite));
        const usedHmr = new Set(registry.sessions.filter(s => s.ports.hmr).map(s => s.ports.hmr));
        // Find first available port in pool
        let api = 0;
        let vite = 0;
        let hmr = 0;
        for (let i = 0; i < POOL_SIZE; i++) {
            const candidate = API_PORT_START + i;
            if (!usedApi.has(candidate) && await isPortAvailable(candidate)) {
                api = candidate;
                break;
            }
        }
        for (let i = 0; i < POOL_SIZE; i++) {
            const candidate = VITE_PORT_START + i;
            if (!usedVite.has(candidate) && await isPortAvailable(candidate)) {
                vite = candidate;
                break;
            }
        }
        for (let i = 0; i < POOL_SIZE; i++) {
            const candidate = HMR_PORT_START + i;
            if (!usedHmr.has(candidate) && await isPortAvailable(candidate)) {
                hmr = candidate;
                break;
            }
        }
        // Fallback: let OS pick
        if (!api)
            api = 0;
        if (!vite)
            vite = 0;
        const ports = { api, vite };
        if (hmr)
            ports.hmr = hmr;
        const session = {
            sessionId,
            roleId,
            task: task.slice(0, 80),
            ports,
            startedAt: new Date().toISOString(),
            status: 'active',
        };
        registry.sessions.push(session);
        writeRegistry(registry);
        return ports;
    }
    /** Release ports when a session ends */
    release(sessionId) {
        const registry = readRegistry();
        const before = registry.sessions.length;
        registry.sessions = registry.sessions.filter(s => s.sessionId !== sessionId);
        if (registry.sessions.length < before) {
            writeRegistry(registry);
            return true;
        }
        return false;
    }
    /** Update session info (e.g., set PID, worktree path) */
    update(sessionId, patch) {
        const registry = readRegistry();
        const session = registry.sessions.find(s => s.sessionId === sessionId);
        if (!session)
            return false;
        if (patch.pid !== undefined)
            session.pid = patch.pid;
        if (patch.worktreePath !== undefined)
            session.worktreePath = patch.worktreePath;
        if (patch.status !== undefined)
            session.status = patch.status;
        if (patch.task !== undefined)
            session.task = patch.task.slice(0, 80);
        writeRegistry(registry);
        return true;
    }
    /** Get all sessions */
    getAll() {
        return readRegistry().sessions;
    }
    /** Get a specific session */
    get(sessionId) {
        return readRegistry().sessions.find(s => s.sessionId === sessionId) ?? null;
    }
    /** Detect and clean up dead sessions (PID gone) */
    cleanup() {
        const registry = readRegistry();
        const cleaned = [];
        const remaining = [];
        for (const session of registry.sessions) {
            if (session.pid && !isProcessAlive(session.pid)) {
                session.status = 'dead';
                cleaned.push(session);
            }
            else {
                remaining.push(session);
            }
        }
        if (cleaned.length > 0) {
            registry.sessions = remaining;
            writeRegistry(registry);
        }
        return { cleaned, remaining };
    }
    /** Get summary stats */
    getSummary() {
        const sessions = this.getAll();
        const active = sessions.filter(s => s.status === 'active').length;
        return {
            active,
            totalPorts: active * 2, // api + vite per session
        };
    }
}
/* ─── Export singleton ───────────────────── */
export const portRegistry = new PortRegistry();
