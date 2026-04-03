import fs from 'node:fs';
import path from 'node:path';
/* ── TokenLedger ────────────────────────── */
export class TokenLedger {
    filePath;
    constructor(companyRoot) {
        const dir = path.join(companyRoot, '.tycono', 'cost');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.filePath = path.join(dir, 'token-ledger.jsonl');
    }
    /** Append a token usage entry (one per LLM call) */
    record(entry) {
        fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
    }
    /** Query entries with optional filters */
    query(filter) {
        if (!fs.existsSync(this.filePath)) {
            return { totalInput: 0, totalOutput: 0, entries: [] };
        }
        const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
        if (!raw) {
            return { totalInput: 0, totalOutput: 0, entries: [] };
        }
        const allEntries = raw
            .split('\n')
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((e) => e !== null);
        let filtered = allEntries;
        if (filter?.from) {
            const fromDate = filter.from;
            filtered = filtered.filter((e) => e.ts >= fromDate);
        }
        if (filter?.to) {
            // Include the full day: to + 'T23:59:59.999Z'
            const toEnd = filter.to.includes('T') ? filter.to : filter.to + 'T23:59:59.999Z';
            filtered = filtered.filter((e) => e.ts <= toEnd);
        }
        if (filter?.roleId) {
            filtered = filtered.filter((e) => e.roleId === filter.roleId);
        }
        if (filter?.sessionId) {
            const sid = filter.sessionId;
            filtered = filtered.filter((e) => e.sessionId === sid || e.jobId === sid);
        }
        if (filter?.jobId) {
            const jid = filter.jobId;
            filtered = filtered.filter((e) => e.jobId === jid || e.sessionId === jid);
        }
        let totalInput = 0;
        let totalOutput = 0;
        for (const e of filtered) {
            totalInput += e.inputTokens;
            totalOutput += e.outputTokens;
        }
        return { totalInput, totalOutput, entries: filtered };
    }
    /** Get the file path (for testing/debugging) */
    getFilePath() {
        return this.filePath;
    }
}
/* ── Singleton (lazy init) ──────────────── */
let _instance = null;
let _instanceRoot = null;
export function getTokenLedger(companyRoot) {
    if (!_instance || _instanceRoot !== companyRoot) {
        _instance = new TokenLedger(companyRoot);
        _instanceRoot = companyRoot;
    }
    return _instance;
}
/** Reset singleton (for testing) */
export function resetTokenLedger() {
    _instance = null;
    _instanceRoot = null;
}
