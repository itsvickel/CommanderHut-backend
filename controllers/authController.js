import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const checkAuth = async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const dbUser = await User.findById(decoded.id).select('is_admin').lean();
    return res.status(200).json({
      isAuthenticated: true,
      user: {
        id: decoded.id,
        email_address: decoded.email_address,
        username: decoded.username,
        is_admin: dbUser?.is_admin ?? false,
      },
    });
  } catch (err) {
    return res.status(401).json({ isAuthenticated: false });
  }
};

export default checkAuth;
