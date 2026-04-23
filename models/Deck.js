import mongoose from 'mongoose';

const deckCardSubSchema = new mongoose.Schema({
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const deckSchema = new mongoose.Schema({
  deck_name: { type: String, required: true },
  format: { type: String, enum: ['Commander', 'Standard', 'Modern'], required: true },
  commander: { type: String },
  commander_image: { type: String },  // <-- new field for commander image URL
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tags: { type: [String], default: [] },
  is_public: { type: Boolean, default: false },
  cards: [deckCardSubSchema], // Embedded cards array

  likes_count: { type: Number, default: 0 },
  source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
  ai_metadata: {
    prompt: String,
    power_bracket: Number,
    budget_usd: Number,
    model: String,
    generated_at: Date,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('Deck', deckSchema);
