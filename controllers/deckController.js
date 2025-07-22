import mongoose from 'mongoose';
import Deck from '../models/Deck.js';

export const createDeckWithCards = async (req, res) => {
  const { owner, deck_name, format, commander, deck_list, tags, is_public } = req.body;

  if (!owner || !deck_name || !deck_list || !Array.isArray(deck_list)) {
    return res.status(400).json({ error: 'Missing required fields or invalid cards format' });
  }

  if (!['Commander', 'Standard', 'Modern'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format value' });
  }

  // Validate deck_list items for card ObjectId and quantity >= 1
  for (const [index, cardEntry] of deck_list.entries()) {
    if (
      !cardEntry.card ||
      !mongoose.Types.ObjectId.isValid(cardEntry.card) ||
      typeof cardEntry.quantity !== 'number' ||
      cardEntry.quantity < 1
    ) {
      return res.status(400).json({
        error: `Invalid card entry at index ${index}: each card must have a valid 'card' ObjectId and 'quantity' >= 1`
      });
    }
  }

  try {
    const deck = await Deck.create({
      owner,
      deck_name,
      format,
      commander,
      cards: deck_list,
      tags: tags || [],
      is_public: !!is_public,
    });

    res.status(201).json(deck);
  } catch (error) {
    console.error('Error creating deck:', error);
    res.status(500).json({ error: 'Failed to create deck', details: error.message });
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
