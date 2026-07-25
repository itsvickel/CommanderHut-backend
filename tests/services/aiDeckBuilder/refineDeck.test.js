import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../services/aiDeckBuilder/llmClient.js', () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from '../../../services/aiDeckBuilder/llmClient.js';
import { refineDeck } from '../../../services/aiDeckBuilder/refineDeck.js';

const card = (name, extras = {}) => ({
  _id: name,
  name,
  type_line: 'Creature',
  oracle_text: '',
  cmc: 2,
  colors: ['R'],
  color_identity: ['R'],
  prices: { usd: 1 },
  edhrec_rank: 500,
  legalities: { commander: 'legal' },
  ...extras,
});

const commander = card('Krenko, Mob Boss', { type_line: 'Legendary Creature — Goblin Warrior' });

const deckCards = [
  { card: commander, quantity: 1, role: 'commander' },
  { card: card('Weak Goblin'), quantity: 1, role: 'synergy' },
  { card: card('Filler Card'), quantity: 1, role: 'synergy' },
  { card: card('Mountain', { type_line: 'Basic Land — Mountain' }), quantity: 30, role: 'land' },
];

const makeRepo = (pool) => ({
  findSynergyCandidates: vi.fn().mockResolvedValue(pool),
});

const baseArgs = {
  commander,
  colorIdentity: ['R'],
  deckCards,
  instruction: 'add more removal',
  themes: ['goblins'],
  strategy: 'Swarm',
  power_bracket: 2,
  budget_usd: null,
  gameChangers: [],
};

beforeEach(() => vi.clearAllMocks());

describe('refineDeck', () => {
  it('returns a paired add/cut diff', async () => {
    const repo = makeRepo([card('Chaos Warp', { type_line: 'Instant' }), card('Vandalblast', { type_line: 'Sorcery' })]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        adds: [{ name: 'Chaos Warp', role: 'removal' }],
        cuts: [{ name: 'Weak Goblin', reason: 'low impact' }],
        summary: 'Added removal.',
      }),
      usage: { input_tokens: 5, output_tokens: 3, cost_usd: 0.00001 },
      model: 'test-model',
    });

    const out = await refineDeck({ ...baseArgs, cardRepo: repo });
    expect(out.adds.map(a => a.name)).toEqual(['Chaos Warp']);
    expect(out.cuts.map(c => c.name)).toEqual(['Weak Goblin']);
    expect(out.summary).toBe('Added removal.');
  });

  it('drops adds that are not in the candidate list', async () => {
    const repo = makeRepo([card('Chaos Warp'), card('Vandalblast')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        adds: [{ name: 'Black Lotus', role: 'ramp' }, { name: 'Chaos Warp', role: 'removal' }],
        cuts: [{ name: 'Weak Goblin' }, { name: 'Filler Card' }],
        summary: '',
      }),
      usage: {},
    });

    const out = await refineDeck({ ...baseArgs, cardRepo: repo });
    expect(out.adds.map(a => a.name)).toEqual(['Chaos Warp']);
    // cuts are trimmed to match the number of valid adds so the deck stays at 100
    expect(out.cuts).toHaveLength(1);
  });

  it('refuses to cut the commander or basic lands', async () => {
    const repo = makeRepo([card('Chaos Warp')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        adds: [{ name: 'Chaos Warp', role: 'removal' }],
        cuts: [{ name: 'Krenko, Mob Boss' }, { name: 'Mountain' }, { name: 'Filler Card' }],
        summary: '',
      }),
      usage: {},
    });

    const out = await refineDeck({ ...baseArgs, cardRepo: repo });
    expect(out.cuts.map(c => c.name)).toEqual(['Filler Card']);
  });

  it('rejects off-identity adds', async () => {
    const repo = makeRepo([card('Swords to Plowshares', { colors: ['W'], color_identity: ['W'] })]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        adds: [{ name: 'Swords to Plowshares', role: 'removal' }],
        cuts: [{ name: 'Weak Goblin' }],
        summary: '',
      }),
      usage: {},
    });

    await expect(refineDeck({ ...baseArgs, cardRepo: repo })).rejects.toMatchObject({
      code: 'NO_VALID_CHANGES',
    });
  });

  it('rejects Game Changer adds in low brackets', async () => {
    const repo = makeRepo([card('Rhystic Study', { game_changer: true })]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        adds: [{ name: 'Rhystic Study', role: 'draw' }],
        cuts: [{ name: 'Weak Goblin' }],
        summary: '',
      }),
      usage: {},
    });

    await expect(refineDeck({ ...baseArgs, power_bracket: 2, cardRepo: repo })).rejects.toMatchObject({
      code: 'NO_VALID_CHANGES',
    });
  });

  it('throws NO_CANDIDATES when the pool is empty', async () => {
    await expect(refineDeck({ ...baseArgs, cardRepo: makeRepo([]) })).rejects.toMatchObject({
      code: 'NO_CANDIDATES',
    });
    expect(callLLM).not.toHaveBeenCalled();
  });
});
