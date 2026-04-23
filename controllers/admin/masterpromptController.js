import MasterPrompt from '../../models/MasterPrompt.js';
import { invalidatePromptCache, OUTPUT_FORMAT } from '../../services/aiDeckBuilder/promptCache.js';

const DEFAULTS = {
  role_description: 'You are a Commander deck-building expert.',
  domain_restrictions:
    'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
  additional_rules: '',
  updated_at: null,
  updated_by: null,
};

export async function getMasterprompt(req, res) {
  try {
    const doc = await MasterPrompt.findOne().lean();
    return res.json({ ...(doc ?? DEFAULTS), output_format: OUTPUT_FORMAT });
  } catch (err) {
    console.error('getMasterprompt failed:', err);
    return res.status(500).json({ error: 'Failed to fetch masterprompt' });
  }
}

export async function updateMasterprompt(req, res) {
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

  const update = { updated_by: req.user.id };
  if (role_description != null) update.role_description = role_description;
  if (domain_restrictions != null) update.domain_restrictions = domain_restrictions;
  if (additional_rules != null) update.additional_rules = additional_rules;

  try {
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
