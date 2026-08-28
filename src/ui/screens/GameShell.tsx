/**
 * Game shell: owns the Pixi renderer + input controller, mounts every HUD
 * panel and modal, and implements the global hotkeys (SPEC §14):
 *   N            cycle to the next own unit that needs orders
 *   Space/Enter  end turn
 *   Esc          close the topmost modal, else toggle the pause menu
 */
import { useEffect, useRef } from 'preact/hooks';
import type { GameState } from '@/engine';
import { currentPlayer, hexDistance } from '@/engine';
import { tileToPixel } from '@/engine/hex/axial';
import { computeVisibleTiles } from '@/engine/systems/visibility';
import { findUnitPath, fullRangeTiles, reachableTiles } from '@/engine/systems/movement';
import { canAttackUnit } from '@/engine/systems/combat';
import { MapRenderer, HEX_SIZE, type FogData } from '@/render/MapRenderer';
import { buildContentDb } from '@/content';
import { InputController } from '@/input/InputController';
import { pushNotification, returnToMenu, selectionSignal, sessionSignal, submitCommand } from '../store';
import { TopBar } from '../hud/TopBar';
import { RightDock } from '../hud/RightDock';
import { UnitDock } from '../hud/UnitDock';
import { TileTooltip, hoverTileSignal } from '../hud/TileTooltip';
import { DevPanel, devPanelOpen } from '../hud/DevPanel';
import { EscapeMenu, closeEscapeMenu, escapeMenuOpen, openEscapeMenu } from '../hud/EscapeMenu';
import { SavePanel, closeSavePanel, openSavePanel, savePanelOpen } from '../hud/SavePanel';
import { Notifications } from '../hud/Notifications';
import { CityScreen } from './CityScreen';
import { TechTree, closeTechTree, techTreeOpen } from './TechTree';
import { DiplomacyPanel, closeDiplomacy, diplomacyOpen } from './DiplomacyPanel';
import { VictoryScreen } from './VictoryScreen';

function fogFor(state: GameState): FogData {
  const humanId = state.players.find((p) => p.isHuman)?.id ?? 0;
  return {
    explored: new Set(state.players[humanId].exploredTileIds),
    visible: computeVisibleTiles(state, humanId),
  };
}

export function GameShell() {
  const session = sessionSignal.value;
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let controller: InputController | null = null;
    const boot = async () => {
      const s = sessionSignal.peek();
      if (!s || s.renderer || !hostRef.current) return;
      const content = buildContentDb();
      const renderer = await MapRenderer.create(hostRef.current, s.state, content, fogFor(s.state));
      if (cancelled) {
        renderer.destroy();
        return;
      }
      const prev = sessionSignal.peek();
      if (prev && !prev.renderer) {
        sessionSignal.value = { ...prev, renderer, version: prev.version + 1 };
        controller = new InputController(renderer, { width: prev.state.map.width, height: prev.state.map.height }, {
          onTileClick: (tileId) => handleTileClick(tileId),
          onTileRightClick: (tileId) => handleTileRightClick(tileId),
          onRightButtonDown: () => showReachShading(),
          onRightButtonUp: () => fadeReachShading(),
          onTileHover: (hover) => (hoverTileSignal.value = hover),
        });
      }
    };
    void boot();
    return () => {
      cancelled = true;
      controller?.detach();
    };
  }, []);

  // Keep fog, units, territory and overlays in sync after every command.
  useEffect(() => {
    const s = sessionSignal.peek();
    if (!s?.renderer) return;
    const fog = fogFor(s.state);
    s.renderer.refreshFog(s.state, fog);
    s.renderer.syncUnits(s.state, fog.visible);
    s.renderer.syncTerritory(s.state, fog.visible);
    const sel = selectionSignal.peek();
    const selTile = sel.unitId != null && s.state.units[sel.unitId]
      ? s.state.units[sel.unitId].tileId
      : sel.cityId != null && s.state.cities[sel.cityId]
        ? s.state.cities[sel.cityId].tileId
        : -1;
    s.renderer.setSelection(selTile);
    s.renderer.setPathPreview([]);
    s.renderer.setRangeOverlay(null);
  }, [session?.version]);

  // Global hotkeys. Ignored while typing in form fields or after the game ends.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const s = sessionSignal.peek();
      if (!s || s.state.winner) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        cycleNextUnit();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (escapeMenuOpen.peek()) return;
        const cur = s.state.players[s.state.playerOrder[s.state.currentPlayerIndex]];
        if (cur?.isHuman) submitCommand({ type: 'endTurn' });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscapeKey();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) return null;

  return (
    <div class="game-shell">
      <div class="map-host" ref={hostRef} data-testid="map-host" />
      <TopBar />
      <RightDock />
      <UnitDock />
      <CityScreen />
      <TechTree />
      <DiplomacyPanel />
      <VictoryScreen />
      {savePanelOpen.value && <SavePanel onClose={() => closeSavePanel()} />}
      <EscapeMenu />
      <DevPanel />
      <TileTooltip />
      <Notifications />
      <div class="endturn-wrap">
        <button class="btn-primary" data-testid="end-turn" onClick={() => submitCommand({ type: 'endTurn' })}>
          End Turn
        </button>
        <button class="btn-ghost" data-testid="open-save-panel" onClick={() => openSavePanel()}>
          Save
        </button>
        <button class="btn-ghost" data-testid="back-to-menu" onClick={() => returnToMenu()}>
          Menu
        </button>
      </div>
    </div>
  );
}

