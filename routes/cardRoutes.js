const express = require('express');
const { getAllCards,getCardsBySet, getCardBySetAndCollectorNumber, getCardByName, addCard, getRandomListOfCards } = require('../controllers/cardController');

const router = express.Router();

// Most specific routes first
router.get('/cards/name/:name', getCardByName); // 🔍 exact match
router.get('/cards/randomList', getRandomListOfCards); // 🎲
router.get('/cards/set/:set', getCardsBySet); // ✅ changed from /cards/:set
router.get('/cards/:set/:collectorNumber', getCardBySetAndCollectorNumber); // 🆗 stays same
router.get('/cards', getAllCards); // 🧾 all
router.post('/cards', addCard);


module.exports = router;