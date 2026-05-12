#!/usr/bin/env python3
"""
enrich_predictions.py — v3 cu integrare Poisson/Dixon-Coles.
=============================================================
Îmbogățire predictions.json:
  - no-vig, fair_odds, edge, EV, Kelly, risk_tier, rationale
  - Poisson/Dixon-Coles din expected_home/away_goals
  - Probabilitate blended: BSD 60% + Poisson 40%
  - poisson_alert când diferența > 8pp între modele
  - Blacklist automat din model_quality.json
  - Prag dinamic cotă mică (odds < 1.50)
"""
from __future__ import annotations

import json, math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from analytics_core import poisson_market_probabilities, safe_float

DATA_DIR = Path("data")

# ─── parametri ───────────────────────────────────────────────────────────────
KELLY_FRACTION  = 0.25
KELLY_CAP       = 0.06
EDGE_SAFE_MIN   = 2.0
EDGE_VALUE_MIN  = 5.0
EV_POSITIVE     = 0.0
PROB_SAFE_MIN   = 0.62
PROB_VALUE_MIN  = 0.52
ODDS_MIN        = 1.20
ODDS_MAX        = 5.50
ROI_BLACKLIST_THRESHOLD = -8.0
ROI_BLACKLIST_MIN_N     = 50
LOW_ODDS_THRESHOLD      = 1.50
LOW_ODDS_EDGE_BONUS     = 6.0
BSD_WEIGHT    = 0.60    # greutate model BSD în blend
POISSON_WEIGHT = 0.40   # greutate Poisson/Dixon-Coles în blend
POISSON_ALERT_THRESHOLD = 8.0  # pp diferență pentru alertă

# ─── piețe ───────────────────────────────────────────────────────────────────
# (cheie_enrich, prob_field_bsd, odds_field, pair_odds, cheie_poisson)
MARKETS: List[Tuple[str, str, str, List[str], str]] = [
    ("home_win", "prob_home_win", "odds_home",    ["odds_home","odds_draw","odds_away"], "home_win"),
    ("draw",     "prob_draw",     "odds_draw",    ["odds_home","odds_draw","odds_away"], "draw"),
    ("away_win", "prob_away_win", "odds_away",    ["odds_home","odds_draw","odds_away"], "away_win"),
    ("over_15",  "prob_over_15",  "odds_over_15", ["odds_over_15","odds_under_15"],      "over15"),
    ("over_25",  "prob_over_25",  "odds_over_25", ["odds_over_25","odds_under_25"],      "over25"),
    ("over_35",  "prob_over_35",  "odds_over_35", ["odds_over_35","odds_under_35"],      "over35"),
    ("under_35", "prob_over_35",  "odds_under_35",["odds_over_35","odds_under_35"],      "under35"),
    ("btts_yes", "prob_btts_yes", "odds_btts_yes",["odds_btts_yes","odds_btts_no"],      "btts"),
]

_MARKET_LABELS = {
    "home_win":"victorie gazdă","draw":"egal","away_win":"victorie oaspete",
    "over_15":"Peste 1.5G","over_25":"Peste 2.5G","over_35":"Peste 3.5G",
    "under_35":"Sub 3.5G","btts_yes":"Ambele marchează",
}
_TIER_REASONS = {
    "Safe":    "probabilitate ridicată, cota în interval sigur",
    "Value":   "edge mare față de piață, EV pozitiv semnificativ",
    "Balanced":"combinație echilibrată probabilitate–valoare",
    "Avoid":   "EV negativ, edge insuficient sau piață cu performanță istorică slabă",
}

# ─── I/O ─────────────────────────────────────────────────────────────────────

def _f(v, default=0.0):
    try:
        if v is None or v == "": return default
        f = float(v)
        return default if math.isnan(f) or math.isinf(f) else f
    except Exception: return default

def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as fh: return json.load(fh)
    except Exception: return default

def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",",":"))

def _get(entry, field):
    v = entry.get(field)
    if v is not None: return v
    ev = entry.get("event")
    if isinstance(ev, dict): return ev.get(field)
    return None

# ─── Blacklist ────────────────────────────────────────────────────────────────

