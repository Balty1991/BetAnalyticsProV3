#!/usr/bin/env python3
"""
build_model_quality.py — Calibrare reală din predicții istorice.
=================================================================
Calculează Brier, log_loss, ECE per piață din recommendation_log.json
(predicțiile cu won != None = meciuri finalizate).
"""
from __future__ import annotations
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from analytics_core import brier_binary, expected_calibration_error, log_loss_binary, quality_grade, safe_float

DATA_DIR = Path("data")
MARKET_LABELS = {"under35":"Sub 3.5G","over15":"Peste 1.5G","over25":"Peste 2.5G","btts":"Ambele marchează","home_win":"Victorie gazdă","draw":"Egal","away_win":"Victorie oaspete","over35":"Peste 3.5G"}
ECE_THRESHOLDS = {"excellent":0.05,"good":0.08,"warn":0.12}
BRIER_THRESHOLDS = {"excellent":0.15,"good":0.22,"warn":0.28}
MIN_SAMPLES = 20

def load_json(path, default=None):
    try:
        with path.open(encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2); f.write("\n")

def as_list(data):
    if isinstance(data, list): return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for k in ("log","recommendations","results","predictions","signals"):
            v = data.get(k)
            if isinstance(v, list): return [x for x in v if isinstance(x, dict)]
    return []

def calibration_per_market(closed):
    groups = defaultdict(list)
    for row in closed:
        mkt = row.get("market_key") or row.get("market","")
        won = row.get("won")
        if won is None or not mkt: continue
        prob_raw = safe_float(row.get("adjusted_prob") or row.get("model_prob"), -1.0)
        if prob_raw < 0: continue
        prob = prob_raw / 100.0 if prob_raw > 1.5 else prob_raw
        if not (0.001 <= prob <= 0.999): continue
        groups[mkt].append((prob, 1 if won else 0, safe_float(row.get("odds"), 0.0)))

    results = {}
    for mkt, samples in sorted(groups.items()):
        n = len(samples)
        probs = [s[0] for s in samples]
        outcomes = [s[1] for s in samples]
        brier   = brier_binary(outcomes, probs)
        logloss = log_loss_binary(outcomes, probs)
        ece     = expected_calibration_error(outcomes, probs, bins=8, min_bin_size=3)
        wins = sum(outcomes)
        profit = sum((o-1)*w-(1-w) for p,w,o in samples if o>1.01)
        roi = profit/n*100.0 if n>0 else 0.0
        score = 50.0
        if brier is not None: score += max(0.0,(BRIER_THRESHOLDS["warn"]-brier)/BRIER_THRESHOLDS["warn"]*25.0)
        if ece is not None: score += max(0.0,(ECE_THRESHOLDS["warn"]-ece)/ECE_THRESHOLDS["warn"]*25.0)
        score = min(100.0, max(0.0, score))
        if ece is None: calib = "insuficient"
        elif ece < ECE_THRESHOLDS["excellent"]: calib = "excelent"
        elif ece < ECE_THRESHOLDS["good"]: calib = "bun"
        elif ece < ECE_THRESHOLDS["warn"]: calib = "acceptabil"
        else: calib = "problematic"
        results[mkt] = {"market":mkt,"label":MARKET_LABELS.get(mkt,mkt),"n":n,"credible":n>=MIN_SAMPLES,"brier":round(brier,4) if brier else None,"log_loss":round(logloss,4) if logloss else None,"ece":round(ece,4) if ece else None,"calib_label":calib,"winrate":round(wins/n*100.0,2),"roi_pct":round(roi,2),"n_wins":wins,"score":round(score,1),"grade":quality_grade(score)}
    return results

def data_freshness(meta):
    ts = (meta.get("generated_at") or meta.get("updated_at") or meta.get("last_update")) if isinstance(meta, dict) else None
    if not ts: return {"age_hours":None,"color":"red","label":"necunoscut"}
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z","+00:00"))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc)-dt.astimezone(timezone.utc)).total_seconds()/3600.0
    except Exception: return {"age_hours":None,"color":"red","label":"eroare"}
    if age<=6: color,label="green",f"{age:.1f}h"
    elif age<=24: color,label="yellow",f"{age:.1f}h"
    else: color,label="red",f"{age:.0f}h — date vechi"
    return {"age_hours":round(age,2),"color":color,"label":label}

