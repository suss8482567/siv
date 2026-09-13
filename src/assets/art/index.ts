/**
 * Central registry for SIV's "Gilded Hex Seals" art (docs/ART_STYLE.md).
 *
 * Two views over the same files:
 *  - raw SVG source (Vite `?raw`) for inlining into Preact via dangerouslySetInnerHTML
 *  - URLs for Pixi `Assets.load` texture rasterization (map renderer)
 *
 * Keyed as `"<group>/<id>"`, e.g. `"resources/wheat"` or `"units/settler"`. New
 * files dropped into a group directory are picked up automatically.
 */

const RAW_MODULES = import.meta.glob('./{units,yields,resources,civs,buildings,ui}/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const URL_MODULES = import.meta.glob('./{units,yields,resources,civs,buildings,ui}/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** './resources/wheat.svg' -> 'resources/wheat' (exported for the art backstop test). */
export function keyOf(path: string): string {
  const m = /\.\/([a-z]+)\/([a-z0-9_-]+)\.svg$/.exec(path);
  return m ? `${m[1]}/${m[2]}` : path;
}

const RAW = new Map<string, string>();
for (const [path, src] of Object.entries(RAW_MODULES)) RAW.set(keyOf(path), src);
const URLS = new Map<string, string>();
for (const [path, url] of Object.entries(URL_MODULES)) URLS.set(keyOf(path), url);

/** Inline-able SVG source for a unit token, e.g. `unitArt('settler')`. */
export function unitArt(id: string): string | undefined {
  return RAW.get(`units/${id}`);
}

/** Inline-able SVG source for a yield glyph, e.g. `yieldArt('gold')`. */
export function yieldArt(id: string): string | undefined {
  return RAW.get(`yields/${id}`);
}

/** Inline-able SVG source for a civ seal, e.g. `civArt('rome')`. */
export function civArt(id: string): string | undefined {
  return RAW.get(`civs/${id}`);
}

/** Inline-able SVG source for a resource, e.g. `resourceArt('iron')`. */
export function resourceArt(id: string): string | undefined {
  return RAW.get(`resources/${id}`);
}

/** Inline-able SVG source for a building/wonder seal, e.g. `buildingArt('granary')`. */
export function buildingArt(id: string): string | undefined {
  return RAW.get(`buildings/${id}`);
}

/** File URL for Pixi texture loading of a UI/map-marker seal, e.g. `uiArtUrl('barbarian-camp')`. */
export function uiArtUrl(id: string): string | undefined {
  return URLS.get(`ui/${id}`);
}

/** File URL for Pixi texture loading of a map resource, e.g. `resourceArtUrl('iron')`. */
export function resourceArtUrl(id: string): string | undefined {
  return URLS.get(`resources/${id}`);
}
