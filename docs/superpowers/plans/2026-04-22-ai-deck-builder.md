# AI Deck Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `POST /api/ai/deck/generate` and `POST /api/ai/deck/save` so authenticated users can turn a natural-language prompt into a format-legal, budget-aware, power-bracket-aware Commander decklist — preview first, save on request.

**Architecture:** Gemini 2.5 Flash (with native JSON `responseSchema`) picks commander + strategy + ~30 signature cards. A deterministic fill engine resolves those against the MongoDB card store and fills the remaining 99 slots under color identity, format legality, Bracket, and budget constraints. Preview cached in-process; save inflates it into a persisted `Deck`.

**Tech Stack:** Node.js 20, Express, Mongoose 8, `@google/genai`, Vitest (new), existing JWT `authMiddleware`, existing `express-rate-limit`.

**Spec:** `docs/superpowers/specs/2026-04-22-ai-deck-builder-design.md`

**Branch:** `ai-deck-builder` (already checked out; all commits go here).

---

## Task 1: Install Vitest and wire the test script

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `tests/smoke.test.js` (deleted in Task 2; exists only to verify setup)

- [ ] **Step 1: Install Vitest**

Run:
```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add `test` script to `package.json`**

Edit `package.json` `scripts`:
```json
"scripts": {
  "start": "node server.js",
  "db:cards:sync": "node scripts/populateCardsMongodb.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create a trivial smoke test to verify setup**

Create `tests/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Verify the test runs**

Run:
```bash
npm test
```
Expected: one passing test, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/smoke.test.js
git commit -m "chore: add vitest and test script"
```

---

## Task 2: Schema changes — Card prices, Deck provenance, AIUsage model

**Files:**
- Modify: `models/Card.js`
- Modify: `models/Deck.js`
- Create: `models/AIUsage.js`
- Create: `data/gameChangers.json`
- Delete: `tests/smoke.test.js` (no longer useful)

- [ ] **Step 1: Add `prices` to `models/Card.js`**

Replace the schema with:
```js
import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
  scryfallId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  mana_cost: String,
  type_line: String,
  oracle_text: String,
  colors: [String],
  set: String,
  set_name: String,
  collector_number: String,
  artist: String,
  released_at: Date,
  image_uris: mongoose.Schema.Types.Mixed,
  legalities: mongoose.Schema.Types.Mixed,
  layout: String,
  prices: {
    usd: { type: Number, default: null },
    usd_foil: { type: Number, default: null },
  },
}, { timestamps: true });

export default mongoose.model('Card', cardSchema);
```

- [ ] **Step 2: Add `source` and `ai_metadata` to `models/Deck.js`**

Insert these fields into the schema (alongside `tags` / `is_public`, before `cards`):
```js
source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
ai_metadata: {
  prompt: String,
  power_bracket: Number,
  budget_usd: Number,
  model: String,
  generated_at: Date,
},
```

- [ ] **Step 3: Create `models/AIUsage.js`**

```js
import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD" in UTC
  count: { type: Number, default: 0 },
}, { timestamps: true });

aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('AIUsage', aiUsageSchema);
```

- [ ] **Step 4: Create `data/gameChangers.json`**

Source: the official WotC Commander Bracket announcement. Card names must be spelled exactly as they appear in Scryfall (case-sensitive, full legendary names with commas, etc.). Seed with a representative subset — update the file when WotC revises the list.

```json
{
  "version": "2024-09-24",
  "source": "https://magic.wizards.com/en/news/announcements/commander-format-panel-update-september-2024",
  "cards": [
    "Ancient Tomb",
    "Chrome Mox",
    "Drannith Magistrate",
    "Gaea's Cradle",
    "Grim Monolith",
    "Jeweled Lotus",
    "Mana Crypt",
    "Mana Drain",
    "Mana Vault",
    "Mox Diamond",
    "Mox Opal",
    "Mystical Tutor",
    "Natural Order",
    "Orcish Bowmasters",
    "Smothering Tithe",
    "Thassa's Oracle",
    "The One Ring",
    "Trinisphere",
    "Urza, Lord High Artificer",
    "Vampiric Tutor",
    "Winota, Joiner of Forces"
  ]
}
```

- [ ] **Step 5: Delete the smoke test**

Run:
```bash
rm tests/smoke.test.js
```

- [ ] **Step 6: Commit**

```bash
git add models/Card.js models/Deck.js models/AIUsage.js data/gameChangers.json tests/smoke.test.js
git commit -m "feat: add Card.prices, Deck.source/ai_metadata, AIUsage model, gameChangers list"
```

---

## Task 3: Populate script maps prices

**Files:**
- Modify: `scripts/populateCardsMongodb.js`

- [ ] **Step 1: Add `prices` to `toCardDoc()`**

In `scripts/populateCardsMongodb.js`, replace the `toCardDoc` function with:
```js
function toCardDoc(card) {
  const parsePrice = v => (v == null ? null : parseFloat(v));
  return {
    scryfallId: card.id,
    name: card.name,
    mana_cost: card.mana_cost || null,
    type_line: card.type_line || null,
    oracle_text: card.oracle_text || null,
    colors: card.colors || [],
    set: card.set || null,
    set_name: card.set_name || null,
    collector_number: card.collector_number || '0',
    artist: card.artist || 'Unknown Artist',
    released_at: card.released_at || null,
    image_uris: card.image_uris || null,
    legalities: card.legalities || null,
    layout: card.layout || null,
    prices: {
      usd: parsePrice(card.prices?.usd),
      usd_foil: parsePrice(card.prices?.usd_foil),
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/populateCardsMongodb.js
git commit -m "feat: include prices.usd and prices.usd_foil in card sync"
```

**Note:** Backfilling prices on the existing 113,773 cards happens in Task 14 (manual). Do not run the sync here; the other pipeline functions don't depend on prices being populated yet (tests use fixtures).

---

## Task 4: `parseGeminiResponse` — validate the LLM JSON output

**Files:**
- Create: `services/aiDeckBuilder/parseResponse.js`
- Create: `tests/services/aiDeckBuilder/parseResponse.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/parseResponse.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { parseGeminiResponse } from '../../../services/aiDeckBuilder/parseResponse.js';

const valid = {
  commander: 'Krenko, Mob Boss',
  color_identity: ['R'],
  strategy: 'Swarm with goblin tokens',
  signature_cards: [
    { name: 'Goblin Chieftain', role: 'synergy' },
    { name: 'Sol Ring', role: 'ramp' },
  ],
};

describe('parseGeminiResponse', () => {
  it('accepts a well-formed object', () => {
    const out = parseGeminiResponse(valid);
    expect(out.commander).toBe('Krenko, Mob Boss');
    expect(out.signature_cards).toHaveLength(2);
  });

  it('accepts a JSON string and parses it', () => {
    const out = parseGeminiResponse(JSON.stringify(valid));
    expect(out.commander).toBe('Krenko, Mob Boss');
  });

  it('throws on missing commander', () => {
    const bad = { ...valid, commander: undefined };
    expect(() => parseGeminiResponse(bad)).toThrow(/commander/);
  });

  it('throws on bad color identity', () => {
    const bad = { ...valid, color_identity: ['X'] };
    expect(() => parseGeminiResponse(bad)).toThrow(/color_identity/);
  });

  it('drops signature entries with unknown roles', () => {
    const out = parseGeminiResponse({
      ...valid,
      signature_cards: [
        { name: 'A', role: 'ramp' },
        { name: 'B', role: 'nonsense' },
      ],
    });
    expect(out.signature_cards).toHaveLength(1);
    expect(out.signature_cards[0].name).toBe('A');
  });

  it('throws on unparseable string', () => {
    expect(() => parseGeminiResponse('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- parseResponse`
Expected: all 6 tests fail with "parseGeminiResponse is not a function" or "Cannot find module".

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/parseResponse.js`:
```js
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- parseResponse`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/parseResponse.js tests/services/aiDeckBuilder/parseResponse.test.js
git commit -m "feat(ai-deck): parseGeminiResponse validates and normalizes LLM output"
```

---

## Task 5: `computeColorIdentity` — derive identity from commander

**Files:**
- Create: `services/aiDeckBuilder/colorIdentity.js`
- Create: `tests/services/aiDeckBuilder/colorIdentity.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/colorIdentity.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { computeColorIdentity, isWithinIdentity } from '../../../services/aiDeckBuilder/colorIdentity.js';

describe('computeColorIdentity', () => {
  it('returns the commander colors for a mono-color commander', () => {
    expect(computeColorIdentity({ colors: ['R'] })).toEqual(['R']);
  });

  it('returns sorted WUBRG for multicolor', () => {
    expect(computeColorIdentity({ colors: ['G', 'U'] })).toEqual(['U', 'G']);
  });

  it('returns [] for a colorless commander', () => {
    expect(computeColorIdentity({ colors: [] })).toEqual([]);
  });
});

describe('isWithinIdentity', () => {
  it('allows cards with no colors (artifact) in any identity', () => {
    expect(isWithinIdentity({ colors: [] }, ['R'])).toBe(true);
  });

  it('allows a mono-color card in a matching identity', () => {
    expect(isWithinIdentity({ colors: ['R'] }, ['R', 'G'])).toBe(true);
  });

  it('rejects a card with a color outside identity', () => {
    expect(isWithinIdentity({ colors: ['W'] }, ['R', 'G'])).toBe(false);
  });

  it('rejects any color card in a colorless identity', () => {
    expect(isWithinIdentity({ colors: ['U'] }, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- colorIdentity`
Expected: all 7 tests fail.

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/colorIdentity.js`:
```js
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- colorIdentity`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/colorIdentity.js tests/services/aiDeckBuilder/colorIdentity.test.js
git commit -m "feat(ai-deck): computeColorIdentity + isWithinIdentity"
```

---

## Task 6: `filterByBracket` — drop Game Changers at low brackets

**Files:**
- Create: `services/aiDeckBuilder/bracketFilter.js`
- Create: `tests/services/aiDeckBuilder/bracketFilter.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/bracketFilter.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { filterByBracket, isGameChanger } from '../../../services/aiDeckBuilder/bracketFilter.js';

const gameChangers = ['Mana Crypt', 'Gaea\'s Cradle'];

const cards = [
  { name: 'Sol Ring' },
  { name: 'Mana Crypt' },
  { name: 'Forest' },
  { name: "Gaea's Cradle" },
];

describe('isGameChanger', () => {
  it('recognizes a game changer by exact name', () => {
    expect(isGameChanger({ name: 'Mana Crypt' }, gameChangers)).toBe(true);
  });
  it('does not flag non-game-changers', () => {
    expect(isGameChanger({ name: 'Sol Ring' }, gameChangers)).toBe(false);
  });
});

describe('filterByBracket', () => {
  it('removes game changers at bracket 1', () => {
    const out = filterByBracket(cards, 1, gameChangers);
    expect(out.map(c => c.name)).toEqual(['Sol Ring', 'Forest']);
  });
  it('removes game changers at bracket 3', () => {
    expect(filterByBracket(cards, 3, gameChangers)).toHaveLength(2);
  });
  it('allows game changers at bracket 4', () => {
    expect(filterByBracket(cards, 4, gameChangers)).toHaveLength(4);
  });
  it('allows game changers at bracket 5', () => {
    expect(filterByBracket(cards, 5, gameChangers)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- bracketFilter`
Expected: all 6 tests fail.

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/bracketFilter.js`:
```js
export function isGameChanger(card, gameChangers) {
  return gameChangers.includes(card.name);
}

export function filterByBracket(cards, bracket, gameChangers) {
  if (bracket >= 4) return cards;
  return cards.filter(c => !isGameChanger(c, gameChangers));
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- bracketFilter`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/bracketFilter.js tests/services/aiDeckBuilder/bracketFilter.test.js
git commit -m "feat(ai-deck): bracket filter excludes Game Changers below bracket 4"
```

---

## Task 7: `cardRepo` — Mongoose adapter (no unit test, integration-verified)

**Files:**
- Create: `services/aiDeckBuilder/cardRepo.js`

This file is a thin wrapper around Mongoose queries. It's not unit-tested in v1 (the spec's testing section excludes Mongoose queries). Smoke-tested end-to-end in Task 13. Keep it deliberately thin so no complex logic escapes into it.

- [ ] **Step 1: Create the repo**

```js
import Card from '../../models/Card.js';

const LAND_TYPE_RE = /\bLand\b/;
const BASIC_LAND_TYPE_RE = /Basic\s+Land/;

function commanderLegal() {
  return { 'legalities.commander': 'legal' };
}

function identityFilter(identity) {
  return { colors: { $not: { $elemMatch: { $nin: identity } } } };
}

function notInExcluded(excludeIds) {
  return excludeIds.length ? { _id: { $nin: excludeIds } } : {};
}

function priceUnder(maxPrice) {
  if (maxPrice == null || maxPrice === Infinity) return {};
  return { $or: [{ 'prices.usd': { $lte: maxPrice } }, { 'prices.usd': null }] };
}

export const cardRepo = {
  async findByExactName(name) {
    return Card.findOne({ name }).lean();
  },

  async findByNames(names) {
    if (!names.length) return [];
    return Card.find({ name: { $in: names } }).lean();
  },

  async findLegendaryCreatures({ commanderNameContains }) {
    return Card.find({
      type_line: { $regex: /Legendary Creature/ },
      ...commanderLegal(),
      ...(commanderNameContains
        ? { name: { $regex: commanderNameContains, $options: 'i' } }
        : {}),
    }).limit(50).lean();
  },

  async findByRole({ role, colorIdentity, excludeIds, maxPrice, limit = 50 }) {
    const roleFilter = roleQuery(role);
    return Card.find({
      ...commanderLegal(),
      ...identityFilter(colorIdentity),
      ...notInExcluded(excludeIds),
      ...priceUnder(maxPrice),
      ...roleFilter,
      type_line: { $not: LAND_TYPE_RE },
    }).sort({ 'prices.usd': 1 }).limit(limit).lean();
  },

  async findNonBasicLands({ colorIdentity, excludeIds, maxPrice, limit = 50 }) {
    return Card.find({
      ...commanderLegal(),
      ...identityFilter(colorIdentity),
      ...notInExcluded(excludeIds),
      ...priceUnder(maxPrice),
      type_line: { $regex: LAND_TYPE_RE, $not: BASIC_LAND_TYPE_RE },
    }).sort({ 'prices.usd': 1 }).limit(limit).lean();
  },

  async findBasicLandByColor(colorLetter) {
    const basicMap = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
    const name = basicMap[colorLetter];
    if (!name) return null;
    return Card.findOne({ name, type_line: { $regex: BASIC_LAND_TYPE_RE } }).lean();
  },

  async findWastes() {
    return Card.findOne({ name: 'Wastes' }).lean();
  },
};

function roleQuery(role) {
  switch (role) {
    case 'ramp':
      return { oracle_text: { $regex: /add \{|Search your library.*land/i } };
    case 'draw':
      return { oracle_text: { $regex: /draw (a|two|three|\d+) card/i } };
    case 'removal':
      return { oracle_text: { $regex: /destroy|exile target/i } };
    case 'interaction':
      return { oracle_text: { $regex: /counter target|prevent|return target/i } };
    case 'synergy':
    case 'win_con':
    case 'utility':
    default:
      return {};
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add services/aiDeckBuilder/cardRepo.js
git commit -m "feat(ai-deck): cardRepo Mongoose wrapper for identity/role/land queries"
```

---

## Task 8: `resolveCommanderName` — exact, then fuzzy

**Files:**
- Create: `services/aiDeckBuilder/resolveCommander.js`
- Create: `tests/services/aiDeckBuilder/resolveCommander.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/resolveCommander.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resolveCommander } from '../../../services/aiDeckBuilder/resolveCommander.js';

function stubRepo({ exact, legendaries }) {
  return {
    findByExactName: async (name) => (name === exact?.name ? exact : null),
    findLegendaryCreatures: async () => legendaries ?? [],
  };
}

const krenko = { _id: '1', name: 'Krenko, Mob Boss', colors: ['R'] };
const baral = { _id: '2', name: 'Baral, Chief of Compliance', colors: ['U'] };

describe('resolveCommander', () => {
  it('returns exact match when name matches', async () => {
    const repo = stubRepo({ exact: krenko, legendaries: [] });
    const out = await resolveCommander('Krenko, Mob Boss', repo);
    expect(out).toEqual(krenko);
  });

  it('falls back to fuzzy match when exact fails', async () => {
    const repo = stubRepo({ exact: null, legendaries: [krenko, baral] });
    const out = await resolveCommander('Krenko Mob Boss', repo);
    expect(out.name).toBe('Krenko, Mob Boss');
  });

  it('returns null when no fuzzy match is close enough', async () => {
    const repo = stubRepo({ exact: null, legendaries: [krenko] });
    const out = await resolveCommander('Completely Different Name', repo);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- resolveCommander`
Expected: 3 tests fail.

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/resolveCommander.js`:
```js
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- resolveCommander`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/resolveCommander.js tests/services/aiDeckBuilder/resolveCommander.test.js
git commit -m "feat(ai-deck): resolveCommander with exact + fuzzy Levenshtein fallback"
```

---

## Task 9: `resolveSignatures` — filter by legality + identity

**Files:**
- Create: `services/aiDeckBuilder/resolveSignatures.js`
- Create: `tests/services/aiDeckBuilder/resolveSignatures.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/resolveSignatures.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resolveSignatures } from '../../../services/aiDeckBuilder/resolveSignatures.js';

const SOL_RING = {
  _id: 'a', name: 'Sol Ring', colors: [],
  legalities: { commander: 'legal' },
};
const COUNTERSPELL = {
  _id: 'b', name: 'Counterspell', colors: ['U'],
  legalities: { commander: 'legal' },
};
const BALANCE = {
  _id: 'c', name: 'Balance', colors: ['W'],
  legalities: { commander: 'banned' },
};

function stubRepo(cardsByName) {
  return {
    findByNames: async (names) => names.map(n => cardsByName[n]).filter(Boolean),
  };
}

describe('resolveSignatures', () => {
  it('returns cards that match name, identity, and legality', async () => {
    const repo = stubRepo({ 'Sol Ring': SOL_RING, Counterspell: COUNTERSPELL });
    const input = [
      { name: 'Sol Ring', role: 'ramp' },
      { name: 'Counterspell', role: 'interaction' },
    ];
    const { resolved, dropped } = await resolveSignatures(input, ['U', 'R'], repo);
    expect(resolved.map(c => c.name).sort()).toEqual(['Counterspell', 'Sol Ring']);
    expect(dropped).toEqual([]);
  });

  it('drops cards outside color identity', async () => {
    const repo = stubRepo({ Counterspell: COUNTERSPELL });
    const input = [{ name: 'Counterspell', role: 'interaction' }];
    const { resolved, dropped } = await resolveSignatures(input, ['R'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Counterspell']);
  });

  it('drops banned cards', async () => {
    const repo = stubRepo({ Balance: BALANCE });
    const input = [{ name: 'Balance', role: 'removal' }];
    const { resolved, dropped } = await resolveSignatures(input, ['W'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Balance']);
  });

  it('drops unresolvable names', async () => {
    const repo = stubRepo({});
    const input = [{ name: 'Fake Card', role: 'synergy' }];
    const { resolved, dropped } = await resolveSignatures(input, ['R'], repo);
    expect(resolved).toEqual([]);
    expect(dropped).toEqual(['Fake Card']);
  });

  it('attaches the role from the input to the resolved card', async () => {
    const repo = stubRepo({ 'Sol Ring': SOL_RING });
    const { resolved } = await resolveSignatures(
      [{ name: 'Sol Ring', role: 'ramp' }], ['R'], repo);
    expect(resolved[0].role).toBe('ramp');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- resolveSignatures`
Expected: 5 tests fail.

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/resolveSignatures.js`:
```js
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- resolveSignatures`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/resolveSignatures.js tests/services/aiDeckBuilder/resolveSignatures.test.js
git commit -m "feat(ai-deck): resolveSignatures validates name+identity+legality"
```

---

## Task 10: `fillEngine` — produce the 99

**Files:**
- Create: `services/aiDeckBuilder/fillEngine.js`
- Create: `tests/services/aiDeckBuilder/fillEngine.test.js`

This is the biggest unit. Concerns: role quotas, land count, budget tracking, basic-land fallback.

- [ ] **Step 1: Write failing test**

Create `tests/services/aiDeckBuilder/fillEngine.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { fillEngine } from '../../../services/aiDeckBuilder/fillEngine.js';

const card = (name, extras = {}) => ({
  _id: name,
  name,
  colors: [],
  type_line: 'Artifact',
  legalities: { commander: 'legal' },
  prices: { usd: 1 },
  ...extras,
});

const basic = name => card(name, {
  type_line: `Basic Land — ${name}`,
  prices: { usd: 0.1 },
});

function makeRepo({ rampPool = [], drawPool = [], removalPool = [], nonBasicPool = [], basics = {} } = {}) {
  return {
    findByRole: async ({ role }) => {
      if (role === 'ramp') return rampPool;
      if (role === 'draw') return drawPool;
      if (role === 'removal') return removalPool;
      return [];
    },
    findNonBasicLands: async () => nonBasicPool,
    findBasicLandByColor: async (c) => basics[c] ?? null,
    findWastes: async () => basics.C ?? null,
  };
}

describe('fillEngine', () => {
  it('fills to exactly 99 non-commander slots', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      drawPool: Array.from({ length: 15 }, (_, i) => card(`Draw ${i}`)),
      removalPool: Array.from({ length: 15 }, (_, i) => card(`Removal ${i}`)),
      nonBasicPool: Array.from({ length: 20 }, (_, i) => card(`NbLand ${i}`, {
        type_line: 'Land',
      })),
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko, Mob Boss', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: 'Goblin swarm',
    });

    const total = out.reduce((s, e) => s + e.quantity, 0);
    expect(total).toBe(99);
  });

  it('hits role quotas (10 ramp, 10 draw, 10 removal) when pools allow', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      drawPool: Array.from({ length: 15 }, (_, i) => card(`Draw ${i}`)),
      removalPool: Array.from({ length: 15 }, (_, i) => card(`Removal ${i}`)),
      nonBasicPool: [],
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko, Mob Boss', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const nameCount = role => out.filter(e => e.role === role).length;
    expect(nameCount('ramp')).toBe(10);
    expect(nameCount('draw')).toBe(10);
    expect(nameCount('removal')).toBe(10);
  });

  it('falls back to basic lands when budget runs out', async () => {
    const repo = makeRepo({
      rampPool: [card('Costly Ramp', { prices: { usd: 100 } })],
      drawPool: [],
      removalPool: [],
      nonBasicPool: [],
      basics: { R: basic('Mountain') },
    });

    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'Krenko', colors: ['R'] },
      signatures: [],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 10,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const totalCards = out.reduce((s, e) => s + e.quantity, 0);
    expect(totalCards).toBe(99);
    const mountain = out.find(e => e.card.name === 'Mountain');
    expect(mountain).toBeTruthy();
    expect(mountain.quantity).toBeGreaterThan(5);
  });

  it('uses Wastes for a colorless commander', async () => {
    const repo = makeRepo({
      basics: { C: card('Wastes', { type_line: 'Basic Land — Wastes', prices: { usd: 0.1 } }) },
    });

    const out = await fillEngine({
      commander: { _id: 'KOZI', name: 'Kozilek', colors: [] },
      signatures: [],
      colorIdentity: [],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    expect(out.find(e => e.card.name === 'Wastes')).toBeTruthy();
  });

  it('counts signature cards toward role quotas', async () => {
    const repo = makeRepo({
      rampPool: Array.from({ length: 15 }, (_, i) => card(`Ramp ${i}`)),
      basics: { R: basic('Mountain') },
    });

    const sigRamp = { ...card('Signed Ramp'), role: 'ramp' };
    const out = await fillEngine({
      commander: { _id: 'CMD', name: 'X', colors: ['R'] },
      signatures: [sigRamp],
      colorIdentity: ['R'],
      bracket: 3,
      budgetRemaining: 500,
      cardRepo: repo,
      gameChangers: [],
      strategy: '',
    });

    const ramp = out.filter(e => e.role === 'ramp');
    expect(ramp.length).toBe(10); // 1 signature + 9 filled
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- fillEngine`
Expected: 5 tests fail.

- [ ] **Step 3: Implement**

Create `services/aiDeckBuilder/fillEngine.js`:
```js
import { isWithinIdentity } from './colorIdentity.js';
import { filterByBracket } from './bracketFilter.js';

const TARGET_LANDS = 35;
const ROLE_QUOTAS = { ramp: 10, draw: 10, removal: 10 };
const TOTAL_NON_COMMANDER_SLOTS = 99;
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
    const filtered = filterByBracket(pool, bracket, gameChangers);
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
  const nbFiltered = filterByBracket(nbPool, bracket, gameChangers);
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
    const filtered = filterByBracket(pool, bracket, gameChangers);
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
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- fillEngine`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/aiDeckBuilder/fillEngine.js tests/services/aiDeckBuilder/fillEngine.test.js
git commit -m "feat(ai-deck): deterministic fill engine with role quotas, lands, synergy, budget"
```

---

## Task 11: `geminiClient` + `previewCache`

**Files:**
- Create: `services/aiDeckBuilder/geminiClient.js`
- Create: `services/aiDeckBuilder/previewCache.js`
- Create: `tests/services/aiDeckBuilder/previewCache.test.js`

No unit test for `geminiClient` — that would require mocking the SDK; smoke-tested end-to-end. Tests focus on `previewCache` only.

- [ ] **Step 1: Write failing previewCache test**

Create `tests/services/aiDeckBuilder/previewCache.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createPreviewCache } from '../../../services/aiDeckBuilder/previewCache.js';

