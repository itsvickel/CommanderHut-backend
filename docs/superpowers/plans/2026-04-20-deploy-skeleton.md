# Deploy Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the CommanderHut backend deployed to Railway, talking to a live frontend on Vercel, backed by MongoDB Atlas, with working cross-origin authentication and a minimal CI pipeline. End state: a production URL that the deployed frontend can actually log in against.

**Architecture:** Tasks 1-6 are code changes to make the backend deployable (env-driven config, cross-origin cookie flags, fail-fast env validation, health check, CI). Tasks 7-10 are ops tasks performed in vendor dashboards (Atlas, Railway, Vercel) — these cannot be subagent-executed but are documented step-by-step for the human operator.

**Tech Stack:** Node.js (ESM), Express 5, MongoDB Atlas, Railway (backend host), Vercel (frontend host — separate repo), GitHub Actions.

---

## Scope

**In scope (this plan):**
- Every code change required to make the backend safe to deploy behind HTTPS with a cross-origin frontend
- The Railway + Atlas ops steps
- Documenting the env vars the frontend repo (on Vercel) must be configured with — but not the frontend code itself

**Out of scope:**
- Rewriting the Vercel-side frontend (different repo)
- Rate limiting, helmet, input validation on non-profile routes (Plan 3 — Security Hardening)
- Custom domain purchase (Week 7 of the roadmap)
- Pre-existing `import { mongoose } from 'mongoose'` bad import on line 1 of profileController (pre-existing; delete anytime, unrelated)

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.env.example` | Create | Document every env var the server reads, with empty values |
| `server.js` | Modify | CORS origin driven by `process.env.CORS_ORIGIN`; fail-fast on missing `JWT_SECRET`; mount `/api/health` |
| `controllers/loginController.js` | Modify | Cookie flags corrected for cross-origin HTTPS (secure + sameSite based on real NODE_ENV); remove guessable JWT_SECRET fallback |
| `.github/workflows/ci.yml` | Create | Minimal syntax check on push to `main` |

No changes to `routes/`, `models/`, or the profile code that landed in Plan 1.

---

## Task 1: Create `.env.example`

**Why:** New contributors (and future-you on a fresh laptop) need to know which env vars the server reads. Committing this also makes missing env vars visible in PR review.

**Files:**
- Create: `.env.example`

- [ ] **Step 1.1: Create the file**

Create `.env.example` at the repo root with this exact content:

```
# MongoDB connection string (mongodb+srv:// URI from Atlas)
MONGODB_URI=

# JWT signing secret. Use `openssl rand -hex 64` to generate.
# REQUIRED in production. Server will refuse to boot without it.
JWT_SECRET=

# HTTP port the server binds to. Railway injects this automatically.
PORT=3000

# Allowed CORS origin for the frontend.
# Dev:  http://localhost:5173
# Prod: https://<your-vercel-app>.vercel.app
CORS_ORIGIN=http://localhost:5173

# Node environment. Set to "production" on Railway.
NODE_ENV=development

# AI provider API keys
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
```

- [ ] **Step 1.2: Verify `.env` is still gitignored**

Run: `git check-ignore .env`

Expected output: `.env`. If nothing prints, `.env` is NOT ignored — stop and investigate `.gitignore` before continuing.

- [ ] **Step 1.3: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example documenting all server env vars"
```

---

## Task 2: Drive CORS origin from env var

**Why:** `server.js` currently hardcodes `origin: 'http://localhost:5173'`. Any deployed frontend will be blocked by CORS. Read from `CORS_ORIGIN` env with a sensible dev default.

**Files:**
- Modify: `server.js`

- [ ] **Step 2.1: Update the CORS block**

In `server.js`, find:

```js
app.use(cors({
  origin: 'http://localhost:5173', // your frontend origin
  credentials: true,
}));
```

Replace with:

```js
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
```

- [ ] **Step 2.2: Verify the server still boots with default**

Run: `npm start`

