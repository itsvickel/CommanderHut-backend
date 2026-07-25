import { validateLlmResponse } from './deckSchema.js';

export function parseLlmResponse(input) {
  return validateLlmResponse(input);
}
