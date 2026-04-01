import { describe, test, expect, vi } from 'vitest';
import { executeTool } from '../src/engine/tools/executor.js';
import type { ToolCall } from '../src/engine/llm-adapter.js';
import type { OrgTree } from '../src/engine/org-tree.js';

describe('Dispatch Tool', () => {
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
    ]),
  };

  test('dispatch succeeds when onDispatch callback is provided', async () => {
    const mockDispatch = vi.fn().mockResolvedValue('Task completed successfully');

    const toolCall: ToolCall = {
      id: 'test-1',
      name: 'dispatch',
      input: {
        roleId: 'engineer',
        task: 'Implement feature X',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
    });

    expect(result.is_error).toBeUndefined();
    expect(result.content).toBe('Task completed successfully');
    expect(mockDispatch).toHaveBeenCalledWith('engineer', 'Implement feature X');
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  test('dispatch fails when roleId is missing', async () => {
    const mockDispatch = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-2',
      name: 'dispatch',
      input: {
        task: 'Implement feature X',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: roleId and task are required');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('dispatch fails when task is missing', async () => {
    const mockDispatch = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-3',
      name: 'dispatch',
      input: {
        roleId: 'engineer',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: roleId and task are required');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('dispatch fails when onDispatch callback is not provided', async () => {
    const toolCall: ToolCall = {
      id: 'test-4',
      name: 'dispatch',
      input: {
        roleId: 'engineer',
        task: 'Implement feature X',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      // No onDispatch callback provided
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: dispatch not available in this context');
  });

  test('dispatch handles callback errors gracefully', async () => {
    const mockDispatch = vi.fn().mockRejectedValue(new Error('Subordinate role not found'));

    const toolCall: ToolCall = {
      id: 'test-5',
      name: 'dispatch',
      input: {
        roleId: 'nonexistent',
        task: 'Do something',
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
    });

    expect(result.is_error).toBe(true);
    expect(result.content).toBe('Error: Subordinate role not found');
    expect(mockDispatch).toHaveBeenCalledWith('nonexistent', 'Do something');
  });

  test('dispatch converts input to strings', async () => {
    const mockDispatch = vi.fn().mockResolvedValue('OK');

    const toolCall: ToolCall = {
      id: 'test-6',
      name: 'dispatch',
      input: {
        roleId: 123 as unknown as string, // Type assertion to test runtime behavior
        task: ['task', 'array'] as unknown as string,
      },
    };

    const result = await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
    });

    expect(result.is_error).toBeUndefined();
    expect(mockDispatch).toHaveBeenCalledWith('123', 'task,array');
  });

  test('onToolExec callback is invoked for dispatch', async () => {
    const mockDispatch = vi.fn().mockResolvedValue('OK');
    const mockToolExec = vi.fn();

    const toolCall: ToolCall = {
      id: 'test-7',
      name: 'dispatch',
      input: {
        roleId: 'engineer',
        task: 'Test task',
      },
    };

    await executeTool(toolCall, {
      companyRoot: '/test/company',
      roleId: 'cto',
      orgTree: mockOrgTree,
      onDispatch: mockDispatch,
      onToolExec: mockToolExec,
    });

    expect(mockToolExec).toHaveBeenCalledWith('dispatch', {
      roleId: 'engineer',
      task: 'Test task',
    });
    expect(mockToolExec).toHaveBeenCalledTimes(1);
  });
});
