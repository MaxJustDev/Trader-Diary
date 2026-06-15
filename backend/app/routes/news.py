from fastapi import APIRouter
from datetime import datetime, timezone
import logging
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)

_news_cache: dict = {"data": None, "fetched_at": 0.0}
_CACHE_TTL = 3600  # 1 hour

FOREX_FACTORY_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"


@router.get("/calendar")
async def get_news_calendar():
    """Fetch high-impact forex news from ForexFactory (cached 1h)."""
    import time
    now = time.time()
    if _news_cache["data"] is not None and (now - _news_cache["fetched_at"]) < _CACHE_TTL:
        return {"events": _news_cache["data"], "cached": True}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(FOREX_FACTORY_URL, headers={"User-Agent": "TraderDiary/1.0"})
            resp.raise_for_status()
            raw = resp.json()
    except Exception as e:
        logger.warning("Failed to fetch news calendar: %s", e)
        return {"events": _news_cache["data"] or [], "cached": True, "error": str(e)}

    events = []
    for item in raw:
        impact = (item.get("impact") or "").lower()
        if impact not in ("high", "medium"):
            continue
        events.append({
            "title": item.get("title", ""),
            "country": item.get("country", ""),
            "date": item.get("date", ""),
            "time": item.get("time", ""),
            "impact": impact,
            "forecast": item.get("forecast"),
            "previous": item.get("previous"),
        })

    # Sort by date+time
    def _sort_key(e: dict):
        try:
            return datetime.strptime(f"{e['date']} {e['time']}", "%m-%d-%Y %I:%M%p")
        except Exception:
            return datetime.min

    events.sort(key=_sort_key)

    _news_cache["data"] = events
    _news_cache["fetched_at"] = now
    return {"events": events, "cached": False}
