#!/usr/bin/env python3
"""
BetAnalytics Pro V16 - Fetcher + Audit Engine

Ce face:
- trage predictions si upcoming events din BSD API
- nu foloseste live in app
- nu mai foloseste Over 3.5G ca piata recomandata/backtestata
- construieste backtest mai serios: overall, pe piete, pe strategii, pe bucket-uri
- salveaza si istoric rolling pentru engine-ul principal
"""

import os
import json
import math
import re
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC
LOOKAHEAD_DAYS = 30
BACKTEST_LOOKBACK_DAYS = 21
HISTORY_LOOKBACK_DAYS = 60
HISTORY_MAX_ROWS = 2500
ODDS_HISTORY_MAX_ROWS = 12000
ODDS_HISTORY_MAX_PER_MARKET = 12
DEFAULT_BANKROLL = 1000.0

MARKETS = [
    {"key": "homeWin", "label": "1", "prob": lambda r: pct(r.get("prob_home_win")), "odds": lambda e: e.get("odds_home")},
    {"key": "draw", "label": "X", "prob": lambda r: pct(r.get("prob_draw")), "odds": lambda e: e.get("odds_draw")},
    {"key": "awayWin", "label": "2", "prob": lambda r: pct(r.get("prob_away_win")), "odds": lambda e: e.get("odds_away")},
    {"key": "over15", "label": "Over 1.5G", "prob": lambda r: pct(r.get("prob_over_15")), "odds": lambda e: e.get("odds_over_15")},
    {"key": "under15", "label": "Under 1.5G", "prob": lambda r: 100 - pct(r.get("prob_over_15")), "odds": lambda e: e.get("odds_under_15")},
    {"key": "over25", "label": "Over 2.5G", "prob": lambda r: pct(r.get("prob_over_25")), "odds": lambda e: e.get("odds_over_25")},
    {"key": "under25", "label": "Under 2.5G", "prob": lambda r: 100 - pct(r.get("prob_over_25")), "odds": lambda e: e.get("odds_under_25")},
    {"key": "under35", "label": "Under 3.5G", "prob": lambda r: 100 - pct(r.get("prob_over_35")), "odds": lambda e: e.get("odds_under_35")},
    {"key": "btts", "label": "BTTS", "prob": lambda r: pct(r.get("prob_btts_yes")), "odds": lambda e: e.get("odds_btts_yes")},
    {"key": "bttsNo", "label": "BTTS No", "prob": lambda r: 100 - pct(r.get("prob_btts_yes")), "odds": lambda e: e.get("odds_btts_no")},
]

MARKET_MAP = {m["key"]: m for m in MARKETS}

STRATEGIES = {
    "engine_overall": {
        "label": "Engine Overall",
        "allowed": {m["key"] for m in MARKETS},
        "min_adj": 66.0,
        "min_conf": 45.0,
        "min_edge": 0.0,
        "min_value": 0.0,
        "odd_min": 1.15,
        "odd_max": 2.25,
    },
    "best_single": {
        "label": "Evenimentul zilei",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts", "bttsNo"},
        "min_adj": 72.0,
        "min_conf": 50.0,
        "min_edge": 1.5,
        "min_value": 0.0,
        "odd_min": 1.20,
        "odd_max": 1.95,
    },
    "profit_single": {
        "label": "Profit Focus Single",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts", "bttsNo"},
        "min_adj": 70.0,
        "min_conf": 48.0,
        "min_edge": 1.0,
        "min_value": 0.005,
        "odd_min": 1.18,
        "odd_max": 1.85,
    },
    "conservative": {
        "label": "Bilet conservator",
        "allowed": {"over15", "under25", "under35", "bttsNo"},
        "min_adj": 74.0,
        "min_conf": 50.0,
        "min_edge": 0.0,
        "min_value": -0.01,
        "odd_min": 1.12,
        "odd_max": 1.65,
    },
    "smart_ev": {
        "label": "Smart EV",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts", "bttsNo"},
        "min_adj": 66.0,
        "min_conf": 45.0,
        "min_edge": 2.0,
        "min_value": 0.01,
        "odd_min": 1.20,
        "odd_max": 2.20,
    },
    "controlled_combo": {
        "label": "Combo Controlat",
        "allowed": {"over15", "over25", "under25", "under35", "btts", "bttsNo", "homeWin", "awayWin"},
        "min_adj": 71.0,
        "min_conf": 48.0,
        "min_edge": 0.5,
        "min_value": 0.0,
        "odd_min": 1.18,
        "odd_max": 1.80,
    },
    "over15": {
        "label": "Bilet Over 1.5 EV+",
        "allowed": {"over15"},
        "min_adj": 76.0,
        "min_conf": 50.0,
        "min_edge": 0.0,
        "min_value": -0.02,
        "odd_min": 1.15,
        "odd_max": 1.60,
    },
}


def ensure_token():
    if not TOKEN:
        raise SystemExit("ERROR: BSD_TOKEN nu este setat in GitHub Secrets.")


def pct(v):
    try:
        n = float(v or 0)
    except Exception:
        return 0.0
    if not math.isfinite(n) or n < 0:
        return 0.0
    return 100.0 if n > 100 else n


def normalize_confidence(v):
    try:
        n = float(v or 0)
    except Exception:
        return 0.0
    if not math.isfinite(n) or n < 0:
        return 0.0
    if n <= 1:
        return n * 100
    return 100.0 if n > 100 else n


def calc_value(prob, odds):
    try:
        o = float(odds or 0)
    except Exception:
        return -999.0
    if o < 1.01:
        return -999.0
    return ((pct(prob) / 100.0) * o) - 1.0


