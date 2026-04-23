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
  deleteDeck,
  getDecksByUser,
  getDecks,
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
    Card.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: cardId, name: 'Sol Ring' }]) });
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

  it('returns 401 when req.user is missing', async () => {
    const req = {
      user: undefined,
      body: {
        deck_name: 'Test',
        format: 'Commander',
        deck_list: [{ card: 'Sol Ring', quantity: 1 }],
      },
    };
    const res = makeRes();
    await createDeckWithCards(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

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

  it('returns 401 when req.user is missing', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439011' }, user: undefined };
    const res = makeRes();
    await deleteDeck(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

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
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      decks: [],
      total: 0,
      page: 1,
      pages: 0,
    });
  });

  it('returns 500 when the database throws', async () => {
    Deck.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    Deck.countDocuments.mockResolvedValue(0);

    const req = { query: {} };
    const res = makeRes();
    await getDecks(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch decks' });
  });
});
