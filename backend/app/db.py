"""SQLite access layer: schema, connections and catalogue seeding.

The database is deliberately plain SQLite (standard-library ``sqlite3``, no
ORM): the schema is small, the queries are aggregate-heavy, and keeping the
SQL visible makes the review/statistics semantics easy to audit.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS questions (
    question_key TEXT PRIMARY KEY,
    paper        TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    kind         TEXT    NOT NULL,
    number       INTEGER NOT NULL,
    part         INTEGER NOT NULL,
    scoreable    INTEGER NOT NULL,
    label        TEXT    NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category, active);

CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT PRIMARY KEY,
    category          TEXT    NOT NULL,
    mode              TEXT    NOT NULL,
    started_at        TEXT    NOT NULL,
    ended_at          TEXT,
    tz_offset_minutes INTEGER,
    answered          INTEGER NOT NULL DEFAULT 0,
    correct           INTEGER NOT NULL DEFAULT 0,
    incorrect         INTEGER NOT NULL DEFAULT 0,
    self_assessed     INTEGER NOT NULL DEFAULT 0,
    total_ms          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category, started_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    question_key      TEXT NOT NULL REFERENCES questions(question_key),
    category          TEXT NOT NULL,
    mode              TEXT NOT NULL,
    outcome           TEXT NOT NULL CHECK (outcome IN ('correct', 'incorrect', 'self_assessed')),
    elapsed_ms        INTEGER NOT NULL DEFAULT 0,
    answered_at       TEXT NOT NULL,            -- UTC ISO-8601, authoritative
    answered_at_local TEXT,                     -- client-reported local time
    created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_question ON reviews(question_key);
CREATE INDEX IF NOT EXISTS idx_reviews_category_time ON reviews(category, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_session ON reviews(session_id);
"""


class Database:
    """Owns the database path and hands out short-lived connections."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(
            self.path,
            # FastAPI runs sync endpoints in a threadpool; a connection is
            # created and closed inside a single request, but not necessarily
            # on the same thread, so the default same-thread guard is too strict.
            check_same_thread=False,
            timeout=10.0,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    def init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            conn.commit()

    def seed_catalogue(self, questions: Iterable[dict], keep_stale: bool = True) -> int:
        """Upserts the question catalogue.

        Questions that disappeared from the catalogue are deactivated rather
        than deleted (`keep_stale=True`) so review history keeps its foreign
        key target. Pass ``keep_stale=False`` only when the history is
        disposable.
        """
        rows = list(questions)
        with self.connect() as conn:
            conn.executemany(
                """
                INSERT INTO questions
                    (question_key, paper, category, kind, number, part, scoreable, label, active)
                VALUES (:key, :paper, :category, :kind, :number, :part, :scoreable, :label, 1)
                ON CONFLICT(question_key) DO UPDATE SET
                    paper     = excluded.paper,
                    category  = excluded.category,
                    kind      = excluded.kind,
                    number    = excluded.number,
                    part      = excluded.part,
                    scoreable = excluded.scoreable,
                    label     = excluded.label,
                    active    = 1
                """,
                rows,
            )
            if rows:
                placeholders = ",".join("?" for _ in rows)
                keys = [row["key"] for row in rows]
                if keep_stale:
                    conn.execute(
                        f"UPDATE questions SET active = 0 WHERE question_key NOT IN ({placeholders})",
                        keys,
                    )
                else:
                    conn.execute(
                        f"DELETE FROM questions WHERE question_key NOT IN ({placeholders})",
                        keys,
                    )
            conn.commit()
        return len(rows)
