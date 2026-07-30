import express from 'express';
import { addUser, findUser } from '../controllers/userController.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/user', authLimiter, addUser);
router.get('/user/:id', authMiddleware, findUser);

export default router;
