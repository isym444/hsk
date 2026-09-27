"""Supabase Auth: verify a caller's access token and identify them.

The Angular app signs users in against Supabase Auth directly (magic link) and
sends the resulting access token as ``Authorization: Bearer <jwt>``. This module
turns that token into a :class:`Principal` — a user id and email the rest of the
API can trust — or rejects the request.

Two signing systems exist and both are supported:

* **Signing keys** (asymmetric, ES256/RS256) — what new Supabase projects use.
  Verified locally against the project's public JWKS, so no shared secret is
  needed and no Auth round-trip happens per request.
* **Legacy JWT secret** (HS256) — verified with the shared secret, for projects
  that have not migrated. Only used when the token says it was signed that way.

Nothing here trusts the token's *contents* before the signature is checked.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import (
    ALLOWED_EMAILS,
    DEV_NO_AUTH,
    DEV_USER_EMAIL,
    DEV_USER_ID,
    SUPABASE_JWKS_URL,
    SUPABASE_JWT_AUDIENCE,
    SUPABASE_JWT_ISSUER,
    SUPABASE_JWT_SECRET,
)

logger = logging.getLogger(__name__)

#: Signing algorithms Supabase uses. Anything else — most importantly the
#: classic ``alg: none`` bypass — is refused before any key is fetched, so an
#: unsupported token can never reach the JWKS lookup.
ALLOWED_ALGORITHMS = frozenset(
    {
        # Legacy shared secret
        "HS256",
        "HS384",
        "HS512",
        # Signing keys (asymmetric)
        "RS256",
        "RS384",
        "RS512",
        "ES256",
        "ES384",
        "ES512",
    }
)


class AuthError(Exception):
    """A token that cannot be trusted. The message is safe to show a client."""


class NotAllowedError(AuthError):
    """A valid token whose account is not on the allow-list."""


@dataclass(frozen=True)
class Principal:
    """The signed-in caller behind a request."""

    user_id: str
    email: str | None = None
    role: str | None = None


class TokenVerifier:
    """Verifies Supabase access tokens and yields the caller they belong to."""

    def __init__(
        self,
        *,
        jwks_url: str | None = None,
        jwt_secret: str | None = None,
        audience: str | None = "authenticated",
        issuer: str | None = None,
        allowed_emails: Iterable[str] = (),
    ) -> None:
        self.jwks_url = jwks_url
        self.jwt_secret = jwt_secret
        self.audience = audience
        self.issuer = issuer
        self.allowed_emails = frozenset(email.strip().lower() for email in allowed_emails if email)
        self._jwks_client: Any | None = None

    @property
    def configured(self) -> bool:
        """False when the deployment has told us nothing about its Supabase project."""
        return bool(self.jwks_url or self.jwt_secret)

    # -- keys -------------------------------------------------------------- #
    def _client(self) -> Any:
        """The caching JWKS client, created on first asymmetric token."""
        if self._jwks_client is None:
            # Supabase's edge cache holds keys for 10 minutes; matching that
            # here keeps a rotated key from being trusted for much longer.
            self._jwks_client = jwt.PyJWKClient(self.jwks_url, cache_keys=True, lifespan=600)
        return self._jwks_client

    def _signing_key(self, token: str, algorithm: str) -> tuple[Any, Sequence[str]]:
        if algorithm.upper().startswith("HS"):
            if not self.jwt_secret:
                raise AuthError(
                    "this token is signed with a shared secret, but the server has no "
                    "HSK_SUPABASE_JWT_SECRET configured"
                )
            return self.jwt_secret, [algorithm]

        if not self.jwks_url:
            raise AuthError(
                "this token is signed with an asymmetric key, but the server has no "
                "HSK_SUPABASE_URL configured, so it cannot fetch the public keys"
            )
        try:
            return self._client().get_signing_key_from_jwt(token).key, [algorithm]
        except Exception as exc:  # network, unknown kid, malformed JWKS ...
            logger.warning("could not resolve the signing key for a token: %s", exc)
            raise AuthError("could not verify the token's signature") from exc

    # -- verification ------------------------------------------------------ #
    def verify(self, token: str) -> Principal:
        """Returns the caller, or raises :class:`AuthError`."""
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise AuthError("the access token is malformed") from exc

        algorithm = header.get("alg") or ""
        if not algorithm:
            raise AuthError("the access token has no signing algorithm")
        if algorithm not in ALLOWED_ALGORITHMS:
            raise AuthError(f"the access token uses an unsupported algorithm {algorithm!r}")

        key, algorithms = self._signing_key(token, algorithm)

        options = {"require": ["exp", "sub"], "verify_aud": bool(self.audience)}
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=list(algorithms),
                audience=self.audience,
                issuer=self.issuer,
                options=options,
            )
        except jwt.ExpiredSignatureError as exc:
            raise AuthError("the access token has expired") from exc
        except jwt.PyJWTError as exc:
            raise AuthError(f"the access token is not valid: {exc}") from exc

        if claims.get("role") not in (None, "authenticated"):
            raise AuthError("the access token is not a user access token")

        email = (claims.get("email") or "").strip().lower() or None
        if self.allowed_emails and email not in self.allowed_emails:
            raise NotAllowedError(f"{email or 'this account'} is not allowed to use this app")

        return Principal(user_id=str(claims["sub"]), email=email, role=claims.get("role"))


def dev_principal() -> Principal | None:
    """The stand-in caller for local development, or None when not enabled.

    Refuses whenever a Supabase project or legacy secret is configured. That is
    the safety property: a deployment cannot answer a single request without
    one of those, so this can never be live in production even if the flag is
    left set by mistake. The refusal is logged loudly rather than silently
    ignored, so a half-configured local setup is obvious.
    """
    if not DEV_NO_AUTH:
        return None
    if SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET:
        logger.error(
            "HSK_DEV_NO_AUTH is set, but a Supabase project is configured "
            "(HSK_SUPABASE_URL/HSK_SUPABASE_JWT_SECRET). Refusing the development "
            "bypass and verifying tokens normally; unset those to develop without "
            "sign-in."
        )
        return None
    return Principal(user_id=DEV_USER_ID, email=DEV_USER_EMAIL, role="authenticated")


def build_verifier() -> TokenVerifier:
    """The verifier the app runs with, from the environment."""
    return TokenVerifier(
        jwks_url=SUPABASE_JWKS_URL,
        jwt_secret=SUPABASE_JWT_SECRET,
        audience=SUPABASE_JWT_AUDIENCE,
        issuer=SUPABASE_JWT_ISSUER,
        allowed_emails=ALLOWED_EMAILS,
    )


# The OpenAPI security scheme. `auto_error=False` so a missing header produces
# our own 401 (and a missing *configuration* produces a 503) instead of
# FastAPI's bare 403; it also puts an Authorize button in /docs.
bearer_scheme = HTTPBearer(auto_error=False, description="Supabase access token")


def get_verifier(request: Request) -> TokenVerifier:
    return request.app.state.verifier


def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal:
    """FastAPI dependency: the signed-in caller, or 401/403/503."""
    # Local development short-circuit; `None` in every real deployment.
    dev: Principal | None = getattr(request.app.state, "dev_principal", None)
    if dev is not None:
        return dev

    verifier: TokenVerifier = request.app.state.verifier

    if not verifier.configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured on the server. Set HSK_SUPABASE_URL "
                "(and HSK_SUPABASE_JWT_SECRET if the project still uses the legacy "
                "shared secret)."
            ),
        )

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to use this API.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return verifier.verify(credentials.credentials)
    except NotAllowedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


__all__ = [
    "AuthError",
    "NotAllowedError",
    "Principal",
    "TokenVerifier",
    "build_verifier",
    "current_user",
]
