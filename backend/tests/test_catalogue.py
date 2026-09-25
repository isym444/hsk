"""The catalogue bridge between the Angular data layer and the database."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.catalogue import CatalogueError, category_totals, load_catalogue
from app.db import Database

BACKEND_DIR = Path(__file__).resolve().parent.parent
CATALOGUE_PATH = BACKEND_DIR / "data" / "catalogue.json"
KEY_PATTERN = re.compile(r"^H410\d\d:(listening|reading|writing):[a-z]+:\d+$")

EXPECTED = {
    "listening": {"total": 135, "scoreable": 135},
    "reading": {"total": 120, "scoreable": 120},
    "writing": {"total": 45, "scoreable": 30},
}


def test_catalogue_covers_every_question_of_every_paper(catalogue: dict) -> None:
    assert len(catalogue["questions"]) == 300
    assert catalogue["papers"] == ["H41001", "H41002", "H41003"]
    assert category_totals(catalogue) == EXPECTED


def test_every_catalogue_key_is_unique_and_well_formed(catalogue: dict) -> None:
    keys = [q["key"] for q in catalogue["questions"]]
    assert len(set(keys)) == 300
    assert all(KEY_PATTERN.match(key) for key in keys)


def test_catalogue_categories_match_the_deck_contract(catalogue: dict) -> None:
    assert [(c["key"], c["total"]) for c in catalogue["categories"]] == [
        ("listening", 135),
        ("reading", 120),
        ("writing", 45),
    ]
    assert all(c["label"] for c in catalogue["categories"])


def test_only_open_writing_items_are_self_assessed(catalogue: dict) -> None:
    unscoreable = [q for q in catalogue["questions"] if not q["scoreable"]]
    assert len(unscoreable) == 15
    assert {q["kind"] for q in unscoreable} == {"open"}
    assert {q["category"] for q in unscoreable} == {"writing"}


def test_missing_catalogue_fails_loudly(tmp_path: Path) -> None:
    with pytest.raises(CatalogueError, match="not found"):
        load_catalogue(tmp_path / "absent.json")


def test_malformed_catalogue_fails_loudly(tmp_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({"questions": [{"key": "x"}]}), encoding="utf-8")
    with pytest.raises(CatalogueError, match="missing fields"):
        load_catalogue(broken)


def test_startup_seeds_every_question(tmp_path: Path) -> None:
    from app.main import create_app

    app = create_app(db_path=tmp_path / "seed.sqlite3", catalogue_path=CATALOGUE_PATH)
    with TestClient(app):
        conn = app.state.db.connect()
        try:
            count = conn.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"]
            by_category = {
                row["category"]: row["n"]
                for row in conn.execute(
                    "SELECT category, COUNT(*) AS n FROM questions GROUP BY category"
                )
            }
        finally:
            conn.close()

    assert count == 300
    assert by_category == {"listening": 135, "reading": 120, "writing": 45}


def test_health_reports_a_seeded_database(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["questions"] == 300
    assert body["reviews"] == 0
    assert body["sessions"] == 0


def test_reseeding_is_idempotent(tmp_path: Path) -> None:
    database = Database(tmp_path / "idempotent.sqlite3")
    database.init_schema()
    catalogue = load_catalogue(CATALOGUE_PATH)

    database.seed_catalogue(catalogue["questions"])
    database.seed_catalogue(catalogue["questions"])

    conn = database.connect()
    try:
        assert conn.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"] == 300
    finally:
        conn.close()


def test_stale_questions_are_deactivated_but_keep_their_history(tmp_path: Path) -> None:
    database = Database(tmp_path / "stale.sqlite3")
    database.init_schema()
    catalogue = load_catalogue(CATALOGUE_PATH)
    database.seed_catalogue(catalogue["questions"])

    conn = database.connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO reviews (question_key, category, mode, outcome, elapsed_ms,"
                " answered_at, created_at) VALUES (?, 'reading', 'random', 'correct', 1,"
                " '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
                ("H41001:reading:fill:46",),
            )
    finally:
        conn.close()

    # Re-seed without one question, as if a paper had been removed upstream.
    reduced = [q for q in catalogue["questions"] if q["key"] != "H41001:reading:fill:46"]
    database.seed_catalogue(reduced)

    conn = database.connect()
    try:
        active = conn.execute(
            "SELECT active FROM questions WHERE question_key = 'H41001:reading:fill:46'"
        ).fetchone()
        reviews = conn.execute("SELECT COUNT(*) AS n FROM reviews").fetchone()["n"]
    finally:
        conn.close()

    assert active["active"] == 0, "a question missing from the catalogue is deactivated"
    assert reviews == 1, "review history survives a catalogue change"


def test_generated_catalogue_is_in_sync_with_the_angular_data() -> None:
    """Guards against editing the question data without regenerating the JSON."""
    if shutil.which("node") is None:  # pragma: no cover - node is a dev dependency
        pytest.skip("node is not available")

    result = subprocess.run(
        ["node", "scripts/export_catalogue.mjs", "--check"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"{result.stdout}{result.stderr}\n"
        "Run: node backend/scripts/export_catalogue.mjs"
    )
