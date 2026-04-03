import { Router } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { getTokenLedger } from '../services/token-ledger.js';
import { estimateCost } from '../services/pricing.js';
export const costRouter = Router();
/* ── W-T601: GET /api/cost/summary ───────── */
costRouter.get('/summary', (req, res, next) => {
    try {
        const from = req.query.from;
        const to = req.query.to;
        const ledger = getTokenLedger(COMPANY_ROOT);
        const summary = ledger.query({ from, to });
        // Role-by-role aggregation
        const byRole = {};
        // Model-by-model aggregation
        const byModel = {};
        for (const entry of summary.entries) {
            // By role
            if (!byRole[entry.roleId]) {
                byRole[entry.roleId] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
            }
            byRole[entry.roleId].inputTokens += entry.inputTokens;
            byRole[entry.roleId].outputTokens += entry.outputTokens;
            byRole[entry.roleId].costUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
            // By model
            if (!byModel[entry.model]) {
                byModel[entry.model] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
            }
            byModel[entry.model].inputTokens += entry.inputTokens;
            byModel[entry.model].outputTokens += entry.outputTokens;
            byModel[entry.model].costUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
        }
        const totalCostUsd = estimateCost(summary.totalInput, summary.totalOutput, '');
        // Compute total cost from individual entries (more accurate with mixed models)
        let totalCostFromEntries = 0;
        for (const entry of summary.entries) {
            totalCostFromEntries += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
        }
        res.json({
            from: from ?? null,
            to: to ?? null,
            totalInputTokens: summary.totalInput,
            totalOutputTokens: summary.totalOutput,
            totalCostUsd: totalCostFromEntries,
            byRole,
            byModel,
        });
    }
    catch (err) {
        next(err);
    }
});
/* ── W-T602: GET /api/cost/jobs/:jobId ───── */
/* @deprecated D-014: use /api/cost/sessions/:sessionId */
costRouter.get('/jobs/:jobId', (req, res, next) => {
    try {
        const jobId = req.params.jobId;
        const ledger = getTokenLedger(COMPANY_ROOT);
        const summary = ledger.query({ jobId });
        if (summary.entries.length === 0) {
            res.status(404).json({ error: `No cost data found for job ${jobId}` });
            return;
        }
        let totalCostUsd = 0;
        for (const entry of summary.entries) {
            totalCostUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
        }
        res.json({
            jobId,
            totalInputTokens: summary.totalInput,
            totalOutputTokens: summary.totalOutput,
            totalCostUsd,
            entries: summary.entries.map((e) => ({
                ts: e.ts,
                roleId: e.roleId,
                model: e.model,
                inputTokens: e.inputTokens,
                outputTokens: e.outputTokens,
                costUsd: estimateCost(e.inputTokens, e.outputTokens, e.model),
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
/* ── D-014: GET /api/cost/sessions/:sessionId ───── */
costRouter.get('/sessions/:sessionId', (req, res, next) => {
    try {
        const sessionId = req.params.sessionId;
        const ledger = getTokenLedger(COMPANY_ROOT);
        // D-014: Try sessionId field first, fall back to jobId for legacy entries
        let summary = ledger.query({ sessionId });
        if (summary.entries.length === 0) {
            summary = ledger.query({ jobId: sessionId });
        }
        if (summary.entries.length === 0) {
            res.status(404).json({ error: `No cost data found for session ${sessionId}` });
            return;
        }
        let totalCostUsd = 0;
        for (const entry of summary.entries) {
            totalCostUsd += estimateCost(entry.inputTokens, entry.outputTokens, entry.model);
        }
        res.json({
            sessionId,
            totalInputTokens: summary.totalInput,
            totalOutputTokens: summary.totalOutput,
            totalCostUsd,
            entries: summary.entries.map((e) => ({
                ts: e.ts,
                roleId: e.roleId,
                model: e.model,
                inputTokens: e.inputTokens,
                outputTokens: e.outputTokens,
                costUsd: estimateCost(e.inputTokens, e.outputTokens, e.model),
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
