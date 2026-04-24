#!/usr/bin/env python3
"""
fetch_enriched.py — Pre-fetches event detail data for ML5 engine
================================================================
Rulat de GitHub Actions (sau manual) după fetch_data.py.

Citește predicțiile din /api/predictions/, fetch-uiește detalii
per meci din /api/events/{id}/ și salvează datele esențiale în:
  data/enriched.json

Datele includ (per meci):
  - home_form / away_form   (formă recentă, xG, PPG, clean sheets)
  - head_to_head            (H2H stats: win rates, avg goals)
  - home_coach / away_coach (tactical profile: pressing, styles)
  - unavailable_players     (accidentați, suspendați, dubioși)
  - referee                 (arbitrul meciului)

Utilizare:
  BSD_TOKEN=xxx python3 fetch_enriched.py

Variabile de mediu:
  BSD_TOKEN   — token-ul API BSD (obligatoriu)
  DELAY_MS    — delay între request-uri în ms (default: 200)
  MAX_EVENTS  — număr maxim de meciuri de enrichat (default: 100)
  OUTPUT_PATH — calea fișierului de ieșire (default: data/enriched.json)
"""

import os
import json
import time
import sys
import requests
from datetime import datetime, timedelta

# ─── Config ───────────────────────────────────────────────────
API_BASE    = "https://sports.bzzoiro.com/api"
TOKEN       = os.environ.get("BSD_TOKEN", "")
DELAY       = float(os.environ.get("DELAY_MS", "200")) / 1000
MAX_EVENTS  = int(os.environ.get("MAX_EVENTS", "100"))
OUT_PATH    = os.environ.get("OUTPUT_PATH", "data/enriched.json")

HEADERS     = {"Authorization": f"Token {TOKEN}"}
SESSION     = requests.Session()
SESSION.headers.update(HEADERS)

