# Profile API Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the profile API on the `profile-api` branch — working `PUT /api/profile`, a `GET /api/profile/:id` that returns the user's decks, and authentication on every mutating profile route.

**Architecture:** Cookie-based JWT auth middleware (already used by `/api/me`) applied to profile mutations. Controllers validate input inline (no new framework). `findProfile` uses Mongoose `populate` to return decks alongside the profile in one response. Two latent infra bugs blocking auth — missing `cookie-parser` registration and a CommonJS/ESM mismatch in `authMiddleware.js` — are fixed as prerequisites.

**Tech Stack:** Node.js (ESM), Express 5, Mongoose 8, `jsonwebtoken`, `cookie-parser`, `bcrypt`. No test framework (per spec — manual smoke tests via curl).

---

## File Structure

Files touched by this plan:

| File | Action | Responsibility |
|------|--------|----------------|
| `server.js` | Modify | Register `cookie-parser` so `req.cookies` is populated |
| `middleware/authMiddleware.js` | Modify | Convert from CommonJS to ESM; tighten cookie read |
| `controllers/profileController.js` | Modify | Implement `updateProfile`; refactor `addProfile` to use authenticated user; enhance `findProfile` to populate decks; add inline validation |
| `routes/profileRoutes.js` | Modify | Apply `authenticateToken` to POST; add `PUT /profile` behind auth |

No new files. All changes are scoped to the four above.

---

## Task 1: Register `cookie-parser` in `server.js`

**Why:** `controllers/authController.js` and `middleware/authMiddleware.js` read `req.cookies.token`, but `cookie-parser` is listed in `package.json` and never registered in `server.js`. Without it, `req.cookies` is `undefined` and auth throws a `TypeError` before reaching any try/catch.

**Files:**
- Modify: `server.js`

- [ ] **Step 1.1: Add the import and register the middleware**

In `server.js`, add this import near the other imports at the top:

```js
import cookieParser from 'cookie-parser';
```

Then, immediately after the `express.urlencoded` line and before the `cors` block, add:

```js
app.use(cookieParser());
```

The relevant section of `server.js` should read:

```js
// Middleware: body parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Middleware: cookies
app.use(cookieParser());

// Middleware: CORS
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
```

- [ ] **Step 1.2: Start the server and verify it boots**

Run: `npm start`

Expected: `MongoDB connected` followed by `Server running on port 3000`. No errors about missing modules. Kill the server with Ctrl+C after confirming.

- [ ] **Step 1.3: Commit**

```bash
git add server.js
git commit -m "fix: register cookie-parser middleware so req.cookies is populated"
```

---

## Task 2: Convert `authMiddleware.js` to ESM

**Why:** The file uses `require` and `module.exports`, but `package.json` declares `"type": "module"`. Importing it from any ESM file fails. The PUT route in Task 5 depends on this middleware.

**Files:**
- Modify: `middleware/authMiddleware.js`

- [ ] **Step 2.1: Rewrite the file as ESM**

Replace the entire contents of `middleware/authMiddleware.js` with:

```js
import jwt from 'jsonwebtoken';

export default function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}
```

Changes from the original: `import jwt` instead of `require`; `export default` instead of `module.exports`; `req.cookies?.token` (optional chaining) for defense-in-depth; `process.env.JWT_SECRET` read at call time instead of module load time (so dotenv finishes first regardless of import order).

- [ ] **Step 2.2: Verify the server still boots**

Run: `npm start`

Expected: clean start, no import errors. Kill with Ctrl+C.

- [ ] **Step 2.3: Commit**

```bash
git add middleware/authMiddleware.js
git commit -m "fix: convert authMiddleware to ESM and harden cookie read"
```

---

## Task 3: Protect `POST /api/profile` and use the authenticated user

**Why:** `addProfile` currently trusts `user_id` from the request body, which means any client can create a profile for any user. Now that auth middleware is usable, the controller should derive the user from the JWT.

