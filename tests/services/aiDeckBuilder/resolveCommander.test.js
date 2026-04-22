import { describe, it, expect } from 'vitest';
import { resolveCommander } from '../../../services/aiDeckBuilder/resolveCommander.js';

function stubRepo({ exact, legendaries }) {
  return {
    findByExactName: async (name) => (name === exact?.name ? exact : null),
    findLegendaryCreatures: async () => legendaries ?? [],
  };
}

const krenko = { _id: '1', name: 'Krenko, Mob Boss', colors: ['R'] };
const baral = { _id: '2', name: 'Baral, Chief of Compliance', colors: ['U'] };

describe('resolveCommander', () => {
  it('returns exact match when name matches', async () => {
    const repo = stubRepo({ exact: krenko, legendaries: [] });
    const out = await resolveCommander('Krenko, Mob Boss', repo);
    expect(out).toEqual(krenko);
  });

  it('falls back to fuzzy match when exact fails', async () => {
    const repo = stubRepo({ exact: null, legendaries: [krenko, baral] });
    const out = await resolveCommander('Krenko Mob Boss', repo);
    expect(out.name).toBe('Krenko, Mob Boss');
  });

  it('returns null when no fuzzy match is close enough', async () => {
    const repo = stubRepo({ exact: null, legendaries: [krenko] });
    const out = await resolveCommander('Completely Different Name', repo);
    expect(out).toBeNull();
  });
});
