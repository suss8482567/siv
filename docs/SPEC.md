# SIV — Technical Specification (v0)

> Implementation spec for the v0 feature set agreed in [GAME_DESIGN.md](./GAME_DESIGN.md).
> This document is normative: where code and spec disagree, fix one of them.

## 1. Goals & non-goals

**Goals**
- Deterministic, testable simulation core with zero DOM dependencies.
- Data-driven content (civs/units/techs/buildings/terrains as validated data files).
- 60 fps pan/zoom on a Huge map (84×54 = 4,536 tiles) on commodity desktop hardware.
- A codebase where every gameplay rule lives in exactly one place.

**Non-goals (v0)**
- Networking, mobile, touch, audio, accessibility beyond keyboard basics, i18n (English-only;
  all user-visible strings flow through a single strings module so i18n is a mechanical later step).

## 2. Tech stack & rationale

| Layer      | Choice                        | Rationale |
|------------|-------------------------------|-----------|
| Language   | TypeScript 5, strict mode     | Refactor safety across a large sim; the sim is the product |
| Build      | Vite 6 + ESM                  | Instant HMR, zero-config TS/JSX, trivial prod build |
| Map render | PixiJS 8 (WebGL/WebGPU)       | Thousands of hex sprites + smooth camera transform need a batched GPU renderer; Canvas2D redraws become the bottleneck with overlays/animations |
| UI chrome  | Preact + @preact/signals      | Dense HUD = many reactive bindings; DOM is far more productive than canvas-drawn UI for panels/menus/tooltips; 4 kB |
| Validation | Zod                           | Content files are untrusted input; validate once at boot, fail loudly |
| Unit tests | Vitest                        | Same-transform as Vite; golden-simulation tests need speed |
| E2E        | Playwright                    | Boot smoke, start-game flow, screenshot regression |
| Runtime    | Modern desktop browsers (ES2022) | Desktop-only gate; no transpile targets below ES2022 |

## 3. Architecture principles

1. **Layered, one-way dependencies** — enforced by `tests/architecture.test.ts` (static import scan):

   ```
   content ──► engine ──► (nothing)
                 ▲
   render ───────┤        app ──► ui ──► engine (read-only selectors)
   input ────────┘        save ──► engine (read state snapshots)
   ```

   - `src/engine/**` imports only from `engine/**` and `content` **types** — never DOM, never render/ui.
   - All game-state mutation happens inside `engine` via commands. Renderers and UI read state;
     they never write it.
2. **Command → reducer → events** — every player/AI action is a serializable `Command`;
   `dispatch(state, cmd)` mutates the state tree and returns `GameEvent[]`. UI plays events as
   notifications/animations. This is what makes replays, golden tests, and (later) multiplayer
   possible without rework.
3. **Determinism** — one seeded PRNG instance lives in `GameState.rng` (serializable u32 state).
   No `Math.random`, no `Date.now`, no `performance.now` inside `engine`. Map iteration order is
   insertion-ordered (plain objects/arrays only, no `Set`/`Map` in serialized state).
4. **Data-driven content** — all balance numbers live in `src/content/*` as typed data validated
   by Zod at boot. The engine never hardcodes a cost or strength value.
5. **Serializable state** — `GameState` is plain JSON. Saves = JSON snapshot. Golden tests hash it.

## 4. Module map

