import { describe, it, expect } from 'vitest';
import { computeDeckStats, estimateBracket, deriveObservations } from '../../../services/aiDeckBuilder/deckStats.js';

const card = (name, extras = {}) => ({
  name,
  type_line: 'Creature — Goblin',
  oracle_text: '',
  cmc: 2,
  colors: ['R'],
  color_identity: ['R'],
  mana_cost: '{1}{R}',
  prices: { usd: 1 },
  ...extras,
});

const land = (name) => card(name, {
  type_line: 'Basic Land — Mountain',
  cmc: 0,
  mana_cost: '',
  prices: { usd: 0.1 },
});

describe('computeDeckStats', () => {
  it('separates lands from non-lands and averages only non-land mana value', () => {
    const stats = computeDeckStats({
      entries: [
        { card: card('Two Drop', { cmc: 2 }), quantity: 1 },
        { card: card('Four Drop', { cmc: 4 }), quantity: 1 },
        { card: land('Mountain'), quantity: 34 },
      ],
    });
    expect(stats.total_cards).toBe(36);
    expect(stats.lands).toBe(34);
    expect(stats.nonland_cards).toBe(2);
    expect(stats.average_mana_value).toBe(3);
  });

  it('buckets the mana curve', () => {
    const stats = computeDeckStats({
      entries: [
        { card: card('One', { cmc: 1 }), quantity: 1 },
        { card: card('Three', { cmc: 3 }), quantity: 2 },
        { card: card('Seven', { cmc: 7 }), quantity: 1 },
      ],
    });
    expect(stats.curve['0-1']).toBe(1);
    expect(stats.curve['3']).toBe(2);
    expect(stats.curve['6+']).toBe(1);
  });

  it('buckets fractional mana values without producing NaN', () => {
    const stats = computeDeckStats({
      entries: [{ card: card('Half Drop', { cmc: 1.5 }), quantity: 1 }],
    });
    expect(Object.values(stats.curve).every(v => Number.isFinite(v))).toBe(true);
    expect(stats.curve['2']).toBe(1);
  });

  it('counts roles from oracle text', () => {
    const stats = computeDeckStats({
      entries: [
        { card: card('Rampant Growth', { oracle_text: 'Search your library for a basic land card.' }), quantity: 1 },
        { card: card('Divination', { oracle_text: 'Draw two cards.' }), quantity: 1 },
        { card: card('Doom Blade', { oracle_text: 'Destroy target creature.' }), quantity: 1 },
      ],
    });
    expect(stats.role_counts.ramp).toBe(1);
    expect(stats.role_counts.draw).toBe(1);
    expect(stats.role_counts.removal).toBe(1);
  });

  it('flags Game Changers and off-identity cards', () => {
    const stats = computeDeckStats({
      entries: [
        { card: card('Rhystic Study', { game_changer: true }), quantity: 1 },
        { card: card('Swords to Plowshares', { colors: ['W'], color_identity: ['W'] }), quantity: 1 },
      ],
      commanderDoc: card('Krenko, Mob Boss'),
    });
    expect(stats.game_changers).toEqual(['Rhystic Study']);
    expect(stats.off_identity).toEqual(['Swords to Plowshares']);
  });

  it('totals price with quantity', () => {
    const stats = computeDeckStats({
      entries: [{ card: card('Buck', { prices: { usd: 2.5 } }), quantity: 4 }],
    });
    expect(stats.total_price_usd).toBe(10);
  });
});

describe('estimateBracket', () => {
  it('returns 2 for no game changers and few tutors', () => {
    expect(estimateBracket(0, { tutor: 1 })).toBe(2);
  });
  it('returns 3 for 1-3 game changers', () => {
    expect(estimateBracket(2, {})).toBe(3);
  });
  it('returns 3 for tutor-dense decks with no game changers', () => {
    expect(estimateBracket(0, { tutor: 5 })).toBe(3);
  });
  it('returns 4 above three game changers and 5 when very dense', () => {
    expect(estimateBracket(5, {})).toBe(4);
    expect(estimateBracket(9, {})).toBe(5);
  });
});

describe('deriveObservations', () => {
  const healthy = {
    total_cards: 100, lands: 36, average_mana_value: 3.0,
    role_counts: { ramp: 10, draw: 10, removal: 8, board_wipe: 2 },
    off_identity: [],
  };

  it('says nothing about a structurally sound deck', () => {
    expect(deriveObservations(healthy)).toEqual([]);
  });

  it('flags a deck that is not 100 cards', () => {
    expect(deriveObservations({ ...healthy, total_cards: 99 })[0]).toMatch(/exactly 100/);
  });

  it('flags low land counts and thin roles', () => {
    const notes = deriveObservations({
      ...healthy, lands: 30, role_counts: { ramp: 3, draw: 4, removal: 2, board_wipe: 0 },
    });
    expect(notes.some(n => /34-38/.test(n))).toBe(true);
    expect(notes.some(n => /ramp/.test(n))).toBe(true);
    expect(notes.some(n => /board wipes/.test(n))).toBe(true);
  });

  it('flags illegal off-identity cards', () => {
    const notes = deriveObservations({ ...healthy, off_identity: ['Swords to Plowshares'] });
    expect(notes.some(n => /color identity/.test(n))).toBe(true);
  });
});
