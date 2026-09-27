"""FastAPI application: review database, stats and deck ordering for the HSK4 app.

Run it with::

    uvicorn app.main:app --reload --port 8000

The review database is SQLite by default (``HSK_DB_PATH``) and PostgreSQL when
``HSK_DATABASE_URL`` is set — Supabase in the deployed stack.

When a production Angular bundle exists at
``hsk4-practice-app/dist/hsk4-practice-app/browser`` it is served from ``/``,
so one process can host both the API and the UI.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from .auth import Principal, build_verifier, current_user, dev_principal
from .catalogue import CatalogueError, load_catalogue
from .config import (
    CATALOGUE_PATH,
    CORS_ORIGINS,
    DATABASE_URL,
    DB_POOL_MAX,
    DB_POOL_MIN,
    DB_SCHEMA,
    WEB_DIST_CANDIDATES,
)
from .db import DbConnection, create_database
from .deps import get_db
from .routers import deck, sessions, stats as stats_router
from .schemas import HealthResponse, MeResponse

logger = logging.getLogger(__name__)


class SpaStaticFiles(StaticFiles):
    """Serves the Angular bundle and falls back to index.html for deep links.

    The app uses real routes (/stats/reading, /deck/writing/summary/<id>), so a
    browser refresh on those paths must hand back index.html rather than 404.
    """

    async def get_response(self, path: str, scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


def create_app(
    db_path: str | Path | None = None,
    catalogue_path: str | Path | None = None,
    database_url: str | None = None,
) -> FastAPI:
    """Builds the app.

    ``db_path`` forces a local SQLite file (tests, ad-hoc runs). Otherwise
    ``database_url`` — or the ambient ``HSK_DATABASE_URL`` — selects PostgreSQL,
    falling back to the SQLite path in the config.
    """
    database = create_database(
        # An explicit path always wins, so the test suite keeps using SQLite
        # even when a real DSN is exported in the shell.
        connection_url=None if db_path is not None else (database_url or DATABASE_URL),
        path=db_path,
        min_size=DB_POOL_MIN,
        max_size=DB_POOL_MAX,
        schema=DB_SCHEMA,
    )
    catalogue_file = Path(catalogue_path or CATALOGUE_PATH)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.open()
        try:
            database.init_schema()
            catalogue = load_catalogue(catalogue_file)
            database.seed_catalogue(catalogue["questions"])
            app.state.catalogue = catalogue
            yield
        finally:
            database.close()

    app = FastAPI(
        title="HSK4 Review API",
        version="1.0.0",
        description=(
            "Stores per-question review outcomes and response times for the HSK4 "
            "practice decks, and serves the aggregated listening/reading/writing decks."
        ),
        lifespan=lifespan,
    )
    app.state.db = database
    app.state.catalogue_path = catalogue_file

    app.state.dev_principal = dev_principal()
    if app.state.dev_principal is not None:
        logger.warning(
            "HSK_DEV_NO_AUTH is on: every request is treated as %s. "
            "This is for local development only.",
            app.state.dev_principal.email,
        )

    verifier = build_verifier()
    app.state.verifier = verifier
    if not verifier.configured:
        logger.warning(
            "Authentication is not configured, so every /api endpoint except "
            "/api/health will answer 503. Set HSK_SUPABASE_URL (and "
            "HSK_SUPABASE_JWT_SECRET only for a project still on the legacy JWT secret)."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(deck.router)
    app.include_router(sessions.router)
    app.include_router(stats_router.router)

    @app.get("/api/health", response_model=HealthResponse, tags=["meta"])
    def health(conn: DbConnection = Depends(get_db)) -> HealthResponse:
        """Public: the container health check has no token.

        Row counts are per-user data now, so they live on /api/me instead.
        """
        questions = conn.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"]
        return HealthResponse(
            status="ok",
            # describe() never includes the password.
            database=database.describe(),
            questions=questions,
        )

    @app.get("/api/me", response_model=MeResponse, tags=["meta"])
    def me(
        user: Principal = Depends(current_user),
        conn: DbConnection = Depends(get_db),
    ) -> MeResponse:
        """Who the caller is, and how much history they have."""

        def mine(table: str) -> int:
            return conn.execute(
                f"SELECT COUNT(*) AS n FROM {table} WHERE user_id = ?", (user.user_id,)
            ).fetchone()["n"]

        return MeResponse(
            user_id=user.user_id,
            email=user.email,
            role=user.role,
            reviews=mine("reviews"),
            sessions=mine("sessions"),
        )

    web_dist = next((path for path in WEB_DIST_CANDIDATES if path.exists()), None)
    if web_dist is not None:
        app.mount("/", SpaStaticFiles(directory=web_dist, html=True), name="web")
    else:

        @app.get("/", include_in_schema=False)
        def index() -> dict:
            """A human landing page, since nginx/Render serves the UI here."""
            return {
                "service": "HSK4 Review API",
                "docs": "/docs",
                "health": "/api/health",
            }

    return app


app = create_app()

__all__ = ["app", "create_app", "CatalogueError"]
