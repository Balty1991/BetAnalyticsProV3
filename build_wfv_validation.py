#!/usr/bin/env python3
"""
build_wfv_validation.py — Walk-Forward Validation pe date istorice.
====================================================================
Fără CatBoost. Rulează în fetch-data.yml.

Abordare:
  - Sursă: training_features.json (9025 rânduri, 2024-08 → 2026-04)
  - Probabilitate: league_*_rate (baseline calibrat per ligă)
  - Ferestre time-series: 6 luni train, 3 luni validare, pas 3 luni
  - Metrici per fold: Brier, ECE, log_loss, winrate, n_samples
  - Salvare: data/wfv_results_v2.json

Când train_engine_v2.py rulează (ml_pipeline_full.yml), va suprascrie
acest fișier cu metrici CatBoost reale — formatul e compatibil.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from analytics_core import (
    brier_binary, expected_calibration_error,
    log_loss_binary, safe_float, quality_grade
)

DATA_DIR = Path("data")

# ─── Parametri WFV ───────────────────────────────────────────────────────────
MIN_TRAIN_MONTHS = 6     # minim luni de training pentru primul fold
VAL_MONTHS       = 3     # fereastră de validare
STEP_MONTHS      = 3     # pas între folduri
GAP_DAYS         = 14    # gap între train și validare (evită leakage)
MIN_VAL_SAMPLES  = 50    # minim observații per fold pentru a fi credibil

# ─── Mapping piețe ───────────────────────────────────────────────────────────
# (market_key, target_col, baseline_col, label)
MARKETS: List[Tuple[str, str, str, str]] = [
    ("home_win", "target_home_win",  "league_home_win_rate", "Victorie gazdă"),
    ("draw",     "target_draw",      "league_draw_rate",     "Egal"),
    ("away_win", "target_away_win",  "league_away_win_rate", "Victorie oaspete"),
    ("over25",   "target_over_25",   "league_over25_rate",   "Peste 2.5G"),
    ("under35",  "target_under_35",  "league_under35_rate",  "Sub 3.5G"),
    ("btts",     "target_btts_yes",  "league_btts_rate",     "Ambele marchează"),
    ("over15",   "target_over_15",   "league_home_win_rate", "Peste 1.5G"),  # proxy
]

# ─── I/O ─────────────────────────────────────────────────────────────────────

def load_json(path: Path, default: Any = None) -> Any:
    try:
        with path.open(encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

# ─── Date helpers ─────────────────────────────────────────────────────────────

def parse_date(s: Any) -> Optional[date]:
    if not s: return None
    try: return date.fromisoformat(str(s)[:10])
    except Exception: return None

def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    mo = m % 12 + 1
    import calendar
    day = min(d.day, calendar.monthrange(y, mo)[1])
    return date(y, mo, day)

# ─── Generare folduri WFV ─────────────────────────────────────────────────────

def generate_folds(rows: List[Dict]) -> List[Dict]:
    """Generează ferestre time-series din datele disponibile."""
    dated = [(parse_date(r.get("date")), r) for r in rows]
    dated = [(d, r) for d, r in dated if d is not None]
    dated.sort(key=lambda x: x[0])

    if not dated: return []
    d_min = dated[0][0]
    d_max = dated[-1][0]

    folds = []
    cutoff = add_months(d_min, MIN_TRAIN_MONTHS)

    while True:
        val_start = cutoff + timedelta(days=GAP_DAYS)
        val_end   = add_months(val_start, VAL_MONTHS)
        if val_end > d_max: break

        train_rows = [r for d, r in dated if d < cutoff]
        val_rows   = [r for d, r in dated if val_start <= d < val_end]

        if len(val_rows) >= MIN_VAL_SAMPLES:
            folds.append({
                "train_end":   cutoff.isoformat(),
                "val_start":   val_start.isoformat(),
                "val_end":     val_end.isoformat(),
                "n_train":     len(train_rows),
                "n_val":       len(val_rows),
                "val_rows":    val_rows,
            })

        cutoff = add_months(cutoff, STEP_MONTHS)

    return folds

# ─── Metrici per fold + piață ─────────────────────────────────────────────────

def fold_metrics(val_rows: List[Dict],
                 target_col: str,
                 baseline_col: str) -> Optional[Dict]:
    """Calculează Brier, ECE, log_loss pe un fold pentru o piață."""
    pairs = []
    for r in val_rows:
        target = r.get(target_col)
        base   = safe_float(r.get(baseline_col), -1.0)
        if target is None or base < 0: continue
        # baseline_col e în procente (e.g. 45.2) → normalizare 0-1
        prob = base / 100.0 if base > 1.5 else base
        if not (0.001 <= prob <= 0.999): continue
        outcome = 1 if target else 0
        pairs.append((prob, outcome))

    if len(pairs) < 10: return None
    probs    = [p[0] for p in pairs]
    outcomes = [p[1] for p in pairs]

    brier   = brier_binary(outcomes, probs)
    logloss = log_loss_binary(outcomes, probs)
    ece     = expected_calibration_error(outcomes, probs, bins=6, min_bin_size=5)
    winrate = sum(outcomes) / len(outcomes)

    return {
        "n":        len(pairs),
        "brier":    round(brier, 4) if brier else None,
        "log_loss": round(logloss, 4) if logloss else None,
        "ece":      round(ece, 4) if ece else None,
        "winrate":  round(winrate, 4),
    }

# ─── Sumar per piață ─────────────────────────────────────────────────────────

def market_summary(fold_results: List[Optional[Dict]],
                   market_key: str, label: str) -> Dict:
    """Agregă rezultatele tuturor foldurilor pentru o piață."""
    valid = [f for f in fold_results if f is not None]
    if not valid:
        return {"market": market_key, "label": label, "folds": 0}

    def avg(key):
        vals = [f[key] for f in valid if f.get(key) is not None]
        return round(sum(vals) / len(vals), 4) if vals else None

    avg_ece    = avg("ece")
    avg_brier  = avg("brier")

    # Scor compozit
    score = 50.0
    if avg_brier is not None: score += max(0, (0.28 - avg_brier) / 0.28 * 25)
    if avg_ece   is not None: score += max(0, (0.12 - avg_ece)   / 0.12 * 25)
    score = min(100.0, max(0.0, score))

    # Trend: compara primul fold cu ultimul
    trend = "stabil"
    if len(valid) >= 2:
        first_ece = valid[0].get("ece")
        last_ece  = valid[-1].get("ece")
        if first_ece and last_ece:
            delta = last_ece - first_ece
            if delta > 0.02: trend = "degradare"
            elif delta < -0.02: trend = "îmbunătățire"

    return {
        "market":      market_key,
        "label":       label,
        "folds":       len(valid),
        "avg_brier":   avg_brier,
        "avg_log_loss":avg("log_loss"),
        "avg_ece":     avg_ece,
        "avg_winrate": avg("winrate"),
        "score":       round(score, 1),
        "grade":       quality_grade(score),
        "trend":       trend,
        "fold_details": valid,
    }

# ─── Drift detection ─────────────────────────────────────────────────────────

def detect_drift(market_summaries: List[Dict]) -> List[str]:
    """Identifică piețele cu degradare sau instabilitate."""
    warnings = []
    for m in market_summaries:
        if m.get("folds", 0) < 2: continue
        if m.get("trend") == "degradare":
            warnings.append(
                f"{m['label']}: calibrare în degradare (ECE crește în timp)."
            )
        if m.get("avg_ece") and m["avg_ece"] > 0.10:
            warnings.append(
                f"{m['label']}: ECE mediu {m['avg_ece']:.3f} — calibrare slabă consistent."
            )
    return warnings

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== BUILD WFV VALIDATION ===")

    rows_raw = load_json(DATA_DIR / "training_features.json", [])
    rows = rows_raw if isinstance(rows_raw, list) else rows_raw.get("features", [])
    rows = [r for r in rows if isinstance(r, dict) and r.get("date")]
    print(f"  Rânduri disponibile: {len(rows)}")

    folds = generate_folds(rows)
    print(f"  Folduri WFV generate: {len(folds)}")
    for i, f in enumerate(folds):
        print(f"    Fold {i+1}: train<{f['train_end']} | "
              f"val {f['val_start']}→{f['val_end']} | n_val={f['n_val']}")

    if not folds:
        print("  SKIP: date insuficiente pentru WFV.")
        save_json(DATA_DIR / "wfv_results_v2.json", {
            "updated_at": datetime.now().isoformat(),
            "status": "insufficient_data",
            "markets": [], "warnings": []
        })
        return

    market_summaries = []
    for mkt, target_col, baseline_col, label in MARKETS:
        fold_results = []
        for fold in folds:
            m = fold_metrics(fold["val_rows"], target_col, baseline_col)
            fold_results.append(m)
        summary = market_summary(fold_results, mkt, label)
        market_summaries.append(summary)
        folds_ok = summary["folds"]
        ece_str  = f"ECE={summary.get('avg_ece')}" if summary.get("avg_ece") else "ECE=—"
        print(f"    {mkt:10s}: {folds_ok} folduri | {ece_str} | "
              f"trend={summary.get('trend','—')} | grade={summary.get('grade','—')}")

    warnings = detect_drift(market_summaries)

    # Scor global
    scored = [m for m in market_summaries if m.get("score")]
    global_score = round(sum(m["score"] for m in scored) / len(scored), 1) if scored else 50.0

    payload = {
        "updated_at":   datetime.now().isoformat(),
        "source":       "baseline_league_rates",
        "note":         ("Validare pe probabilități baseline (rate ligă). "
                         "Rulați ml_pipeline_full.yml pentru WFV CatBoost complet."),
        "n_rows":       len(rows),
        "n_folds":      len(folds),
        "global_score": global_score,
        "global_grade": quality_grade(global_score),
        "markets":      market_summaries,
        "warnings":     warnings,
        "fold_windows": [
            {k: v for k, v in f.items() if k != "val_rows"}
            for f in folds
        ],
    }
    save_json(DATA_DIR / "wfv_results_v2.json", payload)
    print(f"\n  Salvat wfv_results_v2.json — scor global {global_score}/100")
    if warnings:
        print("  Avertismente:")
        for w in warnings: print(f"    ⚠️  {w}")

if __name__ == "__main__":
    main()
