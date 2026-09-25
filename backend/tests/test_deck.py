"""Deck endpoints: the aggregated cards handed to the practice runner."""

from __future__ import annotations

from fastapi.testclient import TestClient

import json
from pathlib import Path

from tests.conftest import READING_FILL, READING_MC, answer

_CATALOGUE = json.loads(
    (Path(__file__).resolve().parent.parent / "data" / "catalogue.json").read_text(encoding="utf-8")
)
EXPECTED_TOTALS = {c["key"]: c["total"] for c in _CATALOGUE["categories"]}
PAPERS = set(_CATALOGUE["papers"])


def test_each_category_deck_aggregates_every_paper(client: TestClient) -> None:
    for category, total in EXPECTED_TOTALS.items():
        body = client.get(f"/api/deck/{category}").json()
        assert body["count"] == total, category
        assert body["total_questions"] == total
        keys = [q["question_key"] for q in body["questions"]]
        assert len(set(keys)) == total, "no question is repeated within one deck"
        assert {key.split(":")[1] for key in keys} == {category}
        assert {key.split(":")[0] for key in keys} == PAPERS, "the deck draws on every paper"


def test_deck_carries_the_labels_and_part_information_the_ui_needs(client: TestClient) -> None:
    question = client.get("/api/deck/writing").json()["questions"][0]
    assert question["label"]
    assert question["paper"] in PAPERS
    assert question["part"] in {1, 2}
    assert question["number"] >= 1


def test_random_mode_reorders_between_requests(client: TestClient) -> None:
    first = [q["question_key"] for q in client.get("/api/deck/reading").json()["questions"]]
    second = [q["question_key"] for q in client.get("/api/deck/reading").json()["questions"]]
    assert sorted(first) == sorted(second)
    assert first != second


def test_limit_caps_the_deck_without_dropping_questions_from_the_category(client: TestClient) -> None:
    body = client.get("/api/deck/reading", params={"limit": 10}).json()
    assert body["count"] == 10
    assert len(body["questions"]) == 10
    assert body["total_questions"] == EXPECTED_TOTALS["reading"]


def test_exclude_keeps_the_tail_of_the_current_queue_out_of_a_refill(client: TestClient) -> None:
    everything = client.get("/api/deck/writing").json()["questions"]
    keep = {q["question_key"] for q in everything[:5]}
    exclude = ",".join(q["question_key"] for q in everything[5:])

    body = client.get("/api/deck/writing", params={"exclude": exclude}).json()
    assert {q["question_key"] for q in body["questions"]} == keep


def test_excluding_every_question_falls_back_to_the_full_category(client: TestClient) -> None:
    keys = [q["question_key"] for q in client.get("/api/deck/writing").json()["questions"]]
    body = client.get("/api/deck/writing", params={"exclude": ",".join(keys)}).json()
    assert body["count"] == EXPECTED_TOTALS["writing"]


def test_unknown_category_or_mode_is_rejected(client: TestClient) -> None:
    assert client.get("/api/deck/speaking").status_code == 422
    assert client.get("/api/deck/reading", params={"mode": "chaos"}).status_code == 422
    assert client.get("/api/deck/reading", params={"limit": 0}).status_code == 422


def test_smart_mode_carries_a_reason_for_every_question(client: TestClient) -> None:
    questions = client.get("/api/deck/reading", params={"mode": "smart"}).json()["questions"]
    assert len(questions) == EXPECTED_TOTALS["reading"]
    assert {q["reason"] for q in questions} == {"new"}, "nothing has been reviewed yet"
    assert all(q["priority"] > 0 for q in questions)


def test_preview_counts_unseen_questions_before_any_practice(client: TestClient) -> None:
    body = client.get("/api/deck/reading/preview").json()
    total = EXPECTED_TOTALS["reading"]
    assert body == {
        "category": "reading",
        "total_questions": total,
        "answered": 0,
        "unseen": total,
        "weak": 0,
        "due": 0,
    }


def test_preview_tracks_answered_weak_and_due_questions(client: TestClient, session_id: str) -> None:
    answer(client, session_id, READING_FILL, "incorrect", 4000)
    answer(client, session_id, READING_MC, "correct", 2000)

    body = client.get("/api/deck/reading/preview").json()
    assert body["answered"] == 2
    assert body["unseen"] == EXPECTED_TOTALS["reading"] - 2
    assert body["weak"] == 1, "the question answered wrong is flagged weak"


def test_smart_mode_prioritises_a_weak_question_over_a_mastered_one(
    client: TestClient, session_id: str
) -> None:
    weak = READING_FILL
    mastered = READING_MC
    for _ in range(2):
        answer(client, session_id, weak, "incorrect", 5000)
    for _ in range(3):
        answer(client, session_id, mastered, "correct", 1500)

    # Leave exactly those two candidates in the deck so the ordering is
    # unambiguous; weighted sampling is random, so check it wins over repeats.
    keys = [q["question_key"] for q in client.get("/api/deck/reading").json()["questions"]]
    exclude = ",".join(key for key in keys if key not in {weak, mastered})

    firsts = [
        client.get(
            "/api/deck/reading", params={"mode": "smart", "exclude": exclude}
        ).json()["questions"][0]["question_key"]
        for _ in range(10)
    ]
    assert weak in firsts, "the weak question should surface first at least once"
    assert firsts.count(weak) >= 8

    reasons = {
        q["question_key"]: q["reason"]
        for q in client.get(
            "/api/deck/reading", params={"mode": "smart", "exclude": exclude}
        ).json()["questions"]
    }
    assert reasons[weak] == "weak"
    assert reasons[mastered] == "mastered"
