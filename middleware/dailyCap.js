import AIUsage from '../models/AIUsage.js';

const DAILY_LIMIT = 20;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight() {
  return Math.ceil(
    (Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1
    ) - Date.now()) / 1000
  );
}

export async function dailyCap(req, res, next) {
  const user = req.user?.id;
  if (!user) return res.status(401).json({ error: 'auth required' });

  const date = todayUtc();
  try {
    // Atomic check-and-increment: only matches while under the limit, so
    // concurrent requests cannot push the count past DAILY_LIMIT.
    await AIUsage.findOneAndUpdate(
      { user, date, count: { $lt: DAILY_LIMIT } },
      { $inc: { count: 1 } },
      { upsert: true }
    );
    next();
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key: either the user is at the cap, or we lost an upsert
      // race with a concurrent first request. Retry without upsert to tell
      // the two apart.
      try {
        const doc = await AIUsage.findOneAndUpdate(
          { user, date, count: { $lt: DAILY_LIMIT } },
          { $inc: { count: 1 } }
        );
        if (doc) return next();
      } catch (retryErr) {
        console.error('dailyCap retry error:', retryErr);
        return res.status(500).json({ error: 'Failed to check usage cap' });
      }
      const retryAfter = secondsUntilUtcMidnight();
      res.set('Retry-After', retryAfter);
      return res.status(429).json({ error: 'daily generation cap reached', retry_after_seconds: retryAfter });
    }
    console.error('dailyCap error:', err);
    return res.status(500).json({ error: 'Failed to check usage cap' });
  }
}

// Give back one use when a generation fails — users shouldn't burn quota on errors.
export async function refundDailyUse(userId) {
  try {
    await AIUsage.findOneAndUpdate(
      { user: userId, date: todayUtc(), count: { $gt: 0 } },
      { $inc: { count: -1 } }
    );
  } catch (err) {
    console.error('refundDailyUse error:', err);
  }
}

// Accumulate LLM token usage onto the user's daily record.
export async function recordTokenUsage(userId, usage) {
  if (!usage) return;
  try {
    await AIUsage.findOneAndUpdate(
      { user: userId, date: todayUtc() },
      {
        $inc: {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cost_usd: usage.cost_usd ?? 0,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('recordTokenUsage error:', err);
  }
}
