const express = require('express');
const { addUser, findUser } = require('../controllers/userController');

const router = express.Router();

// Declare more specific routes first
router.post('/user', addUser);
router.post('/user/:id', findUser);

module.exports = router;
