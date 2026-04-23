import express from 'express';
import { generateDeckDeepSeek } from '../controllers/ai/deepseekAIController.js';
import { generateDeckGemini } from '../controllers/ai/geminiAIController.js';
import { generate, save } from '../controllers/ai/deckBuilderController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { dailyCap } from '../middleware/dailyCap.js';

const router = express.Router();

router.post('/deepseek', authMiddleware, dailyCap, generateDeckDeepSeek);
router.post('/gemini', authMiddleware, dailyCap, generateDeckGemini);

router.post('/ai/deck/generate', authMiddleware, dailyCap, generate);
router.post('/ai/generate', authMiddleware, dailyCap, generate);
router.post('/ai/deck/save', authMiddleware, save);
router.post('/ai/save', authMiddleware, save);

export default router;
