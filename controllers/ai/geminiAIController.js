// services/geminiAI.js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Generates MTG-related AI content based on user prompt.
 * @param {string} prompt - The user's request.
 * @returns {string} AI-generated MTG response.
 */
export async function generateDeckGemini(req, res) {
  const prompt = req.body?.prompt;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt must be a non-empty string" });
  }

  const systemPrompt = `
    You are a helpful Magic: The Gathering assistant AI.
    Your responses should be relevant to cards, deck building, strategy, formats (like Commander/EDH), rules, or lore.
    Refuse requests unrelated to Magic: The Gathering.
    Be clear, concise, and always reference MTG knowledge.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: systemPrompt },
    });

    const resultText = response.text?.trim();

    if (!resultText) {
      throw new Error("Empty response from Gemini");
    }
    return res.json({ result: resultText });
  } catch (err) {
    console.error("Gemini MTG AI error:", err);
    return res.status(502).json({ error: "AI provider error — please try again" });
  }
}
