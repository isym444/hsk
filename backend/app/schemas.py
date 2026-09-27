"""Request/response contracts for the review API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["listening", "reading", "writing"]
Level = Literal["HSK3", "HSK4"]
Mode = Literal["random", "smart"]
Outcome = Literal["correct", "incorrect", "self_assessed"]


# --------------------------------------------------------------------------- #
# Requests
# --------------------------------------------------------------------------- #
class SessionCreate(BaseModel):
    category: Category
    mode: Mode = "random"
    tz_offset_minutes: int | None = Field(default=None, ge=-900, le=900)


class ReviewCreate(BaseModel):
    question_key: str = Field(min_length=3, max_length=160)
    outcome: Outcome
    elapsed_ms: int = Field(default=0, ge=0, le=86_400_000)
    answered_at: str | None = Field(default=None, max_length=64)


# --------------------------------------------------------------------------- #
# Questions & decks
# --------------------------------------------------------------------------- #
class QuestionStats(BaseModel):
    question_key: str
    label: str
    paper: str
    category: str
    kind: str
    number: int
    part: int
    scoreable: bool
    attempts: int
    correct: int
    incorrect: int
    self_assessed: int
    success_rate: float | None
    avg_ms: float | None
    streak: int
    last_answered_at: str | None


class DeckQuestion(QuestionStats):
    priority: float | None = None
    reason: str = "random"


class DeckResponse(BaseModel):
    category: str
    mode: str
    count: int
    total_questions: int
    answered_questions: int
    generated_at: str
    questions: list[DeckQuestion]


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #
class KindBreakdown(BaseModel):
    kind: str
    questions: int
    answered_questions: int
    attempts: int
    correct: int
    incorrect: int
    self_assessed: int
    success_rate: float | None
    avg_ms: float | None
    coverage: float


class CategoryStats(BaseModel):
    category: str
    total_questions: int
    scoreable_questions: int
    answered_questions: int
    answered_scoreable: int
    unanswered_questions: int
    coverage: float
    attempts: int
    correct: int
    incorrect: int
    self_assessed: int
    success_rate: float | None
    avg_ms: float | None
    total_review_ms: int
    first_reviewed_at: str | None
    last_reviewed_at: str | None
    session_count: int


class CategoryStatsPage(BaseModel):
    stats: CategoryStats
    by_kind: list[KindBreakdown]
    questions: list[QuestionStats]
    recent_sessions: list["SessionListItem"]


class StatsOverview(BaseModel):
    generated_at: str
    categories: list[CategoryStats]
    totals: CategoryStats


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #
class SessionListItem(BaseModel):
    id: str
    category: str
    mode: str
    started_at: str
    ended_at: str | None
    answered: int
    correct: int
    incorrect: int
    self_assessed: int
    success_rate: float | None
    avg_ms: float | None
    total_ms: int


class SessionItem(BaseModel):
    question_key: str
    label: str
    paper: str
    number: int
    kind: str
    part: int
    scoreable: bool
    outcome: str
    elapsed_ms: int
    answered_at: str
    answered_at_local: str | None = None


class SessionPriorStats(BaseModel):
    """Lifetime stats for the category *excluding* this session."""

    attempts: int
    success_rate: float | None
    avg_ms: float | None


class SessionSummary(BaseModel):
    id: str
    category: str
    mode: str
    started_at: str
    ended_at: str | None
    duration_ms: int
    answered: int
    correct: int
    incorrect: int
    self_assessed: int
    success_rate: float | None
    avg_ms: float | None
    total_ms: int
    items: list[SessionItem]
    prior: SessionPriorStats
    category_stats: CategoryStats


class ReviewCreated(BaseModel):
    review_id: int
    question_key: str
    outcome: str
    elapsed_ms: int
    answered_at: str
    session: SessionListItem


class SessionFinished(BaseModel):
    session: SessionSummary


class HealthResponse(BaseModel):
    """Public liveness/readiness. Deliberately carries no per-user data.

    The Docker health check calls this without a token, so it has to stay
    unauthenticated; the question count is already public in the app bundle.
    """

    status: str
    database: str
    questions: int


class MeResponse(BaseModel):
    """The signed-in caller, plus their own row counts."""

    user_id: str
    email: str | None = None
    role: str | None = None
    reviews: int
    sessions: int


CategoryStatsPage.model_rebuild()
