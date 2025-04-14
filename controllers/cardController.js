const Card = require('../models/Card');
const { Op } = require("sequelize");
const sequelize = require('../config/db');

// Get all cards
const getAllCards = async (req, res) => {
  try {
    const cards = await Card.findAll();
    res.json(cards);
  } catch (err) {
    console.error('Error fetching all cards:', err);
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

const getCardsBySet = async (req, res) => {
  const { set } = req.params;

  try {
    const cards = await Card.findAll({
      where: { set }
    });

    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: 'No cards found for this set' });
    }

    res.json(cards);
  } catch (err) {
    console.error('Error fetching cards by set:', err);
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

const getCardBySetAndCollectorNumber = async (req, res) => {
  const { set, collectorNumber } = req.params;

  try {
    const card = await Card.findOne({
      where: {
        set,
        collector_number: collectorNumber
      }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found in the set/collector number' });
    }

    res.json(card);
  } catch (err) {
    console.error('Error fetching card by set and collector number:', err);
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};


// Get cards by exact name or close (fuzzy) match
const getCardByName = async (req, res) => {
  const { name } = req.params;
  console.log('Received card name:', name);
  try {
    const cards = await Card.findAll({
      where: {
        [Op.or]: [
          {
            // Exact match
            name: {
              [Op.eq]: name // Exact match
            }
          },
          {
            // Fuzzy match (name contains the search term)
            name: {
              [Op.like]: `%${name}%` // Partial or fuzzy match
            }
          }
        ]
      }
    });

    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(cards);
  } catch (err) {
    console.error('Error fetching card by name:', err);
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};


// Add a new card
const addCard = async (req, res) => {
  try {
    const card = await Card.create(req.body);
    res.status(201).json(card);
  } catch (err) {
    console.error('Error adding card:', err);
    res.status(400).json({ error: 'Failed to create card' });
  }
};

// get a random list of cards based on limit, if no limit only generate 10 cards
const getRandomListOfCards =  async (req, res) => {

  const limit = parseInt(req.query.limit) || 10;

  try {
    const cards = await Card.findAll({
      order: sequelize.random(),
      limit: limit
    });
    
    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: 'list of Cards not found' });
    }
    res.json(cards);
  } catch (err) {
    console.error('Error fetching card list:', err);
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};

module.exports = {
  getAllCards,
  getCardBySetAndCollectorNumber,
  getCardsBySet,
  getCardByName,
  addCard,
  getRandomListOfCards
};
