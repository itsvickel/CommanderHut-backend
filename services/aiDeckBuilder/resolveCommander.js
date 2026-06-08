function isValidCommanderType(scryfallCard) {
  const typeLine = scryfallCard.type_line ?? '';
  if (typeLine.includes('Legendary') && typeLine.includes('Creature')) return true;
  if (typeLine.includes('Legendary') && typeLine.includes('Planeswalker')) {
    return (scryfallCard.oracle_text ?? '').includes('can be your commander');
  }
  return false;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const MAX_FUZZY_DISTANCE = 4;

/**
 * Validates a commander name on Scryfall, then resolves it in the local DB.
 * Returns { card, scryfallCard } on success, or { card: null, reason } on failure.
 */
export async function resolveCommander(name, cardRepo, scryfallService) {
  const scryfallCard = await scryfallService.lookupCard(name);

  if (!scryfallCard) {
    return { card: null, reason: `"${name}" was not found on Scryfall` };
  }
  if (!isValidCommanderType(scryfallCard)) {
    return { card: null, reason: `"${scryfallCard.name}" is not a legendary creature or commander-eligible planeswalker` };
  }
  if (scryfallCard.legalities?.commander !== 'legal') {
    return { card: null, reason: `"${scryfallCard.name}" is banned or not legal in Commander` };
  }

  const canonicalName = scryfallCard.name;
  const exact = await cardRepo.findByExactName(canonicalName);
  if (exact) return { card: exact, scryfallCard };

  const first = canonicalName.split(/[ ,]/)[0];
  const candidates = await cardRepo.findLegendaryCreatures({ commanderNameContains: first });
  let best = null, bestDistance = Infinity;
  for (const c of candidates) {
    const d = levenshtein(canonicalName.toLowerCase(), c.name.toLowerCase());
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  if (best && bestDistance <= MAX_FUZZY_DISTANCE) return { card: best, scryfallCard };

  return { card: null, reason: `"${canonicalName}" is valid on Scryfall but not found in the local card database` };
}
