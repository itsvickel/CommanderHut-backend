import { describe, it, expect } from 'vitest';
import { parseGeminiResponse } from '../../../services/aiDeckBuilder/parseResponse.js';

const valid = {
  commander: 'Krenko, Mob Boss',
  color_identity: ['R'],
  strategy: 'Swarm with goblin tokens',
  signature_cards: [
    { name: 'Goblin Chieftain', role: 'synergy' },
    { name: 'Sol Ring', role: 'ramp' },
  ],
};

describe('parseGeminiResponse', () => {
  it('accepts a well-formed object', () => {
    const out = parseGeminiResponse(valid);
    expect(out.commander).toBe('Krenko, Mob Boss');
    expect(out.signature_cards).toHaveLength(2);
  });

  it('accepts a JSON string and parses it', () => {
    const out = parseGeminiResponse(JSON.stringify(valid));
    expect(out.commander).toBe('Krenko, Mob Boss');
  });

  it('throws on missing commander', () => {
    const bad = { ...valid, commander: undefined };
    expect(() => parseGeminiResponse(bad)).toThrow(/commander/);
  });

  it('throws on bad color identity', () => {
    const bad = { ...valid, color_identity: ['X'] };
    expect(() => parseGeminiResponse(bad)).toThrow(/color_identity/);
  });

  it('drops signature entries with unknown roles', () => {
    const out = parseGeminiResponse({
      ...valid,
      signature_cards: [
        { name: 'A', role: 'ramp' },
        { name: 'B', role: 'nonsense' },
      ],
    });
    expect(out.signature_cards).toHaveLength(1);
    expect(out.signature_cards[0].name).toBe('A');
  });

  it('throws on unparseable string', () => {
    expect(() => parseGeminiResponse('not json')).toThrow();
  });
});
