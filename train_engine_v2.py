#!/usr/bin/env python3
"""
train_engine_v2.py — SmartBet Fusion v2 | Layer 3: CatBoost Training
======================================================================
Antrenează 7 modele CatBoost binare (unul per piață) pe data/features_v2.json.
Include: calibrare Isotonic, SHAP export, metrici WFV, export model_pack_v2.json.

Rulare:
  python3 train_engine_v2.py
  python3 train_engine_v2.py --market over25      # numai un model
  python3 train_engine_v2.py --skip-wfv           # rapid, fără WFV complet
  python3 train_engine_v2.py --tune               # cu Optuna hyperparameter tuning
"""

import json, os, sys, argparse, math, warnings, pickle
from pathlib import Path
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.metrics import (roc_auc_score, log_loss, brier_score_loss,
                              precision_score, accuracy_score)
from sklearn.isotonic import IsotonicRegression
from sklearn.model_selection import train_test_split
from sklearn.calibration import calibration_curve

warnings.filterwarnings("ignore")

DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)

# ─── Targets ──────────────────────────────────────────────────────────────────
TARGETS = {
    "home_win":  "target_home_win",
    "draw":      "target_draw",
    "away_win":  "target_away_win",
    "btts":      "target_btts_yes",
    "over15":    "target_over_15",
    "over25":    "target_over_25",
    "under35":   "target_under_35",
}

# ─── Feature columns (exclude meta + targets) ─────────────────────────────────
META_COLS = {
    "event_id","date","season_id","season_year","season_name",
    "league","league_id","home_team","away_team","home_team_id","away_team_id",
    "eligible_min3","eligible_min5","history_balance",
    "target_result_1x2",
    "home_streak_type","away_streak_type",
} | set(TARGETS.values())

# Categorical features pentru CatBoost
CAT_FEATURES = ["league", "home_streak_type", "away_streak_type"]

# ─── CatBoost base params ──────────────────────────────────────────────────────
CB_BASE = {
    "iterations":           700,
    "learning_rate":        0.03,
    "depth":                6,
    "l2_leaf_reg":          4.0,
    "border_count":         128,
    "loss_function":        "Logloss",
    "eval_metric":          "AUC",
    "early_stopping_rounds": 60,
    "random_seed":          42,
    "verbose":              0,
    "thread_count":         -1,
    "allow_writing_files":  False,
}

# ─── Helpers ──────────────────────────────────────────────────────────────────
def _f(v, default=0.0):
    try: return float(v)
    except Exception: return default


def load_features(min_eligible=3):
    path = DATA_DIR / "features_v2.json"
    if not path.exists():
        print("ERROR: data/features_v2.json nu există. Rulează feature_engineering.py mai întâi.")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    df = df.sort_values("date").reset_index(drop=True)

    # Filtrăm rândurile cu prea puțin istoric
    if min_eligible == 5:
        df = df[df.get("eligible_min5", pd.Series(0, index=df.index)) == 1]
    else:
        df = df[df.get("eligible_min3", pd.Series(0, index=df.index)) >= 0]
        # Excludem primele 3 meciuri per echipă (0 form data)
        df = df[(df.get("home_matches_pre", 0) >= 2) | (df.get("away_matches_pre", 0) >= 2)]

    print(f"Dataset: {len(df)} rânduri după filtrare.")
    return df


def get_feature_cols(df):
    """Determină feature columns: tot ce nu e meta sau target."""
    all_cols = set(df.columns)
    feat_cols = sorted(all_cols - META_COLS - {"date"})
    # Excludem coloane cu >80% NaN
    valid = []
    for c in feat_cols:
        null_pct = df[c].isna().mean()
        if null_pct < 0.80:
            valid.append(c)
    print(f"Features valide: {len(valid)} (din {len(feat_cols)} totale)")
    return valid


