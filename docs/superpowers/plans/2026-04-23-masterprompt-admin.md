# Masterprompt Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the AI system prompt in MongoDB with structured sections so admins can edit it at runtime via API, preventing off-topic requests and avoiding code deploys for prompt changes.

**Architecture:** A singleton `MasterPrompt` MongoDB document holds editable sections (`role_description`, `domain_restrictions`, `additional_rules`). An in-memory cache (60s TTL) serves these to `geminiClient.js` via a new `buildSystemPrompt()` function. Two admin-only endpoints (GET/PUT `/api/admin/masterprompt`) let the frontend read and update the prompt. A DB lookup in `adminMiddleware` enforces the `is_admin` flag on the User model (not JWT, so revocation is immediate).

**Tech Stack:** Mongoose, Express, Vitest (vi.mock pattern), Node.js in-memory cache object

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `models/MasterPrompt.js` | Create | Singleton prompt document schema |
| `models/User.js` | Modify | Add `is_admin: Boolean` field |
| `middleware/adminMiddleware.js` | Create | DB-lookup admin role check |
| `services/aiDeckBuilder/promptCache.js` | Create | In-memory cache + `buildSystemPrompt()` + `OUTPUT_FORMAT` export |
| `services/aiDeckBuilder/geminiClient.js` | Modify | Replace `systemPrompt()` with `await buildSystemPrompt()` + remove debug log |
| `controllers/admin/masterpromptController.js` | Create | GET + PUT handlers |
| `routes/adminRoutes.js` | Create | Wire admin endpoints with auth + admin middleware |
| `server.js` | Modify | Mount admin router + call `seedMasterPrompt()` after DB connect |
| `tests/middleware/adminMiddleware.test.js` | Create | Unit tests for admin check |
| `tests/services/promptCache.test.js` | Create | Unit tests for cache + buildSystemPrompt |
| `tests/controllers/masterpromptController.test.js` | Create | Unit tests for GET/PUT handlers |

---

### Task 1: MasterPrompt model + User.is_admin

**Files:**
- Create: `models/MasterPrompt.js`
- Modify: `models/User.js`

- [ ] **Step 1: Write the failing test for MasterPrompt model shape**

Create `tests/models/masterPrompt.test.js`:

```js
import { vi, describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

// We test the schema shape without a real DB connection
describe('MasterPrompt schema', () => {
  it('should be importable and have the expected paths', async () => {
    const { default: MasterPrompt } = await import('../../models/MasterPrompt.js');
    const paths = MasterPrompt.schema.paths;
    expect(paths).toHaveProperty('role_description');
    expect(paths).toHaveProperty('domain_restrictions');
    expect(paths).toHaveProperty('additional_rules');
    expect(paths).toHaveProperty('updated_by');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/models/masterPrompt.test.js
```

Expected: FAIL with "Cannot find module '../../models/MasterPrompt.js'"

- [ ] **Step 3: Create `models/MasterPrompt.js`**

```js
import mongoose from 'mongoose';

const masterPromptSchema = new mongoose.Schema({
  role_description: { type: String, required: true },
  domain_restrictions: { type: String, required: true },
  additional_rules: { type: String, default: '' },
  updated_by: { type: String, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('MasterPrompt', masterPromptSchema);
```

- [ ] **Step 4: Add `is_admin` to `models/User.js`**

Replace the schema definition (add `is_admin` field):

```js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userSchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  username: { type: String, required: true },
  email_address: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  is_admin: { type: Boolean, default: false },
}, {
  _id: false,
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

export default mongoose.model('User', userSchema);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/models/masterPrompt.test.js
```

Expected: PASS

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add models/MasterPrompt.js models/User.js tests/models/masterPrompt.test.js
git commit -m "feat(masterprompt): MasterPrompt model + User.is_admin field"
```

---

### Task 2: adminMiddleware

**Files:**
- Create: `middleware/adminMiddleware.js`
- Create: `tests/middleware/adminMiddleware.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/middleware/adminMiddleware.test.js`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/User.js', () => ({
  default: { findById: vi.fn() },
}));

import User from '../../models/User.js';
import adminMiddleware from '../../middleware/adminMiddleware.js';

function makeRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe('adminMiddleware', () => {
  it('calls next() when user is admin', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ is_admin: true }) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ is_admin: false }) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin only' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user not found', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when DB throws', async () => {
    User.findById.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });
    const req = { user: { id: 'uuid-123' } };
    const res = makeRes();
    const next = vi.fn();
    await adminMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to verify admin status' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/middleware/adminMiddleware.test.js
```

