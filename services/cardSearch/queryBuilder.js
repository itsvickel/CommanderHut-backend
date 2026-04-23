const LEGAL_FORMATS = new Set([
  'standard', 'pioneer', 'modern', 'legacy', 'vintage',
  'commander', 'pauper', 'brawl', 'historicbrawl', 'alchemy',
  'explorer', 'timeless', 'penny', 'oathbreaker',
]);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseQ(q) {
  if (!q || !q.trim()) return {};

  const result = {};
  const KEYWORD_RE = /\b(name|text|type):"([^"]*)"/g;
  let remaining = q;
  let match;

  while ((match = KEYWORD_RE.exec(q)) !== null) {
    const [full, keyword, value] = match;
    if (keyword === 'text') result.text = value;
    else if (keyword === 'type') result.type = value;
    else if (keyword === 'name') result.name = value;
    remaining = remaining.replace(full, '').trim();
  }

  const bare = remaining.trim();
  if (bare && !result.name) result.name = bare;

  return result;
}

export function buildFilter({ name, text, type, colors, color_identity, cmc_min, cmc_max, price_max, legal } = {}) {
  const clauses = [];

  if (name != null) {
    clauses.push({ name: { $regex: escapeRegex(name), $options: 'i' } });
  }
  if (text != null) {
    clauses.push({ oracle_text: { $regex: escapeRegex(text), $options: 'i' } });
  }
  if (type != null) {
    clauses.push({ type_line: { $regex: escapeRegex(type), $options: 'i' } });
  }
  if (colors?.length) {
    clauses.push({ colors: { $all: colors } });
  }
  // color_identity filter: cards must only contain colors from the allowed set
  // (queries `colors` field — Card schema does not have a separate color_identity field)
  if (color_identity?.length) {
    clauses.push({ colors: { $not: { $elemMatch: { $nin: color_identity } } } });
  }
  if (cmc_min != null || cmc_max != null) {
    const cmcClause = {};
    if (cmc_min != null) cmcClause.$gte = cmc_min;
    if (cmc_max != null) cmcClause.$lte = cmc_max;
    clauses.push({ cmc: cmcClause });
  }
  if (price_max != null) {
    // cards with no price data are included — they may simply not have a market price listed
    clauses.push({ $or: [{ 'prices.usd': { $lte: price_max } }, { 'prices.usd': null }] });
  }
  if (legal != null && LEGAL_FORMATS.has(legal)) {
    clauses.push({ [`legalities.${legal}`]: 'legal' });
  }

  return clauses.length ? { $and: clauses } : {};
}
