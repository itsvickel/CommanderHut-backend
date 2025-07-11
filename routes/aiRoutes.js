import express from 'express';
import generateDeck from '../controllers/aiController.js';

const router = express.Router();

router.post('/deck', generateDeck);

export default router;
