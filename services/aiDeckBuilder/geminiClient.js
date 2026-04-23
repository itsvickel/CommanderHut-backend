import OpenAI from 'openai';
import { buildSystemPrompt } from './promptCache.js';

const MODEL = 'llama-3.3-70b-versatile';
const BASE_URL = 'https://api.groq.com/openai/v1';

export async function callGemini({ prompt, budget_usd, power_bracket, apiKey }) {
  const systemContent = await buildSystemPrompt({ budget_usd, power_bracket });
  const client = new OpenAI({
    apiKey: apiKey ?? process.env.GROQ_API_KEY,
    baseURL: BASE_URL,
  });
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });
  return { raw: response.choices[0].message.content, model: MODEL };
}
