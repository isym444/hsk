# HSK4 Review API (FastAPI + SQLite/PostgreSQL)

Backend for the aggregated HSK4 practice decks. It owns three things:

1. **The question inventory** — the 400 questions of H41001–H41003 and H41332,
   generated from the Angular app's own data layer so the two can never
   disagree.
2. **The review database** — every answer's outcome (correct / incorrect /
   self-assessed), how long it took, and when it happened. Plain SQL: SQLite
   locally, PostgreSQL (Supabase) in production.
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

The API requires Supabase access tokens, so a local run needs to know which
project to trust — point it at the same one the frontend signs in against:

```bash
HSK_SUPABASE_URL=https://<project-ref>.supabase.co \
HSK_SUPABASE_JWT_SECRET=<legacy JWT secret> \
HSK_ALLOWED_EMAILS=you@example.com \
  ./.venv/bin/uvicorn app.main:app --reload --port 8000
```

Without them the app still starts, but every endpoint except `/api/health`
answers `503`. See [Authentication](#authentication).

The database is created on first start at `data/hsk_reviews.sqlite3` and seeded
with the question catalogue. Override the paths when you want a throwaway
instance:

```bash
HSK_DB_PATH=/tmp/scratch.sqlite3 ./.venv/bin/uvicorn app.main:app --port 8000
```

### Choosing the database

| Environment variable | Effect |
| --- | --- |
| *(neither)* | SQLite at `data/hsk_reviews.sqlite3` |
| `HSK_DB_PATH` | SQLite at that path — the local/test default |
| `HSK_DATABASE_URL` | PostgreSQL (Supabase in production); `HSK_DB_PATH` is ignored |

`HSK_DATABASE_URL` takes a normal DSN, e.g. Supabase's **session pooler**
string. Use the pooler rather than the direct connection: the direct host is
IPv6-only on Supabase's free tier.

```bash
HSK_DATABASE_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require' \
  ./.venv/bin/uvicorn app.main:app --port 8000
```

Also available: `HSK_DB_POOL_MIN` / `HSK_DB_POOL_MAX` (default 1/5) size the
application-side connection pool, and `HSK_CORS_ORIGINS` is a comma-separated
allow-list of browser origins.

The schema is created and the catalogue re-seeded on every start, so pointing at
an empty database is all the setup Postgres needs.

If `../hsk4-practice-app/dist/hsk4-practice-app/browser` exists, the API also
serves the built frontend at `/`, so a single process runs the whole app (deep
links such as `/stats/reading` fall back to `index.html`). Point `HSK_WEB_DIST`
at a bundle to make that explicit — in the Docker stack it is left unset
because nginx serves the UI and only `/api` reaches this service.

### Docker

`Dockerfile` builds the API on `python:3.13-slim` and runs it as a non-root
user. In production the container is stateless: it talks to Supabase over the
network via `HSK_DATABASE_URL`. The `/data` volume + `HSK_DB_PATH` remain for
SQLite runs. Its health check calls `/api/health`, which queries the database.
Build it on its own with:

```bash
docker build -t hsk4-practice-api backend
docker run --rm -p 8000:8000 \
  -e HSK_DATABASE_URL='postgresql://…' hsk4-practice-api
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

### One set of SQL, two databases

`app/db.py` holds the only dialect-specific code. `?` and `:name` placeholders
are rewritten to psycopg's `%s` / `%(name)s`, `AUTOINCREMENT` becomes
`GENERATED BY DEFAULT AS IDENTITY`, and the two schemas are written out
separately. Everything else is deliberately portable and used as-is:
`RETURNING` (instead of `lastrowid`), `ON CONFLICT … DO UPDATE`,
`COUNT(*) FILTER (WHERE …)`, `<>` (instead of `!=`).

Two consequences worth knowing:

- Catalogue rows are normalised before insertion (`scoreable` is a JSON
  boolean, but the column is an integer) because PostgreSQL refuses to insert a
  boolean parameter into an `INTEGER` column, while SQLite quietly accepts it.
- The PostgreSQL schema enables **row-level security with no policies** on all
  three tables. Supabase exposes the `public` schema over its Data API and
  grants the `anon` role access to new tables there; this closes that path. The
  API connects as the table owner, which bypasses RLS, so nothing changes for
  the app. (Harmless on a plain PostgreSQL.)

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

## Authentication

Every endpoint except `/api/health` requires a Supabase access token:

```
Authorization: Bearer <supabase access token>
```

`app/auth.py` verifies the token's signature locally and returns a
`Principal` (user id, email) that the routers scope their queries with. Both of
Supabase's signing systems are supported, chosen per token from its own `alg`
header:

| Token | Verified with |
| --- | --- |
| `ES256` / `RS256` (the signing-keys system) | the project's public keys, fetched from `{HSK_SUPABASE_URL}/auth/v1/.well-known/jwks.json` and cached for 10 minutes |
| `HS256` (the legacy shared secret) | `HSK_SUPABASE_JWT_SECRET` |

Anything else — including the classic `alg: none` bypass — is refused before any
key is fetched. Expiry, audience (`authenticated`) and issuer
(`{HSK_SUPABASE_URL}/auth/v1`) are all checked.

| Environment variable | Purpose |
| --- | --- |
| `HSK_SUPABASE_URL` | project URL; derives the issuer and the JWKS endpoint |
| `HSK_SUPABASE_JWT_SECRET` | legacy shared secret, for projects that have not migrated to signing keys |
| `HSK_ALLOWED_EMAILS` | comma-separated allow-list; **empty means any account in the project may use the API** |
| `HSK_SUPABASE_JWKS_URL`, `HSK_SUPABASE_JWT_ISSUER`, `HSK_SUPABASE_JWT_AUDIENCE` | overrides, for a self-hosted Auth or a custom domain |

Set `HSK_SUPABASE_URL` and `HSK_SUPABASE_JWT_SECRET` together: an asymmetric
token needs the URL, a legacy token needs the secret, and configuring both means
you never have to determine which system the project is on.

With nothing configured, the app still starts and `/api/health` still answers,
but every other endpoint returns **503** rather than quietly serving everyone.

Failures are deliberately distinct:

| Status | Meaning |
| --- | --- |
| `401` | no token, malformed token, bad signature, expired, wrong audience/issuer |
| `403` | a valid token whose email is not on `HSK_ALLOWED_EMAILS` |
| `503` | the server has no Supabase configuration at all |

### Every account's history is its own

`sessions.user_id` and `reviews.user_id` hold the Supabase user id, every query
filters on it, and a session belonging to someone else is a `404` — the API does
not confirm that another account's session exists. The question catalogue is
shared; the history and the spaced-repetition state are not.

Rows created before the app had accounts keep `user_id = ''`, which matches no
account, so they are invisible rather than deleted. `init_schema` adds the
column to an existing database in place.

`GET /api/me` returns the caller's id, email, role and their own row counts —
useful for checking that a token is being read the way you expect.

## Endpoints

Every row below except `/api/health` requires `Authorization: Bearer <token>`.

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

115 tests cover the catalogue bridge (including a subprocess check that
`catalogue.json` is in sync with the Angular data), the schema and its in-place
upgrade, the SQLite/PostgreSQL dialect layer, token verification (including
`alg: none`, tampering, expiry, audience, issuer and allow-list rejections),
per-account isolation, the scheduling maths, deck ordering and filtering, the
session lifecycle and validation rules, and every statistics definition above.

Tests sign in as one of two allowed accounts; the `client` fixture carries a
token for the first, and `tests/conftest.py` mints its own tokens with a
throwaway secret, so nothing reaches Supabase.

The suite runs on SQLite by default. To run the *same* tests against PostgreSQL
— which is what CI does — point it at a throwaway database:

```bash
docker run -d --rm --name hsk-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=hsk -p 55432:5432 postgres:17-alpine

HSK_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/hsk' \
  ./.venv/bin/python -m pytest -q
```
