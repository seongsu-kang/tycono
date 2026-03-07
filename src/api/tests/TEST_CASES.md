# The Company Platform — E2E Test Cases

> 사용자가 이 플랫폼에서 수행할 수 있는 모든 주요 액션을 테스트 케이스로 정의.
> 각 케이스는 자동화 가능한 형태(Given-When-Then)로 작성.
> 참조: [Test Strategy](../../../../knowledge/test-strategy.md) | [Cost Control](../../../../architecture/cost-control.md)

---

## 테스트 레벨 분류

| Level | 실행 환경 | LLM 호출 | 속도 |
|-------|----------|---------|------|
| **API** | HTTP 요청 (supertest) | MockProvider | 빠름 |
| **SSE** | HTTP + EventSource | MockProvider | 빠름 |
| **Live** | HTTP 요청 | 실제 Haiku API | 느림 (env-gated) |
| **E2E** | Playwright + 브라우저 | MockProvider or Live | 느림 |

---

## TC-1: 온보딩 (Setup & Scaffold)

### TC-1.1: 엔진 감지

```yaml
id: TC-1.1
level: API
endpoint: POST /api/setup/detect-engine

given:
  - 서버 실행 중
when:
  - POST /api/setup/detect-engine 호출
then:
  - response.claudeCli: boolean (CLI 설치 여부)
  - response.apiKey: boolean (env에 키 존재 여부)
  - response.recommended: "claude-cli" | "direct-api" | "none" 중 하나
```

### TC-1.2: 경로 검증 — 유효한 디렉토리

```yaml
id: TC-1.2
level: API
endpoint: POST /api/setup/validate-path

given:
  - 존재하는 빈 디렉토리 /tmp/test-co
when:
  - POST /api/setup/validate-path { path: "/tmp/test-co" }
then:
  - response.valid: true
  - response.hasClaudeMd: false
  - response.path: "/tmp/test-co"
```

### TC-1.3: 경로 검증 — 존재하지 않는 경로

```yaml
id: TC-1.3
level: API
endpoint: POST /api/setup/validate-path

given:
  - /tmp/nonexistent 디렉토리 없음
when:
  - POST /api/setup/validate-path { path: "/tmp/nonexistent" }
then:
  - response.valid: false
  - response.error: 에러 메시지 포함
```

### TC-1.4: 경로 검증 — 기존 AKB 디렉토리

```yaml
id: TC-1.4
level: API
endpoint: POST /api/setup/validate-path

given:
  - CLAUDE.md가 있는 디렉토리
when:
  - POST /api/setup/validate-path { path: "<dir>" }
then:
  - response.valid: true
  - response.hasClaudeMd: true
```

### TC-1.5: 팀 템플릿 목록 조회

```yaml
id: TC-1.5
level: API
endpoint: GET /api/setup/teams

given:
  - 서버 실행 중
when:
  - GET /api/setup/teams
then:
  - response: 배열, 길이 >= 1
  - 각 항목에 id, roles[] 포함
  - roles에 id, name, level 포함
```

### TC-1.6: 스캐폴드 — 새 회사 생성

```yaml
id: TC-1.6
level: API
endpoint: POST /api/setup/scaffold

given:
  - 빈 디렉토리 /tmp/new-co
when:
  - POST /api/setup/scaffold {
      companyName: "TestCo",
      description: "Test company",
      team: "startup"
    }
then:
  - response.ok: true
  - response.companyName: "TestCo"
  - 디스크에 생성됨:
    - CLAUDE.md
    - company/company.md
    - roles/roles.md
    - roles/cto/role.yaml
    - roles/pm/role.yaml
    - roles/engineer/role.yaml
  - process.env.COMPANY_ROOT 갱신됨
```

### TC-1.7: 스캐폴드 — API 키 포함

```yaml
id: TC-1.7
level: API
endpoint: POST /api/setup/scaffold

given:
  - 빈 디렉토리
when:
  - POST /api/setup/scaffold {
      companyName: "TestCo",
      apiKey: "sk-ant-xxx"
    }
then:
  - .the-company/config.json 생성됨
  - config.engine: "direct-api"
  - config.apiKey: "sk-ant-xxx"
  - .env 파일에 ANTHROPIC_API_KEY 포함
```

### TC-1.8: 기존 AKB 연결

```yaml
id: TC-1.8
level: API
endpoint: POST /api/setup/connect-akb

given:
  - CLAUDE.md가 있는 기존 AKB 디렉토리
when:
  - POST /api/setup/connect-akb { path: "<akb-dir>" }
then:
  - response.ok: true
  - response.companyName: CLAUDE.md에서 파싱된 이름
  - response.engine: config.json의 engine 값
  - process.env.COMPANY_ROOT 갱신됨
```

### TC-1.9: 폴더 브라우저

