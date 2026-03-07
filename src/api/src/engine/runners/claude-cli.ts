import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assembleContext } from '../context-assembler.js';
import { getSubordinates } from '../org-tree.js';
import type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle, RunnerResult } from './types.js';

/* ─── Dispatch Bridge Script (Python3) ────── */

const DISPATCH_SCRIPT = `#!/usr/bin/env python3
"""dispatch-bridge: CLI runner가 하위 Role에게 작업을 할당하는 브릿지 스크립트.

2가지 모드:
  dispatch <roleId> "<task>"           — Job 시작 + 결과 대기 (최대 100초)
  dispatch --check <jobId>             — 완료된 Job 결과 조회

환경변수:
  DISPATCH_API_URL    — API 서버 URL (default: http://localhost:3001)
  DISPATCH_PARENT_JOB — 부모 Job ID (자동 설정)
  DISPATCH_SOURCE_ROLE — 현재 Role ID (자동 설정)
"""
import sys, os, json, time, urllib.request, urllib.error
sys.stdout.reconfigure(line_buffering=True)

api = os.environ.get('DISPATCH_API_URL', 'http://localhost:3001')

def log(msg):
    print(msg, flush=True)

def get_result(job_id):
    try:
        history = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}/history', timeout=10).read())
        events = history.get('events', [])
        text_parts = []
        for e in events:
            if e['type'] == 'text':
                text_parts.append(e['data'].get('text', ''))
            elif e['type'] == 'job:error':
                text_parts.append('\\nERROR: ' + e['data'].get('message', ''))
        return ''.join(text_parts) or '(No text output)'
    except Exception as e:
        return f'ERROR: Failed to get result: {e}'

# Mode: --check <jobId>
if len(sys.argv) >= 3 and sys.argv[1] == '--check':
    job_id = sys.argv[2]
    try:
        info = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}', timeout=10).read())
        status = info.get('status', 'unknown')
        if status == 'running':
            log(f'Job {job_id} is still running. Try again later.')
        else:
            log(f'=== Job {job_id}: {status} ===')
            log(get_result(job_id))
    except Exception as e:
        log(f'ERROR: {e}')
    sys.exit(0)

# Mode: dispatch <roleId> "<task>"
if len(sys.argv) < 3:
    log('Usage: dispatch <roleId> "<task>"')
    log('       dispatch --check <jobId>')
    subs = os.environ.get('DISPATCH_SUBORDINATES', '')
    if subs:
        log(f'Available subordinates: {subs}')
    sys.exit(1)

role_id = sys.argv[1]
task = ' '.join(sys.argv[2:])
parent_job = os.environ.get('DISPATCH_PARENT_JOB', '')
source_role = os.environ.get('DISPATCH_SOURCE_ROLE', 'ceo')

# Start job
body = json.dumps({
    'type': 'assign',
    'roleId': role_id,
    'task': task,
    'sourceRole': source_role,
    'parentJobId': parent_job if parent_job else None,
}).encode()

try:
    req = urllib.request.Request(f'{api}/api/jobs', body, {'Content-Type': 'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    job_id = resp['jobId']
except Exception as e:
    log(f'ERROR: Failed to start dispatch job: {e}')
    sys.exit(1)

log(f'=== Dispatched to {role_id.upper()} ===')
log(f'Task: {task[:120]}')
log(f'Job ID: {job_id}')

# Wait for completion (max ~100s to stay within Bash timeout)
status = 'running'
waited = 0
while waited < 100:
    try:
        info = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}', timeout=5).read())
        status = info.get('status', 'unknown')
        if status in ('done', 'error'):
            break
    except Exception:
        pass
    time.sleep(3)
    waited += 3

if status in ('done', 'error'):
    log(f'\\n=== {role_id.upper()} Result ({status}) ===')
    log(get_result(job_id))
else:
    log(f'\\n{role_id.upper()} is still working (waited {waited}s).')
    log(f'Check result later: python3 "$DISPATCH_CMD" --check {job_id}')
`;

/* ─── Claude CLI Runner ──────────────────────── */

