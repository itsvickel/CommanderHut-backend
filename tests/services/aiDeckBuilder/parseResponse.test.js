import { describe, it, expect } from 'vitest';
import { parseLlmResponse as parseGeminiResponse } from '../../../services/aiDeckBuilder/parseResponse.js';

const valid = {
  commander: { name: 'Krenko, Mob Boss', reason: 'Best goblin commander' },
  strategy: 'Swarm with goblin tokens',
  signature_cards: [
    { name: 'Goblin Chieftain', role: 'synergy engine' },
    { name: 'Sol Ring', role: 'ramp' },
  ],
  themes: ['goblin', 'tokens'],
  power_bracket: 3,
  budget_tier: 'medium',
};

describe('parseGeminiResponse', () => {
  it('accepts a well-formed object', () => {
    const out = parseGeminiResponse(valid);
    expect(out.commander.name).toBe('Krenko, Mob Boss');
    expect(out.commander.reason).toBe('Best goblin commander');
    expect(out.signature_cards).toHaveLength(2);
    expect(out.themes).toEqual(['goblin', 'tokens']);
  });

  it('accepts a JSON string and parses it', () => {
    const out = parseGeminiResponse(JSON.stringify(valid));
    expect(out.commander.name).toBe('Krenko, Mob Boss');
  });

  it('strips markdown fences from JSON string', () => {
    const out = parseGeminiResponse('```json\n' + JSON.stringify(valid) + '\n```');
    expect(out.commander.name).toBe('Krenko, Mob Boss');
  });

  it('throws on missing commander', () => {
    const bad = { ...valid, commander: undefined };
    expect(() => parseGeminiResponse(bad)).toThrow(/commander/);
  });

  it('throws on commander.name missing', () => {
    const bad = { ...valid, commander: { reason: 'ok' } };
    expect(() => parseGeminiResponse(bad)).toThrow(/commander\.name/);
  });

  it('throws on missing strategy', () => {
    const bad = { ...valid, strategy: '' };
    expect(() => parseGeminiResponse(bad)).toThrow(/strategy/);
  });

  it('drops signature entries missing a name', () => {
    const out = parseGeminiResponse({
      ...valid,
      signature_cards: [
        { name: 'Sol Ring', role: 'ramp' },
        { role: 'no name here' },
      ],
    });
    expect(out.signature_cards).toHaveLength(1);
    expect(out.signature_cards[0].name).toBe('Sol Ring');
  });

  it('throws on unparseable string', () => {
    expect(() => parseGeminiResponse('not json')).toThrow();
  });
});