```
siv/
├─ docs/                        GAME_DESIGN.md, SPEC.md, ART_STYLE.md
├─ index.html                   single page, #app root, desktop gate
├─ src/
│  ├─ main.tsx                  boot: validate content, mount App, gate viewport
 │  ├─ ui/
 │  │  ├─ App.tsx                screen switch (menu | game), keyed on sessionSeqSignal
 │  │  ├─ store.ts               signals bridge: session/selection/notifications + submitCommand
 │  │  ├─ screens/               MainMenu, GameShell, CityScreen, TechTree, VictoryScreen,
 │  │  │                         DiplomacyPanel
 │  │  └─ hud/                   TopBar, RightDock, UnitDock, Minimap, Notifications,
 │  │                            SavePanel, DevPanel, ArtIcon, EscapeMenu, TileTooltip
│  ├─ engine/                   ★ pure simulation (no DOM imports)
│  │  ├─ core/
│  │  │  ├─ types.ts            GameState + all entity types, id aliases, hashState
│  │  │  ├─ rng.ts              serializable u32 FNV-mix stream (nextRngFraction)
│  │  │  ├─ commands.ts         Command union (full verb list, incl. dev* verbs)
│  │  │  ├─ events.ts           GameEvent union (UI/notification feed)
│  │  │  └─ engine.ts           dispatch(): command validation + reducer switch
│  │  ├─ hex/
│  │  │  ├─ axial.ts            coords, neighbors, distance, ranges, pixel↔hex
│  │  │  └─ pathfind.ts         A* with move costs, ZOC, 1UPT occupancy rules
│  │  ├─ mapgen/
│  │  │  ├─ noise.ts            seeded value-noise + fBm
│  │  │  ├─ presets.ts          map sizes + pangaea | continents | archipelago | fractal masks
│  │  │  ├─ rivers.ts           river sources + steepest-descent walks
│  │  │  ├─ populate.ts         terrain/features/resources/starts/camps/units
│  │  │  └─ generate.ts         pipeline orchestration → GameState
 │  │  └─ systems/               one module per rule cluster (turn, movement,
 │  │                            combat, cityFound, economy [city growth/production,
 │  │                            research, borders], visibility, diplomacy,
 │  │                            barbarian, victory, spawn, dev, ai/planner)
 │  ├─ content/                  data + zod schema + ContentDb (validated, frozen)
 │  ├─ assets/art/index.ts        SVG registry (units/yields/resources/civs/buildings/ui)
 │  ├─ render/                   MapRenderer (Pixi), camera, palette (chrome only)
│  ├─ input/                    InputController: mouse/WASD → camera ops + tile clicks
│  ├─ save/                     persistence.ts: IndexedDB slots + file export/import
│  └─ util/                     misc pure helpers
 ├─ tests/
 │  ├─ engine/                   rng, mapgen, movement, visibility, cityEconomy,
 │  │                            combat, ai (incl. diplomacy/barbarians), dev,
 │  │                            victory, golden (50-turn hash backstop)
 │  ├─ save/                     persistence round-trip + validation
 │  ├─ architecture.test.ts      layer-boundary import scan
 │  └─ e2e/                      Playwright specs: boot + UX + screenshots (`npm run e2e`)
├─ playwright.config.ts         webServer: vite dev @5173, reuseExistingServer
└─ vite.config.ts               alias @ → src
```

## 5. Core data model

