import express from 'express';
import { generateDeckDeepSeek } from '../controllers/ai/deepseekAIController.js';
import { generateDeckGemini } from '../controllers/ai/geminiAIController.js';
import { generate, save } from '../controllers/ai/deckBuilderController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { dailyCap } from '../middleware/dailyCap.js';
import { aiLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/deepseek', aiLimiter, authMiddleware, dailyCap, generateDeckDeepSeek);
router.post('/gemini', aiLimiter, authMiddleware, dailyCap, generateDeckGemini);

router.post('/ai/deck/generate', aiLimiter, authMiddleware, dailyCap, generate);
router.post('/ai/generate', aiLimiter, authMiddleware, dailyCap, generate);
router.post('/ai/deck/save', authMiddleware, save);
router.post('/ai/save', authMiddleware, save);

export default router;
