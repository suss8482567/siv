/**
 * Resource roster (M1). Bonus = tile yield boost, strategic = unlocks units /
 * buildings once connected, luxury = amenities + gold. Placement rules live in
 * the mapgen resource pass; this file is pure data.
 */


export const RESOURCES = [
  // --- bonus ---
  { id: 'wheat', name: 'Wheat', kind: 'bonus', terrains: ['grassland', 'plains'], yieldsDelta: { food: 1, production: 0, gold: 0, science: 0, culture: 0 } },
  { id: 'cattle', name: 'Cattle', kind: 'bonus', terrains: ['grassland'], yieldsDelta: { food: 1, production: 1, gold: 0, science: 0, culture: 0 } },
  { id: 'sheep', name: 'Sheep', kind: 'bonus', terrains: ['plains', 'tundra'], yieldsDelta: { food: 1, production: 0, gold: 0, science: 0, culture: 0 } },
  { id: 'deer', name: 'Deer', kind: 'bonus', terrains: ['tundra'], yieldsDelta: { food: 1, production: 1, gold: 0, science: 0, culture: 0 } },
  { id: 'stone', name: 'Stone', kind: 'bonus', terrains: ['plains', 'desert', 'tundra'], yieldsDelta: { food: 0, production: 1, gold: 0, science: 0, culture: 0 } },
  { id: 'fish', name: 'Fish', kind: 'bonus', terrains: ['coast'], yieldsDelta: { food: 1, production: 0, gold: 1, science: 0, culture: 0 } },
  // --- strategic ---
  { id: 'horses', name: 'Horses', kind: 'strategic', terrains: ['grassland', 'plains'], yieldsDelta: { food: 0, production: 1, gold: 0, science: 0, culture: 0 }, amountMin: 2, amountMax: 4 },
  { id: 'iron', name: 'Iron', kind: 'strategic', terrains: ['grassland', 'plains', 'desert', 'tundra'], yieldsDelta: { food: 0, production: 1, gold: 0, science: 0, culture: 0 }, amountMin: 2, amountMax: 5 },
  { id: 'coal', name: 'Coal', kind: 'strategic', terrains: ['grassland', 'plains', 'desert', 'tundra'], yieldsDelta: { food: 0, production: 2, gold: 0, science: 0, culture: 0 }, amountMin: 2, amountMax: 4 },
  // --- luxury ---
  { id: 'silk', name: 'Silk', kind: 'luxury', terrains: ['grassland', 'plains'], yieldsDelta: { food: 0, production: 0, gold: 3, science: 0, culture: 0 } },
  { id: 'spices', name: 'Spices', kind: 'luxury', terrains: ['grassland', 'plains'], yieldsDelta: { food: 1, production: 0, gold: 2, science: 0, culture: 0 } },
  { id: 'furs', name: 'Furs', kind: 'luxury', terrains: ['tundra'], yieldsDelta: { food: 0, production: 1, gold: 2, science: 0, culture: 0 } },
  { id: 'marble', name: 'Marble', kind: 'luxury', terrains: ['plains', 'tundra'], yieldsDelta: { food: 0, production: 1, gold: 1, science: 0, culture: 1 } },
  { id: 'gems', name: 'Gems', kind: 'luxury', terrains: ['desert', 'plains'], yieldsDelta: { food: 0, production: 0, gold: 4, science: 0, culture: 0 } },
  { id: 'silver', name: 'Silver', kind: 'luxury', terrains: ['desert', 'tundra'], yieldsDelta: { food: 0, production: 0, gold: 3, science: 0, culture: 0 } },
  { id: 'wine', name: 'Wine', kind: 'luxury', terrains: ['grassland', 'plains'], yieldsDelta: { food: 0, production: 0, gold: 2, science: 0, culture: 1 } },
  { id: 'dyes', name: 'Dyes', kind: 'luxury', terrains: ['grassland'], yieldsDelta: { food: 0, production: 0, gold: 2, science: 0, culture: 1 } },
  { id: 'incense', name: 'Incense', kind: 'luxury', terrains: ['desert'], yieldsDelta: { food: 0, production: 0, gold: 2, science: 0, culture: 1 } },
  { id: 'salt', name: 'Salt', kind: 'luxury', terrains: ['tundra', 'desert'], yieldsDelta: { food: 1, production: 0, gold: 2, science: 0, culture: 0 } },
];
