#!/usr/bin/env python3
"""
Hybrid Adaptive Betting Engine for BetAnalytics Pro.

This script keeps the current V17 architecture intact and adds a closed learning loop:
- API historical base rates estimate the statistical probability by league/market.
- Recommendation journal feedback adjusts the model with 90-day exponential decay.
- AI Memory and training model readiness add pattern/context confidence.
- The final output is written to data/adaptive_predictions.json for the UI runtime bridge.

No external dependencies are required, so it runs safely in GitHub Actions.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fetch_data import load_existing_json, save_json, TZ

ENGINE_VERSION = "v18-hybrid-adaptive-mvp"
HALF_LIFE_DAYS = 90.0
SUPPORTED_MARKETS = {"over15", "over25", "under35", "btts", "home_win", "draw", "away_win", "1x", "x2", "12"}
GOAL_MARKETS = {"over15", "over25", "under35", "btts"}


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


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


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


def decay_weight(value: Any, half_life_days: float = HALF_LIFE_DAYS) -> float:
    dt = parse_dt(value)
    if not dt:
        return 0.62
    age_days = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0)
    return float(math.pow(0.5, age_days / half_life_days))


def sigmoid(x: float) -> float:
    x = clamp(x, -12.0, 12.0)
    return 1.0 / (1.0 + math.exp(-x))


def logit(p: float) -> float:
    p = clamp(p, 0.01, 0.99)
    return math.log(p / (1.0 - p))


def pct(part: float, total: float) -> float:
    return round((part / total) * 100.0, 2) if total else 0.0


def market_key(value: Any) -> str:
    text = str(value or "").lower().strip()
    text = text.replace(" ", "").replace("_", "").replace(".", "")
    aliases = {
        "over15": "over15", "peste15": "over15", "o15": "over15", "+15g": "over15", "over1,5": "over15",
        "over25": "over25", "peste25": "over25", "o25": "over25", "+25g": "over25", "over2,5": "over25",
        "under35": "under35", "sub35": "under35", "u35": "under35", "under3,5": "under35",
        "btts": "btts", "gg": "btts", "ambele": "btts", "ambele marcheaza": "btts", "ambelemarcheaza": "btts",
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
    if text in SUPPORTED_MARKETS:
        return text
    return text[:32] if text else "unknown"


def odds_bucket(value: Any) -> str:
    odd = to_float(value)
    if odd <= 0:
        return "unknown"
    if odd < 1.25:
        return "1.01-1.24"
    if odd < 1.35:
        return "1.25-1.34"
    if odd < 1.50:
        return "1.35-1.49"
    if odd < 1.66:
        return "1.50-1.65"
    if odd < 1.81:
        return "1.66-1.80"
    if odd < 2.10:
        return "1.81-2.09"
    return "2.10+"


def conf_bucket(value: Any) -> str:
    v = to_float(value)
    if v < 55:
        return "<55"
    if v < 65:
        return "55-64"
    if v < 75:
        return "65-74"
    if v < 85:
        return "75-84"
    return "85+"


def edge_bucket(value: Any) -> str:
    v = to_float(value)
    if v < 0:
        return "negative"
    if v < 3:
        return "0-2.9"
    if v < 6:
        return "3-5.9"
    if v < 9:
        return "6-8.9"
    return "9+"


def weekday_label(value: Any) -> str:
    dt = parse_dt(value)
    if not dt:
        return "unknown"
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dt.weekday()]


def settled_outcome(row: Dict[str, Any]) -> Optional[bool]:
    status = str(row.get("status") or row.get("result") or "").lower().strip()
    if status in {"void", "push", "cancelled", "canceled", "pending", "open"}:
        return None
    if row.get("won") is not None:
        return bool(row.get("won"))
    if status in {"win", "won", "green", "success"}:
        return True
    if status in {"loss", "lose", "lost", "red", "failed"}:
        return False
    profit = row.get("profit")
    if profit is not None:
        p = to_float(profit, 0.0)
        if abs(p) > 1e-9:
            return p > 0
    return None


def extract_journal_rows(raw: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()
    for row in raw or []:
        if not isinstance(row, dict):
            continue
        won = settled_outcome(row)
        if won is None:
            continue
        mkt = market_key(row.get("market_key") or row.get("market") or row.get("bet") or row.get("pick"))
        if not mkt or mkt == "unknown":
            continue
        event_date = row.get("event_date") or row.get("date") or row.get("match_date") or row.get("logged_at") or row.get("created_at")
        key = "|".join([
            str(row.get("event_id") or row.get("match_id") or row.get("home") or row.get("home_team") or ""),
            str(row.get("away") or row.get("away_team") or ""),
            str(mkt),
            str(event_date)[:10],
        ])
        if key in seen:
            continue
        seen.add(key)
        odds = to_float(row.get("odds") or row.get("book_odds") or row.get("opening_odds"), 0.0)
        rows.append({
            "event_id": row.get("event_id") or row.get("match_id"),
            "home": row.get("home") or row.get("home_team"),
            "away": row.get("away") or row.get("away_team"),
            "league": row.get("league") or row.get("competition") or "Unknown",
            "market_key": mkt,
            "market": row.get("market") or row.get("bet") or mkt,
            "odds": odds,
            "confidence": row.get("confidence") or row.get("smart_score") or row.get("score"),
            "edge_pct": row.get("edge_pct") or row.get("edge") or 0,
            "event_date": event_date,
            "settled_at": row.get("settled_at") or row.get("result_at") or event_date,
            "won": won,
        })
    return rows


def stat_template(kind: str, key: str, label: str) -> Dict[str, Any]:
    return {
        "kind": kind,
        "key": key,
        "label": label,
        "raw_bets": 0,
        "bets_w": 0.0,
        "wins_w": 0.0,
        "profit_w": 0.0,
        "odds_sum": 0.0,
        "edge_sum": 0.0,
    }


def update_stat(store: Dict[str, Dict[str, Dict[str, Any]]], kind: str, key: str, label: str, row: Dict[str, Any], weight: float) -> None:
    bucket = store.setdefault(kind, {})
    stat = bucket.setdefault(key, stat_template(kind, key, label))
    odds = to_float(row.get("odds"), 0.0)
    stat["raw_bets"] += 1
    stat["bets_w"] += weight
    stat["wins_w"] += weight if row.get("won") else 0.0
    if row.get("won"):
        stat["profit_w"] += max(0.0, odds - 1.0) * weight
    else:
        stat["profit_w"] -= 1.0 * weight
    stat["odds_sum"] += odds
    stat["edge_sum"] += to_float(row.get("edge_pct"), 0.0)


def finalize_stat(stat: Dict[str, Any]) -> Dict[str, Any]:
    raw = to_int(stat.get("raw_bets"))
    bets_w = to_float(stat.get("bets_w"))
    wins_w = to_float(stat.get("wins_w"))
    profit_w = to_float(stat.get("profit_w"))
    avg_odds = to_float(stat.get("odds_sum")) / raw if raw else 0.0
    avg_edge = to_float(stat.get("edge_sum")) / raw if raw else 0.0
    winrate = pct(wins_w, bets_w)
    roi = pct(profit_w, bets_w)
    sample_factor = min(1.0, math.sqrt(max(raw, 0) / 18.0))
    # Shrunk practical score: ROI matters, but small samples cannot dominate.
    memory_score = ((roi * 0.055) + ((winrate - 55.0) * 0.060) + (avg_edge * 0.22)) * sample_factor
    out = dict(stat)
    out.update({
        "bets_w": round(bets_w, 3),
        "wins_w": round(wins_w, 3),
        "profit_w": round(profit_w, 3),
        "winrate": round(winrate, 2),
        "roi": round(roi, 2),
        "avg_odds": round(avg_odds, 3),
        "avg_edge": round(avg_edge, 2),
        "memory_score": round(clamp(memory_score, -9.0, 9.0), 3),
        "sample_reliability": round(sample_factor, 3),
    })
    return out


def build_journal_memory(rows: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    stats: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for row in rows:
        weight = decay_weight(row.get("settled_at") or row.get("event_date"))
        mkt = row.get("market_key") or "unknown"
        league = str(row.get("league") or "Unknown")
        label = str(row.get("market") or mkt)
        update_stat(stats, "market", mkt, label, row, weight)
        update_stat(stats, "market_league", f"{mkt}|{league}", f"{label} • {league}", row, weight)
        update_stat(stats, "market_odds", f"{mkt}|{odds_bucket(row.get('odds'))}", f"{label} • odds {odds_bucket(row.get('odds'))}", row, weight)
        update_stat(stats, "market_conf", f"{mkt}|{conf_bucket(row.get('confidence'))}", f"{label} • conf {conf_bucket(row.get('confidence'))}", row, weight)
        update_stat(stats, "market_edge", f"{mkt}|{edge_bucket(row.get('edge_pct'))}", f"{label} • edge {edge_bucket(row.get('edge_pct'))}", row, weight)
        update_stat(stats, "market_weekday", f"{mkt}|{weekday_label(row.get('event_date'))}", f"{label} • {weekday_label(row.get('event_date'))}", row, weight)

    final: Dict[str, Any] = {}
    flat: List[Dict[str, Any]] = []
    for kind, bucket in stats.items():
        final[kind] = {}
        for key, stat in bucket.items():
            out = finalize_stat(stat)
            final[kind][key] = out
            flat.append(out)
    flat.sort(key=lambda r: (abs(to_float(r.get("memory_score"))), to_int(r.get("raw_bets"))), reverse=True)
    return final, flat


def get_stat(memory: Dict[str, Any], kind: str, key: str, min_bets: int) -> Optional[Dict[str, Any]]:
    stat = (memory.get(kind) or {}).get(key)
    if not stat or to_int(stat.get("raw_bets")) < min_bets:
        return None
    return stat


def load_signal_rows(signal_audit: Dict[str, Any]) -> List[Dict[str, Any]]:
    if isinstance(signal_audit, dict):
        rows = signal_audit.get("rows") or signal_audit.get("picks") or signal_audit.get("items") or []
        return [r for r in rows if isinstance(r, dict)]
    if isinstance(signal_audit, list):
        return [r for r in signal_audit if isinstance(r, dict)]
    return []


def market_rate_key(mkt: str) -> Optional[str]:
    return {
        "over15": "over_15_rate",
        "over25": "over_25_rate",
        "under35": "under_35_rate",
        "btts": "btts_yes_rate",
        "home_win": "home_win_rate",
        "draw": "draw_rate",
        "away_win": "away_win_rate",
    }.get(mkt)


def build_api_baseline_map(baselines: Iterable[Dict[str, Any]], scoring_summary: Dict[str, Any]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, float]]:
    by_league: Dict[str, Dict[str, Any]] = {}
    for row in baselines or []:
        if not isinstance(row, dict):
            continue
        league = str(row.get("league") or "Unknown")
        by_league[league] = row
    global_rates = {
        "over15": to_float(scoring_summary.get("over_15_rate_total"), 72.0) / 100.0,
        "over25": to_float(scoring_summary.get("over_25_rate_total"), 51.0) / 100.0,
        "under35": to_float(scoring_summary.get("under_35_rate_total"), 78.0) / 100.0,
        "btts": to_float(scoring_summary.get("btts_yes_rate_total"), 52.0) / 100.0,
        "home_win": to_float(scoring_summary.get("home_win_rate_total"), 43.0) / 100.0,
        "draw": to_float(scoring_summary.get("draw_rate_total"), 27.0) / 100.0,
        "away_win": to_float(scoring_summary.get("away_win_rate_total"), 30.0) / 100.0,
    }
    return by_league, global_rates


def api_probability(row: Dict[str, Any], by_league: Dict[str, Dict[str, Any]], global_rates: Dict[str, float], mkt: str, base_prob: float) -> Tuple[float, Dict[str, Any]]:
    rate_key = market_rate_key(mkt)
    league = str(row.get("league") or row.get("competition") or "Unknown")
    league_row = by_league.get(league) or {}
    league_matches = to_int(league_row.get("matches") or league_row.get("league_matches"), 0)
    global_prob = global_rates.get(mkt, base_prob)
    league_prob = to_float(league_row.get(rate_key), global_prob * 100.0) / 100.0 if rate_key else global_prob
    reliability = min(0.35, math.sqrt(max(league_matches, 0)) / math.sqrt(1200.0) * 0.35) if league_matches else 0.08
    p = (base_prob * (1.0 - reliability)) + (league_prob * reliability)
    return clamp(p, 0.03, 0.97), {
        "league": league,
        "league_matches": league_matches,
        "league_probability": round(league_prob * 100.0, 2),
        "global_probability": round(global_prob * 100.0, 2),
        "api_reliability": round(reliability, 3),
    }


def row_probability(row: Dict[str, Any]) -> float:
    for key in ("adjusted_prob", "probability", "prob", "model_probability", "confidence"):
        value = row.get(key)
        if value is not None:
            v = to_float(value)
            if v > 1.0:
                v /= 100.0
            return clamp(v, 0.03, 0.97)
    odds = to_float(row.get("odds") or row.get("book_odds"), 0.0)
    return clamp((1.0 / odds) if odds > 1.01 else 0.55, 0.03, 0.97)


def row_odds(row: Dict[str, Any]) -> float:
    for key in ("book_odds", "odds", "baseOdds", "bestOdds", "avgMarketOdds"):
        odds = to_float(row.get(key), 0.0)
        if odds > 1.01:
            return odds
    return 0.0


def expected_value(prob: float, odds: float) -> float:
    if odds <= 1.01:
        return 0.0
    return prob * odds - 1.0


def fair_odds(prob: float) -> float:
    return round(1.0 / clamp(prob, 0.01, 0.99), 2)


def training_ready_map(summary: Dict[str, Any]) -> Dict[str, bool]:
    mapping: Dict[str, bool] = {}
    for row in summary.get("markets") or []:
        if not isinstance(row, dict):
            continue
        name = str(row.get("market") or "").lower()
        ready = bool(row.get("ready"))
        if "over 2.5" in name or "over2" in name:
            mapping["over25"] = ready
        if "under 3.5" in name or "under3" in name:
            mapping["under35"] = ready
        if "btts" in name:
            mapping["btts"] = ready
        if "home" in name:
            mapping["home_win"] = ready
        if "draw" in name:
            mapping["draw"] = ready
        if "away" in name:
            mapping["away_win"] = ready
    # Over 1.5 is not always in the model summary; keep it true when the training base is broadly ready.
    mapping.setdefault("over15", to_int(summary.get("rows_eligible_min5"), 0) >= 1000)
    return mapping


def journal_adjustment(row: Dict[str, Any], memory: Dict[str, Any], mkt: str) -> Tuple[float, List[Dict[str, Any]], int]:
    league = str(row.get("league") or row.get("competition") or "Unknown")
    odds = row_odds(row)
    conf = row.get("confidence") or row.get("adjusted_prob") or row.get("score")
    edge = row.get("edge_pct") or row.get("edge") or 0
    checks = [
        ("market", mkt, 8, 0.38, "piață"),
        ("market_league", f"{mkt}|{league}", 5, 0.46, "ligă + piață"),
        ("market_odds", f"{mkt}|{odds_bucket(odds)}", 5, 0.30, "bucket cotă"),
        ("market_conf", f"{mkt}|{conf_bucket(conf)}", 5, 0.22, "bucket încredere"),
        ("market_edge", f"{mkt}|{edge_bucket(edge)}", 5, 0.18, "bucket edge"),
        ("market_weekday", f"{mkt}|{weekday_label(row.get('event_date') or row.get('date'))}", 5, 0.10, "zi săptămână"),
    ]
    total = 0.0
    reasons: List[Dict[str, Any]] = []
    sample_max = 0
    for kind, key, min_bets, weight, label in checks:
        stat = get_stat(memory, kind, key, min_bets=min_bets)
        if not stat:
            continue
        sample_max = max(sample_max, to_int(stat.get("raw_bets")))
        impact = to_float(stat.get("memory_score")) * weight
        total += impact
        if abs(impact) >= 0.35:
            reasons.append({
                "source": "journal",
                "label": label,
                "impact_score": round(impact, 2),
                "bets": to_int(stat.get("raw_bets")),
                "roi": round(to_float(stat.get("roi")), 2),
                "winrate": round(to_float(stat.get("winrate")), 2),
            })
    return clamp(total, -6.0, 6.0), reasons[:4], sample_max


def ai_memory_hint(row: Dict[str, Any], ai_memory: Dict[str, Any]) -> Tuple[float, List[Dict[str, Any]]]:
    home = str(row.get("home") or row.get("home_team") or "").lower()
    away = str(row.get("away") or row.get("away_team") or "").lower()
    mkt = market_key(row.get("market_key") or row.get("market"))
    best_bonus = 0.0
    reasons: List[Dict[str, Any]] = []
    for pick in ai_memory.get("adaptive_picks") or []:
        if not isinstance(pick, dict):
            continue
        ph = str(pick.get("home") or pick.get("home_team") or "").lower()
        pa = str(pick.get("away") or pick.get("away_team") or "").lower()
        pm = market_key(pick.get("market_key") or pick.get("market"))
        same_match = (home and away and home == ph and away == pa)
        same_market = pm == mkt
        if same_match or (same_market and str(pick.get("league") or "") == str(row.get("league") or "")):
            bonus = clamp(to_float(pick.get("memory_bonus"), 0.0), -5.0, 5.0)
            if abs(bonus) > abs(best_bonus):
                best_bonus = bonus
                reasons = [{"source": "ai_memory", "label": "pattern AI Memory", "impact_score": round(bonus * 0.28, 2)}]
    return clamp(best_bonus * 0.28, -1.4, 1.4), reasons


def smart_score(prob: float, odds: float, ev: float, journal_score: float, api_reliability: float, calibrated: bool, risk_penalty: float) -> float:
    implied = (1.0 / odds) if odds > 1.01 else 0.0
    edge = max(-0.10, min(0.18, prob - implied)) if implied else 0.0
    score = 0.0
    score += prob * 48.0
    score += clamp(ev, -0.05, 0.16) * 155.0
    score += clamp(edge, -0.06, 0.14) * 110.0
    score += clamp(journal_score, -6.0, 6.0) * 1.65
    score += api_reliability * 9.0
    score += 4.0 if calibrated else 0.0
    score -= risk_penalty * 100.0
    return round(clamp(score, 0.0, 100.0), 2)


def adapt_row(row: Dict[str, Any], memory: Dict[str, Any], by_league: Dict[str, Dict[str, Any]], global_rates: Dict[str, float], training_ready: Dict[str, bool], ai_memory: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    mkt = market_key(row.get("market_key") or row.get("market") or row.get("bet"))
    base_prob = row_probability(row)
    api_prob, api_meta = api_probability(row, by_league, global_rates, mkt, base_prob)
    j_score, j_reasons, j_sample = journal_adjustment(row, memory, mkt)
    ai_delta, ai_reasons = ai_memory_hint(row, ai_memory)
    calibrated = bool(training_ready.get(mkt, False))
    odds = row_odds(row)

    risk_penalty = 0.0
    if j_sample < 5:
        risk_penalty += 0.012
    if odds >= 2.10:
        risk_penalty += 0.020
    elif odds >= 1.80:
        risk_penalty += 0.010
    if mkt not in SUPPORTED_MARKETS:
        risk_penalty += 0.020
    if not calibrated and mkt in GOAL_MARKETS:
        risk_penalty += 0.010

    # Convert practical scores into logit deltas. Keep the cap tight to avoid overfitting.
    journal_delta = clamp(j_score * 0.038, -0.24, 0.24)
    calibration_delta = 0.035 if calibrated else -0.010
    api_delta = (api_prob - base_prob) * 1.15
    z = logit(base_prob) + api_delta + journal_delta + ai_delta + calibration_delta - risk_penalty
    final_prob = clamp(sigmoid(z), 0.03, 0.97)

    ev = expected_value(final_prob, odds)
    implied = (1.0 / odds) if odds > 1.01 else 0.0
    edge_pct = (final_prob - implied) * 100.0 if implied else 0.0
    score = smart_score(final_prob, odds, ev, j_score, to_float(api_meta.get("api_reliability")), calibrated, risk_penalty)

    explain = {
        "api_history_score": round((api_prob - base_prob) * 100.0, 2),
        "journal_score": round(j_score, 2),
        "ai_memory_score": round(ai_delta, 2),
        "market_calibration_score": round(3.5 if calibrated else -1.0, 2),
        "risk_penalty_score": round(-risk_penalty * 100.0, 2),
        "api_meta": api_meta,
        "journal_reasons": j_reasons,
        "ai_memory_reasons": ai_reasons,
    }

    out.update({
        "engine_version": ENGINE_VERSION,
        "market_key": mkt,
        "base_probability": round(base_prob * 100.0, 2),
        "api_probability": round(api_prob * 100.0, 2),
        "final_probability": round(final_prob * 100.0, 2),
        "adjusted_prob": round(final_prob * 100.0, 2),
        "book_odds": round(odds, 3) if odds else out.get("book_odds") or out.get("odds"),
        "fair_odds": fair_odds(final_prob),
        "ev": round(ev, 4),
        "value_pct": round(ev * 100.0, 2),
        "edge_pct": round(edge_pct, 2),
        "smart_score": score,
        "adaptive_score": score,
        "journal_score": round(j_score, 2),
        "journal_sample": j_sample,
        "market_calibrated": calibrated,
        "risk_penalty": round(risk_penalty, 4),
        "learning_state": "accelerating" if j_score >= 2.0 and ev > 0 else ("cautious" if j_score <= -2.0 or risk_penalty >= 0.03 else "stable"),
        "explain": explain,
    })
    return out


def build_diagnostics(journal_rows: List[Dict[str, Any]], flat_patterns: List[Dict[str, Any]], adaptive_rows: List[Dict[str, Any]], api_summary: Dict[str, Any], training_summary: Dict[str, Any]) -> Dict[str, Any]:
    settled = len(journal_rows)
    profit = 0.0
    stake = 0.0
    wins = 0
    by_market: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"bets": 0, "wins": 0, "profit": 0.0})
    for row in journal_rows:
        odds = to_float(row.get("odds"), 0.0)
        mkt = row.get("market_key") or "unknown"
        stake += 1.0
        by_market[mkt]["bets"] += 1
        if row.get("won"):
            wins += 1
            p = max(0.0, odds - 1.0)
            profit += p
            by_market[mkt]["wins"] += 1
            by_market[mkt]["profit"] += p
        else:
            profit -= 1.0
            by_market[mkt]["profit"] -= 1.0
    market_rows = []
    for mkt, item in by_market.items():
        bets = to_int(item.get("bets"))
        market_rows.append({
            "market": mkt,
            "bets": bets,
            "wins": to_int(item.get("wins")),
            "winrate": pct(to_float(item.get("wins")), bets),
            "roi": pct(to_float(item.get("profit")), bets),
        })
    market_rows.sort(key=lambda r: (to_int(r.get("bets")), to_float(r.get("roi"))), reverse=True)
    return {
        "version": ENGINE_VERSION,
        "updated_at": now_iso(),
        "timezone": TZ,
        "journal_settled_rows": settled,
        "journal_winrate": pct(wins, settled),
        "journal_roi": pct(profit, stake),
        "adaptive_rows": len(adaptive_rows),
        "adaptive_picks": len([r for r in adaptive_rows if to_float(r.get("smart_score")) >= 74.0]),
        "positive_patterns": len([p for p in flat_patterns if to_int(p.get("raw_bets")) >= 5 and to_float(p.get("memory_score")) > 0]),
        "negative_patterns": len([p for p in flat_patterns if to_int(p.get("raw_bets")) >= 5 and to_float(p.get("memory_score")) < 0]),
        "api_history": {
            "leagues": api_summary.get("leagues_total_raw") or api_summary.get("leagues_total_eligible") or api_summary.get("leagues_total"),
            "matches": api_summary.get("matches_total") or api_summary.get("rows_total"),
            "avg_goals": api_summary.get("avg_goals_total"),
        },
        "training": {
            "rows_total": training_summary.get("rows_total"),
            "rows_eligible_min5": training_summary.get("rows_eligible_min5"),
            "ready_markets": sum(1 for m in training_summary.get("markets") or [] if isinstance(m, dict) and m.get("ready")),
        },
        "by_market": market_rows,
        "transparency": {
            "calibration_note": "MVP uses logit blending and shrinkage; advanced V18 can add CatBoost/LightGBM + isotonic calibration + SHAP.",
            "validation_note": "Keep all future ML validation time-based/walk-forward; do not use random split for betting.",
            "decay": f"exponential half-life {int(HALF_LIFE_DAYS)} days",
        },
    }


def main() -> None:
    print("=== Build Hybrid Adaptive Predictions ===")
    signal_audit = load_existing_json("signal_audit.json", {}) or {}
    ai_memory = load_existing_json("ai_memory.json", {}) or {}
    training_summary = load_existing_json("training_model_summary.json", {}) or {}
    baselines = load_existing_json("training_market_baselines.json", []) or []
    scoring_summary = load_existing_json("training_scoring_summary.json", {}) or {}
    api_events_summary = load_existing_json("api_events_history_summary.json", {}) or {}
    journal_raw = load_existing_json("recommendation_journal.json", []) or []

    journal_rows = extract_journal_rows(journal_raw)
    journal_memory, flat_patterns = build_journal_memory(journal_rows)
    by_league, global_rates = build_api_baseline_map(baselines, scoring_summary)
    ready = training_ready_map(training_summary)
    signal_rows = load_signal_rows(signal_audit)

    adaptive_rows = [adapt_row(row, journal_memory, by_league, global_rates, ready, ai_memory) for row in signal_rows]
    adaptive_rows.sort(key=lambda r: (to_float(r.get("smart_score")), to_float(r.get("ev")), to_float(r.get("final_probability"))), reverse=True)
    adaptive_picks = [r for r in adaptive_rows if to_float(r.get("smart_score")) >= 74.0][:18]
    if not adaptive_picks:
        adaptive_picks = adaptive_rows[:12]

    diagnostics = build_diagnostics(journal_rows, flat_patterns, adaptive_rows, scoring_summary or api_events_summary, training_summary)
    top_patterns = [p for p in flat_patterns if to_int(p.get("raw_bets")) >= 5 and to_float(p.get("memory_score")) > 0][:18]
    avoid_patterns = [p for p in flat_patterns if to_int(p.get("raw_bets")) >= 5 and to_float(p.get("memory_score")) < 0]
    avoid_patterns.sort(key=lambda r: (to_float(r.get("memory_score")), -to_int(r.get("raw_bets"))))
    avoid_patterns = avoid_patterns[:18]

    journal_memory_payload = {
        "version": ENGINE_VERSION,
        "updated_at": now_iso(),
        "timezone": TZ,
        "decay_half_life_days": HALF_LIFE_DAYS,
        "summary": {
            "settled_rows": len(journal_rows),
            "positive_patterns": len(top_patterns),
            "negative_patterns": len(avoid_patterns),
            "pattern_groups": len(journal_memory),
        },
        "top_patterns": top_patterns,
        "avoid_patterns": avoid_patterns,
        "patterns": journal_memory,
    }

    payload = {
        "version": ENGINE_VERSION,
        "updated_at": now_iso(),
        "timezone": TZ,
        "rows": adaptive_rows,
        "adaptive_picks": adaptive_picks,
        "summary": {
            "adaptive_rows": len(adaptive_rows),
            "adaptive_picks": len(adaptive_picks),
            "journal_settled_rows": len(journal_rows),
            "positive_patterns": len(top_patterns),
            "negative_patterns": len(avoid_patterns),
            "api_history_leagues": diagnostics.get("api_history", {}).get("leagues"),
            "api_history_matches": diagnostics.get("api_history", {}).get("matches"),
            "ready_markets": diagnostics.get("training", {}).get("ready_markets"),
        },
        "diagnostics": diagnostics,
        "notes": [
            "Hybrid engine combines API historical base rates with journal feedback using 90-day exponential decay.",
            "Journal impact is shrunk by sample size to reduce overfitting.",
            "Final probability is produced with logit blending, then EV/fair odds/SmartScore are recalculated.",
        ],
    }

    save_json(payload, "adaptive_predictions.json")
    save_json(diagnostics, "model_diagnostics.json")
    save_json(journal_memory_payload, "journal_learning_memory.json")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))
    print("=== Done Hybrid Adaptive Predictions ===")


if __name__ == "__main__":
    main()
