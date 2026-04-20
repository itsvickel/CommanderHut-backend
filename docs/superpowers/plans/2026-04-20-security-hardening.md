# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-impact security gaps before public soft launch. After this plan lands, `profile-api` merged to `main` is production-safe for a small public release.

**Architecture:** Layered defenses — HTTP hardening middleware at the Express layer (`helmet`, `express-rate-limit`), route-level auth on every mutating endpoint, targeted input validation and error-message hygiene at the controller layer, and a Mongo-backed per-user daily cap on the AI endpoints where abuse would cost real money.

**Tech Stack:** Node.js (ESM), Express 5, Mongoose 8, new deps `helmet` + `express-rate-limit`.

---

## Scope

**In scope (this plan):**
- HTTP hardening middleware (helmet, rate-limit) and body-size tightening
- Auth hardening: email-enumeration fix, JWT expiry bump, signup password rules, password-hash projection
- Route auth gaps: POST /decks, POST /cards, AI endpoints
- Per-user daily cap on AI endpoints (persistent across restarts)
- Log hygiene (stop printing `req.body` on AI route)

**Out of scope:**
- Full input-validation framework across every route (scope too broad; handle per-route when bugs surface)
- Password reset / email verification flows (post-v1)
- 2FA (post-v1)
- Security audit tooling (CodeQL, Dependabot beyond defaults)
- Test suite (still manual curl per spec)

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `helmet`, `express-rate-limit` |
| `server.js` | Modify | Register helmet; register rate-limit; tighten default body limit |
| `middleware/rateLimiters.js` | Create | Centralize rate-limit configs (global, auth, ai) |
| `controllers/loginController.js` | Modify | Return generic 401 on both bad email and bad password; JWT expiry `7d` |
| `controllers/userController.js` | Modify | Signup password min-length; never return password hash |
| `controllers/authController.js` | Modify | Never return password on `/api/me` |
| `routes/deckRoutes.js` | Modify | Gate POST /decks behind auth |
| `controllers/deckController.js` | Modify | Derive owner from `req.user.id` instead of request body |
| `routes/cardRoutes.js` | Modify | Gate POST /cards and bulk writes behind auth |
| `routes/aiRoutes.js` | Modify | Gate AI endpoints behind auth + daily cap middleware |
| `controllers/ai/deepseekAIController.js` | Modify | Remove `console.log(req.body)` |
| `controllers/ai/geminiAIController.js` | Modify | Remove any equivalent body log |
| `models/AIUsage.js` | Create | Mongo model for per-user daily AI usage counter |
| `middleware/aiUsageCap.js` | Create | Middleware that reads/increments AIUsage and returns 429 if over cap |

---

## Task 1: Add `helmet` for default security headers

**Why:** Single line of middleware, fixes a dozen headers (X-Content-Type-Options, Strict-Transport-Security, etc.). Zero downside at this stack.

**Files:**
- Modify: `package.json`, `server.js`

- [ ] **Step 1.1: Install helmet**

```bash
npm install helmet
```

- [ ] **Step 1.2: Register in server.js**

In `server.js`, add to the imports block near the top (below the other middleware imports like `cors` and `cookieParser`):

```js
import helmet from 'helmet';
```

Then, as the FIRST `app.use(...)` call after `const app = express();` — before body parsers, before cookies, before CORS — add:

```js
app.use(helmet());
```

Position matters: helmet should set headers on every response, including error responses. Registering first guarantees that.

- [ ] **Step 1.3: Verify server still boots**

