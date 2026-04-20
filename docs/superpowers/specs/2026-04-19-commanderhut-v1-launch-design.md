# CommanderHut v1 Launch — Design Spec

**Date:** 2026-04-19
**Branch at time of writing:** `profile-api`
**Time budget:** ~10–15 hrs/week
**Target launch:** Week 8 (soft launch to public)

## Goal

Take CommanderHut from "works on my laptop" to "strangers can sign up and use it" in 8 weeks, with a feature set that is lean but identity-aware (profiles), and a security posture appropriate for a small real product.

## 1. MVP Scope

### In scope for v1

- Sign up, log in, log out (JWT)
- Generate a deck via AI (DeepSeek + Gemini — both are already built)
- Save a deck to your account
- View your own decks
- View and edit your own profile (username, bio, `avatar_url`, website)
- Public profile page at `/profile/:id` showing that user's decks (all decks are public in v1 — no privacy flag ships until post-launch)

### Explicitly out of scope for v1

These are intentional cuts — the Profile model already has fields supporting some of these, but the **features** do not ship in v1:

- Follow / unfollow, followers feed, likes, comments
- Deck editing after creation (only create + view)
- Public deck sharing by URL to non-authenticated users
- Password reset / email verification (document as known gap in README)
- Admin panel, moderation tooling
- Tests (write opportunistically when bugs surface; no pre-launch test suite push)

### Known code gaps to close for v1

- `updateProfile` in `controllers/profileController.js` is currently stubbed
- `PUT /api/profile` route not mounted in `routes/profileRoutes.js`
- `GET /api/profile/:id` should return the user's decks alongside profile data so the public profile page can render in one request
- CORS origin is hardcoded to `http://localhost:5173` in `server.js`; must be driven by `CORS_ORIGIN` env var before deploy
- No `.env.example` file exists

## 2. Roadmap (8 weeks)

### Week 1 — Deploy the skeleton
- Provision MongoDB Atlas M0 free-tier cluster
- Create `.env.example` documenting: `MONGODB_URI`, `PORT`, `JWT_SECRET`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `CORS_ORIGIN`
- Replace hardcoded CORS origin in `server.js` with `process.env.CORS_ORIGIN`
- Deploy backend to Railway
- Deploy frontend to Vercel
- Smoke test end-to-end sign-up + login against production URLs

### Week 2 — Finish profile API
- Implement `updateProfile` in `controllers/profileController.js` as a PATCH-style partial update on `bio`, `avatar_url`, `website`, `username`
- Mount `PUT /api/profile` in `routes/profileRoutes.js` behind auth middleware
- Update `GET /api/profile/:id` to populate/return that user's decks
- Input validation: length limits on bio/username, URL format on website and `avatar_url`

### Week 3 — Frontend wire-up for profile
- Profile edit form calls the new `PUT /api/profile` endpoint
- Public profile page at `/profile/:id` renders name, bio, avatar, website, and decks

### Week 4 — Buffer / polish
- Reserved for slippage from weeks 1–3
- If on schedule: copy, empty states, loading states, error messages

### Week 5 — Security hardening
- Complete all items in Section 4 below

### Week 6 — Fix and load test
- Fix anything found during hardening
- Run `autocannon` against public endpoints to catch obvious bottlenecks before real users hit them

### Week 7 — Private beta
- Invite 5–10 friends
- Watch Railway + Vercel logs daily
- Buy a domain (~$12/yr) and point it at the production services

### Week 8 — Public soft launch
- Post link to r/EDH, r/magicTCG, or personal network
- No paid advertising; keep launch small enough to handle issues manually

## 3. Infrastructure

### Hosting

| Layer | Service | Reason |
|-------|---------|--------|
| Database | MongoDB Atlas M0 (free) | Native Mongo, generous free tier, easy IP allowlist |
| Backend | Railway | No idle sleep; $5/mo free credit covers v1 |
| Frontend | Vercel | Zero-config Vite deploys |
| Secrets | Railway env vars | Never commit `.env` |
| Domain | Buy at week 7 | Use `*.up.railway.app` / `*.vercel.app` until then |