```ts
// ids are plain numbers (JSON-friendly); aliases document intent
type PlayerId = number; type UnitId = number; type CityId = number;
type TileId = number;   // index into map.tiles

interface Tile {
  id: TileId; q: number; r: number;          // axial coords
  terrain: TerrainKind;                      // ocean|coast|grassland|plains|desert|tundra|snow
  elevation: 'flat'|'hills'|'mountain';
  features: FeatureKind[];                   // forest|jungle|marsh|ice|oasis|floodplain
  riverEdges: boolean[];                     // river on edge toward each neighbor direction
  resourceId?: string; resourceAmount?: number;
  ownerPlayerId?: PlayerId; cityId?: CityId; // territory + city center
  workedByCityId?: CityId;
}

interface Unit {
  id: UnitId; typeId: string; ownerId: PlayerId; tileId: TileId;
  hp: number;                                // 0..100
  movementLeft: number; attacksLeft: number;
  fortified: boolean; slept: boolean;
  xp: number; promotions: string[];
}

interface City {
  id: CityId; name: string; ownerId: PlayerId;
  tileId: TileId;                            // center tile
  population: number; foodStored: number;
  productionQueue: ProductionItem[];         // single-slot in practice (setProduction replaces)
  productionStored: number;
  buildings: string[];
  cultureStored: number;
  ownedTileIds: TileId[];                    // includes center
  hp: number;                                // reduced by attacks; 0 ⇒ capturable
  originalOwnerId: PlayerId;                 // preserved across capture
  everCaptured: boolean;
}

interface Player {
  id: PlayerId; civId: string; isHuman: boolean; alive: boolean;
  gold: number;
  researchedTechIds: string[];
  researchingTechId?: string; scienceStored: number;
  metPlayerIds: PlayerId[];                  // contacted civs
  relations: Record<PlayerId, number>;       // -100..100, only for met players
  denouncedBy: PlayerId[]; warsWith: PlayerId[];
  denounceTurns: Record<PlayerId, number>;   // targetPlayerId -> last denounce turn (cooldown)
  exploredTileIds: TileId[];                 // persistent FOW memory (sorted)
  originalCapitalCityId?: CityId;            // first-founded city — Domination target
  personality?: Personality;                 // AI only
  devRevealAll?: boolean; devIncome?: DevIncome;   // dev-tool cheats (absent in normal play)
}

interface BarbarianCamp { tileId: TileId; unitIds: UnitId[]; }

interface GameState {
  version: 1;
  seed: number;
  turn: number;                              // 1-based
  turnLimit: number;                         // 250
  difficulty: number;                        // 0 Peaceful .. 3 Brutal
  playerOrder: PlayerId[];                   // humans first, then AIs; barbarians excluded
  currentPlayerIndex: number;                // whose turn
  map: { width: number; height: number; tiles: Tile[] };
  players: Player[];                         // index === PlayerId; last entry = barbarians
  units: Record<UnitId, Unit>;               // insertion-ordered objects, never Map/Set
  cities: Record<CityId, City>;
  nextUnitId: number; nextCityId: number;
  barbarianCamps: BarbarianCamp[];
  rngState: number;                          // u32 PRNG checkpoint
  winner?: { playerId: PlayerId; victory: 'domination'|'score' };
}
```

Rules: no classes in serialized state (POJOs only) so `structuredClone`/`JSON` round-trips
losslessly. Derived values (visibility sets, city yields) are computed on demand by `systems/`,
never stored.

## 6. Hex grid math

- **Layout**: pointy-top hexes, **odd-r offset** rows for display; **axial (q, r)** internally.
- Size constant `HEX_SIZE = 36` (center→corner px at zoom 1).
  - width `√3·s`, vertical step `1.5·s`, horizontal step `√3·s`.
- **Axial↔pixel**: `x = s·√3·(q + r/2)`, `y = s·1.5·r`.
- **Pixel→axial**: invert, then cube-round (`x=q, z=r, y=−x−z` rounding trick).
- **Neighbors**: 6 axial directions `[(+1,0),(+1,−1),(0,−1),(−1,0),(−1,+1),(0,+1)]`;
  edge `i` of a tile faces neighbor `i` (rivers use this indexing).
- **Distance**: `( |dq| + |dr| + |dq+dr| ) / 2`.
- **Range/line**: cube-distance rings; hex line-of-sight = lerp-sampled cube line (blockers:
  mountains) — used for recon sight and ranged attacks.
- All math in `engine/hex/axial.ts` as pure functions; UI/render import it read-only.

## 7. Map generation pipeline

Deterministic given `(seed, preset, size)`. Stages, in order:

1. **Heightmap**: fBm value noise (5 octaves, seeded permutation table), normalized 0..1.
2. **Preset mask**: multiply/shape by preset function — pangaea: radial falloff + low sea cutoff;
   continents: two seeded gaussian blobs; archipelago: high cutoff + ridged noise; fractal: none.
3. **Water**: height < seaLevel → ocean; ocean adjacent to land → coast.
4. **Base terrain by latitude**: |y−center| bands → grassland/plains (temperate), desert (±~25%),
   tundra/snow (edges); moisture noise shifts plains↔grassland.
5. **Elevation**: second noise channel → hills; sparse mountain peaks (height > 0.85, min spacing).
6. **Features**: forest/jungle/marsh/ice/oasis/floodplain by terrain+moisture tables.
7. **Rivers**: pick sources (mountains/hills, sorted by elevation, seeded count by map area);
   greedy steepest-descent walk over tile graph until water or 40 steps; mark `riverEdges`.
8. **Resources**: per-biome probability tables (per-tile density roll, no
   clustering pass); luxury pass guarantees ≥1 luxury within radius 2 of each
   start (plus ≥1 strategic within radius 3); strategic (horses/iron) get an
   amount roll.
