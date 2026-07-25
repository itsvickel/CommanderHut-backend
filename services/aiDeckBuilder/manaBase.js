/**
 * Mana-base heuristics: land count driven by the deck's average mana value,
 * basic-land split driven by colored pip counts. Pure functions.
 */

const MANA_PIP_RE = /\{([^}]+)\}/g;
const COLOR_LETTERS = new Set(['W', 'U', 'B', 'R', 'G']);

export function countColorPips(cards) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const card of cards) {
    const cost = card.mana_cost ?? '';
    for (const match of cost.matchAll(MANA_PIP_RE)) {
      // hybrid symbols like {W/U} or {2/G} count one pip per color
      for (const part of match[1].split('/')) {
        if (COLOR_LETTERS.has(part)) pips[part] += 1;
      }
    }
  }
  return pips;
}

/** Land count from average mana value of the non-land cards: 34–38. */
export function computeLandTarget(nonLandCards) {
  if (!nonLandCards.length) return 36;
  const avg = nonLandCards.reduce((s, c) => s + (c.cmc ?? 0), 0) / nonLandCards.length;
  if (avg < 2.5) return 34;
  if (avg < 3.0) return 35;
  if (avg < 3.5) return 36;
  if (avg < 4.0) return 37;
  return 38;
}

/**
 * Splits `slots` basic lands across the identity colors proportionally to
 * pip counts (largest-remainder method). Every identity color gets at least
 * one basic when there is room, so splashes remain castable.
 */
export function splitBasics(colorIdentity, pips, slots) {
  if (!colorIdentity.length || slots <= 0) return {};

  const weights = colorIdentity.map(c => pips[c] ?? 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const exact = totalWeight === 0
    ? colorIdentity.map(() => slots / colorIdentity.length)
    : weights.map(w => (slots * w) / totalWeight);

  const counts = exact.map(Math.floor);
  let remaining = slots - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((e, i) => [e - counts[i], i])
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (remaining <= 0) break;
    counts[i] += 1;
    remaining -= 1;
  }

  // guarantee ≥1 basic per identity color when slots allow
  if (slots >= colorIdentity.length) {
    for (let i = 0; i < counts.length; i++) {
      while (counts[i] === 0) {
        const max = counts.indexOf(Math.max(...counts));
        if (counts[max] <= 1) break;
        counts[max] -= 1;
        counts[i] += 1;
      }
    }
  }

  return Object.fromEntries(colorIdentity.map((c, i) => [c, counts[i]]));
}
