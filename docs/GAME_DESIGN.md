# SIV — Game Design Document (v0)

> A desktop-only, Civilization VI–style 4X strategy game for the web.
> Companion document: [SPEC.md](./SPEC.md) (technical architecture & implementation detail).

## 1. Vision

SIV distills the classic 4X loop — **eXplore, eXpand, eXploit, eXterminate** — into a fast,
deterministic, browser-native strategy game. v0 targets a complete half-length campaign
(Ancient → Renaissance) against AI opponents, ending in Domination or a score decision.

### Design pillars

1. **One more turn** — every turn ends with a visible, desirable next objective.
2. **Readable depth** — dense information HUD, but every number explainable via tooltips.
3. **Determinism** — same seed + same commands ⇒ same game. Enables tests, replays, and future multiplayer.
4. **Vector tabletop aesthetic** — everything drawn programmatically; cohesive parchment-and-ink look with zero asset pipeline.

## 2. Platform & scope

| Aspect      | Decision                                            |
|-------------|-----------------------------------------------------|
| Platform    | Desktop web browsers (viewport gate ≥ 1280×720)     |
| Players     | Single human vs AI civs                             |
| Multiplayer | Out of scope for v0 (architecture keeps the door open) |
| Session     | Save/resume via autosave + manual slots + file export |

## 3. Feature matrix

### In v0

- **Hex world**: pointy-top hex map; seeded procedural presets — Pangaea, Continents,
  Archipelago, Fractal; latitude biome bands; rivers; resources; balanced start placement.
- **3 eras**: Ancient → Medieval → Renaissance (~150–250 turns on Standard).
- **6 civilizations**, each with a civilization trait, a unique unit, and a unique building.
- **39 techs** across four research lanes; 20 unit types (6 civ-unique); 29 buildings
  (8 wonders, 6 civ-unique).
- **Classic single-tile cities**: growth by food, production, citizens working owned tiles,
  culture-driven border expansion, buildings.
- **Yields**: Food · Production · Gold · Science · Culture (no faith, no tourism).
- **1UPT combat**: melee / ranged / cavalry / siege / recon / naval classes; zone of control;
  fortify/sleep actions; healing; XP with auto-granted promotions.
- **Barbarian camps** with scripted raider behavior (early-game pressure).
- **Minimal diplomacy**: contact discovery, relations score, declare war / peace / denounce —
  human-facing **Diplomacy panel** (topbar button or Esc menu); the AI accepts peace by utility,
  and rejections surface as toasts.
- **Victory: Domination** — hold every rival civ's original capital at the end of your turn.
  Pragmatic fallback: when the turn limit is reached, highest score wins (score = yields +
  territory + population aggregate).
- **AI**: utility-based planner for civs; scripted FSM for barbarians; 4 difficulty levels.
- **UI**: dense strategy HUD (top yield bar with big-treasury + small `+/−`/turn format,
  right minimap, right unit dock under the minimap, left city panel with grouped
  Buildings / Wonders / Units rows, bottom End Turn), tooltips where wired, no tutorial
  (per design decision).
- **Art**: vector tabletop style — all terrain/units drawn programmatically, palette-driven,
  swappable for sprite assets later.
- **Persistence**: autosave each turn, 3 manual slots (IndexedDB), export/import `.siv.json`.

### Explicitly out of scope for v0 (backlog)

Religion & faith · tourism/cultural victory · city-states · world congress · grievances ·
loyalty · espionage · great people · trade routes · policies/governments · online multiplayer ·
mobile/touch support · audio (post-v0 nicety) · mod loader UI (data files are mod-ready by construction).

## 4. World & map generation

- **Sizes**: Duel 36×24 · Small 48×30 · Standard 60×38 · Large 72×46 · Huge 84×54.
- **Presets**: shape landmass distribution via noise masks over fBm heightmaps:
  - *Pangaea* — one dominant landmass, low sea cutoff, center-weighted falloff.
  - *Continents* — two major landmasses from seeded attractor blobs.
  - *Archipelago* — high sea cutoff, ridged-noise island chains.
  - *Fractal* — raw noise, no shaping; anything goes.
