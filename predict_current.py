#!/usr/bin/env python3
"""
predict_current.py — VEYRA Supreme Engine v5 | Inferență live multi-source, consensus + VIP shield
==========================================================================
Rulat după fetch_data.py. Produce data/ev_signals_v2.json.

Upgrade principal:
- construiește pentru meciurile curente aceleași familii de features ca trainingul v3, plus enrichment API v2;
- combină CatBoost calibrat cu piața no-vig, probabilitățile BSD/API și Poisson;
- aplică gating pe calitatea datelor, WFV AUC, ECE, acord între modele și EV/Kelly.
"""

from __future__ import annotations

import json
import math
import pickle
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

DATA_DIR = Path("data")
MODELS_DIR = Path("models")
WAREHOUSE = Path("data/warehouse")

TARGETS = {
    "home_win": {"odds_key": "odds_home", "pair": ["odds_home", "odds_draw", "odds_away"], "pair_idx": 0, "best_key": "homeWin", "label": "Home Win"},
    "draw":     {"odds_key": "odds_draw", "pair": ["odds_home", "odds_draw", "odds_away"], "pair_idx": 1, "best_key": "draw", "label": "Draw"},
    "away_win": {"odds_key": "odds_away", "pair": ["odds_home", "odds_draw", "odds_away"], "pair_idx": 2, "best_key": "awayWin", "label": "Away Win"},
    "btts":     {"odds_key": "odds_btts_yes", "pair": ["odds_btts_yes", "odds_btts_no"], "pair_idx": 0, "best_key": "btts", "label": "BTTS Yes"},
    "over15":   {"odds_key": "odds_over_15", "pair": ["odds_over_15", "odds_under_15"], "pair_idx": 0, "best_key": "over15", "label": "Over 1.5G"},
    "over25":   {"odds_key": "odds_over_25", "pair": ["odds_over_25", "odds_under_25"], "pair_idx": 0, "best_key": "over25", "label": "Over 2.5G"},
    "under35":  {"odds_key": "odds_under_35", "pair": ["odds_over_35", "odds_under_35"], "pair_idx": 1, "best_key": "under35", "label": "Under 3.5G"},
}

PROB_MIN_BY_MARKET = {
    "home_win": 0.46, "draw": 0.28, "away_win": 0.30,
    "btts": 0.48, "over15": 0.60, "over25": 0.48, "under35": 0.58,
}
EDGE_MIN_BY_MARKET = {
    "home_win": 3.0, "draw": 4.0, "away_win": 3.5,
    "btts": 2.8, "over15": 1.8, "over25": 2.8, "under35": 1.8,
}
EV_MIN_BY_MARKET = {
    "home_win": 0.4, "draw": 0.8, "away_win": 0.5,
    "btts": 0.3, "over15": 0.15, "over25": 0.35, "under35": 0.15,
}
ODDS_RANGE_BY_MARKET = {
    "home_win": (1.25, 4.50), "draw": (2.40, 5.50), "away_win": (1.25, 5.00),
    "btts": (1.35, 2.80), "over15": (1.12, 1.95), "over25": (1.45, 2.80), "under35": (1.12, 1.95),
}
CAT_FEATURES = ["league", "home_streak_type", "away_streak_type"]
KELLY_FRACTION = 0.25

try:
    from catboost import CatBoostClassifier, Pool
    import pandas as pd
except Exception:  # pragma: no cover
    CatBoostClassifier = None
    Pool = None
    pd = None

try:
    from feature_engineering import (
        load_warehouse, form_features, diff_features, h2h_features, xg_features,
        odds_features, context_features, stats_features, incidents_features, shotmap_features,
        build_league_baselines, elo_expected, _parse_dt, _f as fe_float,
        poisson_over, poisson_under, poisson_btts, poisson_1x2,
        ELO_START, ELO_K,
    )
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"feature_engineering.py nu poate fi importat: {exc}")


def _f(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def _i(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except Exception:
        return default


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def load_json(path: Path, default=None):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def save_json(path: Path, payload: Any):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def write_skip(reason: str):
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), "signals_count": 0, "signals": [], "status": "skipped", "reason": reason}
    save_json(DATA_DIR / "ev_signals_v2.json", payload)
    print(reason)


def no_vig_prob(odds_list: Iterable[Any]) -> List[Optional[float]]:
    odds_list = list(odds_list)
    valid = [(idx, _f(odd)) for idx, odd in enumerate(odds_list) if odd and _f(odd) > 1.01]
    if len(valid) < 2:
        return [None] * len(odds_list)
    implied = [1.0 / odd for _, odd in valid]
    margin = sum(implied)
    fair = [imp / margin for imp in implied]
    out = [None] * len(odds_list)
    for (idx, _), probability in zip(valid, fair):
        out[idx] = round(probability, 6)
    return out


def kelly(probability: float, odds: float, fraction: float = KELLY_FRACTION) -> float:
    if not probability or not odds or odds < 1.01:
        return 0.0
    b = odds - 1.0
    q = 1.0 - probability
    raw = (probability * b - q) / b
    return round(max(0.0, min(raw * fraction, 0.08)) * 100.0, 3)


def ev_pct(probability: float, odds: float) -> Optional[float]:
    if not probability or not odds or odds < 1.01:
        return None
    return round((probability * (odds - 1.0) - (1.0 - probability)) * 100.0, 3)


def fair_odds(probability: float) -> Optional[float]:
    if not probability or probability <= 0:
        return None
    return round(1.0 / probability, 3)


def reliability_factor(wfv_auc: Any, ece: Any, quality_score: Any) -> float:
    auc = _f(wfv_auc, 0.55)
    e = _f(ece, 0.07)
    q = _f(quality_score, 55.0)
    auc_part = clamp((auc - 0.50) / 0.12, 0.0, 1.0)
    ece_part = clamp(1.0 - e / 0.12, 0.0, 1.0)
    q_part = clamp((q - 45.0) / 45.0, 0.0, 1.0)
    return round(0.25 + 0.75 * (0.45 * auc_part + 0.25 * ece_part + 0.30 * q_part), 4)




def quality_gate_from_metrics(wfv_auc: Any, ece: Any) -> str:
    auc = _f(wfv_auc, 0.0)
    e = _f(ece, 1.0)
    if auc >= 0.60 and e <= 0.06:
        return "A"
    if auc >= 0.56 and e <= 0.09:
        return "B"
    return "C"

def smartbet_score(probability: float, edge_pp: float, ev: float, kelly_pct: float, reliability: float, agreement: float) -> float:
    prob_norm = clamp((probability - 0.50) / 0.35 * 100.0, 0.0, 100.0)
    edge_norm = clamp(edge_pp / 14.0 * 100.0, 0.0, 100.0)
    ev_norm = clamp(ev / 6.0 * 100.0, 0.0, 100.0)
    kelly_norm = clamp(kelly_pct / 3.5 * 100.0, 0.0, 100.0)
    raw = 0.34 * prob_norm + 0.27 * edge_norm + 0.17 * ev_norm + 0.10 * kelly_norm + 0.12 * (agreement * 100.0)
    return round(clamp(raw * reliability, 0.0, 100.0), 1)


def event_id(obj: Dict[str, Any]) -> Any:
    ev = obj.get("event") if isinstance(obj.get("event"), dict) else None
    return obj.get("event_id") or obj.get("id") or (ev or {}).get("id")


def team_id(ev: Dict[str, Any], side: str) -> Any:
    direct = ev.get(f"{side}_team_id")
    if direct:
        return direct
    obj = ev.get(f"{side}_team_obj") or ev.get(side)
    if isinstance(obj, dict):
        return obj.get("id")
    return None


