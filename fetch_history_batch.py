#!/usr/bin/env python3
"""
fetch_history_batch.py — SmartBet Fusion v2 | Layer 1: Data Warehouse
======================================================================
Extrage TOT istoricul disponibil din Bzzoiro API (~849 sezoane, 46k+ meciuri).

Strategii de rulare:
  --mode full       → Extrage TOT de la zero (prima rulare, durează ~2-4h)
  --mode season ID  → Extrage un sezon specific
  --mode incremental → Numai sezoanele din ultimele 90 de zile (zilnic/săptămânal)

Output:
  data/warehouse/events_season_{ID}.json   → meciuri per sezon
  data/warehouse/index.json                → catalog sezoane + status fetch
  data/warehouse/summary.json             → statistici globale

Variabile de mediu:
  BSD_TOKEN    → obligatoriu
  DELAY_MS     → delay între request-uri în ms (default: 300)
  MAX_WORKERS  → thread pool pentru fetch paralel (default: 3)

Rulare:
  BSD_TOKEN=xxx python3 fetch_history_batch.py --mode full
  BSD_TOKEN=xxx python3 fetch_history_batch.py --mode incremental
"""

import os, json, time, sys, argparse, math
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# ─── Config ────────────────────────────────────────────────────────────────
API_BASE     = "https://sports.bzzoiro.com"
TOKEN        = os.environ.get("BSD_TOKEN", "").strip()
DELAY        = float(os.environ.get("DELAY_MS", "300")) / 1000.0
MAX_WORKERS  = int(os.environ.get("MAX_WORKERS", "3"))
WAREHOUSE    = Path("data/warehouse")
DATA_DIR     = Path("data")
PAGE_SIZE    = 200

FINAL_STATUSES = {
    "finished","ft","full_time","fulltime","full-time",
    "completed","complete","closed","ended","final",
    "aet","after_extra_time","after_extra","penalties","penalty_shootout",
}

FIELDS_KEEP = {
    "id","date","event_date","starting_at","status",
    "league_id","league","season_id","season",
    "home_team_id","away_team_id",
    "home_team","away_team","home_team_obj","away_team_obj",
    "home_score","away_score","home_halftime_score","away_halftime_score",
    # xG / ML probs din Bzzoiro
    "home_xg","away_xg","xg_home","xg_away",
    "prob_home_win","prob_draw","prob_away_win",
    "prob_over_15","prob_over_25","prob_over_35",
    "prob_btts_yes","prob_btts_no",
    # cote
    "odds_home","odds_draw","odds_away",
    "odds_over_15","odds_under_15",
    "odds_over_25","odds_under_25",
    "odds_over_35","odds_under_35",
    "odds_btts_yes","odds_btts_no",
    # misc
    "most_likely_score","favorite_recommend","referee_id","referee",
    "home_form","away_form","head_to_head","h2h",
    "home_coach","away_coach","unavailable_players",
}

# ─── HTTP Session ───────────────────────────────────────────────────────────
SESSION = requests.Session()
SESSION.headers.update({"Authorization": f"Token {TOKEN}"})


def ensure_token():
    if not TOKEN:
        print("ERROR: BSD_TOKEN nu este setat.", file=sys.stderr)
        sys.exit(1)


