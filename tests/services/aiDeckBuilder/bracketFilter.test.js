import { describe, it, expect } from 'vitest';
import { filterByBracket, isGameChanger } from '../../../services/aiDeckBuilder/bracketFilter.js';

const gameChangers = ['Mana Crypt', 'Gaea\'s Cradle'];

const cards = [
  { name: 'Sol Ring' },
  { name: 'Mana Crypt' },
  { name: 'Forest' },
  { name: "Gaea's Cradle" },
];

describe('isGameChanger', () => {
  it('recognizes a game changer by exact name', () => {
    expect(isGameChanger({ name: 'Mana Crypt' }, gameChangers)).toBe(true);
  });
  it('does not flag non-game-changers', () => {
    expect(isGameChanger({ name: 'Sol Ring' }, gameChangers)).toBe(false);
  });
});

describe('filterByBracket', () => {
  it('removes game changers at bracket 1', () => {
    const out = filterByBracket(cards, 1, gameChangers);
    expect(out.map(c => c.name)).toEqual(['Sol Ring', 'Forest']);
  });
  it('removes game changers at bracket 3', () => {
    expect(filterByBracket(cards, 3, gameChangers)).toHaveLength(2);
  });
  it('allows game changers at bracket 4', () => {
    expect(filterByBracket(cards, 4, gameChangers)).toHaveLength(4);
  });
  it('allows game changers at bracket 5', () => {
    expect(filterByBracket(cards, 5, gameChangers)).toHaveLength(4);
  });
});
