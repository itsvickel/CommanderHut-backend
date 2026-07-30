import { callLLM } from './llmClient.js';
import { rankBySynergy } from './synergyScore.js';

/**
 * Grounded synergy selection: instead of asking the LLM to invent more card
 * names (the main hallucination source), we hand it a list of real,
 * already-validated candidates from our DB and ask it to *choose*. Any name
 * outside the candidate list is discarded, so invalid cards are structurally
 * impossible here.
 */

const CANDIDATE_LIMIT = 80;

function stripFences(str) {
  return str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function formatCandidate(card) {
  const oracle = (card.oracle_text ?? '').replace(/\s+/g, ' ').slice(0, 110);
  return `${card.name} | ${card.type_line ?? ''} | mv ${card.cmc ?? 0} | ${oracle}`;
}

const SYSTEM_PROMPT = [
  'You are completing a Magic: The Gathering Commander deck.',
  'You will receive the commander, the deck strategy, and a CANDIDATES list of real cards.',
  'Choose the cards that best support the strategy — prioritize synergy with the commander and with each other over raw power.',
  'Rules:',
  '- Only pick names EXACTLY as they appear in the CANDIDATES list. Never use any other card.',
  '- Pick exactly the requested number of cards, all different.',
  'Output ONLY valid JSON, no markdown, in this shape:',
  '{ "picks": [ { "name": "candidate card name", "role": "what it does for the deck" } ] }',
].join('\n');

export async function groundedSynergyPick({
  commander, colorIdentity, themes, strategy,
  budgetRemaining, excludeIds, cardRepo, slots,
}) {
  if (slots <= 0) return null;

  const pool = await cardRepo.findSynergyCandidates({
    colorIdentity,
    excludeIds,
    maxPrice: budgetRemaining === Infinity ? null : Math.max(budgetRemaining, 0),
    limit: 300,
  });
  if (pool.length < slots) return null; // thin pool — deterministic fill handles it

  const candidates = rankBySynergy(pool, { themes, strategy }).slice(0, CANDIDATE_LIMIT);
  const byName = new Map(candidates.map(c => [c.name, c]));

  const prompt = [
    `Commander: ${commander.name}`,
    `Color identity: ${colorIdentity.join('') || 'colorless'}`,
    `Strategy: ${strategy}`,
    themes?.length ? `Themes: ${themes.join(', ')}` : null,
    `Pick exactly ${slots} cards.`,
    '',
    'CANDIDATES:',
    ...candidates.map(formatCandidate),
  ].filter(v => v !== null).join('\n');

  const { raw, usage } = await callLLM({ prompt, systemContent: SYSTEM_PROMPT });

  const parsed = JSON.parse(stripFences(raw));
  const seen = new Set();
  const picks = [];
  for (const p of parsed.picks ?? []) {
    if (!p || typeof p.name !== 'string') continue;
    const card = byName.get(p.name);
    if (!card || seen.has(p.name)) continue;
    seen.add(p.name);
    picks.push({ ...card, role: typeof p.role === 'string' && p.role.trim() ? p.role.trim() : 'synergy' });
    if (picks.length >= slots) break;
  }

  if (!picks.length) return null;
  return { picks, usage };
}
