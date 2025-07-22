import jwt from 'jsonwebtoken';

const checkAuth = (req, res) => {
  const token = req.cookies.token; // HttpOnly cookie

  if (!token) {
    return res.status(401).json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({
      isAuthenticated: true,
      user: {
        id: decoded.id,             // Mongo _id string stored here
        email_address: decoded.email_address,
        username: decoded.username,
      },
    });
  } catch (err) {
    return res.status(401).json({ isAuthenticated: false });
  }
};

export default checkAuth;
