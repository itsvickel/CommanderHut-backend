const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Deck = require('./Deck');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: DataTypes.STRING,
  password: DataTypes.STRING,
  email_address: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

User.hasMany(Deck, { foreignKey: 'user_id' });
Deck.belongsTo(User, { foreignKey: 'user_id' });

module.exports = User;