def build_market_blacklist():
    mq = load_json(DATA_DIR / "model_quality.json", {})
    markets = mq.get("markets", []) if isinstance(mq, dict) else []
    key_map = {"over15":"over_15","over25":"over_25","over35":"over_35",
               "under35":"under_35","btts":"btts_yes",
               "home_win":"home_win","draw":"draw","away_win":"away_win"}
    bl = {}
    for m in markets:
        if not isinstance(m, dict): continue
        n = int(_f(m.get("n"), 0)); roi = _f(m.get("roi_pct"), 0.0)
        if n >= ROI_BLACKLIST_MIN_N and roi < ROI_BLACKLIST_THRESHOLD:
            bl[key_map.get(m.get("market",""), m.get("market",""))] = \
                f"ROI {roi:+.1f}% pe {n} meciuri"
    return bl

# ─── Poisson ─────────────────────────────────────────────────────────────────

def compute_poisson(entry) -> Optional[Dict]:
    """Calculează probabilitățile Poisson/Dixon-Coles pentru un meci."""
    lh = _f(_get(entry, "expected_home_goals"), 0.0)
    la = _f(_get(entry, "expected_away_goals"), 0.0)
    if lh < 0.05 or la < 0.05: return None
    try:
        return poisson_market_probabilities(lh, la)
    except Exception:
        return None

def blended_prob(bsd: float, poisson_val: Optional[float]) -> float:
    """BSD 60% + Poisson 40%. Dacă Poisson lipsește, 100% BSD."""
    if poisson_val is None or poisson_val <= 0:
        return bsd
    return round(bsd * BSD_WEIGHT + poisson_val * POISSON_WEIGHT, 6)

# ─── Formule core ─────────────────────────────────────────────────────────────

def no_vig(odds_list):
    pairs = [(i, _f(o)) for i, o in enumerate(odds_list) if o and _f(o) > 1.01]
    if len(pairs) < 2: return [None] * len(odds_list)
    implied = [1.0 / o for _, o in pairs]
    margin  = sum(implied)
    fair    = [imp / margin for imp in implied]
    out = [None] * len(odds_list)
    for (idx, _), p in zip(pairs, fair): out[idx] = round(p, 6)
    return out

def fair_odds_calc(prob):
    return round(1.0 / prob, 3) if prob > 0.001 else None

def edge_pp(model_prob, nv_prob):
    return round((model_prob - nv_prob) * 100.0, 3)

def ev_pct(model_prob, odds):
    if odds < 1.01: return None
    return round((model_prob * (odds - 1.0) - (1.0 - model_prob)) * 100.0, 3)

def kelly_pct(model_prob, odds):
    if odds < 1.01 or model_prob <= 0: return 0.0
    b = odds - 1.0; q = 1.0 - model_prob
    k = (model_prob * b - q) / b
    return round(max(0.0, min(k * KELLY_FRACTION, KELLY_CAP)) * 100.0, 3)

def composite_score(model_prob, edg, ev):
    p = min(100.0, max(0.0, (model_prob - 0.50) / 0.30 * 100.0))
    e = min(100.0, max(0.0, edg / 15.0 * 100.0))
    v = min(100.0, max(0.0, (_f(ev) + 5.0) / 20.0 * 100.0))
    return round(0.45 * p + 0.35 * e + 0.20 * v, 2)

# ─── Risk tier ────────────────────────────────────────────────────────────────

def risk_tier_calc(market, model_prob, edg, ev, odds, blacklisted):
    if blacklisted: return "Avoid"
    ev_val = _f(ev, -999.0)
    if ev_val < EV_POSITIVE or edg < 0: return "Avoid"
    extra = LOW_ODDS_EDGE_BONUS if odds < LOW_ODDS_THRESHOLD else 0.0
    is_safe  = model_prob >= PROB_SAFE_MIN and edg >= EDGE_SAFE_MIN + extra and ODDS_MIN <= odds <= 2.60
    is_value = model_prob >= PROB_VALUE_MIN and edg >= EDGE_VALUE_MIN + extra and ev_val >= 5.0
    if is_safe and is_value: return "Balanced"
    if is_safe:   return "Safe"
    if is_value:  return "Value"
    if ev_val > EV_POSITIVE and edg >= EDGE_SAFE_MIN: return "Balanced"
    return "Avoid"

