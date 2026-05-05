import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/MasterPrompt.js', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

vi.mock('../../services/aiDeckBuilder/promptCache.js', () => ({
  invalidatePromptCache: vi.fn(),
  OUTPUT_FORMAT: 'OUTPUT_FORMAT_SENTINEL',
}));

import MasterPrompt from '../../models/MasterPrompt.js';
import { invalidatePromptCache } from '../../services/aiDeckBuilder/promptCache.js';
import {
  getMasterprompt,
  updateMasterprompt,
} from '../../controllers/admin/masterpromptController.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

const docFixture = {
  role_description: 'You are an expert.',
  domain_restrictions: 'MTG only.',
  additional_rules: '',
  updated_at: new Date('2026-04-23'),
  updated_by: 'uuid-abc',
};

// ─── getMasterprompt ───────────────────────────────────────────────────────

describe('getMasterprompt', () => {
  it('returns doc with output_format when doc exists', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    expect(res.json).toHaveBeenCalledWith({
      role_description: docFixture.role_description,
      domain_restrictions: docFixture.domain_restrictions,
      additional_rules: docFixture.additional_rules,
      output_format: 'OUTPUT_FORMAT_SENTINEL',
    });
  });

  it('returns defaults with output_format when no doc exists', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('role_description');
    expect(result).toHaveProperty('domain_restrictions');
    expect(result.output_format).toBe('OUTPUT_FORMAT_SENTINEL');
  });

  it('returns 500 when DB throws', async () => {
    MasterPrompt.findOne.mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch masterprompt' });
  });
});

// ─── updateMasterprompt ───────────────────────────────────────────────────

describe('updateMasterprompt', () => {
  it('updates and returns doc with output_format', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    MasterPrompt.findOneAndUpdate.mockResolvedValue(docFixture);
    const req = {
      user: { id: 'uuid-abc' },
      body: { role_description: 'New role', domain_restrictions: 'MTG only.' },
    };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(MasterPrompt.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: expect.objectContaining({ role_description: 'New role', updated_by: 'uuid-abc' }) },
      expect.objectContaining({ upsert: true, new: true })
    );
    expect(invalidatePromptCache).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      ...docFixture,
      output_format: 'OUTPUT_FORMAT_SENTINEL',
    });
  });

  it('returns 400 when role_description is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { role_description: 123 } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'role_description must be a string' });
    expect(invalidatePromptCache).not.toHaveBeenCalled();
  });

  it('returns 400 when domain_restrictions is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { domain_restrictions: [] } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'domain_restrictions must be a string' });
    expect(invalidatePromptCache).not.toHaveBeenCalled();
  });

  it('returns 400 when additional_rules is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { additional_rules: true } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'additional_rules must be a string' });
    expect(invalidatePromptCache).not.toHaveBeenCalled();
  });

  it('returns 500 when DB throws', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    MasterPrompt.findOneAndUpdate.mockRejectedValue(new Error('DB error'));
    const req = {
      user: { id: 'uuid' },
      body: { role_description: 'New role' },
    };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update masterprompt' });
  });

  it('returns 400 when role_description is an empty string', async () => {
    const req = { user: { id: 'uuid' }, body: { role_description: '   ' } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'role_description must not be empty' });
    expect(invalidatePromptCache).not.toHaveBeenCalled();
  });

  it('returns 400 when first-time write is missing required fields', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = { user: { id: 'uuid' }, body: { additional_rules: 'Some rule' } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'role_description and domain_restrictions are required for initial setup',
    });
    expect(invalidatePromptCache).not.toHaveBeenCalled();
  });
});
