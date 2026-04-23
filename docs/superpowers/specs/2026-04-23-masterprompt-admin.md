# Masterprompt Admin — Design Spec

## Goal

Store the AI system prompt in MongoDB so admins can edit it at runtime without a code deploy, and enforce domain restrictions (MTG Commander only) that can't be bypassed by user input.

## Architecture

The current hardcoded `systemPrompt()` in `geminiClient.js` is replaced by an async `buildSystemPrompt()` that fetches a singleton `MasterPrompt` document from MongoDB. The prompt is compiled from admin-editable sections plus a hardcoded `output_format` block that is never stored in the database. An in-memory cache (60s TTL) prevents a DB hit on every LLM call. Admin API endpoints (protected by role) allow reading and updating the stored sections.

## Tech Stack

- Mongoose (new `MasterPrompt` model, `is_admin` field on `User`)
- Express (two new admin routes)
- In-memory JS object for prompt cache (no Redis — overkill for this use case)

---

## Data Model

### `MasterPrompt` (singleton collection)

| Field | Type | Admin-editable | Description |
|---|---|---|---|
| `role_description` | String | Yes | AI persona ("You are a Commander deck-building expert") |
| `domain_restrictions` | String | Yes | Topic guard ("Only help with MTG Commander. Refuse all other topics.") |
| `additional_rules` | String | Yes | Free-form extra rules, bracket overrides, etc. |
| `updated_at` | Date | Auto | Set on every save |
| `updated_by` | String (UUID) | Auto | User ID of last saver |

`output_format` is **never stored in the database**. It is hardcoded in the server and shown read-only in the frontend UI. This ensures the JSON schema instructions that the pipeline depends on can never be accidentally deleted.

### `User` model change

```js
is_admin: { type: Boolean, default: false }
```

Set manually via a seed script or direct MongoDB update. No self-promotion endpoint.

---

## Prompt Compilation

`buildSystemPrompt({ budget_usd, power_bracket })` compiles sections in this order:

1. `role_description` (from DB)
2. `domain_restrictions` (from DB)
3. `OUTPUT_FORMAT` (hardcoded constant in server code)
4. `additional_rules` (from DB, omitted if empty)
5. Power bracket note (injected per request, same as today)
6. Budget note (injected per request if present, same as today)

Sections are joined with `\n\n`. Empty strings are filtered out.

### Default seed

On server startup, if no `MasterPrompt` document exists, one is created with the current hardcoded values so the system works out-of-the-box without manual DB setup.

### Cache

- In-memory object: `{ data: MasterPromptDoc | null, expiresAt: number }`
- TTL: 60 seconds
- Invalidated immediately on `PUT /api/admin/masterprompt`
- On cache miss, fetch from DB and set expiry

---

## API Endpoints

Both endpoints require `authMiddleware` + `adminMiddleware`.

### `GET /api/admin/masterprompt`

Returns the current stored prompt sections plus the hardcoded `output_format` for display:

```json
{
  "role_description": "...",
  "domain_restrictions": "...",
  "additional_rules": "...",
  "output_format": "Output ONLY valid JSON ...",
  "updated_at": "2026-04-23T10:00:00.000Z",
  "updated_by": "uuid-string"
}
```

### `PUT /api/admin/masterprompt`

Body (all fields optional — only present fields are updated):

```json
{
  "role_description": "...",
  "domain_restrictions": "...",
  "additional_rules": "..."
}
```

- Validates that each present field is a non-empty string (or empty string for `additional_rules`)
- Sets `updated_at` to `Date.now()`, `updated_by` to `req.user.id`
- Invalidates prompt cache
- Returns the updated document (same shape as GET)

---

## Middleware

### `adminMiddleware`

```js
export function adminMiddleware(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}
```

Runs after `authMiddleware` (which populates `req.user`).

`req.user` is populated from the JWT payload. Since `is_admin` needs to be on `req.user`, the JWT must include it — or `adminMiddleware` must do a DB lookup. **Decision: DB lookup** (one extra query per admin request — acceptable, admin endpoints are low traffic and this avoids stale JWT issues when a user's admin status changes).

---

## Files Changed

| File | Action | What changes |
|---|---|---|
| `models/MasterPrompt.js` | Create | Singleton model |
| `models/User.js` | Modify | Add `is_admin` field |
| `middleware/adminMiddleware.js` | Create | Role check + DB lookup |
| `services/aiDeckBuilder/promptCache.js` | Create | In-memory cache + `buildSystemPrompt()` |
| `services/aiDeckBuilder/geminiClient.js` | Modify | Call `buildSystemPrompt()` instead of `systemPrompt()` |
| `controllers/admin/masterpromptController.js` | Create | GET + PUT handlers |
| `routes/adminRoutes.js` | Create | Wire admin endpoints |
| `server.js` | Modify | Mount `/api/admin` router + run seed on startup |

---

## Error Handling

- `GET /api/admin/masterprompt` — 500 if DB fetch fails
- `PUT /api/admin/masterprompt` — 400 for invalid field types, 500 if DB save fails
- If DB is unavailable during `buildSystemPrompt()`, fall back to the hardcoded default values (logged as a warning) so AI deck generation still works

---

## Out of Scope

- Frontend admin UI (built separately in the frontend repo)
- Multiple prompt profiles / versioning
- Prompt history / audit log
- Self-service admin promotion
