import express from 'express';
import {
  postCardsBulkByName,
  getAllCards,
  getCardsBySet,
  getCardBySetAndCollectorNumber,
  getCardByName,
  addCard,
  getRandomListOfCards,
  getCardByID
} from '../controllers/cardController.js';

const router = express.Router();

router.post('/cards/bulk', postCardsBulkByName ); 
router.get('/cards/id/:id', getCardByID);  
router.get('/cards/name/:name', getCardByName);  
router.get('/cards/randomList', getRandomListOfCards);  
router.get('/cards/set/:set', getCardsBySet);  
router.get('/cards/:set/:collectorNumber', getCardBySetAndCollectorNumber); 
router.get('/cards', getAllCards);  
router.post('/cards', addCard);

export default router; 