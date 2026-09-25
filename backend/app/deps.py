"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Iterator

from fastapi import Request

from .db import DbConnection, PostgresDatabase


def get_db(request: Request) -> Iterator[DbConnection]:
    """One connection per request (pooled when the backend is PostgreSQL)."""
    database: PostgresDatabase = request.app.state.db
    conn = database.connect()
    try:
        yield conn
    finally:
        conn.close()


def get_database(request: Request) -> PostgresDatabase:
    return request.app.state.db