```yaml
id: TC-1.9
level: API
endpoint: POST /api/setup/browse

given:
  - 유효한 디렉토리 경로
when:
  - POST /api/setup/browse { path: "/tmp" }
then:
  - response.current: "/tmp"
  - response.parent: "/"
  - response.dirs: 하위 디렉토리 배열 (name, path)
  - response.hasClaudeMd: boolean
```

### TC-1.10: 지식 임포트 (SSE)

```yaml
id: TC-1.10
level: SSE + Live
endpoint: POST /api/setup/import-knowledge

given:
  - 스캐폴드된 회사 + markdown 파일이 있는 경로
when:
  - POST /api/setup/import-knowledge { paths: ["/path/to/docs"] }
then:
  - SSE 이벤트 순서: scanning → processing(반복) → created(반복) → done
  - done 이벤트에 stats 포함 (imported, skipped 수)
  - knowledge/ 디렉토리에 파일 생성됨
```

---

## TC-2: 회사 & 조직 조회

### TC-2.1: 회사 정보 조회

```yaml
id: TC-2.1
level: API
endpoint: GET /api/company

given:
  - 스캐폴드된 회사 (COMPANY_ROOT 설정됨)
when:
  - GET /api/company
then:
  - response.name: 회사명
  - response.roles: Role 배열 (id, name, level, reportsTo)
```

### TC-2.2: 상태 확인

```yaml
id: TC-2.2
level: API
endpoint: GET /api/status

given:
  - 스캐폴드된 회사
when:
  - GET /api/status
then:
  - response.initialized: true
  - response.companyName: 회사명
  - response.engine: "direct-api" | "claude-cli" | "none"
  - response.companyRoot: 경로
```

### TC-2.3: 상태 확인 — 미초기화

```yaml
id: TC-2.3
level: API
endpoint: GET /api/status

given:
  - COMPANY_ROOT 미설정
when:
  - GET /api/status
then:
  - response.initialized: false
  - response.companyName: null
```

### TC-2.4: 조직도 조회

```yaml
id: TC-2.4
level: API
endpoint: GET /api/engine/org

given:
  - startup 팀 스캐폴드됨 (CEO → CTO → PM, Engineer)
when:
  - GET /api/engine/org
then:
  - response.root: "ceo"
  - response.nodes.cto.children: ["pm", "engineer"] 포함
  - response.chart: ASCII 조직도 문자열
```

---

## TC-3: Role 관리 (CRUD)

### TC-3.1: Role 목록 조회

```yaml
id: TC-3.1
level: API
endpoint: GET /api/roles

given:
  - 3개 Role 존재 (cto, pm, engineer)
when:
  - GET /api/roles
then:
  - response: 길이 3 배열
  - 각 항목에 id, name, level, reportsTo, status 포함
```

### TC-3.2: Role 상세 조회

```yaml
id: TC-3.2
level: API
endpoint: GET /api/roles/:id

given:
  - cto Role 존재
when:
  - GET /api/roles/cto
then:
  - response.id: "cto"
  - response.persona: 문자열 포함
  - response.authority.autonomous: 배열
  - response.authority.needsApproval: 배열
```

### TC-3.3: Role 상세 조회 — 존재하지 않는 Role

```yaml
id: TC-3.3
level: API
endpoint: GET /api/roles/:id

given:
  - "nonexistent" Role 없음
when:
  - GET /api/roles/nonexistent
then:
  - status: 404
```

### TC-3.4: Role 생성 (Hire)

```yaml
id: TC-3.4
level: API
endpoint: POST /api/engine/roles

given:
  - startup 팀 존재
when:
  - POST /api/engine/roles {
      id: "designer",
      name: "UI Designer",
      reportsTo: "cto",
      level: "member",
      persona: "UI/UX design expert"
    }
then:
  - response.ok: true
  - response.roleId: "designer"
  - 디스크: roles/designer/role.yaml 생성됨
  - 디스크: .claude/skills/designer/SKILL.md 생성됨
  - GET /api/roles → 길이 4
  - GET /api/engine/org → cto.children에 "designer" 포함
```

### TC-3.5: Role 생성 — 중복 ID

```yaml
id: TC-3.5
level: API
endpoint: POST /api/engine/roles

given:
  - "cto" Role 이미 존재
when:
  - POST /api/engine/roles { id: "cto", name: "CTO", reportsTo: "ceo" }
then:
  - status: 409 (Conflict)
```

### TC-3.6: Role 수정

```yaml
id: TC-3.6
level: API
endpoint: PATCH /api/engine/roles/:id

given:
  - pm Role 존재
when:
  - PATCH /api/engine/roles/pm { persona: "Updated persona" }
then:
  - response.ok: true
  - GET /api/roles/pm → persona에 "Updated persona" 포함
```

### TC-3.7: Role 삭제 (Fire)

