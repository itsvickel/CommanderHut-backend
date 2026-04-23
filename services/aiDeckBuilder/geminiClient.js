import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-1.5-flash';

const responseSchema = {
  type: 'object',
  properties: {
    commander: { type: 'string' },
    color_identity: {
      type: 'array',
      items: { type: 'string', enum: ['W', 'U', 'B', 'R', 'G'] },
    },
    strategy: { type: 'string' },
    signature_cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['win_con', 'ramp', 'draw', 'removal', 'interaction', 'synergy', 'utility'] },
        },
        required: ['name', 'role'],
      },
    },
  },
  required: ['commander', 'color_identity', 'strategy', 'signature_cards'],
};

function systemPrompt({ budget_usd, power_bracket }) {
  const bracketNote = {
    1: 'Ultra-casual: no Game Changers, no fast mana, no tutors.',
    2: 'Precon-level core: limited tutors, no Game Changers.',
    3: 'Upgraded precons: no Game Changers; avoid mass land destruction.',
    4: 'Optimized, non-cEDH. All Game Changers allowed.',
    5: 'Competitive EDH. Anything format-legal.',
  }[power_bracket] ?? '';

  return [
    'You are a Commander deck-building expert.',
    'Output strict JSON matching the schema. Do not invent card names — use real Magic: The Gathering cards.',
    `Power Bracket ${power_bracket}: ${bracketNote}`,
    budget_usd ? `Approximate total deck budget: $${budget_usd} USD. Prefer cheaper staples.` : '',
    'Produce: a commander, the commander color identity (WUBRG letters), a short strategy (≤ 400 chars), and 25-35 signature cards each tagged with a role.',
  ].filter(Boolean).join('\n');
}

export async function callGemini({ prompt, budget_usd, power_bracket, apiKey }) {
  const ai = new GoogleGenAI({ apiKey: apiKey ?? process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{
      role: 'user',
      parts: [{ text: `${systemPrompt({ budget_usd, power_bracket })}\n\nUser request: ${prompt}` }],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });
  return { raw: response.text, model: MODEL };
}