**Files:**
- Modify: `controllers/profileController.js`
- Modify: `routes/profileRoutes.js`

- [ ] **Step 3.1: Refactor `addProfile` to use `req.user.id`**

In `controllers/profileController.js`, replace the existing `addProfile` function with:

```js
export async function addProfile(req, res) {
  try {
    const userId = req.user.id;

    const existing = await Profile.findOne({ user: userId });
    if (existing) {
      return res.status(409).json({ error: 'Profile already exists for this user' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newProfile = await Profile.create({
      avatar_url: null,
      bio: 'Write a nice bio here :) ...',
      website: null,
      user: user._id,
      decks: [],
      followers: [],
      following: [],
      likes: [],
      last_active_at: Date.now(),
    });

    return res.status(201).json({
      message: 'Profile created with success',
      profile: newProfile,
    });
  } catch (err) {
    console.error('addProfile error:', err);
    return res.status(500).json({ error: 'Could not create a profile' });
  }
}
```

Changes: reads user from `req.user.id` (set by auth middleware); rejects duplicate profile creation with 409; logs the real error server-side so failures are debuggable; returns 201 for created.

- [ ] **Step 3.2: Apply auth middleware to POST in the router**

Replace the contents of `routes/profileRoutes.js` with:

```js
import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import { getAllProfile, findProfile, addProfile } from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile', getAllProfile);
router.get('/profile/:id', findProfile);

router.post('/profile', authenticateToken, addProfile);

export default router;
```

- [ ] **Step 3.3: Smoke test: unauthenticated POST is rejected**

Start the server: `npm start` (leave running in another terminal).

Run:

```bash
curl -i -X POST http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{}"
```

Expected: `HTTP/1.1 401 Unauthorized` with JSON body `{"error":"No token, authorization denied"}`.

- [ ] **Step 3.4: Commit**

```bash
git add controllers/profileController.js routes/profileRoutes.js
git commit -m "feat: require auth on POST /api/profile and derive user from JWT"
```

Leave the server running for subsequent tasks if convenient, or restart as needed.

---

## Task 4: Implement `updateProfile` controller

**Why:** The stubbed `updateProfile` is the core of this plan. It must accept a partial update of user-editable profile fields, validate inputs, reject updates to someone else's profile, and return the updated document.

**Files:**
- Modify: `controllers/profileController.js`

- [ ] **Step 4.1: Add a validation helper at the top of the file**

In `controllers/profileController.js`, just below the imports, add:

```js
const ALLOWED_UPDATE_FIELDS = ['avatar_url', 'bio', 'website'];
const URL_REGEX = /^https?:\/\/[^\s]+$/i;

function pickAllowed(body) {
  const out = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

function validateProfileUpdate(fields) {
  if (fields.bio !== undefined) {
    if (typeof fields.bio !== 'string') return 'bio must be a string';
    if (fields.bio.length > 500) return 'bio must be 500 characters or fewer';
  }
  if (fields.website !== undefined && fields.website !== null && fields.website !== '') {
    if (typeof fields.website !== 'string' || !URL_REGEX.test(fields.website)) {
      return 'website must be a valid http(s) URL';
    }
  }
  if (fields.avatar_url !== undefined && fields.avatar_url !== null && fields.avatar_url !== '') {
    if (typeof fields.avatar_url !== 'string' || !URL_REGEX.test(fields.avatar_url)) {
      return 'avatar_url must be a valid http(s) URL';
    }
  }
  return null;
}
```

Notes on scope:
- `username` is stored on the `User` model, not `Profile`, so it's excluded from this endpoint. Username changes would belong on a separate user-update route; leave for a later plan.
- Empty string is accepted for `website` and `avatar_url` to let users clear the field; `null` is also accepted.

- [ ] **Step 4.2: Replace the stubbed `updateProfile` with the real implementation**

Replace the empty `updateProfile` function body with:

```js
export async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const updates = pickAllowed(req.body);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const error = validateProfileUpdate(updates);
    if (error) {
      return res.status(400).json({ error });
    }

    const updated = await Profile.findOneAndUpdate(
      { user: userId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({ profile: updated });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}
```

