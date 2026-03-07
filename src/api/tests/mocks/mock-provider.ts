/**
 * MockProvider — LLMProvider mock for deterministic testing.
 *
 * Queues pre-defined responses. Records all calls for assertion.
 */
import type {
  LLMProvider,
  LLMResponse,
  LLMMessage,
  ToolDefinition,
  MessageContent,
} from '../../src/engine/llm-adapter.js';

export interface MockCall {
  system: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
}

export class MockProvider implements LLMProvider {
  private responses: LLMResponse[];
  private callIndex = 0;
  public calls: MockCall[] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(
    systemPrompt: string,
    messages: LLMMessage[],
    tools?: ToolDefinition[],
    _signal?: AbortSignal,
  ): Promise<LLMResponse> {
    this.calls.push({ system: systemPrompt, messages: structuredClone(messages), tools });
    if (this.callIndex >= this.responses.length) {
      throw new Error(
        `MockProvider: no more responses (called ${this.callIndex + 1} times, only ${this.responses.length} responses queued)`,
      );
    }
    return this.responses[this.callIndex++];
  }

  /** How many times chat() was called */
  get callCount(): number {
    return this.calls.length;
  }

  /** Reset call history and response index */
  reset(responses?: LLMResponse[]): void {
    this.calls = [];
    this.callIndex = 0;
    if (responses) this.responses = responses;
  }
}

/* ─── Response Factories ────────────────────── */

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0 };

export interface UsageOverride {
  inputTokens?: number;
  outputTokens?: number;
}

/** Simple text response — agent says something and stops */
export function textResponse(text: string, usage?: UsageOverride): LLMResponse {
  return {
    content: [{ type: 'text', text }],
    stopReason: 'end_turn',
    usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : ZERO_USAGE,
  };
}

/** Tool use response — agent wants to call a tool */
export function toolUseResponse(
  name: string,
  input: Record<string, unknown>,
  id?: string,
): LLMResponse {
  return {
    content: [
      {
        type: 'tool_use',
        id: id ?? `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        input,
      } as MessageContent,
    ],
    stopReason: 'tool_use',
    usage: ZERO_USAGE,
  };
}

/** Dispatch response — agent dispatches to a subordinate role */
export function dispatchResponse(roleId: string, task: string): LLMResponse {
  return toolUseResponse('dispatch', { roleId, task });
}

/** Read file tool use response */
export function readToolResponse(filePath: string): LLMResponse {
  return toolUseResponse('read', { path: filePath });
}

/** Write file tool use response */
export function writeToolResponse(filePath: string, content: string): LLMResponse {
  return toolUseResponse('write', { path: filePath, content });
}

/** Mixed response — text + tool use in one turn */
export function mixedResponse(
  text: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): LLMResponse {
  return {
    content: [
      { type: 'text', text },
      {
        type: 'tool_use',
        id: `tool_${Date.now()}`,
        name: toolName,
        input: toolInput,
      } as MessageContent,
    ],
    stopReason: 'tool_use',
    usage: ZERO_USAGE,
  };
}