# ─── Rationale ───────────────────────────────────────────────────────────────

def build_rationale(market, tier, model_prob, edg, ev, odds, fo,
                    bl_reason, poisson_prob, bsd_prob):
    label    = _MARKET_LABELS.get(market, market)
    prob_pct = round(model_prob * 100.0, 1)
    ev_val   = _f(ev, 0.0)
    if bl_reason:
        return f"Piața {label} exclusă automat: {bl_reason}."
    if tier == "Avoid":
        return f"Piața {label} are EV {ev_val:+.1f}% și edge {edg:+.1f}pp — sub prag. Evitați."
    fo_str = f", fair odds {fo}" if fo else ""
    poi_note = ""
    if poisson_prob is not None and bsd_prob is not None:
        delta = (poisson_prob - bsd_prob) * 100.0
        if abs(delta) >= POISSON_ALERT_THRESHOLD:
            direction = "confirmă" if delta > 0 else "atenuează"
            poi_note = f" Poisson {direction} cu {abs(delta):.1f}pp."
    return (f"Probabilitate blend {prob_pct}% pentru {label} "
            f"(cota {odds}{fo_str}). "
            f"Edge: {edg:+.1f}pp, EV: {ev_val:+.1f}%.{poi_note} "
            f"Categorie: {tier} — {_TIER_REASONS.get(tier,'')}")

# ─── Enrich entry ─────────────────────────────────────────────────────────────

def enrich_entry(entry, blacklist):
    poisson = compute_poisson(entry)
    markets_data = {}

    for mkt, prob_field, odds_field, pair_fields, poi_key in MARKETS:
        # BSD prob
        raw_bsd = _f(_get(entry, prob_field), 0.0)
        bsd_p   = raw_bsd / 100.0 if raw_bsd > 1.5 else raw_bsd
        if bsd_p < 0.01: continue

        odds_val = _f(_get(entry, odds_field), 0.0)
        if odds_val < ODDS_MIN or odds_val > ODDS_MAX: continue

        # Under 3.5 → prob inversă
        if mkt == "under_35":
            bsd_p = 1.0 - bsd_p

        # Poisson prob
        poi_p = poisson.get(poi_key) if poisson else None

        # Probabilitate blended (principală pentru calcule)
        blend = blended_prob(bsd_p, poi_p)

        # No-vig
        pair_odds = [_get(entry, f) for f in pair_fields]
        nv_list   = no_vig(pair_odds)
        try:    nv_p = nv_list[pair_fields.index(odds_field)]
        except: nv_p = None
        if nv_p is None: continue

        edg   = edge_pp(blend, nv_p)
        ev    = ev_pct(blend, odds_val)
        kpct  = kelly_pct(blend, odds_val)
        fo    = fair_odds_calc(blend)
        bl_reason = blacklist.get(mkt, "")
        tier  = risk_tier_calc(mkt, blend, edg, ev, odds_val, bool(bl_reason))
        score = composite_score(blend, edg, ev)
        poi_alert = (poi_p is not None and bsd_p > 0 and
                     abs(poi_p - bsd_p) * 100 >= POISSON_ALERT_THRESHOLD)
        rat = build_rationale(mkt, tier, blend, edg, ev, odds_val, fo,
                              bl_reason, poi_p, bsd_p)

        markets_data[mkt] = {
            "market":           mkt,
            "prob":             round(blend, 6),
            "bsd_prob":         round(bsd_p, 6),
            "poisson_prob":     round(poi_p, 6) if poi_p is not None else None,
            "nv_prob":          round(nv_p, 6),
            "odds":             round(odds_val, 3),
            "fair_odds":        fo,
            "edge_pp":          edg,
            "ev_pct":           ev,
            "kelly_pct":        kpct,
            "risk_tier":        tier,
            "poisson_alert":    poi_alert,
            "blacklisted":      bool(bl_reason),
            "blacklist_reason": bl_reason or None,
            "score":            score,
            "rationale":        rat,
        }

    # Piața cea mai bună (non-Avoid primul, fallback oricare)
    candidates = {k: v for k, v in markets_data.items() if v["risk_tier"] != "Avoid"}
    best = None
    if candidates:
        bk = max(candidates, key=lambda k: candidates[k]["score"])
        best = {**candidates[bk], "market_key": bk}
    elif markets_data:
        bk = max(markets_data, key=lambda k: markets_data[k]["score"])
        best = {**markets_data[bk], "market_key": bk}

    # Metrici Poisson top-level
    poisson_meta = None
    if poisson:
        poisson_meta = {
            "most_likely_score": poisson.get("most_likely_score"),
            "most_likely_score_prob": round(_f(poisson.get("most_likely_score_prob")), 4),
            "lambda_home": round(_f(_get(entry,"expected_home_goals")),3),
            "lambda_away": round(_f(_get(entry,"expected_away_goals")),3),
            "home_win":  round(_f(poisson.get("home_win")), 4),
            "draw":      round(_f(poisson.get("draw")), 4),
            "away_win":  round(_f(poisson.get("away_win")), 4),
            "over25":    round(_f(poisson.get("over25")), 4),
            "btts":      round(_f(poisson.get("btts")), 4),
        }

    entry["markets_enriched"] = markets_data
    entry["best_market"]      = best
    entry["risk_tier"]        = best["risk_tier"] if best else "Avoid"
    entry["ev_pct"]           = best["ev_pct"]    if best else None
    entry["kelly_pct"]        = best["kelly_pct"] if best else 0.0
    entry["edge_pp"]          = best["edge_pp"]   if best else None
    entry["fair_odds"]        = best["fair_odds"] if best else None
    entry["rationale"]        = best["rationale"] if best else "Date insuficiente."
    entry["poisson_metrics"]  = poisson_meta
    entry["enriched_at"]      = datetime.now(timezone.utc).isoformat()
    return entry

