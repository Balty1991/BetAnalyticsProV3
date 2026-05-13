"""
fetch_player_profiles_cache.py — VEYRA Player Quality Layer
=============================================================
Fetchează profilurile jucătorilor cheie din /api/v2/players/{id}/ și calculează
scoruri calitative per-echipă per-eveniment.

Citește:
  data/lineups_today.json        — starters (player IDs)
  data/v2_enrichment_cache.json  — unavailable players (player IDs)
  data/events.json               — eventurile curente

Produce:
  data/player_profiles_cache.json

Câmpuri per eveniment (event_id → quality_dict):
  home_attack_quality       — avg attacking attr al starterilor F/M acasă (0-100)
  away_attack_quality       — idem deplasare
  home_defense_quality      — avg defending attr al starterilor D/GK acasă
  away_defense_quality      — idem deplasare
  lineup_attack_diff        — home_attack - away_attack (pozitiv = avantaj gazdă)
  lineup_defense_diff       — home_defense - away_defense
  home_missing_atk_quality  — avg attacking attr al starterilor F/M absenți acasă
  away_missing_atk_quality  — idem deplasare
  home_missing_def_quality  — avg defending attr al starterilor D/GK absenți acasă
  away_missing_def_quality  — idem deplasare
  home_avg_market_value_m   — valoarea medie starters acasă (EUR M)
  away_avg_market_value_m   — idem deplasare
  top_home_player           — numele + atributele jucătorului cheie acasă
  top_away_player           — idem deplasare

Limite API:
  - Max MAX_PLAYERS_PER_RUN profile calls per run (rate limit friendly)
  - Cache PLAYER_TTL_HOURS=168h (7 zile) — atributele se schimbă rar
  - Prioritizare: atacanți + jucători indisponibili > restul
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests

# ─── Config ───────────────────────────────────────────────────────────────────
DATA_DIR         = Path("data")
CACHE_PATH       = DATA_DIR / "player_profiles_cache.json"
MAX_PLAYERS_PER_RUN = 40        # max API calls per rulare
PLAYER_TTL_HOURS = 168          # 7 zile — atributele nu se schimbă zilnic
V2_BASE          = "https://sports.bzzoiro.com/api/v2/"

# Poziții: atacant/mijlocaș vs fundaș/portar
ATTACK_POSITIONS = {"F", "M", "FW", "MF", "CF", "SS", "LW", "RW", "CAM", "CM", "LM", "RM", "AMF", "OMF"}
DEFENSE_POSITIONS = {"D", "G", "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "DMF", "SW", "SW"}


def _get_token() -> str:
    token = os.environ.get("BSD_TOKEN", "")
    if not token:
        raise SystemExit("BSD_TOKEN lipsă din env")
    return token


def load_json(path: Path, default=None) -> Any:
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_get(endpoint: str, token: str, retries: int = 2) -> Optional[Dict]:
    url = V2_BASE + endpoint.lstrip("/")
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=12)
            if r.status_code == 404:
                return None
            if r.status_code == 429:
                time.sleep(3.0 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt < retries - 1:
                time.sleep(1.5)
    return None


def _is_stale(entry: Dict, ttl_hours: float = PLAYER_TTL_HOURS) -> bool:
    ts = entry.get("fetched_at") or ""
    if not ts:
        return True
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(
            ts.replace("Z", "+00:00"))).total_seconds() / 3600.0
        return age > ttl_hours
    except Exception:
        return True


def _is_attack_pos(pos: str) -> bool:
    return str(pos).upper() in ATTACK_POSITIONS or pos.upper().startswith("F") or pos.upper().startswith("M")


def _is_defense_pos(pos: str) -> bool:
    return str(pos).upper() in DEFENSE_POSITIONS or pos.upper().startswith("D") or pos.upper() == "G" or pos.upper() == "GK"


# ─── Colectare player IDs din lineups + unavailable ─────────────────────────

def collect_player_ids(events_raw: List, v2_cache: Dict) -> Dict[str, Dict[str, Any]]:
    """
    Returnează {player_id: {side, event_id, position, is_unavailable}}
    Prioritizează atacanți și jucători indisponibili.
    """
    players: Dict[str, Dict[str, Any]] = {}

    for ev in events_raw:
        eid = str(ev.get("id") or ev.get("event_id") or "")
        if not eid:
            continue
        bundle = v2_cache.get(eid) or {}

        # Starters din lineups bundle
        lineups_raw = bundle.get("lineups") or {}
        if isinstance(lineups_raw, dict):
            lineups = lineups_raw.get("lineups") or {}
            if isinstance(lineups, dict):
                for side in ("home", "away"):
                    side_data = lineups.get(side) or {}
                    if not isinstance(side_data, dict):
                        continue
                    for player in (side_data.get("players") or side_data.get("starting_xi") or []):
                        if not isinstance(player, dict):
                            continue
                        pid = str(player.get("player_id") or player.get("id") or "")
                        pos = str(player.get("position") or player.get("pos") or "M")
                        if pid and pid not in players:
                            players[pid] = {
                                "event_id": eid,
                                "side": side,
                                "position": pos,
                                "is_unavailable": False,
                                "priority": 2 if _is_attack_pos(pos) else 1
                            }

            # Unavailable players — prioritate mare (impact direct pe predicție)
            unavail = lineups_raw.get("unavailable_players") or {}
            if isinstance(unavail, dict):
                for side in ("home", "away"):
                    for player in (unavail.get(side) or []):
                        if not isinstance(player, dict):
                            continue
                        pid = str(player.get("player_id") or player.get("id") or "")
                        pos = str(player.get("position") or player.get("pos") or "F")
                        if pid and pid not in players:
                            players[pid] = {
                                "event_id": eid,
                                "side": side,
                                "position": pos,
                                "is_unavailable": True,
                                "priority": 3  # cel mai mare — indisponibilii contează cel mai mult
                            }

    return players


# ─── Extragere atribute din profil ──────────────────────────────────────────

def extract_attributes(profile_raw: Any) -> Dict[str, Any]:
    """Extrage atributele de skill din răspunsul /api/v2/players/{id}/."""
    if not isinstance(profile_raw, dict):
        return {}
    # Unele API-uri returnează datele sub o cheie "player" sau "data"
    data = profile_raw
    if "player" in profile_raw and isinstance(profile_raw["player"], dict):
        data = profile_raw["player"]
    elif "data" in profile_raw and isinstance(profile_raw["data"], dict):
        data = profile_raw["data"]

    attrs = data.get("attributes") or data.get("skill_attributes") or {}
    if not isinstance(attrs, dict):
        attrs = {}

    def _attr(key: str) -> Optional[float]:
        # Caută atributul direct sau sub alte denumiri comune
        for k in [key, key.lower(), key.upper()]:
            v = attrs.get(k) or data.get(k)
            if v is not None:
                try:
                    return float(v)
                except Exception:
                    pass
        return None

    attacking  = _attr("attacking")  or _attr("attack")   or _attr("pace")
    defending  = _attr("defending")  or _attr("defense")  or _attr("defensive")
    technical  = _attr("technical")  or _attr("dribbling")
    tactical   = _attr("tactical")   or _attr("vision")
    creativity = _attr("creativity") or _attr("passing")

    # Market value
    mv_raw = data.get("market_value") or data.get("marketValue") or data.get("value")
    market_value_m = None
    if mv_raw is not None:
        try:
            mv = float(str(mv_raw).replace(",", "").replace("€", "").replace("M", "e6").replace("K", "e3"))
            market_value_m = round(mv / 1_000_000, 2)
        except Exception:
            pass

    name = data.get("name") or data.get("full_name") or data.get("display_name") or ""
    position = data.get("position") or data.get("pos") or ""

    return {
        "name": name,
        "position": position,
        "attacking":  round(attacking,  1) if attacking  is not None else None,
        "defending":  round(defending,  1) if defending  is not None else None,
        "technical":  round(technical,  1) if technical  is not None else None,
        "tactical":   round(tactical,   1) if tactical   is not None else None,
        "creativity": round(creativity, 1) if creativity is not None else None,
        "market_value_m": market_value_m,
        "strengths":  data.get("strengths")  or [],
        "weaknesses": data.get("weaknesses") or [],
    }


# ─── Calcul scoruri calitative per eveniment ─────────────────────────────────

def build_event_quality_scores(
    events_raw: List,
    v2_cache: Dict,
    profile_store: Dict[str, Dict]
) -> Dict[str, Dict[str, Any]]:
    """
    Produce {event_id: quality_dict} cu scoruri agregate per-echipă.
    """
    results: Dict[str, Dict[str, Any]] = {}

    for ev in events_raw:
        eid = str(ev.get("id") or ev.get("event_id") or "")
        if not eid:
            continue
        bundle = v2_cache.get(eid) or {}
        lineups_raw = bundle.get("lineups") or {}
        if not isinstance(lineups_raw, dict):
            continue

        # Colectăm player IDs per echipă per categorie
        starters: Dict[str, List] = {"home": [], "away": []}
        unavailable: Dict[str, List] = {"home": [], "away": []}

        lineups = lineups_raw.get("lineups") or {}
        if isinstance(lineups, dict):
            for side in ("home", "away"):
                side_data = lineups.get(side) or {}
                if isinstance(side_data, dict):
                    for p in (side_data.get("players") or side_data.get("starting_xi") or []):
                        if isinstance(p, dict):
                            pid = str(p.get("player_id") or p.get("id") or "")
                            pos = str(p.get("position") or p.get("pos") or "M")
                            if pid and pid in profile_store and profile_store[pid].get("attrs"):
                                starters[side].append({"pid": pid, "position": pos, "attrs": profile_store[pid]["attrs"]})

        unavail_raw = lineups_raw.get("unavailable_players") or {}
        if isinstance(unavail_raw, dict):
            for side in ("home", "away"):
                for p in (unavail_raw.get(side) or []):
                    if isinstance(p, dict):
                        pid = str(p.get("player_id") or p.get("id") or "")
                        pos = str(p.get("position") or p.get("pos") or "F")
                        if pid and pid in profile_store and profile_store[pid].get("attrs"):
                            unavailable[side].append({"pid": pid, "position": pos, "attrs": profile_store[pid]["attrs"]})

        def _mean_attr(player_list: List, attr: str, pos_filter=None) -> Optional[float]:
            vals = []
            for item in player_list:
                if pos_filter and not pos_filter(item["position"]):
                    continue
                v = (item.get("attrs") or {}).get(attr)
                if v is not None:
                    vals.append(float(v))
            return round(sum(vals) / len(vals), 1) if vals else None

        def _mean_mv(player_list: List) -> Optional[float]:
            vals = [float(x["attrs"]["market_value_m"]) for x in player_list
                    if (x.get("attrs") or {}).get("market_value_m") is not None]
            return round(sum(vals) / len(vals), 2) if vals else None

        def _top_player(player_list: List) -> Optional[Dict]:
            candidates = [(x, float((x.get("attrs") or {}).get("attacking") or 0) +
                          float((x.get("attrs") or {}).get("technical") or 0)) for x in player_list]
            if not candidates:
                return None
            best = max(candidates, key=lambda c: c[1])
            return {"name": (best[0].get("attrs") or {}).get("name", ""), "score": round(best[1], 1)}

        h_atk  = _mean_attr(starters["home"], "attacking", _is_attack_pos)
        a_atk  = _mean_attr(starters["away"], "attacking", _is_attack_pos)
        h_def  = _mean_attr(starters["home"], "defending", _is_defense_pos)
        a_def  = _mean_attr(starters["away"], "defending", _is_defense_pos)
        hm_atk = _mean_attr(unavailable["home"], "attacking", _is_attack_pos)
        am_atk = _mean_attr(unavailable["away"], "attacking", _is_attack_pos)
        hm_def = _mean_attr(unavailable["home"], "defending", _is_defense_pos)
        am_def = _mean_attr(unavailable["away"], "defending", _is_defense_pos)

        results[eid] = {
            "home_attack_quality":      h_atk,
            "away_attack_quality":      a_atk,
            "home_defense_quality":     h_def,
            "away_defense_quality":     a_def,
            "lineup_attack_diff":       round(h_atk - a_atk, 1) if h_atk and a_atk else None,
            "lineup_defense_diff":      round(h_def - a_def, 1) if h_def and a_def else None,
            "home_missing_atk_quality": hm_atk,
            "away_missing_atk_quality": am_atk,
            "home_missing_def_quality": hm_def,
            "away_missing_def_quality": am_def,
            "home_avg_market_value_m":  _mean_mv(starters["home"]),
            "away_avg_market_value_m":  _mean_mv(starters["away"]),
            "top_home_player":          _top_player(starters["home"]),
            "top_away_player":          _top_player(starters["away"]),
            "computed_at":              now_iso(),
        }

    return results


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    token = _get_token()
    DATA_DIR.mkdir(exist_ok=True)

    events_raw = load_json(DATA_DIR / "events.json", {})
    if isinstance(events_raw, dict):
        events_raw = events_raw.get("events") or []
    if not isinstance(events_raw, list):
        events_raw = []

    v2_raw = load_json(DATA_DIR / "v2_enrichment_cache.json", {})
    v2_events = {}
    if isinstance(v2_raw, dict):
        ev = v2_raw.get("events") or {}
        if isinstance(ev, dict):
            v2_events = ev
        elif isinstance(ev, list):
            v2_events = {str(x.get("event_id", "")): x for x in ev if x.get("event_id")}

    # Cache existent de profiluri (nu refetchăm playerii la fiecare run)
    cache = load_json(CACHE_PATH, {}) or {}
    if not isinstance(cache, dict):
        cache = {}
    profile_store: Dict[str, Dict] = cache.get("profiles") or {}
    if not isinstance(profile_store, dict):
        profile_store = {}

    # Colectăm toți player IDs necesari
    all_player_meta = collect_player_ids(events_raw, v2_events)
    print(f"Player profiles: {len(events_raw)} events → {len(all_player_meta)} player IDs găsiți")

    # Determinăm care trebuie fetchați (lipsă sau stale)
    to_fetch: List[Tuple[str, int]] = []
    for pid, meta in all_player_meta.items():
        existing = profile_store.get(pid)
        if existing is None or _is_stale(existing):
            to_fetch.append((pid, meta.get("priority", 1)))

    # Sortăm după prioritate: indisponibili (3) > atacanți (2) > rest (1)
    to_fetch.sort(key=lambda x: x[1], reverse=True)
    to_fetch = to_fetch[:MAX_PLAYERS_PER_RUN]
    print(f"  De fetchat: {len(to_fetch)} profiluri (limita {MAX_PLAYERS_PER_RUN}/run)")

    fetched_ok = 0
    for idx, (pid, _) in enumerate(to_fetch, 1):
        raw = _safe_get(f"players/{pid}/", token)
        if raw is not None:
            attrs = extract_attributes(raw)
            profile_store[pid] = {
                "fetched_at": now_iso(),
                "attrs": attrs,
            }
            fetched_ok += 1
        else:
            # Marchează ca fetchat (pentru a evita retry constant pe IDs invalide)
            profile_store[pid] = {"fetched_at": now_iso(), "attrs": {}}
        if idx % 10 == 0:
            print(f"  {idx}/{len(to_fetch)} fetchat")
        time.sleep(0.18)  # rate limiting

    print(f"  Fetchat {fetched_ok}/{len(to_fetch)} profiluri valide")

    # Calculăm scoruri calitative per eveniment
    quality_scores = build_event_quality_scores(events_raw, v2_events, profile_store)
    print(f"  Scoruri calitate calculate: {len(quality_scores)} evenimente")

    # Salvăm
    payload = {
        "updated_at": now_iso(),
        "profiles_count": len(profile_store),
        "events_count": len(quality_scores),
        "fetched_this_run": fetched_ok,
        "profiles": profile_store,
        "quality_scores": quality_scores,
    }
    save_json(CACHE_PATH, payload)
    print(f"✅ Salvat {CACHE_PATH}: {len(profile_store)} profiluri, {len(quality_scores)} scoruri calitate")

    # Print top 3 events cu cel mai mare lineup quality diff
    scored = [(eid, d) for eid, d in quality_scores.items() if d.get("lineup_attack_diff") is not None]
    scored.sort(key=lambda x: abs(x[1]["lineup_attack_diff"]), reverse=True)
    for eid, d in scored[:3]:
        ev = next((e for e in events_raw if str(e.get("id") or e.get("event_id") or "") == eid), {})
        home = ev.get("home_team") or ev.get("home") or eid
        away = ev.get("away_team") or ev.get("away") or "?"
        print(f"  [{eid}] {home} vs {away}: atk_diff={d['lineup_attack_diff']:+.1f} | h_atk={d['home_attack_quality']} a_atk={d['away_attack_quality']}")


if __name__ == "__main__":
    main()