def fair_odds(prob):
    p = pct(prob)
    if p <= 0:
        return None
    return round(100.0 / p, 3)


def calc_kelly(prob, odds, fraction=1.0, cap=0.08):
    try:
        p = pct(prob) / 100.0
        o = float(odds or 0)
    except Exception:
        return 0.0
    if o <= 1.0 or p <= 0.0 or p >= 1.0:
        return 0.0
    b = o - 1.0
    edge = (b * p) - (1.0 - p)
    if b <= 0:
        return 0.0
    raw = edge / b
    if not math.isfinite(raw):
        return 0.0
    raw = max(0.0, raw)
    sized = raw * float(fraction or 1.0)
    return round(min(cap, sized) * 100.0, 2)


def pct_change(current, previous):
    try:
        cur = float(current or 0)
        prev = float(previous or 0)
    except Exception:
        return None
    if prev <= 0:
        return None
    return round(((cur - prev) / prev) * 100.0, 2)


def iso_to_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None


def market_event_odds(event, market_key):
    mapper = {
        'homeWin': 'odds_home',
        'draw': 'odds_draw',
        'awayWin': 'odds_away',
        'over15': 'odds_over_15',
        'under15': 'odds_under_15',
        'over25': 'odds_over_25',
        'under25': 'odds_under_25',
        'under35': 'odds_under_35',
        'btts': 'odds_btts_yes',
        'bttsNo': 'odds_btts_no',
    }
    field = mapper.get(market_key)
    if not field:
        return None
    try:
        odd = float((event or {}).get(field) or 0)
    except Exception:
        return None
    return round(odd, 3) if odd >= 1.01 else None


def adjusted_prob(prob, confidence):
    p = pct(prob)
    c = normalize_confidence(confidence)
    factor = 0.93 + (c / 100.0) * 0.07
    return round(p * factor, 2)


def parse_scoreline(score):
    if not score or not isinstance(score, str) or "-" not in score:
        return None
    try:
        home, away = score.split("-", 1)
        h = int(home)
        a = int(away)
        return {"home": h, "away": a, "total": h + a, "btts": h > 0 and a > 0}
    except Exception:
        return None


def hard_contradiction(row, market_key):
    score = parse_scoreline(row.get("most_likely_score"))
    if not score:
        return False
    if market_key == "over15" and score["total"] < 2:
        return True
    if market_key == "under15" and score["total"] >= 2:
        return True
    if market_key == "over25" and score["total"] < 3:
        return True
    if market_key == "under25" and score["total"] >= 3:
        return True
    if market_key == "under35" and score["total"] >= 4:
        return True
    if market_key == "btts" and not score["btts"]:
        return True
    if market_key == "bttsNo" and score["btts"]:
        return True
    if market_key == "homeWin" and score["home"] <= score["away"]:
        return True
    if market_key == "awayWin" and score["away"] <= score["home"]:
        return True
    if market_key == "draw" and score["home"] != score["away"]:
        return True
    return False


def market_outcome(event, market_key):
    hs = event.get("home_score")
    aw = event.get("away_score")
    if hs is None or aw is None:
        return None
    total = hs + aw
    if market_key == "homeWin":
        return hs > aw
    if market_key == "draw":
        return hs == aw
    if market_key == "awayWin":
        return aw > hs
    if market_key == "over15":
        return total >= 2
    if market_key == "under15":
        return total <= 1
    if market_key == "over25":
        return total >= 3
    if market_key == "under25":
        return total <= 2
    if market_key == "under35":
        return total <= 3
    if market_key == "btts":
        return hs > 0 and aw > 0
    if market_key == "bttsNo":
        return hs == 0 or aw == 0
    return None


def compute_no_vig(*odds_values):
    clean = []
    for o in odds_values:
        try:
            n = float(o or 0)
        except Exception:
            return None
        if n < 1.01:
            return None
        clean.append(n)
    inv = [1.0 / x for x in clean]
    total = sum(inv)
    if total <= 0:
        return None
    return [v / total * 100.0 for v in inv]


def market_prob_from_row_event(row, event, market_key) -> Optional[float]:
    if market_key == "homeWin":
        vals = compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away"))
        return round(vals[0], 2) if vals else None
    if market_key == "draw":
        vals = compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away"))
        return round(vals[1], 2) if vals else None
    if market_key == "awayWin":
        vals = compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away"))
        return round(vals[2], 2) if vals else None
    if market_key in {"over15", "under15"}:
        vals = compute_no_vig(event.get("odds_over_15"), event.get("odds_under_15"))
        if not vals:
            return None
        return round(vals[0 if market_key == "over15" else 1], 2)
    if market_key in {"over25", "under25"}:
        vals = compute_no_vig(event.get("odds_over_25"), event.get("odds_under_25"))
        if not vals:
            return None
        return round(vals[0 if market_key == "over25" else 1], 2)
    if market_key == "under35":
        vals = compute_no_vig(event.get("odds_over_35"), event.get("odds_under_35"))
        if not vals:
            return None
        return round(vals[1], 2)
    if market_key in {"btts", "bttsNo"}:
        vals = compute_no_vig(event.get("odds_btts_yes"), event.get("odds_btts_no"))
        if not vals:
            return None
        return round(vals[0 if market_key == "btts" else 1], 2)
    return None


