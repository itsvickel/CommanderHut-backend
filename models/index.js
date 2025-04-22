// models/index.js
const sequelize = require('../config/db');
const User = require('./User');
const Deck = require('./Deck');
const Card = require('./Card');
const DeckCard = require('./DeckCard');

// Define associations
User.hasMany(Deck, { foreignKey: 'user_id' });
Deck.belongsTo(User, { foreignKey: 'user_id' });

Deck.belongsToMany(Card, {
  through: DeckCard,
  foreignKey: 'deck_id',
});
Card.belongsToMany(Deck, {
  through: DeckCard,
  foreignKey: 'card_id',
});

module.exports = {
  sequelize,
  User,
  Deck,
  Card,
  DeckCard,
};
