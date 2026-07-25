import { isGameChanger } from './bracketFilter.js';
import { countColorPips } from './manaBase.js';

/**
 * Deterministic deck statistics. Computed server-side so the LLM critique
 * is grounded in real numbers instead of guessing at the deck's shape.
 */

const LAND_RE = /\bLand\b/;
const CREATURE_RE = /\bCreature\b/;
const ARTIFACT_RE = /\bArtifact\b/;
const ENCHANTMENT_RE = /\bEnchantment\b/;
const INSTANT_RE = /\bInstant\b/;
const SORCERY_RE = /\bSorcery\b/;
const PLANESWALKER_RE = /\bPlaneswalker\b/;
const BATTLE_RE = /\bBattle\b/;

const ROLE_PATTERNS = {
  ramp: /add \{|search your library for a(?:n)? (?:basic )?land|lands? onto the battlefield/i,
  draw: /draw (?:a|two|three|four|five|\d+) cards?/i,
  removal: /destroy target|exile target|destroy all|deals? \d+ damage to target/i,
  counterspell: /counter target/i,
  tutor: /search your library for a (?:card|creature|artifact|enchantment|instant|sorcery)/i,
  board_wipe: /destroy all creatures|each creature gets -|exile all creatures/i,
  recursion: /return target .* from (?:your|a) graveyard|return it to the battlefield/i,
};

function typeOf(card) {
  const t = card.type_line ?? '';
  if (LAND_RE.test(t)) return 'land';
  if (CREATURE_RE.test(t)) return 'creature';
  if (PLANESWALKER_RE.test(t)) return 'planeswalker';
  if (INSTANT_RE.test(t)) return 'instant';
  if (SORCERY_RE.test(t)) return 'sorcery';
  if (ARTIFACT_RE.test(t)) return 'artifact';
  if (ENCHANTMENT_RE.test(t)) return 'enchantment';
  if (BATTLE_RE.test(t)) return 'battle';
  return 'other';
}

/**
 * @param entries [{ card, quantity }] — the full 100, commander included
 * @param commanderDoc the commander's Card doc (for identity checks)
 */
export function computeDeckStats({ entries, commanderDoc = null, gameChangers = [] }) {
  const typeCounts = {};
  const curve = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
  const roleCounts = Object.fromEntries(Object.keys(ROLE_PATTERNS).map(r => [r, 0]));

  let total = 0;
  let lands = 0;
  let nonLandCount = 0;
  let cmcSum = 0;
  let totalPriceUsd = 0;
  const gameChangersFound = [];
  const offIdentity = [];

  const identity = commanderDoc
    ? new Set(commanderDoc.color_identity ?? commanderDoc.colors ?? [])
    : null;

  for (const { card, quantity } of entries) {
    total += quantity;
    const type = typeOf(card);
    typeCounts[type] = (typeCounts[type] ?? 0) + quantity;
    totalPriceUsd += (card.prices?.usd ?? 0) * quantity;

    if (type === 'land') {
      lands += quantity;
    } else {
      nonLandCount += quantity;
      const cmc = card.cmc ?? 0;
      cmcSum += cmc * quantity;
      // Round so half-mana costs land in a real bucket instead of creating one.
      const bucket = cmc <= 1 ? '0-1' : cmc >= 6 ? '6+' : String(Math.round(cmc));
      curve[bucket] += quantity;
    }

    const text = card.oracle_text ?? '';
    for (const [role, re] of Object.entries(ROLE_PATTERNS)) {
      if (re.test(text)) roleCounts[role] += quantity;
    }

    if (isGameChanger(card, gameChangers)) gameChangersFound.push(card.name);

    if (identity) {
      const cardIdentity = card.color_identity ?? card.colors ?? [];
      if (!cardIdentity.every(c => identity.has(c))) offIdentity.push(card.name);
    }
  }

  const pips = countColorPips(entries.filter(e => typeOf(e.card) !== 'land').map(e => e.card));

  return {
    total_cards: total,
    lands,
    nonland_cards: nonLandCount,
    average_mana_value: nonLandCount ? Math.round((cmcSum / nonLandCount) * 100) / 100 : 0,
    curve,
    type_counts: typeCounts,
    role_counts: roleCounts,
    color_pips: pips,
    game_changers: gameChangersFound,
    off_identity: offIdentity,
    estimated_bracket: estimateBracket(gameChangersFound.length, roleCounts),
    total_price_usd: Math.round(totalPriceUsd * 100) / 100,
  };
}

/** Bracket estimate from Game Changer count and tutor density. */
export function estimateBracket(gameChangerCount, roleCounts) {
  if (gameChangerCount > 3) return gameChangerCount >= 8 ? 5 : 4;
  if (gameChangerCount > 0) return 3;
  if ((roleCounts.tutor ?? 0) >= 4) return 3;
  return 2;
}

/**
 * Rule-based observations to anchor the critique. These are stated as
 * facts about the list; the LLM turns them into advice.
 */
export function deriveObservations(stats) {
  const notes = [];

  if (stats.total_cards !== 100) {
    notes.push(`Deck has ${stats.total_cards} cards; Commander requires exactly 100.`);
  }
  if (stats.lands < 33) notes.push(`Only ${stats.lands} lands — most Commander decks run 34-38.`);
  if (stats.lands > 40) notes.push(`${stats.lands} lands is high for this curve.`);
  if (stats.average_mana_value > 3.6) {
    notes.push(`Average mana value ${stats.average_mana_value} is high — the deck may be slow.`);
  }
  if ((stats.role_counts.ramp ?? 0) < 8) {
    notes.push(`Only ${stats.role_counts.ramp ?? 0} ramp pieces — 8-12 is typical.`);
  }
  if ((stats.role_counts.draw ?? 0) < 8) {
    notes.push(`Only ${stats.role_counts.draw ?? 0} card-draw effects — 8-12 is typical.`);
  }
  if ((stats.role_counts.removal ?? 0) < 6) {
    notes.push(`Only ${stats.role_counts.removal ?? 0} removal spells — 8-10 is typical.`);
  }
  if ((stats.role_counts.board_wipe ?? 0) === 0) {
    notes.push('No board wipes — consider 1-3 for stabilising.');
  }
  if (stats.off_identity.length) {
    notes.push(`Illegal cards outside the commander's color identity: ${stats.off_identity.join(', ')}.`);
  }
  return notes;
}
