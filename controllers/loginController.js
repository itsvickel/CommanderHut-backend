const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { User } = require('../models');
 
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// The login function
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
      { id: user.id, email_address: user.email_address, username: user.username },
      JWT_SECRET, // Secret key to sign the token
      { expiresIn: '1h' } // Token expiration time (TTL)
    );

    // Set JWT token in HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true, // Ensures the cookie is inaccessible to JavaScript
      // secure: process.env.NODE_ENV === 'production',
      secure: process.env.NODE_ENV === 'development', // Use secure cookies in production || switch to prod for production
      sameSite: 'Strict', // Helps prevent CSRF attacks 
      maxAge: 3600 * 1000, // 1 hour expiration
    });

    // Send success response without sending the token in the body
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email_address: user.email_address,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
}

function logoutUser(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    // secure: process.env.NODE_ENV === 'production',
    secure: process.env.NODE_ENV === 'development',
    sameSite: 'Strict',
    path: '/', // Ensure the path matches the one used when setting the cookie
  });

  return res.status(200).json({ message: 'Logged out successfully' });
}
module.exports = { loginUser, logoutUser };
