const express = require('express');
const { getAllCards, addCard } = require('../controllers/cardController');

const router = express.Router();

router.get('/cards', getAllCards);
router.post('/cards', addCard);

module.exports = router;