def fit_feature_defaults(df, feat_cols):
    """Mediile/medianele de imputare se învață doar din train ca să evităm leakage în validare."""
    defaults = {}
    for c in feat_cols:
        if c in CAT_FEATURES:
            defaults[c] = "N/A"
            continue
        try:
            vals = pd.to_numeric(df[c], errors="coerce") if c in df.columns else pd.Series(dtype=float)
            med = vals.median()
            defaults[c] = 0.0 if pd.isna(med) else float(med)
        except Exception:
            defaults[c] = 0.0
    return defaults


def prep_X(df, feat_cols, defaults=None):
    """Prepară X: fill NaN consistent, cast categorice."""
    X = df[feat_cols].copy()
    defaults = defaults or fit_feature_defaults(df, feat_cols)
    for c in feat_cols:
        if c not in X.columns:
            X[c] = None
        if c in CAT_FEATURES:
            X[c] = X[c].fillna(str(defaults.get(c, "N/A"))).astype(str)
        else:
            X[c] = pd.to_numeric(X[c], errors="coerce").fillna(float(defaults.get(c, 0.0)))
    return X


def reliability_curve_json(y_true, y_prob, n_bins=10):
    """Reliability curve pentru calibrare report."""
    try:
        frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="quantile")
        return [{"predicted": round(float(mp), 4), "actual": round(float(fp), 4)}
                for mp, fp in zip(mean_pred, frac_pos)]
    except Exception:
        return []


def eval_metrics(y_true, y_prob, threshold=0.55):
    """Calculează toate metricile de evaluare."""
    if len(y_true) < 10:
        return {}
    m = {}
    try:
        m["auc_roc"]     = round(roc_auc_score(y_true, y_prob), 4)
        m["log_loss"]    = round(log_loss(y_true, y_prob), 4)
        m["brier"]       = round(brier_score_loss(y_true, y_prob), 4)
        y_pred = (y_prob >= threshold).astype(int)
        m["accuracy"]    = round(accuracy_score(y_true, y_pred), 4)
        m["precision"]   = round(precision_score(y_true, y_pred, zero_division=0), 4)
        m["n"]           = int(len(y_true))
        m["pos_rate"]    = round(float(y_true.mean()), 4)
        # ECE
        bins  = np.linspace(0, 1, 11)
        ece   = 0.0
        total = len(y_true)
        for lo, hi in zip(bins[:-1], bins[1:]):
            mask = (y_prob >= lo) & (y_prob < hi)
            if mask.sum() < 5: continue
            ece += abs(y_prob[mask].mean() - y_true[mask].mean()) * mask.sum() / total
        m["ece"] = round(float(ece), 4)
    except Exception as e:
        m["error"] = str(e)
    return m


# ─── CatBoost trainer ─────────────────────────────────────────────────────────
def train_model(X_train, y_train, X_val, y_val, feat_cols, params=None):
    """Antrenează un model CatBoost și returnează (model, val_probs)."""
    try:
        from catboost import CatBoostClassifier, Pool
    except ImportError:
        print("ERROR: catboost nu este instalat. Rulează: pip install catboost")
        sys.exit(1)

    p = {**CB_BASE, **(params or {})}
    cat_idx = [feat_cols.index(c) for c in CAT_FEATURES if c in feat_cols]

    model = CatBoostClassifier(**p)
    train_pool = Pool(X_train.values, y_train.values, cat_features=cat_idx,
                      feature_names=list(feat_cols))
    val_pool   = Pool(X_val.values,   y_val.values,   cat_features=cat_idx,
                      feature_names=list(feat_cols))
    model.fit(train_pool, eval_set=val_pool)

    val_probs = model.predict_proba(val_pool)[:, 1]
    return model, val_probs


def calibrate(train_probs, train_labels, val_probs):
    """Antrenează calibrator Isotonic pe train, aplică pe val."""
    ir = IsotonicRegression(out_of_bounds="clip")
    ir.fit(train_probs, train_labels)
    cal_probs = ir.transform(val_probs)
    return ir, cal_probs


