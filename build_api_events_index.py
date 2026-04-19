#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone

from fetch_data import ensure_token, fetch_url, load_existing_json, save_json, TZ, API_BASE

CURRENT_YEAR = datetime.now(timezone.utc).year
INDEX_FULL_HISTORY = str(os.getenv("API_INDEX_FULL_HISTORY", "1")).lower() not in ("0", "false", "no")
SEASON_LOOKBACK_YEARS = max(1, int(os.getenv("API_INDEX_LOOKBACK_YEARS", "3")))
MAX_SEASONS_TO_INDEX = max(50, int(os.getenv("API_INDEX_MAX_SEASONS", "1200")))


def season_year(row):
    try:
        return int(row.get("year"))
    except Exception:
        return None


def season_start_year(row):
    try:
        start_date = str(row.get("start_date") or "").strip()
        if len(start_date) >= 4:
            return int(start_date[:4])
    except Exception:
        pass
    return None


def is_future_season(row):
    y = season_year(row)
    sy = season_start_year(row)
    if y is not None and y > CURRENT_YEAR:
        return True
    if sy is not None and sy > CURRENT_YEAR:
        return True
    return False


def select_indexable_seasons(rows):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    rows = [r for r in rows if r.get("id")]
    rows = [r for r in rows if season_year(r) is not None]
    rows = [r for r in rows if not is_future_season(r)]

    if not INDEX_FULL_HISTORY:
        min_year = CURRENT_YEAR - SEASON_LOOKBACK_YEARS
        rows = [r for r in rows if int(r.get("year") or 0) >= min_year]

    rows.sort(
        key=lambda r: (
            int(r.get("year") or 0),
            str(r.get("league") or ""),
            int(r.get("id") or 0),
        ),
        reverse=True,
    )
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
    selected = select_indexable_seasons(valid_seasons)

    rows = []
    failures = []
    skipped_no_data = []

    for season in selected:
        season_id = season.get("id")
        if not season_id:
            continue

        try:
            meta = fetch_events_count_for_season(season_id)
        except Exception as exc:
            failures.append({
                "season_id": season_id,
                "season_name": season.get("name"),
                "league": season.get("league"),
                "year": season.get("year"),
                "error": str(exc),
            })
            print(f"Skip season {season_id} because events index fetch failed: {exc}")
            continue

        events_count = int(meta.get("events_count") or 0)
        sample_count = int(meta.get("sample_count") or 0)

        if events_count <= 0:
            skipped_no_data.append({
                "season_id": season_id,
                "season_name": season.get("name"),
                "league": season.get("league"),
                "year": season.get("year"),
                "error": "no events returned",
            })
            continue

        rows.append({
            "season_id": season_id,
            "season_name": season.get("name"),
            "league_id": season.get("league_id"),
            "league": season.get("league"),
            "year": season.get("year"),
            "start_date": season.get("start_date"),
            "end_date": season.get("end_date"),
            "events_count": events_count,
            "sample_count": sample_count,
            "pagination_supported": meta.get("pagination_supported"),
        })

    if not rows:
        cached_rows = load_existing_json("api_events_history_index.json", [])
        if cached_rows:
            rows = cached_rows
            print("Fallback to cached api_events_history_index.json because all live season count fetches failed")

    rows.sort(
        key=lambda r: (
            int(r.get("year") or 0),
            int(r.get("events_count") or 0),
            str(r.get("league") or ""),
        ),
        reverse=True,
    )

    summary = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "current_year": CURRENT_YEAR,
        "index_full_history": INDEX_FULL_HISTORY,
        "season_lookback_years": SEASON_LOOKBACK_YEARS,
        "selected_seasons_total": len(selected),
        "seasons_indexed": len(rows),
        "seasons_failed": len(failures),
        "seasons_skipped_no_data": len(skipped_no_data),
        "total_events_counted": sum(int(r.get("events_count") or 0) for r in rows),
        "max_events_in_season": max([int(r.get("events_count") or 0) for r in rows], default=0),
        "top_rows": rows[:25],
        "failed_seasons_preview": failures[:15],
        "skipped_no_data_preview": skipped_no_data[:15],
    }
    save_json(rows, "api_events_history_index.json")
    save_json(summary, "api_events_history_summary.json")
    save_json(failures, "api_events_history_failures.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("=== Done API events history index ===")


if __name__ == "__main__":
    main()
