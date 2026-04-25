#!/usr/bin/env python3
"""
predict_current.py — SmartBet Fusion v2 | Inferență pe meciuri curente
=======================================================================
Rulat după fetch_data.py (în cron-ul de la oră).
Calculează features pentru meciurile din events.json și aplică modelele
CatBoost antrenate → generează ev_signals_v2.json cu probe calibrate.

Rulare:
  python3 predict_current.py
"""

import json, os, sys, math
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict, deque

DATA_DIR   = Path("data")
MODELS_DIR = Path("models")
WAREHOUSE  = Path("data/warehouse")

TARGETS = {
    "home_win":  ("prob_home_win",  "odds_home",    ["odds_home","odds_draw","odds_away"]),
    "draw":      ("prob_draw",      "odds_draw",     ["odds_home","odds_draw","odds_away"]),
    "away_win":  ("prob_away_win",  "odds_away",    ["odds_home","odds_draw","odds_away"]),
    "btts":      ("prob_btts_yes",  "odds_btts_yes",["odds_btts_yes","odds_btts_no"]),
    "over15":    ("prob_over_15",   "odds_over_15", ["odds_over_15","odds_under_15"]),
    "over25":    ("prob_over_25",   "odds_over_25", ["odds_over_25","odds_under_25"]),
    "under35":   ("prob_over_35",   "odds_under_35",["odds_over_35","odds_under_35"]),
}

KELLY_FRACTION  = 0.25
EDGE_MIN        = 2.5
EV_MIN          = 0.0
PROB_MIN        = 0.50
ODDS_MIN        = 1.25
ODDS_MAX        = 5.00

CAT_FEATURES = ["league", "home_streak_type", "away_streak_type"]


def _f(v, d=0.0):
    try: return float(v)
    except: return d


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except: return default


def no_vig_prob(odds_list):
    valid = [(i, _f(o)) for i, o in enumerate(odds_list) if o and _f(o) > 1.01]
    if len(valid) < 2: return [None] * len(odds_list)
    implied = [1.0 / o for _, o in valid]
    margin  = sum(implied)
    fair    = [imp / margin for imp in implied]
    out     = [None] * len(odds_list)
    for (idx, _), f in zip(valid, fair):
        out[idx] = round(f, 6)
    return out


def kelly(prob, odds, fraction=KELLY_FRACTION):
    if not prob or not odds or odds < 1.01: return 0.0
    b = odds - 1.0
    q = 1.0 - prob
    k = (prob * b - q) / b
    return round(max(0.0, min(k * fraction, 0.08)) * 100.0, 3)


def ev_pct(prob, odds):
    if not prob or not odds or odds < 1.01: return None
    return round((prob * (odds - 1.0) - (1.0 - prob)) * 100.0, 3)


def smartbet_score(prob, edge_pp, wfv_auc=None, ece=None):
    p  = _f(prob)
    e  = _f(edge_pp, 0)
    prob_norm = min(100, max(0, (p - 0.50) / 0.30 * 100))
    edge_norm = min(100, max(0, e / 15.0 * 100))
    auc_norm  = min(100, max(0, (_f(wfv_auc, 0.55) - 0.50) / 0.20 * 100))
    ece_norm  = min(100, max(0, (1.0 - _f(ece, 0.05) / 0.10) * 100))
    score = 0.40 * prob_norm + 0.30 * edge_norm + 0.20 * auc_norm + 0.10 * ece_norm
    return round(min(100, max(0, score)), 1)


