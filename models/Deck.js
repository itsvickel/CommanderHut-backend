const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Card = require('./Card');

const Deck = sequelize.define('Deck', {
  id: {
    type: DataTypes.STRING, // UUID or custom string ID
    primaryKey: true,
  },
  deck_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  format: {
    type: DataTypes.ENUM('Commander', 'Standard', 'Modern'), // extend if needed
    allowNull: false,
  },
  deck_list: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  commander: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  owner_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  owner_email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('tags');
      return raw ? JSON.parse(raw) : [];
    },
    set(val) {
      this.setDataValue('tags', JSON.stringify(val));
    }
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  }
}, {
  tableName: 'decks',
  timestamps: false, // manually managing created_at and updated_at
});

module.exports = Deck;
