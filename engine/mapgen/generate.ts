/**
 * Map generation + initial state emission. Deterministic given options.
 * Pipeline: heightmap -> preset shape -> water -> latitude terrain ->
 * elevation -> coast -> rivers -> features -> resources -> scored starts
 * -> emit GameState (SPEC §7).
 */
import { Rng } from '../core/rng';
import type { BarbarianCamp, GameState, Player, PlayerId, TerrainKind, Tile, Unit, UnitId } from '../core/types';
import { offsetToAxial, axialToOffset, hexDistance, tilesInRange, neighborsOf } from '../hex/axial';
import { buildContentDb, type ContentDb } from '../../content';
import { BARBARIAN_CIV_ID, chooseCampSites } from '../systems/barbarian';
import { applyPreset, seaLevelFor, MAP_SIZES, type MapPresetId } from './presets';
import { ValueNoise2D } from './noise';
import { traceRivers } from './rivers';
import { placeFeatures, placeResources, guaranteeStartResources, scoreStartTile } from './populate';

export interface GameOptions {
  seed: number;
  preset: MapPresetId;
  sizeId: string;
  humanCivId: string;
  aiCivIds: string[];
  /** 0 Peaceful .. 3 Brutal */
  difficulty: number;
}

export function generateGame(options: GameOptions): GameState {
  const content = buildContentDb();
  const rng = new Rng(options.seed);
  const size = MAP_SIZES.find((s) => s.id === options.sizeId) ?? MAP_SIZES[2];
  const width = size.width;
  const heightRows = size.height;
  const n = width * heightRows;

  // --- noise channels ---
  const noiseHeight = new ValueNoise2D(rng);
  const noiseRidge = new ValueNoise2D(rng);
  const noiseMoisture = new ValueNoise2D(rng);
  const noiseElev = new ValueNoise2D(rng);

  // --- stage: heights ---
  const heights = new Float32Array(n);
  const cx = (width - 1) / 2;
  const cy = (heightRows - 1) / 2;
  const maxRad = Math.hypot(cx, cy) || 1;
  for (let row = 0; row < heightRows; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const raw = noiseHeight.fbm(col / 9, row / 9, 5);
      const ridge = noiseRidge.ridged(col / 7, row / 7, 4);
      const rad = Math.hypot(col - cx, row - cy) / maxRad;
      heights[idx] = applyPreset(options.preset, raw, ridge, rad);
    }
  }

  // --- stage: tiles (water + latitude terrain + elevation), keep moisture ---
  const seaLevel = seaLevelFor(options.preset);
  const centerRow = (heightRows - 1) / 2;
  const moisture = new Float32Array(n);
  const tiles: Tile[] = new Array(n);
  for (let row = 0; row < heightRows; row++) {
    const band = Math.abs(row - centerRow) / (centerRow || 1);
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const { q, r } = offsetToAxial(col, row);
      const tile: Tile = {
        id: idx,
        q,
        r,
        terrain: 'ocean',
        elevation: 'flat',
        features: [],
        riverEdges: [false, false, false, false, false, false],
      };
      const h = heights[idx];
      if (h < seaLevel) {
        tile.terrain = 'ocean';
      } else {
        const m = noiseMoisture.fbm(col / 11, row / 11, 3);
        moisture[idx] = m;
        tile.terrain = latitudeTerrain(band, m);
        const e = noiseElev.fbm(col / 6, row / 6, 4);
        if (e > 0.62 && h >= seaLevel + 0.04) tile.elevation = 'hills';
        if (e > 0.78 && h > 0.62) tile.elevation = 'mountain';
      }
      tiles[idx] = tile;
    }
  }

  // --- stage: coast pass (ocean adjacent to land becomes coast) ---
  const isLand = new Uint8Array(n);
  for (let i = 0; i < n; i++) isLand[i] = tiles[i].terrain !== 'ocean' ? 1 : 0;
  for (let i = 0; i < n; i++) {
    if (tiles[i].terrain !== 'ocean') continue;
    const { q, r } = tiles[i];
    for (const nb of neighborsOf(q, r)) {
      const nIdx = tileIndex(nb.q, nb.r, width, heightRows);
      if (nIdx >= 0 && isLand[nIdx]) {
        tiles[i].terrain = 'coast';
        break;
      }
    }
  }

  // --- stage: rivers (downhill from highland springs) ---
  traceRivers(tiles, heights, width, heightRows, rng, Math.max(3, Math.round(n / 110)));

  // --- stage: features + resources ---
  placeFeatures(tiles, moisture, width, heightRows, rng);

  // --- stage: scored start placement ---
  const playerCount = options.aiCivIds.length + 1;
  const eligible: number[] = [];
  for (const t of tiles) {
    if (t.terrain === 'ocean' || t.terrain === 'coast') continue;
    if (t.elevation === 'mountain') continue;
    eligible.push(t.id);
  }
  const scored = eligible
    .map((id) => ({ id, score: scoreStartTile(tiles, id, width, heightRows) }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
  const starts: number[] = [];
  const minDist = Math.max(7, Math.floor(Math.sqrt(n / Math.max(playerCount, 1)) / 2));
  for (const cand of scored) {
    if (starts.length === playerCount) break;
    const farEnough = starts.every(
      (s) => hexDistance(tiles[s].q, tiles[s].r, tiles[cand.id].q, tiles[cand.id].r) >= minDist,
    );
    if (farEnough) starts.push(cand.id);
  }
  // Fallback for cramped maps: relax distance before resorting to random picks.
  let relaxed = minDist;
  while (starts.length < playerCount && relaxed > 2) {
    relaxed -= 1;
    for (const cand of scored) {
      if (starts.length === playerCount) break;
      if (starts.includes(cand.id)) continue;
      const farEnough = starts.every(
        (s) => hexDistance(tiles[s].q, tiles[s].r, tiles[cand.id].q, tiles[cand.id].r) >= relaxed,
      );
      if (farEnough) starts.push(cand.id);
    }
  }
  while (starts.length < playerCount && eligible.length > 0) {
    const remaining = eligible.filter((id) => !starts.includes(id));
    if (remaining.length === 0) break;
    starts.push(rng.pick(remaining));
  }

  // Resources after starts so guarantees can force-place near capitals.
  placeResources(tiles, content, rng, starts);
  guaranteeStartResources(tiles, content, rng, width, heightRows, starts);

  // --- players ---
  const players: Player[] = [];
  const allCivIds = [options.humanCivId, ...options.aiCivIds];
  for (let pid = 0; pid < playerCount; pid++) {
    const civDef = content.civs[allCivIds[pid]];
    players.push({
      id: pid,
      civId: civDef.id,
      isHuman: pid === 0,
      alive: true,
      gold: 25,
      researchedTechIds: ['agriculture'],
      scienceStored: 0,
      metPlayerIds: [],
      relations: {},
      denouncedBy: [],
      warsWith: [],
      denounceTurns: {},
      exploredTileIds: markExplored(tiles, starts[pid], 3, width, heightRows),
      ...(pid > 0 ? { personality: civDef.personality } : {}),
    });
  }

  // --- barbarian pseudo-player (not in playerOrder; runs in the wrap phase) ---
  const barbId = players.length;
  players.push({
    id: barbId,
    civId: BARBARIAN_CIV_ID,
    isHuman: false,
    alive: true,
    gold: 0,
    researchedTechIds: ['agriculture'],
    scienceStored: 0,
    metPlayerIds: [],
    relations: {},
    denouncedBy: [],
    warsWith: [],
    denounceTurns: {},
    exploredTileIds: [],
  });

  // --- starting units ---
  const units: Record<UnitId, Unit> = {};
  let nextUnitId = 0;
  for (let pid = 0; pid < playerCount; pid++) {
    spawnUnit(units, content, nextUnitId++, starts[pid], pid, 'settler');
    spawnUnit(units, content, nextUnitId++, starts[pid], pid, 'warrior');
  }

  // --- barbarian camps: ~1 per 220 tiles, far from the civs ---
  const barbarianCamps: BarbarianCamp[] = [];
  const campCount = Math.max(1, Math.round(n / 220));
  for (const site of chooseCampSites(tiles, width, heightRows, starts, campCount)) {
    const camp: BarbarianCamp = { tileId: site, unitIds: [] };
    barbarianCamps.push(camp);
    const guard = spawnUnit(units, content, nextUnitId++, site, barbId, 'warrior');
    camp.unitIds.push(guard.id);
  }

  const gameRng = new Rng(options.seed + 101);
  return {
    version: 1,
    seed: options.seed,
    turn: 1,
    turnLimit: 250,
    difficulty: options.difficulty,
    playerOrder: players.slice(0, playerCount).map((p) => p.id),
    currentPlayerIndex: 0,
    map: { width, height: heightRows, tiles },
    players,
    units,
    cities: {},
    barbarianCamps,
    nextUnitId,
    nextCityId: 0,
    rngState: gameRng.state,
    winner: undefined,
  };
}

function spawnUnit(
  units: Record<UnitId, Unit>,
  content: ContentDb,
  id: UnitId,
  tileIdx: number,
  ownerId: PlayerId,
  typeId: string,
): Unit {
  const def = content.units[typeId];
  if (!def) throw new Error(`Missing unit definition: ${typeId}`);
  const unit: Unit = {
    id,
    typeId,
    ownerId,
    tileId: tileIdx,
    hp: 100,
    movementLeft: def.moves,
    attacksLeft: 1,
    fortified: false,
    slept: false,
    xp: 0,
    promotions: [],
  };
  units[id] = unit;
  return unit;
}

function latitudeTerrain(band: number, moisture: number): TerrainKind {
  if (band < 0.32) return moisture > 0.45 ? 'grassland' : 'plains';
  if (band < 0.55) {
    if (moisture > 0.66) return 'grassland';
    if (moisture > 0.33) return 'plains';
    return 'desert';
  }
  if (band < 0.72) return 'tundra';
  return 'snow';
}

function tileIndex(q: number, r: number, width: number, height: number): number {
  const { col, row } = axialToOffset(q, r);
  if (col < 0 || col >= width || row < 0 || row >= height) return -1;
  return row * width + col;
}

function markExplored(
  tiles: Tile[],
  centerIdx: number,
  radius: number,
  width: number,
  height: number,
): number[] {
  const c = tiles[centerIdx];
  const out: number[] = [];
  for (const t of tilesInRange(c.q, c.r, radius)) {
    const idx = tileIndex(t.q, t.r, width, height);
    if (idx >= 0) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}