# ─── Construiește form history din warehouse ─────────────────────────────────
def build_team_form_from_warehouse(team_id, cutoff_date, n=10):
    """Returnează ultimele N meciuri ale echipei înainte de cutoff_date."""
    history = []
    if not WAREHOUSE.exists():
        return history

    cutoff = str(cutoff_date)[:10] if cutoff_date else "9999-99-99"

    for fp in sorted(WAREHOUSE.glob("events_season_*.json")):
        try:
            batch = load_json(fp, [])
            for ev in batch:
                if not isinstance(ev, dict): continue
                eid = ev.get("event_id")
                date = str(ev.get("date", ""))[:10]
                if date >= cutoff: continue
                is_home = (ev.get("home_team_id") == team_id or
                           str(ev.get("home_team_id")) == str(team_id))
                is_away = (ev.get("away_team_id") == team_id or
                           str(ev.get("away_team_id")) == str(team_id))
                if not (is_home or is_away): continue
                if is_home:
                    history.append({
                        "date":          date,
                        "goals_for":     _f(ev.get("home_score")),
                        "goals_against": _f(ev.get("away_score")),
                        "points":        3 if ev.get("home_win") else (1 if ev.get("draw") else 0),
                        "btts_yes":      ev.get("btts_yes", 0),
                        "over_25":       ev.get("over_25", 0),
                        "xg_for":        ev.get("xg_home"),
                        "xg_against":    ev.get("xg_away"),
                    })
                else:
                    history.append({
                        "date":          date,
                        "goals_for":     _f(ev.get("away_score")),
                        "goals_against": _f(ev.get("home_score")),
                        "points":        3 if ev.get("away_win") else (1 if ev.get("draw") else 0),
                        "btts_yes":      ev.get("btts_yes", 0),
                        "over_25":       ev.get("over_25", 0),
                        "xg_for":        ev.get("xg_away"),
                        "xg_against":    ev.get("xg_home"),
                    })
        except: continue

    history.sort(key=lambda x: x.get("date", ""))
    return history[-n:]


def form_features_simple(history, prefix, w=5):
    """Features simple de form pentru un set de meciuri istorice."""
    recent = history[-w:] if len(history) >= w else history
    m      = len(recent)
    if m == 0:
        return {f"{prefix}_points_avg_{w}": 0, f"{prefix}_goals_for_avg_{w}": 0,
                f"{prefix}_goals_against_avg_{w}": 0, f"{prefix}_over25_rate_{w}": 0,
                f"{prefix}_btts_rate_{w}": 0, f"{prefix}_matches_pre": 0,
                f"{prefix}_win_rate_{w}": 0, f"{prefix}_xg_for_avg_{w}": None}
    pts  = [h["points"] for h in recent]
    gf   = [h["goals_for"] for h in recent]
    ga   = [h["goals_against"] for h in recent]
    btts = [h["btts_yes"] for h in recent]
    ov25 = [h["over_25"] for h in recent]
    xgf  = [h["xg_for"] for h in recent if h.get("xg_for") is not None]
    return {
        f"{prefix}_points_avg_{w}":       round(sum(pts)/m, 4),
        f"{prefix}_goals_for_avg_{w}":    round(sum(gf)/m, 4),
        f"{prefix}_goals_against_avg_{w}":round(sum(ga)/m, 4),
        f"{prefix}_goal_diff_avg_{w}":    round((sum(gf)-sum(ga))/m, 4),
        f"{prefix}_over25_rate_{w}":      round(sum(ov25)/m*100, 4),
        f"{prefix}_btts_rate_{w}":        round(sum(btts)/m*100, 4),
        f"{prefix}_win_rate_{w}":         round(sum(1 for p in pts if p==3)/m*100, 4),
        f"{prefix}_draw_rate_{w}":        round(sum(1 for p in pts if p==1)/m*100, 4),
        f"{prefix}_matches_pre":          m,
        f"{prefix}_xg_for_avg_{w}":       round(sum(xgf)/len(xgf), 4) if xgf else None,
    }