```yaml
id: TC-3.7
level: API
endpoint: DELETE /api/engine/roles/:id

given:
  - designer Role 존재
when:
  - DELETE /api/engine/roles/designer
then:
  - response.ok: true
  - 디스크: roles/designer/ 디렉토리 삭제됨
  - GET /api/roles → "designer" 미포함
  - GET /api/engine/org → "designer" 미포함
```

### TC-3.8: Role 삭제 — 존재하지 않는 Role

```yaml
id: TC-3.8
level: API
endpoint: DELETE /api/engine/roles/:id

given:
  - "ghost" Role 없음
when:
  - DELETE /api/engine/roles/ghost
then:
  - status: 404
```

### TC-3.9: Role 유효성 검증

```yaml
id: TC-3.9
level: API
endpoint: GET /api/engine/roles/validate

given:
  - 정상적인 Role 구조
when:
  - GET /api/engine/roles/validate
then:
  - 각 roleId에 valid, errors[], warnings[] 포함
  - 정상 Role: valid=true, errors=[]
```

### TC-3.10: SKILL.md 재생성

```yaml
id: TC-3.10
level: API
endpoint: POST /api/engine/roles/:id/skill/regenerate

given:
  - cto Role 존재
when:
  - POST /api/engine/roles/cto/skill/regenerate
then:
  - response.ok: true
  - .claude/skills/cto/SKILL.md 갱신됨
```

---

## TC-4: Skill 관리

### TC-4.1: 스킬 목록 조회

```yaml
id: TC-4.1
level: API
endpoint: GET /api/skills

given:
  - 스캐폴드된 회사 (기본 스킬 포함)
when:
  - GET /api/skills
then:
  - response: 배열
  - 각 항목에 id, name, description, source, installed 포함
```

### TC-4.2: 스킬 상세 조회

```yaml
id: TC-4.2
level: API
endpoint: GET /api/skills/:id

given:
  - knowledge-gate 스킬 존재
when:
  - GET /api/skills/knowledge-gate
then:
  - response.id: "knowledge-gate"
  - response.content: SKILL.md 내용 포함
```

### TC-4.3: Role에 스킬 장착

```yaml
id: TC-4.3
level: API
endpoint: POST /api/skills/role/:roleId

given:
  - cto Role + knowledge-gate 스킬 존재
when:
  - POST /api/skills/role/cto { skillId: "knowledge-gate" }
then:
  - response.ok: true
  - response.skills: "knowledge-gate" 포함
  - roles/cto/role.yaml의 skills에 추가됨
```

### TC-4.4: Role에서 스킬 해제

```yaml
id: TC-4.4
level: API
endpoint: DELETE /api/skills/role/:roleId/:skillId

given:
  - cto Role에 knowledge-gate 장착됨
when:
  - DELETE /api/skills/role/cto/knowledge-gate
then:
  - response.ok: true
  - response.skills: "knowledge-gate" 미포함
```

### TC-4.5: Role의 장착된 스킬 조회

```yaml
id: TC-4.5
level: API
endpoint: GET /api/skills/role/:roleId

given:
  - cto Role에 2개 스킬 장착됨
when:
  - GET /api/skills/role/cto
then:
  - response: 스킬 ID 배열, 길이 2
```

---

## TC-5: 태스크 실행 (Job)

### TC-5.1: 태스크 할당 — Job 생성

```yaml
id: TC-5.1
level: API
endpoint: POST /api/jobs

given:
  - pm Role 존재, 엔진 설정됨
when:
  - POST /api/jobs {
      type: "assign",
      roleId: "pm",
      task: "Say hello",
      sourceRole: "ceo"
    }
then:
  - response.jobId: 문자열 (UUID 형태)
  - status: 200
```

### TC-5.2: Job 목록 조회

```yaml
id: TC-5.2
level: API
endpoint: GET /api/jobs

given:
  - 1개 이상의 Job 존재
when:
  - GET /api/jobs
then:
  - response.jobs: 배열
  - 각 항목에 id, roleId, task, status, createdAt 포함
```

### TC-5.3: Job 목록 — 상태 필터

```yaml
id: TC-5.3
level: API
endpoint: GET /api/jobs?status=running

given:
  - running Job 1개, done Job 2개
when:
  - GET /api/jobs?status=running
then:
  - response.jobs: 길이 1, 모두 status="running"
```

### TC-5.4: Job 상세 조회

```yaml
id: TC-5.4
level: API
endpoint: GET /api/jobs/:id

given:
  - 완료된 Job
when:
  - GET /api/jobs/{jobId}
then:
  - response.id: jobId
  - response.status: "done"
  - response.output: 문자열
  - response.completedAt: ISO 날짜
```

### TC-5.5: Job 스트림 (SSE)

