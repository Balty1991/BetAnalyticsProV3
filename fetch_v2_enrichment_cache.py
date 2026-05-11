#!/usr/bin/env python3
"""
fetch_v2_enrichment_cache.py — VEYRA SmartBet Fusion v4 | API v2 enrichment cache
=================================================================================

Fetchează resursele API v2 care contează pentru Motorul Unificat pe meciurile
curente din data/events.json, fără să umfle fetch_data.py:

- /api/v2/events/{id}/                  -> context: derby, neutral, travel, weather, pitch, referee, coaches
- /api/v2/events/{id}/odds/             -> consensus odds v2
- /api/v2/events/{id}/odds/comparison/  -> multi-bookmaker, best price, movement, dispersion
- /api/v2/events/{id}/polymarket/       -> prediction-market implied probabilities, când există
- /api/v2/events/{id}/prediction/       -> BSD CatBoost v2 grouped markets
- /api/v2/events/{id}/lineups/          -> confirmed/predicted/unavailable + unavailable players
- /api/v2/events/{id}/metadata/         -> pre-match facts, jerseys, preview
- /api/v2/referees/{id}/                -> referee aggregates, dacă event detail are referee_id
- /api/v2/managers/{id}/                -> manager/tactical profile, dacă event detail are coach IDs

Output:
  data/v2_enrichment_cache.json

Scriptul este incremental și safe: păstrează cache-ul existent și refetchează doar
meciuri viitoare sau cache foarte vechi.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

DATA_DIR = Path("data")
EVENTS_PATH = DATA_DIR / "events.json"
CACHE_PATH = DATA_DIR / "v2_enrichment_cache.json"
API_BASE = os.environ.get("BSD_API_V2_BASE", "https://sports.bzzoiro.com/api/v2").rstrip("/")
MAX_FETCH_PER_RUN = int(os.environ.get("V2_ENRICH_LIMIT", "120"))
CACHE_TTL_HOURS = float(os.environ.get("V2_ENRICH_TTL_HOURS", "4"))
SLEEP_BETWEEN_CALLS = float(os.environ.get("V2_ENRICH_SLEEP", "0.20"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_token() -> str:
    token = os.environ.get("BSD_TOKEN", "") or os.environ.get("API_TOKEN", "")
    if not token:
        raise SystemExit("BSD_TOKEN lipsă din env")
    return token


def load_json(path: Path, default=None):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def save_json(path: Path, payload: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def _request_json(path: str, token: str, retries: int = 3) -> Optional[Any]:
    url = f"{API_BASE}/{path.lstrip('/')}"
    req = urllib.request.Request(url, headers={"Authorization": f"Token {token}", "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 404):
                return None
            if exc.code == 429:
                time.sleep(8 * (attempt + 1))
            else:
                time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def _event_id(ev: Dict[str, Any]) -> Optional[str]:
    nested = ev.get("event") if isinstance(ev.get("event"), dict) else {}
    eid = ev.get("event_id") or ev.get("id") or nested.get("id")
    return str(eid) if eid is not None else None


def _event_date(ev: Dict[str, Any]) -> str:
    nested = ev.get("event") if isinstance(ev.get("event"), dict) else {}
    return str(ev.get("event_date") or ev.get("date") or nested.get("event_date") or nested.get("date") or "")


def load_events() -> List[Dict[str, Any]]:
    raw = load_json(EVENTS_PATH, {})
    if isinstance(raw, dict):
        events = raw.get("events") or raw.get("predictions") or raw.get("results") or []
        if not events and all(isinstance(v, dict) for v in raw.values()):
            events = list(raw.values())
    else:
        events = raw or []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        date = _event_date(ev)[:10]
        status = str(ev.get("status") or "").lower()
        if _event_id(ev) and date >= today and status not in {"finished", "ft", "closed", "cancelled", "canceled"}:
            out.append(ev)
    return out


def is_stale(entry: Dict[str, Any]) -> bool:
    fetched = entry.get("fetched_at")
    if not fetched:
        return True
    try:
        fetched_dt = datetime.fromisoformat(str(fetched).replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - fetched_dt > timedelta(hours=CACHE_TTL_HOURS)
    except Exception:
        return True


def safe_get(path: str, token: str) -> Any:
    data = _request_json(path, token)
    time.sleep(SLEEP_BETWEEN_CALLS)
    return data


def fetch_event_bundle(eid: str, token: str) -> Dict[str, Any]:
    bundle: Dict[str, Any] = {"event_id": eid, "fetched_at": now_iso()}

    detail = safe_get(f"events/{eid}/", token)
    bundle["detail"] = detail
    bundle["odds"] = safe_get(f"events/{eid}/odds/", token)
    bundle["odds_comparison"] = safe_get(f"events/{eid}/odds/comparison/", token)
    bundle["polymarket"] = safe_get(f"events/{eid}/polymarket/", token)
    bundle["prediction"] = safe_get(f"events/{eid}/prediction/", token)
    bundle["lineups"] = safe_get(f"events/{eid}/lineups/", token)
    bundle["metadata"] = safe_get(f"events/{eid}/metadata/", token)

    # Context agregat: arbitru și manageri. Se iau din event detail, când există.
    if isinstance(detail, dict):
        ref_id = detail.get("referee_id")
        if ref_id:
            bundle["referee"] = safe_get(f"referees/{ref_id}/", token)
        else:
            bundle["referee"] = None
        managers = {}
        for key in ("home_coach_id", "away_coach_id"):
            mid = detail.get(key)
            if mid:
                managers[key] = safe_get(f"managers/{mid}/", token)
        bundle["managers"] = managers
    else:
        bundle["referee"] = None
        bundle["managers"] = {}

    return bundle


def main():
    token = _get_token()
    events = load_events()
    cache = load_json(CACHE_PATH, {}) or {}
    if not isinstance(cache, dict):
        cache = {}
    entries = cache.get("events") if isinstance(cache.get("events"), dict) else {}

    queue = []
    for ev in events:
        eid = _event_id(ev)
        if not eid:
            continue
        entry = entries.get(eid)
        if not isinstance(entry, dict) or is_stale(entry):
            queue.append(eid)

    queue = queue[:MAX_FETCH_PER_RUN]
    print(f"V2 enrichment: events={len(events)} to_fetch={len(queue)} limit={MAX_FETCH_PER_RUN}")

    ok = 0
    for idx, eid in enumerate(queue, 1):
        try:
            entries[eid] = fetch_event_bundle(eid, token)
            ok += 1
        except Exception as exc:
            entries[eid] = {"event_id": eid, "fetched_at": now_iso(), "error": str(exc)}
        if idx % 20 == 0:
            save_json(CACHE_PATH, {"updated_at": now_iso(), "count": len(entries), "events": entries})
            print(f"  {idx}/{len(queue)} fetched")

    # Curățare ușoară: păstrează doar event IDs relevante + istoric recent din cache.
    active_ids = {_event_id(ev) for ev in events if _event_id(ev)}
    cleaned = {}
    for eid, entry in entries.items():
        if eid in active_ids or not is_stale(entry):
            cleaned[eid] = entry

    payload = {"updated_at": now_iso(), "count": len(cleaned), "fetched_this_run": ok, "events": cleaned}
    save_json(CACHE_PATH, payload)
    print(f"✅ Salvat {CACHE_PATH}: total={len(cleaned)} fetched={ok}")


if __name__ == "__main__":
    main()