- **Terrain stack per tile**: base terrain (ocean, coast, grassland, plains, desert, tundra, snow)
  × elevation (flat, hills, mountains) × features (forest, jungle, marsh, ice, oasis, floodplain)
  × rivers (per-edge) × resource (optional).
- **Resources**: probability tables per biome; luxury resources seeded to guarantee each civ
  reasonable amenity income; strategic resources (horses, iron) appear from Ancient onward.
- **Start placement**: scored candidates (yield sum radius-2, fresh-water bonus, coast bonus),
  spread with minimum distance between civs, snake-draft assignment.

## 5. Civilizations (first-pass concepts — balance TBD)

| Civ       | Trait (concept)                     | Unique unit            | Unique building        |
|-----------|-------------------------------------|------------------------|------------------------|
| Rome      | "All Roads Home" — +15% production toward buildings | Legion (strong melee)  | Forum (+gold, +science) |
| Egypt     | "Gift of the Nile" — +1 food on riverside tiles     | War Chariot (ignores rough-terrain move cost) | Mastaba (+culture) |
| Greece    | "Philosophers" — +2 science per city                | Hoplite (strong spear) | Acropolis (+culture)   |
| Norse     | "Seafarers" — cheaper embark, naval +1 movement     | Berserker (amphibious attack bonus) | Stave Church (+production from forest) |
| Mongolia  | "Steppe Raiders" — cavalry units −1 maintenance     | Keshik (ranged cavalry)| Ordu (+XP for cavalry) |
| China     | "Inventive Heritage" — +10% science                 | Chu-Ko-Nu (extra attack) | Shi (+gold) |

Wonders (8 across eras): Pyramids, Great Library, Stonehenge, Colossus, Hagia Sophia,
Notre-Dame, Machu Picchu, Angkor Wat — mechanically "one-per-world big buildings"
with culture/science/economy payoffs. Full effects defined in content data.

## 6. Cities & economy

