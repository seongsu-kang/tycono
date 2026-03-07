# Web E2E Sanity Tests

> Wave Command Center + Core Office 기능의 수동/자동 sanity test 케이스

---

## Prerequisites

- API server running on `:3001`
- Vite dev server running (`npx vite`)
- At least 1 C-Level role (CTO) and 2+ sub-roles (PM, Engineer) in org

---

## TC-W: Wave Command Center

### TC-W01: WaveModal - Propagation Preview

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "CEO WAVE" button in bottom bar | WaveModal opens with backdrop |
| 2 | Check "Propagation Preview" section | Org tree shows CEO -> C-Level (direct) -> sub-roles (via re-dispatch) |
| 3 | Check role count | "N roles will receive this wave" matches total org size minus CEO |
| 4 | Leave directive empty | "Dispatch to N Role" button is disabled |
| 5 | Type directive, click Cancel | Modal closes, no wave dispatched |
| 6 | Press Escape | Modal closes |

### TC-W02: Wave Dispatch -> Command Center Opens

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open WaveModal, type directive | Directive textarea populated |
| 2 | Click "Dispatch to N Role" (or Cmd+Enter) | Modal closes |
| 3 | Check screen | WaveCommandCenter opens (960px, centered, z-61) |
| 4 | Check header | "WAVE COMMAND CENTER" + elapsed timer + "0/N done" badge |
| 5 | Check directive | Directive text shown below header in italic |

### TC-W03: Org Tree - Real-time Node Status

| Step | Action | Expected |
|------|--------|----------|
| 1 | After dispatch, check left panel | CEO node: dimmed, dashed border |
| 2 | Check C-Level nodes | Status "Working...", role-color border, pulsing dot |
| 3 | Check sub-role nodes (before dispatch) | Status "Waiting", grey border, grey dot |
| 4 | Wait for C-Level to dispatch to sub-roles | Sub-role nodes transition to "Working..." with color border |
| 5 | Wait for job completion | Completed nodes show green border + checkmark |
| 6 | Check not-dispatched nodes | Dashed border, no status text |

### TC-W04: Activity Feed - Node Selection

| Step | Action | Expected |
|------|--------|----------|
| 1 | Default selection | First root job role (C-Level) is selected |
| 2 | Right panel shows | Role header (ID + name + status badge) + event stream |
| 3 | Click different node in org tree | Right panel switches to that role's events |
| 4 | Check event types visible | job:start, thinking, text, tool:start, dispatch:start, job:done |
| 5 | Check dispatch:start events | Shows "-> ROLEID" box with task text + "View ->" |
| 6 | Click dispatch:start "View" | Selects the child role node in org tree |
| 7 | Check streaming indicator | Green cursor blinks while role is running |

### TC-W05: Minimize / Restore

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click minimize button (--) | Command Center disappears, office view visible |
| 2 | Check bottom bar | Red "WAVE" button appears (pulsing) |
| 3 | Check office view | Working roles show yellow border + task text on cards |
| 4 | Click "WAVE" button | Command Center restores with all events preserved |
| 5 | Check timer | Elapsed time continued (not reset) |
| 6 | Check node states | Same as before minimize |

### TC-W06: Wave Complete State

| Step | Action | Expected |
|------|--------|----------|
| 1 | Wait for all jobs to finish | Header changes to "WAVE COMPLETE" |
| 2 | Check header dot | Green (not red) |
| 3 | Check progress badge | "N/N done" |
| 4 | Check close button | X button appears in header |
| 5 | Check footer | Green "Close" button appears |
| 6 | Click Close | Command Center closes, toast "Wave complete" shown |
| 7 | Check backdrop click | Backdrop click also closes when complete |

### TC-W07: Side Panel During Wave

| Step | Action | Expected |
|------|--------|----------|
| 1 | Minimize wave (or before dispatch) | Office view visible |
| 2 | Click a working role card | Side panel opens |
| 3 | Check side panel | Shows "WORKING" badge, elapsed timer, task text |
| 4 | Check Activity section | Shows event summary (thinking xN, Read, Bash, etc.) |
| 5 | Check "View details" button | Opens full activity panel for that job |
| 6 | Check "Stop" button | Present and clickable |
| 7 | Close side panel, click WAVE | Command Center restores correctly |