```yaml
id: TC-5.5
level: SSE
endpoint: GET /api/jobs/:id/stream

given:
  - 실행 중인 Job
when:
  - GET /api/jobs/{jobId}/stream (EventSource)
then:
  - activity 이벤트 수신 (type, data, seq)
  - 작업 완료 시 stream:end 이벤트 수신
  - seq는 단조 증가
```

### TC-5.6: Job 스트림 — from 파라미터로 이력 재전송

```yaml
id: TC-5.6
level: SSE
endpoint: GET /api/jobs/:id/stream?from=0

given:
  - 5개 이벤트가 이미 발생한 Job
when:
  - GET /api/jobs/{jobId}/stream?from=0
then:
  - seq 0부터 모든 이벤트 재전송
  - 이후 실시간 이벤트도 계속 수신
```

### TC-5.7: Job 이력 조회

```yaml
id: TC-5.7
level: API
endpoint: GET /api/jobs/:id/history

given:
  - 완료된 Job (이벤트 5개)
when:
  - GET /api/jobs/{jobId}/history
then:
  - response.events: 길이 5
  - 이벤트 순서 보장 (seq 순)
```

### TC-5.8: Job 중단 (Abort)

```yaml
id: TC-5.8
level: API
endpoint: DELETE /api/jobs/:id

given:
  - 실행 중인 Job
when:
  - DELETE /api/jobs/{jobId}
then:
  - response.ok: true
  - 이후 GET /api/jobs/{jobId} → status: "error" 또는 중단됨
  - SSE 스트림에 stream:end 이벤트
```

### TC-5.9: 실행 상태 폴링

```yaml
id: TC-5.9
level: API
endpoint: GET /api/exec/status

given:
  - pm이 작업 중, cto는 idle
when:
  - GET /api/exec/status
then:
  - response.statuses.pm: "working"
  - response.statuses.cto: "idle"
  - response.activeExecutions: pm 작업 포함
```

---

## TC-6: Dispatch (작업 전파)

### TC-6.1: 유효한 Dispatch 검증

```yaml
id: TC-6.1
level: API
endpoint: POST /api/engine/dispatch/validate

given:
  - CTO → PM 관계 존재 (PM은 CTO 하위)
when:
  - POST /api/engine/dispatch/validate {
      sourceRole: "cto",
      targetRole: "pm"
    }
then:
  - response.canDispatch: true
```

### TC-6.2: 권한 없는 Dispatch 검증

```yaml
id: TC-6.2
level: API
endpoint: POST /api/engine/dispatch/validate

given:
  - Engineer는 PM의 상위가 아님
when:
  - POST /api/engine/dispatch/validate {
      sourceRole: "engineer",
      targetRole: "pm"
    }
then:
  - response.canDispatch: false
  - response.reason: 권한 없음 사유
```

### TC-6.3: Dispatch 실행 — CTO → PM

```yaml
id: TC-6.3
level: SSE + Live
endpoint: POST /api/jobs (Haiku)

given:
  - CTO, PM Role 존재, Direct API 엔진
when:
  - POST /api/jobs {
      roleId: "cto",
      task: "PM에게 현재 프로젝트 상태를 물어봐",
      sourceRole: "ceo"
    }
then:
  - SSE 이벤트에 dispatch 이벤트 포함 (targetRole: "pm")
  - PM 실행 결과가 CTO 응답에 포함됨
  - Job 완료 시 tokens.input > 0, tokens.output > 0
  - TokenLedger에 CTO + PM 각각 기록됨
```

### TC-6.4: Dispatch — 순환 감지

```yaml
id: TC-6.4
level: API (MockProvider)
endpoint: runAgentLoop 직접 호출

given:
  - CTO → PM → CTO 순환 dispatch 시도
when:
  - CTO가 PM에게 dispatch → PM이 CTO에게 dispatch
then:
  - 두 번째 dispatch 결과: "[DISPATCH BLOCKED] Circular dispatch detected"
```

### TC-6.5: Dispatch — 깊이 제한

```yaml
id: TC-6.5
level: API (MockProvider)
endpoint: runAgentLoop 직접 호출

given:
  - depth=3에서 dispatch 시도
when:
  - runAgentLoop({ depth: 3, ... })
then:
  - 즉시 반환: "[DISPATCH BLOCKED] Max dispatch depth (3) exceeded"
```

---

## TC-7: Wave (전사 지시)

### TC-7.1: Wave 실행

```yaml
id: TC-7.1
level: SSE
endpoint: POST /api/exec/wave

given:
  - CTO → PM, Engineer 조직 구조
when:
  - POST /api/exec/wave {
      directive: "각자 현재 상태를 보고하라",
      targetRole: "cto"
    }
then:
  - response.jobId 반환
  - SSE 이벤트에 CTO 실행 → 하위 Role dispatch 포함
```

---

## TC-8: Session (대화)

### TC-8.1: 세션 생성

