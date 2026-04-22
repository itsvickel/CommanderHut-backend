import mongoose from 'mongoose';
import { v4 as uuidv4} from 'uuid';

const likeSchema = new mongoose.Schema({

    _id: { type: String, default: uuidv4 },
    user_id: { type: String, ref: "User", require }, // User that liked it
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

export default mongoose.model('Like', likeSchema);