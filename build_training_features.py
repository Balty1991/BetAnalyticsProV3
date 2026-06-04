#!/usr/bin/env python3
import json
import os
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from fetch_data import load_existing_json, save_json, TZ

MAX_TEAM_HISTORY = 8
MIN_HISTORY_FOR_MODEL = 3
FULL_HISTORY_FOR_MODEL = 5
DATA_DIR = Path("data")


def _load_referee_stats() -> dict:
    """Încarcă referee_stats.json — avg_goals, avg_yellow, is_strict per referee."""
    try:
        raw = json.load(open(DATA_DIR / "referee_stats.json", encoding="utf-8"))
        refs = raw.get("referees") or {}
        # Construim lookup pe referee_id și pe nume
        by_id = {}; by_name = {}
        for rid, rd in refs.items():
            if not isinstance(rd, dict): continue
            by_id[str(rid)] = rd
            name = str(rd.get("name") or "").lower().strip()
            if name: by_name[name] = rd
        return {"by_id": by_id, "by_name": by_name}
    except Exception:
        return {"by_id": {}, "by_name": {}}


def _load_team_form() -> Dict_:
    """Încarcă team_form_cache.json — form_score, avg_goals_scored/conceded per echipă."""
    try:
        raw = json.load(open(DATA_DIR / "team_form_cache.json", encoding="utf-8"))
        return raw.get("teams") or {}
    except Exception:
        return {}


def _referee_features(row: dict, ref_lookup: dict) -> dict:
    """Extrage trăsăturile arbitrului din referee_stats cache."""
    null = {"referee_avg_goals": 0.0, "referee_avg_yellow": 0.0, "referee_is_strict": 0}
    if not ref_lookup:
        return null
    by_id   = ref_lookup.get("by_id") or {}
    by_name = ref_lookup.get("by_name") or {}
    # Încearcă după ID
    rd = by_id.get(str(row.get("referee_id") or ""))
    # Fallback după nume
    if not rd:
        rn = str(row.get("referee") or row.get("ref_name") or "").lower().strip()
        rd = by_name.get(rn)
    if not rd:
        return null
    return {
        "referee_avg_goals":  round(float(rd.get("avg_goals") or 0), 3),
        "referee_avg_yellow": round(float(rd.get("avg_yellow") or 0), 3),
        "referee_is_strict":  1 if rd.get("is_strict") else 0,
    }


def _build_h2h_index(rows: list) -> dict:
    """
    Prima trecere prin date: construiește un index H2H din meciurile istorice.
    Returnează dict {(home, away): [{date, home_score, away_score}, ...]} sortat cronologic.
    """
    h2h: dict = defaultdict(list)
    for row in rows:
        home = str(row.get("home_team") or "")
        away = str(row.get("away_team") or "")
        if not home or not away: continue
        hs = row.get("home_score"); aw = row.get("away_score")
        if hs is None or aw is None: continue
        h2h[(home, away)].append({
            "date": row.get("date"),
            "home_score": int(hs),
            "away_score": int(aw),
        })
    return h2h


def _h2h_features(home: str, away: str, current_date, h2h_index: dict, n: int = 8) -> dict:
    """Calculează trăsăturile H2H din indexul pre-construit (meciuri înainte de current_date)."""
    null = {
        "h2h_matches": 0, "h2h_home_win_rate": 0.0, "h2h_draw_rate": 0.0,
        "h2h_away_win_rate": 0.0, "h2h_avg_goals": 0.0, "h2h_btts_rate": 0.0,
    }
    past = [m for m in h2h_index.get((home, away), [])
            if (parse_dt(m.get("date")) or datetime(1970,1,1,tzinfo=timezone.utc)) < (current_date or datetime(2099,1,1,tzinfo=timezone.utc))]
    past = sorted(past, key=lambda m: parse_dt(m.get("date")) or datetime(1970,1,1,tzinfo=timezone.utc))[-n:]
    if len(past) < 2:
        return null
    hw = dw = aw = btts = total_goals = 0
    for m in past:
        hs = m["home_score"]; aws = m["away_score"]
        total_goals += hs + aws
        if hs > aws: hw += 1
        elif hs == aws: dw += 1
        else: aw += 1
        if hs > 0 and aws > 0: btts += 1
    n2 = len(past)
    return {
        "h2h_matches":       n2,
        "h2h_home_win_rate": round(hw / n2, 3),
        "h2h_draw_rate":     round(dw / n2, 3),
        "h2h_away_win_rate": round(aw / n2, 3),
        "h2h_avg_goals":     round(total_goals / n2, 2),
        "h2h_btts_rate":     round(btts / n2, 3),
    }


