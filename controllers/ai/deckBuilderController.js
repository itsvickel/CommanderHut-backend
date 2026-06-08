import Deck from '../../models/Deck.js';
import { generateDeck, getPreview, deletePreview } from '../../services/aiDeckBuilder/pipeline.js';

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
  if (errors.length) return res.status(400).json({ errors });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;
  req.on('close', () => { clientGone = true; });

  try {
    const result = await generateDeck({
      userId: req.user.id,
      prompt: req.body.prompt.trim(),
      budget_usd: req.body.budget_usd ?? null,
      power_bracket: bracket,
      emit,
    });

    if (!clientGone) {
      emit('result', result);
      res.end();
    }
  } catch (err) {
    if (clientGone) return;

    if (err.code === 'COMMANDER_UNRESOLVED') {
      emit('error', { stage: 'validating_commander', message: err.message });
    } else if (err.code === 'BUDGET_TOO_LOW') {
      emit('error', { stage: 'filling', message: err.message, suggested_min_budget_usd: err.suggested_min_budget_usd });
    } else {
      console.error('deck generate failed:', err);
      emit('error', { stage: 'generating', message: 'AI provider error — please try again' });
    }
    res.end();
  }
}

export async function save(req, res) {
  const { generation_id, deck_name, is_public, tags } = req.body ?? {};
  if (!generation_id || !deck_name) {
    return res.status(400).json({ error: 'generation_id and deck_name required' });
  }

  const preview = getPreview(generation_id);
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
        generated_at: preview.generated_at,
      },
      cards: preview.cards.map(e => ({
        card: e.card._id,
        quantity: e.quantity,
      })),
    });

    deletePreview(generation_id);
    return res.status(201).json({ deck });
  } catch (err) {
    console.error('deck save failed:', err);
    return res.status(500).json({ error: 'Failed to save deck' });
  }
}
