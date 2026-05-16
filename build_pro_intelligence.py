#!/usr/bin/env python3
"""Build the BetAnalytics Pro intelligence layer.

Outputs data/pro_intelligence.json with EV, fair odds, Kelly staking,
risk tiers, shortlist views, market performance and formulas used by the UI.
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

DATA_DIR = Path("data")


def load_json(path: Path, default: Any) -> Any:
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


def fnum(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        out = float(value)
        return default if math.isnan(out) or math.isinf(out) else out
    except Exception:
        return default


def pct_to_prob(value: Any) -> float:
    x = fnum(value, 0.0)
    return max(0.0, min(1.0, x / 100.0 if x > 1.0 else x))


def implied_probability(odds: Any) -> Optional[float]:
    o = fnum(odds, 0.0)
    return None if o <= 1.01 else 1.0 / o


def expected_value(probability: float, odds: float) -> Optional[float]:
    if odds <= 1.01:
        return None
    p = max(0.0, min(1.0, probability))
    return p * (odds - 1.0) - (1.0 - p)


def fair_odds(probability: float) -> Optional[float]:
    return None if probability <= 0.0001 else round(1.0 / probability, 3)


def kelly_fraction(probability: float, odds: float, fraction: float = 0.25, cap: float = 0.06) -> float:
    if odds <= 1.01:
        return 0.0
    p = max(0.0, min(1.0, probability))
    b = odds - 1.0
    raw = (p * b - (1.0 - p)) / b
    return round(max(0.0, min(cap, raw * fraction)), 4)


def normalize_market(label: Any) -> str:
    raw = str(label or "").strip()
    key = raw.lower().replace(" ", "")
    if "under3.5" in key or "under35" in key or "sub3.5" in key:
        return "Under 3.5G"
    if "over2.5" in key or "over25" in key or "peste2.5" in key:
        return "Over 2.5G"
    if "over1.5" in key or "over15" in key or "peste1.5" in key:
        return "Over 1.5G"
    if "btts" in key or key == "gg":
        return "BTTS"
    return raw or "unknown"


def risk_tier(probability: float, edge_pp: float, odds: float, confidence: float) -> Tuple[str, str]:
    if probability >= 0.74 and edge_pp >= 5 and odds <= 1.85 and confidence >= 58:
        return "safe", "probabilitate mare, edge pozitiv și volatilitate redusă"
    if edge_pp >= 8 and odds >= 1.75:
        return "value", "avantaj matematic puternic, dar volatilitate mai mare"
    if probability >= 0.64 and confidence >= 52:
        return "balanced", "profil echilibrat, bun pentru shortlist și confirmare manuală"
    return "speculative", "semnal slab sau volatil; miză mică ori evitare"


def candidate_from_log(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    odds = fnum(row.get("odds"), 0.0)
    probability = pct_to_prob(row.get("adjusted_prob", row.get("model_prob", row.get("probability"))))
    if odds <= 1.01 or probability <= 0:
        return None
    implied = implied_probability(odds) or 0.0
    edge_pp = (probability - implied) * 100.0
    ev = expected_value(probability, odds) or 0.0
    confidence = fnum(row.get("confidence", row.get("score", 0.0)), 0.0)
    score = fnum(row.get("score"), 0.0)
    if score <= 0:
        score = max(0.0, min(100.0, confidence * 0.55 + max(edge_pp, 0.0) * 3.5 + max(ev * 100.0, 0.0) * 0.7))
    tier, note = risk_tier(probability, edge_pp, odds, confidence)
    kelly = kelly_fraction(probability, odds)
    return {
        "event_id": row.get("event_id") or row.get("id"),
        "prediction_id": row.get("prediction_id"),
        "home": row.get("home") or row.get("home_team") or "Gazdă",
        "away": row.get("away") or row.get("away_team") or "Oaspete",
        "league": row.get("league") or "—",
        "event_date": row.get("event_date"),
        "market": normalize_market(row.get("market") or row.get("market_key")),
        "odds": round(odds, 3),
        "model_probability": round(probability, 4),
        "model_probability_pct": round(probability * 100.0, 2),
        "implied_probability_pct": round(implied * 100.0, 2),
        "fair_odds": fair_odds(probability),
        "edge_pp": round(edge_pp, 2),
        "ev_pct": round(ev * 100.0, 2),
        "kelly_fraction": kelly,
        "kelly_units_100": round(kelly * 100.0, 2),
        "confidence": round(confidence, 2),
        "score": round(score, 1),
        "risk_tier": tier,
        "risk_note": note,
        "status": row.get("status") or "pending",
        "rationale": [
            f"Probabilitate model {probability * 100:.1f}% vs. probabilitate implicată {implied * 100:.1f}%.",
            f"EV estimat {ev * 100:.1f}% și edge {edge_pp:.1f} puncte procentuale.",
            f"Miză Kelly fracțională {kelly * 100:.2f}% din bancă, plafonată prudent.",
        ],
    }


def settled_stats(rows: Iterable[Dict[str, Any]], field: str) -> List[Dict[str, Any]]:
    buckets: Dict[str, Dict[str, float]] = defaultdict(lambda: {"bets": 0, "wins": 0, "profit": 0.0, "odds": 0.0})
    for row in rows:
        status = str(row.get("status") or "").lower()
        won = row.get("won")
        if won is None and status not in {"won", "lost", "win", "loss"}:
            continue
        key = str(row.get(field) or "—")
        odds = fnum(row.get("odds"), 0.0)
        is_win = bool(won) or status in {"won", "win"}
        buckets[key]["bets"] += 1
        buckets[key]["wins"] += 1 if is_win else 0
        buckets[key]["profit"] += (odds - 1.0) if is_win and odds > 1 else -1.0
        buckets[key]["odds"] += odds if odds > 1 else 0.0
    out: List[Dict[str, Any]] = []
    for key, value in buckets.items():
        bets = int(value["bets"])
        if bets <= 0:
            continue
        out.append({
            "key": key,
            "bets": bets,
            "wins": int(value["wins"]),
            "winrate": round(value["wins"] / bets * 100.0, 2),
            "profit_units": round(value["profit"], 2),
            "roi_pct": round(value["profit"] / bets * 100.0, 2),
            "avg_odds": round(value["odds"] / bets, 3),
        })
    return sorted(out, key=lambda x: (x["roi_pct"], x["bets"]), reverse=True)


def build() -> Dict[str, Any]:
    log_rows = load_json(DATA_DIR / "ui_picks_log.json", [])
    if not isinstance(log_rows, list):
        log_rows = []
    backtest = load_json(DATA_DIR / "backtest.json", {})
    training = load_json(DATA_DIR / "training_scoring_summary.json", {})
    baselines = load_json(DATA_DIR / "training_market_baselines.json", [])

    pending = [r for r in log_rows if str(r.get("status", "pending")).lower() in {"pending", "notstarted", "scheduled", ""}]
    candidates = [candidate_from_log(r) for r in pending[:1500]]
    candidates = [c for c in candidates if c and c["ev_pct"] > -2.0]
    candidates.sort(key=lambda x: (x["score"], x["ev_pct"], x["edge_pp"], x["confidence"]), reverse=True)

    top_ev = [c for c in candidates if c["ev_pct"] > 0 and c["edge_pp"] > 2.0][:30]
    safest = sorted(candidates, key=lambda x: (x["model_probability_pct"], -x["odds"], x["confidence"]), reverse=True)[:20]
    balanced = [c for c in candidates if c["risk_tier"] in {"safe", "balanced"}][:20]

    risk_counts = Counter(c["risk_tier"] for c in candidates)
    market_counts = Counter(c["market"] for c in candidates[:150])
    league_counts = Counter(c["league"] for c in candidates[:150])

    overall_score = 0.0
    if candidates:
        overall_score += min(35.0, len(candidates) / 8.0)
        overall_score += min(25.0, len(top_ev) * 1.2)
        overall_score += min(20.0, len([c for c in candidates if c["risk_tier"] == "safe"]) * 1.5)
    overall_score += 10.0 if backtest else 0.0
    overall_score += 10.0 if training else 0.0

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "version": "pro-intelligence-v1",
        "overall_score": round(min(100.0, overall_score), 1),
        "executive_summary": {
            "title": "BetAnalytics Pro Intelligence Layer",
            "description": "Strat profesional pentru decizie: EV, fair odds, Kelly, risc, shortlist și sănătate model/date.",
            "primary_action": "Folosește Top EV pentru selecții value și Safe Picks pentru bilete conservative.",
        },
        "data_quality": {
            "recommendation_rows": len(log_rows),
            "pending_rows": len(pending),
            "candidates_with_odds_and_probability": len(candidates),
            "top_ev_count": len(top_ev),
            "has_backtest": bool(backtest),
            "has_training_summary": bool(training),
            "baseline_leagues": len(baselines) if isinstance(baselines, list) else 0,
        },
        "risk_distribution": dict(risk_counts),
        "market_distribution_top150": dict(market_counts),
        "league_distribution_top150": dict(league_counts),
        "bankroll": {
            "default_bankroll_units": 100,
            "staking_model": "quarter_kelly_capped_6_percent",
            "max_single_stake_units": 6.0,
            "daily_exposure_cap_units": 12.0,
            "safe_ticket_max_legs": 3,
            "value_ticket_max_legs": 2,
            "notes": [
                "Nu se mizează pe selecții cu EV negativ decât manual și justificat.",
                "Mizele sunt exprimate ca unități din 100 pentru controlul riscului.",
                "Dacă aceeași ligă domină shortlist-ul, expunerea se reduce pentru corelație.",
            ],
        },
        "formulas": {
            "implied_probability": "1 / decimal_odds",
            "edge_pp": "model_probability_pct - implied_probability_pct",
            "expected_value": "p * (odds - 1) - (1 - p)",
            "fair_odds": "1 / model_probability",
            "kelly_fractional": "0.25 * ((p*(odds-1) - (1-p)) / (odds-1)), capped at 6%",
            "risk_tiers": "safe/value/balanced/speculative based on probability, edge, odds and confidence",
        },
        "top_ev": top_ev,
        "safest": safest,
        "balanced": balanced,
        "settled_market_performance": settled_stats(log_rows, "market")[:12],
        "settled_league_performance": settled_stats(log_rows, "league")[:12],
        "recommendations": [
            "Prioritizează selecțiile cu EV pozitiv, edge > 3pp și Kelly fracțional peste 0.5 unități.",
            "Separă biletele safe de value; nu combina profiluri de risc diferite în același bilet.",
            "Calibrează piețele cu ROI slab sau volum mic înainte să crești miza.",
            "Folosește liga și piața ca filtre de risc, nu doar scorul final.",
        ],
    }


def main() -> None:
    payload = build()
    save_json(DATA_DIR / "pro_intelligence.json", payload)
    print(
        "Salvat data/pro_intelligence.json — "
        f"{payload['data_quality']['candidates_with_odds_and_probability']} candidați, "
        f"{len(payload['top_ev'])} top EV."
    )


if __name__ == "__main__":
    main()
