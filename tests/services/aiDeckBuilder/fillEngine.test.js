import { describe, it, expect } from 'vitest';
import { fillEngine } from '../../../services/aiDeckBuilder/fillEngine.js';

const card = (name, extras = {}) => ({
  _id: name,
  name,
  colors: [],
  type_line: 'Artifact',
  legalities: { commander: 'legal' },
  prices: { usd: 1 },
  ...extras,
});

const basic = name => card(name, {
  type_line: `Basic Land — ${name}`,
  prices: { usd: 0.1 },
});

function makeRepo({ rampPool = [], drawPool = [], removalPool = [], nonBasicPool = [], basics = {} } = {}) {
  return {
    findByRole: async ({ role }) => {
      if (role === 'ramp') return rampPool;
      if (role === 'draw') return drawPool;
      if (role === 'removal') return removalPool;
      return [];
    },
    findNonBasicLands: async () => nonBasicPool,
    findBasicLandByColor: async (c) => basics[c] ?? null,
    findWastes: async () => basics.C ?? null,
  };
}

describe('fillEngine', () => {
  it('fills to exactly 99 non-commander slots', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      drawPool: Array.from({ length: 15 }, (_, i) => card(`Draw ${i}`)),
      removalPool: Array.from({ length: 15 }, (_, i) => card(`Removal ${i}`)),
      nonBasicPool: Array.from({ length: 20 }, (_, i) => card(`NbLand ${i}`, {
        type_line: 'Land',
      })),
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko, Mob Boss', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: 'Goblin swarm',
    });

    const total = out.reduce((s, e) => s + e.quantity, 0);
    expect(total).toBe(99);
  });

  it('hits role quotas (10 ramp, 10 draw, 10 removal) when pools allow', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      drawPool: Array.from({ length: 15 }, (_, i) => card(`Draw ${i}`)),
      removalPool: Array.from({ length: 15 }, (_, i) => card(`Removal ${i}`)),
      nonBasicPool: [],
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko, Mob Boss', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const nameCount = role => out.filter(e => e.role === role).length;
    expect(nameCount('ramp')).toBe(10);
    expect(nameCount('draw')).toBe(10);
    expect(nameCount('removal')).toBe(10);
  });

  it('falls back to basic lands when budget runs out', async () => {
    const repo = makeRepo({
      rampPool: [card('Costly Ramp', { prices: { usd: 100 } })],
      drawPool: [],
      removalPool: [],
      nonBasicPool: [],
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 10,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const totalCards = out.reduce((s, e) => s + e.quantity, 0);
    expect(totalCards).toBe(99);
    const mountain = out.find(e => e.card.name === 'Mountain');
    expect(mountain).toBeTruthy();
    expect(mountain.quantity).toBeGreaterThan(5);
  });

  it('uses Wastes for a colorless commander', async () => {
    const repo = makeRepo({
      basics: { C: card('Wastes', { type_line: 'Basic Land — Wastes', prices: { usd: 0.1 } }) },
    });

    const out = await fillEngine({
      commander: { _id: 'KOZI', name: 'Kozilek', colors: [] },
      signatures: [],
      colorIdentity: [],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    expect(out.find(e => e.card.name === 'Wastes')).toBeTruthy();
  });

  it('counts signature cards toward role quotas', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      basics: { R: basic('Mountain') },
    });

    const sigRamp = { ...card('Signed Ramp'), role: 'ramp' };
    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'X', colors: ['R'] },
      signatures: [sigRamp],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const ramp = out.filter(e => e.role === 'ramp');
    expect(ramp.length).toBe(10); // 1 signature + 9 filled
  });
});
