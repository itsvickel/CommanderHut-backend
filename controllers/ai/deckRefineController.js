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

  const commanderEntry = deck.cards.find(e => e.card?.name === deck.commander);
  if (!commanderEntry) {
    return { error: { status: 422, message: 'Deck has no resolvable commander — cannot refine' } };
  }

  return {
    source: 'deck',
    commander: commanderEntry.card,
    deckCards: deck.cards.map(e => ({ card: e.card, quantity: e.quantity, role: '' })),
    power_bracket: deck.ai_metadata?.power_bracket ?? 2,
    budget_usd: deck.ai_metadata?.budget_usd ?? null,
    strategy: deck.ai_metadata?.prompt ?? '',
    themes: [],
  };
}

export async function refine(req, res) {
  const body = req.body ?? {};
  const errors = validateBody(body);
  if (errors.length) return res.status(400).json({ errors });

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

    // Apply the diff to the cached preview so a later save persists the
    // refined list. Saved decks are only changed once the user accepts.
    let generation_id = body.generation_id ?? null;
    if (loaded.source === 'preview') {
      const cutIds = new Set(diff.cuts.map(c => String(c._id)));
      const kept = loaded.preview.cards.filter(e => !cutIds.has(String(e.card._id)));
      const added = diff.adds.map(a => ({
        card: { _id: a._id, name: a.name, image_uris: a.image_uris, prices: a.prices, type_line: a.type_line },
        quantity: 1,
        role: a.role,
      }));
      await setPreview(generation_id, { ...loaded.preview, cards: [...kept, ...added] });
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