Expected: FAIL with "Cannot find module '../../middleware/adminMiddleware.js'"

- [ ] **Step 3: Create `middleware/adminMiddleware.js`**

```js
import User from '../models/User.js';

export default async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });
    next();
  } catch {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/middleware/adminMiddleware.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add middleware/adminMiddleware.js tests/middleware/adminMiddleware.test.js
git commit -m "feat(masterprompt): adminMiddleware with DB-lookup role check"
```

---

### Task 3: promptCache + buildSystemPrompt

**Files:**
- Create: `services/aiDeckBuilder/promptCache.js`
- Create: `tests/services/promptCache.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/promptCache.test.js`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/MasterPrompt.js', () => ({
  default: { findOne: vi.fn() },
}));

import MasterPrompt from '../../models/MasterPrompt.js';
import {
  buildSystemPrompt,
  invalidatePromptCache,
  OUTPUT_FORMAT,
} from '../../services/aiDeckBuilder/promptCache.js';

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePromptCache();
});

const docFixture = {
  role_description: 'You are a test expert.',
  domain_restrictions: 'Only MTG.',
  additional_rules: 'Extra rule.',
};

describe('OUTPUT_FORMAT', () => {
  it('is a non-empty string containing json keyword', () => {
    expect(typeof OUTPUT_FORMAT).toBe('string');
    expect(OUTPUT_FORMAT.toLowerCase()).toContain('json');
  });
});

describe('buildSystemPrompt', () => {
  it('fetches from DB on first call and includes all sections', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(MasterPrompt.findOne).toHaveBeenCalledOnce();
    expect(result).toContain(docFixture.role_description);
    expect(result).toContain(docFixture.domain_restrictions);
    expect(result).toContain(OUTPUT_FORMAT);
    expect(result).toContain(docFixture.additional_rules);
    expect(result).toContain('Power Bracket 2');
  });

  it('uses cache on second call without hitting DB again', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(MasterPrompt.findOne).toHaveBeenCalledOnce();
  });

  it('re-fetches after invalidatePromptCache()', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    invalidatePromptCache();
    await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(MasterPrompt.findOne).toHaveBeenCalledTimes(2);
  });

  it('falls back to defaults when DB returns null', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(result).toContain('Commander deck-building expert');
  });

  it('falls back to defaults when DB throws', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB down')) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 1 });
    expect(result).toContain('Commander deck-building expert');
  });

  it('includes budget note when budget_usd is provided', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: 100, power_bracket: 2 });
    expect(result).toContain('$100 USD');
  });

  it('omits budget note when budget_usd is null', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(result).not.toContain('USD');
  });

  it('omits additional_rules section when it is empty', async () => {
    MasterPrompt.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...docFixture, additional_rules: '' }),
    });
    const result = await buildSystemPrompt({ budget_usd: null, power_bracket: 2 });
    expect(result).toContain(docFixture.domain_restrictions);
    expect(result).toContain(OUTPUT_FORMAT);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/promptCache.test.js
```

Expected: FAIL with "Cannot find module '../../services/aiDeckBuilder/promptCache.js'"

- [ ] **Step 3: Create `services/aiDeckBuilder/promptCache.js`**

```js
import MasterPrompt from '../../models/MasterPrompt.js';

export const OUTPUT_FORMAT = [
  'Output ONLY valid JSON — no markdown, no bold (**), no explanation, no code fences.',
  'Required JSON keys:',
  '  commander: string (exact real Magic: The Gathering card name)',
  '  color_identity: array of letters from W U B R G only',
  '  strategy: string, max 400 chars',
  '  signature_cards: array of 25-35 objects, each with:',
  '    name: string (exact real Magic: The Gathering card name)',
  '    role: one of win_con | ramp | draw | removal | interaction | synergy | utility',
  'Do not invent card names.',
].join('\n');

