/**
 * speech.ts — Chat Pipeline LLM endpoint
 *
 * POST /api/speech/chat — History-aware channel conversation.
 * AI reads channel history and responds in character.
 * Uses Haiku for cost efficiency (~$0.0006/call).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { COMPANY_ROOT } from '../services/file-reader.js';
import { buildOrgTree } from '../engine/index.js';
import { AnthropicProvider, ClaudeCliProvider, type LLMProvider } from '../engine/llm-adapter.js';
import { TokenLedger } from '../services/token-ledger.js';
import { readConfig } from '../services/company-config.js';

export const speechRouter = Router();

// Lazy-init token ledger for cost tracking
let ledger: TokenLedger | null = null;
function getLedger(): TokenLedger {
  if (!ledger) { ledger = new TokenLedger(COMPANY_ROOT); }
  return ledger;
}

// Lazy-init LLM provider based on engine config
let llm: LLMProvider | null = null;
function getLLM(): LLMProvider {
  if (!llm) {
    const config = readConfig(COMPANY_ROOT);
    const model = process.env.SPEECH_MODEL || 'claude-haiku-4-5-20251001';
    if (config.engine === 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
      llm = new ClaudeCliProvider({ model });
    } else {
      llm = new AnthropicProvider({ model });
    }
  }
  return llm;
}

/**
 * POST /api/speech/chat
 *
 * Body: {
 *   channelId: string,
 *   roleId: string,
 *   history: Array<{ roleId: string, text: string, ts: number }>,
 *   members: Array<{ id: string, name: string, level: string }>,
 *   relationships: Array<{ partnerId: string, familiarity: number }>,
 *   workContext?: { currentTask: string | null, taskProgress: string | null }
 * }
 * Returns: { message: string, tokens: { input: number, output: number } }
 */
speechRouter.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, channelTopic, roleId, history, members, relationships, workContext } = req.body as {
      channelId: string;
      channelTopic?: string;
      roleId: string;
      history: Array<{ roleId: string; text: string; ts: number }>;
      members: Array<{ id: string; name: string; level: string }>;
      relationships: Array<{ partnerId: string; familiarity: number }>;
      workContext?: { currentTask: string | null; taskProgress: string | null };
    };

    if (!roleId || !channelId) {
      res.status(400).json({ error: 'roleId and channelId are required' });
      return;
    }

    const config = readConfig(COMPANY_ROOT);
    if (config.engine !== 'claude-cli' && !process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: 'Chat requires ANTHROPIC_API_KEY or claude-cli engine', message: '' });
      return;
    }

    // Build org tree to get persona
    const tree = buildOrgTree(COMPANY_ROOT);
    const node = tree.nodes.get(roleId);
    if (!node) {
      res.status(404).json({ error: `Role not found: ${roleId}` });
      return;
    }

    const persona = node.persona || `${node.name} (${node.level})`;

    // Build member context
    const memberList = members
      .map(m => `${m.name} (${m.level})`)
      .join(', ');

    // Build relationship context
    const relContext = relationships.length > 0
      ? `\nYour relationships:\n${relationships.map(r => {
          const memberName = members.find(m => m.id === r.partnerId)?.name ?? r.partnerId;
          const level = r.familiarity >= 80 ? 'best friends'
            : r.familiarity >= 50 ? 'close colleagues'
            : r.familiarity >= 20 ? 'coworkers'
            : 'barely acquainted';
          return `- ${memberName}: ${level} (${r.familiarity}/100)`;
        }).join('\n')}`
      : '';

    // Build work context
    const workCtx = workContext?.currentTask
      ? `\nYou are currently working on: "${workContext.currentTask}"${workContext.taskProgress ? ` (${workContext.taskProgress})` : ''}`
      : '\nYou are currently idle (no active task).';

    // Format chat history
    const historyText = history.length > 0
      ? history.map(h => {
          const name = members.find(m => m.id === h.roleId)?.name ?? h.roleId;
          return `${name}: ${h.text}`;
        }).join('\n')
      : '(No messages yet — you can start the conversation)';

    // Build channel topic context
    const topicCtx = channelTopic
      ? `\nChannel topic: "${channelTopic}"\nYour messages should relate to this topic.`
      : '';

    const systemPrompt = `You are ${node.name}, a ${node.level} employee.
Persona: ${persona}
${workCtx}

You are in the #${channelId} chat channel.${topicCtx}
Members: ${memberList}
${relContext}

Read the conversation and respond naturally as a real person in a team chat.
Rules:
- Stay in character (your persona and role)
- Be brief (1-2 sentences max)
- Talk about the channel topic, your work, team dynamics, or casual chat — be human
- Vary your tone: sometimes enthusiastic, sometimes tired, sometimes joking
- Use appropriate tone based on hierarchy and familiarity
- Do NOT repeat what others already said
- If the conversation is stale or you have nothing new to add, respond with exactly: [SILENT]
- Do NOT use quotes around your response. Just output the raw sentence.
- Write in English.`;

    const provider = getLLM();
    const response = await provider.chat(
      systemPrompt,
      [{ role: 'user', content: historyText }],
    );

    const raw = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');

    // Filter out CLI noise and [SILENT]
    const message = (raw === '[SILENT]' || raw.startsWith('Error: Reached max turns')) ? '' : raw;

    // Record usage in token ledger (category: chat)
    if (response.usage) {
      getLedger().record({
        ts: new Date().toISOString(),
        jobId: `chat-${channelId}`,
        roleId,
        model: process.env.SPEECH_MODEL || 'claude-haiku-4-5-20251001',
        inputTokens: response.usage.inputTokens ?? 0,
        outputTokens: response.usage.outputTokens ?? 0,
      });
    }

    res.json({
      message,
      tokens: response.usage,
    });
  } catch (err) {
    next(err);
  }
});