Expected: boots without complaint (or fails on MongoDB connection if Atlas is paused — that's OK, the CORS config is module-level and evaluated at import). Kill with Ctrl+C.

- [ ] **Step 2.3: Commit**

```bash
git add server.js
git commit -m "feat: drive CORS origin from CORS_ORIGIN env var"
```

---

## Task 3: Fix cookie flags for cross-origin HTTPS auth

**Why:** Three bugs in `loginController.js` / `logoutController.js` together make production auth completely broken:
1. `secure: process.env.NODE_ENV === 'development'` is INVERTED. `secure: true` should apply in production (HTTPS), not in dev.
2. `sameSite: 'Strict'` blocks the browser from sending the cookie cross-origin. With the frontend on `*.vercel.app` and backend on `*.up.railway.app`, every request from the frontend is cross-site; `Strict` means the cookie is never sent. Production login appears to succeed, then every follow-up request behaves as logged out.
3. `JWT_SECRET || 'your-secret-key'` fallback means if the env var is missing in production, JWTs are signed with a universally-known secret and anyone can forge them.

All three must be fixed before deploy.

**Files:**
- Modify: `controllers/loginController.js`

- [ ] **Step 3.1: Replace the file contents**

Replace the entire contents of `controllers/loginController.js` with:

```js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 3600 * 1000,
    path: '/',
  };
}

export const loginUser = async (req, res) => {
  try {
    const { email_address, password } = req.body;

    const user = await User.findOne({ email_address });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email_address: user.email_address, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email_address: user.email_address,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to login' });
  }
};

export const logoutUser = (req, res) => {
  const { maxAge: _omit, ...clearOptions } = getCookieOptions();
  res.clearCookie('token', clearOptions);
  return res.status(200).json({ message: 'Logged out successfully' });
};
```

Changes:
- Removed module-level `const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'`. Reads `process.env.JWT_SECRET` at call time (Task 4 adds fail-fast).
- Shared `getCookieOptions()` helper so login and logout stay in sync.
- `secure: true` in production (HTTPS only), `false` in dev (so localhost HTTP still works).
- `sameSite: 'none'` in production (required for cross-site cookies from Vercel → Railway). `sameSite: 'lax'` in dev (better default than `'strict'` for the dev frontend, which may make cross-port requests).
- `path: '/'` explicit on both set and clear so the cookie covers all routes.

Note on `sameSite: 'none'` → requires `secure: true`. Both are gated on `isProd`, so they move together. This is intentional.

- [ ] **Step 3.2: Verify it still compiles/imports**

Run: `npm start`

Expected: boots without import errors (MongoDB connection may still fail — that's fine). Kill with Ctrl+C.

- [ ] **Step 3.3: Commit**

```bash
git add controllers/loginController.js
git commit -m "fix: cookie flags and JWT secret read for cross-origin HTTPS deploy"
```

---

## Task 4: Fail-fast on missing `JWT_SECRET` at boot

**Why:** If `JWT_SECRET` isn't set in Railway's env vars, Task 3's change means `jwt.sign` is called with `undefined` as the secret, which throws at runtime on the first login. Fail at boot instead — easier to diagnose, and you find it before a user does.

**Files:**
- Modify: `server.js`

- [ ] **Step 4.1: Add the check to the boot sequence**

In `server.js`, find the IIFE that connects to MongoDB:

```js
(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
})();
```

Immediately BEFORE the `(async () => {` line, add:

```js
// Fail fast if critical env vars are missing
const REQUIRED_ENV = ['JWT_SECRET', 'MONGODB_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4.2: Verify boot still works when env vars are present**

Run: `npm start`

Expected: same output as before (no new errors from the check itself; MongoDB connection can still fail). Kill with Ctrl+C.

- [ ] **Step 4.3: Verify boot fails when JWT_SECRET is missing**

Run (bash):

```bash
JWT_SECRET= npm start
```

Expected: prints `Missing required env var: JWT_SECRET` then exits. This confirms the guard fires.

On Windows cmd.exe or PowerShell, the equivalent `set JWT_SECRET= && npm start` may or may not empty the env var depending on shell — trust the bash form above or skip this step and verify by code inspection.

- [ ] **Step 4.4: Commit**

```bash
git add server.js
git commit -m "feat: fail fast at boot when JWT_SECRET or MONGODB_URI is missing"
```

---

## Task 5: Add `/api/health` endpoint

**Why:** Railway (and most PaaS providers) can be configured to probe a health endpoint and restart the container on failure. Default probe on `/` returns 404 because all routes are namespaced under `/api`. A one-line `/api/health` route that returns `{ ok: true, uptime }` is standard.

**Files:**
- Modify: `server.js`

- [ ] **Step 5.1: Mount the route**

In `server.js`, find the route mounting block:

```js
// Routes
app.use('/api', cardRoutes);
app.use('/api', userRoutes);
app.use('/api', deckRoutes);
app.use('/api', loginRoutes);
app.use('/api', authRoutes);
app.use('/api', aiRoutes);
app.use('/api', profileRoute);
```

Immediately BEFORE the `// Routes` comment, add:

```js
// Health check (used by Railway / uptime monitors)
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});
```

- [ ] **Step 5.2: Verify the route responds**

This one does NOT need a database. Start: `npm start`. If it hangs on Mongo, that's OK because the health route is registered before `app.listen`, but `app.listen` only fires after `connectDB()` succeeds — so if Mongo is unreachable you can't test this live.

**If Mongo is unreachable:** skip the live test and verify by code inspection only.

**If Mongo is reachable:** in another terminal:

```bash
curl -i http://localhost:3000/api/health
```

Expected: `HTTP/1.1 200 OK` with body `{"ok":true,"uptime":<number>}`.

- [ ] **Step 5.3: Commit**

```bash
git add server.js
git commit -m "feat: add GET /api/health endpoint for uptime probes"
```

---

## Task 6: Add minimal GitHub Actions CI workflow

**Why:** Per the spec: "Single GitHub Actions workflow on push to `main`: `npm install`; `node -c server.js` (syntax check). No test runner stage for v1." Catches imports that don't resolve and gross syntax errors before they reach Railway.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 6.1: Create the workflow file**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  syntax-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: node --check server.js
```

Notes:
- `node --check` (same as `node -c`) verifies parse/syntax without executing.
- `npm ci` uses the lockfile — faster and deterministic. If the repo has no `package-lock.json` yet, switch to `npm install`.

- [ ] **Step 6.2: Check for a lockfile**

Run: `ls package-lock.json 2>/dev/null || echo "MISSING"`

- If the file exists, continue to Step 6.3.
- If it prints `MISSING`, generate one first:
  ```bash
  npm install
  git add package-lock.json
  git commit -m "chore: add package-lock.json for reproducible installs"
  ```

- [ ] **Step 6.3: Commit the workflow**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add minimal GitHub Actions syntax check on push/PR to main"
```

- [ ] **Step 6.4 (post-push verification):** After pushing to GitHub, open the Actions tab on the repo and confirm the run passes. If it fails, investigate before moving on. You can come back to this step once Tasks 7-10 are done.

---

## Task 7: Prepare MongoDB Atlas for production

**Why:** Same cluster is fine for dev + v1 (free tier, single region). The important prep is network allowlist and credential hygiene. None of this is code — it's clicks in the Atlas UI.

**This task is a checklist — no code, no commits.**

- [ ] **Step 7.1: Wake the cluster if paused**

Log in to https://cloud.mongodb.com and find your cluster (the one whose SRV record is `cluster0.fatbwho.mongodb.net`). If the dashboard shows "Paused," click Resume. Wait until status is "Active."

- [ ] **Step 7.2: Create a dedicated deploy user (recommended)**

In Database Access → Add New Database User:
- Username: something like `commanderhut-prod`
- Password: autogenerate, save it in a password manager (you'll need it in Task 8)
- Role: `readWrite@commanderhut` (NOT atlasAdmin) — principle of least privilege

Do NOT use your existing dev credentials for the deploy. Separate creds = easier rotation.

- [ ] **Step 7.3: Configure IP Access List**

Railway does not publish a fixed egress IP on the free tier. Two options:
- **Option A (lazy, fine for launch):** Add `0.0.0.0/0` to the allow list. Security is entirely via your database user's strong password and TLS.
- **Option B (stricter):** Pay for Railway's dedicated egress IP add-on, then allowlist only that.

Pick Option A for v1 unless you have a reason. Document the choice.

- [ ] **Step 7.4: Record the new connection string**

In Database → Connect → Drivers, copy the `mongodb+srv://` URI template. Replace `<username>` / `<password>` with the new deploy user. Save for Task 8.

- [ ] **Step 7.5: Commit a note (optional)**

Not required. If you want a durable record, add a short note in `docs/ops/atlas.md` describing the allowlist choice and deploy-user name (never the password).

---

## Task 8: Deploy the backend to Railway

**Why:** This is where the server actually becomes reachable from the internet. No code changes here; all clicks in Railway.

**This task is a checklist — no commits unless Railway's build reveals a bug.**

- [ ] **Step 8.1: Create the Railway project**

1. Log in to https://railway.app.
2. New Project → Deploy from GitHub repo → pick this repo.
3. Railway auto-detects Node.js, uses `npm start`. No Procfile needed.

- [ ] **Step 8.2: Set env vars on the Railway service**

Settings → Variables, add:
- `MONGODB_URI` — the string from Task 7.4
- `JWT_SECRET` — a fresh secret (`openssl rand -hex 64`; do NOT reuse your dev secret)
- `NODE_ENV` — `production`
- `CORS_ORIGIN` — your Vercel frontend URL (leave as a placeholder like `https://placeholder.vercel.app` for now; update after Task 9)
- `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` — your API keys
- `PORT` — leave UNSET; Railway injects this automatically. Your `server.js` already reads it with a `3000` fallback.

- [ ] **Step 8.3: Trigger a deploy and verify**

After saving env vars, Railway redeploys automatically. Watch the build log for:
- `npm install` succeeds
- `node server.js` starts
- Log line `MongoDB connected`
- Log line `Server running on port <PORT>`

If any step fails, read the log carefully. Most likely cause: a typo in an env var, or Atlas IP allowlist blocking Railway.

- [ ] **Step 8.4: Hit the health endpoint from outside**

Railway assigns a URL like `https://commanderhut-backend-production.up.railway.app`. Run:

```bash
curl -i https://<your-railway-url>/api/health
```

Expected: `HTTP/1.1 200 OK` with `{"ok":true,"uptime":<seconds>}`.

- [ ] **Step 8.5: Configure Railway healthcheck (optional but recommended)**

Settings → Healthcheck → Path: `/api/health`. Railway will now restart the container if health fails.

- [ ] **Step 8.6: Enable crash email alerts**

Settings → Notifications → Email on deploy failure and crash. This is your v1 alerting system — enough for a few dozen users.

---

## Task 9: Deploy the frontend to Vercel (coordination only)

**Why:** The frontend lives in a separate repo. This plan does not modify frontend code, but documents the three env vars and two configuration steps the frontend repo must get right for auth to work against the Railway backend.

**This task is a checklist; do it in the frontend repo, not this one.**

- [ ] **Step 9.1: Create the Vercel project**

Import the frontend repo in Vercel. Vite detects automatically.

- [ ] **Step 9.2: Set frontend env vars in Vercel**

Vercel → Project → Settings → Environment Variables. The frontend needs (at minimum) a variable pointing at the Railway backend. Your frontend code probably uses something like `VITE_API_BASE_URL`. Set:

- `VITE_API_BASE_URL` (or whatever your code expects) = `https://<your-railway-url>/api`

- [ ] **Step 9.3: Ensure the frontend sends credentials on fetch**

Every `fetch` (or axios) call that hits the backend MUST include credentials. If it doesn't, the browser won't send the `token` cookie and auth will fail.

- Fetch: `fetch(url, { credentials: 'include' })`
- Axios: `axios.defaults.withCredentials = true`

Grep the frontend for `fetch(` and `axios.` and confirm.

- [ ] **Step 9.4: Circle back to Railway and update `CORS_ORIGIN`**

Once Vercel gives you the production URL (e.g., `https://commanderhut.vercel.app`), go back to Railway → Settings → Variables and set `CORS_ORIGIN` to that exact URL. Railway redeploys automatically.

**Important:** `CORS_ORIGIN` must match exactly — including protocol and no trailing slash. `https://commanderhut.vercel.app` is correct; `https://commanderhut.vercel.app/` (with slash) will fail silently.

---

## Task 10: Post-deploy smoke test

**Why:** Prove end-to-end production auth works before telling anyone about it.

**This task is verification only — no commits.**

- [ ] **Step 10.1: From the deployed frontend, register a new test user**

Open the Vercel URL in a real browser. Use the signup flow. Capture the email/password (will be deleted/ignored after).

- [ ] **Step 10.2: Log in from the frontend**

Log in. Open DevTools → Application → Cookies. Confirm:
- A `token` cookie exists on the backend domain (`*.up.railway.app` or your domain)
- `HttpOnly: true`
- `Secure: true`
- `SameSite: None`

If SameSite shows `Strict` or `Lax`, auth will break on subsequent requests. Re-check Task 3 landed.

- [ ] **Step 10.3: Perform an authenticated action**

From the frontend UI, update your profile (bio). Verify it persists on refresh.

- [ ] **Step 10.4: Log out and verify the cookie is cleared**

Hit logout. DevTools → Cookies → confirm `token` is gone. Try a protected action; confirm you get 401.

- [ ] **Step 10.5: Hit the backend directly via curl (sanity)**

```bash
curl -i -c cookies.txt -X POST https://<railway-url>/api/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://<vercel-url>" \
  -d "{\"email_address\":\"<test email>\",\"password\":\"<test pw>\"}"
```

Expected: 200 with `Set-Cookie: token=...; HttpOnly; Secure; SameSite=None; Path=/`.

Then:
```bash
curl -i -b cookies.txt https://<railway-url>/api/me
```

Expected: 200 with `{"isAuthenticated": true, ...}`.

- [ ] **Step 10.6: Clean up the test user**

Either delete the test user from the MongoDB Atlas console, or leave it — your call. Remove `cookies.txt` locally.

---

## Definition of Done

- [ ] All commits from Tasks 1-6 pushed to a branch (suggest: `deploy-skeleton`)
- [ ] PR opened and merged into `main`; CI green
- [ ] Railway deployment shows the backend running and `/api/health` returns 200 from the public URL
- [ ] Vercel deployment shows the frontend live
- [ ] Production login → profile edit → logout works end-to-end in a real browser
- [ ] `CORS_ORIGIN` in Railway matches the Vercel URL exactly
- [ ] Crash email alerts enabled in Railway

## Deferred to Plan 3 (Security Hardening)

- JWT expiry bump to 7 days (currently 1h — forces re-login too often for real users)
- `helmet` middleware
- `express-rate-limit` on `/login`, `/signup`, and global
- Input validation on non-profile routes
- Audit of every route for `.select('-password')` projection
- Per-user daily cap on AI endpoints
- Password reset / email verification
