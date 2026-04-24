---
description: "Explain Tycono plugin, available commands, and how to get started. WHEN: user asks about tycono, what commands are available, how to use it, or says help."
---

# Tycono — AI Team Orchestration Plugin

**"You're one person. Tycono gives you a team."**

## What is Tycono?

Tycono orchestrates a team of AI agents to work on your task:
- **CEO Supervisor** — dispatches roles, monitors progress, course-corrects
- **CTO** — designs architecture, manages Engineer + QA
- **CBO** — analyzes market, manages PM + Designer
- **Engineer** — writes the code
- **QA** — tests and validates

You see real-time updates in your Claude Code session as background notifications.

## Commands

| Command | Description |
|---------|-------------|
| `/tycono <task>` | Start a wave — your AI team begins working |
| `/tycono --agency <id> <task>` | Start with a specific agency (team config) |
| `/tycono:tycono-status` | Check current wave progress |
| `/tycono:tycono-cancel` | Cancel the active wave |
| `/tycono:agency-create` | **Guided setup** — scan project, design team, auto-verify |
| `/tycono:agency-list` | List installed agencies |
| `/tycono:agency-install <id>` | Install an agency from marketplace or GitHub |
| `/tycono:analysis` | Role별 토큰/비용/모델 실시간 분석 |
| `/tycono:report` | Wave 결과 마크다운 리포트 |
| `/tycono:version` | Show version info (plugin, server, hook status) |
| `/tycono:board` | Task board 조회/관리 (skip, edit, add) |
| `/tycono:help` | This help page |

## Quick Start (3 steps)

**Step 1: Just run it**
```
/tycono "Build a browser tower defense game"
```
A team starts working in the background. You'll see updates as they happen.

**Step 2: Check progress**
```
/tycono:tycono-status
```

**Step 3: See detailed results**
After the wave, check `.tycono/activity-streams/` for each role's full work log:
```
.tycono/activity-streams/
├── ses-ceo-*.jsonl      ← CEO's decisions and dispatches
├── ses-cto-*.jsonl      ← CTO's architecture and management
├── ses-engineer-*.jsonl ← Engineer's code changes
└── ses-qa-*.jsonl       ← QA's test results
```

## For Existing Projects (Custom Agency)

If you have an existing project and want a specialized AI team:

```
/tycono:agency-create
```

This walks you through:
1. **Auto-scan** — detects your code, skills, knowledge
2. **3 questions** — team purpose, composition, external access
3. **Auto-generate** — agency.yaml, roles, writes scope
4. **Auto-verify** — runs test waves to confirm everything works

## Background Notifications

When a wave is running, you get notifications **directly in Claude Code**:
- 🔔 Agent needs your decision (awaiting input)
- ❌ Session error
- ⚠️ Dispatch failed
- ✅ Wave completed

No need to poll `/tycono:tycono-status` — events come to you.

## Bundled Agencies

| Agency | Team | Best For |
|--------|------|----------|
| `gamedev` | CTO, Engineer, QA, PM, Designer | Game development |
| `startup-mvp` | CTO, Engineer, PM | MVP prototyping |
| `solo-founder` | CTO, CBO, Engineer, Designer | Solo founder products |

```
/tycono --agency gamedev "Create an RPG with combat and inventory"
```

## Dashboard (Web UI)

Wave 진행 상황을 브라우저에서 실시간으로 볼 수 있습니다:

```
http://localhost:{PORT}/ui/
```

포트는 `/tycono:version`에서 확인. 대시보드에서:
- **노드 트리**: CEO → CTO → Engineer → QA 전체 dispatch 구조
- **실시간 상태**: 각 role의 running/done/skipped 상태
- **노드 클릭**: 해당 role의 최신 출력, tool calls, dispatches 상세
- **Activity Feed**: 전체 이벤트 스트림 (role별 필터 가능)
- **개입**: Skip, Edit 버튼으로 wave 진행 중 개입

## Tips

