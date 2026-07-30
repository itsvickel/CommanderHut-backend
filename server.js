import 'dotenv/config';

// Fail fast if critical env vars are missing
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const { default: app } = await import('./app.js');
const { default: connectDB } = await import('./config/db.js');
const { seedMasterPrompt } = await import('./config/seedMasterPrompt.js');

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

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
