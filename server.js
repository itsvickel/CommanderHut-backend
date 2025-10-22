import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './config/db.js';  // MongoDB connection function

// Import routes
import cardRoutes from './routes/cardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import deckRoutes from './routes/deckRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

const app = express();

// Middleware: body parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Middleware: CORS
app.use(cors({
  origin: 'http://localhost:5173', // your frontend origin
  credentials: true,
}));

// Routes
app.use('/api', cardRoutes);
app.use('/api', userRoutes);
app.use('/api', deckRoutes);
app.use('/api', loginRoutes);
app.use('/api', authRoutes);
app.use('/api', aiRoutes);

// Optional: catch-all error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit process with failure
  }
})();
