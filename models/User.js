const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,  // Automatically generate an incrementing ID
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,  // User should have a name
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,  // Password should be required for login
  },
  email_address: {
    type: DataTypes.STRING,
    allowNull: false,  // Email should be unique and required
    unique: true,
  },
}, {
  // Automatically manage timestamps using Sequelize's built-in behavior
  timestamps: true, // This enables 'createdAt' and 'updatedAt'
  createdAt: 'created_at',  // Custom column name for createdAt
  updatedAt: 'updated_at',  // Custom column name for updatedAt
});

// Optional: Adding a relationship for the favorite decks
User.associate = (models) => {
  User.hasMany(models.Deck, {
    foreignKey: 'user_id',
    as: 'favoriteDecks', // Alias for the user's favorite decks
  });
};

module.exports = User;
