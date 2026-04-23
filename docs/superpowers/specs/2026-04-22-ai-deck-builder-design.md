# AI Deck Builder — Design Spec

**Date:** 2026-04-22
**Branch at time of writing:** `ai-deck-builder`
**Depends on:** `profile-api` merged to `main` (for card DB sync, auth middleware, rate limiter)

## Goal

Let an authenticated user describe a deck in one sentence and receive a complete, format-legal, budget-aware 100-card Commander decklist. Preview first, save on request.

## 1. Scope

### In scope for v1

- New endpoint `POST /api/ai/deck/generate` — returns a previewed decklist, does not persist.
- New endpoint `POST /api/ai/deck/save` — persists a previewed decklist to the user's account.
- Commander format only.
- Budget-aware card selection (`budget_usd` field in request).
- Power-aware card selection via the WotC Commander Bracket system 1-5 (`power_bracket` field).
- Gemini 2.5 Flash as the LLM, with native structured JSON output (`responseSchema`).
- Daily per-user generation cap (20/day) to bound LLM spend.
- Light unit tests (Vitest) on pure logic: name resolution, color identity, bracket filter, fill engine, response parsing.

### Explicitly out of scope for v1

- Other formats (Standard, Modern).
- Regeneration / edit-and-resave workflows.
- Multi-turn chat refinement.
- Streaming / progress-event responses.
- Mana curve optimization beyond "fill roles to quota."
- Anonymous generation (auth required on both endpoints).
- Public AI-deck feed, recommendations, similarity search.

## 2. User flow

1. User signs in, picks Commander format, types a free-form prompt ("Goblin tribal aggro, mid power, around $200").
2. Frontend sends `POST /api/ai/deck/generate` with `{ format, prompt, budget_usd?, power_bracket? }`.
3. Backend runs the pipeline (Section 4), returns the 100-card preview with a `generation_id`.
4. Frontend renders the preview. User decides whether to save.
5. If save, frontend sends `POST /api/ai/deck/save` with `{ generation_id, deck_name, is_public, tags[] }`.
6. Backend inflates the cached preview, persists as a `Deck` with `source: "ai"`, returns the saved deck.

## 3. API surface

### `POST /api/ai/deck/generate`

Auth required.

**Request:**
```json
{
  "format": "Commander",
  "prompt": "Goblin tribal aggro, mid power, around $200",
  "budget_usd": 200,
  "power_bracket": 2
}
```

- `format`: must equal `"Commander"` in v1.
- `prompt`: string, non-empty, ≤ 500 chars.
- `budget_usd`: integer, 20 ≤ n ≤ 10000, optional (omit for no cap).
- `power_bracket`: integer 1-5, default 2.

**Response 200:**
```json
{
  "generation_id": "uuid-v4",
  "commander": { "_id": "...", "name": "...", "image_uris": {...} },
  "cards": [
    { "_id": "...", "name": "...", "quantity": 1, "role": "ramp" }
  ],
  "strategy": "...",
  "budget_total_usd": 187.32
}
```

### `POST /api/ai/deck/save`

Auth required.

**Request:**
```json
{
  "generation_id": "uuid-v4",
  "deck_name": "Krenko Goblins",
  "is_public": false,
  "tags": ["goblins", "aggro"]
}
```

Alternative: if `generation_id` has expired, frontend may POST `cards: [...]` inline with the commander ID and skip the cache lookup.

**Response 201:**
```json
{ "deck": { "_id": "...", ...full Deck doc including ai_metadata... } }
```

## 4. Generation pipeline

Each numbered step is its own pure function to enable unit testing.

1. **Validate request** — shape + value ranges from Section 3.
2. **Rate limit** — reuse `authLimiter`; add daily cap (20/day/user) via the `AIUsage` Mongo collection (Section 5) keyed on `userId + UTC date`. Durable across restarts; one doc per user per active day.
3. **Call Gemini 2.5 Flash** with `responseSchema`:
   ```
   {
     commander: string,
     color_identity: [W|U|B|R|G],
     strategy: string,
     signature_cards: [
       { name: string, role: "win_con"|"ramp"|"draw"|"removal"|"interaction"|"synergy"|"utility" }
     ]        // ~25-35 entries
   }
   ```
   System prompt injects `budget_usd` and `power_bracket` so the LLM tailors picks.
