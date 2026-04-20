import { mongoose } from 'mongoose';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

export async function addProfile(req, res) {
  try {
    const userId = req.user.id;

    const existing = await Profile.findOne({ user: userId });
    if (existing) {
      return res.status(409).json({ error: 'Profile already exists for this user' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newProfile = await Profile.create({
      avatar_url: null,
      bio: 'Write a nice bio here :) ...',
      website: null,
      user: user._id,
      decks: [],
      followers: [],
      following: [],
      likes: [],
      last_active_at: Date.now(),
    });

    return res.status(201).json({
      message: 'Profile created with success',
      profile: newProfile,
    });
  } catch (err) {
    console.error('addProfile error:', err);
    return res.status(500).json({ error: 'Could not create a profile' });
  }
}

export async function updateProfile(req,res){

}

export async function getAllProfile(req, res){
    try{
        const profiles = await Profile.find();

        if(profiles){
            return res.status(200).json({ profiles })
        }
        else{
            res.status(404).json({ error: 'Failed to find all Profile' })
        }
    }
    catch{
        res.status(500).json({ error: ' Failed to get all profiles' });
    }
}

export async function findProfile(req, res){
    try{
        const { id } = req.params;
    
        const profile = await Profile.findOne({user: id});
    
        if(!profile) return res.status(404).json({ error: 'Profile not found' });
        res.status(200).json({ profile });
    
    }
    catch{
        res.status(500).json({ error: 'Failed to retrieve user' });
    }
}
