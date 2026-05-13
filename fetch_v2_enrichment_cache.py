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
- /api/v2/events/{id}/prediction/       -> BSD CatBoost v2 grouped markets (GAP 2)
- /api/v2/events/{id}/lineups/          -> confirmed/predicted/unavailable + unavailable players
- /api/v2/events/{id}/metadata/         -> pre-match facts, jerseys, preview
- /api/v2/events/{id}/h2h/              -> head-to-head: draw_rate, btts_rate, avg_goals (GAP 3)
- /api/v2/referees/{id}/                -> referee aggregates, dacă event detail are referee_id
- /api/v2/managers/{id}/                -> manager/tactical profile, dacă event detail are coach IDs

GAP 1: context flags (derby/neutral/travel/weather/pitch) sunt citite de fetch_data.py
        din bundle["detail"] prin V2_ENRICHMENT_CACHE.
GAP 2: probabilitățile BSD v2 ML sunt citite din bundle["prediction"] prin get_v2_ml_probability().
GAP 3: H2H stats sunt normalizate din bundle["h2h"] și aplicate în v2_score_adjustment().

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


def normalize_h2h(raw: Any) -> Optional[Dict[str, Any]]:
    """
    GAP 3 — Normalizează răspunsul H2H din /api/v2/events/{id}/h2h/ (sau alte formate).

    BSD poate returna H2H în mai multe formate. Extragem:
      total_matches, home_wins, draws, away_wins,
      draw_rate, home_win_rate, away_win_rate, btts_rate, avg_goals.

    Returnează None dacă datele sunt insuficiente (< 3 meciuri).
    """
    if not isinstance(raw, dict):
        return None

    # Suport format direct (flat)
    matches = raw.get("results") or raw.get("matches") or raw.get("h2h") or []

    # Format top-level stats (unele API-uri returnează direct agregate)
    if not isinstance(matches, list):
        total = int(raw.get("total_matches") or raw.get("total") or 0)
        if total < 3:
            return None
        return {
            "total_matches":   total,
            "home_wins":       int(raw.get("home_wins") or 0),
            "draws":           int(raw.get("draws") or 0),
            "away_wins":       int(raw.get("away_wins") or 0),
            "draw_rate":       raw.get("draw_rate"),
            "home_win_rate":   raw.get("home_win_rate"),
            "away_win_rate":   raw.get("away_win_rate"),
            "btts_rate":       raw.get("btts_rate"),
            "avg_goals":       raw.get("avg_goals"),
        }

    # Format list — calculăm statisticile din meciuri individuale
    if len(matches) < 3:
        return None

    home_wins = draws = away_wins = 0
    btts_count = goals_total = 0
    # Păstrăm ultimele 10 meciuri pentru relevanță
    for m in matches[:10]:
        if not isinstance(m, dict):
            continue
        hs = m.get("home_score") if m.get("home_score") is not None else m.get("score_home")
        aw = m.get("away_score") if m.get("away_score") is not None else m.get("score_away")
        try:
            hs = int(hs); aw = int(aw)
        except Exception:
            continue
        total = hs + aw
        goals_total += total
        if hs > aw:
            home_wins += 1
        elif hs == aw:
            draws += 1
        else:
            away_wins += 1
        if hs > 0 and aw > 0:
            btts_count += 1

    played = home_wins + draws + away_wins
    if played < 3:
        return None

    return {
        "total_matches":   played,
        "home_wins":       home_wins,
        "draws":           draws,
        "away_wins":       away_wins,
        "draw_rate":       round(draws / played, 3),
        "home_win_rate":   round(home_wins / played, 3),
        "away_win_rate":   round(away_wins / played, 3),
        "btts_rate":       round(btts_count / played, 3),
        "avg_goals":       round(goals_total / played, 2),
    }


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

    # GAP 3 — H2H head-to-head: istoric direct între cele două echipe
    # Endpoint posibil: /api/v2/events/{id}/h2h/
    # Graceful: returnează None dacă endpoint-ul nu există (404/400)
    h2h_raw = safe_get(f"events/{eid}/h2h/", token)
    bundle["h2h"] = normalize_h2h(h2h_raw)

    # Context agregat: arbitru, manageri și venue.
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

        # VENUE: stadion, suprafață (natural/artificial), capacitate, dimensiuni
        # Folosit în predict_current.py pentru venue_market_bonus() și risc context
        venue_id = detail.get("venue_id") or detail.get("venue", {}) if isinstance(detail.get("venue"), dict) else None
        if not venue_id and isinstance(detail.get("venue"), dict):
            venue_id = detail["venue"].get("id")
        if venue_id:
            bundle["venue"] = safe_get(f"venues/{venue_id}/", token)
        else:
            bundle["venue"] = None
    else:
        bundle["referee"] = None
        bundle["managers"] = {}
        bundle["venue"] = None

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
