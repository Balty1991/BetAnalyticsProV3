"""
fetch_social_news_cache.py — VEYRA Social News Risk Layer
==========================================================
Fetchează știri editoriale + tweet-uri oficiale pentru meciurile curente.
Sursa: /api/v2/social/?event={id}&type=news&since={48h_ago}
       /api/v2/social/?team={id}&type=tweet&since={48h_ago}

Analizează conținut pentru semnale de risc pre-meci (keyword scoring):
  - Accidentări: injury, accidentat, doubt, out, unavailable, knock, hamstring
  - Suspendări:  suspended, suspendat, ban, red card, cumulative
  - Incertitudine lot: uncertain lineup, rotation, late decision, squad news
  - Risc moral:  unpaid, protest, scandal, unrest, crisis, sacked

Produce:
  data/social_news_cache.json

Câmpuri per eveniment (event_id → news_dict):
  news_risk_score       — 0.0-1.0 risc agregat din știri
  injury_risk           — 0.0-1.0 risc accidentări
  suspension_risk       — 0.0-1.0 risc suspendări
  lineup_uncertainty    — 0.0-1.0 incertitudine lot
  morale_risk           — 0.0-1.0 risc moral/intern
  news_count            — număr știri găsite
  news_items            — lista știrilor relevante (titlu, tip, echipă)
  fetched_at            — timestamp
"""

import os
import json
import time
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import requests

# ─── Config ───────────────────────────────────────────────────────────────────
DATA_DIR      = Path("data")
CACHE_PATH    = DATA_DIR / "social_news_cache.json"
V2_BASE       = "https://sports.bzzoiro.com/api/v2/"
NEWS_TTL_HOURS = 3.0       # știrile sunt recente — re-fetch des
MAX_EVENTS_PER_RUN = 30    # rate limit friendly
NEWS_LOOKBACK_HOURS = 48   # ultimele 48h de știri

# ─── Keyword risk banks ───────────────────────────────────────────────────────
INJURY_KW = [
    "injur", "accidentat", "accidentare", "doubt", "doubtful", "out", "unavailable",
    "miss", "missed", "misses", "absence", "absent", "fitness concern",
    "hamstring", "knee", "ankle", "muscle", "strain", "knock", "setback",
    "recuper", "recover", "rehab", "scan", "assessment", "worry", "concern",
    "fractur", "sidelid", "sidelined", "ruled out", "late fitness",
]
SUSPENSION_KW = [
    "suspend", "suspendat", "ban", "banned", "red card", "carton rosu",
    "cumulative", "yellow card", "booking", "sanction", "disciplin",
]
LINEUP_UNC_KW = [
    "uncertain lineup", "rotation", "rotate", "late decision", "squad news",
    "monitor", "assess", "test", "reserve", "rested", "fresh legs",
    "schimba", "echipa", "lot incert", "nesigur", "poate juca",
]
MORALE_KW = [
    "unpaid", "protest", "scandal", "unrest", "crisis", "sacked", "fired",
    "resign", "quit", "conflict", "salary", "wage", "strike",
    "nemultumire", "conflict intern", "plecare", "demisie",
]

# Greutăți per categorie
WEIGHTS = {
    "injury":     0.40,   # cel mai impactant
    "suspension": 0.30,
    "lineup_unc": 0.20,
    "morale":     0.10,
}


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


def _since_iso(hours: float = NEWS_LOOKBACK_HOURS) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_get(endpoint: str, token: str, retries: int = 2) -> Optional[Any]:
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
                time.sleep(1.2)
    return None


def _is_stale(entry: Dict, ttl_hours: float = NEWS_TTL_HOURS) -> bool:
    ts = entry.get("fetched_at") or ""
    if not ts:
        return True
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(
            ts.replace("Z", "+00:00"))).total_seconds() / 3600.0
        return age > ttl_hours
    except Exception:
        return True


# ─── Keyword scoring ─────────────────────────────────────────────────────────

def _hit_count(text: str, keywords: List[str]) -> int:
    t = text.lower()
    return sum(1 for kw in keywords if kw in t)


