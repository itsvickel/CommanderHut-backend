const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

export function computeColorIdentity(commander) {
  const colors = new Set(commander.colors || []);
  return WUBRG_ORDER.filter(c => colors.has(c));
}

export function isWithinIdentity(card, identity) {
  const id = new Set(identity);
  for (const c of card.colors || []) {
    if (!id.has(c)) return false;
  }
  return true;
}
