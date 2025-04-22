const express = require('express'); 
const { checkAuth } = require('../controllers/authController');

const router = express.Router();
 
router.get('/me', checkAuth);

module.exports = router;
