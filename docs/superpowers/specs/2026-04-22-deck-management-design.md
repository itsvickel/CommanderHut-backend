# Deck Management — Design Spec

**Date:** 2026-04-22
**Branch at time of writing:** `main` (create feature branch `deck-management` before coding)

## Goal

Fix four gaps in the current deck management API: unauthenticated deck creation, missing delete endpoint, broken `getDecksByUser` query, and unpaginated public deck listing.

## 1. Scope

### In scope

1. Require authentication on `POST /decks` — use `req.user.id` as owner, remove anonymous deck logic
2. Add `DELETE /decks/:id` — auth + ownership check, 403 if not owner, 204 on success
3. Fix `getDecksByUser` — query field is `owner`, not `user_id`
4. Add pagination to `GET /decks` — `?page=1&limit=20`, public decks only, return `{ decks, total, page, pages }`

### Explicitly out of scope

- PATCH / PUT deck editing
- Visibility toggle endpoint
- Soft delete / trash bin
- Deck cloning

## 2. Changes

### 2.1 Auth on `POST /decks`

**File:** `routes/deckRoutes.js`

Add `authMiddleware` to the POST route:

```js
router.post('/decks', authMiddleware, createDeckWithCards);
```

**File:** `controllers/deckController.js`

Remove the anonymous owner block and the manual `owner` validation. Set `owner` from `req.user.id` (always a valid ObjectId from the JWT payload):

```js
export const createDeckWithCards = async (req, res) => {
  const { deck_name, format, commander, commander_image, deck_list, tags, is_public } = req.body;
  const owner = req.user.id;
  // ... rest of existing validation and card lookup logic unchanged
```

### 2.2 `DELETE /decks/:id`

**File:** `routes/deckRoutes.js`

```js
router.delete('/decks/:id', authMiddleware, deleteDeck);
```

**File:** `controllers/deckController.js`

```js
export const deleteDeck = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid deck ID' });
  }
  try {
    const deck = await Deck.findById(id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    if (deck.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await Deck.findByIdAndDelete(id);
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting deck:', error);
    return res.status(500).json({ error: 'Failed to delete deck' });
  }
};
```

### 2.3 Fix `getDecksByUser`

**File:** `controllers/deckController.js`

Route is `GET /decks/user/:user_id`. Current query uses `{ user_id }` — wrong field name. Deck schema uses `owner`.

```js
export const getDecksByUser = async (req, res) => {
  const { user_id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    const decks = await Deck.find({ owner: user_id });
    res.status(200).json(decks);
  } catch (error) {
    console.error('Error fetching decks by user:', error);
    res.status(500).json({ error: 'Failed to fetch decks by user' });
  }
};
```

### 2.4 Pagination on `GET /decks`

**File:** `controllers/deckController.js`

Only return `is_public: true` decks. Accept `?page` and `?limit` query params (defaults: page=1, limit=20, max limit=100).

```js
export const getDecks = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  try {
    const [decks, total] = await Promise.all([
      Deck.find({ is_public: true }).skip(skip).limit(limit),
      Deck.countDocuments({ is_public: true }),
    ]);
    res.status(200).json({ decks, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching decks:', error);
    res.status(500).json({ error: 'Failed to fetch decks' });
  }
};
```

## 3. Errors

| Case | Status | Notes |
|------|--------|-------|
| Unauthenticated `POST /decks` | 401 | `authMiddleware` behaviour |
| `DELETE /decks/:id` — invalid ObjectId | 400 | Guard before DB query |
| `DELETE /decks/:id` — not found | 404 | |
| `DELETE /decks/:id` — not owner | 403 | `deck.owner.toString() !== req.user.id` |
| `DELETE /decks/:id` — success | 204 | No body |
| `GET /decks/user/:user_id` — invalid ObjectId | 400 | Guard before DB query |
| `GET /decks` — page/limit out of range | — | Clamped silently (no error) |

## 4. Testing

All existing tests must stay green (`npm test`). New tests:

- `POST /decks` without token → 401
- `POST /decks` with token → 201, `owner` equals authenticated user id
- `DELETE /decks/:id` without token → 401
- `DELETE /decks/:id` by non-owner → 403
- `DELETE /decks/:id` by owner → 204
- `DELETE /decks/:id` not found → 404
- `GET /decks/user/:user_id` with invalid id → 400
- `GET /decks/user/:user_id` returns only that user's decks
- `GET /decks` returns `{ decks, total, page, pages }` with only public decks
- `GET /decks?page=2&limit=5` returns correct slice

## 5. Rollout

1. Create branch `deck-management` from `main`.
2. Apply the four changes with TDD.
3. Run `npm test` — all tests green.
4. Merge to `main` via PR.
