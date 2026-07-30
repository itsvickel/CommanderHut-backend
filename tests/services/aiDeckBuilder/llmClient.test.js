import { describe, it, expect } from 'vitest';
import { resolveProviderConfig, estimateCostUsd } from '../../../services/aiDeckBuilder/llmClient.js';

describe('resolveProviderConfig', () => {
  it('defaults to groq with its default model', () => {
    expect(resolveProviderConfig({})).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
  });

  it('selects gemini with its default model', () => {
    expect(resolveProviderConfig({ LLM_PROVIDER: 'gemini' })).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
  });

  it('honours LLM_MODEL override', () => {
    expect(resolveProviderConfig({ LLM_PROVIDER: 'groq', LLM_MODEL: 'llama-3.1-8b-instant' })).toEqual({
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
    });
  });

  it('throws on unknown provider', () => {
    expect(() => resolveProviderConfig({ LLM_PROVIDER: 'openai' })).toThrow(/Unknown LLM_PROVIDER/);
  });
});

describe('estimateCostUsd', () => {
  it('computes cost from per-million rates', () => {
    // 1M input + 1M output on llama-3.3-70b-versatile = 0.59 + 0.79
    expect(estimateCostUsd('llama-3.3-70b-versatile', 1_000_000, 1_000_000)).toBeCloseTo(1.38, 6);
  });

  it('returns null for unknown models', () => {
    expect(estimateCostUsd('mystery-model', 1000, 1000)).toBeNull();
  });
});
