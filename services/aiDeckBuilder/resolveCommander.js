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

export async function resolveCommander(name, cardRepo) {
  const exact = await cardRepo.findByExactName(name);
  if (exact) return exact;

  const first = name.split(/[ ,]/)[0];
  const candidates = await cardRepo.findLegendaryCreatures({ commanderNameContains: first });
  if (!candidates.length) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.name.toLowerCase());
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return bestDistance <= MAX_FUZZY_DISTANCE ? best : null;
}