# ─── Build features pentru un eveniment curent ───────────────────────────────
def build_features_for_event(ev, league_baselines):
    """
    Construiește features pentru un eveniment viitor din events.json.
    Folosește form history din warehouse + API probs + league baselines.
    """
    event_id  = ev.get("id") or ev.get("event_id")
    date      = str(ev.get("date") or ev.get("event_date") or "")[:10]
    home_id   = ev.get("home_team_id") or ev.get("home", {}).get("id") if isinstance(ev.get("home"), dict) else ev.get("home_team_id")
    away_id   = ev.get("away_team_id") or ev.get("away", {}).get("id") if isinstance(ev.get("away"), dict) else ev.get("away_team_id")
    league    = ev.get("league", "")
    if isinstance(league, dict):
        league = league.get("name") or str(league.get("id", ""))

    feats = {
        "event_id":  event_id,
        "league":    str(league) if league else "Unknown",
        "season_year": None,
    }

    # Form home
    if home_id:
        h_hist = build_team_form_from_warehouse(home_id, date, n=10)
        feats.update(form_features_simple(h_hist, "home", w=5))
        feats.update(form_features_simple(h_hist, "home", w=3))
    else:
        for k in ["home_points_avg_5","home_goals_for_avg_5","home_goals_against_avg_5",
                  "home_goal_diff_avg_5","home_over25_rate_5","home_btts_rate_5",
                  "home_win_rate_5","home_draw_rate_5","home_matches_pre","home_xg_for_avg_5",
                  "home_points_avg_3","home_goals_for_avg_3","home_goals_against_avg_3",
                  "home_goal_diff_avg_3","home_over25_rate_3","home_btts_rate_3",
                  "home_win_rate_3","home_draw_rate_3","home_xg_for_avg_3"]:
            feats[k] = 0

    # Form away
    if away_id:
        a_hist = build_team_form_from_warehouse(away_id, date, n=10)
        feats.update(form_features_simple(a_hist, "away", w=5))
        feats.update(form_features_simple(a_hist, "away", w=3))
    else:
        for k in ["away_points_avg_5","away_goals_for_avg_5","away_goals_against_avg_5",
                  "away_goal_diff_avg_5","away_over25_rate_5","away_btts_rate_5",
                  "away_win_rate_5","away_draw_rate_5","away_matches_pre","away_xg_for_avg_5",
                  "away_points_avg_3","away_goals_for_avg_3","away_goals_against_avg_3",
                  "away_goal_diff_avg_3","away_over25_rate_3","away_btts_rate_3",
                  "away_win_rate_3","away_xg_for_avg_3"]:
            feats[k] = 0

    # Diferentiale
    for w in [3, 5]:
        for base in ["points_avg","goals_for_avg","goals_against_avg","goal_diff_avg",
                     "over25_rate","btts_rate","win_rate"]:
            hv = feats.get(f"home_{base}_{w}")
            av = feats.get(f"away_{base}_{w}")
            feats[f"form_{base}_diff_{w}"] = round(_f(hv) - _f(av), 4) if (hv is not None and av is not None) else 0

    # League baselines
    lb = league_baselines.get(str(league), {})
    feats["league_avg_goals"]     = lb.get("avg_goals", 2.5)
    feats["league_home_win_rate"] = lb.get("home_win_rate", 45.0)
    feats["league_draw_rate"]     = lb.get("draw_rate", 27.0)
    feats["league_btts_rate"]     = lb.get("btts_yes_rate", 50.0)
    feats["league_over25_rate"]   = lb.get("over_25_rate", 52.0)
    feats["league_home_advantage"]= _f(lb.get("home_win_rate", 45)) - 33.33

    # Odds no-vig
    oh = ev.get("odds_home")
    od = ev.get("odds_draw")
    oa = ev.get("odds_away")
    nv1x2 = no_vig_prob([oh, od, oa])
    feats["nv_prob_home"]  = nv1x2[0]
    feats["nv_prob_draw"]  = nv1x2[1]
    feats["nv_prob_away"]  = nv1x2[2]

    ov25 = ev.get("odds_over_25"); ou25 = ev.get("odds_under_25")
    nv25 = no_vig_prob([ov25, ou25])
    feats["nv_prob_over_25"]  = nv25[0]
    feats["nv_prob_under_25"] = nv25[1]

    ob = ev.get("odds_btts_yes"); onb = ev.get("odds_btts_no")
    nvb = no_vig_prob([ob, onb])
    feats["nv_prob_btts_yes"] = nvb[0]

    # Poisson
    xgh = ev.get("home_xg") or ev.get("xg_home")
    xga = ev.get("away_xg") or ev.get("xg_away")
    if xgh and xga:
        feats["xg_sum"]  = round(_f(xgh) + _f(xga), 4)
        feats["xg_diff"] = round(_f(xgh) - _f(xga), 4)
    else:
        feats["xg_sum"] = feats["xg_diff"] = None

    feats["odds_ratio_home_away"] = round(_f(oh) / _f(oa), 4) if oh and oa and _f(oa) > 0.1 else None
    feats["close_match_flag"]     = 1 if (oh and oa and abs(_f(oh) - _f(oa)) < 0.3) else 0
    feats["heavy_favorite_home"]  = 1 if (oh and _f(oh, 99) < 1.40) else 0
    feats["heavy_favorite_away"]  = 1 if (oa and _f(oa, 99) < 1.40) else 0

    # API probs ca features
    feats["api_prob_home_win"] = _f(ev.get("prob_home_win"), 0) / 100.0 if _f(ev.get("prob_home_win", 0)) > 1 else _f(ev.get("prob_home_win"), 0)
    feats["api_prob_over_25"]  = _f(ev.get("prob_over_25"), 0)  / 100.0 if _f(ev.get("prob_over_25", 0))  > 1 else _f(ev.get("prob_over_25"), 0)
    feats["api_prob_btts_yes"] = _f(ev.get("prob_btts_yes"), 0) / 100.0 if _f(ev.get("prob_btts_yes", 0)) > 1 else _f(ev.get("prob_btts_yes"), 0)

    feats["home_streak_type"] = "N"
    feats["away_streak_type"] = "N"

    return feats


