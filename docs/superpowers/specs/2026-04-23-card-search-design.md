# Card Search Design Spec

## Goal

Add a single flexible search endpoint (`GET /api/cards/search`) that supports both general card browsing and Commander deck-builder card lookup, with pagination, structured filters, and a keyword query syntax.

## Architecture

A new `services/cardSearch/queryBuilder.js` module parses the `q` keyword string and structured query params into a MongoDB filter object. The existing `cardController.js` gets one new `searchCards` handler that calls the query builder and executes the paginated query. No auth required — this is a public read endpoint.

## Tech Stack

Mongoose, Express, Vitest (vi.mock pattern)

---

## Endpoint

### `GET /api/cards/search`

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Keyword syntax search string |
| `colors` | string | — | Color letters (e.g. `WU`) — card must contain all listed colors |
| `color_identity` | string | — | Color letters — card colors must be a strict subset (Commander deck builder) |
| `cmc_min` | number | — | Minimum converted mana cost (inclusive) |
| `cmc_max` | number | — | Maximum converted mana cost (inclusive) |
| `price_max` | number | — | Maximum USD price; cards with no price are included |
| `legal` | string | — | Format legality key (e.g. `commander`, `standard`) |
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Results per page, clamped to 1–100 |

**`q` keyword syntax:**

| Syntax | Maps to |
|---|---|
| `name:"sol ring"` | name contains "sol ring" (case-insensitive) |
| `text:"draw a card"` | oracle_text contains "draw a card" (case-insensitive) |
| `type:"creature"` | type_line contains "creature" (case-insensitive) |
| bare text (no keyword) | treated as a name search |

Multiple keywords in one `q` string are all applied (AND logic). Example:
```
q=sol ring text:"add mana" type:"artifact"
```
→ name contains "sol ring" AND oracle_text contains "add mana" AND type_line contains "artifact"

**Response (200):**
```json
{
  "cards": [ ...card objects... ],
  "total": 142,
  "page": 1,
  "pages": 8,
  "limit": 20
}
```

**Error responses:**
- `400` — invalid `cmc_min`/`cmc_max` (non-numeric), invalid `page`/`limit`
- `500` — DB error

---

## Query Builder (`services/cardSearch/queryBuilder.js`)

### `parseQ(q: string) → { name?, text?, type? }`

Extracts `keyword:"value"` pairs from `q` using a regex. Bare text remaining after extraction is treated as `name`. Returns a plain object with only the keys that were present.

```
parseQ('sol ring text:"draw a card"')
→ { name: "sol ring", text: "draw a card" }

parseQ('name:"atraxa" type:"creature"')
→ { name: "atraxa", type: "creature" }

parseQ('')
→ {}
```

### `buildFilter(params) → MongoFilter`

Accepts the full set of parsed params and returns a MongoDB `$and` filter array (empty array → `{}` query, i.e. match all).

| Input | MongoDB filter |
|---|---|
| `name` | `{ name: { $regex: escaped, $options: "i" } }` |
| `text` | `{ oracle_text: { $regex: escaped, $options: "i" } }` |
| `type` | `{ type_line: { $regex: escaped, $options: "i" } }` |
| `colors` | `{ colors: { $all: ["W","U"] } }` |
| `color_identity` | `{ colors: { $not: { $elemMatch: { $nin: ["W","U","B"] } } } }` |
| `cmc_min` only | `{ cmc: { $gte: n } }` |
| `cmc_max` only | `{ cmc: { $lte: n } }` |
| both `cmc_min` + `cmc_max` | `{ cmc: { $gte: min, $lte: max } }` |
| `price_max` | `{ $or: [{ "prices.usd": { $lte: n } }, { "prices.usd": null }] }` |
| `legal` | `{ ["legalities." + legal]: "legal" }` |

All active clauses are combined: `{ $and: [clause1, clause2, ...] }`. If no clauses, returns `{}`.

Regex values must be escaped before use (same `escapeRegex` helper already used in `cardRepo.js`).

---

## Card Schema Addition

Add `cmc` to `models/Card.js`:

```js
cmc: { type: Number, default: null },
```

Scryfall bulk data already includes `cmc` as a numeric field. The populate script (`scripts/populateCardsMongodb.js`) maps it through during upsert. Existing documents without `cmc` will return `null` for `cmc_min`/`cmc_max` filters — they will be excluded when a CMC filter is active (expected behaviour).

---

## Controller (`controllers/cardController.js`)

New export: `searchCards(req, res)`

1. Parse and validate `page`, `limit` (clamp 1–100), `cmc_min`, `cmc_max`, `price_max` — return 400 on non-numeric
2. Call `parseQ(req.query.q ?? '')` → keyword params
3. Parse `colors` and `color_identity` strings into arrays of uppercase letters (e.g. `"WUB"` → `["W","U","B"]`)
4. Call `buildFilter({ ...keywords, colors, color_identity, cmc_min, cmc_max, price_max, legal })`
5. Run `Card.find(filter).skip(skip).limit(limit)` and `Card.countDocuments(filter)` in parallel
6. Return `{ cards, total, page, pages, limit }`
7. On error → 500

---

## Routes (`routes/cardRoutes.js`)

Add before the existing `/:set/:collectorNumber` route to avoid shadowing:

```js
router.get('/cards/search', searchCards);
```

No auth middleware — public endpoint.

---

## Files Changed

| File | Action |
|---|---|
| `services/cardSearch/queryBuilder.js` | Create |
| `models/Card.js` | Modify — add `cmc` field |
| `controllers/cardController.js` | Modify — add `searchCards` |
| `routes/cardRoutes.js` | Modify — add `GET /cards/search` |
| `tests/services/cardSearch/queryBuilder.test.js` | Create |
| `tests/controllers/cardController.search.test.js` | Create |

---

## Out of Scope

- MongoDB text index (regex is sufficient for 20k cards; can add later)
- Sorting options (can add later)
- Updating the populate script to backfill `cmc` on existing documents (new imports will include it; old docs return null for CMC filters)
- Auth on search endpoint
- Deprecating `GET /api/cards/all` (leave it, YAGNI)
