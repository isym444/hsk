"""Stats endpoints: the per-category stats page and the cross-category overview."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from .. import stats
from ..deps import get_db
from ..schemas import Category, CategoryStatsPage, QuestionStats, StatsOverview

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/categories", response_model=StatsOverview)
def categories_overview(conn: sqlite3.Connection = Depends(get_db)) -> StatsOverview:
    """Every category's headline stats plus a combined total (the home screen)."""
    return StatsOverview(**stats.overview(conn))


@router.get("/stats/{category}", response_model=CategoryStatsPage)
def category_page(
    category: Category,
    sessions: int = Query(default=10, ge=0, le=50),
    conn: sqlite3.Connection = Depends(get_db),
) -> CategoryStatsPage:
    """One category's stats page: headline numbers, per-kind split, every
    question's history, and the most recent sessions."""
    rows = stats.per_question_rows(conn, category)
    return CategoryStatsPage(
        stats=stats.category_stats(conn, category),
        by_kind=stats.kind_breakdown(rows),
        questions=[QuestionStats(**row) for row in rows],
        recent_sessions=stats.recent_sessions(conn, category=category, limit=sessions),
    )
