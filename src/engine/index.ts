/**
 * Public API of the simulation core. Outside code may only import from here
 * (enforced by tests/architecture.test.ts).
 */
export * from './core/types';
export { Rng } from './core/rng';
export type { Command } from './core/commands';
export type { GameEvent } from './core/events';
export { currentPlayer, dispatch } from './core/engine';
export { computeScore } from './systems/victory';
export { generateGame } from './mapgen/generate';
export type { GameOptions } from './mapgen/generate';
export { MAP_SIZES } from './mapgen/presets';
export type { MapPresetId } from './mapgen/presets';
export { findPath } from './hex/pathfind';
export {
  HEX_DIRECTIONS,
  neighborsOf,
  tilesInRange,
  hexDistance,
  tileToPixel,
  pixelToTile,
  offsetToAxial,
  axialToOffset,
} from './hex/axial';
