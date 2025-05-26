// authRoutes.js
import express from 'express'; 
import checkAuth from '../controllers/authController.js';

const router = express.Router();
router.get('/me', checkAuth);

export default router;
