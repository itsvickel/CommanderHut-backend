import Deck from '../../models/Deck.js';
import { generateDeck, getPreview, deletePreview } from '../../services/aiDeckBuilder/pipeline.js';

function validateGenerateBody(body) {
  const errors = [];
  if (body.format !== 'Commander') errors.push('format must be "Commander"');
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) errors.push('prompt required');
  if (body.prompt && body.prompt.length > 500) errors.push('prompt max 500 chars');
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

  try {
    const preview = await generateDeck({
      userId: req.user.id,
      prompt: req.body.prompt.trim(),
      budget_usd: req.body.budget_usd ?? null,
      power_bracket: bracket,
    });
    return res.json(preview);
  } catch (err) {
    if (err.code === 'COMMANDER_UNRESOLVED') {
      return res.status(422).json({ error: err.message });
    }
    if (err.code === 'BUDGET_TOO_LOW') {
      return res.status(422).json({
        error: err.message,
        suggested_min_budget_usd: err.suggested_min_budget_usd,
      });
    }
    console.error('deck generate failed:', err);
    return res.status(502).json({ error: 'AI provider error' });
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
