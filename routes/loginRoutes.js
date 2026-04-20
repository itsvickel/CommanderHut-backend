import express from 'express';
import { loginUser, logoutUser } from '../controllers/loginController.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/login', authLimiter, loginUser);
router.post('/logout', logoutUser);

export default router;