# Type alias pentru type hints simple
Dict_ = dict


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
    league_map  = build_league_map(rows)
    history     = defaultdict(lambda: deque(maxlen=MAX_TEAM_HISTORY))
    # Pre-computare H2H din datele istorice
    h2h_index   = _build_h2h_index(rows)
    # Încarcă referee stats și team form
    ref_lookup  = _load_referee_stats()
    team_form   = _load_team_form()
    out = []

    for row in rows:
        home = str(row.get("home_team") or "")
        away = str(row.get("away_team") or "")
        if not home or not away:
            continue

        home_hist   = list(history[home])
        away_hist   = list(history[away])
        home_stats  = summarize_team_history(home_hist, "home")
        away_stats  = summarize_team_history(away_hist, "away")
        league_stats = league_map.get(str(row.get("league") or "Unknown"), {})
        current_date = parse_dt(row.get("date"))

        # H2H din date istorice (meciuri înainte de data curentă)
        h2h_feat = _h2h_features(home, away, current_date, h2h_index)

        # Referee features
        ref_feat = _referee_features(row, ref_lookup)

        # Team form features (din team_form_cache — disponibil pentru echipele curente)
        home_id_str = str(row.get("home_team_id") or row.get("home_id") or "")
        away_id_str = str(row.get("away_team_id") or row.get("away_id") or "")
        hf = team_form.get(home_id_str) or {}
        af = team_form.get(away_id_str) or {}
        form_feat = {
            "home_form_score":           round(float(hf.get("form_score") or 50.0), 1),
            "away_form_score":           round(float(af.get("form_score") or 50.0), 1),
            "form_score_diff":           round(float(hf.get("form_score") or 50.0) - float(af.get("form_score") or 50.0), 1),
            "home_avg_goals_scored_5":   round(float(hf.get("avg_goals_scored_last5") or 0), 2),
            "away_avg_goals_scored_5":   round(float(af.get("avg_goals_scored_last5") or 0), 2),
            "home_avg_goals_conceded_5": round(float(hf.get("avg_goals_conceded_last5") or 0), 2),
            "away_avg_goals_conceded_5": round(float(af.get("avg_goals_conceded_last5") or 0), 2),
            "home_clean_sheets_5":       to_int(hf.get("clean_sheets_last5")),
            "away_clean_sheets_5":       to_int(af.get("clean_sheets_last5")),
            "home_btts_rate_direct_5":   round(float(hf.get("btts_last5") or 0) / 5.0, 3),
            "away_btts_rate_direct_5":   round(float(af.get("btts_last5") or 0) / 5.0, 3),
        }

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
            **h2h_feat,
            **ref_feat,
            **form_feat,
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
            # Team form (calculated from history)
            "home_points_avg_5", "away_points_avg_5", "form_points_diff_5",
            "home_goals_for_avg_5", "away_goals_for_avg_5", "goals_for_diff_5",
            "home_goals_against_avg_5", "away_goals_against_avg_5", "goals_against_diff_5",
            "home_btts_rate_5", "away_btts_rate_5", "btts_rate_diff_5",
            "home_over25_rate_5", "away_over25_rate_5", "over25_rate_diff_5",
            # League context
            "league_avg_goals", "league_btts_rate", "league_over25_rate", "league_under35_rate",
            # H2H (calculat din datele istorice de antrenament)
            "h2h_matches", "h2h_home_win_rate", "h2h_draw_rate",
            "h2h_away_win_rate", "h2h_avg_goals", "h2h_btts_rate",
            # Referee
            "referee_avg_goals", "referee_avg_yellow", "referee_is_strict",
            # Team form direct (din team_form_cache)
            "home_form_score", "away_form_score", "form_score_diff",
            "home_avg_goals_scored_5", "away_avg_goals_scored_5",
            "home_avg_goals_conceded_5", "away_avg_goals_conceded_5",
            "home_clean_sheets_5", "away_clean_sheets_5",
            "home_btts_rate_direct_5", "away_btts_rate_direct_5",
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
