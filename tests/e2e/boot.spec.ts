import { expect, test } from '@playwright/test';

test('menu renders and a new game boots the map + HUD', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SIV' })).toBeVisible();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('end-turn')).toBeVisible();
  await expect(page.locator('.map-host canvas')).toHaveCount(1);
});

test('end turn advances the turn counter', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('topbar')).toContainText('Turn 1');
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('topbar')).toContainText('Turn 2');
});