/**
 * With a military unit selected, a click on a visible enemy unit or city in
 * weapon range attacks instead of selecting/moving. Returns true when an
 * attack was issued.
 */
function tryAttackFromSelection(tileId: number): boolean {
  const s = sessionSignal.peek();
  if (!s) return false;
  const { unitId } = selectionSignal.peek();
  if (unitId == null) return false;
  const unit = s.state.units[unitId];
  const def = unit ? buildContentDb().units[unit.typeId] : undefined;
  if (!unit || !def || def.unitClass === 'civilian') return false;
  if (unit.attacksLeft <= 0 || unit.movementLeft <= 0) return false;

  const enemy = Object.values(s.state.units).find((u) => u.tileId === tileId && u.ownerId !== unit.ownerId);
  if (enemy && canAttackUnit(s.state, unit, enemy)) {
    submitCommand({ type: 'attackUnit', attackerId: unit.id, defenderUnitId: enemy.id });
    return true;
  }
  const city = Object.values(s.state.cities).find((c) => c.tileId === tileId && c.ownerId !== unit.ownerId);
  if (city) {
    const t = s.state.map.tiles[unit.tileId];
    const ct = s.state.map.tiles[city.tileId];
    const dist = hexDistance(t.q, t.r, ct.q, ct.r);
    const range = def.range > 1 ? def.range : 1;
    if (dist <= range) {
      submitCommand({ type: 'attackCity', attackerId: unit.id, cityId: city.id });
      return true;
    }
  }
  return false;
}

/** LMB: attack visible enemies first, else select an own unit/city on the tile. */
function handleTileClick(tileId: number): void {
  const s = sessionSignal.peek();
  if (!s) return;
  if (tryAttackFromSelection(tileId)) return;
  const humanId = s.state.players.find((p) => p.isHuman)?.id ?? 0;
  const own = Object.values(s.state.units).filter((u) => u.tileId === tileId && u.ownerId === humanId);
  const city = Object.values(s.state.cities).find((c) => c.tileId === tileId && c.ownerId === humanId);
  const sel = selectionSignal.peek();
  if (own.length > 0) {
    // Cycle units -> city -> back to units as the player keeps clicking.
    const at = own.findIndex((u) => u.id === sel.unitId);
    const cityHere = city != null && sel.cityId === city.id;
    if (at >= 0 && at < own.length - 1) selectionSignal.value = { unitId: own[at + 1].id, cityId: null };
    else if (at >= 0 && city && !cityHere) selectionSignal.value = { unitId: null, cityId: city.id };
    else selectionSignal.value = { unitId: own[0].id, cityId: null };
  } else if (city) {
    selectionSignal.value = { unitId: null, cityId: city.id };
  } else {
    selectionSignal.value = { unitId: null, cityId: null };
  }
}