- **Give clear directives**: "Build X" is good. "CCTP token 수정" is too vague — include context about what's already done and what the actual problem is.
- **Simple tasks**: Don't need a full team. CEO auto-decides whether to dispatch or answer directly.
- **Custom agency**: For domain-specific work, create a custom agency with `/tycono:agency-create`.
- **defaultAgency**: Set in `.tycono/config.json` to skip `--agency` every time:
  ```json
  { "defaultAgency": "your-agency-id" }
  ```

## Installation

```bash
# 1. Add marketplace (one-time)
/plugin marketplace add seongsu-kang/tycono

# 2. Install plugin
/plugin install tycono@seongsu-kang-tycono

# 3. Update (when new version available)
/plugin update tycono
```

서버는 자동으로 시작됩니다 — `/tycono`가 알아서 관리합니다.

서버 수동 관리가 필요할 때:
```
npx tycono-server@latest            # 서버만 시작 (headless)
/tycono:tycono-status               # wave 상태 확인
/tycono:tycono-cancel               # wave 중단
```

## Activity Streams (실시간 모니터링)

각 role이 뭘 하는지 보려면:

```bash
# 파일로 직접 확인
cat .tycono/activity-streams/ses-cto-*.jsonl | tail -5

# SSE 스트림 구독 (실시간)
curl -N http://localhost:{PORT}/api/waves/{WAVE_ID}/stream

# 전체 active waves 조회
curl http://localhost:{PORT}/api/waves/active
```

`/tycono:tycono-status`로도 요약을 볼 수 있습니다.

## New in 0.1.6+

| Feature | Command |
|---------|---------|
| **Wave Analysis** | `/tycono:analysis` — role별 토큰/비용/모델 실시간 표시 |
| **Wave Report** | `/tycono:report` — wave 결과 마크다운 리포트 |
| **Model Override** | `--model cto=sonnet,engineer=haiku` — role별 모델 변경 |
| **Confirmation** | wave 시작 전 팀/비용 preview + 승인 (자동) |

## New in 0.3.0+

**Role-level effort** — `role.yaml` 에서 role 별 추론 강도 조절:
```yaml
id: critic
model: claude-opus-4-6
effort: max   # low | medium | high | xhigh | max
```
- Claude CLI `--effort` → Messages API `output_config.effort` 에 전달
- `max` 는 **Opus-4-6 전용** — 다른 모델에 지정 시 CLI 가 조용히 `high` 로 downgrade (서버 로그에 경고)
- Reasoning-heavy role (Critic / Verdict-Judge) 을 `max` 로, 저비용 role (scribe / notifier) 을 `low` 로 세팅해서 비용/품질 트레이드오프

## New in 0.2.0+

`--continuous` loop runaway 방어 (BUG-NOOP-LOOP fix). 기본값은 켜져있고 필요 시 override:

| Flag | 기본값 | 역할 |
|------|--------|------|
| `--continuous-max-waves <N>` | 20 | N iteration 후 halt |
| `--continuous-max-wallclock <ms>` | 7200000 (2h) | 누적 시간 초과 시 halt |
| `--continuous-max-cost <usd>` | 50 | 누적 비용 초과 시 halt |

자동 halt 조건 (유저 플래그 없이도 동작):
- CEO 가 child role dispatch 없이 완료 → 즉시 halt (noop 판정)
- 같은 output fingerprint 2회 연속 → halt (동일 판정 재방출 차단)

## Troubleshooting

**Hook 충돌 (SessionStart error)**
```
npm -g와 marketplace 동시 설치 시 hook이 충돌합니다.
해결: npm uninstall -g tycono
marketplace 설치만 유지하세요.
```

**서버 업데이트 안 됨**
```
기존 서버가 떠있으면 새 버전으로 자동 교체됩니다 (0.1.6+).
수동 교체: /tycono:version 으로 확인 후 서버 PID kill.
```

**wave 완료 후 프로세스 남음**
```
0.1.8+ 서버는 wave:done SSE 이벤트를 보내 자동 종료됩니다.
구 버전이면: /tycono:tycono-cancel 또는 서버 업데이트.
```

## Links

- **Website**: [tycono.ai](https://tycono.ai)
- **GitHub**: [github.com/seongsu-kang/tycono](https://github.com/seongsu-kang/tycono)