describe('previewCache', () => {
  let cache;
  beforeEach(() => { cache = createPreviewCache({ capacity: 3, ttlMs: 1000 }); });

  it('returns null for unknown id', () => {
    expect(cache.get('nope')).toBeNull();
  });

  it('stores and retrieves', () => {
    cache.set('a', { x: 1 });
    expect(cache.get('a')).toEqual({ x: 1 });
  });

  it('evicts oldest past capacity', () => {
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3); cache.set('d', 4);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe(4);
  });

  it('expires entries past TTL', async () => {
    const fast = createPreviewCache({ capacity: 3, ttlMs: 10 });
    fast.set('a', 1);
    await new Promise(r => setTimeout(r, 30));
    expect(fast.get('a')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- previewCache`
Expected: 4 tests fail.

- [ ] **Step 3: Implement `previewCache`**

Create `services/aiDeckBuilder/previewCache.js`:
```js
export function createPreviewCache({ capacity = 500, ttlMs = 60 * 60 * 1000 } = {}) {
  const map = new Map(); // key -> { value, expiresAt }

  function evictExpired() {
    const now = Date.now();
    for (const [k, { expiresAt }] of map) {
      if (expiresAt <= now) map.delete(k);
    }
  }

  return {
    get(key) {
      evictExpired();
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) { map.delete(key); return null; }
      // touch for LRU
      map.delete(key); map.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      evictExpired();
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (map.size > capacity) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
      }
    },
    delete(key) { map.delete(key); },
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- previewCache`
Expected: 4 tests pass.

- [ ] **Step 5: Implement `geminiClient`**

Create `services/aiDeckBuilder/geminiClient.js`:
```js
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

const responseSchema = {
  type: 'object',
  properties: {
    commander: { type: 'string' },
    color_identity: {
      type: 'array',
      items: { type: 'string', enum: ['W', 'U', 'B', 'R', 'G'] },
    },
    strategy: { type: 'string' },
    signature_cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['win_con', 'ramp', 'draw', 'removal', 'interaction', 'synergy', 'utility'] },
        },
        required: ['name', 'role'],
      },
    },
  },
  required: ['commander', 'color_identity', 'strategy', 'signature_cards'],
};