const DEFAULTS = {
  role_description: 'You are a Commander deck-building expert.',
  domain_restrictions:
    'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
  additional_rules: '',
};

const BRACKET_NOTES = {
  1: 'Ultra-casual: no Game Changers, no fast mana, no tutors.',
  2: 'Precon-level core: limited tutors, no Game Changers.',
  3: 'Upgraded precons: no Game Changers; avoid mass land destruction.',
  4: 'Optimized, non-cEDH. All Game Changers allowed.',
  5: 'Competitive EDH. Anything format-legal.',
};

let cache = { data: null, expiresAt: 0 };

export function invalidatePromptCache() {
  cache = { data: null, expiresAt: 0 };
}

async function fetchPrompt() {
  try {
    const doc = await MasterPrompt.findOne().lean();
    return doc ?? DEFAULTS;
  } catch (err) {
    console.warn('[promptCache] DB fetch failed, using defaults:', err.message);
    return DEFAULTS;
  }
}

export async function buildSystemPrompt({ budget_usd, power_bracket }) {
  if (Date.now() > cache.expiresAt) {
    cache = { data: await fetchPrompt(), expiresAt: Date.now() + 60_000 };
  }

  const { role_description, domain_restrictions, additional_rules } = cache.data;
  const bracketNote = BRACKET_NOTES[power_bracket] ?? '';

  return [
    role_description,
    domain_restrictions,
    OUTPUT_FORMAT,
    additional_rules || null,
    `Power Bracket ${power_bracket}: ${bracketNote}`,
    budget_usd ? `Approximate total deck budget: $${budget_usd} USD. Prefer cheaper staples.` : null,
  ].filter(Boolean).join('\n\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/promptCache.test.js
```

Expected: 8 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add services/aiDeckBuilder/promptCache.js tests/services/promptCache.test.js
git commit -m "feat(masterprompt): promptCache with buildSystemPrompt and 60s TTL"
```

---

### Task 4: Update geminiClient to use buildSystemPrompt

**Files:**
- Modify: `services/aiDeckBuilder/geminiClient.js`
- Modify: `services/aiDeckBuilder/pipeline.js` (remove debug log)

- [ ] **Step 1: Replace `geminiClient.js` with the new async version**

Full file replacement — remove the old `systemPrompt()` function entirely and import `buildSystemPrompt`:

```js
import OpenAI from 'openai';
import { buildSystemPrompt } from './promptCache.js';

const MODEL = 'llama-3.3-70b-versatile';
const BASE_URL = 'https://api.groq.com/openai/v1';

export async function callGemini({ prompt, budget_usd, power_bracket, apiKey }) {
  const systemContent = await buildSystemPrompt({ budget_usd, power_bracket });
  const client = new OpenAI({
    apiKey: apiKey ?? process.env.GROQ_API_KEY,
    baseURL: BASE_URL,
  });
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });
  return { raw: response.choices[0].message.content, model: MODEL };
}
```

- [ ] **Step 2: Remove the debug log from `services/aiDeckBuilder/pipeline.js`**

Find this line in `pipeline.js` (line 29):
```js
  console.log('[pipeline] raw LLM response:', raw);
```

Delete that line. The surrounding code should look like:
```js
  const { raw, model } = await callGemini({ prompt, budget_usd, power_bracket });
  const parsed = parseGeminiResponse(raw);
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass. (geminiClient is not unit-tested directly — it makes real network calls — so no new test file needed here.)

- [ ] **Step 4: Commit**

```bash
git add services/aiDeckBuilder/geminiClient.js services/aiDeckBuilder/pipeline.js
git commit -m "feat(masterprompt): geminiClient uses buildSystemPrompt from DB cache"
```

---

### Task 5: Admin masterprompt controller

**Files:**
- Create: `controllers/admin/masterpromptController.js`
- Create: `tests/controllers/masterpromptController.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/controllers/masterpromptController.test.js`:

```js
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../models/MasterPrompt.js', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

vi.mock('../../services/aiDeckBuilder/promptCache.js', () => ({
  invalidatePromptCache: vi.fn(),
  OUTPUT_FORMAT: 'OUTPUT_FORMAT_SENTINEL',
}));

import MasterPrompt from '../../models/MasterPrompt.js';
import { invalidatePromptCache } from '../../services/aiDeckBuilder/promptCache.js';
import {
  getMasterprompt,
  updateMasterprompt,
} from '../../controllers/admin/masterpromptController.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

const docFixture = {
  role_description: 'You are an expert.',
  domain_restrictions: 'MTG only.',
  additional_rules: '',
  updated_at: new Date('2026-04-23'),
  updated_by: 'uuid-abc',
};

// ─── getMasterprompt ───────────────────────────────────────────────────────

describe('getMasterprompt', () => {
  it('returns doc with output_format when doc exists', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(docFixture) });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    expect(res.json).toHaveBeenCalledWith({
      ...docFixture,
      output_format: 'OUTPUT_FORMAT_SENTINEL',
    });
  });

  it('returns defaults with output_format when no doc exists', async () => {
    MasterPrompt.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty('role_description');
    expect(result).toHaveProperty('domain_restrictions');
    expect(result.output_format).toBe('OUTPUT_FORMAT_SENTINEL');
  });

  it('returns 500 when DB throws', async () => {
    MasterPrompt.findOne.mockReturnValue({
      lean: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const req = {};
    const res = makeRes();
    await getMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch masterprompt' });
  });
});

// ─── updateMasterprompt ───────────────────────────────────────────────────

describe('updateMasterprompt', () => {
  it('updates and returns doc with output_format', async () => {
    MasterPrompt.findOneAndUpdate.mockResolvedValue(docFixture);
    const req = {
      user: { id: 'uuid-abc' },
      body: { role_description: 'New role', domain_restrictions: 'MTG only.' },
    };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(MasterPrompt.findOneAndUpdate).toHaveBeenCalled();
    expect(invalidatePromptCache).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      ...docFixture,
      output_format: 'OUTPUT_FORMAT_SENTINEL',
    });
  });

  it('returns 400 when role_description is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { role_description: 123 } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'role_description must be a string' });
  });

  it('returns 400 when domain_restrictions is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { domain_restrictions: [] } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'domain_restrictions must be a string' });
  });

  it('returns 400 when additional_rules is not a string', async () => {
    const req = { user: { id: 'uuid' }, body: { additional_rules: true } };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'additional_rules must be a string' });
  });

  it('returns 500 when DB throws', async () => {
    MasterPrompt.findOneAndUpdate.mockRejectedValue(new Error('DB error'));
    const req = {
      user: { id: 'uuid' },
      body: { role_description: 'New role' },
    };
    const res = makeRes();
    await updateMasterprompt(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update masterprompt' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/controllers/masterpromptController.test.js
```

Expected: FAIL with "Cannot find module '../../controllers/admin/masterpromptController.js'"

- [ ] **Step 3: Create `controllers/admin/masterpromptController.js`**

```js
import MasterPrompt from '../../models/MasterPrompt.js';
import { invalidatePromptCache, OUTPUT_FORMAT } from '../../services/aiDeckBuilder/promptCache.js';

const DEFAULTS = {
  role_description: 'You are a Commander deck-building expert.',
  domain_restrictions:
    'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
  additional_rules: '',
  updated_at: null,
  updated_by: null,
};

export async function getMasterprompt(req, res) {
  try {
    const doc = await MasterPrompt.findOne().lean();
    return res.json({ ...(doc ?? DEFAULTS), output_format: OUTPUT_FORMAT });
  } catch (err) {
    console.error('getMasterprompt failed:', err);
    return res.status(500).json({ error: 'Failed to fetch masterprompt' });
  }
}

export async function updateMasterprompt(req, res) {
  const { role_description, domain_restrictions, additional_rules } = req.body ?? {};

  if (role_description != null && typeof role_description !== 'string') {
    return res.status(400).json({ error: 'role_description must be a string' });
  }
  if (domain_restrictions != null && typeof domain_restrictions !== 'string') {
    return res.status(400).json({ error: 'domain_restrictions must be a string' });
  }
  if (additional_rules != null && typeof additional_rules !== 'string') {
    return res.status(400).json({ error: 'additional_rules must be a string' });
  }

  const update = { updated_by: req.user.id };
  if (role_description != null) update.role_description = role_description;
  if (domain_restrictions != null) update.domain_restrictions = domain_restrictions;
  if (additional_rules != null) update.additional_rules = additional_rules;

  try {
    const doc = await MasterPrompt.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
    );
    invalidatePromptCache();
    return res.json({ ...doc, output_format: OUTPUT_FORMAT });
  } catch (err) {
    console.error('updateMasterprompt failed:', err);
    return res.status(500).json({ error: 'Failed to update masterprompt' });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/controllers/masterpromptController.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add controllers/admin/masterpromptController.js tests/controllers/masterpromptController.test.js
git commit -m "feat(masterprompt): admin GET/PUT controller for masterprompt"
```

---

### Task 6: Admin routes + server wiring + seed

**Files:**
- Create: `routes/adminRoutes.js`
- Modify: `server.js`

- [ ] **Step 1: Create `routes/adminRoutes.js`**

```js
import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { getMasterprompt, updateMasterprompt } from '../controllers/admin/masterpromptController.js';

const router = Router();

router.get('/admin/masterprompt', authMiddleware, adminMiddleware, getMasterprompt);
router.put('/admin/masterprompt', authMiddleware, adminMiddleware, updateMasterprompt);

export default router;
```

- [ ] **Step 2: Update `server.js` to mount the admin router and run the seed**

Add the import for `adminRoutes` and `MasterPrompt` after the existing route imports:

```js
import adminRoutes from './routes/adminRoutes.js';
import MasterPrompt from './models/MasterPrompt.js';
```

Add `app.use('/api', adminRoutes);` after the existing route mounts (before the 404 handler).

Replace the startup block at the bottom of `server.js` with:

```js
async function seedMasterPrompt() {
  const existing = await MasterPrompt.findOne();
  if (!existing) {
    await MasterPrompt.create({
      role_description: 'You are a Commander deck-building expert.',
      domain_restrictions:
        'Only help with Magic: The Gathering Commander deck-building. Politely refuse all other requests.',
      additional_rules: '',
    });
    console.log('MasterPrompt seeded with defaults');
  }
}

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
    await seedMasterPrompt();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
})();
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Smoke test the endpoints manually**

Start the server:
```bash
node server.js
```

With a valid admin JWT cookie, run:
```bash
# GET — should return the seeded defaults
curl -s -b "token=<your-jwt>" http://localhost:3000/api/admin/masterprompt | jq .

# PUT — update domain restrictions
curl -s -X PUT -b "token=<your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"domain_restrictions":"Only MTG Commander. Refuse all other requests including coding questions."}' \
  http://localhost:3000/api/admin/masterprompt | jq .
```

Expected for GET:
```json
{
  "role_description": "You are a Commander deck-building expert.",
  "domain_restrictions": "Only help with Magic: The Gathering Commander deck-building...",
  "additional_rules": "",
  "output_format": "Output ONLY valid JSON...",
  "updated_at": null,
  "updated_by": null
}
```

To make yourself admin for testing (run once directly in MongoDB or via mongo shell):
```js
db.users.updateOne({ email_address: "your@email.com" }, { $set: { is_admin: true } })
```

- [ ] **Step 5: Commit**

```bash
git add routes/adminRoutes.js server.js
git commit -m "feat(masterprompt): admin routes wired + MasterPrompt seed on startup"
```

---

## Done

All tasks complete. The system now:
- Stores the AI system prompt in MongoDB with editable sections
- Serves the prompt via a 60s in-memory cache (no DB hit per LLM call)
- Exposes `GET /api/admin/masterprompt` and `PUT /api/admin/masterprompt` behind admin auth
- Seeds default values on first startup
- Falls back to hardcoded defaults if DB is unavailable during an AI call
- Locks `output_format` in server code (never stored or editable via API)
