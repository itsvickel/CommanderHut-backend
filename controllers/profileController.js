import { mongoose } from 'mongoose';
import Profile from '../models/Profile.js';
import User from '../models/User.js';

export async function addProfile(req, res){

    try{
        const { user_id } = req.body;

        // Validate inputs
        if(!user_id) {
            return res.status(400).json({ error: "Missing user_id" });
        }

        const user = await User.findById(user_id);
        if(!user){
            return res.status(404).json({ error: "User not found" });
        }
 
        const newProfile = await Profile.create({
            avatar_url: null,
            bio: "Write a nice bio here :) ...",
            website: null,
        
            user: user ? user._id : null,
            decks: [],
            followers: [],
            following: [],
            likes: [],

            last_active_at:  Date.now() ,
        })

        res.status(200).json({
            message: "Profile created with success",
            profile: newProfile
        })
    }
    catch{
        res.status(400).json({error: "Error: Could not create a profile"});
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
