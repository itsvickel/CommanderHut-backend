const VALID_COLORS = new Set(['W', 'U', 'B', 'R', 'G']);
const VALID_ROLES = new Set(['win_con', 'ramp', 'draw', 'removal', 'interaction', 'synergy', 'utility']);

export function parseGeminiResponse(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (!obj || typeof obj !== 'object') throw new Error('response is not an object');

  if (typeof obj.commander !== 'string' || !obj.commander.trim()) {
    throw new Error('missing or empty commander');
  }
  if (!Array.isArray(obj.color_identity) || obj.color_identity.some(c => !VALID_COLORS.has(c))) {
    throw new Error('invalid color_identity');
  }
  if (typeof obj.strategy !== 'string') {
    throw new Error('missing strategy');
  }
  if (!Array.isArray(obj.signature_cards)) {
    throw new Error('missing signature_cards');
  }

  const signature_cards = obj.signature_cards.filter(
    s => s && typeof s.name === 'string' && VALID_ROLES.has(s.role)
  );

  return {
    commander: obj.commander.trim(),
    color_identity: obj.color_identity,
    strategy: obj.strategy.trim(),
    signature_cards,
  };
}
