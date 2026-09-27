# HSK Practice App (Angular)

Angular app for HSK practice at **two levels — HSK3 and HSK4** — with two ways
to study at each:

1. **Aggregated decks** (`/:level/deck/:category`) — every paper of one level
   combined into one question bank per skill. HSK4: 听力 180, 阅读 160, 写作 60
   (H41001–H41003, H41332). HSK3: 听力 80, 阅读 60, 写作 20 (H31330, H31332).
   Practise in random order or by success-rate/spaced-repetition, for as long as
   you like, then see the stats for that session.
2. **Per-paper practice** (`/quiz/:testId/:section`) — the original flow: one
   sample paper's section at a time, in the paper's own order. Still available
   behind the "按试卷练习" expander on the level's home screen.

## Levels

The two levels are **separate question banks and are never pooled**. A deck, a
statistics page and even the meaning of "question 1" differ between them, so the
level is the first path segment (`/HSK3/...`, `/HSK4/...`), `/` redirects to
HSK4, and every level-scoped page renders a switcher that keeps you on the same
skill when you move between them.

`data/tests.data.ts` holds the mapping (`LEVEL_OF_PAPER`) and the helpers the
rest of the app derives from (`papersForLevel`, `LEVELS`); nothing else decides
which papers belong together. The review database stores the level on each
question row, so one history holds both banks and the API scopes its queries by
level — a stats page shows only the level you are looking at.

Progress is stored by the FastAPI backend in [`../backend`](../backend) — SQLite
locally, Supabase Postgres when deployed — which also serves the stats pages and
orders the smart decks. Sign-in is handled by Supabase Auth, so every account
sees only its own history.

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

## Running it locally without sign-in

Every page sits behind Supabase sign-in, which needs a project on both the API
and the frontend. To look at the app locally without any of that, use the
development bypass instead — it trusts every request as one fixed local
identity:

```bash
npm run api:local      # API on :8000 with HSK_DEV_NO_AUTH=1
npm run start:local    # dev server on :4200 with the matching frontend flag
```

Or, from a single process (build first, then let the API serve the bundle):

```bash
npm run build && npm run api:local     # then open http://127.0.0.1:8000
```

With Docker, pass the flag to the API and rebuild (a plain `docker compose
restart` reuses the existing image, so a config change will not appear):

```bash
HSK_DEV_NO_AUTH=1 docker compose up --build      # http://localhost:8080
```

**This cannot engage in a deployment.** Both sides ignore the flag whenever a
Supabase project is configured: the API refuses it when `HSK_SUPABASE_URL` or
`HSK_SUPABASE_JWT_SECRET` is set, and the frontend ignores `devNoAuth` when
`supabaseUrl`/`supabaseAnonKey` are. A production stack must set those to work
at all, so a stray variable cannot open it. The API logs a warning on every
start while the bypass is live, and `backend/tests/test_auth.py` pins all four
of those behaviours.

## Configuration and sign-in

`public/config.json` carries three values, read once at startup by
`core/runtime-config.service.ts` before the router runs:

| Key | Meaning |
| --- | --- |
| `apiBase` | prefix for every API call — `/api` by default |
| `supabaseUrl` | the Supabase project, e.g. `https://abcdefghijklm.supabase.co` |
| `supabaseAnonKey` | the publishable (or legacy anon) key; public by design |

The committed defaults are same-origin `/api` with no Supabase project, which is
what `ng serve`'s proxy, the nginx image and the API serving its own bundle all
want for the API — but sign-in needs a real project even locally:

```bash
HSK_SUPABASE_URL=https://<project-ref>.supabase.co \
HSK_SUPABASE_ANON_KEY=sb_publishable_... \
  node scripts/write-runtime-config.mjs

npm start
```

`scripts/write-runtime-config.mjs` is what `npm run build:render` runs first
(with `HSK_API_BASE` too) so the Render static site can point at an API on
another origin. With none of the `HSK_*` variables set it is a no-op and the
committed defaults stand, so it is safe to run anywhere. If `config.json` is
missing or unreadable at runtime the service keeps the defaults rather than
failing to boot.

Sign-in is email + password, handled by `core/auth.service.ts`. Accounts are
created in the Supabase dashboard rather than in the app, so there is no
registration form; a forgotten password is reset by email, and the link lands on
`/reset-password` (`login/reset-password.component.ts`), which signs the visitor
in just long enough to choose a new one. `core/auth.interceptor.ts` attaches the
access token to every request to `apiBase`, and `core/auth.guard.ts` keeps every
page but `/login` and `/reset-password` behind a session. If the backend refuses
the account (the allow-list), the interceptor signs the user out and the login
page explains why.

Other commands:

```bash
npm test          # 286 unit + component tests (headless Chrome)
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
      audio-clips.ts          paper+question → the real recording in public/audio
      h41001|h41002|h41003|h41332.data.ts, tests.data.ts, section-meta.ts
    core/
      review-api.service.ts   typed client for the FastAPI backend (/api)
      deck-state.service.ts   one aggregated deck session: queue, timer, tallies
      quiz-builder.service.ts per-paper flattening (delegates to build-units)
      quiz-state.service.ts   one per-paper quiz session
      format.ts               duration/percent/date formatting + mode labels
      audio.service.ts        plays the real-voice listening clips
      active-session.guard.ts
    home/                     aggregated decks + the per-paper expander
    deck-run/                 the aggregated practice runner
    deck-summary/             end-of-session stats for one session
    stats/                    per-category stats page + cross-category index
    quiz-shell/               sticky chrome + the per-question switch (per paper)
    questions/                one component per question kind
    summary/                  per-paper final score screen
```

