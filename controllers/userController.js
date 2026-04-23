import bcrypt from 'bcrypt';
import User from '../models/User.js';

export async function addUser(req, res) {
  try {
    const { username, email_address, password } = req.body;

    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be 2–30 characters' });
    }

    const normalizedEmail = typeof email_address === 'string'
      ? email_address.trim().toLowerCase()
      : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email_address: normalizedEmail });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      _id: undefined,
      username: trimmedUsername,
      email_address: normalizedEmail,
      password: hashedPassword,
    });

    const safeUser = {
      id: user._id,
      username: user.username,
      email_address: user.email_address,
    };

    return res.status(201).json({ message: 'User created successfully', user: safeUser });
  } catch (error) {
    console.error('addUser error:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function findUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ user });
  } catch (error) {
    console.error('findUser error:', error);
    return res.status(500).json({ error: 'Failed to retrieve user' });
  }
}