def api_recommend(row, market_key):
    if market_key == "over15":
        return bool(row.get("over_15_recommend"))
    if market_key == "over25":
        return bool(row.get("over_25_recommend"))
    if market_key == "btts":
        return bool(row.get("btts_recommend"))
    if market_key in {"homeWin", "awayWin"}:
        fav = row.get("favorite")
        if not row.get("favorite_recommend"):
            return False
        return (market_key == "homeWin" and fav == "H") or (market_key == "awayWin" and fav == "A")
    return False


def heuristic_recommend(row, market_key):
    if market_key == "over15":
        return pct(row.get("prob_over_15")) >= 75
    if market_key == "over25":
        return pct(row.get("prob_over_25")) >= 65
    if market_key == "under25":
        return pct(100 - pct(row.get("prob_over_25"))) >= 58
    if market_key == "under35":
        return pct(100 - pct(row.get("prob_over_35"))) >= 70
    if market_key == "btts":
        return pct(row.get("prob_btts_yes")) >= 60
    if market_key == "bttsNo":
        return pct(100 - pct(row.get("prob_btts_yes"))) >= 58
    if market_key == "homeWin":
        return row.get("predicted_result") == "H" and pct(row.get("prob_home_win")) >= 52
    if market_key == "awayWin":
        return row.get("predicted_result") == "A" and pct(row.get("prob_away_win")) >= 52
    if market_key == "draw":
        return row.get("predicted_result") == "D" and pct(row.get("prob_draw")) >= 32
    return False


def market_fit_score(row, market_key) -> float:
    xg_home = float(row.get("expected_home_goals") or 0)
    xg_away = float(row.get("expected_away_goals") or 0)
    xg_total = xg_home + xg_away
    scoreline = parse_scoreline(row.get("most_likely_score"))
    score = 0.0

    if market_key == "over15":
        if xg_total >= 2.15:
            score += 10
        if scoreline and scoreline["total"] >= 2:
            score += 12
    elif market_key == "over25":
        if xg_total >= 2.75:
            score += 10
        if scoreline and scoreline["total"] >= 3:
            score += 12
    elif market_key == "under25":
        if xg_total <= 2.55:
            score += 10
        if scoreline and scoreline["total"] <= 2:
            score += 12
    elif market_key == "under35":
        if xg_total <= 3.05:
            score += 9
        if scoreline and scoreline["total"] <= 3:
            score += 10
    elif market_key == "btts":
        if xg_home >= 0.95 and xg_away >= 0.95:
            score += 10
        if scoreline and scoreline["btts"]:
            score += 10
    elif market_key == "bttsNo":
        if xg_home <= 1.15 or xg_away <= 1.15:
            score += 10
        if scoreline and not scoreline["btts"]:
            score += 10
    elif market_key == "homeWin":
        if row.get("predicted_result") == "H":
            score += 10
        if row.get("favorite") == "H":
            score += 8
    elif market_key == "awayWin":
        if row.get("predicted_result") == "A":
            score += 10
        if row.get("favorite") == "A":
            score += 8
    elif market_key == "draw":
        if row.get("predicted_result") == "D":
            score += 9
        if scoreline and scoreline["home"] == scoreline["away"]:
            score += 8
    return score


def calc_smart_score(adj_prob, value, confidence, edge_pct, fit_score, source_api, source_heuristic):
    c = normalize_confidence(confidence)
    edge = float(edge_pct or 0)
    score = 0.0
    score += min(58.0, (pct(adj_prob) / 100.0) * 58.0)
    score += min(18.0, max(0.0, edge) * 2.0)
    score += min(14.0, max(0.0, value) * 120.0)
    score += min(8.0, (c / 100.0) * 8.0)
    score += min(14.0, fit_score)
    if source_api:
        score += 3.0
    elif source_heuristic:
        score += 1.0
    if value < -0.03:
        score -= 8.0
    if edge < -2.0:
        score -= 12.0
    return round(score, 2)


def verdict_from_metrics(adj_prob, value, confidence, edge_pct):
    c = normalize_confidence(confidence)
    edge = float(edge_pct or 0)
    if adj_prob >= 77 and value >= 0 and c >= 55 and edge >= 1:
        return "safe"
    if adj_prob >= 68 and value >= 0 and c >= 45 and edge >= 0:
        return "value"
    if adj_prob >= 60 and c >= 40:
        return "lean"
    return "avoid"


def build_candidate(row, market_key) -> Optional[Dict[str, Any]]:
    market = MARKET_MAP[market_key]
    event = row.get("event") or {}
    odds = market["odds"](event)
    try:
        odds = float(odds or 0)
    except Exception:
        return None
    if odds < 1.01:
        return None
    prob = market["prob"](row)
    confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
    value = calc_value(prob, odds)
    adj = adjusted_prob(prob, confidence)
    market_prob = market_prob_from_row_event(row, event, market_key)
    edge_pct = round(prob - market_prob, 2) if market_prob is not None else None
    fit = market_fit_score(row, market_key)
    source_api = api_recommend(row, market_key)
    source_heuristic = heuristic_recommend(row, market_key)
    score = calc_smart_score(adj, value, confidence, edge_pct, fit, source_api, source_heuristic)
    verdict = verdict_from_metrics(adj, value, confidence, edge_pct)
    outcome = market_outcome(event, market_key)
    if outcome is None:
        return None
    return {
        "market": market["label"],
        "market_key": market_key,
        "odds": round(odds, 3),
        "prob": round(prob, 2),
        "adj_prob": round(adj, 2),
        "value": round(value, 4),
        "confidence": round(confidence, 2),
        "market_prob": round(market_prob, 2) if market_prob is not None else None,
        "fair_odds": fair_odds(prob),
        "fair_odds_adj": fair_odds(adj),
        "kelly_full_pct": calc_kelly(adj, odds, 1.0),
        "kelly_quarter_pct": calc_kelly(adj, odds, 0.25),
        "edge_pct": round(edge_pct, 2) if edge_pct is not None else None,
        "fit_score": round(fit, 2),
        "score": score,
        "verdict": verdict,
        "source_api": bool(source_api),
        "source_heuristic": bool(source_heuristic),
        "won": bool(outcome),
        "league": (event.get("league") or {}).get("name") or "Unknown",
        "event_id": event.get("id"),
        "prediction_id": row.get("id"),
        "date": event.get("event_date"),
        "created_at": row.get("created_at"),
        "most_likely_score": row.get("most_likely_score"),
    }


