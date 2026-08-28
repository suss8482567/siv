import type { TechDef } from './schema';

/**
 * Full v0 tree (GAME_DESIGN §6): 13 techs per era × 3 eras. The seven
 * Ancient-era starter ids keep their original ids/costs — saves and tests
 * depend on them.
 */
export const TECHS: TechDef[] = [
  // --- ancient ---
  { id: 'agriculture', name: 'Agriculture', era: 'ancient', lane: 'culture', cost: 20, prereqIds: [] },
  { id: 'pottery', name: 'Pottery', era: 'ancient', lane: 'economy', cost: 25, prereqIds: [] },
  { id: 'animal_husbandry', name: 'Animal Husbandry', era: 'ancient', lane: 'economy', cost: 25, prereqIds: [] },
  { id: 'mining', name: 'Mining', era: 'ancient', lane: 'economy', cost: 25, prereqIds: [] },
  { id: 'bronze_working', name: 'Bronze Working', era: 'ancient', lane: 'military', cost: 35, prereqIds: ['mining'] },
  { id: 'archery', name: 'Archery', era: 'ancient', lane: 'military', cost: 35, prereqIds: ['animal_husbandry'] },
  { id: 'mysticism', name: 'Mysticism', era: 'ancient', lane: 'culture', cost: 35, prereqIds: ['agriculture'] },
  { id: 'writing', name: 'Writing', era: 'ancient', lane: 'science', cost: 40, prereqIds: ['pottery'] },
  { id: 'masonry', name: 'Masonry', era: 'ancient', lane: 'economy', cost: 40, prereqIds: ['mining'] },
  { id: 'calendar', name: 'Calendar', era: 'ancient', lane: 'culture', cost: 45, prereqIds: ['pottery'] },
  { id: 'the_wheel', name: 'The Wheel', era: 'ancient', lane: 'economy', cost: 50, prereqIds: ['animal_husbandry'] },
  { id: 'iron_working', name: 'Iron Working', era: 'ancient', lane: 'military', cost: 55, prereqIds: ['bronze_working'] },
  { id: 'mathematics', name: 'Mathematics', era: 'ancient', lane: 'science', cost: 60, prereqIds: ['writing'] },
  // --- medieval ---
  { id: 'construction', name: 'Construction', era: 'medieval', lane: 'military', cost: 140, prereqIds: ['masonry'] },
  { id: 'drama', name: 'Drama', era: 'medieval', lane: 'culture', cost: 140, prereqIds: ['writing'] },
  { id: 'currency', name: 'Currency', era: 'medieval', lane: 'economy', cost: 150, prereqIds: ['mathematics'] },
  { id: 'philosophy', name: 'Philosophy', era: 'medieval', lane: 'science', cost: 170, prereqIds: ['calendar', 'writing'] },
  { id: 'theology', name: 'Theology', era: 'medieval', lane: 'culture', cost: 170, prereqIds: ['drama', 'mysticism'] },
  { id: 'feudalism', name: 'Feudalism', era: 'medieval', lane: 'military', cost: 170, prereqIds: ['iron_working'] },
  { id: 'engineering', name: 'Engineering', era: 'medieval', lane: 'economy', cost: 190, prereqIds: ['construction', 'mathematics'] },
  { id: 'guilds', name: 'Guilds', era: 'medieval', lane: 'economy', cost: 210, prereqIds: ['currency'] },
  { id: 'architecture', name: 'Architecture', era: 'medieval', lane: 'culture', cost: 220, prereqIds: ['theology', 'currency'] },
  { id: 'chivalry', name: 'Chivalry', era: 'medieval', lane: 'military', cost: 230, prereqIds: ['feudalism', 'the_wheel'] },
  { id: 'education', name: 'Education', era: 'medieval', lane: 'science', cost: 230, prereqIds: ['philosophy'] },
  { id: 'machinery', name: 'Machinery', era: 'medieval', lane: 'economy', cost: 240, prereqIds: ['engineering'] },
  { id: 'astronomy', name: 'Astronomy', era: 'medieval', lane: 'science', cost: 250, prereqIds: ['education'] },
  // --- renaissance ---
  { id: 'physics', name: 'Physics', era: 'renaissance', lane: 'science', cost: 320, prereqIds: ['machinery'] },
  { id: 'banking', name: 'Banking', era: 'renaissance', lane: 'economy', cost: 350, prereqIds: ['guilds'] },
  { id: 'printing_press', name: 'Printing Press', era: 'renaissance', lane: 'culture', cost: 340, prereqIds: ['philosophy', 'machinery'] },
  { id: 'chemistry', name: 'Chemistry', era: 'renaissance', lane: 'science', cost: 360, prereqIds: ['physics'] },
  { id: 'humanism', name: 'Humanism', era: 'renaissance', lane: 'culture', cost: 370, prereqIds: ['printing_press'] },
  { id: 'gunpowder', name: 'Gunpowder', era: 'renaissance', lane: 'military', cost: 380, prereqIds: ['chemistry'] },
  { id: 'acoustics', name: 'Acoustics', era: 'renaissance', lane: 'culture', cost: 390, prereqIds: ['architecture'] },
  { id: 'navigation', name: 'Navigation', era: 'renaissance', lane: 'economy', cost: 400, prereqIds: ['astronomy', 'guilds'] },
  { id: 'military_tradition', name: 'Military Tradition', era: 'renaissance', lane: 'military', cost: 410, prereqIds: ['chivalry'] },
  { id: 'economics', name: 'Economics', era: 'renaissance', lane: 'economy', cost: 430, prereqIds: ['banking', 'astronomy'] },
  { id: 'scientific_method', name: 'Scientific Method', era: 'renaissance', lane: 'science', cost: 440, prereqIds: ['chemistry', 'education'] },
  { id: 'metallurgy', name: 'Metallurgy', era: 'renaissance', lane: 'military', cost: 460, prereqIds: ['gunpowder'] },
  { id: 'sovereignty', name: 'Sovereignty', era: 'renaissance', lane: 'culture', cost: 500, prereqIds: ['humanism', 'economics'] },
];
