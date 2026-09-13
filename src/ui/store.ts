/**
 * Signals bridge between engine state and the Preact UI (SPEC §3: UI reads
 * state via selectors, mutates only through commands).
 */
import { signal } from '@preact/signals';
import type { Command, GameOptions, GameState, MapPresetId } from '@/engine';
import { currentPlayer, dispatch, generateGame } from '@/engine';
import type { GameEvent } from '@/engine';
import { buildContentDb } from '@/content';
import { Rng } from '@/engine/core/rng';
import type { MapRenderer } from '@/render/MapRenderer';
import type { SaveFile } from '@/save/persistence';
import { makeSaveFile, putSave, validateSaveFile } from '@/save/persistence';

export type Screen = 'menu' | 'game';

export const screenSignal = signal<Screen>('menu');

export interface GameSession {
  state: GameState;
  renderer: MapRenderer | null;
  version: number;
}

export const sessionSignal = signal<GameSession | null>(null);

/**
 * Bumped whenever a fresh session object replaces the old one (new game or
 * load). App keys GameShell on it so a mid-game load rebuilds the renderer.
 */
export const sessionSeqSignal = signal(0);

/** UI-only selection state (never part of GameState). */
export const selectionSignal = signal<{ unitId: number | null; cityId: number | null }>({
  unitId: null,
  cityId: null,
});

/** Recent event feed for the notification stack (newest last). */
export interface NotificationTarget {
  tileId: number;
  unitId?: number;
  cityId?: number;
}
export interface Notification {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
  /** Map jump destination (P1.2 Take-Me-There); absent for global news. */
  target?: NotificationTarget;
  /** Burst batching: consecutive identical toasts fold into one with a count. */
  count?: number;
}
export const notificationsSignal = signal<Notification[]>([]);
let notifSeq = 1;

export function pushNotification(
  text: string,
  kind: Notification['kind'] = 'info',
  target?: NotificationTarget,
): void {
  const list = notificationsSignal.peek();
  const last = list[list.length - 1];
  if (last && last.text === text && last.kind === kind) {
    last.count = (last.count ?? 1) + 1;
    if (target && !last.target) last.target = target;
    notificationsSignal.value = [...list];
    return;
  }
  const n: Notification = { id: notifSeq++, text, kind, target };
  notificationsSignal.value = [...list.slice(-5), n];
  setTimeout(() => {
    notificationsSignal.value = notificationsSignal.peek().filter((x) => x.id !== n.id);
  }, 7000);
}

