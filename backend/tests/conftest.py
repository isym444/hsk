"""Shared pytest fixtures.

The suite runs on SQLite by default — no server needed. Export
``HSK_TEST_DATABASE_URL`` (a throwaway PostgreSQL DSN, e.g. a local
``docker run postgres``) to run the exact same suite against PostgreSQL, which
is what production uses:

    HSK_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/hsk \\
        ./.venv/bin/python -m pytest -q

Every request is authenticated: `client` carries a valid Supabase-shaped access
token for :data:`USER_ID`, and tests that need a second account or no account at
all override the header per request (see :func:`auth_headers`).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# --------------------------------------------------------------------------- #
# Authentication config
#
# app.config reads the environment at import time, so this has to be set before
# app.main is imported below. The values are forced (not defaulted) so a real
# Supabase project exported in the developer's shell cannot leak into the suite.
# --------------------------------------------------------------------------- #
SUPABASE_URL = "https://test-project.supabase.co"
JWT_SECRET = "test-shared-secret-used-only-by-the-test-suite"
JWT_AUDIENCE = "authenticated"
JWT_ISSUER = f"{SUPABASE_URL}/auth/v1"

USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_USER_ID = "22222222-2222-4222-8222-222222222222"
USER_EMAIL = "learner@example.com"
OTHER_EMAIL = "study-buddy@example.com"

os.environ["HSK_SUPABASE_URL"] = SUPABASE_URL
os.environ["HSK_SUPABASE_JWT_SECRET"] = JWT_SECRET
# Two accounts are allowed through; anything else must be refused, which is
# what the allow-list exists for (anyone can request a magic link).
os.environ["HSK_ALLOWED_EMAILS"] = f"{USER_EMAIL},{OTHER_EMAIL}"
for stale in ("HSK_SUPABASE_JWKS_URL", "HSK_SUPABASE_JWT_ISSUER", "HSK_SUPABASE_JWT_AUDIENCE"):
    os.environ.pop(stale, None)

import jwt  # noqa: E402
from app.main import create_app  # noqa: E402

CATALOGUE_PATH = BACKEND_DIR / "data" / "catalogue.json"

#: Optional throwaway PostgreSQL DSN. When set, `client` runs on Postgres.
TEST_DATABASE_URL = (os.environ.get("HSK_TEST_DATABASE_URL") or "").strip() or None

#: A known scored question and a known self-assessed one, from the catalogue.
READING_FILL = "H41001:reading:fill:46"
READING_MC = "H41001:reading:mc:66"
WRITING_OPEN = "H41001:writing:open:96"


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
def make_token(
    user_id: str = USER_ID,
    email: str | None = USER_EMAIL,
    *,
    secret: str = JWT_SECRET,
    algorithm: str = "HS256",
    audience: str = JWT_AUDIENCE,
    issuer: str = JWT_ISSUER,
    expires_in: int = 3600,
    **extra: object,
) -> str:
    """Mints an access token shaped like one Supabase Auth issues."""
    now = int(time.time())
    payload: dict[str, object] = {
        "sub": user_id,
        "role": "authenticated",
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": now + expires_in,
    }
    if email is not None:
        payload["email"] = email
    payload.update(extra)
    return jwt.encode(payload, secret, algorithm=algorithm)


def auth_headers(user_id: str = USER_ID, email: str | None = USER_EMAIL) -> dict[str, str]:
    """Headers for a signed-in request as this user."""
    return {"Authorization": f"Bearer {make_token(user_id, email)}"}


def _reset_postgres(dsn: str) -> None:
    """Drops the three tables so each test starts from an empty database."""
    import psycopg

    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("DROP TABLE IF EXISTS reviews, sessions, questions CASCADE")


@pytest.fixture(scope="session")
def catalogue() -> dict:
    return json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path) -> TestClient:
    """A fresh app on a throwaway database, signed in as :data:`USER_ID`."""
    if TEST_DATABASE_URL:
        _reset_postgres(TEST_DATABASE_URL)
        app = create_app(database_url=TEST_DATABASE_URL, catalogue_path=CATALOGUE_PATH)
    else:
        app = create_app(db_path=tmp_path / "reviews.sqlite3", catalogue_path=CATALOGUE_PATH)
    with TestClient(app, headers=auth_headers()) as test_client:
        yield test_client


@pytest.fixture
def anonymous_client(tmp_path) -> TestClient:
    """The same app, with no Authorization header."""
    if TEST_DATABASE_URL:
        _reset_postgres(TEST_DATABASE_URL)
        app = create_app(database_url=TEST_DATABASE_URL, catalogue_path=CATALOGUE_PATH)
    else:
        app = create_app(db_path=tmp_path / "reviews.sqlite3", catalogue_path=CATALOGUE_PATH)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session_id(client: TestClient) -> str:
    response = client.post("/api/sessions", json={"category": "reading", "mode": "random"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def answer(client: TestClient, session: str, key: str, outcome: str, ms: int) -> dict:
    response = client.post(
        f"/api/sessions/{session}/reviews",
        json={"question_key": key, "outcome": outcome, "elapsed_ms": ms},
    )
    assert response.status_code == 201, response.text
    return response.json()
