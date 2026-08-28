import { expect, test } from '@playwright/test';

// UX coverage for the newly wired interactions (CONTINUE.md issue 1):
// Esc pause menu, Space end turn, and the human-facing Diplomacy panel.

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('topbar')).toBeVisible({ timeout: 15_000 });
}

test('Esc opens the pause menu and Resume closes it', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('escape-menu')).toBeVisible();
  await page.getByTestId('esc-resume').click();
  await expect(page.getByTestId('escape-menu')).not.toBeVisible();
});

test('Space ends the turn', async ({ page }) => {
  await startGame(page);
  await expect(page.getByTestId('topbar')).toContainText('Turn 1');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('topbar')).toContainText('Turn 2');
});

test('diplomacy panel opens from the topbar', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('open-diplomacy').click();
  await expect(page.getByTestId('diplomacy-panel')).toBeVisible();
});

test('founding a city shows the Buy button for the queued item', async ({ page }) => {
  await startGame(page);
  // Select the settler through the debug handle, found a city, queue a unit.
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    const settler = Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    );
    return settler?.id ?? null;
  });
  expect(unitId).not.toBeNull();
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  const cityId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    const city = Object.values(s.state.cities).find((c) => c.ownerId === human?.id);
    return city?.id ?? null;
  });
  expect(cityId).not.toBeNull();
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: null, cityId: id }), cityId);
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await page.getByTestId('prod-warrior').click();
  await expect(page.getByTestId('buy-production')).toBeVisible();
});
