import { Router, Request, Response, NextFunction } from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANY_ROOT } from '../services/file-reader.js';

export const coinsRouter = Router();

/* ── Types ── */

interface CoinTransaction {
  ts: string;
  amount: number;
  reason: string;
  ref?: string; // questId, jobId, etc.
}

interface CoinsData {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  transactions: CoinTransaction[];
}

/* ── Persistence ── */

const COINS_FILE = () => join(COMPANY_ROOT, '.tycono', 'coins.json');

const DEFAULT_DATA: CoinsData = {
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  transactions: [],
};

function readCoins(): CoinsData {
  try {
    if (existsSync(COINS_FILE())) {
      return JSON.parse(readFileSync(COINS_FILE(), 'utf-8'));
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_DATA, transactions: [] };
}

function writeCoins(data: CoinsData) {
  mkdirSync(join(COMPANY_ROOT, '.tycono'), { recursive: true });
  writeFileSync(COINS_FILE(), JSON.stringify(data, null, 2) + '\n');
}

/* ── Routes ── */

// GET /api/coins — current balance + summary
coinsRouter.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(readCoins());
  } catch (err) { next(err); }
});

// POST /api/coins/earn — add coins
coinsRouter.post('/earn', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, reason, ref } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    const data = readCoins();
    // Idempotency: skip if same ref already earned (prevents double quest rewards)
    if (ref && data.transactions.some(t => t.ref === ref && t.amount > 0)) {
      res.json({ ok: true, balance: data.balance, skipped: true });
      return;
    }
    const tx: CoinTransaction = {
      ts: new Date().toISOString(),
      amount,
      reason: reason || 'earn',
      ref,
    };
    data.balance += amount;
    data.totalEarned += amount;
    data.transactions.push(tx);
    writeCoins(data);
    res.json({ ok: true, balance: data.balance, transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/coins/spend — deduct coins
coinsRouter.post('/spend', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, reason, ref } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    const data = readCoins();
    if (data.balance < amount) {
      res.status(400).json({ error: 'insufficient balance', balance: data.balance, required: amount });
      return;
    }
    const tx: CoinTransaction = {
      ts: new Date().toISOString(),
      amount: -amount,
      reason: reason || 'spend',
      ref,
    };
    data.balance -= amount;
    data.totalSpent += amount;
    data.transactions.push(tx);
    writeCoins(data);
    res.json({ ok: true, balance: data.balance, transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/coins/migrate — initial coin grant for existing users
coinsRouter.post('/migrate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = readCoins();
    // Only migrate once
    if (data.totalEarned > 0) {
      res.json({ ok: true, skipped: true, balance: data.balance });
      return;
    }
    const { completedQuests = 0 } = req.body;
    const grantAmount = completedQuests > 0 ? completedQuests * 2000 : 5000;
    const reason = completedQuests > 0 ? `migration: ${completedQuests} quests × 2,000` : 'welcome bonus';
    const tx: CoinTransaction = {
      ts: new Date().toISOString(),
      amount: grantAmount,
      reason,
      ref: 'migration',
    };
    data.balance = grantAmount;
    data.totalEarned = grantAmount;
    data.transactions.push(tx);
    writeCoins(data);
    res.json({ ok: true, balance: data.balance, granted: grantAmount, reason });
  } catch (err) { next(err); }
});
