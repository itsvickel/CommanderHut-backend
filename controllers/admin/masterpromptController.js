import MasterPrompt from '../../models/MasterPrompt.js';
import { invalidatePromptCache, OUTPUT_FORMAT } from '../../services/aiDeckBuilder/promptCache.js';

const DEFAULTS = {
  role_description:
    'You are a Magic: The Gathering Commander deck-building assistant. Your only purpose is to build Commander decks. You have deep knowledge of MTG card interactions, synergies, mana curves, and competitive brackets.',
  domain_restrictions:
    'Only respond to Magic: The Gathering Commander deck-building requests. If the user asks about anything else — weather, sports, general knowledge, other games, or any non-MTG topic — respond with exactly: "I can only help with Magic: The Gathering Commander deck-building." Do not elaborate, apologize, or engage with the off-topic request.',
  additional_rules:
    'Card selection rules:\n- Use only exact, real Magic: The Gathering card names as they appear in official sets. Never invent, abbreviate, or paraphrase card names.\n- Every card must have a clear reason to be in the deck — synergy with the commander, the strategy, or another key piece.\n- Choose as many signature cards as the strategy requires. Prioritize quality and coherence over quantity.\n- Include a mix of roles appropriate to the strategy: ramp, card draw, removal, and win conditions. Do not over-index on any single role.\n- Respect the power bracket: do not include cards that exceed or fall far below the requested bracket level.',
};

export async function getMasterprompt(req, res) {
  try {
    const doc = await MasterPrompt.findOne().lean();
    const merged = {
      role_description: doc?.role_description || DEFAULTS.role_description,
      domain_restrictions: doc?.domain_restrictions || DEFAULTS.domain_restrictions,
      additional_rules: doc?.additional_rules ?? DEFAULTS.additional_rules,
    };
    return res.json({ ...merged, output_format: OUTPUT_FORMAT });
  } catch (err) {
    console.error('getMasterprompt failed:', err);
    return res.status(500).json({ error: 'Failed to fetch masterprompt' });
  }
}

export async function updateMasterprompt(req, res) {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });

  const { role_description, domain_restrictions, additional_rules } = req.body ?? {};

  if (role_description != null && typeof role_description !== 'string') {
    return res.status(400).json({ error: 'role_description must be a string' });
  }
  if (domain_restrictions != null && typeof domain_restrictions !== 'string') {
    return res.status(400).json({ error: 'domain_restrictions must be a string' });
  }
  if (additional_rules != null && typeof additional_rules !== 'string') {
    return res.status(400).json({ error: 'additional_rules must be a string' });
  }
  if (role_description != null && role_description.trim().length === 0) {
    return res.status(400).json({ error: 'role_description must not be empty' });
  }
  if (domain_restrictions != null && domain_restrictions.trim().length === 0) {
    return res.status(400).json({ error: 'domain_restrictions must not be empty' });
  }

  const update = { updated_by: req.user.id };
  if (role_description != null) update.role_description = role_description.trim();
  if (domain_restrictions != null) update.domain_restrictions = domain_restrictions.trim();
  if (additional_rules != null) update.additional_rules = additional_rules;

  try {
    const existing = await MasterPrompt.findOne().lean();
    if (!existing && (update.role_description == null || update.domain_restrictions == null)) {
      return res.status(400).json({
        error: 'role_description and domain_restrictions are required for initial setup',
      });
    }

    const doc = await MasterPrompt.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
    );
    invalidatePromptCache();
    return res.json({ ...doc, output_format: OUTPUT_FORMAT });
  } catch (err) {
    console.error('updateMasterprompt failed:', err);
    return res.status(500).json({ error: 'Failed to update masterprompt' });
  }
}