def qualifies_for_strategy(candidate, strategy_cfg):
    if not candidate:
        return False
    if candidate["market_key"] not in strategy_cfg["allowed"]:
        return False
    if hard_contradiction({"most_likely_score": candidate.get("most_likely_score")}, candidate["market_key"]):
        return False
    if candidate["adj_prob"] < strategy_cfg["min_adj"]:
        return False
    if candidate["confidence"] < strategy_cfg["min_conf"]:
        return False
    if candidate["value"] < strategy_cfg["min_value"]:
        return False
    if candidate["odds"] < strategy_cfg["odd_min"] or candidate["odds"] > strategy_cfg["odd_max"]:
        return False
    edge = candidate["edge_pct"] if candidate["edge_pct"] is not None else -999
    if edge < strategy_cfg["min_edge"]:
        return False
    if candidate["verdict"] == "avoid":
        return False
    return True


def rank_candidate(candidate):
    rank = candidate["score"]
    rank += max(0.0, candidate["value"]) * 100.0 * 0.45
    rank += max(0.0, candidate["edge_pct"] or 0.0) * 0.75
    if candidate["source_api"]:
        rank += 2.0
    return round(rank, 3)


def empty_stats(label=None):
    return {
        "label": label,
        "bets": 0,
        "wins": 0,
        "losses": 0,
        "profit": 0.0,
        "roi": 0.0,
        "winrate": 0.0,
        "avg_odds": 0.0,
        "avg_edge": 0.0,
        "worst_run": 0,
        "best_run": 0,
    }


def finalize_pick_stats(picks: List[Dict[str, Any]], label=None):
    stats = empty_stats(label)
    if not picks:
        return stats
    bets = len(picks)
    wins = sum(1 for p in picks if p["won"])
    losses = bets - wins
    profit = sum((p["odds"] - 1.0) if p["won"] else -1.0 for p in picks)
    avg_odds = sum(p["odds"] for p in picks) / bets
    avg_edge = sum((p["edge_pct"] or 0.0) for p in picks) / bets

    best_run = 0
    worst_run = 0
    cur_w = 0
    cur_l = 0
    for p in sorted(picks, key=lambda x: (x.get("date") or "", x.get("event_id") or 0, x.get("prediction_id") or 0)):
        if p["won"]:
            cur_w += 1
            cur_l = 0
        else:
            cur_l += 1
            cur_w = 0
        best_run = max(best_run, cur_w)
        worst_run = max(worst_run, cur_l)

    stats.update({
        "bets": bets,
        "wins": wins,
        "losses": losses,
        "profit": round(profit, 3),
        "roi": round((profit / bets) * 100.0 if bets else 0.0, 2),
        "winrate": round((wins / bets) * 100.0 if bets else 0.0, 2),
        "avg_odds": round(avg_odds, 3),
        "avg_edge": round(avg_edge, 2),
        "worst_run": int(worst_run),
        "best_run": int(best_run),
    })
    return stats


def bucket_label_odds(odds):
    if odds <= 1.25:
        return "1.10-1.25"
    if odds <= 1.45:
        return "1.26-1.45"
    if odds <= 1.70:
        return "1.46-1.70"
    if odds <= 2.10:
        return "1.71-2.10"
    return "2.10+"


def bucket_label_conf(conf):
    if conf <= 45:
        return "0-45"
    if conf <= 55:
        return "46-55"
    if conf <= 65:
        return "56-65"
    if conf <= 75:
        return "66-75"
    return "76+"


def bucket_label_edge(edge):
    if edge <= 2:
        return "0-2pp"
    if edge <= 5:
        return "2-5pp"
    if edge <= 8:
        return "5-8pp"
    return "8pp+"


def accumulate_pick(bucket_map, key, pick):
    bucket_map.setdefault(key, []).append(pick)


def rows_from_bucket_map(bucket_map):
    out = []
    for key, picks in bucket_map.items():
        stats = finalize_pick_stats(picks)
        stats["key"] = key
        out.append(stats)
    out.sort(key=lambda x: (x["roi"], x["bets"]), reverse=True)
    return out


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def build_data_health(predictions):
    now = datetime.now(timezone.utc)
    ages = []
    events_without_odds = 0
    predictions_without_scoreline = 0
    predictions_with_api_flags = 0
    predictions_with_heuristic_only = 0

    for row in predictions or []:
        event = row.get("event") or {}
        if not any(event.get(k) not in (None, "", 0) for k in [
            "odds_home", "odds_draw", "odds_away", "odds_over_15", "odds_over_25", "odds_under_25", "odds_under_35", "odds_btts_yes", "odds_btts_no"
        ]):
            events_without_odds += 1
        if not row.get("most_likely_score"):
            predictions_without_scoreline += 1
        if any(bool(row.get(k)) for k in ["over_15_recommend", "over_25_recommend", "btts_recommend", "favorite_recommend", "winner_recommend"]):
            predictions_with_api_flags += 1
        else:
            if any(heuristic_recommend(row, m["key"]) for m in MARKETS):
                predictions_with_heuristic_only += 1
        created_at = parse_dt(row.get("created_at"))
        if created_at:
            ages.append((now - created_at.astimezone(timezone.utc)).total_seconds() / 3600.0)

    return {
        "predictions_count": len(predictions or []),
        "events_without_odds": events_without_odds,
        "predictions_without_scoreline": predictions_without_scoreline,
        "predictions_with_api_flags": predictions_with_api_flags,
        "predictions_with_heuristic_only": predictions_with_heuristic_only,
        "avg_prediction_age_hours": round(sum(ages) / len(ages), 2) if ages else None,
        "max_prediction_age_hours": round(max(ages), 2) if ages else None,
    }




