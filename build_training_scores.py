#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import load_existing_json, save_json, TZ


MIN_SCORING_MATCHES = 120


def pct(part, total):
    return round((float(part) / float(total)) * 100.0, 2) if total else 0.0


def build_league_baselines(rows):
    grouped = {}
    for row in rows or []:
        league = row.get("league") or "Unknown"
        grouped.setdefault(league, []).append(row)

    out = []
    for league, items in grouped.items():
        total = len(items)
        home_win = sum(int(r.get("home_win") or 0) for r in items)
        draw = sum(int(r.get("draw") or 0) for r in items)
        away_win = sum(int(r.get("away_win") or 0) for r in items)
        btts = sum(int(r.get("btts_yes") or 0) for r in items)
        over15 = sum(int(r.get("over_15") or 0) for r in items)
        over25 = sum(int(r.get("over_25") or 0) for r in items)
        under35 = sum(int(r.get("under_35") or 0) for r in items)
        avg_goals = round(sum(float(r.get("total_goals") or 0) for r in items) / total, 3) if total else 0.0
        out.append({
            "league": league,
            "matches": total,
            "avg_goals": avg_goals,
            "home_win_rate": pct(home_win, total),
            "draw_rate": pct(draw, total),
            "away_win_rate": pct(away_win, total),
            "btts_yes_rate": pct(btts, total),
            "over_15_rate": pct(over15, total),
            "over_25_rate": pct(over25, total),
            "under_35_rate": pct(under35, total),
            "eligible_for_scoring": total >= MIN_SCORING_MATCHES,
        })
    out.sort(key=lambda r: (int(r.get("matches") or 0), r.get("league") or ""), reverse=True)
    return out


def build_summary(rows, all_baselines, eligible_baselines):
    total = len(rows)
    excluded = [r for r in all_baselines if not r.get("eligible_for_scoring")]
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "min_scoring_matches": MIN_SCORING_MATCHES,
        "matches_total": total,
        "leagues_total_raw": len(all_baselines),
        "leagues_total_eligible": len(eligible_baselines),
        "leagues_below_threshold": len(excluded),
        "avg_goals_total": round(sum(float(r.get("total_goals") or 0) for r in rows) / total, 3) if total else 0.0,
        "home_win_rate_total": pct(sum(int(r.get("home_win") or 0) for r in rows), total),
        "draw_rate_total": pct(sum(int(r.get("draw") or 0) for r in rows), total),
        "away_win_rate_total": pct(sum(int(r.get("away_win") or 0) for r in rows), total),
        "btts_yes_rate_total": pct(sum(int(r.get("btts_yes") or 0) for r in rows), total),
        "over_15_rate_total": pct(sum(int(r.get("over_15") or 0) for r in rows), total),
        "over_25_rate_total": pct(sum(int(r.get("over_25") or 0) for r in rows), total),
        "under_35_rate_total": pct(sum(int(r.get("under_35") or 0) for r in rows), total),
        "top_leagues": eligible_baselines[:15],
        "excluded_leagues_preview": excluded[:10],
    }


def main():
    rows = load_existing_json("training_matches.json", [])
    all_baselines = build_league_baselines(rows)
    eligible_baselines = [r for r in all_baselines if r.get("eligible_for_scoring")]
    summary = build_summary(rows, all_baselines, eligible_baselines)
    save_json(eligible_baselines, "training_market_baselines.json")
    save_json(summary, "training_scoring_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
