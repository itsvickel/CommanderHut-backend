import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
  scryfallId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  mana_cost: String,
  type_line: String,
  oracle_text: String,
  colors: [String],
  // True color identity (cost + rules text), synced from Scryfall.
  color_identity: { type: [String], default: undefined },
  // Popularity rank on EDHREC (lower = more played); null for unranked cards.
  edhrec_rank: { type: Number, default: null },
  // On the official Commander Game Changers list (Scryfall is:gamechanger).
  game_changer: { type: Boolean, default: false },
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
