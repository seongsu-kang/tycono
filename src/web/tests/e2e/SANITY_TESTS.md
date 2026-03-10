# Web Sanity Tests

> Playwright 기반 UI 동작 검증 체크리스트
> 최종 검증: 2026-03-08 (6명 Preset M + 13명 Preset L 전환 검증)

**실행 환경**: Vite dev server (`npx vite --port 5174`) + 브라우저
**도구**: Playwright MCP 또는 수동 브라우저

---

## TC-P: Page Load

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-P01 | 페이지 로드 | HUD bar (company name, budget, energy, roles count, projects count) 표시 | PASS |
| TC-P02 | CARD 뷰 기본 | LEADERSHIP, TEAM, OFFICE 섹션 렌더링 | PASS |
| TC-P03 | Role 카드 렌더링 | 각 Role 카드에 이름, 레벨, 캐릭터, 활동 상태 표시 | PASS |
| TC-P04 | Facility 카드 렌더링 | Meeting Room, Bulletin, Decisions, Knowledge 4개 카드 표시 | PASS |

---

## TC-V: View Toggle

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-V01 | CARD -> ISO 전환 | ISO 버튼 클릭 -> 4방 오피스 캔버스 렌더링 | PASS |
| TC-V02 | ISO -> CARD 전환 | CARD 버튼 클릭 -> 카드 레이아웃 복귀 | PASS |
| TC-V03 | ISO 뷰 4방 확인 | 최소 Preset M: exec/work/meet/comm 4개 방 렌더링 | PASS |
| TC-V04 | ISO 캐릭터 표시 | 모든 Role이 데스크에 앉아있거나 이동 중 | PASS |
| TC-V05 | ISO 이름 라벨 | 각 캐릭터 아래 ROLE_ID 라벨 표시 | PASS |
| TC-V06 | ISO 시설 라벨 | MEETING, BULLETIN, DECISIONS, KNOWLEDGE 라벨 표시 + 클릭 가능 | PASS |
| TC-V07 | ISO 말풍선 | 캐릭터가 간헐적으로 speech bubble 표시 | PASS |
| TC-V08 | ISO + HIRE 버튼 | 우하단 "+ HIRE" 버튼 표시 | PASS |

---

## TC-H: Hire New Role

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-H01 | CARD에서 고용 모달 열기 | "HIRE NEW ROLE" 카드 클릭 -> Step 1 모달 | PASS |
| TC-H02 | ISO에서 고용 모달 열기 | "+ HIRE" 버튼 클릭 -> Step 1 모달 | PASS |
| TC-H03 | Step 1: 기본 정보 | Role Name 입력 -> ID 자동 생성 (slug) | PASS |
| TC-H04 | Step 1: Level 선택 | C-Level / Team Lead / Member 버튼 토글 | PASS |
| TC-H05 | Step 1: Reports To | 드롭다운에 기존 Role 목록 표시 (신규 포함) | PASS |
| TC-H06 | Step 1: Next 활성화 | Name 비어있으면 Next 비활성, 입력하면 활성 | PASS |
| TC-H07 | Step 2: Persona | 텍스트 입력 -> Next 활성화 | PASS |
| TC-H08 | Step 3: 캐릭터 에디터 | LOOK/OUTFIT/ACCESSORY 탭 전환 | PASS |
| TC-H09 | Step 3: LOOK 탭 | Skin (10), Hair Color (16), Hair Style (8) 선택 가능 | PASS |
| TC-H10 | Step 3: OUTFIT 탭 | Style (10), TOP/PANTS/SHOES 색상 선택 가능 | PASS |
| TC-H11 | Step 3: ACCESSORY 탭 | None + 30개 악세사리 선택 가능 | PASS |
| TC-H12 | Step 3: RANDOM | 랜덤 외형 생성 | PASS |
| TC-H13 | Step 3: 캐릭터 프리뷰 | 실시간 픽셀 캐릭터 미리보기 업데이트 | PASS |
| TC-H14 | Step 4: Review | Name, ID, Level, Reports To, Persona 확인 + 캐릭터 프리뷰 | PASS |
| TC-H15 | HIRE 실행 | HIRE 버튼 -> 모달 닫힘 + toast "X hired!" | PASS |
| TC-H16 | 고용 후 Roles 카운트 | HUD Roles 숫자 +1 증가 | PASS |
| TC-H17 | 고용 후 CARD 반영 | TEAM 섹션에 새 Role 카드 추가 | PASS |
| TC-H18 | 고용 후 ISO 반영 | ISO 뷰에 새 캐릭터 + 라벨 추가 | PASS |
| TC-H19 | 연속 고용 | 3회 이상 연속 고용 -> 모두 정상 반영 | PASS |
| TC-H20 | 고용 후 데스크 카운트 | "Expand: +N desks available" 숫자 감소 | PASS |
| TC-H21 | Back 버튼 | 각 단계에서 Back -> 이전 단계 복귀, 입력 유지 | - |
| TC-H22 | Cancel 버튼 | 어느 단계에서든 Cancel -> 모달 닫힘, 고용 안됨 | - |

