# CLAUDE.md

SIV — a desktop-only, Civ VI–style 4X game for the web (TypeScript strict, Vite 6, PixiJS 8, Preact + @preact/signals, Zod v3, Vitest).

Milestone status (M0–M5 per `docs/SPEC.md` §18) and session notes live in § Status below.
Normative docs: `docs/SPEC.md`, `docs/GAME_DESIGN.md`.

## Commands

```bash
npm run dev              # Vite on :5173 (desktop gate needs viewport ≥1280×720)
npx tsc --noEmit         # type check — run after every write
npx vitest run           # full suite (only picks up tests/**/*.test.ts)
npx vitest run tests/engine/combat.test.ts   # single file
npm run e2e              # Playwright boot specs (tests/e2e); needs `npx playwright install chromium` once
```

Verify loop: `npx tsc --noEmit && npx vitest run` (172 tests green as of 2026-09-06, including the golden 50-turn hash backstop `tests/engine/golden.test.ts` — bump its recorded hash only with intent, and note it in § Status — plus the `tests/art/registry.test.ts` seal backstop). E2E: `npm run e2e` (20 specs: 2 boot + 16 UX + 2 screenshot baselines with 2% pixel tolerance; regenerate with `npx playwright test tests/e2e/screenshots.spec.ts --update-snapshots`; `reuseExistingServer` picks up a running dev server). Browser checks beyond that go through Playwright MCP against the dev server.

## Architecture (enforced by tests/architecture.test.ts)

```
src/content/     Zod-validated game data (civs, units, techs, buildings, promotions, resources)
src/engine/      Pure, deterministic simulation — imports NOTHING from render/ui/input/save/app
  core/          types.ts, commands.ts, events.ts, engine.ts (dispatch), rng.ts
  systems/       movement, cityFound, economy [city growth/production/research/borders],
                 visibility, diplomacy, barbarian, victory, spawn, dev, ai/planner
  mapgen/        generate.ts pipeline + presets/noise/rivers/populate
  hex/axial.ts   pointy-top hex math (axial internal, odd-r offset storage)
src/render/      Pixi MapRenderer (terrain/rivers/territory/fog/units/city/overlay layers)
src/ui/          Preact screens (MainMenu, GameShell, CityScreen, TechTree, VictoryScreen, DiplomacyPanel,
                 EmpireOverview, HelpOverlay); hud/ (TopBar, RightDock, UnitDock, Minimap, Notifications,
                 SavePanel, DevPanel, EscapeMenu, TileTooltip, AttentionBadge, DiploRibbon, LensBar,
                 ChoiceCard); store.ts owns all mutation
src/save/        persistence.ts — IndexedDB slots + file export/import (SPEC §15)
```

- All state mutation: `dispatch(state, cmd) -> { events }` in `src/engine/core/engine.ts`. UI calls only `submitCommand()` in `src/ui/store.ts`.
- `GameEvent` union lives in `src/engine/core/events.ts` (not types.ts). Consumers must ignore unknown event kinds (forward compat).
- UI state: Preact signals — read `signal.value` directly in render bodies; never `useSignal(existingSignal)`.

## Determinism (non-negotiable)

No `Math.random` / `Date.now` in the engine. All randomness flows through `nextRngFraction(state)` (FNV-mix stream advancing serializable `state.rngState`). Same options → same `hashState`. The AI, barbarians, combat rolls and mapgen all use this stream. Tests assert determinism via `hashState` equality.

## Conventions

- Zod v3: content files are validated at boot via `buildContentDb()`. Note the current
  arrays are annotated (`TECHS: TechDef[]`, etc. — only `RESOURCES` is a bare literal),
  so adding a field with a schema default still requires touching each entry or loosening the type.
