#!/usr/bin/env python3
"""
export_app.py — SmartBet Fusion v2 | Layer 5: Export Frontend
==============================================================
Compilează toate JSON-urile necesare frontend-ului.
Rulat după train_engine_v2.py sau incremental_update.py.

Output final:
  data/model_pack_v2.json     → modelele + metrici + SHAP
  data/ev_signals_v2.json     → semnale EV+ pentru azi
  data/shap_global_v2.json    → SHAP importance globală
  data/backtest_v2.json       → ROI/Yield/Sharpe per WFV
  data/calibration_report_v2.json → reliability curves
  data/smartbet_meta_v2.json  → metadata sistem + health check
"""

import json, os, sys
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR  = Path("data")
MODELS_DIR= Path("models")


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(data, path, pretty=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(data, f, ensure_ascii=False, indent=2)
        else:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = Path(path).stat().st_size
    print(f"  Salvat: {path} ({size:,} bytes)")


def build_shap_global():
    """Agregă SHAP importance din model_pack_v2.json."""
    pack = load_json(DATA_DIR / "model_pack_v2.json", {})
    markets = pack.get("markets", {})
    shap_out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "version":    "v2",
        "markets":    {}
    }
    for mk, meta in markets.items():
        top = meta.get("shap_top_features", [])
        if top:
            shap_out["markets"][mk] = {
                "top_features": top[:20],
                "feature_count": len(top),
            }
    return shap_out


def build_health_check():
    """Verifică că toate fișierele critice există și sunt recente."""
    required = [
        "model_pack_v2.json",
        "features_v2.json",
        "league_baselines_v2.json",
    ]
    status = {}
    all_ok = True
    for fname in required:
        path = DATA_DIR / fname
        if path.exists():
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            age_h = (datetime.now(timezone.utc) - mtime).total_seconds() / 3600
            status[fname] = {"exists": True, "age_hours": round(age_h, 1)}
        else:
            status[fname] = {"exists": False}
            all_ok = False

    model_files = list(MODELS_DIR.glob("catboost_*.cbm")) if MODELS_DIR.exists() else []
    status["models_count"] = len(model_files)
    status["models"] = [f.name for f in model_files]

    return {"all_ok": all_ok, "files": status}


def build_smartbet_meta():
    """Metadata sistem pentru SmartBet v2."""
    pack        = load_json(DATA_DIR / "model_pack_v2.json", {})
    wfv         = load_json(DATA_DIR / "wfv_results_v2.json", {})
    feat_summary= load_json(DATA_DIR / "features_v2_summary.json", {})
    wh_summary  = load_json(DATA_DIR / "warehouse/summary.json", {})
    baselines   = load_json(DATA_DIR / "league_baselines_v2.json", {})

    markets = pack.get("markets", {})

    # Scor global sistem
    aucs = [m.get("wfv_avg_auc") for m in markets.values() if m.get("wfv_avg_auc")]
    eces = [m.get("test_ece")    for m in markets.values() if m.get("test_ece")]
    avg_auc = round(sum(aucs) / len(aucs), 4) if aucs else None
    avg_ece = round(sum(eces) / len(eces), 4) if eces else None

    # Recomandare piețe după AUC
    markets_ranked = sorted(
        [(mk, m.get("wfv_avg_auc", 0)) for mk, m in markets.items() if m.get("wfv_avg_auc")],
        key=lambda x: x[1], reverse=True
    )

    meta = {
        "version":          "smartbet-fusion-v2",
        "updated_at":       datetime.now(timezone.utc).isoformat(),
        "system": {
            "avg_wfv_auc":      avg_auc,
            "avg_test_ece":     avg_ece,
            "models_trained":   len(markets),
            "feature_count":    pack.get("feature_count"),
            "training_rows":    feat_summary.get("rows_total"),
            "eligible_rows_min5": feat_summary.get("eligible_min5"),
            "warehouse_events": wh_summary.get("events_total"),
            "warehouse_leagues":wh_summary.get("leagues_total"),
            "warehouse_year_min": wh_summary.get("year_min"),
            "warehouse_year_max": wh_summary.get("year_max"),
        },
        "markets_ranked":   [{"market": mk, "wfv_auc": auc} for mk, auc in markets_ranked],
        "leagues_count":    len(baselines),
        "health":           build_health_check(),
        # Configurație pentru frontend SmartBet Score v2
        "score_config": {
            "weights": {"prob": 0.40, "edge": 0.30, "wfv_auc": 0.20, "ece": 0.10},
            "thresholds": {
                "strong_buy": 85, "buy": 70, "watch": 60, "weak": 50
            },
            "ev_filters": {
                "min_edge_pp": 2.5,
                "min_ev_pct":  0.0,
                "min_prob":    0.52,
                "odds_min":    1.25,
                "odds_max":    5.00,
                "kelly_fraction": 0.25,
                "kelly_max_stake_pct": 8.0,
            }
        }
    }
    return meta


