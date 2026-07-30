import jwt from 'jsonwebtoken';

// Like authMiddleware, but never rejects: sets req.user when a valid
// token cookie is present, otherwise leaves it undefined.
export default function optionalAuth(req, _res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // invalid/expired token — treat as anonymous
    }
  }
  next();
}
