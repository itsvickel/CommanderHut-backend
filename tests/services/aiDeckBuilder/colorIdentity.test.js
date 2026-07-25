import { describe, it, expect } from 'vitest';
import { computeColorIdentity, isWithinIdentity } from '../../../services/aiDeckBuilder/colorIdentity.js';

describe('computeColorIdentity', () => {
  it('returns the commander colors for a mono-color commander', () => {
    expect(computeColorIdentity({ colors: ['R'] })).toEqual(['R']);
  });

  it('returns sorted WUBRG for multicolor', () => {
    expect(computeColorIdentity({ colors: ['G', 'U'] })).toEqual(['U', 'G']);
  });

  it('returns [] for a colorless commander', () => {
    expect(computeColorIdentity({ colors: [] })).toEqual([]);
  });

  it('prefers color_identity over colors when both exist', () => {
    // e.g. a mono-blue creature with a black activation cost
    expect(computeColorIdentity({ colors: ['U'], color_identity: ['U', 'B'] })).toEqual(['U', 'B']);
  });
});

describe('isWithinIdentity', () => {
  it('allows cards with no colors (artifact) in any identity', () => {
    expect(isWithinIdentity({ colors: [] }, ['R'])).toBe(true);
  });

  it('allows a mono-color card in a matching identity', () => {
    expect(isWithinIdentity({ colors: ['R'] }, ['R', 'G'])).toBe(true);
  });

  it('rejects a card with a color outside identity', () => {
    expect(isWithinIdentity({ colors: ['W'] }, ['R', 'G'])).toBe(false);
  });

  it('rejects any color card in a colorless identity', () => {
    expect(isWithinIdentity({ colors: ['U'] }, [])).toBe(false);
  });

  it('rejects a card whose color_identity exceeds the deck identity even if colors fit', () => {
    // hybrid/off-color activation: colors [] but identity ['W']
    expect(isWithinIdentity({ colors: [], color_identity: ['W'] }, ['R', 'G'])).toBe(false);
  });
});
