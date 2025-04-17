const express = require('express');
const sequelize = require('./config/db');
const cardRoutes = require('./routes/cardRoutes');
const userRoutes = require('./routes/userRoutes');
const cors = require('cors');

require('dotenv').config();

const app = express();
app.use(express.json()); // Middleware to parse JSON
app.use(cors()); // This will allow all origins

// Routes
app.use('/api', cardRoutes);
app.use('/api', userRoutes); 

// Sync database & start server
sequelize.sync()
  .then(() => {
    console.log('Database connected');
    app.listen(3000, () => console.log('Server running on port 3000'));
  })
  .catch((err) => console.error('DB connection error:', err));
