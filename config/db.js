import dotenv from 'dotenv';  // Import dotenv
dotenv.config();  // Load environment variables from .env file

import { Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  host: 'localhost', // Ensure this is correctly set
  dialect: 'mysql',
  username: 'root',
  password: 'VentricleSwornEnlarged',
  database: 'mtg_deck',
  port: '3306',
  define: {
    timestamps: false, // Example to define options globally
  },
});

export default sequelize;
