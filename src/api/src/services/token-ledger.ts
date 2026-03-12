import fs from 'node:fs';
import path from 'node:path';

/* ── Types ──────────────────────────────── */

export interface TokenEntry {
  ts: string;
  /** @deprecated D-014: use sessionId */
  jobId: string;
  /** D-014: Session this entry belongs to */
  sessionId?: string;
  roleId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenSummary {
  totalInput: number;
  totalOutput: number;
  entries: TokenEntry[];
}

export interface QueryFilter {
  from?: string;   // ISO date string (inclusive)
  to?: string;     // ISO date string (inclusive)
  roleId?: string;
  /** @deprecated D-014: use sessionId */
  jobId?: string;
  /** D-014: Filter by session ID */
  sessionId?: string;
}

/* ── TokenLedger ────────────────────────── */

export class TokenLedger {
  private filePath: string;

  constructor(companyRoot: string) {
    const dir = path.join(companyRoot, 'operations', 'cost');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, 'token-ledger.jsonl');
  }

  /** Append a token usage entry (one per LLM call) */
  record(entry: TokenEntry): void {
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
  }

  /** Query entries with optional filters */
  query(filter?: QueryFilter): TokenSummary {
    if (!fs.existsSync(this.filePath)) {
      return { totalInput: 0, totalOutput: 0, entries: [] };
    }

    const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
    if (!raw) {
      return { totalInput: 0, totalOutput: 0, entries: [] };
    }

    const allEntries: TokenEntry[] = raw
      .split('\n')
      .map((line) => {
        try { return JSON.parse(line) as TokenEntry; }
        catch { return null; }
      })
      .filter((e): e is TokenEntry => e !== null);

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
    if (filter?.jobId) {
      filtered = filtered.filter((e) => e.jobId === filter.jobId);
    }
    if (filter?.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === filter.sessionId);
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
  getFilePath(): string {
    return this.filePath;
  }
}

/* ── Singleton (lazy init) ──────────────── */

let _instance: TokenLedger | null = null;
let _instanceRoot: string | null = null;

export function getTokenLedger(companyRoot: string): TokenLedger {
  if (!_instance || _instanceRoot !== companyRoot) {
    _instance = new TokenLedger(companyRoot);
    _instanceRoot = companyRoot;
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetTokenLedger(): void {
  _instance = null;
  _instanceRoot = null;
}
