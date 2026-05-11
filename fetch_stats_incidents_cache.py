#!/usr/bin/env python3
"""
fetch_stats_incidents_cache.py — SmartBet Fusion v3 | Stats + Incidents Cache
==============================================================================
Fetchez /api/v2/events/{id}/stats/ și /api/v2/events/{id}/incidents/ pentru
meciurile istorice din warehouse, și le salvează într-un cache persistent.

Rulat o dată pe lună în ml_pipeline_full.yml (înainte de feature_engineering.py).
Incremental: fetchez doar event_id-urile care nu sunt în cache.

Output:
  data/stats_cache.json     → { event_id: { shots_home, shots_away, ... } }
  data/incidents_cache.json → { event_id: { goals: [...], cards: [...], ... } }
"""

import json, os, time, sys
from pathlib import Path
from typing import Optional, Dict, Any

DATA_DIR  = Path("data")
WAREHOUSE = DATA_DIR / "warehouse"
STATS_CACHE_PATH     = DATA_DIR / "stats_cache.json"
INCIDENTS_CACHE_PATH = DATA_DIR / "incidents_cache.json"

API_BASE = "https://sports.bzzoiro.com"
# Max apeluri per rulare (rate limit friendly)
MAX_FETCH_PER_RUN = int(os.environ.get("STATS_FETCH_LIMIT", "600"))
SLEEP_BETWEEN_CALLS = 0.35  # secunde


# ─── Auth ──────────────────────────────────────────────────────────────────────
def _get_token() -> str:
    token = os.environ.get("BSD_TOKEN", "")
    if not token:
        raise SystemExit("BSD_TOKEN lipsă din env")
    return token


# ─── HTTP ──────────────────────────────────────────────────────────────────────
def _get(url: str, token: str, retries: int = 3) -> Optional[Dict]:
    import urllib.request, urllib.error
    req = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return None
            if e.code == 429:
                time.sleep(10 * (attempt + 1))
            else:
                time.sleep(2 * (attempt + 1))
        except Exception as e:
            time.sleep(2 * (attempt + 1))
    return None


# ─── Normalize stats ───────────────────────────────────────────────────────────
def _unwrap_payload(raw):
    """Acceptă răspunsuri BSD v2 în forme diferite: {data:{...}}, {result:{...}}, list direct sau dict direct."""
    if isinstance(raw, dict):
        for key in ("data", "result", "payload"):
            val = raw.get(key)
            if isinstance(val, (dict, list)):
                return val
    return raw


def _num(value, default=0.0):
    try:
        if isinstance(value, dict):
            for key in ("actual", "value", "total", "pct", "percentage"):
                if value.get(key) is not None:
                    return float(value.get(key))
            return float(default)
        if value is None or value == "":
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _is_home_side(obj):
    if not isinstance(obj, dict):
        return False
    if obj.get("is_home") is not None:
        return bool(obj.get("is_home"))
    side = str(obj.get("side") or obj.get("team_side") or obj.get("home_away") or "").lower()
    if side in ("home", "h", "1"):
        return True
    if side in ("away", "a", "2"):
        return False
    team_obj = obj.get("team") if isinstance(obj.get("team"), dict) else {}
    side = str(team_obj.get("side") or team_obj.get("type") or "").lower()
    return side in ("home", "h", "1")


def _event_list_payload(raw, list_key):
    raw = _unwrap_payload(raw)
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        val = raw.get(list_key) or raw.get("items") or raw.get("results")
        if isinstance(val, list):
            return val
    return []


def _extract_ratio_val(obj, default=0):
    """Extrage valoarea dintr-un câmp ratio {value, total, pct} sau int."""
    if isinstance(obj, dict):
        return obj.get("value") or 0
    if isinstance(obj, (int, float)):
        return obj
    return default


