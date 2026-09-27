"""Stats endpoints: the per-category stats page and the cross-category overview.

Both are scoped to the signed-in caller — the questions are shared, the review
history is not.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from .. import stats
from ..auth import Principal, current_user
from ..db import DbConnection
from ..deps import get_db
from ..schemas import Category, CategoryStatsPage, Level, QuestionStats, StatsOverview

router = APIRouter(prefix="/api", tags=["stats"], dependencies=[Depends(current_user)])


@router.get("/categories", response_model=StatsOverview)
def categories_overview(
    level: Level | None = Query(
        default=None,
        description="Exam level. Omitted means every level, which only combined "
        "views want; the app always sends one.",
    ),
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> StatsOverview:
    """Every category's headline stats plus a combined total (the home screen).

    Scoped to one level when ``level`` is given, which is what the app always
    does: the HSK3 and HSK4 banks are never pooled.
    """
    return StatsOverview(**stats.overview(conn, user.user_id, level))


@router.get("/stats/{category}", response_model=CategoryStatsPage)
def category_page(
    category: Category,
    level: Level | None = Query(
        default=None,
        description="Exam level. Omitted means every level, which only the "
        "combined views want; the app always sends one.",
    ),
    sessions: int = Query(default=10, ge=0, le=50),
    user: Principal = Depends(current_user),
    conn: DbConnection = Depends(get_db),
) -> CategoryStatsPage:
    """One category's stats page: headline numbers, per-kind split, every
    question's history, and the most recent sessions."""
    rows = stats.per_question_rows(conn, category, user.user_id, level)
    return CategoryStatsPage(
        stats=stats.category_stats(conn, category, user.user_id, level),
        by_kind=stats.kind_breakdown(rows),
        questions=[QuestionStats(**row) for row in rows],
        recent_sessions=stats.recent_sessions(
            conn, user.user_id, category=category, limit=sessions
        ),
    )