Run: `npm start`
Expected: boots cleanly (MongoDB may fail — that's fine). Kill with Ctrl+C.

- [ ] **Step 1.4: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat: register helmet middleware for default security headers"
```

---

## Task 2: Create centralized rate limiters

**Why:** `express-rate-limit` is needed in several places (global, login/signup, AI endpoints) with different configs. Central config file avoids duplication and makes tuning a single place to look.

**Files:**
- Modify: `package.json`
- Create: `middleware/rateLimiters.js`

- [ ] **Step 2.1: Install express-rate-limit**

```bash
npm install express-rate-limit
```

- [ ] **Step 2.2: Create the config file**

Create `middleware/rateLimiters.js` with this content:

```js
import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login or signup attempts, please wait a minute' },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI requests are rate-limited; please wait a minute' },
});
```

Choices:
- Global 100/min is a permissive cap that stops runaway scripts while not hitting real users.
- Auth 5/min per IP stops credential-stuffing from a single source.
- AI 5/min is a second layer on top of the daily cap (Task 11) — short-window protection.

- [ ] **Step 2.3: Commit**

```bash
git add package.json package-lock.json middleware/rateLimiters.js
git commit -m "feat: add central rate-limiter config"
```

---

## Task 3: Wire up global and auth rate limiters

**Why:** Limiter definitions are useless until they're applied. This task applies the global limiter to all routes and the auth limiter specifically to login/signup.

**Files:**
- Modify: `server.js`, `routes/loginRoutes.js`, `routes/userRoutes.js`

- [ ] **Step 3.1: Apply global limiter in server.js**

In `server.js`, just below the `import helmet from 'helmet';` line, add:

```js
import { globalLimiter } from './middleware/rateLimiters.js';
```

Then, right after `app.use(helmet());` and before `app.use(express.json(...))`, add:

```js
app.use(globalLimiter);
```

Intentional: helmet first (always sets headers), global limiter second (stops abusive traffic before it hits body parsers).

- [ ] **Step 3.2: Apply auth limiter on login**

Replace `routes/loginRoutes.js` with:

```js
import express from 'express';
import { loginUser, logoutUser } from '../controllers/loginController.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/login', authLimiter, loginUser);
router.post('/logout', logoutUser);

export default router;
```

Logout does NOT need the limiter — it's a cheap cookie-clear and rate-limiting it creates user-facing bugs (e.g., rapid tab close + re-login).

- [ ] **Step 3.3: Apply auth limiter on signup**

Replace `routes/userRoutes.js` with:

```js
import express from 'express';
import { addUser, findUser } from '../controllers/userController.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/user', authLimiter, addUser);
router.post('/user/:id', findUser);

export default router;
```

- [ ] **Step 3.4: Smoke test (when DB is reachable)**

```bash
for i in 1 2 3 4 5 6 7 8; do \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/login \
    -H "Content-Type: application/json" \
    -d "{\"email_address\":\"noone@example.com\",\"password\":\"wrong\"}"; \
done
```

Expected: the first few return 401 (unauthorized via auth flow) or 404 (user not found — will be fixed in Task 5). After 5 attempts in the same minute, subsequent responses should return 429.

If you can't run this live (DB paused), verify the wiring by code review only.

- [ ] **Step 3.5: Commit**

```bash
git add server.js routes/loginRoutes.js routes/userRoutes.js
git commit -m "feat: apply global rate limiter and auth limiter on login/signup"
```

---

## Task 4: Tighten default body size limit

**Why:** `server.js` currently has `limit: '20mb'` on every route — intended for avatar uploads, but applied everywhere. A tiny JSON API doesn't need 20MB. Smaller limit = smaller DoS surface.

**Files:**
- Modify: `server.js`

- [ ] **Step 4.1: Update the limits**

In `server.js`, find:

```js
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
```

Replace with:

```js
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
```

200KB is plenty for every JSON request in this API today. When avatar upload or any large payload handler is added later, it can mount its own route-scoped `express.json({ limit: '20mb' })` before its handler. Document that pattern below:

```js
// NOTE: For routes that need larger payloads (e.g., avatar upload),
// mount a route-scoped body parser on that specific route, e.g.:
//   router.post('/avatar', express.json({ limit: '5mb' }), avatarHandler);
// Do NOT raise the global limit.
```

Add that comment block above the `app.use(express.json(...))` line.

- [ ] **Step 4.2: Commit**

```bash
git add server.js
git commit -m "feat: tighten global body size limit from 20mb to 200kb"
```

---

## Task 5: Fix email enumeration on login

**Why:** Current behavior — `POST /api/login` returns `404 "User not found"` if the email is unknown, `401 "Invalid credentials"` if the password is wrong. An attacker can enumerate valid user emails in seconds. Return the same generic 401 in both cases.

**Files:**
- Modify: `controllers/loginController.js`

- [ ] **Step 5.1: Unify the error response**

In `controllers/loginController.js`, find the `loginUser` function. Locate this block:

```js
    const user = await User.findOne({ email_address });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
