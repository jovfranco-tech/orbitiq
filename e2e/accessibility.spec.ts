import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });
  });

  test('home page has no critical axe violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('skip-link is present and focusable', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
  });

  test('skip-link targets the main content anchor', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main-content');
    await skipLink.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeAttached();
  });

  test('globe canvas exposes an accessible image role', async ({ page }) => {
    const canvas = page.locator('canvas[role="img"]');
    await expect(canvas.first()).toBeAttached();
    await expect(canvas.first()).toHaveAttribute('aria-label', /satellite globe/i);
  });

  test('bottom tab bar exposes labelled navigation', async ({ page }) => {
    // BottomTabBar is display:none on desktop — use a mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    const nav = page.locator('nav.bottom-tab-bar');
    await expect(nav).toHaveAttribute('aria-label', /navigation/i);
    // active tab carries aria-current
    await expect(page.locator('.tab-item[aria-current="page"]').first()).toBeAttached();
  });

  test('catalog search input has an accessible name', async ({ page }) => {
    const input = page.locator('.catalog input[type="text"]').first();
    await expect(input).toHaveAttribute('aria-label', /.+/);
  });

  test('agent input has an accessible name', async ({ page }) => {
    await expect(page.locator('#agentInput')).toHaveAttribute('aria-label', /.+/);
  });
});
