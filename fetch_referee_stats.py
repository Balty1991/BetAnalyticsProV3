#!/usr/bin/env python3
"""
fetch_referee_stats.py — Referee Stats Cache | BSD API v2
==========================================================
Descarcă statisticile tuturor arbitrilor disponibili în API-ul BSD v2
și le salvează în data/referee_stats.json.

Statistici per arbitru:
  avg_yellow_per_match  — medie galben per meci (impact: cărți, over/under)
  avg_red_per_match     — medie roșu per meci
  avg_goals_per_match   — medie goluri per meci (impact: over/under, btts)
  avg_fouls_per_match   — medie faulturi per meci

Rulare:
  BSD_TOKEN=xxx python3 fetch_referee_stats.py

GitHub Actions: schedule săptămânal (luni dimineață).
Output: data/referee_stats.json  — dict keyed by referee_id (int)
"""

import os, json, time, sys
from pathlib import Path
from datetime import datetime, timezone

import requests

API_BASE   = "https://sports.bzzoiro.com"
V2_BASE    = f"{API_BASE}/api/v2"
TOKEN      = os.environ.get("BSD_TOKEN", "").strip()
DATA_DIR   = Path("data")
OUT_PATH   = DATA_DIR / "referee_stats.json"
DELAY      = float(os.environ.get("DELAY_MS", "250")) / 1000.0
PAGE_SIZE  = 200

HEADERS = {"Authorization": f"Token {TOKEN}"}


def ensure_token():
    if not TOKEN:
        print("ERROR: BSD_TOKEN nu este setat.", file=sys.stderr)
        sys.exit(1)


def get(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                wait = 5.0 * (2 ** attempt)
                print(f"  [rate-limit] aştept {wait:.0f}s...")
                time.sleep(wait)
                continue
            if r.status_code in (404, 400):
                return None
            time.sleep(1.0)
        except Exception as e:
            print(f"  [err] {url}: {e}")
            time.sleep(2.0)
    return None


def fetch_all_referees():
    """Fetch lista paginată de arbitri cu statistici aggregate."""
    print("Fetching referees list from /api/v2/referees/ ...")
    referees = []
    url = f"{V2_BASE}/referees/"
    params = {"limit": PAGE_SIZE, "offset": 0}
    total_pages = 0

    while url:
        data = get(url, params=params if "?" not in url else None)
        if not data:
            break
        total_pages += 1
        results = data.get("results") or []
        referees.extend(results)
        count = data.get("count", 0)
        next_url = data.get("next")
        if next_url:
            url = next_url
            params = None  # next URL are deja parametrii
        else:
            break
        time.sleep(DELAY)
        if total_pages % 5 == 0:
            print(f"  ... {len(referees)} arbitri fetchați până acum")

    print(f"Total arbitri fetchați: {len(referees)}")
    return referees


def build_referee_stats(referees):
    """
    Construiește dict {referee_id: stats} din lista de arbitri.
    Clasifică stilul arbitrului pe baza statisticilor.
    """
    stats = {}
    for ref in referees:
        ref_id = ref.get("id")
        if not ref_id:
            continue

        avg_yellow = _f(ref.get("avg_yellow_per_match"))
        avg_red    = _f(ref.get("avg_red_per_match"))
        avg_goals  = _f(ref.get("avg_goals_per_match"))
        avg_fouls  = _f(ref.get("avg_fouls_per_match"))
        matches    = int(ref.get("matches") or 0)

        # Clasificare stil arbitru (bazat pe percentile aproximative)
        style = classify_referee_style(avg_yellow, avg_goals, avg_fouls)

        stats[int(ref_id)] = {
            "id":                  int(ref_id),
            "name":                ref.get("name") or "",
            "country":             ref.get("country") or "",
            "matches":             matches,
            "avg_yellow":          avg_yellow,
            "avg_red":             avg_red,
            "avg_goals":           avg_goals,
            "avg_fouls":           avg_fouls,
            "style":               style,
            # Flag-uri utile pentru UI și ML
            "is_strict":           avg_yellow >= 4.5 if avg_yellow else None,
            "is_high_goals":       avg_goals >= 2.8 if avg_goals else None,
            "is_low_goals":        avg_goals <= 2.3 if avg_goals else None,
        }

    return stats


def _f(v):
    """Safe float."""
    try:
        out = float(v)
        return round(out, 3) if out is not None else None
    except Exception:
        return None


def classify_referee_style(avg_yellow, avg_goals, avg_fouls):
    """
    Clasificare simplă pe 3 dimensiuni: cărți, goluri, faulturi.
    Returnează string descriptiv pentru UI.
    """
    if avg_yellow is None:
        return "unknown"
    if avg_yellow >= 5.0:
        style = "strict"
    elif avg_yellow <= 3.0:
        style = "permissive"
    else:
        style = "balanced"

    if avg_goals is not None:
        if avg_goals >= 3.0:
            style += "_high_goals"
        elif avg_goals <= 2.1:
            style += "_low_goals"

    return style


def save_stats(stats):
    DATA_DIR.mkdir(exist_ok=True)
    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count":      len(stats),
        "referees":   stats,
    }
    tmp = OUT_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(OUT_PATH)
    print(f"Salvat: {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes, {len(stats)} arbitri)")