/** RMB: attack enemies in range, else move toward the tile along a path. */
function handleTileRightClick(tileId: number): void {
  const s = sessionSignal.peek();
  if (!s) return;
  if (tryAttackFromSelection(tileId)) return;
  const { unitId } = selectionSignal.peek();
  if (unitId == null) return;
  const unit = s.state.units[unitId];
  if (!unit || unit.movementLeft <= 0) return;
  const path = findUnitPath(s.state, unit, tileId);
  if (!path || path.length < 2) return;
  s.renderer?.setPathPreview(path);
  submitCommand({ type: 'moveUnit', unitId: unit.id, path });
}

let reachFadeTimer: number | undefined;

/** RMB down: shade what the selected unit can reach now / next turn. */
function showReachShading(): void {
  window.clearTimeout(reachFadeTimer);
  const s = sessionSignal.peek();
  if (!s?.renderer) return;
  const { unitId } = selectionSignal.peek();
  const unit = unitId != null ? s.state.units[unitId] : undefined;
  if (!unit || unit.ownerId !== currentPlayer(s.state).id) return;
  const humanId = s.state.players.find((p) => p.isHuman)?.id ?? 0;
  const explored = new Set(s.state.players[humanId].exploredTileIds);
  const visibleIds = (ids: Set<number>): number[] => [...ids].filter((id) => explored.has(id));
  const now = unit.movementLeft > 0 ? visibleIds(reachableTiles(s.state, unit)) : [];
  const next = visibleIds(fullRangeTiles(s.state, unit));
  if (now.length === 0 && next.length === 0) return;
  s.renderer.setRangeOverlay(now, next);
}

/** RMB up: linger briefly so a quick click still flashes the range. */
function fadeReachShading(): void {
  window.clearTimeout(reachFadeTimer);
  reachFadeTimer = window.setTimeout(() => {
    sessionSignal.peek()?.renderer?.setRangeOverlay(null);
  }, 700);
}

/** N: select the next own unit that still needs orders and center the camera. */
function cycleNextUnit(): void {
  const s = sessionSignal.peek();
  if (!s) return;
  const humanId = s.state.players.find((p) => p.isHuman)?.id ?? 0;
  const idle = Object.values(s.state.units)
    .filter((u) => u.ownerId === humanId && u.movementLeft > 0 && !u.slept && !u.fortified)
    .sort((a, b) => a.id - b.id);
  if (idle.length === 0) {
    pushNotification('No units need orders', 'info');
    return;
  }
  const sel = selectionSignal.peek();
  const at = sel.unitId != null ? idle.findIndex((u) => u.id === sel.unitId) : -1;
  const next = idle[(at + 1) % idle.length];
  selectionSignal.value = { unitId: next.id, cityId: null };
  const t = s.state.map.tiles[next.tileId];
  const pos = tileToPixel(t.q, t.r, HEX_SIZE);
  s.renderer?.camera.centerOn(pos.x, pos.y);
}

/** Esc: close the topmost open modal, else open the pause menu. */
function handleEscapeKey(): void {
  if (escapeMenuOpen.value) {
    closeEscapeMenu();
    return;
  }
  if (savePanelOpen.value) {
    closeSavePanel();
    return;
  }
  if (techTreeOpen.value) {
    closeTechTree();
    return;
  }
  if (devPanelOpen.value) {
    devPanelOpen.value = false;
    return;
  }
  if (diplomacyOpen.value) {
    closeDiplomacy();
    return;
  }
  const sel = selectionSignal.peek();
  if (sel.unitId != null || sel.cityId != null) {
    selectionSignal.value = { unitId: null, cityId: null };
    return;
  }
  openEscapeMenu();
}