```

Replace it with:

```js
    const user = await User.findOne({ email_address });
    const isValidPassword = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
```

The bcrypt call is short-circuited when the user doesn't exist, but the response is identical whether the email was wrong or the password was wrong. Timing differences remain (bcrypt takes longer than the short-circuit), but the status-code enumeration path is closed.

Note on timing: eliminating the timing difference would require running bcrypt against a dummy hash when the user doesn't exist. That's worth doing, but only once a user reports noticing the latency gap, or post-launch. Current fix closes the obvious enumeration vector.

- [ ] **Step 5.2: Commit**

```bash
git add controllers/loginController.js
git commit -m "fix: return generic 401 on bad email or bad password to prevent user enumeration"
```

---

## Task 6: Bump JWT expiry from 1h to 7d

**Why:** The spec explicitly calls this out: 1-hour expiry logs users out mid-session, which they'll complain about. Refresh tokens are post-v1 per spec, so 7 days is the simple correct answer.

**Files:**
- Modify: `controllers/loginController.js`

- [ ] **Step 6.1: Change the expiry**

In `controllers/loginController.js`, find:

```js
    const token = jwt.sign(
      { id: user._id, email_address: user.email_address, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
```

Change `'1h'` to `'7d'`.

Then find the cookie `maxAge`:

```js
    maxAge: 3600 * 1000,
```

Inside `getCookieOptions()`. Change to:

```js
    maxAge: 7 * 24 * 3600 * 1000,
```

Both JWT `expiresIn` and cookie `maxAge` must agree — otherwise the cookie expires but the token doesn't, or vice versa, producing weird auth states.

- [ ] **Step 6.2: Commit**

```bash
git add controllers/loginController.js
git commit -m "feat: bump JWT and session cookie expiry to 7 days"
```

---

## Task 7: Enforce minimum password length on signup

**Why:** Current signup controller accepts any password — including empty string. Minimum 8 chars is the lowest bar for a real product.

**Files:**
- Modify: `controllers/userController.js`

- [ ] **Step 7.1: Add validation in addUser**

In `controllers/userController.js`, replace the entire `addUser` function with:

```js
export async function addUser(req, res) {
  try {
    const { username, email_address, password } = req.body;

    if (typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (typeof email_address !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_address)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email_address });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      _id: undefined,
      username: username.trim(),
      email_address,
      password: hashedPassword,
    });

    const safeUser = {
      id: user._id,
      username: user.username,
      email_address: user.email_address,
    };

    return res.status(201).json({ message: 'User created successfully', user: safeUser });
  } catch (error) {
    console.error('addUser error:', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}
```

Changes from the original:
- Validates username, email format, and password length
- Never returns the password hash — `safeUser` contains only public fields
- `username.trim()` to avoid leading/trailing whitespace in stored usernames
- `console.error('addUser error:', error)` instead of bare `console.error(error)`
- Consistent `return res.status(...)` pattern

- [ ] **Step 7.2: Commit**

```bash
git add controllers/userController.js
git commit -m "feat: validate signup inputs and stop returning password hash"
```

---

## Task 8: Protect password hash exposure on `/api/me`

**Why:** `controllers/authController.js` returns user info from the JWT payload only, so no current exposure — but the pattern should be audited. More importantly, `findUser` in `userController.js` returns the whole user object including password hash on `POST /api/user/:id`.

**Files:**
- Modify: `controllers/userController.js`

- [ ] **Step 8.1: Protect findUser**

In `controllers/userController.js`, replace the `findUser` function with:

```js
export async function findUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ user });
  } catch (error) {
    console.error('findUser error:', error);
    return res.status(500).json({ error: 'Failed to retrieve user' });
  }
}
```

Changes: `.select('-password')` explicitly excludes the password field; `console.error` with label; consistent `return`.

- [ ] **Step 8.2: Verify authController.js is already safe**

Read `controllers/authController.js`. Confirm that the `/api/me` response constructs the user object manually from JWT-decoded fields (`id`, `email_address`, `username`) and does NOT query the DB. It should — this is a no-op verification task. If you find a DB query that returns the full user, add `.select('-password')`.

Expected outcome: authController.js needs no changes.

- [ ] **Step 8.3: Commit**

```bash
git add controllers/userController.js
git commit -m "fix: exclude password hash from findUser response"
```

---

## Task 9: Require auth on deck creation

**Why:** `POST /api/decks` currently trusts whatever's in the body — including the owner. Anyone can create decks under any user's account. Auth-gate it and derive `owner` from `req.user.id`.

**Files:**
- Modify: `routes/deckRoutes.js`, `controllers/deckController.js`

- [ ] **Step 9.1: Add auth middleware to POST /decks**

Replace `routes/deckRoutes.js` with:

```js
import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import {
  createDeckWithCards,
  getDecksByUser,
  getDecks,
  getDeckByID,
} from '../controllers/deckController.js';

