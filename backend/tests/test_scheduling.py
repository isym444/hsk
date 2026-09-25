"""The random and success-rate/spaced-repetition deck ordering."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import pytest

from app.scheduling import (
    MAX_INTERVAL_DAYS,
    WEIGHT_NEW,
    order_deck,
    priority,
    review_interval_days,
    weighted_order,
)

NOW = datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)


def row(
    key: str,
    attempts: int = 0,
    success_rate: float | None = None,
    days_since: float | None = None,
    streak: int = 0,
) -> dict:
    return {
        "question_key": key,
        "attempts": attempts,
        "success_rate": success_rate,
        "streak": streak,
        "last_answered_at_dt": None if days_since is None else NOW - timedelta(days=days_since),
    }


def test_review_interval_doubles_with_each_correct_answer_and_then_caps() -> None:
    assert [review_interval_days(streak) for streak in range(8)] == [1, 2, 4, 8, 16, 32, 60, 60]
    assert review_interval_days(99) == MAX_INTERVAL_DAYS
    assert review_interval_days(-3) == 1


def test_never_seen_questions_are_new_and_weighted_highest() -> None:
    weight, reason = priority(0, 0.0, None, 0, now=NOW)
    assert reason == "new"
    assert weight == WEIGHT_NEW


def test_repeatedly_wrong_questions_are_flagged_weak() -> None:
    weight, reason = priority(2, 0.0, NOW, streak=0, now=NOW)
    assert reason == "weak"
    assert weight > WEIGHT_NEW / 2


def test_mastered_questions_sink_to_the_bottom() -> None:
    weak_weight, _ = priority(2, 0.0, NOW, streak=0, now=NOW)
    mastered_weight, reason = priority(5, 1.0, NOW, streak=4, now=NOW)
    assert reason == "mastered"
    assert mastered_weight < weak_weight


def test_a_question_you_keep_getting_right_becomes_due_again_over_time() -> None:
    fresh, fresh_reason = priority(3, 1.0, NOW - timedelta(days=0.5), streak=1, now=NOW)
    overdue, overdue_reason = priority(3, 1.0, NOW - timedelta(days=30), streak=1, now=NOW)
    assert fresh_reason == "review"
    assert overdue_reason == "due"
    assert overdue > fresh


def test_a_long_correct_streak_is_marked_mastered_and_deprioritised() -> None:
    mastered, reason = priority(4, 1.0, NOW - timedelta(days=1), streak=3, now=NOW)
    assert reason == "mastered"
    assert mastered < 1.0


def test_weight_rises_with_weakness_and_with_overdueness() -> None:
    strong, _ = priority(4, 0.95, NOW, streak=3, now=NOW)
    shaky, _ = priority(4, 0.4, NOW, streak=3, now=NOW)
    assert shaky > strong

    recent, _ = priority(4, 0.5, NOW, streak=1, now=NOW)
    stale, _ = priority(4, 0.5, NOW - timedelta(days=5), streak=1, now=NOW)
    assert stale > recent


def test_weighted_order_is_a_permutation_of_its_input() -> None:
    rows = [row(f"k{i}") for i in range(25)]
    for i, entry in enumerate(rows):
        entry["priority"] = 1.0 + i / 25
    ordered = weighted_order(rows, random.Random(7))
    assert sorted(r["question_key"] for r in ordered) == sorted(r["question_key"] for r in rows)
    assert len(ordered) == 25


def test_weighted_order_strongly_prefers_the_heaviest_question() -> None:
    heavy = row("heavy")
    heavy["priority"] = 10.0
    light = row("light")
    light["priority"] = 0.01

    firsts = [weighted_order([heavy, light], random.Random(seed))[0]["question_key"] for seed in range(25)]
    assert firsts.count("heavy") >= 24


def test_random_mode_is_a_permutation_that_varies_between_sessions() -> None:
    rows = [row(f"k{i}") for i in range(60)]
    first = [r["question_key"] for r in order_deck(rows, mode="random", rng=random.Random(1))]
    second = [r["question_key"] for r in order_deck(rows, mode="random", rng=random.Random(2))]
    assert sorted(first) == sorted(second)
    assert first != second
    assert all(r["reason"] == "random" for r in order_deck(rows, mode="random", rng=random.Random(3)))


def test_smart_mode_is_deterministic_for_a_given_random_state() -> None:
    rows = [row(f"k{i}", attempts=2, success_rate=0.5, days_since=i) for i in range(30)]
    first = [r["question_key"] for r in order_deck(rows, mode="smart", rng=random.Random(42), now=NOW)]
    second = [r["question_key"] for r in order_deck(rows, mode="smart", rng=random.Random(42), now=NOW)]
    assert first == second
    assert len(first) == 30


def test_smart_mode_keeps_every_question_eligible_and_honours_the_limit() -> None:
    rows = [row(f"k{i}", attempts=1, success_rate=1.0, days_since=0, streak=5) for i in range(40)]
    full = order_deck(rows, mode="smart", rng=random.Random(5), now=NOW)
    limited = order_deck(rows, mode="smart", limit=7, rng=random.Random(5), now=NOW)
    assert len(full) == 40, "even fully mastered questions stay in the deck"
    assert len(limited) == 7
    assert [r["question_key"] for r in limited] == [r["question_key"] for r in full[:7]]


def test_limit_of_zero_yields_an_empty_deck() -> None:
    rows = [row("k0")]
    assert order_deck(rows, mode="random", limit=0) == []


def test_unknown_modes_are_rejected() -> None:
    with pytest.raises(ValueError, match="unknown deck mode"):
        order_deck([row("k0")], mode="magic")