# ─── CatBoost signals ─────────────────────────────────────────────────────────

def merge_ev_signals(path):
    raw = load_json(path, {})
    sigs = raw.get("signals", []) if isinstance(raw, dict) else []
    out = {}
    for sig in sigs:
        if not isinstance(sig, dict):
            continue
        eid = sig.get("event_id")
        if eid is None or eid == "":
            continue
        out[str(eid)] = sig
    return out

def _catboost_event_candidates(entry):
    """
    ev_signals_v2.json este indexat pe event_id.
    În predictions.json câmpul `id` poate fi prediction_id, deci NU trebuie
    folosit primul. Ordinea corectă este: event_id direct → event.id → fallback id.
    """
    candidates = []

    def add(value):
        if value is None or value == "":
            return
        key = str(value)
        if key not in candidates:
            candidates.append(key)

    add(entry.get("event_id"))
    ev = entry.get("event")
    if isinstance(ev, dict):
        add(ev.get("id"))
        add(ev.get("event_id"))
    add(entry.get("fixture_id"))
    add(entry.get("match_id"))
    # fallback ultim: în unele payload-uri vechi `id` chiar era event_id
    add(entry.get("id"))
    return candidates

def apply_catboost(entry, signals_map):
    sig = None
    matched_event_id = None
    for candidate in _catboost_event_candidates(entry):
        sig = signals_map.get(candidate)
        if sig:
            matched_event_id = candidate
            break
    if not sig:
        return entry

    entry["catboost_event_id"]  = matched_event_id
    entry["catboost_signal"]    = sig.get("signal")
    entry["catboost_market"]    = sig.get("market")
    entry["catboost_score"]     = sig.get("score")
    entry["catboost_ev_pct"]    = sig.get("ev_pct")
    entry["catboost_kelly_pct"] = sig.get("kelly_pct")
    entry["catboost_edge_pp"]   = sig.get("edge_pp")
    entry["catboost_prob"]      = sig.get("final_prob") or sig.get("adjusted_prob") or sig.get("model_prob")
    entry["catboost_risk_tier"] = sig.get("risk_tier")
    entry["catboost_rationale"] = sig.get("rationale")
    return entry

# ─── build_status.json ────────────────────────────────────────────────────────

