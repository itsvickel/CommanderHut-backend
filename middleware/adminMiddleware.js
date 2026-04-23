import User from '../models/User.js';

export default async function adminMiddleware(req, res, next) {
  if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    next();
  } catch (err) {
    console.error('adminMiddleware DB error:', err);
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
