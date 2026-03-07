/**
 * Save System — E2E Sanity Tests
 *
 * Tests:
 *   TC-S01: HUD Save Indicator
 *   TC-S02: SaveModal Save Tab
 *   TC-S03: SaveModal History Tab
 *   TC-S04: Bottom Bar Save Status
 *   TC-S05: Keyboard Shortcut (Cmd+S)
 *   TC-S06: Preferences Persistence (API-level)
 *
 * Prerequisites:
 *   - API server running on :3001
 *   - Vite dev server running (npx vite) on :5173
 *
 * Run:
 *   npx playwright test tests/e2e/save.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

async function waitForOfficePage(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForSelector('text=CEO WAVE', { timeout: 10_000 });
}

// ─── TC-S01: HUD Save Indicator ─────────────────────────

test.describe('TC-S01: HUD Save Indicator', () => {
  test('save indicator visible in top bar with date', async ({ page }) => {
    await waitForOfficePage(page);

    // Top bar has a button containing today's date (save indicator)
    const today = new Date().toISOString().slice(0, 10);
    const saveBtn = page.locator(`button:has-text("${today}")`);
    await expect(saveBtn).toBeVisible();
  });

  test('save indicator has status dot', async ({ page }) => {
    await waitForOfficePage(page);

    // The save button contains a dot (span with border-radius 50%)
    const today = new Date().toISOString().slice(0, 10);
    const saveBtn = page.locator(`button:has-text("${today}")`);
    const dot = saveBtn.locator('span').first();
    await expect(dot).toBeVisible();
  });

  test('clicking save indicator opens SaveModal', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);

    await expect(page.locator('text=SAVE GAME')).toBeVisible();
  });
});

// ─── TC-S02: SaveModal Save Tab ──────────────────────────

test.describe('TC-S02: SaveModal Save Tab', () => {
  test('modal has correct structure', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);

    // Header
    await expect(page.locator('text=SAVE GAME')).toBeVisible();

    // Tabs — use exact match to avoid "SAVE & PUSH" collision
    await expect(page.getByRole('button', { name: 'SAVE', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'HISTORY', exact: true })).toBeVisible();

    // Status text — either "unsaved changes" or "All changes saved" inside modal
    const modalBody = page.locator('text=SAVE GAME').locator('xpath=ancestor::div[contains(@class,"fixed")]').last();
    const status = modalBody.locator('text=/unsaved change|All changes saved/').first();
    await expect(status).toBeVisible();
  });

  test('shows changed files when dirty', async ({ page }) => {
    await waitForOfficePage(page);

    // Check if dirty by looking at API
    const statusRes = await page.request.get('/api/save/status');
    const status = await statusRes.json();

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);

    if (status.dirty) {
      // Changed Files section visible
      await expect(page.locator('text=Changed Files')).toBeVisible();
      // Save action button visible ("SAVE & PUSH" or "SAVE")
      await expect(page.locator('button:has-text("SAVE & PUSH"), button:has-text("SAVE"):not(:has-text("HISTORY"))').last()).toBeVisible();
    } else {
      await expect(page.locator('text=All changes saved')).toBeVisible();
    }
  });

  test('closes on Escape', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);
    await expect(page.locator('text=SAVE GAME')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('text=SAVE GAME')).not.toBeVisible();
  });

  test('closes on close button click', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);
    await expect(page.locator('text=SAVE GAME')).toBeVisible();

    // Close button is the sibling of SAVE GAME header text, containing ×
    // It's inside the modal (z-61), so it won't be blocked by backdrop
    const modal = page.locator('[class*="z-[61]"]');
    const closeBtn = modal.locator('button').filter({ hasText: '\u00d7' });
    await closeBtn.click();
    await expect(page.locator('text=SAVE GAME')).not.toBeVisible();
  });
});

// ─── TC-S03: SaveModal History Tab ───────────────────────

test.describe('TC-S03: SaveModal History Tab', () => {
  test('switches to history tab and shows commits', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);

    // Click History tab
    await page.click('button:has-text("HISTORY")');

    // Should show commit entries (short sha) or "No save history"
    const hasHistory = await page.locator('text=/[a-f0-9]{7}/').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const noHistory = await page.locator('text=No save history').isVisible({ timeout: 1_000 }).catch(() => false);

    expect(hasHistory || noHistory).toBeTruthy();
  });

  test('LOAD button appears on hover', async ({ page }) => {
    await waitForOfficePage(page);

    const today = new Date().toISOString().slice(0, 10);
    await page.click(`button:has-text("${today}")`);
    await page.click('button:has-text("HISTORY")');

    // Wait for history to load
    await page.waitForTimeout(1_000);

    // Scope to the modal (z-61), then find the group (commit row) inside it
    const modal = page.locator('[class*="z-[61]"]');
    const commitGroup = modal.locator('.group').first();
    if (await commitGroup.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await commitGroup.hover();
      await expect(modal.locator('button:has-text("LOAD")').first()).toBeVisible({ timeout: 3_000 });
    }
  });
});

// ─── TC-S04: Bottom Bar Save Status ─────────────────────

test.describe('TC-S04: Bottom Bar Save Status', () => {
  test('shows save status text in bottom bar', async ({ page }) => {
    await waitForOfficePage(page);

    // Bottom bar should contain save status (Saved / unsaved)
    // Wait for save status to load (30s poll, but initial fetch on mount)
    await page.waitForTimeout(2_000);

    const bottomBar = page.locator('[style*="border-top: 3px solid"]');
    const statusText = bottomBar.locator('text=/Saved|unsaved/');
    await expect(statusText).toBeVisible({ timeout: 5_000 });
  });
});

// ─── TC-S05: Keyboard Shortcut ──────────────────────────

test.describe('TC-S05: Keyboard Shortcut', () => {
  test('Cmd+S opens SaveModal when dirty', async ({ page }) => {
    await waitForOfficePage(page);

    // Check if dirty
    const statusRes = await page.request.get('/api/save/status');
    const status = await statusRes.json();

    if (status.dirty) {
      await page.keyboard.press('Meta+s');
      await expect(page.locator('text=SAVE GAME')).toBeVisible({ timeout: 3_000 });
    }
  });

  test('Ctrl+S opens SaveModal when dirty', async ({ page }) => {
    await waitForOfficePage(page);

    const statusRes = await page.request.get('/api/save/status');
    const status = await statusRes.json();

    if (status.dirty) {
      await page.keyboard.press('Control+s');
      await expect(page.locator('text=SAVE GAME')).toBeVisible({ timeout: 3_000 });
    }
  });
});

// ─── TC-S06: Preferences Persistence (API) ──────────────

test.describe('TC-S06: Preferences API', () => {
  test('GET /api/preferences returns valid structure', async ({ page }) => {
    const res = await page.request.get('/api/preferences');
    expect(res.ok()).toBeTruthy();

    const prefs = await res.json();
    expect(prefs).toHaveProperty('appearances');
    expect(prefs).toHaveProperty('theme');
    expect(typeof prefs.theme).toBe('string');
  });

  test('PATCH /api/preferences updates theme', async ({ page }) => {
    // Get current
    const before = await (await page.request.get('/api/preferences')).json();

    // Patch theme
    const res = await page.request.patch('/api/preferences', {
      data: { theme: 'cyberpunk' },
    });
    expect(res.ok()).toBeTruthy();

    const after = await res.json();
    expect(after.theme).toBe('cyberpunk');

    // Restore original
    await page.request.patch('/api/preferences', {
      data: { theme: before.theme },
    });
  });

  test('PATCH /api/preferences updates appearances', async ({ page }) => {
    const testAppearance = {
      skinColor: '#FF0000',
      hairColor: '#00FF00',
      shirtColor: '#0000FF',
      pantsColor: '#FFFF00',
      shoeColor: '#FF00FF',
    };

    const res = await page.request.patch('/api/preferences', {
      data: { appearances: { 'test-role': testAppearance } },
    });
    expect(res.ok()).toBeTruthy();

    const after = await res.json();
    expect(after.appearances['test-role']).toEqual(testAppearance);

    // Cleanup
    const current = await (await page.request.get('/api/preferences')).json();
    delete current.appearances['test-role'];
    await page.request.put('/api/preferences', { data: current });
  });
});

// ─── TC-S07: Save API ───────────────────────────────────

test.describe('TC-S07: Save API', () => {
  test('GET /api/save/status returns valid structure', async ({ page }) => {
    const res = await page.request.get('/api/save/status');
    expect(res.ok()).toBeTruthy();

    const status = await res.json();
    expect(status).toHaveProperty('dirty');
    expect(status).toHaveProperty('modified');
    expect(status).toHaveProperty('untracked');
    expect(status).toHaveProperty('branch');
    expect(status).toHaveProperty('hasRemote');
    expect(status).toHaveProperty('synced');
    expect(status).toHaveProperty('noGit');
    expect(typeof status.dirty).toBe('boolean');
    expect(typeof status.noGit).toBe('boolean');
    expect(Array.isArray(status.modified)).toBeTruthy();
    expect(Array.isArray(status.untracked)).toBeTruthy();
  });

  test('GET /api/save/history returns array of commits', async ({ page }) => {
    const res = await page.request.get('/api/save/history?limit=5');
    expect(res.ok()).toBeTruthy();

    const history = await res.json();
    expect(Array.isArray(history)).toBeTruthy();

    if (history.length > 0) {
      expect(history[0]).toHaveProperty('sha');
      expect(history[0]).toHaveProperty('shortSha');
      expect(history[0]).toHaveProperty('message');
      expect(history[0]).toHaveProperty('date');
    }
  });

  test('POST /api/save returns 400 when nothing to save', async ({ page }) => {
    const statusRes = await page.request.get('/api/save/status');
    const status = await statusRes.json();

    if (!status.dirty) {
      const res = await page.request.post('/api/save', { data: { message: 'test' } });
      expect(res.status()).toBe(400);
    }
  });
});
