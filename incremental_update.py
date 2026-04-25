#!/usr/bin/env python3
"""
incremental_update.py — SmartBet Fusion v2 | Actualizare incrementală
======================================================================
Rulat săptămânal (Luni dimineață) după fetch_history_batch.py --mode incremental.
Continuă antrenarea CatBoost existent pe datele noi fără retrain complet.

Rulare:
  python3 incremental_update.py
  python3 incremental_update.py --full-retrain    # forțează retrain complet
"""

import json, sys, argparse
from pathlib import Path
from datetime import datetime, timezone, timedelta

DATA_DIR   = Path("data")
MODELS_DIR = Path("models")

TARGETS = {
    "home_win":  "target_home_win",
    "draw":      "target_draw",
    "away_win":  "target_away_win",
    "btts":      "target_btts_yes",
    "over15":    "target_over_15",
    "over25":    "target_over_25",
    "under35":   "target_under_35",
}

META_COLS = {
    "event_id","date","season_id","season_year","season_name",
    "league","league_id","home_team","away_team","home_team_id","away_team_id",
    "eligible_min3","eligible_min5","history_balance","target_result_1x2",
    "home_streak_type","away_streak_type",
} | set(TARGETS.values())

CAT_FEATURES = ["league", "home_streak_type", "away_streak_type"]

CB_INCREMENTAL = {
    "iterations":           80,
    "learning_rate":        0.02,
    "depth":                6,
    "l2_leaf_reg":          4.0,
    "loss_function":        "Logloss",
    "eval_metric":          "AUC",
    "early_stopping_rounds": 20,
    "random_seed":          42,
    "verbose":              0,
    "allow_writing_files":  False,
}


def _f(v, default=0.0):
    try: return float(v)
    except Exception: return default


def get_recent_data(days=30):
    """Returnează datele din ultimele N zile din features_v2.json."""
    try:
        import pandas as pd
    except ImportError:
        print("ERROR: pandas necesar"); sys.exit(1)

    path = DATA_DIR / "features_v2.json"
    if not path.exists():
        print("ERROR: features_v2.json nu există"); sys.exit(1)

    with open(path) as f:
        rows = json.load(f)

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=days)
    recent = df[df["date"] >= cutoff].copy()
    print(f"Date recente ({days}z): {len(recent)} meciuri")
    return recent


def get_feature_cols(df):
    all_cols  = set(df.columns)
    feat_cols = sorted(all_cols - META_COLS - {"date"})
    valid = []
    for c in feat_cols:
        if df[c].isna().mean() < 0.80:
            valid.append(c)
    return valid


def prep_X(df, feat_cols):
    import pandas as pd
    X = df[feat_cols].copy()
    num_cols = [c for c in feat_cols if c not in CAT_FEATURES]
    for c in num_cols:
        if c in X.columns:
            X[c] = pd.to_numeric(X[c], errors="coerce").fillna(X[c].median())
    for c in CAT_FEATURES:
        if c in X.columns:
            X[c] = X[c].fillna("N/A").astype(str)
    return X


def incremental_train_market(market_key, target_col, df_new, feat_cols):
    """Continuă antrenarea pe date noi cu CatBoost init_model."""
    model_path = MODELS_DIR / f"catboost_{market_key}.cbm"
    if not model_path.exists():
        print(f"  Model {market_key} nu există, skip incremental (rulează train complet)")
        return False

    try:
        from catboost import CatBoostClassifier, Pool
    except ImportError:
        print("ERROR: catboost nu e instalat"); sys.exit(1)

    y = df_new[target_col]
    if len(df_new) < 30 or y.mean() < 0.02 or y.mean() > 0.98:
        print(f"  {market_key}: prea puțin/dezechilibrat, skip")
        return False

    X = prep_X(df_new, feat_cols)
    cat_idx = [feat_cols.index(c) for c in CAT_FEATURES if c in feat_cols]

    # Încarcă modelul existent
    existing = CatBoostClassifier()
    existing.load_model(str(model_path))

    # Continuă antrenarea
    p = {**CB_INCREMENTAL}
    updated = CatBoostClassifier(**p)
    pool = Pool(X.values, y.values, cat_features=cat_idx, feature_names=list(feat_cols))
    updated.fit(pool, init_model=existing)

    # Backup + salvare
    backup_path = MODELS_DIR / f"catboost_{market_key}_prev.cbm"
    model_path.rename(backup_path)
    updated.save_model(str(model_path))
    print(f"  {market_key}: model actualizat ({len(df_new)} meciuri noi)")
    return True


def update_model_pack_timestamp():
    """Actualizează updated_at în model_pack_v2.json."""
    pack_path = DATA_DIR / "model_pack_v2.json"
    if not pack_path.exists():
        return
    with open(pack_path) as f:
        pack = json.load(f)
    pack["updated_at"]      = datetime.now(timezone.utc).isoformat()
    pack["last_incremental"] = datetime.now(timezone.utc).isoformat()
    with open(pack_path, "w") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
    print(f"  model_pack_v2.json timestamp actualizat")


def main():
    parser = argparse.ArgumentParser(description="SmartBet v2 - Incremental Update")
    parser.add_argument("--full-retrain", action="store_true",
                        help="Forțează retrain complet (apelează train_engine_v2.py)")
    parser.add_argument("--days", type=int, default=30,
                        help="Zile de date recente pentru incremental (default 30)")
    args = parser.parse_args()

    if args.full_retrain:
        print("=== FULL RETRAIN ===")
        import subprocess
        result = subprocess.run([sys.executable, "train_engine_v2.py"], check=False)
        sys.exit(result.returncode)

    print(f"=== INCREMENTAL UPDATE (+{args.days} zile) ===")

    # 1. Rebuild features (dacă există date noi în warehouse)
    print("\n[1/4] Rebuild feature_engineering...")
    try:
        import subprocess
        subprocess.run([sys.executable, "feature_engineering.py"], check=True, timeout=300)
    except Exception as e:
        print(f"  WARN feature_engineering: {e}")

    # 2. Obține date recente
    print("\n[2/4] Obțin date recente...")
    df_new = get_recent_data(days=args.days)
    if len(df_new) < 50:
        print(f"  Prea puțin date recente ({len(df_new)}), skip incremental training")
    else:
        feat_cols = get_feature_cols(df_new)
        print(f"\n[3/4] Incremental training pe {len(feat_cols)} features...")
        for mk, target in TARGETS.items():
            incremental_train_market(mk, target, df_new, feat_cols)

    # 4. Recalculare EV signals
    print("\n[4/4] EV signals pe meciuri curente...")
    try:
        import subprocess
        subprocess.run([sys.executable, "ev_calculator.py"], check=True, timeout=60)
    except Exception as e:
        print(f"  WARN ev_calculator: {e}")

    update_model_pack_timestamp()
    print("\n=== INCREMENTAL UPDATE DONE ===")


if __name__ == "__main__":
    main()
