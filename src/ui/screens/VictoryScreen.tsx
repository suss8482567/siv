/**
 * Game-over overlay (M5): victory/defeat banner with final standings.
 * Renders whenever a winner exists or the human has been eliminated; the
 * backdrop intercepts input so the finished game is effectively paused.
 */
import { computeScore } from '@/engine';
import { buildContentDb } from '@/content';
import { civArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { returnToMenu, sessionSignal } from '../store';

export function VictoryScreen() {
  const session = sessionSignal.value;
  if (!session) return null;
  const state = session.state;
  const human = state.players.find((p) => p.isHuman);
  const winner = state.winner;
  const humanDead = human ? !human.alive : false;
  if (!winner && !humanDead) return null;

  const content = buildContentDb();
  const winnerCiv = winner ? content.civs[state.players[winner.playerId]?.civId ?? ''] : undefined;
  const won = winner != null && winner.playerId === human?.id;
  const title = winner ? (won ? 'Victory' : 'Defeat') : 'Defeat';
  const subtitle = winner
    ? `${winnerCiv?.name ?? 'A rival'} wins by ${winner.victory === 'domination' ? 'domination — every original capital is theirs' : 'score at the turn limit'}`
    : 'Your civilization has fallen';

  const standings = state.playerOrder
    .map((id) => state.players[id])
    .filter((p) => p && p.civId !== 'barbarians')
    .map((p) => ({
      p,
      score: computeScore(state, p.id),
      cities: Object.values(state.cities).filter((c) => c.ownerId === p.id).length,
      techs: p.researchedTechIds.length,
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div class="modal-backdrop" data-testid="victory-screen">
      <div class="modal victory-modal">
        <header>
          {winnerCiv && <ArtIcon art={civArt(winnerCiv.id)} size={44} label={winnerCiv.name} />}
          <div>
            <h2>{title}</h2>
            <span class="victory-sub">{subtitle}</span>
          </div>
        </header>
        <table class="standings">
          <thead>
            <tr>
              <th>Civilization</th>
              <th>Score</th>
              <th>Cities</th>
              <th>Techs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(({ p, score, cities, techs }) => (
              <tr
                key={p.id}
                class={`${winner?.playerId === p.id ? 'winner' : ''} ${p.isHuman ? 'you' : ''}`.trim()}
              >
                <td>{content.civs[p.civId]?.name ?? p.civId}</td>
                <td>{Math.round(score)}</td>
                <td>{cities}</td>
                <td>{techs}</td>
                <td>{p.alive ? 'Alive' : 'Defeated'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="victory-actions">
          <button class="btn-primary" data-testid="victory-menu" onClick={() => returnToMenu()}>
            Return to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