4. **Resolve commander** — exact match in DB; fallback to Levenshtein ≤ 2 against legendary-creature + Commander-legal cards. If no match, return 422.
5. **Compute color identity** — from the resolved commander's `colors`, not the LLM's claim. This becomes the hard filter.
6. **Resolve signature cards** — exact match filtered by color identity + Commander legality. Drop any that fail.
7. **Bracket filter** — if `power_bracket < 4`, drop any resolved cards that appear in `data/gameChangers.json`.
8. **Retry budget (1)** — if > 5 signature cards dropped in steps 6-7, re-prompt Gemini once with the dropped names explicitly excluded. Apply steps 6-7 again on the retry output.
9. **Deterministic fill engine** — input: commander + resolved signatures + color identity + remaining budget. Output: 99 non-commander cards hitting this skeleton:
   - 35 lands (~15-20 basics, ~15-20 nonbasic staples filtered by color identity)
   - ≥ 10 ramp
   - ≥ 10 draw
   - ≥ 10 removal/interaction
   - Remaining slots filled by synergy (tag / oracle-text match against the LLM's strategy text)
   Each slot queries MongoDB with: color identity ∈ commander's identity, `legalities.commander === "legal"`, role tag match, bracket filter, and `prices.usd` within remaining budget. Sorted by `prices.usd` ascending so cheapest-first until budget exhausted or role quota met. If budget exhausted with lands not yet filled, falls back to basics.
10. **Cache preview** — store `{ generation_id, user_id, commander, cards, strategy, metadata }` in an in-memory LRU (capacity 500, TTL 1h). Acceptable for single-process Railway deploys; upgrade to Redis later if we scale out.
11. **Return preview** to client.

**Latency budget:** Gemini call 5-10s + DB queries ~200ms ≈ 10s total. Sync HTTP is fine.

## 5. Schema changes

### `models/Card.js` — add prices

```js
prices: {
  usd: { type: Number, default: null },
  usd_foil: { type: Number, default: null },
},
```

Null is meaningful: "no current market price." Must not be treated as free.

### `models/Deck.js` — add AI provenance

```js
source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
ai_metadata: {
  prompt: String,
  power_bracket: Number,
  budget_usd: Number,
  model: String,            // "gemini-2.5-flash"
  generated_at: Date,
},
```

Manual decks leave `ai_metadata` undefined. No migration needed — optional fields are fine on existing docs.

### `scripts/populateCardsMongodb.js` — map prices

```js
prices: {
  usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
  usd_foil: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
},
```

Re-run once after the change to backfill prices on all 113,773 existing cards. The daily GitHub Actions sync then keeps prices fresh without further action.

### `data/gameChangers.json` — new file

```json
{
  "version": "2024-09-24",
  "source": "https://magic.wizards.com/en/news/announcements/commander-format-panel-update-september-2024",
  "cards": ["Mana Vault", "Gaea's Cradle", "..."]
}
```

~40 card names. Hand-maintained. Updated when WotC revises the list.

### `models/AIUsage.js` — new model for daily cap

```js
user: { type: ObjectId, ref: 'User', required: true },
date: { type: String, required: true },   // YYYY-MM-DD UTC
count: { type: Number, default: 0 },
```

Compound unique index on `{ user, date }`. Small collection — one doc per user per active day.

### No changes to `DeckCard.js` — existing embedded card refs continue to work.

### No new indexes on Card — existing `scryfallId` unique index covers writes; reads filter by `legalities.commander` and `colors`. If query times regress at 113k docs, add a compound index later. Not premature.

## 6. Errors

| Case | Status | Notes |
|------|--------|-------|
| Invalid format | 400 | v1 rejects non-Commander |
| Prompt empty or > 500 chars | 400 | |
| Budget out of range (< 20 or > 10000) | 400 | |
| Power bracket not 1-5 | 400 | |
| Missing/expired auth | 401 | existing `authMiddleware` |
| Over daily cap (20/day) | 429 | `Retry-After` header set to seconds-until-UTC-midnight |
| Gemini API down/timeout | 502 | no server-side retry; user retries |
| Gemini returns unparseable JSON | 502 | log the raw response; rare with `responseSchema` |
| Commander can't be resolved | 422 | one LLM retry already attempted |
| > 5 signature cards unresolvable after retry | 422 | "try a different prompt" |
| Budget too low to build a legal deck | 422 | response includes `suggested_min_budget_usd` |
| `/save` with expired `generation_id` | 410 | frontend falls back to inline cards |
| `/save` with `generation_id` from another user | 403 | |

**Logging:** prompt, model response, resolved commander, drop reasons, and elapsed time — via existing `console.log`. No new logging infra in v1.

## 7. Testing

**Framework:** [Vitest](https://vitest.dev). Native ESM, fits the repo's `"type": "module"`. Adds one dev dependency and an `npm test` script.

**Covered by unit tests (in-memory fixtures, no DB, no Gemini):**
- `resolveCommanderName()` — exact, fuzzy, miss
- `computeColorIdentity(commander)` — colorless, mono, multi
- `filterByBracket(cards, bracket)` — Game Changers removed from 1-3
- `fillEngine(commander, signatures, identity, budget)` — respects budget, hits role quotas, falls back to basics, handles "budget too low"
- `parseGeminiResponse(raw)` — valid, malformed, missing fields

**Not covered by tests in v1:**
- Route handlers (thin wrappers)
- Mongoose queries (covered by schema types)
- Live Gemini calls (cost + flakiness)

Upgrade path if the feature sticks: add `mongodb-memory-server` + a mocked Gemini client for end-to-end pipeline tests.

## 8. Rollout

1. Open PR `ai-deck-builder → main`. Review + merge.
2. Re-run `npm run db:cards:sync` once to backfill `prices` on existing 113,773 cards.
3. Set `GEMINI_API_KEY` in Railway env vars if not already.
4. Deploy. Smoke-test both endpoints via a signed-in browser session.
5. Monitor generation count + failure rate via console logs for the first week.

## 9. Risks / caveats

- **Price drift:** Scryfall prices are TCGPlayer mid and move daily. A deck priced at $198 Monday can be $215 Friday. Frontend should caveat this.
- **Game Changers list staleness:** WotC updates the list occasionally. The JSON file is hand-maintained — we accept a lag of up to ~2 weeks between WotC's announcement and our update.
- **Over-tight budgets produce 422s:** "$20 mono-blue control" is impossible. The `suggested_min_budget_usd` response field should give the frontend enough to prompt the user to relax the constraint.
- **Commander hallucination rate:** Even with `responseSchema`, Gemini occasionally invents plausible-sounding card names. The resolve-or-retry flow catches this; actual complete-failure rate should be < 1% per measured generation.
- **Single-process preview cache:** In-memory LRU breaks if we deploy across multiple Railway replicas. v1 is single-replica; flag for revisit when we scale.
