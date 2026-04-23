# Deck Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four deck API gaps: require auth on deck creation, add a delete endpoint, fix the broken getDecksByUser query, and paginate the public deck listing.

**Architecture:** Four targeted edits to two existing files (`routes/deckRoutes.js` and `controllers/deckController.js`). Controller tests use Vitest with `vi.mock` on Mongoose models — no DB required, consistent with existing test patterns. Routes file is updated in two tasks: Task 2 adds auth to POST; Task 3 wires the DELETE route (after the controller function exists).

**Tech Stack:** Node.js 20, Express 5, Mongoose 8, Vitest 4, existing `authMiddleware` (default export from `middleware/authMiddleware.js`).

**Spec:** `docs/superpowers/specs/2026-04-22-deck-management-design.md`

---

## File Map

| File | Change |
|------|--------|
| `routes/deckRoutes.js` | Task 2: add `authMiddleware` to POST; Task 3: add DELETE route |
| `controllers/deckController.js` | Task 2: remove anonymous owner logic; Task 3: add `deleteDeck`; Task 4: fix `getDecksByUser`; Task 5: paginate `getDecks` |
| `tests/controllers/deckController.test.js` | New in Task 2; extended in Tasks 3–5 |

---

## Task 1: Branch setup

**Files:** none

- [ ] **Step 1: Create and push the feature branch**

```bash
git checkout main
git pull origin main
git checkout -b deck-management
git push -u origin deck-management
```

Expected: branch created locally and on remote, no errors.

---

## Task 2: Auth on `POST /decks`

**Files:**
- Modify: `routes/deckRoutes.js`
- Modify: `controllers/deckController.js:4-14`
- Create: `tests/controllers/deckController.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/controllers/deckController.test.js`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/Deck.js', () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    findByIdAndDelete: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../models/Card.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

import Deck from '../../models/Deck.js';
import Card from '../../models/Card.js';
import {
  createDeckWithCards,
} from '../../controllers/deckController.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

// ─── createDeckWithCards ───────────────────────────────────────────────

