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
});