def build_header_sync_metrics(predictions):
    upcoming = []
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") == "notstarted":
            upcoming.append(row)

    def has_pipeline_odds(row):
        event = row.get("event") or {}
        required = [
            "odds_home", "odds_draw", "odds_away",
            "odds_over_15", "odds_over_25",
            "odds_under_25", "odds_under_35",
            "odds_btts_yes", "odds_btts_no"
        ]
        return all(event.get(k) not in (None, "", 0) for k in required)

    with_odds = sum(1 for row in upcoming if has_pipeline_odds(row))

    return {
        "upcoming_predictions_count": len(upcoming),
        "with_odds_upcoming_count": with_odds,
    }


def build_backtest_summary(predictions, lookback_days):
    finished_rows = []
    engine_picks = []
    strategy_picks = {k: [] for k in STRATEGIES if k != "engine_overall"}

    by_market = {}
    by_league = {}
    by_odds = {}
    by_conf = {}
    by_edge = {}

    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue
        finished_rows.append(row)

        candidates = []
        for market in MARKETS:
            cand = build_candidate(row, market["key"])
            if not cand:
                continue
            candidates.append(cand)

        if not candidates:
            continue

        # engine overall: best eligible candidate across all markets
        engine_cfg = STRATEGIES["engine_overall"]
        engine_eligible = [c for c in candidates if qualifies_for_strategy(c, engine_cfg)]
        if engine_eligible:
            best_engine = max(engine_eligible, key=rank_candidate)
            engine_picks.append(best_engine)
            accumulate_pick(by_market, best_engine["market"], best_engine)
            accumulate_pick(by_league, best_engine["league"], best_engine)
            accumulate_pick(by_odds, bucket_label_odds(best_engine["odds"]), best_engine)
            accumulate_pick(by_conf, bucket_label_conf(best_engine["confidence"]), best_engine)
            accumulate_pick(by_edge, bucket_label_edge(max(0.0, best_engine["edge_pct"] or 0.0)), best_engine)

        # individual strategy simulations
        for strategy_key, cfg in STRATEGIES.items():
            if strategy_key == "engine_overall":
                continue
            eligible = [c for c in candidates if qualifies_for_strategy(c, cfg)]
            if eligible:
                strategy_picks[strategy_key].append(max(eligible, key=rank_candidate))

    overall_stats = finalize_pick_stats(engine_picks, STRATEGIES["engine_overall"]["label"])
    by_strategy = []
    for strategy_key, picks in strategy_picks.items():
        stats = finalize_pick_stats(picks, STRATEGIES[strategy_key]["label"])
        stats["key"] = strategy_key
        by_strategy.append(stats)
    by_strategy.sort(key=lambda x: (x["roi"], x["bets"]), reverse=True)

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "lookback_days": lookback_days,
        "finished_predictions": len(finished_rows),
        "engine_bets": overall_stats["bets"],
        "engine_wins": overall_stats["wins"],
        "engine_profit": overall_stats["profit"],
        "engine_roi": overall_stats["roi"],
        "engine_winrate": overall_stats["winrate"],
        "engine_avg_odds": overall_stats["avg_odds"],
        "engine_avg_edge": overall_stats["avg_edge"],
        "engine_best_run": overall_stats["best_run"],
        "engine_worst_run": overall_stats["worst_run"],
        "overall": overall_stats,
        "by_market": rows_from_bucket_map(by_market)[:20],
        "by_league": rows_from_bucket_map(by_league)[:20],
        "by_strategy": by_strategy,
        "by_odds_bucket": rows_from_bucket_map(by_odds),
        "by_conf_bucket": rows_from_bucket_map(by_conf),
        "by_edge_bucket": rows_from_bucket_map(by_edge),
        "markets_included": [m["label"] for m in MARKETS],
        "excluded_markets": ["Over 3.5G"],
    }


def build_reason_tags(row, candidate):
    tags = []
    if candidate.get("edge_pct") is not None:
        tags.append(f"No-vig {candidate['edge_pct']:+.1f}pp")
    if candidate.get("value", 0) > 0:
        tags.append(f"EV+ {candidate['value']*100:.1f}%")
    if candidate.get("source_api"):
        tags.append("Confirmat API")
    if candidate.get("confidence", 0) >= 55:
        tags.append(f"AI {candidate['confidence']:.0f}%")
    if candidate.get("market_key") in {"over15", "over25", "under25", "under35"}:
        xg_total = float(row.get("expected_home_goals") or 0) + float(row.get("expected_away_goals") or 0)
        if xg_total > 0:
            tags.append(f"xG {xg_total:.2f}")
    if row.get("most_likely_score"):
        tags.append(f"Scor {row.get('most_likely_score')}")
    return tags[:5]