def _risk_score_from_hits(hits: int) -> float:
    """Convertește numărul de keyword hits într-un score 0-1."""
    if hits == 0: return 0.0
    if hits == 1: return 0.30
    if hits == 2: return 0.55
    if hits == 3: return 0.75
    return min(1.0, 0.75 + (hits - 3) * 0.08)


def analyze_news_item(item: Dict) -> Dict[str, Any]:
    """Analizează un singur news item și returnează riscurile per categorie."""
    title = str(item.get("title") or item.get("headline") or "")
    body  = str(item.get("body") or item.get("content") or item.get("text") or "")
    text  = (title + " " + body).lower()
    # Curățare HTML basic
    text  = re.sub(r"<[^>]+>", " ", text)

    return {
        "title":       title[:120],
        "injury_hits":     _hit_count(text, INJURY_KW),
        "suspension_hits": _hit_count(text, SUSPENSION_KW),
        "lineup_unc_hits": _hit_count(text, LINEUP_UNC_KW),
        "morale_hits":     _hit_count(text, MORALE_KW),
        "source": item.get("source") or item.get("type") or "news",
        "published_at": str(item.get("published_at") or item.get("date") or "")[:19],
    }


def aggregate_news_risks(items: List[Dict]) -> Dict[str, Any]:
    """Agregă riscurile dintr-o listă de news items într-un score final."""
    if not items:
        return {
            "news_risk_score": 0.0,
            "injury_risk": 0.0,
            "suspension_risk": 0.0,
            "lineup_uncertainty": 0.0,
            "morale_risk": 0.0,
            "news_count": 0,
            "news_items": [],
        }

    total_injury = sum(x["injury_hits"]     for x in items)
    total_susp   = sum(x["suspension_hits"] for x in items)
    total_lunc   = sum(x["lineup_unc_hits"] for x in items)
    total_mor    = sum(x["morale_hits"]     for x in items)

    inj_score  = _risk_score_from_hits(total_injury)
    susp_score = _risk_score_from_hits(total_susp)
    lunc_score = _risk_score_from_hits(total_lunc)
    mor_score  = _risk_score_from_hits(total_mor)

    composite = (
        inj_score  * WEIGHTS["injury"]     +
        susp_score * WEIGHTS["suspension"] +
        lunc_score * WEIGHTS["lineup_unc"] +
        mor_score  * WEIGHTS["morale"]
    )

    # Items relevante (cu cel puțin un hit)
    relevant = [x for x in items if (x["injury_hits"] + x["suspension_hits"] + x["lineup_unc_hits"] + x["morale_hits"]) > 0]
    relevant.sort(key=lambda x: x["injury_hits"] + x["suspension_hits"], reverse=True)

    return {
        "news_risk_score":    round(min(1.0, composite), 4),
        "injury_risk":        round(inj_score,  3),
        "suspension_risk":    round(susp_score, 3),
        "lineup_uncertainty": round(lunc_score, 3),
        "morale_risk":        round(mor_score,  3),
        "news_count":         len(items),
        "news_items":         relevant[:5],  # top 5 relevante
    }


# ─── Fetch per event ─────────────────────────────────────────────────────────

def fetch_event_news(eid: str, team_ids: List[str], token: str) -> Dict[str, Any]:
    """Fetchează news + tweets pentru un eveniment și calculează riscul."""
    since = _since_iso(NEWS_LOOKBACK_HOURS)
    raw_items = []

    # 1. News legate direct de eveniment
    event_news = _safe_get(f"social/?event={eid}&type=news&since={since}", token)
    if isinstance(event_news, list):
        raw_items.extend(event_news)
    elif isinstance(event_news, dict):
        raw_items.extend(event_news.get("results") or event_news.get("items") or [])

    # 2. Tweets oficiale ale echipelor (pot conține anunțuri accidentări)
    for tid in team_ids[:2]:  # max 2 echipe per eveniment
        team_tweets = _safe_get(f"social/?team={tid}&type=tweet&since={since}", token)
        if isinstance(team_tweets, list):
            raw_items.extend(team_tweets)
        elif isinstance(team_tweets, dict):
            raw_items.extend(team_tweets.get("results") or team_tweets.get("items") or [])
        time.sleep(0.12)

    # Analizăm fiecare item
    analyzed = [analyze_news_item(item) for item in raw_items if isinstance(item, dict)]
    result = aggregate_news_risks(analyzed)
    result["fetched_at"] = now_iso()
    result["raw_count"] = len(raw_items)
    return result


