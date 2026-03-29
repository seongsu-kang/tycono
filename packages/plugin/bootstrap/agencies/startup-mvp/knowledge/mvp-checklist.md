---
title: "MVP Checklist"
akb_type: node
status: active
tags: ["mvp", "checklist", "launch", "quality"]
domain: engineering
---

# MVP Checklist — Pre-Launch Checklist

> "An MVP is 'minimum,' but it can't be 'broken.' The critical path must work perfectly."

## TL;DR

- **Principle**: Critical path must work 100%
- **Scope**: Secondary features < Core feature completeness
- **Bar**: "Good enough that your first 10 users won't give up"

---

## 1. MVP Completion Criteria

### 1.1 Defining "MVP"

```
MVP ≠ Buggy prototype
MVP = Minimum product that can validate core value

├── Core features: 100% working
├── Secondary features: Can skip
├── UI/UX: "Understandable" level
└── Performance: "Tolerable" level
```

### 1.2 Define the Critical Path

Before MVP launch, clearly define the "critical path":

```markdown
## Critical Path

1. User arrives at [entry point]
2. Performs [core action 1]
3. Performs [core action 2]
4. Experiences [value delivery moment]
5. (Optional) Returns or shares

Example — Note app:
1. Visit landing page
2. Sign up / Log in
3. Create new note
4. Save note and reopen it ← Value delivery
5. (Optional) Share note
```

---

## 2. Pre-Launch Checklist

### 2.1 Core Features (P0 — Must Have)

- [ ] **Full critical path works**: No breaks from start to value delivery
- [ ] **Sign up/login works**: Email or social login
- [ ] **Core action completable**: 1-2 main features of the app
- [ ] **Data persistence verified**: Data survives page refresh
- [ ] **Error messaging**: No blank screens or infinite loading

### 2.2 Usability (P1 — Recommended)

- [ ] **Clear next action on first screen**: CTA button or guidance
- [ ] **Critical path within 3 clicks**: Minimize steps to value
- [ ] **Loading indicators**: User knows something is happening
- [ ] **Basic mobile support**: Responsive or mobile-first (depending on target)
- [ ] **Error recovery**: Back button, retry possible

### 2.3 Trust & Security (P0 — Must Have)

- [ ] **HTTPS enabled**: SSL certificate
- [ ] **Password hashing**: Never store plaintext
- [ ] **Minimal personal data collection**: Only what's needed
- [ ] **Basic Terms of Service / Privacy Policy**: Even a template
- [ ] **Contact info visible**: Email or contact form

### 2.4 Measurement (P1 — Recommended)

- [ ] **Analytics tool installed**: GA4, Mixpanel, PostHog, etc.
- [ ] **Core event tracking**: Signup, core action, completion
- [ ] **Error monitoring**: Sentry or similar
- [ ] **Feedback collection method**: Email, chat, form

### 2.5 Operations (P2 — Optional)

- [ ] **Automated deployment**: GitHub → Vercel/Railway, etc.
- [ ] **Environment separation**: Dev / Production (at least DB)
- [ ] **Backups**: Auto DB backup (included with most BaaS)
- [ ] **Monitoring**: Server status, error rate

---

## 3. Quality vs Speed Matrix

### 3.1 What to Invest In / What to Skip at This Stage

| Area | Invest | Skip |
|------|--------|------|
| **Core features** | Must work perfectly | - |
| **Error handling** | Critical path only | Edge cases |
| **UI** | Understandable | Pretty |
| **Performance** | Tolerable (< 3 seconds) | Optimization |
| **Testing** | Manual test critical path | Automated tests |
| **Code quality** | Working first | Refactoring |
| **Documentation** | None | - |

### 3.2 Technical Debt Management

```
At MVP launch:
  ├── Core features: Minimal tech debt
  ├── Secondary features: Tech debt acceptable
  └── Infrastructure: Manual work acceptable

Within 2 weeks after launch:
  └── Document tech debt list (record in tasks.md)

After PMF is confirmed:
  └── Start refactoring
```

---

## 4. Launch Day Checklist

### 4.1 Pre-Deploy

- [ ] Test critical path in production environment
- [ ] Verify environment variables (API keys, DB URL, etc.)
- [ ] Confirm HTTPS is working
- [ ] Verify error monitoring is active

### 4.2 Post-Deploy

- [ ] Verify landing page loads
- [ ] Walk through signup → core action → completion flow
- [ ] Confirm analytics events are firing
- [ ] Notify first users (email, messages)

### 4.3 First 24 Hours

- [ ] Monitor error logs
- [ ] Open user feedback channel
- [ ] Fix critical bugs immediately
- [ ] Personally contact first 5 users

---

## 5. "Done" Criteria

### 5.1 When the MVP Is "Complete"

```
✅ Critical path works 100%
✅ First 10 users can reach value delivery moment
✅ Data collection possible (analytics + feedback)
✅ No critical security issues
✅ Contact info displayed

❌ Perfect UI/UX
❌ All edge cases handled
❌ 100% test coverage
❌ Perfect documentation
```

### 5.2 Go / No-Go Decision

| State | Decision |
|-------|----------|
| All P0 ✅, P1 80%+ ✅ | 🚀 **Go** |
| All P0 ✅, P1 50%+ ✅ | ⚠️ Go (with caution) |
| Any P0 ❌ | 🛑 **No-Go** |

---

## 6. First Week After Launch

### 6.1 Daily Checks

- [ ] New signups
- [ ] Core action completion rate
- [ ] Error count
- [ ] User feedback (chat, email)

### 6.2 First Week Goals

```
Targets:
  - 10+ signups
  - 5+ core action completions
  - 3+ pieces of feedback collected
  - 0 critical bugs

If met: Plan next cycle
If not met: Root cause analysis → Pivot or retry
```

---

## Related Documents

- [Lean Startup](./lean-startup.md) — Build-Measure-Learn methodology
- [Tech Stack Guide](./tech-stack-guide.md) — Tech selection guide

---

*Preset: startup-mvp v1.0.0 | Tycono Official*
