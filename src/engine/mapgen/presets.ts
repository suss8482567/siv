export type MapPresetId = 'pangaea' | 'continents' | 'archipelago' | 'fractal';

export interface MapSizeDef {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const MAP_SIZES: MapSizeDef[] = [
  { id: 'duel', label: 'Duel', width: 36, height: 24 },
  { id: 'small', label: 'Small', width: 48, height: 30 },
  { id: 'standard', label: 'Standard', width: 60, height: 38 },
  { id: 'large', label: 'Large', width: 72, height: 46 },
  { id: 'huge', label: 'Huge', width: 84, height: 54 },
];

/**
 * Shapes a raw fBm height sample into a preset-specific heightfield.
 * `rad` is normalized distance from map center (0 = center, ~1 = edge).
 */
export function applyPreset(
  preset: MapPresetId,
  rawHeight: number,
  ridgedHeight: number,
  rad: number,
): number {
  switch (preset) {
    case 'pangaea': {
      // One dominant central landmass: strong edge falloff, low sea level.
      const shaped = rawHeight * 0.7 + 0.3 - rad * rad * 0.55;
      return clamp01(shaped);
    }
    case 'continents': {
      // Two-blob feel comes from medium falloff + moderate sea level.
      const shaped = rawHeight * 0.8 + 0.2 - rad * rad * 0.35;
      return clamp01(shaped);
    }
    case 'archipelago': {
      // High sea cutoff + ridged mixing produces island chains.
      const mixed = rawHeight * 0.55 + ridgedHeight * 0.45 - rad * rad * 0.25;
      return clamp01(mixed);
    }
    case 'fractal':
      return clamp01(rawHeight);
  }
}

export function seaLevelFor(preset: MapPresetId): number {
  switch (preset) {
    case 'pangaea':
      return 0.46;
    case 'continents':
      return 0.52;
    case 'archipelago':
      return 0.6;
    case 'fractal':
      return 0.48;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
