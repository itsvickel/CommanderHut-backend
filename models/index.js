import sequelize from '../config/db.js';
import User from './User.js';
import Deck from './Deck.js';
import Card from './Card.js';
import DeckCard from './DeckCard.js';

// === Define associations ===

// User → Deck
User.hasMany(Deck, { foreignKey: 'owner_id', as: 'userDecks' });
Deck.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

// Deck → DeckCard
Deck.hasMany(DeckCard, { foreignKey: 'deck_id', as: 'deck_cards' });
DeckCard.belongsTo(Deck, { foreignKey: 'deck_id' });

// Card → DeckCard
Card.hasMany(DeckCard, { foreignKey: 'card_id', as: 'cardEntries' });
DeckCard.belongsTo(Card, { foreignKey: 'card_id', as: 'card' });

// Optional: Deck ↔ Card through DeckCard (many-to-many)
Deck.belongsToMany(Card, {
  through: DeckCard,
  foreignKey: 'deck_id',
  otherKey: 'card_id',
  as: 'cardsInDeck'
});
Card.belongsToMany(Deck, {
  through: DeckCard,
  foreignKey: 'card_id',
  otherKey: 'deck_id',
  as: 'decksContainingCard'
});

// === Export models ===
export { sequelize, User, Deck, Card, DeckCard };