def update_odds_history(existing_history, predictions, snapshot_at_iso):
    history = existing_history or {}
    existing = history.get("snapshots") if isinstance(history, dict) else []
    existing = existing if isinstance(existing, list) else []
    rows = [item for item in existing if isinstance(item, dict)]
    for row in predictions or []:
        event = row.get("event") or {}
        event_id = event.get("id")
        if not event_id:
            continue
        base = {
            "event_id": event_id,
            "prediction_id": row.get("id"),
            "event_date": event.get("event_date"),
            "snapshot_at": snapshot_at_iso,
            "league": (event.get("league") or {}).get("name") or "Unknown",
            "home": event.get("home_team"),
            "away": event.get("away_team"),
            "status": event.get("status"),
        }
        for market in MARKETS:
            odd = market_event_odds(event, market["key"])
            if odd is not None:
                rows.append({**base, "market_key": market["key"], "market": market["label"], "odds": odd})
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    grouped = {}
    for item in rows:
        snap_dt = iso_to_dt(item.get("snapshot_at"))
        event_dt = iso_to_dt(item.get("event_date"))
        if snap_dt and snap_dt < cutoff:
            continue
        if event_dt and event_dt < cutoff:
            continue
        grouped.setdefault((item.get("event_id"), item.get("market_key")), []).append(item)
    compact, latest_index, previous_index, opening_index = [], {}, {}, {}
    for key, items in grouped.items():
        items.sort(key=lambda x: (x.get("snapshot_at") or ""))
        dedup, prev_sig = [], None
        for item in items:
            sig = (item.get("snapshot_at"), item.get("odds"))
            if sig != prev_sig:
                dedup.append(item)
            prev_sig = sig
        kept = dedup[-ODDS_HISTORY_MAX_PER_MARKET:]
        compact.extend(kept)
        if kept:
            opening_index[key] = kept[0]
            latest_index[key] = kept[-1]
            previous_index[key] = kept[-2] if len(kept) >= 2 else None
    compact.sort(key=lambda x: (x.get("event_date") or "", x.get("event_id") or 0, x.get("market_key") or "", x.get("snapshot_at") or ""), reverse=True)
    compact = compact[:ODDS_HISTORY_MAX_ROWS]
    movers = []
    for key, last in latest_index.items():
        prev = previous_index.get(key)
        change = pct_change(last.get("odds"), prev.get("odds") if prev else None)
        if change is not None:
            movers.append({
                "event_id": last.get("event_id"), "market_key": last.get("market_key"), "market": last.get("market"),
                "home": last.get("home"), "away": last.get("away"), "league": last.get("league"),
                "current_odds": last.get("odds"), "previous_odds": prev.get("odds") if prev else None,
                "line_movement_pct": change, "snapshot_at": last.get("snapshot_at"), "event_date": last.get("event_date")
            })
    movers.sort(key=lambda x: abs(x.get("line_movement_pct") or 0), reverse=True)
    return {"updated_at": snapshot_at_iso, "snapshots": compact, "recent_movers": movers[:120]}, latest_index, previous_index, opening_index


def enrich_predictions_with_audit(predictions, latest_index, previous_index, opening_index):
    enriched, audit_rows = [], []
    for row in predictions or []:
        event = row.get("event") or {}
        candidates = [build_candidate(row, m["key"]) for m in MARKETS]
        candidates = [c for c in candidates if c]
        eligible = [c for c in candidates if qualifies_for_strategy(c, STRATEGIES["engine_overall"])]
        best = max(eligible, key=rank_candidate) if eligible else (max(candidates, key=rank_candidate) if candidates else None)
        row2 = dict(row)
        if best:
            key = (best.get("event_id"), best.get("market_key"))
            prev = previous_index.get(key)
            opening = opening_index.get(key)
            current_odds = best.get("odds")
            previous_odds = prev.get("odds") if prev else None
            opening_odds = opening.get("odds") if opening else current_odds
            audit_summary = {
                "market_key": best.get("market_key"), "market": best.get("market"), "book_odds": current_odds,
                "market_prob": best.get("market_prob"), "model_prob": best.get("prob"), "adjusted_prob": best.get("adj_prob"),
                "fair_odds": best.get("fair_odds_adj") or best.get("fair_odds"), "edge_pct": best.get("edge_pct"), "value": best.get("value"),
                "score": best.get("score"), "verdict": best.get("verdict"), "kelly_full_pct": best.get("kelly_full_pct"),
                "kelly_quarter_pct": best.get("kelly_quarter_pct"), "previous_odds": previous_odds, "opening_odds": opening_odds,
                "line_movement_pct": pct_change(current_odds, previous_odds), "from_open_pct": pct_change(current_odds, opening_odds),
                "reason_tags": build_reason_tags(row, best),
            }
            row2["audit_summary"] = audit_summary
            row2["best_market_key"] = audit_summary["market_key"]
            row2["best_market_label"] = audit_summary["market"]
            row2["best_market_prob"] = audit_summary["market_prob"]
            row2["best_edge_pct"] = audit_summary["edge_pct"]
            row2["best_value"] = audit_summary["value"]
            row2["best_adj_prob"] = audit_summary["adjusted_prob"]
            row2["best_fair_odds"] = audit_summary["fair_odds"]
            row2["best_kelly_quarter_pct"] = audit_summary["kelly_quarter_pct"]
            row2["best_kelly_full_pct"] = audit_summary["kelly_full_pct"]
            row2["best_previous_odds"] = previous_odds
            row2["best_opening_odds"] = opening_odds
            row2["best_line_movement_pct"] = audit_summary["line_movement_pct"]
            row2["best_from_open_pct"] = audit_summary["from_open_pct"]
            row2["audit_reason_tags"] = audit_summary["reason_tags"]
            if event.get("status") == "notstarted":
                audit_rows.append({
                    "prediction_id": row.get("id"), "event_id": event.get("id"), "created_at": row.get("created_at"),
                    "event_date": event.get("event_date"), "league": (event.get("league") or {}).get("name") or "Unknown",
                    "home": event.get("home_team"), "away": event.get("away_team"), "model_version": row.get("model_version"), **audit_summary
                })
        enriched.append(row2)
    audit_rows.sort(key=lambda x: (x.get("score") or 0, x.get("edge_pct") or -999, x.get("adjusted_prob") or 0), reverse=True)
    audit_out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(audit_rows),
        "avg_edge_pct": round(sum((x.get("edge_pct") or 0) for x in audit_rows) / len(audit_rows), 2) if audit_rows else 0.0,
        "avg_kelly_quarter_pct": round(sum((x.get("kelly_quarter_pct") or 0) for x in audit_rows) / len(audit_rows), 2) if audit_rows else 0.0,
        "avg_value_pct": round(sum((x.get("value") or 0) * 100.0 for x in audit_rows) / len(audit_rows), 2) if audit_rows else 0.0,
        "rows": audit_rows[:300],
    }
    return enriched, audit_out


