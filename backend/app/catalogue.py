"""Loads the generated question catalogue and keeps the questions table in sync."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import CATEGORIES, LEVELS


class CatalogueError(RuntimeError):
    """Raised when the generated catalogue is missing or malformed."""


def load_catalogue(path: str | Path) -> dict[str, Any]:
    file = Path(path)
    if not file.exists():
        raise CatalogueError(
            f"Question catalogue not found at {file}. "
            "Generate it with: node scripts/export_catalogue.mjs"
        )
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - corrupt file guard
        raise CatalogueError(f"Question catalogue at {file} is not valid JSON: {exc}") from exc

    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        raise CatalogueError(f"Question catalogue at {file} contains no questions")

    required = {"key", "paper", "level", "category", "kind", "number", "part", "scoreable", "label"}
    for index, row in enumerate(questions):
        missing = required - row.keys()
        if missing:
            raise CatalogueError(
                f"Question #{index} in {file} is missing fields: {', '.join(sorted(missing))}"
            )
        if row["category"] not in CATEGORIES:
            raise CatalogueError(
                f"Question {row['key']} has unknown category {row['category']!r}"
            )
        if row["level"] not in LEVELS:
            raise CatalogueError(
                f"Question {row['key']} has unknown level {row['level']!r}"
            )
    return data


def categories_in_catalogue(catalogue: dict[str, Any]) -> list[str]:
    return [c["key"] for c in catalogue.get("categories", [])]


def level_papers(catalogue: dict[str, Any], level: str) -> list[str]:
    """Every paper that contributes to one level, in catalogue order."""
    seen: list[str] = []
    for q in catalogue["questions"]:
        if q["level"] == level and q["paper"] not in seen:
            seen.append(q["paper"])
    return seen


def category_totals(catalogue: dict[str, Any]) -> dict[str, dict[str, int]]:
    """Totals straight from the catalogue (not the DB), for cross-checking."""
    totals: dict[str, dict[str, int]] = {}
    for category in CATEGORIES:
        rows = [q for q in catalogue["questions"] if q["category"] == category]
        totals[category] = {
            "total": len(rows),
            "scoreable": sum(1 for q in rows if q["scoreable"]),
        }
    return totals
