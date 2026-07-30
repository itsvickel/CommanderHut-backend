import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../services/aiDeckBuilder/llmClient.js', () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from '../../../services/aiDeckBuilder/llmClient.js';
import { groundedSynergyPick } from '../../../services/aiDeckBuilder/groundedPick.js';

const candidate = (name, extras = {}) => ({
  _id: name,
  name,
  type_line: 'Creature — Goblin',
  oracle_text: 'Goblins matter.',
  cmc: 2,
  prices: { usd: 1 },
  edhrec_rank: 500,
  ...extras,
});

const makeRepo = (pool) => ({
  findSynergyCandidates: vi.fn().mockResolvedValue(pool),
});

const baseArgs = {
  commander: { _id: 'CMD', name: 'Krenko, Mob Boss' },
  colorIdentity: ['R'],
  themes: ['goblins'],
  strategy: 'Swarm with goblins',
  budgetRemaining: Infinity,
  excludeIds: ['CMD'],
  slots: 2,
};

beforeEach(() => vi.clearAllMocks());

describe('groundedSynergyPick', () => {
  it('returns only picks that exist in the candidate list', async () => {
    const repo = makeRepo([candidate('Goblin King'), candidate('Goblin Chieftain'), candidate('Skirk Prospector')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        picks: [
          { name: 'Goblin King', role: 'anthem' },
          { name: 'Black Lotus', role: 'not in list — must be dropped' },
          { name: 'Goblin Chieftain', role: 'haste anthem' },
        ],
      }),
      usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0001 },
    });

    const out = await groundedSynergyPick({ ...baseArgs, cardRepo: repo });
    expect(out.picks.map(p => p.name)).toEqual(['Goblin King', 'Goblin Chieftain']);
    expect(out.picks[0].role).toBe('anthem');
    expect(out.usage.input_tokens).toBe(10);
  });

  it('deduplicates picks and caps at the slot count', async () => {
    const repo = makeRepo([candidate('A'), candidate('B'), candidate('C')]);
    callLLM.mockResolvedValue({
      raw: JSON.stringify({
        picks: [
          { name: 'A', role: 'x' },
          { name: 'A', role: 'dupe' },
          { name: 'B', role: 'y' },
          { name: 'C', role: 'over the slot cap' },
        ],
      }),
      usage: {},
    });

    const out = await groundedSynergyPick({ ...baseArgs, cardRepo: repo, slots: 2 });
    expect(out.picks.map(p => p.name)).toEqual(['A', 'B']);
  });

  it('returns null when the pool is thinner than the slot count', async () => {
    const repo = makeRepo([candidate('Only One')]);
    const out = await groundedSynergyPick({ ...baseArgs, cardRepo: repo, slots: 5 });
    expect(out).toBeNull();
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('returns null when zero slots are requested', async () => {
    const out = await groundedSynergyPick({ ...baseArgs, cardRepo: makeRepo([]), slots: 0 });
    expect(out).toBeNull();
  });

  it('handles fenced JSON output', async () => {
    const repo = makeRepo([candidate('A'), candidate('B')]);
    callLLM.mockResolvedValue({
      raw: '```json\n' + JSON.stringify({ picks: [{ name: 'A', role: 'x' }] }) + '\n```',
      usage: {},
    });
    const out = await groundedSynergyPick({ ...baseArgs, cardRepo: repo, slots: 1 });
    expect(out.picks.map(p => p.name)).toEqual(['A']);
  });
});
