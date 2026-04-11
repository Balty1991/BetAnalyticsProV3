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
RECOMMENDATION_LOG_MAX_ROWS = 5000
MAX_PREDICTION_AGE_HOURS = 21 * 24
SIGNAL_AUDIT_MAX_ROWS = 24

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
        "odd_max": 1.65,
    },
    "best_single": {
        "label": "Evenimentul zilei",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts"},
        "min_adj": 72.0,
        "min_conf": 50.0,
        "min_edge": 1.5,
        "min_value": 0.0,
        "odd_min": 1.20,
        "odd_max": 1.95,
    },
    "profit_single": {
        "label": "Profit Focus Single",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts"},
        "min_adj": 70.0,
        "min_conf": 48.0,
        "min_edge": 1.0,
        "min_value": 0.005,
        "odd_min": 1.18,
        "odd_max": 1.85,
    },
    "conservative": {
        "label": "Bilet conservator",
        "allowed": {"over15", "under25", "under35"},
        "min_adj": 74.0,
        "min_conf": 50.0,
        "min_edge": 0.0,
        "min_value": -0.01,
        "odd_min": 1.12,
        "odd_max": 1.65,
    },
    "smart_ev": {
        "label": "Smart EV",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts"},
        "min_adj": 66.0,
        "min_conf": 45.0,
        "min_edge": 2.0,
        "min_value": 0.01,
        "odd_min": 1.20,
        "odd_max": 2.20,
        "exclude_odds_ranges": [(1.26, 1.45)],
        "reject_league_tiers": {"avoid"},
    },
    "controlled_combo": {
        "label": "Combo Controlat",
        "allowed": {"over15", "over25", "under25", "under35", "btts", "homeWin", "awayWin"},
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

DEAD_ODDS_RANGES = [(1.26, 1.45)]


def load_bootstrap_backtest() -> Dict[str, Any]:
    path = os.path.join(DATA_DIR, "backtest.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


BOOTSTRAP_BACKTEST = load_bootstrap_backtest()
BOOTSTRAP_LEAGUE_ROWS = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_league") or [])}
BOOTSTRAP_MARKET_ROWS = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_market") or [])}
BOOTSTRAP_ODDS_ROWS = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_odds_bucket") or [])}


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


def poisson_probability(lmbda, k):
    try:
        lmbda = max(0.0, float(lmbda or 0.0))
        k = int(k)
    except Exception:
        return 0.0
    if k < 0:
        return 0.0
    return (math.pow(lmbda, k) * math.exp(-lmbda)) / math.factorial(k)


def poisson_cdf(lmbda, max_goals):
    try:
        cutoff = max(0, int(math.floor(float(max_goals))))
    except Exception:
        cutoff = 0
    return sum(poisson_probability(lmbda, i) for i in range(cutoff + 1))


def poisson_over_probability(home_lambda, away_lambda, threshold=2.5):
    total_lambda = max(0.0, float(home_lambda or 0.0)) + max(0.0, float(away_lambda or 0.0))
    return max(0.0, min(100.0, (1.0 - poisson_cdf(total_lambda, threshold)) * 100.0))


def poisson_under_probability(home_lambda, away_lambda, threshold=2.5):
    total_lambda = max(0.0, float(home_lambda or 0.0)) + max(0.0, float(away_lambda or 0.0))
    return max(0.0, min(100.0, poisson_cdf(total_lambda, threshold) * 100.0))


def poisson_btts_probability(home_lambda, away_lambda):
    home_lambda = max(0.0, float(home_lambda or 0.0))
    away_lambda = max(0.0, float(away_lambda or 0.0))
    prob = 1.0 - math.exp(-home_lambda) - math.exp(-away_lambda) + math.exp(-(home_lambda + away_lambda))
    return max(0.0, min(100.0, prob * 100.0))


def build_poisson_metrics(row):
    try:
        home_lambda = max(0.0, float(row.get("expected_home_goals") or 0.0))
        away_lambda = max(0.0, float(row.get("expected_away_goals") or 0.0))
    except Exception:
        return None
    total_lambda = home_lambda + away_lambda
    if total_lambda <= 0:
        return None
    return {
        "home_lambda": round(home_lambda, 4),
        "away_lambda": round(away_lambda, 4),
        "total_lambda": round(total_lambda, 4),
        "over15": round(poisson_over_probability(home_lambda, away_lambda, 1.5), 2),
        "under15": round(poisson_under_probability(home_lambda, away_lambda, 1.5), 2),
        "over25": round(poisson_over_probability(home_lambda, away_lambda, 2.5), 2),
        "under25": round(poisson_under_probability(home_lambda, away_lambda, 2.5), 2),
        "under35": round(poisson_under_probability(home_lambda, away_lambda, 3.5), 2),
        "btts": round(poisson_btts_probability(home_lambda, away_lambda), 2),
    }


def api_market_probability(row, market_key):
    mapping = {
        "homeWin": pct(row.get("prob_home_win")),
        "draw": pct(row.get("prob_draw")),
        "awayWin": pct(row.get("prob_away_win")),
        "over15": pct(row.get("prob_over_15")),
        "under15": 100.0 - pct(row.get("prob_over_15")),
        "over25": pct(row.get("prob_over_25")),
        "under25": 100.0 - pct(row.get("prob_over_25")),
        "under35": 100.0 - pct(row.get("prob_over_35")),
        "btts": pct(row.get("prob_btts_yes")),
    }
    return round(mapping.get(market_key, 0.0), 2)


def poisson_market_probability(metrics, market_key):
    if not metrics:
        return None
    return metrics.get(market_key)


def blend_model_probability(row, market_key):
    api_prob = api_market_probability(row, market_key)
    metrics = build_poisson_metrics(row)
    poisson_prob = poisson_market_probability(metrics, market_key)
    effective_prob = api_prob
    delta = None
    alert = False
    direction = "flat"
    if poisson_prob is not None:
        delta = round(float(poisson_prob) - float(api_prob), 2)
        alert = abs(delta) > 5.0
        api_weight = 0.55 if alert else 0.72
        poisson_weight = 1.0 - api_weight
        effective_prob = round((api_prob * api_weight) + (float(poisson_prob) * poisson_weight), 2)
        if delta > 5.0:
            direction = "value"
        elif delta < -5.0:
            direction = "risk"
    return {
        "api_prob": round(api_prob, 2),
        "poisson_prob": round(float(poisson_prob), 2) if poisson_prob is not None else None,
        "effective_prob": round(effective_prob, 2),
        "poisson_delta": delta,
        "poisson_alert": alert,
        "poisson_direction": direction,
        "poisson": metrics or {},
    }


def odds_in_ranges(odds, ranges):
    try:
        o = float(odds or 0)
    except Exception:
        return False
    for lower, upper in ranges or []:
        if o >= float(lower) and o <= float(upper):
            return True
    return False


def get_bootstrap_row(rows_map, key):
    if not key:
        return {}
    return rows_map.get(str(key), {}) or {}


def get_league_tier_info(league_name):
    row = get_bootstrap_row(BOOTSTRAP_LEAGUE_ROWS, league_name)
    bets = int(row.get("bets") or 0)
    roi = float(row.get("roi") or 0)
    winrate = float(row.get("winrate") or 0)
    if bets >= 5 and roi >= 12 and winrate >= 70:
        return {"tier": "high", "multiplier": 1.03}
    if bets >= 5 and roi <= -5:
        return {"tier": "avoid", "multiplier": 0.96}
    return {"tier": "neutral", "multiplier": 1.0}



def get_market_multiplier(market_key):
    row = get_bootstrap_row(BOOTSTRAP_MARKET_ROWS, MARKET_MAP[market_key]["label"] if market_key in MARKET_MAP else market_key)
    bets = int(row.get("bets") or 0)
    roi = float(row.get("roi") or 0)
    winrate = float(row.get("winrate") or 0)
    if bets < 4:
        return 1.0
    if roi >= 8 and winrate >= 72:
        return 1.02
    if roi <= -4:
        return 0.97
    return 1.0




def get_odds_bucket_multiplier(odds):
    row = get_bootstrap_row(BOOTSTRAP_ODDS_ROWS, bucket_label_odds(float(odds or 0)))
    bets = int(row.get("bets") or 0)
    roi = float(row.get("roi") or 0)
    if bets < 4:
        return 1.0
    if roi >= 8:
        return 1.01
    if roi <= -4:
        return 0.98
    return 1.0



def dynamic_adjustment_factor(prob, confidence, league_name=None, market_key=None, odds=None):
    c = normalize_confidence(confidence)
    base_factor = 0.93 + (c / 100.0) * 0.07
    league_factor = get_league_tier_info(league_name).get("multiplier", 1.0)
    market_factor = get_market_multiplier(market_key) if market_key else 1.0
    odds_factor = get_odds_bucket_multiplier(odds) if odds else 1.0
    factor = base_factor * league_factor * market_factor * odds_factor
    return max(0.86, min(1.08, factor))



def adjusted_prob(prob, confidence, league_name=None, market_key=None, odds=None):
    p = pct(prob)
    factor = dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
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
    prob_meta = blend_model_probability(row, market_key)
    prob = prob_meta.get("effective_prob")
    confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
    league_name = (event.get("league") or {}).get("name") or "Unknown"
    tier_info = get_league_tier_info(league_name)
    value = calc_value(prob, odds)
    adj = adjusted_prob(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
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
        "api_prob": prob_meta.get("api_prob"),
        "poisson_prob": prob_meta.get("poisson_prob"),
        "poisson_delta": prob_meta.get("poisson_delta"),
        "poisson_alert": bool(prob_meta.get("poisson_alert")),
        "poisson_direction": prob_meta.get("poisson_direction"),
        "total_lambda": (prob_meta.get("poisson") or {}).get("total_lambda"),
        "adj_prob": round(adj, 2),
        "value": round(value, 4),
        "confidence": round(confidence, 2),
        "market_prob": round(market_prob, 2) if market_prob is not None else None,
        "edge_pct": round(edge_pct, 2) if edge_pct is not None else None,
        "fit_score": round(fit, 2),
        "score": score,
        "verdict": verdict,
        "source_api": bool(source_api),
        "source_heuristic": bool(source_heuristic),
        "won": bool(outcome),
        "league": league_name,
        "league_tier": tier_info.get("tier"),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
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
    if odds_in_ranges(candidate.get("odds"), strategy_cfg.get("exclude_odds_ranges") or []):
        return False
    if candidate.get("league_tier") in (strategy_cfg.get("reject_league_tiers") or set()):
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


def calc_kelly_pct(prob_pct, odds, fraction=1.0, cap_pct=8.0):
    try:
        p = pct(prob_pct) / 100.0
        o = float(odds or 0)
    except Exception:
        return 0.0
    if o <= 1.01 or p <= 0:
        return 0.0
    b = o - 1.0
    raw = ((b * p) - (1.0 - p)) / b
    if not math.isfinite(raw) or raw <= 0:
        return 0.0
    return round(min(cap_pct, raw * 100.0 * fraction), 2)


def is_prediction_stale(row, now_utc=None, max_age_hours=MAX_PREDICTION_AGE_HOURS):
    now_utc = now_utc or datetime.now(timezone.utc)
    created_at = parse_dt((row or {}).get("created_at"))
    if not created_at:
        return False
    age_h = (now_utc - created_at.astimezone(timezone.utc)).total_seconds() / 3600.0
    return age_h > max_age_hours


def dedupe_and_filter_predictions(predictions, now_utc=None, max_age_hours=MAX_PREDICTION_AGE_HOURS):
    now_utc = now_utc or datetime.now(timezone.utc)
    kept = {}
    stale_removed = 0
    duplicate_removed = 0
    for row in predictions or []:
        if is_prediction_stale(row, now_utc=now_utc, max_age_hours=max_age_hours):
            stale_removed += 1
            continue
        event = row.get("event") or {}
        event_id = event.get("id") or row.get("id")
        current = kept.get(event_id)
        row_created = parse_dt(row.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        cur_created = parse_dt((current or {}).get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        if current is None or row_created.astimezone(timezone.utc) >= cur_created.astimezone(timezone.utc):
            if current is not None:
                duplicate_removed += 1
            kept[event_id] = row
        else:
            duplicate_removed += 1
    filtered = sorted(kept.values(), key=lambda r: ((r.get("event") or {}).get("event_date") or "", r.get("id") or 0))
    return filtered, {
        "input_count": len(predictions or []),
        "kept_count": len(filtered),
        "stale_removed": stale_removed,
        "duplicate_removed": duplicate_removed,
        "max_age_hours": max_age_hours,
    }


def build_signal_audit(predictions, recommendation_log=None):
    rows = []
    now_utc = datetime.now(timezone.utc)
    log_index = {str((r or {}).get("event_id") or ""): (r or {}) for r in (recommendation_log or []) if (r or {}).get("event_id")}
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "notstarted":
            continue

        candidates = []
        for market in MARKETS:
            market_key = market["key"]
            try:
                odds = float((market["odds"](event) or 0))
            except Exception:
                odds = 0.0
            if odds < 1.01:
                continue
            prob_meta = blend_model_probability(row, market_key)
            prob = prob_meta.get("effective_prob")
            confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
            value = calc_value(prob, odds)
            league_name = (event.get("league") or {}).get("name") or "Unknown"
            tier_info = get_league_tier_info(league_name)
            adj = adjusted_prob(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
            market_prob = market_prob_from_row_event(row, event, market_key)
            edge_pct = round(prob - market_prob, 2) if market_prob is not None else None
            fit = market_fit_score(row, market_key)
            source_api = api_recommend(row, market_key)
            source_heuristic = heuristic_recommend(row, market_key)
            score = calc_smart_score(adj, value, confidence, edge_pct, fit, source_api, source_heuristic)
            verdict = verdict_from_metrics(adj, value, confidence, edge_pct)
            candidate = {
                "market": market["label"],
                "market_key": market_key,
                "odds": round(odds, 3),
                "prob": round(prob, 2),
                "api_prob": prob_meta.get("api_prob"),
                "poisson_prob": prob_meta.get("poisson_prob"),
                "poisson_delta": prob_meta.get("poisson_delta"),
                "poisson_alert": bool(prob_meta.get("poisson_alert")),
                "poisson_direction": prob_meta.get("poisson_direction"),
                "adj_prob": round(adj, 2),
                "value": round(value, 4),
                "confidence": round(confidence, 2),
                "market_prob": round(market_prob, 2) if market_prob is not None else None,
                "edge_pct": round(edge_pct, 2) if edge_pct is not None else None,
                "fit_score": round(fit, 2),
                "score": score,
                "verdict": verdict,
                "source_api": bool(source_api),
                "source_heuristic": bool(source_heuristic),
                "league": league_name,
        "league_tier": tier_info.get("tier"),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
                "event_id": event.get("id"),
                "prediction_id": row.get("id"),
                "date": event.get("event_date"),
                "created_at": row.get("created_at"),
                "most_likely_score": row.get("most_likely_score"),
            }
            if qualifies_for_strategy(candidate, STRATEGIES["engine_overall"]):
                candidates.append(candidate)

        if not candidates:
            continue

        pick = max(candidates, key=rank_candidate)
        created_at = parse_dt(pick.get("created_at"))
        age_hours = round((now_utc - created_at.astimezone(timezone.utc)).total_seconds() / 3600.0, 2) if created_at else None
        fair_odds = round(1.0 / max(0.0001, pick.get("adj_prob", 0) / 100.0), 3) if pick.get("adj_prob") else None
        kelly_full = calc_kelly_pct(pick.get("adj_prob"), pick.get("odds"), fraction=1.0)
        kelly_quarter = calc_kelly_pct(pick.get("adj_prob"), pick.get("odds"), fraction=0.25)
        reason_tags = []
        if pick.get("edge_pct") is not None:
            reason_tags.append(f"No-vig {pick['edge_pct']:+.1f}pp")
        if pick.get("value") is not None:
            reason_tags.append(f"EV+ {pick['value']*100:+.1f}%")
        if pick.get("poisson_alert") and pick.get("poisson_delta") is not None:
            reason_tags.append(f"Poisson {pick['poisson_delta']:+.1f}pp")
        if pick.get("market_key") in {"over15", "over25", "under25", "under35"}:
            xg_total = round(float(row.get("expected_home_goals") or 0) + float(row.get("expected_away_goals") or 0), 2)
            reason_tags.append(f"xG {xg_total:.2f}")
        if row.get("most_likely_score"):
            reason_tags.append(f"Scor {row.get('most_likely_score')}")
        log_row = log_index.get(str(pick.get("event_id"))) or {}
        previous_odds = log_row.get("odds") if log_row.get("odds") is not None else pick.get("odds")
        opening_odds = log_row.get("opening_odds") if log_row.get("opening_odds") is not None else previous_odds
        current_odds = pick.get("odds")
        line_movement_pct = 0.0
        from_open_pct = 0.0
        try:
            if previous_odds and current_odds:
                line_movement_pct = round(((float(current_odds) - float(previous_odds)) / float(previous_odds)) * 100.0, 2)
            if opening_odds and current_odds:
                from_open_pct = round(((float(current_odds) - float(opening_odds)) / float(opening_odds)) * 100.0, 2)
        except Exception:
            line_movement_pct = 0.0
            from_open_pct = 0.0
        if abs(line_movement_pct) >= 1.5:
            reason_tags.append(f"Line {line_movement_pct:+.1f}%")
        rows.append({
            "prediction_id": pick.get("prediction_id"),
            "event_id": pick.get("event_id"),
            "created_at": pick.get("created_at"),
            "event_date": pick.get("date"),
            "age_hours": age_hours,
            "league": pick.get("league"),
            "home": event.get("home_team"),
            "away": event.get("away_team"),
            "model_version": row.get("model_version"),
            "market_key": pick.get("market_key"),
            "market": pick.get("market"),
            "book_odds": pick.get("odds"),
            "market_prob": pick.get("market_prob"),
            "model_prob": pick.get("prob"),
            "api_prob": pick.get("api_prob"),
            "poisson_prob": pick.get("poisson_prob"),
            "poisson_delta": pick.get("poisson_delta"),
            "poisson_alert": pick.get("poisson_alert"),
            "adjusted_prob": pick.get("adj_prob"),
            "fair_odds": fair_odds,
            "edge_pct": pick.get("edge_pct"),
            "value": pick.get("value"),
            "score": pick.get("score"),
            "verdict": pick.get("verdict"),
            "source_api": pick.get("source_api"),
            "source_heuristic": pick.get("source_heuristic"),
            "kelly_full_pct": kelly_full,
            "kelly_quarter_pct": kelly_quarter,
            "previous_odds": previous_odds,
            "opening_odds": opening_odds,
            "line_movement_pct": line_movement_pct,
            "from_open_pct": from_open_pct,
            "reason_tags": reason_tags[:4],
        })

    rows.sort(key=lambda x: (float(x.get("kelly_quarter_pct") or 0), float(x.get("edge_pct") or 0), float(x.get("score") or 0)), reverse=True)
    rows = rows[:SIGNAL_AUDIT_MAX_ROWS]
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "avg_edge_pct": round(sum(float(r.get("edge_pct") or 0) for r in rows) / len(rows), 2) if rows else 0.0,
        "avg_kelly_quarter_pct": round(sum(float(r.get("kelly_quarter_pct") or 0) for r in rows) / len(rows), 2) if rows else 0.0,
        "avg_value_pct": round(sum(float(r.get("value") or 0) * 100.0 for r in rows) / len(rows), 2) if rows else 0.0,
        "rows": rows,
    }


def build_data_health(predictions, prep_stats=None):
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

    out = {
        "predictions_count": len(predictions or []),
        "events_without_odds": events_without_odds,
        "predictions_without_scoreline": predictions_without_scoreline,
        "predictions_with_api_flags": predictions_with_api_flags,
        "predictions_with_heuristic_only": predictions_with_heuristic_only,
        "avg_prediction_age_hours": round(sum(ages) / len(ages), 2) if ages else None,
        "max_prediction_age_hours": round(max(ages), 2) if ages else None,
    }
    if prep_stats:
        out.update({
            "stale_predictions_removed": prep_stats.get("stale_removed", 0),
            "duplicate_predictions_removed": prep_stats.get("duplicate_removed", 0),
            "prediction_age_cap_hours": prep_stats.get("max_age_hours"),
        })
    return out




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



def ui_like_heuristic_recommend(row, market_key):
    xg_home = float(row.get("expected_home_goals") or 0)
    xg_away = float(row.get("expected_away_goals") or 0)
    xg_total = xg_home + xg_away
    scoreline = parse_scoreline(row.get("most_likely_score"))

    if market_key == "over15":
        return pct(row.get("prob_over_15")) >= 76 and xg_total >= 2.10 and (not scoreline or scoreline["total"] >= 2)
    if market_key == "over25":
        return pct(row.get("prob_over_25")) >= 60 and xg_total >= 2.60 and (not scoreline or scoreline["total"] >= 3)
    if market_key == "under35":
        return pct(100 - pct(row.get("prob_over_35"))) >= 68 and xg_total <= 3.05 and (not scoreline or scoreline["total"] <= 3)
    if market_key == "btts":
        return pct(row.get("prob_btts_yes")) >= 58 and xg_home >= 0.90 and xg_away >= 0.90 and (not scoreline or scoreline["btts"])
    return heuristic_recommend(row, market_key)


def ui_like_market_fit_score(row, market_key):
    xg_home = float(row.get("expected_home_goals") or 0)
    xg_away = float(row.get("expected_away_goals") or 0)
    xg_total = xg_home + xg_away
    scoreline = parse_scoreline(row.get("most_likely_score"))
    score = 0.0

    if market_key == "over15":
        if pct(row.get("prob_over_15")) >= 80:
            score += 14
        if xg_total >= 2.25:
            score += 10
        if scoreline and scoreline["total"] >= 2:
            score += 10
        if scoreline and scoreline["total"] < 2:
            score -= 12
        if row.get("over_15_recommend"):
            score += 10
    elif market_key == "over25":
        if pct(row.get("prob_over_25")) >= 62:
            score += 14
        if xg_total >= 2.75:
            score += 12
        if scoreline and scoreline["total"] >= 3:
            score += 12
        if scoreline and scoreline["total"] < 3:
            score -= 14
        if row.get("over_25_recommend"):
            score += 10
    elif market_key == "under35":
        if pct(100 - pct(row.get("prob_over_35"))) >= 68:
            score += 13
        if xg_total <= 3.05:
            score += 10
        if scoreline and scoreline["total"] <= 3:
            score += 12
        if scoreline and scoreline["total"] > 3:
            score -= 16
    elif market_key == "btts":
        if pct(row.get("prob_btts_yes")) >= 60:
            score += 14
        if xg_home >= 0.95 and xg_away >= 0.95:
            score += 14
        if scoreline and scoreline["btts"]:
            score += 12
        if scoreline and not scoreline["btts"]:
            score -= 16
        if row.get("btts_recommend"):
            score += 10

    return round(score, 2)


def build_ui_live_candidate(row, market_key):
    market = MARKET_MAP[market_key]
    event = row.get("event") or {}

    try:
        odds = float(market["odds"](event) or 0)
    except Exception:
        return None
    if odds < 1.01:
        return None
    if hard_contradiction(row, market_key):
        return None

    prob_meta = blend_model_probability(row, market_key)
    prob = prob_meta.get("effective_prob")
    confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
    league_name = (event.get("league") or {}).get("name") or "Unknown"
    tier_info = get_league_tier_info(league_name)
    value = calc_value(prob, odds)
    if value <= 0:
        return None
    if odds > 1.65:
        return None

    adj = adjusted_prob(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
    market_prob = market_prob_from_row_event(row, event, market_key)
    edge_pct = round(prob - market_prob, 2) if market_prob is not None else None
    fit = ui_like_market_fit_score(row, market_key)
    source_api = api_recommend(row, market_key)
    source_heuristic = ui_like_heuristic_recommend(row, market_key)
    conf_boost = min(6.0, confidence * 0.06)

    ticket_score = 0.0
    ticket_score += adj * 0.40
    ticket_score += max(0.0, float(edge_pct or 0.0)) * 1.35
    ticket_score += max(0.0, value) * 100.0 * 0.18
    ticket_score += fit
    ticket_score += conf_boost
    if source_api:
        ticket_score += 4.0
    if source_heuristic:
        ticket_score += 2.0
    if prob_meta.get("poisson_alert"):
        ticket_score += 1.5 if prob_meta.get("poisson_direction") == "value" else -2.5
    if 1.18 <= odds <= 1.75:
        ticket_score += 4.0
    if odds > 2.20:
        ticket_score -= 8.0

    return {
        "market": market["label"],
        "market_key": market_key,
        "odds": round(odds, 3),
        "model_prob": round(prob, 2),
        "api_prob": prob_meta.get("api_prob"),
        "poisson_prob": prob_meta.get("poisson_prob"),
        "poisson_delta": prob_meta.get("poisson_delta"),
        "poisson_alert": bool(prob_meta.get("poisson_alert")),
        "poisson_direction": prob_meta.get("poisson_direction"),
        "adjusted_prob": round(adj, 2),
        "market_prob": round(market_prob, 2) if market_prob is not None else None,
        "edge_pct": round(edge_pct, 2) if edge_pct is not None else None,
        "confidence": round(confidence, 2),
        "value": round(value, 4),
        "fit_score": round(fit, 2),
        "ticket_score": round(ticket_score),
        "source_api": bool(source_api),
        "source_heuristic": bool(source_heuristic),
        "league": league_name,
        "league_tier": tier_info.get("tier"),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
        "event_id": event.get("id"),
        "prediction_id": row.get("id"),
        "date": event.get("event_date"),
        "created_at": row.get("created_at"),
        "most_likely_score": row.get("most_likely_score"),
    }



def build_current_recommendation_rows(predictions, logged_at_iso):
    rows = []
    tracked_market_keys = ["over15", "over25", "under35", "btts"]

    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "notstarted":
            continue

        candidates = []
        for market_key in tracked_market_keys:
            candidate = build_ui_live_candidate(row, market_key)
            if candidate:
                candidates.append(candidate)

        if not candidates:
            continue

        candidates.sort(
            key=lambda c: (
                c.get("ticket_score") or 0,
                c.get("value") or 0,
                c.get("adjusted_prob") or 0,
            ),
            reverse=True,
        )
        pick = candidates[0]
        event_id = pick.get("event_id")
        if not event_id:
            continue

        rows.append({
            "log_id": str(event_id),
            "logged_at": logged_at_iso,
            "prediction_created_at": pick.get("created_at"),
            "event_id": event_id,
            "prediction_id": pick.get("prediction_id"),
            "home": event.get("home_team"),
            "away": event.get("away_team"),
            "league": pick.get("league"),
            "event_date": pick.get("date"),
            "market": pick.get("market"),
            "market_key": pick.get("market_key"),
            "odds": pick.get("odds"),
            "model_prob": pick.get("model_prob"),
            "api_prob": pick.get("api_prob"),
            "poisson_prob": pick.get("poisson_prob"),
            "poisson_delta": pick.get("poisson_delta"),
            "poisson_alert": pick.get("poisson_alert"),
            "adjusted_prob": pick.get("adjusted_prob"),
            "market_prob": pick.get("market_prob"),
            "edge_pct": pick.get("edge_pct"),
            "confidence": pick.get("confidence"),
            "value": pick.get("value"),
            "score": pick.get("ticket_score"),
            "source_api": pick.get("source_api"),
            "source_heuristic": pick.get("source_heuristic"),
            "model_version": row.get("model_version"),
            "most_likely_score": pick.get("most_likely_score"),
            "league_tier": pick.get("league_tier"),
            "opening_odds": pick.get("odds"),
            "previous_odds": pick.get("odds"),
            "line_movement_pct": 0.0,
            "from_open_pct": 0.0,
            "status": "pending",
            "won": None,
            "home_score": None,
            "away_score": None,
            "settled_at": None,
        })

    rows.sort(key=lambda x: (x.get("event_date") or "", x.get("event_id") or 0))
    return rows


def build_finished_event_index(predictions):
    out = {}
    for row in predictions or []:
        event = row.get("event") or {}
        event_id = event.get("id")
        if not event_id:
            continue
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue
        out[event_id] = event
    return out



def update_recommendation_log(existing_rows, current_rows, finished_events, settled_at_iso):
    existing_rows = existing_rows or []
    by_event_id = {}

    for row in existing_rows:
        event_id = row.get("event_id")
        if not event_id:
            continue
        row["log_id"] = str(event_id)
        by_event_id[str(event_id)] = row

    for row in current_rows or []:
        event_id = row.get("event_id")
        if not event_id:
            continue
        key = str(event_id)
        row["log_id"] = key
        existing = by_event_id.get(key)

        if not existing:
            by_event_id[key] = row
            continue

        # Ținem snapshotul final pentru meciurile deja închise,
        # dar pentru cele încă pending resincronizăm piața curentă
        # ca numerele din Istoric 21 zile să bată cu tab-ul Meciuri.
        if existing.get("status") in {"win", "lose"}:
            continue

        first_logged_at = existing.get("first_logged_at") or existing.get("logged_at") or row.get("logged_at")
        row["first_logged_at"] = first_logged_at
        row["logged_at"] = row.get("logged_at") or existing.get("logged_at")
        row["opening_odds"] = existing.get("opening_odds") if existing.get("opening_odds") is not None else row.get("odds")
        row["previous_odds"] = existing.get("odds") if existing.get("odds") is not None else row.get("odds")
        try:
            if row.get("previous_odds") and row.get("odds"):
                row["line_movement_pct"] = round(((float(row.get("odds")) - float(row.get("previous_odds"))) / float(row.get("previous_odds"))) * 100.0, 2)
            else:
                row["line_movement_pct"] = 0.0
            if row.get("opening_odds") and row.get("odds"):
                row["from_open_pct"] = round(((float(row.get("odds")) - float(row.get("opening_odds"))) / float(row.get("opening_odds"))) * 100.0, 2)
            else:
                row["from_open_pct"] = 0.0
        except Exception:
            row["line_movement_pct"] = 0.0
            row["from_open_pct"] = 0.0
        row["status"] = existing.get("status") or row.get("status")
        row["won"] = existing.get("won")
        row["home_score"] = existing.get("home_score")
        row["away_score"] = existing.get("away_score")
        row["settled_at"] = existing.get("settled_at")
        by_event_id[key] = row

    for row in by_event_id.values():
        if row.get("status") in {"win", "lose"}:
            continue
        event = finished_events.get(row.get("event_id"))
        if not event:
            continue
        won = market_outcome(event, row.get("market_key"))
        if won is None:
            continue
        row["status"] = "win" if won else "lose"
        row["won"] = bool(won)
        row["home_score"] = event.get("home_score")
        row["away_score"] = event.get("away_score")
        row["settled_at"] = settled_at_iso

    out = list(by_event_id.values())
    out.sort(key=lambda x: (x.get("logged_at") or x.get("prediction_created_at") or "", x.get("event_id") or 0), reverse=True)
    return out[:RECOMMENDATION_LOG_MAX_ROWS]




def clamp(value, low, high):
    return max(low, min(high, value))


def ai_odds_bucket(odds):
    o = float(odds or 0)
    if o < 1.20:
        return "1.01–1.19"
    if o < 1.35:
        return "1.20–1.34"
    if o < 1.50:
        return "1.35–1.49"
    if o < 1.66:
        return "1.50–1.65"
    return "1.66+"


def ai_conf_bucket(confidence):
    c = float(confidence or 0)
    if c < 50:
        return "<50"
    if c < 60:
        return "50–59"
    if c < 70:
        return "60–69"
    return "70+"


def ai_edge_bucket(edge_pct):
    e = float(edge_pct or 0)
    if e < 1:
        return "<1%"
    if e < 3:
        return "1–2.9%"
    if e < 5:
        return "3–4.9%"
    return "5%+"


def ai_weekday_label(iso_value):
    if not iso_value:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except Exception:
        return "—"
    names = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"]
    return names[dt.weekday()]


def ai_hour_bucket(iso_value):
    if not iso_value:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except Exception:
        return "—"
    hour = dt.hour
    if hour < 6:
        return "00–05"
    if hour < 12:
        return "06–11"
    if hour < 18:
        return "12–17"
    return "18–23"


def ai_source_label(row):
    if row.get("source_api") and row.get("source_heuristic"):
        return "ML + heuristic"
    if row.get("source_api"):
        return "ML/API"
    if row.get("source_heuristic"):
        return "heuristic"
    return "heuristic"


def ai_recency_weight(iso_value, now_utc):
    if not iso_value:
        return 0.8
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
    except Exception:
        return 0.8
    age_days = max(0.0, (now_utc - dt).total_seconds() / 86400.0)
    return round(max(0.55, 1.0 - min(age_days, 75.0) / 170.0), 4)


def ai_create_stat(kind, key, label):
    return {
        "kind": kind,
        "key": key,
        "label": label,
        "raw_bets": 0,
        "bets_w": 0.0,
        "wins_w": 0.0,
        "profit_w": 0.0,
        "edge_sum": 0.0,
        "odds_sum": 0.0,
    }


def ai_update_stat(store, kind, key, label, row, weight):
    bucket = store.setdefault(kind, {})
    stat = bucket.get(key)
    if not stat:
        stat = ai_create_stat(kind, key, label)
        bucket[key] = stat
    odds = float(row.get("odds") or 0)
    won = bool(row.get("won"))
    profit = (odds - 1.0) if won and odds > 1 else -1.0
    stat["raw_bets"] += 1
    stat["bets_w"] += weight
    stat["wins_w"] += weight if won else 0.0
    stat["profit_w"] += profit * weight
    stat["edge_sum"] += float(row.get("edge_pct") or 0.0)
    stat["odds_sum"] += odds


def ai_finalize_stat(stat):
    bets_w = float(stat.get("bets_w") or 0.0)
    raw_bets = int(stat.get("raw_bets") or 0)
    if bets_w <= 0 or raw_bets <= 0:
        return None
    wins_w = float(stat.get("wins_w") or 0.0)
    profit_w = float(stat.get("profit_w") or 0.0)
    roi = (profit_w * 100.0 / bets_w) if bets_w else 0.0
    winrate = (wins_w * 100.0 / bets_w) if bets_w else 0.0
    avg_edge = (float(stat.get("edge_sum") or 0.0) / raw_bets) if raw_bets else 0.0
    avg_odds = (float(stat.get("odds_sum") or 0.0) / raw_bets) if raw_bets else 0.0
    sample_factor = min(1.0, raw_bets / 10.0)
    memory_score = (roi * 0.32) + ((winrate - 54.0) * 0.18) + (avg_edge * 0.75)
    memory_score *= sample_factor
    out = dict(stat)
    out.update({
        "wins": int(round(wins_w)),
        "losses": max(0, raw_bets - int(round(wins_w))),
        "roi": round(roi, 2),
        "winrate": round(winrate, 2),
        "profit": round(profit_w, 3),
        "avg_edge": round(avg_edge, 2),
        "avg_odds": round(avg_odds, 3),
        "memory_score": round(clamp(memory_score, -12.0, 12.0), 2),
    })
    return out


def ai_pattern_market_key(row):
    if not row:
        return "—"
    kind = row.get("kind") or ""
    key = str(row.get("key") or "")
    if kind == "market":
        return key or "—"
    return key.split("|", 1)[0] if key else "—"


def ai_select_diverse_patterns(rows, limit=12, max_per_market=2):
    out = []
    per_market = {}
    for row in rows or []:
        market_key = ai_pattern_market_key(row)
        if per_market.get(market_key, 0) >= max_per_market:
            continue
        out.append(row)
        per_market[market_key] = per_market.get(market_key, 0) + 1
        if len(out) >= limit:
            break
    return out


def build_ai_memory(current_rows, recommendation_log, history_rows, now_utc):
    settled = [
        r for r in (recommendation_log or [])
        if r.get("status") in {"win", "lose"} and r.get("market_key") in {"over15", "over25", "under35", "btts"}
    ]
    settled.extend([
        r for r in (history_rows or [])
        if r.get("won") is not None and r.get("market_key") in {"over15", "over25", "under35", "btts"}
    ])
    pending = [
        r for r in (current_rows or [])
        if r.get("market_key") in {"over15", "over25", "under35", "btts"}
    ]

    patterns = {}
    for row in settled:
        base_time = row.get("settled_at") or row.get("event_date") or row.get("logged_at") or row.get("prediction_created_at")
        weight = ai_recency_weight(base_time, now_utc)
        market_key = row.get("market_key") or "—"
        league = row.get("league") or "Unknown"
        odds_bucket = ai_odds_bucket(row.get("odds"))
        conf_bucket = ai_conf_bucket(row.get("confidence"))
        edge_bucket = ai_edge_bucket(row.get("edge_pct"))
        event_time = row.get("event_date") or row.get("date")
        weekday = ai_weekday_label(event_time)
        hour_bucket = ai_hour_bucket(event_time)
        source_label = ai_source_label(row)
        market_label = row.get("market") or market_key

        ai_update_stat(patterns, "market", market_key, market_label, row, weight)
        ai_update_stat(patterns, "market_league", f"{market_key}|{league}", f"{market_label} • {league}", row, weight)
        ai_update_stat(patterns, "market_odds", f"{market_key}|{odds_bucket}", f"{market_label} • cote {odds_bucket}", row, weight)
        ai_update_stat(patterns, "market_conf", f"{market_key}|{conf_bucket}", f"{market_label} • conf {conf_bucket}", row, weight)
        ai_update_stat(patterns, "market_edge", f"{market_key}|{edge_bucket}", f"{market_label} • edge {edge_bucket}", row, weight)
        if weekday != "—":
            ai_update_stat(patterns, "market_weekday", f"{market_key}|{weekday}", f"{market_label} • {weekday}", row, weight)
        if hour_bucket != "—":
            ai_update_stat(patterns, "market_hour", f"{market_key}|{hour_bucket}", f"{market_label} • interval {hour_bucket}", row, weight)
        if source_label:
            ai_update_stat(patterns, "market_source", f"{market_key}|{source_label}", f"{market_label} • {source_label}", row, weight)

    final_patterns = {}
    flat_patterns = []
    for kind, bucket in patterns.items():
        final_patterns[kind] = {}
        for key, stat in bucket.items():
            fin = ai_finalize_stat(stat)
            if not fin:
                continue
            final_patterns[kind][key] = fin
            flat_patterns.append(fin)

    market_rows = sorted(
        [row for row in final_patterns.get("market", {}).values() if row.get("raw_bets", 0) >= 5],
        key=lambda x: ((x.get("memory_score") or 0), (x.get("roi") or 0), (x.get("raw_bets") or 0)),
        reverse=True,
    )
    positive_candidates = sorted(
        [r for r in flat_patterns if r.get("raw_bets", 0) >= 4 and r.get("memory_score", 0) > 0],
        key=lambda x: ((x.get("memory_score") or 0), (x.get("roi") or 0), (x.get("raw_bets") or 0)),
        reverse=True,
    )
    negative_candidates = sorted(
        [r for r in flat_patterns if r.get("raw_bets", 0) >= 4 and r.get("memory_score", 0) < 0],
        key=lambda x: ((x.get("memory_score") or 0), (x.get("roi") or 0)),
    )
    positive_patterns = ai_select_diverse_patterns(positive_candidates, limit=12, max_per_market=2)
    negative_patterns = ai_select_diverse_patterns(negative_candidates, limit=12, max_per_market=2)

    def lookup(kind, key, min_bets=4):
        row = final_patterns.get(kind, {}).get(key)
        if not row or int(row.get("raw_bets") or 0) < min_bets:
            return None
        return row

    adaptive_picks = []
    for row in pending:
        market_key = row.get("market_key") or "—"
        market_label = row.get("market") or market_key
        league = row.get("league") or "Unknown"
        odds_bucket = ai_odds_bucket(row.get("odds"))
        conf_bucket = ai_conf_bucket(row.get("confidence"))
        edge_bucket = ai_edge_bucket(row.get("edge_pct"))
        weekday = ai_weekday_label(row.get("event_date"))
        hour_bucket = ai_hour_bucket(row.get("event_date"))
        source_label = ai_source_label(row)
        reason_pool = []
        core_bonus = 0.0
        context_impacts = []

        core_checks = [
            ("market", market_key, 6, 0.60, market_label),
            ("market_league", f"{market_key}|{league}", 4, 0.75, f"{market_label} în {league}"),
        ]
        context_checks = [
            ("market_odds", f"{market_key}|{odds_bucket}", 4, 0.28, f"{market_label} la cote {odds_bucket}"),
            ("market_conf", f"{market_key}|{conf_bucket}", 4, 0.28, f"{market_label} la conf {conf_bucket}"),
            ("market_edge", f"{market_key}|{edge_bucket}", 4, 0.22, f"{market_label} la edge {edge_bucket}"),
            ("market_weekday", f"{market_key}|{weekday}", 4, 0.18, f"{market_label} în {weekday}"),
            ("market_hour", f"{market_key}|{hour_bucket}", 4, 0.18, f"{market_label} în intervalul {hour_bucket}"),
            ("market_source", f"{market_key}|{source_label}", 4, 0.15, f"{market_label} din sursa {source_label}"),
        ]

        for kind, key, min_bets, weight, reason_label in core_checks:
            stat = lookup(kind, key, min_bets=min_bets)
            if not stat:
                continue
            impact = float(stat.get("memory_score") or 0.0) * weight
            core_bonus += impact
            if abs(impact) >= 0.8:
                reason_pool.append({
                    "label": reason_label,
                    "impact": round(impact, 2),
                    "bets": int(stat.get("raw_bets") or 0),
                    "roi": round(float(stat.get("roi") or 0.0), 2),
                })

        for kind, key, min_bets, weight, reason_label in context_checks:
            stat = lookup(kind, key, min_bets=min_bets)
            if not stat:
                continue
            impact = float(stat.get("memory_score") or 0.0) * weight
            context_impacts.append({
                "label": reason_label,
                "impact": round(impact, 2),
                "bets": int(stat.get("raw_bets") or 0),
                "roi": round(float(stat.get("roi") or 0.0), 2),
            })

        positive_context = sorted([r for r in context_impacts if r["impact"] > 0], key=lambda x: x["impact"], reverse=True)[:2]
        negative_context = sorted([r for r in context_impacts if r["impact"] < 0], key=lambda x: x["impact"])[:1]
        context_bonus = sum(r["impact"] for r in positive_context + negative_context)
        reasons = sorted(reason_pool + positive_context + negative_context, key=lambda x: abs(float(x.get("impact") or 0.0)), reverse=True)[:4]

        raw_bonus = core_bonus + context_bonus
        normalized_bonus = clamp(raw_bonus, -10.0, 10.0)
        adaptive_score = float(row.get("score") or 0.0) + normalized_bonus
        adaptive_picks.append({
            "event_id": row.get("event_id"),
            "prediction_id": row.get("prediction_id"),
            "home": row.get("home"),
            "away": row.get("away"),
            "league": league,
            "event_date": row.get("event_date"),
            "market": market_label,
            "market_key": market_key,
            "odds": row.get("odds"),
            "model_prob": row.get("model_prob"),
            "api_prob": row.get("api_prob"),
            "poisson_prob": row.get("poisson_prob"),
            "poisson_delta": row.get("poisson_delta"),
            "poisson_alert": row.get("poisson_alert"),
            "adjusted_prob": row.get("adjusted_prob"),
            "edge_pct": row.get("edge_pct"),
            "confidence": row.get("confidence"),
            "value": row.get("value"),
            "base_score": round(float(row.get("score") or 0.0), 2),
            "memory_bonus": round(normalized_bonus, 2),
            "adaptive_score": round(adaptive_score, 2),
            "source": source_label,
            "most_likely_score": row.get("most_likely_score"),
            "reasons": reasons,
        })

    adaptive_picks.sort(
        key=lambda x: (
            float(x.get("adaptive_score") or 0.0),
            float(x.get("memory_bonus") or 0.0),
            float(x.get("adjusted_prob") or 0.0),
        ),
        reverse=True,
    )
    diversified = []
    per_market = {}
    for pick in adaptive_picks:
        mk = pick.get("market_key") or "—"
        if per_market.get(mk, 0) >= 3:
            continue
        diversified.append(pick)
        per_market[mk] = per_market.get(mk, 0) + 1
        if len(diversified) >= 12:
            break
    adaptive_picks = diversified

    settled_profit = sum((float(r.get("odds") or 0.0) - 1.0) if r.get("won") else -1.0 for r in settled)
    settled_wins = sum(1 for r in settled if r.get("won") is True)
    summary = {
        "settled_bets": len(settled),
        "settled_wins": settled_wins,
        "settled_losses": max(0, len(settled) - settled_wins),
        "settled_winrate": round((settled_wins * 100.0 / len(settled)), 2) if settled else 0.0,
        "settled_roi": round((settled_profit * 100.0 / len(settled)), 2) if settled else 0.0,
        "pending_scored": len(adaptive_picks),
        "positive_patterns": len(positive_patterns),
        "negative_patterns": len(negative_patterns),
    }

    return {
        "updated_at": now_utc.isoformat(),
        "version": "v1.1-adaptive-memory-diversified",
        "lookback_rows": len(settled),
        "summary": summary,
        "by_market": market_rows,
        "top_patterns": positive_patterns,
        "avoid_patterns": negative_patterns,
        "adaptive_picks": adaptive_picks,
        "notes": [
            "AI Memory V1.1 reduce suprapunerea dintre pattern-uri apropiate și nu mai lasă aceeași piață să domine topul complet.",
            "Bonusul adaptiv este normalizat mai jos, iar contextul nu mai poate împinge aceeași selecție din 5 direcții aproape identice.",
            "Top picks-ul final este diversificat: maxim 3 selecții pe aceeași piață.",
        ],
    }


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
    print(f"Total predictions raw: {len(predictions)}")
    predictions, upcoming_prep = dedupe_and_filter_predictions(predictions, now_utc=started_at, max_age_hours=MAX_PREDICTION_AGE_HOURS)
    print(f"Upcoming predictions kept: {len(predictions)} | stale removed: {upcoming_prep['stale_removed']} | duplicates removed: {upcoming_prep['duplicate_removed']}")
    if not predictions:
        raise RuntimeError("Predictions a venit gol dupa filtrarea stale/duplicate. Oprim workflow-ul.")

    print(f"\n[2/6] Fetching upcoming events (next {LOOKAHEAD_DAYS} days)...")
    events = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")
    print(f"Total events: {len(events)}")

    print("\n[3/6] Fetching BSD status metrics...")
    status_metrics = fetch_status_metrics()
    if status_metrics:
        print(f"Status ML predictions: {status_metrics.get('ml_predictions_upcoming')} | With odds: {status_metrics.get('with_odds')}")

    print(f"\n[4/6] Building historical audit (last {BACKTEST_LOOKBACK_DAYS} days)...")
    historical_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past}&date_to={today}")
    historical_predictions, historical_prep = dedupe_and_filter_predictions(historical_predictions, now_utc=started_at, max_age_hours=MAX_PREDICTION_AGE_HOURS)
    backtest = build_backtest_summary(historical_predictions, BACKTEST_LOOKBACK_DAYS)
    print(f"Finished preds: {backtest['finished_predictions']} | Engine bets: {backtest['engine_bets']} | ROI: {backtest['engine_roi']}%")

    history_predictions = historical_predictions
    if HISTORY_LOOKBACK_DAYS != BACKTEST_LOOKBACK_DAYS:
        history_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past_history}&date_to={today}")
        history_predictions, _history_prep = dedupe_and_filter_predictions(history_predictions, now_utc=started_at, max_age_hours=MAX_PREDICTION_AGE_HOURS)
    history_rows = build_history_rows(history_predictions)
    recommendation_log = load_existing_json("recommendation_log.json", [])
    signal_audit = build_signal_audit(predictions, recommendation_log=recommendation_log)
    current_recommendations = build_current_recommendation_rows(predictions, started_at.isoformat())
    finished_events = build_finished_event_index(history_predictions)
    recommendation_log = update_recommendation_log(recommendation_log, current_recommendations, finished_events, datetime.now(timezone.utc).isoformat())
    ai_memory = build_ai_memory(current_recommendations, recommendation_log, history_rows, started_at)
    data_health = build_data_health(predictions, upcoming_prep)
    header_sync = build_header_sync_metrics(predictions)

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
    save_json(signal_audit, "signal_audit.json")
    save_json(recommendation_log, "recommendation_log.json")
    save_json(ai_memory, "ai_memory.json")

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "raw_predictions_count": upcoming_prep.get("input_count", len(predictions)),
        "events_count": len(events),
        "leagues_count": len(leagues),
        "teams_count": len(teams),
        "players_focus_count": 0,
        "historical_predictions_count": len(historical_predictions),
        "historical_raw_predictions_count": historical_prep.get("input_count", len(historical_predictions)),
        "signal_audit_count": signal_audit.get("count", 0),
        "history_engine_rows": len(history_rows),
        "ai_memory_settled_rows": ai_memory.get("summary", {}).get("settled_bets", 0),
        "ai_memory_adaptive_picks": len(ai_memory.get("adaptive_picks") or []),
        "backtest_finished_predictions": backtest["finished_predictions"],
        "backtest_engine_bets": backtest["engine_bets"],
        "backtest_engine_roi": backtest["engine_roi"],
        "status": "ok",
        "version": "v16.1-strategic-upgrade",
        "timezone": TZ,
        "source": "bsd_api_light",
        "refresh_static": refresh_static,
        "lookahead_days": LOOKAHEAD_DAYS,
        "backtest_lookback_days": BACKTEST_LOOKBACK_DAYS,
        "history_lookback_days": HISTORY_LOOKBACK_DAYS,
        "excluded_markets": ["Over 3.5G"],
        "strategy_upgrades": {
            "smart_ev_dead_zone": [1.26, 1.45],
            "league_tiering": True,
            "dynamic_adjustment": True,
            "line_movement_tracking": True,
        },
        "data_health": data_health,
        "header_sync": header_sync,
        "bsd_status": status_metrics,
        "upcoming_preprocess": upcoming_prep,
        "historical_preprocess": historical_prep,
    }
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