def enrich_history_rows_with_clv(history_rows, latest_index):
    enriched, clv_vals = [], []
    for row in history_rows or []:
        row2 = dict(row)
        latest = latest_index.get((row.get("event_id"), row.get("market_key")))
        closing_odds = latest.get("odds") if latest else None
        row2["closing_odds"] = closing_odds
        if closing_odds and row.get("odds"):
            row2["clv_pct"] = round(((float(row.get("odds")) / float(closing_odds)) - 1.0) * 100.0, 2)
            clv_vals.append(row2["clv_pct"])
        else:
            row2["clv_pct"] = None
        enriched.append(row2)
    clv_summary = {
        "count": len([x for x in enriched if x.get("clv_pct") is not None]),
        "avg_clv_pct": round(sum(clv_vals) / len(clv_vals), 2) if clv_vals else 0.0,
        "positive_clv_rate": round((sum(1 for x in clv_vals if x > 0) / len(clv_vals)) * 100.0, 2) if clv_vals else 0.0,
    }
    return enriched, clv_summary


def load_existing_json(filename, default):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(data, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {path} ({os.path.getsize(path)} bytes)")


def unique_team_ids_from_events(events):
    ids = set()
    for event in events or []:
        home = (event.get("home_team_obj") or {}).get("id")
        away = (event.get("away_team_obj") or {}).get("id")
        if home:
            ids.add(home)
        if away:
            ids.add(away)
    return sorted(ids)


def should_refresh_static(now_utc):
    return now_utc.hour in STATIC_REFRESH_HOURS


def fetch_url(url):
    last_error = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 401:
                raise RuntimeError(f"401 Unauthorized pentru {url}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_error = e
            print(f"Attempt {attempt+1}/3 failed for {url}: {e}")
    raise RuntimeError(f"Fetch esuat definitiv pentru {url}: {last_error}")


def fetch_status_metrics():
    url = f"{API_BASE}/status/"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        html = r.text or ""
        plain = re.sub(r"<[^>]+>", " ", html)
        plain = re.sub(r"\s+", " ", plain).strip()
        block_match = re.search(r"Football Pipeline(.*?)(Tennis Pipeline|API Endpoints Health|$)", plain, re.S | re.I)
        block = block_match.group(1) if block_match else plain

        def pick(label):
            m = re.search(label + r"\s*([0-9,]+|None)", block, re.I)
            if not m:
                return None
            raw = m.group(1).strip()
            if raw.lower() == "none":
                return 0
            return int(raw.replace(",", ""))

        data = {
            "upcoming_matches": pick(r"Upcoming matches"),
            "with_odds": pick(r"With odds"),
            "ml_predictions_upcoming": pick(r"ML predictions\s*\(upcoming\)"),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": url,
        }
        if data.get("ml_predictions_upcoming") is None and data.get("with_odds") is None:
            return {}
        return data
    except Exception as e:
        print(f"WARN: status metrics unavailable: {e}")
        return {}


def fetch_all_pages(endpoint, extra_params=""):
    all_results = []
    next_url = f"{API_BASE}{endpoint}{extra_params}"
    page_count = 0

    while next_url:
        page_count += 1
        print(f"Page {page_count}: {next_url}")
        data = fetch_url(next_url)

        if isinstance(data, list):
            all_results.extend(data)
            break

        if not isinstance(data, dict):
            raise RuntimeError(f"Raspuns invalid pentru {next_url}: {type(data)}")

        results = data.get("results", [])
        all_results.extend(results)
        next_url = data.get("next")
        if next_url and next_url.startswith("http://"):
            next_url = next_url.replace("http://", "https://", 1)

    return all_results


def build_history_rows(predictions):
    rows = []
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue
        candidates = [build_candidate(row, m["key"]) for m in MARKETS]
        candidates = [c for c in candidates if c and qualifies_for_strategy(c, STRATEGIES["engine_overall"])]
        if not candidates:
            continue
        pick = max(candidates, key=rank_candidate)
        rows.append({
            "date": pick.get("date"),
            "created_at": pick.get("created_at"),
            "event_id": pick.get("event_id"),
            "prediction_id": pick.get("prediction_id"),
            "league": pick.get("league"),
            "market": pick.get("market"),
            "market_key": pick.get("market_key"),
            "odds": pick.get("odds"),
            "model_prob": pick.get("prob"),
            "adjusted_prob": pick.get("adj_prob"),
            "market_prob": pick.get("market_prob"),
            "edge_pct": pick.get("edge_pct"),
            "confidence": pick.get("confidence"),
            "value": pick.get("value"),
            "score": pick.get("score"),
            "source_api": pick.get("source_api"),
            "source_heuristic": pick.get("source_heuristic"),
            "won": pick.get("won"),
        })
    rows.sort(key=lambda x: (x.get("date") or "", x.get("event_id") or 0), reverse=True)
    return rows[:HISTORY_MAX_ROWS]


def main():
    ensure_token()
    started_at = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V16 Fetch [{started_at.strftime('%Y-%m-%d %H:%M UTC')}] ===")

    today = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=LOOKAHEAD_DAYS)).strftime("%Y-%m-%d")
    past = (started_at - timedelta(days=BACKTEST_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    past_history = (started_at - timedelta(days=HISTORY_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    print(f"\n[1/5] Fetching predictions (next {LOOKAHEAD_DAYS} days)...")
    predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={today}&date_to={future}")
    print(f"Total predictions: {len(predictions)}")
    if not predictions:
        raise RuntimeError("Predictions a venit gol. Oprim workflow-ul.")

    print(f"\n[2/6] Fetching upcoming events (next {LOOKAHEAD_DAYS} days)...")
    events = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")
    print(f"Total events: {len(events)}")

    print("\n[3/6] Fetching BSD status metrics...")
    status_metrics = fetch_status_metrics()
    if status_metrics:
        print(f"Status ML predictions: {status_metrics.get('ml_predictions_upcoming')} | With odds: {status_metrics.get('with_odds')}")

    print(f"\n[4/6] Building historical audit (last {BACKTEST_LOOKBACK_DAYS} days)...")
    historical_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past}&date_to={today}")
    backtest = build_backtest_summary(historical_predictions, BACKTEST_LOOKBACK_DAYS)
    print(f"Finished preds: {backtest['finished_predictions']} | Engine bets: {backtest['engine_bets']} | ROI: {backtest['engine_roi']}%")

    history_predictions = historical_predictions
    if HISTORY_LOOKBACK_DAYS != BACKTEST_LOOKBACK_DAYS:
        history_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past_history}&date_to={today}")
    history_rows = build_history_rows(history_predictions)
    data_health = build_data_health(predictions)
    header_sync = build_header_sync_metrics(predictions)

    existing_odds_history = load_existing_json("odds_history.json", {"snapshots": [], "recent_movers": []})
    odds_history, latest_index, previous_index, opening_index = update_odds_history(existing_odds_history, predictions, started_at.isoformat())
    predictions, signal_audit = enrich_predictions_with_audit(predictions, latest_index, previous_index, opening_index)
    history_rows, clv_summary = enrich_history_rows_with_clv(history_rows, latest_index)

    refresh_static = should_refresh_static(started_at)
    print(f"\n[5/6] Static refresh window: {'YES' if refresh_static else 'NO'}")

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "leagues.json")):
        leagues = fetch_all_pages("/api/leagues/")
    else:
        leagues = load_existing_json("leagues.json", [])

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "teams.json")):
        teams = fetch_all_pages("/api/teams/")
    else:
        teams = load_existing_json("teams.json", [])

    players_focus = []
    print(f"Leagues: {len(leagues)} | Teams: {len(teams)} | Players focus: 0")

    print("\n[6/6] Saving files...")
    save_json(predictions, "predictions.json")
    save_json(events, "events.json")
    save_json(leagues, "leagues.json")
    save_json(teams, "teams.json")
    save_json(players_focus, "players_focus.json")
    save_json(backtest, "backtest.json")
    save_json(history_rows, "history_engine.json")
    save_json(odds_history, "odds_history.json")
    save_json(signal_audit, "signal_audit.json")

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "events_count": len(events),
        "leagues_count": len(leagues),
        "teams_count": len(teams),
        "players_focus_count": 0,
        "historical_predictions_count": len(historical_predictions),
        "history_engine_rows": len(history_rows),
        "odds_history_rows": len(odds_history.get("snapshots", [])),
        "signal_audit_rows": signal_audit.get("count", 0),
        "backtest_finished_predictions": backtest["finished_predictions"],
        "backtest_engine_bets": backtest["engine_bets"],
        "backtest_engine_roi": backtest["engine_roi"],
        "audit_avg_edge_pct": signal_audit.get("avg_edge_pct", 0.0),
        "audit_avg_kelly_quarter_pct": signal_audit.get("avg_kelly_quarter_pct", 0.0),
        "audit_avg_value_pct": signal_audit.get("avg_value_pct", 0.0),
        "clv_summary": clv_summary,
        "status": "ok",
        "version": "v17-audit-clv-kelly",
        "timezone": TZ,
        "source": "bsd_api_light",
        "refresh_static": refresh_static,
        "lookahead_days": LOOKAHEAD_DAYS,
        "backtest_lookback_days": BACKTEST_LOOKBACK_DAYS,
        "history_lookback_days": HISTORY_LOOKBACK_DAYS,
        "excluded_markets": ["Over 3.5G"],
        "data_health": data_health,
        "header_sync": header_sync,
        "bsd_status": status_metrics,
    }
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
