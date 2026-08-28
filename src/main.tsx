/**
 * App entry: validate content early (fail loudly on bad data), mount the root
 * component, and gate viewports below desktop minimums.
 */
import { render } from 'preact';
import { buildContentDb } from './content';
import { meetsDesktopRequirements } from './util';
import { App } from './ui/App';
import './styles.css';

buildContentDb();

let mounted = false;

function mount(): void {
  if (mounted) return;
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root missing');
  mounted = true;
  render(<App />, root);
}

function applyGate(): void {
  const ok = meetsDesktopRequirements(window.innerWidth, window.innerHeight);
  let gate = document.getElementById('desktop-gate');
  if (ok) {
    gate?.remove();
    mount();
    return;
  }
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'desktop-gate';
    gate.textContent = 'SIV needs a desktop-sized window (at least 1280x720).';
    document.body.appendChild(gate);
  }
}

applyGate();
window.addEventListener('resize', applyGate);
