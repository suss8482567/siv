/**
 * Left-docked city panel: yields/growth header, then production choices in
 * three separate rows — Buildings, Wonders, Units.
 */
import { buildContentDb } from '@/content';
import type { BuildingDef, UnitDef } from '@/content';
import { currentPlayer } from '@/engine';
import { computeCityYields, cultureForNextBorder, foodToGrow } from '@/engine/systems/economy';
import { buildingArt, unitArt, yieldArt } from '@/assets/art';
import { ArtIcon } from '../hud/ArtIcon';
import { selectionSignal, sessionSignal, submitCommand } from '../store';

export function CityScreen() {
  const session = sessionSignal.value;
  const { cityId } = selectionSignal.value;
  if (!session || cityId == null || session.state.winner) return null;
  const state = session.state;
  const city = state.cities[cityId];
  if (!city || city.ownerId !== currentPlayer(state).id) return null;
  const content = buildContentDb();
  const y = computeCityYields(state, city);
  const need = foodToGrow(city.population);
  const borderGoal = cultureForNextBorder(city.ownedTileIds.length);
  const known = new Set(currentPlayer(state).researchedTechIds);

  const available = (requiresTechId?: string) => !requiresTechId || known.has(requiresTechId);
  const civ = currentPlayer(state).civId;

  // Card tooltips (native title): stats line + which tech is missing when locked.
  const lockedNote = (techId?: string): string =>
    techId && !available(techId) ? ` — needs ${content.techs[techId]?.name ?? techId}` : '';
  const unitDesc = (u: UnitDef): string => {
    const parts = [`${u.unitClass} · ${u.strength} str`];
    if (u.rangedStrength > 0) parts.push(`${u.rangedStrength} ranged · range ${u.range}`);
    parts.push(`${u.moves} MP`);
    if (u.maintenance > 0) parts.push(`${u.maintenance} g/t upkeep`);
    return parts.join(' · ') + lockedNote(u.requiresTechId);
  };
  const buildingDesc = (b: BuildingDef): string => {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(b.yields)) {
      if (value > 0) parts.push(`+${value} ${key}`);
    }
    if (b.defenseStrength > 0) parts.push(`+${b.defenseStrength} city defense`);
    if (b.amenityPoints > 0) parts.push(`+${b.amenityPoints} amenity`);
    if (b.maintenance > 0) parts.push(`${b.maintenance} g/t upkeep`);
    return (parts.length > 0 ? parts.join(' · ') : 'no yields') + lockedNote(b.requiresTechId);
  };

  const wonderBuilt = (id: string) => Object.values(state.cities).some((c) => c.buildings.includes(id));
  const units = Object.values(content.units).filter((u) => !u.uniqueToCivId || u.uniqueToCivId === civ);
  const buildings = Object.values(content.buildings).filter(
    (b) => !b.isWonder && !city.buildings.includes(b.id) && (!b.uniqueToCivId || b.uniqueToCivId === civ),
  );
  const wonders = Object.values(content.buildings).filter((b) => b.isWonder && !wonderBuilt(b.id));
  const item = city.productionQueue[0];
  const itemCost = item
    ? item.kind === 'unit' ? content.units[item.id]?.cost : content.buildings[item.id]?.cost
    : undefined;

  return (
    <div class="modal-backdrop city-backdrop" onClick={() => (selectionSignal.value = { unitId: null, cityId: null })}>
      <div class="modal city-screen" onClick={(e) => e.stopPropagation()} data-testid="city-screen">
        <header>
          <h2>{city.name}</h2>
          <span>Pop {city.population}</span>
          <button
            class="btn-ghost"
            onClick={() => (selectionSignal.value = { unitId: null, cityId: null })}
          >
            Close
          </button>
        </header>
        <div class="city-yields" data-testid="city-yields">
          <span title="Food per turn"><ArtIcon art={yieldArt('food')} size={16} label="Food" />{y.food}</span>
          <span title="Production per turn"><ArtIcon art={yieldArt('production')} size={16} label="Production" />{y.production}</span>
          <span title="Gold per turn"><ArtIcon art={yieldArt('gold')} size={16} label="Gold" />{y.gold}</span>
          <span title="Science per turn"><ArtIcon art={yieldArt('science')} size={16} label="Science" />{y.science}</span>
          <span title="Culture per turn"><ArtIcon art={yieldArt('culture')} size={16} label="Culture" />{y.culture}</span>
        </div>
        <div class="city-growth">
          Growth: {Math.max(0, city.foodStored)} / {need} food
          {' · '}
          Borders: {city.cultureStored} / {borderGoal} culture
          {' · '}
          Tiles worked: {Math.min(city.population, Math.max(0, city.ownedTileIds.length - 1))}
        </div>
        <div class="city-production">
          <div class="prod-head">
            <h3>
              Production{' '}
              {item ? `— ${itemLabel(item.kind, item.id)} (${Math.max(0, (itemCost ?? 0) - city.productionStored)} left)` : '— nothing queued'}
            </h3>
            {item && itemCost !== undefined && itemCost > city.productionStored && (
              <button
                class="btn-ghost buy-btn"
                data-testid="buy-production"
                disabled={currentPlayer(state).gold < buyGoldCost(itemCost, city.productionStored)}
                title={`Buy outright for ${buyGoldCost(itemCost, city.productionStored)} gold (3× remaining hammers)`}
                onClick={() => submitCommand({ type: 'buyProduction', cityId: city.id, item })}
              >
                <ArtIcon art={yieldArt('gold')} size={14} label="Gold" />
                Buy {buyGoldCost(itemCost, city.productionStored)}
              </button>
            )}
          </div>

          <ProdRow
            title="Buildings"
            items={buildings.map((b) => ({
              key: b.id,
              name: b.name,
              cost: b.cost,
              locked: !available(b.requiresTechId),
              desc: buildingDesc(b),
              kind: 'building' as const,
              wonder: false,
              art: buildingArt(b.id),
            }))}
          />
          <ProdRow
            title="Wonders"
            subtitle="one per world"
            items={wonders.map((w) => ({
              key: w.id,
              name: w.name,
              cost: w.cost,
              locked: !available(w.requiresTechId),
              desc: buildingDesc(w),
              kind: 'building' as const,
              wonder: true,
              art: buildingArt(w.id),
            }))}
          />
          <ProdRow
            title="Units"
            items={units.map((u) => ({
              key: u.id,
              name: u.name,
              cost: u.cost,
              locked: !available(u.requiresTechId),
              desc: unitDesc(u),
              kind: 'unit' as const,
              wonder: false,
              art: unitArt(u.id),
            }))}
          />
        </div>
      </div>
    </div>
  );
}

