"""FastAPI application: review database, stats and deck ordering for the HSK4 app.

Run it with::

    uvicorn app.main:app --reload --port 8000

When a production Angular bundle exists at
``hsk4-practice-app/dist/hsk4-practice-app/browser`` it is served from ``/``,
so one process can host both the API and the UI.
"""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from .catalogue import CatalogueError, load_catalogue
from .config import CATALOGUE_PATH, CORS_ORIGINS, DB_PATH, WEB_DIST_CANDIDATES
from .db import Database
from .deps import get_db
from .routers import deck, sessions, stats as stats_router
from .schemas import HealthResponse


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
) -> FastAPI:
    database = Database(db_path or DB_PATH)
    catalogue_file = Path(catalogue_path or CATALOGUE_PATH)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.init_schema()
        catalogue = load_catalogue(catalogue_file)
        database.seed_catalogue(catalogue["questions"])
        app.state.catalogue = catalogue
        yield

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
    def health(conn: sqlite3.Connection = Depends(get_db)) -> HealthResponse:
        def count(table: str) -> int:
            return conn.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]

        return HealthResponse(
            status="ok",
            database=str(database.path),
            questions=count("questions"),
            reviews=count("reviews"),
            sessions=count("sessions"),
        )

    web_dist = next((path for path in WEB_DIST_CANDIDATES if path.exists()), None)
    if web_dist is not None:
        app.mount("/", SpaStaticFiles(directory=web_dist, html=True), name="web")

    return app


app = create_app()

__all__ = ["app", "create_app", "CatalogueError"]
