import express from 'express';
import { addUser, findUser } from '../controllers/userController.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/user', authLimiter, addUser);
router.post('/user/:id', findUser);

export default router;
