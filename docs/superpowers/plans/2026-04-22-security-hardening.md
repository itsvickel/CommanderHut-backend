# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining pre-launch security gaps: protect the unguarded AI endpoints, add login input validation, and cap username length.

**Architecture:** Four targeted edits to three existing files — no new files, no new dependencies. All changes are thin guards that sit in front of existing logic.

**Tech Stack:** Node.js 20, Express, existing `authMiddleware` (default export from `middleware/authMiddleware.js`), existing `dailyCap` (named export from `middleware/dailyCap.js`).

**Depends on:** `ai-deck-builder` PR merged to `main` before this branch is created — `dailyCap` middleware lives on that branch.

**Spec:** `docs/superpowers/specs/2026-04-22-security-hardening-design.md`

---

## File Map

| File | Change |
|------|--------|
| `routes/aiRoutes.js` | Add `authMiddleware` + `dailyCap` to `/deepseek` and `/gemini` routes |
| `controllers/loginController.js` | Guard against missing/non-string email_address or password |
| `controllers/userController.js` | Replace min-only username check with combined min + max (30 chars) |

---

## Task 1: Branch setup

**Files:** none

- [ ] **Step 1: Confirm `ai-deck-builder` is merged to `main`**

```bash
git log --oneline main | head -5
```
Expected: you see commits from the `ai-deck-builder` branch (e.g. `feat(ai-deck): ...`). If not, wait for that PR to merge first.

- [ ] **Step 2: Create and push the feature branch**

```bash
git checkout main
git pull origin main
git checkout -b security-hardening
git push -u origin security-hardening
```
Expected: branch created locally and on remote, no errors.

---

## Task 2: Protect `/deepseek` and `/gemini`

**Files:**
- Modify: `routes/aiRoutes.js`

After `ai-deck-builder` is merged, `routes/aiRoutes.js` looks like:
```js
import express from 'express';
import { generateDeckDeepSeek } from '../controllers/ai/deepseekAIController.js';
import { generateDeckGemini } from '../controllers/ai/geminiAIController.js';
import { generate, save } from '../controllers/ai/deckBuilderController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { dailyCap } from '../middleware/dailyCap.js';

const router = express.Router();

router.post('/deepseek', generateDeckDeepSeek);
router.post('/gemini', generateDeckGemini);

router.post('/ai/deck/generate', authMiddleware, dailyCap, generate);
router.post('/ai/deck/save', authMiddleware, save);

export default router;
```

- [ ] **Step 1: Add `authMiddleware` and `dailyCap` to both old routes**

Replace the two unprotected route lines:
```js
router.post('/deepseek', generateDeckDeepSeek);
router.post('/gemini', generateDeckGemini);
```

With:
```js
router.post('/deepseek', authMiddleware, dailyCap, generateDeckDeepSeek);
router.post('/gemini', authMiddleware, dailyCap, generateDeckGemini);
```

The imports for `authMiddleware` and `dailyCap` are already present from the `ai-deck-builder` changes — no new imports needed.

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all 36 tests pass. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add routes/aiRoutes.js
git commit -m "feat(security): protect /deepseek and /gemini with auth + daily cap"
```

---

## Task 3: Login input validation

**Files:**
- Modify: `controllers/loginController.js`

Current `loginUser` starts with:
```js
export const loginUser = async (req, res) => {
  try {
    const { email_address, password } = req.body;

    const user = await User.findOne({ email_address });
```

- [ ] **Step 1: Add guard before the DB query**

Insert this block immediately after `const { email_address, password } = req.body;` and before the `User.findOne` call:

```js
    if (
      typeof email_address !== 'string' || !email_address.trim() ||
      typeof password !== 'string' || !password
    ) {
      return res.status(400).json({ error: 'email_address and password are required' });
    }
```

The full updated `loginUser` function should be:
```js
export const loginUser = async (req, res) => {
  try {
    const { email_address, password } = req.body;

    if (
      typeof email_address !== 'string' || !email_address.trim() ||
      typeof password !== 'string' || !password
    ) {
      return res.status(400).json({ error: 'email_address and password are required' });
    }

    const user = await User.findOne({ email_address });
    const isValidPassword = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email_address: user.email_address, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
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
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all 36 tests pass.

- [ ] **Step 3: Commit**

```bash
git add controllers/loginController.js
git commit -m "feat(security): validate login input before DB query"
```

---

## Task 4: Username max length on signup

**Files:**
- Modify: `controllers/userController.js`

Current check (line ~10):
```js
if (trimmedUsername.length < 2) {
  return res.status(400).json({ error: 'Username must be at least 2 characters' });
}
```

- [ ] **Step 1: Replace with combined min + max check**

```js
if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
  return res.status(400).json({ error: 'Username must be 2–30 characters' });
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all 36 tests pass.

- [ ] **Step 3: Commit**

```bash
git add controllers/userController.js
git commit -m "feat(security): cap username at 30 characters on signup"
```

---

## Task 5: Push and open PR

- [ ] **Step 1: Push the branch**

```bash
git push origin security-hardening
```

- [ ] **Step 2: Verify all commits are on the branch**

```bash
git log --oneline main..security-hardening
```
Expected: 3 commits:
```
feat(security): cap username at 30 characters on signup
feat(security): validate login input before DB query
feat(security): protect /deepseek and /gemini with auth + daily cap
```

- [ ] **Step 3: Open the PR**

Open: `https://github.com/itsvickel/CommanderHut-backend/compare/main...security-hardening`
