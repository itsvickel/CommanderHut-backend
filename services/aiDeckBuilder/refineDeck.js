import { callLLM } from './llmClient.js';
import { isWithinIdentity } from './colorIdentity.js';
import { filterByBracket, gameChangerAllowance, isGameChanger } from './bracketFilter.js';
import { rankBySynergy } from './synergyScore.js';

/**
 * Deck refinement: takes the current deck plus a user instruction
 * ("more removal", "swap Rhystic Study", "make it budget") and returns a
 * validated add/cut diff.
 *
 * Adds are chosen from a real candidate list out of our DB (same grounding
 * trick as groundedPick), so a refinement can never introduce a card that
 * doesn't exist, breaks color identity, or violates the bracket. Cuts are
 * matched against the deck's own card names.
 */

const CANDIDATE_LIMIT = 80;
const MAX_CHANGES = 15;

function stripFences(str) {
  return str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

const SYSTEM_PROMPT = [
  'You are refining an existing Magic: The Gathering Commander deck.',
  'You receive the commander, the current deck list, a CANDIDATES list of real cards you may add, and the user request.',
  'Propose a balanced swap: cut the weakest cards for the request and add the ones that serve it best.',
  'Rules:',
  '- Cards to ADD must come EXACTLY from the CANDIDATES list. Never add anything else.',
  '- Cards to CUT must be names currently in the deck. Never cut the commander or basic lands.',
  '- Keep adds and cuts the same length so the deck stays at 100 cards.',
  `- Propose at most ${MAX_CHANGES} swaps. Fewer, higher-impact changes are better.`,
  'Output ONLY valid JSON, no markdown:',
  '{ "adds": [ { "name": "candidate name", "role": "why it is added" } ],',
  '  "cuts": [ { "name": "deck card name", "reason": "why it is cut" } ],',
  '  "summary": "one or two sentences on what changed and why" }',
].join('\n');

const BASIC_LAND_RE = /Basic\s+Land/;

function formatCandidate(card) {
  const oracle = (card.oracle_text ?? '').replace(/\s+/g, ' ').slice(0, 110);
  return `${card.name} | ${card.type_line ?? ''} | mv ${card.cmc ?? 0} | ${oracle}`;
}

export async function refineDeck({
  commander, colorIdentity, deckCards, instruction, themes = [], strategy = '',
  power_bracket = 2, budget_usd = null, cardRepo, gameChangers = [], emit = () => {},
}) {
  emit('progress', { stage: 'analysing', message: 'Reading your deck...' });

  const deckByName = new Map(deckCards.map(e => [e.card.name, e]));
  const cuttable = deckCards.filter(
    e => !BASIC_LAND_RE.test(e.card.type_line ?? '') && e.card.name !== commander.name
  );

  emit('progress', { stage: 'candidates', message: 'Finding candidate upgrades...' });

  const pool = await cardRepo.findSynergyCandidates({
    colorIdentity,
    excludeIds: deckCards.map(e => e.card._id),
    maxPrice: budget_usd == null ? null : budget_usd,
    limit: 300,
  });
  const candidates = rankBySynergy(pool, { themes, strategy: `${strategy} ${instruction}` })
    .slice(0, CANDIDATE_LIMIT);

  if (!candidates.length) {
    const err = new Error('No candidate cards available for this refinement');
    err.code = 'NO_CANDIDATES';
    throw err;
  }
  const candidateByName = new Map(candidates.map(c => [c.name, c]));

  const prompt = [
    `Commander: ${commander.name}`,
    `Color identity: ${colorIdentity.join('') || 'colorless'}`,
    `Power bracket: ${power_bracket}`,
    strategy ? `Strategy: ${strategy}` : null,
    '',
    'CURRENT DECK:',
    ...deckCards.map(e => `${e.quantity}x ${e.card.name}${e.role ? ` (${e.role})` : ''}`),
    '',
    'CANDIDATES you may add:',
    ...candidates.map(formatCandidate),
    '',
    `USER REQUEST: ${instruction}`,
  ].filter(v => v !== null).join('\n');

  emit('progress', { stage: 'refining', message: 'Choosing changes...' });

  const { raw, usage, model } = await callLLM({ prompt, systemContent: SYSTEM_PROMPT });
  const parsed = JSON.parse(stripFences(raw));

  emit('progress', { stage: 'validating', message: 'Validating changes...' });

  // Adds: must be real candidates, within identity, bracket-legal.
  const gcBudget = { remaining: gameChangerAllowance(power_bracket) };
  for (const e of deckCards) {
    if (isGameChanger(e.card, gameChangers)) gcBudget.remaining -= 1;
  }

  const seenAdds = new Set();
  const adds = [];
  for (const a of parsed.adds ?? []) {
    if (!a || typeof a.name !== 'string') continue;
    const card = candidateByName.get(a.name);
    if (!card || seenAdds.has(a.name) || deckByName.has(a.name)) continue;
    if (!isWithinIdentity(card, colorIdentity)) continue;
    if (!filterByBracket([card], power_bracket, gameChangers, gcBudget).length) continue;
    seenAdds.add(a.name);
    adds.push({
      _id: card._id,
      name: card.name,
      role: typeof a.role === 'string' && a.role.trim() ? a.role.trim() : 'synergy',
      image_uris: card.image_uris,
      prices: card.prices,
      type_line: card.type_line,
    });
    if (adds.length >= MAX_CHANGES) break;
  }

  // Cuts: must be in the deck, never the commander or a basic land.
  const cuttableNames = new Set(cuttable.map(e => e.card.name));
  const seenCuts = new Set();
  const cuts = [];
  for (const c of parsed.cuts ?? []) {
    if (!c || typeof c.name !== 'string') continue;
    if (!cuttableNames.has(c.name) || seenCuts.has(c.name)) continue;
    seenCuts.add(c.name);
    const entry = deckByName.get(c.name);
    cuts.push({
      _id: entry.card._id,
      name: c.name,
      reason: typeof c.reason === 'string' ? c.reason.trim() : '',
      image_uris: entry.card.image_uris,
    });
    if (cuts.length >= MAX_CHANGES) break;
  }

  // Keep the deck at 100 cards: pair adds and cuts 1:1.
  const paired = Math.min(adds.length, cuts.length);
  if (paired === 0) {
    const err = new Error('Could not find a valid change for that request — try rephrasing');
    err.code = 'NO_VALID_CHANGES';
    throw err;
  }

  return {
    adds: adds.slice(0, paired),
    cuts: cuts.slice(0, paired),
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    model,
    usage,
  };
}
