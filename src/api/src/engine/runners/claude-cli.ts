import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assembleContext } from '../context-assembler.js';
import { getSubordinates } from '../org-tree.js';
import { readConfig } from '../../services/company-config.js';
import { getTokenLedger } from '../../services/token-ledger.js';
import type { ExecutionRunner, RunnerConfig, RunnerCallbacks, RunnerHandle, RunnerResult } from './types.js';

/* ─── Dispatch Bridge Script (Python3) ────── */

const DISPATCH_SCRIPT = `#!/usr/bin/env python3
"""dispatch-bridge: CLI runner가 하위 Role에게 작업을 할당하는 브릿지 스크립트.

3가지 모드:
  dispatch <roleId> "<task>"           — Job 시작 (즉시 반환, 대기하지 않음)
  dispatch --check <jobId>             — Job 상태 및 결과 조회
  dispatch --wait <roleId> "<task>"    — Job 시작 + 완료 대기 (최대 300초)

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

def get_result(job_id, retries=3):
    for attempt in range(retries):
        try:
            history = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}/history', timeout=10).read())
            events = history.get('events', [])
            text_parts = []
            for e in events:
                if e['type'] == 'text':
                    text_parts.append(e['data'].get('text', ''))
                elif e['type'] == 'job:error':
                    text_parts.append('\\nERROR: ' + e['data'].get('message', ''))
            result = ''.join(text_parts)
            if result:
                return result
            if attempt < retries - 1:
                log(f'  Result empty, retrying in 2s... (attempt {attempt + 1}/{retries})')
                time.sleep(2)
        except Exception as e:
            if attempt == retries - 1:
                return f'ERROR: Failed to get result: {e}'
            time.sleep(2)
    return '(No text output — activity stream may still be writing. Check again with --check)'

def get_job_info(job_id):
    info = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}', timeout=5).read())
    return info

def get_status(job_id):
    return get_job_info(job_id).get('status', 'unknown')

def start_job(role_id, task):
    parent_job = os.environ.get('DISPATCH_PARENT_JOB', '')
    source_role = os.environ.get('DISPATCH_SOURCE_ROLE', 'ceo')
    body = json.dumps({
        'type': 'assign',
        'roleId': role_id,
        'task': task,
        'sourceRole': source_role,
        'parentJobId': parent_job if parent_job else None,
    }).encode()
    req = urllib.request.Request(f'{api}/api/jobs', body, {'Content-Type': 'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    return resp['jobId']

# Mode: --check <jobId>
if len(sys.argv) >= 3 and sys.argv[1] == '--check':
    job_id = sys.argv[2]
    try:
        info = get_job_info(job_id)
        status = info.get('status', 'unknown')
        if status == 'running':
            log(f'Status: RUNNING — {job_id} is still working. Check again in 10-30s.')
        elif status == 'awaiting_input':
            log(f'Status: AWAITING_INPUT — subordinate has a question.')
            log(info.get('output', '') or get_result(job_id))
        elif status == 'done':
            log(f'Status: DONE')
            log(info.get('output', '') or get_result(job_id))
        elif status == 'error':
            log(f'Status: ERROR')
            log(info.get('output', '') or get_result(job_id))
        else:
            log(f'Status: {status}')
    except Exception as e:
        log(f'ERROR: {e}')
    sys.exit(0)

# Mode: dispatch <roleId> "<task>" (always immediate return)
args = sys.argv[1:]
# Accept --wait for backwards compat but ignore it (always async now)
if args and args[0] == '--wait':
    args = args[1:]

# Usage check
if len(args) < 2:
    log('Usage: dispatch <roleId> "<task>"          — Start job (returns immediately)')
    log('       dispatch --check <jobId>            — Check job status/result')
    subs = os.environ.get('DISPATCH_SUBORDINATES', '')
    if subs:
        log(f'Available subordinates: {subs}')
    sys.exit(1)

role_id = args[0]
task = ' '.join(args[1:])

# Start job
try:
    job_id = start_job(role_id, task)
except Exception as e:
    log(f'ERROR: Failed to start dispatch job: {e}')
    sys.exit(1)

log(f'=== Dispatched to {role_id.upper()} ===')
log(f'Task: {task[:120]}')
log(f'Job ID: {job_id}')
log(f'')
log(f'⛔ Job is running async. Use --check to poll for result:')
log(f'  python3 "$DISPATCH_CMD" --check {job_id}')
log(f'')
log(f'DO NOT re-dispatch the same task. Poll with --check every 10-30s until status is DONE.')
`;

