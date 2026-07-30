import mongoose from 'mongoose';

/**
 * Generated decks awaiting save. Persisted (rather than in-memory) so
 * previews survive restarts and are shared across instances. Mongo's TTL
 * monitor expires them an hour after creation.
 */
const generationPreviewSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // generation_id (uuid)
  user_id: { type: String, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

generationPreviewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });

export default mongoose.model('GenerationPreview', generationPreviewSchema);
