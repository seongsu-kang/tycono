import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
/* ─── Anthropic Provider ─────────────────────── */
export class AnthropicProvider {
    client;
    model;
    constructor(options) {
        this.client = new Anthropic({
            apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY,
        });
        this.model = options?.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
    }
    /**
     * Send a message and get a complete response (non-streaming)
     */
    async chat(systemPrompt, messages, tools, signal, options) {
        const params = {
            model: this.model,
            max_tokens: options?.maxTokens ?? 8192,
            system: systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        };
        if (tools && tools.length > 0) {
            params.tools = tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
            }));
        }
        const response = await this.client.messages.create(params, { signal });
        return {
            content: this.mapContent(response.content),
            stopReason: response.stop_reason ?? 'end_turn',
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            },
        };
    }
    /**
     * Send a message with streaming (for SSE)
     */
    async chatStream(systemPrompt, messages, tools, callbacks) {
        const params = {
            model: this.model,
            max_tokens: 8192,
            stream: true,
            system: systemPrompt,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        };
        if (tools && tools.length > 0) {
            params.tools = tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
            }));
        }
        const stream = this.client.messages.stream(params);
        const contentBlocks = [];
        let currentToolInput = '';
        let currentToolId = '';
        let currentToolName = '';
        stream.on('text', (text) => {
            callbacks.onText?.(text);
        });
        stream.on('contentBlock', (block) => {
            if (block.type === 'text') {
                contentBlocks.push({ type: 'text', text: block.text });
            }
            else if (block.type === 'tool_use') {
                const toolCall = {
                    id: block.id,
                    name: block.name,
                    input: block.input,
                };
                contentBlocks.push({
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input,
                });
                callbacks.onToolUse?.(toolCall);
            }
        });
        const finalMessage = await stream.finalMessage();
        const response = {
            content: this.mapContent(finalMessage.content),
            stopReason: finalMessage.stop_reason ?? 'end_turn',
            usage: {
                inputTokens: finalMessage.usage.input_tokens,
                outputTokens: finalMessage.usage.output_tokens,
            },
        };
        callbacks.onDone?.(response);
        return response;
    }
    /* ─── Private helpers ──────────────────────── */
    mapContent(blocks) {
        const result = [];
        for (const block of blocks) {
            if (block.type === 'text') {
                result.push({ type: 'text', text: block.text });
            }
            else if (block.type === 'tool_use') {
                result.push({
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input,
                });
            }
            // Skip thinking, redacted_thinking, and other block types
        }
        return result;
    }
}
/* ─── Claude CLI Provider ───────────────────── */
/**
 * Claude CLI (`claude -p`)를 LLMProvider로 사용.
 * Claude Max 구독 기반 — API 키 불필요.
 * Chat pipeline (speech) 등 간단한 텍스트 생성에 사용.
 */
export class ClaudeCliProvider {
    model;
    constructor(options) {
        this.model = options?.model || 'claude-haiku-4-5-20251001';
    }
    async chat(systemPrompt, messages, tools, signal) {
        // Build user message from messages array
        const userText = messages
            .filter(m => m.role === 'user')
            .map(m => typeof m.content === 'string' ? m.content : m.content.filter(c => c.type === 'text').map(c => c.text).join(''))
            .join('\n');
        // When tools are requested, enable claude's built-in Read/Grep/Glob
        const useTools = tools && tools.length > 0;
        return new Promise((resolve, reject) => {
            const args = [
                '-p',
                '--system-prompt', systemPrompt,
                '--model', this.model,
                '--max-turns', useTools ? '50' : '1',
                '--output-format', 'text',
                ...(useTools ? [
                    '--tools', 'Read,Grep,Glob',
                    '--permission-mode', process.env.TYCONO_PERMISSION_MODE || 'bypassPermissions',
                ] : []),
                userText,
            ];
            const cleanEnv = { ...process.env };
            delete cleanEnv.CLAUDECODE;
            const proc = spawn('claude', args, {
                env: cleanEnv,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });
            if (signal) {
                signal.addEventListener('abort', () => proc.kill('SIGTERM'), { once: true });
            }
            proc.on('close', (code) => {
                const text = stdout.trim();
                if (code !== 0 && !text) {
                    reject(new Error(`claude-cli exited with code ${code}: ${stderr}`));
                    return;
                }
                resolve({
                    content: [{ type: 'text', text }],
                    stopReason: 'end_turn',
                    usage: { inputTokens: 0, outputTokens: 0 },
                });
            });
            proc.on('error', reject);
        });
    }
}
/* ─── Backwards Compatibility ────────────────── */
/** @deprecated Use AnthropicProvider instead */
export const LLMAdapter = AnthropicProvider;
