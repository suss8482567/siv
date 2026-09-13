/**
 * A* over the hex map with pluggable cost/passability rules. Movement-system
 * specifics (ZOC, embark, class terrain costs) are supplied by callers in
 * systems/movement.ts (M2) so this module stays generic and testable.
 */

export interface AStarContext {
  /** Number of tiles in the map (ids are 0..tileCount-1). */
  tileCount: number;
  /** Neighbors of a tile id that can be entered from it. */
  neighbors: (tileId: number) => number[];
  /** Estimated cost to traverse INTO a tile; Infinity means impassable. */
  enterCost: (tileId: number) => number;
  /** Admissible heuristic (hex distance × min move cost works well). */
  heuristic: (fromTileId: number, toTileId: number) => number;
}

/**
 * Returns the path of tile ids INCLUDING start and goal, or null if none.
 * Tie-breaking is deterministic: lowest id wins on equal f-scores.
 */
export function findPath(ctx: AStarContext, start: number, goal: number): number[] | null {
  if (start === goal) return [start];
  const g = new Float64Array(ctx.tileCount).fill(Infinity);
  const parent = new Int32Array(ctx.tileCount).fill(-1);
  const open: number[] = [start];
  const inOpen = new Uint8Array(ctx.tileCount);
  const closed = new Uint8Array(ctx.tileCount);
  g[start] = 0;
  inOpen[start] = 1;

  while (open.length > 0) {
    // pop lowest f (deterministic linear scan; fine at Civ map scales)
    let bestIdx = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const t = open[i];
      const f = g[t] + ctx.heuristic(t, goal);
      if (f < bestF || (f === bestF && t < open[bestIdx])) {
        bestF = f;
        bestIdx = i;
      }
    }
    const current = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();
    inOpen[current] = 0;
    if (current === goal) return reconstruct(parent, goal);
    closed[current] = 1;
    for (const nb of ctx.neighbors(current)) {
      if (closed[nb]) continue;
      const step = ctx.enterCost(nb);
      if (!Number.isFinite(step)) continue;
      const tentative = g[current] + step;
      if (tentative < g[nb]) {
        g[nb] = tentative;
        parent[nb] = current;
        if (!inOpen[nb]) {
          open.push(nb);
          inOpen[nb] = 1;
        }
      }
    }
  }
  return null;
}

function reconstruct(parent: Int32Array, goal: number): number[] {
  const path: number[] = [];
  let cur = goal;
  while (cur !== -1) {
    path.push(cur);
    cur = parent[cur];
  }
  path.reverse();
  return path;
}
