import mongoose from 'mongoose';
import Deck from '../models/Deck.js';
import Card from '../models/Card.js';
import Like from '../models/interactions/Like.js';

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
      name: { $in: uniqueCardNames.map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
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

export const deleteDeck = async (req, res) => {
  const { id } = req.params;
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid deck ID' });
  }
  try {
    const deck = await Deck.findById(id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    if (deck.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await Deck.findByIdAndDelete(id);
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting deck:', error);
    return res.status(500).json({ error: 'Failed to delete deck' });
  }
};

export const getDecksByUser = async (req, res) => {
  const { user_id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(user_id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    const decks = await Deck.find({ owner: user_id });
    res.status(200).json(decks);
  } catch (error) {
    console.error('Error fetching decks by user:', error);
    res.status(500).json({ error: 'Failed to fetch decks by user' });
  }
};

export const getDecks = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  try {
    const [decks, total] = await Promise.all([
      Deck.find({ is_public: true }).skip(skip).limit(limit),
      Deck.countDocuments({ is_public: true }),
    ]);
    res.status(200).json({ decks, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching decks:', error);
    res.status(500).json({ error: 'Failed to fetch decks' });
  }
};

export const updateDeck = async (req, res) => {
  const { id } = req.params;
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid deck ID' });

  const { deck_name, format, commander, commander_image, tags, is_public, deck_list } = req.body;

  if (format !== undefined && !['Commander', 'Standard', 'Modern'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format value' });
  }

  try {
    const deck = await Deck.findById(id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    if (deck.owner.toString() !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const updates = {};
    if (deck_name !== undefined) updates.deck_name = deck_name;
    if (format !== undefined) updates.format = format;
    if (commander !== undefined) updates.commander = commander;
    if (commander_image !== undefined) updates.commander_image = commander_image;
    if (tags !== undefined) updates.tags = tags;
    if (is_public !== undefined) updates.is_public = !!is_public;

    if (deck_list !== undefined) {
      if (!Array.isArray(deck_list)) return res.status(400).json({ error: 'deck_list must be an array' });

      const uniqueCardNames = [...new Set(deck_list.map(e => e.card?.trim()).filter(Boolean))];
      const foundCards = await Card.find({
        name: { $in: uniqueCardNames.map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
      }).lean();

      const nameToCardMap = new Map(foundCards.map(c => [c.name.toLowerCase(), c]));
      const notFoundNames = [];
      const validDeckList = [];

      for (const [index, { card: cardName, quantity }] of deck_list.entries()) {
        if (typeof cardName !== 'string' || typeof quantity !== 'number' || quantity < 1) {
          return res.status(400).json({ error: `Invalid card entry at index ${index}: each card must have a valid 'card' name (string) and 'quantity' >= 1` });
        }
        const matched = nameToCardMap.get(cardName.toLowerCase());
        if (!matched) notFoundNames.push(cardName);
        else validDeckList.push({ card: matched._id, quantity });
      }

      if (notFoundNames.length > 0) {
        return res.status(400).json({ error: 'Some cards were not found in the database.', notFound: notFoundNames });
      }

      updates.cards = validDeckList;
    }

    const updated = await Deck.findByIdAndUpdate(id, { $set: updates }, { new: true });
    return res.status(200).json(updated);
  } catch (err) {
    console.error('Error updating deck:', err);
    return res.status(500).json({ error: 'Failed to update deck', details: err.message });
  }
};

export const likeDeck = async (req, res) => {
  const { id } = req.params;
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid deck ID' });

  try {
    const deck = await Deck.findById(id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    await Like.create({ user_id: req.user.id, target_id: id, target_type: 'Deck' });
    await Deck.findByIdAndUpdate(id, { $inc: { likes_count: 1 } });

    return res.status(201).json({ liked: true });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Already liked' });
    console.error('Error liking deck:', err);
    return res.status(500).json({ error: 'Failed to like deck', details: err.message });
  }
};

export const unlikeDeck = async (req, res) => {
  const { id } = req.params;
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid deck ID' });

  try {
    const result = await Like.findOneAndDelete({ user_id: req.user.id, target_id: id, target_type: 'Deck' });
    if (!result) return res.status(404).json({ error: 'Like not found' });

    await Deck.findByIdAndUpdate(id, { $inc: { likes_count: -1 } });
    return res.status(204).send();
  } catch (err) {
    console.error('Error unliking deck:', err);
    return res.status(500).json({ error: 'Failed to unlike deck', details: err.message });
  }
};

export const getDeckLikeStatus = async (req, res) => {
  const { id } = req.params;
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid deck ID' });

  try {
    const liked = await Like.exists({ user_id: req.user.id, target_id: id, target_type: 'Deck' });
    return res.status(200).json({ liked: !!liked });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get like status', details: err.message });
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
