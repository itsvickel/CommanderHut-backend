import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/User.js', () => ({
  default: { findById: vi.fn() },
}));

import User from '../../models/User.js';
import adminMiddleware from '../../middleware/adminMiddleware.js';

function makeRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('adminMiddleware', () => {
  it('calls next() when user is admin', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ is_admin: true }) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ is_admin: false }) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin only' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user not found', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when DB throws', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to verify admin status' });
  });
});
