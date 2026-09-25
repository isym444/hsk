"""Session lifecycle: start, record reviews, finish, re-read, discard."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from tests.conftest import READING_FILL, READING_MC, WRITING_OPEN, answer


def test_starting_a_session_records_category_mode_and_time(client: TestClient) -> None:
    response = client.post(
        "/api/sessions", json={"category": "writing", "mode": "smart", "tz_offset_minutes": 60}
    )
    assert response.status_code == 201
    body = response.json()

    assert re.fullmatch(r"[0-9a-f]{32}", body["id"])
    assert body["category"] == "writing"
    assert body["mode"] == "smart"
    assert body["answered"] == 0
    assert body["ended_at"] is None
    assert body["success_rate"] is None
    assert body["avg_ms"] is None
    assert body["started_at"].endswith("Z"), "timestamps are stored in UTC"


def test_recording_reviews_updates_the_running_tally(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    body = answer(client, session_id, READING_MC, "incorrect", 3000)

    session = body["session"]
    assert session["answered"] == 2
    assert session["correct"] == 1
    assert session["incorrect"] == 1
    assert session["total_ms"] == 4000
    assert session["success_rate"] == 0.5
    assert session["avg_ms"] == 2000.0


def test_reviews_are_stamped_in_utc_and_keep_the_client_local_time(
    client: TestClient, session_id: str
) -> None:
    """`answered_at` is the server's authoritative UTC receipt time; the
    client's own clock reading is preserved verbatim alongside it."""
    before = datetime.now(timezone.utc)
    response = client.post(
        f"/api/sessions/{session_id}/reviews",
        json={
            "question_key": READING_FILL,
            "outcome": "correct",
            "elapsed_ms": 2500,
            "answered_at": "2026-09-25T13:45:00.000+01:00",
        },
    )
    after = datetime.now(timezone.utc)
    assert response.status_code == 201

    stamped = response.json()["answered_at"]
    assert stamped.endswith("Z")
    parsed = datetime.fromisoformat(stamped.replace("Z", "+00:00"))
    # `iso()` truncates to whole milliseconds, so the stamp can land up to a
    # millisecond below `before`; without the tolerance this test is timing-flaky.
    tolerance = timedelta(milliseconds=1)
    assert (
        before - tolerance <= parsed <= after + tolerance
    ), "the review is stamped when the server receives it"

    summary = client.get(f"/api/sessions/{session_id}").json()
    item = summary["items"][0]
    assert item["answered_at"] == stamped
    assert item["answered_at_local"] == "2026-09-25T13:45:00.000+01:00"


def test_a_malformed_client_timestamp_is_rejected(client: TestClient, session_id: str) -> None:
    response = client.post(
        f"/api/sessions/{session_id}/reviews",
        json={"question_key": READING_FILL, "outcome": "correct", "answered_at": "yesterday"},
    )
    assert response.status_code == 422


def test_unknown_questions_and_sessions_are_rejected(client: TestClient, session_id: str) -> None:
    missing_question = client.post(
        f"/api/sessions/{session_id}/reviews",
        json={"question_key": "H41001:reading:fill:9999", "outcome": "correct"},
    )
    assert missing_question.status_code == 404

    assert client.post(
        "/api/sessions/nope/reviews",
        json={"question_key": READING_FILL, "outcome": "correct"},
    ).status_code == 404
    assert client.get("/api/sessions/nope").status_code == 404
    assert client.post("/api/sessions/nope/finish").status_code == 404


def test_a_question_from_another_category_cannot_enter_a_session(
    client: TestClient, session_id: str
) -> None:
    response = client.post(
        f"/api/sessions/{session_id}/reviews",
        json={"question_key": WRITING_OPEN, "outcome": "self_assessed"},
    )
    assert response.status_code == 422
    assert "belongs to writing" in response.json()["detail"]


def test_open_writing_items_must_be_self_assessed(client: TestClient) -> None:
    session = client.post("/api/sessions", json={"category": "writing"}).json()["id"]

    scored = client.post(
        f"/api/sessions/{session}/reviews",
        json={"question_key": WRITING_OPEN, "outcome": "correct"},
    )
    assert scored.status_code == 422
    assert "self-assessed" in scored.json()["detail"]


def test_scored_questions_cannot_be_marked_self_assessed(client: TestClient, session_id: str) -> None:
    response = client.post(
        f"/api/sessions/{session_id}/reviews",
        json={"question_key": READING_FILL, "outcome": "self_assessed"},
    )
    assert response.status_code == 422
    assert "is scored" in response.json()["detail"]


