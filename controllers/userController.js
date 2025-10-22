import bcrypt from 'bcrypt';
import User from '../models/User.js';

export async function addUser(req, res) {
  try {
    const { username, email_address, password } = req.body;

    const existing = await User.findOne({ email_address });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      _id: undefined, // Let Mongo use UUID or default _id
      username,
      email_address,
      password: hashedPassword,
    });

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

export async function findUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
}