/* ─── Consult Bridge Script (Python3) ────── */

const CONSULT_SCRIPT = `#!/usr/bin/env python3
"""consult-bridge: CLI runner가 다른 Role에게 질문하는 브릿지 스크립트.

사용법:
  consult <roleId> "<question>"          — Job 시작 (readOnly) + 결과 대기 (최대 90초)
  consult --check <jobId>                — 완료된 Job 결과 조회

환경변수:
  CONSULT_API_URL    — API 서버 URL (default: http://localhost:3001)
  CONSULT_PARENT_JOB — 부모 Job ID (자동 설정)
  CONSULT_SOURCE_ROLE — 현재 Role ID (자동 설정)
"""
import sys, os, json, time, urllib.request, urllib.error
sys.stdout.reconfigure(line_buffering=True)

api = os.environ.get('CONSULT_API_URL', os.environ.get('DISPATCH_API_URL', 'http://localhost:3001'))

def log(msg):
    print(msg, flush=True)

def get_result(job_id, retries=3):
    for attempt in range(retries):
        try:
            history = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}/history', timeout=10).read())
            events = history.get('events', [])
            text_parts = []
            for e in events:
                if e['type'] == 'text':
                    text_parts.append(e['data'].get('text', ''))
                elif e['type'] == 'job:error':
                    text_parts.append('\\nERROR: ' + e['data'].get('message', ''))
            result = ''.join(text_parts)
            if result:
                return result
            if attempt < retries - 1:
                log(f'  Result empty, retrying in 2s... (attempt {attempt + 1}/{retries})')
                time.sleep(2)
        except Exception as e:
            if attempt == retries - 1:
                return f'ERROR: Failed to get result: {e}'
            time.sleep(2)
    return '(No text output — activity stream may still be writing. Check again with --check)'

def get_job_info(job_id):
    info = json.loads(urllib.request.urlopen(f'{api}/api/jobs/{job_id}', timeout=5).read())
    return info

def get_status(job_id):
    return get_job_info(job_id).get('status', 'unknown')

# Mode: --check <jobId>
if len(sys.argv) >= 3 and sys.argv[1] == '--check':
    job_id = sys.argv[2]
    try:
        info = get_job_info(job_id)
        status = info.get('status', 'unknown')
        if status == 'running':
            log(f'Job {job_id} is still running. Try again later.')
        elif status == 'awaiting_input':
            log(f'Job {job_id} is awaiting input.')
            log(info.get('output', '') or get_result(job_id))
        else:
            log(f'=== Job {job_id}: {status} ===')
            log(info.get('output', '') or get_result(job_id))
    except Exception as e:
        log(f'ERROR: {e}')
    sys.exit(0)

# Mode: consult <roleId> "<question>"
if len(sys.argv) < 3:
    log('Usage: consult <roleId> "<question>"')
    log('       consult --check <jobId>')
    sys.exit(1)

role_id = sys.argv[1]
question = ' '.join(sys.argv[2:])
parent_job = os.environ.get('CONSULT_PARENT_JOB', os.environ.get('DISPATCH_PARENT_JOB', ''))
source_role = os.environ.get('CONSULT_SOURCE_ROLE', os.environ.get('DISPATCH_SOURCE_ROLE', 'ceo'))

# Start job (readOnly + consult type)
task = f'[Consultation from {source_role}] {question}\\n\\nAnswer this question based on your role\\'s expertise and knowledge. Be concise and specific.'
body = json.dumps({
    'type': 'consult',
    'roleId': role_id,
    'task': task,
    'sourceRole': source_role,
    'readOnly': True,
    'parentJobId': parent_job if parent_job else None,
}).encode()

try:
    req = urllib.request.Request(f'{api}/api/jobs', body, {'Content-Type': 'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    job_id = resp['jobId']
except Exception as e:
    log(f'ERROR: Failed to start consult job: {e}')
    sys.exit(1)

log(f'=== Consulting {role_id.upper()} ===')
log(f'Question: {question[:120]}')
log(f'Job ID: {job_id}')
log(f'')
log(f'Consult job started. Use --check to get the answer:')
log(f'  python3 "$CONSULT_CMD" --check {job_id}')
log(f'')
log(f'Poll every 10s until status is DONE.')
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
    const { companyRoot, roleId, task, sourceRole, orgTree, readOnly = false, teamStatus, attachments, targetRoles } = config;

    // Note: Claude CLI doesn't support inline image attachments.
    // Images will be ignored with a warning if passed.
    if (attachments && attachments.length > 0) {
      console.warn(`[ClaudeCliRunner] Warning: Image attachments (${attachments.length}) are not supported in CLI mode. Use EXECUTION_ENGINE=direct-api for vision support.`);
    }

    // 1. Context Assembly
    const context = assembleContext(companyRoot, roleId, task, sourceRole, orgTree, { teamStatus, targetRoles });

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

    // Consult Bridge — available to ALL roles (not just managers)
    const consultScript = path.join(tmpDir, `consult-${roleId}-${Date.now()}.py`);
    fs.writeFileSync(consultScript, CONSULT_SCRIPT, { mode: 0o755 });

    // 5. Playwright MCP 설정 — 각 runner 인스턴스가 독립 브라우저 사용
    const runnerOutputDir = path.join(tmpDir, `playwright-${roleId}-${Date.now()}`);
    fs.mkdirSync(runnerOutputDir, { recursive: true });
    const mcpConfig = JSON.stringify({
      mcpServers: {
        playwright: {
          type: 'stdio',
          command: process.env.PLAYWRIGHT_MCP_PATH || 'npx',
          args: process.env.PLAYWRIGHT_MCP_PATH
            ? ['--output-dir', runnerOutputDir]
            : ['@anthropic-ai/mcp-playwright', '--output-dir', runnerOutputDir],
        },
      },
    });

    // 6. CLI args 구성
    const maxTurns = config.maxTurns ?? 25;
    const args = [
      '-p',
      '--system-prompt', fs.readFileSync(promptFile, 'utf-8'),
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--model', config.model ?? 'claude-sonnet-4-5',
      '--max-turns', String(maxTurns),
      '--mcp-config', mcpConfig,
      '--strict-mcp-config',
      taskPrompt,
    ];

    // Disallow Agent and Task tools to force use of dispatch bridge
    // For roles with subordinates (C-Level), also disallow Edit/Write to enforce delegation
    const disallowed = ['Agent', 'Task'];
    if (subordinates.length > 0 && !readOnly) {
      disallowed.push('Edit', 'Write', 'NotebookEdit');
    }
    args.push('--disallowed-tools', ...disallowed);

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
    cleanEnv.CONSULT_CMD = consultScript;
    cleanEnv.CONSULT_SOURCE_ROLE = roleId;

    const modelName = config.model ?? 'claude-sonnet-4-5';
    // Use codeRoot as cwd if configured, otherwise fall back to companyRoot
    const companyConfig = readConfig(companyRoot);
    const cwd = companyConfig.codeRoot || companyRoot;

    // Inject repo paths so agents never confuse repos
    cleanEnv.TYCONO_CODE_ROOT = companyConfig.codeRoot || '';
    cleanEnv.TYCONO_AKB_ROOT = companyRoot;
    console.log(`[Runner] Spawning claude -p: role=${roleId}, model=${modelName}, maxTurns=${maxTurns}, jobId=${config.jobId ?? 'none'}, cwd=${cwd}, subordinates=[${subordinates.join(',')}]`);

    const proc = spawn('claude', args, {
      cwd,
      env: cleanEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let turnCount = 0;
    let totalInput = 0;
    let totalOutput = 0;
    const toolCalls: RunnerResult['toolCalls'] = [];
    const dispatches: RunnerResult['dispatches'] = [];
    const tokenLedger = getTokenLedger(companyRoot);

    const promise = new Promise<RunnerResult>((resolve, reject) => {
      let buffer = '';
      let resolved = false;
      let exitCode: number | null = null;
      let exitSignal: string | null = null;

      // Safety net: if 'exit' fires but 'close' doesn't follow within 5s,
      // force resolve. This handles grandchild processes keeping stdout pipe open.
      proc.on('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal ?? null;
        setTimeout(() => {
          if (!resolved) {
            console.warn(`[Runner] Safety net: 'close' not fired 5s after 'exit' (code=${code}, signal=${signal}). Force resolving.`);
            resolved = true;
            try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
            try { fs.unlinkSync(dispatchScript); } catch { /* ignore */ }
            try { fs.unlinkSync(consultScript); } catch { /* ignore */ }
            try { fs.rmSync(runnerOutputDir, { recursive: true, force: true }); } catch { /* ignore */ }
            resolve({
              output,
              turns: turnCount || 1,
              totalTokens: { input: totalInput, output: totalOutput },
              toolCalls,
              dispatches,
            });
          }
        }, 5000);
      });

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
                // Dispatch detection removed — child jobs created by the Python
                // dispatch bridge script via POST /api/jobs with parentJobId.
                // JobManager.startJob() now auto-emits dispatch:start on parent stream.
              },
              incrementTurn: () => { turnCount++; callbacks.onTurnComplete?.(turnCount); },
              recordTokens: (input, out) => {
                totalInput += input;
                totalOutput += out;
                tokenLedger.record({
                  ts: new Date().toISOString(),
                  jobId: config.jobId ?? 'unknown',
                  roleId,
                  model: modelName,
                  inputTokens: input,
                  outputTokens: out,
                });
              },
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
        if (resolved) {
          console.log(`[Runner] 'close' fired after safety-net resolve (code=${code}, signal=${signal})`);
          return;
        }
        resolved = true;
        console.log(`[Runner] Done: code=${code}, signal=${signal}, output=${output.length}chars`);
        // 버퍼에 남은 데이터 처리
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer);
            processStreamEvent(event, callbacks, {
              appendOutput: (t) => { output += t; },
              addToolCall: (name, input) => { toolCalls.push({ name, input }); },
              incrementTurn: () => { turnCount++; },
              recordTokens: (input, out) => {
                totalInput += input;
                totalOutput += out;
                tokenLedger.record({
                  ts: new Date().toISOString(),
                  jobId: config.jobId ?? 'unknown',
                  roleId,
                  model: modelName,
                  inputTokens: input,
                  outputTokens: out,
                });
              },
            });
          } catch {
            output += buffer;
            callbacks.onText?.(buffer);
          }
        }

        // 임시 파일 정리
        try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
        try { fs.unlinkSync(dispatchScript); } catch { /* ignore */ }
        try { fs.unlinkSync(consultScript); } catch { /* ignore */ }
        try { fs.rmSync(runnerOutputDir, { recursive: true, force: true }); } catch { /* ignore */ }

        // 비정상 종료 시에도 결과 반환 (output이 있을 수 있으므로)
        resolve({
          output,
          turns: turnCount || 1,
          totalTokens: { input: totalInput, output: totalOutput },
          toolCalls,
          dispatches,
        });
      });

      proc.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
        try { fs.unlinkSync(dispatchScript); } catch { /* ignore */ }
        try { fs.unlinkSync(consultScript); } catch { /* ignore */ }
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
  recordTokens?: (inputTokens: number, outputTokens: number) => void;
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
      // 최종 결과에서 토큰 사용량 추출
      // modelUsage가 가장 정확 (모델별 cache 포함 상세)
      // fallback: usage.input_tokens / output_tokens (cache 제외)
      if (handlers.recordTokens) {
        let inputTk = 0;
        let outputTk = 0;

        const modelUsage = event.modelUsage as Record<string, Record<string, number>> | undefined;
        if (modelUsage) {
          // Sum across all models (usually just one)
          for (const mu of Object.values(modelUsage)) {
            inputTk += (mu.inputTokens ?? 0) + (mu.cacheReadInputTokens ?? 0) + (mu.cacheCreationInputTokens ?? 0);
            outputTk += mu.outputTokens ?? 0;
          }
        } else {
          // Fallback to usage field
          const usage = event.usage as Record<string, number> | undefined;
          if (usage) {
            inputTk = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
            outputTk = usage.output_tokens ?? 0;
          }
        }

        if (inputTk > 0 || outputTk > 0) {
          handlers.recordTokens(inputTk, outputTk);
        }
      }
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
