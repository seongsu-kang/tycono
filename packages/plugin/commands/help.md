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

## Tips

- **Give clear directives**: "Build X" is good. "CCTP token 수정" is too vague — include context about what's already done and what the actual problem is.
- **Simple tasks**: Don't need a full team. CEO auto-decides whether to dispatch or answer directly.
- **Custom agency**: For domain-specific work, create a custom agency with `/tycono:agency-create`.
- **defaultAgency**: Set in `.tycono/config.json` to skip `--agency` every time:
  ```json
  { "defaultAgency": "your-agency-id" }
  ```

## Headless / API Only Environment

Plugin은 headless 서버에서도 동작합니다. **서버를 직접 띄울 필요 없음** — `/tycono`가 알아서 시작합니다.

```
# plugin만 설치하면 끝
claude plugin install tycono

# 바로 사용
/tycono --agency research-discovery "가설 검증해"
```

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

## Links

- **Website**: [tycono.ai](https://tycono.ai)
- **GitHub**: [github.com/seongsu-kang/tycono](https://github.com/seongsu-kang/tycono)