def write_build_status(n_total, n_enriched, n_safe, n_value, n_balanced,
                       blacklisted_markets, n_poisson, errors,
                       n_catboost_applied=0, n_catboost_available=0):
    try:
        import re
        html = Path("index.html").read_text(encoding="utf-8")
        m = re.search(r'app\.js\?v=([^"\'&]+)', html)
        ui_ver = m.group(1) if m else "unknown"
    except Exception:
        ui_ver = "unknown"
    save_json(DATA_DIR / "build_status.json", {
        "updated_at":          datetime.now(timezone.utc).isoformat(),
        "ui_version":          ui_ver,
        "total_matches":       n_total,
        "enriched":            n_enriched,
        "safe_picks":          n_safe,
        "value_picks":         n_value,
        "balanced_picks":      n_balanced,
        "poisson_enriched":    n_poisson,
        "catboost_signals_available": n_catboost_available,
        "catboost_signals_applied":   n_catboost_applied,
        "blacklisted_markets": blacklisted_markets,
        "errors":              errors[:20],
        "status":              "ok" if not errors else "partial",
    })

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=== ENRICH PREDICTIONS v3 (Poisson/Dixon-Coles) ===")

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        write_build_status(0,0,0,0,0,[],0,["predictions.json lipsă"])
        return

    raw = load_json(pred_path, [])
    predictions = (raw if isinstance(raw, list)
                   else raw.get("predictions") or raw.get("results")
                   or raw.get("events") or list(raw.values()))
    print(f"Predicții: {len(predictions)}")

    blacklist = build_market_blacklist()
    if blacklist:
        print(f"Blacklist ({len(blacklist)}): {list(blacklist.keys())}")

    signals_map = merge_ev_signals(DATA_DIR / "ev_signals_v2.json")

    enriched_list = []
    errors = []
    n_safe = n_value = n_balanced = n_poisson = n_catboost = 0

    for entry in predictions:
        if not isinstance(entry, dict): continue
        try:
            e = enrich_entry(entry, blacklist)
            e = apply_catboost(e, signals_map)
            enriched_list.append(e)
            tier = e.get("risk_tier","Avoid")
            if tier == "Safe":       n_safe += 1
            elif tier == "Value":    n_value += 1
            elif tier == "Balanced": n_balanced += 1
            if e.get("poisson_metrics"): n_poisson += 1
            if e.get("catboost_signal"): n_catboost += 1
        except Exception as exc:
            eid = entry.get("id") or "?"
            errors.append(f"id={eid}: {exc}")
            enriched_list.append(entry)

    if isinstance(raw, list):
        save_json(pred_path, enriched_list)
    else:
        wk = next((k for k in ("predictions","results","events") if k in raw), None)
        if wk: raw[wk] = enriched_list; save_json(pred_path, raw)
        else: save_json(pred_path, enriched_list)

    print(f"Gata: {len(enriched_list)} | Safe={n_safe} Value={n_value} "
          f"Balanced={n_balanced} | Poisson={n_poisson}/{len(enriched_list)} "
          f"| CatBoost={n_catboost}/{len(signals_map)}")
    if errors: print(f"  Erori: {errors[:3]}")

    write_build_status(len(predictions), len(enriched_list),
                       n_safe, n_value, n_balanced,
                       list(blacklist.keys()), n_poisson, errors,
                       n_catboost_applied=n_catboost,
                       n_catboost_available=len(signals_map))

    print("\nTop 5:")
    top = sorted([e for e in enriched_list if e.get("best_market")
                  and e.get("risk_tier") != "Avoid"],
                 key=lambda x: x["best_market"].get("score",0), reverse=True)[:5]
    for e in top:
        bm = e["best_market"]
        ev2 = e.get("event",{})
        h = str(ev2.get("home_team") or e.get("home_team","?"))[:14]
        a = str(ev2.get("away_team") or e.get("away_team","?"))[:14]
        alert = " ⚡POISSON" if bm.get("poisson_alert") else ""
        print(f"  [{bm['score']:5.1f}] {bm['market']:10s} | {h:14s} vs {a:14s} | "
              f"blend={bm['prob']:.3f} edge={bm['edge_pp']:+.1f}pp "
              f"EV={bm['ev_pct']:+.1f}% [{bm['risk_tier']}]{alert}")

if __name__ == "__main__":
    main()