def get(url, params=None, retries=3, backoff=2.0):
    """GET cu retry exponential + rate-limit handling."""
    for attempt in range(retries):
        try:
            r = SESSION.get(url, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                wait = backoff * (2 ** attempt)
                print(f"  [rate-limit] aştept {wait:.0f}s...")
                time.sleep(wait)
                continue
            if r.status_code in (500, 502, 503):
                time.sleep(backoff)
                continue
            print(f"  [HTTP {r.status_code}] {url}")
            return None
        except requests.RequestException as exc:
            print(f"  [err attempt {attempt+1}] {exc}")
            time.sleep(backoff)
    return None


def get_paginated(endpoint, params=None, max_pages=500):
    """Fetch toate paginile unui endpoint cu cursor next."""
    results = []
    url     = f"{API_BASE}{endpoint}"
    pg      = 1
    while url and pg <= max_pages:
        p = {**(params or {}), "limit": PAGE_SIZE}
        if pg > 1:
            p["page"] = pg
        data = get(url, params=p if pg == 1 else None)
        if data is None:
            break
        if isinstance(data, list):
            results.extend(data)
            break
        batch = data.get("results", [])
        results.extend(batch)
        nxt = data.get("next")
        if nxt:
            url = nxt.replace("http://", "https://", 1)
            pg += 1
            time.sleep(DELAY)
        else:
            break
    return results


# ─── Normalizare ────────────────────────────────────────────────────────────
def _pick_date(ev):
    for k in ("event_date","date","starting_at","start_time","datetime","kickoff"):
        v = ev.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, dict):
            for nk in ("date_time","datetime","iso","value","utc"):
                nv = v.get(nk)
                if isinstance(nv, str) and nv.strip():
                    return nv.strip()
    t = ev.get("time")
    if isinstance(t, dict):
        s = t.get("starting_at") or t.get("start")
        if isinstance(s, str): return s.strip()
        if isinstance(s, dict):
            for nk in ("date_time","datetime","iso","utc"):
                nv = s.get(nk)
                if isinstance(nv, str): return nv.strip()
    return None


def _team_name(ev, side):
    obj = ev.get(f"{side}_team_obj") or {}
    if isinstance(obj, dict) and obj.get("name"):
        return obj["name"]
    return ev.get(f"{side}_team") or ev.get(f"{side}_team_name") or ""


def _team_id(ev, side):
    obj = ev.get(f"{side}_team_obj") or {}
    if isinstance(obj, dict) and obj.get("id"):
        return obj["id"]
    return ev.get(f"{side}_team_id")


def _score(ev, side):
    v = ev.get(f"{side}_score")
    try: return int(v)
    except Exception: return None


def _float(ev, key, alt_keys=()):
    for k in (key, *alt_keys):
        v = ev.get(k)
        if v is not None:
            try: return float(v)
            except Exception: pass
    return None


def _is_finished(ev):
    status = str(ev.get("status") or "").strip().lower()
    return status in FINAL_STATUSES


def normalize_event(ev, season_id, season_meta):
    """Normalizează un event raw → rând curat pentru warehouse."""
    if not isinstance(ev, dict):
        return None
    if not _is_finished(ev):
        return None
    home_score = _score(ev, "home")
    away_score = _score(ev, "away")
    if home_score is None or away_score is None:
        return None
    event_id = ev.get("id")
    if not event_id:
        return None

    total_goals  = home_score + away_score
    home_win     = 1 if home_score > away_score else 0
    draw         = 1 if home_score == away_score else 0
    away_win     = 1 if home_score < away_score else 0
    btts_yes     = 1 if home_score >= 1 and away_score >= 1 else 0
    over_15      = 1 if total_goals >= 2 else 0
    over_25      = 1 if total_goals >= 3 else 0
    over_35      = 1 if total_goals >= 4 else 0
    under_35     = 1 if total_goals <= 3 else 0

    result_1x2   = "1" if home_win else ("X" if draw else "2")

    # xG (multiple key variants din Bzzoiro)
    xg_home = _float(ev, "home_xg", ("xg_home", "home_expected_goals"))
    xg_away = _float(ev, "away_xg", ("xg_away", "away_expected_goals"))

    league_id  = ev.get("league_id") or (season_meta or {}).get("league_id")
    _lg_raw    = ev.get("league") or (season_meta or {}).get("league") or ""
    if isinstance(_lg_raw, dict):
        league = _lg_raw.get("name") or _lg_raw.get("short_code") or str(_lg_raw.get("id",""))
    else:
        league = str(_lg_raw) if _lg_raw else ""

    row = {
        "event_id":    int(event_id),
        "date":        _pick_date(ev) or "",
        "season_id":   season_id,
        "season_name": (season_meta or {}).get("name", ""),
        "season_year": (season_meta or {}).get("year"),
        "league_id":   league_id,
        "league":      league,
        "home_team_id": _team_id(ev, "home"),
        "away_team_id": _team_id(ev, "away"),
        "home_team":   _team_name(ev, "home"),
        "away_team":   _team_name(ev, "away"),
        "home_score":  home_score,
        "away_score":  away_score,
        "total_goals": total_goals,
        "result_1x2":  result_1x2,
        "home_win":    home_win,
        "draw":        draw,
        "away_win":    away_win,
        "btts_yes":    btts_yes,
        "over_15":     over_15,
        "over_25":     over_25,
        "over_35":     over_35,
        "under_35":    under_35,
        # xG
        "xg_home":     xg_home,
        "xg_away":     xg_away,
        # ML probs API
        "api_prob_home_win": _float(ev, "prob_home_win"),
        "api_prob_draw":     _float(ev, "prob_draw"),
        "api_prob_away_win": _float(ev, "prob_away_win"),
        "api_prob_over_15":  _float(ev, "prob_over_15"),
        "api_prob_over_25":  _float(ev, "prob_over_25"),
        "api_prob_over_35":  _float(ev, "prob_over_35"),
        "api_prob_btts_yes": _float(ev, "prob_btts_yes"),
        # cote
        "odds_home":    _float(ev, "odds_home"),
        "odds_draw":    _float(ev, "odds_draw"),
        "odds_away":    _float(ev, "odds_away"),
        "odds_over_15": _float(ev, "odds_over_15"),
        "odds_under_15":_float(ev, "odds_under_15"),
        "odds_over_25": _float(ev, "odds_over_25"),
        "odds_under_25":_float(ev, "odds_under_25"),
        "odds_over_35": _float(ev, "odds_over_35"),
        "odds_under_35":_float(ev, "odds_under_35"),
        "odds_btts_yes":_float(ev, "odds_btts_yes"),
        "odds_btts_no": _float(ev, "odds_btts_no"),
        # misc
        "most_likely_score":  ev.get("most_likely_score"),
        "favorite_recommend": ev.get("favorite_recommend"),
        "referee_id":         ev.get("referee_id"),
        # BSD model confidence (0-100, scala v1) — feature ML important
        "api_confidence":     _float(ev, "confidence"),
    }
    return row


