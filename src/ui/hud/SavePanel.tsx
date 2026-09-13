/**
 * In-game save/load modal (M5): three IndexedDB slots plus file export and
 * import (SPEC §15). The autosave slot is listed read-only for loading.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { SaveSlotId } from '@/save/persistence';
import {
  SAVE_SLOTS,
  deleteSave,
  exportSaveToFile,
  getSave,
  importSaveFromFile,
  makeSaveFile,
  putSave,
  validateSaveFile,
} from '@/save/persistence';
import { buildContentDb } from '@/content';
import { loadFromSave, pushNotification, sessionSignal } from '../store';

interface SlotMeta {
  turn: number;
  civName: string;
}

const ROWS: { slot: SaveSlotId; label: string }[] = [
  { slot: 'autosave', label: 'Autosave' },
  { slot: 'slot1', label: 'Slot 1' },
  { slot: 'slot2', label: 'Slot 2' },
  { slot: 'slot3', label: 'Slot 3' },
];

export const savePanelOpen = signal(false);
export function openSavePanel(): void {
  savePanelOpen.value = true;
}
export function closeSavePanel(): void {
  savePanelOpen.value = false;
}

export function SavePanel({ onClose }: { onClose: () => void }) {
  const session = sessionSignal.value;
  const [slots, setSlots] = useState<Partial<Record<SaveSlotId, SlotMeta>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      SAVE_SLOTS.map(async (slot) => ({ slot, file: await getSave(slot) })),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Partial<Record<SaveSlotId, SlotMeta>> = {};
        for (const { slot, file } of entries) {
          if (!file) continue;
          try {
            next[slot] = validateSaveFile(file).meta;
          } catch {
            next[slot] = { turn: -1, civName: '(corrupt)' };
          }
        }
        setSlots(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) return null;
  const state = session.state;
  const human = state.players.find((p) => p.isHuman);
  const civName = buildContentDb().civs[human?.civId ?? '']?.name ?? 'SIV';

  const saveTo = (slot: SaveSlotId) => {
    void (async () => {
      try {
        await putSave(slot, makeSaveFile(state, civName));
        pushNotification(`Saved to ${slot}`, 'good');
        const f = await getSave(slot);
        if (!f) return;
        try {
          setSlots((prev) => ({ ...prev, [slot]: validateSaveFile(f).meta }));
        } catch {
          /* keep previous row */
        }
      } catch {
        pushNotification('Save failed', 'bad');
      }
    })();
  };

  const loadSlot = (slot: SaveSlotId) => {
    void getSave(slot)
      .then((file) => {
        if (file) loadFromSave(file); // remounts the shell, closing this panel
      })
      .catch(() => pushNotification('Load failed', 'bad'));
  };

  const removeSlot = (slot: SaveSlotId) => {
    void deleteSave(slot)
      .then(() => setSlots((prev) => ({ ...prev, [slot]: undefined })))
      .catch(() => {});
  };

  const exportCurrent = () => {
    exportSaveToFile(makeSaveFile(state, civName), `siv-${civName.toLowerCase()}-turn${state.turn}.json`);
  };

  const importFile = (file: File) => {
    void importSaveFromFile(file)
      .then(loadFromSave)
      .catch(() => pushNotification('Not a valid SIV save', 'bad'));
  };

  return (
    <div class="modal-backdrop" data-testid="save-panel" onClick={onClose}>
      <div
        class="modal save-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Save or load a game"
      >
        <header>
          <h2>Save / Load</h2>
          <button class="btn-ghost" data-testid="close-save-panel" onClick={onClose}>
            ✕ Close
          </button>
        </header>
        <div class="save-rows">
          {ROWS.map(({ slot, label }) => {
            const meta = slots[slot];
            const corrupt = meta?.turn === -1;
            const shown = meta && !corrupt ? `${meta.civName}, turn ${meta.turn}` : meta ? '(corrupt)' : 'empty';
            return (
              <div class="save-row" key={slot}>
                <span class="save-slot-label">
                  {label} — {shown}
                </span>
                <div class="save-row-actions">
                  {slot !== 'autosave' && !corrupt && (
                    <button class="btn-ghost" data-testid={`save-${slot}`} onClick={() => saveTo(slot)}>
                      Save
                    </button>
                  )}
                  {meta !== undefined && !corrupt && (
                    <button class="btn-ghost" data-testid={`load-${slot}`} onClick={() => loadSlot(slot)}>
                      Load
                    </button>
                  )}
                  {meta !== undefined && slot !== 'autosave' && (
                    <button class="dev-inline-btn" data-testid={`delete-${slot}`} onClick={() => removeSlot(slot)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div class="save-file-actions">
          <button class="btn-ghost" data-testid="export-save" onClick={exportCurrent}>
            Export to file…
          </button>
          <button class="btn-ghost" data-testid="import-save" onClick={() => fileInputRef.current?.click()}>
            Import from file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) importFile(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}
