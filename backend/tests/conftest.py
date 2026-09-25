"""Shared pytest fixtures."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import create_app  # noqa: E402

CATALOGUE_PATH = BACKEND_DIR / "data" / "catalogue.json"

#: A known scored question and a known self-assessed one, from the catalogue.
READING_FILL = "H41001:reading:fill:46"
READING_MC = "H41001:reading:mc:66"
WRITING_OPEN = "H41001:writing:open:96"


@pytest.fixture(scope="session")
def catalogue() -> dict:
    return json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path) -> TestClient:
    """A fresh app on a throwaway database, with the real catalogue seeded."""
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
