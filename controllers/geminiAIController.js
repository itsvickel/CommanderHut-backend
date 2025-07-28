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
export async function generateMTGIdea(req, res) {
  const prompt = req.body.prompt;
  console.log(prompt);
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt must be a non-empty string");
  }

  const systemPrompt = `
    You are a helpful Magic: The Gathering assistant AI. 
    Your responses should be relevant to cards, deck building, strategy, formats (like Commander/EDH), rules, or lore. 
    Be clear, concise, and always reference MTG knowledge.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        // { role: "user", parts: [{ text: systemPrompt }] },
        { role: "user", parts: [{ text: prompt }] },
      ],
    });

    const resultText = response.text?.trim();

    if (!resultText) {
      throw new Error("Empty response from Gemini");
    }
    console.log(resultText);
    return res.json({ result: resultText });
  } catch (err) {
    console.error("Gemini MTG AI error:", err);
    return "Sorry, I couldn't generate a response at the moment.";
  }
}
