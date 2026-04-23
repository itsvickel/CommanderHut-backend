import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimiters.js';
import 'dotenv/config';

// Fail fast if critical env vars are missing
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

import connectDB from './config/db.js';  // MongoDB connection function

// Import routes
import cardRoutes from './routes/cardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import deckRoutes from './routes/deckRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import profileRoute from './routes/profileRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import MasterPrompt from './models/MasterPrompt.js';

const app = express();

app.use(helmet());
app.use(globalLimiter);

// Middleware: body parsing
// NOTE: For routes that need larger payloads (e.g., avatar upload),
// mount a route-scoped body parser on that specific route, e.g.:
//   router.post('/avatar', express.json({ limit: '5mb' }), avatarHandler);
// Do NOT raise the global limit.
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Middleware: cookies
app.use(cookieParser());

// Middleware: CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Health check (used by Railway / uptime monitors)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// Routes
app.use('/api', cardRoutes);
app.use('/api', userRoutes);
app.use('/api', deckRoutes);
app.use('/api', loginRoutes);
app.use('/api', authRoutes);
app.use('/api', aiRoutes);
app.use('/api', profileRoute);
app.use('/api', adminRoutes);

// 404 handler — logs unmatched routes to help diagnose frontend URL mismatches
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Optional: catch-all error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

// Seed MasterPrompt with defaults if it doesn't exist
async function seedMasterPrompt() {
  const existing = await MasterPrompt.findOne();
  if (!existing) {
    await MasterPrompt.create({
      role_description: 'You are a Commander deck-building expert.',
      domain_restrictions:
        'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
      additional_rules: '',
    });
    console.log('MasterPrompt seeded with defaults');
  }
}

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
    try {
      await seedMasterPrompt();
    } catch (err) {
      console.warn('[startup] MasterPrompt seed failed, continuing anyway:', err.message);
    }
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit process with failure
  }
})();
