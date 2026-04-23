import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { callGemini } from './geminiClient.js';
import { parseGeminiResponse } from './parseResponse.js';
import { resolveCommander } from './resolveCommander.js';
import { resolveSignatures } from './resolveSignatures.js';
import { computeColorIdentity } from './colorIdentity.js';
import { filterByBracket } from './bracketFilter.js';
import { fillEngine } from './fillEngine.js';
import { cardRepo as defaultRepo } from './cardRepo.js';
import { createPreviewCache } from './previewCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameChangers = JSON.parse(
  readFileSync(path.join(__dirname, '../../data/gameChangers.json'), 'utf-8')
).cards;

const previewCache = createPreviewCache({ capacity: 500, ttlMs: 60 * 60 * 1000 });

export function getPreview(id) { return previewCache.get(id); }
export function deletePreview(id) { previewCache.delete(id); }

export async function generateDeck({ userId, prompt, budget_usd, power_bracket, cardRepo = defaultRepo }) {
  // 1. LLM call
  const { raw, model } = await callGemini({ prompt, budget_usd, power_bracket });
  console.log('[pipeline] raw LLM response:', raw);
  const parsed = parseGeminiResponse(raw);

  // 2. Commander
  const commander = await resolveCommander(parsed.commander, cardRepo);
  if (!commander) {
    const err = new Error(`Commander "${parsed.commander}" could not be resolved`);
    err.code = 'COMMANDER_UNRESOLVED';
    throw err;
  }

  // 3. Color identity (from the real card, not the LLM)
  const colorIdentity = computeColorIdentity(commander);

  // 4. Signatures
  let { resolved: signatures, dropped } = await resolveSignatures(
    parsed.signature_cards, colorIdentity, cardRepo
  );

  // 5. Bracket filter
  signatures = filterByBracket(signatures, power_bracket, gameChangers);

  // 6. Single retry if too many dropped
  if (dropped.length > 5) {
    const retryPrompt = `${prompt}\n\nDo not use these cards (they are unavailable or illegal for the color identity): ${dropped.join(', ')}`;
    const { raw: raw2 } = await callGemini({ prompt: retryPrompt, budget_usd, power_bracket });
    const parsed2 = parseGeminiResponse(raw2);
    ({ resolved: signatures, dropped } = await resolveSignatures(
      parsed2.signature_cards, colorIdentity, cardRepo
    ));
    signatures = filterByBracket(signatures, power_bracket, gameChangers);
  }

  // 7. Fill
  const commanderPrice = commander.prices?.usd ?? 0;
  const sigPrice = signatures.reduce((s, c) => s + (c.prices?.usd ?? 0), 0);
  const budgetRemaining = (budget_usd ?? Infinity) - commanderPrice - sigPrice;

  if (budget_usd != null && budgetRemaining < 0) {
    const err = new Error('Budget too low for even commander + signatures');
    err.code = 'BUDGET_TOO_LOW';
    err.suggested_min_budget_usd = Math.ceil(commanderPrice + sigPrice + 30);
    throw err;
  }

  const filled = await fillEngine({
    commander, signatures, colorIdentity, bracket: power_bracket,
    budgetRemaining, cardRepo, gameChangers, strategy: parsed.strategy,
  });

  // 8. Compose response
  const cards = filled.map(e => ({
    _id: e.card._id,
    name: e.card.name,
    quantity: e.quantity,
    role: e.role,
    image_uris: e.card.image_uris,
    prices: e.card.prices,
  }));
  const budget_total_usd = commanderPrice + cards.reduce(
    (s, c) => s + (c.prices?.usd ?? 0) * c.quantity, 0
  );

  const generation_id = crypto.randomUUID();
  previewCache.set(generation_id, {
    user_id: String(userId),
    commander,
    cards: filled,
    strategy: parsed.strategy,
    prompt,
    power_bracket,
    budget_usd,
    model,
    generated_at: new Date(),
  });

  return {
    generation_id,
    commander: {
      _id: commander._id,
      name: commander.name,
      image_uris: commander.image_uris,
    },
    cards,
    strategy: parsed.strategy,
    budget_total_usd: Math.round(budget_total_usd * 100) / 100,
  };
}
