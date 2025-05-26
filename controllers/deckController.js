import { User, Deck, Card, DeckCard } from '../models/index.js';
import { Op } from 'sequelize';

// Helper function to generate unique deck ID (you can use libraries like uuid)
function generateUniqueId() {
  // Example using UUID; you can use another method if preferred
  return import('uuid').then(({ v4 }) => v4());
}

const createDeckWithCards = async (req, res) => {
  const { email_address, deck_name, deck_list, format, commander, tags, is_public = false } = req.body;

  //console.log(email_address, deck_name, deck_list, format, commander, tags);

  try {
    let user = null;
    if (email_address) {
      user = await User.findOne({ where: { email_address } });
      if (!user) return res.status(404).json({ error: 'User not found' });
    }

    const deckId = await generateUniqueId();

    const newDeck = await Deck.create({
      id: deckId,
      deck_name,
      format,
      commander: format === 'Commander' ? commander : null,
      owner_id: user ? user.id : null,
      owner_email: email_address || 'anonymous',
      tags,
      is_public,
    });

    console.log(deckId);
    // Insert cards into deck_cards table
    const cardEntries = deck_list.map(({ id, quantity }) => ({
      deck_id: deckId,
      card_id: id,
      quantity: quantity,
    }));

    await DeckCard.bulkCreate(cardEntries);

    res.status(201).json({
      message: 'Deck created successfully',
      deck: newDeck,
      cards: cardEntries,
    });
  } catch (err) {
    console.error('Error creating deck:', err);
    res.status(500).json({ error: 'Failed to create deck' });
  }
};

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

const getDeckByID = async (req, res) => {
  const deckId = req.params.id || req.body.id; // You can choose to use params or body
  if (!deckId) {
    return res.status(400).json({ error: 'Deck ID is required' });
  }

  try {
    // Fetch the deck along with the associated deckcards
    const deck = await Deck.findOne({
      where: { id: deckId },
      include: [
        {
          model: DeckCard, // Include the deckcards
          as: 'deckCards',
          include: [
            {
              model: Card, // Include the card information for each deckcard
              as: 'card',  // Define the association
              attributes: ['id', 'name', 'type', 'mana_cost'], // Select the fields you want
            }
          ]
        },
        {
          model: User,
          attributes: ['email_address']
        }
      ]
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    // Match cards with quantities
    const fullCardList = deck.deckCards.map((deckCard) => {
      const card = deckCard.card; // Access the card associated with each deckcard
      return {
        quantity: deckCard.quantity,
        ...card.dataValues
      };
    });

    res.status(200).json({
      deck: {
        id: deck.id,
        deck_name: deck.deck_name,
        format: deck.format,
        commander: deck.commander,
        created_at: deck.created_at,
        updated_at: deck.updated_at,
        owner_id: deck.owner_id,
        owner_email: deck.User?.email_address || null,
        is_public: deck.is_public,
        tags: deck.tags || [],
        card_list: fullCardList
      }
    });
    
  } catch (err) {
    console.error('Error fetching deck by ID:', err);
    res.status(500).json({ error: 'Failed to fetch deck' });
  }
};

export { createDeckWithCards, getDecksByUser, getDecks, getDeckByID };
