import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt } from './promptCache.js';

/**
 * Provider-agnostic LLM client for deck generation.
 * Select with LLM_PROVIDER (groq | gemini) and optionally LLM_MODEL.
 * Every driver returns the same shape:
 *   { raw, model, usage: { input_tokens, output_tokens, cost_usd } }
 */

const DEFAULT_MODELS = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
};

// USD per 1M tokens — published list prices, used for cost *estimates* only.
const PRICING = {
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
};

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const TEMPERATURE = 0.8;

export function resolveProviderConfig(env = process.env) {
  const provider = (env.LLM_PROVIDER ?? 'groq').toLowerCase();
  if (!DEFAULT_MODELS[provider]) {
    throw new Error(`Unknown LLM_PROVIDER "${provider}" — expected one of: ${Object.keys(DEFAULT_MODELS).join(', ')}`);
  }
  return { provider, model: env.LLM_MODEL || DEFAULT_MODELS[provider] };
}

export function estimateCostUsd(model, inputTokens, outputTokens) {
  const rates = PRICING[model];
  if (!rates) return null;
  const cost = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

async function callGroq({ systemContent, prompt, model, apiKey }) {
  const client = new OpenAI({
    apiKey: apiKey ?? process.env.GROQ_API_KEY,
    baseURL: GROQ_BASE_URL,
  });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: TEMPERATURE,
  });
  const input_tokens = response.usage?.prompt_tokens ?? 0;
  const output_tokens = response.usage?.completion_tokens ?? 0;
  return {
    raw: response.choices[0].message.content,
    model,
    usage: { input_tokens, output_tokens, cost_usd: estimateCostUsd(model, input_tokens, output_tokens) },
  };
}

async function callGeminiProvider({ systemContent, prompt, model, apiKey }) {
  const client = new GoogleGenAI({ apiKey: apiKey ?? process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: systemContent,
      responseMimeType: 'application/json',
      temperature: TEMPERATURE,
    },
  });
  const raw = response.text;
  if (!raw) throw new Error('Empty response from Gemini');
  const input_tokens = response.usageMetadata?.promptTokenCount ?? 0;
  const output_tokens =
    (response.usageMetadata?.candidatesTokenCount ?? 0) +
    (response.usageMetadata?.thoughtsTokenCount ?? 0);
  return {
    raw,
    model,
    usage: { input_tokens, output_tokens, cost_usd: estimateCostUsd(model, input_tokens, output_tokens) },
  };
}

const DRIVERS = { groq: callGroq, gemini: callGeminiProvider };

/**
 * Single entry point used by the pipeline. `systemContent` may be passed
 * directly (used by refine/analyze flows); otherwise the deck-building
 * system prompt is composed from the admin master prompt.
 */
export async function callLLM({ prompt, budget_usd, power_bracket, apiKey, systemContent }) {
  const { provider, model } = resolveProviderConfig();
  const system = systemContent ?? (await buildSystemPrompt({ budget_usd, power_bracket }));
  return DRIVERS[provider]({ systemContent: system, prompt, model, apiKey });
}
