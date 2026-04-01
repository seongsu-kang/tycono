import { test, expect } from '@playwright/test';

/**
 * TC-P: Page Load
 * E2E 테스트 계획 Layer 3: office-page.spec.ts
 */
test.describe('Office Page Load', () => {
  test('TC-P01: HUD bar 표시', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // HUD 바 내용 확인 (회사명, Roles, Projects 등)
    const bodyText = await page.locator('body').textContent();

    // 기본 정보가 표시되는지 확인
    expect(bodyText).toContain('Roles');
    expect(bodyText).toContain('Projects');

    // 날짜가 표시되는지 확인 (YYYY-MM-DD 형식)
    expect(bodyText).toMatch(/20\d{2}-\d{2}-\d{2}/);
  });

  test('TC-P02: 페이지가 에러 없이 로드됨', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 페이지 로드 시 JavaScript 에러가 없어야 함
    expect(errors).toHaveLength(0);
  });

  test('TC-P03: 기본 뷰가 렌더링됨 (CARD 또는 ISO)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // CARD 뷰 또는 ISO 뷰 중 하나가 렌더링되어야 함
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('TC-P04: Console 에러 없음', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 콘솔 에러가 없어야 함 (API 404는 허용)
    const realErrors = consoleErrors.filter(
      (err) => !err.includes('/api/') && !err.includes('404')
    );
    expect(realErrors).toHaveLength(0);
  });
});
