import mongoose from 'mongoose';
import Deck from '../../models/Deck.js';
import { getPreview, setPreview } from '../../services/aiDeckBuilder/pipeline.js';
import { refineDeck } from '../../services/aiDeckBuilder/refineDeck.js';
import { computeColorIdentity } from '../../services/aiDeckBuilder/colorIdentity.js';
import { cardRepo } from '../../services/aiDeckBuilder/cardRepo.js';
import { loadGameChangers } from '../../services/aiDeckBuilder/gameChangerList.js';
import { refundDailyUse, recordTokenUsage } from '../../middleware/dailyCap.js';
import { openSseStream } from '../../utils/sse.js';

const MAX_INSTRUCTION_LENGTH = 500;

function validateBody(body) {
  const errors = [];
  const { instruction, generation_id, deck_id } = body;
  if (typeof instruction !== 'string' || !instruction.trim()) errors.push('instruction required');
  if (instruction && instruction.length > MAX_INSTRUCTION_LENGTH) {
    errors.push(`instruction max ${MAX_INSTRUCTION_LENGTH} chars`);
  }
  if (!generation_id && !deck_id) errors.push('generation_id or deck_id required');
  return errors;
}

/** Loads the deck to refine from an in-flight generation or a saved deck. */
async function loadSource({ generation_id, deck_id, userId }) {
  if (generation_id) {
    const preview = await getPreview(generation_id);
    if (!preview) return { error: { status: 410, message: 'generation expired, regenerate' } };
    if (preview.user_id !== String(userId)) {
      return { error: { status: 403, message: 'not your generation' } };
    }
    return {
      source: 'preview',
      commander: preview.commander,
      deckCards: preview.cards,
      power_bracket: preview.power_bracket,
      budget_usd: preview.budget_usd,
      strategy: preview.strategy,
      themes: preview.themes ?? [],
      preview,
    };
  }

  if (!mongoose.Types.ObjectId.isValid(deck_id)) {
    return { error: { status: 400, message: 'Invalid deck ID' } };
  }
  const deck = await Deck.findById(deck_id).populate('cards.card');
  if (!deck) return { error: { status: 404, message: 'Deck not found' } };
  if (String(deck.owner) !== String(userId)) {
    return { error: { status: 403, message: 'not your deck' } };
  }

  // Skip entries whose card ref no longer resolves (deleted during a re-sync).
  const entries = deck.cards.filter(e => e.card);
  const commanderEntry = entries.find(e => e.card.name === deck.commander);
  if (!commanderEntry) {
    return { error: { status: 422, message: 'Deck has no resolvable commander — cannot refine' } };
  }

  return {
    source: 'deck',
    commander: commanderEntry.card,
    deckCards: entries.map(e => ({ card: e.card, quantity: e.quantity, role: '' })),
    power_bracket: deck.ai_metadata?.power_bracket ?? 2,
    budget_usd: deck.ai_metadata?.budget_usd ?? null,
    strategy: deck.ai_metadata?.prompt ?? '',
    themes: [],
  };
}

/**
 * Applies the diff staged by the last refine. Separate from `refine` so the
 * user's accept/discard decision — not the AI call — is what changes the deck.
 * No LLM involved, so no rate limit or quota.
 */
export async function acceptRefinement(req, res) {
  const { generation_id } = req.body ?? {};
  if (!generation_id) return res.status(400).json({ error: 'generation_id required' });

  const preview = await getPreview(generation_id);
  if (!preview) return res.status(410).json({ error: 'generation expired, regenerate' });
  if (preview.user_id !== String(req.user.id)) {
    return res.status(403).json({ error: 'not your generation' });
  }
  if (!preview.pending_diff) {
    return res.status(409).json({ error: 'no pending changes to apply' });
  }

  const { adds, cuts } = preview.pending_diff;
  const cutIds = new Set(cuts.map(c => String(c._id)));
  const kept = preview.cards.filter(e => !cutIds.has(String(e.card._id)));
  const added = adds.map(a => ({
    card: {
      _id: a._id,
      name: a.name,
      type_line: a.type_line,
      oracle_text: a.oracle_text ?? null,
      cmc: a.cmc ?? null,
      mana_cost: a.mana_cost ?? null,
      color_identity: a.color_identity ?? [],
      image_uris: a.image_uris,
      prices: a.prices,
    },
    quantity: 1,
    role: a.role,
  }));

  const updated = { ...preview, cards: [...kept, ...added] };
  delete updated.pending_diff;
  await setPreview(generation_id, updated);

  return res.status(200).json({
    generation_id,
    applied: { adds: adds.length, cuts: cuts.length },
    deck_size: updated.cards.reduce((s, e) => s + e.quantity, 0) + 1,
  });
}

export async function refine(req, res) {
  const body = req.body ?? {};
  const errors = validateBody(body);
  if (errors.length) {
    await refundDailyUse(req.user.id);
    return res.status(400).json({ errors });
  }

  const loaded = await loadSource({
    generation_id: body.generation_id,
    deck_id: body.deck_id,
    userId: req.user.id,
  });
  if (loaded.error) {
    await refundDailyUse(req.user.id);
    return res.status(loaded.error.status).json({ error: loaded.error.message });
  }

  const { emit, isClientGone, end } = openSseStream(req, res);

  try {
    const gameChangers = loadGameChangers();
    const colorIdentity = computeColorIdentity(loaded.commander);

    const diff = await refineDeck({
      commander: loaded.commander,
      colorIdentity,
      deckCards: loaded.deckCards,
      instruction: body.instruction.trim(),
      themes: loaded.themes,
      strategy: loaded.strategy,
      power_bracket: loaded.power_bracket,
      budget_usd: loaded.budget_usd,
      cardRepo,
      gameChangers,
      emit,
    });

    await recordTokenUsage(req.user.id, diff.usage);

    // Stage the diff on the preview without changing its card list — the deck
    // only changes when the user accepts (POST /ai/deck/refine/accept). A new
    // refine replaces any previously staged diff.
    const generation_id = body.generation_id ?? null;
    if (loaded.source === 'preview') {
      await setPreview(generation_id, {
        ...loaded.preview,
        pending_diff: { adds: diff.adds, cuts: diff.cuts },
      });
    }

    if (!isClientGone()) {
      emit('result', {
        generation_id,
        deck_id: body.deck_id ?? null,
        adds: diff.adds,
        cuts: diff.cuts,
        summary: diff.summary,
        usage: diff.usage,
      });
      end();
    }
  } catch (err) {
    await refundDailyUse(req.user.id);
    if (isClientGone()) return;

    if (err.code === 'NO_VALID_CHANGES' || err.code === 'NO_CANDIDATES') {
      emit('error', { stage: 'refining', message: err.message });
    } else {
      console.error('deck refine failed:', err);
      emit('error', { stage: 'refining', message: 'AI provider error — please try again' });
    }
    end();
  }
}
