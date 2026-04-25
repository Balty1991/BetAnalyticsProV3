#!/usr/bin/env python3
"""
fix_ui_display.py — Generează fișierele JSON compatibile v1 pentru UI
=====================================================================
Rezolvă "0 meciuri indexate" și "0 piețe calibrate" din interfață.
Rulat o dată după train_engine_v2.py sau în pipeline.
"""

import json
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR  = Path("data")
WAREHOUSE = Path("data/warehouse")


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except: return default


def generate_api_history_summary():
    """
    Actualizează api_history_summary.json cu datele din warehouse v2.
    Fix pentru "0 meciuri indexate".
    """
    wh_summary = load_json(WAREHOUSE / "summary.json", {})
    wh_index   = load_json(WAREHOUSE / "index.json", {})
    existing   = load_json(DATA_DIR / "api_history_summary.json", {})

    events_total = wh_summary.get("events_total", 0)
    leagues      = wh_summary.get("leagues_total", 0)
    seasons      = wh_summary.get("seasons_fetched", 0)
    year_min     = wh_summary.get("year_min")
    year_max     = wh_summary.get("year_max")

    # Format compatibil cu ce citește app.js
    updated = {
        **existing,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "valid": {
            "leagues_total":  leagues,
            "seasons_total":  seasons,
            "total_events":   events_total,
        },
        "events_summary": {
            "total_events_counted": events_total,
            "year_min":             year_min,
            "year_max":             year_max,
        },
        # Câmpuri suplimentare folosite de UI
        "total_matches":    events_total,
        "total_leagues":    leagues,
        "total_seasons":    seasons,
        "v2_warehouse":     True,
        "v2_updated_at":    datetime.now(timezone.utc).isoformat(),
    }

    out_path = DATA_DIR / "api_history_summary.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)
    print(f"✓ api_history_summary.json: {events_total:,} meciuri, {leagues} ligi")
    return updated


def generate_training_market_baselines():
    """
    Generează training_market_baselines.json în formatul așteptat de app.js.
    Fix pentru "0 piețe calibrate".
    Format așteptat: array de obiecte cu {market, win_rate, ...}
    """
    pack     = load_json(DATA_DIR / "model_pack_v2.json", {})
    wfv      = load_json(DATA_DIR / "wfv_results_v2.json", {})
    markets  = pack.get("markets", {})

    MARKET_LABELS = {
        "home_win":  "Home Win",
        "draw":      "Draw",
        "away_win":  "Away Win",
        "btts":      "BTTS Yes",
        "over15":    "Over 1.5G",
        "over25":    "Over 2.5G",
        "under35":   "Under 3.5G",
    }

    baselines = []
    for mk, label in MARKET_LABELS.items():
        mm = markets.get(mk, {})
        if not mm: continue

        wfv_folds = (wfv.get("markets") or {}).get(mk, [])
        aucs = [f.get("calibrated", {}).get("auc_roc") for f in wfv_folds if f.get("calibrated")]
        aucs = [a for a in aucs if a]
        avg_auc = round(sum(aucs)/len(aucs), 4) if aucs else None

        baselines.append({
            "market":          label,
            "market_key":      mk,
            # win_rate = taxa de succes estimată (pozitivele din test set)
            "win_rate":        round(_f(mm.get("positive_rate", 0)) * 100, 2),
            "positive_rate":   mm.get("positive_rate"),
            "test_auc":        mm.get("test_auc"),
            "test_ece":        mm.get("test_ece"),
            "wfv_avg_auc":     avg_auc or mm.get("wfv_avg_auc"),
            "wfv_folds":       mm.get("wfv_folds"),
            "n_train":         mm.get("n_train"),
            "calibrated":      True,
            "model":           "catboost-v2",
            "shap_top":        mm.get("shap_top_features", [])[:5],
        })

    out_path = DATA_DIR / "training_market_baselines.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(baselines, f, ensure_ascii=False, indent=2)
    print(f"✓ training_market_baselines.json: {len(baselines)} piețe calibrate")
    return baselines


def generate_training_model_summary():
    """
    Actualizează training_model_summary.json cu metricile v2.
    """
    pack    = load_json(DATA_DIR / "model_pack_v2.json", {})
    feat_s  = load_json(DATA_DIR / "features_v2_summary.json", {})
    markets = pack.get("markets", {})

    aucs = [m.get("wfv_avg_auc") for m in markets.values() if m.get("wfv_avg_auc")]
    eces = [m.get("test_ece")    for m in markets.values() if m.get("test_ece")]

    summary = {
        "version":             "smartbet-fusion-v2",
        "updated_at":          datetime.now(timezone.utc).isoformat(),
        "rows_total":          feat_s.get("rows_total", 0),
        "rows_eligible_min5":  feat_s.get("eligible_min5", 0),
        "rows_ready":          feat_s.get("eligible_min5", 0),
        "feature_count":       feat_s.get("feature_count", 0),
        "markets_trained":     len(markets),
        "avg_wfv_auc":         round(sum(aucs)/len(aucs), 4) if aucs else None,
        "avg_test_ece":        round(sum(eces)/len(eces), 4) if eces else None,
        "model_type":          "CatBoostClassifier",
        "calibration":         "IsotonicRegression",
        "validation":          "walk-forward-timeseries",
        "leagues_in_training": feat_s.get("leagues", 0),
    }

    out_path = DATA_DIR / "training_model_summary.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"✓ training_model_summary.json: {summary['rows_total']:,} rows, AUC {summary['avg_wfv_auc']}")
    return summary


def _f(v, d=0.0):
    try: return float(v)
    except: return d


def main():
    print("=== FIX UI DISPLAY ===\n")
    DATA_DIR.mkdir(exist_ok=True)

    generate_api_history_summary()
    generate_training_market_baselines()
    generate_training_model_summary()

    print("\n=== DONE ===")
    print("Acum rulează predict_current.py pentru semnalele pe meciuri de azi.")


if __name__ == "__main__":
    main()
