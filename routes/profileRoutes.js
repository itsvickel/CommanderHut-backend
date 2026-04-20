import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import { getAllProfile, findProfile, addProfile } from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile', getAllProfile);
router.get('/profile/:id', findProfile);

router.post('/profile', authenticateToken, addProfile);

export default router;
