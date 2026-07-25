import { callLLM } from './llmClient.js';
import { computeDeckStats, deriveObservations } from './deckStats.js';
import { rankBySynergy } from './synergyScore.js';

/**
 * Deck analysis: deterministic stats + rule-based observations, handed to
 * the LLM for a critique. Upgrade suggestions are picked from a real
 * candidate list (same grounding as generation/refinement), so every
 * suggested card exists and is legal in the deck's identity.
 */

const SUGGESTION_CANDIDATES = 60;
const MAX_SUGGESTIONS = 8;

function stripFences(str) {
  return str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

const SYSTEM_PROMPT = [
  'You are an expert Magic: The Gathering Commander deck reviewer.',
  'You receive precomputed deck statistics, factual observations about the list, and a CANDIDATES list of real upgrade options.',
  'Write a critique grounded ONLY in the numbers and observations you are given — never invent statistics.',
  'Rules:',
  '- Suggested upgrades must come EXACTLY from the CANDIDATES list.',
  `- At most ${MAX_SUGGESTIONS} suggestions, each with a concrete reason.`,
  '- Be specific and honest. If the deck is solid, say so rather than inventing problems.',
  'Output ONLY valid JSON, no markdown:',
  '{ "verdict": "2-3 sentence overall assessment",',
  '  "strengths": ["..."],',
  '  "weaknesses": ["..."],',
  '  "suggestions": [ { "name": "candidate name", "reason": "what it fixes" } ] }',
].join('\n');

export async function analyzeDeck({
  commander, colorIdentity, entries, strategy = '', themes = [],
  cardRepo, gameChangers = [], emit = () => {},
}) {
  emit('progress', { stage: 'stats', message: 'Computing deck statistics...' });

  const stats = computeDeckStats({ entries, commanderDoc: commander, gameChangers });
  const observations = deriveObservations(stats);

  emit('progress', { stage: 'candidates', message: 'Finding upgrade candidates...' });

  let candidates = [];
  try {
    const pool = await cardRepo.findSynergyCandidates({
      colorIdentity,
      excludeIds: entries.map(e => e.card._id),
      maxPrice: null,
      limit: 200,
    });
    candidates = rankBySynergy(pool, { themes, strategy }).slice(0, SUGGESTION_CANDIDATES);
  } catch (err) {
    console.warn('[analyzeDeck] candidate lookup failed:', err.message);
  }
  const candidateByName = new Map(candidates.map(c => [c.name, c]));

  emit('progress', { stage: 'critique', message: 'Reviewing the deck...' });

  const prompt = [
    `Commander: ${commander.name}`,
    `Color identity: ${colorIdentity.join('') || 'colorless'}`,
    strategy ? `Stated strategy: ${strategy}` : null,
    '',
    'STATISTICS:',
    `- ${stats.total_cards} cards total, ${stats.lands} lands, ${stats.nonland_cards} non-lands`,
    `- Average mana value (non-lands): ${stats.average_mana_value}`,
    `- Curve: ${Object.entries(stats.curve).map(([k, v]) => `${k}:${v}`).join(', ')}`,
    `- Types: ${Object.entries(stats.type_counts).map(([k, v]) => `${k}:${v}`).join(', ')}`,
    `- Roles: ${Object.entries(stats.role_counts).map(([k, v]) => `${k}:${v}`).join(', ')}`,
    `- Estimated bracket: ${stats.estimated_bracket}`,
    `- Game Changers: ${stats.game_changers.length ? stats.game_changers.join(', ') : 'none'}`,
    `- Estimated price: $${stats.total_price_usd}`,
    '',
    observations.length ? 'OBSERVATIONS:' : 'OBSERVATIONS: none — the list looks structurally sound.',
    ...observations.map(o => `- ${o}`),
    '',
    'DECK LIST:',
    ...entries.map(e => `${e.quantity}x ${e.card.name}`),
    '',
    candidates.length ? 'CANDIDATES for upgrades:' : 'CANDIDATES: none available — do not suggest specific cards.',
    ...candidates.map(c => `${c.name} | ${c.type_line ?? ''} | mv ${c.cmc ?? 0}`),
  ].filter(v => v !== null).join('\n');

  const { raw, usage, model } = await callLLM({ prompt, systemContent: SYSTEM_PROMPT });
  const parsed = JSON.parse(stripFences(raw));

  const asStrings = (value) => Array.isArray(value)
    ? value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim())
    : [];

  const seen = new Set();
  const suggestions = [];
  for (const s of parsed.suggestions ?? []) {
    if (!s || typeof s.name !== 'string') continue;
    const card = candidateByName.get(s.name);
    if (!card || seen.has(s.name)) continue;
    seen.add(s.name);
    suggestions.push({
      _id: card._id,
      name: card.name,
      reason: typeof s.reason === 'string' ? s.reason.trim() : '',
      image_uris: card.image_uris,
      prices: card.prices,
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return {
    stats,
    observations,
    verdict: typeof parsed.verdict === 'string' ? parsed.verdict.trim() : '',
    strengths: asStrings(parsed.strengths),
    weaknesses: asStrings(parsed.weaknesses),
    suggestions,
    model,
    usage,
  };
}
