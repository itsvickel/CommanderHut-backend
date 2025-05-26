import bcrypt from 'bcrypt';
import User from '../models/User.js'; 
import jwt from 'jsonwebtoken';  // Import the jsonwebtoken library
 
async function addUser(req, res) {
    console.log(req.body);
    try {
        const { username, email_address, password, profile_picture, favorite_decks } = req.body;

        // Check if the email already exists
        const existingUser = await User.findOne({ where: { email_address } });

        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the user with optional fields for profile_picture and favorite_decks
        const user = await User.create({
            username,
            email_address,
            password: hashedPassword,
            profile_picture: profile_picture || null, // Optional field
            is_admin: false,                         // Default value for is_admin
            status: 'active',                        // Default value for status
        });

        res.status(201).json({ message: 'User created successfully', user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create user' });
    }
}

async function findUser(req, res) {
  try {
    const { id } = req.params;  // Extract the user ID from the URL parameter

    const user = await User.findByPk(id);  // Find user by primary key (ID)

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
}

export { addUser, findUser };
