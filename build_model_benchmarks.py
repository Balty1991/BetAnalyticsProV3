#!/usr/bin/env python3
"""
build_model_benchmarks.py — Benchmark engine: model vs model per ligă și piață.
================================================================================
Compară automat 6 modele de predicție pe datele din training_features.json:

  1. league_baseline  — rată de bază per ligă (referință minimă)
  2. team_form_blend  — 40% ligă + 60% formă echipă (5 meciuri)
  3. poisson_simple   — matrice Poisson (fără corecție Dixon-Coles)
  4. poisson_dc       — Poisson + corecție Dixon-Coles (rho=-0.08)
  5. elo_logit        — ELO walk-forward → lambda estimate → Poisson full
  6. ensemble         — medie ponderată adaptatică a tuturor modelelor

Piețe:  home_win, draw, away_win, over15, over25, under35, btts
Metrici: Brier, log_loss, ECE, ROI%, Yield%, max_drawdown, n_bets, profit, RPS (1X2)

Walk-forward split: primele 70% rânduri (sorted by date) = referință ELO.
                    ultimele 30% = set de validare (test).

Proxy odds pentru ROI: odds_book = 1 / (league_prob * 0.93) — marjă 7%.
Bet trigger: model_prob > 1/odds_book (EV pozitiv).

Output: data/model_benchmarks.json
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from analytics_core import (
    EloConfig, EloRatings,
    brier_binary, expected_calibration_error,
    log_loss_binary, quality_grade, safe_float,
    poisson_market_probabilities, clamp,
)

# ─── Constante ────────────────────────────────────────────────────────────────

DATA_DIR       = Path("data")
SPLIT_RATIO    = 0.70          # primele 70% date → train/ELO warmup
MIN_MATCHES    = 3             # minim meciuri istoric echipă pentru a folosi form
VIG_FACTOR     = 0.93          # factor marjă bookmaker pentru proxy odds
MIN_BET_EDGE   = 0.002         # EV minim pentru a număra parierea în backtest
POISSON_MAX_G  = 7             # goluri maxime în matricea Poisson
ELO_K          = 28.0
ELO_HOME_ADV   = 58.0

MARKETS: List[Tuple[str, str, str, str]] = [
    # (market_key, target_col, league_rate_col, label_ro)
    ("home_win", "target_home_win",  "league_home_win_rate", "Victorie Gazdă"),
    ("draw",     "target_draw",      "league_draw_rate",     "Egal"),
    ("away_win", "target_away_win",  "league_away_win_rate", "Victorie Oaspete"),
    ("over15",   "target_over_15",   "league_over15_rate",   "Peste 1.5G"),
    ("over25",   "target_over_25",   "league_over25_rate",   "Peste 2.5G"),
    ("under35",  "target_under_35",  "league_under35_rate",  "Sub 3.5G"),
    ("btts",     "target_btts_yes",  "league_btts_rate",     "Ambele Marchează"),
]

# Mapping market_key → cheia din poisson_market_probabilities()
POISSON_KEY: Dict[str, str] = {
    "home_win": "home_win",
    "draw":     "draw",
    "away_win": "away_win",
    "over15":   "over15",
    "over25":   "over25",
    "under35":  "under35",
    "btts":     "btts",
}

MODEL_NAMES = [
    "league_baseline",
    "team_form_blend",
    "poisson_simple",
    "poisson_dc",
    "elo_logit",
    "ensemble",
]

# Ponderi ensemble (vor fi normalizate)
ENSEMBLE_WEIGHTS = {
    "league_baseline": 0.10,
    "team_form_blend": 0.20,
    "poisson_simple":  0.20,
    "poisson_dc":      0.25,
    "elo_logit":       0.25,
}

# ─── Helpers I/O ──────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def parse_date(s: Any) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None

# ─── Estimare lambda Poisson din features ─────────────────────────────────────

def estimate_lambdas(row: Dict, use_elo: bool = False,
                     home_elo: float = 1500.0, away_elo: float = 1500.0) -> Tuple[float, float]:
    """
    Estimează (lambda_home, lambda_away) pentru modelele Poisson.
    Dacă use_elo=True, ajustează lambdele folosind diferența ELO.
    """
    league_avg = safe_float(row.get("league_avg_goals"), 2.65)
    # fallback rezonabil dacă lipsesc datele de formă
    base_h = league_avg * 0.55
    base_a = league_avg * 0.45

    h_match = safe_float(row.get("home_matches_pre"), 0)
    a_match = safe_float(row.get("away_matches_pre"), 0)

    if h_match >= MIN_MATCHES:
        h_for   = safe_float(row.get("home_goals_for_avg_5"),
                             safe_float(row.get("home_goals_for_avg_3"), base_h))
        h_aga   = safe_float(row.get("home_goals_against_avg_5"),
                             safe_float(row.get("home_goals_against_avg_3"), base_a))
    else:
        h_for, h_aga = base_h, base_a

    if a_match >= MIN_MATCHES:
        a_for   = safe_float(row.get("away_goals_for_avg_5"),
                             safe_float(row.get("away_goals_for_avg_3"), base_a))
        a_aga   = safe_float(row.get("away_goals_against_avg_5"),
                             safe_float(row.get("away_goals_against_avg_3"), base_h))
    else:
        a_for, a_aga = base_a, base_h

    # Dixon-Robinson style:
    # lambda_home = attack_home * defense_away / league_avg_attack
    lg_attack = clamp(league_avg / 2.0, 0.5, 3.0)
    lh = clamp((h_for * a_aga) / max(lg_attack, 0.3), 0.4, 5.0)
    la = clamp((a_for * h_aga) / max(lg_attack, 0.3), 0.3, 4.5)

    if use_elo:
        # ELO diff → scală multiplicativă pentru lambdele relative
        elo_diff = (home_elo - away_elo + ELO_HOME_ADV) / 400.0
        # Factorul ajustează raportul home/away fără a schimba suma totală
        boost = clamp(elo_diff * 0.4, -0.35, 0.45)
        total = lh + la
        lh_adj = clamp(total * (0.5 + boost), 0.4, 5.0)
        la_adj = clamp(total - lh_adj, 0.3, 4.5)
        return lh_adj, la_adj

    return lh, la


# ─── Modele individuale ────────────────────────────────────────────────────────

def predict_league_baseline(row: Dict, league_col: str) -> float:
    """Model 1: rata de bază a ligii."""
    raw = safe_float(row.get(league_col), -1.0)
    if raw < 0:
        return 0.5
    # unele coloane sunt deja fracție, altele procente
    return clamp(raw / 100.0 if raw > 1.5 else raw, 0.01, 0.99)


def predict_team_form_blend(row: Dict, market_key: str, league_col: str) -> float:
    """Model 2: blend 40% ligă + 60% formă echipă (5 meciuri)."""
    league_p = predict_league_baseline(row, league_col)

    form_col_map = {
        "home_win":  ("home_home_share_5",  None),
        "away_win":  ("away_home_share_5",  None),  # share of wins as away (inverted)
        "over25":    ("home_over25_rate_5",  "away_over25_rate_5"),
        "under35":   ("home_under35_rate_5", "away_under35_rate_5"),
        "btts":      ("home_btts_rate_5",    "away_btts_rate_5"),
        "over15":    ("home_over25_rate_5",  "away_over25_rate_5"),  # proxy
        "draw":      (None, None),
    }

    h_col, a_col = form_col_map.get(market_key, (None, None))
    h_n = safe_float(row.get("home_matches_pre"), 0)
    a_n = safe_float(row.get("away_matches_pre"), 0)

    parts, weights = [], []

    if h_col and h_n >= MIN_MATCHES:
        v = safe_float(row.get(h_col), -1.0)
        if 0.0 <= v <= 1.0:
            parts.append(v); weights.append(1.0)
        elif 1.0 < v <= 100.0:
            parts.append(v / 100.0); weights.append(1.0)

    if a_col and a_n >= MIN_MATCHES:
        v = safe_float(row.get(a_col), -1.0)
        if 0.0 <= v <= 1.0:
            parts.append(v); weights.append(1.0)
        elif 1.0 < v <= 100.0:
            parts.append(v / 100.0); weights.append(1.0)

    # Ajustare specială away_win: (1 - home_share_5) al echipei oaspete
    if market_key == "away_win" and a_n >= MIN_MATCHES:
        v = safe_float(row.get("away_home_share_5"), -1.0)
        if v < 0:
            v = safe_float(row.get("away_win_rate_3", row.get("away_win_rate_5")), -1.0) / 100.0
        if 0.0 <= v <= 1.0:
            parts = [v]; weights = [1.0]

    if not parts:
        return league_p

    form_p = sum(p * w for p, w in zip(parts, weights)) / sum(weights)
    blended = 0.40 * league_p + 0.60 * form_p
    return clamp(blended, 0.01, 0.99)


def predict_poisson(row: Dict, market_key: str, use_dc: bool = False) -> float:
    """Model 3/4: Poisson simplu sau cu corecție Dixon-Coles."""
    lh, la = estimate_lambdas(row)
    rho = -0.08 if use_dc else None
    probs = poisson_market_probabilities(lh, la, max_goals=POISSON_MAX_G, rho=rho)
    p = safe_float(probs.get(POISSON_KEY.get(market_key, market_key)), 0.5)
    return clamp(p, 0.01, 0.99)


def predict_elo_logit(row: Dict, market_key: str,
                      home_elo: float, away_elo: float) -> float:
    """Model 5: ELO walk-forward → lambda ajustate → Poisson complet."""
    lh, la = estimate_lambdas(row, use_elo=True,
                               home_elo=home_elo, away_elo=away_elo)
    probs = poisson_market_probabilities(lh, la, max_goals=POISSON_MAX_G, rho=-0.05)
    p = safe_float(probs.get(POISSON_KEY.get(market_key, market_key)), 0.5)
    return clamp(p, 0.01, 0.99)


# ─── Metrici ──────────────────────────────────────────────────────────────────

def ranked_probability_score(y_true_1x2: List[int],
                              p_home: List[float],
                              p_draw: List[float],
                              p_away: List[float]) -> Optional[float]:
    """
    Ranked Probability Score pentru 1X2 (Epstein 1969).
    result: 0=home_win, 1=draw, 2=away_win
    """
    if not y_true_1x2:
        return None
    total = 0.0
    for y, ph, pd, pa in zip(y_true_1x2, p_home, p_draw, p_away):
        # cumulative probs
        f1 = ph
        f2 = ph + pd
        o1 = 1.0 if y == 0 else 0.0
        o2 = 1.0 if y in (0, 1) else 0.0
        total += (f1 - o1) ** 2 + (f2 - o2) ** 2
    return total / (2 * len(y_true_1x2))


def compute_roi_stats(bets: List[Tuple[float, int, float]]) -> Dict:
    """
    bets: [(model_prob, outcome, book_odds), ...]
    Returnează dict cu roi_pct, yield_pct, max_drawdown, profit, n_bets, winrate.
    """
    if not bets:
        return {"n_bets": 0, "roi_pct": 0.0, "yield_pct": 0.0,
                "max_drawdown": 0.0, "profit": 0.0, "winrate": 0.0}

    n = len(bets)
    wins = sum(1 for _, o, _ in bets if o == 1)
    profit = sum((odds - 1.0) if o == 1 else -1.0
                 for _, o, odds in bets)

    # Max drawdown (unitary stakes)
    bankroll = 0.0
    peak = 0.0
    max_dd = 0.0
    for _, o, odds in bets:
        bankroll += (odds - 1.0) if o == 1 else -1.0
        peak = max(peak, bankroll)
        max_dd = max(max_dd, peak - bankroll)

    return {
        "n_bets":       n,
        "roi_pct":      round(profit / n * 100.0, 2),
        "yield_pct":    round(profit / n * 100.0, 2),  # la stake=1, ROI==Yield
        "max_drawdown": round(max_dd, 2),
        "profit":       round(profit, 3),
        "winrate":      round(wins / n * 100.0, 2),
    }


def aggregate_metrics(probs: List[float], outcomes: List[int],
                       bets: List[Tuple[float, int, float]]) -> Dict:
    if len(probs) < 2:
        return {"n": len(probs), "credible": False}
    brier   = brier_binary(outcomes, probs)
    logloss = log_loss_binary(outcomes, probs)
    ece     = expected_calibration_error(outcomes, probs, bins=8, min_bin_size=3)
    roi     = compute_roi_stats(bets)

    score = 50.0
    if brier is not None:
        score += max(0.0, (0.28 - brier) / 0.28 * 25.0)
    if ece is not None:
        score += max(0.0, (0.12 - ece) / 0.12 * 25.0)
    score = clamp(score, 0.0, 100.0)

    return {
        "n":            len(probs),
        "credible":     len(probs) >= 50,
        "brier":        round(brier, 4) if brier is not None else None,
        "log_loss":     round(logloss, 4) if logloss is not None else None,
        "ece":          round(ece, 4) if ece is not None else None,
        "score":        round(score, 1),
        "grade":        quality_grade(score),
        **roi,
    }


# ─── ELO walk-forward ─────────────────────────────────────────────────────────

def build_elo_walk_forward(rows_sorted: List[Dict]) -> Dict[str, Tuple[float, float]]:
    """
    Procesează TOATE rândurile (sortate după dată) și returnează un dict:
    {event_id: (home_elo_pre, away_elo_pre)}
    Ratingurile sunt actualizate după fiecare meci (inclusiv train set).
    """
    cfg = EloConfig(k_factor=ELO_K, home_advantage=ELO_HOME_ADV)
    elo = EloRatings(config=cfg)
    snapshots: Dict[str, Tuple[float, float]] = {}

    for row in rows_sorted:
        hid = str(row.get("home_team") or row.get("home_team_id") or "?_h")
        aid = str(row.get("away_team") or row.get("away_team_id") or "?_a")
        eid = str(row.get("event_id") or "")

        h_pre = elo.rating(hid)
        a_pre = elo.rating(aid)
        snapshots[eid] = (h_pre, a_pre)

        # Actualizare ELO (necesită scoruri reale → le derivăm din target_result_1x2)
        result = str(row.get("target_result_1x2") or "").lower()
        if result in ("1", "home", "home_win", "h"):
            hg, ag = 2, 0
        elif result in ("x", "draw", "d", "0"):
            hg, ag = 1, 1
        elif result in ("2", "away", "away_win", "a"):
            hg, ag = 0, 2
        else:
            # Derivă din target columns
            hw = safe_float(row.get("target_home_win"), -1.0)
            aw = safe_float(row.get("target_away_win"), -1.0)
            if hw == 1:    hg, ag = 2, 0
            elif aw == 1:  hg, ag = 0, 2
            else:          hg, ag = 1, 1

        elo.update(hid, aid, hg, ag)

    return snapshots


# ─── Predictor combinat ────────────────────────────────────────────────────────

def run_all_predictions(test_rows: List[Dict],
                        elo_snapshots: Dict[str, Tuple[float, float]]
                        ) -> Dict[str, Dict[str, List]]:
    """
    Returnează: {model_name: {market_key: [(prob, outcome, book_odds), ...]}}
    """
    results: Dict[str, Dict[str, List]] = {
        m: {mk: [] for mk, *_ in MARKETS}
        for m in MODEL_NAMES
    }

    for row in test_rows:
        eid = str(row.get("event_id") or "")
        h_elo, a_elo = elo_snapshots.get(eid, (1500.0, 1500.0))

        for mkey, tcol, lcol, _ in MARKETS:
            outcome_raw = safe_float(row.get(tcol), -1.0)
            if outcome_raw < 0:
                continue  # target lipsă
            outcome = int(round(outcome_raw))

            league_p = predict_league_baseline(row, lcol)
            book_odds = clamp(1.0 / max(0.02, league_p * VIG_FACTOR), 1.01, 50.0)

            preds: Dict[str, float] = {
                "league_baseline": league_p,
                "team_form_blend": predict_team_form_blend(row, mkey, lcol),
                "poisson_simple":  predict_poisson(row, mkey, use_dc=False),
                "poisson_dc":      predict_poisson(row, mkey, use_dc=True),
                "elo_logit":       predict_elo_logit(row, mkey, h_elo, a_elo),
            }

            # Ensemble — medie ponderată normalizată
            wsum = sum(ENSEMBLE_WEIGHTS[m] * preds[m] for m in ENSEMBLE_WEIGHTS)
            wnorm = sum(ENSEMBLE_WEIGHTS.values())
            preds["ensemble"] = clamp(wsum / wnorm, 0.01, 0.99)

            for model_name in MODEL_NAMES:
                p = preds[model_name]
                # Includem în backtest dacă EV > MIN_BET_EDGE
                ev = p * (book_odds - 1.0) - (1.0 - p)
                bet_tuple = (p, outcome, book_odds) if ev > MIN_BET_EDGE else None
                entry = (p, outcome, bet_tuple)
                results[model_name][mkey].append(entry)

    return results


# ─── Analiza per ligă ──────────────────────────────────────────────────────────

def compute_per_league(test_rows: List[Dict],
                       elo_snapshots: Dict[str, Tuple[float, float]]
                       ) -> Dict[str, Dict]:
    """
    Returnează per ligă, pentru modelul `ensemble` (cel mai relevant practic):
    {league: {market_key: metrics}}
    """
    league_data: Dict[str, Dict[str, List]] = defaultdict(lambda: {mk: [] for mk, *_ in MARKETS})

    for row in test_rows:
        league = str(row.get("league") or "unknown")
        eid    = str(row.get("event_id") or "")
        h_elo, a_elo = elo_snapshots.get(eid, (1500.0, 1500.0))

        for mkey, tcol, lcol, _ in MARKETS:
            outcome_raw = safe_float(row.get(tcol), -1.0)
            if outcome_raw < 0:
                continue
            outcome = int(round(outcome_raw))

            league_p  = predict_league_baseline(row, lcol)
            book_odds = clamp(1.0 / max(0.02, league_p * VIG_FACTOR), 1.01, 50.0)

            # Ensemble prediction
            preds = {
                "league_baseline": league_p,
                "team_form_blend": predict_team_form_blend(row, mkey, lcol),
                "poisson_simple":  predict_poisson(row, mkey, use_dc=False),
                "poisson_dc":      predict_poisson(row, mkey, use_dc=True),
                "elo_logit":       predict_elo_logit(row, mkey, h_elo, a_elo),
            }
            wsum  = sum(ENSEMBLE_WEIGHTS[m] * preds[m] for m in ENSEMBLE_WEIGHTS)
            wnorm = sum(ENSEMBLE_WEIGHTS.values())
            p_ens = clamp(wsum / wnorm, 0.01, 0.99)
            ev    = p_ens * (book_odds - 1.0) - (1.0 - p_ens)
            league_data[league][mkey].append(
                (p_ens, outcome, (p_ens, outcome, book_odds) if ev > MIN_BET_EDGE else None)
            )

    out: Dict[str, Dict] = {}
    for league, markets in league_data.items():
        league_out: Dict[str, Any] = {}
        for mkey, entries in markets.items():
            probs    = [p for p, _, _ in entries]
            outcomes = [o for _, o, _ in entries]
            bets     = [b for _, _, b in entries if b is not None]
            league_out[mkey] = aggregate_metrics(probs, outcomes, bets)
        # aggregat global ligă
        all_p = [p for mkey, entries in markets.items() for p, _, _ in entries]
        all_o = [o for mkey, entries in markets.items() for _, o, _ in entries]
        all_b = [b for mkey, entries in markets.items() for _, _, b in entries if b]
        league_out["_all"] = aggregate_metrics(all_p, all_o, all_b)
        out[league] = league_out

    return out


# ─── RPS per model (1X2) ──────────────────────────────────────────────────────

def compute_rps_per_model(results: Dict[str, Dict[str, List]],
                           test_rows: List[Dict]) -> Dict[str, float]:
    """Calculează RPS (Ranked Probability Score) per model pentru piața 1X2."""
    rps_out: Dict[str, float] = {}

    for model_name in MODEL_NAMES:
        rps_rows = []
        for row in test_rows:
            hw = safe_float(row.get("target_home_win"), -1.0)
            dw = safe_float(row.get("target_draw"),     -1.0)
            aw = safe_float(row.get("target_away_win"), -1.0)
            if hw < 0 or dw < 0 or aw < 0:
                continue
            result = int(hw) * 0 + int(dw) * 1 + int(aw) * 2  # 0=H,1=D,2=A

            eid = str(row.get("event_id") or "")
            # extrage prob din results dict
            # — rebuild rapid pentru 1X2
            ph = next((p for p, _, _ in results[model_name]["home_win"]
                       if str(row.get("event_id","")) == eid), None)
            if ph is None:
                continue
            pd_ = next((p for p, _, _ in results[model_name]["draw"]
                        if str(row.get("event_id","")) == eid), 0.33)
            pa  = next((p for p, _, _ in results[model_name]["away_win"]
                        if str(row.get("event_id","")) == eid), 0.33)
            rps_rows.append((result, ph, pd_, pa))

        if rps_rows:
            rps_val = ranked_probability_score(
                [r for r, *_ in rps_rows],
                [ph for _, ph, *_ in rps_rows],
                [pd for _, _, pd, _ in rps_rows],
                [pa for _, _, _, pa in rps_rows],
            )
            if rps_val is not None:
                rps_out[model_name] = round(rps_val, 5)

    return rps_out


# ─── Clasament modele ─────────────────────────────────────────────────────────

def rank_models(by_market: Dict[str, Dict[str, Dict]]) -> List[Dict]:
    """
    Creează un clasament global al modelelor după scor mediu ponderat.
    Normalizat pe piețele cu >= 50 observații.
    """
    model_scores: Dict[str, List[float]] = defaultdict(list)
    for mkey, model_dict in by_market.items():
        for mname, stats in model_dict.items():
            if stats.get("credible") and stats.get("score") is not None:
                model_scores[mname].append(stats["score"])

    ranking = []
    for mname in MODEL_NAMES:
        scores = model_scores.get(mname, [])
        avg = round(sum(scores) / len(scores), 1) if scores else 0.0
        ranking.append({
            "model": mname,
            "avg_score": avg,
            "grade":     quality_grade(avg),
            "n_markets_credible": len(scores),
        })
    ranking.sort(key=lambda x: x["avg_score"], reverse=True)
    for i, r in enumerate(ranking, 1):
        r["rank"] = i
    return ranking


# ─── REAL BACKTEST din recommendation_log.json ────────────────────────────────

def real_backtest_from_log(log_path: Path) -> Dict:
    """
    Backtest real folosind cotele și rezultatele din recommendation_log.json.
    Nu folosește proxy odds — folosește câmpul `odds` direct din API.

    Returnează structura:
    {
        "by_market": {market_key: {n, roi_pct, profit, winrate, avg_odds, max_drawdown, ...}},
        "by_league": {league: {n, roi_pct, ...}},
        "by_edge_bucket": {"0-5%": {...}, "5-10%": {...}, ...},
        "overall": {...},
        "n_total": int,
        "warnings": [str],
    }
    """
    raw = load_json(log_path, [])
    entries = raw if isinstance(raw, list) else raw.get("log", [])
    settled = [
        e for e in entries
        if isinstance(e, dict)
        and e.get("won") is not None
        and safe_float(e.get("odds"), 0.0) > 1.01
    ]

    if not settled:
        return {"n_total": 0, "warnings": ["Niciun pariu finalizat cu cote reale în log."]}

    def _stats(bets: List[Dict]) -> Dict:
        if not bets:
            return {"n": 0}
        n     = len(bets)
        wins  = sum(1 for b in bets if b["won"])
        odds_list = [b["odds"] for b in bets]
        profit = sum((b["odds"] - 1.0) if b["won"] else -1.0 for b in bets)

        # Max drawdown
        bankroll, peak, max_dd = 0.0, 0.0, 0.0
        for b in bets:
            bankroll += (b["odds"] - 1.0) if b["won"] else -1.0
            peak = max(peak, bankroll)
            max_dd = max(max_dd, peak - bankroll)

        return {
            "n":            n,
            "n_wins":       wins,
            "winrate":      round(wins / n * 100, 2),
            "roi_pct":      round(profit / n * 100, 2),
            "profit":       round(profit, 3),
            "avg_odds":     round(sum(odds_list) / n, 3),
            "max_drawdown": round(max_dd, 2),
            "avg_edge_pct": round(sum(safe_float(b.get("edge_pct"), 0) for b in bets) / n, 2),
        }

    # Structurare pe piețe și ligi
    by_market:      Dict[str, List] = defaultdict(list)
    by_league:      Dict[str, List] = defaultdict(list)
    by_edge_bucket: Dict[str, List] = defaultdict(list)

    for e in settled:
        bet = {
            "won":      bool(e["won"]),
            "odds":     safe_float(e["odds"], 1.0),
            "edge_pct": safe_float(e.get("edge_pct"), 0.0),
            "model_prob": safe_float(e.get("adjusted_prob") or e.get("model_prob"), 0.0),
        }
        mkey   = str(e.get("market_key") or e.get("market") or "unknown")
        league = str(e.get("league") or "unknown")
        edge   = bet["edge_pct"]

        by_market[mkey].append(bet)
        by_league[league].append(bet)

        if edge < 5:   bucket = "0-5%"
        elif edge < 10: bucket = "5-10%"
        elif edge < 15: bucket = "10-15%"
        else:           bucket = "15%+"
        by_edge_bucket[bucket].append(bet)

    # Warnings
    warnings = []
    if len(settled) < 100:
        warnings.append(f"Doar {len(settled)} pariuri finalizate — statistici cu credibilitate redusă.")
    mkts_few = [m for m, b in by_market.items() if len(b) < 20]
    if mkts_few:
        warnings.append(f"Piețe cu <20 pariuri (nesemnificativ statistic): {', '.join(mkts_few)}")

    # Bucket per piata × edge
    by_market_bucket: Dict[str, Dict[str, List]] = defaultdict(lambda: defaultdict(list))
    for e in settled:
        mkey  = str(e.get("market_key") or e.get("market") or "unknown")
        edge  = safe_float(e.get("edge_pct"), 0.0)
        bet   = {
            "won":      bool(e["won"]),
            "odds":     safe_float(e["odds"], 1.0),
            "edge_pct": edge,
            "model_prob": safe_float(e.get("adjusted_prob") or e.get("model_prob"), 0.0),
        }
        if edge < 5:    bk = "0-5%"
        elif edge < 10: bk = "5-10%"
        elif edge < 15: bk = "10-15%"
        else:           bk = "15%+"
        by_market_bucket[mkey][bk].append(bet)

    mkt_bucket_stats: Dict[str, Dict] = {}
    for mkey, buckets in by_market_bucket.items():
        mkt_bucket_stats[mkey] = {
            bk: _stats(buckets[bk])
            for bk in ["0-5%","5-10%","10-15%","15%+"] if bk in buckets
        }

    return {
        "n_total":          len(settled),
        "overall":          _stats(settled),
        "by_market":        {k: _stats(v) for k, v in sorted(by_market.items())},
        "by_league":        {k: _stats(v) for k, v in sorted(by_league.items(), key=lambda x: -len(x[1]))},
        "by_edge_bucket":   {k: _stats(by_edge_bucket[k]) for k in ["0-5%","5-10%","10-15%","15%+"] if k in by_edge_bucket},
        "by_market_bucket": mkt_bucket_stats,
        "warnings":         warnings,
    }


# ─── PRAGURI DINAMICE per piată ───────────────────────────────────────────────

EDGE_BUCKETS = [
    ("0-5%",   0.0,  5.0),
    ("5-10%",  5.0, 10.0),
    ("10-15%", 10.0, 15.0),
    ("15%+",   15.0, 999.0),
]

def compute_dynamic_thresholds(real_bt: Dict) -> Dict:
    """
    Calculeaza pragul minim de edge per piata din backtestul real.
    Compara cu pragurile anterioare si logeaza modificarile.
    """
    # Citeste pragurile anterioare daca exista
    prev_path = DATA_DIR / "model_benchmarks.json"
    prev_thresholds: Dict = {}
    if prev_path.exists():
        try:
            prev = json.loads(prev_path.read_text(encoding="utf-8"))
            prev_thresholds = prev.get("dynamic_thresholds", {})
        except Exception:
            pass
    """
    Calculează pragul minim de edge per piată din backtestul real.
    Logica: primul bucket (de jos) cu ROI >= 0% și n >= 10 devine pragul.
    Dacă niciun bucket nu e profitabil → piața primește flag disabled=True.

    Output:
    {
      "market_key": {
        "min_edge": float,
        "disabled": bool,
        "basis": str,   # bucketul care a determinat pragul
        "roi_at_threshold": float
      }
    }
    """
    thresholds: Dict = {}
    by_mkt    = real_bt.get("by_market", {})
    by_bucket = real_bt.get("by_edge_bucket", {})

    markets = list(by_mkt.keys())
    by_mkt_bucket = real_bt.get("by_market_bucket", {})

    for mkt in markets:
        # Folosim bucket-urile per piata daca exista, altfel global
        mkt_buckets = by_mkt_bucket.get(mkt, by_bucket)
        # Caută primul bucket profitabil de jos în sus
        found = None
        for bname, bmin, bmax in EDGE_BUCKETS:
            bs = mkt_buckets.get(bname, {})
            if bs.get("n", 0) < 5:
                # fallback la global dacă date insuficiente
                bs = by_bucket.get(bname, {})
            if bs.get("n", 0) < 5:
                continue
            if bs.get("roi_pct", -999) >= 0:
                found = (bname, bmin, bs["roi_pct"])
                break

        # Bootstrap: dacă bucketul profitabil are n < BOOTSTRAP_MIN_N, pragul
        # data-driven e statistic fragil. Folosim un prag mai permisiv temporar
        # ca să acumulăm date — app.js citește bootstrap_min_edge și îl preferă
        # până când n devine suficient, după care revine automat la min_edge.
        BOOTSTRAP_MIN_N = 20
        BOOTSTRAP_THRESHOLDS = {
            "over15":  10.0,
            "under35": 10.0,
            "over25":   5.0,
            "btts":     3.0,
        }

        if found:
            n_at_threshold = mkt_buckets.get(found[0], {}).get("n", 0)
            bootstrap_edge = None
            if n_at_threshold < BOOTSTRAP_MIN_N and mkt in BOOTSTRAP_THRESHOLDS:
                bt_edge = BOOTSTRAP_THRESHOLDS[mkt]
                if bt_edge < found[1]:
                    bootstrap_edge = bt_edge
            thresholds[mkt] = {
                "min_edge":            found[1],
                "disabled":            False,
                "basis":               found[0],
                "roi_at_threshold":    found[2],
                "bootstrap_min_edge":  bootstrap_edge,
                "bootstrap_n":         n_at_threshold,
                "bootstrap_target_n":  BOOTSTRAP_MIN_N,
            }
        else:
            thresholds[mkt] = {
                "min_edge":            999.0,
                "disabled":            True,
                "basis":               "none_profitable",
                "roi_at_threshold":    None,
                "bootstrap_min_edge":  None,
                "bootstrap_n":         0,
                "bootstrap_target_n":  BOOTSTRAP_MIN_N,
            }

    # Exceptie over15: prag maxim 10% (la 15%+ exista prea putine sample-uri)
    if "over15" in thresholds and not thresholds["over15"].get("disabled"):
        if thresholds["over15"]["min_edge"] > 10.0:
            thresholds["over15"]["min_edge"]    = 10.0
            thresholds["over15"]["basis"]       = "capped_at_10pct"
            thresholds["over15"]["cap_warning"] = True

    # Safety floors: nu lăsăm pragurile dinamice să coboare sub zona care a fost stabilă.
    # Fix critic pentru Under 3.5: bucketul 5-10% are ROI marginal și a produs flood de selecții.
    MARKET_EDGE_FLOORS = {
        "under35": 15.0,
        "over15": 10.0,
        "over25": 5.0,
        "btts": 5.0,
    }
    for _mkt, _floor in MARKET_EDGE_FLOORS.items():
        if _mkt in thresholds and not thresholds[_mkt].get("disabled"):
            if float(thresholds[_mkt].get("min_edge") or 0) < _floor:
                thresholds[_mkt]["min_edge"] = _floor
                thresholds[_mkt]["safety_floor"] = True
                thresholds[_mkt]["safety_floor_reason"] = f"min_edge forced to {_floor}% to avoid market flood / weak edge bucket"
                if thresholds[_mkt].get("bootstrap_min_edge") is not None and float(thresholds[_mkt].get("bootstrap_min_edge") or 0) < _floor:
                    thresholds[_mkt]["bootstrap_min_edge"] = None

    # Detecteaza modificari fata de pragurile anterioare
    changes: List[Dict] = []
    for mkt, t in thresholds.items():
        prev = prev_thresholds.get(mkt, {})
        prev_edge     = prev.get("min_edge")
        prev_disabled = prev.get("disabled", False)
        curr_edge     = t["min_edge"]
        curr_disabled = t["disabled"]

        if prev_edge is None:
            continue  # prima rulare, nu e o modificare

        if curr_disabled and not prev_disabled:
            changes.append({
                "market":    mkt,
                "type":      "disabled",
                "prev_edge": prev_edge,
                "new_edge":  999.0,
                "message":   f"{mkt}: dezactivat (niciun bucket profitabil)",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif not curr_disabled and prev_disabled:
            changes.append({
                "market":    mkt,
                "type":      "re_enabled",
                "prev_edge": prev_edge,
                "new_edge":  curr_edge,
                "message":   f"{mkt}: reactivat, prag nou = {curr_edge}% (ROI {t['roi_at_threshold']:+.1f}%)",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif abs(curr_edge - prev_edge) >= 1.0:
            direction = "ridicat" if curr_edge > prev_edge else "coborat"
            changes.append({
                "market":    mkt,
                "type":      "threshold_change",
                "prev_edge": prev_edge,
                "new_edge":  curr_edge,
                "message":   f"{mkt}: prag {direction} {prev_edge}% -> {curr_edge}% (ROI {t.get('roi_at_threshold', 0) or 0:+.1f}%)",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        t["prev_edge"]   = prev_edge
        t["changed"]     = abs(curr_edge - prev_edge) >= 1.0 or (curr_disabled != prev_disabled)

    # Pastreaza istoricul modificarilor (max 50 intrari)
    history_path = DATA_DIR / "threshold_history.json"
    history: List[Dict] = []
    if history_path.exists():
        try:
            history = json.loads(history_path.read_text(encoding="utf-8"))
        except Exception:
            history = []
    history = (history + changes)[-50:]
    if changes:
        history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
        for c in changes:
            print(f"  ** MODIFICARE PRAG: {c['message']}")

    for mkt, t in thresholds.items():
        t["recent_changes"] = [c for c in changes if c["market"] == mkt]

    return thresholds


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== BUILD MODEL BENCHMARKS v1 ===")

    # 1. Încarcă date
    features: List[Dict] = load_json(DATA_DIR / "training_features.json", [])
    if not isinstance(features, list):
        print("  EROARE: training_features.json trebuie să fie o listă de dict.")
        return

    rows = [r for r in features if isinstance(r, dict)]
    # Sortare cronologică
    rows.sort(key=lambda r: str(r.get("date") or "0000-00-00"))
    print(f"  Rânduri totale: {len(rows)}")

    if len(rows) < 100:
        print("  EROARE: Date insuficiente (<100 rânduri) pentru benchmark.")
        return

    # 2. Split 70/30
    split_idx  = int(len(rows) * SPLIT_RATIO)
    train_rows = rows[:split_idx]
    test_rows  = rows[split_idx:]
    print(f"  Train: {len(train_rows)} | Test: {len(test_rows)}")

    # 3. ELO walk-forward pe toate datele
    print("  Construiesc ratinguri ELO walk-forward...")
    elo_snapshots = build_elo_walk_forward(rows)

    # 4. Generare predicții pe test set
    print("  Generez predicții pentru toate modelele...")
    results = run_all_predictions(test_rows, elo_snapshots)

    # 5. Metrici per (model, piață)
    print("  Calculez metrici per model × piață...")
    by_market: Dict[str, Dict[str, Dict]] = {}

    for mkey, _, _, label in MARKETS:
        by_market[mkey] = {}
        for mname in MODEL_NAMES:
            entries = results[mname].get(mkey, [])
            probs    = [p for p, _, _  in entries]
            outcomes = [o for _, o, _  in entries]
            bets     = [b for _, _, b  in entries if b is not None]
            by_market[mkey][mname] = aggregate_metrics(probs, outcomes, bets)

    # 6. RPS 1X2
    print("  Calculez RPS 1X2...")
    rps_per_model = compute_rps_per_model(results, test_rows)

    # 7. Metrici per ligă (ensemble)
    print("  Calculez metrici per ligă (ensemble model)...")
    per_league = compute_per_league(test_rows, elo_snapshots)

    # 8. Clasament global
    ranking = rank_models(by_market)

    # 9. Recomandări automate
    recommendations = _build_recommendations(ranking, by_market, rps_per_model)

    # 10. Structurare output
    # 10b. Real backtest din log cu cote reale
    print("  Calculez real backtest din recommendation_log.json...")
    real_bt = real_backtest_from_log(DATA_DIR / "recommendation_log.json")
    dynamic_thresholds = compute_dynamic_thresholds(real_bt) if real_bt.get("n_total", 0) > 50 else {}
    print(f"  Praguri dinamice calculate: {json.dumps(dynamic_thresholds, indent=None)}")
    if real_bt.get("n_total", 0):
        rb = real_bt["overall"]
        print(f"  Real backtest: {real_bt['n_total']} pariuri | ROI={rb.get('roi_pct',0):+.2f}% | "
              f"profit={rb.get('profit',0):+.2f}u | winrate={rb.get('winrate',0):.1f}% | "
              f"avg_odds={rb.get('avg_odds',0):.2f} | max_dd={rb.get('max_drawdown',0):.2f}u")

    payload = {
        "updated_at":      datetime.now(timezone.utc).isoformat(),
        "version":         "v1",
        "data_source":     "training_features.json",
        "split_ratio":     SPLIT_RATIO,
        "n_train":         len(train_rows),
        "n_test":          len(test_rows),
        "vig_factor":      VIG_FACTOR,
        "min_bet_edge":    MIN_BET_EDGE,
        "models_tested":   MODEL_NAMES,
        "markets_tested":  [mkey for mkey, *_ in MARKETS],
        "market_labels":   {mkey: label for mkey, _, _, label in MARKETS},
        "ranking":         ranking,
        "by_market":       by_market,
        "rps_1x2":         rps_per_model,
        "per_league":      per_league,
        "recommendations": recommendations,
        "ui_summary": _build_ui_summary(ranking, by_market, rps_per_model),
        "real_backtest":       real_bt,
        "dynamic_thresholds":  dynamic_thresholds,
        "threshold_history":   history[-10:] if 'history' in dir() else [],
    }

    save_json(DATA_DIR / "model_benchmarks.json", payload)
    print(f"\n  Salvat → data/model_benchmarks.json")
    _print_summary(ranking, by_market, rps_per_model)


# ─── Print & UI helpers ───────────────────────────────────────────────────────

def _print_summary(ranking: List[Dict],
                   by_market: Dict,
                   rps: Dict) -> None:
    print("\n  ┌─ CLASAMENT MODELE ─────────────────────────────────────────┐")
    for r in ranking:
        print(f"  │  #{r['rank']} {r['model']:20s}  scor={r['avg_score']:5.1f}/100  "
              f"grade={r['grade']}  piețe={r['n_markets_credible']} │")
    print("  └────────────────────────────────────────────────────────────┘")

    print("\n  ┌─ BRIER SCORE per MODEL × PIATĂ ─────────────────────────────")
    header = f"  │ {'piata':10s}" + "".join(f" {m[:12]:>12s}" for m in MODEL_NAMES) + " │"
    print(header)
    for mkey, model_dict in sorted(by_market.items()):
        row_str = f"  │ {mkey:10s}"
        for mname in MODEL_NAMES:
            b = model_dict[mname].get("brier")
            row_str += f" {str(b) if b else 'N/A':>12s}"
        row_str += " │"
        print(row_str)
    print("  └────────────────────────────────────────────────────────────┘")

    if rps:
        print("\n  RPS 1X2: " + " | ".join(f"{m}: {v}" for m, v in rps.items()))


def _build_recommendations(ranking: List[Dict],
                            by_market: Dict,
                            rps: Dict) -> List[str]:
    recs = []
    if ranking:
        best = ranking[0]
        recs.append(f"Modelul cu scor global cel mai ridicat: {best['model']} "
                    f"({best['avg_score']}/100, grade {best['grade']}).")

    # Cel mai bun ROI per piață
    for mkey, model_dict in sorted(by_market.items()):
        best_roi = max(
            ((mname, d.get("roi_pct", -999)) for mname, d in model_dict.items()
             if d.get("credible") and d.get("n_bets", 0) >= 10),
            key=lambda x: x[1], default=(None, None)
        )
        if best_roi[0] and best_roi[1] and best_roi[1] > 3.0:
            recs.append(f"{mkey}: cel mai bun ROI = {best_roi[1]:+.1f}% "
                        f"cu modelul {best_roi[0]}.")

    # Piețe cu calibrare slabă la toate modelele
    for mkey, model_dict in sorted(by_market.items()):
        eces = [d.get("ece", 0.99) for d in model_dict.values()
                if d.get("credible") and d.get("ece") is not None]
        if eces and min(eces) > 0.12:
            recs.append(f"Piața {mkey}: calibrare problematică la toate modelele "
                        f"(ECE min = {min(eces):.3f}). Necesită recalibrare.")

    # RPS
    if rps:
        best_rps = min(rps.items(), key=lambda x: x[1])
        recs.append(f"RPS 1X2 cel mai bun: {best_rps[0]} (RPS={best_rps[1]:.4f}; "
                    f"mai mic = mai bun).")

    if not recs:
        recs.append("Benchmark completat. Rulează din nou după acumularea de date noi.")
    return recs[:8]


def _build_ui_summary(ranking: List[Dict],
                      by_market: Dict,
                      rps: Dict) -> Dict:
    """Date compacte pentru cardul UI din dashboard."""
    best_model = ranking[0]["model"] if ranking else "N/A"
    best_score = ranking[0]["avg_score"] if ranking else 0.0

    market_winners: Dict[str, str] = {}
    for mkey, model_dict in by_market.items():
        best = max(
            ((m, d.get("score", 0.0)) for m, d in model_dict.items() if d.get("credible")),
            key=lambda x: x[1], default=(None, 0.0)
        )
        if best[0]:
            market_winners[mkey] = best[0]

    return {
        "best_model":     best_model,
        "best_score":     best_score,
        "best_grade":     quality_grade(best_score),
        "market_winners": market_winners,
        "rps_winner":     min(rps.items(), key=lambda x: x[1])[0] if rps else None,
        "n_leagues":      0,  # va fi populat la runtime din per_league
    }


if __name__ == "__main__":
    main()

