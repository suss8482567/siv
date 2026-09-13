/**
 * Generic choice card (docs/UI_REWORK.md P2.6): a title, a trigger line ("why
 * am I seeing this"), one option button per choice — each carrying its
 * mechanical-consequence detail text — plus Cancel. First used by the
 * DiplomacyPanel declare-war confirm; future peace-offer / event cards reuse
 * the same shape and testid conventions (`choice-card`, `choice-<id>`,
 * `choice-cancel`).
 */
export interface ChoiceOption {
  id: string;
  label: string;
  /** Mechanical-consequence preview, e.g. "-40 relations both ways". */
  detail: string;
  tone?: 'danger' | 'good' | 'neutral';
  /** Optional data-testid override; defaults to `choice-${id}`. */
  testId?: string;
}

export interface ChoiceCardProps {
  title: string;
  /** "Why am I seeing this" line, e.g. "You clicked Declare War." */
  trigger: string;
  options: ChoiceOption[];
  onPick: (id: string) => void;
  onCancel: () => void;
}

export function ChoiceCard({ title, trigger, options, onPick, onCancel }: ChoiceCardProps) {
  return (
    <div class="choice-card" data-testid="choice-card" role="dialog" aria-label={title}>
      <h3 class="choice-title">{title}</h3>
      <p class="choice-trigger">{trigger}</p>
      <div class="choice-options">
        {options.map((o) => (
          <button
            key={o.id}
            class={`choice-option${o.tone === 'danger' ? ' choice-danger' : o.tone === 'good' ? ' choice-good' : ''}`}
            data-testid={o.testId ?? `choice-${o.id}`}
            onClick={() => onPick(o.id)}
          >
            <strong>{o.label}</strong>
            <small>{o.detail}</small>
          </button>
        ))}
      </div>
      <button class="btn-ghost choice-cancel" data-testid="choice-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