def run_catboost_inference(feats_list, market_key, feat_cols, model_path):
    """Rulează inferența CatBoost pe o listă de feature dicts."""
    try:
        from catboost import CatBoostClassifier, Pool
        import pandas as pd
        import numpy as np
    except ImportError:
        return None

    if not model_path.exists():
        return None

    try:
        model = CatBoostClassifier()
        model.load_model(str(model_path))

        df = pd.DataFrame(feats_list)
        # Asigurăm că avem toate coloanele
        for c in feat_cols:
            if c not in df.columns:
                df[c] = None

        cat_idx = [feat_cols.index(c) for c in CAT_FEATURES if c in feat_cols]
        num_cols = [c for c in feat_cols if c not in CAT_FEATURES]
        for c in num_cols:
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce").fillna(df[c].median() if not df[c].isna().all() else 0.0)
        for c in CAT_FEATURES:
            if c in df.columns:
                df[c] = df[c].fillna("N/A").astype(str)

        X = df[feat_cols].fillna(0)
        pool = Pool(X.values, cat_features=cat_idx, feature_names=list(feat_cols))
        probs = model.predict_proba(pool)[:, 1]
        return [round(float(p), 6) for p in probs]
    except Exception as e:
        print(f"  WARN inference {market_key}: {e}")
        return None


