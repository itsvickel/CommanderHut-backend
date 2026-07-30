import MasterPrompt from '../models/MasterPrompt.js';

// Seed MasterPrompt with defaults if it doesn't exist
export async function seedMasterPrompt() {
  const existing = await MasterPrompt.findOne();
  if (!existing) {
    await MasterPrompt.create({
      role_description: 'You are a Commander deck-building expert.',
      domain_restrictions:
        'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
      additional_rules: '',
    });
    console.log('MasterPrompt seeded with defaults');
  }
}
