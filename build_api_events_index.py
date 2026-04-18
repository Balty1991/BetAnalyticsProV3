#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import ensure_token, fetch_url, load_existing_json, save_json, TZ, API_BASE


CURRENT_YEAR = datetime.now(timezone.utc).year
SEASON_LOOKBACK_YEARS = 3
MAX_SEASONS_TO_INDEX = 120


def select_recent_valid_seasons(rows):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    rows = [r for r in rows if r.get("year") is not None and int(r.get("year")) >= (CURRENT_YEAR - SEASON_LOOKBACK_YEARS)]
    rows.sort(key=lambda r: (int(r.get("year") or 0), str(r.get("league") or ""), int(r.get("id") or 0)), reverse=True)
    return rows[:MAX_SEASONS_TO_INDEX]


def fetch_events_count_for_season(season_id):
    url = f"{API_BASE}/api/events/?season={season_id}&tz={TZ}&page=1"
    data = fetch_url(url)
    if isinstance(data, dict):
        results = data.get("results") or []
        return {
            "season_id": season_id,
            "events_count": int(data.get("count") or len(results)),
            "sample_count": len(results),
            "pagination_supported": "count" in data,
        }
    if isinstance(data, list):
        return {
            "season_id": season_id,
            "events_count": len(data),
            "sample_count": len(data),
            "pagination_supported": False,
        }
    return {
        "season_id": season_id,
        "events_count": 0,
        "sample_count": 0,
        "pagination_supported": False,
    }


def main():
    ensure_token()
    print("=== Build API events history index ===")
    valid_seasons = load_existing_json("api_seasons_history_valid.json", [])
    selected = select_recent_valid_seasons(valid_seasons)
    rows = []
    for season in selected:
        season_id = season.get("id")
        if not season_id:
            continue
        meta = fetch_events_count_for_season(season_id)
        rows.append({
            "season_id": season_id,
            "season_name": season.get("name"),
            "league_id": season.get("league_id"),
            "league": season.get("league"),
            "year": season.get("year"),
            "start_date": season.get("start_date"),
            "end_date": season.get("end_date"),
            "events_count": meta.get("events_count"),
            "sample_count": meta.get("sample_count"),
            "pagination_supported": meta.get("pagination_supported"),
        })
    rows.sort(key=lambda r: (int(r.get("year") or 0), int(r.get("events_count") or 0)), reverse=True)
    summary = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "season_lookback_years": SEASON_LOOKBACK_YEARS,
        "seasons_indexed": len(rows),
        "total_events_counted": sum(int(r.get("events_count") or 0) for r in rows),
        "max_events_in_season": max([int(r.get("events_count") or 0) for r in rows], default=0),
        "top_rows": rows[:25],
    }
    save_json(rows, "api_events_history_index.json")
    save_json(summary, "api_events_history_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("=== Done API events history index ===")


if __name__ == "__main__":
    main()