- **Founding**: settler unit founds a city on any valid land tile (not adjacent-to-adjacent of
  another city's center; minimum 3-tile spacing between city centers).
- **Growth**: food surplus accumulates toward threshold `14 + 7·pop^1.4`; deficit starves
  stored food then population.
- **Worked tiles**: city auto-assigns citizen slots (pop count) to owned tiles maximizing
  weighted yield score (food > production early, gold/science later); manual assignment deferred post-v0.
- **Borders**: each city accumulates culture; cost of next tile `12 + 4·owned^1.1`;
  acquisition picks best-scoring adjacent unowned tile (deterministic tie-break by tile id).
- **Production**: single slot — picking an item replaces whatever was queued; overflow carries.
- **Gold**: pays unit + building maintenance; treasury clamps at 0 (no bankruptcy penalty in v0).
- **Happiness**: not implemented in v0 — luxuries currently act as yield/trade flavor only
  (design intent above remains the target).

## 7. Tech tree

- Four lanes: **Military**, **Economy**, **Science**, **Culture/Civic** — cross-lane prerequisites.
- ~13 techs per era; costs scale Ancient 25–60 → Medieval 120–250 → Renaissance 300–500 beakers.
- Techs unlock: units, buildings, wonders, embarkment (Ancient end), naval era upgrades.
- Research chosen manually; science rolls over if nothing selected (stored progress).

## 8. Units & combat

- **Classes**: Melee, Ranged, Cavalry, Siege, Recon, Naval. One military unit per tile (1UPT);
  civilians (settler, worker-lite) may share with military.
- **Movement**: class-based terrain costs (hills/forest cost 2 unless class ignores), roads
  deferred post-v0; zone of control stops movement adjacent to enemy military.
- **Combat math** (full formulas in SPEC): effective strength scales down with wounds
  (`0.5 + 0.5·hp/100`); strength differential drives exponential damage `30·e^(0.045·Δ)` with
  ±20% variance. Melee is mutual (both sides deal damage; if both would die the attacker survives
  at 1 HP), ranged takes no retaliation. No terrain/fortify/flanking modifiers in v0.
- **XP & promotions**: 5 XP per kill, 2 per hit; promotions auto-grant at 15/30/60 XP from four
  flat +3-strength picks (shock / drill / veteran / siege).
- **Healing**: +10 hp/turn in the field, +20 in an own city (applied at turn start, move freely).
- **Cities under siege**: defense strength `8 + 2·pop + Σ building def + garrison/2`; city HP
  starts at 100; captured by melee at HP 0 (pop halved, palace lost, HP resets to 50).
  Barbarians raid instead of ruling: they plunder treasury and withdraw. Original capitals
  tracked for Domination.

## 9. Barbarians

Camps spawn in fog-of-war areas at a slow rate; each camp spawns raiders that target nearest
improvement/city/unit with simple FSM (guard → raid → return). Clearing camps grants gold.
No barbarian diplomacy, no camp-adjacent settling penalty in v0 (backlog).

## 10. Diplomacy (minimal)

- Civs are hidden until contacted (line-of-sight meeting).
- Per-pair relations score −100..+100 modified by: bordering pressure, declared wars, denounced
  status, captured-cities history, difficulty baseline.
- Actions available: **Declare War**, **Offer Peace** (AI accepts by utility threshold),
  **Denounce** (−relations, unlocks AI aggression weighting). No trades in v0.

## 11. Victory conditions

| Type       | Condition                                                        |
|------------|------------------------------------------------------------------|
| Domination | Hold every other remaining civ's original capital at end of turn |
| Score      | Turn limit reached → highest composite score wins (fallback)     |

Score = Σ(cities×3 + pop×2 + tiles×0.25 + techs×4 + wonders×5).

## 12. AI opponents

- **Utility planner** (civs): each AI turn enumerates candidate actions per category — settle
  spots, build items, research picks, war declarations, unit orders — scores them against
  personality weights `{aggression, expansionism, scienceFocus, defensiveness}` and executes
  top-scoring synchronously inside the turn wrap (deterministic ordering everywhere, no
  wall-clock budgeting).
- **Barbarians**: scripted FSM, not utility-scored.
- **Difficulty** (yields bonus to AI / combat str bonus): Peaceful +0%/+0 · Standard +10%/+1 ·
  Hard +20%/+2 · Brutal +35%/+3.

## 13. UI/UX

- **Dense strategy HUD**: top bar (yields/turn/research/menu), right dock (minimap + notification
  stack), bottom-left unit panel with action buttons, bottom-right End Turn.
- **Screens**: Main Menu (new game config: preset, size, difficulty, civ pick, seed), Game Shell,
  City Screen (with buy-production), Tech Tree, **Diplomacy panel**, **Escape menu** (resume,
  save/load, diplomacy, resign, quit), Save/Load modal, Victory/Defeat overlay, Dev cheat panel
  (`` ` ``/`~`, includes a save-slot maintenance row).
- **Input**: LMB select · click enemy in range to attack · RMB click to move with path
  preview · RMB hold to flash move-range shading (gold = this turn, parchment = next
  turn) · hover tile tooltip · wheel zoom · drag/WASD pan · `N` next unit needing orders ·
  Space/Enter end turn · Esc closes the topmost modal or opens the Escape menu.
- **Tooltips**: everywhere — top-bar yields, city-screen yields, production cards (stats +
  missing tech), tech cards (cost/prereqs/unlocks) and map tiles (terrain, features, resource,
  river, yields, move cost; owner/city when visible). No tutorial flow in v0.

## 14. Art direction — "vector tabletop"

Parchment-and-ink palette: warm desaturated land tones, deep teal oceans, ink-outlined hexes,
flat-color unit tokens with class sigils drawn as vector shapes. Everything rendered
programmatically (canvas vector drawing → cached textures). Palette tokens live in one module so
a future sprite pack can replace rendering without touching simulation code.

The HUD/icon layer follows the **"Gilded Hex Seals"** system specified in
[ART_STYLE.md](./ART_STYLE.md) — canonical hex-frame snippet, palette tokens and stroke
hierarchy live there; new SVG icons must satisfy all three theme pillars before shipping.