def main():
    print("=== PREDICT CURRENT v2 ===")

    # 1. Load events.json
    events_path = DATA_DIR / "events.json"
    if not events_path.exists():
        print(f"Nu există {events_path}. Skip.")
        return

    raw = load_json(events_path, {})
    if isinstance(raw, dict):
        events = (raw.get("predictions") or raw.get("results") or
                  raw.get("events") or list(raw.values()))
    else:
        events = raw or []

    # Filtrăm numai meciuri viitoare/de azi
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming = []
    for ev in events:
        if not isinstance(ev, dict): continue
        date = str(ev.get("date") or ev.get("event_date") or "")[:10]
        if date >= today:
            upcoming.append(ev)

    print(f"Meciuri viitoare: {len(upcoming)}")
    if not upcoming:
        print("Niciun meci viitor găsit.")
        return

    # 2. Load model pack pentru feat_cols și WFV metrics
    pack = load_json(DATA_DIR / "model_pack_v2.json", {})
    feat_cols = pack.get("feature_columns", [])
    if not feat_cols:
        print("model_pack_v2.json lipsă sau fără feature_columns. Skip.")
        return

    # 3. Load league baselines
    baselines = load_json(DATA_DIR / "league_baselines_v2.json", {})

    # 4. Build features pentru fiecare meci
    print(f"Building features pentru {len(upcoming)} meciuri...")
    feats_list = []
    for ev in upcoming:
        try:
            feats_list.append(build_features_for_event(ev, baselines))
        except Exception as e:
            print(f"  WARN features {ev.get('id')}: {e}")
            feats_list.append({"event_id": ev.get("id"), "league": "Unknown",
                                "home_streak_type": "N", "away_streak_type": "N"})

    # 5. Inferență per piață
    signals = []
    markets_meta = pack.get("markets", {})

    for market_key, (api_prob_key, odds_key, pair_keys) in TARGETS.items():
        model_path = MODELS_DIR / f"catboost_{market_key}.cbm"
        if not model_path.exists():
            print(f"  Model {market_key} lipsă, skip.")
            continue

        print(f"  Inferență {market_key}...")
        probs = run_catboost_inference(feats_list, market_key, feat_cols, model_path)
        if probs is None:
            print(f"  WARN: inferență eșuată pentru {market_key}")
            continue

        mm = markets_meta.get(market_key, {})
        wfv_auc = mm.get("wfv_avg_auc")
        ece     = mm.get("test_ece")

        for ev, feat, prob in zip(upcoming, feats_list, probs):
            # Pentru under35: prob e P(over35), deci inversat
            if market_key == "under35":
                prob = 1.0 - prob

            if prob < PROB_MIN:
                continue

            # Odds
            odds = _f(ev.get(odds_key), 0)
            if odds < ODDS_MIN or odds > ODDS_MAX:
                continue

            # No-vig
            pair_odds = [ev.get(k) for k in pair_keys]
            nv_probs  = no_vig_prob(pair_odds)
            try:
                odds_idx = pair_keys.index(odds_key)
                nv_p     = nv_probs[odds_idx]
            except: nv_p = None

            if nv_p is None: continue

            edge_pp = round((prob - nv_p) * 100.0, 3)
            if edge_pp < EDGE_MIN: continue

            ev_p = ev_pct(prob, odds)
            if ev_p is None or ev_p < EV_MIN: continue

            k    = kelly(prob, odds)
            sc   = smartbet_score(prob, edge_pp, wfv_auc, ece)

            home_name = ev.get("home_team") or ev.get("home") or ""
            away_name = ev.get("away_team") or ev.get("away") or ""
            if isinstance(home_name, dict): home_name = home_name.get("name", "")
            if isinstance(away_name, dict): away_name = away_name.get("name", "")

            signals.append({
                "event_id":   ev.get("id") or ev.get("event_id"),
                "date":       str(ev.get("date") or ev.get("event_date") or "")[:10],
                "home":       home_name,
                "away":       away_name,
                "league":     feat.get("league", ""),
                "market":     market_key,
                "model_prob": round(prob, 6),
                "odds":       round(odds, 3),
                "nv_prob":    round(nv_p, 6),
                "edge_pp":    edge_pp,
                "ev_pct":     ev_p,
                "kelly_pct":  k,
                "wfv_auc":    wfv_auc,
                "score":      sc,
                "signal":     "STRONG BUY" if sc >= 85 else ("BUY" if sc >= 70 else ("WATCH" if sc >= 60 else "WEAK")),
            })

    signals.sort(key=lambda x: x.get("score", 0), reverse=True)
    print(f"Semnale EV+ generate: {len(signals)}")

    # 6. Salvare
    out = {
        "updated_at":    datetime.now(timezone.utc).isoformat(),
        "signals_count": len(signals),
        "signals":       signals,
    }
    out_path = DATA_DIR / "ev_signals_v2.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Salvat: {out_path}")

    # Print top 5
    for s in signals[:5]:
        print(f"  [{s['score']:5.1f}] {s['market']:8s} | {s['home'][:15]:15s} vs {s['away'][:15]:15s} | "
              f"p={s['model_prob']:.3f} edge={s['edge_pp']:+.1f}pp EV={s['ev_pct']:+.1f}%")


if __name__ == "__main__":
    main()