9. **Start placement**: score every land tile (Σ yields radius 2, +fresh water, +coast, −overlap),
   greedy best-first with min-distance constraint (no snake-draft); civs take starts in order.
10. **Emit**: tiles array + spawn units (**settler + warrior** per civ — no *starting*
   scout in v0; scout remains a buildable recon unit; the warrior escorts beside the
   settler on the first walkable neighbor, not stacked) +
   barbarian camps (~1 per 300 tiles, each with a warrior guard ≥4 hexes from starts) +
   `GameState` seed.

Acceptance: same seed ⇒ byte-identical tiles (golden test hashes the tiles array).

## 8. Turn structure

Sequential turns, players in `playerOrder` (human first by convention):

1. `beginTurnForPlayer`: unit movement/attacks refresh; wounded units heal
   (+10 field / +20 in own city). Dev-tool flat income (if armed) lands in
   `endOfTurnForPlayer` *before* the city tick so bonuses count the same turn.
2. Player acts (human: commands; AI: planner runs synchronously inside the turn wrap — no
   wall-clock budgeting, so play-outs stay deterministic).
3. `endOfTurnForPlayer`: cities collect yields → research/production/culture progress → growth/
   starvation → border expansion → completion events.
4. After the last player: barbarian phase, then `turn++`. Victory and elimination checks run both
   here and immediately after any city capture or player wipe-out. Score fires when
   `turn > turnLimit` (i.e. turn 251+ with the default limit of 250).

## 9. Command catalog (v0)

| Command                         | Payload                                   | Validation highlights                                       |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `moveUnit`                      | unitId, path: TileId[]                    | owner, movement budget, passable, ZOC, embark rules         |
| `attackUnit`                    | attackerId, defenderUnitId                | adjacency (ranged: ≤ range + LOS), attacksLeft              |
| `attackCity`                    | attackerId, cityId                        | adjacency like attackUnit; capture resolves at HP 0         |
| `foundCity`                     | unitId                                    | settler on valid land, spacing ≥3                           |
| `setProduction`                 | cityId, item {kind:'unit'\|'building', id} | tech unlocked; **replaces** the single-slot queue           |
| `queueProduction` / `dequeueProduction` / `reorderProduction` | cityId, item / index / from+to | append (cap 5) / remove / move waiting items; completion consumes the head |
| `buyProduction`                 | cityId, item                              | queued item only; gold ≥ ceil((cost−stored)×3); **Buy button in the city screen** |
| `setProductionRepeat`           | cityId, repeat                            | owner; repeat rebuilds finished **units** (buildings one-shot; cleared on capture); absent-when-off |
| `setCityFocus`                  | cityId, focus                             | owner; growth/production/gold/science/culture double one weight (balanced = absent) |
| `setRally`                      | tileId \| null                            | any player; new production auto-marches at turn start; manual orders/arrival/unreachable clear it |
| `setResearch`                   | techId                                    | prerequisites met; clears the same id from the queue        |
| `queueResearch` / `dequeueResearch` | techId                                | append/remove `researchQueue` (unknown/active/dup ignored); queueing idle starts it; completion auto-advances, skipping known |
| `fortify`/`sleep`/`wake`/`skipTurn` | unitId                                    | unit exists, owner                                          |
| `declareWar`                    | targetPlayerId                            | met, not already at war                                     |
| `offerPeace`                    | targetPlayerId                            | at war; AI accepts via utility                              |
| `denounce`                      | targetPlayerId                            | met, 20-turn cooldown per pair                              |
| `endTurn`                       | —                                         | only current player                                         |
| `resign`                        | —                                         | human only; Escape menu (two-step confirm); ends the game immediately — best live rival wins by score |
| `dev*` (13 verbs)               | various                                     | debug panel verbs (`devRevealMap`, `devSpawnUnit`, `devSpawnCity`, `devAddGold`, `devAddScience`, `devGrantTech`, `devGrowCity`, `devAddCulture`, `devFinishProduction`, `devAddBuilding`, `devRefreshUnits`, `devSetIncome`, `devSmiteBarbarians`); applied by `systems/dev.ts`, RNG-free |

