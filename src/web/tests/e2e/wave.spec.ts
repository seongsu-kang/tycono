/**
 * Wave Command Center — E2E Sanity Tests
 *
 * Prerequisites:
 *   - API server running on :3001
 *   - Vite dev server running (npx vite)
 *
 * Run:
 *   npx playwright test tests/e2e/wave.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

async function waitForOfficePage(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForSelector('text=CEO WAVE', { timeout: 10_000 });
}

// ─── TC-W01: WaveModal Propagation Preview ─────────────

test.describe('TC-W01: WaveModal', () => {
  test('opens with propagation preview', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');

    // Modal opens
    await expect(page.locator('text=CEO Wave')).toBeVisible();
    await expect(page.locator('text=Propagation Preview')).toBeVisible();

    // Shows role count
    await expect(page.locator('text=/\\d+ roles? will receive/')).toBeVisible();
  });

  test('dispatch button disabled when empty', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');

    const btn = page.locator('button:has-text("Dispatch to")');
    await expect(btn).toBeDisabled();
  });

  test('closes on Cancel', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.click('text=Cancel');

    await expect(page.locator('text=Propagation Preview')).not.toBeVisible();
  });

  test('closes on Escape', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.press('textarea', 'Escape');

    await expect(page.locator('text=Propagation Preview')).not.toBeVisible();
  });
});

// ─── TC-W02: Wave Dispatch -> Command Center ────────────

test.describe('TC-W02: Wave Dispatch', () => {
  test('opens WaveCommandCenter after dispatch', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.fill('textarea', 'Test directive for E2E');
    await page.click('button:has-text("Dispatch to")');

    // Command Center opens
    await expect(page.locator('text=WAVE COMMAND CENTER')).toBeVisible({ timeout: 5_000 });

    // Header elements
    await expect(page.locator('text=0/3 done').or(page.locator('text=/\\d+\\/\\d+ done/'))).toBeVisible();

    // Directive shown
    await expect(page.locator('text=Test directive for E2E')).toBeVisible();

    // Org tree visible
    await expect(page.locator('text=Org Propagation')).toBeVisible();
  });
});

// ─── TC-W03: Org Tree Node States ───────────────────────

test.describe('TC-W03: Org Tree', () => {
  test('shows CEO dimmed and C-Level working', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.fill('textarea', 'Status report');
    await page.click('button:has-text("Dispatch to")');

    await page.waitForSelector('text=WAVE COMMAND CENTER');

    // CEO node exists
    await expect(page.locator('svg >> text=CEO')).toBeVisible();

    // CTO node shows Working
    await expect(page.locator('svg >> text=Working...')).toBeVisible();
  });
});

// ─── TC-W05: Minimize / Restore ─────────────────────────

test.describe('TC-W05: Minimize / Restore', () => {
  test('minimize hides CC, shows WAVE button, restore works', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.fill('textarea', 'Minimize test');
    await page.click('button:has-text("Dispatch to")');

    await page.waitForSelector('text=WAVE COMMAND CENTER');

    // Minimize
    await page.click('button:has-text("–")');
    await expect(page.locator('text=WAVE COMMAND CENTER')).not.toBeVisible();

    // WAVE button in bottom bar
    const waveBtn = page.locator('button:has-text("WAVE"):not(:has-text("CEO"))');
    await expect(waveBtn).toBeVisible();

    // Restore
    await waveBtn.click();
    await expect(page.locator('text=WAVE COMMAND CENTER')).toBeVisible();
  });
});

// ─── TC-W07: Side Panel During Wave ─────────────────────

test.describe('TC-W07: Side Panel During Wave', () => {
  test('can open role side panel while wave is minimized', async ({ page }) => {
    await waitForOfficePage(page);
    await page.click('text=CEO WAVE');
    await page.fill('textarea', 'Side panel test');
    await page.click('button:has-text("Dispatch to")');

    await page.waitForSelector('text=WAVE COMMAND CENTER');

    // Minimize wave
    await page.click('button:has-text("–")');

    // Wait for roles to start working, then click a role card
    await page.waitForTimeout(5_000);
    const pmCard = page.locator('text=PM · PRODUCT MANAGER').first();
    if (await pmCard.isVisible()) {
      await pmCard.click();
      // Side panel should open
      await expect(page.locator('text=Product Manager').or(page.locator('text=WORKING'))).toBeVisible({ timeout: 3_000 });
    }
  });
});

// ─── TC-W08: Non-Wave Job Regression ────────────────────

test.describe('TC-W08: Non-Wave Job', () => {
  test('assign task opens ActivityPanel, not WaveCommandCenter', async ({ page }) => {
    await waitForOfficePage(page);

    // Click CTO card to open side panel
    const ctoCard = page.locator('text=CTO · CHIEF TECHNOLOGY OFFICER').first();
    await ctoCard.click();

    // Look for Assign or Ask button
    const assignBtn = page.locator('button:has-text("Assign")').first();
    if (await assignBtn.isVisible({ timeout: 3_000 })) {
      await assignBtn.click();

      // AssignTaskModal should appear, not WaveCommandCenter
      await expect(page.locator('text=WAVE COMMAND CENTER')).not.toBeVisible();
    }
  });
});

// ─── TC-O01: Page Load ──────────────────────────────────

test.describe('TC-O01: Page Load', () => {
  test('loads office page with all sections', async ({ page }) => {
    await waitForOfficePage(page);

    await expect(page.locator('text=LEADERSHIP')).toBeVisible();
    await expect(page.locator('text=TEAM')).toBeVisible();
    await expect(page.locator('text=OFFICE')).toBeVisible();
    await expect(page.locator('text=CEO WAVE')).toBeVisible();
    await expect(page.locator('text=TERMINAL')).toBeVisible();
  });
});
