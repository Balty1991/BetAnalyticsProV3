"""
fetch_team_form_cache.py — VEYRA Team Form Layer
=================================================
Fetchează ultimele 10 meciuri terminate per echipă via /api/v2/teams/{id}/fixtures/?status=finished.
Citește events.json pentru team IDs (home + away per eveniment curent).

Produce data/team_form_cache.json cu forma directă per echipă:

  wins_last5, draws_last5, losses_last5         — ultimele 5 meciuri W/D/L
  goals_scored_last5, goals_conceded_last5       — goluri marcate/primite
  clean_sheets_last5                            — meciuri fără gol primit
  btts_last5                                    — meciuri cu ambele echipe au marcat
  form_string                                   — ex: "WWDLL" (cel mai recent primul)
  form_score                                    — 0-100 (calitatea formei curente)
  avg_goals_scored_last5                        — medie goluri marcate
  avg_goals_conceded_last5                      — medie goluri primite
  home_wins_last5, away_wins_last5              — W acasă vs deplasare

form_score = (puncte_liga_last5 / max_puncte) × 100
           + (goal_diff × 2.5)
           clamped 0-100
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

DATA_DIR     = Path("data")
CACHE_PATH   = DATA_DIR / "team_form_cache.json"
V2_BASE      = "https://sports.bzzoiro.com/api/v2/"
FORM_MATCHES = 5      # meciuri luate în calcul pentru form_score
FETCH_LIMIT  = 10     # câte meciuri să fetchezi per echipă
FORM_TTL_H   = 6.0    # re-fetch la 6h (forma se schimbă după fiecare meci)
MAX_TEAMS    = 60     # max team ID-uri per run


def _token() -> str:
    t = os.environ.get("BSD_TOKEN", "")
    if not t:
        raise SystemExit("BSD_TOKEN lipsă")
    return t


def load_json(path: Path, default=None) -> Any:
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stale(entry: Dict, ttl_h: float = FORM_TTL_H) -> bool:
    ts = entry.get("fetched_at") or ""
    if not ts:
        return True
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(
            ts.replace("Z", "+00:00"))).total_seconds() / 3600.0
        return age > ttl_h
    except Exception:
        return True


def _get(endpoint: str, token: str, retries: int = 2) -> Optional[Any]:
    url = V2_BASE + endpoint.lstrip("/")
    headers = {"Authorization": f"Token {token}", "Accept": "application/json"}
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=14)
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


def _collect_team_ids(events_raw: List) -> List[str]:
    """Extrage ID-urile echipelor acasă și deplasare din evenimentele curente."""
    seen = []
    for ev in events_raw:
        for k in ("home_team_id", "home_api_id", "away_team_id", "away_api_id",
                  "home_id", "away_id"):
            v = str(ev.get(k) or "")
            if v and v not in seen:
                seen.append(v)
    return seen


def _parse_fixtures(raw: Any, team_id: str) -> Dict[str, Any]:
    """
    Parsează răspunsul /api/v2/teams/{id}/fixtures/?status=finished.
    Returnează forma agregată.
    """
    if not isinstance(raw, dict) and not isinstance(raw, list):
        return {}

    # API poate returna direct lista sau sub o cheie
    matches = []
    if isinstance(raw, list):
        matches = raw
    elif isinstance(raw, dict):
        matches = (raw.get("results") or raw.get("fixtures") or
                   raw.get("matches") or raw.get("data") or [])

    if not isinstance(matches, list) or not matches:
        return {}

    # Sortăm descrescător după dată (cel mai recent primul)
    def _mdate(m):
        return str(m.get("date") or m.get("event_date") or m.get("start_time") or "")
    matches = sorted(matches, key=_mdate, reverse=True)

    results = []
    for m in matches[:FETCH_LIMIT]:
        if not isinstance(m, dict):
            continue
        # Determinăm dacă echipa a jucat acasă sau deplasare
        home_id = str(m.get("home_team_id") or m.get("home_id") or "")
        away_id = str(m.get("away_team_id") or m.get("away_id") or "")
        is_home = (home_id == team_id)

        hs = m.get("home_score") if m.get("home_score") is not None else m.get("score_home")
        aw = m.get("away_score") if m.get("away_score") is not None else m.get("score_away")
        try:
            hs = int(hs); aw = int(aw)
        except Exception:
            continue

        scored    = hs if is_home else aw
        conceded  = aw if is_home else hs
        total     = hs + aw
        result    = "W" if scored > conceded else ("D" if scored == conceded else "L")
        cs        = (conceded == 0)
        btts      = (hs > 0 and aw > 0)
        results.append({
            "result": result, "scored": scored, "conceded": conceded,
            "total": total, "cs": cs, "btts": btts, "is_home": is_home
        })

    if not results:
        return {}

    last5 = results[:FORM_MATCHES]
    last10 = results[:FETCH_LIMIT]

    def _agg(rlist):
        wins    = sum(1 for r in rlist if r["result"] == "W")
        draws   = sum(1 for r in rlist if r["result"] == "D")
        losses  = sum(1 for r in rlist if r["result"] == "L")
        scored  = sum(r["scored"]   for r in rlist)
        conced  = sum(r["conceded"] for r in rlist)
        cs      = sum(1 for r in rlist if r["cs"])
        btts    = sum(1 for r in rlist if r["btts"])
        n       = len(rlist)
        # Form score: league points ratio (W=3pts, D=1pt)
        pts     = wins * 3 + draws
        max_pts = n * 3
        pts_pct = (pts / max_pts * 100) if max_pts else 50.0
        gdiff   = scored - conced
        form_score = round(max(0.0, min(100.0, pts_pct * 0.70 + gdiff * 2.5 + 15)), 1)
        return {
            "wins": wins, "draws": draws, "losses": losses,
            "goals_scored": scored, "goals_conceded": conced,
            "clean_sheets": cs, "btts": btts,
            "avg_scored": round(scored / n, 2) if n else 0,
            "avg_conceded": round(conced / n, 2) if n else 0,
            "form_score": form_score,
        }

    a5 = _agg(last5)
    form_str = "".join(r["result"] for r in last5)
    home_wins5 = sum(1 for r in last5 if r["result"] == "W" and r["is_home"])
    away_wins5 = sum(1 for r in last5 if r["result"] == "W" and not r["is_home"])

    return {
        "wins_last5":            a5["wins"],
        "draws_last5":           a5["draws"],
        "losses_last5":          a5["losses"],
        "goals_scored_last5":    a5["goals_scored"],
        "goals_conceded_last5":  a5["goals_conceded"],
        "clean_sheets_last5":    a5["clean_sheets"],
        "btts_last5":            a5["btts"],
        "avg_goals_scored_last5":a5["avg_scored"],
        "avg_goals_conceded_last5": a5["avg_conceded"],
        "form_score":            a5["form_score"],
        "form_string":           form_str,
        "home_wins_last5":       home_wins5,
        "away_wins_last5":       away_wins5,
        "matches_used":          len(last5),
        "fetched_at":            now_iso(),
    }


def main():
    token = _token()
    DATA_DIR.mkdir(exist_ok=True)

    events_raw = load_json(DATA_DIR / "events.json", {})
    if isinstance(events_raw, dict):
        events_raw = events_raw.get("events") or []
    if not isinstance(events_raw, list):
        events_raw = []

    cache = load_json(CACHE_PATH, {}) or {}
    if not isinstance(cache, dict):
        cache = {}
    store: Dict[str, Dict] = cache.get("teams") or {}

    team_ids = _collect_team_ids(events_raw)
    print(f"Team form: {len(events_raw)} events → {len(team_ids)} team IDs unice")

    to_fetch = [tid for tid in team_ids if tid not in store or _stale(store[tid])]
    to_fetch = to_fetch[:MAX_TEAMS]
    print(f"  De fetchat: {len(to_fetch)} echipe (limita {MAX_TEAMS}/run)")

    ok_count = 0
    for idx, tid in enumerate(to_fetch, 1):
        raw = _get(f"teams/{tid}/fixtures/?status=finished&limit={FETCH_LIMIT}", token)
        if raw is not None:
            form = _parse_fixtures(raw, tid)
            if form:
                store[tid] = form
                ok_count += 1
            else:
                store[tid] = {"fetched_at": now_iso(), "form_score": 50.0}
        else:
            store[tid] = {"fetched_at": now_iso(), "form_score": 50.0}
        if idx % 10 == 0:
            print(f"  {idx}/{len(to_fetch)} procesate")
        time.sleep(0.15)

    print(f"  Forma parseată pentru {ok_count}/{len(to_fetch)} echipe")

    # Top 3 echipe în formă
    scored_teams = [(tid, d) for tid, d in store.items() if d.get("form_string")]
    scored_teams.sort(key=lambda x: x[1].get("form_score", 0), reverse=True)
    for tid, d in scored_teams[:3]:
        ev = next((e for e in events_raw if str(e.get("home_team_id") or e.get("home_id") or "") == tid
                   or str(e.get("away_team_id") or e.get("away_id") or "") == tid), {})
        name = ev.get("home_team") if str(ev.get("home_team_id") or "") == tid else ev.get("away_team") or tid
        print(f"  {name}: form_score={d['form_score']} | {d['form_string']} | "
              f"scored={d.get('avg_goals_scored_last5',0):.1f} conced={d.get('avg_goals_conceded_last5',0):.1f}")

    payload = {
        "updated_at": now_iso(),
        "teams_count": len(store),
        "fetched_this_run": ok_count,
        "teams": store,
    }
    save_json(CACHE_PATH, payload)
    print(f"✅ Salvat {CACHE_PATH}: {len(store)} echipe")


if __name__ == "__main__":
    main()
