const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

// True color identity (mana symbols in cost AND rules text) when available —
// synced from Scryfall. `colors` is only a fallback for docs that predate the
// color_identity field; it misses off-color activation costs and hybrid mana.
function identityOf(card) {
  return card.color_identity ?? card.colors ?? [];
}

export function computeColorIdentity(commander) {
  const identity = new Set(identityOf(commander));
  return WUBRG_ORDER.filter(c => identity.has(c));
}

export function isWithinIdentity(card, identity) {
  const id = new Set(identity);
  for (const c of identityOf(card)) {
    if (!id.has(c)) return false;
  }
  return true;
}
