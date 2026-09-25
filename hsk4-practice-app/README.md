# HSK4 Practice App (Angular)

Angular app for HSK4 practice, with two ways to study:

1. **Aggregated decks** (`/deck/:category`) — all three official sample papers
   combined into one question bank per skill. 听力 = 135 questions, 阅读 = 120,
   写作 = 45 (H41001–H41003 pooled). Practise in random order or by
   success-rate/spaced-repetition, for as long as you like, then see the stats
   for that session.
2. **Per-paper practice** (`/quiz/:testId/:section`) — the original flow: one
   sample paper's section at a time, in the paper's own order. Still available
   behind the "按试卷练习" expander on the home screen.

Progress is stored in a local SQLite database by the FastAPI backend in
[`../backend`](../backend), which also serves the stats pages and orders the
smart decks.

The original single-file app is kept at `../hsk4-practice.html` as a reference
and fallback; it is untouched.

## Running it

The frontend needs the API. In two terminals:

```bash
# terminal 1 — API on :8000 (see ../backend/README.md for setup)
cd ../backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000

# terminal 2 — dev server on :4200, /api proxied to :8000
npm start
```

Or run everything from one process, using the API to serve the built bundle:

```bash
npm run build                     # writes dist/
cd ../backend && ./.venv/bin/uvicorn app.main:app --port 8000
# open http://127.0.0.1:8000
```

Or with containers, from the repository root — this builds the bundle and serves
it with nginx, which proxies `/api` to the API container:

```bash
docker compose up --build     # app on http://localhost:8080
```

`Dockerfile` is a two-stage build: `node:24-slim` runs `npm ci && npm run build`,
and the resulting `dist/hsk4-practice-app/browser` is copied into
`nginx:1.27-alpine`. `nginx.conf` serves the hashed assets with long-lived
caching, never caches `index.html`, forwards `/api` and `/docs` to the `api`
service, and falls back to `index.html` for real routes such as
`/stats/reading`. `.dockerignore` keeps the host's 1.2 GB of `node_modules` and
`.angular` cache out of the build context.

Other commands:

```bash
npm test          # 180 unit + component tests (headless Chrome)
npm run api       # convenience: start the backend from here
npm run catalogue # regenerate backend/data/catalogue.json from the data layer
```

`npm test` uses `karma.conf.js`, which points at the standard macOS Chrome
install. On another machine set `CHROME_BIN` to your Chrome/Chromium binary.
The dev server binds `localhost` (IPv6 included) — if `127.0.0.1:4200` refuses
the connection but the terminal says it is up, use `http://localhost:4200`.

## Layout

```
src/
  styles.css                  theme variables, light/dark, shared chrome + stats primitives
  app/
    data/
      models.ts               raw test-bank shapes + the Unit union
      build-units.ts          the single pure walker: units, question keys, inventory
      question-inventory.ts   question key → renderable unit, per-category counts
      catalogue-export.ts     entry point the backend's generator bundles
      h41001|h41002|h41003.data.ts, tests.data.ts, section-meta.ts
    core/
      review-api.service.ts   typed client for the FastAPI backend (/api)
      deck-state.service.ts   one aggregated deck session: queue, timer, tallies
      quiz-builder.service.ts per-paper flattening (delegates to build-units)
      quiz-state.service.ts   one per-paper quiz session
      format.ts               duration/percent/date formatting + mode labels
      speech.service.ts, active-session.guard.ts
    home/                     aggregated decks + the per-paper expander
    deck-run/                 the aggregated practice runner
    deck-summary/             end-of-session stats for one session
    stats/                    per-category stats page + cross-category index
    quiz-shell/               sticky chrome + the per-question switch (per paper)
    questions/                one component per question kind
    summary/                  per-paper final score screen
```

## How the pieces agree

The review database is keyed by `paper:category:kind:number`
(e.g. `H41001:reading:fill:46`), because question numbers restart at 1 in every
paper. Those keys are produced by `data/build-units.ts`, which is the only place
that flattens the question banks — the per-paper quiz, the deck runner and the
backend's generated catalogue all derive from it, so stored history can never
point at a question the UI cannot render.

`backend/scripts/export_catalogue.mjs` bundles `data/catalogue-export.ts` with
esbuild and writes `backend/data/catalogue.json`. Re-run it after editing any
question data (`npm run catalogue`); a backend test fails if it is stale.

## Behaviour notes

- **No fixed session length.** The deck runner refills its queue from the API
  whenever it runs out, so a session ends only when you press 结束练习 (or 返回,
  which ends the session without showing a summary). A session with no answers
  is discarded instead of being stored.
- **Engaged time only.** The per-question timer pauses while the tab is hidden,
  and any single answer longer than 10 minutes is capped, so "average response
  time" is not inflated by a question left open in a background tab.
- **Self-assessed writing.** The open writing items (看图造句) are marked
  self-assessed, counted as answered, and excluded from success rate and average
  time — the same rule the original quiz used.
- **Answers survive a blip.** If a review fails to reach the API it is queued in
  memory and re-sent before the next one (and at finish); the runner shows a
  notice rather than dropping it silently.
- **`/summary` (per paper) still has no persistence** — a refresh loses the
  in-flight per-paper quiz, exactly like the original. Deck sessions do persist:
  `/deck/:category/summary/:sessionId` is fetched by id, so it can be reloaded
  or reopened later from the stats page.
- `src/app/testing/fixtures/` holds the original app's `TESTS` shape and
  `buildUnits()` output, checked in so the data/state specs can prove parity.
  Regenerate them with `node scripts/make-fixtures.js` if `hsk4-practice.html`
  ever changes.
