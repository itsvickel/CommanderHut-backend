import mongoose from 'mongoose';

const deckCardSchema = new mongoose.Schema({
  deck: { type: mongoose.Schema.Types.ObjectId, ref: 'Deck', required: true },
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true },
  quantity: { type: Number, default: 1 },
}, { timestamps: false });

export default mongoose.model('DeckCard', deckCardSchema);
