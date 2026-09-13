/**
 * P2.4 in-game Help (civilopedia-lite): searchable reference index.
 *
 * Dependency-light by design: imports ONLY content defs + preact signals —
 * never engine/render/store. The index therefore builds from the first render
 * and is never phase-locked. Rendering lives in `screens/HelpOverlay.tsx`;
 * tooltip Tier-3 links (deferred P1.6) live in `hud/TileTooltip.tsx` and call
 * `openHelp(anchor)`.
 *
 * Topic-id catalog (stable; TileTooltip anchors + tests depend on these):
 *   unit-<unitId>        (20 units, e.g. unit-warrior)
 *   building-<bldgId>    (29 buildings/wonders, e.g. building-granary)
 *   tech-<techId>        (39 techs, e.g. tech-pottery)
 *   yield-<key>          (yield-food | yield-production | yield-gold |
 *                         yield-science | yield-culture)
 *   resource-<resId>     (19 resources, e.g. resource-wheat)
 *   civ-<civId>          (7 civs incl. civ-barbarians, unplayable)
 *   terrain-<terrainId>  (7 terrains, e.g. terrain-grassland)
 *   feature-<featureId>  (4 features, e.g. feature-forest)
 *   concept-zoc          Zone of Control
 *   concept-1upt         One Unit Per Tile
 *   concept-diplomacy    relations and drift
 *   concept-barbarians   camps, guards, raiders, rewards
 *   concept-combat       damage formula, XP, city defense
 *   concept-healing      field / own-city healing
 *   concept-city-growth  growth, worked tiles, borders
 *   concept-production   single-slot production and Buy
 *
 * GAME SHELL WIRING (to be applied by the integrator — do NOT add key
 * listeners in HelpOverlay; the global Esc chain lives in GameShell):
 *
 *   import { HelpOverlay } from './HelpOverlay';
 *   import { closeHelp, helpOpen } from '../help';
 *
 *   // 1. Mount point — next to the other modals in the GameShell JSX:
 *   <TechTree />
 *   <DiplomacyPanel />
 *   <HelpOverlay />          // <-- add here
 *   <VictoryScreen />
 *
 *   // 2. Esc chain — insert FIRST in handleEscapeKey() so Help backs out
 *   //    topmost, before every other modal:
 *   function handleEscapeKey(): void {
 *     if (helpOpen.value) {   // <-- add this block first
 *       closeHelp();
 *       return;
 *     }
 *     if (escapeMenuOpen.value) { ... }
 *
 *   // 3. Help button suggestion — a TopBar ghost button beside Diplomacy:
 *   import { openHelp } from '../help';
 *   <button class="btn-ghost" data-testid="open-help" title="In-game help"
 *     onClick={() => openHelp()}>Help</button>
 *   (Also consider an Esc-menu row via openHelp() and a "?" affordance on
 *   the TechTree header later; both are one-line openHelp() calls.)
 *
 *   // 4. Suggested e2e assertions (for the integrator's spec):
 *   //    - open-help button shows help-overlay; help-search filters to
 *   //      help-entry-unit-warrior on query "warr"
 *   //    - Esc with help open closes the overlay instead of the pause menu
 *   //    - hovering a tile and clicking [data-testid^="help-link-"] opens
 *   //      the overlay at the matching entry
 */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import type { ContentDb } from '@/content';

export type HelpCategory =
  | 'unit'
  | 'building'
  | 'tech'
  | 'yield'
  | 'resource'
  | 'civ'
  | 'terrain'
  | 'feature'
  | 'concept';

export interface HelpEntry {
  /** Stable topic id, e.g. "unit-warrior" or "concept-zoc". */
  id: string;
  title: string;
  category: HelpCategory;
  /** Extra search text: aliases, abbreviations, related terms. */
  keywords: string;
  /** Body paragraphs separated by blank lines. No emojis. */
  body: string;
}

export const HELP_CATEGORY_LABEL: Record<HelpCategory, string> = {
  unit: 'Unit',
  building: 'Building',
  tech: 'Technology',
  yield: 'Yield',
  resource: 'Resource',
  civ: 'Civilization',
  terrain: 'Terrain',
  feature: 'Feature',
  concept: 'Concept',
};