function systemPrompt({ budget_usd, power_bracket }) {
  const bracketNote = {
    1: 'Ultra-casual: no Game Changers, no fast mana, no tutors.',
    2: 'Precon-level core: limited tutors, no Game Changers.',
    3: 'Upgraded precons: up to 3 Game Changers permitted; avoid mass land destruction.',
    4: 'Optimized, non-cEDH. All Game Changers allowed.',
    5: 'Competitive EDH. Anything format-legal.',
  }[power_bracket] ?? '';

  return [
    'You are a Commander deck-building expert.',
    'Output strict JSON matching the schema. Do not invent card names — use real Magic: The Gathering cards.',
    `Power Bracket ${power_bracket}: ${bracketNote}`,
    budget_usd ? `Approximate total deck budget: $${budget_usd} USD. Prefer cheaper staples.` : '',
    'Produce: a commander, the commander color identity (WUBRG letters), a short strategy (≤ 400 chars), and 25-35 signature cards each tagged with a role.',
  ].filter(Boolean).join('\n');
}

export async function callGemini({ prompt, budget_usd, power_bracket, apiKey }) {
  const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [{ text: `${systemPrompt({ budget_usd, power_bracket })}\n\nUser request: ${prompt}` }],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  return { raw: response.text, model: MODEL };
}
```

- [ ] **Step 6: Commit**

```bash
git add services/aiDeckBuilder/geminiClient.js services/aiDeckBuilder/previewCache.js tests/services/aiDeckBuilder/previewCache.test.js
git commit -m "feat(ai-deck): geminiClient with responseSchema + previewCache LRU"
```

---

## Task 12: Pipeline orchestrator

**Files:**
- Create: `services/aiDeckBuilder/pipeline.js`

Composition only — every unit this calls is already tested. No new tests here; covered by smoke test in Task 14.

- [ ] **Step 1: Implement the orchestrator**

Create `services/aiDeckBuilder/pipeline.js`:
```js
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { callGemini } from './geminiClient.js';
import { parseGeminiResponse } from './parseResponse.js';
import { resolveCommander } from './resolveCommander.js';
import { resolveSignatures } from './resolveSignatures.js';
import { computeColorIdentity } from './colorIdentity.js';
import { filterByBracket } from './bracketFilter.js';
import { fillEngine } from './fillEngine.js';
import { cardRepo as defaultRepo } from './cardRepo.js';
import { createPreviewCache } from './previewCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameChangers = JSON.parse(
  readFileSync(path.join(__dirname, '../../data/gameChangers.json'), 'utf-8')
).cards;

