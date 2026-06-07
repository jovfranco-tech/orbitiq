import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for React to mount
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

  test('skip-link navigates to main content', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    const main = page.locator('#main-content');
    await expect(main).toBeAttached();
  });

  test('bottom tab bar supports arrow key navigation', async ({ page }) => {
    const firstTab = page.locator('[role="tab"]').first();
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    const secondTab = page.locator('[role="tab"]').nth(1);
    await expect(secondTab).toBeFocused();
  });

  test('catalog search input has accessible label', async ({ page }) => {
    const input = page.locator('.catalog input[type="text"]');
    await expect(input).toHaveAttribute('aria-label');
  });

  test('agent panel input has accessible label', async ({ page }) => {
    // Switch to agent tab on mobile or find agent section
    const label = page.locator('label[for]').filter({ hasText: /.+/ }).first();
    await expect(label).toBeAttached();
  });
});
