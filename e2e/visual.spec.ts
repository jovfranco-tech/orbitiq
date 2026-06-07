import { test, expect } from '@playwright/test';

// Visual regression tests compare against committed baseline screenshots.
// Run `VISUAL_CI=1 npx playwright test e2e/visual.spec.ts --update-snapshots`
// to regenerate baselines, then commit the resulting snapshots/ directory.
const RUN_VISUAL = !process.env.CI || !!process.env.VISUAL_CI;

test.describe('Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!RUN_VISUAL, 'Set VISUAL_CI=1 to run visual regression tests in CI');
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });
    await page.waitForTimeout(1_500);
  });

  test('top bar snapshot', async ({ page }) => {
    const topbar = page.locator('.topbar');
    await expect(topbar).toHaveScreenshot('topbar.png', { maxDiffPixelRatio: 0.02 });
  });

  test('bottom tab bar snapshot', async ({ page }) => {
    const tabbar = page.locator('[role="tablist"]');
    await expect(tabbar).toHaveScreenshot('tabbar.png', { maxDiffPixelRatio: 0.02 });
  });

  test('full page snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('full-page.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.03,
    });
  });
});
