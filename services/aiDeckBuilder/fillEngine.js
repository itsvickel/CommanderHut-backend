import { isWithinIdentity } from './colorIdentity.js';
import { filterByBracket } from './bracketFilter.js';

const TARGET_LANDS = 35;
const ROLE_QUOTAS = { ramp: 10, draw: 10, removal: 10 };
const TOTAL_NON_COMMANDER_SLOTS = 99;
// The deck-wide Game Changer allowance is reserved for the LLM's signature
// picks (spent in the pipeline); deterministic fill never adds Game Changers.
const NO_GC_BUDGET = () => ({ remaining: 0 });
const BASIC_LAND_RE = /Basic\s+Land/;
const LAND_RE = /\bLand\b/;

function isLand(card) { return LAND_RE.test(card.type_line || ''); }
function isBasicLand(card) { return BASIC_LAND_RE.test(card.type_line || ''); }

function priceOf(card) { return card.prices?.usd ?? 0; }

export async function fillEngine({
  commander, signatures, colorIdentity, bracket,
  budgetRemaining, cardRepo, gameChangers, strategy,
}) {
  const picked = new Map(); // key: _id -> { card, quantity, role }
  const budget = { remaining: budgetRemaining };

  const add = (c, role) => {
    if (picked.has(c._id.toString())) return false;
    picked.set(c._id.toString(), { card: c, quantity: 1, role });
    budget.remaining -= priceOf(c);
    return true;
  };

  // 1. Seed with signatures
  for (const sig of signatures) {
    add(sig, sig.role);
  }

  const excludeIds = () => [...picked.keys()];

  // 2. Role quotas
  for (const [role, quota] of Object.entries(ROLE_QUOTAS)) {
    const already = [...picked.values()].filter(p => p.role === role).length;
    const need = Math.max(0, quota - already);
    if (need === 0) continue;

    const pool = await cardRepo.findByRole({
      role, colorIdentity, excludeIds: excludeIds(),
      maxPrice: Math.max(budget.remaining, 0),
      limit: need * 3,
    });
    const filtered = filterByBracket(pool, bracket, gameChangers, NO_GC_BUDGET());
    let added = 0;
    for (const c of filtered) {
      if (added >= need) break;
      if (!isWithinIdentity(c, colorIdentity)) continue;
      if (add(c, role)) added++;
    }
  }

  // 3. Non-basic lands up to ~half of TARGET_LANDS
  const nonBasicTarget = Math.floor(TARGET_LANDS / 2);
  const nbPool = await cardRepo.findNonBasicLands({
    colorIdentity, excludeIds: excludeIds(),
    maxPrice: Math.max(budget.remaining, 0),
    limit: nonBasicTarget * 3,
  });
  const nbFiltered = filterByBracket(nbPool, bracket, gameChangers, NO_GC_BUDGET());
  let nbAdded = 0;
  for (const l of nbFiltered) {
    if (nbAdded >= nonBasicTarget) break;
    if (add(l, 'land')) nbAdded++;
  }

  // 4. Synergy fill (remaining non-land slots before lands)
  const currentLands = [...picked.values()].filter(p => isLand(p.card)).length;
  const landSlotsLeft = TARGET_LANDS - currentLands;
  const nonLandSlotsLeft = TOTAL_NON_COMMANDER_SLOTS - picked.size - landSlotsLeft;
  if (nonLandSlotsLeft > 0) {
    const pool = await cardRepo.findByRole({
      role: 'synergy', colorIdentity, excludeIds: excludeIds(),
      maxPrice: Math.max(budget.remaining, 0),
      limit: nonLandSlotsLeft * 3,
    });
    const filtered = filterByBracket(pool, bracket, gameChangers, NO_GC_BUDGET());
    let added = 0;
    for (const c of filtered) {
      if (added >= nonLandSlotsLeft) break;
      if (isLand(c)) continue;
      if (!isWithinIdentity(c, colorIdentity)) continue;
      if (add(c, 'synergy')) added++;
    }
  }

  // 5. Basic-land fill to reach 99
  const slotsLeft = TOTAL_NON_COMMANDER_SLOTS - [...picked.values()].reduce((s, p) => s + p.quantity, 0);
  if (slotsLeft > 0) {
    const basicEntries = await resolveBasics(colorIdentity, cardRepo);
    if (!basicEntries.length) {
      throw new Error('no basic lands available for color identity');
    }
    const perColor = Math.floor(slotsLeft / basicEntries.length);
    const leftover = slotsLeft % basicEntries.length;
    basicEntries.forEach((entry, idx) => {
      const qty = perColor + (idx < leftover ? 1 : 0);
      if (qty > 0) {
        picked.set(entry._id.toString(), { card: entry, quantity: qty, role: 'land' });
      }
    });
  }

  return [...picked.values()];
}

async function resolveBasics(colorIdentity, cardRepo) {
  if (colorIdentity.length === 0) {
    const wastes = await cardRepo.findWastes();
    return wastes ? [wastes] : [];
  }
  const out = [];
  for (const c of colorIdentity) {
    const b = await cardRepo.findBasicLandByColor(c);
    if (b) out.push(b);
  }
  return out;
}
