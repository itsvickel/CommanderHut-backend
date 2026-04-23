import User from '../models/User.js';

export default async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    next();
  } catch {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
