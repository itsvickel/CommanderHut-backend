import app from '../app.js';
import connectDB from '../config/db.js';
import { seedMasterPrompt } from '../config/seedMasterPrompt.js';

// Fail loudly (but without killing the runtime) if critical env vars are missing.
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

let seeded = false;

export default async function handler(req, res) {
  if (missingEnv.length > 0) {
    console.error(`Missing required env vars: ${missingEnv.join(', ')}`);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Server misconfigured' }));
  }

  try {
    await connectDB();
    if (!seeded) {
      seeded = true;
      try {
        await seedMasterPrompt();
      } catch (err) {
        console.warn('[startup] MasterPrompt seed failed, continuing anyway:', err.message);
      }
    }
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Database unavailable' }));
  }

  return app(req, res);
}
