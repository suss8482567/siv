/** Top resource/status bar with live treasury/science/culture per turn. */
import { buildContentDb } from '@/content';
import { currentPlayer } from '@/engine';
import { computeCityYields } from '@/engine/systems/economy';
import { civArt, yieldArt } from '@/assets/art';
import { ArtIcon } from './ArtIcon';
import { openTechTree } from '../screens/TechTree';
import { openDiplomacy } from '../screens/DiplomacyPanel';
import { openEmpire } from '../screens/EmpireOverview';
import { openHelp } from '../help';
import { sessionSignal } from '../store';
import { formatSigned } from '@/util';

export function TopBar() {
  const session = sessionSignal.value;
  if (!session) return null;
  const { state } = session;
  const player = currentPlayer(state);
  const content = buildContentDb();
  const civ = content.civs[player.civId];

  let gold = 0, expense = 0, science = 0, culture = 0;
  for (const city of Object.values(state.cities)) {
    if (city.ownerId !== player.id) continue;
    const y = computeCityYields(state, city);
    gold += y.gold; science += y.science; culture += y.culture;
    for (const bid of city.buildings) expense += content.buildings[bid]?.maintenance ?? 0;
  }
  for (const unit of Object.values(state.units)) {
    if (unit.ownerId === player.id) expense += content.units[unit.typeId]?.maintenance ?? 0;
  }

  return (
    <div class="topbar" data-testid="topbar">
      <span class="topbar-civ" style={{ color: civ.color }}>
        <ArtIcon art={civArt(player.civId)} size={22} label={civ.name} />
        {civ.name} — {civ.leaderName}
      </span>
      <span class="topbar-turn">
        Turn {state.turn} / {state.turnLimit}
      </span>
      <span class="topbar-yield" title="Treasury · net per turn" data-testid="topbar-gold">
        <ArtIcon art={yieldArt('gold')} size={16} label="Gold" />
        <span class="topbar-gold-big">{Math.round(player.gold)}</span>
        <span class="topbar-gold-net">
          {formatSigned(Math.round(gold - expense))}/t
        </span>
      </span>
      <button class="btn-ghost topbar-science topbar-yield" data-testid="open-tech-tree" onClick={() => openTechTree()} title="Open tech tree">
        <ArtIcon art={yieldArt('science')} size={16} label="Science" />
        +{science}{player.researchingTechId ? ` · ${content.techs[player.researchingTechId]?.name ?? ''}` : ' · pick research'}
      </button>
      <span class="topbar-yield" title="Culture per turn">
        <ArtIcon art={yieldArt('culture')} size={16} label="Culture" />
        +{culture}
      </span>
      <button
        class="btn-ghost topbar-diplo"
        data-testid="open-diplomacy"
        title="Diplomacy — relations, war and peace"
        onClick={() => openDiplomacy()}
      >
        Diplomacy
      </button>
      <button
        class="btn-ghost"
        data-testid="open-empire"
        title="Empire overview — cities and units"
        onClick={() => openEmpire()}
      >
        Empire
      </button>
      <button
        class="btn-ghost"
        data-testid="open-help"
        title="In-game help — units, techs, yields, concepts"
        onClick={() => openHelp()}
      >
        Help
      </button>
    </div>
  );
}
