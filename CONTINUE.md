# CONTINUE.md — read me first (AI agent handoff)

**What this is:** SIV, a desktop-only Civ VI–style 4X game for the web, built from scratch.
Normative spec: `docs/SPEC.md` (§18 defines milestones M0–M5). Design doc: `docs/GAME_DESIGN.md`.
This file tells you exactly where things stand and what to do next. Update it as you finish work.

**Status date:** 2026-08-27 — **every open issue from this file is resolved.** UX wiring complete
(hover tile tooltip, N/Space/Enter/Esc hotkeys, production-card + tech tooltips, human-facing
Diplomacy panel, Escape menu with resign, city-screen Buy button). Art gaps closed: 29 bespoke
building/wonder hex seals + the barbarian camp marker is now a hex seal, not a round badge.
Test backstops added: golden 50-turn hash-stable playthrough + e2e screenshot baselines.
The old "AI rivals by content-order slice" item was stale — `startNewGame` already used a
seeded-RNG shuffle. **96 unit + 8 e2e specs green.** Prior state: M0–M5 implemented 2026-08-26
with audit issues 1–5 fixed and the left-city-panel / right-unit-dock / gold-format /
move-range-shading UX pass.

## Non-negotiable working rules

1. **Verify loop:** `npx tsc --noEmit && npx vitest run` (96 tests green, including the
   golden 50-turn hash backstop in `tests/engine/golden.test.ts` — bump its recorded hash
   ONLY for intentional engine changes, then note it here). Vitest only picks
   up `tests/**/*.test.ts`. E2E: `npm run e2e` (2 boot specs; needs `npx playwright install
   chromium` once per machine). Single-shot `Write` calls are reliable in this environment
   (verified 2026-08-22 with an 11-trial probe incl. a ~2,000-line file: zero corruption) —
   write whole files in one call, then run tsc as the post-write check.
2. For multi-spot edits to files you haven't Read: use inline python (`python - << 'PYEOF'`).
   For one-liners: `sed -i`.
3. **Architecture test enforces purity:** engine imports nothing from render/ui/input/save/app.
   All state mutation goes through `dispatch(state, cmd)` in `src/engine/core/engine.ts`;
   UI mutates only via `submitCommand()` in `src/ui/store.ts`.
4. `@preact/signals` v2: components read `signal.value` directly in render body; never
   `useSignal(existingSignal)`.
5. Zod v3 content arrays stay **unannotated literals** (annotating as `DefType[]` requires all
   defaulted fields present).
6. GameEvent type lives in `src/engine/core/events.ts` (NOT core/types.ts).
7. Playwright MCP: resize 1600×900 first; run scripted clicks in an **isolated second tab**
   (`browser_tabs new`) — the user watches/plays tab 0 and will contaminate your probes.
   See CLAUDE.md for the tile→screen click math and `window.__siv` debug handle.

## Current state (2026-08-26: tsc clean, 91 unit + 2 e2e green)

### Done & verified

