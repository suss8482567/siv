/**
 * P2.4 Help overlay (civilopedia-lite): full-text searchable reference over
 * the content defs plus hand-written concepts (see `../help.ts`).
 *
 * No key listeners here by design — Esc is owned by GameShell's global chain
 * (insert `helpOpen` first in handleEscapeKey; wiring snippet in `help.ts`).
 * Backdrop click and right-click (contextmenu) back out via closeHelp().
 * Never phase-locked: renders from content defs alone, no session needed.
 */
import { useState } from 'preact/hooks';
import { buildingArt, civArt, resourceArt, unitArt, yieldArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { HELP_CATEGORY_LABEL, closeHelp, getHelpEntry, helpOpen, helpTopicId, searchHelp } from '../help';
import type { HelpEntry } from '../help';

/** Seal art where an entry has one (units, buildings, civs, resources, yields). */
function artFor(entry: HelpEntry): string | undefined {
  const dash = entry.id.indexOf('-');
  if (dash < 0) return undefined;
  const group = entry.id.slice(0, dash);
  const local = entry.id.slice(dash + 1);
  switch (group) {
    case 'unit':
      return unitArt(local);
    case 'building':
      return buildingArt(local);
    case 'civ':
      return civArt(local);
    case 'resource':
      return resourceArt(local);
    case 'yield':
      return yieldArt(local);
    default:
      return undefined;
  }
}

export function HelpOverlay() {
  const [query, setQuery] = useState('');
  const open = helpOpen.value;
  const requested = helpTopicId.value;
  if (!open) return null;

  const results = searchHelp(query);
  const active = (requested ? getHelpEntry(requested, results) : undefined) ?? results[0];

  return (
    <div
      class="modal-backdrop"
      onClick={() => closeHelp()}
      onContextMenu={(e) => {
        e.preventDefault();
        closeHelp();
      }}
    >
      <div
        class="modal help-overlay"
        role="dialog"
        aria-label="In-game help"
        data-testid="help-overlay"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Help</h2>
          <input
            class="tech-search"
            data-testid="help-search"
            type="search"
            placeholder="Search help…"
            autoFocus
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button class="btn-ghost" data-testid="help-close" onClick={() => closeHelp()}>
            Close
          </button>
        </header>
        <div class="help-body">
          <nav class="help-list" aria-label="Help entries">
            {results.length === 0 && <small class="help-empty">No entries match.</small>}
            {results.map((entry) => {
              const isActive = active !== undefined && entry.id === active.id;
              return (
                <button
                  key={entry.id}
                  data-testid={`help-entry-${entry.id}`}
                  class={`help-item${isActive ? ' active' : ''}`}
                  onClick={() => {
                    helpTopicId.value = entry.id;
                  }}
                >
                  <ArtIcon art={artFor(entry)} size={18} label={entry.title} />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{HELP_CATEGORY_LABEL[entry.category]}</small>
                  </span>
                </button>
              );
            })}
          </nav>
          <article class="help-detail">
            {active === undefined && <small class="help-empty">No entries match.</small>}
            {active !== undefined && (
              <div>
                <div class="help-detail-head">
                  <ArtIcon art={artFor(active)} size={28} label={active.title} />
                  <div>
                    <h3>{active.title}</h3>
                    <small>{HELP_CATEGORY_LABEL[active.category]}</small>
                  </div>
                </div>
                {active.body.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            )}
          </article>
        </div>
        <small class="help-hint">Esc or right-click closes</small>
      </div>
    </div>
  );
}
