import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCommander } from '../../../services/aiDeckBuilder/resolveCommander.js';

function stubRepo({ exact, legendaries }) {
  return {
    findByExactName: async (name) => (name === exact?.name ? exact : null),
    findLegendaryCreatures: async () => legendaries ?? [],
  };
}

const krenko = { _id: '1', name: 'Krenko, Mob Boss', colors: ['R'] };
const baral = { _id: '2', name: 'Baral, Chief of Compliance', colors: ['U'] };

const validScryfallCard = (name) => ({
  name,
  type_line: 'Legendary Creature — Goblin Warrior',
  legalities: { commander: 'legal' },
  color_identity: ['R'],
});

const mockScryfall = { lookupCard: vi.fn() };

beforeEach(() => vi.clearAllMocks());

describe('resolveCommander', () => {
  it('returns card and scryfallCard when Scryfall and DB both resolve', async () => {
    mockScryfall.lookupCard.mockResolvedValue(validScryfallCard('Krenko, Mob Boss'));
    const repo = stubRepo({ exact: krenko, legendaries: [] });
    const out = await resolveCommander('Krenko, Mob Boss', repo, mockScryfall);
    expect(out.card).toEqual(krenko);
    expect(out.scryfallCard.name).toBe('Krenko, Mob Boss');
  });

  it('falls back to DB fuzzy match when exact DB lookup fails', async () => {
    mockScryfall.lookupCard.mockResolvedValue(validScryfallCard('Krenko, Mob Boss'));
    const repo = stubRepo({ exact: null, legendaries: [krenko, baral] });
    const out = await resolveCommander('Krenko Mob Boss', repo, mockScryfall);
    expect(out.card.name).toBe('Krenko, Mob Boss');
  });

  it('returns null card with reason when Scryfall finds nothing', async () => {
    mockScryfall.lookupCard.mockResolvedValue(null);
    const repo = stubRepo({ exact: null, legendaries: [] });
    const out = await resolveCommander('Fake Card', repo, mockScryfall);
    expect(out.card).toBeNull();
    expect(out.reason).toMatch(/not found on Scryfall/);
  });

  it('returns null card with reason when card is not legendary', async () => {
    mockScryfall.lookupCard.mockResolvedValue({
      name: 'Llanowar Elves',
      type_line: 'Creature — Elf Druid',
      legalities: { commander: 'legal' },
    });
    const repo = stubRepo({ exact: null, legendaries: [] });
    const out = await resolveCommander('Llanowar Elves', repo, mockScryfall);
    expect(out.card).toBeNull();
    expect(out.reason).toMatch(/not a legendary/);
  });

  it('returns null card with reason when card is banned', async () => {
    mockScryfall.lookupCard.mockResolvedValue({
      name: 'Golos, Tireless Pilgrim',
      type_line: 'Legendary Creature — Scout',
      legalities: { commander: 'banned' },
    });
    const repo = stubRepo({ exact: null, legendaries: [] });
    const out = await resolveCommander('Golos, Tireless Pilgrim', repo, mockScryfall);
    expect(out.card).toBeNull();
    expect(out.reason).toMatch(/banned/);
  });

  it('returns null card when valid Scryfall card is not in local DB', async () => {
    mockScryfall.lookupCard.mockResolvedValue({
      name: 'Atraxa, Praetors\' Voice',
      type_line: 'Legendary Creature — Phyrexian Angel',
      legalities: { commander: 'legal' },
    });
    // DB only has krenko — no fuzzy match for "Atraxa, Praetors' Voice"
    const repo = stubRepo({ exact: null, legendaries: [krenko] });
    const out = await resolveCommander('Atraxa, Praetors\' Voice', repo, mockScryfall);
    expect(out.card).toBeNull();
    expect(out.reason).toMatch(/not found in the local card database/);
  });
});
