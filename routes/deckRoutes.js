import express from 'express';
import {
  createDeckWithCards,
  deleteDeck,
  getDecksByUser,
  getDecks,
  getDeckByID
} from '../controllers/deckController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/decks', authMiddleware, createDeckWithCards);
router.delete('/decks/:id', authMiddleware, deleteDeck);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks/:id', getDeckByID);
router.get('/decks', getDecks);

export default router;