interface ProdItem {
  key: string;
  name: string;
  cost: number;
  locked: boolean;
  desc: string;
  kind: 'unit' | 'building';
  wonder: boolean;
  art?: string;
}

function ProdRow(props: { title: string; subtitle?: string; items: ProdItem[] }) {
  const setProduction = (it: ProdItem) =>
    submitCommand({ type: 'setProduction', cityId: selectionSignal.value.cityId!, item: { kind: it.kind, id: it.key } });
  return (
    <div class="prod-row">
      <h3>{props.title}{props.subtitle ? ` — ${props.subtitle}` : ''}</h3>
      {props.items.length === 0 ? (
        <div class="prod-row-empty">None available.</div>
      ) : (
        <div class="prod-options">
          {props.items.map((it) => (
            <button
              key={it.key}
              class={`prod-card${it.wonder ? ' wonder-card' : ''}`}
              data-testid={`prod-${it.key}`}
              disabled={it.locked}
              title={`${it.name}\n${it.desc}\n${it.cost} hammers`}
              onClick={() => setProduction(it)}
            >
              {it.art && <ArtIcon art={it.art} size={40} label={it.name} />}
              <strong>{it.name}</strong>
              <small>
                {it.cost} hammers · {it.kind}
                {it.locked ? ' (tech locked)' : ''}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function itemLabel(kind: 'unit' | 'building', id: string): string {
  const content = buildContentDb();
  return kind === 'unit' ? content.units[id]?.name ?? id : content.buildings[id]?.name ?? id;
}

/** Engine mirror (SPEC §9): buying costs 3 gold per remaining hammer. */
function buyGoldCost(cost: number, stored: number): number {
  return Math.ceil(Math.max(0, cost - stored) * 3);
}
