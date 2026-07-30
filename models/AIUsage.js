import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  user: { type: String, ref: 'User', required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD" in UTC
  count: { type: Number, default: 0 },
  // Cumulative LLM token usage / estimated cost for the day.
  input_tokens: { type: Number, default: 0 },
  output_tokens: { type: Number, default: 0 },
  cost_usd: { type: Number, default: 0 },
}, { timestamps: true });

aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('AIUsage', aiUsageSchema);
