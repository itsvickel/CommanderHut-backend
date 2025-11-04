import express from 'express';
import { getAllProfile, findProfile, addProfile } from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile', getAllProfile);
router.get('/profile/:id', findProfile);

router.post('/profile', addProfile);

export default router;