/** Translate engine events into player-facing toasts (M2 minimal set). */
export function narrateEvents(events: GameEvent[]): void {
  if (events.length === 0) return;
  const s = sessionSignal.peek();
  if (!s) return;
  const content = buildContentDb();
  const humanId = s.state.players.find((p) => p.isHuman)?.id;
  // Map jump destination for a city toast (P1.2 Take-Me-There).
  const cityTarget = (cityId: number): NotificationTarget | undefined => {
    const c = s.state.cities[cityId];
    return c ? { cityId, tileId: c.tileId } : undefined;
  };
  const unitTarget = (unitId: number): NotificationTarget | undefined => {
    const u = s.state.units[unitId];
    return u ? { unitId, tileId: u.tileId } : undefined;
  };
  for (const ev of events) {
    switch (ev.kind) {
      case 'cityFounded': {
        const founder = s.state.cities[ev.cityId]?.ownerId;
        const p = founder !== undefined ? s.state.players[founder] : undefined;
        // Foreign news stays hidden until you've met them (fog-of-war courtesy).
        if (p?.isHuman) pushNotification(`Founded ${ev.name}`, 'good', cityTarget(ev.cityId));
        else if (p && p.metPlayerIds.some((id) => s.state.players[id]?.isHuman)) {
          pushNotification(`${content.civs[p.civId]?.name ?? 'A rival'} founded ${ev.name}`, 'info', cityTarget(ev.cityId));
        }
        break;
      }
      case 'cityGrew': {
        // Empire news stays home: rival city growth is never player-facing
        // (fog courtesy — same gate as cityFounded, Civ VI pattern).
        if (s.state.cities[ev.cityId]?.ownerId !== humanId) break;
        pushNotification(`${s.state.cities[ev.cityId]?.name ?? 'City'} grew to ${ev.population}`, 'good', cityTarget(ev.cityId));
        break;
      }
      case 'cityStarved': {
        if (s.state.cities[ev.cityId]?.ownerId !== humanId) break;
        pushNotification(`${s.state.cities[ev.cityId]?.name ?? 'City'} starved to ${ev.population}`, 'bad', cityTarget(ev.cityId));
        break;
      }
      case 'productionComplete': {
        if (s.state.cities[ev.cityId]?.ownerId !== humanId) break;
        const def = ev.item.kind === 'unit' ? content.units[ev.item.id] : content.buildings[ev.item.id];
        pushNotification(`${s.state.cities[ev.cityId]?.name ?? 'City'} completed ${def?.name ?? ev.item.id}`, 'good', cityTarget(ev.cityId));
        break;
      }
      case 'researchComplete':
        pushNotification(`Researched ${content.techs[ev.techId]?.name ?? ev.techId}`, 'good');
        break;
      case 'bordersExpanded': {
        if (s.state.cities[ev.cityId]?.ownerId !== humanId) break;
        pushNotification(`${s.state.cities[ev.cityId]?.name ?? 'City'} expanded its borders`, 'info', cityTarget(ev.cityId));
        break;
      }
      // turnBegan: the turn marker lives in the TopBar — a toast every turn
      // just buries real news (7s stack of six drowns in turn chips).
      case 'combatResolved': {
        const att = s.state.units[ev.attackerId];
        const target = ev.defenderCityId !== undefined
          ? s.state.cities[ev.defenderCityId]?.name ?? 'city'
          : s.state.units[ev.defenderUnitId ?? -1]
            ? content.units[s.state.units[ev.defenderUnitId ?? -1].typeId]?.name ?? 'unit'
            : 'unit';
        const who = att ? content.units[att.typeId]?.name ?? 'A unit' : 'A unit';
        const jump = att ? unitTarget(ev.attackerId) : undefined;
        pushNotification(`${who} hit ${target} (−${ev.dmgToDefender}/${ev.dmgToAttacker})`, 'info', jump);
        break;
      }
      case 'unitKilled': {
        const owner = s.state.players[ev.byPlayerId];
        const typeId = ev.unitTypeId ?? s.state.units[ev.unitId]?.typeId;
        const dead = (typeId ? content.units[typeId]?.name : undefined) ?? 'Unit';
        pushNotification(
          `${dead} destroyed${owner ? ` by ${content.civs[owner.civId]?.name ?? 'them'}` : ''}`,
          owner?.isHuman ? 'good' : 'bad',
        );
        break;
      }
      case 'unitPromoted': {
        const def = content.promotions[ev.promotionId];
        pushNotification(`Unit promoted${def ? `: ${def.name}` : ''}`, 'good', unitTarget(ev.unitId));
        break;
      }
      case 'cityCaptured': {
        const city = s.state.cities[ev.cityId];
        const taker = s.state.players[ev.byPlayerId];
        pushNotification(
          `${city?.name ?? 'City'} captured by ${content.civs[taker?.civId ?? '']?.name ?? 'raiders'}`,
          taker?.isHuman ? 'good' : 'bad',
          cityTarget(ev.cityId),
        );
        break;
      }
      case 'warDeclared': {
        const a = s.state.players[ev.a];
        const b = s.state.players[ev.b];
        pushNotification(
          `${content.civs[a?.civId ?? '']?.name ?? '?'} declares war on ${content.civs[b?.civId ?? '']?.name ?? '?'}`,
          a?.isHuman || b?.isHuman ? 'bad' : 'info',
        );
        break;
      }
      case 'peaceMade':
        pushNotification('Peace agreed', 'good');
        break;
      case 'peaceRejected':
        pushNotification(
          `${content.civs[s.state.players[ev.b]?.civId ?? '']?.name ?? 'They'} rejected the peace offer`,
          'info',
        );
        break;
      case 'denounced':
        pushNotification(`Denounced by ${content.civs[s.state.players[ev.byPlayerId]?.civId ?? '']?.name ?? 'a rival'}`, 'bad');
        break;
      case 'playerDefeated': {
        const p = s.state.players[ev.playerId];
        const name = content.civs[p?.civId ?? '']?.name ?? 'A civilization';
        pushNotification(p?.isHuman ? 'You have been defeated' : `${name} has been defeated`, p?.isHuman ? 'bad' : 'info');
        break;
      }
      default:
        break; // unknown kinds ignored (forward compatibility)
    }
  }
}