# ─── Helpers ──────────────────────────────────────────────────
def get(url, params=None, timeout=20):
    """GET cu retry simplu (max 2 încercări)."""
    for attempt in range(2):
        try:
            r = SESSION.get(url, params=params, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                print(f"  [rate-limit] aștept 5s...")
                time.sleep(5)
        except requests.RequestException as e:
            print(f"  [err] {e}")
            time.sleep(1)
    return None


# ─── Fetch predicții ──────────────────────────────────────────
def fetch_predictions():
    """Fetch predicții upcoming din /api/predictions/."""
    url = f"{API_BASE}/predictions/"
    # Obținem meciurile din next 7 zile
    today = datetime.utcnow().strftime("%Y-%m-%d")
    week  = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
    data  = get(url, params={
        "status": "notstarted",
        "date_from": today,
        "date_to": week,
        "limit": MAX_EVENTS
    })
    if not data:
        return []
    results = data.get("results", data) if isinstance(data, dict) else data
    return results if isinstance(results, list) else []


# ─── Extrage câmpurile ML5 dintr-un event detail ─────────────
def extract_ml5_fields(detail):
    """Extrage numai câmpurile necesare motorului ML5."""
    if not detail:
        return None

    def slim_form(form):
        """Păstrează câmpurile relevante din form object, omite restul."""
        if not form:
            return None
        keep = [
            "matches_played", "form_string", "wins", "draws", "losses",
            "goals_scored_last_n", "goals_conceded_last_n",
            "avg_xg", "avg_xg_conceded",
            "home_ppg", "away_ppg",
            "clean_sheets",
            "avg_shots_on_target", "avg_key_passes",
            "goal_conversion_rate", "defensive_efficiency"
        ]
        return {k: form[k] for k in keep if k in form}

    def slim_h2h(h2h):
        """Păstrează câmpurile H2H esențiale."""
        if not h2h:
            return None
        keep = [
            "total_matches", "home_wins", "draws", "away_wins",
            "home_goals", "away_goals", "avg_total_goals",
            "home_win_rate", "away_win_rate",
            "recent_matches"
        ]
        return {k: h2h[k] for k in keep if k in h2h}

    def slim_coach(coach):
        """Păstrează profilul tactic al antrenorului."""
        if not coach:
            return None
        keep = [
            "id", "name", "short_name",
            "pressing_intensity", "defensive_line",
            "top_styles", "preferred_formation"
        ]
        return {k: coach[k] for k in keep if k in coach}

    return {
        "home_form":           slim_form(detail.get("home_form")),
        "away_form":           slim_form(detail.get("away_form")),
        "head_to_head":        slim_h2h(detail.get("head_to_head")),
        "home_coach":          slim_coach(detail.get("home_coach")),
        "away_coach":          slim_coach(detail.get("away_coach")),
        "unavailable_players": detail.get("unavailable_players"),
        "referee":             detail.get("referee"),
    }


# ─── Main ─────────────────────────────────────────────────────
def main():
    if not TOKEN:
        print("ERROR: BSD_TOKEN nu este setat.")
        sys.exit(1)

    ts_start = time.time()
    print(f"[{datetime.utcnow().isoformat()}Z] fetch_enriched.py pornit")
    print(f"  API_BASE   : {API_BASE}")
    print(f"  MAX_EVENTS : {MAX_EVENTS}")
    print(f"  DELAY      : {DELAY*1000:.0f}ms")
    print(f"  OUTPUT     : {OUT_PATH}")

    # 1. Fetch predicții
    print("\n→ Fetch predicții...")
    preds = fetch_predictions()
    print(f"  {len(preds)} predicții găsite")

    if not preds:
        print("  Nicio predicție — scriem enriched.json gol.")
        result = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "count": 0,
            "errors": 0,
            "data": {}
        }
        os.makedirs(os.path.dirname(OUT_PATH) or ".", exist_ok=True)
        with open(OUT_PATH, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        return

    # 2. Fetch detalii per meci
    enriched = {}
    errors   = 0

    for i, pred in enumerate(preds[:MAX_EVENTS]):
        event    = pred.get("event", {})
        event_id = event.get("id")
        home     = event.get("home_team", "?")
        away     = event.get("away_team", "?")

        if not event_id:
            print(f"  [{i+1:3d}] skip — fără event.id")
            continue

        if i > 0:
            time.sleep(DELAY)

        url    = f"{API_BASE}/events/{event_id}/"
        detail = get(url)

        if detail:
            ml5_data = extract_ml5_fields(detail)
            if ml5_data:
                enriched[str(event_id)] = ml5_data
                # Log formă dacă e disponibilă
                hf = ml5_data.get("home_form") or {}
                af = ml5_data.get("away_form") or {}
                hfs = hf.get("form_string", "")[-5:] if hf else ""
                afs = af.get("form_string", "")[-5:] if af else ""
                h2h = ml5_data.get("head_to_head") or {}
                h2hn = h2h.get("total_matches", 0)
                print(f"  [{i+1:3d}] ✓ {home} vs {away}  |  form: {hfs}/{afs}  |  H2H: {h2hn}m")
            else:
                print(f"  [{i+1:3d}] ⚠ {home} vs {away}  — detail gol")
                errors += 1
        else:
            print(f"  [{i+1:3d}] ✗ {home} vs {away}  — fetch eșuat (id={event_id})")
            errors += 1

    # 3. Scrie output
    os.makedirs(os.path.dirname(OUT_PATH) or ".", exist_ok=True)
    result = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "duration_s":   round(time.time() - ts_start, 1),
        "count":        len(enriched),
        "errors":       errors,
        "coverage_pct": round(len(enriched) * 100 / max(1, len(preds)), 1),
        "data":         enriched
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\n✅ Done în {result['duration_s']}s")
    print(f"   {len(enriched)} enriched  |  {errors} erori  |  coverage {result['coverage_pct']}%")
    print(f"   → {OUT_PATH}")


if __name__ == "__main__":
    main()
