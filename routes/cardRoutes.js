const express = require('express');
const { getAllCards,getCardsBySet, getCardBySetAndCollectorNumber, getCardByName, addCard, getRandomListOfCards } = require('../controllers/cardController');

const router = express.Router();

// Most specific routes first
router.get('/cards/name/:name', getCardByName);
router.get('/cards/randomList', getRandomListOfCards);
router.get('/cards/:set/:collectorNumber', getCardBySetAndCollectorNumber);
router.get('/cards/:set', getCardsBySet);
router.get('/cards', getAllCards);
router.post('/cards', addCard);

module.exports = router;