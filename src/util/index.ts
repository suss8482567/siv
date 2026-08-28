/** Small pure helpers shared across layers. */

export const DESKTOP_MIN_WIDTH = 1280;
export const DESKTOP_MIN_HEIGHT = 720;

export function meetsDesktopRequirements(w: number, h: number): boolean {
  return w >= DESKTOP_MIN_WIDTH && h >= DESKTOP_MIN_HEIGHT;
}

export function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
