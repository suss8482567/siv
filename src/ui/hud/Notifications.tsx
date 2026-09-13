/** Bottom-center toast stack fed by engine events (newest at the bottom). */
import { jumpToTile } from '../nav';
import { notificationsSignal, sessionSignal, type Notification } from '../store';

function jump(n: Notification): void {
  if (!n.target) return;
  const s = sessionSignal.peek();
  if (!s) return;
  // Prefer selecting the subject; fall back to a bare camera jump.
  if (n.target.cityId != null && s.state.cities[n.target.cityId]) {
    jumpToTile(n.target.tileId, { unitId: null, cityId: n.target.cityId });
  } else if (n.target.unitId != null && s.state.units[n.target.unitId]) {
    jumpToTile(n.target.tileId, { unitId: n.target.unitId, cityId: null });
  } else {
    jumpToTile(n.target.tileId);
  }
}

export function Notifications() {
  const session = sessionSignal.value;
  const items = notificationsSignal.value;
  if (!session || items.length === 0) return null; // no phantom pill when quiet
  return (
    <div class="notifications" data-testid="notifications">
      {items.map((n) => (
        <div
          key={n.id}
          class={`notification notification-${n.kind}${n.target ? ' notification-jump' : ''}`}
          data-testid={n.target ? 'notification-jump' : undefined}
          onClick={n.target ? () => jump(n) : undefined}
          title={n.target ? 'Click to jump there' : undefined}
        >
          {n.text}
          {(n.count ?? 1) > 1 ? ` ×${n.count}` : ''}
        </div>
      ))}
    </div>
  );
}