Notes:
- Ownership enforcement is implicit: the query filter is `{ user: userId }` from the JWT, so a user can only update their own profile. No need for a separate 403 path.
- `runValidators: true` makes Mongoose honor the `maxLength: 500` on `bio` as a second line of defense.

- [ ] **Step 4.3: Commit (controller only; route wiring comes next)**

```bash
git add controllers/profileController.js
git commit -m "feat: implement updateProfile with validation and ownership enforcement"
```

---

## Task 5: Mount `PUT /api/profile` behind auth

**Why:** The controller is useless without a route. Use PUT for partial updates per the spec (conventional, and consistent with `findOneAndUpdate`'s upsert-style semantics in other parts of the codebase).

**Files:**
- Modify: `routes/profileRoutes.js`

- [ ] **Step 5.1: Import `updateProfile` and register the route**

Replace the contents of `routes/profileRoutes.js` with:

```js
import express from 'express';
import authenticateToken from '../middleware/authMiddleware.js';
import {
  getAllProfile,
  findProfile,
  addProfile,
  updateProfile,
} from '../controllers/profileController.js';

const router = express.Router();

router.get('/profile', getAllProfile);
router.get('/profile/:id', findProfile);

router.post('/profile', authenticateToken, addProfile);
router.put('/profile', authenticateToken, updateProfile);

export default router;
```

- [ ] **Step 5.2: Smoke test: unauthenticated PUT returns 401**

Make sure the server is running (`npm start` in another terminal).

Run:

```bash
curl -i -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"bio\":\"hi\"}"
```

Expected: `HTTP/1.1 401 Unauthorized` with body `{"error":"No token, authorization denied"}`.

- [ ] **Step 5.3: Smoke test: authenticated PUT updates bio**

First, log in to capture the JWT cookie into a cookie jar:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"email_address\":\"<your test user email>\",\"password\":\"<your test user password>\"}"
```

Expected: `HTTP/1.1 200 OK` with a `Set-Cookie: token=...` header. If you don't have a test user, register one first via the existing signup endpoint.

Then, PUT the profile using the cookie:

```bash
curl -i -b cookies.txt -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"bio\":\"Updated bio from plan\",\"website\":\"https://example.com\"}"
```

Expected: `HTTP/1.1 200 OK` with JSON `{ "profile": { ... "bio": "Updated bio from plan", "website": "https://example.com" ... } }`.

- [ ] **Step 5.4: Smoke test: validation rejects bad input**

```bash
curl -i -b cookies.txt -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"website\":\"not-a-url\"}"
```

Expected: `HTTP/1.1 400 Bad Request` with `{"error":"website must be a valid http(s) URL"}`.

```bash
curl -i -b cookies.txt -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"unknown_field\":\"x\"}"
```

Expected: `HTTP/1.1 400 Bad Request` with `{"error":"No updatable fields provided"}` (because no field from the allow-list was present).

- [ ] **Step 5.5: Commit**

```bash
git add routes/profileRoutes.js
git commit -m "feat: mount PUT /api/profile behind auth"
```

---

## Task 6: Enhance `findProfile` to populate decks

**Why:** The public profile page needs to render the user's decks. Currently `GET /api/profile/:id` returns only the raw profile — the frontend would have to make a second call. One populated response is cleaner and matches what the spec calls out.

**Files:**
- Modify: `controllers/profileController.js`

- [ ] **Step 6.1: Replace `findProfile` with a populated version**

In `controllers/profileController.js`, replace the existing `findProfile` with:

```js
export async function findProfile(req, res) {
  try {
    const { id } = req.params;

    const profile = await Profile.findOne({ user: id })
      .populate({
        path: 'decks',
        select: 'deck_name format commander commander_image tags is_public created_at',
      })
      .lean();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({ profile });
  } catch (err) {
    console.error('findProfile error:', err);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
}
```

Notes:
- `select` on the populate projection keeps the response lean — we do not return the full `cards` array (hundreds of entries per deck).
- `.lean()` returns plain objects, faster when not persisting changes.
- Deck privacy: the current `Deck.is_public` flag is returned so the frontend can badge private decks. Filtering private decks out of other users' profile views is **deliberately out of scope for this plan** (spec note: privacy model isn't shipping in v1). The frontend should decide what to render.

- [ ] **Step 6.2: Smoke test: unauthenticated GET returns profile with decks**

Use a known user id (pick one from a recent registration, or query `GET /api/profile` to see profiles and copy a `user` id):

```bash
curl -i http://localhost:3000/api/profile/<user_id>
```

Expected: `HTTP/1.1 200 OK` with JSON containing `profile.decks` as an array. If the user has no decks, `decks` is `[]`. If they have decks, each entry should include `deck_name`, `format`, `commander`, etc., and should NOT include a `cards` field.

- [ ] **Step 6.3: Commit**

```bash
git add controllers/profileController.js
git commit -m "feat: populate decks on GET /api/profile/:id"
```

---

## Task 7: End-to-end smoke test

**Why:** Tasks 3–6 each tested one slice. This task runs the full flow in order so you catch interactions (cookie persistence, idempotency, stale data in Mongo from prior runs).

**Files:** none modified — this is verification only.

- [ ] **Step 7.1: Restart the server clean**

Stop any running server. Run `npm start`. Confirm clean boot.

- [ ] **Step 7.2: Log in as a test user**

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d "{\"email_address\":\"<test email>\",\"password\":\"<test pw>\"}"
```

Expected: 200 with `Set-Cookie: token=...`.

- [ ] **Step 7.3: POST /profile (if no profile exists yet)**

```bash
curl -i -b cookies.txt -X POST http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{}"
```

Expected: 201 with the new profile, OR 409 if one already exists for this user. Both are acceptable for the purposes of this test.

- [ ] **Step 7.4: PUT /profile with real data**

```bash
curl -i -b cookies.txt -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"bio\":\"E2E test bio\",\"website\":\"https://example.com\",\"avatar_url\":\"https://example.com/avatar.png\"}"
```

Expected: 200 with the profile showing all three updated fields.

- [ ] **Step 7.5: GET /profile/:id as a public fetch**

Extract the `user` id from the PUT response (it's the `user` field on the returned profile), then:

```bash
curl -i http://localhost:3000/api/profile/<user_id>
```

Expected: 200 with the same three fields (bio, website, avatar_url) visible and `decks` populated as an array (empty or not).

- [ ] **Step 7.6: Verify auth still rejects a bad cookie**

```bash
curl -i -b "token=garbage" -X PUT http://localhost:3000/api/profile -H "Content-Type: application/json" -d "{\"bio\":\"should fail\"}"
```

Expected: 403 with `{"error":"Invalid token"}`.

- [ ] **Step 7.7: Clean up the cookie jar and confirm the branch is ready**

```bash
rm cookies.txt
git status
git log --oneline profile-api ^main | head -20
```

Expected: working tree clean, and the log shows the six commits from Tasks 1–6.

- [ ] **Step 7.8: Final bookkeeping commit (only if there are uncommitted changes)**

If `git status` shows anything stray (e.g., a forgotten edit), stage and commit. Otherwise skip.

---

## Out of scope for this plan (acknowledged, not forgotten)

- Bumping JWT expiry from 1h to 7 days (Plan 3 — Security Hardening)
- Fixing the inverted `secure: NODE_ENV === 'development'` cookie flag in `loginController.js` (Plan 3)
- `username` edits (User model update — separate plan if desired)
- Deck/User model `_id` type mismatches (`User._id` is String UUID, `Deck.owner` is ObjectId) — affects links between decks and users but not the profile → decks relationship this plan uses
- Frontend wiring (separate repo, Week 3 of the roadmap)
- Rate limiting, helmet, etc. (Plan 3)
