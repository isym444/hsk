"""Configuration for the HSK review API.

Every path can be overridden with an environment variable so the test suite
and ad-hoc runs can point at a throwaway database.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


#: Generated from the Angular app's data layer by `scripts/export_catalogue.mjs`.
CATALOGUE_PATH = Path(os.environ.get("HSK_CATALOGUE_PATH", DATA_DIR / "catalogue.json"))

#: Where the SQLite review database lives. Created on first start. Ignored when
#: ``HSK_DATABASE_URL`` is set (SQLite stays the local/test default).
DB_PATH = Path(os.environ.get("HSK_DB_PATH", DATA_DIR / "hsk_reviews.sqlite3"))

#: PostgreSQL DSN, e.g. Supabase's "Session pooler" connection string:
#: ``postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require``
#: When set, all review data lives in Postgres and ``DB_PATH`` is unused.
DATABASE_URL = _clean(os.environ.get("HSK_DATABASE_URL"))

#: Postgres connection-pool bounds. Supabase's free tier allows a small number
#: of pooler clients, so this stays deliberately modest.
DB_POOL_MIN = int(os.environ.get("HSK_DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.environ.get("HSK_DB_POOL_MAX", "5"))

#: PostgreSQL schema holding the review tables. Defaults to the connection's own
#: default (`public`), which is right for a dedicated database. Set it when
#: sharing a database with another application, so neither can collide on names
#: like `sessions`. Ignored by SQLite, which has no schemas.
DB_SCHEMA = _clean(os.environ.get("HSK_DB_SCHEMA"))

# --------------------------------------------------------------------------- #
# Authentication (Supabase Auth)
# --------------------------------------------------------------------------- #
#: Supabase project URL, e.g. ``https://abcdefghijklm.supabase.co``. Used to
#: derive the JWT issuer and the public-key (JWKS) discovery endpoint.
SUPABASE_URL = (_clean(os.environ.get("HSK_SUPABASE_URL")) or "").rstrip("/") or None

#: Where Supabase publishes the public keys its access tokens are signed with.
#: Derived from ``SUPABASE_URL``; override only for a self-hosted Auth.
SUPABASE_JWKS_URL = _clean(os.environ.get("HSK_SUPABASE_JWKS_URL")) or (
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None
)

#: The legacy shared secret (HS256). Supabase's signing-keys system uses
#: asymmetric keys (ES256/RS256) and needs no secret at all; this is only for
#: projects still on the legacy JWT secret. Verification prefers JWKS whenever
#: the token says it was signed with an asymmetric algorithm.
SUPABASE_JWT_SECRET = _clean(os.environ.get("HSK_SUPABASE_JWT_SECRET"))

#: Identity of tokens issued by Supabase Auth for a signed-in user.
SUPABASE_JWT_AUDIENCE = _clean(os.environ.get("HSK_SUPABASE_JWT_AUDIENCE")) or "authenticated"
SUPABASE_JWT_ISSUER = _clean(os.environ.get("HSK_SUPABASE_JWT_ISSUER")) or (
    f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else None
)

#: Optional allow-list of email addresses. Empty means "any account that can
#: sign in to the Supabase project". With magic links anyone can create an
#: account by requesting a link, so set this to your own address unless the
#: project has sign-ups disabled.
ALLOWED_EMAILS = frozenset(
    email.strip().lower()
    for email in (os.environ.get("HSK_ALLOWED_EMAILS") or "").split(",")
    if email.strip()
)

#: The Angular dev server (`ng serve --proxy-config proxy.conf.json`) proxies
#: /api, so in normal development same-origin requests never need CORS. These
#: origins are allowed so the app also works when the frontend is served from a
#: different port without the proxy.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "HSK_CORS_ORIGINS",
        "http://localhost:4200,http://127.0.0.1:4200",
    ).split(",")
    if origin.strip()
]

CATEGORIES = ("listening", "reading", "writing")


#: Built Angular bundle, served at / by the API when present so the whole app
#: can run from a single process. Set ``HSK_WEB_DIST`` to point at it
#: explicitly (the Docker stack leaves this unset because nginx serves the UI);
#: otherwise the sibling checkout layout is assumed.
def _web_dist_candidates() -> tuple[Path, ...]:
    override = os.environ.get("HSK_WEB_DIST")
    if override:
        return (Path(override),)
    return (BACKEND_DIR.parent / "hsk4-practice-app" / "dist" / "hsk4-practice-app" / "browser",)


WEB_DIST_CANDIDATES = _web_dist_candidates()
