#!/usr/bin/env python3
"""
enrich_predictions.py — Îmbogățire predictions.json cu metrici complete.
=========================================================================
v2 — adaugă:
  - blacklist automat din model_quality.json (ROI < -8%, n >= 50)
  - prag dinamic per cotă: la cote < 1.50, prob trebuie > 1/odds + 0.08
  - build_status.json mereu cu timestamp fresh
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path("data")

# ─── parametri globali ────────────────────────────────────────────────────────
KELLY_FRACTION  = 0.25
KELLY_CAP       = 0.06
EDGE_SAFE_MIN   = 2.0
EDGE_VALUE_MIN  = 5.0
EV_POSITIVE     = 0.0
PROB_SAFE_MIN   = 0.62
PROB_VALUE_MIN  = 0.52
ODDS_MIN        = 1.20
ODDS_MAX        = 5.50

# Blacklist: piață cu ROI sub prag și suficiente date
ROI_BLACKLIST_THRESHOLD = -8.0
ROI_BLACKLIST_MIN_N     = 50

# Prag suplimentar pentru cote mici (break-even + margin)
LOW_ODDS_THRESHOLD   = 1.50
LOW_ODDS_EDGE_BONUS  = 6.0   # pp extra edge necesar când odds < 1.50

# ─── piețe: (cheie, prob_field, odds_field, pair_odds_fields) ─────────────────
MARKETS: List[Tuple[str, str, str, List[str]]] = [
    ("home_win",  "prob_home_win",  "odds_home",      ["odds_home", "odds_draw", "odds_away"]),
    ("draw",      "prob_draw",      "odds_draw",       ["odds_home", "odds_draw", "odds_away"]),
    ("away_win",  "prob_away_win",  "odds_away",       ["odds_home", "odds_draw", "odds_away"]),
    ("over_15",   "prob_over_15",   "odds_over_15",   ["odds_over_15", "odds_under_15"]),
    ("over_25",   "prob_over_25",   "odds_over_25",   ["odds_over_25", "odds_under_25"]),
    ("over_35",   "prob_over_35",   "odds_over_35",   ["odds_over_35", "odds_under_35"]),
    ("under_35",  "prob_over_35",   "odds_under_35",  ["odds_over_35", "odds_under_35"]),
    ("btts_yes",  "prob_btts_yes",  "odds_btts_yes",  ["odds_btts_yes", "odds_btts_no"]),
]

_MARKET_LABELS = {
    "home_win": "victorie gazdă", "draw": "egal", "away_win": "victorie oaspete",
    "over_15": "Peste 1.5G", "over_25": "Peste 2.5G", "over_35": "Peste 3.5G",
    "under_35": "Sub 3.5G", "btts_yes": "Ambele marchează",
}

# ─── I/O ─────────────────────────────────────────────────────────────────────

def _f(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "": return default
        f = float(v)
        return default if math.isnan(f) or math.isinf(f) else f
    except Exception: return default

def load_json(path: Path, default: Any = None) -> Any:
    try:
        with open(path, encoding="utf-8") as fh: return json.load(fh)
    except Exception: return default

def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

# ─── blacklist din model_quality.json ────────────────────────────────────────

def build_market_blacklist() -> Dict[str, str]:
    """
    Returnează dict {market_key: motiv} pentru piețele cu ROI negativ persistent.
    Mapare: over_15 → over15, under_35 → under35 etc.
    """
    mq = load_json(DATA_DIR / "model_quality.json", {})
    markets = mq.get("markets", []) if isinstance(mq, dict) else []
    blacklist: Dict[str, str] = {}
    key_map = {
        "over15": "over_15", "over25": "over_25", "over35": "over_35",
        "under35": "under_35", "btts": "btts_yes",
        "home_win": "home_win", "draw": "draw", "away_win": "away_win",
    }
    for m in markets:
        if not isinstance(m, dict): continue
        mkt   = m.get("market", "")
        n     = int(_f(m.get("n"), 0))
        roi   = _f(m.get("roi_pct"), 0.0)
        if n >= ROI_BLACKLIST_MIN_N and roi < ROI_BLACKLIST_THRESHOLD:
            enrich_key = key_map.get(mkt, mkt)
            blacklist[enrich_key] = (
                f"ROI {roi:+.1f}% pe {n} meciuri — sub pragul minim {ROI_BLACKLIST_THRESHOLD}%"
            )
    return blacklist

# ─── formule core ─────────────────────────────────────────────────────────────

def no_vig(odds_list: List[Any]) -> List[Optional[float]]:
    pairs = [(i, _f(o)) for i, o in enumerate(odds_list) if o and _f(o) > 1.01]
    if len(pairs) < 2: return [None] * len(odds_list)
    implied = [1.0 / o for _, o in pairs]
    margin  = sum(implied)
    fair    = [imp / margin for imp in implied]
    out: List[Optional[float]] = [None] * len(odds_list)
    for (idx, _), p in zip(pairs, fair): out[idx] = round(p, 6)
    return out

def fair_odds_calc(prob: float) -> Optional[float]:
    return round(1.0 / prob, 3) if prob > 0.001 else None

def edge_pp(model_prob: float, nv_prob: float) -> float:
    return round((model_prob - nv_prob) * 100.0, 3)

def ev_pct(model_prob: float, odds: float) -> Optional[float]:
    if odds < 1.01: return None
    return round((model_prob * (odds - 1.0) - (1.0 - model_prob)) * 100.0, 3)

def kelly_pct(model_prob: float, odds: float) -> float:
    if odds < 1.01 or model_prob <= 0: return 0.0
    b = odds - 1.0; q = 1.0 - model_prob
    k = (model_prob * b - q) / b
    return round(max(0.0, min(k * KELLY_FRACTION, KELLY_CAP)) * 100.0, 3)

def composite_score(model_prob: float, edg: float, ev: Optional[float]) -> float:
    p_norm  = min(100.0, max(0.0, (model_prob - 0.50) / 0.30 * 100.0))
    e_norm  = min(100.0, max(0.0, edg / 15.0 * 100.0))
    ev_norm = min(100.0, max(0.0, (_f(ev) + 5.0) / 20.0 * 100.0))
    return round(0.45 * p_norm + 0.35 * e_norm + 0.20 * ev_norm, 2)

# ─── risk tier cu blacklist + prag dinamic cotă ────────────────────────────────

def risk_tier_calc(market: str, model_prob: float, edg: float,
                   ev: Optional[float], odds: float,
                   blacklisted: bool) -> str:
    if blacklisted:
        return "Avoid"
    ev_val = _f(ev, -999.0)
    if ev_val < EV_POSITIVE or edg < 0:
        return "Avoid"

    # Prag suplimentar pentru cote mici: bookmaker-ul ia marjă mare
    # La odds < 1.50, probabilitatea implicită e >66% → model trebuie să fie
    # convingător mai sus, nu doar cu 2pp edge
    extra_edge = LOW_ODDS_EDGE_BONUS if odds < LOW_ODDS_THRESHOLD else 0.0
    effective_edge_safe  = EDGE_SAFE_MIN  + extra_edge
    effective_edge_value = EDGE_VALUE_MIN + extra_edge

    is_safe  = (model_prob >= PROB_SAFE_MIN
                and edg >= effective_edge_safe
                and ODDS_MIN <= odds <= 2.60)
    is_value = (model_prob >= PROB_VALUE_MIN
                and edg >= effective_edge_value
                and ev_val >= 5.0)

    if is_safe and is_value: return "Balanced"
    if is_safe:              return "Safe"
    if is_value:             return "Value"
    if ev_val > EV_POSITIVE and edg >= EDGE_SAFE_MIN: return "Balanced"
    return "Avoid"

# ─── rationale ────────────────────────────────────────────────────────────────

_TIER_REASONS = {
    "Safe":     "probabilitate ridicată, cota în interval sigur",
    "Value":    "edge mare față de cotele bookmakerului, EV pozitiv semnificativ",
    "Balanced": "combinație echilibrată între probabilitate și valoare",
    "Avoid":    "EV negativ, edge insuficient sau piață cu performanță istorică slabă",
}

def build_rationale(market: str, tier: str, model_prob: float,
                    edg: float, ev: Optional[float], odds: float,
                    fo: Optional[float], blacklist_reason: str) -> str:
    label    = _MARKET_LABELS.get(market, market)
    prob_pct = round(model_prob * 100.0, 1)
    ev_val   = _f(ev, 0.0)
    if blacklist_reason:
        return f"Piața {label} este exclusă automat: {blacklist_reason}."
    if tier == "Avoid":
        return (f"Piața {label} are EV {ev_val:+.1f}% și edge {edg:+.1f}pp — "
                f"sub pragul minim. Evitați.")
    fo_str = f", cota corectă estimată {fo}" if fo else ""
    reason = _TIER_REASONS.get(tier, "")
    return (f"Modelul estimează {prob_pct}% pentru {label} "
            f"(cota {odds}{fo_str}). "
            f"Edge față de no-vig: {edg:+.1f}pp, EV: {ev_val:+.1f}%. "
            f"Categorie: {tier} — {reason}.")

# ─── helper field lookup ──────────────────────────────────────────────────────

def _get(entry: Dict, field: str) -> Any:
    v = entry.get(field)
    if v is not None: return v
    ev = entry.get("event")
    if isinstance(ev, dict): return ev.get(field)
    return None

# ─── enrichment per entry ─────────────────────────────────────────────────────

def enrich_entry(entry: Dict, blacklist: Dict[str, str]) -> Dict:
    markets_data: Dict[str, Dict] = {}

    for mkt, prob_field, odds_field, pair_fields in MARKETS:
        raw_prob   = _f(_get(entry, prob_field), 0.0)
        model_prob = raw_prob / 100.0 if raw_prob > 1.5 else raw_prob
        if model_prob < 0.01: continue

        odds_val = _f(_get(entry, odds_field), 0.0)
        if odds_val < ODDS_MIN or odds_val > ODDS_MAX: continue

        pair_odds = [_get(entry, f) for f in pair_fields]
        nv_list   = no_vig(pair_odds)
        try:    nv_p = nv_list[pair_fields.index(odds_field)]
        except: nv_p = None
        if nv_p is None: continue

        edg   = edge_pp(model_prob, nv_p)
        ev    = ev_pct(model_prob, odds_val)
        kpct  = kelly_pct(model_prob, odds_val)
        fo    = fair_odds_calc(model_prob)
        bl_reason = blacklist.get(mkt, "")
        tier  = risk_tier_calc(mkt, model_prob, edg, ev, odds_val, bool(bl_reason))
        score = composite_score(model_prob, edg, ev)
        rat   = build_rationale(mkt, tier, model_prob, edg, ev, odds_val, fo, bl_reason)

        markets_data[mkt] = {
            "market":           mkt,
            "prob":             round(model_prob, 6),
            "nv_prob":          round(nv_p, 6),
            "odds":             round(odds_val, 3),
            "fair_odds":        fo,
            "edge_pp":          edg,
            "ev_pct":           ev,
            "kelly_pct":        kpct,
            "risk_tier":        tier,
            "blacklisted":      bool(bl_reason),
            "blacklist_reason": bl_reason or None,
            "score":            score,
            "rationale":        rat,
        }

    # Piața cu cel mai bun scor (exclus Avoid)
    candidates = {k: v for k, v in markets_data.items() if v["risk_tier"] != "Avoid"}
    best = None
    if candidates:
        best_key = max(candidates, key=lambda k: candidates[k]["score"])
        best = {**candidates[best_key], "market_key": best_key}
    elif markets_data:
        best_key = max(markets_data, key=lambda k: markets_data[k]["score"])
        best = {**markets_data[best_key], "market_key": best_key}

    entry["markets_enriched"] = markets_data
    entry["best_market"]      = best
    entry["risk_tier"]        = best["risk_tier"] if best else "Avoid"
    entry["ev_pct"]           = best["ev_pct"]    if best else None
    entry["kelly_pct"]        = best["kelly_pct"] if best else 0.0
    entry["edge_pp"]          = best["edge_pp"]   if best else None
    entry["fair_odds"]        = best["fair_odds"] if best else None
    entry["rationale"]        = best["rationale"] if best else "Date insuficiente pentru recomandare."
    entry["enriched_at"]      = datetime.now(timezone.utc).isoformat()
    return entry

# ─── merge EV semnale CatBoost ────────────────────────────────────────────────

def merge_ev_signals(signals_path: Path) -> Dict[str, Dict]:
    raw = load_json(signals_path, {})
    signals = raw.get("signals", []) if isinstance(raw, dict) else []
    return {str(s.get("event_id")): s for s in signals if s.get("event_id")}

def apply_catboost_signals(entry: Dict, signals_by_event: Dict[str, Dict]) -> Dict:
    eid = str(entry.get("id") or entry.get("event_id") or "")
    sig = signals_by_event.get(eid)
    if not sig: return entry
    entry["catboost_signal"]      = sig.get("signal")
    entry["catboost_market"]      = sig.get("market")
    entry["catboost_score"]       = sig.get("score")
    entry["catboost_model_prob"]  = sig.get("model_prob")
    entry["catboost_ev_pct"]      = sig.get("ev_pct")
    entry["catboost_kelly_pct"]   = sig.get("kelly_pct")
    entry["catboost_edge_pp"]     = sig.get("edge_pp")
    return entry

# ─── build_status.json ────────────────────────────────────────────────────────

def write_build_status(n_total: int, n_enriched: int, n_safe: int,
                       n_value: int, n_balanced: int,
                       blacklisted_markets: List[str],
                       errors: List[str]) -> None:
    try:
        html = Path("index.html").read_text(encoding="utf-8")
        import re
        m = re.search(r'app\.js\?v=([^"\'&]+)', html)
        ui_version = m.group(1) if m else "unknown"
    except Exception:
        ui_version = "unknown"

    save_json(DATA_DIR / "build_status.json", {
        "updated_at":          datetime.now(timezone.utc).isoformat(),
        "ui_version":          ui_version,
        "total_matches":       n_total,
        "enriched":            n_enriched,
        "safe_picks":          n_safe,
        "value_picks":         n_value,
        "balanced_picks":      n_balanced,
        "blacklisted_markets": blacklisted_markets,
        "errors":              errors[:20],
        "status":              "ok" if not errors else "partial",
        "freshness_color":     "green",
    })

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== ENRICH PREDICTIONS v2 ===")

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("SKIP: predictions.json lipsă.")
        write_build_status(0, 0, 0, 0, 0, [], ["predictions.json lipsă"])
        return

    raw = load_json(pred_path, [])
    predictions: List[Dict] = (
        raw if isinstance(raw, list)
        else raw.get("predictions") or raw.get("results") or raw.get("events") or list(raw.values())
    )
    print(f"Predicții încărcate: {len(predictions)}")

    blacklist = build_market_blacklist()
    if blacklist:
        print(f"Piețe blacklistate automat ({len(blacklist)}): {list(blacklist.keys())}")
    else:
        print("Nicio piață blacklistată.")

    signals_map = merge_ev_signals(DATA_DIR / "ev_signals_v2.json")
    print(f"Semnale CatBoost disponibile: {len(signals_map)}")

    enriched_list: List[Dict] = []
    errors: List[str] = []
    n_safe = n_value = n_balanced = 0

    for entry in predictions:
        if not isinstance(entry, dict): continue
        try:
            enriched = enrich_entry(entry, blacklist)
            enriched = apply_catboost_signals(enriched, signals_map)
            enriched_list.append(enriched)
            tier = enriched.get("risk_tier", "Avoid")
            if tier == "Safe":     n_safe += 1
            elif tier == "Value":  n_value += 1
            elif tier == "Balanced": n_balanced += 1
        except Exception as exc:
            eid = entry.get("id") or entry.get("event_id") or "?"
            errors.append(f"id={eid}: {exc}")
            enriched_list.append(entry)

    # Salvare
    if isinstance(raw, list):
        save_json(pred_path, enriched_list)
    else:
        wrapper_key = next((k for k in ("predictions","results","events") if k in raw), None)
        if wrapper_key:
            raw[wrapper_key] = enriched_list
            save_json(pred_path, raw)
        else:
            save_json(pred_path, enriched_list)

    print(f"Îmbogățite: {len(enriched_list)} | Safe={n_safe} | Value={n_value} | Balanced={n_balanced}")
    if errors: print(f"  Erori ({len(errors)}): {errors[:3]}")

    write_build_status(
        n_total=len(predictions), n_enriched=len(enriched_list),
        n_safe=n_safe, n_value=n_value, n_balanced=n_balanced,
        blacklisted_markets=list(blacklist.keys()), errors=errors,
    )

    print("\nTop 5 recomandări (non-Avoid):")
    top = sorted(
        [e for e in enriched_list if e.get("best_market") and e.get("risk_tier") != "Avoid"],
        key=lambda x: x["best_market"].get("score", 0), reverse=True
    )[:5]
    for e in top:
        bm = e["best_market"]
        ev2 = e.get("event", {})
        home = ev2.get("home_team") or e.get("home_team") or "?"
        away = ev2.get("away_team") or e.get("away_team") or "?"
        print(
            f"  [{bm['score']:5.1f}] {bm['market']:10s} | "
            f"{str(home)[:14]:14s} vs {str(away)[:14]:14s} | "
            f"p={bm['prob']:.3f} edge={bm['edge_pp']:+.1f}pp "
            f"EV={bm['ev_pct']:+.1f}% Kelly={bm['kelly_pct']:.1f}% [{bm['risk_tier']}]"
        )

if __name__ == "__main__":
    main()
