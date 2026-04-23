import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../models/MasterPrompt.js', () => ({
  default: { findOne: vi.fn() },
}));

import MasterPrompt from '../../../models/MasterPrompt.js';
import {
  buildSystemPrompt,
  invalidatePromptCache,
  OUTPUT_FORMAT,
} from '../../../services/aiDeckBuilder/promptCache.js';

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePromptCache();
});

const docFixture = {
  role_description: 'You are a test expert.',
  domain_restrictions: 'Only MTG.',
  additional_rules: 'Extra rule.',
};

describe('OUTPUT_FORMAT', () => {
  it('is a non-empty string containing json keyword', () => {
    expect(typeof OUTPUT_FORMAT).toBe('string');
    expect(OUTPUT_FORMAT.toLowerCase()).toContain('json');
  });
});

describe('buildSystemPrompt', () => {
  it('fetches from DB on first call and includes all sections', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(MasterPrompt.findOne).toHaveBeenCalledOnce();
    expect(result).toContain(docFixture.role_description);
    expect(result).toContain(docFixture.domain_restrictions);
    expect(result).toContain(OUTPUT_FORMAT);
    expect(result).toContain(docFixture.additional_rules);
    expect(result).toContain('Power Bracket 2');
  });

  it('uses cache on second call without hitting DB again', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(MasterPrompt.findOne).toHaveBeenCalledOnce();
  });

  it('re-fetches after invalidatePromptCache()', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    invalidatePromptCache();
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(MasterPrompt.findOne).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults when DB returns null', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(result).toContain('Commander deck-building expert');
  });

  it('falls back to defaults when DB throws', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB down')) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(result).toContain('Commander deck-building expert');
  });

  it('includes budget note when budget_usd is provided', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: 100, power_bracket: 2 });
    expect(result).toContain('$100 USD');
  });

  it('omits budget note when budget_usd is null', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(result).not.toContain('USD');
  });

  it('omits additional_rules section when it is empty', async () => {
    MasterPrompt.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...docFixture, additional_rules: '' }),
    });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(result).toContain(docFixture.domain_restrictions);
    expect(result).toContain(OUTPUT_FORMAT);
  });

  it('includes budget note when budget_usd is 0', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: 0, power_bracket: 2 });
    expect(result).toContain('$0 USD');
  });

  it('does not cache DB errors — retries on next call', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB down')) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    // Second call should also hit DB since errors aren't cached
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    invalidatePromptCache(); // ensure clean state for this test
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB down')) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(MasterPrompt.findOne).toHaveBeenCalledTimes(2);
  });
});
