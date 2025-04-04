const express = require('express');
const sequelize = require('./config/db');
const cardRoutes = require('./routes/cardRoutes');

require('dotenv').config();

const app = express();
app.use(express.json()); // Middleware to parse JSON

// Routes
app.use('/api', cardRoutes);

// Sync database & start server
sequelize.sync()
  .then(() => {
    console.log('Database connected');
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
  .catch((err) => console.error('DB connection error:', err));
