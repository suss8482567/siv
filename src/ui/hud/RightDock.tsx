import { sessionSignal } from '../store';
import { Minimap } from './Minimap';

/** Right dock: minimap column (event reports surface as bottom-center toasts). */
export function RightDock() {
  const session = sessionSignal.value;
  if (!session) return null;
  return (
    <div class="right-dock" data-testid="right-dock">
      <Minimap />
    </div>
  );
}
