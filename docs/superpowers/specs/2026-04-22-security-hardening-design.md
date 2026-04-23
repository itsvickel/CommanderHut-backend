# Security Hardening — Design Spec

**Date:** 2026-04-22
**Branch at time of writing:** `main` (create feature branch `security-hardening` before coding)
**Depends on:** `ai-deck-builder` merged to `main` (for `dailyCap` middleware)

## Goal

Close the remaining pre-launch security gaps identified in the v1 launch checklist. Everything else on the checklist is already done — this spec covers the four items still outstanding.

## 1. Scope

### In scope

1. Protect `/deepseek` and `/gemini` AI endpoints with `authMiddleware` + `dailyCap`
2. Add input validation to the login endpoint
3. Cap `username` max length at 30 chars on signup
4. Verify `.env` is listed in `.gitignore`

### Explicitly out of scope

- Installing `zod` or `express-validator` (existing inline validation is sufficient for v1)
- CSRF protection (HttpOnly cookies + SameSite mitigate the main risk; post-v1)
- Password reset, email verification, 2FA (documented known gaps)
- Rate limiting beyond what's already in place

## 2. Changes

### 2.1 Protect old AI endpoints

**File:** `routes/aiRoutes.js`

Add `authMiddleware` and `dailyCap` to the `/deepseek` and `/gemini` routes:

```js
router.post('/deepseek', authMiddleware, dailyCap, generateDeckDeepSeek);
router.post('/gemini', authMiddleware, dailyCap, generateDeckGemini);
```

The `dailyCap` middleware is keyed on `userId + UTC date` and counts all three AI routes toward the same 20/day limit per user. No changes to `dailyCap.js` needed.

### 2.2 Login input validation

**File:** `controllers/loginController.js`

Add a guard at the top of `loginUser`, before the DB query:

```js
if (
  typeof email_address !== 'string' || !email_address.trim() ||
  typeof password !== 'string' || !password
) {
  return res.status(400).json({ error: 'email_address and password are required' });
}
```

This prevents garbage reaching `User.findOne` and `bcrypt.compare`. No email-format regex needed here — wrong format simply won't match any stored user, which is handled by the existing `Invalid credentials` 401 response.

### 2.3 Username max length on signup

**File:** `controllers/userController.js`

Add a max-length check alongside the existing min-length check:

```js
if (username.length < 2 || username.length > 30) {
  return res.status(400).json({ error: 'username must be 2–30 characters' });
}
```

Replace the existing separate min-length check with this combined check.

### 2.4 Verify `.env` in `.gitignore`

**File:** `.gitignore`

Confirm `.env` is present. If missing, add it. No other changes.

## 3. Errors

| Case | Status | Notes |
|------|--------|-------|
| Unauthenticated request to `/deepseek` or `/gemini` | 401 | Existing `authMiddleware` behaviour |
| Over daily cap on `/deepseek` or `/gemini` | 429 | Existing `dailyCap` behaviour with `Retry-After` header |
| Missing/empty `email_address` or `password` on login | 400 | New guard in `loginController` |
| `username` < 2 or > 30 chars on signup | 400 | Combined check replaces current min-only check |

## 4. Testing

No new unit tests. All changes are thin guards.

- Run `npm test` — all 36 existing tests must stay green.
- Manual smoke tests:
  - Unauthenticated POST to `/api/ai/deepseek` → 401
  - Authenticated POST to `/api/ai/deepseek` → proxied to DeepSeek (or 502 if key not set)
  - POST `/api/auth/login` with empty body → 400
  - POST `/api/auth/signup` with 31-char username → 400

## 5. Rollout

1. Create branch `security-hardening` from `main` (after `ai-deck-builder` is merged).
2. Apply the four changes.
3. Run `npm test`.
4. Merge to `main` via PR.
