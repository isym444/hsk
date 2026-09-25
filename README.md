# HSK4 practice

Three ways to work through the HSK4 sample papers, plus review statistics:

| Path | What it is |
| --- | --- |
| `hsk4-practice.html` | The original single-file quiz app. Untouched reference/fallback. |
| `hsk4-practice-app/` | The Angular app: aggregated practice decks, stats pages, and the original per-paper quiz. |
| `backend/` | FastAPI + SQLite: the review database, statistics, and deck ordering. |
| `docs/superpowers/specs/` | Design documents. |

## What the app does

- **Aggregated decks.** H41001, H41002 and H41003 are pooled per skill:
  听力 (135 questions), 阅读 (120), 写作 (45). Practise a whole skill instead of
  one paper at a time.
- **Two ordering modes.** 随机练习 shuffles every time; 智能复习 weights by
  success rate and a spaced-repetition interval, so questions you get wrong and
  questions that are due come up sooner.
- **Sessions of any length.** The deck refills itself; you stop whenever you
  feel like it with 结束练习, and the end-of-session screen shows that run's
  answered/correct counts, success rate, average response time, duration and
  per-question detail.
- **Per-category statistics.** For each of the three decks: how many questions
  have been answered, coverage, success rate, average response time per
  question, attempts, a per-question table (attempts, correct/incorrect, streak,
  last answered) with filters (未作答 / 成功率<60% / 从没答对), the questions most
  in need of review, and recent sessions.
- **A real SQLite database.** Every answer is stored with its outcome
  (correct / incorrect / self-assessed), elapsed milliseconds, the UTC
  timestamp, and the browser's own local time.

## Running it

```bash
# once
cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements-dev.txt

# terminal 1: API on :8000
cd backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000

# terminal 2: frontend on :4200, /api proxied to :8000
cd hsk4-practice-app && npm install && npm start
```

Then open <http://localhost:4200>.

To run the whole thing from a single process instead:

```bash
cd hsk4-practice-app && npm run build
cd ../backend && ./.venv/bin/uvicorn app.main:app --port 8000   # serves the app at /
```

The review database lives at `backend/data/hsk_reviews.sqlite3`. It is local
data (git-ignored) — delete it to start your history over.

## Docker

Two containers: the Angular bundle served by nginx (which proxies `/api`), and
the FastAPI review API with SQLite on a named volume. No Python or Node needed
on the host.

```bash
docker compose up --build      # then open http://localhost:8080
```

| What | Where |
| --- | --- |
| App | <http://localhost:8080> |
| API docs | <http://localhost:8000/docs> |
| Review database | the `hsk-data` volume → `/data/hsk_reviews.sqlite3` |
| Images | `hsk4-practice-web` (nginx + static bundle), `hsk4-practice-api` |

```bash
WEB_PORT=3000 docker compose up   # if 8080 or 8000 is already taken
docker compose logs -f api        # follow either service
docker compose down               # stop, keeping the review history volume
docker compose down -v            # stop and delete the review history
```

Notes:

- The question catalogue is baked into the API image at build time. After
  editing anything in `hsk4-practice-app/src/app/data/`, run
  `npm run catalogue` and rebuild (`docker compose up --build`).
- The first build installs Python and npm dependencies, so it needs network
  access and takes a few minutes; later builds reuse those layers.
- `web` waits for the API's `/api/health` check before starting, so the first
  page load cannot race a booting backend.
- The API container runs as a non-root user, so the database lives on the
  `hsk-data` **named volume** rather than a host bind mount (a bind mount would
  be owned by your macOS user and unwritable).
- Docker Desktop (or another engine) has to be running.

Inspect or export the review database without leaving the terminal:

```bash
docker compose exec api python -c \
  "import sqlite3; print(sqlite3.connect('/data/hsk_reviews.sqlite3').execute('select outcome, count(*) from reviews group by outcome').fetchall())"
docker compose cp api:/data/hsk_reviews.sqlite3 ./hsk_reviews.sqlite3
```

## Tests

```bash
cd backend && ./.venv/bin/python -m pytest -q          # 64 tests
cd hsk4-practice-app && npm test                       # 180 tests
```

See [`hsk4-practice-app/README.md`](hsk4-practice-app/README.md) and
[`backend/README.md`](backend/README.md) for details, and
[`docs/superpowers/specs/2026-09-25-hsk4-decks-and-srs-design.md`](docs/superpowers/specs/2026-09-25-hsk4-decks-and-srs-design.md)
for the design.
