const bcrypt = require('bcrypt');
const User = require('../models/User'); 
const jwt = require('jsonwebtoken');  // Import the jsonwebtoken library

const JWT_SECRET = process.env.JWT_TOKEN; // Replace with a strong secret key for JWT

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

async function loginUser(req, res) {
  try {
    const { email_address, password } = req.body;

    // Find the user by email address
    const user = await User.findOne({ where: { email_address } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the password is correct using bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create a JWT token (set TTL to 1 hour)
    const token = jwt.sign(
      { id: user.id, email_address: user.email_address, username: user.username }, // Payload
      JWT_SECRET, // Secret key to sign the token
      { expiresIn: '1h' } // Token expiration time (TTL)
    );

    // Send the token and user data back
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email_address: user.email_address,
      },
      token, // Send the token to the frontend
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
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

module.exports = { loginUser, addUser, findUser }; 
