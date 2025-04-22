const express = require('express');
const { loginUser, logoutUser } = require('../controllers/loginController');

const router = express.Router();

router.post('/login', loginUser); 
router.post('/logout', logoutUser); 

module.exports = router;