def normalize_stats(raw: Dict, event_id: int) -> Optional[Dict]:
    """Normalizează răspunsul /events/{id}/stats/ → dict flat, tolerant la schema v2."""
    raw = _unwrap_payload(raw)
    if not raw or not isinstance(raw, dict):
        return None
    stats = raw.get("stats") or raw
    home  = stats.get("home") or stats.get("home_stats") or {}
    away  = stats.get("away") or stats.get("away_stats") or {}

    # Shotmap — calculăm shots on target din shotmap dacă există
    shotmap = raw.get("shotmap") or raw.get("shots") or []
    home_sot = sum(1 for s in shotmap if _is_home_side(s) and (s.get("on_target") or s.get("is_on_target") or s.get("outcome") == "on_target"))
    away_sot = sum(1 for s in shotmap if (not _is_home_side(s)) and (s.get("on_target") or s.get("is_on_target") or s.get("outcome") == "on_target"))
    home_shots_total = sum(1 for s in shotmap if _is_home_side(s))
    away_shots_total = sum(1 for s in shotmap if not _is_home_side(s))

    # xG per minut — calculăm stats derivate
    xg_pm = raw.get("xg_per_minute") or []
    if xg_pm:
        # xG acumulat la minuta 70 (% din total)
        home_xg_total = float(home.get("xg", {}).get("actual") or home.get("xg") or 0)
        away_xg_total = float(away.get("xg", {}).get("actual") or away.get("xg") or 0)
        # Caută minutele 65-75 pentru snapshot la ~70 min
        xg_at_70 = next((b for b in xg_pm if b.get("m", 0) >= 70), None)
        if xg_at_70 and home_xg_total > 0:
            home_xg_at70_ratio = round(
                float(xg_at_70.get("cum_home") or 0) / home_xg_total, 4
            )
        else:
            home_xg_at70_ratio = None
        if xg_at_70 and away_xg_total > 0:
            away_xg_at70_ratio = round(
                float(xg_at_70.get("cum_away") or 0) / away_xg_total, 4
            )
        else:
            away_xg_at70_ratio = None
    else:
        home_xg_at70_ratio = None
        away_xg_at70_ratio = None

    # Momentum — media ultimelor 15 minute
    momentum = raw.get("momentum") or []
    if momentum:
        last15 = [b.get("v", 0) for b in momentum if b.get("m", 0) >= 75]
        momentum_last15 = round(sum(last15) / len(last15), 4) if last15 else None
    else:
        momentum_last15 = None

    return {
        "event_id":             event_id,
        # Shots
        "home_shots":           home_shots_total or _extract_ratio_val(home.get("total_shots")),
        "away_shots":           away_shots_total or _extract_ratio_val(away.get("total_shots")),
        "home_shots_on_target": home_sot or _extract_ratio_val(home.get("shots_on_target")),
        "away_shots_on_target": away_sot or _extract_ratio_val(away.get("shots_on_target")),
        # Posesie
        "home_possession":      _num(home.get("ball_possession") or home.get("possession")),
        "away_possession":      _num(away.get("ball_possession") or away.get("possession")),
        # Atacuri periculoase
        "home_dangerous_attack": _num(home.get("dangerous_attack") or home.get("dangerous_attacks")),
        "away_dangerous_attack": _num(away.get("dangerous_attack") or away.get("dangerous_attacks")),
        # Precizie pase
        "home_pass_accuracy":   _num(home.get("pass_accuracy_pct") or home.get("pass_accuracy")),
        "away_pass_accuracy":   _num(away.get("pass_accuracy_pct") or away.get("pass_accuracy")),
        # xG din stats (poate diferi de v1)
        "home_xg_stats": _num(home.get("xg") or home.get("expected_goals")),
        "away_xg_stats": _num(away.get("xg") or away.get("expected_goals")),
        # Derived
        "home_xg_at70_ratio":  home_xg_at70_ratio,
        "away_xg_at70_ratio":  away_xg_at70_ratio,
        "momentum_last15":     momentum_last15,
    }


# ─── Normalize incidents ────────────────────────────────────────────────────────
def normalize_incidents(raw: Dict, event_id: int) -> Optional[Dict]:
    """Normalizează răspunsul /events/{id}/incidents/ → dict cu statistici, tolerant la schema v2."""
    incidents = _event_list_payload(raw, "incidents")
    if not incidents:
        return None

    goals        = [i for i in incidents if i.get("type") == "goal"]
    yellow_cards = [i for i in incidents if i.get("type") == "card" and i.get("card_type") == "yellow"]
    red_cards    = [i for i in incidents if i.get("type") == "card" and i.get("card_type") in ("red", "yellowRed")]

    home_goals   = [g for g in goals if _is_home_side(g)]
    away_goals   = [g for g in goals if not _is_home_side(g)]

    # Gol timpuriu (< min 20) și târziu (> min 75)
    def _min(g):
        return int(g.get("minute") or 99)

    first_goal_min  = min([_min(g) for g in goals], default=None)
    first_goal_home = min([_min(g) for g in home_goals], default=None)
    first_goal_away = min([_min(g) for g in away_goals], default=None)

    early_goal_home = 1 if home_goals and min(_min(g) for g in home_goals) < 20 else 0
    early_goal_away = 1 if away_goals and min(_min(g) for g in away_goals) < 20 else 0
    late_goal_home  = 1 if any(_min(g) >= 75 for g in home_goals) else 0
    late_goal_away  = 1 if any(_min(g) >= 75 for g in away_goals) else 0

    # Cartonașe per echipă
    home_yellows = sum(1 for c in yellow_cards if _is_home_side(c))
    away_yellows = sum(1 for c in yellow_cards if not _is_home_side(c))
    home_reds    = sum(1 for c in red_cards if _is_home_side(c))
    away_reds    = sum(1 for c in red_cards if not _is_home_side(c))

    return {
        "event_id":           event_id,
        # Goals timing
        "first_goal_min":     first_goal_min,
        "first_goal_home_min": first_goal_home,
        "first_goal_away_min": first_goal_away,
        "early_goal_home":    early_goal_home,
        "early_goal_away":    early_goal_away,
        "late_goal_home":     late_goal_home,
        "late_goal_away":     late_goal_away,
        "home_goals_count":   len(home_goals),
        "away_goals_count":   len(away_goals),
        # Cards
        "home_yellow_cards":  home_yellows,
        "away_yellow_cards":  away_yellows,
        "home_red_cards":     home_reds,
        "away_red_cards":     away_reds,
        "total_yellow_cards": len(yellow_cards),
        "total_red_cards":    len(red_cards),
        "total_cards":        len(yellow_cards) + len(red_cards),
    }


