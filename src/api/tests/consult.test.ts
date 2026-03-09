import { describe, test, expect, vi } from 'vitest';
import { executeTool } from '../src/engine/tools/executor.js';
import type { ToolCall } from '../src/engine/llm-adapter.js';
import type { OrgTree } from '../src/engine/org-tree.js';

describe('Consult Tool', () => {
  const mockOrgTree: OrgTree = {
    root: 'ceo',
    nodes: new Map([
      [
        'ceo',
        {
          roleId: 'ceo',
          level: 'c-level',
          reports: ['cto', 'cbo'],
          reportsTo: null,
          knowledgeScope: { readable: ['**/*'], writable: ['**/*'] },
        },
      ],
      [
        'cto',
        {
          roleId: 'cto',
          level: 'c-level',
          reports: ['engineer', 'designer', 'pm', 'qa'],
          reportsTo: 'ceo',
          knowledgeScope: { readable: ['architecture/', 'projects/'], writable: ['architecture/'] },
        },
      ],
      [
        'engineer',
        {
          roleId: 'engineer',
          level: 'member',
          reports: [],
          reportsTo: 'cto',
          knowledgeScope: { readable: ['projects/', 'architecture/'], writable: ['projects/*/technical/'] },
        },
      ],
      [
        'designer',
        {
          roleId: 'designer',
          level: 'member',
          reports: [],
          reportsTo: 'cto',
          knowledgeScope: { readable: ['projects/*/design/'], writable: ['projects/*/design/'] },
        },
      ],
    ]),
  };

  test('consult succeeds when onConsult callback is provided', async () => {
    const mockConsult = vi.fn().mockResolvedValue('The color scheme is blue and white.');

    const toolCall: ToolCall = {
      id: 'test-1',
      name: 'consult',
      input: {
        roleId: 'designer',
        question: 'What color scheme are you using for the dashboard?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBeUndefined();
    expect(result.content).toBe('The color scheme is blue and white.');
    expect(mockConsult).toHaveBeenCalledWith(
      'designer',
      'What color scheme are you using for the dashboard?'
    );
    expect(mockConsult).toHaveBeenCalledTimes(1);
  });

  test('consult fails when roleId is missing', async () => {
    const mockConsult = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-2',
      name: 'consult',
      input: {
        question: 'What is the status?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: roleId and question are required');
    expect(mockConsult).not.toHaveBeenCalled();
  });

  test('consult fails when question is missing', async () => {
    const mockConsult = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-3',
      name: 'consult',
      input: {
        roleId: 'designer',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: roleId and question are required');
    expect(mockConsult).not.toHaveBeenCalled();
  });

  test('consult fails when onConsult callback is not provided', async () => {
    const toolCall: ToolCall = {
      id: 'test-4',
      name: 'consult',
      input: {
        roleId: 'designer',
        question: 'What is the design direction?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      // No onConsult callback provided
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: consult not available in this context');
  });

  test('consult handles callback errors gracefully', async () => {
    const mockConsult = vi.fn().mockRejectedValue(new Error('Target role is currently busy'));

    const toolCall: ToolCall = {
      id: 'test-5',
      name: 'consult',
      input: {
        roleId: 'cto',
        question: 'Should we proceed with refactoring?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: Target role is currently busy');
    expect(mockConsult).toHaveBeenCalledWith('cto', 'Should we proceed with refactoring?');
  });

  test('consult converts input to strings', async () => {
    const mockConsult = vi.fn().mockResolvedValue('Answer');

    const toolCall: ToolCall = {
      id: 'test-6',
      name: 'consult',
      input: {
        roleId: 456 as unknown as string,
        question: { text: 'question' } as unknown as string,
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBeUndefined();
    expect(mockConsult).toHaveBeenCalledWith('456', '[object Object]');
  });

  test('consult can be used to ask manager (upward)', async () => {
    const mockConsult = vi.fn().mockResolvedValue('Yes, proceed with the new architecture.');

    const toolCall: ToolCall = {
      id: 'test-7',
      name: 'consult',
      input: {
        roleId: 'cto',
        question: 'Should I implement the new microservices architecture?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBeUndefined();
    expect(result.content).toBe('Yes, proceed with the new architecture.');
    expect(mockConsult).toHaveBeenCalledWith('cto', 'Should I implement the new microservices architecture?');
  });

  test('consult can be used between peers (lateral)', async () => {
    const mockConsult = vi.fn().mockResolvedValue('I recommend using TypeScript 5.x for better type inference.');

    const toolCall: ToolCall = {
      id: 'test-8',
      name: 'consult',
      input: {
        roleId: 'engineer',
        question: 'What version of TypeScript should we use?',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'designer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
    });

    expect(result.is_error).toBeUndefined();
    expect(result.content).toBe('I recommend using TypeScript 5.x for better type inference.');
  });

  test('onToolExec callback is invoked for consult', async () => {
    const mockConsult = vi.fn().mockResolvedValue('OK');
    const mockToolExec = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-9',
      name: 'consult',
      input: {
        roleId: 'cto',
        question: 'Test question',
      },
    };

    await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'engineer',
      orgTree: mockOrgTree,
      onConsult: mockConsult,
      onToolExec: mockToolExec,
    });

    expect(mockToolExec).toHaveBeenCalledWith('consult', {
      roleId: 'cto',
      question: 'Test question',
    });
    expect(mockToolExec).toHaveBeenCalledTimes(1);
  });
});
