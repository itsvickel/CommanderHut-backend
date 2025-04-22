const express = require('express');
const { createDeckWithCards, getDecksByUser, getDecks} = require('../controllers/deckController');

const router = express.Router();

router.post('/decks', createDeckWithCards);
router.get('/decks/:user_id', getDecksByUser);
router.get('/decks', getDecks);

module.exports = router;
