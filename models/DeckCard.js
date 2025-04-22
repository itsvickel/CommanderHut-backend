const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const DeckCard = sequelize.define('DeckCard', {
  deck_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  card_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = DeckCard;
