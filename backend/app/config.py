"""Configuration for the HSK review API.

Every path can be overridden with an environment variable so the test suite
and ad-hoc runs can point at a throwaway database.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

#: Generated from the Angular app's data layer by `scripts/export_catalogue.mjs`.
CATALOGUE_PATH = Path(os.environ.get("HSK_CATALOGUE_PATH", DATA_DIR / "catalogue.json"))

#: Where the SQLite review database lives. Created on first start.
DB_PATH = Path(os.environ.get("HSK_DB_PATH", DATA_DIR / "hsk_reviews.sqlite3"))

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
