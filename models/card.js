import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

class Card extends Model {}

Card.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'card_name', // Maps to 'card_name' in the DB
  },
  mana_cost: {
    type: DataTypes.STRING,
  },
  type_line: {
    type: DataTypes.STRING,
  },
  oracle_text: {
    type: DataTypes.TEXT,
  },
  colors: {
    type: DataTypes.JSON,
  },
  set: {
    type: DataTypes.STRING,
  },
  set_name: {
    type: DataTypes.STRING,
  },
  collector_number: {
    type: DataTypes.STRING,
  },
  artist: {
    type: DataTypes.STRING,
  },
  released_at: {
    type: DataTypes.DATEONLY,
  },
  image_uris: {
    type: DataTypes.JSON,
  },
  legalities: {
    type: DataTypes.JSON,
  },
  layout: {
    type: DataTypes.STRING,
  },
}, {
  sequelize,
  modelName: 'Card',
  tableName: 'cards',
  timestamps: true, // Enables createdAt and updatedAt
  underscored: false,
});

export default Card;
