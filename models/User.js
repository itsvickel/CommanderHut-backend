import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 }, // Use UUID instead of default ObjectId
  username: { type: String, required: true },
  email_address: { type: String, required: true, unique: true },
  password: { type: String, required: true },
}, {
  _id: false,
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('User', userSchema);
