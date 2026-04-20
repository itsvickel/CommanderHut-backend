import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import {
  getAllProfile,
  findProfile,
  addProfile,
  updateProfile,
} from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile', authenticateToken, getAllProfile);
router.get('/profile/:id', findProfile);

router.post('/profile', authenticateToken, addProfile);
router.put('/profile', authenticateToken, updateProfile);

export default router;
