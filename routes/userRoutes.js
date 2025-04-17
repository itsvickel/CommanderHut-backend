const express = require('express');
const { addUser, loginUser, findUser } = require('../controllers/userController');

const router = express.Router();

// Declare more specific routes first
router.post('/user', addUser);
router.post('/user/:id', findUser);
router.post('/login', loginUser);

module.exports = router;
