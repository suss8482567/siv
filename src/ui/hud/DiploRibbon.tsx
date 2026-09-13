/**
 * Diplomacy ribbon (docs/UI_REWORK.md P1.5): persistent at-a-glance strip of met
 * civs under the minimap — seal, relation score, war/peace + denounce-cooldown
 * status. Hover breaks relations down; click opens the diplomacy panel.
 */
import { buildContentDb } from '@/content';
import { currentPlayer } from '@/engine';
import { DENOUNCE_COOLDOWN } from '@/engine/systems/diplomacy';
import { civArt } from '@/assets/art';
import { ArtIcon } from './ArtIcon';
import { openDiplomacy } from '../screens/DiplomacyPanel';
import { formatSigned } from '@/util';
import { sessionSignal } from '../store';

export function DiploRibbon() {
  const session = sessionSignal.value;
  if (!session || session.state.winner) return null;
  const state = session.state;
  const me = currentPlayer(state);
  const content = buildContentDb();
  const met = me.metPlayerIds
    .map((id) => state.players[id])
    .filter((p) => p && p.alive && p.civId !== 'barbarians');
  if (met.length === 0) return null;
  return (
    <div class="diplo-ribbon" data-testid="diplo-ribbon">
      {met.map((p) => {
        const civ = content.civs[p.civId];
        const relation = me.relations[p.id] ?? 0;
        const war = me.warsWith.includes(p.id);
        const lastDenounce = me.denounceTurns[p.id];
        const cdLeft =
          lastDenounce !== undefined ? Math.max(0, DENOUNCE_COOLDOWN - (state.turn - lastDenounce)) : 0;
        const status = war ? 'At war' : cdLeft > 0 ? `Denounce cooldown: ${cdLeft} turns` : 'Peace';
        return (
          <button
            key={p.id}
            class={`ribbon-civ${war ? ' ribbon-war' : ''}`}
            data-testid={`ribbon-${p.civId}`}
            title={`${civ?.name ?? p.civId} (${civ?.leaderName ?? ''}) — relations ${formatSigned(relation)} · ${status}\nClick for diplomacy`}
            onClick={() => openDiplomacy()}
          >
            <ArtIcon art={civArt(p.civId)} size={22} label={civ?.name ?? p.civId} />
            <span class="ribbon-rel">{formatSigned(relation)}</span>
            <span class={`ribbon-dot${war ? ' ribbon-dot-war' : ''}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
