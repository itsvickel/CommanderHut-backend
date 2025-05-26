import express from 'express';
import { addUser, findUser } from '../controllers/userController.js';

const router = express.Router();

// Declare more specific routes first
router.post('/user', addUser);
router.post('/user/:id', findUser);

export default router;
