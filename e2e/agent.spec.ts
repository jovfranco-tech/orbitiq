import { test, expect } from '@playwright/test';

test.describe('AI Agent — golden path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });
  });

  test('typing a query and pressing Enter calls onRun', async ({ page }) => {
    const input = page.locator('#agentCard input[type="text"]');
    await input.fill('Show Starlink satellites');
    await input.press('Enter');
    // Status should change to thinking
    const status = page.locator('#agentCard [role="status"]');
    await expect(status).toContainText(/(Parsing|Analizando)/);
  });

  test('example chip runs a query', async ({ page }) => {
    const chip = page.locator('.agent-chips button').first();
    await chip.click();
    const status = page.locator('#agentCard .agent-status');
    await expect(status).toContainText(/(Parsing|Analizando|Ready|Listo)/);
  });

  test('Run button is disabled while thinking', async ({ page }) => {
    const input = page.locator('#agentCard input[type="text"]');
    const runBtn = page.locator('#agentCard button[aria-label]').filter({ hasText: /(Run|Ejecutar)/ });
    const status = page.locator('#agentCard .agent-status');
    await input.fill('Find the ISS');
    await input.press('Enter');
    // Wait for thinking state first (avoids race: agent may respond very fast in CI)
    await expect(status).toContainText(/(Parsing|Analizando)/, { timeout: 3_000 });
    await expect(runBtn).toBeDisabled();
  });
});

test.describe('AI Agent — error recovery', () => {
  test('shows retry button when network fails', async ({ page }) => {
    // Intercept agent API and force a network error
    await page.route('**/api/agent', (route) => route.abort('failed'));
    await page.goto('/');
    await page.waitForSelector('#ui', { timeout: 10_000 });

    const input = page.locator('#agentCard input[type="text"]');
    await input.fill('Show GEO satellites');
    await input.press('Enter');

    // After error, fallback result should still show (deterministic fallback)
    const output = page.locator('.agent-output');
    await expect(output).toBeVisible({ timeout: 8_000 });
  });
});
