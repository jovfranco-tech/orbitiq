import { test, expect } from '@playwright/test';

test.describe('AI Agent — golden path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });
  });

  test('typing a query and pressing Enter produces a result', async ({ page }) => {
    const input = page.locator('#agentInput');
    await input.fill('Show Starlink satellites');
    await input.press('Enter');
    await expect(page.locator('.agent-output')).toBeVisible({ timeout: 8_000 });
  });

  test('an example chip runs a query', async ({ page }) => {
    const chip = page.locator('.agent-chips button').first();
    await chip.click();
    const status = page.locator('#agentCard .agent-status');
    await expect(status).toContainText(/(Parsing|Analizando|Ready|Listo)/);
  });

  test('agent status returns to ready after a query resolves', async ({ page }) => {
    const input = page.locator('#agentInput');
    await input.fill('Find the ISS');
    await input.press('Enter');
    const status = page.locator('#agentCard .agent-status');
    await expect(status).toContainText(/(Ready|Listo)/, { timeout: 8_000 });
  });
});

test.describe('AI Agent — error recovery', () => {
  test('falls back to a deterministic result when the network fails', async ({ page }) => {
    await page.route('**/api/agent', (route) => route.abort('failed'));
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });

    const input = page.locator('#agentInput');
    await input.fill('Show GEO satellites');
    await input.press('Enter');

    await expect(page.locator('.agent-output')).toBeVisible({ timeout: 8_000 });
  });
});