def shap_importance(model, X_sample, feat_cols, top_n=30):
    """Calculează SHAP importance medie pe un sample."""
    try:
        import shap
        explainer   = shap.TreeExplainer(model)
        # Sample max 2000 rânduri pentru viteză
        sample = X_sample.sample(min(2000, len(X_sample)), random_state=42)
        shap_vals = explainer.shap_values(sample.values)
        importance = np.abs(shap_vals).mean(axis=0)
        ranked = sorted(zip(feat_cols, importance), key=lambda x: x[1], reverse=True)
        return [{"feature": f, "importance": round(float(v), 6)} for f, v in ranked[:top_n]]
    except Exception as e:
        print(f"  WARN SHAP: {e}")
        # Fallback: CatBoost feature importance
        try:
            imp = model.get_feature_importance()
            ranked = sorted(zip(feat_cols, imp), key=lambda x: x[1], reverse=True)
            return [{"feature": f, "importance": round(float(v) / 100.0, 6)} for f, v in ranked[:top_n]]
        except Exception:
            return []


# ─── Walk-Forward Validation ──────────────────────────────────────────────────
def walk_forward_splits(df, min_train_years=0.75, val_months=3, gap_days=14):
    """Generează split-uri WFV time-series."""
    dates   = df["date"]
    t_min   = dates.min()
    t_max   = dates.max()
    cutoff  = t_min + pd.DateOffset(months=int(min_train_years * 12))
    end     = t_max - pd.DateOffset(months=val_months)

    splits  = []
    while cutoff <= end:
        val_start = cutoff + pd.Timedelta(days=gap_days)
        val_end   = val_start + pd.DateOffset(months=val_months)

        train_mask = dates < cutoff
        val_mask   = (dates >= val_start) & (dates < val_end)

        n_train = train_mask.sum()
        n_val   = val_mask.sum()
        if n_train >= 300 and n_val >= 50:
            splits.append({
                "train_end":   cutoff.isoformat(),
                "val_start":   val_start.isoformat(),
                "val_end":     val_end.isoformat(),
                "n_train":     int(n_train),
                "n_val":       int(n_val),
                "train_idx":   df.index[train_mask].tolist(),
                "val_idx":     df.index[val_mask].tolist(),
            })
        cutoff += pd.DateOffset(months=3)

    print(f"  WFV: {len(splits)} folduri generate")
    return splits


