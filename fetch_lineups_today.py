#!/usr/bin/env python3
"""
fetch_lineups_today.py — Lineup Fetch | BSD API v2
===================================================
Descarcă lineup-urile (confirmate sau predicted) pentru meciurile din ziua curentă.

Sursa: /api/v2/events/{id}/lineups/
Output: data/lineups_today.json — dict keyed by event_id (str)

Câmpuri salvate per eveniment:
  status         — "confirmed" | "predicted" | "unavailable"
  home_formation — ex. "4-3-3"
  away_formation — ex. "4-4-2"
  home_confidence / away_confidence — AI confidence 0-1 (pt lineup predicted)
  home_unavailable / away_unavailable — lista jucători lipsă [{name, status, return_date}]
  home_starters / away_starters — XI titular [{name, position, shirt_number, ai_score}]
  n_injured_home / n_injured_away — count jucători lipsă (injured + suspended)
  fetched_at — timestamp

Rulare:
  BSD_TOKEN=xxx python3 fetch_lineups_today.py

GitHub Actions: de mai multe ori pe zi (la 10:00, 13:00, 16:00, 19:00 UTC)
"""

import os, json, time, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

import requests

API_BASE  = "https://sports.bzzoiro.com"
V2_BASE   = f"{API_BASE}/api/v2"
TOKEN     = os.environ.get("BSD_TOKEN", "").strip()
DATA_DIR  = Path("data")
OUT_PATH  = DATA_DIR / "lineups_today.json"
DELAY     = float(os.environ.get("DELAY_MS", "200")) / 1000.0

HEADERS = {"Authorization": f"Token {TOKEN}"}


def ensure_token():
    if not TOKEN:
        print("ERROR: BSD_TOKEN nu este setat.", file=sys.stderr)
        sys.exit(1)


def get_upcoming_event_ids():
    """Citește predictions.json și returnează event_id-urile notstarted pentru azi."""
    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("WARN: predictions.json lipsește — nu pot determina evenimentele de azi")
        return []

    try:
        predictions = json.load(open(pred_path, encoding="utf-8"))
    except Exception as e:
        print(f"ERROR: Nu pot citi predictions.json: {e}")
        return []

    now_utc = datetime.now(timezone.utc)
    today   = now_utc.date()
    tomorrow = today + timedelta(days=1)

    event_ids = []
    seen = set()
    for pred in predictions:
        ev = pred.get("event") or {}
        if ev.get("status") not in ("notstarted", "not_started", "upcoming"):
            continue
        event_id = ev.get("id")
        if not event_id or event_id in seen:
            continue

        # Filtrăm meciurile din ziua curentă și cea imediat următoare
        ev_date_str = ev.get("event_date") or ev.get("starting_at") or ev.get("date") or ""
        try:
            ev_date = datetime.fromisoformat(ev_date_str.replace("Z", "+00:00")).date()
            if ev_date > tomorrow:
                continue
        except Exception:
            pass  # dacă nu putem parsă data, includem oricum

        seen.add(event_id)
        event_ids.append(int(event_id))

    print(f"Găsite {len(event_ids)} evenimente notstarted pentru azi/mâine")
    return event_ids


def fetch_lineup(event_id):
    """Fetch lineup pentru un eveniment. Returnează dict sau None."""
    try:
        r = requests.get(
            f"{V2_BASE}/events/{event_id}/lineups/",
            headers=HEADERS,
            timeout=20
        )
        if r.status_code == 404:
            return {"status": "unavailable", "event_id": event_id}
        if r.status_code == 200:
            return r.json()
        return None
    except Exception as e:
        print(f"  [err] event {event_id}: {e}")
        return None


