import { useEffect, useState } from 'preact/hooks';
import type { MapPresetId } from '@/engine';
import { MAP_SIZES } from '@/engine';
import { buildContentDb } from '@/content';
import { civArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { getSave, validateSaveFile } from '@/save/persistence';
import { loadFromSave, startNewGame } from '../store';

const PRESETS: { id: MapPresetId; label: string }[] = [
  { id: 'pangaea', label: 'Pangaea' },
  { id: 'continents', label: 'Continents' },
  { id: 'archipelago', label: 'Archipelago' },
  { id: 'fractal', label: 'Fractal' },
];

const DIFFICULTIES = ['Peaceful', 'Standard', 'Hard', 'Brutal'];
// SPEC mirrors: AI yield multiplier and AI non-civilian strength bonus per level.
const DIFFICULTY_EFFECTS = [
  'AI plays fair — no bonuses',
  'AI yields ×1.10, strength +1',
  'AI yields ×1.20, strength +2',
  'AI yields ×1.35, strength +3',
];
const PRESET_BLURBS: Record<MapPresetId, string> = {
  pangaea: 'one supercontinent — crowded land war',
  continents: 'several landmasses with ocean between',
  archipelago: 'island chains — water is impassable, no embark',
  fractal: 'unpredictable jagged landmasses',
};

export function MainMenu() {
  const content = buildContentDb();
  const [preset, setPreset] = useState<MapPresetId>('continents');
  const [sizeId, setSizeId] = useState('standard');
  const [civId, setCivId] = useState(content.playableCivIds[0]);
  const [aiCount, setAiCount] = useState(3);
  const [difficulty, setDifficulty] = useState(1);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  // Autosave presence check is async — the Continue button appears once known.
  const [autosaveMeta, setAutosaveMeta] = useState<{ turn: number; civName: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getSave('autosave')
      .then((file) => {
        if (cancelled || !file) return;
        try {
          setAutosaveMeta(validateSaveFile(file).meta);
        } catch {
          setAutosaveMeta(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div class="menu-screen">
      <h1 class="menu-title">SIV</h1>
      <p class="menu-sub">a web-born 4X — v0.0</p>
      <div class="menu-panel">
        {autosaveMeta && (
          <button
            class="btn-primary"
            data-testid="continue-game"
            onClick={() => {
              void getSave('autosave').then((file) => {
                if (file) loadFromSave(file);
              });
            }}
          >
            Continue — {autosaveMeta.civName}, turn {autosaveMeta.turn}
          </button>
        )}
        <label title={PRESET_BLURBS[preset]}>
          <span>Map</span>
          <select value={preset} onChange={(e) => setPreset(e.currentTarget.value as MapPresetId)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <small class="menu-hint">{PRESET_BLURBS[preset]}</small>
        <label>
          <span>Size</span>
          <select value={sizeId} onChange={(e) => setSizeId(e.currentTarget.value)}>
            {MAP_SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Civilization</span>
          <select value={civId} onChange={(e) => setCivId(e.currentTarget.value)}>
            {content.playableCivIds.map((id) => (
              <option key={id} value={id}>{content.civs[id].name} — {content.civs[id].leaderName}</option>
            ))}
          </select>
        </label>
        <div class="menu-civ-preview">
          <ArtIcon art={civArt(civId)} size={56} label={content.civs[civId].name} />
          <div class="menu-civ-who">
            <strong style={{ color: content.civs[civId].color }}>
              {content.civs[civId].name} — {content.civs[civId].leaderName}
            </strong>
            <small title={content.civs[civId].traitDescription}>
              {content.civs[civId].traitName}: {content.civs[civId].traitDescription}
            </small>
          </div>
        </div>
        <label>
          <span>AI rivals</span>
          <select value={aiCount} onChange={(e) => setAiCount(Number(e.currentTarget.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label title={DIFFICULTY_EFFECTS[difficulty]}>
          <span>Difficulty</span>
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.currentTarget.value))}>
            {DIFFICULTIES.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </label>
        <small class="menu-hint">{DIFFICULTY_EFFECTS[difficulty]}</small>
        <label>
          <span>Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.currentTarget.value))}
          />
        </label>
        <button class="btn-primary" data-testid="start-game" onClick={() => startNewGame({ seed, preset, sizeId, humanCivId: civId, aiCivCount: aiCount, difficulty })}>
          Start Game
        </button>
      </div>
    </div>
  );
}
