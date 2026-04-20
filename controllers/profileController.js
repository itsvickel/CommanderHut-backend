import { mongoose } from 'mongoose';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

const ALLOWED_UPDATE_FIELDS = ['avatar_url', 'bio', 'website'];
const URL_REGEX = /^https?:\/\/[^\s]+$/i;

function pickAllowed(body) {
  const out = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

function validateProfileUpdate(fields) {
  if (fields.bio !== undefined) {
    if (typeof fields.bio !== 'string') return 'bio must be a string';
    if (fields.bio.length > 500) return 'bio must be 500 characters or fewer';
  }
  if (fields.website !== undefined && fields.website !== null && fields.website !== '') {
    if (typeof fields.website !== 'string' || !URL_REGEX.test(fields.website)) {
      return 'website must be a valid http(s) URL';
    }
  }
  if (fields.avatar_url !== undefined && fields.avatar_url !== null && fields.avatar_url !== '') {
    if (typeof fields.avatar_url !== 'string' || !URL_REGEX.test(fields.avatar_url)) {
      return 'avatar_url must be a valid http(s) URL';
    }
  }
  return null;
}

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

export async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const updates = pickAllowed(req.body);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const error = validateProfileUpdate(updates);
    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({ profile: updated });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
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