/**
 * Claude Code CLI (`claude -p`)를 실행 엔진으로 사용.
 *
 * - Context Assembler가 조립한 시스템 프롬프트를 --system-prompt로 전달
 * - claude -p (print mode)로 실행, stdout의 stream-json을 파싱
 * - Claude Code가 내장 도구(Read, Write, Edit, Bash 등)를 자체적으로 실행
 * - Dispatch Bridge: 하위 Role 할당 시 API를 통해 자식 Job 생성
 * - 구독 기반이므로 API 비용 부담 없음
 */
export class ClaudeCliRunner implements ExecutionRunner {
  execute(config: RunnerConfig, callbacks: RunnerCallbacks): RunnerHandle {
    const { companyRoot, roleId, task, sourceRole, orgTree, readOnly = false, teamStatus } = config;

    // 1. Context Assembly
    const context = assembleContext(companyRoot, roleId, task, sourceRole, orgTree, { teamStatus });

    // 2. System prompt를 임시 파일로 저장 (CLI arg 길이 제한 대비)
    const tmpDir = path.join(os.tmpdir(), 'tycono-engine');
    fs.mkdirSync(tmpDir, { recursive: true });
    const promptFile = path.join(tmpDir, `ctx-${roleId}-${Date.now()}.md`);
    fs.writeFileSync(promptFile, context.systemPrompt);

    // 3. Dispatch Bridge 스크립트 생성 (하위 Role이 있는 경우)
    // readOnly(talk mode)에서도 dispatch 허용 — 하위 Role에 "확인해봐" 같은 지시 가능
    const subordinates = getSubordinates(orgTree, roleId);

    // 4. readOnly면 시스템 프롬프트에 쓰기 금지 지시 추가
    let taskPrompt = task;
    if (readOnly) {
      const dispatchNote = subordinates.length > 0
        ? ' 단, 하위 Role에 대한 dispatch(python3 "$DISPATCH_CMD")는 가능합니다.'
        : '';
      taskPrompt = `[READ-ONLY MODE: 파일 수정/생성 금지. 읽기와 분석만 수행.${dispatchNote}]\n\n${task}`;
    }
    const dispatchScript = path.join(tmpDir, `dispatch-${roleId}-${Date.now()}.py`);
    if (subordinates.length > 0) {
      fs.writeFileSync(dispatchScript, DISPATCH_SCRIPT, { mode: 0o755 });
    }

    // 5. Playwright MCP 설정 — 각 runner 인스턴스가 독립 브라우저 사용
    const runnerOutputDir = path.join(tmpDir, `playwright-${roleId}-${Date.now()}`);
    fs.mkdirSync(runnerOutputDir, { recursive: true });
    const mcpConfig = JSON.stringify({
      mcpServers: {
        playwright: {
          type: 'stdio',
          command: '/Users/nodias/.local/bin/playwright-mcp.sh',
          args: ['--output-dir', runnerOutputDir],
        },
      },
    });

    // 6. CLI args 구성
    const args = [
      '-p',
      '--system-prompt', fs.readFileSync(promptFile, 'utf-8'),
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--model', config.model ?? 'claude-sonnet-4-5',
      '--mcp-config', mcpConfig,
      '--strict-mcp-config',
      taskPrompt,
    ];

    // 7. 프로세스 생성 — 중첩 세션 방지를 위해 CLAUDECODE 환경변수 제거
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;

    // Dispatch Bridge 환경변수 설정
    const apiPort = process.env.PORT || '3001';
    cleanEnv.DISPATCH_API_URL = `http://localhost:${apiPort}`;
    cleanEnv.DISPATCH_SOURCE_ROLE = roleId;
    cleanEnv.DISPATCH_SUBORDINATES = subordinates.join(', ');
    if (config.jobId) {
      cleanEnv.DISPATCH_PARENT_JOB = config.jobId;
    }
    // dispatch 명령어 경로를 PATH에 추가하지 않고 절대 경로로 사용
    cleanEnv.DISPATCH_CMD = dispatchScript;

    const modelName = config.model ?? 'claude-sonnet-4-5';
    console.log(`[Runner] Spawning claude -p: role=${roleId}, model=${modelName}, jobId=${config.jobId ?? 'none'}, subordinates=[${subordinates.join(',')}]`);

    const proc = spawn('claude', args, {
      cwd: companyRoot,
      env: cleanEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let turnCount = 0;
    const toolCalls: RunnerResult['toolCalls'] = [];
    const dispatches: RunnerResult['dispatches'] = [];

    const promise = new Promise<RunnerResult>((resolve, reject) => {
      let buffer = '';

      proc.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();

        // stream-json: 줄 단위 JSON 파싱
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // 마지막 불완전 줄은 버퍼에 보관

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            processStreamEvent(event, callbacks, {
              appendOutput: (t) => { output += t; },
              addToolCall: (name, input) => {
                toolCalls.push({ name, input });
                // Detect dispatch calls via Bash (dispatch bridge)
                if (name === 'Bash' && typeof input?.command === 'string') {
                  const cmd = input.command;
                  // Match: python3 "$DISPATCH_CMD" <roleId> "task" or dispatch <roleId> "task"
                  const dispatchMatch = cmd.match(/(?:DISPATCH_CMD|dispatch(?:\.py)?)[^\n]*?\s+(\w+)\s+["'](.+?)["']/);
                  if (dispatchMatch) {
                    callbacks.onDispatch?.(dispatchMatch[1], dispatchMatch[2]);
                  }
                }
              },
              incrementTurn: () => { turnCount++; callbacks.onTurnComplete?.(turnCount); },
            });
          } catch {
            // JSON 파싱 실패 — 일반 텍스트로 처리
            output += line;
            callbacks.onText?.(line);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        callbacks.onError?.(data.toString());
      });

      proc.on('close', (code, signal) => {
        console.log(`[Runner] Done: code=${code}, signal=${signal}, output=${output.length}chars`);
        // 버퍼에 남은 데이터 처리
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            processStreamEvent(event, callbacks, {
              appendOutput: (t) => { output += t; },
              addToolCall: (name, input) => { toolCalls.push({ name, input }); },
              incrementTurn: () => { turnCount++; },
            });
          } catch {
            output += buffer;
            callbacks.onText?.(buffer);
          }
        }

        // 임시 파일 정리
        try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
        try { fs.unlinkSync(dispatchScript); } catch { /* ignore */ }
        try { fs.rmSync(runnerOutputDir, { recursive: true, force: true }); } catch { /* ignore */ }

        // 비정상 종료 시에도 결과 반환 (output이 있을 수 있으므로)
        resolve({
          output,
          turns: turnCount || 1,
          totalTokens: { input: 0, output: 0 }, // CLI에서는 토큰 추적 불가
          toolCalls,
          dispatches,
        });
      });

      proc.on('error', (err) => {
        try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
        try { fs.unlinkSync(dispatchScript); } catch { /* ignore */ }
        try { fs.rmSync(runnerOutputDir, { recursive: true, force: true }); } catch { /* ignore */ }
        reject(err);
      });
    });

    return {
      promise,
      abort: () => proc.kill('SIGTERM'),
    };
  }
}

