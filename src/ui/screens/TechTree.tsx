/** Modal tech tree: pick the city-less research order. */
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import type { TechDef } from '@/content';
import { TECHS } from '@/content/techs';
import { currentPlayer } from '@/engine';
import { sessionSignal, submitCommand } from '../store';

export function TechTree() {
  const session = sessionSignal.value;
  if (!session || session.state.winner) return null;
  // Opened from the topbar science chip; rendered only when flagged open.
  if (!techTreeOpen.value) return null;
  const state = session.state;
  const player = currentPlayer(state);
  const content = buildContentDb();
  const known = new Set(player.researchedTechIds);

  // Card tooltip: cost, prerequisites and everything the tech unlocks.
  const techTitle = (t: TechDef): string => {
    const lines: string[] = [`${t.cost} beakers`];
    const prereqs = (t.prereqIds ?? []).map((p) => content.techs[p]?.name ?? p);
    if (prereqs.length > 0) lines.push(`Needs: ${prereqs.join(', ')}`);
    const unlocks = [
      ...Object.values(content.units)
        .filter((u) => u.requiresTechId === t.id)
        .map((u) => u.name),
      ...Object.values(content.buildings)
        .filter((b) => b.requiresTechId === t.id)
        .map((b) => b.name),
    ];
    if (unlocks.length > 0) lines.push(`Unlocks: ${unlocks.join(', ')}`);
    return lines.join('\n');
  };

  const pickable = (id: string) => {
    if (known.has(id)) return false;
    const def = content.techs[id];
    return (def?.prereqIds ?? []).every((p) => known.has(p));
  };

  const lanes: Array<'military' | 'economy' | 'science' | 'culture'> =
    ['military', 'economy', 'science', 'culture'];

  return (
    <div class="modal-backdrop" onClick={() => closeTechTree()}>
      <div class="modal tech-tree" onClick={(e) => e.stopPropagation()} data-testid="tech-tree">
        <header>
          <h2>Research</h2>
          <span>{player.scienceStored} beakers banked</span>
          <button class="btn-ghost" onClick={() => closeTechTree()}>Close</button>
        </header>
        <div class="tech-lanes">
          {lanes.map((lane) => (
            <div class="tech-lane" key={lane}>
              <h3>{lane}</h3>
              {TECHS.filter((t) => t.lane === lane).map((t) => (
                <button
                  key={t.id}
                  class={`tech-card ${known.has(t.id) ? 'known' : ''} ${player.researchingTechId === t.id ? 'active' : ''}`}
                  disabled={!pickable(t.id)}
                  title={techTitle(t)}
                  onClick={() => submitCommand({ type: 'setResearch', techId: t.id })}
                >
                  <strong>{t.name}</strong>
                  <small>{t.cost} beakers</small>
                  {player.researchingTechId === t.id && <em>researching</em>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const techTreeOpen = signal(false);
export function openTechTree(): void {
  techTreeOpen.value = true;
}
export function closeTechTree(): void {
  techTreeOpen.value = false;
}