def main():
    print("=== EXPORT APP v2 ===\n")
    DATA_DIR.mkdir(exist_ok=True)

    # 1. SHAP global
    print("[1/5] SHAP global...")
    shap = build_shap_global()
    save_json(shap, DATA_DIR / "shap_global_v2.json", pretty=True)

    # 2. SmartBet meta
    print("[2/5] SmartBet metadata...")
    meta = build_smartbet_meta()
    save_json(meta, DATA_DIR / "smartbet_meta_v2.json", pretty=True)

    # 3. EV signals pe meciuri curente
    print("[3/5] EV signals...")
    try:
        import subprocess, sys as _sys
        subprocess.run([_sys.executable, "ev_calculator.py"], check=False, timeout=60)
    except Exception as e:
        print(f"  WARN: {e}")

    # 4. League baselines (comprimat pentru frontend)
    print("[4/5] League baselines frontend...")
    baselines = load_json(DATA_DIR / "league_baselines_v2.json", {})
    if baselines:
        # Versiune comprimată (fără câmpuri inutile pentru UI)
        bl_compact = {
            lg: {
                "avg_goals":     v.get("avg_goals"),
                "home_win_rate": v.get("home_win_rate"),
                "draw_rate":     v.get("draw_rate"),
                "btts_rate":     v.get("btts_yes_rate"),
                "over25_rate":   v.get("over_25_rate"),
                "under35_rate":  v.get("under_35_rate"),
                "matches":       v.get("matches"),
            }
            for lg, v in baselines.items()
        }
        save_json(bl_compact, DATA_DIR / "league_baselines_compact.json")

    # 5. Health report
    print("[5/5] Health check...")
    health = build_health_check()
    print(f"  Status: {'✓ OK' if health['all_ok'] else '✗ ERORI'}")
    print(f"  Modele: {health['files'].get('models_count', 0)} .cbm files")
    for fname, st in health["files"].items():
        if isinstance(st, dict):
            status_str = f"✓ ({st.get('age_hours', '?')}h vechi)" if st.get("exists") else "✗ LIPSĂ"
            print(f"    {fname}: {status_str}")

    print("\n=== EXPORT COMPLET ===")
    print(f"  model_pack_v2.json    → {'✓' if (DATA_DIR/'model_pack_v2.json').exists() else '✗'}")
    print(f"  ev_signals_v2.json   → {'✓' if (DATA_DIR/'ev_signals_v2.json').exists() else '✗'}")
    print(f"  shap_global_v2.json  → {'✓' if (DATA_DIR/'shap_global_v2.json').exists() else '✗'}")
    print(f"  smartbet_meta_v2.json→ {'✓' if (DATA_DIR/'smartbet_meta_v2.json').exists() else '✗'}")
    print(f"  backtest_v2.json     → {'✓' if (DATA_DIR/'backtest_v2.json').exists() else '✗'}")
    print(f"  wfv_results_v2.json  → {'✓' if (DATA_DIR/'wfv_results_v2.json').exists() else '✗'}")


if __name__ == "__main__":
    main()
