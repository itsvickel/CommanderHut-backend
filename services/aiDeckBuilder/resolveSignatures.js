import { isWithinIdentity } from './colorIdentity.js';

export async function resolveSignatures(signatureInputs, colorIdentity, cardRepo) {
  const names = signatureInputs.map(s => s.name);
  const found = await cardRepo.findByNames(names);
  const byName = new Map(found.map(c => [c.name, c]));

  const resolved = [];
  const dropped = [];

  for (const sig of signatureInputs) {
    const card = byName.get(sig.name);
    if (!card) { dropped.push(sig.name); continue; }
    if (card.legalities?.commander !== 'legal') { dropped.push(sig.name); continue; }
    if (!isWithinIdentity(card, colorIdentity)) { dropped.push(sig.name); continue; }
    resolved.push({ ...card, role: sig.role });
  }

  return { resolved, dropped };
}
