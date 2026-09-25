# HSK4 Practice App — Aggregated Decks, Review Database & Statistics

Date: 2026-09-25
Status: Implemented
Builds on: `2026-09-25-hsk4-angular-refactor-design.md`

## Purpose

The Angular refactor made the three HSK4 sample papers available one section at
a time, with no memory of how practice went. This change adds what practice
actually needs:

1. **Aggregated decks** — the questions of all three papers combined per skill,
   so 阅读 is one 120-question bank rather than three 40-question ones.
2. **A review database** — every answer's outcome (correct / incorrect /
   self-assessed), response time and date-time, in SQLite.
3. **Per-category statistics** — how many questions have been answered, the
   success rate, and the average response time per question.
4. **Adaptive ordering** — random, or weighted by success rate and spaced
   repetition.
5. **Open-ended sessions** — no fixed number of questions, with the session's
   own stats shown at the end.

The original per-paper flow is kept as the secondary path; nothing about it
changed except that its home-screen grid now sits behind an expander.

## Shape of the solution

```
hsk4-practice-app/                 Angular 18, standalone components, signals
  src/app/data/build-units.ts      the one pure walker over the question banks
  src/app/data/catalogue-export.ts entry point for the backend generator
  src/app/core/review-api.service.ts   typed /api client
  src/app/core/deck-state.service.ts   one deck session: queue, timer, tallies
  src/app/deck-run/, deck-summary/, stats/
backend/                           FastAPI + stdlib sqlite3
  app/{db,catalogue,stats,scheduling}.py, app/routers/
  data/catalogue.json              generated from the Angular data layer
  data/hsk_reviews.sqlite3         the review database (git-ignored)
```

### Decisions

**The backend owns the inventory and the statistics; the frontend owns the
question text.** Duplicating 300 questions into Python would guarantee drift, so
`backend/scripts/export_catalogue.mjs` bundles the app's dependency-free
`catalogue-export.ts` with esbuild and writes `catalogue.json`, which the API
seeds its `questions` table from. The Angular app renders decks by asking the
API for an ordered list of question keys and resolving each key to a local unit.

**Question keys are `paper:category:kind:number`.** Question numbers restart at
1 in every paper, so the paper must be part of the identity: `H41001` and
`H41002` both have a `reading:fill:46`. Keys come from a single pure walker
(`build-units.ts`) that the per-paper quiz, the deck runner and the catalogue
generator all share, so a stored review can never point at an unrenderable
question.

**A FastAPI service, per the user's request for a separate backend folder.**
Chosen over Spring Boot for weight: one file per concern, no build step, and
SQLite through the standard library. The API also serves the built Angular
bundle when it exists, so a single process can run everything — but the dev
workflow keeps `ng serve` with a `/api` proxy (`proxy.conf.json`).

**Self-assessed writing items are answered but not scored.** The open writing
items (看图造句) are checked against a model answer by the learner. They count
towards "answered" and attempt counts, and are excluded from success rate and
average response time — exactly how the original quiz treated them. The API
enforces this: a scored outcome on such a question is a `422`.

**Smart mode is weighted random sampling, not a fixed queue.** Every question
keeps a non-zero weight (0.25 base + 2.2 × weakness + 0.9 × overdue, with
spaced-repetition intervals of 1, 2, 4, 8, 16, 32, 60 days by correct streak),
and the deck is drawn with Efraimidis–Spirakis weighted sampling. Priority
dominates over many draws while the order still varies between sessions, which
suits repeated practice better than a deterministic "most overdue first" list.

**Sessions are open-ended and self-refilling.** The runner requests the whole
category, and when the queue is exhausted it asks for another batch, excluding
the last 15 answered questions so a refill does not immediately repeat itself.
Only 结束练习 (or 返回) ends a session.

**Response time measures engaged time.** The timer pauses on
`visibilitychange` while the tab is hidden and any single answer is capped at 10
minutes, so leaving a question open in a background tab does not corrupt
"average response time".

**Timestamps.** `answered_at` is the server's UTC receipt time (authoritative,
used for ordering and displayed in local time by the browser);
`answered_at_local` preserves the browser's own clock reading verbatim.

## Error handling

- The API being down is a first-class state: every loading page shows what to
  run (`uvicorn app.main:app --port 8000`) and offers a retry, rather than an
  empty screen.
- A review that fails to send is queued in memory and re-sent before the next
  one and at finish, with a visible notice; it is not silently dropped.
- Starting a session that never gets an answer is discarded (`DELETE`) so the
  history has no empty rows; backing out after answering finishes the session
  without showing a summary.

## Testing

- **Backend, 64 pytest tests**: catalogue bridge (counts, key format,
  self-assessed set, staleness handling, and a subprocess `--check` that fails
  if `catalogue.json` is out of sync with the Angular data), schema and
  idempotent re-seeding, the scheduling maths and weighted ordering, deck
  filtering/exclusion/limits, the full session lifecycle and its validation
  rules, and each statistics definition (coverage counts distinct questions, the
  average is over scored reviews, the overview average is weighted rather than a
  mean of means).
- **Frontend, 180 Jasmine tests** (91 of them new): the question inventory and
  key scheme, the format helpers, the API client's URL/param contract, the deck
  session service (queue refill, answer posting, the pending-review retry, the
  timer pause/cap, discard/finish), the deck runner, the session summary and the
  category stats page including its filters.
- **Manual/end-to-end**: the API flow was driven with real HTTP calls against a
  live server (deck → session → reviews → finish → stats → adaptive reorder),
  the SQLite file was inspected directly, and the home, stats and deck pages were
  rendered in headless Chrome against the live database. Both the dev proxy and
  the API's own static hosting of the production bundle were verified.

## Out of scope

- No authentication or multi-user support: the database is local and personal.
- No data export/import UI or backup tooling.
- No e2e browser-driver suite; the component specs plus the manual passes above
  stand in for it.