def print_summary(stats):
    """Printează câteva statistici globale pentru debugging."""
    refs = list(stats.values())
    if not refs:
        print("Nu s-au găsit arbitri.")
        return

    with_goals = [r for r in refs if r["avg_goals"] is not None]
    with_yellow = [r for r in refs if r["avg_yellow"] is not None]

    if with_goals:
        avg_g = sum(r["avg_goals"] for r in with_goals) / len(with_goals)
        print(f"  Medie globală gol/meci: {avg_g:.2f}")
    if with_yellow:
        avg_y = sum(r["avg_yellow"] for r in with_yellow) / len(with_yellow)
        print(f"  Medie globală galben/meci: {avg_y:.2f}")

    strict = sum(1 for r in refs if r.get("is_strict"))
    high_g = sum(1 for r in refs if r.get("is_high_goals"))
    print(f"  Arbitri stricți (≥4.5 galben): {strict}")
    print(f"  Arbitri cu goluri ridicate (≥2.8): {high_g}")

    # Top 5 după avg_goals
    top5 = sorted([r for r in refs if r["avg_goals"]], key=lambda x: -x["avg_goals"])[:5]
    print("\n  Top 5 arbitri (avg goluri):")
    for r in top5:
        print(f"    {r['name']} ({r['country']}): {r['avg_goals']} gol/meci, {r['avg_yellow']} galben/meci, {r['matches']} meciuri")


def fetch_referee_recent_trend(referee_id: int, career_avg_yellow: float, career_avg_goals: float) -> dict:
    """
    Fetchez ultimele 10 meciuri ale unui arbitru de la /api/v2/referees/{id}/matches/
    și calculez trendul recent vs medie carieră.

    Returns dict cu:
      recent_yellow_avg  — media galben ultimele 5 meciuri
      recent_goals_avg   — media goluri ultimele 5 meciuri
      yellow_trend       — recent_yellow_avg - career_avg_yellow (pozitiv = mai strict recent)
      goals_trend        — recent_goals_avg - career_avg_goals (pozitiv = mai multe goluri recent)
      trend_matches      — numărul de meciuri din trend
    """
    url = f"{V2_BASE}/referees/{referee_id}/matches/?limit=10"
    try:
        resp = requests.get(url, headers={"Authorization": f"Token {TOKEN}"}, timeout=10)
        if resp.status_code != 200:
            return {}
        data = resp.json()
    except Exception:
        return {}

    matches = data.get("results") or data if isinstance(data, list) else []
    if not matches:
        return {}

    # Ultimele 5 meciuri cu date complete
    recent = []
    for m in matches[:5]:
        stats = m.get("stats") or m
        yellow = stats.get("yellow_cards") or stats.get("yellow") or stats.get("total_yellow")
        goals  = stats.get("goals") or stats.get("total_goals")
        if yellow is not None and goals is not None:
            recent.append({"yellow": float(yellow), "goals": float(goals)})

    if not recent:
        return {}

    recent_yellow = round(sum(r["yellow"] for r in recent) / len(recent), 3)
    recent_goals  = round(sum(r["goals"]  for r in recent) / len(recent), 3)

    return {
        "recent_yellow_avg": recent_yellow,
        "recent_goals_avg":  recent_goals,
        "yellow_trend":      round(recent_yellow - (career_avg_yellow or 0), 3),
        "goals_trend":       round(recent_goals  - (career_avg_goals  or 0), 3),
        "trend_matches":     len(recent),
    }


def main():
    ensure_token()
    print(f"=== fetch_referee_stats.py | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} ===")

    referees = fetch_all_referees()
    if not referees:
        print("ERROR: Nu s-au putut fetcha arbitri.", file=sys.stderr)
        sys.exit(1)

    stats = build_referee_stats(referees)
    print(f"\nStatistici construite pentru {len(stats)} arbitri:")
    print_summary(stats)

    # Adaugă trend recent pentru primii 200 arbitri (cei cu cele mai multe meciuri)
    # Rate-limit friendly: max 200 calls, sleep 0.3s
    top_refs = sorted(stats.items(), key=lambda x: -(x[1].get("matches") or 0))[:200]
    print(f"\nFetching trend recent pentru {len(top_refs)} arbitri (top by matches)...")
    trend_count = 0
    for ref_id, ref_data in top_refs:
        trend = fetch_referee_recent_trend(
            ref_id,
            career_avg_yellow=ref_data.get("avg_yellow") or 0,
            career_avg_goals=ref_data.get("avg_goals") or 0,
        )
        if trend:
            stats[ref_id].update(trend)
            trend_count += 1
        time.sleep(0.3)

    print(f"Trend completat pentru {trend_count}/{len(top_refs)} arbitri")

    save_stats(stats)
    print("\nDone.")


if __name__ == "__main__":
    main()
