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
    Normalizează răspunsul API într-un dict consistent.
    Gestionează atât lineup confirmed cât și predicted.
    """
    if not raw or not isinstance(raw, dict):
        return {"status": "unavailable", "event_id": event_id}

    status = raw.get("status") or "predicted"

    home = raw.get("home_team") or raw.get("home") or {}
    away = raw.get("away_team") or raw.get("away") or {}

    def parse_team(team_data):
        if not isinstance(team_data, dict):
            return {"formation": None, "confidence": None, "starters": [], "unavailable": []}

        formation   = team_data.get("formation") or team_data.get("preferred_formation")
        confidence  = team_data.get("confidence") or team_data.get("ai_confidence")

        # Starters
        lineup_raw  = team_data.get("lineup") or team_data.get("starters") or []
        starters = []
        for p in lineup_raw if isinstance(lineup_raw, list) else []:
            if not isinstance(p, dict):
                continue
            # Acceptăm ambele formate: is_starter flag sau simplu listă
            if not p.get("is_starter", True):
                continue
            starters.append({
                "id":           p.get("player_id") or p.get("id"),
                "name":         p.get("player_name") or p.get("name") or "",
                "position":     p.get("position") or "",
                "shirt":        p.get("shirt_number") or p.get("number"),
                "ai_score":     p.get("ai_score") or p.get("rating"),
            })

        # Unavailable
        unavail_raw = team_data.get("unavailable_players") or team_data.get("unavailable") or []
        unavailable = []
        for p in unavail_raw if isinstance(unavail_raw, list) else []:
            if not isinstance(p, dict):
                continue
            unavailable.append({
                "id":          p.get("player_id") or p.get("id"),
                "name":        p.get("player_name") or p.get("name") or "",
                "status":      p.get("status") or "unknown",   # injured/suspended/doubtful
                "return_date": p.get("return_date") or p.get("expected_return"),
            })

        return {
            "formation":   formation,
            "confidence":  round(float(confidence), 3) if confidence else None,
            "starters":    starters,
            "unavailable": unavailable,
        }

    home_data = parse_team(home)
    away_data = parse_team(away)

    # Număr jucători lipsă (injured + suspended, nu doubtful)
    def count_missing(unavail_list):
        return sum(
            1 for p in unavail_list
            if p.get("status") in ("injured", "suspended", "out", "injury", "red_card")
        )

    return {
        "event_id":         event_id,
        "status":           status,
        "home_formation":   home_data["formation"],
        "away_formation":   away_data["formation"],
        "home_confidence":  home_data["confidence"],
        "away_confidence":  away_data["confidence"],
        "home_starters":    home_data["starters"],
        "away_starters":    away_data["starters"],
        "home_unavailable": home_data["unavailable"],
        "away_unavailable": away_data["unavailable"],
        "n_injured_home":   count_missing(home_data["unavailable"]),
        "n_injured_away":   count_missing(away_data["unavailable"]),
        "n_unavail_home":   len(home_data["unavailable"]),
        "n_unavail_away":   len(away_data["unavailable"]),
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
