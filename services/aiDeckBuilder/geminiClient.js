import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';

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
    'Output strict JSON with these exact keys:',
    '  commander: string (exact card name)',
    '  color_identity: array of letters from W U B R G only',
    '  strategy: string, max 400 chars',
    '  signature_cards: array of 25-35 objects each with name (string) and role (one of: win_con, ramp, draw, removal, interaction, synergy, utility)',
    'Do not invent card names — use real Magic: The Gathering cards.',
    `Power Bracket ${power_bracket}: ${bracketNote}`,
    budget_usd ? `Approximate total deck budget: $${budget_usd} USD. Prefer cheaper staples.` : '',
  ].filter(Boolean).join('\n');
}

export async function callGemini({ prompt, budget_usd, power_bracket, apiKey }) {
  const client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt({ budget_usd, power_bracket }) },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });
  return { raw: response.choices[0].message.content, model: MODEL };
}
