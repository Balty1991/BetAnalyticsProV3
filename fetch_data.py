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
import tempfile
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
V2_BASE = "https://sports.bzzoiro.com/api/v2"  # BSD API v2 — endpoints noi (managers, standings xGd, predictions filter)
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC
LOOKAHEAD_DAYS = 30
BACKTEST_LOOKBACK_DAYS = 21
HISTORY_LOOKBACK_DAYS = 90  # crescut de la 60 pentru acoperire mai buna
HISTORY_MAX_ROWS = 2500
UI_PICKS_LOG_MAX_ROWS = 50000
MAX_PREDICTION_AGE_HOURS = 21 * 24
SIGNAL_AUDIT_MAX_ROWS = 24
EVENT_ODDS_COMPARE_CACHE: Dict[int, Dict[str, Any]] = {}
POLYMARKET_SIGNAL_CACHE: Dict[int, Dict[str, Any]] = {}


def load_referee_stats() -> Dict[int, Any]:
    """
    Încarcă data/referee_stats.json generat de fetch_referee_stats.py.
    Returnează dict {referee_id (int): stats_dict} sau {} dacă fișierul lipsește.
    """
    path = os.path.join(DATA_DIR, "referee_stats.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("referees") or {}
        # cheile sunt str în JSON → convertim la int
        return {int(k): v for k, v in raw.items() if v}
    except Exception as e:
        print(f"[RefereeStats] load failed (non-fatal): {e}")
        return {}


REFEREE_STATS: Dict[int, Any] = {}  # populat lazy în main()


def load_lineups_today() -> Dict[str, Any]:
    """
    Încarcă data/lineups_today.json generat de fetch_lineups_today.py.
    Returnează dict {event_id (str): lineup_dict} sau {} dacă fișierul lipsește.
    """
    path = os.path.join(DATA_DIR, "lineups_today.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("lineups") or {}
    except Exception as e:
        print(f"[Lineups] load failed (non-fatal): {e}")
        return {}


LINEUPS_TODAY: Dict[str, Any] = {}  # populat lazy în main()

# Restricții weekday bazate pe istoricul jurnalului (950 pariuri settled)
# ROI simulat după filtrare: +7.10% vs +0.45% fără filtru (+6.65pp)
# Sunt excluse combinațiile market+zi cu ROI < -8% și min 15 pariuri
WEEKDAY_RESTRICTIONS = {
    "under35": {2, 3, 4, 6},   # Miercuri -22%, Joi -10.1%, Vineri -18.4%, Duminică -13%
    "over15":  {0, 3, 4},       # Luni -12.7%, Joi -10.4%, Vineri -9%
}

# ─── Line Movement Filter (bazat pe CLV Buckets) ──────────────────────────────
# CLV ≤-5% bucket: ROI -12.29% pe 51 pick-uri → excludem
# from_open_pct > 5.3% ≈ CLV < -5% (calcul invers din formula CLV)
LINE_MOVE_DRIFT_REJECT = 5.3   # % drift în sus față de opening → piața s-a mișcat contra
LINE_MOVE_CONFIRM_MIN  = -1.0  # % drift în jos față de opening → piața confirmă direcția

MARKETS = [
    {"key": "homeWin", "label": "1 (Home Win)", "prob": lambda r: pct(r.get("prob_home_win")), "odds": lambda e: e.get("odds_home")},
    {"key": "draw", "label": "X (Draw)", "prob": lambda r: pct(r.get("prob_draw")), "odds": lambda e: e.get("odds_draw")},
    {"key": "awayWin", "label": "2 (Away Win)", "prob": lambda r: pct(r.get("prob_away_win")), "odds": lambda e: e.get("odds_away")},
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
        "allowed": {"homeWin", "draw", "awayWin", "over15", "under15", "over25", "under25", "under35"},
        # btts exclus: CLV -2.17%, ROI +10.32% pe noroc (69 picks) — nesustenabil
        "min_adj": 66.0,
        "min_conf": 45.0,
        "min_edge": 8.0,           # backtested: 8pp+ = ROI +2.85% (71 bets), sub 8pp = negativ
        "min_value": 0.0,
        "odd_min": 1.15,
        "odd_max": 1.65,
    },
    "best_single": {
        "label": "Evenimentul zilei",
        "allowed": {"homeWin", "over15", "over25", "under35"},
        # btts exclus: CLV -2.17% → noroc, nu edge real
        "min_adj": 72.0,
        "min_conf": 50.0,
        "min_edge": 8.0,           # aliniat cu zona profitabilă 8pp+
        "min_value": 0.0,
        "odd_min": 1.20,
        "odd_max": 1.95,
    },
    "profit_single": {
        "label": "Profit Focus Single",
        "allowed": {"homeWin", "over15", "over25", "under35"},
        # btts exclus: CLV -2.17% → noroc, nu edge real
        "min_adj": 70.0,
        "min_conf": 48.0,
        "max_conf": 65.0,          # exclude conf 66-75: ROI -37.75% pe 4 pariuri
        "min_edge": 8.0,
        "min_value": 0.005,
        "odd_min": 1.18,
        "odd_max": 1.85,
    },
    "conservative": {
        "label": "Bilet conservator",
        "allowed": {"over15", "under35"},  # under25 scos: ROI -25.5% pe 4 pariuri
        "min_adj": 74.0,
        "min_conf": 50.0,
        "min_edge": 5.0,           # ridicat față de 0 — sub 5pp nu mai merită
        "min_value": -0.01,
        "odd_min": 1.12,
        "odd_max": 1.65,
    },
    "smart_ev": {
        "label": "Smart EV",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts"},
        # btts păstrat doar în smart_ev (strategie experimentală, nu în recomandarea principală)
        "min_adj": 66.0,
        "min_conf": 45.0,
        "min_edge": 2.0,
        "min_value": 0.01,
        "odd_min": 1.20,
        "odd_max": 2.20,
        "reject_league_tiers": {"avoid"},
    },
    "controlled_combo": {
        "label": "Combo Controlat",
        "allowed": {"over15", "over25", "under35", "homeWin"},
        # btts exclus: CLV -2.17% → noroc, nu edge real
        "min_adj": 71.0,
        "min_conf": 48.0,
        "min_edge": 5.0,
        "min_value": 0.0,
        "odd_min": 1.18,
        "odd_max": 1.80,
    },
    "over15": {
        "label": "Bilet Over 1.5 EV+",
        "allowed": {"over15"},
        # Audit CLV (143 picks, 2026-04-29):
        #   Zona 1.43-1.60 + edge≥8pp: n=9, WR=78%, ROI=+16.7% ✅
        #   Zona 1.25-1.42: ROI -13% până la -29% pe orice edge → MOARTĂ
        #   Logică: la cote <1.43, piața prețuiește over15 la >69% implied
        #   Modelul nostru nu bate sistematic această zonă (WR reală 60-65%)
        "min_adj": 76.0,
        "min_conf": 50.0,
        "min_edge": 8.0,           # edge standard, dar zona de cotă face filtrarea
        "min_value": -0.02,
        "odd_min": 1.43,           # ridicat de la 1.15 → eliminăm zona moartă 1.15-1.42
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


def get_league_calibration(league_name):
    """
    Returnează ajustări dinamice ale pragurilor de selecție per ligă,
    bazate pe istoricul real din backtest.json (actualizat la fiecare rulare).

    Cu cât ROI-ul e mai negativ, cu atât pragurile devin mai stricte.
    Cu cât ROI-ul e pozitiv, pragurile se relaxează ușor.
    Sample-ul mic (< 8 pariuri) reduce intensitatea ajustărilor.

    Returns dict cu:
      - adj_delta: modificare la min_adj_prob
      - edge_delta: modificare la min_edge
      - conf_delta: modificare la min_conf
      - tier: "high" / "neutral" / "tighten" / "strict" / "very_strict"
    """
    row = get_bootstrap_row(BOOTSTRAP_LEAGUE_ROWS, league_name)
    bets = int(row.get("bets") or 0)
    roi = float(row.get("roi") or 0)
    winrate = float(row.get("winrate") or 0)

    if bets < 3:
        # Date insuficiente - fara ajustare
        return {"adj_delta": 0.0, "edge_delta": 0.0, "conf_delta": 0.0, "tier": "neutral"}

    # Sample factor: ajustare mai prudenta pentru sample mic
    sample_factor = min(1.0, bets / 8.0)

    if roi >= 20.0 and winrate >= 80.0:
        d_adj, d_edge, d_conf, tier = -2.0, -1.5, -2.0, "high"
    elif roi >= 5.0:
        d_adj, d_edge, d_conf, tier = 0.0, 0.0, 0.0, "neutral"
    elif roi >= 0.0:
        d_adj, d_edge, d_conf, tier = 1.0, 1.5, 0.0, "slight_tighten"
    elif roi >= -15.0:
        d_adj, d_edge, d_conf, tier = 3.0, 4.0, 2.0, "tighten"
    elif roi >= -30.0:
        d_adj, d_edge, d_conf, tier = 5.0, 7.0, 3.0, "strict"
    else:
        d_adj, d_edge, d_conf, tier = 7.0, 10.0, 5.0, "very_strict"

    return {
        "adj_delta":  round(d_adj  * sample_factor, 2),
        "edge_delta": round(d_edge * sample_factor, 2),
        "conf_delta": round(d_conf * sample_factor, 2),
        "tier": tier,
        "bets": bets,
        "roi": roi,
    }



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
    return round(min(100.0, score), 2)


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


def build_candidate(row, market_key, require_outcome=True) -> Optional[Dict[str, Any]]:
    market = MARKET_MAP[market_key]
    event = row.get("event") or {}
    odds = market["odds"](event)
    try:
        odds = float(odds or 0)
    except Exception:
        return None
    if odds < 1.01:
        return None

    # ── Best Odds Multi-Bookmaker (v2 API) ────────────────────────────────────
    # Citim din EVENT_ODDS_COMPARE_CACHE populat de enrich_predictions_with_market_odds.
    # Dacă best odds e mai bun decât consensus → îl folosim pentru EV/Kelly/Edge.
    # Stocăm ambele valori: odds_consensus (referință) și odds (best real).
    odds_consensus = odds
    best_odds_bk: Optional[str] = None
    odds_upgraded = False
    try:
        ev_id = int(event.get("id") or 0) or None
        if ev_id:
            snap = EVENT_ODDS_COMPARE_CACHE.get(ev_id, {}).get(market_key) or {}
            snap_best = _safe_float(snap.get("best_odds"))
            if snap_best and snap_best > odds * 1.0005:   # minim +0.05% față de consensus
                odds = snap_best
                best_odds_bk = snap.get("best_bookmaker") or None
                odds_upgraded = True
    except Exception:
        pass
    # ──────────────────────────────────────────────────────────────────────────

    prob_meta = blend_model_probability(row, market_key)
    prob = prob_meta.get("effective_prob")
    confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
    league_name = (event.get("league") or {}).get("name") or "Unknown"
    tier_info = get_league_tier_info(league_name)
    calib_info = get_league_calibration(league_name)
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
    if require_outcome and outcome is None:
        return None

    # EV% și Kelly calculat față de best odds (dacă e disponibil)
    ev_pct = round(value * 100.0, 2) if value is not None else None
    kelly_pct = round(calc_kelly_pct(adj, odds, fraction=0.25), 2) if adj and odds > 1.01 else None

    return {
        "market": market["label"],
        "market_key": market_key,
        "odds": round(odds, 3),
        "odds_consensus": round(odds_consensus, 3),
        "odds_upgraded": odds_upgraded,
        "best_odds_bookmaker": best_odds_bk,
        "ev_pct": ev_pct,
        "kelly_pct": kelly_pct,
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
        "league_calib_tier": calib_info.get("tier", "neutral"),
        "league_roi_backtest": calib_info.get("roi", None),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
        "event_id": event.get("id"),
        "prediction_id": row.get("id"),
        "date": event.get("event_date"),
        "created_at": row.get("created_at"),
        "home_api_id": (event.get("home_team_obj") or {}).get("api_id"),
        "away_api_id": (event.get("away_team_obj") or {}).get("api_id"),
        "league_api_id": (event.get("league") or {}).get("api_id"),
        "most_likely_score": row.get("most_likely_score"),
        "v2_recommended": bool(row.get("v2_recommended")),
    }


def qualifies_for_strategy(candidate, strategy_cfg):
    if not candidate:
        return False
    if candidate["market_key"] not in strategy_cfg["allowed"]:
        return False
    if hard_contradiction({"most_likely_score": candidate.get("most_likely_score")}, candidate["market_key"]):
        return False

    # Calibrare dinamică per ligă bazată pe istoricul backtest
    league_name = candidate.get("league") or ""
    calib = get_league_calibration(league_name)
    adj_delta  = calib.get("adj_delta",  0.0)
    edge_delta = calib.get("edge_delta", 0.0)
    conf_delta = calib.get("conf_delta", 0.0)

    eff_min_adj  = strategy_cfg["min_adj"]  + adj_delta
    eff_min_edge = strategy_cfg["min_edge"] + edge_delta
    eff_min_conf = strategy_cfg["min_conf"] + conf_delta

    # ─── Relaxare 2pp pentru picks confirmate de v2 API (recommended + min_confidence) ──
    # v2 a filtrat deja pe confidence ≥ 0.68 + cel puțin o recomandare activă
    if candidate.get("v2_recommended"):
        eff_min_conf = max(strategy_cfg["min_conf"] - 4.0, eff_min_conf - 2.0)

    if candidate["adj_prob"] < eff_min_adj:
        return False
    if candidate["confidence"] < eff_min_conf:
        return False
    max_conf = strategy_cfg.get("max_conf")
    if max_conf is not None and candidate["confidence"] > max_conf:
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
    if edge < eff_min_edge:
        return False
    if candidate["verdict"] == "avoid":
        return False

    # ─── Line Move Filter ─────────────────────────────────────────────────────
    # Exclude pick-uri unde piața s-a mișcat puternic contra (drift > 5.3%)
    # CLV ≤-5% bucket: ROI -12.29% pe 51 pick-uri — nu merită pariat
    if candidate.get("line_move_signal") == "DRIFTING":
        return False

    # Filtru weekday bazat pe jurnal (ROI +6.65pp la aplicare)
    market_key_wd = candidate.get("market_key") or ""
    event_date_wd = candidate.get("date") or candidate.get("event_date") or ""
    if market_key_wd in WEEKDAY_RESTRICTIONS and event_date_wd:
        try:
            from datetime import datetime as _dt
            _event_dt = _dt.fromisoformat(str(event_date_wd).replace("Z", "+00:00"))
            _weekday = _event_dt.weekday()  # 0=Luni ... 6=Duminică
            if _weekday in WEEKDAY_RESTRICTIONS[market_key_wd]:
                return False
        except Exception:
            pass

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

        # Folosim build_candidate(require_outcome=False) — meciuri notstarted nu au scor
        candidates = []
        for market in MARKETS:
            cand = build_candidate(row, market["key"], require_outcome=False)
            if cand and qualifies_for_strategy(cand, STRATEGIES["engine_overall"]):
                candidates.append(cand)

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
        if pick.get("odds_upgraded") and pick.get("best_odds_bookmaker"):
            reason_tags.append(f"Best@{pick['best_odds_bookmaker']}")
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
            "odds_consensus": pick.get("odds_consensus"),
            "odds_upgraded": pick.get("odds_upgraded", False),
            "best_odds_bookmaker": pick.get("best_odds_bookmaker"),
            "market_prob": pick.get("market_prob"),
            "model_prob": pick.get("prob"),
            "api_prob": pick.get("api_prob"),
            "poisson_prob": pick.get("poisson_prob"),
            "poisson_delta": pick.get("poisson_delta"),
            "poisson_alert": pick.get("poisson_alert"),
            "adjusted_prob": pick.get("adj_prob"),
            "fair_odds": fair_odds,
            "edge_pct": pick.get("edge_pct"),
            "ev_pct": pick.get("ev_pct"),
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
            # ── Referee (din predicție, nu din candidat) ──────────────────
            "ref_name":          row.get("ref_name"),
            "ref_avg_goals":     row.get("ref_avg_goals"),
            "ref_avg_yellow":    row.get("ref_avg_yellow"),
            "ref_is_strict":     row.get("ref_is_strict"),
            "ref_is_high_goals": row.get("ref_is_high_goals"),
            # ── Lineup ────────────────────────────────────────────────────
            "lineup_status":     row.get("lineup_status"),
            "home_formation":    row.get("home_formation"),
            "away_formation":    row.get("away_formation"),
            "n_unavail_home":    row.get("n_unavail_home", 0),
            "n_unavail_away":    row.get("n_unavail_away", 0),
            "home_unavailable":  row.get("home_unavailable", []),
            "away_unavailable":  row.get("away_unavailable", []),
        })

    rows = [r for r in rows if r.get("market_key") != "under25"]
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
    # FIX: atomic write — scriem în fișier temp în același director și facem rename atomic.
    # os.replace() este atomic pe POSIX (rename syscall); pe Windows e best-effort.
    # Previne race condition în care alte procese citesc un JSON parțial scris.
    dir_name = os.path.dirname(os.path.abspath(path))
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp", prefix=f"{filename}.")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp_path, path)  # atomic pe POSIX
        tmp_path = None  # semnalăm că rename a reușit
        print(f"Saved: {path} ({os.path.getsize(path)} bytes)")
    except Exception as exc:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise exc


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


MARKET_ODDS_FIELD = {
    "homeWin":  ("odds_home", "home_win"),
    "draw":     ("odds_draw", "draw"),
    "awayWin":  ("odds_away", "away_win"),
    "over15":   ("odds_over_15", "over_15"),
    "under15":  ("odds_under_15", "under_15"),
    "over25":   ("odds_over_25", "over_25"),
    "under25":  ("odds_under_25", "under_25"),
    "under35":  ("odds_under_35", "under_35"),
    "btts":     ("odds_btts_yes", "btts_yes"),
    "dc1x":     ("odds_dc_1x", "dc_1x"),
    "dcx2":     ("odds_dc_x2", "dc_x2"),
    "dc12":     ("odds_dc_12", "dc_12"),
}

MARKET_COMPARE_CONFIG = {
    "homeWin":  {"market": "1x2",            "aliases": lambda ctx: [ctx.get("home_team"), "HOME", "1", "Home"]},
    "draw":     {"market": "1x2",            "aliases": lambda ctx: ["Draw", "DRAW", "X"]},
    "awayWin":  {"market": "1x2",            "aliases": lambda ctx: [ctx.get("away_team"), "AWAY", "2", "Away"]},
    "over15":   {"market": "over_under_15",  "aliases": lambda ctx: ["Over 1.5", "over", "OVER"]},
    "under15":  {"market": "over_under_15",  "aliases": lambda ctx: ["Under 1.5", "under", "UNDER"]},
    "over25":   {"market": "over_under_25",  "aliases": lambda ctx: ["Over 2.5", "over", "OVER"]},
    "under25":  {"market": "over_under_25",  "aliases": lambda ctx: ["Under 2.5", "under", "UNDER"]},
    "under35":  {"market": "over_under_35",  "aliases": lambda ctx: ["Under 3.5", "under", "UNDER"]},
    "btts":     {"market": "btts",           "aliases": lambda ctx: ["Yes", "yes", "BTTS Yes"]},
    "dc1x":     {"market": "double_chance",  "aliases": lambda ctx: ["1X", "1/X", "Home or Draw"]},
    "dcx2":     {"market": "double_chance",  "aliases": lambda ctx: ["X2", "X/2", "Draw or Away"]},
    "dc12":     {"market": "double_chance",  "aliases": lambda ctx: ["12", "1/2", "Home or Away"]},
}

# v2 API — outcome keys sunt coduri stabile (HOME/DRAW/AWAY/over/under/yes/no)
# nu mai depindem de team names; parsing direct fără alias matching
MARKET_COMPARE_CONFIG_V2 = {
    "homeWin":  {"market": "1x2",           "outcome_code": "HOME"},
    "draw":     {"market": "1x2",           "outcome_code": "DRAW"},
    "awayWin":  {"market": "1x2",           "outcome_code": "AWAY"},
    "over15":   {"market": "over_under_15", "outcome_code": "over"},
    "under15":  {"market": "over_under_15", "outcome_code": "under"},
    "over25":   {"market": "over_under_25", "outcome_code": "over"},
    "under25":  {"market": "over_under_25", "outcome_code": "under"},
    "over35":   {"market": "over_under_35", "outcome_code": "over"},
    "under35":  {"market": "over_under_35", "outcome_code": "under"},
    "btts":     {"market": "btts",          "outcome_code": "yes"},
    "dc1x":     {"market": "double_chance", "outcome_code": "1X"},
    "dcx2":     {"market": "double_chance", "outcome_code": "X2"},
    "dc12":     {"market": "double_chance", "outcome_code": "12"},
}


def _safe_float(value):
    try:
        out = float(value)
    except Exception:
        return None
    if not math.isfinite(out):
        return None
    return out


def _slug(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _candidate_aliases(market_key, context):
    config = MARKET_COMPARE_CONFIG.get(market_key) or {}
    aliases_fn = config.get("aliases") or (lambda _ctx: [])
    raw_aliases = aliases_fn(context or {}) or []
    out = []
    seen = set()
    for item in raw_aliases:
        if not item:
            continue
        label = str(item).strip()
        if not label:
            continue
        for variant in {label, _slug(label)}:
            if variant and variant not in seen:
                seen.add(variant)
                out.append(variant)
    return out


def _build_snapshot_entry(values, best_odds, best_bk, best_movement=None, best_ai_probability=None, best_updated_at=None):
    avg_odds = sum(values) / len(values)
    return {
        "best_odds": round(best_odds, 3),
        "best_bookmaker": best_bk,
        "bookmakers_count": len(values),
        "avg_odds": round(avg_odds, 3),
        "avg_implied_probability": round((100.0 / avg_odds), 2) if avg_odds > 1.01 else None,
        "best_implied_probability": round((100.0 / best_odds), 2) if best_odds > 1.01 else None,
        "movement": best_movement,
        "ai_probability": round(pct(best_ai_probability), 2) if best_ai_probability is not None else None,
        "updated_at": best_updated_at,
    }


def _parse_compare_snapshot(data):
    if not isinstance(data, dict):
        return {}
    markets = data.get("markets") or {}
    context = {
        "home_team": data.get("home_team"),
        "away_team": data.get("away_team"),
    }
    snapshot = {}
    bookmakers_count_global = int(data.get("bookmakers_count") or 0)
    for market_key, cfg in MARKET_COMPARE_CONFIG.items():
        market_name = cfg.get("market")
        market_block = markets.get(market_name)
        if not isinstance(market_block, dict):
            continue
        aliases = set(_candidate_aliases(market_key, context))
        chosen = None
        chosen_label = None
        for outcome_label, payload in market_block.items():
            if _slug(outcome_label) in aliases or str(outcome_label).strip() in aliases:
                chosen = payload
                chosen_label = outcome_label
                break
        if not isinstance(chosen, dict):
            continue
        best_odds = _safe_float(chosen.get("best_odds"))
        if best_odds is None or best_odds < 1.01:
            continue
        bookmakers = chosen.get("bookmakers") or {}
        values = []
        for _bk_name, bk_payload in (bookmakers.items() if isinstance(bookmakers, dict) else []):
            if not isinstance(bk_payload, dict):
                continue
            odd = _safe_float(bk_payload.get("decimal"))
            if odd is None or odd < 1.01:
                continue
            values.append(odd)
        if not values:
            values = [best_odds]
        entry = _build_snapshot_entry(
            values=values,
            best_odds=best_odds,
            best_bk=chosen.get("best_bookmaker") or chosen_label or "unknown",
            best_movement=None,
            best_ai_probability=chosen.get("ai_probability"),
            best_updated_at=None,
        )
        if bookmakers_count_global > 0:
            entry["bookmakers_count"] = max(entry.get("bookmakers_count") or 0, bookmakers_count_global)
        snapshot[market_key] = entry
    return snapshot


def _parse_compare_snapshot_v2(data):
    """
    Parser pentru BSD API v2 /events/{id}/odds/comparison/
    Outcome keys = coduri stabile: HOME/DRAW/AWAY/over/under/yes/no/1X/X2/12
    Nu mai depindem de team names — parsing direct și robust.
    """
    if not isinstance(data, dict):
        return {}
    markets = data.get("markets") or {}
    if not markets:
        return {}
    snapshot = {}
    for market_key, cfg in MARKET_COMPARE_CONFIG_V2.items():
        market_name = cfg["market"]
        outcome_code = cfg["outcome_code"]
        market_block = markets.get(market_name)
        if not isinstance(market_block, dict):
            continue
        # Lookup direct pe outcome code — v2 garantează aceste chei stabile
        chosen = market_block.get(outcome_code)
        if not isinstance(chosen, dict):
            continue
        best_odds = _safe_float(chosen.get("best_odds"))
        if best_odds is None or best_odds < 1.01:
            continue
        # Extrage odds individuale per bookmaker pentru avg și bookmakers_count
        bookmakers = chosen.get("bookmakers") or {}
        values = []
        best_bk_from_books = None
        best_odds_in_books = 0.0
        for bk_slug, bk_payload in (bookmakers.items() if isinstance(bookmakers, dict) else []):
            if not isinstance(bk_payload, dict):
                continue
            # v2 bookmaker payload: {"decimal_odds": 2.20, "implied_probability": 0.4545, "movement": "..."}
            odd = _safe_float(bk_payload.get("decimal_odds") or bk_payload.get("decimal"))
            if odd is None or odd < 1.01:
                continue
            values.append(odd)
            if odd > best_odds_in_books:
                best_odds_in_books = odd
                best_bk_from_books = bk_slug
        if not values:
            values = [best_odds]
        best_bk = chosen.get("best_bookmaker") or best_bk_from_books or "unknown"
        entry = _build_snapshot_entry(
            values=values,
            best_odds=best_odds,
            best_bk=best_bk,
            best_movement=None,
            best_ai_probability=None,
            best_updated_at=None,
        )
        snapshot[market_key] = entry
    return snapshot


def _parse_raw_odds_snapshot(data):
    if not isinstance(data, dict):
        return {}
    odds_rows = data.get("odds") or data.get("results") or []
    context = data.get("event") or {}
    grouped = {key: [] for key in MARKET_COMPARE_CONFIG.keys()}
    for row in odds_rows if isinstance(odds_rows, list) else []:
        if not isinstance(row, dict):
            continue
        market_name = str(row.get("market") or "").strip().lower()
        # v2: outcome = cod stabil (HOME/DRAW/AWAY/over/under/yes/no)
        # v1: outcome_name = text liber (team name, "Over 2.5" etc.)
        outcome_code = str(row.get("outcome") or "").strip()          # v2 cod
        outcome_name = str(row.get("outcome_name") or "").strip()     # v1/v2 label
        outcome_slug = _slug(outcome_name)
        odd = _safe_float(row.get("decimal_odds"))
        if odd is None or odd < 1.01:
            continue
        # Prioritate: match direct pe outcome code v2 (MARKET_COMPARE_CONFIG_V2)
        matched = False
        for market_key, cfg in MARKET_COMPARE_CONFIG_V2.items():
            if market_name == cfg["market"] and outcome_code == cfg["outcome_code"]:
                grouped[market_key].append(row)
                matched = True
                break
        if matched:
            continue
        # Fallback: match pe alias (v1 sau outcome_name text liber)
        for market_key, cfg in MARKET_COMPARE_CONFIG.items():
            if market_name != cfg.get("market"):
                continue
            aliases = set(_candidate_aliases(market_key, context))
            if outcome_name in aliases or outcome_slug in aliases:
                grouped[market_key].append(row)
                break
    snapshot = {}
    for market_key, rows in grouped.items():
        if not rows:
            continue
        values = []
        best_row = None
        best_odds = 0.0
        for row in rows:
            odd = _safe_float(row.get("decimal_odds"))
            if odd is None or odd < 1.01:
                continue
            values.append(odd)
            if odd > best_odds:
                best_odds = odd
                best_row = row
        if not best_row or best_odds < 1.01:
            continue
        # v2: bookmaker_slug; v1: bookmaker / bookmaker_code
        bk_name = (
            best_row.get("bookmaker_name")
            or best_row.get("bookmaker_slug")
            or best_row.get("bookmaker")
            or best_row.get("bookmaker_code")
            or "unknown"
        )
        movement = best_row.get("movement")  # v2: "SHORTENING" | "DRIFTING" | null
        ai_prob = best_row.get("ai_probability")
        if ai_prob is not None:
            ai_prob = pct(float(ai_prob) * 100.0 if float(ai_prob) <= 1 else float(ai_prob))
        snapshot[market_key] = _build_snapshot_entry(
            values=values,
            best_odds=best_odds,
            best_bk=bk_name,
            best_movement=movement,
            best_ai_probability=ai_prob,
            best_updated_at=best_row.get("updated_at"),
        )
    return snapshot



def _normalise_market_label_for_pm(market_name, outcome_code, outcome_name):
    market = str(market_name or "").strip().lower()
    outcome = str(outcome_code or outcome_name or "").strip().lower()
    if market == "btts":
        if outcome in {"yes", "y", "btts yes", "gg"}:
            return "btts_yes"
        if outcome in {"no", "n", "btts no", "ng"}:
            return "btts_no"
    if market == "1x2":
        if outcome in {"home", "1"}:
            return "home_win"
        if outcome in {"draw", "x"}:
            return "draw"
        if outcome in {"away", "2"}:
            return "away_win"
    if market.startswith("over_under_"):
        suffix = market.replace("over_under_", "").replace("_goals", "")
        if outcome in {"over", "o"}:
            return f"over_{suffix}_goals"
        if outcome in {"under", "u"}:
            return f"under_{suffix}_goals"
    return "_".join([x for x in [market, outcome] if x]).strip("_") or None


def _row_is_polymarket(row):
    bits = [
        row.get("bookmaker_slug"),
        row.get("bookmaker_name"),
        row.get("bookmaker"),
        row.get("bookmaker_code"),
        row.get("source"),
        row.get("provider"),
    ]
    blob = " ".join(str(x or "") for x in bits).lower()
    return "polymarket" in blob or blob.strip() == "poly" or " poly " in f" {blob} "


def _implied_pct_from_row(row):
    # Preferăm implied_probability dacă API-ul îl furnizează; altfel calculăm din cota decimală.
    ip = row.get("implied_probability")
    try:
        if ip is not None:
            n = float(ip)
            if math.isfinite(n) and n > 0:
                return n * 100.0 if n <= 1.0 else n
    except Exception:
        pass
    odd = _safe_float(row.get("decimal_odds") or row.get("decimal"))
    if odd and odd > 1.01:
        return 100.0 / odd
    return None


def _build_polymarket_signal_from_raw_rows(event_id_int, rows):
    """
    Construiește semnalul Polymarket fără request separat.
    Refolosește rândurile deja trase din /api/v2/odds/?event_id=... ca să nu încetinească workflow-ul.
    Semnal = probabilitatea implicită Polymarket minus media probabilităților implicite non-Polymarket.
    """
    if not isinstance(rows, list) or not rows:
        return None

    grouped = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = _normalise_market_label_for_pm(
            row.get("market"),
            row.get("outcome"),
            row.get("outcome_name"),
        )
        if not label:
            continue
        implied = _implied_pct_from_row(row)
        if implied is None or not math.isfinite(implied) or implied <= 0:
            continue
        bucket = grouped.setdefault(label, {"pm": [], "book": []})
        if _row_is_polymarket(row):
            bucket["pm"].append(implied)
        else:
            bucket["book"].append(implied)

    # Piețele pe care vrem să le afișăm în UI; BTTS primește prioritate pentru interpretare clară.
    preferred_order = {
        "btts_yes": 0,
        "btts_no": 1,
        "under_35_goals": 2,
        "over_25_goals": 3,
        "under_25_goals": 4,
        "over_15_goals": 5,
        "home_win": 6,
        "away_win": 7,
        "draw": 8,
    }

    best = None
    for label, vals in grouped.items():
        pm_vals = vals.get("pm") or []
        book_vals = vals.get("book") or []
        # Avem nevoie de cel puțin Polymarket + minim 2 bookmakere ca diferența să fie utilă.
        if not pm_vals or len(book_vals) < 2:
            continue
        pm_avg = sum(pm_vals) / len(pm_vals)
        book_avg = sum(book_vals) / len(book_vals)
        divergence = pm_avg - book_avg
        if not math.isfinite(divergence):
            continue
        # Filtru anti-zgomot: sub 5pp nu merită afișat pe card.
        if abs(divergence) < 5.0:
            continue
        score = abs(divergence) * 10.0 - preferred_order.get(label, 20)
        candidate = {
            "polymarket_signal": "optimistic" if divergence > 0 else "pessimistic",
            "polymarket_divergence": round(divergence, 2),
            "polymarket_market": label,
            "polymarket_probability": round(pm_avg, 2),
            "bookmakers_probability": round(book_avg, 2),
            "bookmakers_count": len(book_vals),
        }
        if best is None or score > best[0]:
            best = (score, candidate)

    return best[1] if best else None


def _normalise_pm_price_to_pct(value):
    """Acceptă atât preț 0-1, procent 0-100, decimal odds sau dict cu câmpuri comune."""
    try:
        if isinstance(value, dict):
            for key in (
                "probability", "prob", "price", "last_price", "yes_price", "no_price",
                "implied_probability", "implied_prob", "implied", "value"
            ):
                if key in value and value.get(key) is not None:
                    return _normalise_pm_price_to_pct(value.get(key))
            odd = value.get("decimal_odds") or value.get("decimal") or value.get("odds")
            if odd is not None:
                odd = float(odd)
                if math.isfinite(odd) and odd > 1.01:
                    return 100.0 / odd
            return None
        n = float(value)
        if not math.isfinite(n) or n <= 0:
            return None
        # Polymarket folosește de obicei 0-1. Unele endpoint-uri pot trimite deja procent.
        if n <= 1.0:
            return n * 100.0
        if n <= 100.0:
            return n
        # Dacă vine accidental cotă decimală mare, o transformăm defensiv.
        if n > 100.0:
            return 100.0 / n if n > 1.01 else None
    except Exception:
        return None
    return None


def _row_api_prob_for_polymarket(row, market_name, outcome_code, outcome_name=None):
    """Probabilitatea modelului intern pentru aceeași piață/outcome ca Polymarket."""
    market = str(market_name or "").strip().lower()
    outcome = str(outcome_code or outcome_name or "").strip().lower()
    try:
        if market in {"1x2", "match_winner", "winner"}:
            if outcome in {"home", "1", "home_win"}:
                return pct(row.get("prob_home_win"))
            if outcome in {"draw", "x"}:
                return pct(row.get("prob_draw"))
            if outcome in {"away", "2", "away_win"}:
                return pct(row.get("prob_away_win"))
        if market in {"btts", "both_teams_to_score"}:
            if outcome in {"yes", "y", "btts_yes", "gg"}:
                return pct(row.get("prob_btts_yes"))
            if outcome in {"no", "n", "btts_no", "ng"}:
                return 100.0 - pct(row.get("prob_btts_yes"))
        if market.startswith("over_under_"):
            suffix = market.replace("over_under_", "").replace("_goals", "")
            prob_key = None
            if suffix in {"15", "1_5", "1.5"}:
                prob_key = "prob_over_15"
            elif suffix in {"25", "2_5", "2.5"}:
                prob_key = "prob_over_25"
            elif suffix in {"35", "3_5", "3.5"}:
                prob_key = "prob_over_35"
            if prob_key:
                over_prob = pct(row.get(prob_key))
                if outcome in {"over", "o"}:
                    return over_prob
                if outcome in {"under", "u"}:
                    return 100.0 - over_prob
    except Exception:
        return None
    return None


def _fetch_polymarket_signal_direct(event_id_int, row):
    """
    Fallback identic ca safe-backup: folosește endpoint-ul dedicat
    /api/v2/events/{id}/polymarket/ când raw /odds nu conține sursa Polymarket.
    Fără acest fallback UI-ul are codul de afișare, dar primește numai valori None.
    """
    try:
        event_id_int = int(event_id_int)
    except Exception:
        return None
    try:
        pm_url = f"{V2_BASE}/events/{event_id_int}/polymarket/"
        r = requests.get(pm_url, headers=HEADERS, timeout=10)
        if r.status_code in (400, 404, 405):
            return None
        r.raise_for_status()
        pm_data = r.json()
    except Exception as e:
        print(f"[Polymarket] direct fetch failed for event {event_id_int} (non-fatal): {e}")
        return None

    markets_pm = None
    if isinstance(pm_data, dict):
        markets_pm = pm_data.get("markets") or pm_data.get("results") or pm_data.get("data")
    if not isinstance(markets_pm, dict):
        return None

    best = None
    best_abs = 0.0
    for mk, outcomes in markets_pm.items():
        if not isinstance(outcomes, dict):
            continue
        for outcome_code, pm_price in outcomes.items():
            pm_prob = _normalise_pm_price_to_pct(pm_price)
            if pm_prob is None or not math.isfinite(pm_prob) or pm_prob <= 0:
                continue
            api_prob = _row_api_prob_for_polymarket(row, mk, outcome_code)
            if api_prob is None or not math.isfinite(api_prob) or api_prob <= 0:
                continue
            div = round(pm_prob - float(api_prob), 2)
            if abs(div) > best_abs:
                best_abs = abs(div)
                best = {
                    "polymarket_signal": "PM_BULLISH" if div > 0 else "PM_BEARISH",
                    "polymarket_divergence": div,
                    "polymarket_market": f"{mk}_{outcome_code}",
                    "polymarket_probability": round(pm_prob, 2),
                    "bookmakers_probability": round(float(api_prob), 2),
                    "bookmakers_count": None,
                }
    if best and best_abs >= 6.0:
        return best
    return None

def _fetch_raw_odds_snapshot(event_id_int):
    # v2: /api/v2/odds/?event_id=X — rows per (event, bookmaker, market, outcome)
    # Returnează bookmaker_slug, movement (SHORTENING/DRIFTING), implied_probability
    base_url = f"{V2_BASE}/odds/?event_id={event_id_int}&limit=200"
    all_rows = []
    seen_urls = set()
    next_url = base_url
    while next_url and next_url not in seen_urls:
        seen_urls.add(next_url)
        r = requests.get(next_url, headers=HEADERS, timeout=20)
        if r.status_code in (400, 404, 405):
            break
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            rows = data.get("results") or []
            if isinstance(rows, list):
                all_rows.extend(rows)
            next_candidate = data.get("next")
            if next_candidate:
                next_url = next_candidate if str(next_candidate).startswith("http") else (V2_BASE.rstrip("/") + "/" + str(next_candidate).lstrip("/"))
            else:
                next_url = None
        else:
            break
    if not all_rows:
        POLYMARKET_SIGNAL_CACHE[event_id_int] = None
        return {}
    try:
        POLYMARKET_SIGNAL_CACHE[event_id_int] = _build_polymarket_signal_from_raw_rows(event_id_int, all_rows)
    except Exception as e:
        print(f"[Polymarket] parse failed for event {event_id_int} (non-fatal): {e}")
        POLYMARKET_SIGNAL_CACHE[event_id_int] = None
    return _parse_raw_odds_snapshot({"odds": all_rows})


def fetch_event_odds_compare_snapshot(event_id):
    """
    Returnează pentru un eveniment harta cu best odds / best bookmaker / average odds
    pe toate piețele suportate. Cache-uit per event pentru a evita request-uri repetate.

    Strategie v2:
    1. Fetch /api/v2/events/{id}/odds/comparison/ → outcome keys stabile (HOME/DRAW/AWAY/over/under)
       Parser nou: _parse_compare_snapshot_v2 — robust, fără dependență de team names
    2. Fetch /api/v2/odds/?event_id={id} → toate piețele incl. over_under_35, movement
       Include bookmaker_slug, movement (SHORTENING/DRIFTING) per row
    3. Merge: compare furnizează bookmakers_count și best per 1x2/btts
              raw completează piețele lipsă (under35, over15) și movement signal
    """
    try:
        event_id_int = int(event_id)
    except Exception:
        return {}
    if event_id_int in EVENT_ODDS_COMPARE_CACHE:
        return EVENT_ODDS_COMPARE_CACHE[event_id_int]

    # Pasul 1: v2 compare endpoint — outcome keys stabile (HOME/DRAW/AWAY/over/under/yes)
    # nu mai depinde de team names → parsing robust și corect
    compare_snapshot = {}
    try:
        r = requests.get(
            f"{V2_BASE}/events/{event_id_int}/odds/comparison/",
            headers=HEADERS, timeout=20
        )
        if r.status_code not in (400, 404, 405):
            r.raise_for_status()
            compare_snapshot = _parse_compare_snapshot_v2(r.json()) or {}
    except Exception:
        pass

    # Pasul 2: raw odds endpoint (market=all → include over_under_35, over_under_15 etc.)
    raw_snapshot = {}
    try:
        raw_snapshot = _fetch_raw_odds_snapshot(event_id_int) or {}
    except Exception:
        pass

    # Pasul 3: merge — compare e sursa principală, raw completează piețele lipsă
    merged = dict(compare_snapshot)
    for market_key, entry in raw_snapshot.items():
        if market_key not in merged:
            # Piața lipsea din compare (ex: under35, over15) — adăugăm din raw
            merged[market_key] = entry
        else:
            # Piața există în compare — completăm câmpuri lipsă din raw (ex: bookmakers_count)
            existing = merged[market_key]
            if not existing.get("bookmakers_count") and entry.get("bookmakers_count"):
                existing["bookmakers_count"] = entry["bookmakers_count"]

    if merged:
        EVENT_ODDS_COMPARE_CACHE[event_id_int] = merged
        return merged

    EVENT_ODDS_COMPARE_CACHE[event_id_int] = {}
    return {}


def fetch_best_market_odds(event_id, market_key):
    snapshot = fetch_event_odds_compare_snapshot(event_id)
    item = (snapshot or {}).get(market_key) or {}
    best_odds = item.get("best_odds")
    best_bk = item.get("best_bookmaker")
    if best_odds and best_bk:
        return best_odds, best_bk
    return None


def fetch_bulk_best_odds(unique_event_ids):
    """
    Fetch best odds pentru toate piețele relevante dintr-un singur call per piață.
    Folosim /api/v2/odds/best/?market=X — returnează best odds per event × outcome
    pentru TOATE evenimentele viitoare. Mult mai eficient decât per-event.

    Acoperă piețele care lipsesc din compare endpoint (over/under în special).
    Rezultatele se merge în EVENT_ODDS_COMPARE_CACHE.
    """
    # Piețe de fetchat bulk + mapare outcome_code → market_key intern
    BULK_MARKETS = [
        ("over_under_15",  {"over": "over15",  "under": "under15"}),
        ("over_under_25",  {"over": "over25",  "under": "under25"}),
        ("over_under_35",  {"over": "over35",  "under": "under35"}),
        ("btts",           {"yes": "btts",     "no":  "bttsNo"}),
        ("double_chance",  {"1X": "dc1x",      "X2": "dcx2", "12": "dc12"}),
    ]
    id_set = set(unique_event_ids)
    total_enriched = 0

    for market_slug, outcome_map in BULK_MARKETS:
        try:
            url = f"{V2_BASE}/odds/best/?market={market_slug}&limit=200"
            seen_urls = set()
            page_results = []
            next_url = url
            while next_url and next_url not in seen_urls:
                seen_urls.add(next_url)
                r = requests.get(next_url, headers=HEADERS, timeout=20)
                if r.status_code in (400, 404, 405):
                    break
                r.raise_for_status()
                data = r.json()
                if isinstance(data, dict):
                    page_results.extend(data.get("results") or [])
                    next_url = data.get("next")
                    if next_url and not str(next_url).startswith("http"):
                        next_url = V2_BASE.rstrip("/") + "/" + str(next_url).lstrip("/")
                else:
                    break

            for item in page_results:
                try:
                    event_id = int(item.get("event_id") or 0)
                except Exception:
                    continue
                if event_id not in id_set:
                    continue
                best_odds_list = item.get("best_odds") or []
                if not isinstance(best_odds_list, list):
                    continue
                cache_entry = EVENT_ODDS_COMPARE_CACHE.setdefault(event_id, {})
                for bo in best_odds_list:
                    outcome_code = str(bo.get("outcome") or "").strip()
                    market_key = outcome_map.get(outcome_code)
                    if not market_key:
                        continue
                    if market_key in cache_entry:
                        # Già esiste — aggiorna solo se best_odds è più alto
                        existing_best = _safe_float(cache_entry[market_key].get("best_odds")) or 0.0
                        new_best = _safe_float(bo.get("decimal_odds")) or 0.0
                        if new_best <= existing_best:
                            continue
                    best = _safe_float(bo.get("decimal_odds"))
                    if not best or best < 1.01:
                        continue
                    bk = bo.get("bookmaker_name") or bo.get("bookmaker_slug") or "unknown"
                    cache_entry[market_key] = {
                        "best_odds": round(best, 3),
                        "best_bookmaker": bk,
                        "bookmakers_count": 1,   # minim 1 — știm că există cel puțin bk-ul sursă
                        "avg_odds": round(best, 3),
                        "avg_implied_probability": round(100.0 / best, 2) if best > 1.01 else None,
                        "best_implied_probability": round(100.0 / best, 2) if best > 1.01 else None,
                        "movement": None,
                        "ai_probability": None,
                        "updated_at": None,
                    }
                    total_enriched += 1

        except Exception as e:
            print(f"[BulkBestOdds] {market_slug} failed (non-fatal): {e}")

    print(f"[BulkBestOdds] {total_enriched} market entries adăugate în cache din bulk fetch")
    return total_enriched


def enrich_predictions_with_market_odds(predictions, events=None):
    if not predictions:
        return predictions, events or [], {"predicted_events": 0, "events_with_market_compare": 0, "markets_enriched": 0}
    events = events or []
    event_map = {}
    for ev in events:
        try:
            event_map[int(ev.get("id"))] = ev
        except Exception:
            continue
    unique_event_ids = []
    seen = set()
    for row in predictions:
        ev = (row or {}).get("event") or {}
        try:
            event_id = int(ev.get("id"))
        except Exception:
            continue
        if event_id in seen:
            continue
        seen.add(event_id)
        unique_event_ids.append(event_id)
    if not unique_event_ids:
        return predictions, events, {"predicted_events": 0, "events_with_market_compare": 0, "markets_enriched": 0}
    print(f"Enriching market compare odds for {len(unique_event_ids)} predicted events...")

    # Pasul 1: per-event compare + raw (1x2, btts, deja implementat)
    enriched_events = 0
    enriched_markets = 0
    for event_id in unique_event_ids:
        snapshot = fetch_event_odds_compare_snapshot(event_id)
        if not snapshot:
            continue
        enriched_events += 1
        enriched_markets += len(snapshot)
        ev = event_map.get(event_id)
        if isinstance(ev, dict):
            ev["market_best_odds"] = snapshot
            ev["bookmakers_count"] = max([int((v or {}).get("bookmakers_count") or 0) for v in snapshot.values()] + [0])

    # Pasul 2: bulk best odds per piață (over/under acoperite eficient)
    # Completează cache-ul cu piețele care lipsesc din compare
    try:
        fetch_bulk_best_odds(unique_event_ids)
    except Exception as e:
        print(f"[BulkBestOdds] Bulk fetch failed (non-fatal): {e}")

    # Pasul 3: propagă cache-ul complet (include acum și over/under) pe fiecare event
    for row in predictions:
        ev = (row or {}).get("event") or {}
        try:
            event_id = int(ev.get("id"))
        except Exception:
            continue
        snapshot = EVENT_ODDS_COMPARE_CACHE.get(event_id) or {}
        if not snapshot:
            continue
        if isinstance(ev, dict):
            ev["market_best_odds"] = snapshot
            ev["bookmakers_count"] = max([int((v or {}).get("bookmakers_count") or 0) for v in snapshot.values()] + [0])
    stats = {
        "predicted_events": len(unique_event_ids),
        "events_with_market_compare": enriched_events,
        "markets_enriched": enriched_markets,
    }
    print(
        f"Market compare enrichment complete: {enriched_events}/{len(unique_event_ids)} events with multi-bookmaker odds, {enriched_markets} market snapshots."
    )
    return predictions, events, stats


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
    calib_info = get_league_calibration(league_name)
    value = calc_value(prob, odds)
    if value <= 0:
        return None
    # Ridicat de la 1.65 → 2.00 pentru a permite BTTS si Over25 sa concureze
    if odds > 2.00:
        return None
    # Under35 edge floor: zona 8-11pp are ROI negativ pe date reale.
    # Profitabil doar edge >= 11pp. Sub acest prag pick-ul e eliminat.
    if market_key == "under35":
        _mp_u35 = market_prob_from_row_event(row, event, market_key)
        if _mp_u35 is not None and (prob - _mp_u35) < 11.0:
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

    # ─── V2 API bonus: manager stats + standings xGd ──────────────────────────
    ticket_score += v2_score_adjustment(row, market_key)

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
        "league_calib_tier": calib_info.get("tier", "neutral"),
        "league_roi_backtest": calib_info.get("roi", None),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
        "event_id": event.get("id"),
        "prediction_id": row.get("id"),
        "date": event.get("event_date"),
        "created_at": row.get("created_at"),
        "home_api_id": (event.get("home_team_obj") or {}).get("api_id"),
        "away_api_id": (event.get("away_team_obj") or {}).get("api_id"),
        "league_api_id": (event.get("league") or {}).get("api_id"),
        "most_likely_score": row.get("most_likely_score"),
        # verdict & risk_tier — salvate in log pentru clasificare exacta pe categorii Meciuri
        "verdict": verdict_from_metrics(adj, value, confidence, edge_pct or 0),
        "risk_tier": (
            "Safe"     if verdict_from_metrics(adj, value, confidence, edge_pct or 0) == "safe"
            else "Value"    if (value >= 0.08 and float(edge_pct or 0) >= 3)
            else "Balanced" if verdict_from_metrics(adj, value, confidence, edge_pct or 0) == "value"
            else "Avoid"
        ),
        # ─── V2 signals ───────────────────────────────────────────────────────
        "v2_recommended": bool(row.get("v2_recommended")),
        "home_mgr_over25_pct": row.get("home_mgr_over25_pct"),
        "away_mgr_over25_pct": row.get("away_mgr_over25_pct"),
        "home_mgr_btts_pct": row.get("home_mgr_btts_pct"),
        "away_mgr_btts_pct": row.get("away_mgr_btts_pct"),
        "home_mgr_cs_pct": row.get("home_mgr_cs_pct"),
        "away_mgr_cs_pct": row.get("away_mgr_cs_pct"),
        "home_xgd": row.get("home_xgd"),
        "away_xgd": row.get("away_xgd"),
        "xgd_diff": row.get("xgd_diff"),
    }



def build_current_recommendation_rows(predictions, logged_at_iso, drifting_event_ids=None):
    rows = []
    drifting_event_ids = drifting_event_ids or set()
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

        # ─── Excludem pick-urile DRIFTING (piața s-a mișcat >5.3% contra) ────
        if str(event_id) in drifting_event_ids:
            continue

        # ── Calculeaza toate categoriile Meciuri la care apartine acest meci ──
        _pick_verdict  = pick.get("verdict") or ""
        _pick_value    = float(pick.get("value") or 0)
        _pick_edge     = float(pick.get("edge_pct") or 0)
        _pick_risk     = pick.get("risk_tier") or ""
        _all_mkt_keys  = {c.get("market_key") for c in candidates if c.get("market_key")}
        _eligible_cats = ["all"]
        if _pick_verdict == "safe" or _pick_risk == "Safe":
            _eligible_cats.append("safe")
        if _pick_value >= 0.08 and _pick_edge >= 3 or _pick_risk == "Value":
            _eligible_cats.append("value")
        if "over15"  in _all_mkt_keys: _eligible_cats.append("o15")
        if "over25"  in _all_mkt_keys: _eligible_cats.append("o25")
        if "btts"    in _all_mkt_keys: _eligible_cats.append("btts")
        if "under35" in _all_mkt_keys: _eligible_cats.append("u35")

        rows.append({
            "log_id": str(event_id),
            "logged_at": logged_at_iso,
            "prediction_created_at": pick.get("created_at"),
            "event_id": event_id,
            "prediction_id": pick.get("prediction_id"),
            "home": event.get("home_team"),
            "away": event.get("away_team"),
            "home_api_id": pick.get("home_api_id") or (event.get("home_team_obj") or {}).get("api_id")
