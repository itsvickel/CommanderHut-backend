import mongoose from 'mongoose';
import { v4 as uuidv4} from 'uuid'

const profileSchema = new mongoose.Schema({
    _id: { type: String, default: uuidv4},
    
    avatar_url: {type: String},
    bio: {type: String, maxLength: 500},
    website: { type: String},

    user: { type: String, ref: 'User'},
    decks: [{ type: String, ref: 'Deck' }],
    followers: [{ type: String, ref:'User' }],
    following: [{ type: String, ref:'User' }],
    likes: [{ type:String, ref: 'Like' }],

    last_active_at: { type: Date, default: Date.now },
},
{
    _id: false,
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

export default mongoose.model('Profile', profileSchema);