const router = express.Router();

router.post('/decks', authenticateToken, createDeckWithCards);
router.get('/decks/:id', getDeckByID);
router.get('/decks/user/:user_id', getDecksByUser);
router.get('/decks', getDecks);

export default router;
```

- [ ] **Step 9.2: Derive owner from JWT in createDeckWithCards**

Read `controllers/deckController.js`. Find `createDeckWithCards`. It likely reads `owner` or a similar field from `req.body`. Change it to derive from `req.user.id` instead.

The exact patch depends on the current code. The general shape:

```js
// Before:
const { deck_name, format, commander, owner, /* ... */ } = req.body;
// owner is trusted from the body

// After:
const { deck_name, format, commander, /* ... */ } = req.body;
const owner = req.user.id;
```

Any validation that `owner` exists remains (it does now, because JWT-authenticated).

**IMPORTANT:** Read the current implementation before editing. If the code does more than the above (e.g., looks up the user by the body's owner id), simplify: the JWT already guarantees the user exists and is authenticated. The lookup is redundant.

- [ ] **Step 9.3: Smoke test (when live)**

```bash
curl -i -X POST http://localhost:3000/api/decks \
  -H "Content-Type: application/json" \
  -d "{\"deck_name\":\"test\",\"format\":\"Commander\"}"
```

Expected: 401 (no auth cookie).

Then with cookie:
```bash
curl -i -b cookies.txt -X POST http://localhost:3000/api/decks \
  -H "Content-Type: application/json" \
  -d "{\"deck_name\":\"test\",\"format\":\"Commander\"}"
```

Expected: 201 with a deck whose `owner` is the logged-in user's id.

Skip the live tests if DB is unreachable.

- [ ] **Step 9.4: Commit**

```bash
git add routes/deckRoutes.js controllers/deckController.js
git commit -m "feat: require auth on POST /decks and derive owner from JWT"
```

---

## Task 10: Require auth on card write routes

**Why:** `POST /api/cards`, `POST /api/cards/bulk`, `POST /api/cards/bulk-lookup` all accept writes to the shared card database without auth. Bulk-lookup is arguably read-ish (it looks up by name) but still hits the DB; bulk and addCard are writes. Gate all three.

**Files:**
- Modify: `routes/cardRoutes.js`

- [ ] **Step 10.1: Add auth middleware**

Replace `routes/cardRoutes.js` with:

```js
import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import {
  postCardsBulkByName,
  getAllCards,
  getCardsBySet,
  getCardBySetAndCollectorNumber,
  getCardByName,
  addCard,
  getRandomListOfCards,
  getCardByID,
  postBulkLookupByName,
} from '../controllers/cardController.js';

const router = express.Router();