def build_recommendations(markets, backtest, n_closed):
    recs = []
    if n_closed < MIN_SAMPLES: recs.append(f"Istoric insuficient ({n_closed} meciuri). Calibrarea devine credibilă după {MIN_SAMPLES}+ rezultate.")
    bad = [m for m in markets.values() if m.get("calib_label")=="problematic"]
    if bad: recs.append("Piețe cu calibrare problematică (ECE>0.12): "+", ".join(m["label"] for m in bad)+".")
    neg_roi = [m for m in markets.values() if m.get("roi_pct",0)<-10 and m.get("n",0)>=MIN_SAMPLES]
    if neg_roi: recs.append("ROI negativ persistent: "+", ".join(f"{m['label']} ({m['roi_pct']:.1f}%)" for m in neg_roi)+".")
    bt_roi = safe_float(backtest.get("engine_roi"),0.0)
    if bt_roi>5: recs.append(f"Backtest ROI global: +{bt_roi:.1f}% — semnal pozitiv.")
    elif bt_roi<-5: recs.append(f"Backtest ROI global: {bt_roi:.1f}% — revizuiește pragurile.")
    if not recs: recs.append("Calibrare în parametri normali. Continuă colectarea de rezultate.")
    return recs[:6]

def main():
    print("=== BUILD MODEL QUALITY v2 ===")
    log        = as_list(load_json(DATA_DIR/"recommendation_log.json", []))
    meta       = load_json(DATA_DIR/"meta.json", {})
    backtest   = load_json(DATA_DIR/"backtest.json", {}) or {}
    predictions = as_list(load_json(DATA_DIR/"predictions.json", []))
    ev_signals  = as_list(load_json(DATA_DIR/"ev_signals_v2.json", {}))
    closed = [r for r in log if r.get("won") is not None]
    print(f"  Log: {len(log)} | Finalizate: {len(closed)}")
    markets_data = calibration_per_market(closed)
    freshness    = data_freshness(meta)
    bt = backtest if isinstance(backtest, dict) else {}
    recs = build_recommendations(markets_data, bt, len(closed))
    credible = [m for m in markets_data.values() if m["credible"]]
    global_score = round(sum(m["score"] for m in credible)/len(credible),1) if credible else 45.0
    payload = {
        "updated_at":    datetime.now(timezone.utc).isoformat(),
        "quality_score": global_score,
        "quality_grade": quality_grade(global_score),
        "coverage":{"predictions":len(predictions),"ev_signals":len(ev_signals),"log_total":len(log),"log_closed":len(closed),"markets_audited":len(markets_data)},
        "freshness":     freshness,
        "markets":       list(markets_data.values()),
        "backtest":{"roi_pct":safe_float(bt.get("engine_roi"),0.0),"winrate":safe_float(bt.get("engine_winrate"),0.0),"n_bets":int(safe_float(bt.get("engine_bets"),0.0)),"avg_odds":safe_float(bt.get("engine_avg_odds"),0.0),"avg_edge":safe_float(bt.get("engine_avg_edge"),0.0)},
        "recommendations": recs,
        "ui_cards":[
            {"label":"Scor calibrare","value":global_score,"suffix":"/100","tone":"good" if global_score>=72 else ("warn" if global_score>=55 else "bad")},
            {"label":"Meciuri analizate","value":len(closed),"suffix":" finalizate","tone":"good" if len(closed)>=MIN_SAMPLES else "warn"},
            {"label":"ROI backtest","value":round(safe_float(bt.get("engine_roi"),0.0),1),"suffix":"%","tone":"good" if safe_float(bt.get("engine_roi"),0.0)>0 else "bad"},
            {"label":"Piețe auditate","value":len(markets_data),"suffix":" piețe","tone":"good" if len(markets_data)>=3 else "warn"},
        ],
    }
    save_json(DATA_DIR/"model_quality.json", payload)
    print(f"  Salvat — scor {global_score}/100")
    for m in payload["markets"]:
        print(f"    {m['market']:10s} n={m['n']:3d} Brier={str(m['brier']):>6} ECE={str(m['ece']):>6} calib={m['calib_label']:12s} ROI={m['roi_pct']:+.1f}%")

if __name__ == "__main__":
    main()
