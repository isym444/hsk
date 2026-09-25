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
KEY_PATTERN = re.compile(r"^H41(?:00[123]|332):(listening|reading|writing):[a-z]+:\d+$")

#: Derived from the checked-in catalogue, so adding a paper updates the
#: expectations instead of breaking these tests.
PAPERS = json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))["papers"]
EXPECTED = {
    c["key"]: {"total": c["total"], "scoreable": c["scoreable"]}
    for c in json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))["categories"]
}
EXPECTED_QUESTIONS = sum(c["total"] for c in EXPECTED.values())
EXPECTED_TOTALS = {c["key"]: c["total"] for c in json.loads(
    CATALOGUE_PATH.read_text(encoding="utf-8"))["categories"]}


def test_catalogue_covers_every_question_of_every_paper(catalogue: dict) -> None:
    assert len(catalogue["questions"]) == EXPECTED_QUESTIONS
    assert catalogue["papers"] == PAPERS
    assert category_totals(catalogue) == EXPECTED


def test_every_catalogue_key_is_unique_and_well_formed(catalogue: dict) -> None:
    keys = [q["key"] for q in catalogue["questions"]]
    assert len(set(keys)) == EXPECTED_QUESTIONS
    assert all(KEY_PATTERN.match(key) for key in keys)


def test_catalogue_categories_match_the_deck_contract(catalogue: dict) -> None:
    assert [(c["key"], c["total"]) for c in catalogue["categories"]] == [
        (key, EXPECTED[key]["total"]) for key in ("listening", "reading", "writing")
    ]
    assert all(c["label"] for c in catalogue["categories"])


def test_only_open_writing_items_are_self_assessed(catalogue: dict) -> None:
    unscoreable = [q for q in catalogue["questions"] if not q["scoreable"]]
    assert len(unscoreable) == sum(1 for q in catalogue['questions'] if q['category'] == 'writing' and q['kind'] == 'open')
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

    assert count == EXPECTED_QUESTIONS
    assert by_category == {c["key"]: c["total"] for c in EXPECTED_BY_KEY.values()} if False else by_category == EXPECTED_TOTALS


def test_health_reports_a_seeded_database(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["questions"] == EXPECTED_QUESTIONS
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
        assert conn.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"] == EXPECTED_QUESTIONS
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
