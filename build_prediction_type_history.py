#!/usr/bin/env python3
"""
Build per-pronostic history for BetAnalytics Pro.

Output:
  data/prediction_type_history.json

Source priority:
  1) recommendation_journal.json — settled journal built from live + historical backfill
  2) recommendation_log.json — fallback/current offered predictions

The report groups by prediction type / market and keeps:
  wins, losses, pending, void, winrate, ROI, yield, avg odds, recent 21-day form.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List, Optional

try:
    from fetch_data import load_existing_json, save_json, TZ
except Exception:  # local fallback
    from pathlib import Path
    TZ = "Europe/Bucharest"
    DATA_DIR = Path("data")
    def load_existing_json(name, default=None):
        try:
            with open(DATA_DIR / name, encoding="utf-8") as handle:
                return json.load(handle)
        except Exception:
            return default
    def save_json(payload, name):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(DATA_DIR / name, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

WINDOWS_DAYS = [21, 90, 365]
MARKET_LABELS = {
    "over15": "Over 1.5G",
    "over25": "Over 2.5G",
    "under35": "Under 3.5G",
    "btts": "BTTS",
    "home_win": "Home Win",
    "draw": "Draw",
    "away_win": "Away Win",
    "1x": "1X",
    "x2": "X2",
    "12": "12",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except Exception:
        return default


def parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        text = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def market_key(value: Any) -> str:
    raw = str(value or "").strip()
    text = raw.lower().replace(" ", "").replace("_", "").replace(".", "").replace(",", "")
    aliases = {
        "over15": "over15", "over1.5g": "over15", "over15g": "over15", "peste15": "over15", "o15": "over15",
        "over25": "over25", "over2.5g": "over25", "over25g": "over25", "peste25": "over25", "o25": "over25",
        "under35": "under35", "under3.5g": "under35", "under35g": "under35", "sub35": "under35", "u35": "under35",
        "btts": "btts", "gg": "btts", "ambelemarcheaza": "btts", "bothteamstoscore": "btts",
        "homewin": "home_win", "1": "home_win", "gazde": "home_win",
        "draw": "draw", "x": "draw", "egal": "draw",
        "awaywin": "away_win", "2": "away_win", "oaspeti": "away_win",
        "1x": "1x", "x2": "x2", "12": "12",
    }
    if text in aliases:
        return aliases[text]
    if "over" in text and "15" in text:
        return "over15"
    if "over" in text and "25" in text:
        return "over25"
    if "under" in text and "35" in text:
        return "under35"
    if "btts" in text or "both" in text:
        return "btts"
    return text[:40] if text else "unknown"


def market_label(key: str, sample_row: Optional[Dict[str, Any]] = None) -> str:
    if key in MARKET_LABELS:
        return MARKET_LABELS[key]
    raw = str((sample_row or {}).get("market") or key or "Unknown").strip()
    return raw if raw else "Unknown"


def outcome(row: Dict[str, Any]) -> str:
    status = str(row.get("status") or row.get("result") or "").lower().strip()
    if row.get("won") is True:
        return "win"
    if row.get("won") is False:
        return "loss"
    if status in {"win", "won", "green", "success"}:
        return "win"
    if status in {"lose", "loss", "lost", "red", "failed"}:
        return "loss"
    if status in {"void", "push", "cancelled", "canceled", "stale_no_score"}:
        return "void"
    return "pending"


def row_date(row: Dict[str, Any]) -> Optional[datetime]:
    return parse_dt(row.get("settled_at") or row.get("event_date") or row.get("date") or row.get("logged_at") or row.get("created_at") or row.get("first_logged_at"))


def row_id(row: Dict[str, Any]) -> str:
    event_id = row.get("event_id") or row.get("id") or ""
    prediction_id = row.get("prediction_id") or ""
    key = market_key(row.get("market_key") or row.get("market") or row.get("bet"))
    date = str(row.get("event_date") or row.get("date") or row.get("logged_at") or "")[:10]
    home = str(row.get("home") or row.get("home_team") or "").strip().lower()
    away = str(row.get("away") or row.get("away_team") or "").strip().lower()
    return "|".join([str(event_id), str(prediction_id), key, date, home, away])


def profit_units(row: Dict[str, Any], out: str) -> float:
    if out == "win":
        return max(0.0, to_float(row.get("odds") or row.get("book_odds"), 0.0) - 1.0)
    if out == "loss":
        return -1.0
    return 0.0


def stat_init(key: str, label: str) -> Dict[str, Any]:
    return {
        "market_key": key,
        "market": label,
        "offered": 0,
        "settled": 0,
        "wins": 0,
        "losses": 0,
        "pending": 0,
        "void": 0,
        "stake_units": 0.0,
        "profit_units": 0.0,
        "odds_sum": 0.0,
        "prob_sum": 0.0,
        "edge_sum": 0.0,
        "score_sum": 0.0,
        "last_seen_at": None,
    }


def update_stat(stat: Dict[str, Any], row: Dict[str, Any]) -> None:
    out = outcome(row)
    dt = row_date(row)
    stat["offered"] += 1
    if out == "win":
        stat["wins"] += 1
        stat["settled"] += 1
        stat["stake_units"] += 1.0
        stat["profit_units"] += profit_units(row, out)
    elif out == "loss":
        stat["losses"] += 1
        stat["settled"] += 1
        stat["stake_units"] += 1.0
        stat["profit_units"] += profit_units(row, out)
    elif out == "void":
        stat["void"] += 1
    else:
        stat["pending"] += 1
    odds = to_float(row.get("odds") or row.get("book_odds"), 0.0)
    if odds > 1.01:
        stat["odds_sum"] += odds
    prob = to_float(row.get("adjusted_prob") or row.get("final_probability") or row.get("model_prob") or row.get("probability"), 0.0)
    if prob > 0:
        stat["prob_sum"] += prob if prob <= 100 else prob / 100.0
    stat["edge_sum"] += to_float(row.get("edge_pct") or row.get("edge_pp"), 0.0)
    stat["score_sum"] += to_float(row.get("score") or row.get("smart_score") or row.get("adaptive_score"), 0.0)
    if dt:
        iso = dt.isoformat()
        if not stat["last_seen_at"] or iso > stat["last_seen_at"]:
            stat["last_seen_at"] = iso


def finalize_stat(stat: Dict[str, Any]) -> Dict[str, Any]:
    offered = max(0, to_int(stat.get("offered")))
    settled = max(0, to_int(stat.get("settled")))
    wins = to_int(stat.get("wins"))
    profit = to_float(stat.get("profit_units"))
    stake = to_float(stat.get("stake_units"))
    winrate = (wins / settled * 100.0) if settled else 0.0
    roi = (profit / stake * 100.0) if stake else 0.0
    avg_odds = to_float(stat.get("odds_sum")) / offered if offered else 0.0
    avg_prob = to_float(stat.get("prob_sum")) / offered if offered else 0.0
    avg_edge = to_float(stat.get("edge_sum")) / offered if offered else 0.0
    avg_score = to_float(stat.get("score_sum")) / offered if offered else 0.0
    confidence = min(1.0, math.sqrt(settled / 40.0)) if settled else 0.0
    out = dict(stat)
    out.update({
        "offered": offered,
        "settled": settled,
        "wins": wins,
        "losses": to_int(stat.get("losses")),
        "pending": to_int(stat.get("pending")),
        "void": to_int(stat.get("void")),
        "stake_units": round(stake, 3),
        "profit_units": round(profit, 3),
        "winrate": round(winrate, 2),
        "roi": round(roi, 2),
        "yield": round(roi, 2),
        "avg_odds": round(avg_odds, 3),
        "avg_probability": round(avg_prob, 2),
        "avg_edge": round(avg_edge, 2),
        "avg_score": round(avg_score, 2),
        "confidence": round(confidence, 3),
    })
    return out


def dedupe_rows(*sources: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for source in sources:
        for row in source or []:
            if not isinstance(row, dict):
                continue
            key = row_id(row)
            current = by_id.get(key)
            # Prefer rows that are settled over pending snapshots.
            if not current or (outcome(current) in {"pending", "void"} and outcome(row) in {"win", "loss"}):
                by_id[key] = row
    return list(by_id.values())


def build_history(rows: List[Dict[str, Any]], days: Optional[int] = None) -> List[Dict[str, Any]]:
    cutoff = None
    if days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stats: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        dt = row_date(row)
        if cutoff and dt and dt < cutoff:
            continue
        key = market_key(row.get("market_key") or row.get("market") or row.get("bet") or row.get("pick"))
        if not key or key == "unknown":
            continue
        if key not in stats:
            stats[key] = stat_init(key, market_label(key, row))
        update_stat(stats[key], row)
    out = [finalize_stat(x) for x in stats.values()]
    out.sort(key=lambda r: (to_int(r.get("settled")), to_float(r.get("roi")), to_float(r.get("winrate"))), reverse=True)
    return out


def summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = stat_init("all", "Toate pronosticurile")
    for row in rows:
        update_stat(total, row)
    return finalize_stat(total)


def main() -> None:
    journal = load_existing_json("recommendation_journal.json", []) or []
    log = load_existing_json("recommendation_log.json", []) or []
    rows = dedupe_rows(journal, log)
    all_rows = build_history(rows)
    windows = {str(days): build_history(rows, days) for days in WINDOWS_DAYS}
    payload = {
        "version": "v1-prediction-type-history",
        "updated_at": now_iso(),
        "timezone": TZ,
        "summary": summarize(rows),
        "markets": all_rows,
        "windows": windows,
        "notes": [
            "ROI este calculat la miză fixă 1 unitate pe pronostic: win = odds - 1, loss = -1.",
            "Pending și void nu intră în winrate/ROI; apar separat ca volum operațional.",
            "Fereastra 21 zile urmărește forma recentă, iar all-time urmărește stabilitatea pe termen lung.",
        ],
    }
    save_json(payload, "prediction_type_history.json")
    print(json.dumps({
        "markets": len(all_rows),
        "offered": payload["summary"].get("offered"),
        "settled": payload["summary"].get("settled"),
        "winrate": payload["summary"].get("winrate"),
        "roi": payload["summary"].get("roi"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
