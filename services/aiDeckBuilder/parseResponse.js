import { validateLlmResponse } from './deckSchema.js';

export function parseGeminiResponse(input) {
  return validateLlmResponse(input);
}
