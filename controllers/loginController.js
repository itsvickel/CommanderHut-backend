import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 3600 * 1000,
    path: '/',
  };
}

export const loginUser = async (req, res) => {
  try {
    const { email_address, password } = req.body;

    const user = await User.findOne({ email_address });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email_address: user.email_address, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
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
