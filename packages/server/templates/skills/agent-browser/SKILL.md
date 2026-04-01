---
name: agent-browser
description: Browser automation for AI agents using agent-browser CLI. Token-efficient alternative to Playwright MCP with accessibility-first element selection.
---

# Agent Browser

Token-efficient browser automation CLI for AI agents. ~82% fewer tokens than Playwright MCP.

## Prerequisites

```bash
# Install globally (one-time)
npm install -g agent-browser

# Verify installation
agent-browser --version

# If not installed, the agent should run the install command above before proceeding.
```

## Quick Reference

```bash
# Install check
agent-browser --version

# Core flow: open → snapshot → action
agent-browser open <url>
agent-browser snapshot          # accessibility tree (@e1, @e2, ...)
agent-browser click @e3
agent-browser fill @e5 "text"
agent-browser screenshot /tmp/page.png
```

## Core Commands

| Command | Description |
|---------|-------------|
| `open <url>` | Open a page |
| `snapshot` | Return accessibility tree + element refs |
| `click <@ref>` | Click an element |
| `fill <@ref> <text>` | Fill an input field |
| `type <@ref> <text>` | Type text (preserves existing) |
| `press <key>` | Press key (Enter, Tab, Control+a) |
| `screenshot [path]` | Take screenshot |
| `pdf <path>` | Save as PDF |
| `wait <sel\|ms>` | Wait for element or time |
| `scroll <dir> [px]` | Scroll (up/down/left/right) |
| `close` | Close browser |

## Element Selection

Accessibility tree `@ref` is the default:

```bash
agent-browser snapshot
# Output example:
# @e1 heading "Welcome"
# @e2 button "Login"
# @e3 textbox "Email"

agent-browser click @e2
agent-browser fill @e3 "user@example.com"
```

CSS selector and XPath also supported:
```bash
agent-browser click "#submit-btn"
agent-browser click "xpath=//button[@type='submit']"
```

## Find Elements

```bash
agent-browser find role button click         # Find by role and click
agent-browser find text "Submit" click       # Find by text
agent-browser find label "Email" fill "a@b.com"
agent-browser find testid "login-btn" click
```

## Get Info

```bash
agent-browser get text @e1       # Get text content
agent-browser get html @e1       # Get HTML
agent-browser get value @e3      # Get input value
agent-browser get url            # Current URL
agent-browser get title          # Page title
agent-browser get count "li"     # Element count
```

## State Check

```bash
agent-browser is visible @e1
agent-browser is enabled @e2
agent-browser is checked @e3
```

## Network

```bash
agent-browser network requests                    # List requests
agent-browser network route "*/api/*" --abort     # Block requests
agent-browser network route "*/api/*" --body '{}' # Mock response
agent-browser network unroute "*/api/*"
```

## Browser Settings

```bash
agent-browser set viewport 1280 720
agent-browser set device "iPhone 15"
agent-browser set media dark
agent-browser set offline on
```

## Workflow Patterns

### 1. Page Exploration

```bash
agent-browser open "http://localhost:3000"
agent-browser snapshot
# → Check @ref, then take action
agent-browser click @e5
agent-browser snapshot   # Verify state change
```

### 2. Form Filling

```bash
agent-browser open "http://localhost:3000/login"
agent-browser snapshot
agent-browser fill @e3 "user@example.com"
agent-browser fill @e4 "password123"
agent-browser click @e5   # submit button
agent-browser wait 2000
agent-browser screenshot /tmp/after-login.png
```

### 3. Verification

```bash
agent-browser open "http://localhost:3000"
agent-browser wait "h1"
agent-browser get text "h1"
agent-browser is visible "#success-message"
```

## When to Use

| Scenario | Recommended |
|----------|-------------|
| AI agent web browsing/verification | **agent-browser** (token efficient) |
| Complex E2E test suites | Playwright (richer API) |
| Advanced network interception | Playwright |
| Quick UI checks | **agent-browser** (simple CLI) |
