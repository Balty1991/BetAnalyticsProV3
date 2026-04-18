#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import ensure_token, fetch_all_pages, load_existing_json, save_json, TZ


MAX_TRAINING_SEASONS = 24
MAX_TRAINING_ROWS = 15000
MIN_SEASON_YEAR = datetime.now(timezone.utc).year - 2


def bool01(value):
    return 1 if value else 0


def select_training_seasons(rows):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    rows = [r for r in rows if int(r.get("year") or 0) >= MIN_SEASON_YEAR]
    rows.sort(key=lambda r: (int(r.get("year") or 0), int(r.get("events_count") or 0), str(r.get("league") or "")), reverse=True)
    return rows[:MAX_TRAINING_SEASONS]


def normalize_training_row(event, season_meta):
    event = event or {}
    home_score = event.get("home_score")
    away_score = event.get("away_score")
    if home_score is None or away_score is None:
        return None
    try:
        home_score = int(home_score)
        away_score = int(away_score)
    except Exception:
        return None
    total_goals = home_score + away_score
    return {
        "event_id": event.get("id"),
        "date": event.get("date"),
        "status": event.get("status"),
        "league_id": season_meta.get("league_id"),
        "league": season_meta.get("league"),
        "season_id": season_meta.get("season_id"),
        "season_name": season_meta.get("season_name"),
        "season_year": season_meta.get("year"),
        "home_team": event.get("home_team"),
        "away_team": event.get("away_team"),
        "home_score": home_score,
        "away_score": away_score,
        "total_goals": total_goals,
        "result_1x2": "1" if home_score > away_score else ("2" if away_score > home_score else "X"),
        "home_win": bool01(home_score > away_score),
        "draw": bool01(home_score == away_score),
        "away_win": bool01(away_score > home_score),
        "btts_yes": bool01(home_score > 0 and away_score > 0),
        "over_15": bool01(total_goals >= 2),
        "over_25": bool01(total_goals >= 3),
        "under_35": bool01(total_goals <= 3),
    }


def main():
    ensure_token()
    print("=== Build training dataset ===")
    index_rows = load_existing_json("api_events_history_index.json", [])
    seasons = select_training_seasons(index_rows)
    dataset = []

    for season in seasons:
        season_id = season.get("season_id")
        if not season_id:
            continue
        events = fetch_all_pages(f"/api/events/?season={season_id}&tz={TZ}")
        for event in events or []:
            row = normalize_training_row(event, season)
            if row:
                dataset.append(row)
            if len(dataset) >= MAX_TRAINING_ROWS:
                break
        if len(dataset) >= MAX_TRAINING_ROWS:
            break

    dataset.sort(key=lambda r: (r.get("date") or "", r.get("event_id") or 0), reverse=True)
    summary = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "min_season_year": MIN_SEASON_YEAR,
        "seasons_selected": len(seasons),
        "rows_total": len(dataset),
        "rows_limit": MAX_TRAINING_ROWS,
        "markets_ready": ["1X2", "BTTS", "Over1.5", "Over2.5", "Under3.5"],
        "leagues": sorted(list({str(r.get("league") or "") for r in dataset if r.get("league")})),
    }
    save_json(dataset, "training_matches.json")
    save_json(summary, "training_dataset_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("=== Done training dataset ===")


if __name__ == "__main__":
    main()