# ─── Fetch sezon ─────────────────────────────────────────────────────────────
def fetch_season(season_meta):
    """Fetch toate meciurile unui sezon. Returnează lista de rânduri normalizate."""
    sid  = season_meta.get("id")
    name = season_meta.get("name", f"season_{sid}")
    events_raw = get_paginated(
        "/api/events/",
        params={"season": sid, "status": "finished", "limit": PAGE_SIZE}
    )
    rows = []
    for ev in events_raw:
        row = normalize_event(ev, sid, season_meta)
        if row:
            rows.append(row)
    return sid, name, rows


def save_season(sid, rows):
    """Salvează meciurile unui sezon în data/warehouse/."""
    WAREHOUSE.mkdir(parents=True, exist_ok=True)
    path = WAREHOUSE / f"events_season_{sid}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    return path


def load_index():
    path = WAREHOUSE / "index.json"
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_index(index):
    WAREHOUSE.mkdir(parents=True, exist_ok=True)
    path = WAREHOUSE / "index.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def save_summary(index):
    """Compilează statistici globale din index."""
    entries    = list(index.values())
    fetched    = [e for e in entries if e.get("status") == "ok"]
    total_rows = sum(e.get("events_count", 0) for e in fetched)
    years      = [e.get("year") for e in fetched if e.get("year")]
    leagues    = set(e.get("league", "") for e in fetched if e.get("league"))

    # statistici per ligă
    per_league = {}
    for e in fetched:
        lg = e.get("league", "Unknown")
        per_league.setdefault(lg, {"seasons": 0, "events": 0})
        per_league[lg]["seasons"] += 1
        per_league[lg]["events"]  += e.get("events_count", 0)

    per_league_list = sorted(
        [{"league": k, **v} for k, v in per_league.items()],
        key=lambda x: x["events"], reverse=True
    )

    summary = {
        "updated_at":        datetime.now(timezone.utc).isoformat(),
        "seasons_total":     len(entries),
        "seasons_fetched":   len(fetched),
        "seasons_failed":    len(entries) - len(fetched),
        "events_total":      total_rows,
        "leagues_total":     len(leagues),
        "year_min":          min(years) if years else None,
        "year_max":          max(years) if years else None,
        "per_league":        per_league_list[:40],
    }
    with open(WAREHOUSE / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    return summary


# ─── Moduri de rulare ─────────────────────────────────────────────────────────
def run_full():
    """Extrage toate sezoanele. Prima rulare, 2-4h."""
    print("=== FULL BATCH FETCH ===")
    seasons = get_paginated("/api/seasons/")
    if not seasons:
        print("ERROR: Nu s-au putut obţine sezoanele.")
        sys.exit(1)
    print(f"Sezoane disponibile: {len(seasons)}")

    index   = load_index()
    pending = []
    for s in seasons:
        sid  = s.get("id")
        year = None
        try: year = int(s.get("year") or 0)
        except Exception: pass
        # Skip sezoane prea vechi (< 2000) - nu au date utile
        if year and year < 2000:
            continue
        key = str(sid)
        if key in index and index[key].get("status") == "ok":
            continue   # deja fetched
        pending.append(s)

    print(f"De fetched: {len(pending)} sezoane (skip {len(seasons)-len(pending)} deja ok)")

    for i, s in enumerate(pending):
        sid, name, rows = fetch_season(s)
        print(f"  [{i+1}/{len(pending)}] {name}: {len(rows)} meciuri")
        save_season(sid, rows)
        index[str(sid)] = {
            "season_id":    sid,
            "name":         name,
            "league":       s.get("league"),
            "league_id":    s.get("league_id"),
            "year":         s.get("year"),
            "events_count": len(rows),
            "status":       "ok" if rows else "empty",
            "fetched_at":   datetime.now(timezone.utc).isoformat(),
        }
        save_index(index)
        time.sleep(DELAY)

    summary = save_summary(index)
    print(f"\n=== DONE: {summary['events_total']} meciuri din {summary['seasons_fetched']} sezoane ===")


def run_incremental():
    """Numai sezoanele active + ultimele 90 de zile."""
    print("=== INCREMENTAL FETCH ===")
    seasons = get_paginated("/api/seasons/")
    if not seasons:
        print("ERROR: Nu s-au putut obţine sezoanele.")
        sys.exit(1)

    now  = datetime.now(timezone.utc)
    cutoff_year = now.year - 1

    # Filtrăm: sezoane curente sau din ultimul an
    pending = []
    for s in seasons:
        year = None
        try: year = int(s.get("year") or 0)
        except Exception: pass
        is_current = bool(s.get("is_current"))
        if is_current or (year and year >= cutoff_year):
            pending.append(s)

    index = load_index()
    print(f"Sezoane de actualizat: {len(pending)}")

    for i, s in enumerate(pending):
        sid, name, rows = fetch_season(s)
        print(f"  [{i+1}/{len(pending)}] {name}: {len(rows)} meciuri")
        save_season(sid, rows)
        index[str(sid)] = {
            "season_id":    sid,
            "name":         name,
            "league":       s.get("league"),
            "league_id":    s.get("league_id"),
            "year":         s.get("year"),
            "events_count": len(rows),
            "status":       "ok",
            "fetched_at":   datetime.now(timezone.utc).isoformat(),
        }
        save_index(index)
        time.sleep(DELAY)

    summary = save_summary(index)
    print(f"=== DONE incremental: {summary['events_total']} total meciuri ===")


def run_single_season(season_id):
    sid  = int(season_id)
    data = get(f"{API_BASE}/api/seasons/{sid}/")
    meta = data or {"id": sid}
    _, name, rows = fetch_season(meta)
    print(f"{name}: {len(rows)} meciuri")
    save_season(sid, rows)
    index = load_index()
    index[str(sid)] = {
        "season_id": sid, "name": name, "events_count": len(rows),
        "status": "ok", "fetched_at": datetime.now(timezone.utc).isoformat()
    }
    save_index(index)
    save_summary(index)


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    ensure_token()
    parser = argparse.ArgumentParser(description="SmartBet v2 - Historical Data Fetcher")
    parser.add_argument("--mode", default="incremental",
                        choices=["full", "incremental", "season"],
                        help="Mod de rulare: full / incremental / season")
    parser.add_argument("--season-id", type=int, default=None,
                        help="ID sezon pentru modul 'season'")
    args = parser.parse_args()

    if args.mode == "full":
        run_full()
    elif args.mode == "season":
        if not args.season_id:
            print("ERROR: --season-id necesar pentru modul 'season'")
            sys.exit(1)
        run_single_season(args.season_id)
    else:
        run_incremental()


if __name__ == "__main__":
    main()
