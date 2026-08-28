/** Bottom-center toast stack fed by engine events (newest at the bottom). */
import { notificationsSignal, sessionSignal } from '../store';

export function Notifications() {
  const session = sessionSignal.value;
  const items = notificationsSignal.value;
  if (!session || items.length === 0) return null; // no phantom pill when quiet
  return (
    <div class="notifications" data-testid="notifications">
      {items.map((n) => (
        <div key={n.id} class={`notification notification-${n.kind}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