```yaml
id: TC-8.1
level: API
endpoint: POST /api/sessions

given:
  - cto Role 존재
when:
  - POST /api/sessions { roleId: "cto", mode: "talk" }
then:
  - response.id: UUID
  - response.roleId: "cto"
  - response.mode: "talk"
  - response.messages: []
```

### TC-8.2: 세션 목록 조회

```yaml
id: TC-8.2
level: API
endpoint: GET /api/sessions

given:
  - 2개 세션 존재
when:
  - GET /api/sessions
then:
  - response: 길이 2 배열
  - 각 항목에 id, roleId, mode, title, messageCount 포함
```

### TC-8.3: 세션 상세 조회 (메시지 포함)

```yaml
id: TC-8.3
level: API
endpoint: GET /api/sessions/:id

given:
  - 메시지 3개 있는 세션
when:
  - GET /api/sessions/{id}
then:
  - response.messages: 길이 3
  - 메시지에 id, from, content, type, status 포함
```

### TC-8.4: 세션 메시지 전송 (SSE) — Talk 모드

```yaml
id: TC-8.4
level: SSE + Live
endpoint: POST /api/exec/session/:id/message

given:
  - cto Talk 세션 존재, Direct API 엔진
when:
  - POST /api/exec/session/{id}/message {
      content: "현재 아키텍처 상태는?",
      mode: "talk"
    }
then:
  - SSE 이벤트 순서: session → output(반복) → done
  - session 이벤트에 ceoMessageId, roleMessageId 포함
  - output 이벤트에 text 포함 (스트리밍 조각)
  - done 이벤트에 output, turns, tokens 포함
  - 세션 메시지에 CEO 메시지 + Role 응답 추가됨
```

### TC-8.5: 세션 메시지 전송 — Do 모드

```yaml
id: TC-8.5
level: SSE + Live
endpoint: POST /api/exec/session/:id/message

given:
  - engineer Do 세션 존재
when:
  - POST /api/exec/session/{id}/message {
      content: "test.ts 파일 생성해",
      mode: "do"
    }
then:
  - SSE에 tool 이벤트 포함 가능 (write 도구 호출)
  - done 이벤트에 output 포함
```

### TC-8.6: 세션 제목/모드 수정

```yaml
id: TC-8.6
level: API
endpoint: PATCH /api/sessions/:id

given:
  - 세션 존재
when:
  - PATCH /api/sessions/{id} { title: "아키텍처 리뷰", mode: "do" }
then:
  - response.title: "아키텍처 리뷰"
  - response.mode: "do"
```

### TC-8.7: 세션 삭제

```yaml
id: TC-8.7
level: API
endpoint: DELETE /api/sessions/:id

given:
  - 세션 존재
when:
  - DELETE /api/sessions/{id}
then:
  - response.ok: true
  - GET /api/sessions → 해당 세션 미포함
```

### TC-8.8: 빈 세션 일괄 삭제

```yaml
id: TC-8.8
level: API
endpoint: DELETE /api/sessions?empty=true

given:
  - 빈 세션 2개 + 메시지 있는 세션 1개
when:
  - DELETE /api/sessions?empty=true
then:
  - response.deleted: 2
  - GET /api/sessions → 길이 1 (메시지 있는 것만 잔존)
```

---

## TC-9: Knowledge 관리

### TC-9.1: Knowledge 목록 조회

```yaml
id: TC-9.1
level: API
endpoint: GET /api/knowledge

given:
  - knowledge/ 디렉토리에 문서 3개
when:
  - GET /api/knowledge
then:
  - response: 길이 >= 1 배열
  - 각 항목에 id, title, category, tldr 포함
```

### TC-9.2: Knowledge 문서 생성

```yaml
id: TC-9.2
level: API
endpoint: POST /api/knowledge

given:
  - knowledge/ 디렉토리 존재
when:
  - POST /api/knowledge {
      filename: "test-doc",
      title: "Test Document",
      category: "tech",
      content: "# Test\nHello world"
    }
then:
  - response.id: "test-doc.md" 경로
  - 디스크: knowledge/test-doc.md 생성됨
  - frontmatter에 title, category 포함
```

### TC-9.3: Knowledge 문서 조회

```yaml
id: TC-9.3
level: API
endpoint: GET /api/knowledge/:path

given:
  - test-doc.md 존재
when:
  - GET /api/knowledge/test-doc.md
then:
  - response.title: "Test Document"
  - response.content: markdown 내용
  - response.format: "md"
```

### TC-9.4: Knowledge 문서 수정

```yaml
id: TC-9.4
level: API
endpoint: PUT /api/knowledge/:path

given:
  - test-doc.md 존재
when:
  - PUT /api/knowledge/test-doc.md { content: "# Updated\nNew content" }
then:
  - response.status: "updated"
  - GET /api/knowledge/test-doc.md → content에 "New content" 포함
  - frontmatter 보존됨
```

