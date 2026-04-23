import mongoose from 'mongoose';

const masterPromptSchema = new mongoose.Schema({
  role_description: { type: String, required: true },
  domain_restrictions: { type: String, required: true },
  additional_rules: { type: String, default: '' },
  updated_by: { type: String, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('MasterPrompt', masterPromptSchema);
