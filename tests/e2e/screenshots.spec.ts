import { expect, test } from '@playwright/test';

// Visual baselines (SPEC §16): regenerate deliberately with
// `npx playwright test tests/e2e/screenshots.spec.ts --update-snapshots`.
// WebGL antialiasing differs per GPU — the 2% tolerance lives in playwright.config.ts.

test('menu visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SIV' })).toBeVisible();
  await expect(page).toHaveScreenshot('menu.png');
});

test('game boot visual baseline', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.map-host canvas')).toHaveCount(1);
  await page.waitForTimeout(600); // let the terrain texture bake settle
  await expect(page).toHaveScreenshot('game.png');
});
