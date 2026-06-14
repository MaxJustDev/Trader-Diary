"""Single source of truth for prop-firm fund templates.

The JSON file (`app/data/fund_templates.json`) is the seed data for the funds
table. Loaded once per process via `lru_cache`. To pick up edits during dev,
restart the server.
"""
import json
from functools import lru_cache
from pathlib import Path

_TEMPLATES_PATH = Path(__file__).resolve().parent.parent / "data" / "fund_templates.json"


@lru_cache(maxsize=1)
def load_templates() -> dict:
    """Return the fund-template dictionary keyed by fund name."""
    with _TEMPLATES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)
