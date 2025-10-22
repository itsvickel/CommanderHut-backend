import Card from '../models/Card.js';

export const getAllCards = async (_, res) => {
  try {
    const cards = await Card.find();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

export const getCardsBySet = async (req, res) => {
  try {
    const cards = await Card.find({ set: req.params.set });
    if (!cards.length) return res.status(404).json({ error: 'No cards found for this set' });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

export const getCardBySetAndCollectorNumber = async (req, res) => {
  try {
    const card = await Card.findOne({
      set: req.params.set,
      collector_number: req.params.collectorNumber,
    });
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};

export const getCardByName = async (req, res) => {
  try {
    const regex = new RegExp(req.params.name, 'i');
    const cards = await Card.find({ name: regex });
    if (!cards.length) return res.status(404).json({ error: 'Card not found' });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};

export const getCardByID = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve card' });
  }
};

export const addCard = async (req, res) => {
  try {
    const card = await Card.create(req.body);
    res.status(201).json(card);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create card' });
  }
};

export const getRandomListOfCards = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const cards = await Card.aggregate([
      {
        $match: {
          type_line: { $not: /Land/i },
          layout: { $nin: ['token', 'double_faced_token'] },
        },
      },
      { $sample: { size: limit } },
    ]);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cards' });
  }
};

export const postCardsBulkByName = async (req, res) => {
  const { cards } = req.body;
  if (!Array.isArray(cards) || cards.length === 0)
    return res.status(400).json({ error: 'Please provide a non-empty array of card names.' });

  try {
    const lowerNames = cards.map(c => new RegExp(`^${c}$`, 'i'));
    const foundCards = await Card.find({
      name: { $in: lowerNames },
      layout: { $nin: ['token', 'double_faced_token'] },
    });

    const foundNames = foundCards.map(c => c.name.toLowerCase());
    const notFound = cards.filter(c => !foundNames.includes(c.toLowerCase()));

    res.json({ cards: foundCards, notFound });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve cards.' });
  }
};

export const postBulkLookupByName = async (req, res) => {
  const names = req.body.names;

  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'Names array is required' });
  }

  try {
    const cards = await Card.find({
      name: { $in: names }
    });

    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
};