#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import ensure_token, fetch_all_pages, save_json, TZ


CURRENT_YEAR = datetime.now(timezone.utc).year
VALID_MAX_YEAR = CURRENT_YEAR + 1
VALID_MAX_DATE_YEAR = CURRENT_YEAR + 2


def to_int(value):
    try:
        return int(value)
    except Exception:
        return None


def year_from_date(value):
    try:
        return int(str(value)[:4])
    except Exception:
        return None


def normalize_season(row):
    row = row or {}
    return {
        "id": row.get("id"),
        "league": row.get("league"),
        "league_id": row.get("league_id"),
        "name": row.get("name"),
        "year": to_int(row.get("year")),
        "start_date": row.get("start_date"),
        "end_date": row.get("end_date"),
        "is_current": bool(row.get("is_current")),
    }


def classify_season(row):
    year = row.get("year")
    start_year = year_from_date(row.get("start_date"))
    end_year = year_from_date(row.get("end_date"))
    reasons = []
    if year is not None and year > VALID_MAX_YEAR:
        reasons.append("future_year")
    if start_year is not None and start_year > VALID_MAX_DATE_YEAR:
        reasons.append("future_start_date")
    if end_year is not None and end_year > VALID_MAX_DATE_YEAR:
        reasons.append("future_end_date")
    if year is not None and year < 1900:
        reasons.append("implausible_old_year")
    row = dict(row)
    row["is_valid_historical"] = not reasons
    row["anomaly_reasons"] = reasons
    return row


def build_league_summary(seasons):
    grouped = {}
    for row in seasons or []:
        key = str(row.get("league_id") or row.get("league") or "unknown")
        grouped.setdefault(key, []).append(row)

    out = []
    for key, rows in grouped.items():
        years = sorted([r.get("year") for r in rows if r.get("year") is not None])
        starts = sorted([r.get("start_date") for r in rows if r.get("start_date")])
        ends = sorted([r.get("end_date") for r in rows if r.get("end_date")])
        current = [r for r in rows if r.get("is_current")]
        rows_sorted = sorted(rows, key=lambda r: ((r.get("year") or 0), r.get("start_date") or "", r.get("id") or 0), reverse=True)
        out.append({
            "league_key": key,
            "league_id": rows_sorted[0].get("league_id"),
            "league": rows_sorted[0].get("league"),
            "seasons_count": len(rows),
            "current_seasons_count": len(current),
            "first_year": years[0] if years else None,
            "last_year": years[-1] if years else None,
            "first_start_date": starts[0] if starts else None,
            "last_end_date": ends[-1] if ends else None,
            "latest_season_name": rows_sorted[0].get("name"),
            "latest_season_id": rows_sorted[0].get("id"),
            "years": years,
        })
    out.sort(key=lambda r: ((r.get("seasons_count") or 0), r.get("league") or ""), reverse=True)
    return out


def build_api_history_summary(raw_seasons, valid_seasons, league_summary_valid, anomalies):
    raw_years = sorted([r.get("year") for r in raw_seasons if r.get("year") is not None])
    valid_years = sorted([r.get("year") for r in valid_seasons if r.get("year") is not None])
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "source": "bsd_api_seasons",
        "current_year": CURRENT_YEAR,
        "validation_rules": {
            "valid_max_year": VALID_MAX_YEAR,
            "valid_max_date_year": VALID_MAX_DATE_YEAR,
        },
        "raw": {
            "seasons_total": len(raw_seasons),
            "coverage_start_year": raw_years[0] if raw_years else None,
            "coverage_end_year": raw_years[-1] if raw_years else None,
        },
        "valid": {
            "seasons_total": len(valid_seasons),
            "leagues_total": len(league_summary_valid),
            "coverage_start_year": valid_years[0] if valid_years else None,
            "coverage_end_year": valid_years[-1] if valid_years else None,
            "max_seasons_in_one_league": max([int(r.get("seasons_count") or 0) for r in league_summary_valid], default=0),
            "top_leagues": league_summary_valid[:20],
        },
        "anomalies_total": len(anomalies),
    }


def main():
    ensure_token()
    print("=== Build API history catalog ===")
    seasons_raw = fetch_all_pages("/api/seasons/")
    seasons = [classify_season(normalize_season(row)) for row in seasons_raw if isinstance(row, dict)]
    seasons.sort(key=lambda r: ((r.get("league") or ""), (r.get("year") or 0), r.get("start_date") or "", r.get("id") or 0), reverse=True)

    valid_seasons = [r for r in seasons if r.get("is_valid_historical")]
    anomalies = [r for r in seasons if not r.get("is_valid_historical")]
    league_summary_valid = build_league_summary(valid_seasons)
    summary = build_api_history_summary(seasons, valid_seasons, league_summary_valid, anomalies)

    save_json(seasons, "api_seasons_history.json")
    save_json(valid_seasons, "api_seasons_history_valid.json")
    save_json(anomalies, "api_history_anomalies.json")
    save_json(league_summary_valid, "api_history_leagues.json")
    save_json(summary, "api_history_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("=== Done API history catalog ===")


if __name__ == "__main__":
    main()
