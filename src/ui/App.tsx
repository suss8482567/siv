import { screenSignal, sessionSeqSignal } from './store';
import { MainMenu } from './screens/MainMenu';
import { GameShell } from './screens/GameShell';

export function App() {
  const screen = screenSignal.value;
  // Keying GameShell on the session sequence forces a full remount (fresh
  // Pixi renderer) whenever a new game starts or a save is loaded in place.
  return screen === 'menu' ? <MainMenu /> : <GameShell key={sessionSeqSignal.value} />;
}
