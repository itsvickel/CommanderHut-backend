import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { globalLimiter } from './middleware/rateLimiters.js';
import 'dotenv/config';

// Import routes
import cardRoutes from './routes/cardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import deckRoutes from './routes/deckRoutes.js';
import loginRoutes from './routes/loginRoutes.js';
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import profileRoute from './routes/profileRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();

// Behind a reverse proxy (Vercel/Render), req.ip must come from
// X-Forwarded-For or every client shares one rate-limit bucket.
app.set('trust proxy', 1);

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

// Middleware: CORS (comma-separated list of allowed origins)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Health check (used by uptime monitors)
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

// Catch-all error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