### TC-9.5: Knowledge 문서 삭제

```yaml
id: TC-9.5
level: API
endpoint: DELETE /api/knowledge/:path

given:
  - test-doc.md 존재
when:
  - DELETE /api/knowledge/test-doc.md
then:
  - response.status: "deleted"
  - 디스크: knowledge/test-doc.md 삭제됨
  - GET /api/knowledge → "test-doc.md" 미포함
```

---

## TC-10: Project 조회

### TC-10.1: 프로젝트 목록 조회

```yaml
id: TC-10.1
level: API
endpoint: GET /api/projects

given:
  - projects/projects.md에 프로젝트 등록됨
when:
  - GET /api/projects
then:
  - response: 배열
  - 각 항목에 id, name, status 포함
```

### TC-10.2: 프로젝트 상세 조회

```yaml
id: TC-10.2
level: API
endpoint: GET /api/projects/:id

given:
  - "the-company-platform" 프로젝트 존재
when:
  - GET /api/projects/the-company-platform
then:
  - response.prd: PRD 마크다운 내용
  - response.tasks: 태스크 배열 (id, title, role, status)
```

---

## TC-11: Operations 조회

### TC-11.1: Standup 목록

```yaml
id: TC-11.1
level: API
endpoint: GET /api/operations/standups

given:
  - operations/standup/ 에 날짜별 파일 존재
when:
  - GET /api/operations/standups
then:
  - response: 배열 (날짜 내림차순)
  - 각 항목에 date, content 포함
```

### TC-11.2: Wave 목록

```yaml
id: TC-11.2
level: API
endpoint: GET /api/operations/waves

given:
  - operations/waves/ 에 Wave 기록 존재
when:
  - GET /api/operations/waves
then:
  - response: 배열 (타임스탬프 내림차순)
```

### TC-11.3: Decision 목록

```yaml
id: TC-11.3
level: API
endpoint: GET /api/operations/decisions

given:
  - operations/decisions/ 에 결정 문서 존재
when:
  - GET /api/operations/decisions
then:
  - response: 배열
  - 각 항목에 id, title, date 포함
```

---

## TC-12: Context Engine

### TC-12.1: 컨텍스트 미리보기

```yaml
id: TC-12.1
level: API
endpoint: GET /api/engine/context/:roleId

given:
  - cto Role 존재
when:
  - GET /api/engine/context/cto?task=test&source=ceo
then:
  - response.targetRole: "cto"
  - response.sourceRole: "ceo"
  - response.systemPromptLength: > 0
  - response.systemPromptPreview: 문자열 (프롬프트 일부)
```

### TC-12.2: Ask 모드 (읽기 전용 질문)

```yaml
id: TC-12.2
level: API + Live
endpoint: POST /api/engine/ask/:roleId

given:
  - pm Role 존재, Direct API 엔진
when:
  - POST /api/engine/ask/pm {
      question: "현재 프로젝트 몇 개야?",
      sourceRole: "ceo"
    }
then:
  - response.answer: 문자열 (답변)
  - response.turns: >= 1
  - response.tokens: > 0
```

---

## TC-13: Token & Cost 추적

### TC-13.1: 단일 Job 토큰 기록

```yaml
id: TC-13.1
level: Live (Haiku)
endpoint: runAgentLoop 직접

given:
  - TokenLedger 초기화됨, Haiku 모델
when:
  - runAgentLoop({ roleId: "pm", task: "Say ok", tokenLedger, model: haiku })
then:
  - result.totalTokens.input > 0
  - result.totalTokens.output > 0
  - ledger.query().entries.length == 1
  - ledger.query().entries[0].model == "claude-haiku-4-5-20251001"
```

### TC-13.2: Dispatch 시 하위 Role 토큰 분리 기록

```yaml
id: TC-13.2
level: Live (Haiku)
endpoint: runAgentLoop 직접

given:
  - CTO → PM dispatch 가능한 조직, TokenLedger
when:
  - CTO에게 "PM에게 상태 물어봐" 지시
then:
  - ledger.query({ roleId: "cto" }).entries.length >= 1
  - ledger.query({ roleId: "pm" }).entries.length >= 1
  - 전체 totalInput = CTO토큰 + PM토큰
```

### TC-13.3: estimateCost 정확성

```yaml
id: TC-13.3
level: Unit
endpoint: estimateCost() 직접

given:
  - Haiku 단가: $0.80/1M in, $4.00/1M out
when:
  - estimateCost(1_000_000, 1_000_000, "claude-haiku-4-5-20251001")
then:
  - result: 4.80 (오차 0.01 이내)
```

### TC-13.4: Ledger 쿼리 — 날짜 필터