### CI

Single GitHub Actions workflow on push to `main`:
- `npm install`
- `node -c server.js` (syntax check)

No test runner stage for v1.

### Observability

- Railway and Vercel built-in logs
- Railway email alerts on crash
- No Sentry / Datadog / APM for v1

### Deployment flow

- `main` branch deploys to production automatically on push
- Feature branches (`profile-api`, etc.) are for local work; merge to `main` when ready
- No separate staging environment — at v1 scale, `main` serves that role
- Rollback procedure: redeploy previous git commit via Railway UI

## 4. Security Hardening Checklist

### Secrets and configuration
- [ ] `JWT_SECRET` is a long random string, stored in env, not in code
- [ ] `.env` listed in `.gitignore`; verified no historical secret leak in git (if any found, rotate)
- [ ] `.env.example` present with keys but no values

### Auth
- [ ] Password rules enforced server-side: minimum 8 characters
- [ ] bcrypt cost factor ≥ 10 on the User model
- [ ] JWT access token expiry set to 7 days (refresh tokens are post-v1)
- [ ] Every mutating route audited to confirm it sits behind `authMiddleware`

### HTTP
- [ ] `helmet` middleware added in `server.js`
- [ ] `express-rate-limit` configured: global 100 req/min per IP; 5 req/min on `/login` and `/signup`
- [ ] Body size limit: keep 20MB only on routes that need it (avatar upload); tighten others to ~100KB

### Input validation
- [ ] Validate every `req.body` using `zod` or `express-validator`
- [ ] Email format check on sign-up
- [ ] URL format check on profile website and `avatar_url`

### Data exposure
- [ ] No `password` hashes returned in any response (audit all `User.findOne` calls, add `.select('-password')` or explicit projection)
- [ ] AI endpoints `/deepseek` and `/gemini` require auth AND have a per-user daily cap to prevent cost abuse

### Logging
- [ ] No `console.log(req.body)` anywhere on auth-related routes

## 5. Launch Criteria

All must be true before posting the link publicly.

### Functional
- Sign up, log in, log out work in production
- Deck generation succeeds for both DeepSeek and Gemini, can be saved, and appears in "my decks"
- Profile editing works for bio, avatar, website, username
- Public profile page at `/profile/:id` renders name, bio, avatar, website, and decks
- Logging out on one device does not invalidate sessions on another device in a surprising way

### Security
- All items in Section 4 are checked off
- `.env` confirmed absent from git history
- Rate limiter verified: 10 fast failed logins triggers throttling
- Logged-out request to a protected route returns 401, not 500

### Infrastructure
- Frontend and backend on production URLs
- MongoDB Atlas IP allowlist configured (pinned to Railway egress if possible, else `0.0.0.0/0` with strong auth)
- Auto-deploy on push to `main` is working
- Logs have been read during a real request

### Operational
- Crash alerting is reaching the user's email
- Rollback procedure tested at least once
- Per-user daily cap on AI endpoints is active and documented

### Known gaps acceptable at launch (document in README)
- No password reset email
- No email verification
- No 2FA
- No automated test suite

## Architecture Notes

### Boundaries
The existing layer split — `routes → middleware → controllers → models` — is sound for this scope. No restructuring proposed. `services/` exists but is sparsely used; don't force business logic into it just for tidiness. Move code there only when a controller crosses ~150 lines or when the same logic is used from two places.

### Where complexity will grow
- **AI controllers** (`controllers/ai/`): these talk to third parties with money attached. Wrap external calls so the rate-limit / cost-cap logic lives in one place instead of being scattered across DeepSeek and Gemini handlers. This is a week-5 task, not now.
- **Profile + User relationship**: two models (`User` and `Profile`) for what is functionally one concept will create join noise. Leave it for v1; flag for review post-launch. Do not merge them mid-launch push.

### What not to build
No admin dashboard. No feature flags. No analytics. No A/B testing. No blog. No email newsletter. Post-launch decisions, driven by real usage.
