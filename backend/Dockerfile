# syntax=docker/dockerfile:1
#
# The review API. Serves /api from FastAPI and keeps the SQLite review database
# on a volume; in the compose stack nginx serves the Angular bundle and proxies
# /api here, so this image does not need the frontend at all.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# The review database is mounted here so practice history outlives the
# container. Created before VOLUME so a fresh named volume inherits the
# ownership of the non-root user below.
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home app \
    && mkdir -p /data \
    && chown app:app /data

WORKDIR /app

# Runtime dependencies only (requirements-dev.txt adds pytest/httpx).
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY --chown=app:app app ./app
COPY --chown=app:app scripts ./scripts
# Includes the generated catalogue.json the questions table is seeded from.
COPY --chown=app:app data ./data

ENV HSK_DB_PATH=/data/hsk_reviews.sqlite3

USER app

VOLUME ["/data"]
EXPOSE 8000

# The slim image has no curl, so health-check with the interpreter already
# present. /api/health queries the database, so this proves more than liveness.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
