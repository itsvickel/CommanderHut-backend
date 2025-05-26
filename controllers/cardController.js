import Card from '../models/Card.js';
import { Op } from 'sequelize';
import sequelize from '../config/db.js';

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

const getCardByName = async (req, res) => {
  const { name } = req.params;
  console.log('Received card name:', name);
  try {
    const cards = await Card.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.eq]: name } },
          { name: { [Op.like]: `%${name}%` } }
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

const getCardByID = async (req, res) => {
  const { id } = req.params;
  console.log('Received card ID:', id);

  try {
    const card = await Card.findOne({
      where: { id }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(card);
  } catch (err) {
    console.error('Error fetching card by ID:', err);
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};

const addCard = async (req, res) => {
  try {
    const card = await Card.create(req.body);
    res.status(201).json(card);
  } catch (err) {
    console.error('Error adding card:', err);
    res.status(400).json({ error: 'Failed to create card' });
  }
};

const getRandomListOfCards = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const cards = await Card.findAll({
      where: {
        type_line: {
          [Op.notLike]: '%Land%'
        },
        layout: {
          [Op.notIn]: ['token', 'double_faced_token']
        }
      },
      order: sequelize.random(),
      limit: limit
    });

    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: 'List of cards not found' });
    }

    res.json(cards);
  } catch (err) {
    console.error('Error fetching card list:', err);
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

const postCardsBulkByName = async (req, res) => {
  const { cards } = req.body;

  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'Please provide a non-empty array of card names.' });
  }

  try {
    const cardNames = cards.map(card => card.toLowerCase());

    const cardsFound = await Card.findAll({
      where: {
        name: {
          [Op.in]: cardNames,
        },
        layout: {
          [Op.notIn]: ['token', 'double_faced_token'],
        },
      },
    });

    const foundNames = cardsFound.map(card => card.name.toLowerCase());
    const notFound = cardNames.filter(name => !foundNames.includes(name));

    if (cardsFound.length === 0) {
      return res.status(404).json({ error: 'No cards found matching the provided names.' });
    }

    res.json({ cards: cardsFound, notFound });
  } catch (err) {
    console.error('Error fetching cards by names:', err);
    res.status(500).json({ error: 'Failed to retrieve cards.' });
  }
};

export {
  getAllCards,
  getCardBySetAndCollectorNumber,
  getCardsBySet,
  getCardByName,
  getCardByID,
  addCard,
  getRandomListOfCards,
  postCardsBulkByName
};