Commands are pure data; `engine.dispatch` validates then applies, returning `GameEvent[]` — the
full union lives in `core/events.ts`: `turnBegan`, `unitMoved`, `combatResolved{dmgToAttacker,
dmgToDefender}`, `unitKilled`, `unitPromoted`, `cityFounded`, `cityCaptured`, `cityGrew`,
`cityStarved`, `productionComplete`, `researchComplete`, `bordersExpanded`, `warDeclared`,
`peaceMade`, `peaceRejected` (AI declined a peace offer), `denounced`, `playerDefeated`, `victoryAchieved`. UI subscribes to events for
toasts/animations; unknown event kinds must be ignored (forward compatibility).

## 10. Combat resolution

```
effectiveStr = baseStr × (0.5 + 0.5·hp/100) + Σ promotion bonuses (+ difficulty bonus for AI military)
Δ = effectiveStr(attacker) − effectiveStr(defender)
dmg = round( 30 · e^(0.045·Δ) · U ),  U = 0.8 + 0.4·rngFraction ∈ [0.8, 1.2);  dmg ≥ 1
```

- Wounded units fight proportionally weaker. There are **no terrain, fortification, river or
  flanking modifiers in v0** (deliberate simplification — revisit candidates for post-M5 balance).
- **Melee is mutual**: both sides deal damage in one resolution; if both would die, the melee
  attacker survives on 1 HP (melee always leaves a winner). **Ranged** takes no retaliation and
  may shell cities (city HP only).
- **Cities**: def str = `8 + 2·population + Σ building defense + garrison effectiveStr/2`;
  HP starts at 100 on founding and regenerates +10/turn up to a 200 cap. At 0 HP a melee capture flips the owner (population halved,
  palace lost, production cleared, territory follows, HP resets to 50). Barbarians instead raid:
  they plunder `min(treasury, 30 + turn)` gold and withdraw, leaving the city at 10 HP.
- **XP**: 5 per kill, 2 per hit. Promotions auto-grant at 15/30/60 XP from four flat +3-strength
  picks (shock / drill / veteran / siege — all apply +3 universally in code, including siege) defined in `content/promotions.ts`.
- **Healing**: +10/turn in the field, +20/turn in an own city (applied in `beginTurnForPlayer`).

## 11. City economy (formulas)

- **Growth threshold**: `foodNeeded(p) = round(14 + 7·p^1.4)`.
- **Yield assembly** per city: center tile (2F/1P + era bonus), riverside tiles +1 gold, worked tiles (auto-assigned,
  weighted score `1.2F+1.1P+0.7G+1.3S+1.0C`, re-evaluated on any ownership/pop change), buildings,
  palace (+2P +2S +3G +1C in capital), civ trait modifiers (reserved — traits are display-only in v0), difficulty bonuses (AI).
- **Production**: single head + waiting line (cap 5) — `setProduction` replaces the
  whole line, `queueProduction` appends; overflow carries into the next head;
  item cost from content; wonder = one per world (global claim). `setProductionRepeat`
  rebuilds a finished unit while set (buildings complete once and clear it; capture clears it).
- **Science**: Σ city science; player accumulates into `scienceStored` toward current tech;
  `researchQueue` auto-advances on completion (unknown/active/dup entries never queue).
- **Culture**: per-city; drives border tile acquisition cost `12 + 4·ownedTiles^1.1`.
- **Gold**: income − maintenance each turn; treasury clamps at 0 (no bankruptcy/disband spiral
  in v0). Happiness is **not implemented** — luxuries currently act as yield/trade flavor only.

## 12. AI architecture

- **Civ planner** (`systems/ai/planner.ts`): per turn, per category, generate ≤K candidates,
  score, execute best; categories run in fixed order (research → production → diplomacy →
  unit orders) synchronously inside the turn wrap — no wall-clock budgeting, so play-outs are
  bit-for-bit reproducible for a given seed + command log.
