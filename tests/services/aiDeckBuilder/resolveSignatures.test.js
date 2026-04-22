import { describe, it, expect } from 'vitest';
import { resolveSignatures } from '../../../services/aiDeckBuilder/resolveSignatures.js';

const SOL_RING = {
  _id: 'a', name: 'Sol Ring', colors: [],
  legalities: { commander: 'legal' },
};
const COUNTERSPELL = {
  _id: 'b', name: 'Counterspell', colors: ['U'],
  legalities: { commander: 'legal' },
};
const BALANCE = {
  _id: 'c', name: 'Balance', colors: ['W'],
  legalities: { commander: 'banned' },
};

function stubRepo(cardsByName) {
  return {
    findByNames: async (names) => names.map(n => cardsByName[n]).filter(Boolean),
  };
}

describe('resolveSignatures', () => {
  it('returns cards that match name, identity, and legality', async () => {
    const repo = stubRepo({ 'Sol Ring': SOL_RING, Counterspell: COUNTERSPELL });
    const input = [
      { name: 'Sol Ring', role: 'ramp' },
      { name: 'Counterspell', role: 'interaction' },
    ];
    const { resolved, dropped } = await resolveSignatures(input, ['U', 'R'], repo);
    expect(resolved.map(c => c.name).sort()).toEqual(['Counterspell', 'Sol Ring']);
    expect(dropped).toEqual([]);
  });

  it('drops cards outside color identity', async () => {
    const repo = stubRepo({ Counterspell: COUNTERSPELL });
    const input = [{ name: 'Counterspell', role: 'interaction' }];
    const { resolved, dropped } = await resolveSignatures(input, ['R'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Counterspell']);
  });

  it('drops banned cards', async () => {
    const repo = stubRepo({ Balance: BALANCE });
    const input = [{ name: 'Balance', role: 'removal' }];
    const { resolved, dropped } = await resolveSignatures(input, ['W'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Balance']);
  });

  it('drops unresolvable names', async () => {
    const repo = stubRepo({});
    const input = [{ name: 'Fake Card', role: 'synergy' }];
    const { resolved, dropped } = await resolveSignatures(input, ['R'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Fake Card']);
  });

  it('attaches the role from the input to the resolved card', async () => {
    const repo = stubRepo({ 'Sol Ring': SOL_RING });
    const { resolved } = await resolveSignatures(
      [{ name: 'Sol Ring', role: 'ramp' }], ['R'], repo);
    expect(resolved[0].role).toBe('ramp');
  });
});
