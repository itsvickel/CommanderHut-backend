import { describe, it, expect } from 'vitest';
import {
  filterByBracket,
  isGameChanger,
  gameChangerAllowance,
  violatesBracketRestrictions,
} from '../../../services/aiDeckBuilder/bracketFilter.js';

const gameChangers = ['Mana Vault', "Gaea's Cradle"];

const cards = [
  { name: 'Sol Ring' },
  { name: 'Mana Vault' },
  { name: 'Forest' },
  { name: "Gaea's Cradle" },
];

describe('isGameChanger', () => {
  it('recognizes a game changer by exact name', () => {
    expect(isGameChanger({ name: 'Mana Vault' }, gameChangers)).toBe(true);
  });
  it('recognizes a game changer via the synced Scryfall flag', () => {
    expect(isGameChanger({ name: 'New Card', game_changer: true }, gameChangers)).toBe(true);
  });
  it('does not flag non-game-changers', () => {
    expect(isGameChanger({ name: 'Sol Ring' }, gameChangers)).toBe(false);
  });
});

describe('gameChangerAllowance', () => {
  it('is 0 for brackets 1-2, 3 for bracket 3, unlimited for 4+', () => {
    expect(gameChangerAllowance(1)).toBe(0);
    expect(gameChangerAllowance(2)).toBe(0);
    expect(gameChangerAllowance(3)).toBe(3);
    expect(gameChangerAllowance(4)).toBe(Infinity);
    expect(gameChangerAllowance(5)).toBe(Infinity);
  });
});

describe('violatesBracketRestrictions', () => {
  const armageddon = { name: 'Armageddon', oracle_text: 'Destroy all lands.' };
  const timeWarp = { name: 'Time Warp', oracle_text: 'Target player takes an extra turn after this one.' };

  it('blocks mass land denial for brackets 1-3', () => {
    expect(violatesBracketRestrictions(armageddon, 1)).toBe(true);
    expect(violatesBracketRestrictions(armageddon, 3)).toBe(true);
    expect(violatesBracketRestrictions(armageddon, 4)).toBe(false);
  });

  it('blocks extra-turn cards only for brackets 1-2', () => {
    expect(violatesBracketRestrictions(timeWarp, 2)).toBe(true);
    expect(violatesBracketRestrictions(timeWarp, 3)).toBe(false);
  });
});

describe('filterByBracket', () => {
  it('removes game changers at bracket 1', () => {
    const out = filterByBracket(cards, 1, gameChangers);
    expect(out.map(c => c.name)).toEqual(['Sol Ring', 'Forest']);
  });

  it('allows up to 3 game changers at bracket 3', () => {
    const many = [
      { name: 'A', game_changer: true },
      { name: 'B', game_changer: true },
      { name: 'C', game_changer: true },
      { name: 'D', game_changer: true },
      { name: 'Sol Ring' },
    ];
    const out = filterByBracket(many, 3, []);
    expect(out.map(c => c.name)).toEqual(['A', 'B', 'C', 'Sol Ring']);
  });

  it('shares the allowance across calls via gcBudget', () => {
    const budget = { remaining: gameChangerAllowance(3) };
    const first = filterByBracket(
      [{ name: 'A', game_changer: true }, { name: 'B', game_changer: true }],
      3, [], budget
    );
    const second = filterByBracket(
      [{ name: 'C', game_changer: true }, { name: 'D', game_changer: true }],
      3, [], budget
    );
    expect(first).toHaveLength(2);
    expect(second.map(c => c.name)).toEqual(['C']);
  });

  it('admits no game changers when the shared budget is exhausted', () => {
    const out = filterByBracket(cards, 3, gameChangers, { remaining: 0 });
    expect(out.map(c => c.name)).toEqual(['Sol Ring', 'Forest']);
  });

  it('allows game changers at bracket 4', () => {
    expect(filterByBracket(cards, 4, gameChangers)).toHaveLength(4);
  });
  it('allows game changers at bracket 5', () => {
    expect(filterByBracket(cards, 5, gameChangers)).toHaveLength(4);
  });
});
