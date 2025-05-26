import sequelize from '../config/db.js';
import User from './User.js';
import Deck from './Deck.js';
import Card from './Card.js';
import DeckCard from './DeckCard.js';

// Define associations after all models are imported
User.hasMany(Deck, { foreignKey: 'user_id' });
Deck.belongsTo(User, { foreignKey: 'user_id' });

Deck.belongsToMany(Card, {
  through: DeckCard,
  foreignKey: 'deck_id',
  as: 'cardsInDeck', // Alias for Deck -> Card
});
Card.belongsToMany(Deck, {
  through: DeckCard,
  foreignKey: 'card_id',
  as: 'decksContainingCard', // Alias for Card -> Deck
});

Deck.hasMany(DeckCard, { foreignKey: 'deck_id', as: 'deckCardsList' });
Card.hasMany(DeckCard, { foreignKey: 'card_id', as: 'cardCardsList' });

// Export all models
export { sequelize, User, Deck, Card, DeckCard };
