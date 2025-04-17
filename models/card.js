const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Card = sequelize.define('Card', {
  name: DataTypes.STRING,
  mana_cost: DataTypes.STRING,
  type_line: DataTypes.STRING,
  oracle_text: DataTypes.TEXT,
  colors: DataTypes.STRING,
  set: DataTypes.STRING, // short set code (like "2xm")
  set_name: DataTypes.STRING,
  collector_number: DataTypes.STRING,
  artist: DataTypes.STRING,
  released_at: DataTypes.DATEONLY,
  image_uris: DataTypes.JSON,   
  legalities: DataTypes.JSON,
  layout: DataTypes.STRING  
}, {
  indexes: [
    {
      unique: true,
      fields: ['name', 'set', 'collector_number']
    }
  ]
});

module.exports = Card;
