"""Deck endpoints: the aggregated, ordered question queue for one category."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from .. import scheduling, stats
from ..deps import get_db
from ..schemas import Category, DeckResponse, Mode

router = APIRouter(prefix="/api", tags=["deck"])


@router.get("/deck/{category}", response_model=DeckResponse)
def get_deck(
    category: Category,
    mode: Mode = "random",
    limit: int | None = Query(default=None, ge=1, le=500),
    exclude: str | None = Query(
        default=None,
        description="Comma-separated question keys to leave out (e.g. the tail of the "
        "current queue, so a refilled deck does not repeat itself immediately).",
    ),
    conn: sqlite3.Connection = Depends(get_db),
) -> DeckResponse:
    rows = stats.per_question_rows(conn, category)

    # The scheduler needs real datetimes; the response model only wants the ISO
    # strings, and Pydantic ignores the extra key.
    for row in rows:
        row["last_answered_at_dt"] = stats.parse_iso(row["last_answered_at"])

    excluded = {key.strip() for key in (exclude or "").split(",") if key.strip()}
    candidates = [row for row in rows if row["question_key"] not in excluded]
    if not candidates:
        # Excluding everything would hand back an empty deck; fall back to the
        # full category so practice never dead-ends.
        candidates = rows

    ordered = scheduling.order_deck(candidates, mode=mode, limit=limit)

    for row in ordered:
        row.pop("last_answered_at_dt", None)

    return DeckResponse(
        category=category,
        mode=mode,
        count=len(ordered),
        total_questions=len(rows),
        answered_questions=len(stats.question_history(conn, category)),
        generated_at=stats.iso(stats.utc_now()),
        questions=ordered,
    )


@router.get("/deck/{category}/preview")
def deck_preview(
    category: Category,
    conn: sqlite3.Connection = Depends(get_db),
) -> dict:
    """Counts for the start panel, before a session exists."""
    rows = stats.per_question_rows(conn, category)
    now = stats.utc_now()

    unseen = 0
    weak = 0
    due = 0
    for row in rows:
        if row["attempts"] == 0:
            unseen += 1
            continue
        _, reason = scheduling.priority(
            attempts=row["attempts"],
            success_rate=row["success_rate"] or 0.0,
            last_answered_at=stats.parse_iso(row["last_answered_at"]),
            streak=row["streak"],
            now=now,
        )
        if reason == "weak":
            weak += 1
        elif reason == "due":
            due += 1

    return {
        "category": category,
        "total_questions": len(rows),
        "answered": len(rows) - unseen,
        "unseen": unseen,
        "weak": weak,
        "due": due,
    }
