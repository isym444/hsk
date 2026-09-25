"""Review aggregation: the numbers behind every stats page.

All success-rate and timing definitions live here so the category page, the
session summary and the spaced-repetition scheduler can never disagree:

* ``attempts``      — every recorded review, including self-assessed ones.
* ``success_rate``  — correct / (correct + incorrect). Self-assessed open
  writing items are excluded, matching the original quiz, which counted them
  separately and never let them affect the score.
* ``avg_ms``        — mean response time over the *scored* reviews only.
  A self-assessed item's time still reaches you through ``attempts`` and the
  session totals, but it does not distort the per-question average.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping

from .db import DbConnection


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """UTC ISO-8601 with a Z suffix — the format stored in `answered_at`."""
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def round_rate(value: float | None) -> float | None:
    return None if value is None else round(value, 4)


def round_ms(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


@dataclass
class QuestionHistory:
    """Per-question rollup of every review ever recorded."""

    key: str
    attempts: int = 0
    correct: int = 0
    incorrect: int = 0
    self_assessed: int = 0
    scored_ms: int = 0
    last_answered_at: datetime | None = None
    streak: int = 0
    first_answered_at: datetime | None = None
    outcomes: list[str] = field(default_factory=list)

    @property
    def scored(self) -> int:
        return self.correct + self.incorrect

    @property
    def success_rate(self) -> float:
        return self.correct / self.scored if self.scored else 0.0

    @property
    def avg_ms(self) -> float | None:
        return self.scored_ms / self.scored if self.scored else None


def question_history(
    conn: DbConnection, category: str, user_id: str
) -> dict[str, QuestionHistory]:
    """Rolls up one user's reviews in a category, keyed by question."""
    rows = conn.execute(
        """
        SELECT question_key, outcome, elapsed_ms, answered_at
        FROM reviews
        WHERE user_id = ? AND category = ?
        ORDER BY question_key, answered_at, id
        """,
        (user_id, category),
    ).fetchall()

    history: dict[str, QuestionHistory] = {}
    for row in rows:
        entry = history.get(row["question_key"])
        if entry is None:
            entry = history[row["question_key"]] = QuestionHistory(key=row["question_key"])

        outcome = row["outcome"]
        entry.attempts += 1
        if outcome == "correct":
            entry.correct += 1
            entry.streak += 1
        elif outcome == "incorrect":
            entry.incorrect += 1
            entry.streak = 0
        else:
            entry.self_assessed += 1

        if outcome in ("correct", "incorrect"):
            entry.scored_ms += int(row["elapsed_ms"] or 0)

        answered_at = parse_iso(row["answered_at"])
        if answered_at is not None:
            if entry.first_answered_at is None:
                entry.first_answered_at = answered_at
            if entry.last_answered_at is None or answered_at > entry.last_answered_at:
                entry.last_answered_at = answered_at

        entry.outcomes.append(outcome)

    return history


def _question_totals(conn: DbConnection, category: str | None = None) -> dict[str, int]:
    sql = "SELECT COUNT(*) AS total, COALESCE(SUM(scoreable), 0) AS scoreable FROM questions WHERE active = 1"
    params: tuple[Any, ...] = ()
    if category is not None:
        sql += " AND category = ?"
        params = (category,)
    row = conn.execute(sql, params).fetchone()
    return {"total": row["total"], "scoreable": row["scoreable"]}


def category_stats(conn: DbConnection, category: str, user_id: str) -> dict[str, Any]:
    """Everything the per-category stats page header needs, for one user."""
    totals = _question_totals(conn, category)
    history = question_history(conn, category, user_id)

    answered = len(history)
    answered_scoreable = sum(1 for h in history.values() if h.scored > 0)
    attempts = sum(h.attempts for h in history.values())
    correct = sum(h.correct for h in history.values())
    incorrect = sum(h.incorrect for h in history.values())
    self_assessed = sum(h.self_assessed for h in history.values())
    scored = correct + incorrect
    scored_ms = sum(h.scored_ms for h in history.values())

    last_activity = max(
        (h.last_answered_at for h in history.values() if h.last_answered_at),
        default=None,
    )
    first_activity = min(
        (h.first_answered_at for h in history.values() if h.first_answered_at),
        default=None,
    )

    return {
        "category": category,
        "total_questions": totals["total"],
        "scoreable_questions": totals["scoreable"],
        "answered_questions": answered,
        "answered_scoreable": answered_scoreable,
        "unanswered_questions": max(totals["total"] - answered, 0),
        "coverage": round_rate(answered / totals["total"]) if totals["total"] else 0.0,
        "attempts": attempts,
        "correct": correct,
        "incorrect": incorrect,
        "self_assessed": self_assessed,
        "success_rate": round_rate(correct / scored) if scored else None,
        "avg_ms": round_ms(scored_ms / scored) if scored else None,
        "total_review_ms": scored_ms,
        "first_reviewed_at": iso(first_activity) if first_activity else None,
        "last_reviewed_at": iso(last_activity) if last_activity else None,
        "session_count": conn.execute(
            "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND category = ?",
            (user_id, category),
        ).fetchone()["n"],
    }


