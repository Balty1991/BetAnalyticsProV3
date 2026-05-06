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
API_BASE      = "https://sports.bzzoiro.com/api"
V2_BASE       = "https://sports.bzzoiro.com/api/v2"
TOKEN         = os.environ.get("BSD_TOKEN", "")
DELAY         = float(os.environ.get("DELAY_MS", "200")) / 1000
MAX_EVENTS    = int(os.environ.get("MAX_EVENTS", "100"))
OUT_PATH      = os.environ.get("OUTPUT_PATH", "data/enriched.json")
# V2_ENRICHMENT=false dezactivează fetch-urile v2 (util la debug)
V2_ENRICHMENT = os.environ.get("V2_ENRICHMENT", "true").lower() != "false"

HEADERS     = {"Authorization": f"Token {TOKEN}"}
SESSION     = requests.Session()
SESSION.headers.update(HEADERS)

# Cache in-memory pentru manager stats (aceeași echipă apare în multiple meciuri)
_MGR_CACHE: dict = {}

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


# ─── V2 Fetch helpers ─────────────────────────────────────────

def fetch_referee_v2(referee_id: int) -> dict | None:
    """Fetch statistici per-meci arbitru din v2 (avg_goals, avg_yellow, avg_fouls)."""
    if not referee_id or not V2_ENRICHMENT:
        return None
    data = get(f"{V2_BASE}/referees/{referee_id}/")
    if not data:
        return None
    return {
        "avg_goals_per_match":  data.get("avg_goals_per_match"),
        "avg_yellow_per_match": data.get("avg_yellow_per_match"),
        "avg_red_per_match":    data.get("avg_red_per_match"),
        "avg_fouls_per_match":  data.get("avg_fouls_per_match"),
        "matches":              data.get("matches"),
    }


def fetch_manager_v2(team_id: int) -> dict | None:
    """Fetch statistici antrenor curent din v2 (over25%, btts%, cs%, possession)."""
    if not team_id or not V2_ENRICHMENT:
        return None
    key = int(team_id)
    if key in _MGR_CACHE:
        return _MGR_CACHE[key]
    data = get(f"{V2_BASE}/managers/?team_id={team_id}&limit=1")
    results = (data or {}).get("results") or []
    if not results:
        _MGR_CACHE[key] = None
        return None
    mgr = results[0]
    result = {
        "over25_pct":      mgr.get("over_25_pct"),
        "btts_pct":        mgr.get("btts_pct"),
        "clean_sheet_pct": mgr.get("clean_sheet_pct"),
        "avg_possession":  mgr.get("avg_possession"),
        "win_pct":         mgr.get("win_pct"),
        "matches_total":   mgr.get("matches_total"),
    }
    _MGR_CACHE[key] = result
    return result


