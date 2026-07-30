/**
 * Validates signature cards via Scryfall batch lookup, then resolves against local DB.
 * Returns { resolved: Card[], dropped: string[] }
 */
export async function resolveSignatures(signatureInputs, colorIdentity, cardRepo, scryfallService) {
  if (!signatureInputs.length) return { resolved: [], dropped: [] };

  const names = signatureInputs.map(s => s.name);
  const { found: scryfallCards, notFound: scryfallNotFound } = await scryfallService.lookupCardBatch(names);

  const roleByName = new Map(signatureInputs.map(s => [s.name, s.role]));
  const identitySet = new Set(colorIdentity);

  const dropped = [...scryfallNotFound];
  const validScryfallNames = [];

  for (const scryfallCard of scryfallCards) {
    if (scryfallCard.legalities?.commander !== 'legal') {
      dropped.push(scryfallCard.name);
      continue;
    }
    const withinIdentity = (scryfallCard.color_identity ?? []).every(c => identitySet.has(c));
    if (!withinIdentity) {
      dropped.push(scryfallCard.name);
      continue;
    }
    validScryfallNames.push(scryfallCard.name);
  }

  const dbCards = await cardRepo.findByNames(validScryfallNames);
  const dbByName = new Map(dbCards.map(c => [c.name, c]));

  const resolved = [];
  for (const name of validScryfallNames) {
    const dbCard = dbByName.get(name);
    if (!dbCard) { dropped.push(name); continue; }
    resolved.push({ ...dbCard, role: roleByName.get(name) ?? '' });
  }

  return { resolved, dropped };
}
