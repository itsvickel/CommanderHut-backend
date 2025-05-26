import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

// Define the DeckCard model
const DeckCard = sequelize.define('DeckCard', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  deck_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  card_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
}, {
  tableName: 'deck_cards',
  timestamps: false,
});
 

export default DeckCard;
