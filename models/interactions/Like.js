import mongoose from 'mongoose';
import { v4 as uuidv4} from 'uuid';

const likeSchema = new mongoose.Schema({

    _id: { type: String, default: uuidv4 },
    user_id: { type: String, ref: "User", required: true },
    target_id: { type: String, required: true },
    target_type: {
        type: String,
        required: true,
        enum: ['Deck', 'Card', 'Profile', 'Comment' ]
    }
},
{
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

likeSchema.index({ user_id: 1, target_id: 1, target_type: 1 }, { unique: true });

export default mongoose.model('Like', likeSchema);