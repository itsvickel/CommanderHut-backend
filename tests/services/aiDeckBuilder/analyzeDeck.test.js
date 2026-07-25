import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../services/aiDeckBuilder/llmClient.js', () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from '../../../services/aiDeckBuilder/llmClient.js';
import { analyzeDeck } from '../../../services/aiDeckBuilder/analyzeDeck.js';

const card = (name, extras = {}) => ({
  _id: name,
  name,
  type_line: 'Creature — Goblin',
  oracle_text: '',
  cmc: 2,
  colors: ['R'],
  color_identity: ['R'],
  mana_cost: '{1}{R}',
  prices: { usd: 1 },
  edhrec_rank: 400,
  ...extras,
});

const commander = card('Krenko, Mob Boss', { type_line: 'Legendary Creature — Goblin Warrior' });

const entries = [
  { card: commander, quantity: 1 },
  { card: card('Goblin King'), quantity: 1 },
  { card: card('Mountain', { type_line: 'Basic Land — Mountain', cmc: 0, mana_cost: '' }), quantity: 34 },
];

const makeRepo = (pool) => ({ findSynergyCandidates: vi.fn().mockResolvedValue(pool) });

const baseArgs = {
  commander,
  colorIdentity: ['R'],
  entries,
  strategy: 'Goblin swarm',
  themes: ['goblins'],
  gameChangers: [],
};

beforeEach(() => vi.clearAllMocks());

describe('analyzeDeck', () => {
  it('returns stats, critique and grounded suggestions', async () => {
    const repo = makeRepo([card('Impact Tremors'), card('Purphoros, God of the Forge')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        verdict: 'Solid goblin base, thin on removal.',
        strengths: ['Focused theme'],
        weaknesses: ['Little interaction'],
        suggestions: [{ name: 'Impact Tremors', reason: 'Converts tokens to damage' }],
      }),
      usage: { input_tokens: 20, output_tokens: 10, cost_usd: 0.0002 },
      model: 'test-model',
    });

    const out = await analyzeDeck({ ...baseArgs, cardRepo: repo });

    expect(out.stats.total_cards).toBe(36);
    expect(out.stats.lands).toBe(34);
    expect(out.verdict).toBe('Solid goblin base, thin on removal.');
    expect(out.strengths).toEqual(['Focused theme']);
    expect(out.suggestions.map(s => s.name)).toEqual(['Impact Tremors']);
    expect(out.usage.input_tokens).toBe(20);
  });

  it('drops suggestions that are not in the candidate list', async () => {
    const repo = makeRepo([card('Impact Tremors')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        verdict: 'ok',
        strengths: [],
        weaknesses: [],
        suggestions: [
          { name: 'Black Lotus', reason: 'hallucinated' },
          { name: 'Impact Tremors', reason: 'real' },
        ],
      }),
      usage: {},
    });

    const out = await analyzeDeck({ ...baseArgs, cardRepo: repo });
    expect(out.suggestions.map(s => s.name)).toEqual(['Impact Tremors']);
  });

  it('includes rule-based observations for a thin deck', async () => {
    const repo = makeRepo([]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({ verdict: '', strengths: [], weaknesses: [], suggestions: [] }),
      usage: {},
    });

    const out = await analyzeDeck({ ...baseArgs, cardRepo: repo });
    // 36-card fixture: not 100 cards, no ramp/draw/removal
    expect(out.observations.some(o => /exactly 100/.test(o))).toBe(true);
    expect(out.observations.some(o => /ramp/.test(o))).toBe(true);
  });

  it('still produces a critique when candidate lookup fails', async () => {
    const repo = { findSynergyCandidates: vi.fn().mockRejectedValue(new Error('db down')) };
    callLLM.mockResolvedValue({
      raw: JSON.stringify({ verdict: 'Fine.', strengths: [], weaknesses: [], suggestions: [] }),
      usage: {},
    });

    const out = await analyzeDeck({ ...baseArgs, cardRepo: repo });
    expect(out.verdict).toBe('Fine.');
    expect(out.suggestions).toEqual([]);
  });

  it('ignores non-string entries in strengths and weaknesses', async () => {
    const repo = makeRepo([]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        verdict: 'ok',
        strengths: ['good', 42, null],
        weaknesses: 'not an array',
        suggestions: [],
      }),
      usage: {},
    });

    const out = await analyzeDeck({ ...baseArgs, cardRepo: repo });
    expect(out.strengths).toEqual(['good']);
    expect(out.weaknesses).toEqual([]);
  });
});