- Candidate scorers (examples):
  - Settle: Σ weighted yields r2 + fresh water − overlap − barbarian proximity.
  - Build: need vector (military/econ/science) vs personality; threat = Σ nearby foreign str;
    military has diminishing returns (standing-army penalty, M5), recon is never built as
    soldiery, and a zero-science city forces monument to the top (science floor, M5).
  - War: `strRatio·aggression + grievance − economyRisk`; declare only > threshold, re-check
    peace every 10 turns.
  - Unit move: role-based tile scores (front line, garrison, explore frontier, escort settler).
- **Personalities** come from `CivDef` weights; difficulty adds yield multipliers + combat str.
- **Barbarians** (`systems/barbarian.ts`): FSM per camp {guard → raid nearest target → return};
  spawn rate scales with turn (raider grace 8, every 7 turns, raider cap area/110 min 2,
  ~30% archers / 70% warriors; new camps every 14 turns, capped by area/200 clamp [3,12]).

## 13. Rendering architecture

- One Pixi `Application`; world root `Container` transformed by camera (pan/zoom, clamp to map
  bounds, zoom 0.4–2.5, wheel-to-cursor zoom, DPR-aware resize).
- Layer stack (bottom→top): terrain (features + resource seals baked into the cached
  hex texture) → rivers (separate vector-stroke layer) → territory borders → fog-of-war → units → city → **overlay** (selection ring + path-preview
  dots + hold-RMB move-range shading: tiles reachable *this turn* in gold, tiles reachable
  *next turn* in paler parchment; painted as semi-transparent hex fills, cleared on
  selection change). No floating combat text in v0.
- Barbarian camps stamp the `assets/art/ui/barbarian-camp.svg` hex seal as a preloaded Pixi
  texture (docs/ART_STYLE.md); the drawn-tents `Graphics` remain as the load-failure fallback.
- **Texture caching**: each (terrain × elevation × feature × resourceId) hex is drawn once as vector `Graphics`
  → `renderer.generateTexture` → batched `Sprite`s. Unit/city tokens likewise. The chrome palette module (`render/palette.ts`) is
  the single source of chrome/overlay color truth; terrain fills live in `content/terrains.ts`, civ colors in `content/civs.ts` (swap for sprites later without sim changes).
- Fog of war: hidden tiles not drawn; remembered tiles drawn with dim overlay; visible full.
  Visibility sets recomputed by `systems/visibility.ts` on any unit/city/border change.
- Perf budget: ≤ 8 ms/frame at zoom 1 on Huge (4,536 static sprites ≈ a handful of draw calls);
  no per-frame allocation in the render loop; camera changes only touch transforms.
- UI is DOM (Preact) layered above the canvas; minimap is its own tiny canvas sampling tile colors.

## 14. Input mapping

| Input                     | Action                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| LMB                       | select own unit/city; click enemy in range ⇒ attack                   |
| RMB (click)               | move along previewed path; brief range flash (700ms fade)             |
| RMB (hold)                | show move-range shading (gold = this turn, parchment = next turn)     |
| Hover                     | tile tooltip (terrain/features/resource/river, yields, move cost; owner + city only when visible) |
| LMB-drag / WASD / arrows  | pan camera                                                            |
| Wheel                     | zoom to cursor                                                        |
| `N`                       | cycle to the next own unit that needs orders (camera centers on it)   |
| Space / Enter             | end turn                                                              |
| Esc                       | close the topmost open modal (pause menu → save → tech → dev → diplomacy → selection), else open the pause menu |

