/**
 * 읽기 전용 도구 — Ask 엔드포인트에서도 사용
 */
export const READ_TOOLS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file. Returns the file content as text.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to company root (e.g., "roles/cto/role.yaml")' },
            },
            required: ['path'],
        },
    },
    {
        name: 'list_files',
        description: 'List files in a directory matching a glob pattern.',
        input_schema: {
            type: 'object',
            properties: {
                directory: { type: 'string', description: 'Directory path relative to company root' },
                pattern: { type: 'string', description: 'Glob pattern (default: "*.md")', default: '*.md' },
            },
            required: ['directory'],
        },
    },
    {
        name: 'search_files',
        description: 'Search for text content across files using a pattern.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Search pattern (regex supported)' },
                directory: { type: 'string', description: 'Directory to search in (relative to company root)', default: '.' },
                file_pattern: { type: 'string', description: 'File glob to filter (e.g., "*.md")', default: '*' },
            },
            required: ['pattern'],
        },
    },
];
/**
 * 쓰기 도구 — Assign 엔드포인트에서만 사용
 */
export const WRITE_TOOLS = [
    {
        name: 'write_file',
        description: 'Create or overwrite a file with the given content.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to company root' },
                content: { type: 'string', description: 'File content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description: 'Edit a file by replacing a specific string with another string.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'File path relative to company root' },
                old_string: { type: 'string', description: 'Exact string to find and replace' },
                new_string: { type: 'string', description: 'Replacement string' },
            },
            required: ['path', 'old_string', 'new_string'],
        },
    },
];
/**
 * 디스패치 도구 — 매니저 Role에게만 제공
 */
export const DISPATCH_TOOL = {
    name: 'dispatch',
    description: 'Assign a task to a subordinate role. The subordinate will execute the task independently and return the result. Only available for roles with direct reports.',
    input_schema: {
        type: 'object',
        properties: {
            roleId: { type: 'string', description: 'Target role ID (e.g., "engineer", "pm")' },
            task: { type: 'string', description: 'Task description for the subordinate' },
        },
        required: ['roleId', 'task'],
    },
};
/**
 * Bash 실행 도구 — 코드 프로젝트에서 시스템 명령 실행 (EG-001)
 */
export const BASH_TOOL = {
    name: 'bash_execute',
    description: 'Execute a shell command in the code project directory. Use for git, npm, tsc, node, test runners, and build tools. Commands run in the codeRoot directory (not company knowledge base). Dangerous commands (rm -rf, sudo, etc.) are blocked.',
    input_schema: {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000, max: 120000)' },
            cwd: { type: 'string', description: 'Working directory relative to codeRoot (default: ".")' },
        },
        required: ['command'],
    },
};
/**
 * 상담 도구 — 모든 Role에게 제공 (동료/상관/부하에게 질문)
 */
export const CONSULT_TOOL = {
    name: 'consult',
    description: 'Ask a question to another role (peer, manager, or subordinate) and wait for their answer. The consulted role will respond in read-only mode. Use when you need information, expertise, or a decision from a colleague.',
    input_schema: {
        type: 'object',
        properties: {
            roleId: { type: 'string', description: 'Target role ID to consult (e.g., "designer", "cto")' },
            question: { type: 'string', description: 'The question to ask' },
        },
        required: ['roleId', 'question'],
    },
};
/**
 * Role에 따른 도구 목록 반환
 */
export function getToolsForRole(hasSubordinates, readOnly, hasBash = false) {
    if (readOnly) {
        return [...READ_TOOLS];
    }
    const tools = [...READ_TOOLS, ...WRITE_TOOLS, CONSULT_TOOL];
    if (hasBash) {
        tools.push(BASH_TOOL);
    }
    if (hasSubordinates) {
        tools.push(DISPATCH_TOOL);
    }
    return tools;
}