const previewCache = createPreviewCache({ capacity: 500, ttlMs: 60 * 60 * 1000 });

export function getPreview(id) { return previewCache.get(id); }
export function deletePreview(id) { previewCache.delete(id); }

export async function generateDeck({ userId, prompt, budget_usd, power_bracket, cardRepo = defaultRepo }) {
  // 1. LLM call
  const { raw, model } = await callGemini({ prompt, budget_usd, power_bracket });
  const parsed = parseGeminiResponse(raw);

  // 2. Commander
  const commander = await resolveCommander(parsed.commander, cardRepo);
  if (!commander) {
    const err = new Error(`Commander "${parsed.commander}" could not be resolved`);
    err.code = 'COMMANDER_UNRESOLVED';
    throw err;
  }

  // 3. Color identity (from the real card, not the LLM)
  const colorIdentity = computeColorIdentity(commander);

  // 4. Signatures
  let { resolved: signatures, dropped } = await resolveSignatures(
    parsed.signature_cards, colorIdentity, cardRepo
  );

  // 5. Bracket filter
  signatures = filterByBracket(signatures, power_bracket, gameChangers);

  // 6. Single retry if too many dropped
  if (dropped.length > 5) {
    const retryPrompt = `${prompt}\n\nDo not use these cards (they are unavailable or illegal for the color identity): ${dropped.join(', ')}`;
    const { raw: raw2 } = await callGemini({ prompt: retryPrompt, budget_usd, power_bracket });
    const parsed2 = parseGeminiResponse(raw2);
    ({ resolved: signatures, dropped } = await resolveSignatures(
      parsed2.signature_cards, colorIdentity, cardRepo
    ));
    signatures = filterByBracket(signatures, power_bracket, gameChangers);
  }

  // 7. Fill
  const commanderPrice = commander.prices?.usd ?? 0;
  const sigPrice = signatures.reduce((s, c) => s + (c.prices?.usd ?? 0), 0);
  const budgetRemaining = (budget_usd ?? Infinity) - commanderPrice - sigPrice;

  if (budget_usd != null && budgetRemaining < 0) {
    const err = new Error('Budget too low for even commander + signatures');
    err.code = 'BUDGET_TOO_LOW';
    err.suggested_min_budget_usd = Math.ceil(commanderPrice + sigPrice + 30);
    throw err;
  }

  const filled = await fillEngine({
    commander, signatures, colorIdentity, bracket: power_bracket,
    budgetRemaining, cardRepo, gameChangers, strategy: parsed.strategy,
  });

  // 8. Compose response
  const cards = filled.map(e => ({
    _id: e.card._id,
    name: e.card.name,
    quantity: e.quantity,
    role: e.role,
    image_uris: e.card.image_uris,
    prices: e.card.prices,
  }));
  const budget_total_usd = commanderPrice + cards.reduce(
    (s, c) => s + (c.prices?.usd ?? 0) * c.quantity, 0
  );

  const generation_id = crypto.randomUUID();
  previewCache.set(generation_id, {
    user_id: String(userId),
    commander,
    cards: filled,
    strategy: parsed.strategy,
    prompt,
    power_bracket,
    budget_usd,
    model,
    generated_at: new Date(),
  });

  return {
    generation_id,
    commander: {
      _id: commander._id,
      name: commander.name,
      image_uris: commander.image_uris,
    },
    cards,
    strategy: parsed.strategy,
    budget_total_usd: Math.round(budget_total_usd * 100) / 100,
  };
}
```

- [ ] **Step 2: Run all existing tests to make sure nothing broke**

Run: `npm test`
Expected: all tests pass (the orchestrator has no tests yet; existing units still green).

- [ ] **Step 3: Commit**

```bash
git add services/aiDeckBuilder/pipeline.js
git commit -m "feat(ai-deck): pipeline orchestrator composes LLM → resolve → fill → cache"
```

---

## Task 13: Daily cap middleware + controllers + routes

**Files:**
- Create: `middleware/dailyCap.js`
- Create: `controllers/ai/deckBuilderController.js`
- Modify: `routes/aiRoutes.js`

- [ ] **Step 1: Implement the daily cap middleware**

Create `middleware/dailyCap.js`:
```js
import AIUsage from '../models/AIUsage.js';