- New AI/barbarian behavior must stay deterministic and be covered in `tests/engine/`.
- Debug handle: `window.__siv.getSession()` → `{ state, renderer, version }` (defined in store.ts) — use it from the console or Playwright to inspect live games. The handle also exposes `setSelection` (used by e2e).
- Dev/cheat panel: `Dev` button with a gold pip (top-left) or `` ` ``/`~` toggles it; verbs are `dev*` commands in `commands.ts`, applied by `systems/dev.ts`. Use it from Playwright to set up test states fast.
- **Art/icons follow `docs/ART_STYLE.md`** ("Gilded Hex Seals") — canonical hex-frame snippet, palette tokens and stroke hierarchy live there. New SVGs without all three theme pillars don't ship.

## Doc upkeep (standing order)

When a work session finishes anything: update § Status above. If conventions,
architecture, art style or game-design constants changed, also update this file and the
relevant normative doc (`docs/SPEC.md`, `docs/GAME_DESIGN.md`, `docs/ART_STYLE.md`) in the
same session — the docs are the handoff, stale docs are bugs.

## Playwright MCP discipline

- Resize to 1600×900 **before** the menu (desktop gate blocks smaller viewports).
- Script interactions in an **isolated second tab** (`browser_tabs new`) — the user plays/watches tab 0; never reload their tab without warning.
- The Pixi canvas is invisible to the a11y snapshot; click by screen coordinates. Camera centers on the human start: tile→screen = `(800 + (pix(tile) − pix(origin)).x, 450 + …)` with `x=√3·36·(q+r/2)`, `y=1.5·36·r`.
- LMB selects/attacks enemies in range; RMB moves along a path. `Found City`, `End Turn`, `start-game`/`end-turn`/`found-city` have testids.

## Game-design constants worth knowing

- Combat: `dmg = round(30 · e^(0.045·Δ) · U)`, U∈[0.8,1.2); melee is mutual, ranged is safe; XP 5/kill, 2/hit; promotions auto-granted at 15/30/60 XP (flat +3 str each, no player choice in v0).
- Wounded units fight at `0.5 + 0.5·hp/100` strength (multiplicative). There are **no terrain/fortify/flanking combat modifiers** in v0 — `fortified` only holds position (zeroes movement until woken) and filters the `N` next-unit cycle; it gives no healing or combat bonus.
- City defense: `8 + 2·pop + Σ building defense + garrison/2`; city HP starts at 100 and regenerates +10/turn up to 200; capture by melee when city HP hits 0 (barbarians instead plunder `min(treasury, 30+turn)` and the city resets to 10 HP).
- Victory: domination = hold every **original capital** (tracked as `player.originalCapitalCityId`, recorded at first founding; eliminated rivals' capitals still required while the city exists); score when `turn > turnLimit` (250) = `cities×3 + pop×2 + tiles×0.25 + techs×4 + wonders×5`; a player with no cities and no settlers is eliminated. Checks run after combat deaths and at the turn wrap (`engine.ts` tail).
- Healing: 10/turn field, 20/turn in own city (runs in `beginTurnForPlayer` via `healUnits`).
- Barbarians: pseudo-player (civId `'barbarians'`) appended after real players, excluded from `playerOrder`; phase runs at the turn wrap. Camps spawn ≥4 hexes from starts (~1 per 300 tiles at mapgen, new camps every 14 turns capped by area/200 clamp [3,12]); guards hold their camp, raiders roam (radius 6, ~30% archers / 70% warriors); raider spawns start turn 8, every 7 turns, capped by area/110 (min 2); clearing a camp pays 40+turn/10 gold.
- Difficulty 0–3: AI yields ×[1, 1.10, 1.20, 1.35], AI non-civilian strength +[0,1,2,3].
- Diplomacy: relations −100..+100, additive drift (+1 détente base, −4 while at war, −2 while borders touch); denounce cooldown 20; war −40, peace +20, denounce −25. **Human-facing Diplomacy panel** (topbar button or Esc menu): relations, Declare War, Offer Peace (rejections surface as `peaceRejected` toasts), Denounce with cooldown countdown.
- Production is a **single head + waiting line** per city (cap 5): `setProduction` replaces the whole line, `queueProduction` appends; overflow carries into the next head. Repeat rebuilds finished units (`setProductionRepeat`); research auto-advances from `researchQueue`; city focus doubles one worked-tile weight; rally points muster new builds. The city screen has a **Buy** button (3 gold per remaining hammer, queued item only) and the Esc menu has **Resign** (two-step confirm; ends the game immediately — best live rival wins by score).
- Saves export as `.json` (`siv-{civ}-turn{N}.json`); civ traits are display-only in v0 (no sim effect); water is impassable (no embark); riverside tiles give +1 gold; worked-tile score is `1.2F+1.1P+0.7G+1.3S+1.0C`; palace gives +2P +2S +3G +1C; monument gives +2C +1S (M5 science floor).
