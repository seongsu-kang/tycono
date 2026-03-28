---
title: "Tech Stack Guide for MVP"
akb_type: node
status: active
tags: ["tech-stack", "mvp", "architecture", "tools"]
domain: engineering
---

# Tech Stack Guide — MVP를 위한 기술 선택

> "MVP에서 기술 선택의 기준은 '빠르게 만들고 쉽게 바꿀 수 있는가'다."

## TL;DR

- **원칙**: 익숙한 것 > 최신 것, 간단한 것 > 강력한 것
- **추천**: 풀스택 JS/TS (React + Node) 또는 Firebase/Supabase
- **피하라**: 마이크로서비스, Kubernetes, 복잡한 인프라

---

## 1. 기술 선택 원칙

### 1.1 MVP 단계의 우선순위

```
     개발 속도      ████████████████████  (최우선)
     단순함         ████████████████
     익숙함         ██████████████
     확장성         ██████████
     최신 기술      ████
     완벽한 아키텍처 ██
```

### 1.2 결정 체크리스트

| 질문 | 선택 기준 |
|------|----------|
| 팀이 잘 아는가? | ✅ 그렇다 → 선택 |
| 2주 내 배울 수 있나? | ⚠️ 그렇다 → 고려 |
| 1개월 이상 걸리나? | ❌ MVP 단계에 부적합 |

---

## 2. 추천 스택

### 2.1 초고속 MVP (1~2주)

**BaaS (Backend-as-a-Service) 기반**

```
┌────────────────────────────────────────┐
│  Frontend: React / Next.js / Vue       │
│  Backend:  Firebase / Supabase         │
│  DB:       Firestore / PostgreSQL      │
│  Auth:     Built-in                    │
│  Hosting:  Vercel / Netlify            │
└────────────────────────────────────────┘
```

**장점**:
- 인프라 관리 불필요
- 인증/DB/스토리지 즉시 사용
- 무료 티어로 시작 가능

**적합한 경우**:
- 1~2명 팀
- CRUD 중심 앱
- 빠른 검증이 최우선

### 2.2 균형잡힌 MVP (2~4주)

**풀스택 JS/TS**

```
┌────────────────────────────────────────┐
│  Frontend: React + Vite                │
│  Backend:  Node.js + Express/Fastify   │
│  DB:       PostgreSQL + Prisma         │
│  Auth:     Clerk / Auth0 / NextAuth    │
│  Hosting:  Vercel / Railway / Render   │
└────────────────────────────────────────┘
```

**장점**:
- 언어 통일 (JS/TS)
- 커스터마이징 자유도
- 확장 시 리팩토링 최소화

**적합한 경우**:
- 2~4명 팀
- 커스텀 로직 필요
- 복잡한 비즈니스 규칙

### 2.3 대안: Python/Django

```
┌────────────────────────────────────────┐
│  Frontend: React / HTMX                │
│  Backend:  Django / FastAPI            │
│  DB:       PostgreSQL                  │
│  Auth:     Django Auth / FastAPI-Users │
│  Hosting:  Railway / Render / Fly.io   │
└────────────────────────────────────────┘
```

**적합한 경우**:
- 팀이 Python에 익숙
- 데이터/ML 작업 포함
- 관리자 패널 필요 (Django Admin)

---

## 3. 컴포넌트별 선택 가이드

### 3.1 프론트엔드

| 옵션 | 학습 곡선 | MVP 속도 | 추천 |
|------|----------|----------|------|
| **React + Vite** | 중간 | ⭐⭐⭐⭐ | ✅ 가장 범용적 |
| **Next.js** | 중간 | ⭐⭐⭐⭐⭐ | ✅ SSR 필요 시 |
| Vue 3 | 쉬움 | ⭐⭐⭐⭐ | 팀이 선호하면 |
| Svelte | 쉬움 | ⭐⭐⭐⭐ | 팀이 선호하면 |
| HTMX | 쉬움 | ⭐⭐⭐⭐⭐ | 인터랙션 단순할 때 |

### 3.2 백엔드