const DAILY_LIMIT = 20;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function dailyCap(req, res, next) {
  const user = req.user?.id;
  if (!user) return res.status(401).json({ error: 'auth required' });

  const date = todayUtc();
  const usage = await AIUsage.findOneAndUpdate(
    { user, date },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  if (usage.count > DAILY_LIMIT) {
    const retryAfter = Math.ceil(
      (Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1
      ) - Date.now()) / 1000
    );
    res.set('Retry-After', retryAfter);
    return res.status(429).json({ error: 'daily generation cap reached', retry_after_seconds: retryAfter });
  }

  next();
}
```

- [ ] **Step 2: Implement the controller**

Create `controllers/ai/deckBuilderController.js`:
```js
import Deck from '../../models/Deck.js';
import { generateDeck, getPreview, deletePreview } from '../../services/aiDeckBuilder/pipeline.js';

function validateGenerateBody(body) {
  const errors = [];
  if (body.format !== 'Commander') errors.push('format must be "Commander"');
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) errors.push('prompt required');
  if (body.prompt && body.prompt.length > 500) errors.push('prompt max 500 chars');
  if (body.budget_usd != null) {
    if (!Number.isInteger(body.budget_usd) || body.budget_usd < 20 || body.budget_usd > 10000) {
      errors.push('budget_usd must be 20-10000');
    }
  }
  const bracket = body.power_bracket ?? 2;
  if (!Number.isInteger(bracket) || bracket < 1 || bracket > 5) errors.push('power_bracket 1-5');
  return { errors, bracket };
}

