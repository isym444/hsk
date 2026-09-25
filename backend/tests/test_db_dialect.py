"""Unit tests for the dialect layer in `app.db`.

These need no database server: they pin the placeholder translation, the
statement splitter and the backend selection that let one set of SQL run on
both SQLite and PostgreSQL.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.db import (
    SCHEMA_POSTGRES,
    Database,
    PostgresDatabase,
    _statements,
    _to_pyformat,
    create_database,
    validate_schema_name,
)


def test_positional_placeholders_become_pyformat() -> None:
    assert _to_pyformat("SELECT * FROM reviews WHERE category = ?") == (
        "SELECT * FROM reviews WHERE category = %s"
    )


def test_named_placeholders_become_pyformat() -> None:
    sql = _to_pyformat(
        "INSERT INTO questions (question_key, paper) VALUES (:key, :paper)"
    )
    assert sql == (
        "INSERT INTO questions (question_key, paper) VALUES (%(key)s, %(paper)s)"
    )


def test_both_placeholder_styles_can_appear_together() -> None:
    sql = _to_pyformat("SELECT :label WHERE category = ?")
    assert sql == "SELECT %(label)s WHERE category = %s"


def test_translation_is_idempotent_for_untouched_sql() -> None:
    sql = "SELECT COUNT(*) AS n FROM questions WHERE active = 1"
    assert _to_pyformat(sql) == sql


def test_statement_splitter_drops_blank_fragments() -> None:
    script = "CREATE TABLE a (id INT);\n\nCREATE INDEX i ON a(id);\n"
    assert list(_statements(script)) == [
        "CREATE TABLE a (id INT)",
        "CREATE INDEX i ON a(id)",
    ]


def test_a_semicolon_inside_a_comment_does_not_split_a_statement() -> None:
    """Regression: the PostgreSQL schema has `;` inside its `--` comments."""
    script = (
        "-- a column is TEXT; it holds an id;\n"
        "CREATE TABLE a (id TEXT);\n"
        "-- another note; with a semicolon\n"
        "CREATE INDEX i ON a(id);\n"
    )
    assert list(_statements(script)) == [
        "CREATE TABLE a (id TEXT)",
        "CREATE INDEX i ON a(id)",
    ]


def test_the_postgres_schema_splits_into_the_expected_statements() -> None:
    """Every statement in the real schema is complete and non-empty."""
    statements = list(_statements(SCHEMA_POSTGRES))
    assert len(statements) >= 10
    assert all(not statement.startswith("--") for statement in statements)
    assert all(statement.upper().startswith(("CREATE", "DROP", "ALTER")) for statement in statements)


def test_a_database_url_selects_postgres() -> None:
    database = create_database(connection_url="postgresql://u:p@localhost:5432/db")
    assert isinstance(database, PostgresDatabase)
    database.close()  # never opened, so this is a no-op


def test_no_url_falls_back_to_sqlite(tmp_path: Path) -> None:
    database = create_database(path=tmp_path / "reviews.sqlite3")
    assert isinstance(database, Database)
    conn = database.connect()
    try:
        assert isinstance(conn, sqlite3.Connection)
    finally:
        conn.close()


def test_an_explicit_path_beats_an_ambient_database_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The test suite must stay on SQLite even with a real DSN exported."""
    monkeypatch.setenv("HSK_DATABASE_URL", "postgresql://u:p@localhost:5432/db")
    database = create_database(path=tmp_path / "forced.sqlite3")
    assert isinstance(database, Database)

    conn = database.connect()
    try:
        assert isinstance(conn, sqlite3.Connection)
    finally:
        conn.close()