| 옵션 | 학습 곡선 | MVP 속도 | 추천 |
|------|----------|----------|------|
| **Firebase** | 쉬움 | ⭐⭐⭐⭐⭐ | ✅ 가장 빠름 |
| **Supabase** | 쉬움 | ⭐⭐⭐⭐⭐ | ✅ SQL 선호 시 |
| Express.js | 쉬움 | ⭐⭐⭐⭐ | 커스텀 필요 시 |
| FastAPI | 쉬움 | ⭐⭐⭐⭐ | Python 선호 시 |
| Django | 중간 | ⭐⭐⭐ | 관리자 패널 필요 시 |
| Rails | 중간 | ⭐⭐⭐⭐ | Ruby 선호 시 |

### 3.3 데이터베이스

| 옵션 | 유형 | MVP 추천 |
|------|------|----------|
| **PostgreSQL** | SQL | ✅ 가장 범용적, 무료 |
| SQLite | SQL | 프로토타입, 로컬 개발 |
| Firestore | NoSQL | Firebase 사용 시 |
| MongoDB | NoSQL | 스키마 불확실할 때 |

### 3.4 인증

| 옵션 | 설정 시간 | 추천 |
|------|----------|------|
| **Clerk** | 30분 | ✅ 가장 쉬움 |
| Auth0 | 1시간 | 엔터프라이즈 준비 |
| NextAuth | 2시간 | Next.js 사용 시 |
| Firebase Auth | 30분 | Firebase 사용 시 |
| Supabase Auth | 30분 | Supabase 사용 시 |

### 3.5 배포

| 옵션 | 무료 티어 | 난이도 | 추천 |
|------|----------|--------|------|
| **Vercel** | ✅ | 매우 쉬움 | ✅ Next.js/React |
| **Netlify** | ✅ | 매우 쉬움 | 정적 사이트 |
| **Railway** | ✅ (크레딧) | 쉬움 | ✅ 풀스택 |
| Render | ✅ | 쉬움 | 풀스택 |
| Fly.io | ✅ | 중간 | 글로벌 배포 |
| AWS/GCP | ❌ | 어려움 | ⚠️ MVP에 과함 |

---

## 4. 피해야 할 것

### 4.1 MVP 단계에서 하지 말 것

| ❌ 하지 말 것 | 이유 |
|--------------|------|
| 마이크로서비스 | 2~3명 팀에 오버엔지니어링 |
| Kubernetes | 인프라 관리에 시간 낭비 |
| 커스텀 인증 구현 | 보안 취약점, 시간 낭비 |
| 새로운 언어 학습 | 속도가 핵심인 단계 |
| 완벽한 CI/CD | 나중에 해도 됨 |
| 최신 프레임워크 | 레퍼런스 부족, 버그 |

### 4.2 기술 부채 허용 범위

```
MVP 단계 허용:
  ✅ 하드코딩된 설정값
  ✅ 일부 코드 중복
  ✅ 불완전한 에러 핸들링
  ✅ 테스트 부재 (핵심 경로만)
  ✅ 단일 DB, 단일 서버

MVP 단계에서도 하면 안 되는 것:
  ❌ 비밀번호 평문 저장
  ❌ SQL 인젝션 취약점
  ❌ 인증 없는 API
  ❌ 개인정보 로깅
```

---

## 5. 결정 플로우차트

```
시작
  │
  ├─ "2주 안에 런칭해야 해?" ─── Yes ──▶ Firebase/Supabase
  │                                      + React/Next.js
  │
  No
  │
  ├─ "팀이 Python 전문가?" ──── Yes ──▶ FastAPI/Django
  │                                     + React or HTMX
  │
  No
  │
  ├─ "SSR/SEO 중요?" ────────── Yes ──▶ Next.js + API Routes
  │                                     또는 + Express
  │
  No
  │
  └─ 기본 추천 ─────────────────────▶ React + Vite
                                      + Express/Fastify
                                      + PostgreSQL
                                      + Vercel/Railway
```

---

## 관련 문서

- [MVP Checklist](./mvp-checklist.md) — 런칭 전 점검
- [Lean Startup](./lean-startup.md) — 검증 방법론

---

*Preset: startup-mvp v1.0.0 | Tycono Official*
