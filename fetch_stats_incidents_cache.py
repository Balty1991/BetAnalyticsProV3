#!/usr/bin/env python3
"""
fetch_stats_incidents_cache.py — VEYRA Supreme | Stats + Incidents + Shotmap Cache
=================================================================================
Fetchează /api/v2/events/{id}/stats/ și /api/v2/events/{id}/incidents/ pentru
meciurile istorice din warehouse și salvează cache-uri persistente.

Pasul 2 upgrade:
  - prioritizează ultimele meciuri ale echipelor care joacă în events.json;
  - produce și data/shotmap_cache.json din shotmap-ul endpointului stats;
  - păstrează rularea incrementală și rate-limit friendly.

Output:
  data/stats_cache.json     → statistici agregate home/away
  data/incidents_cache.json → timing goluri + cartonașe
  data/shotmap_cache.json   → xG/șut, big chances, open-play/set-piece xG
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

DATA_DIR = Path("data")
WAREHOUSE = DATA_DIR / "warehouse"
STATS_CACHE_PATH = DATA_DIR / "stats_cache.json"
INCIDENTS_CACHE_PATH = DATA_DIR / "incidents_cache.json"
SHOTMAP_CACHE_PATH = DATA_DIR / "shotmap_cache.json"
EVENTS_PATH = DATA_DIR / "events.json"

API_BASE = "https://sports.bzzoiro.com"
MAX_FETCH_PER_RUN = int(os.environ.get("STATS_FETCH_LIMIT", "600"))
RECENT_PER_TEAM = int(os.environ.get("STATS_RECENT_PER_TEAM", "8"))
SLEEP_BETWEEN_CALLS = float(os.environ.get("STATS_SLEEP_SECONDS", "0.35"))


def _get_token() -> str:
    token = os.environ.get("BSD_TOKEN", "")
    if not token:
        raise SystemExit("BSD_TOKEN lipsă din env")
    return token


def _get(url: str, token: str, retries: int = 3) -> Optional[Dict[str, Any]]:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 404):
                return None
            if exc.code == 429:
                time.sleep(10 * (attempt + 1))
            else:
                time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def _unwrap_payload(raw: Any) -> Any:
    """Acceptă forme v2: {data:{...}}, {result:{...}}, list direct sau dict direct."""
    if isinstance(raw, dict):
        for key in ("data", "result", "payload"):
            val = raw.get(key)
            if isinstance(val, (dict, list)):
                return val
    return raw


def _num(value: Any, default: float = 0.0) -> float:
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


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value or "").strip().lower()
    return text in {"1", "true", "yes", "y", "on"}


def _is_home_side(obj: Any) -> bool:
    if not isinstance(obj, dict):
        return False
    if obj.get("is_home") is not None:
        return _boolish(obj.get("is_home"))
    for key in ("side", "team_side", "home_away", "team_type"):
        side = str(obj.get(key) or "").lower()
        if side in ("home", "h", "1"):
            return True
        if side in ("away", "a", "2"):
            return False
    team_obj = obj.get("team") if isinstance(obj.get("team"), dict) else {}
    for key in ("side", "type", "home_away"):
        side = str(team_obj.get(key) or "").lower()
        if side in ("home", "h", "1"):
            return True
        if side in ("away", "a", "2"):
            return False
    return False


def _event_list_payload(raw: Any, list_key: str) -> List[Dict[str, Any]]:
    raw = _unwrap_payload(raw)
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        val = raw.get(list_key) or raw.get("items") or raw.get("results")
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    return []


def _ratio_value(obj: Any, default: float = 0.0) -> float:
    if isinstance(obj, dict):
        return _num(obj.get("value"), default)
    return _num(obj, default)


def _safe_div(a: float, b: float) -> Optional[float]:
    try:
        a = float(a)
        b = float(b)
        if b == 0:
            return None
        return round(a / b, 4)
    except Exception:
        return None


def _shot_xg(shot: Dict[str, Any]) -> float:
    for key in ("xg", "expected_goals", "expected_goal", "shot_xg"):
        if key in shot and shot.get(key) is not None:
            return _num(shot.get(key), 0.0)
    return 0.0


def _shot_outcome(shot: Dict[str, Any]) -> str:
    return str(shot.get("outcome") or shot.get("result") or shot.get("shot_result") or "").lower()


def _is_on_target_shot(shot: Dict[str, Any]) -> bool:
    outcome = _shot_outcome(shot)
    return bool(
        _boolish(shot.get("on_target"))
        or _boolish(shot.get("is_on_target"))
        or outcome in {"on_target", "saved", "goal", "scored"}
    )


def _is_goal_shot(shot: Dict[str, Any]) -> bool:
    outcome = _shot_outcome(shot)
    return bool(_boolish(shot.get("is_goal")) or outcome in {"goal", "scored"})


def _is_big_chance(shot: Dict[str, Any], xg: float) -> bool:
    return bool(
        _boolish(shot.get("big_chance"))
        or _boolish(shot.get("is_big_chance"))
        or _boolish(shot.get("bigChance"))
        or xg >= 0.30
    )


def _situation(shot: Dict[str, Any]) -> str:
    return str(
        shot.get("situation")
        or shot.get("play_type")
        or shot.get("shot_type")
        or shot.get("type")
        or ""
    ).lower()


def _body_part(shot: Dict[str, Any]) -> str:
    return str(shot.get("body_part") or shot.get("bodyPart") or shot.get("shot_body_part") or "").lower()


def _is_set_piece(shot: Dict[str, Any]) -> bool:
    text = _situation(shot)
    return any(token in text for token in ("set", "corner", "free", "penalty", "throw"))


def normalize_stats(raw: Dict[str, Any], event_id: int) -> Optional[Dict[str, Any]]:
    """Normalizează /events/{id}/stats/ → dict flat, tolerant la schema v2."""
    raw = _unwrap_payload(raw)
    if not raw or not isinstance(raw, dict):
        return None
    stats = raw.get("stats") if isinstance(raw.get("stats"), dict) else raw
    home = stats.get("home") if isinstance(stats.get("home"), dict) else {}
    away = stats.get("away") if isinstance(stats.get("away"), dict) else {}

    shotmap = raw.get("shotmap") or raw.get("shots") or []
    if not isinstance(shotmap, list):
        shotmap = []
    home_sot = sum(1 for s in shotmap if isinstance(s, dict) and _is_home_side(s) and _is_on_target_shot(s))
    away_sot = sum(1 for s in shotmap if isinstance(s, dict) and not _is_home_side(s) and _is_on_target_shot(s))
    home_shots_total = sum(1 for s in shotmap if isinstance(s, dict) and _is_home_side(s))
    away_shots_total = sum(1 for s in shotmap if isinstance(s, dict) and not _is_home_side(s))

    xg_pm = raw.get("xg_per_minute") or []
    home_xg_at70_ratio = None
    away_xg_at70_ratio = None
    if isinstance(xg_pm, list) and xg_pm:
        home_xg_total = _num(home.get("xg") or home.get("expected_goals"), 0.0)
        away_xg_total = _num(away.get("xg") or away.get("expected_goals"), 0.0)
        xg_at_70 = next((b for b in xg_pm if isinstance(b, dict) and _num(b.get("m"), 0) >= 70), None)
        if xg_at_70 and home_xg_total > 0:
            home_xg_at70_ratio = round(_num(xg_at_70.get("cum_home"), 0.0) / home_xg_total, 4)
        if xg_at_70 and away_xg_total > 0:
            away_xg_at70_ratio = round(_num(xg_at_70.get("cum_away"), 0.0) / away_xg_total, 4)

    momentum = raw.get("momentum") or []
    momentum_last15 = None
    if isinstance(momentum, list) and momentum:
        last15 = [_num(b.get("v"), 0.0) for b in momentum if isinstance(b, dict) and _num(b.get("m"), 0) >= 75]
        momentum_last15 = round(sum(last15) / len(last15), 4) if last15 else None

    return {
        "event_id": event_id,
        "home_shots": home_shots_total or _ratio_value(home.get("total_shots")),
        "away_shots": away_shots_total or _ratio_value(away.get("total_shots")),
        "home_shots_on_target": home_sot or _ratio_value(home.get("shots_on_target")),
        "away_shots_on_target": away_sot or _ratio_value(away.get("shots_on_target")),
        "home_possession": _num(home.get("ball_possession") or home.get("possession")),
        "away_possession": _num(away.get("ball_possession") or away.get("possession")),
        "home_attack": _num(home.get("attack")),
        "away_attack": _num(away.get("attack")),
        "home_ball_safe": _num(home.get("ball_safe")),
        "away_ball_safe": _num(away.get("ball_safe")),
        "home_dangerous_attack": _num(home.get("dangerous_attack") or home.get("dangerous_attacks")),
        "away_dangerous_attack": _num(away.get("dangerous_attack") or away.get("dangerous_attacks")),
        "home_pass_accuracy": _num(home.get("pass_accuracy_pct") or home.get("pass_accuracy")),
        "away_pass_accuracy": _num(away.get("pass_accuracy_pct") or away.get("pass_accuracy")),
        "home_xg_stats": _num(home.get("xg") or home.get("expected_goals")),
        "away_xg_stats": _num(away.get("xg") or away.get("expected_goals")),
        "home_xg_at70_ratio": home_xg_at70_ratio,
        "away_xg_at70_ratio": away_xg_at70_ratio,
        "momentum_last15": momentum_last15,
    }


def normalize_shotmap(raw: Dict[str, Any], event_id: int) -> Optional[Dict[str, Any]]:
    """Normalizează shotmap-ul din /events/{id}/stats/ în indicatori pre-match reutilizabili."""
    raw = _unwrap_payload(raw)
    if not isinstance(raw, dict):
        return None
    shotmap = raw.get("shotmap") or raw.get("shots") or raw.get("shot_map") or []
    if not isinstance(shotmap, list) or not shotmap:
        return None

    acc = {
        "home": {"shots": 0, "sot": 0, "goals": 0, "xg": 0.0, "big": 0, "open_xg": 0.0, "set_xg": 0.0, "pen_xg": 0.0, "headers": 0},
        "away": {"shots": 0, "sot": 0, "goals": 0, "xg": 0.0, "big": 0, "open_xg": 0.0, "set_xg": 0.0, "pen_xg": 0.0, "headers": 0},
    }
    for shot in shotmap:
        if not isinstance(shot, dict):
            continue
        side = "home" if _is_home_side(shot) else "away"
        xg = _shot_xg(shot)
        sit = _situation(shot)
        acc[side]["shots"] += 1
        acc[side]["xg"] += xg
        acc[side]["sot"] += 1 if _is_on_target_shot(shot) else 0
        acc[side]["goals"] += 1 if _is_goal_shot(shot) else 0
        acc[side]["big"] += 1 if _is_big_chance(shot, xg) else 0
        acc[side]["headers"] += 1 if "head" in _body_part(shot) else 0
        if "pen" in sit:
            acc[side]["pen_xg"] += xg
        elif _is_set_piece(shot):
            acc[side]["set_xg"] += xg
        else:
            acc[side]["open_xg"] += xg

    h, a = acc["home"], acc["away"]
    total_xg = h["xg"] + a["xg"]
    total_shots = h["shots"] + a["shots"]
    payload = {
        "event_id": event_id,
        "home_shotmap_shots": h["shots"],
        "away_shotmap_shots": a["shots"],
        "home_shotmap_sot": h["sot"],
        "away_shotmap_sot": a["sot"],
        "home_shotmap_goals": h["goals"],
        "away_shotmap_goals": a["goals"],
        "home_shotmap_xg": round(h["xg"], 4),
        "away_shotmap_xg": round(a["xg"], 4),
        "home_xg_per_shot": _safe_div(h["xg"], h["shots"]),
        "away_xg_per_shot": _safe_div(a["xg"], a["shots"]),
        "home_big_chances": h["big"],
        "away_big_chances": a["big"],
        "home_open_play_xg": round(h["open_xg"], 4),
        "away_open_play_xg": round(a["open_xg"], 4),
        "home_set_piece_xg": round(h["set_xg"], 4),
        "away_set_piece_xg": round(a["set_xg"], 4),
        "home_penalty_xg": round(h["pen_xg"], 4),
        "away_penalty_xg": round(a["pen_xg"], 4),
        "home_header_shots": h["headers"],
        "away_header_shots": a["headers"],
        "total_shotmap_xg": round(total_xg, 4),
        "total_shotmap_shots": total_shots,
        "shotmap_xg_diff": round(h["xg"] - a["xg"], 4),
    }
    return payload if total_shots > 0 else None


def normalize_incidents(raw: Dict[str, Any], event_id: int) -> Optional[Dict[str, Any]]:
    """Normalizează /events/{id}/incidents/ → timing goluri + cartonașe."""
    incidents = _event_list_payload(raw, "incidents")
    if not incidents:
        return None

    def _kind(item: Dict[str, Any]) -> str:
        return str(item.get("type") or item.get("incident_type") or "").lower()

    def _card_type(item: Dict[str, Any]) -> str:
        return str(item.get("card_type") or item.get("card") or "").lower().replace("_", "")

    goals = [i for i in incidents if _kind(i) == "goal" or _boolish(i.get("is_goal"))]
    yellow_cards = [i for i in incidents if _kind(i) == "card" and "yellow" in _card_type(i) and "red" not in _card_type(i)]
    red_cards = [i for i in incidents if _kind(i) == "card" and "red" in _card_type(i)]

    home_goals = [g for g in goals if _is_home_side(g)]
    away_goals = [g for g in goals if not _is_home_side(g)]

    def _minute(item: Dict[str, Any]) -> int:
        return int(_num(item.get("minute") or item.get("time") or 99, 99))

    first_goal_min = min([_minute(g) for g in goals], default=None)
    first_goal_home = min([_minute(g) for g in home_goals], default=None)
    first_goal_away = min([_minute(g) for g in away_goals], default=None)

    early_goal_home = 1 if home_goals and min(_minute(g) for g in home_goals) < 20 else 0
    early_goal_away = 1 if away_goals and min(_minute(g) for g in away_goals) < 20 else 0
    late_goal_home = 1 if any(_minute(g) >= 75 for g in home_goals) else 0
    late_goal_away = 1 if any(_minute(g) >= 75 for g in away_goals) else 0

    home_yellows = sum(1 for c in yellow_cards if _is_home_side(c))
    away_yellows = sum(1 for c in yellow_cards if not _is_home_side(c))
    home_reds = sum(1 for c in red_cards if _is_home_side(c))
    away_reds = sum(1 for c in red_cards if not _is_home_side(c))

    return {
        "event_id": event_id,
        "first_goal_min": first_goal_min,
        "first_goal_home_min": first_goal_home,
        "first_goal_away_min": first_goal_away,
        "early_goal_home": early_goal_home,
        "early_goal_away": early_goal_away,
        "late_goal_home": late_goal_home,
        "late_goal_away": late_goal_away,
        "home_goals_count": len(home_goals),
        "away_goals_count": len(away_goals),
        "home_yellow_cards": home_yellows,
        "away_yellow_cards": away_yellows,
        "home_red_cards": home_reds,
        "away_red_cards": away_reds,
        "total_yellow_cards": len(yellow_cards),
        "total_red_cards": len(red_cards),
        "total_cards": len(yellow_cards) + len(red_cards),
    }


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_cache(cache: Dict[str, Any], path: Path) -> None:
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _iter_current_events() -> Iterable[Dict[str, Any]]:
    raw = load_json(EVENTS_PATH, {})
    if isinstance(raw, dict):
        events = raw.get("predictions") or raw.get("results") or raw.get("events") or []
        if not events and all(isinstance(v, dict) for v in raw.values()):
            events = list(raw.values())
    elif isinstance(raw, list):
        events = raw
    else:
        events = []
    for ev in events:
        if isinstance(ev, dict):
            yield ev


def _team_id(obj: Dict[str, Any], side: str) -> Optional[str]:
    direct = obj.get(f"{side}_team_id")
    if direct:
        return str(direct)
    value = obj.get(f"{side}_team_obj") or obj.get(side) or obj.get(f"{side}_team")
    if isinstance(value, dict) and value.get("id"):
        return str(value.get("id"))
    event = obj.get("event") if isinstance(obj.get("event"), dict) else {}
    if event:
        return _team_id(event, side)
    return None


def _date_key(row: Dict[str, Any]) -> str:
    return str(row.get("date") or row.get("event_date") or "")[:19]


def load_warehouse_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not WAREHOUSE.exists():
        print("WARN: Warehouse gol, skip stats fetch.")
        return rows
    for fp in sorted(WAREHOUSE.glob("events_season_*.json")):
        try:
            batch = json.loads(fp.read_text(encoding="utf-8"))
            if isinstance(batch, list):
                rows.extend([r for r in batch if isinstance(r, dict) and r.get("event_id")])
        except Exception as exc:
            print(f"  WARN {fp.name}: {exc}")
    return rows


def get_ordered_warehouse_event_ids() -> List[int]:
    """Prioritate: ultimele meciuri ale echipelor din oferta curentă, apoi restul recent."""
    rows = load_warehouse_rows()
    if not rows:
        return []
    rows_sorted_desc = sorted(rows, key=_date_key, reverse=True)
    current_team_ids = {tid for ev in _iter_current_events() for tid in (_team_id(ev, "home"), _team_id(ev, "away")) if tid}

    ordered: List[int] = []
    seen = set()
    per_team_count: Dict[str, int] = {}

    if current_team_ids:
        for row in rows_sorted_desc:
            hid, aid = str(row.get("home_team_id") or ""), str(row.get("away_team_id") or "")
            involved = [tid for tid in (hid, aid) if tid in current_team_ids]
            if not involved:
                continue
            if all(per_team_count.get(tid, 0) >= RECENT_PER_TEAM for tid in involved):
                continue
            eid = int(row["event_id"])
            if eid not in seen:
                ordered.append(eid)
                seen.add(eid)
            for tid in involved:
                per_team_count[tid] = per_team_count.get(tid, 0) + 1

    # Completează cu restul meciurilor recente, ca să crească progresiv acoperirea cache-ului.
    for row in rows_sorted_desc:
        eid = int(row["event_id"])
        if eid not in seen:
            ordered.append(eid)
            seen.add(eid)

    print(f"Priority current teams: {len(current_team_ids)} | ordered warehouse ids: {len(ordered)}")
    return ordered


def main() -> None:
    token = _get_token()

    ordered_ids = get_ordered_warehouse_event_ids()
    if not ordered_ids:
        print("Nu există event_id-uri în warehouse.")
        return
    warehouse_id_set = set(ordered_ids)
    print(f"Event IDs din warehouse: {len(warehouse_id_set)}")

    stats_cache = load_json(STATS_CACHE_PATH, {}) or {}
    incidents_cache = load_json(INCIDENTS_CACHE_PATH, {}) or {}
    shotmap_cache = load_json(SHOTMAP_CACHE_PATH, {}) or {}

    missing_stats = warehouse_id_set - {int(k) for k, v in stats_cache.items() if v}
    missing_incidents = warehouse_id_set - {int(k) for k, v in incidents_cache.items() if v}
    missing_shotmap = warehouse_id_set - {int(k) for k, v in shotmap_cache.items() if v}

    print(f"Stats lipsă:     {len(missing_stats)}")
    print(f"Incidents lipsă: {len(missing_incidents)}")
    print(f"Shotmap lipsă:   {len(missing_shotmap)}")

    if not (missing_stats or missing_incidents or missing_shotmap):
        print("✅ Cache complet, nimic de fetched.")
        return

    to_fetch = [eid for eid in ordered_ids if eid in missing_stats or eid in missing_incidents or eid in missing_shotmap][:MAX_FETCH_PER_RUN]
    print(f"Fetchez {len(to_fetch)} events (limit={MAX_FETCH_PER_RUN}, recent/team={RECENT_PER_TEAM})...")

    fetched_stats = fetched_incidents = fetched_shotmap = errors = 0

    for index, eid in enumerate(to_fetch, start=1):
        eid_str = str(eid)
        needs_stats_endpoint = eid in missing_stats or eid in missing_shotmap
        if needs_stats_endpoint:
            raw_stats = _get(f"{API_BASE}/api/v2/events/{eid}/stats/", token)
            if raw_stats:
                if eid in missing_stats:
                    normalized = normalize_stats(raw_stats, eid)
                    stats_cache[eid_str] = normalized
                    fetched_stats += 1 if normalized else 0
                if eid in missing_shotmap:
                    normalized_shotmap = normalize_shotmap(raw_stats, eid)
                    shotmap_cache[eid_str] = normalized_shotmap
                    fetched_shotmap += 1 if normalized_shotmap else 0
            else:
                if eid in missing_stats:
                    stats_cache[eid_str] = None
                if eid in missing_shotmap:
                    shotmap_cache[eid_str] = None
                errors += 1
            time.sleep(SLEEP_BETWEEN_CALLS)

        if eid in missing_incidents:
            raw_incidents = _get(f"{API_BASE}/api/v2/events/{eid}/incidents/", token)
            if raw_incidents:
                normalized_incidents = normalize_incidents(raw_incidents, eid)
                incidents_cache[eid_str] = normalized_incidents
                fetched_incidents += 1 if normalized_incidents else 0
            else:
                incidents_cache[eid_str] = None
                errors += 1
            time.sleep(SLEEP_BETWEEN_CALLS)

        if index % 50 == 0:
            print(f"  [{index}/{len(to_fetch)}] stats={fetched_stats} shotmap={fetched_shotmap} incidents={fetched_incidents} errors={errors}")
            save_cache(stats_cache, STATS_CACHE_PATH)
            save_cache(shotmap_cache, SHOTMAP_CACHE_PATH)
            save_cache(incidents_cache, INCIDENTS_CACHE_PATH)

    save_cache(stats_cache, STATS_CACHE_PATH)
    save_cache(shotmap_cache, SHOTMAP_CACHE_PATH)
    save_cache(incidents_cache, INCIDENTS_CACHE_PATH)

    print(f"\n✅ Done: stats={fetched_stats} shotmap={fetched_shotmap} incidents={fetched_incidents} errors={errors}")
    print(f"   Cache stats:     {len([v for v in stats_cache.values() if v])} valid")
    print(f"   Cache shotmap:   {len([v for v in shotmap_cache.values() if v])} valid")
    print(f"   Cache incidents: {len([v for v in incidents_cache.values() if v])} valid")


if __name__ == "__main__":
    main()
