import Deck from '../../models/Deck.js';
import { generateDeck, getPreview, deletePreview } from '../../services/aiDeckBuilder/pipeline.js';
import { refundDailyUse, recordTokenUsage } from '../../middleware/dailyCap.js';
import { openSseStream } from '../../utils/sse.js';

function validateGenerateBody(body) {
  const errors = [];
  if (body.format !== 'Commander') errors.push('format must be "Commander"');
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) errors.push('prompt required');
  if (body.prompt && body.prompt.length > 2000) errors.push('prompt max 2000 chars');
  if (body.budget_usd != null) {
    if (!Number.isInteger(body.budget_usd) || body.budget_usd < 20 || body.budget_usd > 10000) {
      errors.push('budget_usd must be 20-10000');
    }
  }
  const bracket = body.power_bracket ?? 2;
  if (!Number.isInteger(bracket) || bracket < 1 || bracket > 5) errors.push('power_bracket 1-5');
  return { errors, bracket };
}

export async function generate(req, res) {
  const { errors, bracket } = validateGenerateBody(req.body ?? {});
  if (errors.length) {
    // dailyCap already charged this request; a malformed body costs nothing.
    await refundDailyUse(req.user.id);
    return res.status(400).json({ errors });
  }

  const { emit, isClientGone, end } = openSseStream(req, res);

  try {
    const result = await generateDeck({
      userId: req.user.id,
      prompt: req.body.prompt.trim(),
      budget_usd: req.body.budget_usd ?? null,
      power_bracket: bracket,
      emit,
    });

    await recordTokenUsage(req.user.id, result.usage);

    if (!isClientGone()) {
      emit('result', result);
      end();
    }
  } catch (err) {
    // BUDGET_TOO_LOW is raised after the LLM work is already paid for, so it
    // keeps its quota charge; other failures are refunded.
    if (err.code === 'BUDGET_TOO_LOW') {
      await recordTokenUsage(req.user.id, err.usage);
    } else {
      await refundDailyUse(req.user.id);
    }
    if (isClientGone()) return;

    if (err.code === 'COMMANDER_UNRESOLVED') {
      emit('error', { stage: 'validating_commander', message: err.message });
    } else if (err.code === 'BUDGET_TOO_LOW') {
      emit('error', { stage: 'filling', message: err.message, suggested_min_budget_usd: err.suggested_min_budget_usd });
    } else {
      console.error('deck generate failed:', err);
      emit('error', { stage: 'generating', message: 'AI provider error — please try again' });
    }
    end();
  }
}

export async function save(req, res) {
  const { generation_id, deck_name, is_public, tags } = req.body ?? {};
  if (!generation_id || !deck_name) {
    return res.status(400).json({ error: 'generation_id and deck_name required' });
  }

  const preview = await getPreview(generation_id);
  if (!preview) return res.status(410).json({ error: 'generation expired, regenerate' });
  if (preview.user_id !== String(req.user.id)) {
    return res.status(403).json({ error: 'not your generation' });
  }

  try {
    const deck = await Deck.create({
      deck_name: String(deck_name).trim().slice(0, 200),
      format: 'Commander',
      commander: preview.commander.name,
      commander_image: preview.commander.image_uris?.normal ?? null,
      owner: req.user.id,
      tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 50)) : [],
      is_public: !!is_public,
      source: 'ai',
      ai_metadata: {
        prompt: preview.prompt,
        power_bracket: preview.power_bracket,
        budget_usd: preview.budget_usd,
        model: preview.model,
        usage: preview.usage ?? null,
        generated_at: preview.generated_at,
      },
      // The commander is stored as a card entry too, so the saved deck is a
      // complete 100 and refine/analyze can resolve it from the list.
      cards: [
        { card: preview.commander._id, quantity: 1 },
        ...preview.cards.map(e => ({
          card: e.card._id,
          quantity: e.quantity,
        })),
      ],
    });

    await deletePreview(generation_id);
    return res.status(201).json({ deck });
  } catch (err) {
    console.error('deck save failed:', err);
    return res.status(500).json({ error: 'Failed to save deck' });
  }
}
