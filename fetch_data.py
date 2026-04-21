#!/usr/bin/env python3
"""
BetSmart Pro V17 - Fetcher + Prediction Engine
Îmbunătățiri față de V16:
  [V1] Form features injectate în scoring (training_features.json → bonus/penalizare per echipă)
  [V2] H2H signal: ultimele 5 confruntări directe via API
  [V3] Fix confidence: max(prob_home_win, prob_away_win) în loc de prob_home_win
  [V4] Form-based model: scorare independentă (over25/btts/under35/1X2) blendată cu API
"""

import os
import json
import math
import re
import unicodedata
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}
LOOKAHEAD_DAYS = 30
BACKTEST_LOOKBACK_DAYS = 21
HISTORY_LOOKBACK_DAYS = 60
HISTORY_MAX_ROWS = 2500
RECOMMENDATION_LOG_MAX_ROWS = 5000
MAX_PREDICTION_AGE_HOURS = 21 * 24
SIGNAL_AUDIT_MAX_ROWS = 24

# [V4] Pondere model propriu vs model BSD
FORM_MODEL_WEIGHT   = 0.22   # 22% din probabilitate finală vine din form model
API_MODEL_WEIGHT    = 0.78   # 78% din API (Poisson blend deja inclus)

# [V2] H2H: câte meciuri recente directe să luăm în calcul
H2H_LOOKBACK = 6
H2H_MIN_MATCHES = 3          # sub 3 meciuri H2H nu ajustăm

WEEKDAY_RESTRICTIONS = {
    "under35": {2, 3, 4, 6},
    "over15":  {0, 3, 4},
}

MARKETS = [
    {"key": "homeWin",  "label": "1 (Home Win)",  "prob": lambda r: pct(r.get("prob_home_win")),             "odds": lambda e: e.get("odds_home")},
    {"key": "draw",     "label": "X (Draw)",       "prob": lambda r: pct(r.get("prob_draw")),                 "odds": lambda e: e.get("odds_draw")},
    {"key": "awayWin",  "label": "2 (Away Win)",   "prob": lambda r: pct(r.get("prob_away_win")),             "odds": lambda e: e.get("odds_away")},
    {"key": "over15",   "label": "Over 1.5G",      "prob": lambda r: pct(r.get("prob_over_15")),              "odds": lambda e: e.get("odds_over_15")},
    {"key": "under15",  "label": "Under 1.5G",     "prob": lambda r: 100 - pct(r.get("prob_over_15")),        "odds": lambda e: e.get("odds_under_15")},
    {"key": "over25",   "label": "Over 2.5G",      "prob": lambda r: pct(r.get("prob_over_25")),              "odds": lambda e: e.get("odds_over_25")},
    {"key": "under25",  "label": "Under 2.5G",     "prob": lambda r: 100 - pct(r.get("prob_over_25")),        "odds": lambda e: e.get("odds_under_25")},
    {"key": "under35",  "label": "Under 3.5G",     "prob": lambda r: 100 - pct(r.get("prob_over_35")),        "odds": lambda e: e.get("odds_under_35")},
    {"key": "btts",     "label": "BTTS",            "prob": lambda r: pct(r.get("prob_btts_yes")),             "odds": lambda e: e.get("odds_btts_yes")},
]
MARKET_MAP = {m["key"]: m for m in MARKETS}

STRATEGIES = {
    "engine_overall": {
        "label": "Engine Overall",
        "allowed": {m["key"] for m in MARKETS},
        "min_adj": 66.0, "min_conf": 45.0, "min_edge": 8.0, "min_value": 0.0,
        "odd_min": 1.15, "odd_max": 1.65,
    },
    "best_single": {
        "label": "Evenimentul zilei",
        "allowed": {"homeWin", "over15", "over25", "under35", "btts"},
        "min_adj": 72.0, "min_conf": 50.0, "min_edge": 8.0, "min_value": 0.0,
        "odd_min": 1.20, "odd_max": 1.95,
    },
    "profit_single": {
        "label": "Profit Focus Single",
        "allowed": {"homeWin", "over15", "over25", "under35", "btts"},
        "min_adj": 70.0, "min_conf": 48.0, "max_conf": 65.0,
        "min_edge": 8.0, "min_value": 0.005, "odd_min": 1.18, "odd_max": 1.85,
    },
    "conservative": {
        "label": "Bilet conservator",
        "allowed": {"over15", "under35"},
        "min_adj": 74.0, "min_conf": 50.0, "min_edge": 5.0, "min_value": -0.01,
        "odd_min": 1.12, "odd_max": 1.65,
    },
    "smart_ev": {
        "label": "Smart EV",
        "allowed": {"homeWin", "awayWin", "over15", "over25", "under25", "under35", "btts"},
        "min_adj": 66.0, "min_conf": 45.0, "min_edge": 2.0, "min_value": 0.01,
        "odd_min": 1.20, "odd_max": 2.20, "reject_league_tiers": {"avoid"},
    },
    "controlled_combo": {
        "label": "Combo Controlat",
        "allowed": {"over15", "over25", "under35", "btts", "homeWin"},
        "min_adj": 71.0, "min_conf": 48.0, "min_edge": 5.0, "min_value": 0.0,
        "odd_min": 1.18, "odd_max": 1.80,
    },
    "over15": {
        "label": "Bilet Over 1.5 EV+",
        "allowed": {"over15"},
        "min_adj": 76.0, "min_conf": 50.0, "min_edge": 5.0, "min_value": -0.02,
        "odd_min": 1.15, "odd_max": 1.60,
    },
}

DEAD_ODDS_RANGES = [(1.26, 1.45)]


# ============================================================
# BOOTSTRAP & FORM LOOKUP
# ============================================================

