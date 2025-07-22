import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
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
}, {
  timestamps: true // createdAt and updatedAt
});

export default mongoose.model('Card', cardSchema);