/** Overlay visibility. Always set via openHelp()/closeHelp(). */
export const helpOpen = signal(false);
/** Requested topic; null = browse from the top of the result list. */
export const helpTopicId = signal<string | null>(null);

export function openHelp(topicId?: string): void {
  if (topicId !== undefined) helpTopicId.value = topicId;
  helpOpen.value = true;
}

export function closeHelp(): void {
  helpOpen.value = false;
}

// ---------------------------------------------------------------------------
// Index construction (pure over the content db)
// ---------------------------------------------------------------------------

type YieldsLike = { food: number; production: number; gold: number; science: number; culture: number };

const YIELD_NAMES: Record<keyof YieldsLike, string> = {
  food: 'Food',
  production: 'Production',
  gold: 'Gold',
  science: 'Science',
  culture: 'Culture',
};

/** "2 Food, 1 Production" — skips zero lines. */
function fmtYields(y: YieldsLike): string {
  const parts: string[] = [];
  for (const key of ['food', 'production', 'gold', 'science', 'culture'] as const) {
    if (y[key] !== 0) parts.push(`${y[key] > 0 ? '+' : ''}${y[key]} ${YIELD_NAMES[key]}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no yields';
}

function fmtYieldsAbs(y: YieldsLike): string {
  const parts: string[] = [];
  for (const key of ['food', 'production', 'gold', 'science', 'culture'] as const) {
    if (y[key] !== 0) parts.push(`${y[key]} ${YIELD_NAMES[key]}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no yields';
}

function techName(db: ContentDb, id: string | undefined): string | undefined {
  return id ? db.techs[id]?.name : undefined;
}

function civName(db: ContentDb, id: string | undefined): string | undefined {
  return id ? db.civs[id]?.name : undefined;
}

function buildUnitEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.units)
    .map((u) => {
      const lines: string[] = [];
      const stats =
        u.unitClass === 'ranged' || u.unitClass === 'siege'
          ? `Attack ${u.rangedStrength} (range ${u.range}) · Defense ${u.strength}`
          : `Strength ${u.strength}`;
      lines.push(
        `${u.unitClass} · ${u.era} era · Cost ${u.cost} hammers\n${stats} · Moves ${u.moves} · Sight ${u.sightRange} · Upkeep ${u.maintenance} gold/turn`,
      );
      const tech = techName(db, u.requiresTechId);
      if (tech) lines.push(`Unlocked by ${tech}.`);
      const civ = civName(db, u.uniqueToCivId);
      if (civ) lines.push(`Unique to ${civ}.`);
      if (u.id === 'settler') {
        lines.push('Founds cities (the Settler is consumed). Cannot attack; capture it by stepping onto its tile.');
      }
      if (u.unitClass === 'civilian') lines.push('Civilian: cannot attack and projects no zone of control.');
      lines.push('Water and mountains are impassable (no embark in v0).');
      return {
        id: `unit-${u.id}`,
        title: u.name,
        category: 'unit' as const,
        keywords: `${u.id} ${u.unitClass} ${u.era}`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildBuildingEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.buildings)
    .map((b) => {
      const lines: string[] = [];
      lines.push(
        `${b.era} era · Cost ${b.cost} hammers · Upkeep ${b.maintenance} gold/turn\n${fmtYieldsAbs(b.yields)}${b.defenseStrength > 0 ? ` · City defense +${b.defenseStrength}` : ''}${b.amenityPoints > 0 ? ` · +${b.amenityPoints} amenity` : ''}`,
      );
      if (b.isWonder) lines.push('Wonder: one per world. Cannot build duplicates of any building.');
      const tech = techName(db, b.requiresTechId);
      if (tech) lines.push(`Requires ${tech}.`);
      const civ = civName(db, b.uniqueToCivId);
      if (civ) lines.push(`Unique to ${civ}.`);
      if (b.id === 'palace') {
        lines.push('Palace: granted free to every first city (capital). Never queueable.');
      }
      return {
        id: `building-${b.id}`,
        title: b.name,
        category: 'building' as const,
        keywords: `${b.id} ${b.era}${b.isWonder ? ' wonder' : ''}`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildTechEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.techs)
    .map((t) => {
      const lines: string[] = [];
      lines.push(`${t.era} era · ${t.lane} lane · Cost ${t.cost} beakers`);
      const prereqs = (t.prereqIds ?? []).map((p) => db.techs[p]?.name ?? p);
      lines.push(prereqs.length > 0 ? `Needs: ${prereqs.join(', ')}.` : 'No prerequisites.');
      const unlocks = [
        ...Object.values(db.units)
          .filter((u) => u.requiresTechId === t.id)
          .map((u) => u.name),
        ...Object.values(db.buildings)
          .filter((b) => b.requiresTechId === t.id)
          .map((b) => b.name),
      ];
      if (unlocks.length > 0) lines.push(`Unlocks: ${unlocks.join(', ')}.`);
      return {
        id: `tech-${t.id}`,
        title: t.name,
        category: 'tech' as const,
        keywords: `${t.id} ${t.lane} ${t.era} research`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildYieldEntries(): HelpEntry[] {
  const defs: Array<{ key: keyof YieldsLike; keywords: string; body: string }> = [
    {
      key: 'food',
      keywords: 'yield growth farm',
      body: 'Surplus Food is stored each turn and grows the city: the bar fills at about round(14 + 7 x pop^1.4) food, then population rises by 1.\n\nWithout enough Food the stored bar drains; a starving city shrinks by 1 population (never below 1).\n\nWorked tiles are picked automatically by score (1.2 Food + 1.1 Production + 0.7 Gold + 1.3 Science + 1.0 Culture); the city center is always worked for free.',
    },
    {
      key: 'production',
      keywords: 'yield hammers build',
      body: 'Production (hammers) fills the single build slot: each turn the city adds its hammers to the queued unit or building until its cost is met.\n\nSee also: Production and Buy.',
    },
    {
      key: 'gold',
      keywords: 'yield money treasury upkeep buy riverside river',
      body: 'Gold flows into the shared treasury. Each turn buildings charge maintenance and units charge upkeep; the top bar shows the net per turn. The treasury never drops below zero.\n\nGold finishes a queued item instantly via Buy (3 gold per remaining hammer, rounded up).\n\nRiverside tiles give +1 Gold.',
    },
    {
      key: 'science',
      keywords: 'yield beakers research technology',
      body: 'Science (beakers) is banked empire-wide and spent on the active research pick. Tech-tree nodes show turns remaining at the current rate.\n\nThe Monument gives +1 Science so research can never stall at zero; the Palace gives +2.',
    },
    {
      key: 'culture',
      keywords: 'yield borders expansion',
      body: 'Culture expands borders: each city banks it and, at about round(12 + 4 x owned-tiles^1.1), claims the best adjacent unowned land tile.\n\nThe Monument gives +2 Culture and the Palace +1.',
    },
  ];
  return defs.map((d) => ({
    id: `yield-${d.key}`,
    title: YIELD_NAMES[d.key],
    category: 'yield' as const,
    keywords: d.keywords,
    body: d.body,
  }));
}

function buildResourceEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.resources)
    .map((r) => {
      const lines: string[] = [];
      const kind = r.kind === 'bonus' ? 'Bonus' : r.kind === 'strategic' ? 'Strategic' : 'Luxury';
      lines.push(
        `${kind} resource · Found on: ${r.terrains.map((t) => db.terrains[t]?.name ?? t).join(', ')}\nTile bonus: ${fmtYields(r.yieldsDelta)}`,
      );
      if (r.kind === 'luxury') lines.push('Luxuries give amenities plus gold.');
      if (r.kind === 'strategic') lines.push(`Strategic deposit of ${r.amountMin}-${r.amountMax}.`);
      return {
        id: `resource-${r.id}`,
        title: r.name,
        category: 'resource' as const,
        keywords: `${r.id} ${r.kind}`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildCivEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.civs)
    .map((c) => {
      const lines: string[] = [];
      lines.push(`Led by ${c.leaderName}.\nTrait: ${c.traitName} — ${c.traitDescription}\nCiv traits are display-only in v0 (no simulation effect).`);
      const uu = c.uniqueUnitId ? db.units[c.uniqueUnitId]?.name : undefined;
      const ub = c.uniqueBuildingId ? db.buildings[c.uniqueBuildingId]?.name : undefined;
      if (uu || ub) lines.push(`Uniques: ${[uu, ub].filter(Boolean).join(' · ')}.`);
      if (c.id === 'barbarians') {
        lines.push('Unplayable raider faction. See also: Barbarians.');
      }
      return {
        id: `civ-${c.id}`,
        title: c.name,
        category: 'civ' as const,
        keywords: `${c.id} ${c.leaderName} ${c.traitName} civilization`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildTerrainEntries(db: ContentDb): HelpEntry[] {
  return Object.values(db.terrains)
    .map((t) => {
      const lines: string[] = [];
      lines.push(
        `Yields: ${fmtYieldsAbs(t.yields)} · Movement cost ${t.movementCost}${t.isWater ? ' · Water: impassable (no embark in v0)' : ''}`,
      );
      const found = Object.values(db.resources)
        .filter((r) => r.terrains.includes(t.id))
        .map((r) => r.name);
      if (found.length > 0) lines.push(`Resources found here: ${found.join(', ')}.`);
      if (!t.isWater) lines.push('Mountains (elevation) are impassable to every unit.');
      return {
        id: `terrain-${t.id}`,
        title: t.name,
        category: 'terrain' as const,
        keywords: `${t.id} tile yields movement`,
        body: lines.join('\n\n'),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildFeatureEntries(): HelpEntry[] {
  const db = buildContentDb();
  return Object.values(db.features)
    .map((f) => ({
      id: `feature-${f.id}`,
      title: f.name,
      category: 'feature' as const,
      keywords: `${f.id} tile yields movement`,
      body: `Movement +${f.movementCostDelta} to enter · Tile bonus: ${fmtYields(f.yieldsDelta)}\n\nThere are no terrain combat modifiers in v0.`,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function buildConceptEntries(): HelpEntry[] {
  const concepts: HelpEntry[] = [
    {
      id: 'concept-zoc',
      title: 'Zone of Control (ZOC)',
      category: 'concept',
      keywords: 'zone of control zoc movement stop enemy',
      body: 'Any tile adjacent to an enemy military unit is under its zone of control. Entering such a tile consumes all remaining movement — the move ends there.\n\nCivilians project no ZOC. Crossing a river also ends the move.',
    },
    {
      id: 'concept-1upt',
      title: 'One Unit Per Tile (1UPT)',
      category: 'concept',
      keywords: '1upt one unit per tile stacking occupancy move block capture civilian',
      body: 'Only one unit may stand on a tile. An occupied destination blocks paths, so armies cannot pass through each other.\n\nException: stepping onto an enemy civilian captures it. Plan one tile ahead when escorting Settlers.',
    },
    {
      id: 'concept-diplomacy',
      title: 'Diplomacy: relations and drift',
      category: 'concept',
      keywords: 'diplomacy relations drift war peace denounce attitude opinion',
      body: 'Relations run from -100 to +100 and drift every turn: +1 toward peace by default, -4 while at war, -2 while borders touch.\n\nDeclaring war costs -40, making peace gives +20, denouncing costs -25 and locks further denunciations for 20 turns.\n\nMeet rivals to open the Diplomacy panel (top bar or Esc menu): declare war, offer peace, denounce. Rejected peace offers surface as toasts.',
    },
    {
      id: 'concept-barbarians',
      title: 'Barbarians',
      category: 'concept',
      keywords: 'barbarian camp raider guard raid plunder',
      body: 'Barbarian camps spawn far from starting lands (4+ hexes out, about one per 300 tiles); new camps appear every 14 turns up to an area-based cap.\n\nCamp guards hold position while raiders (about 30% archers, 70% warriors) roam a radius of 6. Raider parties start arriving from turn 8, every 7 turns.\n\nClearing a camp pays 40 gold plus a tenth of the turn count. If barbarians take a city they plunder it instead of capturing: you lose up to 30 gold plus the turn count, and the city resets to 10 HP.',
    },
    {
      id: 'concept-combat',
      title: 'Combat formula',
      category: 'concept',
      keywords: 'combat formula damage strength attack ranged melee xp promotion defense city',
      body: 'Damage = round(30 x e^(0.045 x difference) x U), where difference is attacker minus defender strength and U is a roll between 0.8 and 1.2. Melee is mutual (both sides deal), ranged attacks (range 2) are safe.\n\nWounded units fight weaker: strength scales by 0.5 + 0.5 x hp/100. Units earn 5 XP per kill and 2 per hit, auto-promoting at 15/30/60 XP for +3 strength each (no choice in v0).\n\nCity defense = 8 + 2 x population + building defense + half the garrison. Cities start at 100 HP, regenerate +10 per turn up to 200, and fall to a melee attack at 0 HP. There are no terrain, fortify or flanking combat modifiers in v0 — fortifying only holds position.',
    },
    {
      id: 'concept-healing',
      title: 'Healing',
      category: 'concept',
      keywords: 'healing heal hp recover wounded repair fortify',
      body: 'At the start of their owner\'s turn, wounded units heal +10 HP in the field and +20 HP on a friendly city tile.\n\nFortifying grants no healing or combat bonus — it only holds position until the unit is woken.',
    },
    {
      id: 'concept-city-growth',
      title: 'City growth and borders',
      category: 'concept',
      keywords: 'city growth population food borders border expansion culture worked tiles starvation',
      body: 'Each turn the city banks its Food; at about round(14 + 7 x pop^1.4) it grows +1 population, and starvation shrinks it (never below 1). The center tile is always worked; each extra population works the next-best owned tile by score (1.2 Food + 1.1 Production + 0.7 Gold + 1.3 Science + 1.0 Culture) — assignment is automatic.\n\nBanked Culture claims the best adjacent unowned land tile at about round(12 + 4 x owned-tiles^1.1). The Palace gives +2 Production, +2 Science, +3 Gold, +1 Culture; the Monument gives +2 Culture and +1 Science.',
    },
    {
      id: 'concept-production',
      title: 'Production and Buy',
      category: 'concept',
      keywords: 'production buy gold hammers build queue wonder purchase rush',
      body: 'Each city has a single build slot: picking a new item replaces the old one, and hammers accumulate until the cost is met. Items need their tech (and civ, for uniques); buildings cannot repeat and wonders are one per world. The Palace is never queueable.\n\nBuy finishes the queued item immediately for 3 gold per remaining hammer (rounded up). Newly built units start with no movement that turn.',
    },
  ];
  return concepts.sort((a, b) => a.title.localeCompare(b.title));
}

/** Full reference index: generated content entries + hand-written concepts. */
export function buildHelpIndex(db: ContentDb = buildContentDb()): HelpEntry[] {
  return [
    ...buildConceptEntries(),
    ...buildYieldEntries(),
    ...buildUnitEntries(db),
    ...buildBuildingEntries(db),
    ...buildTechEntries(db),
    ...buildResourceEntries(db),
    ...buildCivEntries(db),
    ...buildTerrainEntries(db),
    ...buildFeatureEntries(),
  ];
}

let cached: HelpEntry[] | null = null;

/** Cached index for UI use; tests should prefer buildHelpIndex()/searchHelp(q, idx). */
export function getHelpIndex(): HelpEntry[] {
  if (!cached) cached = buildHelpIndex();
  return cached;
}

export function getHelpEntry(id: string, index: HelpEntry[] = getHelpIndex()): HelpEntry | undefined {
  return index.find((e) => e.id === id);
}

/**
 * Full-text search over title, id, keywords and body. Every token must match
 * somewhere (AND); title matches rank first, then id/keywords, then body.
 * An empty query returns the whole index in browse order.
 */
export function searchHelp(query: string, index: HelpEntry[] = getHelpIndex()): HelpEntry[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...index];
  const scored: Array<{ entry: HelpEntry; score: number }> = [];
  for (const entry of index) {
    const title = entry.title.toLowerCase();
    const id = entry.id.toLowerCase();
    const keywords = entry.keywords.toLowerCase();
    const body = entry.body.toLowerCase();
    let score = 0;
    let matchesAll = true;
    for (const t of tokens) {
      let tokenScore = 0;
      if (title.includes(t)) tokenScore += 3;
      if (id.includes(t)) tokenScore += 2;
      if (keywords.includes(t)) tokenScore += 2;
      if (body.includes(t)) tokenScore += 1;
      if (tokenScore === 0) {
        matchesAll = false;
        break;
      }
      score += tokenScore;
    }
    if (matchesAll) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((r) => r.entry);
}
