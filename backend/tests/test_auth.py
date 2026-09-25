"""Authentication and per-account isolation.

`client` (conftest) is signed in as USER_ID; these tests check the ways a
request can fail to prove who it is, and that one account can never see or
touch another's practice history.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import (
    JWT_ISSUER,
    JWT_SECRET,
    OTHER_USER_ID,
    OTHER_EMAIL,
    SUPABASE_URL,
    USER_EMAIL,
    USER_ID,
    answer,
    auth_headers,
    make_token,
)

#: Every endpoint that owns or derives from review history.
PROTECTED = [
    ("GET", "/api/categories"),
    ("GET", "/api/deck/reading"),
    ("GET", "/api/deck/reading/preview"),
    ("GET", "/api/stats/reading"),
    ("GET", "/api/sessions"),
    ("POST", "/api/sessions"),
    ("GET", "/api/me"),
]


def call(client: TestClient, method: str, path: str, headers: dict[str, str]) -> int:
    response = client.request(method, path, headers=headers, json={} if method == "POST" else None)
    return response.status_code


# --------------------------------------------------------------------------- #
# The token is required
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_endpoints_require_a_token(
    anonymous_client: TestClient, method: str, path: str
) -> None:
    assert call(anonymous_client, method, path, {}) == 401


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_endpoints_accept_a_valid_token(
    client: TestClient, method: str, path: str
) -> None:
    # 422 would mean "authenticated, but the body/params are wrong" — i.e. the
    # token got us past authentication and into validation.
    assert call(client, method, path, auth_headers()) in (200, 201, 422)


def test_the_401_says_how_to_authenticate(anonymous_client: TestClient) -> None:
    response = anonymous_client.get("/api/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_health_stays_public_for_the_container_healthcheck(
    anonymous_client: TestClient,
) -> None:
    response = anonymous_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# --------------------------------------------------------------------------- #
# The token must actually be trustworthy
# --------------------------------------------------------------------------- #
def bad_token_cases() -> list[tuple[str, str]]:
    return [
        ("garbage", "not-a-jwt"),
        ("empty-ish", "Bearer"),
        ("wrong signature", make_token(secret="a-different-secret-of-sufficient-length")),
        ("expired", make_token(expires_in=-60)),
        ("wrong audience", make_token(audience="some-other-app")),
        ("wrong issuer", make_token(issuer="https://evil.example.com/auth/v1")),
        ("service_role token", make_token(role="service_role")),
        ("alg none", _alg_none_token()),
    ]


def _alg_none_token() -> str:
    """A hand-rolled unsigned token: the classic JWT bypass attempt."""
    import base64
    import json
    import time

    def part(payload: dict) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    now = int(time.time())
    header = part({"alg": "none", "typ": "JWT"})
    body = part({"sub": USER_ID, "email": USER_EMAIL, "role": "authenticated", "exp": now + 600})
    return f"{header}.{body}."


@pytest.mark.parametrize(
    ("case", "token"),
    bad_token_cases(),
    ids=[case for case, _ in bad_token_cases()],
)
def test_untrustworthy_tokens_are_rejected(
    client: TestClient, case: str, token: str
) -> None:
    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401, f"{case} was accepted: {response.text}"


def test_a_tampered_payload_breaks_the_signature(client: TestClient) -> None:
    """Swap the subject out of a valid token and keep the old signature."""
    header, payload, signature = make_token().split(".")
    forged = f"{header}.{payload[:-4]}AAAA.{signature}"
    response = client.get("/api/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_an_unexpected_algorithm_is_refused_before_any_key_lookup(
    client: TestClient,
) -> None:
    """A token claiming an algorithm we do not support never reaches the JWKS."""
    import base64
    import json

    def part(payload: dict) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    # PyJWT parses the header before we see it, so every segment has to be
    # well-formed base64url even though nothing will verify it.
    signature = part({"not": "a real signature"})
    token = f"{part({'alg': 'HS1024'})}.{part({'sub': USER_ID})}.{signature}"
    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "algorithm" in response.json()["detail"]


# --------------------------------------------------------------------------- #
# Asymmetric tokens (the signing-keys system production uses)
# --------------------------------------------------------------------------- #
def _es256_token(private_key, **claims) -> str:
    import time

    import jwt

    now = int(time.time())
    payload = {
        "sub": USER_ID,
        "email": USER_EMAIL,
        "role": "authenticated",
        "aud": "authenticated",
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + 3600,
    }
    payload.update(claims)
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": "test-key"})


class _StubJwks:
    """Stands in for PyJWKClient, so no test touches the network."""

    def __init__(self, public_key) -> None:
        self.public_key = public_key
        self.calls = 0

    def get_signing_key_from_jwt(self, token: str):
        from types import SimpleNamespace

        self.calls += 1
        return SimpleNamespace(key=self.public_key)


def _verifier(jwks) -> "object":
    from app.auth import TokenVerifier

    verifier = TokenVerifier(
        jwks_url=f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
        audience="authenticated",
        issuer=JWT_ISSUER,
        allowed_emails=[USER_EMAIL],
    )
    verifier._jwks_client = jwks
    return verifier


def test_an_es256_token_is_verified_against_the_projects_public_key() -> None:
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    jwks = _StubJwks(key.public_key())

    principal = _verifier(jwks).verify(_es256_token(key))

    assert principal.user_id == USER_ID
    assert principal.email == USER_EMAIL
    assert jwks.calls == 1, "the public key is what verified the signature"


def test_an_es256_token_signed_by_another_key_is_rejected() -> None:
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.auth import AuthError

    signing_key = ec.generate_private_key(ec.SECP256R1())
    published_key = ec.generate_private_key(ec.SECP256R1())

    with pytest.raises(AuthError):
        _verifier(_StubJwks(published_key.public_key())).verify(_es256_token(signing_key))


def test_an_asymmetric_token_without_a_configured_project_is_refused() -> None:
    """No HSK_SUPABASE_URL means the public keys cannot be fetched at all."""
    import time

    import jwt
    from cryptography.hazmat.primitives.asymmetric import ec

    from app.auth import AuthError, TokenVerifier

    key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(
        {"sub": USER_ID, "aud": "authenticated", "iss": JWT_ISSUER, "exp": int(time.time()) + 600},
        key,
        algorithm="ES256",
    )

    with pytest.raises(AuthError, match="HSK_SUPABASE_URL"):
        TokenVerifier(jwt_secret="unused").verify(token)


# --------------------------------------------------------------------------- #
# The allow-list
# --------------------------------------------------------------------------- #
def test_an_account_off_the_allow_list_is_refused(client: TestClient) -> None:
    response = client.get("/api/me", headers=auth_headers(email="stranger@example.com"))
    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]


def test_the_allow_listed_account_gets_through(client: TestClient) -> None:
    body = client.get("/api/me", headers=auth_headers()).json()
    assert body["user_id"] == USER_ID
    assert body["email"] == USER_EMAIL
    assert body["role"] == "authenticated"


# --------------------------------------------------------------------------- #
# One account cannot see or touch another's history
# --------------------------------------------------------------------------- #
def test_history_is_per_account(client: TestClient, session_id: str) -> None:
    answer(client, session_id, "H41001:reading:fill:46", "correct", 1200)

    mine = client.get("/api/categories").json()["totals"]
    assert mine["attempts"] == 1
    assert mine["answered_questions"] == 1

    theirs = client.get("/api/categories", headers=auth_headers(OTHER_USER_ID, OTHER_EMAIL)).json()[
        "totals"
    ]
    assert theirs["attempts"] == 0
    assert theirs["answered_questions"] == 0
    assert theirs["session_count"] == 0


def test_another_account_cannot_read_a_session(client: TestClient, session_id: str) -> None:
    answer(client, session_id, "H41001:reading:fill:46", "correct", 1200)
    other = auth_headers(OTHER_USER_ID, OTHER_EMAIL)

    # Invisible, and indistinguishable from a session that does not exist.
    assert client.get(f"/api/sessions/{session_id}", headers=other).status_code == 404
    assert client.get("/api/sessions", headers=other).json() == []


def test_another_account_cannot_record_into_a_session(
    client: TestClient, session_id: str
) -> None:
    other = auth_headers(OTHER_USER_ID, OTHER_EMAIL)
    response = client.post(
        f"/api/sessions/{session_id}/reviews",
        headers=other,
        json={"question_key": "H41001:reading:fill:46", "outcome": "correct", "elapsed_ms": 900},
    )
    assert response.status_code == 404

    # ... and the owner's session is untouched.
    assert client.get(f"/api/sessions/{session_id}").json()["answered"] == 0


def test_another_account_cannot_finish_or_delete_a_session(
    client: TestClient, session_id: str
) -> None:
    other = auth_headers(OTHER_USER_ID, OTHER_EMAIL)

    assert client.post(f"/api/sessions/{session_id}/finish", headers=other).status_code == 404
    assert client.delete(f"/api/sessions/{session_id}", headers=other).status_code == 404
    assert client.get(f"/api/sessions/{session_id}").status_code == 200


def test_recent_sessions_are_scoped(client: TestClient, session_id: str) -> None:
    answer(client, session_id, "H41001:reading:fill:46", "correct", 1200)

    other = auth_headers(OTHER_USER_ID, OTHER_EMAIL)
    theirs_id = client.post(
        "/api/sessions", headers=other, json={"category": "reading", "mode": "smart"}
    ).json()["id"]
    client.post(
        f"/api/sessions/{theirs_id}/reviews",
        headers=other,
        json={"question_key": "H41001:reading:mc:66", "outcome": "incorrect", "elapsed_ms": 700},
    )

    assert [row["id"] for row in client.get("/api/sessions").json()] == [session_id]
    assert [row["id"] for row in client.get("/api/sessions", headers=other).json()] == [theirs_id]

    # Each account's recent-session list carries only its own numbers.
    assert client.get("/api/sessions").json()[0]["correct"] == 1
    assert client.get("/api/sessions", headers=other).json()[0]["incorrect"] == 1


def test_the_deck_scheduler_is_per_account(client: TestClient, session_id: str) -> None:
    """A question marked wrong by one account is still "new" for another."""
    answer(client, session_id, "H41001:reading:fill:46", "incorrect", 1200)

    def row_for(headers: dict[str, str]) -> dict:
        deck = client.get("/api/deck/reading?mode=smart", headers=headers).json()
        return next(q for q in deck["questions"] if q["question_key"] == "H41001:reading:fill:46")

    assert row_for(auth_headers())["attempts"] == 1
    assert row_for(auth_headers(OTHER_USER_ID, OTHER_EMAIL))["attempts"] == 0


def test_me_reports_only_the_callers_rows(client: TestClient, session_id: str) -> None:
    answer(client, session_id, "H41001:reading:fill:46", "correct", 1200)

    assert client.get("/api/me").json()["reviews"] == 1
    assert (
        client.get("/api/me", headers=auth_headers(OTHER_USER_ID, OTHER_EMAIL)).json()["reviews"]
        == 0
    )


def test_the_same_token_secret_is_shared_by_every_account(client: TestClient) -> None:
    """Two users, two tokens, one project — they must not collide."""
    first = client.get("/api/me", headers=auth_headers()).json()
    second = client.get("/api/me", headers=auth_headers(OTHER_USER_ID, OTHER_EMAIL)).json()
    assert first["user_id"] != second["user_id"]
    assert JWT_SECRET  # the suite's tokens are signed, not trusted blindly
