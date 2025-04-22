const express = require('express');
const { sequelize } = require('./models'); // Uses index.js from models/
const cardRoutes = require('./routes/cardRoutes');
const userRoutes = require('./routes/userRoutes');
const deckRoutes = require('./routes/deckRoutes');
const loginRoutes = require('./routes/loginRoutes');
const authRoutes = require('./routes/authRoutes');

const cors = require('cors');
const cookieParser = require('cookie-parser');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend origin
  credentials: true, // 🔥 Allow cookies
}));

// Use cookie-parser middleware
app.use(cookieParser());

app.use('/api', cardRoutes);
app.use('/api', userRoutes);
app.use('/api', deckRoutes);
app.use('/api', loginRoutes);
app.use('/api', authRoutes);

// Sync models AFTER associations are registered
sequelize.sync({ alter: true }) // or { force: true } to reset (dangerous!)
  .then(() => {
    console.log('Database synced');
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
  .catch((err) => console.error('DB connection error:', err));
