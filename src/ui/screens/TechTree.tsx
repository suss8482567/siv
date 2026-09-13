/** Modal tech tree: pick the city-less research order. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { buildContentDb } from '@/content';
import type { TechDef } from '@/content';
import { TECHS } from '@/content/techs';
import { currentPlayer } from '@/engine';
import { computeCityYields } from '@/engine/systems/economy';
import { yieldArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { sessionSignal, submitCommand } from '../store';

export function TechTree() {
  const [query, setQuery] = useState('');
  const lanesRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Prerequisite connectors (Civ VI pattern): measured after every render —
  // search filtering, research progress and queue edits all redraw the lines.
  useEffect(() => {
    const host = lanesRef.current;
    const svg = svgRef.current;
    const s = sessionSignal.peek();
    if (!host || !svg || !s) return;
    const player = currentPlayer(s.state);
    const knownNow = new Set(player.researchedTechIds);
    const hostRect = host.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${host.clientWidth} ${host.clientHeight}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const boxes = new Map<string, { r: number; l: number; cy: number }>();
    host.querySelectorAll<HTMLElement>('[data-tech-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      boxes.set(el.dataset.techId ?? '', {
        l: r.left - hostRect.left,
        r: r.right - hostRect.left,
        cy: r.top - hostRect.top + r.height / 2,
      });
    });
    const NS = 'http://www.w3.org/2000/svg';
    for (const t of TECHS) {
      const to = boxes.get(t.id);
      if (!to) continue;
      const lit = (t.prereqIds ?? []).every((p) => knownNow.has(p));
      for (const p of t.prereqIds ?? []) {
        const from = boxes.get(p);
        if (!from) continue; // prereq filtered out by search
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(from.r));
        line.setAttribute('y1', String(from.cy));
        line.setAttribute('x2', String(to.l));
        line.setAttribute('y2', String(to.cy));
        line.setAttribute('stroke', lit ? '#c8a24a' : '#5a4f33');
        line.setAttribute('stroke-width', lit ? '1.6' : '1.2');
        svg.appendChild(line);
      }
    }
  });
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
  // Each lane is headed by the yield seal closest to its fantasy.
  const laneYield = { military: 'production', economy: 'gold', science: 'science', culture: 'culture' } as const;

  // Science per turn across our cities; nodes show turns at the current rate.
  let sciencePerTurn = 0;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== player.id) continue;
    sciencePerTurn += computeCityYields(state, city).science;
  }
  const turnsFor = (t: TechDef): string => {
    if (sciencePerTurn <= 0) return '—';
    const remaining = player.researchingTechId === t.id
      ? Math.max(0, t.cost - player.scienceStored)
      : t.cost;
    return `${Math.max(1, Math.ceil(remaining / sciencePerTurn))} turns`;
  };

  const q = query.trim().toLowerCase();
  const matches = (t: TechDef) => q === '' || t.name.toLowerCase().includes(q);

  return (
    <div class="modal-backdrop" onClick={() => closeTechTree()}>
      <div class="modal tech-tree" onClick={(e) => e.stopPropagation()} data-testid="tech-tree">
        <header>
          <h2>Research</h2>
          <span>{player.scienceStored} beakers banked</span>
          <input
            class="tech-search"
            data-testid="tech-search"
            type="search"
            placeholder="Search techs…"
            autoFocus
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button class="btn-ghost" onClick={() => closeTechTree()}>Close</button>
        </header>
        {(player.researchQueue?.length ?? 0) > 0 && (
          <div class="research-queue" data-testid="research-queue">
            <span class="research-queue-label">Queue:</span>
            {(player.researchQueue ?? []).map((id, i) => (
              <span key={id} class="research-queue-item">
                {i > 0 && <span class="research-queue-arrow">→</span>}
                {content.techs[id]?.name ?? id}
                <button
                  class="inline-btn"
                  data-testid={`dequeue-${id}`}
                  title={`Remove ${content.techs[id]?.name ?? id} from the queue`}
                  onClick={() => submitCommand({ type: 'dequeueResearch', techId: id })}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div class="tech-lanes" ref={lanesRef}>
          <svg class="tech-links" ref={svgRef} aria-hidden="true" />
          {lanes.map((lane) => (
            <div class="tech-lane" key={lane}>
              <h3 class="tech-lane-head">
                <ArtIcon art={yieldArt(laneYield[lane])} size={16} label={lane} />
                {lane}
              </h3>
              {TECHS.filter((t) => t.lane === lane && matches(t)).map((t) => (
                <button
                  key={t.id}
                  data-tech-id={t.id}
                  class={`tech-card ${known.has(t.id) ? 'known' : ''} ${player.researchingTechId === t.id ? 'active' : ''} ${(player.researchQueue ?? []).includes(t.id) ? 'queued' : ''}`}
                  disabled={!pickable(t.id)}
                  title={player.researchingTechId ? `${techTitle(t)}\n(researching ${content.techs[player.researchingTechId]?.name ?? ''} — click appends to the queue)` : techTitle(t)}
                  onClick={() => submitCommand(
                    player.researchingTechId
                      ? { type: 'queueResearch', techId: t.id }
                      : { type: 'setResearch', techId: t.id },
                  )}
                >
                  <strong>{t.name}</strong>
                  <small>{t.cost} beakers · {turnsFor(t)}</small>
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
