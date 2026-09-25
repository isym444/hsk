# HSK4 Practice App (Angular)

Angular app for HSK4 practice, with two ways to study:

1. **Aggregated decks** (`/deck/:category`) — all four official sample papers
   combined into one question bank per skill. 听力 = 180 questions, 阅读 = 160,
   写作 = 60 (H41001–H41003 and H41332 pooled). Practise in random order or by
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
npm test          # 211 unit + component tests (headless Chrome)
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
public/audio/H41001_q01.mp3 … H41332_q45.mp3     180 clips, ~26 MB total
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
