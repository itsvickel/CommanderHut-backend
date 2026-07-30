import { describe, it, expect } from 'vitest';
import { validateCommanderDeck } from '../../services/deckValidation.js';

const doc = (name, extras = {}) => ({ name, type_line: 'Creature', oracle_text: '', ...extras });

describe('validateCommanderDeck', () => {
  it('accepts a small legal list', () => {
    const out = validateCommanderDeck({
      entries: [
        { card: doc('Sol Ring', { type_line: 'Artifact' }), quantity: 1 },
        { card: doc('Mountain', { type_line: 'Basic Land — Mountain' }), quantity: 30 },
      ],
    });
    expect(out.valid).toBe(true);
  });

  it('flags singleton violations for non-basics', () => {
    const out = validateCommanderDeck({
      entries: [{ card: doc('Lightning Bolt', { type_line: 'Instant' }), quantity: 4 }],
    });
    expect(out.valid).toBe(false);
    expect(out.singletonViolations).toEqual(['Lightning Bolt']);
  });

  it('allows multiple copies of snow basics', () => {
    const out = validateCommanderDeck({
      entries: [{
        card: doc('Snow-Covered Forest', { type_line: 'Basic Snow Land — Forest' }),
        quantity: 30,
      }],
    });
    expect(out.valid).toBe(true);
  });

  it('allows bounded multi-copy cards like Seven Dwarves', () => {
    const out = validateCommanderDeck({
      entries: [{
        card: doc('Seven Dwarves', {
          oracle_text: 'A deck can have up to seven cards named Seven Dwarves.',
        }),
        quantity: 7,
      }],
    });
    expect(out.valid).toBe(true);
  });

  it('allows any-number cards like Relentless Rats', () => {
    const out = validateCommanderDeck({
      entries: [{
        card: doc('Relentless Rats', {
          oracle_text: 'A deck can have any number of cards named Relentless Rats.',
        }),
        quantity: 20,
      }],
    });
    expect(out.valid).toBe(true);
  });

  it('rejects decks over 100 cards', () => {
    const out = validateCommanderDeck({
      entries: [{ card: doc('Forest', { type_line: 'Basic Land — Forest' }), quantity: 101 }],
    });
    expect(out.valid).toBe(false);
    expect(out.errors[0]).toMatch(/limited to 100/);
  });

  it('rejects cards outside the commander color identity', () => {
    const out = validateCommanderDeck({
      entries: [
        { card: doc('Swords to Plowshares', { color_identity: ['W'] }), quantity: 1 },
        { card: doc('Shock', { color_identity: ['R'] }), quantity: 1 },
      ],
      commanderDoc: doc('Krenko, Mob Boss', { color_identity: ['R'] }),
    });
    expect(out.valid).toBe(false);
    expect(out.identityViolations).toEqual(['Swords to Plowshares']);
  });

  it('skips identity checks when the commander is unknown', () => {
    const out = validateCommanderDeck({
      entries: [{ card: doc('Shock', { color_identity: ['R'] }), quantity: 1 }],
      commanderDoc: null,
    });
    expect(out.valid).toBe(true);
  });
});
