"""The numbers shown on the stats pages."""

from __future__ import annotations

from fastapi.testclient import TestClient

import json
from pathlib import Path

from tests.conftest import READING_FILL, READING_MC, WRITING_OPEN, answer


#: The level these assertions are about; the app always sends one.
HSK4 = {"level": "HSK4"}


def page(client: TestClient, category: str) -> dict:
    response = client.get(f"/api/stats/{category}", params=HSK4)
    assert response.status_code == 200, response.text
    return response.json()


def row_for(client: TestClient, category: str, key: str) -> dict:
    return next(q for q in page(client, category)["questions"] if q["question_key"] == key)



_CATALOGUE = json.loads(
    (Path(__file__).resolve().parent.parent / "data" / "catalogue.json").read_text(encoding="utf-8")
)
#: The tests below request level=HSK4, so their expectations are that level's
#: totals, not the whole two-bank catalogue.
LEVEL = "HSK4"
#: Papers of the level these tests request, not every paper shipped.
PAPERS = {q["paper"] for q in _CATALOGUE["questions"] if q["level"] == LEVEL}
CATEGORY_TOTALS = {
    key: sum(1 for q in _CATALOGUE["questions"] if q["category"] == key and q["level"] == LEVEL)
    for key in ("listening", "reading", "writing")
}
ALL_QUESTIONS = sum(CATEGORY_TOTALS.values())

def test_a_fresh_category_reports_no_history(client: TestClient) -> None:
    stats = page(client, "reading")["stats"]
    assert stats["total_questions"] == CATEGORY_TOTALS["reading"]
    assert stats["scoreable_questions"] == CATEGORY_TOTALS["reading"]
    assert stats["answered_questions"] == 0
    assert stats["unanswered_questions"] == CATEGORY_TOTALS["reading"]
    assert stats["coverage"] == 0.0
    assert stats["attempts"] == 0
    assert stats["success_rate"] is None
    assert stats["avg_ms"] is None
    assert stats["first_reviewed_at"] is None
    assert stats["last_reviewed_at"] is None
    assert stats["session_count"] == 0


def test_coverage_counts_distinct_questions_not_attempts(client: TestClient, session_id: str) -> None:
    for _ in range(3):
        answer(client, session_id, READING_FILL, "correct", 1000)

    stats = page(client, "reading")["stats"]
    assert stats["attempts"] == 3
    assert stats["answered_questions"] == 1
    assert stats["correct"] == 3
    assert stats["coverage"] == round(1 / CATEGORY_TOTALS["reading"], 4)


def test_success_rate_and_average_time_use_the_scored_reviews(
    client: TestClient, session_id: str
) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    answer(client, session_id, READING_MC, "incorrect", 4000)
    answer(client, session_id, "H41001:reading:order:56", "correct", 1000)

    stats = page(client, "reading")["stats"]
    assert stats["attempts"] == 3
    assert stats["correct"] == 2
    assert stats["incorrect"] == 1
    assert stats["success_rate"] == round(2 / 3, 4)
    assert stats["avg_ms"] == 2000.0, "(1000 + 4000 + 1000) / 3"


def test_self_assessed_writing_items_stay_out_of_rate_and_timing(client: TestClient) -> None:
    session = client.post("/api/sessions", json={"category": "writing"}).json()["id"]
    answer(client, session, "H41001:writing:build:86", "correct", 2000)
    answer(client, session, WRITING_OPEN, "self_assessed", 90000)

    stats = page(client, "writing")["stats"]
    assert stats["attempts"] == 2
    assert stats["answered_questions"] == 2
    assert stats["correct"] == 1
    assert stats["self_assessed"] == 1
    assert stats["scoreable_questions"] == CATEGORY_TOTALS["writing"] - 20
    assert stats["success_rate"] == 1.0, "a self-assessed item never counts as a failure"
    assert stats["avg_ms"] == 2000.0, "the self-assessed item's 90s does not distort the average"


def test_every_question_of_the_category_is_listed_with_its_history(client: TestClient, session_id: str) -> None:
    body = page(client, "reading")
    assert len(body["questions"]) == CATEGORY_TOTALS["reading"]
    assert {q["category"] for q in body["questions"]} == {"reading"}
    assert {q["paper"] for q in body["questions"]} == PAPERS

    untouched = [q for q in body["questions"] if q["attempts"] == 0]
    assert len(untouched) == CATEGORY_TOTALS["reading"]
    assert all(q["success_rate"] is None and q["avg_ms"] is None for q in untouched)
    assert all(q["last_answered_at"] is None for q in untouched)
    assert all(q["label"] for q in body["questions"])


