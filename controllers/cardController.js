import Card from '../models/Card.js';
import { parseQ, buildFilter } from '../services/cardSearch/queryBuilder.js';

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

export const searchCards = async (req, res) => {
  const { q = '', colors, color_identity, legal } = req.query;

  let page = parseInt(req.query.page ?? '1', 10);
  let limit = parseInt(req.query.limit ?? '20', 10);

  if (req.query.page !== undefined && (isNaN(page) || page < 1)) {
    return res.status(400).json({ error: 'page must be a positive integer' });
  }
  if (req.query.limit !== undefined && (isNaN(limit) || limit < 1)) {
    return res.status(400).json({ error: 'limit must be a positive integer' });
  }

  let cmc_min, cmc_max, price_max;

  if (req.query.cmc_min !== undefined) {
    cmc_min = Number(req.query.cmc_min);
    if (isNaN(cmc_min)) return res.status(400).json({ error: 'cmc_min must be a number' });
  }
  if (req.query.cmc_max !== undefined) {
    cmc_max = Number(req.query.cmc_max);
    if (isNaN(cmc_max)) return res.status(400).json({ error: 'cmc_max must be a number' });
  }
  if (req.query.price_max !== undefined) {
    price_max = Number(req.query.price_max);
    if (isNaN(price_max)) return res.status(400).json({ error: 'price_max must be a number' });
  }

  limit = Math.min(Math.max(limit, 1), 100);
  page = Math.max(page, 1);
  const skip = (page - 1) * limit;

  const keywords = parseQ(q);
  const colorsArr = colors ? colors.toUpperCase().split('') : undefined;
  const colorIdentityArr = color_identity ? color_identity.toUpperCase().split('') : undefined;

  const filter = buildFilter({
    ...keywords,
    colors: colorsArr,
    color_identity: colorIdentityArr,
    cmc_min,
    cmc_max,
    price_max,
    legal,
  });

  try {
    const [cards, total] = await Promise.all([
      Card.find(filter).skip(skip).limit(limit).lean(),
      Card.countDocuments(filter),
    ]);

    return res.json({
      cards,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    });
  } catch (err) {
    console.error('searchCards error:', err);
    return res.status(500).json({ error: 'Failed to search cards' });
  }
};