# ─── Load warehouse event IDs ──────────────────────────────────────────────────
def get_warehouse_event_ids():
    ids = set()
    if not WAREHOUSE.exists():
        print("WARN: Warehouse gol, skip stats fetch.")
        return ids
    for fp in sorted(WAREHOUSE.glob("events_season_*.json")):
        try:
            rows = json.load(open(fp))
            for r in rows:
                if isinstance(r, dict) and r.get("event_id"):
                    ids.add(int(r["event_id"]))
        except Exception as e:
            print(f"  WARN {fp.name}: {e}")
    return ids


# ─── Cache helpers ─────────────────────────────────────────────────────────────
def load_cache(path: Path) -> Dict:
    if path.exists():
        try:
            return json.load(open(path))
        except Exception:
            return {}
    return {}


def save_cache(cache: Dict, path: Path):
    path.parent.mkdir(exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f, separators=(",", ":"))


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    token = _get_token()

    warehouse_ids = get_warehouse_event_ids()
    print(f"Event IDs din warehouse: {len(warehouse_ids)}")

    stats_cache     = load_cache(STATS_CACHE_PATH)
    incidents_cache = load_cache(INCIDENTS_CACHE_PATH)

    # Câte ne lipsesc
    missing_stats     = warehouse_ids - set(int(k) for k in stats_cache.keys())
    missing_incidents = warehouse_ids - set(int(k) for k in incidents_cache.keys())
    total_missing     = len(missing_stats | missing_incidents)

    print(f"Stats lipsă:     {len(missing_stats)}")
    print(f"Incidents lipsă: {len(missing_incidents)}")

    if total_missing == 0:
        print("✅ Cache complet, nimic de fetched.")
        return

    to_fetch = sorted(missing_stats | missing_incidents)[:MAX_FETCH_PER_RUN]
    print(f"Fetchez {len(to_fetch)} events (limit={MAX_FETCH_PER_RUN})...")

    fetched_stats = 0
    fetched_incidents = 0
    errors = 0

    for i, eid in enumerate(to_fetch):
        eid_str = str(eid)

        if eid in missing_stats:
            url = f"{API_BASE}/api/v2/events/{eid}/stats/"
            raw = _get(url, token)
            if raw:
                normalized = normalize_stats(raw, eid)
                if normalized:
                    stats_cache[eid_str] = normalized
                    fetched_stats += 1
                else:
                    stats_cache[eid_str] = None
            else:
                stats_cache[eid_str] = None
                errors += 1
            time.sleep(SLEEP_BETWEEN_CALLS)

        if eid in missing_incidents:
            url = f"{API_BASE}/api/v2/events/{eid}/incidents/"
            raw = _get(url, token)
            if raw:
                normalized = normalize_incidents(raw, eid)
                if normalized:
                    incidents_cache[eid_str] = normalized
                    fetched_incidents += 1
                else:
                    incidents_cache[eid_str] = None
            else:
                incidents_cache[eid_str] = None
                errors += 1
            time.sleep(SLEEP_BETWEEN_CALLS)

        if (i + 1) % 100 == 0:
            print(f"  [{i+1}/{len(to_fetch)}] stats={fetched_stats} incidents={fetched_incidents} errors={errors}")
            # Salvăm periodic pentru a nu pierde progresul
            save_cache(stats_cache, STATS_CACHE_PATH)
            save_cache(incidents_cache, INCIDENTS_CACHE_PATH)

    save_cache(stats_cache, STATS_CACHE_PATH)
    save_cache(incidents_cache, INCIDENTS_CACHE_PATH)

    print(f"\n✅ Done: stats={fetched_stats} incidents={fetched_incidents} errors={errors}")
    print(f"   Cache stats: {len([v for v in stats_cache.values() if v])} valid")
    print(f"   Cache incidents: {len([v for v in incidents_cache.values() if v])} valid")


if __name__ == "__main__":
    main()
