import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../../data/gameChangers.json');

let cached = null;

/**
 * Bundled Game Changers list, read once. This is the fallback for cards
 * whose synced `game_changer` flag is missing; Scryfall's flag wins.
 */
export function loadGameChangers() {
  if (!cached) {
    cached = JSON.parse(readFileSync(DATA_PATH, 'utf-8')).cards;
  }
  return cached;
}
