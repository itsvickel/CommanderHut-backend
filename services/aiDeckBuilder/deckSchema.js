const VALID_BUDGET_TIERS = new Set(['budget', 'medium', 'high']);

function strip(str) {
  return str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

export function validateLlmResponse(input) {
  const cleaned = typeof input === 'string' ? strip(input) : input;
  const obj = typeof cleaned === 'string' ? JSON.parse(cleaned) : cleaned;

  if (!obj?.commander) throw new Error('missing commander');
  if (typeof obj.commander.name !== 'string' || !obj.commander.name.trim()) {
    throw new Error('commander.name must be a non-empty string');
  }
  if (!Array.isArray(obj.signature_cards)) throw new Error('signature_cards must be an array');
  if (typeof obj.strategy !== 'string' || !obj.strategy.trim()) throw new Error('strategy must be a non-empty string');
  if (obj.budget_tier != null && !VALID_BUDGET_TIERS.has(obj.budget_tier)) {
    throw new Error(`budget_tier must be one of: ${[...VALID_BUDGET_TIERS].join(', ')}`);
  }

  const signature_cards = obj.signature_cards
    .filter(s => s && typeof s.name === 'string' && s.name.trim())
    .map(s => ({ name: s.name.trim(), role: typeof s.role === 'string' ? s.role.trim() : '' }));

  return {
    commander: {
      name: obj.commander.name.trim(),
      reason: typeof obj.commander.reason === 'string' ? obj.commander.reason.trim() : '',
    },
    signature_cards,
    strategy: obj.strategy.trim(),
    themes: Array.isArray(obj.themes) ? obj.themes.filter(t => typeof t === 'string') : [],
    power_bracket: Number.isInteger(obj.power_bracket) ? obj.power_bracket : null,
    budget_tier: obj.budget_tier ?? null,
  };
}

export const OUTPUT_FORMAT_V2 = [
  'Output ONLY valid JSON — no markdown, no bold (**), no explanation, no code fences.',
  'Required JSON structure:',
  '{',
  '  "commander": {',
  '    "name": "exact real Magic: The Gathering card name",',
  '    "reason": "why this commander fits the requested theme"',
  '  },',
  '  "signature_cards": [',
  '    { "name": "exact card name", "role": "the role this card plays in the deck" },',
  '    ... (aim for 30 cards)',
  '  ],',
  '  "strategy": "2-3 sentence deck strategy description",',
  '  "themes": ["theme1", "theme2"],',
  '  "power_bracket": <integer 1-5>,',
  '  "budget_tier": "budget" or "medium" or "high"',
  '}',
  'Rules:',
  '- commander must be a real legendary creature or planeswalker legal in Commander format.',
  '- Do not invent card names. Use exact names from official Magic: The Gathering sets.',
  '- Every signature card must fit within the commander\'s color identity.',
  '- Every card must be legal in Commander format.',
].join('\n');
