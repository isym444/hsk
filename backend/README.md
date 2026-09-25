# HSK4 Review API (FastAPI + SQLite)

Backend for the aggregated HSK4 practice decks. It owns three things:

1. **The question inventory** — the 300 questions of H41001–H41003, generated
   from the Angular app's own data layer so the two can never disagree.
2. **The review database** — every answer's outcome (correct / incorrect /
   self-assessed), how long it took, and when it happened, in plain SQLite.
3. **Deck ordering** — a fully random shuffle, or "smart" mode weighted by
   success rate and a spaced-repetition interval.

## Quick start

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements-dev.txt      # runtime + tests
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

- API docs (Swagger): <http://127.0.0.1:8000/docs>
- Health check: <http://127.0.0.1:8000/api/health>

The database is created on first start at `data/hsk_reviews.sqlite3` and seeded
with the 300-question catalogue. Override the paths when you want a throwaway
instance:

```bash
HSK_DB_PATH=/tmp/scratch.sqlite3 ./.venv/bin/uvicorn app.main:app --port 8000
```

If `../hsk4-practice-app/dist/hsk4-practice-app/browser` exists, the API also
serves the built frontend at `/`, so a single process runs the whole app (deep
links such as `/stats/reading` fall back to `index.html`). Point `HSK_WEB_DIST`
at a bundle to make that explicit — in the Docker stack it is left unset
because nginx serves the UI and only `/api` reaches this service.

### Docker

`Dockerfile` builds the API on `python:3.13-slim`, runs it as a non-root user,
and keeps the database on the `/data` volume (`HSK_DB_PATH`, default
`/data/hsk_reviews.sqlite3`). Its health check calls `/api/health`, which
queries the database. Build it on its own with:

```bash
docker build -t hsk4-practice-api backend
docker run --rm -p 8000:8000 -v hsk-data:/data hsk4-practice-api
```

or let the repository's `docker-compose.yml` build and wire it to nginx.

## Where the questions come from

The question text lives only in the Angular app
(`hsk4-practice-app/src/app/data/*.data.ts`). `scripts/export_catalogue.mjs`
bundles that data layer with esbuild and writes `data/catalogue.json`:

```bash
node scripts/export_catalogue.mjs           # regenerate
node scripts/export_catalogue.mjs --check   # fail if it is out of date (CI)
```

The API seeds its `questions` table from that file at startup, so a review is
never keyed to a question the UI cannot render. If you edit the question data,
regenerate the catalogue — the test suite fails loudly if you forget.

## Database

```sql
questions(question_key PK, paper, category, kind, number, part, scoreable, label, active)
sessions (id PK, category, mode, started_at, ended_at, tz_offset_minutes,
          answered, correct, incorrect, self_assessed, total_ms)
reviews  (id PK, session_id → sessions, question_key → questions, category, mode,
          outcome CHECK(correct|incorrect|self_assessed), elapsed_ms,
          answered_at, answered_at_local, created_at)
```

`answered_at` is the authoritative **UTC ISO-8601** instant recorded when the
server received the answer; `answered_at_local` keeps the browser's own
clock reading (with its offset) for reference. Indexes cover per-question,
per-category-over-time and per-session lookups.

Questions removed from the catalogue are deactivated (`active = 0`) rather than
deleted, so review history keeps its foreign key.

### How the numbers are defined

| Metric | Definition |
| --- | --- |
| `answered_questions` | distinct questions with at least one review |
| `attempts` | every review, including self-assessed ones |
| `coverage` | `answered_questions / total_questions` |
| `success_rate` | `correct / (correct + incorrect)` — `null` with no scored answers |
| `avg_ms` | mean `elapsed_ms` over **scored** reviews only |

Open writing items (看图造句) are self-assessed against a model answer: they
count towards "answered" and `attempts`, but never towards `success_rate` or
`avg_ms`. This matches the original quiz, which scored them separately. The API
enforces it: sending `outcome: "correct"` for such a question is a `422`.

## Smart mode

`GET /api/deck/{category}?mode=smart` orders the deck by a weight per question:

```
weight = 0.25 + 2.2 × (1 − success_rate) + 0.9 × overdue
overdue = clamp(days_since_last_review / interval, 0, 2.5)
interval = 2^streak days, capped at 60   (1, 2, 4, 8, 16, 32, 60)
never attempted → weight 3.0, reason "new"
```

Selection is randomised **weighted sampling without replacement**
(Efraimidis–Spirakis: `key = random^(1/weight)`, highest first), so priority
dominates while the order still varies between sessions. Every question keeps a
non-zero weight and stays eligible. Each question's response carries its
`priority` and a `reason` (`new` / `weak` / `due` / `review` / `mastered`).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | status + row counts |
| GET | `/api/categories` | per-category stats + combined totals (home screen) |
| GET | `/api/stats/{category}` | headline stats, per-kind split, every question's history, recent sessions |
| GET | `/api/deck/{category}` | ordered deck; `mode`, `limit`, `exclude` (comma-separated keys) |
| GET | `/api/deck/{category}/preview` | unseen / weak / due counts for the start panel |
| POST | `/api/sessions` | start a session (`category`, `mode`, `tz_offset_minutes`) |
| GET | `/api/sessions` | recent sessions; optional `category`, `limit` |
| GET | `/api/sessions/{id}` | one session's summary (survives a page refresh) |
| POST | `/api/sessions/{id}/reviews` | record one answer (`question_key`, `outcome`, `elapsed_ms`, `answered_at`) |
| POST | `/api/sessions/{id}/finish` | close the session and return its summary |
| DELETE | `/api/sessions/{id}` | discard an empty/abandoned session |

`category` is one of `listening` / `reading` / `writing`; an unknown value is a
`422`. `GET /api/sessions/{id}` also returns `prior` — the category's lifetime
stats with this session removed — which is what the end-of-session screen uses
to show "better or worse than usual".

## Tests

```bash
./.venv/bin/python -m pytest -q
```

64 tests cover the catalogue bridge (including a subprocess check that
`catalogue.json` is in sync with the Angular data), the schema and re-seeding,
the scheduling maths, deck ordering and filtering, the session lifecycle and
validation rules, and every statistics definition above.
