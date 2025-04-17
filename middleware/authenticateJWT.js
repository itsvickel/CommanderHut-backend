const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-secret-key'; // Replace with your actual JWT secret key

// Middleware to protect routes
const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1]; // Get token from Authorization header (Bearer <token>)

  if (!token) {
    return res.status(403).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    req.user = user;  // Attach the decoded user data to the request object
    next(); // Allow the request to proceed to the next middleware or route handler
  });
};

module.exports = authenticateJWT;
