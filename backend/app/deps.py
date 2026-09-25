"""Shared FastAPI dependencies."""

from __future__ import annotations

import sqlite3
from typing import Iterator

from fastapi import Request

from .db import Database


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    """One short-lived connection per request."""
    database: Database = request.app.state.db
    conn = database.connect()
    try:
        yield conn
    finally:
        conn.close()


def get_database(request: Request) -> Database:
    return request.app.state.db
