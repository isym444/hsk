"""Session lifecycle: start a review session, record reviews, finish, re-read.

Every review is timestamped server-side in UTC (`answered_at`) and keeps the
client's own local timestamp alongside it (`answered_at_local`) so the stats
pages can show both when you practised and what your clock said at the time.

Every endpoint requires a Supabase access token, and every row is stamped with
the caller's user id: a session that belongs to someone else is a 404, so one
account cannot read or delete another's practice history.
"""

from __future__ import annotations

import uuid
from typing import Any, Mapping

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import stats
from ..auth import Principal, current_user
from ..db import DbConnection
from ..deps import get_db
from ..schemas import (
    Category,
    ReviewCreate,
    ReviewCreated,
    SessionCreate,
    SessionListItem,
    SessionSummary,
)

#: `dependencies` enforces the token for every route below; the handlers also
#: take `user` so they can scope their queries. FastAPI caches the dependency,
#: so the token is verified once per request, not twice.
router = APIRouter(
    prefix="/api/sessions",
    tags=["sessions"],
    dependencies=[Depends(current_user)],
)


def _require_session(conn: DbConnection, session_id: str, user_id: str) -> Mapping[str, Any]:
    row = stats.get_session_row(conn, session_id, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown session {session_id!r}")
    return row


@router.post("", response_model=SessionListItem, status_code=201)
def create_session(
    payload: SessionCreate,
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> SessionListItem:
    session_id = uuid.uuid4().hex
    started_at = stats.iso(stats.utc_now())
    with conn:
        conn.execute(
            """
            INSERT INTO sessions (id, user_id, category, mode, started_at, tz_offset_minutes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user.user_id,
                payload.category,
                payload.mode,
                started_at,
                payload.tz_offset_minutes,
            ),
        )
    return SessionListItem(
        **stats.session_row_to_dict(_require_session(conn, session_id, user.user_id))
    )


@router.get("", response_model=list[SessionListItem])
def list_sessions(
    category: Category | None = None,
    limit: int = Query(default=10, ge=1, le=100),
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> list[SessionListItem]:
    return [
        SessionListItem(**row)
        for row in stats.recent_sessions(conn, user.user_id, category=category, limit=limit)
    ]


@router.get("/{session_id}", response_model=SessionSummary)
def get_session(
    session_id: str,
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> SessionSummary:
    summary = stats.build_session_summary(conn, session_id, user.user_id)
    if summary is None:
        raise HTTPException(status_code=404, detail=f"Unknown session {session_id!r}")
    return SessionSummary(**summary)


@router.post("/{session_id}/reviews", response_model=ReviewCreated, status_code=201)
def record_review(
    session_id: str,
    payload: ReviewCreate,
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> ReviewCreated:
    session = _require_session(conn, session_id, user.user_id)

    question = conn.execute(
        "SELECT question_key, category, scoreable, active FROM questions WHERE question_key = ?",
        (payload.question_key,),
    ).fetchone()
    if question is None or not question["active"]:
        raise HTTPException(
            status_code=404, detail=f"Unknown question {payload.question_key!r}"
        )
    if question["category"] != session["category"]:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Question {payload.question_key!r} belongs to {question['category']}, "
                f"but session {session_id!r} is a {session['category']} session"
            ),
        )

    scoreable = bool(question["scoreable"])
    if not scoreable and payload.outcome != "self_assessed":
        raise HTTPException(
            status_code=422,
            detail=(
                f"Question {payload.question_key!r} is self-assessed (open writing); "
                "outcome must be 'self_assessed'"
            ),
        )
    if scoreable and payload.outcome == "self_assessed":
        raise HTTPException(
            status_code=422,
            detail=f"Question {payload.question_key!r} is scored; outcome cannot be 'self_assessed'",
        )

    now = stats.utc_now()
    answered_at = stats.iso(now)
    answered_at_local = payload.answered_at
    if answered_at_local:
        # Keep the client string only if it parses, so a malformed value cannot
        # corrupt the history.
        if stats.parse_iso(answered_at_local) is None:
            raise HTTPException(
                status_code=422, detail=f"answered_at {answered_at_local!r} is not a valid ISO-8601 timestamp"
            )

    scored = payload.outcome in ("correct", "incorrect")
    with conn:
        # RETURNING works on both SQLite (>= 3.35) and PostgreSQL, so the new
        # review id comes back without a dialect-specific `lastrowid`.
        cursor = conn.execute(
            """
            INSERT INTO reviews
                (user_id, session_id, question_key, category, mode, outcome, elapsed_ms,
                 answered_at, answered_at_local, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                user.user_id,
                session_id,
                payload.question_key,
                session["category"],
                session["mode"],
                payload.outcome,
                payload.elapsed_ms if scored else 0,
                answered_at,
                answered_at_local,
                answered_at,
            ),
        )
        review_id = int(cursor.fetchone()["id"])
        conn.execute(
            """
            UPDATE sessions SET
                answered      = answered + 1,
                correct       = correct + ?,
                incorrect     = incorrect + ?,
                self_assessed = self_assessed + ?,
                total_ms      = total_ms + ?
            WHERE id = ? AND user_id = ?
            """,
            (
                1 if payload.outcome == "correct" else 0,
                1 if payload.outcome == "incorrect" else 0,
                1 if payload.outcome == "self_assessed" else 0,
                payload.elapsed_ms if scored else 0,
                session_id,
                user.user_id,
            ),
        )

    updated = stats.session_row_to_dict(
        _require_session(conn, session_id, user.user_id)
    )
    return ReviewCreated(
        review_id=review_id,
        question_key=payload.question_key,
        outcome=payload.outcome,
        elapsed_ms=payload.elapsed_ms if scored else 0,
        answered_at=answered_at,
        session=SessionListItem(**updated),
    )


@router.post("/{session_id}/finish", response_model=SessionSummary)
def finish_session(
    session_id: str,
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> SessionSummary:
    session = _require_session(conn, session_id, user.user_id)

    # Finishing twice keeps the first end time so a reload cannot stretch the
    # session duration.
    if session["ended_at"] is None:
        with conn:
            conn.execute(
                "UPDATE sessions SET ended_at = ? WHERE id = ? AND user_id = ?",
                (stats.iso(stats.utc_now()), session_id, user.user_id),
            )

    summary = stats.build_session_summary(conn, session_id, user.user_id)
    if summary is None:  # pragma: no cover - row exists, deleted concurrently
        raise HTTPException(status_code=404, detail=f"Unknown session {session_id!r}")
    return SessionSummary(**summary)


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> None:
    """Discards a session and its reviews (for an aborted/empty practice run)."""
    _require_session(conn, session_id, user.user_id)
    with conn:
        conn.execute(
            "DELETE FROM reviews WHERE session_id = ? AND user_id = ?",
            (session_id, user.user_id),
        )
        conn.execute(
            "DELETE FROM sessions WHERE id = ? AND user_id = ?",
            (session_id, user.user_id),
        )
