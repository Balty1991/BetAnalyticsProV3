#!/usr/bin/env python3
"""
predict_current.py — SmartBet Fusion v2 | Inferență pe meciuri curente
=======================================================================
Rulat după fetch_data.py în workflow.

Important pentru piețe:
- fiecare CatBoostClassifier este antrenat pe target-ul pieței respective;
- `under35` este antrenat pe `target_under_35`, deci modelul returnează direct P(Under 3.5);
- nu inversăm probabilitatea pentru `under35`.
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR = Path("data")
MODELS_DIR = Path("models")
WAREHOUSE = Path("data/warehouse")

TARGETS = {
    "home_win": ("prob_home_win", "odds_home", ["odds_home", "odds_draw", "odds_away"]),
    "draw": ("prob_draw", "odds_draw", ["odds_home", "odds_draw", "odds_away"]),
    "away_win": ("prob_away_win", "odds_away", ["odds_home", "odds_draw", "odds_away"]),
    "btts": ("prob_btts_yes", "odds_btts_yes", ["odds_btts_yes", "odds_btts_no"]),
    "over15": ("prob_over_15", "odds_over_15", ["odds_over_15", "odds_under_15"]),
    "over25": ("prob_over_25", "odds_over_25", ["odds_over_25", "odds_under_25"]),
    # FIX: modelul este target_under_35 => predict_proba[:,1] = P(Under 3.5), nu P(Over 3.5).
    "under35": ("prob_under_35", "odds_under_35", ["odds_over_35", "odds_under_35"]),
}

KELLY_FRACTION = 0.25
EDGE_MIN = 2.5
EV_MIN = 0.0
PROB_MIN = 0.50
ODDS_MIN = 1.25
ODDS_MAX = 5.00
CAT_FEATURES = ["league", "home_streak_type", "away_streak_type"]


def _f(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def write_skip(reason):
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "signals_count": 0,
        "signals": [],
        "status": "skipped",
        "reason": reason,
    }
    save_json(DATA_DIR / "ev_signals_v2.json", payload)
    print(reason)


def no_vig_prob(odds_list):
    valid = [(idx, _f(odd)) for idx, odd in enumerate(odds_list) if odd and _f(odd) > 1.01]
    if len(valid) < 2:
        return [None] * len(odds_list)
    implied = [1.0 / odd for _, odd in valid]
    margin = sum(implied)
    fair = [imp / margin for imp in implied]
    out = [None] * len(odds_list)
    for (idx, _), probability in zip(valid, fair):
        out[idx] = round(probability, 6)
    return out


def kelly(probability, odds, fraction=KELLY_FRACTION):
    if not probability or not odds or odds < 1.01:
        return 0.0
    b = odds - 1.0
    q = 1.0 - probability
    k = (probability * b - q) / b
    return round(max(0.0, min(k * fraction, 0.08)) * 100.0, 3)


def ev_pct(probability, odds):
    if not probability or not odds or odds < 1.01:
        return None
    return round((probability * (odds - 1.0) - (1.0 - probability)) * 100.0, 3)


def smartbet_score(probability, edge_pp, wfv_auc=None, ece=None):
    p = _f(probability)
    edge = _f(edge_pp, 0.0)
    prob_norm = min(100, max(0, (p - 0.50) / 0.30 * 100))
    edge_norm = min(100, max(0, edge / 15.0 * 100))
    auc_norm = min(100, max(0, (_f(wfv_auc, 0.55) - 0.50) / 0.20 * 100))
    ece_norm = min(100, max(0, (1.0 - _f(ece, 0.05) / 0.10) * 100))
    return round(min(100, max(0, 0.40 * prob_norm + 0.30 * edge_norm + 0.20 * auc_norm + 0.10 * ece_norm)), 1)


def build_team_form_from_warehouse(team_id, cutoff_date, n=10):
    history = []
    if not WAREHOUSE.exists() or not team_id:
        return history
    cutoff = str(cutoff_date)[:10] if cutoff_date else "9999-99-99"
    for fp in sorted(WAREHOUSE.glob("events_season_*.json")):
        try:
            batch = load_json(fp, []) or []
            for ev in batch:
                if not isinstance(ev, dict):
                    continue
                date = str(ev.get("date", ""))[:10]
                if date >= cutoff:
                    continue
                is_home = ev.get("home_team_id") == team_id or str(ev.get("home_team_id")) == str(team_id)
                is_away = ev.get("away_team_id") == team_id or str(ev.get("away_team_id")) == str(team_id)
                if not (is_home or is_away):
                    continue
                if is_home:
                    history.append({
                        "date": date,
                        "goals_for": _f(ev.get("home_score")),
                        "goals_against": _f(ev.get("away_score")),
                        "points": 3 if ev.get("home_win") else (1 if ev.get("draw") else 0),
                        "btts_yes": ev.get("btts_yes", 0),
                        "over_25": ev.get("over_25", 0),
                        "xg_for": ev.get("xg_home"),
                    })
                else:
                    history.append({
                        "date": date,
                        "goals_for": _f(ev.get("away_score")),
                        "goals_against": _f(ev.get("home_score")),
                        "points": 3 if ev.get("away_win") else (1 if ev.get("draw") else 0),
                        "btts_yes": ev.get("btts_yes", 0),
                        "over_25": ev.get("over_25", 0),
                        "xg_for": ev.get("xg_away"),
                    })
        except Exception:
            continue
    history.sort(key=lambda x: x.get("date", ""))
    return history[-n:]


def form_features_simple(history, prefix, w=5):
    recent = history[-w:] if len(history) >= w else history
    m = len(recent)
    empty = {
        f"{prefix}_points_avg_{w}": 0,
        f"{prefix}_goals_for_avg_{w}": 0,
        f"{prefix}_goals_against_avg_{w}": 0,
        f"{prefix}_goal_diff_avg_{w}": 0,
        f"{prefix}_over25_rate_{w}": 0,
        f"{prefix}_btts_rate_{w}": 0,
        f"{prefix}_win_rate_{w}": 0,
        f"{prefix}_draw_rate_{w}": 0,
        f"{prefix}_matches_pre": 0,
        f"{prefix}_xg_for_avg_{w}": None,
    }
    if not m:
        return empty
    pts = [h["points"] for h in recent]
    gf = [h["goals_for"] for h in recent]
    ga = [h["goals_against"] for h in recent]
    btts = [h["btts_yes"] for h in recent]
    ov25 = [h["over_25"] for h in recent]
    xgf = [h["xg_for"] for h in recent if h.get("xg_for") is not None]
    return {
        f"{prefix}_points_avg_{w}": round(sum(pts) / m, 4),
        f"{prefix}_goals_for_avg_{w}": round(sum(gf) / m, 4),
        f"{prefix}_goals_against_avg_{w}": round(sum(ga) / m, 4),
        f"{prefix}_goal_diff_avg_{w}": round((sum(gf) - sum(ga)) / m, 4),
        f"{prefix}_over25_rate_{w}": round(sum(ov25) / m * 100, 4),
        f"{prefix}_btts_rate_{w}": round(sum(btts) / m * 100, 4),
        f"{prefix}_win_rate_{w}": round(sum(1 for p in pts if p == 3) / m * 100, 4),
        f"{prefix}_draw_rate_{w}": round(sum(1 for p in pts if p == 1) / m * 100, 4),
        f"{prefix}_matches_pre": m,
        f"{prefix}_xg_for_avg_{w}": round(sum(xgf) / len(xgf), 4) if xgf else None,
    }


def _team_id(ev, side):
    direct = ev.get(f"{side}_team_id")
    if direct:
        return direct
    obj = ev.get(side)
    if isinstance(obj, dict):
        return obj.get("id")
    return None


def build_features_for_event(ev, league_baselines):
    date = str(ev.get("date") or ev.get("event_date") or "")[:10]
    league = ev.get("league", "")
    if isinstance(league, dict):
        league = league.get("name") or str(league.get("id", ""))
    league = str(league) if league else "Unknown"

    feats = {"event_id": ev.get("id") or ev.get("event_id"), "league": league, "season_year": None}

    for side in ("home", "away"):
        team_id = _team_id(ev, side)
        history = build_team_form_from_warehouse(team_id, date, n=10) if team_id else []
        feats.update(form_features_simple(history, side, w=5))
        feats.update(form_features_simple(history, side, w=3))

    for w in (3, 5):
        for base in ("points_avg", "goals_for_avg", "goals_against_avg", "goal_diff_avg", "over25_rate", "btts_rate", "win_rate"):
            feats[f"form_{base}_diff_{w}"] = round(_f(feats.get(f"home_{base}_{w}")) - _f(feats.get(f"away_{base}_{w}")), 4)

    lb = league_baselines.get(league, {}) if isinstance(league_baselines, dict) else {}
    feats["league_avg_goals"] = lb.get("avg_goals", 2.5)
    feats["league_home_win_rate"] = lb.get("home_win_rate", 45.0)
    feats["league_draw_rate"] = lb.get("draw_rate", 27.0)
    feats["league_btts_rate"] = lb.get("btts_yes_rate", 50.0)
    feats["league_over25_rate"] = lb.get("over_25_rate", 52.0)
    feats["league_home_advantage"] = _f(lb.get("home_win_rate", 45.0)) - 33.33

    oh, od, oa = ev.get("odds_home"), ev.get("odds_draw"), ev.get("odds_away")
    nv1x2 = no_vig_prob([oh, od, oa])
    feats["nv_prob_home"], feats["nv_prob_draw"], feats["nv_prob_away"] = nv1x2

    nv25 = no_vig_prob([ev.get("odds_over_25"), ev.get("odds_under_25")])
    feats["nv_prob_over_25"], feats["nv_prob_under_25"] = nv25

    nvb = no_vig_prob([ev.get("odds_btts_yes"), ev.get("odds_btts_no")])
    feats["nv_prob_btts_yes"] = nvb[0]

    xgh = ev.get("home_xg") or ev.get("xg_home")
    xga = ev.get("away_xg") or ev.get("xg_away")
    feats["xg_sum"] = round(_f(xgh) + _f(xga), 4) if xgh and xga else None
    feats["xg_diff"] = round(_f(xgh) - _f(xga), 4) if xgh and xga else None

    feats["odds_ratio_home_away"] = round(_f(oh) / _f(oa), 4) if oh and oa and _f(oa) > 0.1 else None
    feats["close_match_flag"] = 1 if (oh and oa and abs(_f(oh) - _f(oa)) < 0.3) else 0
    feats["heavy_favorite_home"] = 1 if (oh and _f(oh, 99) < 1.40) else 0
    feats["heavy_favorite_away"] = 1 if (oa and _f(oa, 99) < 1.40) else 0

    feats["api_prob_home_win"] = _f(ev.get("prob_home_win"), 0) / 100.0 if _f(ev.get("prob_home_win", 0)) > 1 else _f(ev.get("prob_home_win"), 0)
    feats["api_prob_over_25"] = _f(ev.get("prob_over_25"), 0) / 100.0 if _f(ev.get("prob_over_25", 0)) > 1 else _f(ev.get("prob_over_25"), 0)
    feats["api_prob_btts_yes"] = _f(ev.get("prob_btts_yes"), 0) / 100.0 if _f(ev.get("prob_btts_yes", 0)) > 1 else _f(ev.get("prob_btts_yes"), 0)

    feats["home_streak_type"] = "N"
    feats["away_streak_type"] = "N"
    return feats


def run_catboost_inference(feats_list, market_key, feat_cols, model_path):
    try:
        from catboost import CatBoostClassifier, Pool
        import pandas as pd
    except ImportError:
        print("  WARN: catboost/pandas indisponibil. Skip inferență.")
        return None
    if not model_path.exists():
        return None
    try:
        model = CatBoostClassifier()
        model.load_model(str(model_path))
        df = pd.DataFrame(feats_list)
        for c in feat_cols:
            if c not in df.columns:
                df[c] = None
        cat_idx = [feat_cols.index(c) for c in CAT_FEATURES if c in feat_cols]
        for c in feat_cols:
            if c in CAT_FEATURES:
                df[c] = df[c].fillna("N/A").astype(str)
            else:
                df[c] = pd.to_numeric(df[c], errors="coerce")
                fill = df[c].median() if not df[c].isna().all() else 0.0
                df[c] = df[c].fillna(fill)
        pool = Pool(df[feat_cols].values, cat_features=cat_idx, feature_names=list(feat_cols))
        return [round(float(p), 6) for p in model.predict_proba(pool)[:, 1]]
    except Exception as exc:
        print(f"  WARN inference {market_key}: {exc}")
        return None


def _load_events():
    raw = load_json(DATA_DIR / "events.json", {})
    if isinstance(raw, dict):
        events = raw.get("predictions") or raw.get("results") or raw.get("events") or []
        if not events and all(isinstance(v, dict) for v in raw.values()):
            events = list(raw.values())
    else:
        events = raw or []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return [ev for ev in events if isinstance(ev, dict) and str(ev.get("date") or ev.get("event_date") or "")[:10] >= today]


def _team_name(ev, side):
    name = ev.get(f"{side}_team") or ev.get(side) or ""
    if isinstance(name, dict):
        return name.get("name", "")
    return str(name)


def main():
    print("=== PREDICT CURRENT v2 ===")
    if not (DATA_DIR / "events.json").exists():
        write_skip("events.json lipsește. Skip.")
        return

    upcoming = _load_events()
    print(f"Meciuri viitoare: {len(upcoming)}")
    if not upcoming:
        write_skip("Niciun meci viitor găsit.")
        return

    pack = load_json(DATA_DIR / "model_pack_v2.json", {}) or {}
    feat_cols = pack.get("feature_columns", [])
    if not feat_cols:
        write_skip("model_pack_v2.json lipsește sau nu are feature_columns. SmartBet v2 CatBoost skip explicit.")
        return

    baselines = load_json(DATA_DIR / "league_baselines_v2.json", {}) or {}
    feats_list = []
    print(f"Building features pentru {len(upcoming)} meciuri...")
    for ev in upcoming:
        try:
            feats_list.append(build_features_for_event(ev, baselines))
        except Exception as exc:
            print(f"  WARN features {ev.get('id') or ev.get('event_id')}: {exc}")
            feats_list.append({"event_id": ev.get("id") or ev.get("event_id"), "league": "Unknown", "home_streak_type": "N", "away_streak_type": "N"})

    signals = []
    markets_meta = pack.get("markets", {}) if isinstance(pack.get("markets", {}), dict) else {}

    for market_key, (_, odds_key, pair_keys) in TARGETS.items():
        model_path = MODELS_DIR / f"catboost_{market_key}.cbm"
        if not model_path.exists():
            print(f"  Model {market_key} lipsă, skip.")
            continue
        print(f"  Inferență {market_key}...")
        probs = run_catboost_inference(feats_list, market_key, feat_cols, model_path)
        if probs is None:
            print(f"  WARN: inferență eșuată pentru {market_key}")
            continue

        mm = markets_meta.get(market_key, {}) if isinstance(markets_meta, dict) else {}
        wfv_auc = mm.get("wfv_avg_auc")
        ece = mm.get("test_ece")

        for ev, feat, prob in zip(upcoming, feats_list, probs):
            # FIX under35: nu inversăm. Modelul dă deja P(target_under_35 = 1).
            if prob < PROB_MIN:
                continue
            odds = _f(ev.get(odds_key), 0)
            if odds < ODDS_MIN or odds > ODDS_MAX:
                continue

            nv_probs = no_vig_prob([ev.get(k) for k in pair_keys])
            try:
                nv_p = nv_probs[pair_keys.index(odds_key)]
            except Exception:
                nv_p = None
            if nv_p is None:
                continue

            edge_pp = round((prob - nv_p) * 100.0, 3)
            if edge_pp < EDGE_MIN:
                continue
            ev_p = ev_pct(prob, odds)
            if ev_p is None or ev_p < EV_MIN:
                continue

            score = smartbet_score(prob, edge_pp, wfv_auc, ece)
            signals.append({
                "event_id": ev.get("id") or ev.get("event_id"),
                "date": str(ev.get("date") or ev.get("event_date") or "")[:10],
                "home": _team_name(ev, "home"),
                "away": _team_name(ev, "away"),
                "league": feat.get("league", ""),
                "market": market_key,
                "model_prob": round(prob, 6),
                "odds": round(odds, 3),
                "nv_prob": round(nv_p, 6),
                "edge_pp": edge_pp,
                "ev_pct": ev_p,
                "kelly_pct": kelly(prob, odds),
                "wfv_auc": wfv_auc,
                "score": score,
                "signal": "STRONG BUY" if score >= 85 else ("BUY" if score >= 70 else ("WATCH" if score >= 60 else "WEAK")),
            })

    signals.sort(key=lambda x: x.get("score", 0), reverse=True)
    print(f"Semnale EV+ generate: {len(signals)}")
    out = {"updated_at": datetime.now(timezone.utc).isoformat(), "signals_count": len(signals), "signals": signals}
    save_json(DATA_DIR / "ev_signals_v2.json", out)
    print("Salvat: data/ev_signals_v2.json")

    for signal in signals[:5]:
        print(
            f"  [{signal['score']:5.1f}] {signal['market']:8s} | {signal['home'][:15]:15s} vs {signal['away'][:15]:15s} | "
            f"p={signal['model_prob']:.3f} edge={signal['edge_pp']:+.1f}pp EV={signal['ev_pct']:+.1f}%"
        )


if __name__ == "__main__":
    main()