def _extract_team_ids(ev: Dict) -> List[str]:
    """Extrage home_team_id și away_team_id din eveniment."""
    ids = []
    for key in ("home_team_id", "home_id", "away_team_id", "away_id",
                "home_api_id", "away_api_id"):
        v = ev.get(key)
        if v:
            ids.append(str(v))
    return list(dict.fromkeys(ids))[:2]  # deduplicate, max 2


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    token = _get_token()
    DATA_DIR.mkdir(exist_ok=True)

    events_raw = load_json(DATA_DIR / "events.json", {})
    if isinstance(events_raw, dict):
        events_raw = events_raw.get("events") or []
    if not isinstance(events_raw, list):
        events_raw = []

    cache = load_json(CACHE_PATH, {}) or {}
    if not isinstance(cache, dict):
        cache = {}
    entries: Dict[str, Dict] = cache.get("events") or {}
    if not isinstance(entries, Dict):
        entries = {}

    # Queue: events care nu sunt în cache sau au news vechi (>3h)
    queue = []
    for ev in events_raw:
        eid = str(ev.get("id") or ev.get("event_id") or "")
        if not eid:
            continue
        existing = entries.get(eid)
        if existing is None or _is_stale(existing):
            queue.append(ev)

    queue = queue[:MAX_EVENTS_PER_RUN]
    print(f"Social news: {len(events_raw)} events → {len(queue)} de fetchat (limita {MAX_EVENTS_PER_RUN})")

    total_news = 0
    total_risk = 0
    for idx, ev in enumerate(queue, 1):
        eid = str(ev.get("id") or ev.get("event_id") or "")
        team_ids = _extract_team_ids(ev)
        try:
            result = fetch_event_news(eid, team_ids, token)
            entries[eid] = result
            total_news += result.get("news_count", 0)
            total_risk += result.get("news_risk_score", 0)
        except Exception as exc:
            entries[eid] = {"fetched_at": now_iso(), "news_risk_score": 0.0, "error": str(exc)}
        if idx % 10 == 0:
            print(f"  {idx}/{len(queue)} procesate")
        time.sleep(0.15)

    avg_risk = total_risk / len(queue) if queue else 0.0
    print(f"  Total: {total_news} știri, risc mediu {avg_risk:.3f}")

    # Events cu risc ridicat
    high_risk = [(eid, e) for eid, e in entries.items() if float(e.get("news_risk_score") or 0) >= 0.45]
    high_risk.sort(key=lambda x: x[1].get("news_risk_score", 0), reverse=True)
    if high_risk:
        print(f"  ⚠️ {len(high_risk)} events cu news_risk ≥ 0.45:")
        for eid, e in high_risk[:3]:
            ev_obj = next((x for x in events_raw if str(x.get("id") or x.get("event_id") or "") == eid), {})
            print(f"    [{eid}] {ev_obj.get('home_team', '?')} vs {ev_obj.get('away_team', '?')} — risk={e['news_risk_score']:.3f} (inj={e.get('injury_risk',0):.2f} susp={e.get('suspension_risk',0):.2f})")
            for item in (e.get("news_items") or [])[:2]:
                print(f"      → \"{item.get('title', '—')[:80]}\"")

    payload = {
        "updated_at": now_iso(),
        "events_count": len(entries),
        "fetched_this_run": len(queue),
        "avg_risk": round(avg_risk, 4),
        "events": entries,
    }
    save_json(CACHE_PATH, payload)
    print(f"✅ Salvat {CACHE_PATH}: {len(entries)} events")


if __name__ == "__main__":
    main()
