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

try:
    import anthropic as _anthropic_mod
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

try:
    from tavily import TavilyClient as _TavilyClient
    _TAVILY_AVAILABLE = True
except ImportError:
    _TAVILY_AVAILABLE = False

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
V2_BASE = "https://sports.bzzoiro.com/api/v2"  # BSD API v2 — endpoints noi (managers, standings xGd, predictions filter)
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept-Language": "ro-RO,ro;q=0.9"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC
LOOKAHEAD_DAYS = 30
BACKTEST_LOOKBACK_DAYS = 21
# Fix 10: crescut de la 60 la 90 zile — cu logul incepand din 7 Apr, 60 zile
# nu captau decat 38 zile de date efective. 90 zile asigura acoperire completa.
HISTORY_LOOKBACK_DAYS = 90
HISTORY_MAX_ROWS = 2500
RECOMMENDATION_LOG_MAX_ROWS = 5000
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

V2_ENRICHMENT_CACHE: Dict[str, Any] = {}  # populat lazy în main()

TEAM_FORM_CACHE: Dict[str, Any] = {}  # populat lazy în main() din team_form_cache.json


def load_team_form_cache() -> Dict[str, Any]:
    """
    Încarcă data/team_form_cache.json generat de fetch_team_form_cache.py.
    Returnează dict {team_id (str): form_dict} cu form_score, form_string etc.
    """
    path = os.path.join(DATA_DIR, "team_form_cache.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        teams = data.get("teams") or {}
        if isinstance(teams, dict):
            return {str(k): v for k, v in teams.items()}
        return {}
    except Exception as e:
        print(f"[TeamForm] load failed (non-fatal): {e}")
        return {}


def load_v2_enrichment_cache() -> Dict[str, Any]:
    """
    Încarcă data/v2_enrichment_cache.json generat de fetch_v2_enrichment_cache.py.
    Returnează dict {event_id (str): bundle_dict} sau {} dacă fișierul lipsește.
    Conține: detail (derby/neutral/travel/weather/pitch), prediction (BSD v2 ML),
             h2h (head-to-head stats), referee, managers, lineups.
    """
    path = os.path.join(DATA_DIR, "v2_enrichment_cache.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        events = data.get("events") or {}
        if isinstance(events, list):
            return {str(e.get("event_id", "")): e for e in events if e.get("event_id")}
        if isinstance(events, dict):
            return {str(k): v for k, v in events.items()}
        return {}
    except Exception as e:
        print(f"[V2Cache] load failed (non-fatal): {e}")
        return {}


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


def blend_model_probability(row, market_key, v2_ml_prob=None):
    """
    Blendează probabilitățile din trei surse:
      - BSD v1 API (model principal)
      - Poisson Dixon-Coles (model analitic local)
      - BSD v2 ML CatBoost (GAP 2 — integrat din v2_enrichment_cache)

    Cu 3 surse: v1 50% + Poisson 25% + v2 ML 25%
    Cu 2 surse: v1 72% + Poisson 28% (comportament original)
    Cu 1 sursă: v1 100%
    """
    api_prob = api_market_probability(row, market_key)
    metrics = build_poisson_metrics(row)
    poisson_prob = poisson_market_probability(metrics, market_key)
    effective_prob = api_prob
    delta = None
    alert = False
    direction = "flat"

    if poisson_prob is not None and v2_ml_prob is not None:
        # ── Triple blend: v1 BSD 50% + Poisson 25% + v2 ML 25% ──────────────
        delta = round(float(poisson_prob) - float(api_prob), 2)
        alert = abs(delta) > 5.0
        effective_prob = round(
            api_prob * 0.50
            + float(poisson_prob) * 0.25
            + float(v2_ml_prob) * 0.25,
            2
        )
        if delta > 5.0:
            direction = "value"
        elif delta < -5.0:
            direction = "risk"
    elif poisson_prob is not None:
        # ── Dual blend: v1 72% + Poisson 28% (comportament original) ─────────
        delta = round(float(poisson_prob) - float(api_prob), 2)
        alert = abs(delta) > 5.0
        api_weight = 0.55 if alert else 0.72
        poisson_weight = 1.0 - api_weight
        effective_prob = round(
            (api_prob * api_weight) + (float(poisson_prob) * poisson_weight), 2
        )
        if delta > 5.0:
            direction = "value"
        elif delta < -5.0:
            direction = "risk"

    return {
        "api_prob": round(api_prob, 2),
        "poisson_prob": round(float(poisson_prob), 2) if poisson_prob is not None else None,
        "v2_ml_prob": round(float(v2_ml_prob), 2) if v2_ml_prob is not None else None,
        "effective_prob": round(effective_prob, 2),
        "poisson_delta": delta,
        "poisson_alert": alert,
        "poisson_direction": direction,
        "poisson": metrics or {},
    }


def get_v2_ml_probability(event_id, market_key) -> Optional[float]:
    """
    GAP 2: Extrage probabilitatea ML v2 BSD din V2_ENRICHMENT_CACHE pentru un eveniment.
    Suportă ambele formate returnate de /api/v2/events/{id}/prediction/:
      - flat:    {prob_home_win: 0.55, prob_over_25: 0.62, ...}  (valori 0-1 sau 0-100)
      - grouped: {markets: {1x2: {HOME: 0.55}, over_under_25: {over: 0.62}, ...}}
    Returnează None dacă cache-ul lipsește sau probabilitatea nu e disponibilă.
    """
    if not event_id or not V2_ENRICHMENT_CACHE:
        return None
    bundle = V2_ENRICHMENT_CACHE.get(str(event_id)) or {}
    prediction = bundle.get("prediction")
    if not isinstance(prediction, dict):
        return None

    def _to_pct(v) -> Optional[float]:
        try:
            n = float(v)
        except Exception:
            return None
        if not math.isfinite(n) or n < 0:
            return None
        # Valori 0-1 → convertim la procente
        return round(n * 100.0 if n <= 1.0 else (100.0 if n > 100 else n), 2)

    # ── Format flat (identic cu v1, câmpuri prob_*) ───────────────────────
    FLAT_MAP = {
        "homeWin": ("prob_home_win",  False),
        "draw":    ("prob_draw",      False),
        "awayWin": ("prob_away_win",  False),
        "over15":  ("prob_over_15",   False),
        "under15": ("prob_over_15",   True),   # inversat
        "over25":  ("prob_over_25",   False),
        "under25": ("prob_over_25",   True),   # inversat
        "under35": ("prob_over_35",   True),   # inversat
        "btts":    ("prob_btts_yes",  False),
    }
    if market_key in FLAT_MAP:
        field, invert = FLAT_MAP[market_key]
        val = prediction.get(field)
        if val is not None:
            p = _to_pct(val)
            if p is not None:
                return round(100.0 - p, 2) if invert else p

    # ── Format grouped (markets nested) ──────────────────────────────────
    markets = prediction.get("markets") or prediction.get("grouped_markets") or {}
    if isinstance(markets, dict):
        GROUPED_MAP = {
            "homeWin":  ("1x2",            "HOME"),
            "draw":     ("1x2",            "DRAW"),
            "awayWin":  ("1x2",            "AWAY"),
            "over15":   ("over_under_15",  "over"),
            "under15":  ("over_under_15",  "under"),
            "over25":   ("over_under_25",  "over"),
            "under25":  ("over_under_25",  "under"),
            "under35":  ("over_under_35",  "under"),
            "btts":     ("btts",           "yes"),
        }
        if market_key in GROUPED_MAP:
            mkt_name, outcome_code = GROUPED_MAP[market_key]
            mkt_block = markets.get(mkt_name)
            if isinstance(mkt_block, dict):
                val = mkt_block.get(outcome_code)
                if val is None:
                    # Fallback case-insensitive
                    val = next((v for k, v in mkt_block.items()
                                if str(k).lower() == outcome_code.lower()), None)
                if val is not None:
                    return _to_pct(val)
    return None
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

    prob_meta = blend_model_probability(row, market_key, v2_ml_prob=get_v2_ml_probability(event.get("id"), market_key))
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
        "v2_ml_prob": prob_meta.get("v2_ml_prob"),
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


def odds_in_ranges(odds: Optional[float], ranges: List) -> bool:
    """
    Returnează True dacă odds-ul cade într-unul din intervalele de excludere.
    ranges = lista de [lo, hi] sau (lo, hi). Ex: [[1.26, 1.44], [2.05, 2.20]]
    Folosit în qualifies_for_strategy pentru 'exclude_odds_ranges'.
    """
    if not odds or not ranges:
        return False
    try:
        v = float(odds)
    except (TypeError, ValueError):
        return False
    for r in ranges:
        try:
            lo, hi = float(r[0]), float(r[1])
            if lo <= v <= hi:
                return True
        except Exception:
            continue
    return False


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

    # Fix 8: elimina under25 din Signal Audit (piata netrackuita in recommendation_log)
    # under25 aparea din STRATEGIES["engine_overall"]["allowed"] care include sub-piete
    # dar build_current_recommendation_rows nu trackuieste under25
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

    prob_meta = blend_model_probability(row, market_key, v2_ml_prob=get_v2_ml_probability(event.get("id"), market_key))
    prob = prob_meta.get("effective_prob")
    confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
    league_name = (event.get("league") or {}).get("name") or "Unknown"
    tier_info = get_league_tier_info(league_name)
    calib_info = get_league_calibration(league_name)
    value = calc_value(prob, odds)
    if value <= 0:
        return None
    # Ridicat de la 1.65 -> 2.00 pentru a permite BTTS si Over25 (avg cota 1.72/1.76)
    # sa concureze cu Under35 — BTTS ROI +12%, Over25 ROI +13% erau sistematic eliminate
    if odds > 2.00:
        return None
    # Anti-flood Under35: impune min_edge 6pp inline inainte de calcule costisitoare
    # Zona edge 5-7pp are ROI +3.6% (OK), sub 6pp nu justifica pick-ul
    if market_key == "under35":
        _mp_u35 = market_prob_from_row_event(row, event, market_key)
        if _mp_u35 is not None and (prob - _mp_u35) < 6.0:
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
        "v2_ml_prob": prob_meta.get("v2_ml_prob"),
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
            "home_api_id": pick.get("home_api_id") or (event.get("home_team_obj") or {}).get("api_id"),
            "away_api_id": pick.get("away_api_id") or (event.get("away_team_obj") or {}).get("api_id"),
            "league_api_id": pick.get("league_api_id") or (event.get("league") or {}).get("api_id"),
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
            "verdict": _pick_verdict,
            "risk_tier": _pick_risk,
            "eligible_categories": _eligible_cats,
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

    # ── Diversity cap: max 40% din picks poate fi aceeasi piata ──────────────
    # Previne dominarea Under35 (anterior 57-60%) cand BTTS/Over25 sunt mai profitabile.
    # Algoritmul: prima trecere pastreaza picks in ordine cronologica;
    # daca o piata depaseste 40% din total, surplusul e inlocuit cu urmatorul
    # candidate disponibil pentru acel eveniment (alt market_key).
    if rows:
        total = len(rows)
        MAX_MARKET_PCT = 0.40
        cap = max(3, int(total * MAX_MARKET_PCT))
        market_count = {}
        kept = []
        # Indexam candidates per event_id pentru fallback rapid
        _cand_by_event = {}
        for _row in predictions or []:
            _ev = _row.get("event") or {}
            if _ev.get("status") != "notstarted":
                continue
            _eid = None
            for _mk in tracked_market_keys:
                _c = build_ui_live_candidate(_row, _mk)
                if _c:
                    _eid = _c.get("event_id")
                    _cand_by_event.setdefault(str(_eid), []).append(_c)
        # Sort candidati per event dupa ticket_score
        for _eid in _cand_by_event:
            _cand_by_event[_eid].sort(key=lambda c: c.get("ticket_score") or 0, reverse=True)
        for r in rows:
            mk = r.get("market_key")
            cnt = market_count.get(mk, 0)
            if cnt < cap:
                market_count[mk] = cnt + 1
                kept.append(r)
            else:
                # Incearca sa gaseasca un alt market_key pentru acelasi eveniment
                eid_str = str(r.get("event_id") or "")
                fallback = None
                for alt_c in (_cand_by_event.get(eid_str) or []):
                    alt_mk = alt_c.get("market_key")
                    if alt_mk != mk and market_count.get(alt_mk, 0) < cap:
                        # Construieste row-ul similar cu pick alternativ
                        fallback = dict(r)
                        fallback["market"] = alt_c.get("market")
                        fallback["market_key"] = alt_mk
                        fallback["odds"] = alt_c.get("odds")
                        fallback["model_prob"] = alt_c.get("model_prob")
                        fallback["adjusted_prob"] = alt_c.get("adjusted_prob")
                        fallback["market_prob"] = alt_c.get("market_prob")
                        fallback["edge_pct"] = alt_c.get("edge_pct")
                        fallback["value"] = alt_c.get("value")
                        fallback["score"] = alt_c.get("ticket_score")
                        fallback["api_prob"] = alt_c.get("api_prob")
                        fallback["poisson_prob"] = alt_c.get("poisson_prob")
                        fallback["poisson_delta"] = alt_c.get("poisson_delta")
                        fallback["poisson_alert"] = alt_c.get("poisson_alert")
                        fallback["confidence"] = alt_c.get("confidence")
                        fallback["verdict"] = alt_c.get("verdict", "")
                        fallback["risk_tier"] = alt_c.get("risk_tier", "")
                        market_count[alt_mk] = market_count.get(alt_mk, 0) + 1
                        break
                if fallback:
                    kept.append(fallback)
                else:
                    # Niciun alt market disponibil -> pastram originalul (mai bine decat nimic)
                    market_count[mk] = cnt + 1
                    kept.append(r)
        kept.sort(key=lambda x: (x.get("event_date") or "", x.get("event_id") or 0))
        rows = kept
    # ─────────────────────────────────────────────────────────────────────────

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
            row["line_move_signal"] = "NEW"
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
        # ─── Line Move Signal ─────────────────────────────────────────────────
        # Bazat pe CLV Buckets: drift > 5.3% = CLV ≤-5% = ROI -12.29% → DRIFTING
        fop = row.get("from_open_pct") or 0.0
        if fop > LINE_MOVE_DRIFT_REJECT:
            row["line_move_signal"] = "DRIFTING"   # piața s-a mișcat contra → excludem
        elif fop < LINE_MOVE_CONFIRM_MIN:
            row["line_move_signal"] = "CONFIRMED"  # piața confirmă direcția → prioritizăm
        else:
            row["line_move_signal"] = "NEUTRAL"
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
    # Fix 7: min_bets ridicat de la 4 la 10 pentru pattern-uri core (la n=4 CI95 e invalid)
    positive_candidates = sorted(
        [r for r in flat_patterns if r.get("raw_bets", 0) >= 10 and r.get("memory_score", 0) > 0],
        key=lambda x: ((x.get("memory_score") or 0), (x.get("roi") or 0), (x.get("raw_bets") or 0)),
        reverse=True,
    )
    negative_candidates = sorted(
        [r for r in flat_patterns if r.get("raw_bets", 0) >= 10 and r.get("memory_score", 0) < 0],
        key=lambda x: ((x.get("memory_score") or 0), (x.get("roi") or 0)),
    )
    positive_patterns = ai_select_diverse_patterns(positive_candidates, limit=12, max_per_market=2)
    negative_patterns = ai_select_diverse_patterns(negative_candidates, limit=12, max_per_market=2)

    # Fix 7: min_bets default ridicat de la 4 la 8 pentru lookup in scoring
    def lookup(kind, key, min_bets=8):
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

        # Fix 7: min_bets per check ridicate (6→10 core, 4→6 context)
        core_checks = [
            ("market", market_key, 10, 0.60, market_label),
            ("market_league", f"{market_key}|{league}", 8, 0.75, f"{market_label} în {league}"),
        ]
        context_checks = [
            ("market_odds", f"{market_key}|{odds_bucket}", 6, 0.28, f"{market_label} la cote {odds_bucket}"),
            ("market_conf", f"{market_key}|{conf_bucket}", 6, 0.28, f"{market_label} la conf {conf_bucket}"),
            ("market_edge", f"{market_key}|{edge_bucket}", 6, 0.22, f"{market_label} la edge {edge_bucket}"),
            ("market_weekday", f"{market_key}|{weekday}", 8, 0.18, f"{market_label} în {weekday}"),
            ("market_hour", f"{market_key}|{hour_bucket}", 8, 0.18, f"{market_label} în intervalul {hour_bucket}"),
            ("market_source", f"{market_key}|{source_label}", 6, 0.15, f"{market_label} din sursa {source_label}"),
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


# ══════════════════════════════════════════════════════════════════════════════
# BSD API v2 — Integrare selectivă: recommendations filter, manager stats, xGd
# v1 rămâne sursa principală; v2 furnizează semnale adiționale non-blocking.
# ══════════════════════════════════════════════════════════════════════════════

def fetch_v2_recommended_event_ids(today_str, future_str):
    """
    Fetch event IDs pe care v2 API le consideră recomandate (confidence ≥ 0.68 +
    cel puțin un flag *_recommend=True). Folosit pentru relaxare 2pp în qualifies.
    Returnează set() la eroare (non-blocking).
    """
    recommended_ids = set()
    try:
        url = (
            f"{V2_BASE}/predictions/?status=upcoming"
            f"&min_confidence=0.68&recommended=true&limit=200"
            f"&date_from={today_str}&date_to={future_str}"
        )
        seen = set()
        next_url = url
        while next_url and next_url not in seen and len(recommended_ids) < 500:
            seen.add(next_url)
            r = requests.get(next_url, headers=HEADERS, timeout=20)
            if r.status_code != 200:
                break
            data = r.json()
            for item in (data.get("results") or []):
                ev_id = (item.get("event") or {}).get("id")
                if ev_id:
                    recommended_ids.add(int(ev_id))
            next_url = data.get("next") or None
        print(f"[V2] Recommended event IDs: {len(recommended_ids)}")
    except Exception as e:
        print(f"[V2] fetch_v2_recommended_event_ids failed (non-fatal): {e}")
    return recommended_ids


def fetch_manager_stats_for_teams(team_api_ids):
    """
    Fetch statistici antrenor curent per echipă din v2 API:
      over_25_pct, btts_pct, clean_sheet_pct, avg_possession.
    Returnează {team_api_id: dict} — valori lipsă → None în dict.
    Cap la 50 echipe pentru a limita numărul de request-uri.
    """
    manager_map = {}
    if not team_api_ids:
        return manager_map
    ids_to_fetch = list(team_api_ids)[:50]
    fetched = 0
    for team_id in ids_to_fetch:
        try:
            r = requests.get(
                f"{V2_BASE}/managers/?team_id={team_id}&limit=1",
                headers=HEADERS, timeout=12
            )
            if r.status_code != 200:
                continue
            results = (r.json().get("results") or [])
            if not results:
                continue
            mgr = results[0]
            manager_map[int(team_id)] = {
                "over25_pct":       float(mgr.get("over_25_pct")       or 0.0),
                "btts_pct":         float(mgr.get("btts_pct")           or 0.0),
                "clean_sheet_pct":  float(mgr.get("clean_sheet_pct")    or 0.0),
                "avg_possession":   float(mgr.get("avg_possession")     or 0.0),
                "name":             mgr.get("short_name") or mgr.get("name") or "",
            }
            fetched += 1
        except Exception as e:
            print(f"[V2] Manager fetch failed team {team_id} (non-fatal): {e}")
    print(f"[V2] Manager stats: {fetched}/{len(ids_to_fetch)} teams")
    return manager_map


def fetch_standings_xgd_map(league_api_ids):
    """
    Fetch clasament cu xGd per ligă din v2 API.
    Returnează {(league_id, team_id): xgd_float}.
    xgd > 0 = echipa creează mai mult xG decât primește → indicator de putere.
    """
    xgd_map = {}
    if not league_api_ids:
        return xgd_map
    fetched_leagues = 0
    for league_id in league_api_ids:
        try:
            r = requests.get(
                f"{V2_BASE}/leagues/{league_id}/standings/",
                headers=HEADERS, timeout=12
            )
            if r.status_code != 200:
                continue
            data = r.json()
            rows = data.get("standings") or []
            # suport și format grouped (cupe cu grupe)
            if not rows and data.get("groups"):
                for group_rows in data["groups"].values():
                    rows.extend(group_rows if isinstance(group_rows, list) else [])
            for row in rows:
                team_id = row.get("team_id")
                xgd = row.get("xgd")
                xg_games = int(row.get("xg_games") or 0)
                # ignorăm echipele cu sub 3 meciuri cu date xG (sample prea mic)
                if team_id is not None and xgd is not None and xg_games >= 3:
                    xgd_map[(int(league_id), int(team_id))] = float(xgd)
            fetched_leagues += 1
        except Exception as e:
            print(f"[V2] Standings xGd failed league {league_id} (non-fatal): {e}")
    print(f"[V2] Standings xGd: {fetched_leagues}/{len(league_api_ids)} ligi, {len(xgd_map)} entități team")
    return xgd_map


def fetch_event_referee_id(event_id_int: int) -> Optional[int]:
    """
    Fetch referee_id pentru un eveniment din /api/v2/events/{id}/.
    Folosit la enrichment pentru predicțiile curente.
    Graceful: returnează None dacă nu există.
    """
    try:
        r = requests.get(
            f"{V2_BASE}/events/{event_id_int}/",
            headers=HEADERS, timeout=15
        )
        if r.status_code != 200:
            return None
        data = r.json()
        ref_id = data.get("referee_id")
        return int(ref_id) if ref_id else None
    except Exception:
        return None


def enrich_with_v2_signals(predictions, v2_recommended_ids, manager_map, xgd_map):
    """
    Adaugă pe fiecare prediction row câmpuri derivate din v2:
      v2_recommended, home/away_mgr_*, home/away_xgd, xgd_diff.
      referee_id, ref_avg_yellow, ref_avg_goals, ref_avg_fouls, ref_style.
    Graceful: câmpuri lipsă rămân None, nu aruncă excepții.
    """
    if not predictions:
        return predictions
    enriched_count = 0
    ref_enriched = 0
    for row in predictions:
        event = row.get("event") or {}
        event_id = event.get("id")

        # Flag v2 recommended
        row["v2_recommended"] = bool(event_id and int(event_id) in v2_recommended_ids)

        # Team IDs pentru manager lookup
        home_obj = event.get("home_team_obj") or {}
        away_obj = event.get("away_team_obj") or {}
        home_tid = home_obj.get("api_id") or home_obj.get("id")
        away_tid = away_obj.get("api_id") or away_obj.get("id")

        home_mgr = manager_map.get(int(home_tid)) if home_tid else None
        away_mgr = manager_map.get(int(away_tid)) if away_tid else None

        row["home_mgr_over25_pct"]  = home_mgr.get("over25_pct")       if home_mgr else None
        row["away_mgr_over25_pct"]  = away_mgr.get("over25_pct")       if away_mgr else None
        row["home_mgr_btts_pct"]    = home_mgr.get("btts_pct")         if home_mgr else None
        row["away_mgr_btts_pct"]    = away_mgr.get("btts_pct")         if away_mgr else None
        row["home_mgr_cs_pct"]      = home_mgr.get("clean_sheet_pct")  if home_mgr else None
        row["away_mgr_cs_pct"]      = away_mgr.get("clean_sheet_pct")  if away_mgr else None

        # Standings xGd
        league_id = (event.get("league") or {}).get("api_id")
        home_xgd = xgd_map.get((int(league_id), int(home_tid))) if (league_id and home_tid) else None
        away_xgd = xgd_map.get((int(league_id), int(away_tid))) if (league_id and away_tid) else None

        row["home_xgd"] = home_xgd
        row["away_xgd"] = away_xgd
        row["xgd_diff"] = (
            round(float(home_xgd) - float(away_xgd), 3)
            if (home_xgd is not None and away_xgd is not None) else None
        )

        # ── Referee enrichment ─────────────────────────────────────────────
        # Pasul 1: referee_id din event (v1 API nu îl returnează → fetch v2 detail)
        ref_id = event.get("referee_id")
        if not ref_id and event_id and REFEREE_STATS:
            try:
                ref_id = fetch_event_referee_id(int(event_id))
                if ref_id and isinstance(event, dict):
                    event["referee_id"] = ref_id  # cache pe event object
            except Exception:
                pass

        # Pasul 2: lookup stats arbitru
        ref_stats = REFEREE_STATS.get(int(ref_id)) if ref_id else None
        row["referee_id"]        = ref_id
        row["ref_name"]          = ref_stats.get("name")            if ref_stats else None
        row["ref_country"]       = ref_stats.get("country")         if ref_stats else None
        row["ref_avg_yellow"]    = ref_stats.get("avg_yellow")      if ref_stats else None
        row["ref_avg_red"]       = ref_stats.get("avg_red")         if ref_stats else None
        row["ref_avg_goals"]     = ref_stats.get("avg_goals")       if ref_stats else None
        row["ref_avg_fouls"]     = ref_stats.get("avg_fouls")       if ref_stats else None
        row["ref_style"]         = ref_stats.get("style")           if ref_stats else None
        row["ref_is_strict"]     = ref_stats.get("is_strict")       if ref_stats else None
        row["ref_is_high_goals"] = ref_stats.get("is_high_goals")   if ref_stats else None
        row["ref_matches"]       = ref_stats.get("matches")         if ref_stats else None
        # Trend recent vs medie carieră (populat de fetch_referee_stats.py)
        row["ref_yellow_trend"]  = ref_stats.get("yellow_trend")    if ref_stats else None
        row["ref_goals_trend"]   = ref_stats.get("goals_trend")     if ref_stats else None
        row["ref_recent_yellow"] = ref_stats.get("recent_yellow_avg") if ref_stats else None
        row["ref_recent_goals"]  = ref_stats.get("recent_goals_avg")  if ref_stats else None
        if ref_stats:
            ref_enriched += 1

        # ── Lineup enrichment ──────────────────────────────────────────────
        lineup = LINEUPS_TODAY.get(str(event_id)) if event_id else None

        # unavailable_players vine deja din v1 API pe event — folosim ASTA
        # (v2 /lineups/ returnează liste goale pentru "predicted"; v1 are datele reale)
        ev_unavail = event.get("unavailable_players") or {}
        home_unavail_raw = ev_unavail.get("home") or []
        away_unavail_raw = ev_unavail.get("away") or []

        def _norm_unavail(players):
            result = []
            for p in (players if isinstance(players, list) else []):
                if not isinstance(p, dict):
                    continue
                result.append({
                    "id":     p.get("id"),
                    "name":   p.get("name") or p.get("player_name") or "",
                    "status": p.get("status") or "unknown",
                    "reason": p.get("reason") or p.get("return_date") or "",
                })
            return result

        def _count_missing(lst):
            return sum(1 for p in lst if p.get("status") in (
                "injured", "suspended", "out", "injury", "red_card"
            ))

        home_unavail = _norm_unavail(home_unavail_raw)
        away_unavail = _norm_unavail(away_unavail_raw)

        row["home_unavailable"] = home_unavail
        row["away_unavailable"] = away_unavail
        row["n_unavail_home"]   = len(home_unavail)
        row["n_unavail_away"]   = len(away_unavail)
        row["n_injured_home"]   = _count_missing(home_unavail)
        row["n_injured_away"]   = _count_missing(away_unavail)

        # Formații și status lineup vin din v2 (LINEUPS_TODAY)
        if lineup and isinstance(lineup, dict) and lineup.get("status") != "unavailable":
            row["lineup_status"]   = lineup.get("status")
            row["home_formation"]  = lineup.get("home_formation")
            row["away_formation"]  = lineup.get("away_formation")
            row["home_confidence"] = lineup.get("home_confidence")
            row["away_confidence"] = lineup.get("away_confidence")
            row["home_starters"]   = lineup.get("home_starters", [])
            row["away_starters"]   = lineup.get("away_starters", [])
        else:
            # Dacă nu avem v2 lineup, setăm status pe baza availabilității jucătorilor
            row["lineup_status"]   = "predicted" if (home_unavail or away_unavail) else None
            row["home_formation"]  = None
            row["away_formation"]  = None
            row["home_confidence"] = None
            row["away_confidence"] = None
            row["home_starters"]   = []
            row["away_starters"]   = []
        # ───────────────────────────────────────────────────────────────────
        # ─── Polymarket signal ─────────────────────────────────────────────
        # Reparat fără endpoint separat /polymarket/ ca să nu blocăm workflow-ul.
        # Semnalul este calculat din cache-ul /api/v2/odds/?event_id=... populat
        # deja în enrich_predictions_with_market_odds(). Dacă API-ul nu trimite
        # Polymarket pentru evenimentul curent, câmpurile rămân None și UI nu afișează badge.
        pm_signal = None
        if event_id:
            try:
                eid_int = int(event_id)
                pm_signal = POLYMARKET_SIGNAL_CACHE.get(eid_int)
                # VEYRA pierdea badge-ul deoarece raw /odds nu mai returna Polymarket.
                # Revenim la fallback-ul din Safe-backup, dar îl cache-uim pe event.
                if not pm_signal:
                    pm_signal = _fetch_polymarket_signal_direct(eid_int, row)
                    if pm_signal:
                        POLYMARKET_SIGNAL_CACHE[eid_int] = pm_signal
            except Exception:
                pm_signal = None
        if pm_signal:
            row["polymarket_signal"] = pm_signal.get("polymarket_signal")
            row["polymarket_divergence"] = pm_signal.get("polymarket_divergence")
            row["polymarket_market"] = pm_signal.get("polymarket_market")
            row["polymarket_probability"] = pm_signal.get("polymarket_probability")
            row["bookmakers_probability"] = pm_signal.get("bookmakers_probability")
            row["polymarket_bookmakers_count"] = pm_signal.get("bookmakers_count")
        else:
            row["polymarket_signal"] = None
            row["polymarket_divergence"] = None
            row["polymarket_market"] = None
            row["polymarket_probability"] = None
            row["bookmakers_probability"] = None
            row["polymarket_bookmakers_count"] = None

        # ── GAP 1: Context flags din v2_enrichment_cache["detail"] ───────────
        # derby, teren neutru, distanță deplasare, vreme, condiție teren
        # Acestea influențează v2_score_adjustment() pentru picks curente.
        v2_bundle = V2_ENRICHMENT_CACHE.get(str(event_id)) or {}
        detail_v2 = v2_bundle.get("detail") or {}
        row["is_local_derby"]     = bool(detail_v2.get("is_local_derby", False))
        row["is_neutral_ground"]  = bool(detail_v2.get("is_neutral_ground", False))
        row["travel_distance_km"] = detail_v2.get("travel_distance_km")
        row["weather"]            = detail_v2.get("weather")
        row["pitch_condition"]    = detail_v2.get("pitch_condition")
        row["attendance"]         = detail_v2.get("attendance")

        # ── GAP 3: H2H stats din v2_enrichment_cache["h2h"] ──────────────────
        # head-to-head: draw_rate, btts_rate, avg_goals, win_rates
        h2h_raw = v2_bundle.get("h2h") or {}
        if isinstance(h2h_raw, dict):
            h2h_total   = int(h2h_raw.get("total_matches") or h2h_raw.get("matches") or 0)
            h2h_draws   = int(h2h_raw.get("draws") or 0)
            h2h_hw      = int(h2h_raw.get("home_wins") or 0)
            h2h_aw      = int(h2h_raw.get("away_wins") or 0)
            row["h2h_matches"]       = h2h_total
            row["h2h_home_wins"]     = h2h_hw
            row["h2h_draws"]         = h2h_draws
            row["h2h_away_wins"]     = h2h_aw
            row["h2h_draw_rate"]     = (
                h2h_raw.get("draw_rate")
                or (round(h2h_draws / h2h_total, 3) if h2h_total else None)
            )
            row["h2h_home_win_rate"] = (
                h2h_raw.get("home_win_rate")
                or (round(h2h_hw / h2h_total, 3) if h2h_total else None)
            )
            row["h2h_away_win_rate"] = (
                h2h_raw.get("away_win_rate")
                or (round(h2h_aw / h2h_total, 3) if h2h_total else None)
            )
            row["h2h_btts_rate"]     = h2h_raw.get("btts_rate")
            row["h2h_avg_goals"]     = h2h_raw.get("avg_goals")
        else:
            row["h2h_matches"]       = None
            row["h2h_home_wins"]     = None
            row["h2h_draws"]         = None
            row["h2h_away_wins"]     = None
            row["h2h_draw_rate"]     = None
            row["h2h_home_win_rate"] = None
            row["h2h_away_win_rate"] = None
            row["h2h_btts_rate"]     = None
            row["h2h_avg_goals"]     = None

        # ── GAP team form: forma directă W/D/L per echipă ──────────────────
        home_id_str = str(event.get("home_team_id") or event.get("home_id") or "")
        away_id_str = str(event.get("away_team_id") or event.get("away_id") or "")
        home_form = TEAM_FORM_CACHE.get(home_id_str) or {}
        away_form = TEAM_FORM_CACHE.get(away_id_str) or {}
        row["home_form_score"]  = home_form.get("form_score")
        row["away_form_score"]  = away_form.get("form_score")
        row["home_form_string"] = home_form.get("form_string")
        row["away_form_string"] = away_form.get("form_string")
        row["home_avg_goals_scored"] = home_form.get("avg_goals_scored_last5")
        row["away_avg_goals_scored"] = away_form.get("avg_goals_scored_last5")
        row["home_avg_goals_conceded"] = home_form.get("avg_goals_conceded_last5")
        row["away_avg_goals_conceded"] = away_form.get("avg_goals_conceded_last5")
        row["home_team_id"] = home_id_str
        row["away_team_id"] = away_id_str

        # ─── Funfacts pre-meci ─────────────────────────────────────────────
        if event_id:
            row["funfacts"] = []
            try:
                meta_url = f"{V2_BASE}/events/{int(event_id)}/metadata/?language=ro"
                meta_data = fetch_url(meta_url)
                if meta_data and isinstance(meta_data, dict):
                    facts = meta_data.get("funfacts") or []
                    row["funfacts"] = [
                        f.get("sentence", "")
                        for f in facts
                        if f.get("sentence") and len(f.get("sentence", "")) > 10
                    ][:3]  # max 3 funfacts
                    # ai_preview: text narativ generat de BSD per meci
                    # disponibil in ~70% din meciuri; mai bogat decat funfacts
                    ai_prev = meta_data.get("ai_preview") or {}
                    if isinstance(ai_prev, dict) and ai_prev.get("text"):
                        row["ai_preview"] = str(ai_prev["text"])[:600]  # max 600 chars
                    else:
                        row["ai_preview"] = None
            except Exception:
                row["ai_preview"] = None

        # ───────────────────────────────────────────────────────────────────

        if home_mgr or away_mgr or home_xgd is not None or ref_stats:
            enriched_count += 1

    print(f"[V2] Enriched {enriched_count}/{len(predictions)} predictions cu semnale v2")
    print(f"[V2] Referee stats: {ref_enriched}/{len(predictions)} predictions cu date arbitru")
    return predictions


# ─── Claude AI Preview (Romanian) + Tavily web search ──────────────────────────

CLAUDE_PREVIEW_CACHE_FILE = os.path.join("data", "claude_preview_cache.json")
TAVILY_SEARCH_CACHE_FILE  = os.path.join("data", "tavily_search_cache.json")
_CLAUDE_PREVIEW_MAX_DAYS  = 7  # generăm preview doar pentru meciurile din next 7 zile


def _load_tavily_search_cache() -> Dict[str, str]:
    if not os.path.exists(TAVILY_SEARCH_CACHE_FILE):
        return {}
    try:
        with open(TAVILY_SEARCH_CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_tavily_search_cache(cache: Dict[str, str]) -> None:
    try:
        with open(TAVILY_SEARCH_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Tavily] Nu s-a putut salva cache-ul: {e}")


def _tavily_search_match(client, home: str, away: str, event_date: str) -> str:
    """Caută știri recente despre meci — accidentați, lotul, context. Max 3 rezultate."""
    try:
        month_year = ""
        try:
            dt = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
            month_year = dt.strftime("%B %Y")
        except Exception:
            pass

        query = f"{home} vs {away} preview team news injury lineup {month_year}".strip()
        result = client.search(
            query=query,
            search_depth="basic",
            max_results=3,
            include_answer=False,
        )
        snippets = []
        for r in (result.get("results") or [])[:3]:
            title   = (r.get("title") or "").strip()
            content = (r.get("content") or "").strip()[:200]
            if content:
                snippets.append(f"• {title}: {content}")
        return "\n".join(snippets)
    except Exception as e:
        return ""


def _load_claude_preview_cache() -> Dict[str, str]:
    if not os.path.exists(CLAUDE_PREVIEW_CACHE_FILE):
        return {}
    try:
        with open(CLAUDE_PREVIEW_CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_claude_preview_cache(cache: Dict[str, str]) -> None:
    try:
        with open(CLAUDE_PREVIEW_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ClaudePreview] Nu s-a putut salva cache-ul: {e}")


def _generate_one_claude_preview(client, home: str, away: str, league: str, country: str,
                                  prob_home: float, prob_draw: float, prob_away: float,
                                  xg_home: float, xg_away: float,
                                  home_form: str, away_form: str,
                                  is_derby: bool, funfacts: list,
                                  web_context: str = "") -> str:
    facts_line = ""
    if funfacts:
        facts_line = "\nFapte statistice: " + " | ".join(str(f) for f in funfacts[:2])

    derby_line = "\nEste un derby local!" if is_derby else ""

    web_line = ""
    if web_context and len(web_context.strip()) > 20:
        web_line = f"\n\nȘtiri recente (surse externe):\n{web_context.strip()}"

    prompt = (
        f"Ești un analist sportiv. Scrie un preview de meci în limba română, "
        f"4-5 propoziții (max 450 caractere), fără titluri, fără liste, fără markdown. "
        f"Dacă există știri recente despre accidentați sau lotul echipei, menționează-le explicit. "
        f"Tonul să fie analitic și direct.\n\n"
        f"Meci: {home} vs {away}\n"
        f"Competiție: {league} ({country})\n"
        f"Probabilități model: {home} câștigă {round(prob_home*100)}%, egal {round(prob_draw*100)}%, "
        f"{away} câștigă {round(prob_away*100)}%\n"
        f"xG estimat: {home} {xg_home:.2f} — {away} {xg_away:.2f}\n"
        f"Formă recentă: {home} [{home_form or 'N/A'}] vs {away} [{away_form or 'N/A'}]"
        f"{derby_line}{facts_line}{web_line}\n\n"
        f"Răspunde DOAR cu textul preview-ului în română, fără alte explicații."
    )

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=250,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()[:500]


def enrich_with_claude_previews(predictions: List[Dict[str, Any]], now_utc: datetime) -> List[Dict[str, Any]]:
    if not _ANTHROPIC_AVAILABLE:
        print("[ClaudePreview] Librăria 'anthropic' nu e instalată — skip.")
        return predictions

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[ClaudePreview] ANTHROPIC_API_KEY lipsă — skip generare preview.")
        return predictions

    cache = _load_claude_preview_cache()
    client = _anthropic_mod.Anthropic(api_key=api_key)
    cutoff = now_utc + timedelta(days=_CLAUDE_PREVIEW_MAX_DAYS)

    # Tavily — opțional, pentru context web independent
    tavily_client = None
    tavily_cache = _load_tavily_search_cache()
    tavily_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if _TAVILY_AVAILABLE and tavily_key:
        try:
            tavily_client = _TavilyClient(api_key=tavily_key)
            print("[ClaudePreview] Tavily disponibil — preview-urile vor include știri web recente.")
        except Exception as e:
            print(f"[Tavily] Init eșuat (non-fatal): {e}")
    else:
        print("[ClaudePreview] Tavily indisponibil — preview fără context web.")

    generated = 0
    cached_hits = 0
    tavily_searches = 0
    errors = 0

    for row in predictions:
        ev = row.get("event") or {}
        if ev.get("status") != "notstarted":
            continue

        event_id = str(ev.get("id") or "")
        if not event_id:
            continue

        # dacă BSD API a dat deja un preview, îl păstrăm
        if row.get("ai_preview"):
            continue

        # verificăm că meciul e în fereastra de 7 zile
        ev_date_str = ev.get("event_date") or ""
        try:
            ev_dt = datetime.fromisoformat(ev_date_str.replace("Z", "+00:00"))
            if ev_dt > cutoff:
                continue
        except Exception:
            continue

        # cache hit
        if event_id in cache:
            row["ai_preview"] = cache[event_id]
            cached_hits += 1
            continue

        # generăm cu Claude
        try:
            home = ev.get("home_team") or "Gazdă"
            away = ev.get("away_team") or "Oaspete"
            lg = ev.get("league") or {}
            league = lg.get("name") or "Ligă necunoscută"
            country = lg.get("country") or ""
            prob_home = float(row.get("prob_home_win") or 0.33)
            prob_draw = float(row.get("prob_draw") or 0.33)
            prob_away = float(row.get("prob_away_win") or 0.33)
            xg_home = float(row.get("expected_home_goals") or 1.2)
            xg_away = float(row.get("expected_away_goals") or 1.0)
            home_form = row.get("home_form_string") or ""
            away_form = row.get("away_form_string") or ""
            is_derby = bool(row.get("is_local_derby") or ev.get("is_local_derby"))
            funfacts = row.get("funfacts") or []

            # Căutare web Tavily pentru context independent (știri recente, accidentați)
            web_context = ""
            if tavily_client:
                if event_id in tavily_cache:
                    web_context = tavily_cache[event_id]
                else:
                    web_context = _tavily_search_match(tavily_client, home, away, ev_date_str)
                    tavily_cache[event_id] = web_context
                    tavily_searches += 1

            preview = _generate_one_claude_preview(
                client, home, away, league, country,
                prob_home, prob_draw, prob_away,
                xg_home, xg_away, home_form, away_form,
                is_derby, funfacts, web_context
            )
            row["ai_preview"] = preview
            cache[event_id] = preview
            generated += 1

        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"[ClaudePreview] Eroare pentru event {event_id}: {e}")
            row["ai_preview"] = None

    _save_claude_preview_cache(cache)
    if tavily_client:
        _save_tavily_search_cache(tavily_cache)
    print(f"[ClaudePreview] Generate: {generated} | Din cache: {cached_hits} | Tavily searches: {tavily_searches} | Erori: {errors}")
    return predictions


# ───────────────────────────────────────────────────────────────────────────────

def v2_score_adjustment(row, market_key):
    """
    Delta scor bazat pe semnale v2 API.
    Returnează float adăugat la ticket_score în build_ui_live_candidate.
    Toate valorile None → delta 0 (graceful degradation).

    Surse integrate:
    - Manager stats (over25%, btts%, clean_sheet%) — original
    - Standings xGd — original
    - GAP 1: Context flags (derby, neutral, travel, weather, pitch)
    - GAP 3: H2H head-to-head historical stats
    """
    delta = 0.0

    # ── Bonus v2 recommended (confirmare dublă v1 + v2 API) ──────────────────
    if row.get("v2_recommended"):
        delta += 1.5

    home_o25  = float(row.get("home_mgr_over25_pct") or 0.0)
    away_o25  = float(row.get("away_mgr_over25_pct") or 0.0)
    home_btts = float(row.get("home_mgr_btts_pct")   or 0.0)
    away_btts = float(row.get("away_mgr_btts_pct")   or 0.0)
    home_cs   = float(row.get("home_mgr_cs_pct")     or 0.0)
    away_cs   = float(row.get("away_mgr_cs_pct")     or 0.0)
    xgd_diff  = row.get("xgd_diff")

    # ── Manager stats ────────────────────────────────────────────────────────
    if market_key == "over25":
        if home_o25 >= 60 and away_o25 >= 55:
            delta += 2.5
        elif home_o25 >= 55 or away_o25 >= 60:
            delta += 1.0
    elif market_key == "over15":
        if home_o25 >= 55 and away_o25 >= 50:
            delta += 1.5
    elif market_key == "btts":
        if home_btts >= 55 and away_btts >= 55:
            delta += 2.0
        elif home_btts >= 50 and away_btts >= 50:
            delta += 1.0
    elif market_key == "under35":
        if home_cs >= 35 and away_cs >= 35:
            delta += 2.0
        elif home_cs >= 40 or away_cs >= 40:
            delta += 1.0
    elif market_key == "homeWin":
        if xgd_diff is not None and xgd_diff >= 0.3:
            delta += min(2.0, xgd_diff * 2.0)
    elif market_key == "awayWin":
        if xgd_diff is not None and xgd_diff <= -0.3:
            delta += min(2.0, abs(xgd_diff) * 2.0)

    # ── GAP 1: Context flags (derby / vreme / deplasare / teren) ─────────────
    # Citite în enrich_with_v2_signals() din v2_enrichment_cache["detail"]
    if row.get("is_local_derby"):
        # Derby = impredictibil; penalizăm piețe 1X2, ușor bonus over/btts
        if market_key in {"homeWin", "awayWin"}:
            delta -= 2.5
        elif market_key in {"over15", "over25", "btts"}:
            delta += 1.0

    if row.get("is_neutral_ground"):
        # Teren neutru = avantajul gazdei dispare
        if market_key == "homeWin":
            delta -= 2.0
        elif market_key == "awayWin":
            delta += 1.0

    travel_km = float(row.get("travel_distance_km") or 0)
    if travel_km >= 700:
        # Deplasare lungă → oboseală oaspete
        if market_key == "awayWin":
            delta -= 2.0
        elif market_key == "homeWin":
            delta += 1.0

    weather = row.get("weather") if isinstance(row.get("weather"), dict) else {}
    weather_desc = str(weather.get("description") or "").lower()
    if any(x in weather_desc for x in ("rain", "snow", "storm", "fog", "wind")):
        # Vreme rea → mai puține goluri
        if market_key in {"over15", "over25", "btts"}:
            delta -= 2.0
        elif market_key == "under35":
            delta += 1.5

    pitch_cond = float(row.get("pitch_condition") or 0)
    if pitch_cond >= 3:
        # Teren greu → joc mai lent, mai puține goluri
        if market_key in {"over25", "btts"}:
            delta -= 1.5
        elif market_key == "under35":
            delta += 1.0

    # ── GAP 3: H2H head-to-head adjustments ─────────────────────────────────
    # Citite în enrich_with_v2_signals() din v2_enrichment_cache["h2h"]
    h2h_matches = int(row.get("h2h_matches") or 0)
    if h2h_matches >= 5:
        h2h_draw_rate     = float(row.get("h2h_draw_rate")     or 0)
        h2h_btts_rate     = float(row.get("h2h_btts_rate")     or 0)
        h2h_avg_goals     = float(row.get("h2h_avg_goals")     or 0)
        h2h_home_win_rate = float(row.get("h2h_home_win_rate") or 0)
        h2h_away_win_rate = float(row.get("h2h_away_win_rate") or 0)

        if market_key == "draw":
            if h2h_draw_rate >= 0.40:
                delta += 2.0
            elif h2h_draw_rate <= 0.15:
                delta -= 1.5

        elif market_key == "btts":
            if h2h_btts_rate >= 0.60:
                delta += 1.5
            elif h2h_btts_rate <= 0.25:
                delta -= 1.5

        elif market_key in {"over15", "over25"}:
            if h2h_avg_goals >= 3.0:
                delta += 1.5
            elif h2h_avg_goals <= 1.8:
                delta -= 2.0

        elif market_key == "under35":
            if h2h_avg_goals <= 2.2:
                delta += 1.5
            elif h2h_avg_goals >= 3.2:
                delta -= 2.0

        elif market_key == "homeWin":
            if h2h_home_win_rate >= 0.65:
                delta += 1.5
            elif h2h_home_win_rate <= 0.20:
                delta -= 1.5

        elif market_key == "awayWin":
            if h2h_away_win_rate >= 0.55:
                delta += 1.5
            elif h2h_away_win_rate <= 0.15:
                delta -= 1.5

    # ── Team form: W/D/L ultimele 5 meciuri ─────────────────────────────────
    h_form = float(row.get("home_form_score") or 50.0)
    a_form = float(row.get("away_form_score") or 50.0)
    # Folosim form_score doar dacă avem date reale (diferit de 50.0 default)
    has_form = (row.get("home_form_score") is not None or row.get("away_form_score") is not None)
    if has_form:
        form_diff = h_form - a_form
        avg_form  = (h_form + a_form) / 2
        if market_key == "homeWin":
            if form_diff >= 30:    delta += 2.0
            elif form_diff >= 18:  delta += 1.0
            elif form_diff <= -30: delta -= 1.5
            elif form_diff <= -18: delta -= 0.8
        elif market_key == "awayWin":
            if form_diff <= -30:   delta += 2.0
            elif form_diff <= -18: delta += 1.0
            elif form_diff >= 30:  delta -= 1.5
            elif form_diff >= 18:  delta -= 0.8
        elif market_key == "draw":
            if abs(form_diff) <= 10 and 40 <= avg_form <= 65:
                delta += 1.0
        elif market_key in {"over25", "btts"}:
            h_atk = float(row.get("home_avg_goals_scored") or 0)
            a_atk = float(row.get("away_avg_goals_scored") or 0)
            if h_atk >= 1.8 and a_atk >= 1.4:
                delta += 1.5
            elif h_atk <= 0.8 and a_atk <= 0.8:
                delta -= 1.5
        elif market_key == "under35":
            h_def = float(row.get("home_avg_goals_conceded") or 0)
            a_def = float(row.get("away_avg_goals_conceded") or 0)
            if h_def <= 0.8 and a_def <= 0.8:
                delta += 1.5
            elif h_def >= 1.8 and a_def >= 1.8:
                delta -= 1.5

    # ── Referee factor ───────────────────────────────────────────────────────
    # Arbitrul influențează direct numărul de goluri și stilul meciului.
    # Folosim trendul recent (ultimele ~10 meciuri) ca semnal principal,
    # media carierei ca fallback. Ignorăm arbitrii cu < 10 meciuri (sample mic).
    #
    # Date disponibile (generate de fetch_referee_stats.py):
    #   ref_avg_goals      — medie goluri per meci (carieră)
    #   ref_recent_goals   — medie goluri per meci (ultimele ~10)
    #   ref_avg_yellow     — medie galbene per meci
    #   ref_recent_yellow  — medie galbene recente
    #   ref_is_strict      — bool: ≥ 4.5 galbene/meci
    #   ref_is_high_goals  — bool: ≥ 3.0 goluri/meci
    #   ref_matches        — total meciuri arbitrate (filtru sample)
    ref_matches    = int(row.get("ref_matches") or 0)
    ref_avg_goals  = float(row.get("ref_avg_goals") or 0.0)
    ref_recent_gls = float(row.get("ref_recent_goals") or ref_avg_goals)
    ref_is_strict  = bool(row.get("ref_is_strict"))
    ref_is_hi_gls  = bool(row.get("ref_is_high_goals"))

    if ref_matches >= 10:
        # Folosim trendul recent ca semnal principal; media carierei dacă lipsește
        ref_eff = ref_recent_gls if ref_recent_gls > 0 else ref_avg_goals

        if market_key in {"over25", "btts"}:
            if ref_is_hi_gls or ref_eff >= 3.0:
                delta += 1.5    # arbitru favorizează jocuri deschise
            elif ref_eff >= 2.7:
                delta += 0.8
            elif ref_is_strict or ref_eff <= 2.1:
                delta -= 1.5    # arbitru strict → mai puține goluri/situații
            elif ref_eff <= 2.4:
                delta -= 0.7

        elif market_key == "over15":
            if ref_is_hi_gls or ref_eff >= 2.8:
                delta += 0.8
            elif ref_is_strict or ref_eff <= 2.0:
                delta -= 0.8

        elif market_key == "under35":
            if ref_is_strict or ref_eff <= 2.2:
                delta += 1.5    # arbitru strict → probabilitate under mai mare
            elif ref_eff <= 2.5:
                delta += 0.7
            elif ref_is_hi_gls or ref_eff >= 3.2:
                delta -= 1.5
            elif ref_eff >= 2.9:
                delta -= 0.7

        elif market_key in {"homeWin", "awayWin"}:
            # Arbitrii stricți cresc variabilitatea → ușoară penalizare 1X2
            if ref_is_strict:
                delta -= 0.5

    return round(delta, 2)


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

    print("\n[2.5/6] Enriching predictions with best odds from market compare...")
    predictions, events, market_compare_stats = enrich_predictions_with_market_odds(predictions, events)

    print("\n[2.7/6] Fetching v2 signals (recommendations, manager stats, standings xGd, referee stats)...")
    try:
        # 0. Referee stats — load din cache local (generat de fetch_referee_stats.py)
        global REFEREE_STATS
        REFEREE_STATS = load_referee_stats()
        print(f"[V2] Referee stats loaded: {len(REFEREE_STATS)} arbitri din cache")

        # 0a. V2 Enrichment cache
        global V2_ENRICHMENT_CACHE
        V2_ENRICHMENT_CACHE = load_v2_enrichment_cache()
        print(f"[V2Cache] Loaded {len(V2_ENRICHMENT_CACHE)} event bundles din v2_enrichment_cache.json")

        # 0b. Team form cache — forma directă W/D/L per echipă
        global TEAM_FORM_CACHE
        TEAM_FORM_CACHE = load_team_form_cache()
        print(f"[TeamForm] Loaded {len(TEAM_FORM_CACHE)} echipe din team_form_cache.json")

        # 0b. Lineup data — load din cache local (generat de fetch_lineups_today.py)
        global LINEUPS_TODAY
        LINEUPS_TODAY = load_lineups_today()
        confirmed_lineups = sum(1 for v in LINEUPS_TODAY.values() if v.get("status") == "confirmed")
        print(f"[V2] Lineups loaded: {len(LINEUPS_TODAY)} evenimente ({confirmed_lineups} confirmate)")

        # 1. Event IDs recomandate de v2 (confidence ≥ 0.68 + recommended=true)
        v2_recommended_ids = fetch_v2_recommended_event_ids(today, future)

        # 2. Manager stats — doar echipele din predicțiile upcoming
        upcoming_team_ids = set()
        upcoming_league_ids = set()
        for pred in predictions:
            ev = pred.get("event") or {}
            if ev.get("status") != "notstarted":
                continue
            home_obj = ev.get("home_team_obj") or {}
            away_obj = ev.get("away_team_obj") or {}
            lg = ev.get("league") or {}
            if home_obj.get("api_id"): upcoming_team_ids.add(int(home_obj["api_id"]))
            if away_obj.get("api_id"): upcoming_team_ids.add(int(away_obj["api_id"]))
            if lg.get("api_id"):       upcoming_league_ids.add(int(lg["api_id"]))

        manager_map = fetch_manager_stats_for_teams(upcoming_team_ids)

        # 3. Standings xGd per ligă
        xgd_map = fetch_standings_xgd_map(upcoming_league_ids)

        # 4. Enrichment pe predictions
        predictions = enrich_with_v2_signals(predictions, v2_recommended_ids, manager_map, xgd_map)

        v2_stats = {
            "v2_recommended_count":   len(v2_recommended_ids),
            "manager_teams_fetched":  len(manager_map),
            "xgd_entries":            len(xgd_map),
            "enriched_leagues":       len(upcoming_league_ids),
        }
    except Exception as e:
        print(f"[V2] Enrichment v2 eșuat complet (non-fatal, continuăm cu v1): {e}")
        v2_stats = {"error": str(e)}

    print("\n[2.9/6] Generare AI Preview în română (Claude) pentru meciuri fără preview...")
    try:
        predictions = enrich_with_claude_previews(predictions, started_at)
    except Exception as e:
        print(f"[ClaudePreview] Eroare fatală (non-fatal, continuăm): {e}")

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
    # ─── Line Move Filter: colectăm event-urile DRIFTING din log-ul anterior ──
    # Picks unde piața s-a mișcat >5.3% contra noastră (CLV ≤-5% → ROI -12.29%)
    drifting_event_ids = {
        str(r.get("event_id"))
        for r in recommendation_log
        if r.get("line_move_signal") == "DRIFTING" and r.get("status") == "pending"
    }
    if drifting_event_ids:
        print(f"[LineMove] {len(drifting_event_ids)} pick-uri DRIFTING excluse (drift >{LINE_MOVE_DRIFT_REJECT}%)")
    current_recommendations = build_current_recommendation_rows(predictions, started_at.isoformat(), drifting_event_ids=drifting_event_ids)
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
        "version": "v16.2-v2-signals",
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
        "market_compare": market_compare_stats,
        "data_health": data_health,
        "header_sync": header_sync,
        "bsd_status": status_metrics,
        "v2_signals": v2_stats,
        "upcoming_preprocess": upcoming_prep,
        "historical_preprocess": historical_prep,
    }
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
