import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, generateGame } from '@/engine';
import type { GameEvent } from '@/engine';
import { narrateEvents, notificationsSignal, sessionSignal } from '@/ui/store';

/**
 * Narration gating (Civ VI pattern): empire news stays home — rival city
 * growth/production/borders never surface as toasts, and turn changes never
 * toast (the TopBar owns the turn marker).
 */

const OPTIONS = {
  seed: 424242,
  preset: 'pangaea' as const,
  sizeId: 'duel',
  humanCivId: 'rome',
  aiCivIds: ['egypt'],
  difficulty: 1,
};

function humanIdOf(state: ReturnType<typeof generateGame>): number {
  return state.players.find((p) => p.isHuman)!.id;
}

function toasts(): string[] {
  return notificationsSignal.peek().map((n) => n.text);
}

describe('narrateEvents gating', () => {
  beforeEach(() => {
    const state = generateGame(OPTIONS);
    sessionSignal.value = { state, renderer: null, version: 0 };
    notificationsSignal.value = [];
  });

  it('hides rival city growth, production and border news', () => {
    const s = sessionSignal.peek()!;
    // Rivals boot as settlers — play until Egypt has founded a city.
    for (let i = 0; i < 12; i++) {
      if (Object.values(s.state.cities).some((c) => c.ownerId !== humanIdOf(s.state))) break;
      dispatch(s.state, { type: 'endTurn' });
    }
    const rival = Object.values(s.state.cities).find((c) => c.ownerId !== humanIdOf(s.state))!;
    const events: GameEvent[] = [
      { kind: 'cityGrew', cityId: rival.id, population: 2 },
      { kind: 'bordersExpanded', cityId: rival.id, tileIds: [] },
      { kind: 'productionComplete', cityId: rival.id, item: { kind: 'unit', id: 'warrior' } },
    ];
    narrateEvents(events);
    expect(toasts()).toEqual([]);
  });

  it('announces the human player’s own city news', () => {
    const s = sessionSignal.peek()!;
    const humanId = humanIdOf(s.state);
    const settler = Object.values(s.state.units).find(
      (u) => u.ownerId === humanId && u.typeId === 'settler',
    )!;
    const { events } = dispatch(s.state, { type: 'foundCity', unitId: settler.id });
    expect(events.some((e) => e.kind === 'cityFounded')).toBe(true);
    narrateEvents(events);
    expect(toasts().some((t) => t.startsWith('Founded '))).toBe(true);
  });

  it('never toasts turn changes', () => {
    const s = sessionSignal.peek()!;
    narrateEvents([{ kind: 'turnBegan', playerId: humanIdOf(s.state), turn: 7 }]);
    expect(toasts()).toEqual([]);
  });
});
