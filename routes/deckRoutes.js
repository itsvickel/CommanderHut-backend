import express from 'express';
import {
  createDeckWithCards,
  updateDeck,
  deleteDeck,
  getDecksByUser,
  getDecks,
  getDeckByID,
  likeDeck,
  unlikeDeck,
  getDeckLikeStatus,
} from '../controllers/deckController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/decks', authMiddleware, createDeckWithCards);
router.patch('/decks/:id', authMiddleware, updateDeck);
router.delete('/decks/:id', authMiddleware, deleteDeck);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks/:id', getDeckByID);
router.get('/decks', getDecks);

router.post('/decks/:id/like', authMiddleware, likeDeck);
router.delete('/decks/:id/like', authMiddleware, unlikeDeck);
router.get('/decks/:id/like', authMiddleware, getDeckLikeStatus);

export default router;