export async function generate(req, res) {
  const { errors, bracket } = validateGenerateBody(req.body ?? {});
  if (errors.length) return res.status(400).json({ errors });

  try {
    const preview = await generateDeck({
      userId: req.user.id,
      prompt: req.body.prompt.trim(),
      budget_usd: req.body.budget_usd ?? null,
      power_bracket: bracket,
    });
    return res.json(preview);
  } catch (err) {
    if (err.code === 'COMMANDER_UNRESOLVED') {
      return res.status(422).json({ error: err.message });
    }
    if (err.code === 'BUDGET_TOO_LOW') {
      return res.status(422).json({
        error: err.message,
        suggested_min_budget_usd: err.suggested_min_budget_usd,
      });
    }
    console.error('deck generate failed:', err);
    return res.status(502).json({ error: 'AI provider error' });
  }
}

export async function save(req, res) {
  const { generation_id, deck_name, is_public, tags } = req.body ?? {};
  if (!generation_id || !deck_name) {
    return res.status(400).json({ error: 'generation_id and deck_name required' });
  }

  const preview = getPreview(generation_id);
  if (!preview) return res.status(410).json({ error: 'generation expired, regenerate' });
  if (preview.user_id !== String(req.user.id)) {
    return res.status(403).json({ error: 'not your generation' });
  }

  const deck = await Deck.create({
    deck_name,
    format: 'Commander',
    commander: preview.commander.name,
    commander_image: preview.commander.image_uris?.normal ?? null,
    owner: req.user.id,
    owner_email: req.user.email_address,
    tags: Array.isArray(tags) ? tags : [],
    is_public: !!is_public,
    source: 'ai',
    ai_metadata: {
      prompt: preview.prompt,
      power_bracket: preview.power_bracket,
      budget_usd: preview.budget_usd,
      model: preview.model,
      generated_at: preview.generated_at,
    },
    cards: preview.cards.map(e => ({
      card: e.card._id,
      quantity: e.quantity,
    })),
  });

  deletePreview(generation_id);
  return res.status(201).json({ deck });
}
```

- [ ] **Step 3: Mount the routes**

In `routes/aiRoutes.js`, replace the file contents:
```js
import express from 'express';
import { generateDeckDeepSeek } from '../controllers/ai/deepseekAIController.js';
import { generateDeckGemini } from '../controllers/ai/geminiAIController.js';
import { generate, save } from '../controllers/ai/deckBuilderController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { dailyCap } from '../middleware/dailyCap.js';