def run_wfv(df, feat_cols, target_col, params=None, max_folds=7):
    """Rulează Walk-Forward Validation. Returnează lista de rezultate per fold."""
    splits  = walk_forward_splits(df)[-max_folds:]  # ultimele max_folds
    results = []

    for i, sp in enumerate(splits):
        print(f"    Fold {i+1}/{len(splits)}: train={sp['n_train']}, val={sp['n_val']}")
        df_tr_full = df.loc[sp["train_idx"]].sort_values("date")
        df_va = df.loc[sp["val_idx"]].sort_values("date")

        # Split intern train/cal în interiorul trecutului. Nu calibrăm pe foldul de validare.
        cal_size = max(80, int(len(df_tr_full) * 0.18))
        cal_size = min(cal_size, max(1, len(df_tr_full) // 3))
        df_fit = df_tr_full.iloc[:-cal_size]
        df_cal = df_tr_full.iloc[-cal_size:]

        y_fit = df_fit[target_col]
        y_cal = df_cal[target_col]
        y_va = df_va[target_col]

        # Skip dacă prea puțin din clasa pozitivă
        if y_fit.mean() < 0.05 or y_fit.mean() > 0.95 or y_cal.nunique() < 2:
            print(f"      SKIP fold {i+1}: dezechilibru clase sau cal set invalid")
            continue

        defaults = fit_feature_defaults(df_fit, feat_cols)
        X_fit = prep_X(df_fit, feat_cols, defaults)
        X_cal = prep_X(df_cal, feat_cols, defaults)
        X_va = prep_X(df_va, feat_cols, defaults)

        model, cal_raw = train_model(X_fit, y_fit, X_cal, y_cal, feat_cols, params)
        ir, _ = calibrate(cal_raw, y_cal.values, cal_raw)
        val_probs = model.predict_proba(X_va.values)[:, 1]
        cal_probs = ir.transform(val_probs)

        m_raw = eval_metrics(y_va.values, val_probs)
        m_cal = eval_metrics(y_va.values, cal_probs)

        results.append({
            "fold":         i + 1,
            "train_end":    sp["train_end"],
            "val_start":    sp["val_start"],
            "val_end":      sp["val_end"],
            "n_train":      sp["n_train"],
            "n_val":        sp["n_val"],
            "raw":          m_raw,
            "calibrated":   m_cal,
            "reliability_curve": reliability_curve_json(y_va.values, cal_probs),
        })

    return results


def wfv_summary(wfv_results):
    """Agregă rezultatele WFV."""
    if not wfv_results:
        return {}
    aucs  = [r["calibrated"].get("auc_roc", 0) for r in wfv_results if r.get("calibrated")]
    briers= [r["calibrated"].get("brier", 1)   for r in wfv_results if r.get("calibrated")]
    eces  = [r["calibrated"].get("ece", 1)      for r in wfv_results if r.get("calibrated")]
    lls   = [r["calibrated"].get("log_loss", 1) for r in wfv_results if r.get("calibrated")]
    return {
        "folds":          len(wfv_results),
        "avg_auc":        round(np.mean(aucs), 4) if aucs else None,
        "std_auc":        round(np.std(aucs), 4)  if aucs else None,
        "min_auc":        round(np.min(aucs), 4)  if aucs else None,
        "avg_brier":      round(np.mean(briers), 4) if briers else None,
        "avg_ece":        round(np.mean(eces), 4)   if eces else None,
        "avg_log_loss":   round(np.mean(lls), 4)    if lls else None,
    }


# ─── Training per piață ───────────────────────────────────────────────────────
def train_market(df, feat_cols, market_key, target_col, do_wfv=True, do_shap=True, params=None):
    """Antrenează modelul complet pentru o piață."""
    print(f"\n{'='*60}")
    print(f"MARKET: {market_key.upper()} → {target_col}")
    print(f"{'='*60}")

    y = df[target_col]
    pos_rate = y.mean()
    print(f"  Positive rate: {pos_rate:.3f} ({y.sum():.0f}/{len(y)})")

    if pos_rate < 0.02 or pos_rate > 0.98:
        print(f"  SKIP: dezechilibru extrem ({pos_rate:.3f})")
        return None

    # Split temporal 80/10/10 (train/cal/test)
    n        = len(df)
    n_test   = max(int(n * 0.10), 200)
    n_cal    = max(int(n * 0.10), 200)
    df_test  = df.iloc[-(n_test):]
    df_cal   = df.iloc[-(n_test + n_cal):-n_test]
    df_train = df.iloc[:-(n_test + n_cal)]

    print(f"  Train: {len(df_train)} | Cal: {len(df_cal)} | Test: {len(df_test)}")

    feature_defaults = fit_feature_defaults(df_train, feat_cols)
    X_train = prep_X(df_train, feat_cols, feature_defaults)
    y_train = df_train[target_col]
    X_cal   = prep_X(df_cal, feat_cols, feature_defaults)
    y_cal   = df_cal[target_col]
    X_test  = prep_X(df_test, feat_cols, feature_defaults)
    y_test  = df_test[target_col]

    # Antrenare
    model, cal_probs_val = train_model(X_train, y_train, X_cal, y_cal, feat_cols, params)

    # Calibrare pe cal set, validare pe test set
    ir, _ = calibrate(cal_probs_val, y_cal.values, cal_probs_val)
    test_probs_raw = model.predict_proba(prep_X(df_test, feat_cols, feature_defaults).values)[:, 1]
    test_probs_cal = ir.transform(test_probs_raw)

    # Metrici test
    m_raw = eval_metrics(y_test.values, test_probs_raw)
    m_cal = eval_metrics(y_test.values, test_probs_cal)
    print(f"  TEST raw  → AUC={m_raw.get('auc_roc'):.4f}, Brier={m_raw.get('brier'):.4f}, ECE={m_raw.get('ece'):.4f}")
    print(f"  TEST cal  → AUC={m_cal.get('auc_roc'):.4f}, Brier={m_cal.get('brier'):.4f}, ECE={m_cal.get('ece'):.4f}")

    # SHAP
    shap_top = []
    if do_shap:
        print("  Calculez SHAP importance...")
        shap_top = shap_importance(model, X_train, feat_cols)
        if shap_top:
            print(f"  Top feature: {shap_top[0]['feature']} ({shap_top[0]['importance']:.4f})")

    # WFV
    wfv_results = []
    wfv_sum     = {}
    if do_wfv:
        print("  Walk-Forward Validation...")
        wfv_results = run_wfv(df, feat_cols, target_col, params, max_folds=6)
        wfv_sum     = wfv_summary(wfv_results)
        print(f"  WFV: avg_AUC={wfv_sum.get('avg_auc')}, folds={wfv_sum.get('folds')}")

    # Salvare model
    model_path = MODELS_DIR / f"catboost_{market_key}.cbm"
    model.save_model(str(model_path))
    print(f"  Model salvat: {model_path}")

    # FIX: Salvare calibrator Isotonic pe disc (era antrenat dar niciodată salvat)
    cal_path = MODELS_DIR / f"calibrator_{market_key}.pkl"
    with open(cal_path, "wb") as _cal_f:
        pickle.dump(ir, _cal_f, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"  Calibrator salvat: {cal_path}")

    return {
        "market":           market_key,
        "target":           target_col,
        "n_train":          len(df_train),
        "n_cal":            len(df_cal),
        "n_test":           len(df_test),
        "positive_rate":    round(float(pos_rate), 4),
        "test_metrics_raw": m_raw,
        "test_metrics_cal": m_cal,
        "wfv_summary":      wfv_sum,
        "wfv_folds":        wfv_results,
        "shap_top_features":shap_top[:20],
        "calibrator":       ir,
        "model_path":       str(model_path),
        "calibrator_path":  str(cal_path),
        "feat_cols":        feat_cols,
        "feature_defaults": feature_defaults,
    }


# ─── Export model_pack_v2.json ────────────────────────────────────────────────
def build_model_pack(results, feat_cols, df_for_defaults=None):
    """Construiește model_pack_v2.json pentru frontend și inferență live."""
    markets_out = {}
    for mk, res in results.items():
        if res is None:
            continue
        markets_out[mk] = {
            "target":            res["target"],
            "model_file":        Path(res["model_path"]).name,
            "calibrator_file":   Path(res["calibrator_path"]).name,
            "n_train":           res["n_train"],
            "positive_rate":     res["positive_rate"],
            "test_auc":          res["test_metrics_cal"].get("auc_roc"),
            "test_brier":        res["test_metrics_cal"].get("brier"),
            "test_ece":          res["test_metrics_cal"].get("ece"),
            "test_log_loss":     res["test_metrics_cal"].get("log_loss"),
            "wfv_avg_auc":       res["wfv_summary"].get("avg_auc"),
            "wfv_std_auc":       res["wfv_summary"].get("std_auc"),
            "wfv_folds":         res["wfv_summary"].get("folds"),
            "calibrated":        True,
            "quality_gate":      "A" if (res["wfv_summary"].get("avg_auc") or 0) >= 0.60 and (res["test_metrics_cal"].get("ece") or 1) <= 0.06 else ("B" if (res["wfv_summary"].get("avg_auc") or 0) >= 0.55 else "C"),
            "shap_top_features": res.get("shap_top_features", [])[:15],
        }

    pack_defaults = fit_feature_defaults(df_for_defaults, feat_cols) if df_for_defaults is not None else {}
    pack = {
        "version":      "smartbet-fusion-v3-reliability-gated",
        "updated_at":   datetime.now(timezone.utc).isoformat(),
        "feature_count":len(feat_cols),
        "markets":      markets_out,
        "feature_columns": feat_cols,
        "feature_defaults": pack_defaults,
        "calibration_policy": "temporal_train_cal_test_plus_walk_forward_no_val_leakage",
    }

    out_path = DATA_DIR / "model_pack_v2.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
    print(f"\nSalvat: {out_path}")

    # Salvare WFV detaliat separat
    wfv_all = {}
    for mk, res in results.items():
        if res and res.get("wfv_folds"):
            wfv_all[mk] = res["wfv_folds"]
    wfv_path = DATA_DIR / "wfv_results_v2.json"
    with open(wfv_path, "w", encoding="utf-8") as f:
        json.dump({"updated_at": datetime.now(timezone.utc).isoformat(), "markets": wfv_all},
                  f, ensure_ascii=False, indent=2)
    print(f"Salvat: {wfv_path}")

    # Salvare calibration report
    cal_report = {}
    for mk, res in results.items():
        if res and res.get("wfv_folds"):
            curves = [f.get("reliability_curve", []) for f in res["wfv_folds"]]
            cal_report[mk] = {"reliability_curves": curves}
    cal_path = DATA_DIR / "calibration_report_v2.json"
    with open(cal_path, "w", encoding="utf-8") as f:
        json.dump(cal_report, f, ensure_ascii=False, indent=2)

    return pack


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="SmartBet v2 - Train Engine")
    parser.add_argument("--market", default=None,
                        choices=list(TARGETS.keys()) + [None],
                        help="Antrenează numai această piață")
    parser.add_argument("--skip-wfv",  action="store_true", help="Skip walk-forward validation")
    parser.add_argument("--skip-shap", action="store_true", help="Skip SHAP (mai rapid)")
    parser.add_argument("--tune",      action="store_true", help="Hyperparameter tuning Optuna")
    args = parser.parse_args()

    # 1. Load data
    df        = load_features(min_eligible=3)
    feat_cols = get_feature_cols(df)

    # Hyperparameter tuning (opțional)
    params = None
    if args.tune:
        print("\n[Optuna] Hyperparameter tuning pe over25...")
        try:
            import optuna
            optuna.logging.set_verbosity(optuna.logging.WARNING)
            def objective(trial):
                p = {
                    "iterations":    trial.suggest_int("iterations", 400, 1000),
                    "learning_rate": trial.suggest_float("lr", 0.01, 0.1, log=True),
                    "depth":         trial.suggest_int("depth", 4, 8),
                    "l2_leaf_reg":   trial.suggest_float("l2", 1.0, 10.0),
                }
                res = train_market(df, feat_cols, "over25", "target_over_25",
                                   do_wfv=False, do_shap=False, params=p)
                return res["test_metrics_cal"].get("auc_roc", 0) if res else 0

            study = optuna.create_study(direction="maximize")
            study.optimize(objective, n_trials=20, show_progress_bar=True)
            params = {
                "iterations":    study.best_params["iterations"],
                "learning_rate": study.best_params["lr"],
                "depth":         study.best_params["depth"],
                "l2_leaf_reg":   study.best_params["l2"],
            }
            print(f"Best params: {params}")
        except ImportError:
            print("WARN: optuna nu e instalat. Folosesc params default.")

    # 2. Antrenare
    markets_to_train = {args.market: TARGETS[args.market]} if args.market else TARGETS
    results = {}

    for mk, target_col in markets_to_train.items():
        res = train_market(
            df, feat_cols, mk, target_col,
            do_wfv  =not args.skip_wfv,
            do_shap =not args.skip_shap,
            params  =params,
        )
        results[mk] = res

    # 3. Export
    if results:
        pack = build_model_pack(results, feat_cols, df_for_defaults=df)
        print(f"\n{'='*60}")
        print("SUMMARY:")
        for mk, res in results.items():
            if res:
                auc = res["test_metrics_cal"].get("auc_roc", "N/A")
                ece = res["test_metrics_cal"].get("ece", "N/A")
                print(f"  {mk:12s} → AUC={auc}, ECE={ece}")
        print(f"{'='*60}")
        print(f"model_pack_v2.json salvat în {DATA_DIR}/")


if __name__ == "__main__":
    main()
