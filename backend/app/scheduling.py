"""Deck ordering: pure random, and success-rate + spaced-repetition weighted.

The "smart" mode is a lightweight SM-2-style scheduler rather than a strict
queue. Every question keeps a non-zero weight, so it stays eligible, but
weight is pushed towards questions you get wrong and towards questions whose
review interval has elapsed:

* unseen questions get a fixed high weight, so new material keeps flowing in;
* a question's review interval doubles with each consecutive correct answer
  (1, 2, 4, 8, 16, 32 days, capped at 60);
* ``overdue`` is days-since-last-review divided by that interval, capped at
  2.5 — the "spaced repetition" term;
* ``weakness`` is 1 - success rate — the "success rate" term.

Ordering is randomised *weighted sampling without replacement* (Efraimidis &
Spirakis: key = random ** (1 / weight), take the highest), so two sessions
with the same history do not present questions in the same order while the
priority still dominates over many draws.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any, Iterable

WEIGHT_BASE = 0.25
WEIGHT_WEAKNESS = 2.2
WEIGHT_OVERDUE = 0.9
WEIGHT_NEW = 3.0
MAX_OVERDUE = 2.5
MAX_INTERVAL_DAYS = 60.0

MODES = ("random", "smart")


def review_interval_days(streak: int) -> float:
    """1, 2, 4, 8, 16, 32 days for streaks 0..5, then capped at 60."""
    return min(2.0 ** min(max(streak, 0), 6), MAX_INTERVAL_DAYS)


def priority(
    attempts: int,
    success_rate: float,
    last_answered_at: datetime | None,
    streak: int,
    now: datetime | None = None,
) -> tuple[float, str]:
    """Returns ``(weight, reason)`` for one question."""
    if attempts == 0:
        return WEIGHT_NEW, "new"

    now = now or datetime.now(timezone.utc)
    interval = review_interval_days(streak)

    if last_answered_at is None:
        overdue = MAX_OVERDUE
    else:
        days_since = (now - last_answered_at).total_seconds() / 86400.0
        overdue = min(max(days_since, 0.0) / interval, MAX_OVERDUE)

    weakness = 1.0 - max(0.0, min(success_rate, 1.0))
    weight = WEIGHT_BASE + WEIGHT_WEAKNESS * weakness + WEIGHT_OVERDUE * overdue

    if streak == 0 and success_rate < 0.5:
        reason = "weak"
    elif overdue >= 1.0:
        reason = "due"
    elif success_rate >= 0.9 and streak >= 2:
        reason = "mastered"
    else:
        reason = "review"

    return weight, reason


def weighted_order(candidates: Iterable[dict[str, Any]], rng: random.Random) -> list[dict[str, Any]]:
    """Efraimidis-Spirakis weighted sampling without replacement."""
    keyed: list[tuple[float, int, dict[str, Any]]] = []
    for index, row in enumerate(candidates):
        weight = max(row["priority"], 1e-6)
        draw = rng.random() or 1e-12
        keyed.append((draw ** (1.0 / weight), index, row))
    # Descending key; the index tiebreak keeps ordering deterministic for a
    # given RNG state.
    keyed.sort(key=lambda item: (-item[0], item[1]))
    return [row for _, _, row in keyed]


def shuffled_order(candidates: Iterable[dict[str, Any]], rng: random.Random) -> list[dict[str, Any]]:
    rows = list(candidates)
    rng.shuffle(rows)
    return rows


def order_deck(
    rows: Iterable[dict[str, Any]],
    mode: str,
    limit: int | None = None,
    rng: random.Random | None = None,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Orders per-question stats rows into a practice deck."""
    if mode not in MODES:
        raise ValueError(f"unknown deck mode {mode!r}; expected one of {', '.join(MODES)}")

    rng = rng or random.Random()
    now = now or datetime.now(timezone.utc)
    candidates = list(rows)

    if mode == "random":
        ordered = shuffled_order(candidates, rng)
        for row in ordered:
            row["priority"] = None
            row["reason"] = "random"
    else:
        for row in candidates:
            row["priority"], row["reason"] = priority(
                attempts=row["attempts"],
                success_rate=row["success_rate"] or 0.0,
                last_answered_at=row.get("last_answered_at_dt"),
                streak=row.get("streak", 0),
                now=now,
            )
        ordered = weighted_order(candidates, rng)

    if limit is not None:
        ordered = ordered[: max(limit, 0)]
    return ordered
