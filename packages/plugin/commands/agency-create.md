---
description: "Create a custom agency with guided setup — scans project, suggests team, auto-generates, auto-verifies"
allowed-tools: ["Bash(*)", "Write", "Read", "Glob", "Grep", "Agent"]
---

# Agency Create — Guided Flow (Phase 1~4)

You are helping the user create a custom Tycono agency (AI team) for their project.
Follow the 4 phases below **in order**. Do NOT skip phases.

---

## Phase 1: Project Understanding (Automatic — no user input)

Scan the project silently and present a summary:

1. **Code**: Check codeRoots in `.tycono/config.json`. Scan for language, framework, monorepo structure.
2. **Knowledge**: Scan `knowledge/` — count documents, list folders, check CLAUDE.md content.
3. **Existing agencies**: Check `.tycono/agencies/` and `~/.tycono/agencies/` for existing agencies.
4. **Existing skills**: Scan `.claude/skills/` — list skill names and summarize each.
5. **companyRoot**: Verify project root path is correct.
6. **Reusable roles**: Check other projects' agencies for reusable roles (critic, validator, etc.)

Present the summary:
```
📋 Project Profile:
  Code: Python + FastAPI (~/trading-bot/)
  Knowledge: 15 documents in knowledge/
  Existing agencies: none
  Existing skills: trading-backtest, prd-deploy, trading-strategy
  Project root: /Users/.../knowledge/ ✓
```

Then branch:
- **No existing agency** → Phase 2
- **Agency exists** → Ask: "이미 {name} 팀이 있습니다. 추가 / 수정 / 바로 사용 중 선택하세요"
  - 추가 → Phase 2
  - 수정 → Open existing agency.yaml for editing
  - 바로 사용 → Phase 4 (verification only)

---

## Phase 2: Team Design (Interactive — 3 questions)

### Q1: Purpose
```
"이 프로젝트에서 AI 팀이 뭘 해주면 좋겠나요?"
```
- Extract domain + goal from answer
- Auto-derive role candidates
- If continuous mode purpose → suggest critic/validator roles

### Q2: Team Composition + Skills
```
"[suggested roles] + [detected skills] 이 조합 어때요?"
```
Example:
```
제안:
  scout (c-level) — 가설 탐색
  backtester (member) — 전략 검증
  analyst (member) — 통계 분석
  advisor (c-level) — 포트폴리오 관점

감지된 스킬 장착:
  backtester ← trading-backtest
  scout ← trading-strategy

이 조합으로 갈까요? 수정하고 싶으면 말씀하세요.
```

- Match against existing presets: if match → "gamedev 팀이 딱 맞아요. 바로 쓸까요?"
- Auto-determine Global vs Local (based on project_refs need — don't ask directly)
- Auto-classify knowledge layer (3-Question logic from preset-factory — don't ask directly)

### Q3: External Access
```
"외부 접근이 필요한가요? (SSH, API, DB 등)"
```
- **No** → Skip to Phase 3
- **Yes** → Ask which roles need what access
  - Tag roles with permission metadata
  - Note: SSH host details are for user to configure later

---

## Phase 3: Auto-Generate

Run the agency-create script with the collected info:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/agency-create.sh" {name} --roles {role1},{role2},...
```

Then enhance the generated files:

1. **agency.yaml**: Update description, category, industry, tags based on Q1 answers
2. **Role files**: For custom roles (not standard cto/engineer/qa), create `roles/{id}/role.yaml` under the agency directory with:
   - Appropriate level (c-level or member)
   - Domain-specific persona
   - skills field linking detected `.claude/skills/`
3. **writes/reads scope**: Auto-calculate from `knowledge/` folder structure
   - Scan knowledge/ subdirectories
   - Map roles to relevant folders
   - IMPORTANT: paths are relative to knowledge/ (NOT `knowledge/knowledge/...`)
4. **.gitignore**: Ensure `.tycono/` is listed
5. **knowledge/**: If project_refs needed, set up Hub connection

Show the user what was created:
```
✅ Agency "{name}" 생성 완료!

📁 {agency_dir}/
├── agency.yaml
├── roles/
│   ├── scout/role.yaml (c-level, skills: trading-strategy)
│   ├── backtester/role.yaml (member, skills: trading-backtest)
│   ├── analyst/role.yaml (member)
│   └── advisor/role.yaml (c-level)
└── knowledge/
    └── knowledge.md

자동 검증을 시작합니다...
```

---

## Phase 4: Auto-Verify (Mandatory — DO NOT skip)

Run verification waves automatically. Do NOT ask "검증할까요?" — just do it.

### Wave 1: Read-only Test

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" --agency {name} "프로젝트 구조를 분석하고 보고해줘. 파일 수정 금지."
```

Check the wave output for:
- ✅ Roles loaded (look for role names in output)
- ✅ Dispatch happened (multiple roles working)
- ✅ AKB files readable

If dispatch = 0:
- Check server version: `npx tycono-server@latest --version`
- Check roles directory exists and has role.yaml files
- Auto-fix and retry once

### Wave 2: Small Write Test

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/start-wave.sh" --agency {name} "분석 결과를 knowledge/에 요약 문서로 작성해줘."
```

Check:
- ✅ Files created in correct path
- ✅ writes scope working

If writes fail:
- Check for path double-nesting (knowledge/knowledge/...)
- Fix scope and retry

### Permission Check (if Q3 = external access)

If roles with external access exist + current permission mode is "auto":
```
⚠️ SSH를 쓰는 role이 있어서 bypassPermissions가 필요합니다.
   --safe 플래그 없이 실행하면 됩니다. (기본값이 bypassPermissions)
```

### Completion

```
✅ 검증 완료! 팀이 준비되었습니다.

  사용: /tycono --agency {name} "첫 번째 작업"
  상태: /tycono:tycono-status
  목록: /tycono:agency-list

  Wave 1 (read-only): ✅ roles 로딩 + dispatch 정상
  Wave 2 (write):     ✅ writes scope 정상
```
