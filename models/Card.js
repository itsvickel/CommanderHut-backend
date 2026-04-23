import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
  scryfallId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  mana_cost: String,
  type_line: String,
  oracle_text: String,
  colors: [String],
  set: String,
  set_name: String,
  collector_number: String,
  artist: String,
  released_at: Date,
  image_uris: mongoose.Schema.Types.Mixed, // Accepts any JSON
  legalities: mongoose.Schema.Types.Mixed,
  layout: String,
  cmc: { type: Number, default: null },
  prices: {
    usd: { type: Number, default: null },
    usd_foil: { type: Number, default: null },
  },
}, {
  timestamps: true // createdAt and updatedAt
});

export default mongoose.model('Card', cardSchema);
