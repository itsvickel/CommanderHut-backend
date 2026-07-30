import { describe, it, expect } from 'vitest';
import { extractKeywords, scoreCard, rankBySynergy } from '../../../services/aiDeckBuilder/synergyScore.js';

describe('extractKeywords', () => {
  it('pulls theme and strategy words, dropping stopwords and short words', () => {
    const kws = extractKeywords({ themes: ['goblins', 'sacrifice'], strategy: 'Swarm the board with tokens' });
    expect(kws).toContain('goblins');
    expect(kws).toContain('sacrifice');
    expect(kws).toContain('tokens');
    expect(kws).not.toContain('the');
    expect(kws).not.toContain('with');
  });

  it('adds singular forms so "goblins" matches "goblin" text', () => {
    expect(extractKeywords({ themes: ['goblins'] })).toContain('goblin');
  });
});

describe('scoreCard', () => {
  it('scores theme matches above non-matches', () => {
    const kws = extractKeywords({ themes: ['goblins'] });
    const goblin = { oracle_text: 'Other Goblin creatures you control get +1/+1.', type_line: 'Creature — Goblin' };
    const rock = { oracle_text: 'Add {C}.', type_line: 'Artifact' };
    expect(scoreCard(goblin, kws)).toBeGreaterThan(scoreCard(rock, kws));
  });

  it('prefers a well-played card over an unplayed one, all else equal', () => {
    const popular = { oracle_text: '', edhrec_rank: 100 };
    const fringe = { oracle_text: '', edhrec_rank: 29000 };
    expect(scoreCard(popular, [])).toBeGreaterThan(scoreCard(fringe, []));
  });
});

describe('rankBySynergy', () => {
  it('orders theme-matching cards first', () => {
    const cards = [
      { name: 'Random Rock', oracle_text: 'Add {C}.', type_line: 'Artifact' },
      { name: 'Goblin King', oracle_text: 'Other Goblins get +1/+1.', type_line: 'Creature — Goblin' },
    ];
    const ranked = rankBySynergy(cards, { themes: ['goblins'], strategy: '' });
    expect(ranked[0].name).toBe('Goblin King');
  });
});