## Listening audio

The listening sections play the **official HSK 4 recordings**, not synthesised
speech. Each paper's recording holds all 45 of its listening questions; every
question has been cut out into its own clip:

```
public/audio/H41001_q01.mp3 … H31332_q40.mp3     260 clips, ~43 MB total
public/images/H31330_q01_A.png …                  110 option pictures, ~7 MB
```

The four recordings are shaped the same way (intro, worked example, then the
questions separated by the exam's answer pauses), so one cutting strategy covers
all of them:

```bash
# H41001-H41003 (one recording per paper, block cache in scripts/.cache)
HSK_AUDIO_DIR=~/Downloads python3 scripts/extract-listening-clips.py public/audio

# H41332 (its own recording; block cache in scripts/.cache132)
HSK_AUDIO_DIR=~/Downloads python3 scripts/extract-h41332-clips.py public/audio

# score every clip's transcription against its own transcript
python3 scripts/verify-listening-clips.py
```

Each clip runs from just after the spoken question number to the end of the
question itself, so the 10–15 second answer pauses are trimmed but nothing the
examiner says is lost. `data/audio-clips.ts` is the manifest (paper, question,
part, file, duration) and `core/audio.service.ts` plays it through one shared
`HTMLAudioElement`; the question components take a `[paper]` input so they can
resolve their own clip. Questions whose clip is missing keep working — the play
button reports the failure instead of breaking the question.

`clip_span` in the extractor, and the block→question layout it relies on, are
documented in the extraction script headers. All four recordings share this
block layout:

| Blocks | Content |
| --- | --- |
| 1, 2 | paper intro, worked example |
| 3–12 | part 1, Q1–Q10 |
| 13, 14–28 | part 2 intro + example, then Q11–Q25 |
| 29, 30–39 | part 3 intro + example, then Q26–Q35 |
| 40–50 | part 4, passage + two questions per pair (Q36–Q45) |

The layout is identical for every recording; only the pause lengths differ
(H41001 pauses ~9.9 s before its first answer, H41332 ~9.05 s), which is why each
extractor script carries its own `LAYOUT` and thresholds rather than sharing
one file.

Parts 1 and 2 of this paper bank are shortened to 10 and 15 questions, so the
recording's own numbering ends at question 45 even though the official exam has
more items per part.

`core/audio.service.spec.ts` loads all 180 files in a real browser and checks
each one decodes to the length the manifest claims, so a mis-cut or missing clip
fails the suite. There is a second, slower check used while cutting the clips:
transcribe each one and compare it with that question's transcript.

## HSK3 papers

HSK3 is a different exam shape, not just a different level. Both papers
(H31330, H31332) are 80 questions: listening 1-40, reading 41-70, writing 71-80.
The differences the code has to carry:

| | HSK4 | HSK3 |
| --- | --- | --- |
| Listening parts | 3 (45 questions) | 4 (40 questions) |
| Listening part 1 | true/false | pick 1 of 5-6 **pictures** |
| Listening part 2 | dialogue blocks | true/false |
| Item readings | once | **twice** (all four parts) |
| Options | always A-D | A-C for listening 3/4 and reading part 3 |
| Reading part 1 | word bank | **match a prompt to one of six replies** |
| Reading part 2 | sentence ordering | a second word bank |
| Writing part 2 | write a sentence | **write one character** from a gapped sentence |

`listening.part1`/`part2` and `reading.part2` are therefore unions in
`data/models.ts` — each paper fills the shape its exam uses, and the walker
tells them apart structurally rather than by paper id.

Pictures live in `public/images/<paper>_q<NN>_<A-F>.png` and are rendered by
`questions/picture-choice-question/`. Note the papers share one picture set
across Q1-5 and another across Q6-10, and that set prints only five pictures
(A-E) — there is no F, and the answer key never uses one. Each question still
points at its own copies so a question is self-contained.

Both recordings are extracted with `scripts/extract-h31330-clips.py` /
`extract-h31332-clips.py` (same block-anchoring approach as HSK4, but every clip
holds both readings).

## Adding a paper

H41332 was added on top of the three ported papers, so the steps are proven:

1. Add `src/app/data/h41332.data.ts` and register it in `models.ts` (`TestId`)
   and `tests.data.ts` (`TESTS`).
2. Add the clips to `public/audio/` and their rows to `data/audio-clips.ts`.
3. `npm run catalogue` to regenerate `backend/data/catalogue.json`.
4. Update the counts encoded in tests. Prefer deriving them
   (`categoryTotal('reading')`, the catalogue JSON, `TEST_IDS.length`) over
   hardcoding a number, so the next paper does not repeat the churn.
5. Check the new paper's questions against the existing bank before adding them:
   `scripts/` has no committed duplicate checker, but `verify-listening-clips.py`
   plus a similarity scan over the `*.data.ts` text is what caught nothing here
   (H41332 shares no question with H41001–H41003).

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
- **Timer hidden by default.** The live "time on this question" readout, the
  session average and the per-answer time are hidden while practising; "Show
  timer" reveals them and the choice is remembered on the device
  (`PreferencesService`). Answers are still timed either way.
- **Questions reopen for review.** Every row of "Question detail for this
  session" on the summary page reopens that question read-only with the answer
  revealed (previous/next steps through the session). The review database only
  stores the question key, so the question itself is re-rendered from the local
  inventory.
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
