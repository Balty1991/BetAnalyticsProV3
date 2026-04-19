#!/usr/bin/env python3
import json
from collections import defaultdict, deque
from datetime import datetime, timezone

from fetch_data import load_existing_json, save_json, TZ

MAX_TEAM_HISTORY = 8
MIN_HISTORY_FOR_MODEL = 3
FULL_HISTORY_FOR_MODEL = 5


def to_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def to_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def pct(part, total):
    return round((float(part) / float(total)) * 100.0, 2) if total else 0.0


def avg(values):
    values = [to_float(v) for v in values]
    return round(sum(values) / len(values), 3) if values else 0.0


def make_team_hist_row(row, team_side):
    is_home = team_side == "home"
    goals_for = to_int(row.get("home_score") if is_home else row.get("away_score"))
    goals_against = to_int(row.get("away_score") if is_home else row.get("home_score"))
    win = 1 if goals_for > goals_against else 0
    draw = 1 if goals_for == goals_against else 0
    points = 3 if win else (1 if draw else 0)
    return {
        "date": row.get("date"),
        "goals_for": goals_for,
        "goals_against": goals_against,
        "goal_diff": goals_for - goals_against,
        "points": points,
        "btts_yes": to_int(row.get("btts_yes")),
        "over_25": to_int(row.get("over_25")),
        "under_35": to_int(row.get("under_35")),
        "home_flag": 1 if is_home else 0,
    }


def summarize_team_history(items, prefix):
    matches = len(items)
    recent3 = list(items)[-3:]
    recent5 = list(items)[-5:]
    return {
        f"{prefix}_matches_pre": matches,
        f"{prefix}_points_avg_3": avg([x["points"] for x in recent3]),
        f"{prefix}_points_avg_5": avg([x["points"] for x in recent5]),
        f"{prefix}_goals_for_avg_3": avg([x["goals_for"] for x in recent3]),
        f"{prefix}_goals_for_avg_5": avg([x["goals_for"] for x in recent5]),
        f"{prefix}_goals_against_avg_3": avg([x["goals_against"] for x in recent3]),
        f"{prefix}_goals_against_avg_5": avg([x["goals_against"] for x in recent5]),
        f"{prefix}_goal_diff_avg_5": avg([x["goal_diff"] for x in recent5]),
        f"{prefix}_btts_rate_5": pct(sum(x["btts_yes"] for x in recent5), len(recent5)),
        f"{prefix}_over25_rate_5": pct(sum(x["over_25"] for x in recent5), len(recent5)),
        f"{prefix}_under35_rate_5": pct(sum(x["under_35"] for x in recent5), len(recent5)),
        f"{prefix}_home_share_5": pct(sum(x["home_flag"] for x in recent5), len(recent5)),
    }


def build_league_map(rows):
    grouped = defaultdict(list)
    for row in rows or []:
        grouped[str(row.get("league") or "Unknown")].append(row)
    out = {}
    for league, items in grouped.items():
        total = len(items)
        out[league] = {
            "league_matches": total,
            "league_avg_goals": avg([row.get("total_goals") for row in items]),
            "league_home_win_rate": pct(sum(to_int(r.get("home_win")) for r in items), total),
            "league_draw_rate": pct(sum(to_int(r.get("draw")) for r in items), total),
            "league_away_win_rate": pct(sum(to_int(r.get("away_win")) for r in items), total),
            "league_btts_rate": pct(sum(to_int(r.get("btts_yes")) for r in items), total),
            "league_over25_rate": pct(sum(to_int(r.get("over_25")) for r in items), total),
            "league_under35_rate": pct(sum(to_int(r.get("under_35")) for r in items), total),
        }
    return out