describe('createDeckWithCards', () => {
  it('uses req.user.id as owner', async () => {
    const cardId = '507f1f77bcf86cd799439011';
    Card.find.mockResolvedValue([{ _id: cardId, name: 'Sol Ring' }]);
    Deck.create.mockResolvedValue({ _id: 'deck1', owner: 'user1' });

    const req = {
      user: { id: 'user1' },
      body: {
        deck_name: 'Test',
        format: 'Commander',
        commander: 'Atraxa',
        deck_list: [{ card: 'Sol Ring', quantity: 1 }],
        tags: [],
        is_public: false,
      },
    };
    const res = makeRes();
    await createDeckWithCards(req, res);

    expect(Deck.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'user1' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 for invalid format', async () => {
    const req = {
      user: { id: 'user1' },
      body: {
        format: 'Legacy',
        deck_list: [],
        deck_name: 'Test',
      },
    };
    const res = makeRes();
    await createDeckWithCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when deck_list is missing', async () => {
    const req = {
      user: { id: 'user1' },
      body: { format: 'Commander', deck_name: 'Test' },
    };
    const res = makeRes();
    await createDeckWithCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'deck_list must be an array' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: FAIL — `createDeckWithCards` still uses `owner` from request body (anonymous logic), not `req.user.id`.

- [ ] **Step 3: Update `controllers/deckController.js` — remove anonymous owner logic**

Replace the entire `createDeckWithCards` function. The new version removes `owner` from `req.body`, removes the anonymous block, removes the manual ObjectId validation on owner (not needed since JWT guarantees a valid user), and adds a `deck_list` presence check:

```js
export const createDeckWithCards = async (req, res) => {
  const { deck_name, format, commander, commander_image, deck_list, tags, is_public } = req.body;
  const owner = req.user.id;

  if (!deck_list || !Array.isArray(deck_list)) {
    return res.status(400).json({ error: 'deck_list must be an array' });
  }

  if (!['Commander', 'Standard', 'Modern'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format value' });
  }

  const uniqueCardNames = [
    ...new Set(deck_list.map((entry) => entry.card?.trim()).filter(Boolean))
  ];

  try {
    const foundCards = await Card.find({
      name: { $in: uniqueCardNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).lean();

    const nameToCardMap = new Map(
      foundCards.map((card) => [card.name.toLowerCase(), card])
    );

    const notFoundNames = [];
    const validDeckList = [];

    for (const [index, { card: cardName, quantity }] of deck_list.entries()) {
      if (typeof cardName !== 'string' || typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({
          error: `Invalid card entry at index ${index}: each card must have a valid 'card' name (string) and 'quantity' >= 1`,
        });
      }

      const matchedCard = nameToCardMap.get(cardName.toLowerCase());
      if (!matchedCard) {
        notFoundNames.push(cardName);
      } else {
        validDeckList.push({ card: matchedCard._id, quantity });
      }
    }

    if (notFoundNames.length > 0) {
      return res.status(400).json({
        error: 'Some cards were not found in the database.',
        notFound: notFoundNames,
      });
    }

    const newDeck = await Deck.create({
      owner,
      deck_name,
      format,
      commander,
      commander_image,
      cards: validDeckList,
      tags: tags || [],
      is_public: !!is_public,
    });

    return res.status(201).json(newDeck);
  } catch (err) {
    console.error('Error creating deck:', err);
    return res.status(500).json({ error: 'Failed to create deck', details: err.message });
  }
};
```

- [ ] **Step 4: Update `routes/deckRoutes.js` — add `authMiddleware` to POST**

Replace the full file (DELETE route will be added in Task 3):

```js
import express from 'express';
import {
  createDeckWithCards,
  getDecksByUser,
  getDecks,
  getDeckByID
} from '../controllers/deckController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/decks', authMiddleware, createDeckWithCards);
router.get('/decks/:id', getDeckByID);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks', getDecks);

export default router;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: all `createDeckWithCards` tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests pass (36 pre-existing + new tests).

- [ ] **Step 7: Commit**

```bash
git add routes/deckRoutes.js controllers/deckController.js tests/controllers/deckController.test.js
git commit -m "feat(decks): require auth on POST /decks, use req.user.id as owner"
```

---

## Task 3: `DELETE /decks/:id`

**Files:**
- Modify: `controllers/deckController.js` (add `deleteDeck` export)
- Modify: `routes/deckRoutes.js` (wire DELETE route)
- Modify: `tests/controllers/deckController.test.js` (add delete tests)

- [ ] **Step 1: Add delete tests to `tests/controllers/deckController.test.js`**

Add this import and describe block. First, update the import line at the top of the test file to include `deleteDeck`:

```js
import {
  createDeckWithCards,
  deleteDeck,
} from '../../controllers/deckController.js';
```

Then add this describe block after the `createDeckWithCards` describe:

```js
// ─── deleteDeck ───────────────────────────────────────────────────────

describe('deleteDeck', () => {
  it('returns 400 for invalid ObjectId', async () => {
    const req = { params: { id: 'not-an-id' }, user: { id: 'user1' } };
    const res = makeRes();
    await deleteDeck(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid deck ID' });
  });

  it('returns 404 when deck not found', async () => {
    Deck.findById.mockResolvedValue(null);
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { id: 'user1' } };
    const res = makeRes();
    await deleteDeck(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when caller is not the owner', async () => {
    Deck.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      owner: { toString: () => 'other-user' },
    });
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { id: 'user1' } };
    const res = makeRes();
    await deleteDeck(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 204 when owner deletes their deck', async () => {
    Deck.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      owner: { toString: () => 'user1' },
    });
    Deck.findByIdAndDelete.mockResolvedValue({});
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: { id: 'user1' } };
    const res = makeRes();
    await deleteDeck(req, res);
    expect(Deck.findByIdAndDelete).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: FAIL — `deleteDeck` is not exported from the controller yet.

- [ ] **Step 3: Add `deleteDeck` to `controllers/deckController.js`**

Add this new export immediately after `createDeckWithCards`:

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

- [ ] **Step 4: Wire the DELETE route in `routes/deckRoutes.js`**

Replace the full file:

```js
import express from 'express';
import {
  createDeckWithCards,
  deleteDeck,
  getDecksByUser,
  getDecks,
  getDeckByID
} from '../controllers/deckController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/decks', authMiddleware, createDeckWithCards);
router.delete('/decks/:id', authMiddleware, deleteDeck);
router.get('/decks/:id', getDeckByID);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks', getDecks);

export default router;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: all `deleteDeck` tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add controllers/deckController.js routes/deckRoutes.js tests/controllers/deckController.test.js
git commit -m "feat(decks): add DELETE /decks/:id with auth and ownership check"
```

---

## Task 4: Fix `getDecksByUser`

**Files:**
- Modify: `controllers/deckController.js` (`getDecksByUser` function)
- Modify: `tests/controllers/deckController.test.js` (add tests)

- [ ] **Step 1: Add getDecksByUser tests**

Update the import line at the top of `tests/controllers/deckController.test.js` to include `getDecksByUser`:

```js
import {
  createDeckWithCards,
  deleteDeck,
  getDecksByUser,
} from '../../controllers/deckController.js';
```

Add this describe block after the `deleteDeck` describe:

```js
// ─── getDecksByUser ───────────────────────────────────────────────────

describe('getDecksByUser', () => {
  it('returns 400 for invalid user ObjectId', async () => {
    const req = { params: { user_id: 'bad-id' } };
    const res = makeRes();
    await getDecksByUser(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid user ID' });
  });

  it('queries by owner field and returns decks', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const mockDecks = [{ _id: 'deck1', owner: userId }];
    Deck.find.mockResolvedValue(mockDecks);

    const req = { params: { user_id: userId } };
    const res = makeRes();
    await getDecksByUser(req, res);

    expect(Deck.find).toHaveBeenCalledWith({ owner: userId });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockDecks);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: FAIL — current code queries `{ user_id: userId }` not `{ owner: userId }`.

- [ ] **Step 3: Fix `getDecksByUser` in `controllers/deckController.js`**

Replace the current `getDecksByUser` export:

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: all `getDecksByUser` tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add controllers/deckController.js tests/controllers/deckController.test.js
git commit -m "fix(decks): getDecksByUser query owner field (was user_id)"
```

---

## Task 5: Pagination on `GET /decks`

**Files:**
- Modify: `controllers/deckController.js` (`getDecks` function)
- Modify: `tests/controllers/deckController.test.js` (add tests)

- [ ] **Step 1: Add getDecks pagination tests**

Update the import line at the top of `tests/controllers/deckController.test.js` to include `getDecks`:

```js
import {
  createDeckWithCards,
  deleteDeck,
  getDecksByUser,
  getDecks,
} from '../../controllers/deckController.js';
```

Add this describe block after the `getDecksByUser` describe:

```js
// ─── getDecks ─────────────────────────────────────────────────────────

describe('getDecks', () => {
  it('returns paginated public decks with metadata', async () => {
    const mockDecks = [{ _id: 'deck1', is_public: true }];
    Deck.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockDecks),
    });
    Deck.countDocuments.mockResolvedValue(1);

    const req = { query: {} };
    const res = makeRes();
    await getDecks(req, res);

    expect(Deck.find).toHaveBeenCalledWith({ is_public: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      decks: mockDecks,
      total: 1,
      page: 1,
      pages: 1,
    });
  });

  it('applies page and limit from query params', async () => {
    const mockDecks = [];
    const skipMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValue(mockDecks);
    Deck.find.mockReturnValue({ skip: skipMock, limit: limitMock });
    Deck.countDocuments.mockResolvedValue(50);

    const req = { query: { page: '3', limit: '5' } };
    const res = makeRes();
    await getDecks(req, res);

    expect(skipMock).toHaveBeenCalledWith(10); // (3-1) * 5
    expect(limitMock).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith({
      decks: mockDecks,
      total: 50,
      page: 3,
      pages: 10,
    });
  });

  it('clamps limit to max 100', async () => {
    const limitMock = vi.fn().mockResolvedValue([]);
    Deck.find.mockReturnValue({ skip: vi.fn().mockReturnThis(), limit: limitMock });
    Deck.countDocuments.mockResolvedValue(0);

    const req = { query: { limit: '9999' } };
    const res = makeRes();
    await getDecks(req, res);

    expect(limitMock).toHaveBeenCalledWith(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: FAIL — current `getDecks` returns all decks with no pagination and no `is_public` filter.

- [ ] **Step 3: Replace `getDecks` in `controllers/deckController.js`**

Replace the current `getDecks` export:

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/controllers/deckController.test.js
```

Expected: all `getDecks` tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add controllers/deckController.js tests/controllers/deckController.test.js
git commit -m "feat(decks): paginate GET /decks — public only, page+limit params"
```

---

## Task 6: Push and open PR

- [ ] **Step 1: Push the branch**

```bash
git push origin deck-management
```

- [ ] **Step 2: Verify all commits are on the branch**

```bash
git log --oneline main..deck-management
```

Expected: 4 commits:
```
feat(decks): paginate GET /decks — public only, page+limit params
fix(decks): getDecksByUser query owner field (was user_id)
feat(decks): add DELETE /decks/:id with auth and ownership check
feat(decks): require auth on POST /decks, use req.user.id as owner
```

- [ ] **Step 3: Open the PR**

Open: `https://github.com/itsvickel/CommanderHut-backend/compare/main...deck-management`
