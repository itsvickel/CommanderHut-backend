import { describe, it, expect } from 'vitest';
import { countColorPips, computeLandTarget, splitBasics } from '../../../services/aiDeckBuilder/manaBase.js';

describe('countColorPips', () => {
  it('counts colored symbols and ignores generic costs', () => {
    const pips = countColorPips([
      { mana_cost: '{2}{W}{W}' },
      { mana_cost: '{U}' },
    ]);
    expect(pips.W).toBe(2);
    expect(pips.U).toBe(1);
    expect(pips.B).toBe(0);
  });

  it('counts each color of a hybrid symbol', () => {
    const pips = countColorPips([{ mana_cost: '{W/U}' }]);
    expect(pips.W).toBe(1);
    expect(pips.U).toBe(1);
  });
});

describe('computeLandTarget', () => {
  it('returns 36 for an empty list', () => {
    expect(computeLandTarget([])).toBe(36);
  });
  it('runs fewer lands for a low curve and more for a high curve', () => {
    const low = Array.from({ length: 10 }, () => ({ cmc: 2 }));
    const high = Array.from({ length: 10 }, () => ({ cmc: 4.5 }));
    expect(computeLandTarget(low)).toBe(34);
    expect(computeLandTarget(high)).toBe(38);
  });
});

describe('splitBasics', () => {
  it('splits proportionally to pips', () => {
    const split = splitBasics(['W', 'U'], { W: 30, U: 10 }, 20);
    expect(split.W + split.U).toBe(20);
    expect(split.W).toBeGreaterThan(split.U);
  });

  it('splits evenly when there are no pips', () => {
    expect(splitBasics(['R', 'G'], { R: 0, G: 0 }, 10)).toEqual({ R: 5, G: 5 });
  });

  it('guarantees at least one basic per identity color', () => {
    const split = splitBasics(['W', 'U', 'B'], { W: 50, U: 0, B: 0 }, 10);
    expect(split.U).toBeGreaterThanOrEqual(1);
    expect(split.B).toBeGreaterThanOrEqual(1);
    expect(split.W + split.U + split.B).toBe(10);
  });
});