def build_feature_rows(rows):
    rows = [r for r in (rows or []) if isinstance(r, dict)]
    rows.sort(key=lambda r: (parse_dt(r.get("date")) or datetime(1970, 1, 1, tzinfo=timezone.utc), to_int(r.get("event_id"))))
    league_map = build_league_map(rows)
    history = defaultdict(lambda: deque(maxlen=MAX_TEAM_HISTORY))
    out = []

    for row in rows:
        home = str(row.get("home_team") or "")
        away = str(row.get("away_team") or "")
        if not home or not away:
            continue

        home_hist = list(history[home])
        away_hist = list(history[away])
        home_stats = summarize_team_history(home_hist, "home")
        away_stats = summarize_team_history(away_hist, "away")
        league_stats = league_map.get(str(row.get("league") or "Unknown"), {})

        feat = {
            "event_id": row.get("event_id"),
            "date": row.get("date"),
            "league": row.get("league"),
            "season_id": row.get("season_id"),
            "season_name": row.get("season_name"),
            "season_year": row.get("season_year"),
            "home_team": home,
            "away_team": away,
            **home_stats,
            **away_stats,
            **league_stats,
            "form_points_diff_5": round(home_stats["home_points_avg_5"] - away_stats["away_points_avg_5"], 3),
            "goals_for_diff_5": round(home_stats["home_goals_for_avg_5"] - away_stats["away_goals_for_avg_5"], 3),
            "goals_against_diff_5": round(home_stats["home_goals_against_avg_5"] - away_stats["away_goals_against_avg_5"], 3),
            "goal_diff_delta_5": round(home_stats["home_goal_diff_avg_5"] - away_stats["away_goal_diff_avg_5"], 3),
            "btts_rate_diff_5": round(home_stats["home_btts_rate_5"] - away_stats["away_btts_rate_5"], 3),
            "over25_rate_diff_5": round(home_stats["home_over25_rate_5"] - away_stats["away_over25_rate_5"], 3),
            "history_balance": home_stats["home_matches_pre"] - away_stats["away_matches_pre"],
            "eligible_min3": 1 if min(home_stats["home_matches_pre"], away_stats["away_matches_pre"]) >= MIN_HISTORY_FOR_MODEL else 0,
            "eligible_min5": 1 if min(home_stats["home_matches_pre"], away_stats["away_matches_pre"]) >= FULL_HISTORY_FOR_MODEL else 0,
            "target_result_1x2": row.get("result_1x2"),
            "target_home_win": to_int(row.get("home_win")),
            "target_draw": to_int(row.get("draw")),
            "target_away_win": to_int(row.get("away_win")),
            "target_btts_yes": to_int(row.get("btts_yes")),
            "target_over_15": to_int(row.get("over_15")),
            "target_over_25": to_int(row.get("over_25")),
            "target_under_35": to_int(row.get("under_35")),
        }
        out.append(feat)

        history[home].append(make_team_hist_row(row, "home"))
        history[away].append(make_team_hist_row(row, "away"))

    return out


def build_summary(features):
    total = len(features)
    min3 = sum(1 for r in features if to_int(r.get("eligible_min3")) == 1)
    min5 = sum(1 for r in features if to_int(r.get("eligible_min5")) == 1)
    leagues = sorted({str(r.get("league") or "") for r in features if r.get("league")})
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": TZ,
        "team_history_window": MAX_TEAM_HISTORY,
        "eligible_min_history_3": min3,
        "eligible_min_history_5": min5,
        "rows_total": total,
        "rows_with_features_min3_pct": pct(min3, total),
        "rows_with_features_min5_pct": pct(min5, total),
        "leagues_total": len(leagues),
        "feature_columns": [
            "home_points_avg_5", "away_points_avg_5", "form_points_diff_5",
            "home_goals_for_avg_5", "away_goals_for_avg_5", "goals_for_diff_5",
            "home_goals_against_avg_5", "away_goals_against_avg_5", "goals_against_diff_5",
            "home_btts_rate_5", "away_btts_rate_5", "btts_rate_diff_5",
            "home_over25_rate_5", "away_over25_rate_5", "over25_rate_diff_5",
            "league_avg_goals", "league_btts_rate", "league_over25_rate", "league_under35_rate"
        ],
        "targets": ["1X2", "BTTS", "Over1.5", "Over2.5", "Under3.5"],
        "leagues_preview": leagues[:20],
    }


def main():
    print("=== Build training features ===")
    rows = load_existing_json("training_matches.json", [])
    features = build_feature_rows(rows)
    summary = build_summary(features)
    save_json(features, "training_features.json")
    save_json(summary, "training_feature_summary.json")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("=== Done training features ===")


if __name__ == "__main__":
    main()