---

## TC-O: Office ISO Interaction

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-O01 | 캐릭터 클릭 | ISO 캔버스에서 캐릭터 클릭 -> Role 사이드 패널 열림 | PASS |
| TC-O02 | MEETING 클릭 | 시설 라벨 클릭 -> Project 패널 열림 | - |
| TC-O03 | BULLETIN 클릭 | 시설 라벨 클릭 -> Bulletin Board 패널 (Standups/Waves 탭) | PASS |
| TC-O04 | DECISIONS 클릭 | 시설 라벨 클릭 -> Decision Log 패널 | PASS |
| TC-O05 | KNOWLEDGE 클릭 | 시설 라벨 클릭 -> Knowledge 패널 | - |
| TC-O06 | 캐릭터 hover | 마우스 오버 시 커서 pointer + 하이라이트 | - |
| TC-O07 | 캐릭터 이동 | 일정 시간 후 sitting -> walking -> 다른 방 -> 복귀 | PASS |
| TC-O08 | 동적 데스크 배치 | N명 고용 시 N개 데스크 자동 생성 (방별 분배) | PASS |

---

## TC-R: Role Side Panel

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-R01 | 패널 열기 | Role 카드 클릭 -> 사이드 패널 열림 | PASS |
| TC-R02 | 패널 닫기 | X 버튼 -> 패널 닫힘 | PASS |
| TC-R03 | 기본 정보 표시 | Role ID, Name, Level, Status, Reports To | PASS |
| TC-R04 | 캐릭터 프리뷰 | 패널 상단 캐릭터 픽셀아트 표시 | PASS |
| TC-R05 | 커스터마이즈 버튼 | 팔레트 아이콘 클릭 -> 캐릭터 에디터 | - |
| TC-R06 | 인라인 이름 편집 | 이름 옆 편집 아이콘 클릭 -> 편집 모드 | - |
| TC-R07 | Talk/Do 탭 | Talk/Do 탭 전환 + 입력 필드 | PASS |
| TC-R08 | Profile/Authority 접기 | 아코디언 토글 | - |
| TC-R09 | Fire Role | Fire Role 버튼 표시 | PASS |

---

## TC-T: Terminal

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-T01 | 터미널 열기 | TERMINAL 버튼 -> 터미널 패널 표시 | PASS |
| TC-T02 | 터미널 닫기 | 다시 클릭 -> 터미널 닫힘 | PASS |
| TC-T03 | 기본 상태 | #office 탭 + "No active session" 메시지 | PASS |

---

## TC-F: Floor Template (Dynamic Layout)

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-F01 | 최소 4방 | 1~12명: Preset M (4방, 288x208) | PASS |
| TC-F02 | 동적 데스크 수 | N명 -> N개 데스크 생성 | PASS |
| TC-F03 | 시설 항상 배치 | Meeting/Bulletin/Decisions/Knowledge 시설 4개 방에 배치 | PASS |
| TC-F04 | Preset L 전환 | 13명 이상 -> Preset L (360x260) | PASS |
| TC-F05 | 캔버스 크기 동적 | 프리셋 변경 시 캔버스 크기 조정 | PASS |
| TC-F06 | 가구/장식 렌더링 | 벽 장식 (창문, 시계, 그림, 선반), 바닥 가구 (책장, 화분, 소파, 커피머신) | PASS |
| TC-F07 | 조건부 가구 렌더링 | 데스크 있는 방은 대형 가구 (회의탁자/소파) 숨김 | PASS |

---