def test_an_existing_pre_auth_database_is_upgraded_in_place(tmp_path: Path) -> None:
    """A database from before accounts existed gains `user_id` and keeps working.

    This is the path a real deployment takes: `CREATE TABLE IF NOT EXISTS`
    leaves the old tables alone, so the column has to be added, and the
    user-scoped indexes can only be created afterwards.
    """
    import sqlite3 as sqlite

    from app import stats

    path = tmp_path / "legacy.sqlite3"
    raw = sqlite.connect(path)
    raw.executescript(
        """
        CREATE TABLE questions (
            question_key TEXT PRIMARY KEY, paper TEXT NOT NULL, category TEXT NOT NULL,
            kind TEXT NOT NULL, number INTEGER NOT NULL, part INTEGER NOT NULL,
            scoreable INTEGER NOT NULL, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY, category TEXT NOT NULL, mode TEXT NOT NULL,
            started_at TEXT NOT NULL, ended_at TEXT, tz_offset_minutes INTEGER,
            answered INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
            incorrect INTEGER NOT NULL DEFAULT 0, self_assessed INTEGER NOT NULL DEFAULT 0,
            total_ms INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, question_key TEXT NOT NULL,
            category TEXT NOT NULL, mode TEXT NOT NULL, outcome TEXT NOT NULL,
            elapsed_ms INTEGER NOT NULL DEFAULT 0, answered_at TEXT NOT NULL,
            answered_at_local TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX idx_sessions_category ON sessions(category, started_at DESC);
        CREATE INDEX idx_reviews_category_time ON reviews(category, answered_at DESC);
        INSERT INTO sessions (id, category, mode, started_at, answered)
            VALUES ('legacy', 'reading', 'random', '2026-01-01T00:00:00.000Z', 1);
        INSERT INTO reviews
            (session_id, question_key, category, mode, outcome, elapsed_ms, answered_at, created_at)
            VALUES ('legacy', 'H41001:reading:fill:46', 'reading', 'random', 'correct', 100,
                    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
        """
    )
    raw.commit()
    raw.close()

    database = Database(path)
    database.init_schema()  # must not raise on the pre-auth schema
    database.init_schema()  # and must be safe to repeat

    conn = database.connect()
    try:
        assert "user_id" in {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}

        # The pre-auth row belongs to nobody, so no account can see it.
        assert conn.execute(
            "SELECT user_id FROM sessions WHERE id = 'legacy'"
        ).fetchone()["user_id"] == ""
        assert stats.question_history(conn, "reading", "any-user-id") == {}
        assert stats.recent_sessions(conn, "any-user-id") == []

        # The new indexes exist and the superseded ones are gone.
        session_indexes = {row["name"] for row in conn.execute("PRAGMA index_list(sessions)")}
        review_indexes = {row["name"] for row in conn.execute("PRAGMA index_list(reviews)")}
        assert "idx_sessions_user_category" in session_indexes
        assert "idx_sessions_category" not in session_indexes
        assert "idx_reviews_user_category_time" in review_indexes
        assert "idx_reviews_category_time" not in review_indexes
    finally:
        conn.close()


def test_a_schema_name_is_validated_before_it_reaches_sql() -> None:
    """The schema is interpolated into DDL, so it gets checked at the boundary."""
    assert validate_schema_name("hsk") == "hsk"
    assert validate_schema_name("hsk4_practice") == "hsk4_practice"

    for bad in ("public; DROP TABLE users", "HSK", "with space", "1st", "", 'a"b'):
        with pytest.raises(ValueError):
            validate_schema_name(bad)


def test_the_schema_is_only_used_for_postgres() -> None:
    database = create_database(
        connection_url="postgresql://u:p@localhost:5432/db", schema="hsk"
    )
    assert isinstance(database, PostgresDatabase)
    assert database.schema == "hsk"
    database.close()

    # SQLite has no schemas, so the setting is simply ignored.
    sqlite_database = create_database(path="/tmp/hsk-schema-ignored.sqlite3", schema="hsk")
    assert isinstance(sqlite_database, Database)


def test_postgres_describe_never_leaks_the_password() -> None:
    database = PostgresDatabase(
        "postgresql://postgres.abcdef:hunter2@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
    )
    described = database.describe()
    assert "hunter2" not in described
    assert described == "postgresql://aws-0-eu-west-2.pooler.supabase.com:5432/postgres"
    database.close()
