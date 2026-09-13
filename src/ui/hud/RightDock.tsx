import { sessionSignal } from '../store';
import { DiploRibbon } from './DiploRibbon';
import { LensBar } from './LensBar';
import { Minimap } from './Minimap';

/** Right dock: minimap column (event reports surface as bottom-center toasts). */
export function RightDock() {
  const session = sessionSignal.value;
  if (!session) return null;
  return (
    <div class="right-dock" data-testid="right-dock">
      <LensBar />
      <Minimap />
      <DiploRibbon />
    </div>
  );
}
