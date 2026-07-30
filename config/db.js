import mongoose from 'mongoose';

// Cache the connection promise so serverless invocations reuse the
// connection from a warm container instead of reconnecting per request.
let connPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!connPromise) {
    connPromise = mongoose.connect(process.env.MONGODB_URI).catch((err) => {
      connPromise = null; // allow retry on next invocation
      console.error('MongoDB connection error:', err);
      throw err;
    });
  }
  await connPromise;
}

export default connectDB;
