/**
 * Commander bracket rules (official Brackets system):
 *   Brackets 1-2: no Game Changers, no mass land denial, no extra-turn cards.
 *   Bracket 3:    up to 3 Game Changers, no mass land denial.
 *   Brackets 4-5: no restrictions.
 *
 * Game Changers are detected via the `game_changer` flag synced from
 * Scryfall, with the bundled data/gameChangers.json list as fallback for
 * docs that predate the field.
 */

const EXTRA_TURN_RE = /\bextra turn\b/i;
const MASS_LAND_DENIAL_RE =
  /destroy all lands|sacrifices? (all|that many) lands|return all lands|exile all lands|lands don't untap/i;

export function isGameChanger(card, gameChangers = []) {
  return card.game_changer === true || gameChangers.includes(card.name);
}

export function gameChangerAllowance(bracket) {
  if (bracket >= 4) return Infinity;
  if (bracket === 3) return 3;
  return 0;
}

export function violatesBracketRestrictions(card, bracket) {
  if (bracket >= 4) return false;
  const text = card.oracle_text ?? '';
  if (MASS_LAND_DENIAL_RE.test(text)) return true;
  if (bracket <= 2 && EXTRA_TURN_RE.test(text)) return true;
  return false;
}

/**
 * Filters a card list for a bracket. `gcBudget` is a shared mutable
 * { remaining } counter so callers can enforce the deck-wide Game Changer
 * allowance across multiple calls; without it each call gets the bracket's
 * full allowance.
 */
export function filterByBracket(cards, bracket, gameChangers = [], gcBudget) {
  if (bracket >= 4) return cards;
  const budget = gcBudget ?? { remaining: gameChangerAllowance(bracket) };
  return cards.filter(card => {
    if (violatesBracketRestrictions(card, bracket)) return false;
    if (isGameChanger(card, gameChangers)) {
      if (budget.remaining < 1) return false;
      budget.remaining -= 1;
    }
    return true;
  });
}