def normalize_lineup(event_id, raw):
    """
    Normalizează răspunsul API conform documentației BSD v2:
    {
      "lineup_status": "predicted" | "confirmed" | "unavailable",
      "lineups": {
        "home": { "formation": "4-3-3", "confidence": 0.74, "players": [...], "substitutes": [...] },
        "away": { ... }
      },
      "unavailable_players": {
        "home": [{ "id", "name", "status", "reason" }],
        "away": [...]
      }
    }
    """
    if not raw or not isinstance(raw, dict):
        return {"status": "unavailable", "event_id": event_id}

    status = raw.get("lineup_status") or raw.get("status") or "unavailable"

    if status == "unavailable" or raw.get("lineups") is None:
        return {
            "event_id":         event_id,
            "status":           "unavailable",
            "home_formation":   None,
            "away_formation":   None,
            "home_confidence":  None,
            "away_confidence":  None,
            "home_starters":    [],
            "away_starters":    [],
            "home_unavailable": [],
            "away_unavailable": [],
            "n_injured_home":   0,
            "n_injured_away":   0,
            "n_unavail_home":   0,
            "n_unavail_away":   0,
            "fetched_at":       datetime.now(timezone.utc).isoformat(),
        }

    # Structura confirmată din docs: raw["lineups"]["home"] și raw["lineups"]["away"]
    lineups_block = raw.get("lineups") or {}
    home_block = lineups_block.get("home") or {}
    away_block = lineups_block.get("away") or {}

    # unavailable_players e la top-level, nu în home/away block
    unavail_block = raw.get("unavailable_players") or {}
    home_unavail_raw = unavail_block.get("home") or []
    away_unavail_raw = unavail_block.get("away") or []

    def parse_players(players_list):
        """Parsează lista de jucători din docs: id, name, position, jersey_number, ai_score"""
        result = []
        for p in (players_list if isinstance(players_list, list) else []):
            if not isinstance(p, dict):
                continue
            result.append({
                "id":       p.get("id"),
                "name":     p.get("name") or p.get("short_name") or "",
                "position": p.get("position") or "",
                "shirt":    p.get("jersey_number") or p.get("shirt_number"),
                "ai_score": p.get("ai_score"),
            })
        return result

    def parse_unavailable(unavail_list):
        """Parsează lista de jucători lipsă din docs: id, name, status, reason"""
        result = []
        for p in (unavail_list if isinstance(unavail_list, list) else []):
            if not isinstance(p, dict):
                continue
            result.append({
                "id":     p.get("id"),
                "name":   p.get("name") or p.get("short_name") or "",
                "status": p.get("status") or "unknown",  # injured/suspended/doubtful
                "reason": p.get("reason") or "",
            })
        return result

    def count_missing(unavail_list):
        return sum(
            1 for p in unavail_list
            if p.get("status") in ("injured", "suspended", "out", "injury", "red_card")
        )

    home_starters = parse_players(home_block.get("players") or [])
    away_starters = parse_players(away_block.get("players") or [])
    home_unavail = parse_unavailable(home_unavail_raw)
    away_unavail = parse_unavailable(away_unavail_raw)

    return {
        "event_id":         event_id,
        "status":           status,
        "home_formation":   home_block.get("formation"),
        "away_formation":   away_block.get("formation"),
        "home_confidence":  round(float(home_block["confidence"]), 4) if home_block.get("confidence") is not None else None,
        "away_confidence":  round(float(away_block["confidence"]), 4) if away_block.get("confidence") is not None else None,
        "home_starters":    home_starters,
        "away_starters":    away_starters,
        "home_unavailable": home_unavail,
        "away_unavailable": away_unavail,
        "n_injured_home":   count_missing(home_unavail),
        "n_injured_away":   count_missing(away_unavail),
        "n_unavail_home":   len(home_unavail),
        "n_unavail_away":   len(away_unavail),
        "fetched_at":       datetime.now(timezone.utc).isoformat(),
    }


def save_lineups(lineups_dict):
    DATA_DIR.mkdir(exist_ok=True)
    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count":      len(lineups_dict),
        "lineups":    lineups_dict,
    }
    tmp = OUT_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(OUT_PATH)
    print(f"Salvat: {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes, {len(lineups_dict)} lineup-uri)")


def main():
    ensure_token()
    print(f"=== fetch_lineups_today.py | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} ===")

    event_ids = get_upcoming_event_ids()
    if not event_ids:
        print("Nu există evenimente de fetchat. Exit.")
        # Salvăm un JSON gol pentru a nu rupe pipeline-ul
        save_lineups({})
        return

    # Încărcăm cache existent (dacă există) — actualizăm only
    existing = {}
    if OUT_PATH.exists():
        try:
            cached = json.load(open(OUT_PATH, encoding="utf-8"))
            existing = cached.get("lineups") or {}
        except Exception:
            pass

    lineups = dict(existing)
    confirmed_count = 0
    predicted_count = 0
    unavail_count = 0

    for i, event_id in enumerate(event_ids):
        raw = fetch_lineup(event_id)
        if raw is None:
            continue

        normalized = normalize_lineup(event_id, raw)
        lineups[str(event_id)] = normalized

        status = normalized.get("status", "")
        if status == "confirmed":
            confirmed_count += 1
        elif status == "predicted":
            predicted_count += 1
        else:
            unavail_count += 1

        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(event_ids)} — confirmed:{confirmed_count} predicted:{predicted_count} n/a:{unavail_count}")

        time.sleep(DELAY)

    print(f"\nRezultat: {confirmed_count} confirmed, {predicted_count} predicted, {unavail_count} unavailable")

    # Stats jucători lipsă
    with_missing = [v for v in lineups.values() if v.get("n_unavail_home", 0) + v.get("n_unavail_away", 0) > 0]
    print(f"Meciuri cu jucători lipsă: {len(with_missing)}")
    if with_missing:
        total_missing = sum(v.get("n_unavail_home", 0) + v.get("n_unavail_away", 0) for v in with_missing)
        print(f"Total jucători lipsă: {total_missing}")

    save_lineups(lineups)
    print("Done.")


if __name__ == "__main__":
    main()
