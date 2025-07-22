import mongoose from 'mongoose';

const deckCardSubSchema = new mongoose.Schema({
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  quantity: { type: Number, default: 1 },
}, { _id: false });

const deckSchema = new mongoose.Schema({
  deck_name: { type: String, required: true },
  format: { type: String, enum: ['Commander', 'Standard', 'Modern'], required: true },
  commander: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  owner_email: { type: String },
  tags: { type: [String], default: [] },
  is_public: { type: Boolean, default: false },
  cards: [deckCardSubSchema], // Embedded cards array
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('Deck', deckSchema);