router.get('/cards/id/:id', getCardByID);
router.get('/cards/name/:name', getCardByName);
router.get('/cards/randomList', getRandomListOfCards);
router.get('/cards/set/:set', getCardsBySet);
router.get('/cards/:set/:collectorNumber', getCardBySetAndCollectorNumber);
router.get('/cards/all', getAllCards);

router.post('/cards', authenticateToken, addCard);
router.post('/cards/bulk', authenticateToken, postCardsBulkByName);
router.post('/cards/bulk-lookup', authenticateToken, postBulkLookupByName);

export default router;
```

Changes from before: GET routes stay public; all three POST routes now require auth. Route order unchanged for GETs to preserve Express matching precedence (specific before general).

- [ ] **Step 10.2: Commit**

```bash
git add routes/cardRoutes.js
git commit -m "feat: require auth on card write and bulk-lookup routes"
```

---

## Task 11: Create `AIUsage` model for daily AI cap

**Why:** AI endpoints cost real money per call. A per-user daily cap with persistence protects against a runaway script or a compromised account. Mongo model is trivial, avoids a new dep.

**Files:**
- Create: `models/AIUsage.js`

- [ ] **Step 11.1: Create the model**

Create `models/AIUsage.js` with this content:

```js
import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema({
  user: { type: String, ref: 'User', required: true },
  date: { type: String, required: true },
  count: { type: Number, default: 0 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model('AIUsage', aiUsageSchema);
```

Design choices:
- `user` matches the `User._id` type (String UUID, consistent with the rest of the codebase)
- `date` is a string like `"2026-04-20"` — easier to query exactly than Date ranges, and the unique compound index makes the "one doc per user per day" semantics explicit
- `count` is an int, incremented via `$inc`

- [ ] **Step 11.2: Commit**

```bash
git add models/AIUsage.js
git commit -m "feat: add AIUsage model for per-user daily usage tracking"
```

---

## Task 12: Create AI usage cap middleware

**Why:** Middleware that checks + increments the counter, rejects with 429 over the cap. Goes in front of every AI route.

**Files:**
- Create: `middleware/aiUsageCap.js`

- [ ] **Step 12.1: Create the middleware**

Create `middleware/aiUsageCap.js` with this content:

```js
import AIUsage from '../models/AIUsage.js';

const DAILY_LIMIT = 20;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

export default async function aiUsageCap(req, res, next) {
  try {
    const user = req.user?.id;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const date = todayUTC();

    const record = await AIUsage.findOneAndUpdate(
      { user, date },
      { $inc: { count: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (record.count > DAILY_LIMIT) {
      return res.status(429).json({
        error: `Daily AI request limit reached (${DAILY_LIMIT} per day). Try again tomorrow.`,
      });
    }

    return next();
  } catch (err) {
    console.error('aiUsageCap error:', err);
    return res.status(500).json({ error: 'Failed to check usage limit' });
  }
}
```

Notes:
- `findOneAndUpdate` with `upsert: true` and `$inc` is atomic — no race between check and increment, even under concurrent requests.
- `todayUTC()` uses UTC date so the reset time is consistent regardless of user timezone (and regardless of where the server is deployed). 20 requests/day per user is plenty for exploration; tune down if it bites.
- Returns 429 with a user-friendly message.
- If incrementing fails (DB down), returns 500 — fail-closed rather than silently allowing uncapped requests.

- [ ] **Step 12.2: Commit**

```bash
git add middleware/aiUsageCap.js
git commit -m "feat: add middleware enforcing per-user daily AI usage cap"
```

---

## Task 13: Gate AI routes behind auth + cap + short-window rate limit

**Why:** Combine the three defenses. Cap is for total daily spend; limit is for burst protection; auth ties both to a user identity.

**Files:**
- Modify: `routes/aiRoutes.js`

- [ ] **Step 13.1: Apply all three middlewares**

Replace `routes/aiRoutes.js` with:

```js
import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import aiUsageCap from '../middleware/aiUsageCap.js';
import { aiLimiter } from '../middleware/rateLimiters.js';
import { generateDeckDeepSeek } from '../controllers/ai/deepseekAIController.js';
import { generateDeckGemini } from '../controllers/ai/geminiAIController.js';

const router = express.Router();

router.post('/deepseek', authenticateToken, aiLimiter, aiUsageCap, generateDeckDeepSeek);
router.post('/gemini', authenticateToken, aiLimiter, aiUsageCap, generateDeckGemini);

export default router;
```

Middleware order matters: auth first (cheapest rejection), limiter second (stops bursts before DB work), cap third (the expensive check that writes to Mongo), controller last.

- [ ] **Step 13.2: Smoke test (when live)**

```bash
# Unauthenticated
curl -i -X POST http://localhost:3000/api/deepseek -H "Content-Type: application/json" -d "{\"prompt\":\"test\"}"
```
Expected: 401.

```bash
# Authenticated, under cap
curl -i -b cookies.txt -X POST http://localhost:3000/api/deepseek -H "Content-Type: application/json" -d "{\"prompt\":\"test\"}"
```
Expected: 200 with deck content (if API key is valid) or 500 with a controller error (if API key is missing/invalid — outside this plan's scope).

```bash
# Burst more than 5 in a minute
for i in $(seq 1 8); do \
  curl -s -o /dev/null -w "%{http_code}\n" -b cookies.txt -X POST http://localhost:3000/api/deepseek \
    -H "Content-Type: application/json" -d "{\"prompt\":\"test $i\"}"; \
done
```
Expected: first 5 or so return 200 (or a 200-then-429 mix from the cap if you've already used many today), then 429 from the rate limiter.

Skip live tests if DB unreachable.

- [ ] **Step 13.3: Commit**

```bash
git add routes/aiRoutes.js
git commit -m "feat: gate AI endpoints with auth, rate limit, and daily cap"
```

---

## Task 14: Remove prompt logging from AI controllers

**Why:** `controllers/ai/deepseekAIController.js` currently runs `console.log(req.body)` and `console.log("test", promptRes)`. Logs are captured by Railway and surface in dashboards; user-submitted prompts may contain personal detail. Strip both.

**Files:**
- Modify: `controllers/ai/deepseekAIController.js`
- Modify: `controllers/ai/geminiAIController.js` (audit, remove if present)

- [ ] **Step 14.1: Strip deepseek logging**

In `controllers/ai/deepseekAIController.js`, remove these lines:

```js
console.log(req.body);
```
and
```js
console.log("test",promptRes);
```

Do NOT replace them with anything. If a future audit wants metric logging (duration, user, prompt-char-count), that's a separate concern handled without the raw content.

- [ ] **Step 14.2: Audit gemini controller**

Read `controllers/ai/geminiAIController.js`. Remove any `console.log(req.body)` or equivalent prompt-dump logging. Leave error-path logging in `catch` blocks untouched — those are useful for debugging and don't dump user input.

- [ ] **Step 14.3: Commit**

```bash
git add controllers/ai/deepseekAIController.js controllers/ai/geminiAIController.js
git commit -m "chore: stop logging user prompts and request bodies in AI controllers"
```

---

## Definition of Done

- [ ] All 14 task commits on `profile-api` (or a dedicated `security-hardening` branch)
- [ ] CI passes (GitHub Actions syntax check, from Plan 2)
- [ ] Manual smoke tests pass for the tasks whose tests can actually run
- [ ] `git log --oneline` shows a clean linear history for this plan
- [ ] README (if present) updated noting the per-user AI cap (optional)

## Post-launch follow-ups (not in this plan)

- Timing-safe login comparison (bcrypt dummy-hash run on unknown email)
- `helmet` CSP tuning if the frontend integrates third-party widgets
- Per-route input validation framework (zod) once more routes are added
- Refresh token flow to shorten access-token lifetime safely
- Password reset, email verification, 2FA
- IP-based temporary lockout after repeated login failures (beyond the rate limit)
- Audit logging for security-relevant events (login, password change, role change if roles appear)
