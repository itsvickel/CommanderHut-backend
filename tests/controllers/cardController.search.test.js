import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../models/Card.js', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('../../services/cardSearch/queryBuilder.js', () => ({
  parseQ: vi.fn(() => ({})),
  buildFilter: vi.fn(() => ({})),
}));

import Card from '../../models/Card.js';
import { parseQ, buildFilter } from '../../services/cardSearch/queryBuilder.js';
import { searchCards } from '../../controllers/cardController.js';

function makeRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchCards', () => {
  it('returns paginated results with defaults', async () => {
    const fakeCards = [{ name: 'Lightning Bolt' }];
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(fakeCards),
    });
    Card.countDocuments.mockResolvedValue(1);

    const req = { query: {} };
    const res = makeRes();

    await searchCards(req, res);

    expect(res.json).toHaveBeenCalledWith({
      cards: fakeCards,
      total: 1,
      page: 1,
      pages: 1,
      limit: 20,
    });
  });

  it('returns 400 for non-numeric cmc_min', async () => {
    const req = { query: { cmc_min: 'abc' } };
    const res = makeRes();
    await searchCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'cmc_min must be a number' });
  });

  it('returns 400 for non-numeric cmc_max', async () => {
    const req = { query: { cmc_max: 'xyz' } };
    const res = makeRes();
    await searchCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'cmc_max must be a number' });
  });

  it('returns 400 for non-numeric price_max', async () => {
    const req = { query: { price_max: 'free' } };
    const res = makeRes();
    await searchCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'price_max must be a number' });
  });

  it('returns 400 for non-numeric page', async () => {
    const req = { query: { page: 'first' } };
    const res = makeRes();
    await searchCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'page must be a positive integer' });
  });

  it('returns 400 for non-numeric limit', async () => {
    const req = { query: { limit: 'all' } };
    const res = makeRes();
    await searchCards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'limit must be a positive integer' });
  });

  it('clamps limit to 100', async () => {
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    Card.countDocuments.mockResolvedValue(0);

    const req = { query: { limit: '999' } };
    const res = makeRes();
    await searchCards(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('parses colors string into uppercase array', async () => {
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    Card.countDocuments.mockResolvedValue(0);

    const req = { query: { colors: 'wu' } };
    const res = makeRes();
    await searchCards(req, res);

    expect(buildFilter).toHaveBeenCalledWith(
      expect.objectContaining({ colors: ['W', 'U'] })
    );
  });

  it('parses color_identity string into uppercase array', async () => {
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    Card.countDocuments.mockResolvedValue(0);

    const req = { query: { color_identity: 'WUB' } };
    const res = makeRes();
    await searchCards(req, res);

    expect(buildFilter).toHaveBeenCalledWith(
      expect.objectContaining({ color_identity: ['W', 'U', 'B'] })
    );
  });

  it('returns pages: 1 when total is 0', async () => {
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    Card.countDocuments.mockResolvedValue(0);

    const req = { query: {} };
    const res = makeRes();
    await searchCards(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pages: 1 }));
  });

  it('returns 500 on DB error', async () => {
    Card.find.mockReturnValue({
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    Card.countDocuments.mockResolvedValue(0);

    const req = { query: {} };
    const res = makeRes();
    await searchCards(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to search cards' });
  });
});
