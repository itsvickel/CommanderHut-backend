import AIUsage from '../models/AIUsage.js';

const DAILY_LIMIT = 20;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function dailyCap(req, res, next) {
  const user = req.user?.id;
  if (!user) return res.status(401).json({ error: 'auth required' });

  const date = todayUtc();
  const usage = await AIUsage.findOneAndUpdate(
    { user, date },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );

  if (usage.count > DAILY_LIMIT) {
    const retryAfter = Math.ceil(
      (Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate() + 1
      ) - Date.now()) / 1000
    );
    res.set('Retry-After', retryAfter);
    return res.status(429).json({ error: 'daily generation cap reached', retry_after_seconds: retryAfter });
  }

  next();
}
