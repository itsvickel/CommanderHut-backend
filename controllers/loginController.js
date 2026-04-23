import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  };
}

export const loginUser = async (req, res) => {
  try {
    const { email_address, password } = req.body;

    if (
      typeof email_address !== 'string' || !email_address.trim() ||
      typeof password !== 'string' || !password
    ) {
      return res.status(400).json({ error: 'email_address and password are required' });
    }

    const user = await User.findOne({ email_address });
    const isValidPassword = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email_address: user.email_address, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email_address: user.email_address,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
};

export const logoutUser = (req, res) => {
  const { maxAge: _omit, ...clearOptions } = getCookieOptions();
  res.clearCookie('token', clearOptions);
  return res.status(200).json({ message: 'Logged out successfully' });
};