## TC-PRO: Pro View (Slack-style)

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-PRO01 | PRO 뷰 진입 | 하단바 PRO 버튼 클릭 -> 전체화면 오버레이 (사이드바 240px + 메인 영역) | PASS |
| TC-PRO02 | Dashboard 기본 | Dashboard 타이틀 + Quick Actions (New Wave, Knowledge) + Team 카드 + Recent Waves + Knowledge Base | PASS |
| TC-PRO03 | 사이드바 CHANNELS | general, wave-log, decisions, knowledge 4개 채널 표시 | PASS |
| TC-PRO04 | 사이드바 TEAM | 전체 Role 목록 (아바타 + 이름 + Lv + 상태 dot) 표시 | PASS |
| TC-PRO05 | 팀원 클릭 → DM 채팅 | 사이드바 팀원 클릭 -> 메인 영역에 DM 채팅 뷰 (MessageList + Talk/Do + InputBar) | PASS |
| TC-PRO06 | DM 빈 상태 | 세션 없는 Role 클릭 -> 캐릭터 아바타 + "Start a conversation" + InputBar | PASS |
| TC-PRO07 | DM 헤더 | 아바타 + Role Name + Level 정보 + Profile 버튼 + Dashboard 버튼 | PASS |
| TC-PRO08 | Profile 패널 열기 | 헤더 Profile 버튼 클릭 -> 오른쪽 340px 프로필 패널 표시 | PASS |
| TC-PRO09 | Profile 패널 내용 | 큰 아바타 + Role ID + Name + Lv/상태/level/reportsTo 스탯바 + About + Authority + Direct Reports + Relationships + Journal | PASS |
| TC-PRO10 | Profile 패널 닫기 | × 버튼 또는 Profile 버튼 재클릭 -> 패널 닫힘, 채팅 유지 | PASS |
| TC-PRO11 | 팀원 전환 | 다른 팀원 클릭 -> 채팅 + 프로필 모두 해당 Role로 전환 | PASS |
| TC-PRO12 | 채널 전환 (general) | general 클릭 -> TerminalPanel 렌더링 | - |
| TC-PRO13 | 채널 전환 (wave-log) | wave-log 클릭 -> WaveCenter 렌더링 | - |
| TC-PRO14 | 채널 전환 (decisions) | decisions 클릭 -> OperationsPanel 렌더링 | - |
| TC-PRO15 | 채널 전환 (knowledge) | knowledge 클릭 -> KnowledgePanel 렌더링 | - |
| TC-PRO16 | Office 복귀 | 하단 Office 버튼 클릭 -> 이전 뷰 모드(CARD/ISO)로 복귀 | PASS |
| TC-PRO17 | 패널 최대화 → PRO | Office 사이드 패널 ⤢ 버튼 클릭 -> PRO 뷰로 전환 + 해당 채널 활성화 | - |
| TC-PRO18 | 드래그 최대화 → PRO | Office 사이드 패널을 뷰포트 60% 이상 드래그 -> PRO 뷰 자동 전환 | - |

---

## TC-S: Save / Persistence

| ID | 테스트 | 검증 항목 | 상태 |
|----|--------|----------|------|
| TC-S01 | Save indicator | 하단바 "Saved Xm ago" 표시 | PASS |
| TC-S02 | Date button | HUD 날짜 버튼 클릭 -> Save 모달 | - |

---

## 테스트 결과 요약

| 그룹 | 전체 | PASS | 미검증 |
|------|------|------|--------|
| Page Load (TC-P) | 4 | 4 | 0 |
| View Toggle (TC-V) | 8 | 8 | 0 |
| Hire (TC-H) | 22 | 20 | 2 |
| Office ISO (TC-O) | 8 | 6 | 2 |
| Role Panel (TC-R) | 9 | 6 | 3 |
| Terminal (TC-T) | 3 | 3 | 0 |
| Floor Template (TC-F) | 7 | 7 | 0 |
| Pro View (TC-PRO) | 18 | 11 | 7 |
| Save (TC-S) | 2 | 1 | 1 |
| **합계** | **81** | **66** | **15** |

---

## 실행 방법

```bash
# 1. Vite dev server 기동
cd src/web && npx vite --port 5174

# 2. Playwright MCP로 테스트 (Claude Code 내)
# browser_navigate -> http://localhost:5174
# 각 TC 단계를 순서대로 실행

# 3. 수동 테스트 시
# 브라우저에서 http://localhost:5174 접속
# 이 문서의 체크리스트를 따라 검증
```

### 주의사항

- API 서버 없이도 대부분의 UI 테스트 가능 (로컬 상태 기반)
- `/api/skills` 404 에러는 무시 가능 (API 서버 미기동 시 발생)
- ISO 뷰의 overlay 라벨은 애니메이션 때문에 ref가 불안정 -> `document.querySelector` 사용 권장
- 연속 고용 테스트 시 토스트가 이전 것과 겹칠 수 있음

---

*작성: CTO | 2026-03-08*
*관련: [test-strategy](../../../knowledge/test-strategy.md) | [floor-template](../../src/components/office/floor-template.ts)*
