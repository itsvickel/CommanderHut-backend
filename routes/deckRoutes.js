import express from 'express';
import {
  createDeckWithCards,
  getDecksByUser,
  getDecks,
  getDeckByID
} from '../controllers/deckController.js';

const router = express.Router();

router.post('/decks', createDeckWithCards);
router.get('/decks/:id', getDeckByID);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks', getDecks);

export default router;
