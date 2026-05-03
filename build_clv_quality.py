#!/usr/bin/env python3
"""CLV quality layer for BetAnalytics Pro.

Runs after build_clv_tracker.py and upgrades data/clv_tracker.json with:
- ROI calculated at picked/opening odds, not closing proxy odds
- per-market verdicts and operational actions
- edge/stake recommendations for selection governance

This keeps CLV as a quality filter: fewer picks are acceptable if the remaining
signals are better aligned with market movement and real ROI.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path("data")
CLV_PATH = DATA_DIR / "clv_tracker.json"


def _f(v: Any, default: float = 0.0) -> float:
    try:
        x = float(v)
        return default if math.isnan(x) or math.isinf(x) else x
    except Exception:
        return default


def load_json(path: Path, default: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def mean(values: List[float]) -> Optional[float]:
    return None if not values else sum(values) / len(values)


def median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    vals = sorted(values)
    n = len(vals)
    mid = n // 2
    if n % 2:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2.0


def std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = sum(values) / len(values)
    return math.sqrt(sum((x - mu) ** 2 for x in values) / (len(values) - 1))


def profit_at_pick(pick: Dict[str, Any]) -> float:
    odds = _f(pick.get("picked_odds"), 0.0)
    if odds <= 1.01:
        odds = _f(pick.get("opening_odds"), 0.0)
    if odds <= 1.01:
        odds = _f(pick.get("closing_odds"), 0.0)
    return (odds - 1.0) if bool(pick.get("won")) else -1.0


def profit_at_closing_proxy(pick: Dict[str, Any]) -> float:
    odds = _f(pick.get("closing_odds"), 0.0)
    return (odds - 1.0) if bool(pick.get("won")) and odds > 1.01 else -1.0


def calc_roi(picks: List[Dict[str, Any]], use_closing_proxy: bool = False) -> float:
    if not picks:
        return 0.0
    profit_fn = profit_at_closing_proxy if use_closing_proxy else profit_at_pick
    return sum(profit_fn(p) for p in picks) / len(picks) * 100.0


def normalize_picks(picks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for p in picks:
        if not isinstance(p, dict):
            continue
        q = dict(p)
        q["profit_at_pick"] = round(profit_at_pick(q), 4)
        q["profit_at_closing_proxy"] = round(profit_at_closing_proxy(q), 4)
        q["roi_basis"] = "picked_odds"
        normalized.append(q)
    return normalized


def aggregate(picks: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not picks:
        return {"total_picks": 0}
    clv_vals = [_f(p.get("clv_pct"), 0.0) for p in picks]
    wins = [p for p in picks if bool(p.get("won"))]
    losses = [p for p in picks if not bool(p.get("won"))]
    clv_pos = [p for p in picks if _f(p.get("clv_pct"), 0.0) > 0.0]
    ev_pos = [p for p in picks if _f(p.get("ev_at_pick_pct"), 0.0) > 0.0]
    n = len(picks)
    roi_pick = calc_roi(picks)
    roi_closing = calc_roi(picks, use_closing_proxy=True)
    return {
        "total_picks": n,
        "avg_clv_pct": round(mean(clv_vals) or 0.0, 4),
        "median_clv_pct": round(median(clv_vals) or 0.0, 4),
        "clv_positive_n": len(clv_pos),
        "clv_negative_n": n - len(clv_pos),
        "clv_positive_rate": round(len(clv_pos) / n, 4),
        "avg_clv_wins": round(mean([_f(p.get("clv_pct"), 0.0) for p in wins]) or 0.0, 4),
        "avg_clv_losses": round(mean([_f(p.get("clv_pct"), 0.0) for p in losses]) or 0.0, 4),
        "win_rate_pct": round(len(wins) / n * 100.0, 2),
        "roi_flat_pct": round(roi_pick, 4),
        "roi_flat_at_picked_odds_pct": round(roi_pick, 4),
        "roi_flat_closing_proxy_pct": round(roi_closing, 4),
        "roi_basis": "picked_odds",
        "roi_note": "ROI este calculat la cota luată / opening_odds, nu la closing proxy.",
        "ev_positive_n": len(ev_pos),
        "max_clv_pct": round(max(clv_vals), 4),
        "min_clv_pct": round(min(clv_vals), 4),
        "std_clv_pct": round(std(clv_vals), 4),
    }


def market_verdict(market: str, stats: Dict[str, Any]) -> Dict[str, Any]:
    n = int(stats.get("n", 0) or 0)
    avg_clv = _f(stats.get("avg_clv_pct"), 0.0)
    roi = _f(stats.get("roi_flat_pct"), 0.0)
    clv_rate = _f(stats.get("clv_positive_rate"), 0.0)

    if n < 20:
        return {
            "verdict": "SAMPLE_MIC",
            "label": "Eșantion mic",
            "severity": "info",
            "action": "Nu crește stake-ul până la minimum 20 pick-uri settle-ate.",
            "stake_policy": "sample_only",
            "edge_adjustment_pp": 0.0,
            "confidence": "low",
        }

    if avg_clv >= 0.5 and roi > 0:
        return {
            "verdict": "PROFITABIL_CONFIRMAT",
            "label": "CLV+ și ROI+",
            "severity": "good",
            "action": "Păstrează piața activă; stake normal, fără relaxare suplimentară de prag.",
            "stake_policy": "normal",
            "edge_adjustment_pp": 0.0,
            "confidence": "high" if n >= 80 else "medium",
        }

    if avg_clv >= 0.5 and roi <= 0:
        return {
            "verdict": "CLV_BUN_ROI_SLAB",
            "label": "Bate piața, dar nu convertește",
            "severity": "warn",
            "action": "Ține piața în recovery strict; cere probabilitate/edge mai mare până ROI revine pozitiv.",
            "stake_policy": "recovery_strict",
            "edge_adjustment_pp": 2.0,
            "confidence": "high" if n >= 80 else "medium",
        }

    if avg_clv < 0 and roi > 0:
        return {
            "verdict": "ROI_BUN_CLV_SLAB",
            "label": "ROI bun, CLV slab",
            "severity": "caution",
            "action": "Nu crește stake-ul; ROI-ul poate fi variance. Cere confirmare CLV înainte de scaling.",
            "stake_policy": "cap_stake",
            "edge_adjustment_pp": 1.5,
            "confidence": "high" if n >= 80 else "medium",
        }

    return {
        "verdict": "RECALIBRARE_NECESARA",
        "label": "CLV- și ROI-",
        "severity": "bad",
        "action": "Ridică pragul de edge și auditează probabilitățile/sursa cotelor pentru piața asta.",
        "stake_policy": "avoid_or_probe",
        "edge_adjustment_pp": 3.0 if avg_clv < -1.0 else 2.0,
        "confidence": "high" if n >= 80 else "medium",
        "clv_positive_rate": round(clv_rate, 4),
    }


def aggregate_by_market(picks: List[Dict[str, Any]]) -> Dict[str, Any]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for p in picks:
        groups[str(p.get("market") or "unknown")].append(p)

    result: Dict[str, Any] = {}
    for market, items in sorted(groups.items()):
        clvs = [_f(i.get("clv_pct"), 0.0) for i in items]
        wins = [i for i in items if bool(i.get("won"))]
        clv_pos = [i for i in items if _f(i.get("clv_pct"), 0.0) > 0.0]
        ev_vals = [_f(i.get("ev_at_pick_pct"), 0.0) for i in items if i.get("ev_at_pick_pct") is not None]
        stats = {
            "n": len(items),
            "avg_clv_pct": round(mean(clvs) or 0.0, 4),
            "median_clv_pct": round(median(clvs) or 0.0, 4),
            "clv_positive_rate": round(len(clv_pos) / len(items), 4),
            "win_rate_pct": round(len(wins) / len(items) * 100.0, 2),
            "roi_flat_pct": round(calc_roi(items), 4),
            "roi_flat_at_picked_odds_pct": round(calc_roi(items), 4),
            "roi_flat_closing_proxy_pct": round(calc_roi(items, use_closing_proxy=True), 4),
            "avg_ev_at_pick": round(mean(ev_vals) or 0.0, 4),
            "roi_basis": "picked_odds",
        }
        stats.update(market_verdict(market, stats))
        result[market] = stats
    return result


def aggregate_buckets(picks: List[Dict[str, Any]]) -> Dict[str, Any]:
    specs = [
        ("clv_strong_pos", lambda c: c >= 5.0),
        ("clv_mild_pos", lambda c: 0.0 < c < 5.0),
        ("clv_neutral", lambda c: -1.0 <= c <= 0.0),
        ("clv_mild_neg", lambda c: -5.0 < c < -1.0),
        ("clv_strong_neg", lambda c: c <= -5.0),
    ]
    result: Dict[str, Any] = {}
    for label, predicate in specs:
        bucket = [p for p in picks if predicate(_f(p.get("clv_pct"), 0.0))]
        if not bucket:
            result[label] = {"n": 0}
            continue
        wins = [p for p in bucket if bool(p.get("won"))]
        result[label] = {
            "n": len(bucket),
            "win_rate": round(len(wins) / len(bucket) * 100.0, 2),
            "roi_pct": round(calc_roi(bucket), 4),
            "roi_basis": "picked_odds",
            "avg_clv": round(mean([_f(p.get("clv_pct"), 0.0) for p in bucket]) or 0.0, 4),
        }
    return result


def rolling(picks: List[Dict[str, Any]], days: int) -> Dict[str, Any]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    recent = [p for p in picks if str(p.get("date") or "") >= cutoff]
    if not recent:
        return {"n": 0, "avg_clv_pct": None, "win_rate_pct": None, "roi_flat_pct": None, "days": days}
    clvs = [_f(p.get("clv_pct"), 0.0) for p in recent]
    wins = [p for p in recent if bool(p.get("won"))]
    return {
        "n": len(recent),
        "avg_clv_pct": round(mean(clvs) or 0.0, 4),
        "win_rate_pct": round(len(wins) / len(recent) * 100.0, 2),
        "roi_flat_pct": round(calc_roi(recent), 4),
        "roi_basis": "picked_odds",
        "days": days,
    }


def ev_correlation(picks: List[Dict[str, Any]]) -> Dict[str, Any]:
    ev_pos = [p for p in picks if _f(p.get("ev_at_pick_pct"), 0.0) > 0]
    ev_neg = [p for p in picks if _f(p.get("ev_at_pick_pct"), 0.0) <= 0]

    def box(items: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not items:
            return {"n": 0, "avg_clv": None, "clv_positive_rate": 0.0, "roi_flat_pct": 0.0}
        return {
            "n": len(items),
            "avg_clv": round(mean([_f(p.get("clv_pct"), 0.0) for p in items]) or 0.0, 4),
            "clv_positive_rate": round(sum(1 for p in items if _f(p.get("clv_pct"), 0.0) > 0) / len(items), 4),
            "roi_flat_pct": round(calc_roi(items), 4),
        }

    pos_box = box(ev_pos)
    neg_box = box(ev_neg)
    return {
        "ev_positive_picks": pos_box,
        "ev_negative_picks": neg_box,
        "divergence_warning": len(ev_pos) > 10 and _f(pos_box.get("avg_clv"), 0.0) < -2.0,
        "roi_basis": "picked_odds",
    }


def diagnosis(summary: Dict[str, Any], r30: Dict[str, Any], by_market: Dict[str, Any]) -> Dict[str, Any]:
    n = int(summary.get("total_picks", 0) or 0)
    avg_clv = _f(summary.get("avg_clv_pct"), 0.0)
    roi = _f(summary.get("roi_flat_pct"), 0.0)
    clv_rate = _f(summary.get("clv_positive_rate"), 0.0)
    bad_markets = [m for m, s in by_market.items() if s.get("severity") == "bad" and int(s.get("n", 0)) >= 20]
    recovery_markets = [m for m, s in by_market.items() if s.get("stake_policy") == "recovery_strict"]

    if n < 20:
        base = {
            "signal": "INSUFFICIENT_DATA",
            "interpretation": f"Prea puține date ({n} pick-uri settle-ate). Minim 20 necesare.",
            "action": "Colectează mai multe pick-uri înainte de interpretare.",
            "confidence": "low",
        }
    elif avg_clv >= 0.5 and roi > 0:
        base = {
            "signal": "CLV_POSITIVE_ROI_POSITIVE",
            "interpretation": f"✅ Edge confirmat. CLV mediu: +{avg_clv:.2f}%, ROI flat la cota luată: +{roi:.2f}%. CLV+ rate: {clv_rate*100:.1f}%.",
            "action": "Continuă strategia curentă; scalează doar piețele cu verdict profitabil confirmat.",
            "confidence": "high" if n >= 100 else "medium",
        }
    elif avg_clv >= 0.5 and roi <= 0:
        base = {
            "signal": "CLV_POSITIVE_ROI_NEGATIVE",
            "interpretation": f"⚠️ CLV pozitiv (+{avg_clv:.2f}%) dar ROI negativ ({roi:.2f}%) la cota luată. Piața se mișcă parțial corect, dar selecțiile nu convertesc.",
            "action": "Păstrează doar probe stricte și verifică piețele cu ROI negativ.",
            "confidence": "high" if n >= 100 else "medium",
        }
    elif avg_clv < 0 and roi > 0:
        base = {
            "signal": "CLV_NEGATIVE_ROI_POSITIVE",
            "interpretation": f"🎲 ROI pozitiv ({roi:.2f}%) dar CLV negativ ({avg_clv:.2f}%). Nu crește stake-ul până CLV confirmă edge-ul.",
            "action": "Ține stake plafonat; cere CLV pozitiv înainte de scaling.",
            "confidence": "high" if n >= 100 else "medium",
        }
    else:
        base = {
            "signal": "CLV_NEGATIVE_ROI_NEGATIVE",
            "interpretation": f"❌ CLV negativ ({avg_clv:.2f}%) și ROI negativ ({roi:.2f}%) la cota luată. Edge-ul calculat nu bate piața suficient.",
            "action": "Ridică pragurile de edge și auditează probabilitățile pe piețele slabe.",
            "confidence": "high" if n >= 100 else "medium",
        }

    trend = "stabil"
    r30_clv = r30.get("avg_clv_pct")
    if r30_clv is not None:
        recent = _f(r30_clv)
        if recent > avg_clv + 1.0:
            trend = "îmbunătățire recentă"
        elif recent < avg_clv - 1.0:
            trend = "degradare recentă"

    base.update({
        "rolling_trend": trend,
        "roi_basis": "picked_odds",
        "market_alerts": bad_markets,
        "recovery_markets": recovery_markets,
    })
    return base


def build_market_actions(by_market: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = []
    severity_order = {"bad": 0, "warn": 1, "caution": 2, "info": 3, "good": 4}
    for market, stats in by_market.items():
        rows.append({
            "market": market,
            "n": stats.get("n", 0),
            "verdict": stats.get("verdict"),
            "label": stats.get("label"),
            "severity": stats.get("severity"),
            "action": stats.get("action"),
            "stake_policy": stats.get("stake_policy"),
            "edge_adjustment_pp": stats.get("edge_adjustment_pp", 0.0),
            "avg_clv_pct": stats.get("avg_clv_pct"),
            "roi_flat_pct": stats.get("roi_flat_pct"),
            "confidence": stats.get("confidence"),
        })
    rows.sort(key=lambda r: (severity_order.get(str(r.get("severity")), 9), -int(r.get("n", 0) or 0)))
    return rows


def main() -> None:
    payload = load_json(CLV_PATH, {})
    if not isinstance(payload, dict):
        print("[CLV-Q] clv_tracker.json invalid; skipped")
        return

    picks = normalize_picks(payload.get("picks", []) if isinstance(payload.get("picks", []), list) else [])
    if not picks:
        print("[CLV-Q] no picks; skipped")
        return

    summary = aggregate(picks)
    by_market = aggregate_by_market(picks)
    buckets = aggregate_buckets(picks)
    r30 = rolling(picks, 30)
    r90 = rolling(picks, 90)
    evc = ev_correlation(picks)
    diag = diagnosis(summary, r30, by_market)
    market_actions = build_market_actions(by_market)

    payload.update({
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "quality_version": "clv-quality-v1-picked-odds",
        "summary": summary,
        "by_market": by_market,
        "clv_buckets": buckets,
        "rolling_30d": r30,
        "rolling_90d": r90,
        "ev_correlation": evc,
        "diagnosis": diag,
        "market_actions": market_actions,
        "quality_rules": [
            "ROI se calculează la picked_odds/opening_odds, nu la closing proxy.",
            "CLV- și ROI- => ridică pragul de edge și auditează probabilitatea.",
            "CLV+ și ROI- => recovery strict, nu disable total.",
            "ROI+ și CLV- => nu mări stake-ul până piața confirmă edge-ul.",
        ],
        "picks": picks,
    })

    save_json(CLV_PATH, payload)
    print(f"[CLV-Q] Updated {CLV_PATH}: ROI basis=picked_odds, markets={len(by_market)}")
    for row in market_actions[:8]:
        print(
            f"[CLV-Q] {row['market']}: {row['verdict']} | "
            f"CLV={_f(row.get('avg_clv_pct')):+.2f}% ROI={_f(row.get('roi_flat_pct')):+.2f}% "
            f"edge+={_f(row.get('edge_adjustment_pp')):.1f}pp"
        )


if __name__ == "__main__":
    main()
