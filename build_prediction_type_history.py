#!/usr/bin/env python3
"""
Validated Prediction Tracker for BetAnalytics Pro.

This intentionally does NOT summarize the whole historical archive.
It starts from the current Motor Unificat validated picks and then keeps only
those picks going forward, so the UI can answer: did the predictions offered
by the unified engine actually win or lose?

Output:
  data/prediction_type_history.json
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    from fetch_data import load_existing_json, save_json, TZ
except Exception:
    TZ = "Europe/Bucharest"
    DATA_DIR = Path("data")

    def load_existing_json(name: str, default=None):
        try:
            with open(DATA_DIR / name, encoding="utf-8") as handle:
                return json.load(handle)
        except Exception:
            return default

    def save_json(payload, name: str):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(DATA_DIR / name, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

VERSION = "v2-validated-prediction-tracker"
MAX_CURRENT_PICKS = 12
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


def f(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def i(value: Any, default: int = 0) -> int:
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


def market_label(key: str, row: Optional[Dict[str, Any]] = None) -> str:
    return MARKET_LABELS.get(key) or str((row or {}).get("market") or key or "Unknown")


def normalized_id(row: Dict[str, Any]) -> str:
    event_id = str(row.get("event_id") or row.get("id") or "")
    prediction_id = str(row.get("prediction_id") or "")
    mk = market_key(row.get("market_key") or row.get("market") or row.get("bet") or row.get("pick"))
    date = str(row.get("event_date") or row.get("date") or "")[:10]
    home = str(row.get("home") or row.get("home_team") or "").strip().lower()
    away = str(row.get("away") or row.get("away_team") or "").strip().lower()
    # prediction_id changes less reliably across sources, so event+market is the primary identity.
    primary = "|".join([event_id, mk])
    if event_id and mk != "unknown":
        return primary
    return "|".join([event_id, prediction_id, mk, date, home, away])


def outcome(row: Dict[str, Any]) -> str:
    status = str(row.get("status") or row.get("result") or row.get("outcome") or "").lower().strip()
    if row.get("won") is True:
        return "win"
    if row.get("won") is False:
        return "loss"
    if status in {"win", "won", "green", "success", "w"}:
        return "win"
    if status in {"lose", "loss", "lost", "red", "failed", "l"}:
        return "loss"
    if status in {"void", "push", "cancelled", "canceled", "stale_no_score"}:
        return "void"
    return "pending"


def profit_units(row: Dict[str, Any], out: str) -> float:
    if out == "win":
        return max(0.0, f(row.get("odds") or row.get("book_odds"), 0.0) - 1.0)
    if out == "loss":
        return -1.0
    return 0.0


def load_current_validated() -> List[Dict[str, Any]]:
    adaptive = load_existing_json("adaptive_predictions.json", {}) or {}
    memory = load_existing_json("ai_memory.json", {}) or {}
    candidates: List[Dict[str, Any]] = []
    if isinstance(adaptive, dict):
        candidates.extend(adaptive.get("adaptive_picks") or [])
        candidates.extend(adaptive.get("rows") or [])
    if isinstance(memory, dict):
        candidates.extend(memory.get("adaptive_picks") or [])

    by_key: Dict[str, Dict[str, Any]] = {}
    for row in candidates:
        if not isinstance(row, dict):
            continue
        key = normalized_id(row)
        score = max(f(row.get("adaptive_score")), f(row.get("smart_score")), f(row.get("score")), f(row.get("base_score")))
        if score <= 0:
            continue
        copy = dict(row)
        copy["market_key"] = market_key(copy.get("market_key") or copy.get("market"))
        copy["market"] = market_label(copy["market_key"], copy)
        copy["score"] = round(score, 2)
        if key not in by_key or score > f(by_key[key].get("score")):
            by_key[key] = copy
    picks = list(by_key.values())
    picks.sort(key=lambda r: (f(r.get("score")), f(r.get("edge_pct") or r.get("edge_pp")), f(r.get("value_pct"))), reverse=True)
    return picks[:MAX_CURRENT_PICKS]


def tracked_from_previous() -> Dict[str, Dict[str, Any]]:
    previous = load_existing_json("prediction_type_history.json", {}) or {}
    if not isinstance(previous, dict) or previous.get("version") != VERSION:
        return {}
    rows = previous.get("tracked_predictions") or []
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict):
            out[normalized_id(row)] = dict(row)
    return out


def outcome_lookup() -> Dict[str, Dict[str, Any]]:
    # Full journal is used only as a settlement source for already-tracked picks.
    # It is not used to create history rows.
    journal = load_existing_json("recommendation_journal.json", []) or []
    log = load_existing_json("recommendation_log.json", []) or []
    lookup: Dict[str, Dict[str, Any]] = {}
    for source in (journal, log):
        for row in source or []:
            if not isinstance(row, dict):
                continue
            out = outcome(row)
            if out not in {"win", "loss", "void"}:
                continue
            lookup[normalized_id(row)] = row
    return lookup


def add_current_to_tracker(tracked: Dict[str, Dict[str, Any]], current: Iterable[Dict[str, Any]], now: str) -> None:
    for pick in current:
        key = normalized_id(pick)
        if key in tracked:
            # Keep the tracked status, but refresh display fields if the same pick is still visible.
            old = tracked[key]
            old.update({
                "last_seen_at": now,
                "score": pick.get("score", old.get("score")),
                "edge_pct": pick.get("edge_pct", old.get("edge_pct")),
                "adjusted_prob": pick.get("adjusted_prob", old.get("adjusted_prob")),
            })
            continue
        tracked[key] = {
            "tracker_id": key,
            "tracking_started_at": now,
            "first_seen_at": now,
            "last_seen_at": now,
            "status": "pending",
            "event_id": pick.get("event_id") or pick.get("id"),
            "prediction_id": pick.get("prediction_id"),
            "event_date": pick.get("event_date") or pick.get("date"),
            "home": pick.get("home") or pick.get("home_team"),
            "away": pick.get("away") or pick.get("away_team"),
            "league": pick.get("league"),
            "market_key": market_key(pick.get("market_key") or pick.get("market")),
            "market": market_label(market_key(pick.get("market_key") or pick.get("market")), pick),
            "odds": f(pick.get("odds") or pick.get("book_odds"), 0.0),
            "score": f(pick.get("score") or pick.get("smart_score") or pick.get("adaptive_score"), 0.0),
            "probability": f(pick.get("adjusted_prob") or pick.get("final_probability") or pick.get("model_prob"), 0.0),
            "edge_pct": f(pick.get("edge_pct") or pick.get("edge_pp"), 0.0),
            "source": "validated_unified_engine",
        }


def settle_tracked(tracked: Dict[str, Dict[str, Any]], lookup: Dict[str, Dict[str, Any]], now: str) -> None:
    for key, row in tracked.items():
        if row.get("status") in {"win", "loss", "void"}:
            continue
        settled = lookup.get(key)
        if not settled:
            continue
        out = outcome(settled)
        if out in {"win", "loss", "void"}:
            row["status"] = out
            row["settled_at"] = settled.get("settled_at") or settled.get("updated_at") or now
            if settled.get("odds") or settled.get("book_odds"):
                row["odds"] = f(settled.get("odds") or settled.get("book_odds"), f(row.get("odds"), 0.0))
            row["profit_units"] = round(profit_units(row, out), 3)


def stat_init(key: str, label: str) -> Dict[str, Any]:
    return {
        "market_key": key,
        "market": label,
        "tracked": 0,
        "settled": 0,
        "wins": 0,
        "losses": 0,
        "pending": 0,
        "void": 0,
        "stake_units": 0.0,
        "profit_units": 0.0,
        "odds_sum": 0.0,
    }


def update_stat(stat: Dict[str, Any], row: Dict[str, Any]) -> None:
    out = outcome(row)
    stat["tracked"] += 1
    odds = f(row.get("odds"), 0.0)
    if odds > 1.01:
        stat["odds_sum"] += odds
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


def finalize(stat: Dict[str, Any]) -> Dict[str, Any]:
    tracked = i(stat.get("tracked"))
    settled = i(stat.get("settled"))
    wins = i(stat.get("wins"))
    stake = f(stat.get("stake_units"), 0.0)
    profit = f(stat.get("profit_units"), 0.0)
    return {
        **stat,
        "tracked": tracked,
        "settled": settled,
        "wins": wins,
        "losses": i(stat.get("losses")),
        "pending": i(stat.get("pending")),
        "void": i(stat.get("void")),
        "stake_units": round(stake, 3),
        "profit_units": round(profit, 3),
        "winrate": round(wins / settled * 100.0, 2) if settled else 0.0,
        "roi": round(profit / stake * 100.0, 2) if stake else 0.0,
        "avg_odds": round(f(stat.get("odds_sum"), 0.0) / tracked, 3) if tracked else 0.0,
    }


def summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = stat_init("all", "Predicții validate")
    for row in rows:
        update_stat(total, row)
    return finalize(total)


def summarize_markets(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    stats: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        key = market_key(row.get("market_key") or row.get("market"))
        if key not in stats:
            stats[key] = stat_init(key, market_label(key, row))
        update_stat(stats[key], row)
    out = [finalize(v) for v in stats.values()]
    out.sort(key=lambda r: (i(r.get("tracked")), f(r.get("roi")), f(r.get("winrate"))), reverse=True)
    return out


def main() -> None:
    now = now_iso()
    tracked = tracked_from_previous()
    current = load_current_validated()
    add_current_to_tracker(tracked, current, now)
    settle_tracked(tracked, outcome_lookup(), now)
    rows = list(tracked.values())
    rows.sort(key=lambda r: (str(r.get("tracking_started_at") or ""), f(r.get("score"))), reverse=True)

    payload = {
        "version": VERSION,
        "updated_at": now,
        "timezone": TZ,
        "scope": "validated_predictions_from_activation_only",
        "activation_note": "Nu include arhiva veche. Monitorizează doar predicțiile validate din Motorul Unificat, începând cu activarea trackerului.",
        "summary": summarize(rows),
        "markets": summarize_markets(rows),
        "tracked_predictions": rows,
        "current_validated_count": len(current),
        "notes": [
            "Istoricul pornește de la predicțiile validate curente și continuă doar cu selecțiile oferite de Motorul Unificat după activare.",
            "Arhiva recommendation_journal este folosită doar pentru a afla rezultatul unei predicții deja monitorizate, nu pentru a popula istoricul.",
            "ROI este calculat cu miză fixă 1 unitate pe predicție: win = odds - 1, loss = -1.",
        ],
    }
    save_json(payload, "prediction_type_history.json")
    print(json.dumps({
        "scope": payload["scope"],
        "tracked": payload["summary"].get("tracked"),
        "pending": payload["summary"].get("pending"),
        "settled": payload["summary"].get("settled"),
        "wins": payload["summary"].get("wins"),
        "losses": payload["summary"].get("losses"),
        "roi": payload["summary"].get("roi"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