/* ─── Stream JSON Event Handler ──────────────── */

interface StreamHandlers {
  appendOutput: (text: string) => void;
  addToolCall: (name: string, input?: Record<string, unknown>) => void;
  incrementTurn: () => void;
}

function processStreamEvent(
  event: Record<string, unknown>,
  callbacks: RunnerCallbacks,
  handlers: StreamHandlers,
): void {
  const type = event.type as string;

  switch (type) {
    case 'assistant': {
      // stream-json format: { type: "assistant", message: { content: [...] } }
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content ?? event.content;

      if (Array.isArray(content)) {
        for (const block of content as Record<string, unknown>[]) {
          if (block.type === 'text' && typeof block.text === 'string') {
            handlers.appendOutput(block.text);
            callbacks.onText?.(block.text);
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            handlers.addToolCall(block.name, block.input as Record<string, unknown>);
            callbacks.onToolUse?.(block.name, block.input as Record<string, unknown>);
          } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
            callbacks.onThinking?.(block.thinking);
          }
        }
      }
      // Turn tracking
      handlers.incrementTurn();
      break;
    }

    case 'result': {
      // 최종 결과: { type: "result", result: "..." }
      // result 텍스트는 assistant 이벤트에서 이미 전달됨 — 중복 방지를 위해 스킵
      break;
    }

    case 'content_block_delta': {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.text === 'string') {
        handlers.appendOutput(delta.text);
        callbacks.onText?.(delta.text);
      }
      break;
    }

    default:
      // system, ping, 기타 이벤트 무시
      break;
  }
}
