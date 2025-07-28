import express from 'express';
import { 
  generateMTGIdea
} from '../controllers/geminiAIController.js';

const router = express.Router(); 
router.post('/ai', generateMTGIdea);

export default router; 