def all_category_stats(conn: DbConnection, user_id: str) -> list[dict[str, Any]]:
    return [
        category_stats(conn, row["category"], user_id)
        for row in conn.execute(
            "SELECT DISTINCT category FROM questions WHERE active = 1 ORDER BY category"
        ).fetchall()
    ]


def per_question_rows(conn: DbConnection, category: str, user_id: str) -> list[dict[str, Any]]:
    """One row per question in the category, reviewed or not, for one user."""
    questions = conn.execute(
        """
        SELECT question_key, paper, category, kind, number, part, scoreable, label
        FROM questions
        WHERE category = ? AND active = 1
        ORDER BY number, paper
        """,
        (category,),
    ).fetchall()
    history = question_history(conn, category, user_id)

    rows: list[dict[str, Any]] = []
    for question in questions:
        entry = history.get(question["question_key"])
        rows.append(
            {
                "question_key": question["question_key"],
                "label": question["label"],
                "paper": question["paper"],
                "category": question["category"],
                "kind": question["kind"],
                "number": question["number"],
                "part": question["part"],
                "scoreable": bool(question["scoreable"]),
                "attempts": entry.attempts if entry else 0,
                "correct": entry.correct if entry else 0,
                "incorrect": entry.incorrect if entry else 0,
                "self_assessed": entry.self_assessed if entry else 0,
                "success_rate": round_rate(entry.success_rate) if entry and entry.scored else None,
                "avg_ms": round_ms(entry.avg_ms) if entry else None,
                "streak": entry.streak if entry else 0,
                "last_answered_at": iso(entry.last_answered_at)
                if entry and entry.last_answered_at
                else None,
            }
        )
    return rows


