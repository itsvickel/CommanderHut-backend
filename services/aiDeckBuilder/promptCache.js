import MasterPrompt from '../../models/MasterPrompt.js';
import { OUTPUT_FORMAT_V2 as OUTPUT_FORMAT } from './deckSchema.js';
export { OUTPUT_FORMAT };

const DEFAULTS = {
  role_description:
    'You are a Magic: The Gathering Commander deck-building assistant. Your only purpose is to build Commander decks. You have deep knowledge of MTG card interactions, synergies, mana curves, and competitive brackets.',
  domain_restrictions:
    'Only respond to Magic: The Gathering Commander deck-building requests. If the user asks about anything else — weather, sports, general knowledge, other games, or any non-MTG topic — respond with exactly: "I can only help with Magic: The Gathering Commander deck-building." Do not elaborate, apologize, or engage with the off-topic request.',
  additional_rules:
    'Card selection rules:\n- Use only exact, real Magic: The Gathering card names as they appear in official sets. Never invent, abbreviate, or paraphrase card names.\n- Every card must have a clear reason to be in the deck — synergy with the commander, the strategy, or another key piece.\n- Choose as many signature cards as the strategy requires. Prioritize quality and coherence over quantity.\n- Include a mix of roles appropriate to the strategy: ramp, card draw, removal, and win conditions. Do not over-index on any single role.\n- Respect the power bracket: do not include cards that exceed or fall far below the requested bracket level.',
};

const BRACKET_NOTES = {
  1: 'Exhibition/ultra-casual: no Game Changers, no mass land denial, no extra-turn cards, no fast mana, few tutors.',
  2: 'Core/precon-level: no Game Changers, no mass land denial, no extra-turn cards, limited tutors.',
  3: 'Upgraded: up to THREE Game Changers allowed; no mass land denial; extra turns only in moderation.',
  4: 'Optimized, non-cEDH. All Game Changers allowed.',
  5: 'Competitive EDH. Anything format-legal.',
};

let cache = { data: null, expiresAt: 0 };
let inflightFetch = null;

export function invalidatePromptCache() {
  cache = { data: null, expiresAt: 0 };
  inflightFetch = null;
}

async function fetchPrompt() {
  try {
    const doc = await MasterPrompt.findOne().lean();
    return doc ?? DEFAULTS;
  } catch (err) {
    console.warn('[promptCache] DB fetch failed, using defaults:', err.message);
    return null; // signals error — caller should NOT cache this
  }
}

async function getOrFetch() {
  if (Date.now() <= cache.expiresAt) return cache.data;
  if (!inflightFetch) {
    inflightFetch = fetchPrompt().then(data => {
      if (data !== null) {
        cache = { data, expiresAt: Date.now() + 60_000 };
      }
      inflightFetch = null;
      return data ?? DEFAULTS;
    }).catch(() => {
      inflightFetch = null;
      return DEFAULTS;
    });
  }
  return inflightFetch;
}

export async function buildSystemPrompt({ budget_usd, power_bracket }) {
  const { role_description, domain_restrictions, additional_rules } = await getOrFetch();
  const bracketNote = BRACKET_NOTES[power_bracket] ?? '';

  return [
    role_description,
    domain_restrictions,
    OUTPUT_FORMAT,
    additional_rules || null,
    `Power Bracket ${power_bracket}: ${bracketNote}`,
    budget_usd != null ? `Approximate total deck budget: $${budget_usd} USD. Prefer cheaper staples.` : null,
  ].filter(Boolean).join('\n\n');
}
