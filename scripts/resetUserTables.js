const sequelize = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await sequelize.sync(); // or sync({ force: true }) to be extra sure
    console.log('Users table recreated successfully.');
  } catch (error) {
    console.error('Error recreating users table:', error);
  }
})();