def test_a_questions_row_reports_attempts_rate_time_and_streak(
    client: TestClient, session_id: str
) -> None:
    answer(client, session_id, READING_FILL, "correct", 2000)
    answer(client, session_id, READING_FILL, "correct", 4000)
    row = row_for(client, "reading", READING_FILL)

    assert (row["attempts"], row["correct"], row["incorrect"]) == (2, 2, 0)
    assert row["success_rate"] == 1.0
    assert row["avg_ms"] == 3000.0
    assert row["streak"] == 2
    assert row["last_answered_at"].endswith("Z")

    answer(client, session_id, READING_FILL, "incorrect", 6000)
    row = row_for(client, "reading", READING_FILL)
    assert row["streak"] == 0, "a wrong answer resets the streak"
    assert row["success_rate"] == round(2 / 3, 4)
    assert row["avg_ms"] == 4000.0, "(2000 + 4000 + 6000) / 3"


def test_kind_breakdown_splits_the_category_by_question_type(client: TestClient, session_id: str) -> None:
    before = {bucket["kind"]: bucket for bucket in page(client, "reading")["by_kind"]}
    # Taken from the catalogue so a new paper cannot silently break this.
    expected: dict[str, int] = {}
    for q in _CATALOGUE["questions"]:
        if q["category"] == "reading" and q["level"] == LEVEL:
            expected[q["kind"]] = expected.get(q["kind"], 0) + 1
    assert {kind: bucket["questions"] for kind, bucket in before.items()} == expected

    answer(client, session_id, READING_FILL, "correct", 2000)
    after = {bucket["kind"]: bucket for bucket in page(client, "reading")["by_kind"]}

    assert after["fill"]["answered_questions"] == 1
    assert after["fill"]["attempts"] == 1
    assert after["fill"]["success_rate"] == 1.0
    assert after["fill"]["avg_ms"] == 2000.0
    assert after["order"]["attempts"] == 0
    assert after["order"]["success_rate"] is None


def test_the_stats_page_carries_its_recent_sessions(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    client.post(f"/api/sessions/{session_id}/finish")

    sessions = page(client, "reading")["recent_sessions"]
    assert len(sessions) == 1
    assert sessions[0]["id"] == session_id
    assert sessions[0]["answered"] == 1
    assert sessions[0]["success_rate"] == 1.0
    assert sessions[0]["ended_at"] is not None


def test_recent_sessions_can_be_limited(client: TestClient) -> None:
    for _ in range(3):
        session = client.post("/api/sessions", json={"category": "reading"}).json()["id"]
        answer(client, session, READING_FILL, "correct", 1000)

    assert len(client.get("/api/stats/reading", params={**HSK4, "sessions": 2}).json()["recent_sessions"]) == 2


def test_overview_lists_every_category_in_a_stable_order(client: TestClient) -> None:
    body = client.get("/api/categories", params=HSK4).json()
    assert [c["category"] for c in body["categories"]] == ["listening", "reading", "writing"]
    assert {c["category"]: c["total_questions"] for c in body["categories"]} == CATEGORY_TOTALS


def test_overview_totals_weight_the_average_by_attempts(client: TestClient) -> None:
    reading = client.post("/api/sessions", json={"category": "reading"}).json()["id"]
    answer(client, reading, READING_FILL, "correct", 1000)

    writing = client.post("/api/sessions", json={"category": "writing"}).json()["id"]
    for key in ("H41001:writing:build:86", "H41001:writing:build:87", "H41001:writing:build:88"):
        answer(client, writing, key, "correct", 3000)

    body = client.get("/api/categories", params=HSK4).json()
    per_category = {c["category"]: c for c in body["categories"]}
    assert per_category["reading"]["avg_ms"] == 1000.0
    assert per_category["writing"]["avg_ms"] == 3000.0

    totals = body["totals"]
    assert totals["total_questions"] == ALL_QUESTIONS
    assert totals["attempts"] == 4
    assert totals["answered_questions"] == 4
    assert totals["correct"] == 4
    assert totals["success_rate"] == 1.0
    assert totals["avg_ms"] == 2500.0, "the combined average is weighted, not a mean of means"
    assert totals["coverage"] == round(4 / ALL_QUESTIONS, 4)


def test_overview_reports_an_empty_history_without_dividing_by_zero(client: TestClient) -> None:
    totals = client.get("/api/categories", params=HSK4).json()["totals"]
    assert totals["success_rate"] is None
    assert totals["avg_ms"] is None
    assert totals["coverage"] == 0.0


def test_unknown_categories_are_rejected(client: TestClient) -> None:
    assert client.get("/api/stats/speaking").status_code == 422
