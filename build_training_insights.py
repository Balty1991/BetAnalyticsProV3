#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import load_existing_json, save_json, TZ


MIN_MATCHES = 120


def pick_insights(rows):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    rows = [r for r in rows if int(r.get("matches") or 0) >= MIN_MATCHES]
    insights = []
    for row in rows:
        league = row.get("league") or "Unknown"
        if float(row.get("over_15_rate") or 0) >= 78:
            insights.append({
                "league": league,
                "market": "Over1.5",
                "strength": round(float(row.get("over_15_rate") or 0), 2),
                "matches": int(row.get("matches") or 0),
                "reason": "baseline_over15_high",
            })
        if float(row.get("under_35_rate") or 0) >= 75:
            insights.append({
                "league": league,
                "market": "Under3.5",
                "strength": round(float(row.get("under_35_rate") or 0), 2),
                "matches": int(row.get("matches") or 0),
                "reason": "baseline_under35_high",
            })
        if float(row.get("btts_yes_rate") or 0) >= 58:
            insights.append({
                "league": league,
                "market": "BTTS",
                "strength": round(float(row.get("btts_yes_rate") or 0), 2),
                "matches": int(row.get("matches") or 0),
                "reason": "baseline_btts_high",
            })
        if float(row.get("home_win_rate") or 0) >= 52:
            insights.append({
                "league": league,
                "market": "1",
                "strength": round(float(row.get("home_win_rate") or 0), 2),
                "matches": int(row.get("matches") or 0),
                "reason": "baseline_home_bias",
            })
    insights.sort(key=lambda r: (float(r.get("strength") or 0), int(r.get("matches") or 0)), reverse=True)
    return insights


def main():
    baselines = load_existing_json("training_market_baselines.json", [])
    insights = pick_insights(baselines)
    summary = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "insights_total": len(insights),
        "min_matches": MIN_MATCHES,
        "top_insights": insights[:25],
    }
    save_json(insights, "training_insights.json")
    save_json(summary, "training_insights_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
