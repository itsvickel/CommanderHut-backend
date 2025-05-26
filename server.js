import express, { json, urlencoded } from 'express';
import { sequelize } from './models/index.js'; // Use import instead of require

import cardRoutes from './routes/cardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import deckRoutes from './routes/deckRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import authRoutes from './routes/authRoutes.js';

import cors from 'cors';

import 'dotenv/config'; // Can also use this shorthand for loading .env

const app = express();
app.use(json());
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend origin
  credentials: true, // 🔥 Allow cookies
}));

app.use(json({ limit: '20mb' }));
app.use(urlencoded({ extended: true, limit: '20mb' }));

app.use('/api', cardRoutes);
app.use('/api', userRoutes);
app.use('/api', deckRoutes);
app.use('/api', loginRoutes);
app.use('/api', authRoutes);

// Sync models AFTER associations are registered
// await sequelize.sync({ force: true }) // This will force a full sync and drop existing tables
await sequelize.sync({ alter: true }) // This will force a full sync and drop existing tables
  .then(() => {
    console.log('Database synced');
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
  .catch((err) => console.error('DB connection error:', err));
