/**
 * Heuristic synergy scoring for fill candidates: theme-keyword matches in
 * oracle/type text, EDHREC popularity, and a mild curve preference.
 * Pure functions — no DB access.
 */

const STOPWORDS = new Set([
  'the', 'and', 'with', 'your', 'from', 'that', 'this', 'into', 'onto',
  'their', 'them', 'then', 'than', 'have', 'has', 'are', 'for', 'you',
  'all', 'each', 'when', 'whenever', 'card', 'cards', 'deck', 'decks',
  'commander', 'magic', 'gathering', 'build', 'building', 'make', 'made',
  'strategy', 'theme', 'themes', 'play', 'player', 'players', 'games',
  'game', 'want', 'like', 'around', 'focus', 'focused', 'based', 'style',
]);

export function extractKeywords({ themes = [], strategy = '' }) {
  const words = [
    ...themes.flatMap(t => String(t).toLowerCase().split(/[^a-z]+/)),
    ...String(strategy).toLowerCase().split(/[^a-z]+/),
  ].filter(w => w.length >= 4 && !STOPWORDS.has(w));

  const out = new Set();
  for (const w of words) {
    out.add(w);
    // naive singularization so "goblins" also matches "goblin"
    if (w.endsWith('s') && w.length >= 5) out.add(w.slice(0, -1));
  }
  return [...out];
}

// EDHREC ranks run from 1 (most played) to ~30k+; unranked cards get no bonus.
const EDHREC_CEILING = 30000;

export function scoreCard(card, keywords) {
  let score = 0;
  const text = `${card.oracle_text ?? ''} ${card.type_line ?? ''}`.toLowerCase();
  for (const kw of keywords) {
    if (text.includes(kw)) score += 2;
  }
  if (card.edhrec_rank != null) {
    score += (Math.max(0, EDHREC_CEILING - card.edhrec_rank) / EDHREC_CEILING) * 3;
  }
  const cmc = card.cmc ?? 0;
  if (cmc >= 2 && cmc <= 4) score += 0.5;
  return score;
}

export function rankBySynergy(cards, { themes = [], strategy = '' } = {}) {
  const keywords = extractKeywords({ themes, strategy });
  return cards
    .map(card => ({ card, score: scoreCard(card, keywords) }))
    .sort((a, b) => b.score - a.score)
    .map(({ card }) => card);
}
