/**
 * End-Turn attention list (docs/UI_REWORK.md P1.1): a badge with the count of
 * actionable items plus a jump list (units → cities → research). Clicking an
 * item selects it and centers the camera; research opens the tech tree.
 */
import { useState } from 'preact/hooks';
import { getAttentionItems, type AttentionItem } from '../attention';
import { jumpToTile } from '../nav';
import { openTechTree } from '../screens/TechTree';
import { sessionSignal } from '../store';

function jump(item: AttentionItem): void {
  if (item.kind === 'unit') {
    jumpToTile(item.tileId, { unitId: item.id ?? null, cityId: null });
  } else if (item.kind === 'city') {
    jumpToTile(item.tileId, { unitId: null, cityId: item.id ?? null });
  } else {
    jumpToTile(item.tileId);
    openTechTree();
  }
}

export function AttentionBadge() {
  const session = sessionSignal.value;
  const [open, setOpen] = useState(false);
  if (!session || session.state.winner) return null;
  const items = getAttentionItems(session.state);
  if (items.length === 0) return null;
  // Civ VI pattern: the End-Turn blocker names its categories, not a bare count.
  const units = items.filter((i) => i.kind === 'unit').length;
  const cities = items.filter((i) => i.kind === 'city').length;
  const research = items.some((i) => i.kind === 'research');
  const parts: string[] = [];
  if (units > 0) parts.push(units === 1 ? '1 unit' : `${units} units`);
  if (cities > 0) parts.push(cities === 1 ? '1 city idle' : `${cities} cities idle`);
  if (research) parts.push('research');
  const summary = parts.join(' · ');
  return (
    <div class="attention-wrap">
      <button
        class="btn-ghost attention-badge"
        data-testid="end-turn-badge"
        title={`${summary} — click to list, N cycles units`}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <div class="attention-list" data-testid="attention-list">
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.id ?? 'research'}`}
              class="attention-item"
              data-testid={`attention-${it.kind}-${it.id ?? 'research'}`}
              onClick={() => {
                setOpen(false);
                jump(it);
              }}
              title={i === 0 ? 'Jump to it' : undefined}
            >
              <span class={`attention-kind attention-${it.kind}`}>{it.kind}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
