import mongoose from 'mongoose';
import Deck from '../../models/Deck.js';
import { getPreview } from '../../services/aiDeckBuilder/pipeline.js';
import { analyzeDeck } from '../../services/aiDeckBuilder/analyzeDeck.js';
import { computeColorIdentity } from '../../services/aiDeckBuilder/colorIdentity.js';
import { cardRepo } from '../../services/aiDeckBuilder/cardRepo.js';
import { loadGameChangers } from '../../services/aiDeckBuilder/gameChangerList.js';
import { refundDailyUse, recordTokenUsage } from '../../middleware/dailyCap.js';
import { openSseStream } from '../../utils/sse.js';

/**
 * Loads the deck to analyse. Public decks are readable by anyone;
 * private decks only by their owner.
 */
async function loadSource({ generation_id, deck_id, userId }) {
  if (generation_id) {
    const preview = await getPreview(generation_id);
    if (!preview) return { error: { status: 410, message: 'generation expired, regenerate' } };
    if (preview.user_id !== String(userId)) {
      return { error: { status: 403, message: 'not your generation' } };
    }
    return {
      commander: preview.commander,
      entries: [
        { card: preview.commander, quantity: 1 },
        ...preview.cards.map(e => ({ card: e.card, quantity: e.quantity })),
      ],
      strategy: preview.strategy ?? '',
      themes: preview.themes ?? [],
    };
  }

  if (!mongoose.Types.ObjectId.isValid(deck_id)) {
    return { error: { status: 400, message: 'Invalid deck ID' } };
  }
  const deck = await Deck.findById(deck_id).populate('cards.card');
  if (!deck) return { error: { status: 404, message: 'Deck not found' } };
  if (!deck.is_public && String(deck.owner) !== String(userId)) {
    return { error: { status: 403, message: 'not your deck' } };
  }

  const entries = deck.cards
    .filter(e => e.card)
    .map(e => ({ card: e.card, quantity: e.quantity }));
  if (!entries.length) {
    return { error: { status: 422, message: 'Deck has no resolvable cards — cannot analyse' } };
  }

  const commanderEntry = entries.find(e => e.card.name === deck.commander);
  return {
    commander: commanderEntry?.card ?? null,
    entries,
    strategy: deck.ai_metadata?.prompt ?? '',
    themes: [],
  };
}

export async function analyze(req, res) {
  const { generation_id, deck_id } = req.body ?? {};
  if (!generation_id && !deck_id) {
    return res.status(400).json({ error: 'generation_id or deck_id required' });
  }

  const loaded = await loadSource({ generation_id, deck_id, userId: req.user.id });
  if (loaded.error) {
    await refundDailyUse(req.user.id);
    return res.status(loaded.error.status).json({ error: loaded.error.message });
  }
  if (!loaded.commander) {
    await refundDailyUse(req.user.id);
    return res.status(422).json({ error: 'Deck has no resolvable commander — cannot analyse' });
  }

  const { emit, isClientGone, end } = openSseStream(req, res);

  try {
    const result = await analyzeDeck({
      commander: loaded.commander,
      colorIdentity: computeColorIdentity(loaded.commander),
      entries: loaded.entries,
      strategy: loaded.strategy,
      themes: loaded.themes,
      cardRepo,
      gameChangers: loadGameChangers(),
      emit,
    });

    await recordTokenUsage(req.user.id, result.usage);

    if (!isClientGone()) {
      emit('result', {
        deck_id: deck_id ?? null,
        generation_id: generation_id ?? null,
        stats: result.stats,
        observations: result.observations,
        verdict: result.verdict,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        suggestions: result.suggestions,
      });
      end();
    }
  } catch (err) {
    await refundDailyUse(req.user.id);
    if (isClientGone()) return;
    console.error('deck analyze failed:', err);
    emit('error', { stage: 'critique', message: 'AI provider error — please try again' });
    end();
  }
}
