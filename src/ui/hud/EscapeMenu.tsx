/**
 * Escape menu (pause overlay): resume, save/load, diplomacy, resign (two-step
 * confirm) and quit to menu. Resign dispatches the `resign` command, which
 * immediately ends the game — the best live rival wins by score.
 */
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { openDiplomacy, closeDiplomacy } from '../screens/DiplomacyPanel';
import { openSavePanel, closeSavePanel } from './SavePanel';
import { returnToMenu, sessionSignal, submitCommand } from '../store';

export const escapeMenuOpen = signal(false);
export function openEscapeMenu(): void {
  escapeMenuOpen.value = true;
}
export function closeEscapeMenu(): void {
  escapeMenuOpen.value = false;
}

export function EscapeMenu() {
  const [confirmResign, setConfirmResign] = useState(false);
  const open = escapeMenuOpen.value;
  useEffect(() => {
    if (!open) setConfirmResign(false);
  }, [open]);
  if (!open) return null;
  const session = sessionSignal.peek();
  if (!session || session.state.winner) return null;

  const resign = () => {
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }
    closeEscapeMenu();
    submitCommand({ type: 'resign' });
  };

  return (
    <div class="modal-backdrop" data-testid="escape-menu" onClick={() => closeEscapeMenu()}>
      <div class="modal escape-menu" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Game menu">
        <header>
          <h2>Paused</h2>
        </header>
        <div class="escape-actions">
          <button class="btn-primary" data-testid="esc-resume" onClick={() => closeEscapeMenu()}>
            Resume
          </button>
          <button
            class="btn-ghost"
            data-testid="esc-save"
            onClick={() => {
              closeEscapeMenu();
              openSavePanel();
            }}
          >
            Save / Load
          </button>
          <button
            class="btn-ghost"
            data-testid="esc-diplomacy"
            onClick={() => {
              closeEscapeMenu();
              openDiplomacy();
            }}
          >
            Diplomacy
          </button>
          <button
            class="btn-ghost"
            data-testid="esc-resign"
            title="End the game now — the best live rival wins by score"
            onClick={resign}
          >
            {confirmResign ? 'Click again to confirm resign' : 'Resign'}
          </button>
          <button
            class="btn-ghost"
            data-testid="esc-quit"
            onClick={() => {
              closeEscapeMenu();
              closeSavePanel();
              returnToMenu();
            }}
          >
            Quit to Menu
          </button>
        </div>
        <small class="dev-hint">Esc toggles this menu · N next unit · Space/Enter end turn</small>
      </div>
    </div>
  );
}