def load_existing_json(filename, default=None):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return default if default is not None else {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def save_json(data, filename):
    path = os.path.join(DATA_DIR, filename)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def load_bootstrap_backtest():
    data = load_existing_json("backtest.json", {})
    return data if isinstance(data, dict) else {}


BOOTSTRAP_BACKTEST = load_bootstrap_backtest()
BOOTSTRAP_LEAGUE_ROWS = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_league") or [])}
BOOTSTRAP_MARKET_ROWS = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_market") or [])}
BOOTSTRAP_ODDS_ROWS   = {str((r or {}).get("key") or ""): (r or {}) for r in (BOOTSTRAP_BACKTEST.get("by_odds_bucket") or [])}


def normalize_name(s):
    """Normalizează un nume de echipă pentru lookup fuzzy."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower().strip())


# [V1] Form features lookup — construit o singură dată la start
_FORM_LOOKUP: Dict[str, Dict] = {}   # norm_team_name → {home: {...}, away: {...}}

def build_form_lookup():
    """
    Construiește un dict de formă per echipă din training_features.json.
    Câmpuri per echipă (home/away):
      goals_for_avg_5, goals_against_avg_5, btts_rate_5,
      over25_rate_5, under35_rate_5, points_avg_5
    """
    global _FORM_LOOKUP
    features = load_existing_json("training_features.json", [])
    if not isinstance(features, list):
        features = features.get("results", []) if isinstance(features, dict) else []

    home_stats: Dict[str, List] = {}
    away_stats: Dict[str, List] = {}

    for row in features or []:
        hn = normalize_name(row.get("home_team") or "")
        an = normalize_name(row.get("away_team") or "")
        if hn:
            home_stats.setdefault(hn, []).append({
                "gf5":   float(row.get("home_goals_for_avg_5")    or 0),
                "ga5":   float(row.get("home_goals_against_avg_5") or 0),
                "gf3":   float(row.get("home_goals_for_avg_3")    or 0),
                "btts5": float(row.get("home_btts_rate_5")        or 0),
                "o25_5": float(row.get("home_over25_rate_5")      or 0),
                "u35_5": float(row.get("home_under35_rate_5")     or 0),
                "pts5":  float(row.get("home_points_avg_5")       or 0),
            })
        if an:
            away_stats.setdefault(an, []).append({
                "gf5":   float(row.get("away_goals_for_avg_5")    or 0),
                "ga5":   float(row.get("away_goals_against_avg_5") or 0),
                "gf3":   float(row.get("away_goals_for_avg_3")    or 0),
                "btts5": float(row.get("away_btts_rate_5")        or 0),
                "o25_5": float(row.get("away_over25_rate_5")      or 0),
                "u35_5": float(row.get("away_under35_rate_5")     or 0),
                "pts5":  float(row.get("away_points_avg_5")       or 0),
            })

    def avg_stats(records):
        if not records:
            return None
        n = len(records)
        keys = ["gf5", "ga5", "gf3", "btts5", "o25_5", "u35_5", "pts5"]
        return {k: round(sum(r[k] for r in records) / n, 3) for k in keys}

    _FORM_LOOKUP = {}
    all_teams = set(home_stats) | set(away_stats)
    for team in all_teams:
        _FORM_LOOKUP[team] = {
            "home": avg_stats(home_stats.get(team, [])),
            "away": avg_stats(away_stats.get(team, [])),
        }

    print(f"[Form] Loaded form lookup: {len(_FORM_LOOKUP)} teams")


def get_team_form(team_name: str, side: str = "home") -> Optional[Dict]:
    """Returnează forma medie a echipei (side='home'|'away') sau None."""
    key = normalize_name(team_name)
    entry = _FORM_LOOKUP.get(key)
    if not entry:
        return None
    return entry.get(side) or entry.get("home") or entry.get("away")


# ============================================================
# UTILITIES
# ============================================================

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


# [V3] Fix: confidence = max(prob_home_win, prob_away_win), nu mai e prob_home_win
def derive_confidence(row: Dict) -> float:
    """
    Confidence-ul corect = probabilitatea dominantă din meci.
    Dacă conf explicit > 1 și e identic cu prob_home_win → e proxy → recalculăm.
    """
    explicit = row.get("confidence")
    prob_h = pct(row.get("prob_home_win") or 0)
    prob_a = pct(row.get("prob_away_win") or 0)
    prob_d = pct(row.get("prob_draw") or 0)

    # BSD pune prob_home_win ca confidence → detectăm și corectăm
    dominant = max(prob_h, prob_a)
    # Adăugăm un boost mic pentru meciurile foarte clare (confidence ≥ 70%)
    # Înainte era circular (dominant echipa acasă indiferent), acum e simetric
    conf = dominant
    # Dacă toate cele 3 sunt relativ egale (meci incert), reducem confidence
    spread = max(prob_h, prob_a, prob_d) - min(prob_h, prob_a, prob_d)
    if spread < 15:
        conf = max(0.0, conf - 5.0)   # meci echilibrat → confidence mai mică
    return round(min(100.0, max(0.0, conf)), 2)


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


def clamp(value, low, high):
    return max(low, min(high, value))


# ============================================================
# POISSON
# ============================================================

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
    total = max(0.0, float(home_lambda or 0)) + max(0.0, float(away_lambda or 0))
    return max(0.0, min(100.0, (1.0 - poisson_cdf(total, threshold)) * 100.0))


def poisson_under_probability(home_lambda, away_lambda, threshold=2.5):
    total = max(0.0, float(home_lambda or 0)) + max(0.0, float(away_lambda or 0))
    return max(0.0, min(100.0, poisson_cdf(total, threshold) * 100.0))


def poisson_btts_probability(home_lambda, away_lambda):
    h = max(0.0, float(home_lambda or 0))
    a = max(0.0, float(away_lambda or 0))
    prob = 1.0 - math.exp(-h) - math.exp(-a) + math.exp(-(h + a))
    return max(0.0, min(100.0, prob * 100.0))


def build_poisson_metrics(row):
    try:
        home_l = max(0.0, float(row.get("expected_home_goals") or 0.0))
        away_l = max(0.0, float(row.get("expected_away_goals") or 0.0))
    except Exception:
        return None
    if home_l + away_l <= 0:
        return None
    return {
        "home_lambda": round(home_l, 4),
        "away_lambda": round(away_l, 4),
        "total_lambda": round(home_l + away_l, 4),
        "over15": round(poisson_over_probability(home_l, away_l, 1.5), 2),
        "under15": round(poisson_under_probability(home_l, away_l, 1.5), 2),
        "over25": round(poisson_over_probability(home_l, away_l, 2.5), 2),
        "under25": round(poisson_under_probability(home_l, away_l, 2.5), 2),
        "under35": round(poisson_under_probability(home_l, away_l, 3.5), 2),
        "btts": round(poisson_btts_probability(home_l, away_l), 2),
    }


def api_market_probability(row, market_key):
    mapping = {
        "homeWin": pct(row.get("prob_home_win")),
        "draw":    pct(row.get("prob_draw")),
        "awayWin": pct(row.get("prob_away_win")),
        "over15":  pct(row.get("prob_over_15")),
        "under15": 100.0 - pct(row.get("prob_over_15")),
        "over25":  pct(row.get("prob_over_25")),
        "under25": 100.0 - pct(row.get("prob_over_25")),
        "under35": 100.0 - pct(row.get("prob_over_35")),
        "btts":    pct(row.get("prob_btts_yes")),
    }
    return round(mapping.get(market_key, 0.0), 2)


# ============================================================
# [V4] FORM-BASED MODEL — inline (no external deps)
# ============================================================

def _logistic(x):
    x = clamp(x, -10.0, 10.0)
    return 1.0 / (1.0 + math.exp(-x))


def form_model_prob(row, market_key, home_form, away_form):
    """
    Returnează probabilitatea estimată de form model (0–100) sau None.
    Folosește aceleași ecuații din build_training_model_pack.py,
    aplicate pe forma LIVE a echipelor (nu pe date istorice).
    """
    if not home_form or not away_form:
        return None

    hgf  = home_form.get("gf5", 0.0)
    hga  = home_form.get("ga5", 0.0)
    agf  = away_form.get("gf5", 0.0)
    aga  = away_form.get("ga5", 0.0)
    hb5  = home_form.get("btts5", 0.0)
    ab5  = away_form.get("btts5", 0.0)
    ho25 = home_form.get("o25_5", 0.0)
    ao25 = away_form.get("o25_5", 0.0)
    hu35 = home_form.get("u35_5", 0.0)
    au35 = away_form.get("u35_5", 0.0)
    hpts = home_form.get("pts5", 0.0)
    apts = away_form.get("pts5", 0.0)

    if market_key == "over25":
        score = 0.0
        score += 0.27 * (ho25 / 100.0)
        score += 0.27 * (ao25 / 100.0)
        score += 0.18 * clamp((hgf + agf) / 4.2, 0.0, 1.0)
        score += 0.14 * clamp((hga + aga) / 4.2, 0.0, 1.0)
        # Formă puncte: echipe care marchează mult → Over
        score += 0.14 * clamp((hpts + apts) / 6.0, 0.0, 1.0)
        return clamp(score * 100.0, 0.0, 100.0)

    if market_key == "under35":
        score = 0.0
        score += 0.32 * (hu35 / 100.0)
        score += 0.32 * (au35 / 100.0)
        total_atac = hgf + agf
        score += 0.22 * max(0.0, 1.0 - clamp(total_atac / 4.2, 0.0, 1.0))
        score += 0.14 * max(0.0, 1.0 - clamp((hpts + apts) / 6.0, 0.0, 1.0))
        return clamp(score * 100.0, 0.0, 100.0)

    if market_key == "btts":
        score = 0.0
        score += 0.28 * (hb5 / 100.0)
        score += 0.28 * (ab5 / 100.0)
        score += 0.16 * clamp((hgf + agf) / 4.0, 0.0, 1.0)
        score += 0.16 * clamp((hga + aga) / 4.0, 0.0, 1.0)
        # Penalizare dacă una din echipe nu marchează des
        if hgf < 0.7 or agf < 0.7:
            score *= 0.80
        return clamp(score * 100.0, 0.0, 100.0)

    if market_key == "over15":
        # Over 1.5 e aproape sigur dacă xG e mare — form e mai puțin discriminant
        gf_total = hgf + agf
        score = 0.0
        score += 0.40 * clamp(gf_total / 3.6, 0.0, 1.0)
        score += 0.30 * clamp((hga + aga) / 3.6, 0.0, 1.0)
        score += 0.30 * clamp((hpts + apts) / 6.0, 0.0, 1.0)
        return clamp(score * 100.0, 0.0, 100.0)

    if market_key == "homeWin":
        # Form diff Home vs Away
        form_diff = (hgf - agf) * 0.35 + (aga - hga) * 0.25 + (hpts - apts) * 0.40 / 3.0
        return clamp(_logistic(form_diff) * 100.0, 0.0, 100.0)

    if market_key == "awayWin":
        form_diff = (agf - hgf) * 0.35 + (hga - aga) * 0.25 + (apts - hpts) * 0.40 / 3.0
        return clamp(_logistic(form_diff) * 100.0, 0.0, 100.0)

    return None


# ============================================================
# [V2] H2H SIGNAL
# ============================================================

_H2H_CACHE: Dict[str, Dict] = {}   # "home_id:away_id" → h2h_stats


def fetch_h2h(home_team_id: int, away_team_id: int) -> Optional[Dict]:
    """
    Returnează statistici H2H (ultimele H2H_LOOKBACK meciuri).
    Cache în memorie per rulare.
    """
    if not home_team_id or not away_team_id:
        return None
    cache_key = f"{home_team_id}:{away_team_id}"
    if cache_key in _H2H_CACHE:
        return _H2H_CACHE[cache_key]

    result = None
    try:
        url = (
            f"{API_BASE}/api/events/"
            f"?home_team={home_team_id}&away_team={away_team_id}"
            f"&status=finished&page_size={H2H_LOOKBACK}"
        )
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code in (404, 400, 403):
            _H2H_CACHE[cache_key] = None
            return None
        r.raise_for_status()
        data = r.json()
        events = data if isinstance(data, list) else data.get("results", [])
        events = [e for e in events if e.get("home_score") is not None and e.get("away_score") is not None]

        if len(events) < H2H_MIN_MATCHES:
            _H2H_CACHE[cache_key] = None
            return None

        total = len(events)
        home_wins = sum(1 for e in events if e["home_score"] > e["away_score"])
        away_wins = sum(1 for e in events if e["away_score"] > e["home_score"])
        over25   = sum(1 for e in events if (e["home_score"] + e["away_score"]) >= 3)
        under35  = sum(1 for e in events if (e["home_score"] + e["away_score"]) <= 3)
        btts     = sum(1 for e in events if e["home_score"] > 0 and e["away_score"] > 0)
        avg_goals = sum(e["home_score"] + e["away_score"] for e in events) / total

        result = {
            "matches":       total,
            "home_win_rate": round(home_wins / total * 100, 1),
            "away_win_rate": round(away_wins / total * 100, 1),
            "draw_rate":     round((total - home_wins - away_wins) / total * 100, 1),
            "over25_rate":   round(over25 / total * 100, 1),
            "under35_rate":  round(under35 / total * 100, 1),
            "btts_rate":     round(btts / total * 100, 1),
            "avg_goals":     round(avg_goals, 2),
        }
    except Exception as e:
        print(f"WARN H2H {home_team_id} vs {away_team_id}: {e}")
        result = None

    _H2H_CACHE[cache_key] = result
    return result


def h2h_bonus(h2h: Optional[Dict], market_key: str) -> float:
    """
    Returnează un bonus/penalizare SmartScore bazat pe H2H.
    Max ±5 puncte. Acționează ca tiebreaker puternic.
    """
    if not h2h:
        return 0.0
    n = h2h.get("matches", 0)
    if n < H2H_MIN_MATCHES:
        return 0.0

    # Ponderăm mai puternic dacă avem mai multe meciuri H2H
    weight = min(1.0, n / 6.0)

    bonus = 0.0
    if market_key == "over25":
        rate = h2h.get("over25_rate", 50.0)
        # Bonus dacă >70% H2H au trecut de 2.5, penalizare dacă <40%
        bonus = (rate - 55.0) * 0.12
    elif market_key == "under35":
        rate = h2h.get("under35_rate", 50.0)
        bonus = (rate - 55.0) * 0.10
    elif market_key == "btts":
        rate = h2h.get("btts_rate", 50.0)
        bonus = (rate - 52.0) * 0.12
    elif market_key == "homeWin":
        rate = h2h.get("home_win_rate", 33.0)
        bonus = (rate - 42.0) * 0.10
    elif market_key == "awayWin":
        rate = h2h.get("away_win_rate", 33.0)
        bonus = (rate - 35.0) * 0.10
    elif market_key == "over15":
        avg_g = h2h.get("avg_goals", 2.2)
        bonus = (avg_g - 2.0) * 2.0

    return round(clamp(bonus * weight, -5.0, 5.0), 2)


# ============================================================
# BLEND MODEL PROBABILITY (API + Poisson + [V4] Form)
# ============================================================

def blend_model_probability(row, market_key, home_form=None, away_form=None):
    """
    Blendează:
      1. Probabilitatea BSD (API)
      2. Probabilitatea Poisson (din xG)
      3. [V4] Probabilitatea din form model
    """
    api_prob = api_market_probability(row, market_key)
    metrics  = build_poisson_metrics(row)
    poisson_mapping = {
        "over15": "over15", "under15": "under15",
        "over25": "over25", "under25": "under25",
        "under35": "under35", "btts": "btts",
    }
    poisson_prob = None
    if metrics and market_key in poisson_mapping:
        poisson_prob = metrics.get(poisson_mapping[market_key])

    # Blend API + Poisson (identic cu V16)
    effective_prob = api_prob
    delta = None
    alert = False
    direction = "flat"
    if poisson_prob is not None:
        delta = round(float(poisson_prob) - float(api_prob), 2)
        alert = abs(delta) > 5.0
        api_w = 0.55 if alert else 0.72
        poi_w = 1.0 - api_w
        effective_prob = round((api_prob * api_w) + (float(poisson_prob) * poi_w), 2)
        if delta > 5.0:
            direction = "value"
        elif delta < -5.0:
            direction = "risk"

    # [V4] Blend cu form model (dacă disponibil)
    form_prob = form_model_prob(row, market_key, home_form, away_form)
    form_used = False
    if form_prob is not None and FORM_MODEL_WEIGHT > 0:
        effective_prob = round(
            effective_prob * API_MODEL_WEIGHT + form_prob * FORM_MODEL_WEIGHT, 2
        )
        form_used = True

    return {
        "api_prob":       round(api_prob, 2),
        "poisson_prob":   round(float(poisson_prob), 2) if poisson_prob is not None else None,
        "effective_prob": effective_prob,
        "poisson_delta":  delta,
        "poisson_alert":  alert,
        "poisson_direction": direction,
        "poisson":        metrics or {},
        "form_prob":      round(form_prob, 2) if form_prob is not None else None,
        "form_used":      form_used,
    }


# ============================================================
# LEAGUE / MARKET CALIBRATION
# ============================================================

def get_bootstrap_row(rows_map, key):
    if not key:
        return {}
    return rows_map.get(str(key), {}) or {}


def get_league_tier_info(league_name):
    row = get_bootstrap_row(BOOTSTRAP_LEAGUE_ROWS, league_name)
    bets     = int(row.get("bets")    or 0)
    roi      = float(row.get("roi")   or 0)
    winrate  = float(row.get("winrate") or 0)
    if bets >= 5 and roi >= 12 and winrate >= 70:
        return {"tier": "high",    "multiplier": 1.03}
    if bets >= 5 and roi <= -5:
        return {"tier": "avoid",   "multiplier": 0.96}
    return {"tier": "neutral",     "multiplier": 1.0}


def get_league_calibration(league_name):
    row        = get_bootstrap_row(BOOTSTRAP_LEAGUE_ROWS, league_name)
    bets       = int(row.get("bets")    or 0)
    roi        = float(row.get("roi")   or 0)
    winrate    = float(row.get("winrate") or 0)
    if bets < 3:
        return {"adj_delta": 0.0, "edge_delta": 0.0, "conf_delta": 0.0, "tier": "neutral"}
    sample_factor = min(1.0, bets / 8.0)
    if roi >= 20.0 and winrate >= 80.0:
        d_adj, d_edge, d_conf, tier = -2.0, -1.5, -2.0, "high"
    elif roi >= 5.0:
        d_adj, d_edge, d_conf, tier =  0.0,  0.0,  0.0, "neutral"
    elif roi >= 0.0:
        d_adj, d_edge, d_conf, tier =  1.0,  1.5,  0.0, "slight_tighten"
    elif roi >= -15.0:
        d_adj, d_edge, d_conf, tier =  3.0,  4.0,  2.0, "tighten"
    elif roi >= -30.0:
        d_adj, d_edge, d_conf, tier =  5.0,  7.0,  3.0, "strict"
    else:
        d_adj, d_edge, d_conf, tier =  7.0, 10.0,  5.0, "very_strict"
    return {
        "adj_delta":  round(d_adj  * sample_factor, 2),
        "edge_delta": round(d_edge * sample_factor, 2),
        "conf_delta": round(d_conf * sample_factor, 2),
        "tier": tier, "bets": bets, "roi": roi,
    }


def get_market_multiplier(market_key):
    row     = get_bootstrap_row(BOOTSTRAP_MARKET_ROWS, MARKET_MAP[market_key]["label"] if market_key in MARKET_MAP else market_key)
    bets    = int(row.get("bets")   or 0)
    roi     = float(row.get("roi")  or 0)
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
    roi  = float(row.get("roi") or 0)
    if bets < 4:
        return 1.0
    if roi >= 8:
        return 1.01
    if roi <= -4:
        return 0.98
    return 1.0


def dynamic_adjustment_factor(prob, confidence, league_name=None, market_key=None, odds=None):
    c = normalize_confidence(confidence)
    base  = 0.93 + (c / 100.0) * 0.07
    base *= get_league_tier_info(league_name).get("multiplier", 1.0)
    base *= get_market_multiplier(market_key) if market_key else 1.0
    base *= get_odds_bucket_multiplier(odds) if odds else 1.0
    return max(0.86, min(1.08, base))


def adjusted_prob(prob, confidence, league_name=None, market_key=None, odds=None):
    factor = dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
    return round(pct(prob) * factor, 2)


# ============================================================
# SCORELINE & CONTRADICTION
# ============================================================

def parse_scoreline(score):
    if not score or not isinstance(score, str) or "-" not in score:
        return None
    try:
        home, away = score.split("-", 1)
        h, a = int(home), int(away)
        return {"home": h, "away": a, "total": h + a, "btts": h > 0 and a > 0}
    except Exception:
        return None


def hard_contradiction(row, market_key):
    score = parse_scoreline(row.get("most_likely_score"))
    if not score:
        return False
    checks = {
        "over15":  score["total"] < 2,
        "under15": score["total"] >= 2,
        "over25":  score["total"] < 3,
        "under25": score["total"] >= 3,
        "under35": score["total"] >= 4,
        "btts":    not score["btts"],
        "bttsNo":  score["btts"],
        "homeWin": score["home"] <= score["away"],
        "awayWin": score["away"] <= score["home"],
        "draw":    score["home"] != score["away"],
    }
    return checks.get(market_key, False)


def market_outcome(event, market_key):
    hs = event.get("home_score")
    aw = event.get("away_score")
    if hs is None or aw is None:
        return None
    total = hs + aw
    mapping = {
        "homeWin": hs > aw, "draw": hs == aw, "awayWin": aw > hs,
        "over15": total >= 2, "under15": total <= 1,
        "over25": total >= 3, "under25": total <= 2,
        "under35": total <= 3, "btts": hs > 0 and aw > 0,
        "bttsNo": hs == 0 or aw == 0,
    }
    return mapping.get(market_key)


# ============================================================
# NO-VIG & EDGE
# ============================================================

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
    pairs = {
        "homeWin": (lambda: compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away")), 0),
        "draw":    (lambda: compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away")), 1),
        "awayWin": (lambda: compute_no_vig(event.get("odds_home"), event.get("odds_draw"), event.get("odds_away")), 2),
        "over15":  (lambda: compute_no_vig(event.get("odds_over_15"), event.get("odds_under_15")), 0),
        "under15": (lambda: compute_no_vig(event.get("odds_over_15"), event.get("odds_under_15")), 1),
        "over25":  (lambda: compute_no_vig(event.get("odds_over_25"), event.get("odds_under_25")), 0),
        "under25": (lambda: compute_no_vig(event.get("odds_over_25"), event.get("odds_under_25")), 1),
        "under35": (lambda: compute_no_vig(event.get("odds_over_35"), event.get("odds_under_35")), 1),
        "btts":    (lambda: compute_no_vig(event.get("odds_btts_yes"), event.get("odds_btts_no")), 0),
        "bttsNo":  (lambda: compute_no_vig(event.get("odds_btts_yes"), event.get("odds_btts_no")), 1),
    }
    if market_key not in pairs:
        return None
    fn, idx = pairs[market_key]
    vals = fn()
    return round(vals[idx], 2) if vals else None


# ============================================================
# API RECOMMEND & HEURISTIC
# ============================================================

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
    if market_key == "over15":   return pct(row.get("prob_over_15")) >= 75
    if market_key == "over25":   return pct(row.get("prob_over_25")) >= 65
    if market_key == "under25":  return 100 - pct(row.get("prob_over_25")) >= 58
    if market_key == "under35":  return 100 - pct(row.get("prob_over_35")) >= 70
    if market_key == "btts":     return pct(row.get("prob_btts_yes")) >= 60
    if market_key == "bttsNo":   return 100 - pct(row.get("prob_btts_yes")) >= 58
    if market_key == "homeWin":  return row.get("predicted_result") == "H" and pct(row.get("prob_home_win")) >= 52
    if market_key == "awayWin":  return row.get("predicted_result") == "A" and pct(row.get("prob_away_win")) >= 52
    if market_key == "draw":     return row.get("predicted_result") == "D" and pct(row.get("prob_draw")) >= 32
    return False


# ============================================================
# MARKET FIT SCORE (îmbunătățit cu form data [V1])
# ============================================================

def market_fit_score(row, market_key, home_form=None, away_form=None) -> float:
    xg_home  = float(row.get("expected_home_goals") or 0)
    xg_away  = float(row.get("expected_away_goals") or 0)
    xg_total = xg_home + xg_away
    sl       = parse_scoreline(row.get("most_likely_score"))
    score    = 0.0

    if market_key == "over15":
        if xg_total >= 2.15:              score += 10
        if sl and sl["total"] >= 2:       score += 12
        if row.get("over_15_recommend"):  score += 10
        # [V1] Form bonus
        if home_form and away_form:
            gf_avg = (home_form.get("gf5",0) + away_form.get("gf5",0)) / 2
            if gf_avg >= 1.8:  score += 6
            elif gf_avg < 0.8: score -= 5

    elif market_key == "over25":
        if xg_total >= 2.75:              score += 10
        if sl and sl["total"] >= 3:       score += 12
        if sl and sl["total"] < 3:        score -= 14
        if row.get("over_25_recommend"):  score += 10
        # [V1] Form bonus
        if home_form and away_form:
            o25avg = (home_form.get("o25_5",0) + away_form.get("o25_5",0)) / 2
            if o25avg >= 65:   score += 8
            elif o25avg <= 35: score -= 7

    elif market_key == "under35":
        if xg_total <= 3.05:              score += 9
        if sl and sl["total"] <= 3:       score += 10
        if sl and sl["total"] > 3:        score -= 16
        # [V1] Form bonus
        if home_form and away_form:
            u35avg = (home_form.get("u35_5",0) + away_form.get("u35_5",0)) / 2
            if u35avg >= 72:   score += 8
            elif u35avg <= 50: score -= 6

    elif market_key == "btts":
        if xg_home >= 0.95 and xg_away >= 0.95: score += 10
        if sl and sl["btts"]:             score += 10
        if sl and not sl["btts"]:         score -= 16
        if abs(xg_home - xg_away) > 1.0: score -= 8
        if row.get("btts_recommend"):     score += 10
        # [V1] Form bonus
        if home_form and away_form:
            bttsavg = (home_form.get("btts5",0) + away_form.get("btts5",0)) / 2
            if bttsavg >= 60:  score += 8
            elif bttsavg <= 35: score -= 7

    elif market_key == "homeWin":
        if row.get("predicted_result") == "H": score += 10
        if row.get("favorite") == "H":          score += 8
        if xg_home - xg_away >= 0.35:          score += 8
        # [V1] Form bonus
        if home_form and away_form:
            pts_diff = home_form.get("pts5",0) - away_form.get("pts5",0)
            gf_diff  = home_form.get("gf5",0)  - away_form.get("gf5",0)
            score += clamp(pts_diff * 1.5 + gf_diff * 2.0, -8.0, 8.0)

    elif market_key == "awayWin":
        if row.get("predicted_result") == "A": score += 10
        if row.get("favorite") == "A":          score += 8
        if xg_away - xg_home >= 0.35:          score += 8
        # [V1] Form bonus
        if home_form and away_form:
            pts_diff = away_form.get("pts5",0) - home_form.get("pts5",0)
            gf_diff  = away_form.get("gf5",0)  - home_form.get("gf5",0)
            score += clamp(pts_diff * 1.5 + gf_diff * 2.0, -8.0, 8.0)

    elif market_key == "draw":
        if row.get("predicted_result") == "D": score += 9
        if sl and sl["home"] == sl["away"]:    score += 8

    return round(score, 2)


# ============================================================
# SMART SCORE (îmbunătățit cu H2H [V2] și form [V1])
# ============================================================

def calc_smart_score(adj_prob, value, confidence, edge_pct, fit_score,
                     source_api, source_heuristic,
                     h2h_score=0.0, form_bonus=0.0):
    """
    V17: adaugă h2h_score (±5) și form_bonus (±4) la scorul final.
    """
    c    = normalize_confidence(confidence)
    edge = float(edge_pct or 0)
    score = 0.0
    score += min(58.0, (pct(adj_prob) / 100.0) * 58.0)
    score += min(18.0, max(0.0, edge) * 2.0)
    score += min(14.0, max(0.0, value) * 120.0)
    score += min(8.0,  (c / 100.0) * 8.0)
    score += min(14.0, fit_score)
    if source_api:
        score += 3.0
    elif source_heuristic:
        score += 1.0
    # [V2] H2H bonus
    score += clamp(h2h_score, -5.0, 5.0)
    # [V1] Form bonus (extra confirmation)
    score += clamp(form_bonus, -4.0, 4.0)
    # Penalizări
    if value < -0.03:  score -= 8.0
    if edge  < -2.0:   score -= 12.0
    return round(min(100.0, score), 2)


def verdict_from_metrics(adj_prob, value, confidence, edge_pct):
    c    = normalize_confidence(confidence)
    edge = float(edge_pct or 0)
    if adj_prob >= 77 and value >= 0 and c >= 55 and edge >= 1:
        return "safe"
    if adj_prob >= 68 and value >= 0 and c >= 45 and edge >= 0:
        return "value"
    if adj_prob >= 60 and c >= 40:
        return "lean"
    return "avoid"


# ============================================================
# BUILD CANDIDATE (core prediction unit)
# ============================================================

def build_candidate(row, market_key,
                    home_form=None, away_form=None,
                    h2h=None) -> Optional[Dict[str, Any]]:
    market = MARKET_MAP[market_key]
    event  = row.get("event") or {}
    try:
        odds = float(market["odds"](event) or 0)
    except Exception:
        return None
    if odds < 1.01:
        return None

    # [V3] confidence corectă
    confidence   = derive_confidence(row)
    prob_meta    = blend_model_probability(row, market_key, home_form, away_form)
    prob         = prob_meta.get("effective_prob")
    league_name  = (event.get("league") or {}).get("name") or "Unknown"
    tier_info    = get_league_tier_info(league_name)
    calib_info   = get_league_calibration(league_name)
    value        = calc_value(prob, odds)
    adj          = adjusted_prob(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
    market_prob  = market_prob_from_row_event(row, event, market_key)
    edge_pct     = round(prob - market_prob, 2) if market_prob is not None else None
    fit          = market_fit_score(row, market_key, home_form, away_form)
    source_api   = api_recommend(row, market_key)
    source_heur  = heuristic_recommend(row, market_key)

    # [V2] H2H bonus
    h2h_s        = h2h_bonus(h2h, market_key)

    # [V1] Form confirmation bonus (separate de fit_score)
    fb = 0.0
    if home_form and away_form:
        fp = form_model_prob(row, market_key, home_form, away_form)
        if fp is not None:
            # Dacă form model concorda cu API → bonus, dacă contrazice → penalizare
            api_p = prob_meta.get("api_prob", 50.0)
            agreement = fp - api_p
            fb = clamp(agreement * 0.08, -4.0, 4.0)

    score   = calc_smart_score(adj, value, confidence, edge_pct, fit,
                                source_api, source_heur, h2h_s, fb)
    verdict = verdict_from_metrics(adj, value, confidence, edge_pct)
    outcome = market_outcome(event, market_key)
    if outcome is None:
        return None

    return {
        "market":              market["label"],
        "market_key":          market_key,
        "odds":                round(odds, 3),
        "prob":                round(prob, 2),
        "api_prob":            prob_meta.get("api_prob"),
        "poisson_prob":        prob_meta.get("poisson_prob"),
        "poisson_delta":       prob_meta.get("poisson_delta"),
        "poisson_alert":       bool(prob_meta.get("poisson_alert")),
        "poisson_direction":   prob_meta.get("poisson_direction"),
        "total_lambda":        (prob_meta.get("poisson") or {}).get("total_lambda"),
        "form_prob":           prob_meta.get("form_prob"),
        "form_used":           prob_meta.get("form_used", False),
        "h2h_bonus":           round(h2h_s, 2),
        "form_bonus":          round(fb, 2),
        "adj_prob":            round(adj, 2),
        "value":               round(value, 4),
        "confidence":          round(confidence, 2),
        "market_prob":         round(market_prob, 2) if market_prob is not None else None,
        "edge_pct":            round(edge_pct, 2) if edge_pct is not None else None,
        "fit_score":           round(fit, 2),
        "score":               score,
        "verdict":             verdict,
        "source_api":          bool(source_api),
        "source_heuristic":    bool(source_heur),
        "won":                 bool(outcome),
        "league":              league_name,
        "league_tier":         tier_info.get("tier"),
        "league_calib_tier":   calib_info.get("tier", "neutral"),
        "league_roi_backtest": calib_info.get("roi", None),
        "adjustment_factor":   round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
        "event_id":            event.get("id"),
        "prediction_id":       row.get("id"),
        "date":                event.get("event_date"),
        "created_at":          row.get("created_at"),
        "most_likely_score":   row.get("most_likely_score"),
    }


def qualifies_for_strategy(candidate, strategy_cfg):
    if not candidate:
        return False
    if candidate["market_key"] not in strategy_cfg["allowed"]:
        return False
    if hard_contradiction({"most_likely_score": candidate.get("most_likely_score")}, candidate["market_key"]):
        return False
    league_name  = candidate.get("league") or ""
    calib        = get_league_calibration(league_name)
    eff_min_adj  = strategy_cfg["min_adj"]  + calib.get("adj_delta",  0.0)
    eff_min_edge = strategy_cfg["min_edge"] + calib.get("edge_delta", 0.0)
    eff_min_conf = strategy_cfg["min_conf"] + calib.get("conf_delta", 0.0)
    if candidate["adj_prob"]  < eff_min_adj:   return False
    if candidate["confidence"] < eff_min_conf: return False
    max_conf = strategy_cfg.get("max_conf")
    if max_conf is not None and candidate["confidence"] > max_conf: return False
    if candidate["value"] < strategy_cfg["min_value"]: return False
    if candidate["odds"] < strategy_cfg["odd_min"] or candidate["odds"] > strategy_cfg["odd_max"]: return False
    if odds_in_ranges(candidate.get("odds"), strategy_cfg.get("exclude_odds_ranges") or []): return False
    if candidate.get("league_tier") in (strategy_cfg.get("reject_league_tiers") or set()): return False
    edge = candidate["edge_pct"] if candidate["edge_pct"] is not None else -999
    if edge < eff_min_edge: return False
    if candidate["verdict"] == "avoid": return False
    # Weekday restrictions
    mk = candidate.get("market_key") or ""
    ed = candidate.get("date") or candidate.get("event_date") or ""
    if mk in WEEKDAY_RESTRICTIONS and ed:
        try:
            dt = datetime.fromisoformat(str(ed).replace("Z", "+00:00"))
            if dt.weekday() in WEEKDAY_RESTRICTIONS[mk]:
                return False
        except Exception:
            pass
    return True


def rank_candidate(candidate):
    rank  = candidate["score"]
    rank += max(0.0, candidate["value"]) * 100.0 * 0.45
    rank += max(0.0, candidate["edge_pct"] or 0.0) * 0.75
    if candidate["source_api"]:
        rank += 2.0
    # [V2] H2H contribuie la rank direct
    rank += clamp(candidate.get("h2h_bonus", 0.0), -3.0, 3.0)
    return round(rank, 3)


def odds_in_ranges(odds, ranges):
    try:
        o = float(odds or 0)
    except Exception:
        return False
    return any(float(lo) <= o <= float(hi) for lo, hi in (ranges or []))


# ============================================================
# BUCKET LABELS, FINALIZE STATS, etc.
# ============================================================

def empty_stats(label=None):
    return {"label": label, "bets": 0, "wins": 0, "losses": 0, "profit": 0.0,
            "roi": 0.0, "winrate": 0.0, "avg_odds": 0.0, "avg_edge": 0.0,
            "worst_run": 0, "best_run": 0}


def finalize_pick_stats(picks: List[Dict[str, Any]], label=None):
    stats = empty_stats(label)
    if not picks:
        return stats
    bets   = len(picks)
    wins   = sum(1 for p in picks if p["won"])
    profit = sum((p["odds"] - 1.0) if p["won"] else -1.0 for p in picks)
    avg_odds = sum(p["odds"] for p in picks) / bets
    avg_edge = sum((p["edge_pct"] or 0.0) for p in picks) / bets
    best_run, worst_run, cur_w, cur_l = 0, 0, 0, 0
    for p in sorted(picks, key=lambda x: (x.get("date") or "", x.get("event_id") or 0)):
        if p["won"]:
            cur_w += 1; cur_l = 0
        else:
            cur_l += 1; cur_w = 0
        best_run  = max(best_run, cur_w)
        worst_run = max(worst_run, cur_l)
    stats.update({"bets": bets, "wins": wins, "losses": bets-wins,
                  "profit": round(profit, 3),
                  "roi": round((profit/bets)*100 if bets else 0, 2),
                  "winrate": round((wins/bets)*100 if bets else 0, 2),
                  "avg_odds": round(avg_odds, 3), "avg_edge": round(avg_edge, 2),
                  "worst_run": worst_run, "best_run": best_run})
    return stats


def bucket_label_odds(odds):
    if odds <= 1.25: return "1.10-1.25"
    if odds <= 1.45: return "1.26-1.45"
    if odds <= 1.70: return "1.46-1.70"
    if odds <= 2.10: return "1.71-2.10"
    return "2.10+"


def bucket_label_conf(conf):
    if conf <= 45: return "0-45"
    if conf <= 55: return "46-55"
    if conf <= 65: return "56-65"
    if conf <= 75: return "66-75"
    return "76+"


def bucket_label_edge(edge):
    if edge <= 2:  return "0-2pp"
    if edge <= 5:  return "2-5pp"
    if edge <= 8:  return "5-8pp"
    return "8pp+"


def accumulate_pick(bucket_map, key, pick):
    bucket_map.setdefault(key, []).append(pick)


def rows_from_bucket_map(bucket_map):
    out = []
    for key, picks in bucket_map.items():
        s = finalize_pick_stats(picks)
        s["key"] = key
        out.append(s)
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
    stale_removed = duplicate_removed = 0
    for row in predictions or []:
        if is_prediction_stale(row, now_utc=now_utc, max_age_hours=max_age_hours):
            stale_removed += 1
            continue
        event    = row.get("event") or {}
        event_id = event.get("id") or row.get("id")
        current  = kept.get(event_id)
        row_dt   = parse_dt(row.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        cur_dt   = parse_dt((current or {}).get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        if current is None or row_dt.astimezone(timezone.utc) >= cur_dt.astimezone(timezone.utc):
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


# ============================================================
# FETCH HELPERS
# ============================================================

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


def fetch_best_market_odds(event_id, market_key):
    MARKET_ODDS_FIELD = {
        "homeWin": ("odds_home", "home_win"), "draw": ("odds_draw", "draw"),
        "awayWin": ("odds_away", "away_win"), "over15": ("odds_over_15", "over_15"),
        "under15": ("odds_under_15", "under_15"), "over25": ("odds_over_25", "over_25"),
        "under25": ("odds_under_25", "under_25"), "under35": ("odds_under_35", "under_35"),
        "btts": ("odds_btts_yes", "btts_yes"),
    }
    if market_key not in MARKET_ODDS_FIELD:
        return None
    odds_field, api_field = MARKET_ODDS_FIELD[market_key]
    try:
        url = f"{API_BASE}/api/events/{event_id}/odds/"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code in (404, 405, 400):
            return None
        r.raise_for_status()
        data = r.json()
        bookmakers = data if isinstance(data, list) else data.get("results", data.get("bookmakers", []))
        if not bookmakers:
            return None
        best_odds, best_bk = 0.0, None
        for bk in bookmakers:
            bk_name = bk.get("bookmaker") or bk.get("name") or "unknown"
            val = bk.get(odds_field) or bk.get(api_field) or bk.get(f"odds_{api_field}")
            try:
                val = float(val)
            except Exception:
                continue
            if val > best_odds:
                best_odds, best_bk = val, bk_name
        if best_odds > 1.01 and best_bk:
            return best_odds, best_bk
        return None
    except Exception:
        return None


def fetch_status_metrics():
    url = f"{API_BASE}/status/"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        html  = r.text or ""
        plain = re.sub(r"<[^>]+>", " ", html)
        plain = re.sub(r"\s+", " ", plain).strip()
        block_match = re.search(r"Football Pipeline(.*?)(Tennis Pipeline|API Endpoints Health|$)", plain, re.S | re.I)
        block = block_match.group(1) if block_match else plain

        def pick(label):
            m = re.search(label + r"\s*([0-9,]+|None)", block, re.I)
            if not m:
                return None
            raw = m.group(1).strip()
            return 0 if raw.lower() == "none" else int(raw.replace(",", ""))

        data = {
            "upcoming_matches":       pick(r"Upcoming matches"),
            "with_odds":              pick(r"With odds"),
            "ml_predictions_upcoming": pick(r"ML predictions\s*\(upcoming\)"),
            "fetched_at":             datetime.now(timezone.utc).isoformat(),
            "source":                 url,
        }
        return data if data.get("ml_predictions_upcoming") is not None or data.get("with_odds") is not None else {}
    except Exception as e:
        print(f"WARN: status metrics unavailable: {e}")
        return {}


def fetch_all_pages(endpoint, extra_params=""):
    all_results = []
    next_url    = f"{API_BASE}{endpoint}{extra_params}"
    page_count  = 0
    while next_url:
        page_count += 1
        print(f"Page {page_count}: {next_url}")
        data = fetch_url(next_url)
        if isinstance(data, list):
            all_results.extend(data)
            break
        if not isinstance(data, dict):
            raise RuntimeError(f"Raspuns invalid: {type(data)}")
        all_results.extend(data.get("results", []))
        next_url = data.get("next")
        if next_url and next_url.startswith("http://"):
            next_url = next_url.replace("http://", "https://", 1)
    return all_results


def should_refresh_static(now_utc):
    return now_utc.hour in STATIC_REFRESH_HOURS


# ============================================================
# BUILD ROWS WITH H2H + FORM
# ============================================================

def get_prediction_forms(row):
    """Extrage forma home/away din prediction row."""
    event = row.get("event") or {}
    home_obj = event.get("home_team_obj") or {}
    away_obj = event.get("away_team_obj") or {}
    home_name = event.get("home_team") or home_obj.get("name") or ""
    away_name = event.get("away_team") or away_obj.get("name") or ""
    home_form = get_team_form(home_name, "home")
    away_form = get_team_form(away_name, "away")
    return home_form, away_form


def get_prediction_h2h(row):
    """Obține H2H pentru prediction row (din cache sau API)."""
    event    = row.get("event") or {}
    home_obj = event.get("home_team_obj") or {}
    away_obj = event.get("away_team_obj") or {}
    home_id  = home_obj.get("id")
    away_id  = away_obj.get("id")
    if not home_id or not away_id:
        return None
    return fetch_h2h(home_id, away_id)


# ============================================================
# BUILD SIGNAL AUDIT (cu H2H + Form)
# ============================================================

def build_signal_audit(predictions, recommendation_log=None):
    rows = []
    now_utc   = datetime.now(timezone.utc)
    log_index = {str((r or {}).get("event_id") or ""): (r or {}) for r in (recommendation_log or []) if (r or {}).get("event_id")}

    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "notstarted":
            continue
        home_form, away_form = get_prediction_forms(row)
        h2h                  = get_prediction_h2h(row)
        candidates = []
        for market in MARKETS:
            mkey = market["key"]
            try:
                odds = float((market["odds"](event) or 0))
            except Exception:
                odds = 0.0
            if odds < 1.01:
                continue
            candidate = build_candidate(row, mkey, home_form, away_form, h2h)
            if candidate and qualifies_for_strategy(candidate, STRATEGIES["engine_overall"]):
                candidates.append(candidate)

        if not candidates:
            continue
        pick = max(candidates, key=rank_candidate)

        # Best odds across bookmakers
        event_id_sa = pick.get("event_id")
        best_odds_result = fetch_best_market_odds(event_id_sa, pick.get("market_key")) if event_id_sa else None
        if best_odds_result and best_odds_result[0] > (pick.get("odds") or 0):
            best_odds_val, best_bk = best_odds_result
            pick = dict(pick)
            pick["odds_original"]      = pick["odds"]
            pick["odds"]               = round(best_odds_val, 3)
            pick["best_odds_bookmaker"] = best_bk
            mprob = pick.get("market_prob")
            pick["edge_pct"]           = round(pick.get("adj_prob",0) - mprob, 2) if mprob else pick.get("edge_pct")
            pick["value"]              = round(calc_value(pick.get("adj_prob",0) / 100.0, best_odds_val), 4)
            pick["score"]              = calc_smart_score(
                pick.get("adj_prob",0), pick["value"], pick.get("confidence",0),
                pick.get("edge_pct"), pick.get("fit_score",0),
                pick.get("source_api", False), pick.get("source_heuristic", False),
                pick.get("h2h_bonus", 0.0), pick.get("form_bonus", 0.0),
            )

        created_at = parse_dt(pick.get("created_at"))
        age_hours  = round((now_utc - created_at.astimezone(timezone.utc)).total_seconds() / 3600.0, 2) if created_at else None
        fair_odds  = round(1.0 / max(0.0001, pick.get("adj_prob", 0) / 100.0), 3) if pick.get("adj_prob") else None
        kelly_full    = calc_kelly_pct(pick.get("adj_prob"), pick.get("odds"), fraction=1.0)
        kelly_quarter = calc_kelly_pct(pick.get("adj_prob"), pick.get("odds"), fraction=0.25)

        reason_tags = []
        if pick.get("edge_pct") is not None:
            reason_tags.append(f"No-vig {pick['edge_pct']:+.1f}pp")
        if pick.get("value") is not None:
            reason_tags.append(f"EV+ {pick['value']*100:+.1f}%")
        if pick.get("poisson_alert") and pick.get("poisson_delta") is not None:
            reason_tags.append(f"Poisson {pick['poisson_delta']:+.1f}pp")
        if pick.get("form_used"):
            fp = pick.get("form_prob")
            if fp is not None:
                reason_tags.append(f"Form {fp:.0f}%")
        if pick.get("h2h_bonus") and abs(pick.get("h2h_bonus", 0)) >= 1.5:
            reason_tags.append(f"H2H {pick['h2h_bonus']:+.1f}")
        if pick.get("market_key") in {"over15", "over25", "under25", "under35"}:
            xg_total = round(float(row.get("expected_home_goals") or 0) + float(row.get("expected_away_goals") or 0), 2)
            reason_tags.append(f"xG {xg_total:.2f}")
        if row.get("most_likely_score"):
            reason_tags.append(f"Scor {row.get('most_likely_score')}")

        log_row = log_index.get(str(pick.get("event_id"))) or {}
        previous_odds = log_row.get("odds") or pick.get("odds")
        opening_odds  = log_row.get("opening_odds") or previous_odds
        current_odds  = pick.get("odds")
        try:
            line_movement_pct = round(((float(current_odds) - float(previous_odds)) / float(previous_odds)) * 100.0, 2) if previous_odds and current_odds else 0.0
            from_open_pct     = round(((float(current_odds) - float(opening_odds)) / float(opening_odds)) * 100.0, 2) if opening_odds and current_odds else 0.0
        except Exception:
            line_movement_pct = from_open_pct = 0.0

        if abs(line_movement_pct) >= 1.5:
            reason_tags.append(f"Line {line_movement_pct:+.1f}%")

        rows.append({
            "prediction_id":     pick.get("prediction_id"),
            "event_id":          pick.get("event_id"),
            "created_at":        pick.get("created_at"),
            "event_date":        pick.get("date"),
            "age_hours":         age_hours,
            "league":            pick.get("league"),
            "home":              event.get("home_team"),
            "away":              event.get("away_team"),
            "model_version":     row.get("model_version"),
            "market_key":        pick.get("market_key"),
            "market":            pick.get("market"),
            "book_odds":         pick.get("odds"),
            "market_prob":       pick.get("market_prob"),
            "model_prob":        pick.get("prob"),
            "api_prob":          pick.get("api_prob"),
            "poisson_prob":      pick.get("poisson_prob"),
            "poisson_delta":     pick.get("poisson_delta"),
            "poisson_alert":     pick.get("poisson_alert"),
            "form_prob":         pick.get("form_prob"),
            "form_used":         pick.get("form_used", False),
            "h2h_bonus":         pick.get("h2h_bonus", 0.0),
            "adjusted_prob":     pick.get("adj_prob"),
            "fair_odds":         fair_odds,
            "edge_pct":          pick.get("edge_pct"),
            "value":             pick.get("value"),
            "score":             pick.get("score"),
            "verdict":           pick.get("verdict"),
            "source_api":        pick.get("source_api"),
            "source_heuristic":  pick.get("source_heuristic"),
            "kelly_full_pct":    kelly_full,
            "kelly_quarter_pct": kelly_quarter,
            "previous_odds":     previous_odds,
            "opening_odds":      opening_odds,
            "line_movement_pct": line_movement_pct,
            "from_open_pct":     from_open_pct,
            "reason_tags":       reason_tags[:5],
        })

    rows.sort(key=lambda x: (float(x.get("kelly_quarter_pct") or 0), float(x.get("edge_pct") or 0), float(x.get("score") or 0)), reverse=True)
    rows = rows[:SIGNAL_AUDIT_MAX_ROWS]
    return {
        "updated_at":          datetime.now(timezone.utc).isoformat(),
        "count":               len(rows),
        "avg_edge_pct":        round(sum(float(r.get("edge_pct") or 0) for r in rows) / len(rows), 2) if rows else 0.0,
        "avg_kelly_quarter_pct": round(sum(float(r.get("kelly_quarter_pct") or 0) for r in rows) / len(rows), 2) if rows else 0.0,
        "avg_value_pct":       round(sum(float(r.get("value") or 0) * 100.0 for r in rows) / len(rows), 2) if rows else 0.0,
        "rows":                rows,
    }


# ============================================================
# BUILD HISTORY ROWS
# ============================================================

def build_history_rows(predictions):
    rows = []
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue
        home_form, away_form = get_prediction_forms(row)
        candidates = [build_candidate(row, m["key"], home_form, away_form) for m in MARKETS]
        candidates = [c for c in candidates if c and qualifies_for_strategy(c, STRATEGIES["engine_overall"])]
        if not candidates:
            continue
        pick = max(candidates, key=rank_candidate)
        rows.append({
            "date":         pick.get("date"),
            "created_at":   pick.get("created_at"),
            "event_id":     pick.get("event_id"),
            "prediction_id": pick.get("prediction_id"),
            "league":       pick.get("league"),
            "market":       pick.get("market"),
            "market_key":   pick.get("market_key"),
            "odds":         pick.get("odds"),
            "model_prob":   pick.get("prob"),
            "adjusted_prob": pick.get("adj_prob"),
            "market_prob":  pick.get("market_prob"),
            "edge_pct":     pick.get("edge_pct"),
            "confidence":   pick.get("confidence"),
            "value":        pick.get("value"),
            "score":        pick.get("score"),
            "source_api":   pick.get("source_api"),
            "source_heuristic": pick.get("source_heuristic"),
            "form_used":    pick.get("form_used", False),
            "h2h_bonus":    pick.get("h2h_bonus", 0.0),
            "won":          pick.get("won"),
        })
    rows.sort(key=lambda x: (x.get("date") or "", x.get("event_id") or 0), reverse=True)
    return rows[:HISTORY_MAX_ROWS]


# ============================================================
# UI LIVE CANDIDATE (pentru recommendation_log)
# ============================================================

def ui_like_heuristic_recommend(row, market_key):
    xg_home = float(row.get("expected_home_goals") or 0)
    xg_away = float(row.get("expected_away_goals") or 0)
    xg_total = xg_home + xg_away
    sl = parse_scoreline(row.get("most_likely_score"))
    if market_key == "over15":
        return pct(row.get("prob_over_15")) >= 76 and xg_total >= 2.10 and (not sl or sl["total"] >= 2)
    if market_key == "over25":
        return pct(row.get("prob_over_25")) >= 60 and xg_total >= 2.60 and (not sl or sl["total"] >= 3)
    if market_key == "under35":
        return 100 - pct(row.get("prob_over_35")) >= 68 and xg_total <= 3.05 and (not sl or sl["total"] <= 3)
    if market_key == "btts":
        return pct(row.get("prob_btts_yes")) >= 58 and xg_home >= 0.90 and xg_away >= 0.90 and (not sl or sl["btts"])
    return heuristic_recommend(row, market_key)


def build_ui_live_candidate(row, market_key):
    market = MARKET_MAP[market_key]
    event  = row.get("event") or {}
    try:
        odds = float(market["odds"](event) or 0)
    except Exception:
        return None
    if odds < 1.01:
        return None
    if hard_contradiction(row, market_key):
        return None

    home_form, away_form = get_prediction_forms(row)
    h2h = get_prediction_h2h(row)

    prob_meta   = blend_model_probability(row, market_key, home_form, away_form)
    prob        = prob_meta.get("effective_prob")
    confidence  = derive_confidence(row)  # [V3]
    league_name = (event.get("league") or {}).get("name") or "Unknown"
    tier_info   = get_league_tier_info(league_name)
    calib_info  = get_league_calibration(league_name)
    value       = calc_value(prob, odds)
    if value <= 0 or odds > 1.65:
        return None

    adj        = adjusted_prob(prob, confidence, league_name=league_name, market_key=market_key, odds=odds)
    market_prob = market_prob_from_row_event(row, event, market_key)
    edge_pct    = round(prob - market_prob, 2) if market_prob is not None else None
    fit         = market_fit_score(row, market_key, home_form, away_form)
    source_api  = api_recommend(row, market_key)
    source_heur = ui_like_heuristic_recommend(row, market_key)
    h2h_s       = h2h_bonus(h2h, market_key)
    conf_boost  = min(6.0, confidence * 0.06)

    ticket_score = 0.0
    ticket_score += adj * 0.40
    ticket_score += max(0.0, float(edge_pct or 0)) * 1.35
    ticket_score += max(0.0, value) * 100.0 * 0.18
    ticket_score += fit
    ticket_score += conf_boost
    ticket_score += 4.0 if source_api else (2.0 if source_heur else 0)
    ticket_score += 1.5 if prob_meta.get("poisson_alert") and prob_meta.get("poisson_direction") == "value" else (
                   -2.5 if prob_meta.get("poisson_alert") else 0)
    if 1.18 <= odds <= 1.75: ticket_score += 4.0
    if odds > 2.20:          ticket_score -= 8.0
    ticket_score += clamp(h2h_s, -4.0, 4.0)

    return {
        "market": market["label"], "market_key": market_key,
        "odds": round(odds, 3), "model_prob": round(prob, 2),
        "api_prob": prob_meta.get("api_prob"),
        "poisson_prob": prob_meta.get("poisson_prob"),
        "poisson_delta": prob_meta.get("poisson_delta"),
        "poisson_alert": bool(prob_meta.get("poisson_alert")),
        "poisson_direction": prob_meta.get("poisson_direction"),
        "form_prob": prob_meta.get("form_prob"),
        "form_used": prob_meta.get("form_used", False),
        "h2h_bonus": round(h2h_s, 2),
        "adjusted_prob": round(adj, 2), "market_prob": round(market_prob, 2) if market_prob is not None else None,
        "edge_pct": round(edge_pct, 2) if edge_pct is not None else None,
        "confidence": round(confidence, 2), "value": round(value, 4),
        "fit_score": round(fit, 2), "ticket_score": round(ticket_score),
        "source_api": bool(source_api), "source_heuristic": bool(source_heur),
        "league": league_name, "league_tier": tier_info.get("tier"),
        "league_calib_tier": calib_info.get("tier", "neutral"),
        "league_roi_backtest": calib_info.get("roi", None),
        "adjustment_factor": round(dynamic_adjustment_factor(prob, confidence, league_name=league_name, market_key=market_key, odds=odds), 4),
        "event_id": event.get("id"), "prediction_id": row.get("id"),
        "date": event.get("event_date"), "created_at": row.get("created_at"),
        "most_likely_score": row.get("most_likely_score"),
    }


def build_current_recommendation_rows(predictions, logged_at_iso):
    rows = []
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "notstarted":
            continue
        candidates = [build_ui_live_candidate(row, mk) for mk in ["over15", "over25", "under35", "btts"]]
        candidates = [c for c in candidates if c]
        if not candidates:
            continue
        candidates.sort(key=lambda c: (c.get("ticket_score") or 0, c.get("value") or 0, c.get("adjusted_prob") or 0), reverse=True)
        pick = candidates[0]
        event_id = pick.get("event_id")
        if not event_id:
            continue
        rows.append({
            "log_id": str(event_id), "logged_at": logged_at_iso,
            "prediction_created_at": pick.get("created_at"),
            "event_id": event_id, "prediction_id": pick.get("prediction_id"),
            "home": event.get("home_team"), "away": event.get("away_team"),
            "league": pick.get("league"), "event_date": pick.get("date"),
            "market": pick.get("market"), "market_key": pick.get("market_key"),
            "odds": pick.get("odds"), "model_prob": pick.get("model_prob"),
            "api_prob": pick.get("api_prob"), "poisson_prob": pick.get("poisson_prob"),
            "poisson_delta": pick.get("poisson_delta"), "poisson_alert": pick.get("poisson_alert"),
            "form_prob": pick.get("form_prob"), "form_used": pick.get("form_used", False),
            "h2h_bonus": pick.get("h2h_bonus", 0.0),
            "adjusted_prob": pick.get("adjusted_prob"), "market_prob": pick.get("market_prob"),
            "edge_pct": pick.get("edge_pct"), "confidence": pick.get("confidence"),
            "value": pick.get("value"), "score": pick.get("ticket_score"),
            "source_api": pick.get("source_api"), "source_heuristic": pick.get("source_heuristic"),
            "model_version": row.get("model_version"), "most_likely_score": pick.get("most_likely_score"),
            "league_tier": pick.get("league_tier"),
            "opening_odds": pick.get("odds"), "previous_odds": pick.get("odds"),
            "line_movement_pct": 0.0, "from_open_pct": 0.0,
            "status": "pending", "won": None,
            "home_score": None, "away_score": None, "settled_at": None,
        })
    rows.sort(key=lambda x: (x.get("event_date") or "", x.get("event_id") or 0))
    return rows


def build_finished_event_index(predictions):
    out = {}
    for row in predictions or []:
        event    = row.get("event") or {}
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
    by_event_id   = {}
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
        key      = str(event_id)
        row["log_id"] = key
        existing = by_event_id.get(key)
        if not existing:
            by_event_id[key] = row
            continue
        if existing.get("status") in {"win", "lose"}:
            continue
        first_logged = existing.get("first_logged_at") or existing.get("logged_at") or row.get("logged_at")
        row["first_logged_at"] = first_logged
        row["logged_at"]       = row.get("logged_at") or existing.get("logged_at")
        row["opening_odds"]    = existing.get("opening_odds") if existing.get("opening_odds") is not None else row.get("odds")
        row["previous_odds"]   = existing.get("odds") if existing.get("odds") is not None else row.get("odds")
        try:
            row["line_movement_pct"] = round(((float(row.get("odds")) - float(row.get("previous_odds"))) / float(row.get("previous_odds"))) * 100.0, 2) if row.get("previous_odds") and row.get("odds") else 0.0
            row["from_open_pct"]     = round(((float(row.get("odds")) - float(row.get("opening_odds"))) / float(row.get("opening_odds"))) * 100.0, 2) if row.get("opening_odds") and row.get("odds") else 0.0
        except Exception:
            row["line_movement_pct"] = row["from_open_pct"] = 0.0
        row["status"] = existing.get("status") or row.get("status")
        row["won"] = existing.get("won")
        row["home_score"] = existing.get("home_score")
        row["away_score"] = existing.get("away_score")
        row["settled_at"] = existing.get("settled_at")
        by_event_id[key]  = row

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
        row["won"]    = bool(won)
        row["home_score"] = event.get("home_score")
        row["away_score"] = event.get("away_score")
        row["settled_at"] = settled_at_iso

    out = list(by_event_id.values())
    out.sort(key=lambda x: (x.get("logged_at") or x.get("prediction_created_at") or "", x.get("event_id") or 0), reverse=True)
    return out[:RECOMMENDATION_LOG_MAX_ROWS]


# ============================================================
# BACKTEST SUMMARY
# ============================================================

def build_backtest_summary(predictions, lookback_days):
    finished = [r for r in (predictions or []) if (r.get("event") or {}).get("status") == "finished"
                and (r.get("event") or {}).get("home_score") is not None
                and (r.get("event") or {}).get("away_score") is not None]

    all_picks: List[Dict[str, Any]] = []
    market_picks: Dict[str, List]   = {}
    league_picks: Dict[str, List]   = {}
    strategy_picks: Dict[str, List] = {}
    odds_picks: Dict[str, List]     = {}
    conf_picks: Dict[str, List]     = {}
    edge_picks: Dict[str, List]     = {}

    for row in finished:
        event = row.get("event") or {}
        home_form, away_form = get_prediction_forms(row)
        for market in MARKETS:
            c = build_candidate(row, market["key"], home_form, away_form)
            if not c:
                continue
            for strat_name, strat_cfg in STRATEGIES.items():
                if qualifies_for_strategy(c, strat_cfg):
                    accumulate_pick(strategy_picks, strat_name, c)
            if qualifies_for_strategy(c, STRATEGIES["engine_overall"]):
                all_picks.append(c)
                accumulate_pick(market_picks, c["market"], c)
                accumulate_pick(league_picks, c["league"], c)
                accumulate_pick(odds_picks,   bucket_label_odds(c["odds"]), c)
                accumulate_pick(conf_picks,   bucket_label_conf(c["confidence"]), c)
                if c["edge_pct"] is not None:
                    accumulate_pick(edge_picks, bucket_label_edge(c["edge_pct"]), c)

    engine_stats = finalize_pick_stats(all_picks, "Engine Overall")
    return {
        "updated_at":              datetime.now(timezone.utc).isoformat(),
        "lookback_days":           lookback_days,
        "finished_predictions":    len(finished),
        "engine_bets":             engine_stats["bets"],
        "engine_wins":             engine_stats["wins"],
        "engine_roi":              engine_stats["roi"],
        "engine_winrate":          engine_stats["winrate"],
        "engine_profit":           engine_stats["profit"],
        "engine_avg_odds":         engine_stats["avg_odds"],
        "overall": engine_stats,
        "by_market":    rows_from_bucket_map(market_picks),
        "by_league":    rows_from_bucket_map(league_picks),
        "by_strategy":  rows_from_bucket_map(strategy_picks),
        "by_odds_bucket": rows_from_bucket_map(odds_picks),
        "by_conf_bucket": rows_from_bucket_map(conf_picks),
        "by_edge_bucket": rows_from_bucket_map(edge_picks),
    }


# ============================================================
# DATA HEALTH & HEADER SYNC
# ============================================================

def build_data_health(predictions, prep_stats=None):
    prep_stats = prep_stats or {}
    events_without_odds   = 0
    predictions_with_api  = 0
    predictions_heuristic = 0
    predictions_no_score  = 0
    age_hours_list        = []
    for row in predictions or []:
        event = row.get("event") or {}
        has_odds = any(event.get(f"odds_{k}") and float(event.get(f"odds_{k}") or 0) >= 1.01
                       for k in ["home", "over_15", "over_25", "under_35", "btts_yes"])
        if not has_odds:
            events_without_odds += 1
        if any(row.get(k) for k in ["over_15_recommend", "over_25_recommend", "btts_recommend", "favorite_recommend", "winner_recommend"]):
            predictions_with_api += 1
        else:
            predictions_heuristic += 1
        if not row.get("most_likely_score"):
            predictions_no_score += 1
        created_at = parse_dt(row.get("created_at"))
        if created_at:
            age_hours_list.append((datetime.now(timezone.utc) - created_at.astimezone(timezone.utc)).total_seconds() / 3600.0)

    return {
        "predictions_count":       len(predictions or []),
        "events_with_predictions": len(predictions or []),
        "events_without_odds":     events_without_odds,
        "predictions_with_api_flags": predictions_with_api,
        "predictions_with_heuristic_only": predictions_heuristic,
        "predictions_without_scoreline": predictions_no_score,
        "max_prediction_age_hours":  round(max(age_hours_list), 2) if age_hours_list else None,
        "avg_prediction_age_hours":  round(sum(age_hours_list) / len(age_hours_list), 2) if age_hours_list else None,
        "prediction_age_cap_hours":  MAX_PREDICTION_AGE_HOURS,
        "stale_predictions_removed": prep_stats.get("stale_removed", 0),
        "duplicate_predictions_removed": prep_stats.get("duplicate_removed", 0),
    }


def build_header_sync_metrics(predictions):
    ml = with_odds = upcoming = 0
    for row in predictions or []:
        ml += 1
        event = row.get("event") or {}
        if any(event.get(f"odds_{k}") and float(event.get(f"odds_{k}") or 0) >= 1.01
               for k in ["home", "over_15", "over_25"]):
            with_odds += 1
        if event.get("status") == "notstarted":
            upcoming += 1
    return {"ml_count": ml, "odds_count": with_odds, "upcoming_predictions_count": upcoming, "predictions_count": ml}


# ============================================================
# AI MEMORY (unchanged from V16)
# ============================================================

def ai_odds_bucket(odds):
    o = float(odds or 0)
    if o < 1.20: return "1.01–1.19"
    if o < 1.35: return "1.20–1.34"
    if o < 1.50: return "1.35–1.49"
    if o < 1.66: return "1.50–1.65"
    return "1.66+"

def ai_conf_bucket(c):
    c = float(c or 0)
    if c < 50: return "<50"
    if c < 60: return "50–59"
    if c < 70: return "60–69"
    return "70+"

def ai_edge_bucket(e):
    e = float(e or 0)
    if e < 1: return "<1%"
    if e < 3: return "1–2.9%"
    if e < 5: return "3–4.9%"
    return "5%+"

def ai_weekday_label(iso_value):
    if not iso_value: return "—"
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
        return ["Luni","Marți","Miercuri","Joi","Vineri","Sâmbătă","Duminică"][dt.weekday()]
    except Exception:
        return "—"

def ai_hour_bucket(iso_value):
    if not iso_value: return "—"
    try:
        h = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00")).hour
        if h < 6:  return "00–05"
        if h < 12: return "06–11"
        if h < 18: return "12–17"
        return "18–23"
    except Exception:
        return "—"

def ai_source_label(row):
    if row.get("source_api") and row.get("source_heuristic"): return "ML + heuristic"
    if row.get("source_api"):        return "ML/API"
    if row.get("source_heuristic"):  return "heuristic"
    return "heuristic"

def ai_recency_weight(iso_value, now_utc):
    if not iso_value: return 0.8
    try:
        dt = datetime.fromisoformat(str(iso_value).replace("Z", "+00:00"))
        age_days = max(0.0, (now_utc - dt).total_seconds() / 86400.0)
        return round(max(0.55, 1.0 - min(age_days, 75.0) / 170.0), 4)
    except Exception:
        return 0.8

def ai_create_stat(kind, key, label):
    return {"kind": kind, "key": key, "label": label, "raw_bets": 0, "bets_w": 0.0, "wins_w": 0.0, "profit_w": 0.0, "edge_sum": 0.0, "odds_sum": 0.0}

def ai_update_stat(store, kind, key, label, row, weight):
    bucket = store.setdefault(kind, {})
    stat   = bucket.setdefault(key, ai_create_stat(kind, key, label))
    odds   = float(row.get("odds") or 0)
    won    = bool(row.get("won"))
    profit = (odds - 1.0) if won and odds > 1 else -1.0
    stat["raw_bets"] += 1
    stat["bets_w"]   += weight
    stat["wins_w"]   += weight if won else 0.0
    stat["profit_w"] += profit * weight
    stat["edge_sum"] += float(row.get("edge_pct") or 0.0)
    stat["odds_sum"] += odds

def ai_finalize_stat(stat):
    bets_w = float(stat.get("bets_w") or 0)
    raw    = int(stat.get("raw_bets") or 0)
    if bets_w <= 0 or raw <= 0: return None
    wins_w   = float(stat.get("wins_w") or 0)
    profit_w = float(stat.get("profit_w") or 0)
    roi      = (profit_w * 100.0 / bets_w) if bets_w else 0.0
    winrate  = (wins_w * 100.0 / bets_w) if bets_w else 0.0
    avg_edge = float(stat.get("edge_sum") or 0) / raw if raw else 0.0
    avg_odds = float(stat.get("odds_sum") or 0) / raw if raw else 0.0
    sf       = min(1.0, raw / 10.0)
    mem_score = ((roi * 0.32) + ((winrate - 54.0) * 0.18) + (avg_edge * 0.75)) * sf
    out = dict(stat)
    out.update({"wins": int(round(wins_w)), "losses": max(0, raw - int(round(wins_w))),
                "roi": round(roi, 2), "winrate": round(winrate, 2), "profit": round(profit_w, 3),
                "avg_edge": round(avg_edge, 2), "avg_odds": round(avg_odds, 3),
                "memory_score": round(clamp(mem_score, -12.0, 12.0), 2)})
    return out

def ai_pattern_market_key(row):
    if not row: return "—"
    key = str(row.get("key") or "")
    return key if row.get("kind") == "market" else key.split("|", 1)[0] if key else "—"

def ai_select_diverse_patterns(rows, limit=12, max_per_market=2):
    out = []; per_market = {}
    for row in rows or []:
        mk = ai_pattern_market_key(row)
        if per_market.get(mk, 0) >= max_per_market: continue
        out.append(row)
        per_market[mk] = per_market.get(mk, 0) + 1
        if len(out) >= limit: break
    return out


def build_ai_memory(current_rows, recommendation_log, history_rows, now_utc):
    settled = [r for r in (recommendation_log or []) if r.get("status") in {"win", "lose"} and r.get("market_key") in {"over15", "over25", "under35", "btts"}]
    settled.extend([r for r in (history_rows or []) if r.get("won") is not None and r.get("market_key") in {"over15", "over25", "under35", "btts"}])
    pending = [r for r in (current_rows or []) if r.get("market_key") in {"over15", "over25", "under35", "btts"}]

    patterns = {}
    for row in settled:
        base_time  = row.get("settled_at") or row.get("event_date") or row.get("logged_at") or row.get("prediction_created_at")
        weight     = ai_recency_weight(base_time, now_utc)
        market_key = row.get("market_key") or "—"
        league     = row.get("league") or "Unknown"
        ob = ai_odds_bucket(row.get("odds")); cb = ai_conf_bucket(row.get("confidence")); eb = ai_edge_bucket(row.get("edge_pct"))
        wd = ai_weekday_label(row.get("event_date") or row.get("date"))
        hb = ai_hour_bucket(row.get("event_date") or row.get("date"))
        sl = ai_source_label(row)
        ml = row.get("market") or market_key
        ai_update_stat(patterns, "market",         market_key,               ml,                     row, weight)
        ai_update_stat(patterns, "market_league",  f"{market_key}|{league}", f"{ml} • {league}",     row, weight)
        ai_update_stat(patterns, "market_odds",    f"{market_key}|{ob}",     f"{ml} • cote {ob}",    row, weight)
        ai_update_stat(patterns, "market_conf",    f"{market_key}|{cb}",     f"{ml} • conf {cb}",    row, weight)
        ai_update_stat(patterns, "market_edge",    f"{market_key}|{eb}",     f"{ml} • edge {eb}",    row, weight)
        if wd != "—": ai_update_stat(patterns, "market_weekday", f"{market_key}|{wd}", f"{ml} • {wd}", row, weight)
        if hb != "—": ai_update_stat(patterns, "market_hour",    f"{market_key}|{hb}", f"{ml} • interval {hb}", row, weight)
        if sl:        ai_update_stat(patterns, "market_source",  f"{market_key}|{sl}", f"{ml} • {sl}", row, weight)

    final_patterns = {}; flat_patterns = []
    for kind, bucket in patterns.items():
        final_patterns[kind] = {}
        for key, stat in bucket.items():
            fin = ai_finalize_stat(stat)
            if not fin: continue
            final_patterns[kind][key] = fin
            flat_patterns.append(fin)

    market_rows = sorted([r for r in final_patterns.get("market", {}).values() if r.get("raw_bets", 0) >= 5],
                          key=lambda x: (x.get("memory_score",0), x.get("roi",0), x.get("raw_bets",0)), reverse=True)
    pos = sorted([r for r in flat_patterns if r.get("raw_bets",0) >= 4 and r.get("memory_score",0) > 0],
                  key=lambda x: (x.get("memory_score",0), x.get("roi",0), x.get("raw_bets",0)), reverse=True)
    neg = sorted([r for r in flat_patterns if r.get("raw_bets",0) >= 4 and r.get("memory_score",0) < 0],
                  key=lambda x: (x.get("memory_score",0), x.get("roi",0)))
    pos_pats = ai_select_diverse_patterns(pos, 12, 2)
    neg_pats = ai_select_diverse_patterns(neg, 12, 2)

    def lookup(kind, key, min_bets=4):
        row = final_patterns.get(kind, {}).get(key)
        return row if row and int(row.get("raw_bets") or 0) >= min_bets else None

    adaptive_picks = []
    for row in pending:
        mk = row.get("market_key") or "—"; ml = row.get("market") or mk
        league = row.get("league") or "Unknown"
        ob = ai_odds_bucket(row.get("odds")); cb = ai_conf_bucket(row.get("confidence")); eb = ai_edge_bucket(row.get("edge_pct"))
        wd = ai_weekday_label(row.get("event_date")); hb = ai_hour_bucket(row.get("event_date")); sl = ai_source_label(row)
        mem_patterns = [p for p in [lookup("market", mk), lookup("market_league", f"{mk}|{league}"),
                                     lookup("market_odds", f"{mk}|{ob}"), lookup("market_conf", f"{mk}|{cb}"),
                                     lookup("market_edge", f"{mk}|{eb}")] if p]
        if not mem_patterns: continue
        mem_bonus = sum(p.get("memory_score", 0) for p in mem_patterns) / len(mem_patterns)
        base_prob = float(row.get("adjusted_prob") or row.get("model_prob") or 50.0)
        adaptive_score = base_prob + clamp(mem_bonus * 1.5, -8.0, 8.0)
        adaptive_picks.append({
            "event_id": row.get("event_id"), "league": league,
            "market_key": mk, "market": ml,
            "odds": row.get("odds"), "adjusted_prob": base_prob,
            "adaptive_score": round(adaptive_score, 2),
            "memory_bonus": round(mem_bonus, 2),
            "value": row.get("value"),
            "edge_pct": row.get("edge_pct"),
            "confidence": row.get("confidence"),
            "source_api": row.get("source_api"),
            "source_heuristic": row.get("source_heuristic"),
            "event_date": row.get("event_date"),
        })
    adaptive_picks.sort(key=lambda x: (x.get("adaptive_score",0), x.get("memory_bonus",0)), reverse=True)

    settled_count = len(settled)
    settled_wins  = sum(1 for r in settled if r.get("won") or r.get("status") == "win")
    settled_roi   = round((sum(((r.get("odds",1) or 1) - 1) if (r.get("won") or r.get("status") == "win") else -1.0 for r in settled) / settled_count * 100), 2) if settled_count else 0.0

    return {
        "updated_at": now_utc.isoformat(),
        "summary": {
            "settled_bets": settled_count, "settled_wins": settled_wins,
            "settled_winrate": round(settled_wins / settled_count * 100, 2) if settled_count else 0.0,
            "settled_roi": settled_roi, "pending_scored": len(adaptive_picks),
            "positive_patterns": len(pos_pats), "negative_patterns": len(neg_pats),
        },
        "by_market": market_rows[:8],
        "positive_patterns": pos_pats,
        "negative_patterns": neg_pats,
        "adaptive_picks": adaptive_picks[:30],
    }


# ============================================================
# MAIN
# ============================================================

def main():
    ensure_token()
    started_at = datetime.now(timezone.utc)
    today  = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=LOOKAHEAD_DAYS)).strftime("%Y-%m-%d")
    past   = (started_at - timedelta(days=BACKTEST_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    past_history = (started_at - timedelta(days=HISTORY_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    # [V1] Construiește form lookup ÎNAINTE de orice predicție
    print("\n[0/6] Building form lookup from training_features.json...")
    build_form_lookup()

    print(f"\n[1/6] Fetching predictions (next {LOOKAHEAD_DAYS} days)...")
    predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={today}&date_to={future}")
    print(f"Total predictions raw: {len(predictions)}")
    predictions, upcoming_prep = dedupe_and_filter_predictions(predictions, now_utc=started_at)
    print(f"Upcoming kept: {len(predictions)} | stale: {upcoming_prep['stale_removed']} | dupes: {upcoming_prep['duplicate_removed']}")
    if not predictions:
        raise RuntimeError("Predictions a venit gol. Oprim workflow-ul.")

    print(f"\n[2/6] Fetching upcoming events...")
    events = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")

    print("\n[3/6] Fetching BSD status metrics...")
    status_metrics = fetch_status_metrics()

    print(f"\n[4/6] Building historical audit (last {BACKTEST_LOOKBACK_DAYS} days)...")
    historical_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past}&date_to={today}")
    historical_predictions, historical_prep = dedupe_and_filter_predictions(historical_predictions, now_utc=started_at)
    backtest = build_backtest_summary(historical_predictions, BACKTEST_LOOKBACK_DAYS)
    print(f"Finished: {backtest['finished_predictions']} | Bets: {backtest['engine_bets']} | ROI: {backtest['engine_roi']}%")

    if HISTORY_LOOKBACK_DAYS != BACKTEST_LOOKBACK_DAYS:
        history_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past_history}&date_to={today}")
        history_predictions, _ = dedupe_and_filter_predictions(history_predictions, now_utc=started_at)
    else:
        history_predictions = historical_predictions

    history_rows         = build_history_rows(history_predictions)
    recommendation_log   = load_existing_json("recommendation_log.json", [])
    signal_audit         = build_signal_audit(predictions, recommendation_log=recommendation_log)
    current_recommendations = build_current_recommendation_rows(predictions, started_at.isoformat())
    finished_events      = build_finished_event_index(history_predictions)
    recommendation_log   = update_recommendation_log(recommendation_log, current_recommendations, finished_events, datetime.now(timezone.utc).isoformat())
    ai_memory            = build_ai_memory(current_recommendations, recommendation_log, history_rows, started_at)
    data_health          = build_data_health(predictions, upcoming_prep)
    header_sync          = build_header_sync_metrics(predictions)

    refresh_static = should_refresh_static(started_at)
    print(f"\n[5/6] Static refresh: {'YES' if refresh_static else 'NO'}")

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "leagues.json")):
        leagues = fetch_all_pages("/api/leagues/")
    else:
        leagues = load_existing_json("leagues.json", [])

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "teams.json")):
        teams = fetch_all_pages("/api/teams/")
    else:
        teams = load_existing_json("teams.json", [])

    print("\n[6/6] Saving files...")
    save_json(predictions,          "predictions.json")
    save_json(events,               "events.json")
    save_json(leagues,              "leagues.json")
    save_json(teams,                "teams.json")
    save_json([],                   "players_focus.json")
    save_json(backtest,             "backtest.json")
    save_json(history_rows,         "history_engine.json")
    save_json(signal_audit,         "signal_audit.json")
    save_json(recommendation_log,   "recommendation_log.json")
    save_json(ai_memory,            "ai_memory.json")

    h2h_stats = {
        "total_fetched": len([v for v in _H2H_CACHE.values() if v is not None]),
        "total_attempted": len(_H2H_CACHE),
        "coverage_pct": round(len([v for v in _H2H_CACHE.values() if v is not None]) / max(1, len(_H2H_CACHE)) * 100, 1),
    }
    form_stats = {"teams_in_lookup": len(_FORM_LOOKUP)}

    meta = {
        "updated_at":        datetime.now(timezone.utc).isoformat(),
        "started_at":        started_at.isoformat(),
        "version":           "v17-form-h2h-confidence-fix",
        "predictions_count": len(predictions),
        "events_count":      len(events),
        "leagues_count":     len(leagues),
        "teams_count":       len(teams),
        "historical_predictions_count": len(historical_predictions),
        "signal_audit_count": signal_audit.get("count", 0),
        "history_engine_rows": len(history_rows),
        "backtest_finished_predictions": backtest["finished_predictions"],
        "backtest_engine_bets":          backtest["engine_bets"],
        "backtest_engine_roi":           backtest["engine_roi"],
        "status": "ok",
        "timezone": TZ,
        "source": "bsd_api_v17",
        "refresh_static": refresh_static,
        "lookahead_days": LOOKAHEAD_DAYS,
        "backtest_lookback_days": BACKTEST_LOOKBACK_DAYS,
        "history_lookback_days":  HISTORY_LOOKBACK_DAYS,
        "v17_enhancements": {
            "form_model":   {"enabled": True, "weight": FORM_MODEL_WEIGHT, "teams": form_stats["teams_in_lookup"]},
            "h2h_signal":   {"enabled": True, "lookback": H2H_LOOKBACK, **h2h_stats},
            "confidence_fix": {"enabled": True, "method": "max(prob_home, prob_away) symmetric"},
            "form_blend":   {"api_weight": API_MODEL_WEIGHT, "form_weight": FORM_MODEL_WEIGHT},
        },
        "data_health": data_health,
        "header_sync": header_sync,
        "bsd_status": status_metrics,
        "upcoming_preprocess": upcoming_prep,
        "historical_preprocess": historical_prep,
        "ai_memory_settled_rows": ai_memory.get("summary", {}).get("settled_bets", 0),
        "ai_memory_adaptive_picks": len(ai_memory.get("adaptive_picks") or []),
    }
    save_json(meta, "meta.json")

    print("\nMeta summary:")
    print(f"  Version: {meta['version']}")
    print(f"  Form model: {form_stats['teams_in_lookup']} echipe")
    print(f"  H2H: {h2h_stats['total_fetched']}/{h2h_stats['total_attempted']} ({h2h_stats['coverage_pct']}%)")
    print(f"  Engine ROI: {backtest['engine_roi']}% pe {backtest['engine_bets']} pariuri")
    print("=== Done ===")


if __name__ == "__main__":
    main()