def kind_breakdown(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregates per-question rows by question kind, for the stats page."""
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        bucket = buckets.setdefault(
            row["kind"],
            {
                "kind": row["kind"],
                "questions": 0,
                "answered_questions": 0,
                "attempts": 0,
                "correct": 0,
                "incorrect": 0,
                "self_assessed": 0,
                "scored_ms": 0,
            },
        )
        bucket["questions"] += 1
        bucket["attempts"] += row["attempts"]
        bucket["correct"] += row["correct"]
        bucket["incorrect"] += row["incorrect"]
        bucket["self_assessed"] += row["self_assessed"]
        if row["attempts"] > 0:
            bucket["answered_questions"] += 1
        if row["avg_ms"] is not None and (row["correct"] + row["incorrect"]) > 0:
            bucket["scored_ms"] += row["avg_ms"] * (row["correct"] + row["incorrect"])

    out: list[dict[str, Any]] = []
    for bucket in buckets.values():
        scored = bucket.pop("scored_ms")
        scored_count = bucket["correct"] + bucket["incorrect"]
        bucket["success_rate"] = round_rate(bucket["correct"] / scored_count) if scored_count else None
        bucket["avg_ms"] = round_ms(scored / scored_count) if scored_count else None
        bucket["coverage"] = round_rate(bucket["answered_questions"] / bucket["questions"])
        out.append(bucket)
    out.sort(key=lambda b: (b["success_rate"] is None, b["success_rate"] or 0))
    return out


def session_row_to_dict(row: Mapping[str, Any]) -> dict[str, Any]:
    scored = row["correct"] + row["incorrect"]
    return {
        "id": row["id"],
        "category": row["category"],
        "mode": row["mode"],
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "answered": row["answered"],
        "correct": row["correct"],
        "incorrect": row["incorrect"],
        "self_assessed": row["self_assessed"],
        "success_rate": round_rate(row["correct"] / scored) if scored else None,
        "avg_ms": round_ms(row["total_ms"] / scored) if scored else None,
        "total_ms": row["total_ms"],
    }


def recent_sessions(
    conn: DbConnection, user_id: str, category: str | None = None, limit: int = 10
) -> list[dict[str, Any]]:
    sql = """
        SELECT id, category, mode, started_at, ended_at, answered, correct,
               incorrect, self_assessed, total_ms
        FROM sessions
        WHERE answered > 0 AND user_id = ?
    """
    params: list[Any] = [user_id]
    if category is not None:
        sql += " AND category = ?"
        params.append(category)
    # `id` only breaks ties between sessions that started in the same
    # millisecond — `rowid` has no portable PostgreSQL equivalent.
    sql += " ORDER BY started_at DESC, id DESC LIMIT ?"
    params.append(limit)
    return [session_row_to_dict(row) for row in conn.execute(sql, params).fetchall()]


def overview(conn: DbConnection, user_id: str) -> dict[str, Any]:
    """Per-category stats plus a combined total, for the home page."""
    categories = all_category_stats(conn, user_id)

    scored = sum(c["correct"] + c["incorrect"] for c in categories)
    scored_ms = sum(c["total_review_ms"] for c in categories)
    total_questions = sum(c["total_questions"] for c in categories)
    answered = sum(c["answered_questions"] for c in categories)

    totals = {
        "category": "all",
        "total_questions": total_questions,
        "scoreable_questions": sum(c["scoreable_questions"] for c in categories),
        "answered_questions": answered,
        "answered_scoreable": sum(c["answered_scoreable"] for c in categories),
        "unanswered_questions": max(total_questions - answered, 0),
        "coverage": round_rate(answered / total_questions) if total_questions else 0.0,
        "attempts": sum(c["attempts"] for c in categories),
        "correct": sum(c["correct"] for c in categories),
        "incorrect": sum(c["incorrect"] for c in categories),
        "self_assessed": sum(c["self_assessed"] for c in categories),
        "success_rate": round_rate(
            sum(c["correct"] for c in categories) / scored
        )
        if scored
        else None,
        "avg_ms": round_ms(scored_ms / scored) if scored else None,
        "total_review_ms": scored_ms,
        "first_reviewed_at": min(
            (c["first_reviewed_at"] for c in categories if c["first_reviewed_at"]),
            default=None,
        ),
        "last_reviewed_at": max(
            (c["last_reviewed_at"] for c in categories if c["last_reviewed_at"]),
            default=None,
        ),
        "session_count": sum(c["session_count"] for c in categories),
    }

    return {"generated_at": iso(utc_now()), "categories": categories, "totals": totals}


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #
def get_session_row(
    conn: DbConnection, session_id: str, user_id: str
) -> Mapping[str, Any] | None:
    """One session, but only if it belongs to this user."""
    return conn.execute(
        """
        SELECT id, category, mode, started_at, ended_at, tz_offset_minutes,
               answered, correct, incorrect, self_assessed, total_ms
        FROM sessions WHERE id = ? AND user_id = ?
        """,
        (session_id, user_id),
    ).fetchone()


def session_items(conn: DbConnection, session_id: str, user_id: str) -> list[dict[str, Any]]:
    """Every review recorded in a session, in the order it was answered."""
    rows = conn.execute(
        """
        SELECT r.question_key, r.outcome, r.elapsed_ms, r.answered_at,
               r.answered_at_local, r.mode,
               q.label, q.paper, q.kind, q.number, q.part, q.scoreable
        FROM reviews r
        LEFT JOIN questions q ON q.question_key = r.question_key
        WHERE r.session_id = ? AND r.user_id = ?
        ORDER BY r.id
        """,
        (session_id, user_id),
    ).fetchall()
    return [
        {
            "question_key": row["question_key"],
            "label": row["label"] or row["question_key"],
            "paper": row["paper"] or "",
            "number": row["number"] or 0,
            "kind": row["kind"] or "",
            "part": row["part"] or 0,
            "scoreable": bool(row["scoreable"]),
            "outcome": row["outcome"],
            "elapsed_ms": row["elapsed_ms"],
            "answered_at": row["answered_at"],
            "answered_at_local": row["answered_at_local"],
        }
        for row in rows
    ]


def prior_stats(
    conn: DbConnection, category: str, session_id: str, user_id: str
) -> dict[str, Any]:
    """This user's lifetime category stats with this session's reviews removed."""
    row = conn.execute(
        """
        SELECT COUNT(*) FILTER (WHERE outcome = 'correct')   AS correct,
               COUNT(*) FILTER (WHERE outcome = 'incorrect') AS incorrect,
               COALESCE(SUM(CASE WHEN outcome IN ('correct', 'incorrect')
                                 THEN elapsed_ms ELSE 0 END), 0) AS scored_ms,
               COUNT(*) AS attempts
        FROM reviews
        WHERE user_id = ? AND category = ?
          AND (session_id IS NULL OR session_id <> ?)
        """,
        (user_id, category, session_id),
    ).fetchone()
    scored = row["correct"] + row["incorrect"]
    return {
        "attempts": row["attempts"],
        "success_rate": round_rate(row["correct"] / scored) if scored else None,
        "avg_ms": round_ms(row["scored_ms"] / scored) if scored else None,
    }


def build_session_summary(
    conn: DbConnection, session_id: str, user_id: str
) -> dict[str, Any] | None:
    row = get_session_row(conn, session_id, user_id)
    if row is None:
        return None

    started = parse_iso(row["started_at"]) or utc_now()
    ended = parse_iso(row["ended_at"])
    duration_ms = int(((ended or utc_now()) - started).total_seconds() * 1000)

    summary = session_row_to_dict(row)
    summary["duration_ms"] = max(duration_ms, 0)
    summary["items"] = session_items(conn, session_id, user_id)
    summary["prior"] = prior_stats(conn, row["category"], session_id, user_id)
    summary["category_stats"] = category_stats(conn, row["category"], user_id)
    return summary
