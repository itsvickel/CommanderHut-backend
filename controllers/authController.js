const jwt = require('jsonwebtoken');

const checkAuth = (req, res) => {
  const token = req.cookies.token; // Access the HttpOnly cookie

  if (!token) {
    return res.status(401).json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({
      isAuthenticated: true,
      user: {
        id: decoded.id,
        email_address: decoded.email_address,
        username: decoded.username
      }
    });
  } catch (err) {
    return res.status(401).json({ isAuthenticated: false });
  }
};

module.exports = { checkAuth };
