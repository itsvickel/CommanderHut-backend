import mongoose from 'mongoose';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';
export const createDeckWithCards = async (req, res) => {
  const { deck_name, format, commander, commander_image, deck_list, tags, is_public } = req.body;
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const owner = req.user.id;

  if (!deck_list || !Array.isArray(deck_list)) {
    return res.status(400).json({ error: 'deck_list must be an array' });
  }

  if (!['Commander', 'Standard', 'Modern'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format value' });
  }

  const uniqueCardNames = [
    ...new Set(deck_list.map((entry) => entry.card?.trim()).filter(Boolean))
  ];

  try {
    const foundCards = await Card.find({
      name: { $in: uniqueCardNames.map(name => new RegExp(`^${name}$`, 'i')) }
    }).lean();

    const nameToCardMap = new Map(
      foundCards.map((card) => [card.name.toLowerCase(), card])
    );

    const notFoundNames = [];
    const validDeckList = [];

    for (const [index, { card: cardName, quantity }] of deck_list.entries()) {
      if (typeof cardName !== 'string' || typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({
          error: `Invalid card entry at index ${index}: each card must have a valid 'card' name (string) and 'quantity' >= 1`,
        });
      }

      const matchedCard = nameToCardMap.get(cardName.toLowerCase());
      if (!matchedCard) {
        notFoundNames.push(cardName);
      } else {
        validDeckList.push({ card: matchedCard._id, quantity });
      }
    }

    if (notFoundNames.length > 0) {
      return res.status(400).json({
        error: 'Some cards were not found in the database.',
        notFound: notFoundNames,
      });
    }

    const newDeck = await Deck.create({
      owner,
      deck_name,
      format,
      commander,
      commander_image,
      cards: validDeckList,
      tags: tags || [],
      is_public: !!is_public,
    });

    return res.status(201).json(newDeck);
  } catch (err) {
    console.error('Error creating deck:', err);
    return res.status(500).json({ error: 'Failed to create deck', details: err.message });
  }
};



export const getDecksByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const decks = await Deck.find({ user_id: userId });
    res.status(200).json(decks);
  } catch (error) {
    console.error('Error fetching decks by user:', error);
    res.status(500).json({ error: 'Failed to fetch decks by user' });
  }
};

export const getDecks = async (_, res) => {
  try {
    const decks = await Deck.find();
    res.status(200).json(decks);
  } catch (error) {
    console.error('Error fetching decks:', error);
    res.status(500).json({ error: 'Failed to fetch decks' });
  }
};

export const getDeckByID = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid deck ID' });
  }

  try {
    // Populate cards.card to get card details
    const deck = await Deck.findById(id).populate('cards.card');
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.status(200).json(deck);
  } catch (error) {
    console.error('Error fetching deck by ID:', error);
    res.status(500).json({ error: 'Failed to fetch deck by ID' });
  }
};
