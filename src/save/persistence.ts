/**
 * Save persistence: IndexedDB slots + file export/import (SPEC §15).
 */
import type { GameState } from '@/engine';

export type SaveSlotId = 'autosave' | 'slot1' | 'slot2' | 'slot3' | 'backup-pre-scan';
export const SAVE_SLOTS: SaveSlotId[] = ['autosave', 'slot1', 'slot2', 'slot3'];

export interface SaveFile {
  magic: 'SIV';
  version: 1;
  savedAtIso: string;
  meta: { turn: number; civName: string };
  state: GameState;
}

const DB_NAME = 'siv-saves';
const STORE = 'slots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function runTx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

export function putSave(slot: SaveSlotId, file: SaveFile): Promise<void> {
  return runTx('readwrite', (s) => s.put(file, slot));
}

export function getSave(slot: SaveSlotId): Promise<SaveFile | undefined> {
  return runTx('readonly', (s) => s.get(slot));
}

export function deleteSave(slot: SaveSlotId): Promise<unknown> {
  return runTx('readwrite', (s) => s.delete(slot));
}

export function makeSaveFile(state: GameState, civName: string): SaveFile {
  return {
    magic: 'SIV',
    version: 1,
    savedAtIso: new Date().toISOString(),
    meta: { turn: state.turn, civName },
    state,
  };
}

/** Refuse anything that is not a v1 SIV save — never load corrupt state. */
export function validateSaveFile(data: unknown): SaveFile {
  if (!data || typeof data !== 'object') throw new Error('Not a save file');
  const f = data as Partial<SaveFile>;
  if (f.magic !== 'SIV') throw new Error('Not a SIV save file');
  if (f.version !== 1) throw new Error(`Unsupported save version: ${String(f.version)}`);
  if (!f.state || f.state.version !== 1 || !Array.isArray(f.state.map?.tiles)) {
    throw new Error('Corrupt save payload');
  }
  return f as SaveFile;
}

export async function importSaveFromFile(file: File): Promise<SaveFile> {
  const text = await file.text();
  return validateSaveFile(JSON.parse(text) as unknown);
}

export function exportSaveToFile(file: SaveFile, suggestedName: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
