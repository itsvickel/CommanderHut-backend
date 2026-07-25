import crypto from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { callLLM } from './llmClient.js';
import { parseLlmResponse } from './parseResponse.js';
import { resolveCommander } from './resolveCommander.js';
import { resolveSignatures } from './resolveSignatures.js';
import { computeColorIdentity } from './colorIdentity.js';
import { filterByBracket, gameChangerAllowance } from './bracketFilter.js';
import { fillEngine } from './fillEngine.js';
import { cardRepo as defaultRepo } from './cardRepo.js';
import { createPreviewCache } from './previewCache.js';
import * as defaultScryfall from '../scryfallService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameChangers = JSON.parse(
  readFileSync(path.join(__dirname, '../../data/gameChangers.json'), 'utf-8')
).cards;

const previewCache = createPreviewCache({ capacity: 500, ttlMs: 60 * 60 * 1000 });

export function getPreview(id) { return previewCache.get(id); }
export function deletePreview(id) { previewCache.delete(id); }

function noop() {}

export async function generateDeck({
  userId,
  prompt,
  budget_usd,
  power_bracket,
  cardRepo = defaultRepo,
  scryfallService = defaultScryfall,
  emit = noop,
}) {
  emit('progress', { stage: 'generating', message: 'Generating deck concept...' });

  // Aggregate token usage across every LLM call in this generation.
  const usage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };
  const trackUsage = (u) => {
    if (!u) return;
    usage.input_tokens += u.input_tokens ?? 0;
    usage.output_tokens += u.output_tokens ?? 0;
    usage.cost_usd += u.cost_usd ?? 0;
  };

  // ── 1. Initial LLM call ───────────────────────────────────────────────────
  const first = await callLLM({ prompt, budget_usd, power_bracket });
  trackUsage(first.usage);
  const llmModel = first.model;
  let parsed = parseLlmResponse(first.raw);

  // ── 2. Commander: validate on Scryfall with up to 2 retries ──────────────
  let commanderResult = null;
  let retryPrompt = prompt;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      emit('progress', { stage: 'generating', message: `Retrying commander selection (attempt ${attempt + 1})...` });
      const retry = await callLLM({ prompt: retryPrompt, budget_usd, power_bracket });
      trackUsage(retry.usage);
      parsed = parseLlmResponse(retry.raw);
    }

    emit('progress', { stage: 'validating_commander', message: `Validating commander: ${parsed.commander.name}...` });
    commanderResult = await resolveCommander(parsed.commander.name, cardRepo, scryfallService);

    if (commanderResult.card) {
      emit('progress', { stage: 'commander', message: `Commander confirmed: ${commanderResult.card.name}` });
      break;
    }

    retryPrompt = `${prompt}\n\n${commanderResult.reason}. Pick a different legendary creature or planeswalker that can be your commander. Must be legal in Commander format.`;
  }

  if (!commanderResult?.card) {
    const err = new Error('Could not find a valid commander for this theme after 3 attempts');
    err.code = 'COMMANDER_UNRESOLVED';
    throw err;
  }

  const commander = commanderResult.card;
  // Prefer the live Scryfall card — it always carries true color_identity.
  const colorIdentity = computeColorIdentity(commanderResult.scryfallCard ?? commander);

  // ── 3. Signatures: Scryfall batch validation ──────────────────────────────
  emit('progress', { stage: 'validating_cards', message: `Validating cards (0/${parsed.signature_cards.length})...` });

  let { resolved: signatures, dropped } = await resolveSignatures(
    parsed.signature_cards, colorIdentity, cardRepo, scryfallService
  );

  emit('progress', { stage: 'validating_cards', message: `Validated cards (${signatures.length}/${parsed.signature_cards.length} passed)` });

  // ── 4. Re-prompt if too many dropped ─────────────────────────────────────
  if (dropped.length > 5) {
    emit('progress', { stage: 'validating_cards', message: `${dropped.length} cards invalid — regenerating signature cards...` });
    const reprompt = `${prompt}\n\nDo not use these cards (they are unavailable or illegal): ${dropped.join(', ')}`;
    const second = await callLLM({ prompt: reprompt, budget_usd, power_bracket });
    trackUsage(second.usage);
    const parsed2 = parseLlmResponse(second.raw);
    ({ resolved: signatures, dropped } = await resolveSignatures(
      parsed2.signature_cards, colorIdentity, cardRepo, scryfallService
    ));
  }

  // ── 5. Bracket filter ─────────────────────────────────────────────────────
  // Deck-wide Game Changer allowance (bracket 3 permits up to 3) is spent by
  // the LLM's signature picks; the deterministic fill never adds Game Changers.
  const gcBudget = { remaining: gameChangerAllowance(power_bracket) };
  signatures = filterByBracket(signatures, power_bracket, gameChangers, gcBudget);

  // ── 6. Fill engine ────────────────────────────────────────────────────────
  emit('progress', { stage: 'filling', message: 'Filling remaining slots...' });

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

  emit('progress', { stage: 'finalising', message: 'Finalising deck...' });

  // ── 7. Compose result ─────────────────────────────────────────────────────
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

  usage.cost_usd = Math.round(usage.cost_usd * 1_000_000) / 1_000_000;

  const generation_id = crypto.randomUUID();
  previewCache.set(generation_id, {
    user_id: String(userId),
    commander,
    cards: filled,
    strategy: parsed.strategy,
    prompt,
    power_bracket,
    budget_usd,
    model: llmModel,
    usage,
    generated_at: new Date(),
  });

  return {
    generation_id,
    commander: {
      _id: commander._id,
      name: commander.name,
      image_uris: commander.image_uris,
      reason: parsed.commander.reason,
    },
    cards,
    strategy: parsed.strategy,
    themes: parsed.themes,
    budget_total_usd: Math.round(budget_total_usd * 100) / 100,
    usage,
  };
}