### TC-W08: Non-Wave Job (Regression)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click a role card, click "Assign" or "Ask" | AssignTaskModal opens |
| 2 | Submit task | ActivityPanel opens (NOT WaveCommandCenter) |
| 3 | Check ActivityPanel | Standard modal layout (720px, single job view) |
| 4 | Check drill-down | dispatch:start click -> jobStack push -> back button works |
| 5 | Check minimize/restore | Standard job indicator in bottom bar |

---

## TC-O: Office Core

### TC-O01: Page Load

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to / | Loading spinner briefly, then office view |
| 2 | Check top bar | Company name, budget, roles count, projects count |
| 3 | Check LEADERSHIP section | C-Level role cards |
| 4 | Check TEAM section | Sub-role cards + "HIRE NEW ROLE" card |
| 5 | Check OFFICE section | Meeting Room, Bulletin, Decisions, Knowledge |
| 6 | Check bottom bar | CARD/ISO toggle, theme, CEO WAVE, TERMINAL |

### TC-O02: Role Side Panel

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click any role card | Side panel slides in from right |
| 2 | Check header | Role icon, name (editable), level, status, reports-to |
| 3 | Check sections | Profile, Authority, Fire Role |
| 4 | Click X | Side panel closes |

### TC-O03: View Toggle

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "ISO" button | Switches to isometric office view |
| 2 | Check desks | Role desks with sprites, monitors, labels |
| 3 | Click "CARD" button | Switches back to card view |

### TC-O04: Terminal

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "TERMINAL" | Terminal panel opens from right |
| 2 | Check resize | Drag handle works |
| 3 | Click "TERMINAL" again | Terminal closes |

---

## TC-S: Save System

### TC-S01: HUD Save Indicator

| Step | Action | Expected |
|------|--------|----------|
| 1 | Load office page | Save indicator visible in top bar (dot + date) |
| 2 | Check dot color | Green dot (synced) or yellow dot (dirty) |
| 3 | Click save indicator | SaveModal opens |

### TC-S02: SaveModal - Save Tab

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open SaveModal (click HUD save button) | Modal opens with "SAVE GAME" header |
| 2 | Check tabs | "SAVE" and "HISTORY" tabs visible |
| 3 | Check status | Shows unsaved count or "All changes saved" |
| 4 | Check changed files list | Shows M/A status + file paths (if dirty) |
| 5 | Type save message | Input accepts text |
| 6 | Click "SAVE & PUSH" (or "SAVE") | Saving indicator, then success message |
| 7 | Press Escape | Modal closes |

### TC-S03: SaveModal - History Tab

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open SaveModal, click "HISTORY" tab | History tab activates |
| 2 | Check commit list | Shows shortSha, message, time ago |
| 3 | Hover commit row | "LOAD" button appears |
| 4 | Click "LOAD" | Confirmation dialog appears |

### TC-S04: Bottom Bar Save Status

| Step | Action | Expected |
|------|--------|----------|
| 1 | Check bottom bar (after theme) | Shows "Saved Xm ago" or "N unsaved" |
| 2 | After save | Status changes to "Saved just now" |

### TC-S05: Keyboard Shortcut (Cmd+S)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Press Cmd+S (or Ctrl+S) with dirty files | SaveModal opens |
| 2 | Press Cmd+S with no dirty files | Nothing happens (no modal) |

### TC-S06: Preferences Persistence

| Step | Action | Expected |
|------|--------|----------|
| 1 | Change character appearance | Appearance updates visually |
| 2 | Check API call | PATCH /api/preferences sent |
| 3 | Clear localStorage, reload page | Appearance restored from server |
| 4 | Change theme | Theme updates, PATCH /api/preferences sent |

---

## Automation Plan

### Phase 1: Playwright Script (Manual Trigger)

```bash
# Future: npx playwright test tests/e2e/wave.spec.ts
```

Each TC above maps to a `test()` block. Key patterns:
- `page.goto()` + `page.waitForSelector()` for load
- `page.click()` + `page.fill()` for interaction
- `page.locator().textContent()` + `expect()` for assertions
- `page.screenshot()` for visual regression

### Phase 2: CI Integration

- Run on PR to `develop` branch
- Requires API server mock or test fixture
- Screenshot comparison for visual regression

### Phase 3: Visual Regression

- Percy or Playwright `toHaveScreenshot()` snapshots
- Baseline screenshots committed to repo
- Diff threshold: 0.1%

---

*Last updated: 2026-03-07*