- **M0–M4** scaffold/menu/camera · mapgen (4 presets, rivers, resources, balanced starts,
  barbarian camps ~n/220 ≥4 hexes out) · 3-state fog + live minimap · movement (A*, ZOC, 1UPT)
  · city founding + economy (yields/growth/production/borders) · turn flow · full HUD ·
  combat (`30·e^(0.045Δ)·U`, melee mutual w/ survivor rule, ranged safe, XP 5/kill 2/hit,
  auto-promotions at 15/30/60 from four flat +3 str picks, heal 10 field / 20 own city,
  city def `8+2·pop+Σbldg+garrison/2`, capture at HP 0, barb raid = plunder + reset to 10 HP)
  · barbarian FSM (guards hold camp, raiders roam r6, grace 8, every 5 turns, raider cap
  area/45, camp cap area/150 clamp [4,12], clear pays 40+turn/10) · diplomacy engine
  (relations −100..+100, drift +1/−4 war/−2 friction, denounce cd 20, AI peace utility) ·
  utility AI planner (research/production/diplomacy/unit orders, deterministic, difficulty
  yields ×[1,1.10,1.20,1.35] and +[0..3] AI strength) · dev cheat panel (`` ` ``/`~`, dev*
  verbs via normal dispatch, RNG-free) · art set 36 SVGs ("Gilded Hex Seals",
  see `docs/ART_STYLE.md`).
- **M5 victory** (`systems/victory.ts`): Domination = control every player's
  `originalCapitalCityId`; Score at turn > 250 = cities×3 + pop×2 + tiles×0.25 + techs×4 +
  wonders×5; elimination = no cities and no settlers. Checks run in `engine.ts` (turn wrap)
  and right after captures/wipe-outs in `combat.ts`. `state.winner` set ⇒ VictoryScreen with
  standings table; dispatch short-circuits further commands.
- **M5 saves** (`src/save/persistence.ts`): IndexedDB db `siv-saves`, store `slots`,
  keys `autosave|slot1|slot2|slot3`; autosave every endTurn; Continue button reads autosave
  meta from the menu; export/import `.siv.json`; load validates structurally
  (`validateSaveFile`: magic/version/state shape). SavePanel modal in-game.
- **M5 content complete**: 39 techs, 20 units (6 civ-unique), 29 buildings (8 wonders,
  6 civ-unique), 7 civ defs (6 playable + barbarians), 19 resources, 4 promotions.
- **E2E harness**: `npm run e2e` → 2 boot specs under `tests/e2e/` (menu→new game boots map+HUD;
  end turn advances counter), `reuseExistingServer` against :5173.

### Audit 2026-08-26 — resolved 1–5, new UX changes (verified)

- **(1) Notifications CSS collision — fixed.** `Notifications.tsx` returns `null` when no
  items; the duplicate `.notifications` rule was the dock panel and the absolute bottom
  pill; the dock block was removed and the pill is the only definition. No phantom pill.
- **(2) RightDock "No reports." + `useSignal` violation — fixed.** RightDock renders only
  the minimap; reads `sessionSignal.value` directly in the render body. The event-log UI
  stays out of v0 (per CLAUDE.md "engine-only diplomacy" gap).
- **(3) CityScreen architecture violation — fixed.** Removed the "Reassign worked tiles"
  button (and the `assignWorkedTiles` import) entirely. Worked-tile assignment is
  auto-computed each turn by the engine.
- **(4) `GameShell` stale `console.warn` — removed.** The planner has been wired since M4.
- **(5) `store.ts` toast nits — fixed.** `'City}'` → `'City'`; the dead `name === 'Unit' ?
  'Unit' : 'Unit'` ternary replaced with a safe fallback (`name ?? 'event'`).

### Audit 2026-08-26 — UX rework (verified)

- **City panel moved to the left** (modal slides in from the left edge, full-height
  borderless, max-width `min(560px, 46vw)`). Three grouped rows: **Buildings**, **Wonders**,
  **Units** — each with a labeled section header. Matches the user's request "cities panel
  on the left (with building/wonder/units being separated, each one being a different row)".
- **Unit dock moved to the right** (top: 212px, right: 0, width: 220px), anchored under
  the minimap. Unit-head layout: name on top, "100 HP · 2/2 MP" stacked underneath (was
  running together as `Warrior100 HP`).
- **Topbar gold format**: big `25` in gold, small `+-0/t` next to it, no brackets. Big
  number is `Math.round(player.gold)` (was showing fractional `24.5` because of 0.5
  unit maintenance).
- **Move-range shading** (hold right mouse button on selected own unit): tiles reachable
  *this turn* are shaded gold; tiles reachable *next turn* are shaded paler parchment.
  The previous brief flash on plain RMB click is also retained (700ms fade-out timer on
  button up). Both `reachableTiles` and `fullRangeTiles` selectors come from
  `engine/systems/movement.ts`; the overlay is painted in absolute world coords on the
  MapRenderer overlay layer.

### Resolved 2026-08-27 (was: "Known issues still open")

1. **Promised-but-unwired UX — all wired.** Hover tile tooltip (`TileTooltip.tsx` +
   `InputController.onTileHover`, explored-only, fog-courtesy for owner/city), hotkeys
   (N next unit needing orders + camera center, Space/Enter end turn, Esc closes the
   topmost modal then opens the pause menu), production-card + tech-card tooltips
   (stats/unlocks via native `title`), **Diplomacy panel** (`screens/DiplomacyPanel.tsx`,
   topbar button; war/peace/denounce with cooldown; rejected peace offers surface via the
   new `peaceRejected` event), **Escape menu** (`hud/EscapeMenu.tsx`: Resume / Save /
   Diplomacy / Resign two-step confirm / Quit), **Buy button** in the city screen
   (3 gold per remaining hammer, queued item only) and **Resign** now ends the game
   immediately (`engine.ts` runs `awardScoreVictory` after the human resigns — best live
   rival wins by score).
2. **Art gaps closed.** 29 bespoke building/wonder seals under `assets/art/buildings/`
   (canonical frame, material fills, one gold touch each) wired into production cards via
   `buildingArt()`; barbarian camp marker is now the `assets/art/ui/barbarian-camp.svg`
   hex seal stamped as a Pixi texture in `MapRenderer` (drawn tents remain the fallback).
   Generator script kept at `temp/gen-building-art.mjs`.
3. **Test backstops added.** `tests/engine/golden.test.ts`: duel, seed 424242, 50 endTurns,
   hash recorded (`eb4b2d49`) + run-to-run equality. `tests/e2e/screenshots.spec.ts`:
   menu + in-game baselines (2% pixel tolerance, `--update-snapshots` to regenerate);
   `tests/e2e/ux.spec.ts`: Esc menu, Space end turn, diplomacy panel, found→queue→Buy.
4. **AI-rival item was stale** — `startNewGame` already picks rivals via a seeded
   `Rng.shuffled()` slice (deterministic per seed, not content-order). No change needed.

### Verified e2e

Automated: `npm run e2e` (2 boot specs, headless chromium). Manual (Playwright MCP, isolated
tab, seed 424242 duel): menu → start → Found City → RMB move → LMB click-attack on adjacent
wounded raider (hp 32→4) → AI founds Thebes/Athens, grows pop, queues archers → barbarian grace
keeps early game calm. Full sweep 2026-08-26 also exercised tech tree, city production,
save/load/export, dev panel verbs, victory screen via dev cheats.

**Save backup:** during the 2026-08-26 audit, the user's then-current autosave (turn 4) was
copied inside IndexedDB to slot key **`backup-pre-scan`** before scripted probing touched the
game. Once confirmed unneeded, delete it in-game: Dev panel (`` ` ``) → Maintenance →
"Delete backup-pre-scan slot".

## Useful facts

- Hex math: pointy-top, axial internal, odd-r storage. `x=√3·s·(q+r/2)`, `y=1.5·s·r`.
  Side d spans corners `(6−d)%6..(7−d)%6`. Offset col = `q + ((r−(r&1))>>1)`.
  Shared helper `tileIndex(q,r,width,heightRows)` in `hex/axial.ts`.
- Minimap linear approx: `col ≈ wx/(√3·36) − 0.25`, `row = wy/(1.5·36)`; click inverse
  `(col+0.25)·√3·36, row·1.5·36`.
- Debug handle: `window.__siv.getSession()` → `{ state, renderer, version }`.
- Dev server: `npm run dev` (:5173). Desktop gate needs viewport ≥1280×720.
- The user plays the game while sessions run — they enjoy it; don't reload their tab without warning.
