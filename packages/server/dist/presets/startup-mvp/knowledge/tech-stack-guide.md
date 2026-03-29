---
title: "Tech Stack Guide for MVP"
akb_type: node
status: active
tags: ["tech-stack", "mvp", "architecture", "tools"]
domain: engineering
---

# Tech Stack Guide — Choosing Tech for Your MVP

> "For an MVP, the selection criteria is: 'Can we build it fast and change it easily?'"

## TL;DR

- **Principle**: Familiar > Trendy, Simple > Powerful
- **Recommended**: Full-stack JS/TS (React + Node) or Firebase/Supabase
- **Avoid**: Microservices, Kubernetes, complex infrastructure

---

## 1. Tech Selection Principles

### 1.1 MVP Stage Priorities

```
     Dev speed        ████████████████████  (Top priority)
     Simplicity       ████████████████
     Familiarity      ██████████████
     Scalability      ██████████
     Cutting edge     ████
     Perfect arch     ██
```

### 1.2 Decision Checklist

| Question | Selection Criteria |
|----------|-------------------|
| Does the team know it well? | ✅ Yes → Choose it |
| Can learn in 2 weeks? | ⚠️ Yes → Consider |
| Takes 1+ months to learn? | ❌ Not suitable for MVP |

---

## 2. Recommended Stacks

### 2.1 Ultra-Fast MVP (1-2 weeks)

**BaaS (Backend-as-a-Service) based**

```
┌────────────────────────────────────────┐
│  Frontend: React / Next.js / Vue       │
│  Backend:  Firebase / Supabase         │
│  DB:       Firestore / PostgreSQL      │
│  Auth:     Built-in                    │
│  Hosting:  Vercel / Netlify            │
└────────────────────────────────────────┘
```

**Pros**:
- No infrastructure management
- Auth/DB/storage ready out of the box
- Can start on the free tier

**Best for**:
- 1-2 person teams
- CRUD-focused apps
- When fast validation is the top priority

### 2.2 Balanced MVP (2-4 weeks)

**Full-stack JS/TS**

```
┌────────────────────────────────────────┐
│  Frontend: React + Vite                │
│  Backend:  Node.js + Express/Fastify   │
│  DB:       PostgreSQL + Prisma         │
│  Auth:     Clerk / Auth0 / NextAuth    │
│  Hosting:  Vercel / Railway / Render   │
└────────────────────────────────────────┘
```

**Pros**:
- Unified language (JS/TS)
- Customization flexibility
- Minimal refactoring when scaling

**Best for**:
- 2-4 person teams
- Custom logic needed
- Complex business rules

### 2.3 Alternative: Python/Django

```
┌────────────────────────────────────────┐
│  Frontend: React / HTMX                │
│  Backend:  Django / FastAPI            │
│  DB:       PostgreSQL                  │
│  Auth:     Django Auth / FastAPI-Users │
│  Hosting:  Railway / Render / Fly.io   │
└────────────────────────────────────────┘
```

**Best for**:
- Team is experienced in Python
- Data/ML work involved
- Need admin panel (Django Admin)

---

## 3. Component Selection Guide

### 3.1 Frontend

| Option | Learning Curve | MVP Speed | Recommendation |
|--------|---------------|-----------|----------------|
| **React + Vite** | Medium | ⭐⭐⭐⭐ | ✅ Most versatile |
| **Next.js** | Medium | ⭐⭐⭐⭐⭐ | ✅ When SSR needed |
| Vue 3 | Easy | ⭐⭐⭐⭐ | If team prefers it |
| Svelte | Easy | ⭐⭐⭐⭐ | If team prefers it |
| HTMX | Easy | ⭐⭐⭐⭐⭐ | For simple interactions |

### 3.2 Backend

| Option | Learning Curve | MVP Speed | Recommendation |
|--------|---------------|-----------|----------------|
| **Firebase** | Easy | ⭐⭐⭐⭐⭐ | ✅ Fastest |
| **Supabase** | Easy | ⭐⭐⭐⭐⭐ | ✅ If you prefer SQL |
| Express.js | Easy | ⭐⭐⭐⭐ | When custom logic needed |
| FastAPI | Easy | ⭐⭐⭐⭐ | If you prefer Python |
| Django | Medium | ⭐⭐⭐ | When admin panel needed |
| Rails | Medium | ⭐⭐⭐⭐ | If you prefer Ruby |

### 3.3 Database

| Option | Type | MVP Recommendation |
|--------|------|--------------------|
| **PostgreSQL** | SQL | ✅ Most versatile, free |
| SQLite | SQL | Prototypes, local dev |
| Firestore | NoSQL | When using Firebase |
| MongoDB | NoSQL | When schema is uncertain |

### 3.4 Authentication

| Option | Setup Time | Recommendation |
|--------|-----------|----------------|
| **Clerk** | 30 min | ✅ Easiest |
| Auth0 | 1 hour | Enterprise-ready |
| NextAuth | 2 hours | When using Next.js |
| Firebase Auth | 30 min | When using Firebase |
| Supabase Auth | 30 min | When using Supabase |

### 3.5 Deployment

| Option | Free Tier | Difficulty | Recommendation |
|--------|-----------|-----------|----------------|
| **Vercel** | ✅ | Very easy | ✅ Next.js/React |
| **Netlify** | ✅ | Very easy | Static sites |
| **Railway** | ✅ (credits) | Easy | ✅ Full-stack |
| Render | ✅ | Easy | Full-stack |
| Fly.io | ✅ | Medium | Global deployment |
| AWS/GCP | ❌ | Hard | ⚠️ Overkill for MVP |

---

## 4. What to Avoid

### 4.1 Don't Do This at MVP Stage

| ❌ Don't | Why |
|----------|-----|
| Microservices | Over-engineering for a 2-3 person team |
| Kubernetes | Wasting time on infrastructure |
| Custom auth | Security vulnerabilities, time waste |
| Learning a new language | Speed is critical at this stage |
| Perfect CI/CD | Can do it later |
| Bleeding-edge frameworks | Limited references, more bugs |

### 4.2 Acceptable Technical Debt

```
Acceptable at MVP stage:
  ✅ Hardcoded config values
  ✅ Some code duplication
  ✅ Incomplete error handling
  ✅ No tests (except critical path)
  ✅ Single DB, single server

Never acceptable, even at MVP stage:
  ❌ Storing passwords in plaintext
  ❌ SQL injection vulnerabilities
  ❌ APIs without authentication
  ❌ Logging personal information
```

---

## 5. Decision Flowchart

```
Start
  │
  ├─ "Need to launch in 2 weeks?" ── Yes ──▶ Firebase/Supabase
  │                                          + React/Next.js
  │
  No
  │
  ├─ "Team are Python experts?" ──── Yes ──▶ FastAPI/Django
  │                                          + React or HTMX
  │
  No
  │
  ├─ "SSR/SEO important?" ────────── Yes ──▶ Next.js + API Routes
  │                                          or + Express
  │
  No
  │
  └─ Default recommendation ────────────▶ React + Vite
                                          + Express/Fastify
                                          + PostgreSQL
                                          + Vercel/Railway
```

---

## Related Documents

- [MVP Checklist](./mvp-checklist.md) — Pre-launch checklist
- [Lean Startup](./lean-startup.md) — Validation methodology

---

*Preset: startup-mvp v1.0.0 | Tycono Official*
