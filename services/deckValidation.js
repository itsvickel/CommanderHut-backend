/**
 * Commander legality checks for manually created/edited decks.
 * `entries` is [{ card: <Card doc>, quantity }] — docs, not ids, so the
 * checks can read type_line / oracle_text / color_identity.
 */

// "Basic Snow Land — Forest" must match too, so allow words between the two.
const BASIC_LAND_RE = /Basic(\s+\w+)*\s+Land/;
// Covers "any number of cards named X" and bounded forms like Nazgûl's
// "up to nine cards named" / Seven Dwarves' "up to seven cards named".
const MULTI_COPY_RE = /(any number of|up to \w+) cards named/i;

export function validateCommanderDeck({ entries, commanderDoc = null }) {
  const errors = [];
  const singletonViolations = [];
  const identityViolations = [];
  let total = 0;

  for (const { card, quantity } of entries) {
    total += quantity;
    if (quantity > 1) {
      const isBasic = BASIC_LAND_RE.test(card.type_line ?? '');
      const allowsMultipleCopies = MULTI_COPY_RE.test(card.oracle_text ?? '');
      if (!isBasic && !allowsMultipleCopies) singletonViolations.push(card.name);
    }
  }

  if (total > 100) {
    errors.push(`Commander decks are limited to 100 cards (deck has ${total})`);
  }
  if (singletonViolations.length) {
    errors.push(`Only one copy allowed of: ${singletonViolations.join(', ')}`);
  }

  const commanderIdentity = commanderDoc?.color_identity ?? null;
  if (commanderIdentity) {
    const identity = new Set(commanderIdentity);
    for (const { card } of entries) {
      const cardIdentity = card.color_identity ?? card.colors ?? [];
      if (!cardIdentity.every(c => identity.has(c))) identityViolations.push(card.name);
    }
    if (identityViolations.length) {
      errors.push(
        `Outside ${commanderDoc.name}'s color identity: ${identityViolations.join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    total,
    singletonViolations,
    identityViolations,
  };
}
