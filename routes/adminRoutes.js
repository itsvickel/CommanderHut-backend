import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { getMasterprompt, updateMasterprompt } from '../controllers/admin/masterpromptController.js';

const router = Router();

router.get('/admin/masterprompt', authMiddleware, adminMiddleware, getMasterprompt);
router.put('/admin/masterprompt', authMiddleware, adminMiddleware, updateMasterprompt);

export default router;