def team_name(ev: Dict[str, Any], side: str) -> str:
    value = ev.get(f"{side}_team") or ev.get(side) or ""
    if isinstance(value, dict):
        return str(value.get("name") or "")
    return str(value or "")


def league_name(ev: Dict[str, Any]) -> str:
    lg = ev.get("league") or "Unknown"
    if isinstance(lg, dict):
        return str(lg.get("name") or lg.get("short_code") or lg.get("id") or "Unknown")
    return str(lg or "Unknown")


def normalize_prediction_map(predictions: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    out = {}
    for pred in predictions or []:
        if not isinstance(pred, dict):
            continue
        ev = pred.get("event") if isinstance(pred.get("event"), dict) else {}
        eid = pred.get("event_id") or ev.get("id") or pred.get("id")
        if eid is not None:
            out[str(eid)] = pred
    return out


def load_v2_enrichment_events() -> Dict[str, Dict[str, Any]]:
    """Încarcă bundle-urile API v2 produse de fetch_v2_enrichment_cache.py."""
    cache = load_json(DATA_DIR / "v2_enrichment_cache.json", {}) or {}
    events = cache.get("events") if isinstance(cache, dict) else {}
    return events if isinstance(events, dict) else {}


def v2_prediction_probability(pred: Optional[Dict[str, Any]], market_key: str) -> Optional[float]:
    """Parsează schema API v2 /events/{id}/prediction/: markets grouped by market."""
    if not isinstance(pred, dict):
        return None
    markets = pred.get("markets") if isinstance(pred.get("markets"), dict) else {}
    mr = markets.get("match_result") if isinstance(markets.get("match_result"), dict) else {}
    ou = markets.get("over_under") if isinstance(markets.get("over_under"), dict) else {}
    btts = markets.get("btts") if isinstance(markets.get("btts"), dict) else {}
    mapping = {
        "home_win": mr.get("prob_home"),
        "draw": mr.get("prob_draw"),
        "away_win": mr.get("prob_away"),
        "over15": ou.get("prob_over_15"),
        "over25": ou.get("prob_over_25"),
        "btts": btts.get("prob_yes"),
    }
    if market_key == "under35":
        p_over35 = normalize_prob(ou.get("prob_over_35"))
        return round(1.0 - p_over35, 6) if p_over35 is not None else None
    return normalize_prob(mapping.get(market_key))


def apply_v2_prediction_to_row(row: Dict[str, Any], pred: Optional[Dict[str, Any]]):
    """Copiază predicțiile BSD v2 în câmpurile vechi folosite de motor."""
    if not isinstance(pred, dict):
        return
    markets = pred.get("markets") if isinstance(pred.get("markets"), dict) else {}
    mr = markets.get("match_result") if isinstance(markets.get("match_result"), dict) else {}
    ou = markets.get("over_under") if isinstance(markets.get("over_under"), dict) else {}
    btts = markets.get("btts") if isinstance(markets.get("btts"), dict) else {}
    eg = markets.get("expected_goals") if isinstance(markets.get("expected_goals"), dict) else {}
    assign = {
        "prob_home_win": mr.get("prob_home"),
        "prob_draw": mr.get("prob_draw"),
        "prob_away_win": mr.get("prob_away"),
        "prob_over_15": ou.get("prob_over_15"),
        "prob_over_25": ou.get("prob_over_25"),
        "prob_over_35": ou.get("prob_over_35"),
        "prob_btts_yes": btts.get("prob_yes"),
    }
    for key, value in assign.items():
        if value is not None:
            row[key] = normalize_prob(value)
    if row.get("xg_home") is None and eg.get("home") is not None:
        row["xg_home"] = _f(eg.get("home"), None)
    if row.get("xg_away") is None and eg.get("away") is not None:
        row["xg_away"] = _f(eg.get("away"), None)
    model = pred.get("model") if isinstance(pred.get("model"), dict) else {}
    if model.get("confidence") is not None:
        row["api_confidence"] = normalize_prob(model.get("confidence"))
    row["bsd_prediction_v2"] = pred


def apply_v2_bundle_to_row(row: Dict[str, Any], bundle: Optional[Dict[str, Any]]):
    """Îmbogățește rândul curent cu context, odds, lineups, Polymarket și predicții v2."""
    if not isinstance(bundle, dict):
        return
    detail = bundle.get("detail") if isinstance(bundle.get("detail"), dict) else {}
    if detail:
        for key in (
            "event_date", "status", "period", "current_minute", "round_number", "referee_id", "venue_id",
            "home_coach_id", "away_coach_id", "is_local_derby", "is_neutral_ground", "travel_distance_km",
            "weather", "pitch_condition", "attendance", "live_websocket"
        ):
            if detail.get(key) is not None:
                row[key] = detail.get(key)
        # Nu stricăm numele echipelor deja existente, doar completăm ID-uri lipsă.
        row["home_team_id"] = row.get("home_team_id") or detail.get("home_team_id")
        row["away_team_id"] = row.get("away_team_id") or detail.get("away_team_id")
        row["league_id"] = row.get("league_id") or detail.get("league_id")
    odds_payload = bundle.get("odds") if isinstance(bundle.get("odds"), dict) else {}
    odds = odds_payload.get("odds") if isinstance(odds_payload.get("odds"), dict) else {}
    odds_map = {
        "home_win": "odds_home", "draw": "odds_draw", "away_win": "odds_away",
        "over_15_goals": "odds_over_15", "under_15_goals": "odds_under_15",
        "over_25_goals": "odds_over_25", "under_25_goals": "odds_under_25",
        "over_35_goals": "odds_over_35", "under_35_goals": "odds_under_35",
        "btts_yes": "odds_btts_yes", "btts_no": "odds_btts_no",
    }
    for src, dst in odds_map.items():
        if odds.get(src) is not None:
            row[dst] = _f(odds.get(src), row.get(dst))
    cached_pred = bundle.get("prediction") if isinstance(bundle.get("prediction"), dict) else None
    apply_v2_prediction_to_row(row, cached_pred)
    row["v2_bundle"] = bundle
    row["v2_lineups"] = bundle.get("lineups")
    row["v2_polymarket"] = bundle.get("polymarket")
    row["v2_odds_comparison"] = bundle.get("odds_comparison")
    row["v2_metadata"] = bundle.get("metadata")
    row["v2_referee"] = bundle.get("referee")
    row["v2_managers"] = bundle.get("managers")


def _walk_dicts(obj: Any):
    """Generator tolerant pentru dicturi nested din răspunsurile odds/polymarket."""
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk_dicts(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk_dicts(item)


def market_outcome_codes(market_key: str) -> Tuple[List[str], List[str]]:
    return {
        "home_win": (["1x2", "match_result"], ["HOME", "home", "H", "home_win"]),
        "draw": (["1x2", "match_result"], ["DRAW", "draw", "D", "X"]),
        "away_win": (["1x2", "match_result"], ["AWAY", "away", "A", "away_win"]),
        "btts": (["btts"], ["yes", "YES", "btts_yes"]),
        "over15": (["over_under_15", "over_15", "over15"], ["over", "OVER", "over_15"]),
        "over25": (["over_under_25", "over_25", "over25"], ["over", "OVER", "over_25"]),
        "under35": (["over_under_35", "under_35", "under35"], ["under", "UNDER", "under_35"]),
    }.get(market_key, ([market_key], [market_key]))


def _lookup_case_insensitive(mapping: Dict[str, Any], key: str) -> Any:
    """Returnează valoarea pentru key indiferent de capitalizare."""
    if not isinstance(mapping, dict):
        return None
    if key in mapping:
        return mapping.get(key)
    key_l = str(key).lower()
    for k, v in mapping.items():
        if str(k).lower() == key_l:
            return v
    return None


def odds_comparison_selection(market_key: str) -> Tuple[str, str]:
    """Mapare directă către schema reală BSD v2 odds/comparison: markets -> market -> outcome."""
    return {
        "home_win": ("1x2", "HOME"),
        "draw": ("1x2", "DRAW"),
        "away_win": ("1x2", "AWAY"),
        "btts": ("btts", "yes"),
        "over15": ("over_under_15", "over"),
        "over25": ("over_under_25", "over"),
        "under35": ("over_under_35", "under"),
    }.get(market_key, (market_key, market_key))


def _odds_meta_from_rows(rows: List[Dict[str, Any]], fallback_odds: float, outcome_node: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Agregă best odds + mișcare + dispersie pentru o selecție."""
    outcome_node = outcome_node if isinstance(outcome_node, dict) else {}
    clean_rows = []
    for r in rows or []:
        odd = _f(r.get("decimal_odds") or r.get("odds") or r.get("price") or r.get("best_odds"), 0.0)
        if odd <= 1.01:
            continue
        slug = r.get("bookmaker_slug") or r.get("bookmaker") or r.get("slug")
        name = r.get("bookmaker_name") or r.get("bookmaker") or slug
        clean_rows.append({
            "decimal_odds": odd,
            "bookmaker_slug": slug,
            "bookmaker_name": name,
            "movement": str(r.get("movement") or "").upper(),
            "previous_decimal_odds": _f(r.get("previous_decimal_odds"), 0.0),
            "is_max_quote": bool(r.get("is_max_quote")),
        })
    if not clean_rows:
        return {"active_odds": fallback_odds}
    clean_rows.sort(key=lambda x: x["decimal_odds"], reverse=True)
    odds_values = [r["decimal_odds"] for r in clean_rows]
    best = clean_rows[0]
    best_odds = _f(outcome_node.get("best_odds"), best["decimal_odds"])
    best_bookmaker = (
        outcome_node.get("best_bookmaker_name")
        or outcome_node.get("best_bookmaker_slug")
        or best.get("bookmaker_name")
        or best.get("bookmaker_slug")
    )
    shortening = sum(1 for r in clean_rows if r.get("movement") == "SHORTENING")
    drifting = sum(1 for r in clean_rows if r.get("movement") == "DRIFTING")
    avg = sum(odds_values) / len(odds_values)
    dispersion = (max(odds_values) - min(odds_values)) / avg if avg else 0.0
    bookmakers_count = len({
        r.get("bookmaker_slug") or r.get("bookmaker_name")
        for r in clean_rows
        if r.get("bookmaker_slug") or r.get("bookmaker_name")
    }) or len(clean_rows)
    return {
        "active_odds": round(best_odds, 3),
        "best_odds": round(best_odds, 3),
        "best_bookmaker": best_bookmaker,
        "bookmakers_count": bookmakers_count,
        "movement_shortening": shortening,
        "movement_drifting": drifting,
        "movement_balance": shortening - drifting,
        "odds_dispersion": round(dispersion, 4),
        "comparison_rows": len(clean_rows),
    }


def odds_comparison_meta(row: Dict[str, Any], market_key: str, fallback_odds: float) -> Dict[str, Any]:
    """Extrage best price, count bookmakers, movement și dispersie din /odds/comparison/."""
    comp = row.get("v2_odds_comparison")
    if not isinstance(comp, dict):
        return {"active_odds": fallback_odds}

    # Schema BSD v2 reală: {markets: {"1x2": {"HOME": {...bookmakers...}}}}.
    # Aceasta este calea principală; vechiul parser generic nu prindea selecțiile 1x2/OU/BTTS.
    markets = comp.get("markets") if isinstance(comp.get("markets"), dict) else {}
    direct_market, direct_outcome = odds_comparison_selection(market_key)
    market_node = _lookup_case_insensitive(markets, direct_market)
    outcome_node = _lookup_case_insensitive(market_node, direct_outcome) if isinstance(market_node, dict) else None
    if isinstance(outcome_node, dict):
        rows = []
        bookmakers = outcome_node.get("bookmakers") if isinstance(outcome_node.get("bookmakers"), dict) else {}
        for slug, payload in bookmakers.items():
            if not isinstance(payload, dict):
                continue
            r = dict(payload)
            r.setdefault("bookmaker_slug", slug)
            r.setdefault("bookmaker_name", str(slug).replace("-", " ").title())
            rows.append(r)
        # În unele răspunsuri poate exista doar best_odds, fără lista completă de bookmakers.
        if not rows and outcome_node.get("best_odds") is not None:
            rows.append({
                "decimal_odds": outcome_node.get("best_odds"),
                "bookmaker_slug": outcome_node.get("best_bookmaker_slug"),
                "bookmaker_name": outcome_node.get("best_bookmaker_name"),
            })
        meta = _odds_meta_from_rows(rows, fallback_odds, outcome_node)
        if _f(meta.get("active_odds"), 0.0) > 1.01:
            return meta

    # Fallback tolerant pentru eventuale forme viitoare/vechi în care fiecare cotă vine ca rând separat.
    market_aliases, outcome_aliases = market_outcome_codes(market_key)
    market_aliases_l = {str(x).lower() for x in market_aliases}
    outcome_aliases_l = {str(x).lower() for x in outcome_aliases}
    rows = []
    for d in _walk_dicts(comp):
        odd = _f(d.get("decimal_odds") or d.get("odds") or d.get("price") or d.get("best_odds"), 0.0)
        if odd <= 1.01:
            continue
        market = str(d.get("market") or d.get("market_key") or d.get("type") or "").lower()
        outcome = str(d.get("outcome") or d.get("outcome_key") or d.get("code") or d.get("selection") or "").lower()
        text = " ".join(str(d.get(k) or "") for k in ("outcome_name", "name", "label", "title")).lower()
        market_ok = (not market) or any(a in market for a in market_aliases_l)
        outcome_ok = (not outcome and any(a in text for a in outcome_aliases_l)) or outcome in outcome_aliases_l or any(a in outcome for a in outcome_aliases_l)
        if market_ok and outcome_ok:
            rows.append(d)
    return _odds_meta_from_rows(rows, fallback_odds)


def polymarket_selection(market_key: str) -> Tuple[str, str]:
    """Mapare directă către schema Polymarket cache-uită de BSD v2."""
    return {
        "home_win": ("1x2", "home"),
        "draw": ("1x2", "draw"),
        "away_win": ("1x2", "away"),
        "btts": ("btts", "yes"),
        "over15": ("over_under", "over_15"),
        "over25": ("over_under", "over_25"),
        "under35": ("over_under", "under_35"),
    }.get(market_key, (market_key, market_key))


def polymarket_probability(row: Dict[str, Any], market_key: str) -> Optional[float]:
    """Extrage probabilitatea Polymarket dacă există; schema poate varia, deci parsează tolerant."""
    pm = row.get("v2_polymarket")
    if not isinstance(pm, (dict, list)):
        return None

    # Schema curentă: {markets: {"1x2": {home/draw/away}, "over_under": {over_15...}}}.
    if isinstance(pm, dict):
        markets = pm.get("markets") if isinstance(pm.get("markets"), dict) else {}
        direct_market, direct_outcome = polymarket_selection(market_key)
        market_node = _lookup_case_insensitive(markets, direct_market)
        if isinstance(market_node, dict):
            prob = normalize_prob(_lookup_case_insensitive(market_node, direct_outcome))
            if prob is not None and 0 < prob < 1:
                return round(prob, 6)

    # Fallback pentru forme alternative cu liste/outcomes.
    _, outcome_aliases = market_outcome_codes(market_key)
    outcome_aliases_l = {str(x).lower() for x in outcome_aliases}
    market_words = {
        "home_win": ["home", "winner", "match"], "draw": ["draw"], "away_win": ["away", "winner", "match"],
        "btts": ["btts", "both teams"], "over15": ["over 1.5", "over15", "over_15"], "over25": ["over 2.5", "over25", "over_25"], "under35": ["under 3.5", "under35", "under_35"],
    }.get(market_key, [market_key])
    best = None
    for d in _walk_dicts(pm):
        price = d.get("price") if d.get("price") is not None else (d.get("probability") if d.get("probability") is not None else d.get("implied_probability"))
        prob = normalize_prob(price)
        if prob is None or prob <= 0 or prob >= 1:
            continue
        text = " ".join(str(d.get(k) or "") for k in ("market", "question", "title", "name", "outcome", "outcome_name", "selection")).lower()
        if not any(w in text for w in market_words) and not any(a in text for a in outcome_aliases_l):
            continue
        if any(a in text for a in outcome_aliases_l) or market_key in {"over15", "over25", "under35", "btts"}:
            best = prob if best is None else max(best, prob)
    return round(best, 6) if best is not None else None


def lineup_risk_score(row: Dict[str, Any]) -> float:
    lu = row.get("v2_lineups")
    if not isinstance(lu, dict):
        return 0.10
    status = str(lu.get("lineup_status") or "unavailable").lower()
    if status == "confirmed":
        base = 0.0
    elif status == "predicted":
        lineups = lu.get("lineups") if isinstance(lu.get("lineups"), dict) else {}
        h = ((lineups.get("home") or {}).get("confidence") if isinstance(lineups.get("home"), dict) else None)
        a = ((lineups.get("away") or {}).get("confidence") if isinstance(lineups.get("away"), dict) else None)
        avg_conf = (_f(h, 0.55) + _f(a, 0.55)) / 2.0
        base = clamp(0.28 - avg_conf * 0.22, 0.04, 0.22)
    else:
        base = 0.16
    unavailable = lu.get("unavailable_players") if isinstance(lu.get("unavailable_players"), dict) else {}
    missing_count = 0
    for side in ("home", "away"):
        players = unavailable.get(side)
        if isinstance(players, list):
            missing_count += len(players)
    return round(clamp(base + min(0.14, missing_count * 0.018), 0.0, 0.35), 4)


def context_risk_score(row: Dict[str, Any]) -> float:
    risk = 0.0
    if row.get("is_local_derby"):
        risk += 0.08
    if row.get("is_neutral_ground"):
        risk += 0.06
    if _f(row.get("travel_distance_km"), 0) >= 700:
        risk += 0.05
    weather = row.get("weather") if isinstance(row.get("weather"), dict) else {}
    desc = str(weather.get("description") or "").lower()
    if any(x in desc for x in ("rain", "snow", "storm", "fog", "wind")):
        risk += 0.06
    pitch = _f(row.get("pitch_condition"), 0)
    if pitch and pitch >= 3:
        risk += 0.04
    return round(clamp(risk, 0.0, 0.28), 4)


def market_intel_bonus(odds_meta: Dict[str, Any]) -> float:
    if not isinstance(odds_meta, dict):
        return 0.0
    bonus = 0.0
    bonus += min(4.0, _f(odds_meta.get("bookmakers_count"), 0) * 0.22)
    balance = _f(odds_meta.get("movement_balance"), 0)
    if balance > 0:
        bonus += min(3.5, balance * 0.7)
    elif balance < 0:
        bonus += max(-5.0, balance * 1.0)
    dispersion = _f(odds_meta.get("odds_dispersion"), 0)
    if dispersion > 0.10:
        bonus -= min(4.0, dispersion * 25.0)
    return round(clamp(bonus, -8.0, 8.0), 2)


def merge_event_prediction(ev: Dict[str, Any], pred: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    pred = pred or {}
    base = dict(pred.get("event") or {}) if isinstance(pred.get("event"), dict) else {}
    base.update(ev or {})
    # păstrăm câmpuri model/API de la predicția BSD, fără să stricăm eventul normalizat
    for key, value in pred.items():
        if key == "event":
            continue
        if key not in base:
            base[key] = value
    return base


def hist_entry(row: Dict[str, Any], side: str) -> Dict[str, Any]:
    is_home = side == "home"
    return {
        "event_id": row.get("event_id") or row.get("id"),
        "date": row.get("date") or row.get("event_date"),
        "goals_for": _f(row.get("home_score") if is_home else row.get("away_score")),
        "goals_against": _f(row.get("away_score") if is_home else row.get("home_score")),
        "goal_diff": _f(row.get("home_score") if is_home else row.get("away_score")) - _f(row.get("away_score") if is_home else row.get("home_score")),
        "points": 3 if (row.get("home_win") if is_home else row.get("away_win")) else (1 if row.get("draw") else 0),
        "btts_yes": row.get("btts_yes", 0),
        "over_25": row.get("over_25", 0),
        "under_35": row.get("under_35", 0),
        "is_home": 1 if is_home else 0,
        "xg_for": row.get("xg_home") if is_home else row.get("xg_away"),
        "xg_against": row.get("xg_away") if is_home else row.get("xg_home"),
    }


def build_history_indexes(rows: List[Dict[str, Any]]):
    by_team = defaultdict(list)
    pair_rows = []
    for r in rows:
        dt = str(r.get("date") or r.get("event_date") or "")[:10]
        hid, aid = r.get("home_team_id"), r.get("away_team_id")
        if hid:
            by_team[str(hid)].append(hist_entry(r, "home"))
        if aid:
            by_team[str(aid)].append(hist_entry(r, "away"))
        if hid and aid:
            pair_rows.append(r)
    for items in by_team.values():
        items.sort(key=lambda x: str(x.get("date") or ""))
    pair_rows.sort(key=lambda x: str(x.get("date") or x.get("event_date") or ""))
    return by_team, pair_rows


def get_team_history(index, tid, cutoff_date: str, limit: int = 30):
    if not tid:
        return []
    rows = [r for r in index.get(str(tid), []) if str(r.get("date") or "")[:10] < cutoff_date]
    return rows[-limit:]


def get_h2h_snapshot(pair_rows, hid, aid, cutoff_date: str):
    h2h_ha, h2h_ah = [], []
    for r in pair_rows:
        if str(r.get("date") or r.get("event_date") or "")[:10] >= cutoff_date:
            continue
        rh, ra = r.get("home_team_id"), r.get("away_team_id")
        if {str(rh), str(ra)} != {str(hid), str(aid)}:
            continue
        entry = {
            "date": r.get("date"), "home_id": rh, "home_score": r.get("home_score"), "away_score": r.get("away_score"),
            "total_goals": r.get("total_goals"), "home_win": r.get("home_win"), "draw": r.get("draw"),
            "btts": r.get("btts_yes"), "over_25": r.get("over_25"),
        }
        if str(rh) == str(hid) and str(ra) == str(aid):
            h2h_ha.append(entry)
        elif str(rh) == str(aid) and str(ra) == str(hid):
            h2h_ah.append({**entry, "home_id": hid, "home_score": r.get("away_score"), "away_score": r.get("home_score"), "home_win": r.get("away_win"), "draw": r.get("draw")})
    return {"h2h_ha": h2h_ha[-20:], "h2h_ah": h2h_ah[-20:]}


def elo_snapshot_until(rows_sorted: List[Dict[str, Any]], hid, aid, cutoff_date: str, cache: Dict[str, Dict[Any, float]]) -> Dict[str, Any]:
    if cutoff_date not in cache:
        ratings = defaultdict(lambda: ELO_START)
        for row in rows_sorted:
            if str(row.get("date") or row.get("event_date") or "")[:10] >= cutoff_date:
                continue
            rh, ra = row.get("home_team_id"), row.get("away_team_id")
            if not rh or not ra:
                continue
            h_elo, a_elo = ratings[rh], ratings[ra]
            exp_h = elo_expected(h_elo, a_elo)
            actual_h = 1.0 if row.get("home_win") else (0.5 if row.get("draw") else 0.0)
            margin = abs(_f(row.get("home_score")) - _f(row.get("away_score")))
            mov = math.log(max(1.0, margin) + 1.0)
            delta = ELO_K * mov * (actual_h - exp_h)
            ratings[rh] = h_elo + delta
            ratings[ra] = a_elo - delta
        cache[cutoff_date] = dict(ratings)
    ratings = cache[cutoff_date]
    h_elo = ratings.get(hid, ELO_START)
    a_elo = ratings.get(aid, ELO_START)
    return {"home_elo_pre": round(h_elo, 2), "away_elo_pre": round(a_elo, 2), "elo_diff_pre": round(h_elo - a_elo, 2), "elo_expected_home": round(elo_expected(h_elo, a_elo), 6)}


def normalize_current_row(ev: Dict[str, Any], pred: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    row = merge_event_prediction(ev, pred)
    season = row.get("season") if isinstance(row.get("season"), dict) else {}
    row["event_id"] = event_id(row)
    row["date"] = row.get("date") or row.get("event_date")
    row["league"] = league_name(row)
    row["league_id"] = (row.get("league") or {}).get("id") if isinstance(row.get("league"), dict) else row.get("league_id")
    row["season_id"] = season.get("id") or row.get("season_id")
    row["season_year"] = season.get("year") or row.get("season_year")
    row["home_team"] = team_name(row, "home")
    row["away_team"] = team_name(row, "away")
    row["home_team_id"] = team_id(row, "home")
    row["away_team_id"] = team_id(row, "away")
    row["xg_home"] = row.get("xg_home") if row.get("xg_home") is not None else (row.get("actual_home_xg") or row.get("expected_home_goals"))
    row["xg_away"] = row.get("xg_away") if row.get("xg_away") is not None else (row.get("actual_away_xg") or row.get("expected_away_goals"))
    row["api_prob_home_win"] = normalize_prob(row.get("prob_home_win"))
    row["api_prob_draw"] = normalize_prob(row.get("prob_draw"))
    row["api_prob_away_win"] = normalize_prob(row.get("prob_away_win"))
    row["api_prob_over_25"] = normalize_prob(row.get("prob_over_25"))
    row["api_prob_btts_yes"] = normalize_prob(row.get("prob_btts_yes"))
    row["api_confidence"] = row.get("confidence")
    apply_v2_prediction_to_row(row, pred)
    return row


def normalize_prob(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    f = _f(v)
    if f > 1.0:
        f = f / 100.0
    return round(clamp(f, 0.0, 1.0), 6)


def build_features_for_current(row: Dict[str, Any], pred: Optional[Dict[str, Any]], league_baselines, team_index, pair_rows, stats_cache, incidents_cache, shotmap_cache, elo_cache, hist_rows_sorted):
    cutoff = str(row.get("date") or "")[:10]
    hid, aid = row.get("home_team_id"), row.get("away_team_id")
    home_hist = get_team_history(team_index, hid, cutoff, limit=30)
    away_hist = get_team_history(team_index, aid, cutoff, limit=30)
    h2h_snap = get_h2h_snapshot(pair_rows, hid, aid, cutoff)
    lb = league_baselines.get(row.get("league")) if isinstance(league_baselines, dict) else None
    elo_snap = elo_snapshot_until(hist_rows_sorted, hid, aid, cutoff, elo_cache)

    feats = {
        "event_id": row.get("event_id"), "date": row.get("date"), "season_id": row.get("season_id"), "season_year": row.get("season_year"),
        "league": row.get("league", "Unknown"), "league_id": row.get("league_id"), "home_team": row.get("home_team", ""), "away_team": row.get("away_team", ""),
        "home_team_id": hid, "away_team_id": aid,
    }
    feats.update(form_features(home_hist, "home"))
    feats.update(form_features(away_hist, "away"))
    feats.update(diff_features(feats, feats))
    feats.update(xg_features(row, home_hist, away_hist))
    feats.update(h2h_features(h2h_snap, hid))
    feats.update(odds_features(row))
    feats.update(context_features(row, home_hist, away_hist, lb))
    feats.update(elo_snap)
    if stats_cache:
        feats.update(stats_features(home_hist, away_hist, stats_cache))
    if shotmap_cache:
        feats.update(shotmap_features(home_hist, away_hist, shotmap_cache))
    if incidents_cache:
        feats.update(incidents_features(home_hist, away_hist, incidents_cache))
    h_pre = feats.get("home_matches_pre", 0) or 0
    a_pre = feats.get("away_matches_pre", 0) or 0
    base_matches = feats.get("league_baseline_matches") or (lb or {}).get("matches") or 0
    quality = 35.0 + min(25.0, min(h_pre, a_pre) * 3.0)
    quality += 12.0 if row.get("odds_home") and row.get("odds_draw") and row.get("odds_away") else 0.0
    quality += 10.0 if feats.get("xg_sum") is not None or feats.get("xg_form_sum_5") is not None else 0.0
    quality += 4.0 if feats.get("xg_stats_sum_form5") is not None else 0.0
    quality += 4.0 if feats.get("xg_shotmap_sum_form5") is not None else 0.0
    quality += 3.0 if feats.get("home_early_goal_rate5") is not None or feats.get("away_early_goal_rate5") is not None else 0.0
    quality += min(18.0, float(base_matches or 0) / 10.0)
    feats["data_quality_score"] = round(clamp(quality, 0.0, 100.0), 2)
    feats["eligible_min3"] = 1 if (h_pre >= 3 and a_pre >= 3) else 0
    feats["eligible_min5"] = 1 if (h_pre >= 5 and a_pre >= 5) else 0
    return feats


def run_catboost_inference(feats_list, market_key, feat_cols, model_path, feature_defaults=None):
    if CatBoostClassifier is None or pd is None or Pool is None:
        print("  WARN: catboost/pandas indisponibil. Skip inferență.")
        return None
    if not model_path.exists():
        return None
    try:
        model = CatBoostClassifier()
        model.load_model(str(model_path))
        df = pd.DataFrame(feats_list)
        feature_defaults = feature_defaults or {}
        for c in feat_cols:
            if c not in df.columns:
                df[c] = None
        cat_idx = [feat_cols.index(c) for c in CAT_FEATURES if c in feat_cols]
        for c in feat_cols:
            if c in CAT_FEATURES:
                df[c] = df[c].fillna(str(feature_defaults.get(c, "N/A"))).astype(str)
            else:
                df[c] = pd.to_numeric(df[c], errors="coerce").fillna(float(feature_defaults.get(c, 0.0)))
        pool = Pool(df[feat_cols].values, cat_features=cat_idx, feature_names=list(feat_cols))
        raw_probs = model.predict_proba(pool)[:, 1]
        cal_path = MODELS_DIR / f"calibrator_{market_key}.pkl"
        if cal_path.exists():
            with open(cal_path, "rb") as handle:
                calibrator = pickle.load(handle)
            cal_probs = calibrator.transform(raw_probs)
            print(f"  Calibrator aplicat pentru {market_key} (delta_med={abs(cal_probs.mean()-raw_probs.mean()):.4f})")
        else:
            print(f"  WARN: calibrator_{market_key}.pkl lipsă — folosesc probabilități brute")
            cal_probs = raw_probs
        return [round(float(p), 6) for p in cal_probs]
    except Exception as exc:
        print(f"  WARN inference {market_key}: {exc}")
        return None


def best_odds(row: Dict[str, Any], market_key: str) -> Tuple[float, Dict[str, Any]]:
    info = TARGETS[market_key]
    base = _f(row.get(info["odds_key"]), 0.0)
    v2_meta = odds_comparison_meta(row, market_key, base)
    if _f(v2_meta.get("active_odds"), 0.0) > 1.01:
        return round(_f(v2_meta.get("active_odds")), 3), v2_meta
    mbo = row.get("market_best_odds") or {}
    best = mbo.get(info["best_key"], {}) if isinstance(mbo, dict) else {}
    best_odd = _f(best.get("best_odds"), 0.0) if isinstance(best, dict) else 0.0
    if best_odd > 1.01:
        return round(best_odd, 3), best
    return round(base, 3), {}


def market_nv_probability(row: Dict[str, Any], market_key: str, used_odds: float) -> Optional[float]:
    info = TARGETS[market_key]
    pair_values = [row.get(k) for k in info["pair"]]
    # Dacă folosim best_odds, înlocuim doar cota pieței curente pentru edge realist pe cota activă.
    if used_odds and used_odds > 1.01:
        pair_values[info["pair_idx"]] = used_odds
    probs = no_vig_prob(pair_values)
    try:
        return probs[info["pair_idx"]]
    except Exception:
        return None


def enriched_market(pred_or_row: Dict[str, Any], market_key: str) -> Dict[str, Any]:
    markets = pred_or_row.get("markets_enriched") or {}
    aliases = {
        "home_win": ["home_win", "homeWin"], "draw": ["draw"], "away_win": ["away_win", "awayWin"],
        "btts": ["btts_yes", "btts"], "over15": ["over_15", "over15"], "over25": ["over_25", "over25"], "under35": ["under_35", "under35"],
    }
    for key in aliases.get(market_key, [market_key]):
        if isinstance(markets, dict) and isinstance(markets.get(key), dict):
            return markets[key]
    return {}


def api_probability(row: Dict[str, Any], pred: Optional[Dict[str, Any]], market_key: str) -> Optional[float]:
    pred = pred or {}
    p_v2 = v2_prediction_probability(pred, market_key) or v2_prediction_probability(row.get("bsd_prediction_v2"), market_key)
    if p_v2 is not None:
        return p_v2
    em = enriched_market(pred, market_key) or enriched_market(row, market_key)
    if em.get("prob") is not None:
        return normalize_prob(em.get("prob"))
    key_map = {
        "home_win": "prob_home_win", "draw": "prob_draw", "away_win": "prob_away_win", "btts": "prob_btts_yes",
        "over15": "prob_over_15", "over25": "prob_over_25", "under35": "prob_under_35",
    }
    if market_key == "under35" and row.get("prob_under_35") is None and row.get("prob_over_35") is not None:
        p = normalize_prob(row.get("prob_over_35"))
        return round(1.0 - p, 6) if p is not None else None
    return normalize_prob(row.get(key_map.get(market_key)))


def poisson_probability(feat: Dict[str, Any], row: Dict[str, Any], pred: Optional[Dict[str, Any]], market_key: str) -> Optional[float]:
    em = enriched_market(pred or {}, market_key) or enriched_market(row, market_key)
    if em.get("poisson_prob") is not None:
        return normalize_prob(em.get("poisson_prob"))
    feature_key = {
        "home_win": "poisson_prob_home_form5", "draw": "poisson_prob_draw_form5", "away_win": "poisson_prob_away_form5",
        "btts": "poisson_prob_btts_form5", "over15": "poisson_prob_over15_form5", "over25": "poisson_prob_over25_form5", "under35": "poisson_prob_under35_form5",
    }.get(market_key)
    return normalize_prob(feat.get(feature_key)) if feature_key else None


def _mean_non_null(values: Iterable[Any]) -> Optional[float]:
    vals = [_f(v, None) for v in values if v is not None]
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 6) if vals else None


def stats_profile_probability(feat: Dict[str, Any], market_key: str) -> Optional[float]:
    """
    Probabilitate auxiliară din stats/incidents/shotmap.
    Nu înlocuiește CatBoost; intră ca sursă separată în blend doar când există date reale.
    """
    hxg = _mean_non_null([
        feat.get("home_shotmap_xg_form5"),
        feat.get("home_xg_stats_form5"),
        feat.get("home_xg_form_5"),
    ])
    axg = _mean_non_null([
        feat.get("away_shotmap_xg_form5"),
        feat.get("away_xg_stats_form5"),
        feat.get("away_xg_form_5"),
    ])
    if hxg is None or axg is None:
        return None

    # Ajustări mici din calitatea șuturilor și big chances; plafonate ca să nu supraînvețe din sample mic.
    h_xgps = _f(feat.get("home_xg_per_shot_form5"), 0.0)
    a_xgps = _f(feat.get("away_xg_per_shot_form5"), 0.0)
    h_big = _f(feat.get("home_big_chances_form5"), 0.0)
    a_big = _f(feat.get("away_big_chances_form5"), 0.0)
    h_sot_ratio = _f(feat.get("home_sot_ratio_form5"), 0.0)
    a_sot_ratio = _f(feat.get("away_sot_ratio_form5"), 0.0)

    hxg = clamp(hxg + clamp((h_xgps - 0.10) * 0.9, -0.08, 0.12) + clamp((h_big - 1.0) * 0.055, -0.08, 0.14) + clamp((h_sot_ratio - 0.32) * 0.20, -0.05, 0.08), 0.15, 3.8)
    axg = clamp(axg + clamp((a_xgps - 0.10) * 0.9, -0.08, 0.12) + clamp((a_big - 1.0) * 0.055, -0.08, 0.14) + clamp((a_sot_ratio - 0.32) * 0.20, -0.05, 0.08), 0.15, 3.8)

    if market_key == "over15":
        p = poisson_over(hxg, axg, 1.5)
    elif market_key == "over25":
        p = poisson_over(hxg, axg, 2.5)
    elif market_key == "under35":
        p = poisson_under(hxg, axg, 3.5)
    elif market_key == "btts":
        p = poisson_btts(hxg, axg)
    else:
        ph, pd, pa = poisson_1x2(hxg, axg)
        p = {"home_win": ph, "draw": pd, "away_win": pa}.get(market_key)
    return normalize_prob(p)


def stats_context_bonus(feat: Dict[str, Any], market_key: str) -> float:
    """Mic bonus/penalty de scor din consensul stats + incidents, nu din live."""
    bonus = 0.0
    if feat.get("xg_shotmap_sum_form5") is not None:
        bonus += 1.0
    if feat.get("xg_stats_sum_form5") is not None:
        bonus += 0.8
    if feat.get("home_early_goal_rate5") is not None or feat.get("away_early_goal_rate5") is not None:
        bonus += 0.4

    total_cards = _f(feat.get("home_total_yellow_avg5"), 0.0)
    red_risk = abs(_f(feat.get("home_red_card_risk_diff5"), 0.0))
    if market_key in {"under35", "draw"} and (total_cards >= 5.5 or red_risk >= 0.25):
        bonus -= 1.2
    if market_key in {"over15", "over25", "btts"}:
        bc_sum = _f(feat.get("home_big_chances_form5"), 0.0) + _f(feat.get("away_big_chances_form5"), 0.0)
        if bc_sum >= 2.4:
            bonus += 1.0
    return round(clamp(bonus, -2.5, 3.0), 2)


def blend_probability(cat_prob: float, nv_prob: Optional[float], api_prob: Optional[float], pois_prob: Optional[float], poly_prob: Optional[float], stats_prob: Optional[float], wfv_auc: Any, ece: Any, quality_score: Any) -> Tuple[float, Dict[str, Any]]:
    rel = reliability_factor(wfv_auc, ece, quality_score)
    weights = {"catboost": 0.38 + 0.25 * rel}
    if api_prob is not None:
        weights["api"] = 0.17
    if pois_prob is not None:
        weights["poisson"] = 0.12
    if poly_prob is not None:
        weights["polymarket"] = 0.10
    if stats_prob is not None:
        weights["stats_profile"] = 0.09
    if nv_prob is not None:
        weights["market"] = 0.11
    values = {"catboost": cat_prob}
    if api_prob is not None:
        values["api"] = api_prob
    if pois_prob is not None:
        values["poisson"] = pois_prob
    if poly_prob is not None:
        values["polymarket"] = poly_prob
    if stats_prob is not None:
        values["stats_profile"] = stats_prob
    if nv_prob is not None:
        values["market"] = nv_prob
    total_w = sum(weights[k] for k in values)
    blended = sum(values[k] * weights[k] for k in values) / total_w if total_w else cat_prob

    vals = list(values.values())
    mean = sum(vals) / len(vals)
    disagreement = math.sqrt(sum((x - mean) ** 2 for x in vals) / len(vals)) if vals else 0.0
    agreement = clamp(1.0 - disagreement / 0.18, 0.0, 1.0)
    # Când modelele se bat cap în cap, tragem spre piață/no-vig sau spre media surselor.
    if disagreement > 0.10:
        anchor = nv_prob if nv_prob is not None else mean
        shrink = clamp((disagreement - 0.10) / 0.12, 0.0, 0.65)
        blended = blended * (1.0 - shrink) + anchor * shrink
    return round(clamp(blended, 0.01, 0.99), 6), {"weights": weights, "values": values, "agreement": round(agreement, 4), "disagreement": round(disagreement, 4), "reliability": rel}


def risk_tier(score: float, probability: float, edge_pp: float, reliability: float) -> str:
    if score >= 82 and probability >= 0.68 and edge_pp >= 4.0 and reliability >= 0.68:
        return "Elite"
    if score >= 70 and probability >= 0.60 and edge_pp >= 3.0:
        return "Strong"
    if score >= 58:
        return "Balanced"
    return "Watch"


def _load_events():
    raw = load_json(DATA_DIR / "events.json", {})
    if isinstance(raw, dict):
        events = raw.get("predictions") or raw.get("results") or raw.get("events") or []
        if not events and all(isinstance(v, dict) for v in raw.values()):
            events = list(raw.values())
    else:
        events = raw or []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        date = str(ev.get("date") or ev.get("event_date") or "")[:10]
        status = str(ev.get("status") or "").lower()
        if date >= today and status not in {"finished", "ft", "closed", "cancelled", "canceled"}:
            out.append(ev)
    return out


def main():
    print("=== VEYRA SUPREME ENGINE v5 ===")
    if not (DATA_DIR / "events.json").exists():
        write_skip("events.json lipsește. Skip.")
        return

    upcoming_raw = _load_events()
    print(f"Meciuri viitoare: {len(upcoming_raw)}")
    if not upcoming_raw:
        write_skip("Niciun meci viitor găsit.")
        return

    pack = load_json(DATA_DIR / "model_pack_v2.json", {}) or {}
    feat_cols = pack.get("feature_columns", [])
    if not feat_cols:
        write_skip("model_pack_v2.json lipsește sau nu are feature_columns. VEYRA Supreme Engine v5 skip explicit.")
        return
    feature_defaults = pack.get("feature_defaults") or {}
    markets_meta = pack.get("markets", {}) if isinstance(pack.get("markets", {}), dict) else {}

    predictions = load_json(DATA_DIR / "predictions.json", []) or []
    pred_map = normalize_prediction_map(predictions)
    v2_events = load_v2_enrichment_events()
    hist_rows = load_warehouse()
    hist_rows_sorted = sorted(hist_rows, key=lambda r: str(r.get("date") or r.get("event_date") or ""))
    league_baselines = build_league_baselines(hist_rows_sorted) if hist_rows_sorted else (load_json(DATA_DIR / "league_baselines_v2.json", {}) or {})
    team_index, pair_rows = build_history_indexes(hist_rows_sorted)
    stats_cache = load_json(DATA_DIR / "stats_cache.json", {}) or {}
    incidents_cache = load_json(DATA_DIR / "incidents_cache.json", {}) or {}
    shotmap_cache = load_json(DATA_DIR / "shotmap_cache.json", {}) or {}
    cache_counts = {
        "stats": len([v for v in stats_cache.values() if v]) if isinstance(stats_cache, dict) else 0,
        "incidents": len([v for v in incidents_cache.values() if v]) if isinstance(incidents_cache, dict) else 0,
        "shotmap": len([v for v in shotmap_cache.values() if v]) if isinstance(shotmap_cache, dict) else 0,
    }
    print(f"Cache v2 stats/incidents/shotmap: {cache_counts}")
    elo_cache: Dict[str, Dict[Any, float]] = {}

    current_rows, feats_list, pred_refs = [], [], []
    print(f"Building v4 features pentru {len(upcoming_raw)} meciuri...")
    for ev in upcoming_raw:
        eid_key = str(event_id(ev))
        bundle = v2_events.get(eid_key) if isinstance(v2_events, dict) else None
        cached_pred = bundle.get("prediction") if isinstance(bundle, dict) and isinstance(bundle.get("prediction"), dict) else None
        pred = pred_map.get(eid_key) or cached_pred
        row = normalize_current_row(ev, pred)
        apply_v2_bundle_to_row(row, bundle)
        try:
            feats = build_features_for_current(row, pred, league_baselines, team_index, pair_rows, stats_cache, incidents_cache, shotmap_cache, elo_cache, hist_rows_sorted)
        except Exception as exc:
            print(f"  WARN features {row.get('event_id')}: {exc}")
            feats = {"event_id": row.get("event_id"), "league": row.get("league", "Unknown"), "home_streak_type": "N", "away_streak_type": "N", "data_quality_score": 35}
        current_rows.append(row)
        feats_list.append(feats)
        pred_refs.append(pred)

    signals = []
    for market_key, info in TARGETS.items():
        model_path = MODELS_DIR / f"catboost_{market_key}.cbm"
        if not model_path.exists():
            print(f"  Model {market_key} lipsă, skip.")
            continue
        print(f"  Inferență {market_key}...")
        probs = run_catboost_inference(feats_list, market_key, feat_cols, model_path, feature_defaults=feature_defaults)
        if probs is None:
            print(f"  WARN: inferență eșuată pentru {market_key}")
            continue

        mm = markets_meta.get(market_key, {}) if isinstance(markets_meta, dict) else {}
        wfv_auc = mm.get("wfv_avg_auc")
        ece = mm.get("test_ece")
        quality_gate = mm.get("quality_gate") or quality_gate_from_metrics(wfv_auc, ece)

        for row, feat, pred, cat_prob in zip(current_rows, feats_list, pred_refs, probs):
            odds, odds_meta = best_odds(row, market_key)
            lo, hi = ODDS_RANGE_BY_MARKET.get(market_key, (1.12, 5.5))
            if odds < lo or odds > hi:
                continue
            nv_p = market_nv_probability(row, market_key, odds)
            if nv_p is None:
                continue
            api_p = api_probability(row, pred, market_key)
            pois_p = poisson_probability(feat, row, pred, market_key)
            poly_p = polymarket_probability(row, market_key)
            stats_p = stats_profile_probability(feat, market_key)
            final_p, blend_meta = blend_probability(cat_prob, nv_p, api_p, pois_p, poly_p, stats_p, wfv_auc, ece, feat.get("data_quality_score"))

            if final_p < PROB_MIN_BY_MARKET.get(market_key, 0.48):
                continue
            edge_pp = round((final_p - nv_p) * 100.0, 3)
            if edge_pp < EDGE_MIN_BY_MARKET.get(market_key, 2.5):
                continue
            evp = ev_pct(final_p, odds)
            if evp is None or evp < EV_MIN_BY_MARKET.get(market_key, 0.0):
                continue
            kelly_pct = kelly(final_p, odds)
            if kelly_pct <= 0:
                continue

            rel = blend_meta["reliability"]
            agreement = blend_meta["agreement"]
            lineup_risk = lineup_risk_score(row)
            context_risk = context_risk_score(row)
            market_bonus = market_intel_bonus(odds_meta)
            stats_bonus = stats_context_bonus(feat, market_key)
            score = smartbet_score(final_p, edge_pp, evp, kelly_pct, rel, agreement)
            score = round(clamp(score * (1.0 - lineup_risk * 0.18 - context_risk * 0.16) + market_bonus + stats_bonus, 0.0, 100.0), 1)
            # Gating suplimentar: nu ridicăm semnale premium când datele sunt subțiri, contextul e riscant sau modelele nu se confirmă.
            if _f(feat.get("data_quality_score"), 0) < 52 and score < 70:
                continue
            if score < 52:
                continue
            if agreement < 0.38 and score < 72:
                continue
            if (lineup_risk + context_risk) >= 0.38 and score < 76:
                continue

            interval = round((1.0 - agreement) * 9.0 + (1.0 - rel) * 8.0, 2)
            prob_low = round(max(0.01, final_p * 100.0 - interval), 2)
            prob_high = round(min(99.0, final_p * 100.0 + interval), 2)
            tier = risk_tier(score, final_p, edge_pp, rel)
            best_bookmaker = odds_meta.get("best_bookmaker") if isinstance(odds_meta, dict) else None
            signals.append({
                "event_id": row.get("event_id"),
                "date": str(row.get("date") or row.get("event_date") or "")[:10],
                "home": row.get("home_team"),
                "away": row.get("away_team"),
                "league": row.get("league", ""),
                "market": market_key,
                "market_label": info["label"],
                "model_prob": round(cat_prob, 6),
                "final_prob": final_p,
                "adjusted_prob": round(final_p * 100.0, 2),
                "prob_low": prob_low,
                "prob_high": prob_high,
                "api_prob": round(api_p, 6) if api_p is not None else None,
                "poisson_prob": round(pois_p, 6) if pois_p is not None else None,
                "polymarket_prob": round(poly_p, 6) if poly_p is not None else None,
                "stats_profile_prob": round(stats_p, 6) if stats_p is not None else None,
                "odds": odds,
                "best_bookmaker": best_bookmaker,
                "bookmakers_count": odds_meta.get("bookmakers_count") if isinstance(odds_meta, dict) else None,
                "movement_balance": odds_meta.get("movement_balance") if isinstance(odds_meta, dict) else None,
                "odds_dispersion": odds_meta.get("odds_dispersion") if isinstance(odds_meta, dict) else None,
                "nv_prob": round(nv_p, 6),
                "edge_pp": edge_pp,
                "ev_pct": evp,
                "kelly_pct": kelly_pct,
                "fair_odds": fair_odds(final_p),
                "wfv_auc": wfv_auc,
                "test_ece": ece,
                "quality_gate": quality_gate,
                "data_quality_score": feat.get("data_quality_score"),
                "agreement": agreement,
                "disagreement": blend_meta["disagreement"],
                "reliability": rel,
                "lineup_risk": lineup_risk,
                "context_risk": context_risk,
                "market_intel_bonus": market_bonus,
                "stats_context_bonus": stats_bonus,
                "score": score,
                "risk_tier": tier,
                "signal": "STRONG BUY" if score >= 82 else ("BUY" if score >= 70 else "WATCH"),
                "model_version": "veyra-supreme-engine-v5",
                "blend": blend_meta,
                "rationale": f"{info['label']}: p_final={final_p*100:.1f}% (CatBoost {cat_prob*100:.1f}%, market {nv_p*100:.1f}%, API {(api_p*100 if api_p is not None else 0):.1f}%" + (f", Poisson {pois_p*100:.1f}%" if pois_p is not None else "") + (f", Polymarket {poly_p*100:.1f}%" if poly_p is not None else "") + (f", StatsProfile {stats_p*100:.1f}%" if stats_p is not None else "") + f"), edge {edge_pp:+.1f}pp, EV {evp:+.1f}%, Kelly¼ {kelly_pct:.2f}%, acord {agreement*100:.0f}%, risk lineup/context {lineup_risk:.2f}/{context_risk:.2f}.",
            })

    signals.sort(key=lambda x: (x.get("score", 0), x.get("final_prob", 0), x.get("edge_pp", 0)), reverse=True)
    elite = [s for s in signals if s.get("score", 0) >= 82]
    a_quality = [s for s in signals if str(s.get("quality_gate", "")).upper() == "A"]
    low_risk = [s for s in signals if (float(s.get("lineup_risk") or 0) + float(s.get("context_risk") or 0)) <= 0.22]
    avg_score = round(sum(float(s.get("score") or 0) for s in signals) / len(signals), 2) if signals else 0
    avg_agreement = round(sum(float(s.get("agreement") or 0) for s in signals) / len(signals), 4) if signals else 0
    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "engine_version": "veyra-supreme-engine-v5",
        "display_name": "VEYRA Supreme Engine v5",
        "signals_count": len(signals),
        "supreme_summary": {
            "elite_count": len(elite),
            "quality_a_count": len(a_quality),
            "low_risk_count": len(low_risk),
            "avg_score": avg_score,
            "avg_agreement_pct": round(avg_agreement * 100, 1),
            "sources": ["CatBoost", "BSD API v2", "Market no-vig", "Odds comparison", "Poisson", "Polymarket", "Stats/Shotmap/Incidents", "AI Memory", "Risk Shield"],
            "cache_counts": cache_counts,
            "vip_rule": "VIP folosește doar scor ridicat, acord între surse, risc controlat și cotă totală 1.30–1.50."
        },
        "quality_policy": {
            "probability": "CatBoost calibrat + BSD Predictions v2 + no-vig market + odds comparison + Polymarket + Poisson + StatsProfile din stats/shotmap/incidents cu shrink pe dezacord",
            "gates": "prob_min/edge_min/EV/Kelly/data-quality/agreement/WFV/lineup-risk/context-risk",
        },
        "signals": signals,
    }
    save_json(DATA_DIR / "supreme_engine_v5.json", out)
    save_json(DATA_DIR / "ev_signals_v2.json", out)
    print(f"Semnale EV+ generate: {len(signals)}")
    for signal in signals[:8]:
        print(f"  [{signal['score']:5.1f}] {signal['market']:8s} | {str(signal['home'])[:15]:15s} vs {str(signal['away'])[:15]:15s} | p={signal['final_prob']:.3f} edge={signal['edge_pp']:+.1f}pp EV={signal['ev_pct']:+.1f}%")


if __name__ == "__main__":
    main()
