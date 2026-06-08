import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSignatures } from '../../../services/aiDeckBuilder/resolveSignatures.js';

const SOL_RING_DB = { _id: 'a', name: 'Sol Ring', legalities: { commander: 'legal' } };
const COUNTERSPELL_DB = { _id: 'b', name: 'Counterspell', legalities: { commander: 'legal' } };

const scryfallCard = (name, colorIdentity, legal = true) => ({
  name,
  color_identity: colorIdentity,
  legalities: { commander: legal ? 'legal' : 'banned' },
});

function stubRepo(cardsByName) {
  return {
    findByNames: async (names) => names.map(n => cardsByName[n]).filter(Boolean),
  };
}

const mockScryfall = { lookupCardBatch: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('resolveSignatures', () => {
  it('returns cards that match name, identity, and legality', async () => {
    mockScryfall.lookupCardBatch.mockResolvedValue({
      found: [scryfallCard('Sol Ring', []), scryfallCard('Counterspell', ['U'])],
      notFound: [],
    });
    const repo = stubRepo({ 'Sol Ring': SOL_RING_DB, Counterspell: COUNTERSPELL_DB });
    const input = [
      { name: 'Sol Ring', role: 'ramp' },
      { name: 'Counterspell', role: 'interaction' },
    ];
    const { resolved, dropped } = await resolveSignatures(input, ['U', 'R'], repo, mockScryfall);
    expect(resolved.map(c => c.name).sort()).toEqual(['Counterspell', 'Sol Ring']);
    expect(dropped).toEqual([]);
  });

  it('drops cards outside color identity', async () => {
    mockScryfall.lookupCardBatch.mockResolvedValue({
      found: [scryfallCard('Counterspell', ['U'])],
      notFound: [],
    });
    const repo = stubRepo({ Counterspell: COUNTERSPELL_DB });
    const { resolved, dropped } = await resolveSignatures(
      [{ name: 'Counterspell', role: 'interaction' }], ['R'], repo, mockScryfall
    );
    expect(resolved).toEqual([]);
    expect(dropped).toContain('Counterspell');
  });

  it('drops banned cards', async () => {
    mockScryfall.lookupCardBatch.mockResolvedValue({
      found: [scryfallCard('Balance', ['W'], false)],
      notFound: [],
    });
    const repo = stubRepo({});
    const { resolved, dropped } = await resolveSignatures(
      [{ name: 'Balance', role: 'removal' }], ['W'], repo, mockScryfall
    );
    expect(resolved).toEqual([]);
    expect(dropped).toContain('Balance');
  });

  it('drops cards not found on Scryfall', async () => {
    mockScryfall.lookupCardBatch.mockResolvedValue({ found: [], notFound: ['Fake Card'] });
    const repo = stubRepo({});
    const { resolved, dropped } = await resolveSignatures(
      [{ name: 'Fake Card', role: 'synergy' }], ['R'], repo, mockScryfall
    );
    expect(resolved).toEqual([]);
    expect(dropped).toContain('Fake Card');
  });

  it('attaches the role from the input to the resolved card', async () => {
    mockScryfall.lookupCardBatch.mockResolvedValue({
      found: [scryfallCard('Sol Ring', [])],
      notFound: [],
    });
    const repo = stubRepo({ 'Sol Ring': SOL_RING_DB });
    const { resolved } = await resolveSignatures(
      [{ name: 'Sol Ring', role: 'ramp' }], ['R'], repo, mockScryfall
    );
    expect(resolved[0].role).toBe('ramp');
  });
});