Hotkeys are ignored while typing in form fields and after the game has ended (GameShell
hotkeys `N`/`Space`/`Enter`/`Esc` enforce this; raw WASD/arrows camera pan in
`input/InputController` has no typing/winner guard). `GameShell` owns `N`/`Space`/`Enter`/`Esc`
(and the dev `` ` ``/`~` toggle lives in `DevPanel`); `input/InputController`
converts DOM events → camera ops or **intents**; intents that mutate the
game go through the same `submitCommand`/`dispatch` path as AI commands (no UI-side mutation).

## 15. Persistence

- **Format**: `{ magic:'SIV', version:1, savedAtIso, meta:{turn, civName}, state: GameState }`.
- **IndexedDB** db `siv-saves`, store `slots` keyed `autosave | slot1 | slot2 | slot3`
  (plus a temporary `backup-pre-scan` key used once during the 2026-08-26 audit).
  Autosave overwrites each turn (and once at game start, turn 1). Export/import via file picker (`.json`, e.g. `siv-rome-turn12.json`).
- Saves validate **structurally** on load (`validateSaveFile` checks magic/version/state shape,
  not a full Zod re-validation of every field); anything else refuses to load with a clear error
  (never load corrupt state).

## 16. Testing strategy

- **Unit/integration (Vitest)** — 171 tests green as of 2026-09-06 across
  `tests/engine/{rng,mapgen,movement,visibility,cityEconomy,combat,ai,dev,victory,golden}.test.ts`,
  `tests/save/persistence.test.ts`, `tests/art/registry.test.ts` (every content unit/building/
  resource/civ id resolves through the art registry; every seal carries the canonical frame,
  milled ring, ink contour, gold touch and bare-name title), plus the `tests/architecture.test.ts` guard (`engine/**`
  never imports render/ui/input/save/app). Determinism is asserted via `hashState` equality.
- **Golden-simulation backstop** (`tests/engine/golden.test.ts`): duel map, seed 424242, 50
  scripted endTurns; asserts run-to-run `hashState` equality AND equality with the recorded
   golden hash (`1c1a573`, bumped 2026-09-06 by the escort-spawn QoL — see AGENTS.md § Status). Bump the recorded hash **only** for intentional engine changes,
   and note it in `AGENTS.md` (§ Status).
- **E2E (Playwright)**: eight specs under `tests/e2e/` run with `npm run e2e` (needs
  `npx playwright install chromium` once): two boot specs (menu → new game boots map+HUD;
  end turn advances the turn counter), four UX specs (Esc pause menu, Space end turn,
  Diplomacy panel, found-city → queue → Buy button) and two **screenshot baselines**
  (menu + in-game at 1600×900, 2% pixel tolerance for GPU antialiasing differences;
  regenerate deliberately with `npx playwright test tests/e2e/screenshots.spec.ts --update-snapshots`).

## 17. Performance & memory budgets

- Boot (content validate + menu) < 1 s; new-game generation (Huge) < 1.5 s.
- Pan/zoom ≥ 55 fps on Huge map (integrated GPU). Save file < 4 MB (JSON, no compression in v0).
- No per-frame object churn in render loop; texture cache invalidated only on palette/theme change.

## 18. Milestones (acceptance criteria)

| M | Deliverable | Done when |
|---|-------------|-----------|
| M0 | Skeleton (this scaffold) | boots, menu → seeded stub map renders, camera pans/zooms, typecheck+tests green |
| M1 | World | full mapgen presets + rivers/resources/starts, FOW 3-state, minimap live |
| M2 | Empire loop | units move (A*, ZOC), found cities, city screen, production, research, growth, borders |
| M3 | Conflict | 1UPT combat + promotions, city siege/capture, barbarians |
| M4 | Opponents | utility AI all categories, minimal diplomacy, 4 difficulties |
| M5 | Ship v0 | Domination + score endings, saves/export, content complete (6 playable civs + barbarians / 39 techs), balance pass, e2e stable |

> Status 2026-09-06: M0–M5 all implemented, balance pass done (monument +1S science floor,
> planner army diminishing returns + recon-out-of-military + zero-science monument priority,
> barbarian pressure retuned: spawn every 7, raider cap area/110, camp cap area/200 min 3,
> initial camps ~1/300; golden hash `4a6b55a` then `1c1a573` (escort-spawn QoL, with intent).
> Session history lives in `AGENTS.md` (§ Status).

## 19. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Sim/UI drift (UI mutating state) | architecture guard test + selectors read-only by convention |
| Nondeterminism sneaking in | golden-sim hash test in CI; lint ban on `Math.random`/`Date.now` in `engine` |
| Pixi v8 API churn | pin exact minor; isolate behind `render/` so swap cost is local |
| AI perf on Huge maps | candidate caps + fixed-order budgeting; profile harness in `tools/` later |
| Content balance whack-a-mole | all numbers in validated data files; balance dump script post-M5 |
