// controllers/deckController.js
const { User, Deck, Card, DeckCard } = require('../models');

const createDeckWithCards = async (req, res) => {
  console.log('Received request to create deck');
  const { email_address, deck_name, cards, format, commander, tags, is_public = false } = req.body; // Added tags and is_public

  try {
    // Find user by email_address
    const user = await User.findOne({ where: { email_address } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prepare the deck list as a JSON object
    const deckList = cards.map(({ id, quantity = 1 }) => ({
      card_id: id, // Use the card id (from the passed object)
      quantity
    }));

    // Create a new deck
    const newDeck = await Deck.create({
      id: generateUniqueId(), // Ensure you have a method for generating a unique ID
      deck_name,
      format,
      deck_list: deckList, // Store deck list as a JSON string
      commander: format === 'Commander' ? commander : null, // Only set commander if format is Commander
      owner_id: user.id,
      owner_email: email_address, // Store user email in the deck
      tags, // Store deck tags
      is_public, // Store the public visibility flag
    });

    // Respond with a success message and the created deck
    res.status(201).json({
      message: 'Deck created successfully',
      deck: newDeck,
      cards: deckList
    });
  } catch (err) {
    console.error('Error creating deck:', err);
    res.status(500).json({ error: 'Failed to create deck' });
  }
};

// Helper function to generate unique deck ID (you can use libraries like uuid)
function generateUniqueId() {
  // Example using UUID; you can use another method if preferred
  return require('uuid').v4();
}

// Get decks by user_id
const getDecksByUser = async (req, res) => {
  const { user_id } = req.params;

  try {
    // Find all decks associated with a user_id
    const decks = await Deck.findAll({
      where: { user_id },
      include: [{ model: Card }] // Include associated cards in the response
    });

    res.status(200).json(decks);
  } catch (err) {
    console.error('Error fetching decks:', err);
    res.status(500).json({ error: 'Failed to fetch decks' });
  }
};

// Get all decks 
const getDecks = async (req, res) => {
  const page = parseInt(req.query.page) || 1; // default to page 1
  const limit = parseInt(req.query.limit) || 20; // default to 20 decks per page
  const offset = (page - 1) * limit;

  try {
    const { count, rows: decks } = await Deck.findAndCountAll({
      include: [
        { model: Card },
        { model: User, attributes: ['email_address'] }
      ],
      limit,
      offset
    });

    res.status(200).json({
      total: count,
      page,
      pageCount: Math.ceil(count / limit),
      decks
    });
  } catch (err) {
    console.error('Error fetching decks:', err);
    res.status(500).json({ error: 'Failed to fetch decks' });
  }
};

module.exports = {
  createDeckWithCards,
  getDecksByUser,
  getDecks
};