```yaml
id: TC-13.4
level: Unit
endpoint: TokenLedger.query()

given:
  - 3/7 기록 2건, 3/8 기록 1건
when:
  - ledger.query({ from: "2026-03-08", to: "2026-03-08" })
then:
  - entries.length == 1
  - totalInput == 3/8 기록의 inputTokens
```

### TC-13.5: Ledger 쿼리 — Role 필터

```yaml
id: TC-13.5
level: Unit
endpoint: TokenLedger.query()

given:
  - cto 2건, pm 1건 기록됨
when:
  - ledger.query({ roleId: "cto" })
then:
  - entries.length == 2
```

### TC-13.6: SSE done 이벤트에 토큰 포함

```yaml
id: TC-13.6
level: SSE
endpoint: GET /api/jobs/:id/stream

given:
  - Direct API 모드로 Job 실행
when:
  - Job 완료까지 SSE 수신
then:
  - done 이벤트 또는 최종 activity 이벤트에 tokens 포함
  - tokens.input > 0
  - tokens.output > 0
```

---

## TC-14: 에러 & 엣지 케이스

### TC-14.1: 미초기화 상태에서 API 호출

```yaml
id: TC-14.1
level: API
endpoint: GET /api/roles

given:
  - COMPANY_ROOT 미설정 (서버만 실행)
when:
  - GET /api/roles
then:
  - status: 500 또는 빈 배열
  - 크래시하지 않음
```

### TC-14.2: 잘못된 JSON body

```yaml
id: TC-14.2
level: API
endpoint: POST /api/engine/roles

given:
  - 서버 실행 중
when:
  - POST /api/engine/roles (body: "not json")
then:
  - status: 400
  - 크래시하지 않음
```

### TC-14.3: 동시 다발적 Job 실행

```yaml
id: TC-14.3
level: API
endpoint: POST /api/jobs (x3 동시)

given:
  - 3개 Role 존재
when:
  - 동시에 3개 Job 생성 (cto, pm, engineer)
then:
  - 모든 Job에 고유한 jobId 부여
  - GET /api/exec/status → 3개 모두 "working"
  - 각 Job 독립적으로 완료
```

### TC-14.4: 실행 중 세션 삭제

```yaml
id: TC-14.4
level: API
endpoint: DELETE /api/sessions/:id

given:
  - 세션에서 메시지 스트리밍 중
when:
  - DELETE /api/sessions/{id}
then:
  - 세션 삭제 성공 또는 적절한 에러
  - 서버 크래시하지 않음
```

### TC-14.5: 빈 태스크로 Job 생성

```yaml
id: TC-14.5
level: API
endpoint: POST /api/jobs

given:
  - 서버 실행 중
when:
  - POST /api/jobs { type: "assign", roleId: "pm", task: "" }
then:
  - status: 400
  - response.error: "task is required" 또는 유사
```

### TC-14.6: 존재하지 않는 Role에 태스크 할당

```yaml
id: TC-14.6
level: API
endpoint: POST /api/jobs

given:
  - "ghost" Role 없음
when:
  - POST /api/jobs { type: "assign", roleId: "ghost", task: "test" }
then:
  - status: 404 또는 400
  - 적절한 에러 메시지
```

---

## TC-15: 통합 시나리오 (End-to-End Flows)

### TC-15.1: 전체 온보딩 → 첫 태스크 실행

```yaml
id: TC-15.1
level: E2E
flow:
  1. POST /api/setup/detect-engine → recommended 확인
  2. POST /api/setup/scaffold { companyName: "E2E Co", team: "startup" }
  3. GET /api/status → initialized: true
  4. GET /api/roles → 3개 Role 확인
  5. POST /api/jobs { roleId: "pm", task: "Say hello" }
  6. GET /api/jobs/{id}/stream → SSE 이벤트 수신
  7. GET /api/jobs/{id} → status: "done", output 존재

then:
  - 전체 흐름 에러 없이 완료
  - 1~7 순차 실행 성공
```

### TC-15.2: Role 생성 → 태스크 할당 → 삭제

```yaml
id: TC-15.2
level: E2E
flow:
  1. POST /api/engine/roles { id: "qa", name: "QA", reportsTo: "cto" }
  2. GET /api/engine/org → qa in cto.children
  3. POST /api/sessions { roleId: "qa" }
  4. POST /api/exec/session/{id}/message { content: "Hello" }
  5. SSE done 수신
  6. DELETE /api/engine/roles/qa
  7. GET /api/roles → qa 미포함

then:
  - 전체 생명주기 정상 동작
```

### TC-15.3: Talk → Do 모드 전환

```yaml
id: TC-15.3
level: SSE + Live
flow:
  1. POST /api/sessions { roleId: "cto", mode: "talk" }
  2. POST /api/exec/session/{id}/message { content: "아키텍처 어때?", mode: "talk" }
  3. done 이벤트 수신 (readOnly 실행)
  4. PATCH /api/sessions/{id} { mode: "do" }
  5. POST /api/exec/session/{id}/message { content: "README.md 만들어", mode: "do" }
  6. done 이벤트 수신 (write 실행 가능)

then:
  - Talk: tool 이벤트 없음 (read-only)
  - Do: tool 이벤트 가능 (write 도구 호출)
```

