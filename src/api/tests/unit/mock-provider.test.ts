import { describe, it, expect } from 'vitest';
import { MockProvider, textResponse, toolUseResponse, dispatchResponse } from '../mocks/mock-provider.js';

describe('MockProvider', () => {
  it('returns queued responses in order', async () => {
    const mock = new MockProvider([
      textResponse('first'),
      textResponse('second'),
    ]);

    const r1 = await mock.chat('system', [{ role: 'user', content: 'hello' }]);
    const r2 = await mock.chat('system', [{ role: 'user', content: 'world' }]);

    expect(r1.content[0]).toEqual({ type: 'text', text: 'first' });
    expect(r2.content[0]).toEqual({ type: 'text', text: 'second' });
    expect(mock.callCount).toBe(2);
  });

  it('throws when responses exhausted', async () => {
    const mock = new MockProvider([textResponse('only one')]);
    await mock.chat('s', [{ role: 'user', content: 'a' }]);

    await expect(mock.chat('s', [{ role: 'user', content: 'b' }]))
      .rejects.toThrow('no more responses');
  });

  it('records system prompt and messages', async () => {
    const mock = new MockProvider([textResponse('ok')]);
    await mock.chat('my-system-prompt', [{ role: 'user', content: 'task' }]);

    expect(mock.calls[0].system).toBe('my-system-prompt');
    expect(mock.calls[0].messages[0].content).toBe('task');
  });
});

describe('Response factories', () => {
  it('textResponse creates end_turn response', () => {
    const r = textResponse('hello');
    expect(r.stopReason).toBe('end_turn');
    expect(r.content).toHaveLength(1);
    expect(r.content[0].type).toBe('text');
  });

  it('toolUseResponse creates tool_use response', () => {
    const r = toolUseResponse('read', { path: '/tmp/file.md' });
    expect(r.stopReason).toBe('tool_use');
    expect(r.content[0].type).toBe('tool_use');
  });

  it('dispatchResponse creates dispatch tool_use', () => {
    const r = dispatchResponse('pm', 'do something');
    expect(r.stopReason).toBe('tool_use');
    const block = r.content[0] as Record<string, unknown>;
    expect(block.name).toBe('dispatch');
    expect(block.input).toEqual({ roleId: 'pm', task: 'do something' });
  });
});
