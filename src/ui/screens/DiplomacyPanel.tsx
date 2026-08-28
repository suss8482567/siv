/**
 * Modal diplomacy panel: every met, living civ with relations, war/peace
 * status and the three human actions the engine supports (SPEC §9) —
 * declare war, offer peace (AI accepts by utility; rejections surface as a
 * `peaceRejected` toast), denounce (gated by the 20-turn cooldown).
 */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import { currentPlayer } from '@/engine';
import { DENOUNCE_COOLDOWN } from '@/engine/systems/diplomacy';
import { civArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { formatSigned } from '@/util';
import { sessionSignal, submitCommand } from '../store';

export const diplomacyOpen = signal(false);
export function openDiplomacy(): void {
  diplomacyOpen.value = true;
}
export function closeDiplomacy(): void {
  diplomacyOpen.value = false;
}

export function DiplomacyPanel() {
  const session = sessionSignal.value;
  if (!session || !diplomacyOpen.value || session.state.winner) return null;
  const state = session.state;
  const me = currentPlayer(state);
  const content = buildContentDb();
  const met = me.metPlayerIds
    .map((id) => state.players[id])
    .filter((p) => p && p.alive && p.civId !== 'barbarians');

  return (
    <div class="modal-backdrop" onClick={() => closeDiplomacy()}>
      <div class="modal diplomacy-panel" onClick={(e) => e.stopPropagation()} data-testid="diplomacy-panel">
        <header>
          <h2>Diplomacy</h2>
          <span>{met.length === 0 ? 'no civs met yet' : `${met.length} civ${met.length === 1 ? '' : 's'} met`}</span>
          <button class="btn-ghost" data-testid="close-diplomacy" onClick={() => closeDiplomacy()}>
            Close
          </button>
        </header>
        <div class="diplo-rows">
          {met.length === 0 && (
            <div class="prod-row-empty">You have not met any civilizations yet — explore to make contact.</div>
          )}
          {met.map((p) => {
            const civ = content.civs[p.civId];
            const relation = me.relations[p.id] ?? 0;
            const war = me.warsWith.includes(p.id);
            const denouncedUs = me.denouncedBy.includes(p.id);
            const lastDenounce = me.denounceTurns[p.id];
            const cdLeft =
              lastDenounce !== undefined ? Math.max(0, DENOUNCE_COOLDOWN - (state.turn - lastDenounce)) : 0;
            return (
              <div class="diplo-row" key={p.id} data-testid={`diplo-${p.civId}`}>
                <ArtIcon art={civArt(p.civId)} size={30} label={civ?.name ?? p.civId} />
                <div class="diplo-who">
                  <strong style={{ color: civ?.color }}>{civ?.name ?? p.civId}</strong>
                  <small>
                    {civ?.leaderName} · relations {formatSigned(relation)}
                  </small>
                </div>
                <div class="diplo-chips">
                  {war ? <span class="chip chip-war">At war</span> : <span class="chip chip-peace">Peace</span>}
                  {denouncedUs && <span class="chip chip-denounced">Denounced us</span>}
                </div>
                <div class="diplo-actions">
                  {!war ? (
                    <button
                      class="btn-ghost"
                      data-testid={`diplo-war-${p.civId}`}
                      title="Declare war (−40 relations both ways)"
                      onClick={() => submitCommand({ type: 'declareWar', targetPlayerId: p.id })}
                    >
                      Declare War
                    </button>
                  ) : (
                    <button
                      class="btn-ghost"
                      data-testid={`diplo-peace-${p.civId}`}
                      title="Offer peace — the AI accepts by utility (+20 relations on success)"
                      onClick={() => submitCommand({ type: 'offerPeace', targetPlayerId: p.id })}
                    >
                      Offer Peace
                    </button>
                  )}
                  <button
                    class="btn-ghost"
                    data-testid={`diplo-denounce-${p.civId}`}
                    disabled={cdLeft > 0}
                    title={cdLeft > 0 ? `Denounce cooldown: ${cdLeft} turns left` : 'Denounce (−25 relations both ways)'}
                    onClick={() => submitCommand({ type: 'denounce', targetPlayerId: p.id })}
                  >
                    Denounce{cdLeft > 0 ? ` (${cdLeft})` : ''}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