### TC-15.4: 비용 추적 전체 흐름

```yaml
id: TC-15.4
level: Live (Haiku)
flow:
  1. POST /api/setup/scaffold (API 키 포함)
  2. POST /api/jobs { roleId: "cto", task: "인사해" }
  3. Job 완료 대기
  4. TokenLedger JSONL 파일 확인
  5. ledger.query() → entries 존재
  6. estimateCost() → $0 초과
  7. API 응답 형태로 byRole 집계

then:
  - 토큰 기록 → 비용 환산 → 집계 전체 파이프라인 정상
```

### TC-15.5: 멀티 세션 동시 사용

```yaml
id: TC-15.5
level: API
flow:
  1. POST /api/sessions { roleId: "cto" } → session1
  2. POST /api/sessions { roleId: "pm" } → session2
  3. GET /api/sessions → 길이 2
  4. 각 세션에 메시지 전송
  5. GET /api/sessions/{session1} → messages 존재
  6. GET /api/sessions/{session2} → messages 존재
  7. DELETE /api/sessions?empty=true → 삭제 0 (둘 다 메시지 있음)

then:
  - 세션 격리 확인 (메시지 섞이지 않음)
```

---

## 자동화 구현 가이드

### 테스트 러너 구조

```
tests/
├── unit/                   # 기존 94개 (MockProvider)
├── integration/            # 기존 18개 (MockProvider + HTTP)
├── live/                   # API 키 필요 (env-gated)
│   └── cost-tracking.test.ts  # 3개 (완료)
└── e2e/                    # supertest + 전체 서버
    ├── setup.e2e.test.ts       # TC-1.*
    ├── roles.e2e.test.ts       # TC-3.*
    ├── skills.e2e.test.ts      # TC-4.*
    ├── jobs.e2e.test.ts        # TC-5.*
    ├── sessions.e2e.test.ts    # TC-8.*
    ├── knowledge.e2e.test.ts   # TC-9.*
    ├── dispatch.e2e.test.ts    # TC-6.*
    ├── cost.e2e.test.ts        # TC-13.*
    ├── edge-cases.e2e.test.ts  # TC-14.*
    └── flows.e2e.test.ts       # TC-15.*
```

### E2E 테스트 헬퍼

```typescript
// tests/e2e/helpers.ts
import { createApp } from '../../src/create-server.js';
import supertest from 'supertest';

export async function createTestServer() {
  const tmpRoot = fs.mkdtempSync(...);
  process.env.COMPANY_ROOT = tmpRoot;
  const app = createApp();
  return { app: supertest(app), root: tmpRoot, cleanup: () => ... };
}

export async function scaffoldAndInit(app, options?) {
  await app.post('/api/setup/scaffold').send({ companyName: 'Test', ...options });
}
```

### SSE 테스트 헬퍼

```typescript
// tests/e2e/sse-helper.ts
export function collectSSEEvents(response): Promise<SSEEvent[]> {
  return new Promise((resolve) => {
    const events: SSEEvent[] = [];
    // 파싱 로직...
    response.on('end', () => resolve(events));
  });
}
```

### 실행 명령

```bash
# Unit + Integration (MockProvider, 빠름)
npm test

# E2E (supertest, 서버 기동, MockProvider)
npx vitest run tests/e2e/

# Live (실제 Haiku API, 느림)
ANTHROPIC_API_KEY=... npx vitest run --config vitest.live.config.ts

# 전체
ANTHROPIC_API_KEY=... npx vitest run --config vitest.all.config.ts
```

---

## 테스트 케이스 요약

| 카테고리 | 테스트 수 | Level |
|---------|----------|-------|
| TC-1: 온보딩 | 10 | API + SSE |
| TC-2: 회사/조직 조회 | 4 | API |
| TC-3: Role 관리 | 10 | API |
| TC-4: Skill 관리 | 5 | API |
| TC-5: Job 실행 | 9 | API + SSE |
| TC-6: Dispatch | 5 | API + SSE + Live |
| TC-7: Wave | 1 | SSE |
| TC-8: Session | 8 | API + SSE |
| TC-9: Knowledge | 5 | API |
| TC-10: Project | 2 | API |
| TC-11: Operations | 3 | API |
| TC-12: Context Engine | 2 | API + Live |
| TC-13: Token/Cost | 6 | Unit + Live |
| TC-14: 에러/엣지 | 6 | API |
| TC-15: E2E 시나리오 | 5 | E2E + Live |
| **총계** | **81** | |

---

*작성: CTO | 2026-03-07*
