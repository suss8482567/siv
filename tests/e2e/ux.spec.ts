import { expect, test } from '@playwright/test';

// UX coverage for the wired interactions: Esc pause menu, Space end turn,
// Diplomacy panel, attention badge, tech search, lenses, help, empire,
// focus, queues, rally, founding.

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

test('attention badge lists actionable items and jumps to a unit', async ({ page }) => {
  await startGame(page);
  // Fresh game: unmoved units + unpicked research => badge names the categories.
  const badge = page.getByTestId('end-turn-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('unit');
  await expect(badge).toContainText('research');
  await badge.click();
  await expect(page.getByTestId('attention-list')).toBeVisible();
  // Jump to the first unit item: the unit dock shows a selected unit.
  const firstUnit = page.locator('[data-testid^="attention-unit-"]').first();
  await firstUnit.click();
  await expect(page.getByTestId('unit-dock')).toContainText('HP');
});

test('tech search filters nodes and shows turns at current rate', async ({ page }) => {
  await startGame(page);
  // Found a city first so the science rate is nonzero (palace +2S).
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  await page.getByTestId('open-tech-tree').click();
  await expect(page.getByTestId('tech-tree')).toBeVisible();
  await page.getByTestId('tech-search').fill('pot');
  // 'Pottery' matches; a military tech does not. Palace yields 2S => 13 turns.
  await expect(page.getByTestId('tech-tree')).toContainText('Pottery');
  await expect(page.getByTestId('tech-tree')).not.toContainText('Bronze Working');
  await expect(page.getByTestId('tech-tree')).toContainText('13 turns');
});

test('lens bar toggles yields and persists the choice', async ({ page }) => {
  await startGame(page);
  await expect(page.getByTestId('lens-bar')).toBeVisible();
  await page.getByTestId('lens-yields').click();
  await expect(page.getByTestId('lens-yields')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('siv.lens'))).toBe('yields');
  await page.getByTestId('lens-yields').click();
  await expect(page.getByTestId('lens-yields')).toHaveAttribute('aria-pressed', 'false');
});

test('selecting the settler auto-suggests the settle lens', async ({ page }) => {
  await startGame(page);
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await expect(page.getByTestId('lens-settle')).toHaveAttribute('aria-pressed', 'true');
});

test('minimap size and territory toggles persist', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('minimap-size').click();
  expect(await page.evaluate(() => localStorage.getItem('siv.minimap.size'))).toBe('S');
  await page.getByTestId('minimap-territory').click();
  await expect(page.getByTestId('minimap-territory')).toHaveAttribute('aria-pressed', 'true');
});

test('help overlay searches and Esc closes it without the pause menu', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('help-overlay')).toBeVisible();
  await page.getByTestId('help-search').fill('warr');
  await expect(page.getByTestId('help-entry-unit-warrior')).toBeVisible();
  await page.getByTestId('help-close').click();
  await expect(page.getByTestId('help-overlay')).not.toBeVisible();
  await page.getByTestId('open-help').click();
  await expect(page.getByTestId('help-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help-overlay')).not.toBeVisible();
  await expect(page.getByTestId('escape-menu')).not.toBeVisible();
});

test('empire overview lists the founded city and jumps to it', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('open-empire').click();
  await expect(page.getByTestId('empire-overview')).toBeVisible();
  await page.getByTestId('empire-close').click();
  await expect(page.getByTestId('empire-overview')).not.toBeVisible();
  // Found a city, reopen, click its row: the city screen opens (jump works).
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  const cityId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.cities).find((c) => c.ownerId === human?.id)?.id ?? null;
  });
  await page.getByTestId('open-empire').click();
  await page.getByTestId(`empire-row-city-${cityId}`).click();
  await expect(page.getByTestId('city-screen')).toBeVisible();
  await expect(page.getByTestId('empire-overview')).not.toBeVisible();
});

test('declaring war needs confirming', async ({ page }) => {
  await startGame(page);
  // Force contact for the diplomacy flow (visual/functional probe only).
  const civId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const me = s.state.players.find((p) => p.isHuman);
    const rival = s.state.players.find((p) => !p.isHuman && p.civId !== 'barbarians');
    if (me && rival && !me.metPlayerIds.includes(rival.id)) me.metPlayerIds.push(rival.id);
    return rival?.civId ?? null;
  });
  await page.getByTestId('end-turn').click();
  await page.getByTestId('open-diplomacy').click();
  await page.getByTestId(`diplo-war-${civId}`).click();
  // Choice card appears; war NOT yet declared.
  await expect(page.getByTestId('choice-card')).toBeVisible();
  await expect(page.getByTestId('diplomacy-panel')).not.toContainText('At war');
  await page.getByTestId('confirm-war').click();
  await expect(page.getByTestId('diplomacy-panel')).toContainText('At war');
});

test('repeat toggle arms and the research queue strips', async ({ page }) => {
  await startGame(page);
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  const cityId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.cities).find((c) => c.ownerId === human?.id)?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: null, cityId: id }), cityId);
  await page.getByTestId('prod-warrior').click();
  await page.getByTestId('repeat-production').click();
  await expect(page.getByTestId('repeat-production')).toHaveAttribute('aria-pressed', 'true');
  // Research: first pick sets active, second pick queues behind it.
  await page.keyboard.press('Escape');
  await page.getByTestId('open-tech-tree').click();
  await page.getByTestId('tech-search').fill('pottery');
  await page.getByRole('button', { name: /Pottery/ }).click();
  await page.getByTestId('tech-search').fill('');
  await page.getByTestId('tech-search').fill('mining');
  await page.getByRole('button', { name: /Mining/ }).click();
  await expect(page.getByTestId('research-queue')).toContainText('Mining');
  await page.getByTestId('dequeue-mining').click();
  await expect(page.getByTestId('research-queue')).not.toBeVisible();
});

test('city focus switches the worked-tile preference', async ({ page }) => {
  await startGame(page);
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  const cityId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.cities).find((c) => c.ownerId === human?.id)?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: null, cityId: id }), cityId);
  await expect(page.getByTestId('focus-balanced')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('focus-growth').click();
  await expect(page.getByTestId('focus-growth')).toHaveAttribute('aria-pressed', 'true');
});

test('production queue appends, reorders and removes', async ({ page }) => {
  await startGame(page);
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'settler',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('found-city').click();
  const cityId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.cities).find((c) => c.ownerId === human?.id)?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: null, cityId: id }), cityId);
  await page.getByTestId('prod-warrior').click();
  await page.getByTestId('queue-scout').click();
  await expect(page.getByTestId('production-queue')).toContainText('Scout');
  await page.getByTestId('queue-remove-1').click();
  await expect(page.getByTestId('production-queue')).not.toBeVisible();
});

test('rally point sets and clears from the unit dock', async ({ page }) => {
  await startGame(page);
  const unitId = await page.evaluate(() => {
    const s = window.__siv?.getSession();
    if (!s) return null;
    const human = s.state.players.find((p) => p.isHuman);
    return Object.values(s.state.units).find(
      (u) => u.ownerId === human?.id && u.typeId === 'warrior',
    )?.id ?? null;
  });
  await page.evaluate((id) => window.__siv?.setSelection?.({ unitId: id, cityId: null }), unitId);
  await page.getByTestId('set-rally').click();
  await expect(page.getByTestId('clear-rally')).toBeVisible();
  await page.getByTestId('clear-rally').click();
  await expect(page.getByTestId('clear-rally')).not.toBeVisible();
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