def fetch_event_context_v2(event_id: int) -> dict | None:
    """Fetch context meci din v2: derby, teren neutru, vreme, teren, deplasare."""
    if not event_id or not V2_ENRICHMENT:
        return None
    data = get(f"{V2_BASE}/events/{event_id}/")
    if not data:
        return None
    weather = data.get("weather") or {}
    return {
        "is_local_derby":     bool(data.get("is_local_derby") or False),
        "is_neutral_ground":  bool(data.get("is_neutral_ground") or False),
        "travel_distance_km": data.get("travel_distance_km"),
        "weather_code":       weather.get("code"),
        "weather_desc":       weather.get("description"),
        "pitch_condition":    data.get("pitch_condition"),
        "attendance":         data.get("attendance"),
    }


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

    def slim_coach(coach, mgr_v2=None):
        """Păstrează profilul tactic al antrenorului + stats v2 dacă sunt disponibile."""
        if not coach:
            return None
        keep = [
            "id", "name", "short_name",
            "pressing_intensity", "defensive_line",
            "top_styles", "preferred_formation"
        ]
        result = {k: coach[k] for k in keep if k in coach}
        # Adaugă statistici reale din v2 (over25%, btts%, cs%, possession)
        if mgr_v2:
            result["over25_pct"]      = mgr_v2.get("over25_pct")
            result["btts_pct"]        = mgr_v2.get("btts_pct")
            result["clean_sheet_pct"] = mgr_v2.get("clean_sheet_pct")
            result["avg_possession"]  = mgr_v2.get("avg_possession")
            result["win_pct"]         = mgr_v2.get("win_pct")
        return result

    def slim_referee(referee, ref_v2=None):
        """Arbitru cu stats per-meci din v2."""
        if not referee:
            return None
        result = {k: referee.get(k) for k in
                  ["id", "name", "country", "nationality_a3", "birthdate",
                   "yellowCards", "redCards", "career_games",
                   "career_yellow_cards", "career_red_cards"]
                  if k in referee}
        # Adaugă statistici per-meci din v2 (activează calcRefFactor)
        if ref_v2:
            result["avg_goals_per_match"]  = ref_v2.get("avg_goals_per_match")
            result["avg_yellow_per_match"] = ref_v2.get("avg_yellow_per_match")
            result["avg_red_per_match"]    = ref_v2.get("avg_red_per_match")
            result["avg_fouls_per_match"]  = ref_v2.get("avg_fouls_per_match")
            result["matches"]              = ref_v2.get("matches")
        return result

    return {
        "home_form":           slim_form(detail.get("home_form")),
        "away_form":           slim_form(detail.get("away_form")),
        "head_to_head":        slim_h2h(detail.get("head_to_head")),
        "home_coach":          slim_coach(detail.get("home_coach"), mgr_v2=detail.get("_home_mgr_v2")),
        "away_coach":          slim_coach(detail.get("away_coach"), mgr_v2=detail.get("_away_mgr_v2")),
        "unavailable_players": detail.get("unavailable_players"),
        "referee":             slim_referee(detail.get("referee"), ref_v2=detail.get("_ref_v2")),
        "match_context":       detail.get("_context_v2"),   # derby/vreme/deplasare/teren
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
            # ── V2 enrichment (non-blocking — erorile nu opresc procesarea) ──
            if V2_ENRICHMENT:
                # Arbitru: stats per-meci (avg_goals, avg_yellow)
                ref_id = (detail.get("referee") or {}).get("id")
                ref_v2 = None
                if ref_id:
                    time.sleep(DELAY * 0.5)
                    ref_v2 = fetch_referee_v2(ref_id)

                # Antrenori: stats reale (over25%, btts%, cs%)
                home_obj = event.get("home_team_obj") or {}
                away_obj = event.get("away_team_obj") or {}
                home_tid = home_obj.get("api_id") or home_obj.get("id")
                away_tid = away_obj.get("api_id") or away_obj.get("id")
                home_mgr_v2 = None
                away_mgr_v2 = None
                if home_tid:
                    time.sleep(DELAY * 0.5)
                    home_mgr_v2 = fetch_manager_v2(home_tid)
                if away_tid:
                    time.sleep(DELAY * 0.5)
                    away_mgr_v2 = fetch_manager_v2(away_tid)

                # Context meci: derby, vreme, deplasare, teren
                time.sleep(DELAY * 0.5)
                context_v2 = fetch_event_context_v2(event_id)

                # Injectăm datele v2 în detail ca câmpuri private
                detail["_ref_v2"]       = ref_v2
                detail["_home_mgr_v2"]  = home_mgr_v2
                detail["_away_mgr_v2"]  = away_mgr_v2
                detail["_context_v2"]   = context_v2

            ml5_data = extract_ml5_fields(detail)
            if ml5_data:
                enriched[str(event_id)] = ml5_data
                # Log formă dacă e disponibilă
                hf  = ml5_data.get("home_form") or {}
                af  = ml5_data.get("away_form") or {}
                hfs = hf.get("form_string", "")[-5:] if hf else ""
                afs = af.get("form_string", "")[-5:] if af else ""
                h2h = ml5_data.get("head_to_head") or {}
                h2hn = h2h.get("total_matches", 0)
                ctx = ml5_data.get("match_context") or {}
                ctx_tag = ""
                if ctx.get("is_local_derby"):     ctx_tag += " 🔥derby"
                if ctx.get("weather_code") == 3:  ctx_tag += " 🌧ploaie"
                if ctx.get("weather_code") == 4:  ctx_tag += " ❄ninsoare"
                td = ctx.get("travel_distance_km")
                if td and td > 2000:              ctx_tag += f" ✈{td}km"
                print(f"  [{i+1:3d}] ✓ {home} vs {away}  |  form: {hfs}/{afs}  |  H2H: {h2hn}m{ctx_tag}")
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