def test_self_assessed_reviews_count_as_answered_but_never_as_scored(client: TestClient) -> None:
    session = client.post("/api/sessions", json={"category": "writing"}).json()["id"]
    body = answer(client, session, WRITING_OPEN, "self_assessed", 9000)

    assert body["elapsed_ms"] == 0, "self-assessed time is not part of the scored timing"
    session_stats = body["session"]
    assert session_stats["answered"] == 1
    assert session_stats["self_assessed"] == 1
    assert session_stats["correct"] == 0
    assert session_stats["incorrect"] == 0
    assert session_stats["total_ms"] == 0
    assert session_stats["success_rate"] is None
    assert session_stats["avg_ms"] is None


def test_finishing_builds_a_summary_of_that_session(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    answer(client, session_id, READING_MC, "incorrect", 5000)

    response = client.post(f"/api/sessions/{session_id}/finish")
    assert response.status_code == 200
    summary = response.json()

    assert summary["ended_at"] is not None
    assert summary["duration_ms"] >= 0
    assert summary["answered"] == 2
    assert summary["success_rate"] == 0.5
    assert summary["avg_ms"] == 3000.0

    assert [item["question_key"] for item in summary["items"]] == [READING_FILL, READING_MC]
    assert [item["outcome"] for item in summary["items"]] == ["correct", "incorrect"]
    assert all(item["label"] for item in summary["items"])
    assert summary["items"][1]["elapsed_ms"] == 5000

    assert summary["prior"] == {"attempts": 0, "success_rate": None, "avg_ms": None}
    assert summary["category_stats"]["answered_questions"] == 2


def test_finishing_twice_keeps_the_first_end_time(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    first = client.post(f"/api/sessions/{session_id}/finish").json()
    second = client.post(f"/api/sessions/{session_id}/finish").json()
    assert first["ended_at"] == second["ended_at"]


def test_prior_stats_exclude_the_session_being_summarised(client: TestClient) -> None:
    first = client.post("/api/sessions", json={"category": "reading"}).json()["id"]
    answer(client, first, READING_FILL, "incorrect", 8000)
    client.post(f"/api/sessions/{first}/finish")

    second = client.post("/api/sessions", json={"category": "reading"}).json()["id"]
    answer(client, second, READING_MC, "correct", 2000)
    summary = client.post(f"/api/sessions/{second}/finish").json()

    assert summary["prior"]["attempts"] == 1
    assert summary["prior"]["success_rate"] == 0.0
    assert summary["prior"]["avg_ms"] == 8000.0
    assert summary["category_stats"]["attempts"] == 2, "lifetime stats include both sessions"


def test_sessions_can_be_listed_newest_first_and_filtered_by_category(client: TestClient) -> None:
    reading = client.post("/api/sessions", json={"category": "reading"}).json()["id"]
    answer(client, reading, READING_FILL, "correct", 1000)

    writing = client.post("/api/sessions", json={"category": "writing"}).json()["id"]
    answer(client, writing, WRITING_OPEN, "self_assessed", 0)

    empty = client.post("/api/sessions", json={"category": "listening"}).json()["id"]

    all_sessions = client.get("/api/sessions", params={"limit": 10}).json()
    assert [s["id"] for s in all_sessions][0] == writing, "newest first"
    assert empty not in [s["id"] for s in all_sessions], "sessions with no answers are hidden"

    reading_only = client.get("/api/sessions", params={"category": "reading"}).json()
    assert [s["id"] for s in reading_only] == [reading]


def test_deleting_a_session_discards_its_reviews(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "correct", 1000)
    assert client.delete(f"/api/sessions/{session_id}").status_code == 204

    assert client.get(f"/api/sessions/{session_id}").status_code == 404
    stats = client.get("/api/stats/reading").json()["stats"]
    assert stats["attempts"] == 0
    assert stats["answered_questions"] == 0
    assert client.get("/api/me").json()["reviews"] == 0


def test_a_session_survives_a_refresh(client: TestClient, session_id: str) -> None:
    """The summary page is fetchable by id, so a reload does not lose it."""
    answer(client, session_id, READING_FILL, "correct", 1000)
    client.post(f"/api/sessions/{session_id}/finish")

    fetched = client.get(f"/api/sessions/{session_id}").json()
    assert fetched["answered"] == 1
    assert fetched["ended_at"] is not None
    assert fetched["items"][0]["question_key"] == READING_FILL
