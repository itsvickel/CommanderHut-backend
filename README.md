# CommanderHut-backend

API for CommanderHut, an AI-assisted Magic: The Gathering Commander deck builder.
It generates legal 100-card decks from a natural-language prompt, refines them
in conversation, and analyses existing decks.

## Technologies

- **Node.js + Express 5** (ESM, no build step)
- **MongoDB + Mongoose** — cards, decks, users, prompt config, usage counters
- **LLM providers** — Groq (default) or Google Gemini, selected by env
- **Scryfall** — bulk card data (daily sync) and live validation at generation time

## Features

- **AI deck generation** — structured JSON output, Scryfall-validated commander
  and cards, synergy-scored fill, mana base derived from the deck's own curve
- **Interactive refinement** — natural-language change requests return a
  validated add/cut diff rather than a regenerated deck
- **Deck analysis** — deterministic statistics plus an LLM critique grounded in
  those numbers, with upgrade suggestions drawn from real cards
- **Commander legality** — 100 cards, singleton, colour identity, and the
  official bracket rules (Game Changers, mass land denial, extra turns)
- **Card search** — structured query syntax over the local card mirror
- **Auth** — JWT in an httpOnly cookie; admin-only master-prompt editing
- **Cost control** — per-user daily generation cap plus token/cost tracking

## Setup

```bash
git clone <repo-url>
cd CommanderHut-backend
npm install
cp .env.example .env   # then fill in the values
npm run db:cards:sync  # import the Scryfall bulk card data (takes a while)
npm start
```

### Environment

See `.env.example` for the full list. The essentials:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Cookie signing secret; the server refuses to boot without it |
| `CORS_ORIGIN` | Frontend origin allowed to call the API |
| `GROQ_API_KEY` | Key for the default deck-generation provider |
| `LLM_PROVIDER` | `groq` (default) or `gemini` |
| `LLM_MODEL` | Optional override of the provider's default model |

## API

All routes are mounted under `/api`.

**AI** (auth + rate limited + daily cap)
- `POST /ai/deck/generate` — SSE: builds a deck, streams stage progress
- `POST /ai/deck/refine` — SSE: returns a validated add/cut diff
- `POST /ai/deck/analyze` — SSE: statistics, critique, upgrade suggestions
- `POST /ai/deck/save` — persists a generated preview as a deck

**Decks** — `GET /decks` (public, paginated), `GET /decks/:id`,
`GET /decks/user/:user_id`, `POST /decks`, `PATCH /decks/:id`,
`DELETE /decks/:id`, `POST|DELETE|GET /decks/:id/like`

**Cards** — `GET /cards/search`, `GET /cards/name/:name`, `GET /cards/id/:id`,
`GET /cards/set/:set`, `GET /cards/randomList`, `GET /cards/all` (paginated),
`POST /cards/bulk`, `POST /cards/bulk-lookup`

**Auth / users** — `POST /user`, `POST /login`, `POST /logout`, `GET /me`,
`GET /user/:id`, `GET|PUT /profile`

**Admin** — `GET|PUT /admin/masterprompt`

## Scripts

| Command | Description |
|---|---|
| `npm start` | Run the server |
| `npm test` | Run the Vitest suite |
| `npm run test:watch` | Watch mode |
| `npm run db:cards:sync` | Sync cards from Scryfall bulk data |

## Deployment

Runs on Railway with MongoDB Atlas; the frontend is deployed separately on
Vercel. A GitHub Action re-syncs the card database daily.
