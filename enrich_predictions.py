#!/usr/bin/env python3
"""
enrich_predictions.py — Îmbogățire predictions.json cu metrici complete.
=========================================================================
Calculează pentru fiecare predicție:
  - no_vig_prob  : probabilitate fără marjă bookmaker
  - fair_odds    : 1 / prob_model
  - edge_pp      : prob_model - no_vig_prob (puncte procentuale)
  - ev_pct       : expected value % pe unitate mizată
  - kelly_pct    : fracție Kelly recomandată (%)
  - risk_tier    : Safe / Value / Balanced / Avoid
  - best_market  : piața cu cel mai bun scor compozit
  - rationale    : explicație scurtă 2-3 fraze

Rulare: python enrich_predictions.py
Rulat automat din workflow după fetch_data.py.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path("data")

# ─── parametri de filtrare ───────────────────────────────────────────────────
KELLY_FRACTION = 0.25       # fracție Kelly fracționat
KELLY_CAP = 0.06            # plafon 6% din bancă
EDGE_SAFE_MIN = 2.0         # pp minim pentru Safe
EDGE_VALUE_MIN = 5.0        # pp minim pentru Value
EV_POSITIVE = 0.0           # EV minim pentru recomandare
PROB_SAFE_MIN = 0.62        # probabilitate minimă categorie Safe
PROB_VALUE_MIN = 0.52       # probabilitate minimă categorie Value
ODDS_MIN = 1.20
ODDS_MAX = 5.50

# ─── piețe suportate: (cheie, prob_field, odds_field, pair_odds_fields) ──────
MARKETS: List[Tuple[str, str, str, List[str]]] = [
    ("home_win",  "prob_home_win",  "odds_home",      ["odds_home", "odds_draw", "odds_away"]),
    ("draw",      "prob_draw",      "odds_draw",       ["odds_home", "odds_draw", "odds_away"]),
    ("away_win",  "prob_away_win",  "odds_away",       ["odds_home", "odds_draw", "odds_away"]),
    ("over_15",   "prob_over_15",   "odds_over_15",   ["odds_over_15", "odds_under_15"]),
    ("over_25",   "prob_over_25",   "odds_over_25",   ["odds_over_25", "odds_under_25"]),
    ("over_35",   "prob_over_35",   "odds_over_35",   ["odds_over_35", "odds_under_35"]),
    ("under_35",  "prob_over_35",   "odds_under_35",  ["odds_over_35", "odds_under_35"]),  # inversă
    ("btts_yes",  "prob_btts_yes",  "odds_btts_yes",  ["odds_btts_yes", "odds_btts_no"]),
]


# ─── utilitare ───────────────────────────────────────────────────────────────

def _f(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        f = float(v)
        return default if math.isnan(f) or math.isinf(f) else f
    except Exception:
        return default


def load_json(path: Path, default: Any = None) -> Any:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))


# ─── formule core ────────────────────────────────────────────────────────────

def no_vig(odds_list: List[Any]) -> List[Optional[float]]:
    """Normalizează probabilitățile implicite eliminând marja."""
    pairs = [(i, _f(o)) for i, o in enumerate(odds_list) if o and _f(o) > 1.01]
    if len(pairs) < 2:
        return [None] * len(odds_list)
    implied = [1.0 / o for _, o in pairs]
    margin = sum(implied)
    fair = [imp / margin for imp in implied]
    out: List[Optional[float]] = [None] * len(odds_list)
    for (idx, _), p in zip(pairs, fair):
        out[idx] = round(p, 6)
    return out


def fair_odds(prob: float) -> Optional[float]:
    if prob <= 0.001:
        return None
    return round(1.0 / prob, 3)


def edge_pp(model_prob: float, nv_prob: float) -> float:
    return round((model_prob - nv_prob) * 100.0, 3)


def ev_pct(model_prob: float, odds: float) -> Optional[float]:
    if odds < 1.01:
        return None
    return round((model_prob * (odds - 1.0) - (1.0 - model_prob)) * 100.0, 3)


def kelly_pct(model_prob: float, odds: float,
              fraction: float = KELLY_FRACTION, cap: float = KELLY_CAP) -> float:
    if odds < 1.01 or model_prob <= 0:
        return 0.0
    b = odds - 1.0
    q = 1.0 - model_prob
    k = (model_prob * b - q) / b
    return round(max(0.0, min(k * fraction, cap)) * 100.0, 3)


def composite_score(model_prob: float, edg: float,
                    ev: Optional[float], odds: float) -> float:
    """Scor compozit 0-100 pentru ranking piețe."""
    p_norm  = min(100.0, max(0.0, (model_prob - 0.50) / 0.30 * 100.0))
    e_norm  = min(100.0, max(0.0, edg / 15.0 * 100.0))
    ev_norm = min(100.0, max(0.0, (_f(ev) + 5.0) / 20.0 * 100.0))
    return round(0.45 * p_norm + 0.35 * e_norm + 0.20 * ev_norm, 2)


# ─── risk tier ───────────────────────────────────────────────────────────────

def risk_tier(model_prob: float, edg: float,
              ev: Optional[float], odds: float) -> str:
    ev_val = _f(ev, -999.0)
    if ev_val < EV_POSITIVE or edg < 0:
        return "Avoid"
    is_safe  = (model_prob >= PROB_SAFE_MIN
                and edg >= EDGE_SAFE_MIN
                and ODDS_MIN <= odds <= 2.60)
    is_value = (model_prob >= PROB_VALUE_MIN
                and edg >= EDGE_VALUE_MIN
                and ev_val >= 5.0)
    if is_safe and is_value:
        return "Balanced"
    if is_safe:
        return "Safe"
    if is_value:
        return "Value"
    if ev_val > EV_POSITIVE and edg >= EDGE_SAFE_MIN:
        return "Balanced"
    return "Avoid"


# ─── rationale text ──────────────────────────────────────────────────────────

_MARKET_LABELS = {
    "home_win": "victorie gazdă", "draw": "egal", "away_win": "victorie oaspete",
    "over_15": "Peste 1.5G", "over_25": "Peste 2.5G", "over_35": "Peste 3.5G",
    "under_35": "Sub 3.5G", "btts_yes": "Ambele marchează",
}

_TIER_REASONS = {
    "Safe":     "probabilitate ridicată, cota în interval sigur",
    "Value":    "edge mare față de cotele bookmakerului, EV pozitiv semnificativ",
    "Balanced": "combinație echilibrată între probabilitate și valoare",
    "Avoid":    "EV negativ sau edge insuficient față de piață",
}


def build_rationale(market: str, tier: str, model_prob: float,
                    edg: float, ev: Optional[float],
                    odds: float, fo: Optional[float]) -> str:
    label   = _MARKET_LABELS.get(market, market)
    reason  = _TIER_REASONS.get(tier, "")
    prob_pct = round(model_prob * 100.0, 1)
    ev_val   = _f(ev, 0.0)

    if tier == "Avoid":
        return (f"Piața {label} are EV {ev_val:+.1f}% și edge {edg:+.1f}pp — "
                f"sub pragul minim de recomandare. Evitați.")

    fo_str = f", cota corectă estimată {fo}" if fo else ""
    return (f"Modelul estimează {prob_pct}% pentru {label} "
            f"(cota {odds}{fo_str}). "
            f"Edge față de no-vig: {edg:+.1f}pp, EV: {ev_val:+.1f}%. "
            f"Categorie: {tier} — {reason}.")


# ─── enrichment principal ────────────────────────────────────────────────────

def _get(entry: Dict, field: str) -> Any:
    """Caută un câmp la top level și în entry['event']."""
    v = entry.get(field)
    if v is not None:
        return v
    ev = entry.get("event")
    if isinstance(ev, dict):
        return ev.get(field)
    return None


def enrich_entry(entry: Dict) -> Dict:
    """Adaugă câmpurile lipsă la o înregistrare din predictions.json."""
    markets_data: Dict[str, Dict] = {}

    for mkt, prob_field, odds_field, pair_fields in MARKETS:
        raw_prob = _f(_get(entry, prob_field), 0.0)
        # BSD returnează uneori prob în 0-100 vs 0-1
        model_prob = raw_prob / 100.0 if raw_prob > 1.5 else raw_prob
        if model_prob < 0.01:
            continue

        odds_val = _f(_get(entry, odds_field), 0.0)
        if odds_val < ODDS_MIN or odds_val > ODDS_MAX:
            continue

        # no-vig din perechea de cote
        pair_odds = [_get(entry, f) for f in pair_fields]
        nv_list   = no_vig(pair_odds)
        try:
            nv_p = nv_list[pair_fields.index(odds_field)]
        except (ValueError, IndexError):
            nv_p = None

        if nv_p is None:
            continue

        edg   = edge_pp(model_prob, nv_p)
        ev    = ev_pct(model_prob, odds_val)
        kpct  = kelly_pct(model_prob, odds_val)
        fo    = fair_odds(model_prob)
        tier  = risk_tier(model_prob, edg, ev, odds_val)
        score = composite_score(model_prob, edg, ev, odds_val)
        rat   = build_rationale(mkt, tier, model_prob, edg, ev, odds_val, fo)

        markets_data[mkt] = {
            "market":      mkt,
            "prob":        round(model_prob, 6),
            "nv_prob":     round(nv_p, 6),
            "odds":        round(odds_val, 3),
            "fair_odds":   fo,
            "edge_pp":     edg,
            "ev_pct":      ev,
            "kelly_pct":   kpct,
            "risk_tier":   tier,
            "score":       score,
            "rationale":   rat,
        }

    # Piața cu cel mai bun scor
    best = None
    if markets_data:
        best_key = max(markets_data, key=lambda k: markets_data[k]["score"])
        best = markets_data[best_key]
        best = {**best, "market_key": best_key}

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


def merge_ev_signals(predictions: List[Dict],
                     signals_path: Path) -> Dict[str, Dict]:
    """Returnează un dict event_id -> signal din ev_signals_v2.json."""
    raw = load_json(signals_path, {})
    signals = raw.get("signals", []) if isinstance(raw, dict) else []
    return {str(s.get("event_id")): s for s in signals if s.get("event_id")}


def apply_catboost_signals(entry: Dict,
                           signals_by_event: Dict[str, Dict]) -> Dict:
    """Suprascriere parțială cu semnale CatBoost dacă există."""
    eid = str(entry.get("id") or entry.get("event_id") or "")
    sig = signals_by_event.get(eid)
    if not sig:
        return entry
    # CatBoost are prioritate pe câmpurile calculate
    entry["catboost_signal"]      = sig.get("signal")
    entry["catboost_market"]      = sig.get("market")
    entry["catboost_score"]       = sig.get("score")
    entry["catboost_model_prob"]  = sig.get("model_prob")
    entry["catboost_ev_pct"]      = sig.get("ev_pct")
    entry["catboost_kelly_pct"]   = sig.get("kelly_pct")
    entry["catboost_edge_pp"]     = sig.get("edge_pp")
    return entry


# ─── build_status.json ───────────────────────────────────────────────────────

def write_build_status(n_total: int, n_enriched: int,
                       n_safe: int, n_value: int,
                       errors: List[str],
                       ui_version: str = "auto") -> None:
    """Scrie data/build_status.json."""
    # încearcă să citească versiunea UI din index.html
    if ui_version == "auto":
        try:
            html = Path("index.html").read_text(encoding="utf-8")
            import re
            m = re.search(r'app\.js\?v=([^"\'&]+)', html)
            ui_version = m.group(1) if m else "unknown"
        except Exception:
            ui_version = "unknown"

    status = {
        "updated_at":     datetime.now(timezone.utc).isoformat(),
        "ui_version":     ui_version,
        "total_matches":  n_total,
        "enriched":       n_enriched,
        "safe_picks":     n_safe,
        "value_picks":    n_value,
        "errors":         errors[:20],
        "status":         "ok" if not errors else "partial",
        "freshness_color": "green",   # UI va recalcula din updated_at
    }
    save_json(DATA_DIR / "build_status.json", status)
    print(f"  build_status.json: {n_total} meciuri, {n_enriched} îmbogățite, "
          f"{n_safe} Safe, {n_value} Value")


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== ENRICH PREDICTIONS v1 ===")

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("SKIP: predictions.json lipsă.")
        write_build_status(0, 0, 0, 0, ["predictions.json lipsă"])
        return

    raw = load_json(pred_path, [])
    if isinstance(raw, dict):
        predictions: List[Dict] = (
            raw.get("predictions")
            or raw.get("results")
            or raw.get("events")
            or list(raw.values())
        )
    else:
        predictions = raw or []

    print(f"Predicții încărcate: {len(predictions)}")

    # semnale CatBoost opționale
    signals_map = merge_ev_signals(predictions, DATA_DIR / "ev_signals_v2.json")
    print(f"Semnale CatBoost disponibile: {len(signals_map)}")

    enriched_list: List[Dict] = []
    errors: List[str] = []
    n_safe = n_value = 0

    for entry in predictions:
        if not isinstance(entry, dict):
            continue
        try:
            enriched = enrich_entry(entry)
            enriched = apply_catboost_signals(enriched, signals_map)
            enriched_list.append(enriched)
            tier = enriched.get("risk_tier", "Avoid")
            if tier == "Safe":
                n_safe += 1
            elif tier == "Value":
                n_value += 1
        except Exception as exc:
            eid = entry.get("id") or entry.get("event_id") or "?"
            errors.append(f"id={eid}: {exc}")
            enriched_list.append(entry)   # păstrăm intrarea originală

    # salvare
    if isinstance(raw, list):
        save_json(pred_path, enriched_list)
    else:
        # dacă originalul era dict cu wrapper, refacem structura
        wrapper_key = next(
            (k for k in ("predictions", "results", "events") if k in raw),
            None,
        )
        if wrapper_key:
            raw[wrapper_key] = enriched_list
            save_json(pred_path, raw)
        else:
            save_json(pred_path, enriched_list)

    print(f"Predicții îmbogățite: {len(enriched_list)} | Safe={n_safe} | Value={n_value}")
    if errors:
        print(f"  Erori ({len(errors)}): {errors[:3]}")

    write_build_status(
        n_total=len(predictions),
        n_enriched=len(enriched_list),
        n_safe=n_safe,
        n_value=n_value,
        errors=errors,
    )

    # sumar în consolă
    print("\nTop 5 Best Market:")
    top = sorted(
        [e for e in enriched_list if e.get("best_market")],
        key=lambda x: x["best_market"].get("score", 0),
        reverse=True,
    )[:5]
    for e in top:
        bm = e["best_market"]
        ev = e.get("event", {})
        home = ev.get("home_team") or e.get("home_team") or "?"
        away = ev.get("away_team") or e.get("away_team") or "?"
        print(
            f"  [{bm['score']:5.1f}] {bm['market']:10s} | "
            f"{str(home)[:14]:14s} vs {str(away)[:14]:14s} | "
            f"p={bm['prob']:.3f} edge={bm['edge_pp']:+.1f}pp "
            f"EV={bm['ev_pct']:+.1f}% Kelly={bm['kelly_pct']:.1f}% "
            f"[{bm['risk_tier']}]"
        )


if __name__ == "__main__":
    main()