const router = express.Router();

router.post('/deepseek', generateDeckDeepSeek);
router.post('/gemini', generateDeckGemini);

router.post('/ai/deck/generate', authMiddleware, dailyCap, generate);
router.post('/ai/deck/save', authMiddleware, save);

export default router;
```

**Note:** `authMiddleware` is a default export (`authenticateToken` function) and sets `req.user` from the decoded JWT, which contains `{ id, email_address, username }` — so throughout this code we read `req.user.id` (string form of the user's ObjectId), not `req.user._id`. Mongoose will coerce the string to an ObjectId when writing the Deck.owner ref.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all prior tests pass; no new tests in this task.

- [ ] **Step 5: Commit**

```bash
git add middleware/dailyCap.js controllers/ai/deckBuilderController.js routes/aiRoutes.js
git commit -m "feat(ai-deck): /api/ai/deck/generate and /save routes with auth + daily cap"
```

---

## Task 14: Backfill prices via card sync

**Files:** none modified; this is a manual step.

- [ ] **Step 1: Ensure `GEMINI_API_KEY` is set in `.env` if you want to smoke-test generation next.**

Check `.env` contains a valid `GEMINI_API_KEY`. If not, create a key at https://aistudio.google.com/apikey and add:
```
GEMINI_API_KEY=<your-key>
```

- [ ] **Step 2: Run the card sync to backfill prices**

Run:
```bash
npm run db:cards:sync
```
Expected: `Done. inserted=0 updated=113773 elapsed=…s` (cards are updated in place with the new `prices` field). ~40-50 min.

- [ ] **Step 3: Verify prices landed**

Run a quick Node one-liner (adapt as convenient):
```bash
node -e "import('dotenv/config').then(async () => { const m=(await import('mongoose')).default; const Card=(await import('./models/Card.js')).default; await m.connect(process.env.MONGODB_URI); const withPrice=await Card.countDocuments({'prices.usd':{\$ne:null}}); console.log('cards with prices.usd:',withPrice); await m.disconnect(); })"
```
Expected: a large number (≥ 90% of 113,773 — some cards have no price).

No commit — this task changes no code.

---

## Task 15: Smoke test end-to-end

**Files:** none created/modified; verification only.

- [ ] **Step 1: Start the server locally**

Run:
```bash
npm start
```
Expected: `Server running on port 3000`, no connection errors.

- [ ] **Step 2: Sign in via your existing login endpoint to get a session cookie, then hit `/generate`**

Use the frontend or curl with the JWT cookie set. Minimal curl (after logging in and copying the `token` cookie value):
```bash
curl -X POST http://localhost:3000/api/ai/deck/generate \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{
    "format": "Commander",
    "prompt": "Goblin tribal aggro around Krenko",
    "budget_usd": 200,
    "power_bracket": 2
  }'
```
Expected: JSON response with `generation_id`, `commander`, 99 `cards` summing to `quantity` = 99, `strategy`, `budget_total_usd`.

- [ ] **Step 3: Use the returned `generation_id` to save**

```bash
curl -X POST http://localhost:3000/api/ai/deck/save \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{
    "generation_id": "<from-previous-response>",
    "deck_name": "Krenko Test",
    "is_public": false,
    "tags": ["test"]
  }'
```
Expected: 201 with the created `Deck` document.

- [ ] **Step 4: Confirm the deck lives in Mongo**

```bash
node -e "import('dotenv/config').then(async () => { const m=(await import('mongoose')).default; const Deck=(await import('./models/Deck.js')).default; await m.connect(process.env.MONGODB_URI); const d=await Deck.findOne({source:'ai'}).sort({created_at:-1}).lean(); console.log('name:',d?.deck_name,'cards:',d?.cards.length,'source:',d?.source); await m.disconnect(); })"
```
Expected: prints name, cards count = 99, source = `ai`.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin ai-deck-builder
```

- [ ] **Step 6: Open the PR**

Open in browser: `https://github.com/itsvickel/CommanderHut-backend/compare/main...ai-deck-builder` and create the pull request.