// Dev/e2e debug handle: lets the console and tests inspect live session state.
declare global {
  interface Window {
    __siv?: { getSession(): GameSession | null; setSelection?: (v: { unitId: number | null; cityId: number | null }) => void };
  }
}
if (typeof window !== 'undefined') {
  window.__siv = {
    getSession: () => sessionSignal.peek(),
    setSelection: (v) => (selectionSignal.value = v),
  };
}

/** Replace the session object so signal subscribers re-render. */
export function bumpSession(): void {
  const s = sessionSignal.value;
  if (s) sessionSignal.value = { ...s, version: s.version + 1 };
}

/** The ONLY way UI/input code may mutate game state. */
export function submitCommand(cmd: Command): GameEvent[] {
  const s = sessionSignal.peek();
  if (!s || s.state.winner) return [];
  const { events } = dispatch(s.state, cmd);
  narrateEvents(events);
  bumpSession();
  // Autosave at each turn boundary (SPEC §15); a failed write never blocks play.
  if (cmd.type === 'endTurn') autosave(s.state);
  return events;
}

/** Selection and toasts are per-game UI state — reset on start/load. */
function clearTransientUi(): void {
  selectionSignal.value = { unitId: null, cityId: null };
  notificationsSignal.value = [];
}

/** Fire-and-forget autosave to the dedicated slot. */
export function autosave(state: GameState): void {
  if (state.winner) return; // finished games keep their pre-victory autosave
  const human = state.players.find((p) => p.isHuman);
  const civName = buildContentDb().civs[human?.civId ?? '']?.name ?? 'SIV';
  void putSave('autosave', makeSaveFile(state, civName)).catch(() => {});
}

/** Swap in a validated save and remount the game screen around it. */
export function loadFromSave(file: SaveFile): void {
  const state = validateSaveFile(file).state;
  clearTransientUi();
  sessionSignal.peek()?.renderer?.destroy();
  sessionSeqSignal.value += 1;
  sessionSignal.value = { state, renderer: null, version: 0 };
  screenSignal.value = 'game';
}

export interface NewGameConfig {
  seed: number;
  preset: MapPresetId;
  sizeId: string;
  humanCivId: string;
  aiCivCount: number;
  difficulty: number;
}

export function startNewGame(config: NewGameConfig): void {
  const content = buildContentDb();
  // Deterministic shuffle via seeded RNG so same seed always picks same rivals but not always content-order
  const rng = new Rng(config.seed);
  const aiCivIds = rng
    .shuffled(content.playableCivIds.filter((id) => id !== config.humanCivId))
    .slice(0, config.aiCivCount);
  const options: GameOptions = {
    seed: config.seed,
    preset: config.preset,
    sizeId: config.sizeId,
    humanCivId: config.humanCivId,
    aiCivIds,
    difficulty: config.difficulty,
  };
  const state = generateGame(options);
  clearTransientUi();
  sessionSignal.peek()?.renderer?.destroy();
  sessionSeqSignal.value += 1;
  sessionSignal.value = { state, renderer: null, version: 0 };
  screenSignal.value = 'game';
  autosave(state); // Continue works from turn 1 even if you never end a turn
}

export function returnToMenu(): void {
  sessionSignal.peek()?.renderer?.destroy();
  sessionSignal.value = null;
  screenSignal.value = 'menu';
}
