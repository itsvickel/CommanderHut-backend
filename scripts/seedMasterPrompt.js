import mongoose from 'mongoose';
import dotenv from 'dotenv';
import MasterPrompt from '../models/MasterPrompt.js';

dotenv.config();

const NEW_PROMPT = {
  role_description:
    'You are a Magic: The Gathering Commander deck-building assistant. Your only purpose is to build Commander decks. You have deep knowledge of MTG card interactions, synergies, mana curves, and competitive brackets.',
  domain_restrictions:
    'Only respond to Magic: The Gathering Commander deck-building requests. If the user asks about anything else — weather, sports, general knowledge, other games, or any non-MTG topic — respond with exactly: "I can only help with Magic: The Gathering Commander deck-building." Do not elaborate, apologize, or engage with the off-topic request.',
  additional_rules:
    'Card selection rules:\n- Use only exact, real Magic: The Gathering card names as they appear in official sets. Never invent, abbreviate, or paraphrase card names.\n- Every card must have a clear reason to be in the deck — synergy with the commander, the strategy, or another key piece.\n- Choose as many signature cards as the strategy requires. Prioritize quality and coherence over quantity.\n- Include a mix of roles appropriate to the strategy: ramp, card draw, removal, and win conditions. Do not over-index on any single role.\n- Respect the power bracket: do not include cards that exceed or fall far below the requested bracket level.',
};

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const result = await MasterPrompt.findOneAndUpdate(
    {},
    {
      $set: {
        ...NEW_PROMPT,
        updated_by: 'seed-script',
        updated_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  console.log('Master prompt seeded successfully. Document ID:', result._id);
  console.log('role_description:', result.role_description.slice(0, 60) + '...');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
