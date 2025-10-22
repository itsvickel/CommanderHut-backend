import express from "express";
import { generateDeckDeepSeek } from "../controllers/ai/deepseekAIController.js";
import { generateDeckGemini } from "../controllers/ai/geminiAIController.js";

const router = express.Router();

// Route for DeepSeek
router.post("/deepseek", generateDeckDeepSeek);

// Route for Gemini
router.post("/gemini", generateDeckGemini);

export default router;
