#!/usr/bin/env python3
"""
feature_engineering.py — SmartBet Fusion v2 | Layer 2: Feature Engineering
============================================================================
Construiește 200+ features per meci din data/warehouse/*.json.

Features produse:
  A) Form rolling 3/5/8/10 meciuri (home + away + diff)
  B) xG rolling + conversion rate + Poisson probs
  C) Head-to-Head (ultimele 5/10 H2H per pereche de echipe)
  D) Cote → no-vig probabilities + edge implicat
  E) Context meci (rest days, season stage, streaks)
  F) League baselines (pe sezon curent + rolling pe N meciuri anterioare)
  G) Target labels (7 targets pentru 7 modele CatBoost)

Output:
  data/features_v2.json  → lista de rânduri cu features + targets
  data/features_v2_summary.json → statistici dataset
"""

import json, math, os
from pathlib import Path
from collections import defaultdict, deque
from datetime import datetime, timezone

WAREHOUSE = Path("data/warehouse")
DATA_DIR  = Path("data")

# Ferestre de form rolling
WINDOWS     = [3, 5, 8, 10]
H2H_WINDOWS = [5, 10]
MIN_MATCHES_LEAGUE = 80   # min meciuri per ligă pentru baseline valid


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _f(v, default=0.0):
    try: return float(v)
    except Exception: return default


def _i(v, default=0):
    try: return int(v)
    except Exception: return default


def _pct(part, total):
    return round(float(part) / float(total) * 100.0, 4) if total else 0.0


def _avg(vals):
    vals = [_f(v) for v in vals if v is not None]
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def _parse_dt(s):
    if not s: return None
    try:
        s = str(s).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _no_vig(odds_list):
    """Elimină vig → probabilități fair."""
    valid = [o for o in odds_list if o and _f(o, 0) > 1.01]
    if not valid or len(valid) < 2:
        return [None] * len(odds_list)
    implied = [1.0 / _f(o) for o in valid]
    margin  = sum(implied)
    fair    = [imp / margin for imp in implied]
    # re-mapare la pozițiile originale
    out, vi = [], 0
    for o in odds_list:
        if o and _f(o, 0) > 1.01:
            out.append(round(fair[vi], 6)); vi += 1
        else:
            out.append(None)
    return out


def _poisson_prob(lmbda, k):
    try:
        lmbda = max(0.0, float(lmbda))
        k     = int(k)
        return (lmbda ** k) * math.exp(-lmbda) / math.factorial(k)
    except Exception:
        return 0.0


def poisson_over(xg_home, xg_away, threshold=2.5):
    """P(goluri_total > threshold) bazat pe xG cu Poisson independent."""
    if xg_home is None or xg_away is None:
        return None
    total  = xg_home + xg_away
    k_max  = int(threshold) + 1
    p_under = sum(
        sum(_poisson_prob(xg_home, h) * _poisson_prob(xg_away, a)
            for a in range(k_max - h + 1)
            if h + a <= k_max)
        for h in range(k_max + 1)
    )
    # mai simplu: P(X+Y <= threshold)
    th_int  = int(threshold)
    p_under_exact = 0.0
    for total_g in range(th_int + 1):
        for h in range(total_g + 1):
            a = total_g - h
            p_under_exact += _poisson_prob(xg_home, h) * _poisson_prob(xg_away, a)
    return round(1.0 - p_under_exact, 6)


def poisson_btts(xg_home, xg_away):
    """P(home>=1) * P(away>=1)."""
    if xg_home is None or xg_away is None:
        return None
    ph = 1.0 - _poisson_prob(xg_home, 0)
    pa = 1.0 - _poisson_prob(xg_away, 0)
    return round(ph * pa, 6)


# ─── Loader ───────────────────────────────────────────────────────────────────
def load_warehouse():
    """Încarcă toate fișierele din data/warehouse/ în memorie."""
    rows = []
    if not WAREHOUSE.exists():
        print(f"WARN: {WAREHOUSE} nu există. Rulează fetch_history_batch.py mai întâi.")
        return rows
    for fp in sorted(WAREHOUSE.glob("events_season_*.json")):
        try:
            with open(fp, encoding="utf-8") as f:
                batch = json.load(f)
            if isinstance(batch, list):
                rows.extend(batch)
        except Exception as e:
            print(f"  WARN load {fp.name}: {e}")
    print(f"Loaded {len(rows)} meciuri din warehouse.")
    return rows


# ─── Team history tracker ──────────────────────────────────────────────────────
def build_team_histories(rows_sorted):
    """
    Construiește un dict {team_id: deque[match_data]} procesat cronologic.
    Returnează dict de history PER meci (snapshot ÎNAINTE de meci).
    """
    team_hist: dict = defaultdict(lambda: deque(maxlen=30))
    snapshots = {}   # event_id → {home_hist: [...], away_hist: [...]}

    for row in rows_sorted:
        eid  = row["event_id"]
        hid  = row.get("home_team_id")
        aid  = row.get("away_team_id")

        # snapshot ÎNAINTE de actualizare (important: no leakage!)
        h_snap = list(team_hist[hid]) if hid else []
        a_snap = list(team_hist[aid]) if aid else []
        snapshots[eid] = {"home_hist": h_snap, "away_hist": a_snap}

        # acum actualizăm cu rezultatul acestui meci
        if hid:
            team_hist[hid].append({
                "date":          row["date"],
                "goals_for":     row["home_score"],
                "goals_against": row["away_score"],
                "goal_diff":     row["home_score"] - row["away_score"],
                "points":        3 if row["home_win"] else (1 if row["draw"] else 0),
                "btts_yes":      row["btts_yes"],
                "over_25":       row["over_25"],
                "under_35":      row["under_35"],
                "is_home":       1,
                "xg_for":        row.get("xg_home"),
                "xg_against":    row.get("xg_away"),
            })
        if aid:
            team_hist[aid].append({
                "date":          row["date"],
                "goals_for":     row["away_score"],
                "goals_against": row["home_score"],
                "goal_diff":     row["away_score"] - row["home_score"],
                "points":        3 if row["away_win"] else (1 if row["draw"] else 0),
                "btts_yes":      row["btts_yes"],
                "over_25":       row["over_25"],
                "under_35":      row["under_35"],
                "is_home":       0,
                "xg_for":        row.get("xg_away"),
                "xg_against":    row.get("xg_home"),
            })

    return snapshots


def form_features(hist, prefix, windows=WINDOWS):
    """Extrage features de form din istoricul unei echipe."""
    feats = {}
    n     = len(hist)
    feats[f"{prefix}_matches_pre"] = n

    for w in windows:
        recent = hist[-w:] if n >= w else hist
        m      = len(recent)

        pts     = [h["points"]        for h in recent]
        gf      = [h["goals_for"]     for h in recent]
        ga      = [h["goals_against"] for h in recent]
        gd      = [h["goal_diff"]     for h in recent]
        btts    = [h["btts_yes"]      for h in recent]
        ov25    = [h["over_25"]       for h in recent]
        un35    = [h["under_35"]      for h in recent]
        is_home = [h["is_home"]       for h in recent]
        xgf     = [h["xg_for"]    for h in recent if h.get("xg_for")  is not None]
        xga     = [h["xg_against"] for h in recent if h.get("xg_against") is not None]

        feats[f"{prefix}_points_avg_{w}"]       = _avg(pts)
        feats[f"{prefix}_goals_for_avg_{w}"]    = _avg(gf)
        feats[f"{prefix}_goals_against_avg_{w}"]= _avg(ga)
        feats[f"{prefix}_goal_diff_avg_{w}"]    = _avg(gd)
        feats[f"{prefix}_btts_rate_{w}"]        = _pct(sum(btts), m)
        feats[f"{prefix}_over25_rate_{w}"]      = _pct(sum(ov25), m)
        feats[f"{prefix}_under35_rate_{w}"]     = _pct(sum(un35), m)
        feats[f"{prefix}_home_share_{w}"]       = _pct(sum(is_home), m)
        feats[f"{prefix}_win_rate_{w}"]         = _pct(sum(1 for p in pts if p == 3), m)
        feats[f"{prefix}_draw_rate_{w}"]        = _pct(sum(1 for p in pts if p == 1), m)
        feats[f"{prefix}_loss_rate_{w}"]        = _pct(sum(1 for p in pts if p == 0), m)

        # xG features (dacă disponibil)
        feats[f"{prefix}_xg_for_avg_{w}"]      = _avg(xgf) if xgf else None
        feats[f"{prefix}_xg_against_avg_{w}"]  = _avg(xga) if xga else None
        if xgf and gf:
            goals_m = _avg(gf[-w:] if n >= w else gf)
            xgf_m   = _avg(xgf[-w:] if len(xgf) >= w else xgf)
            feats[f"{prefix}_xg_conversion_{w}"] = round(goals_m / xgf_m, 4) if xgf_m > 0.1 else None
        else:
            feats[f"{prefix}_xg_conversion_{w}"] = None

        # Streak curentă (W/D/L consecutive)
        streak_val, streak_count = None, 0
        for h in reversed(recent):
            cur = "W" if h["points"] == 3 else ("D" if h["points"] == 1 else "L")
            if streak_val is None:
                streak_val = cur; streak_count = 1
            elif cur == streak_val:
                streak_count += 1
            else:
                break
        feats[f"{prefix}_streak_type"]  = streak_val or "N"
        feats[f"{prefix}_streak_len_{w}"] = streak_count if w == 5 else feats.get(f"{prefix}_streak_len_{w}", streak_count)

    feats[f"{prefix}_eligible_min3"] = 1 if n >= 3 else 0
    feats[f"{prefix}_eligible_min5"] = 1 if n >= 5 else 0
    return feats


def diff_features(h_feats, a_feats, windows=WINDOWS):
    """Calculează diferențialele home - away."""
    diffs = {}
    for w in windows:
        keys = [
            ("points_avg",     f"form_points_diff_{w}"),
            ("goals_for_avg",  f"goals_for_diff_{w}"),
            ("goals_against_avg", f"goals_against_diff_{w}"),
            ("goal_diff_avg",  f"goal_diff_delta_{w}"),
            ("btts_rate",      f"btts_rate_diff_{w}"),
            ("over25_rate",    f"over25_rate_diff_{w}"),
            ("under35_rate",   f"under35_rate_diff_{w}"),
            ("win_rate",       f"win_rate_diff_{w}"),
            ("xg_for_avg",     f"xg_for_diff_{w}"),
            ("xg_against_avg", f"xg_against_diff_{w}"),
        ]
        for base, out_key in keys:
            hv = h_feats.get(f"home_{base}_{w}")
            av = a_feats.get(f"away_{base}_{w}")
            if hv is not None and av is not None:
                diffs[out_key] = round(_f(hv) - _f(av), 4)
            else:
                diffs[out_key] = None
    return diffs


# ─── H2H tracker ──────────────────────────────────────────────────────────────
def build_h2h_tracker(rows_sorted):
    """Construiește dict {(hid,aid): deque} pentru H2H."""
    h2h: dict = defaultdict(lambda: deque(maxlen=20))
    snapshots  = {}

    for row in rows_sorted:
        hid = row.get("home_team_id")
        aid = row.get("away_team_id")
        if not hid or not aid:
            continue

        key_ha = (hid, aid)
        key_ah = (aid, hid)

        snap_ha = list(h2h[key_ha])
        snap_ah = list(h2h[key_ah])
        snapshots[row["event_id"]] = {
            "h2h_ha": snap_ha,
            "h2h_ah": snap_ah,
        }

        # Actualizare după meci
        entry = {
            "date":      row["date"],
            "home_id":   hid,
            "home_score": row["home_score"],
            "away_score": row["away_score"],
            "total_goals": row["total_goals"],
            "home_win":  row["home_win"],
            "draw":      row["draw"],
            "btts":      row["btts_yes"],
            "over_25":   row["over_25"],
        }
        h2h[key_ha].append(entry)
        h2h[key_ah].append({**entry, "home_id": aid,
                             "home_score": row["away_score"],
                             "away_score": row["home_score"],
                             "home_win":   row["away_win"],
                             "draw":       row["draw"]})

    return snapshots


def h2h_features(h2h_snap, home_team_id):
    """Features H2H din snapshot-ul anterior meciului."""
    all_matches = h2h_snap.get("h2h_ha", []) + h2h_snap.get("h2h_ah", [])
    # sortăm cronologic
    all_matches = sorted(all_matches, key=lambda x: x.get("date", ""))
    feats = {}
    for w in H2H_WINDOWS:
        recent = all_matches[-w:]
        m      = len(recent)
        if m == 0:
            for k in ["home_win_rate","draw_rate","away_win_rate",
                      "avg_goals","btts_rate","over25_rate","home_xg_avg"]:
                feats[f"h2h_{k}_{w}"] = None
            feats[f"h2h_matches_{w}"] = 0
            continue

        feats[f"h2h_matches_{w}"]    = m
        # perspectivă home team curent
        hw = sum(1 for r in recent if r.get("home_id") == home_team_id and r.get("home_win"))
        dw = sum(1 for r in recent if r.get("draw"))
        aw = m - hw - dw
        feats[f"h2h_home_win_rate_{w}"]  = _pct(hw, m)
        feats[f"h2h_draw_rate_{w}"]      = _pct(dw, m)
        feats[f"h2h_away_win_rate_{w}"]  = _pct(aw, m)
        feats[f"h2h_avg_goals_{w}"]      = _avg([r.get("total_goals",0) for r in recent])
        feats[f"h2h_btts_rate_{w}"]      = _pct(sum(r.get("btts",0) for r in recent), m)
        feats[f"h2h_over25_rate_{w}"]    = _pct(sum(r.get("over_25",0) for r in recent), m)
        last = recent[-1]
        feats[f"h2h_last_result_{w}"] = (
            1 if (last.get("home_id") == home_team_id and last.get("home_win"))
            else (-1 if (last.get("home_id") != home_team_id and last.get("home_win"))
            else 0)
        )

    feats["h2h_total_matches"] = len(all_matches)
    return feats


# ─── League baseline ──────────────────────────────────────────────────────────
def build_league_baselines(rows):
    """Baseline per ligă (pe tot istoricul)."""
    per_league = defaultdict(list)
    for r in rows:
        lg = r.get("league") or "Unknown"
        per_league[lg].append(r)

    baselines = {}
    for lg, items in per_league.items():
        n = len(items)
        if n < MIN_MATCHES_LEAGUE:
            continue
        baselines[lg] = {
            "matches":         n,
            "avg_goals":       _avg([r["total_goals"] for r in items]),
            "home_win_rate":   _pct(sum(r["home_win"] for r in items), n),
            "draw_rate":       _pct(sum(r["draw"] for r in items), n),
            "away_win_rate":   _pct(sum(r["away_win"] for r in items), n),
            "btts_yes_rate":   _pct(sum(r["btts_yes"] for r in items), n),
            "over_15_rate":    _pct(sum(r["over_15"] for r in items), n),
            "over_25_rate":    _pct(sum(r["over_25"] for r in items), n),
            "over_35_rate":    _pct(sum(r["over_35"] for r in items), n),
            "under_35_rate":   _pct(sum(r["under_35"] for r in items), n),
            "avg_xg_home":     _avg([r["xg_home"] for r in items if r.get("xg_home") is not None]) or None,
            "avg_xg_away":     _avg([r["xg_away"] for r in items if r.get("xg_away") is not None]) or None,
        }
    return baselines


# ─── Odds features ────────────────────────────────────────────────────────────
def odds_features(row):
    feats = {}
    oh = row.get("odds_home")
    od = row.get("odds_draw")
    oa = row.get("odds_away")
    ov25 = row.get("odds_over_25")
    ou25 = row.get("odds_under_25")
    ov15 = row.get("odds_over_15")
    ou15 = row.get("odds_under_15")
    ob   = row.get("odds_btts_yes")
    onb  = row.get("odds_btts_no")

    # No-vig 1X2
    nv1x2 = _no_vig([oh, od, oa])
    feats["nv_prob_home"]  = nv1x2[0]
    feats["nv_prob_draw"]  = nv1x2[1]
    feats["nv_prob_away"]  = nv1x2[2]

    # Margin
    if oh and od and oa:
        imp = [1.0/_f(oh), 1.0/_f(od), 1.0/_f(oa)]
        feats["bookie_margin_1x2"] = round(sum(imp) - 1.0, 6)
    else:
        feats["bookie_margin_1x2"] = None

    # No-vig Over/Under
    nv_ou25 = _no_vig([ov25, ou25])
    feats["nv_prob_over_25"]  = nv_ou25[0]
    feats["nv_prob_under_25"] = nv_ou25[1]

    nv_ou15 = _no_vig([ov15, ou15])
    feats["nv_prob_over_15"]  = nv_ou15[0]

    nv_btts = _no_vig([ob, onb])
    feats["nv_prob_btts_yes"] = nv_btts[0]
    feats["nv_prob_btts_no"]  = nv_btts[1]

    # Odds ratio
    if oh and oa and _f(oh, 0) > 0 and _f(oa, 0) > 0:
        feats["odds_ratio_home_away"]   = round(_f(oh) / _f(oa), 4)
        feats["odds_diff_home_away"]    = round(_f(oh) - _f(oa), 4)
    else:
        feats["odds_ratio_home_away"] = None
        feats["odds_diff_home_away"]  = None

    # Flags
    feats["close_match_flag"]    = 1 if (oh and oa and abs(_f(oh) - _f(oa)) < 0.3) else 0
    feats["heavy_favorite_home"] = 1 if (oh and _f(oh, 99) < 1.40) else 0
    feats["heavy_favorite_away"] = 1 if (oa and _f(oa, 99) < 1.40) else 0

    # API probs
    feats["api_prob_home_win"] = row.get("api_prob_home_win")
    feats["api_prob_draw"]     = row.get("api_prob_draw")
    feats["api_prob_away_win"] = row.get("api_prob_away_win")
    feats["api_prob_over_25"]  = row.get("api_prob_over_25")
    feats["api_prob_btts_yes"] = row.get("api_prob_btts_yes")

    return feats


# ─── Context features ─────────────────────────────────────────────────────────
def context_features(row, home_hist, away_hist, league_baseline):
    feats = {}
    # Season stage
    yr = _i(row.get("season_year"), 0)
    dt = _parse_dt(row.get("date"))
    if dt:
        feats["month"]        = dt.month
        feats["day_of_week"]  = dt.weekday()   # 0=Mon
        feats["hour_bucket"]  = (dt.hour // 3)  # 0-7
    else:
        feats["month"] = feats["day_of_week"] = feats["hour_bucket"] = None

    feats["season_year"] = yr

    # Rest days (giorni dal'ultimo meci)
    def last_match_days(hist):
        if not hist or not dt:
            return None
        last_dt = _parse_dt(hist[-1].get("date"))
        if not last_dt:
            return None
        diff = (dt - last_dt).days
        return diff if 0 <= diff <= 90 else None

    feats["home_rest_days"] = last_match_days(home_hist)
    feats["away_rest_days"] = last_match_days(away_hist)
    hrd = feats["home_rest_days"]
    ard = feats["away_rest_days"]
    feats["rest_days_diff"] = round(_f(hrd) - _f(ard), 1) if (hrd and ard) else None

    # League home advantage
    if league_baseline:
        ha_score = league_baseline.get("home_win_rate", 33.33) - 33.33
        feats["league_home_advantage"]  = round(ha_score, 4)
        feats["league_avg_goals"]       = league_baseline.get("avg_goals")
        feats["league_btts_rate"]       = league_baseline.get("btts_yes_rate")
        feats["league_over25_rate"]     = league_baseline.get("over_25_rate")
        feats["league_under35_rate"]    = league_baseline.get("under_35_rate")
        feats["league_home_win_rate"]   = league_baseline.get("home_win_rate")
        feats["league_draw_rate"]       = league_baseline.get("draw_rate")
        feats["league_away_win_rate"]   = league_baseline.get("away_win_rate")
        feats["league_avg_xg_home"]     = league_baseline.get("avg_xg_home")
        feats["league_avg_xg_away"]     = league_baseline.get("avg_xg_away")
    else:
        for k in ["league_home_advantage","league_avg_goals","league_btts_rate",
                  "league_over25_rate","league_under35_rate","league_home_win_rate",
                  "league_draw_rate","league_away_win_rate","league_avg_xg_home","league_avg_xg_away"]:
            feats[k] = None

    return feats


# ─── xG features ──────────────────────────────────────────────────────────────
def xg_features(row, home_hist, away_hist):
    feats = {}
    xgh = row.get("xg_home")
    xga = row.get("xg_away")

    # Poisson-based probs din xG actual (dacă disponibil)
    feats["poisson_prob_over25_xg"] = poisson_over(xgh, xga, 2.5)
    feats["poisson_prob_over15_xg"] = poisson_over(xgh, xga, 1.5)
    feats["poisson_prob_btts_xg"]   = poisson_btts(xgh, xga)

    if xgh is not None and xga is not None:
        feats["xg_sum"]        = round(xgh + xga, 4)
        feats["xg_diff"]       = round(xgh - xga, 4)
        feats["xg_ratio"]      = round(xgh / xga, 4) if xga > 0.1 else None
    else:
        feats["xg_sum"] = feats["xg_diff"] = feats["xg_ratio"] = None

    # Rolling xG din form (fereastra 5)
    xgf_home  = [h["xg_for"] for h in home_hist[-5:] if h.get("xg_for") is not None]
    xgf_away  = [h["xg_for"] for h in away_hist[-5:] if h.get("xg_for") is not None]
    xga_home  = [h["xg_against"] for h in home_hist[-5:] if h.get("xg_against") is not None]
    xga_away  = [h["xg_against"] for h in away_hist[-5:] if h.get("xg_against") is not None]

    feats["home_xg_form_5"]     = _avg(xgf_home) if xgf_home else None
    feats["away_xg_form_5"]     = _avg(xgf_away) if xgf_away else None
    feats["home_xga_form_5"]    = _avg(xga_home) if xga_home else None
    feats["away_xga_form_5"]    = _avg(xga_away) if xga_away else None

    if feats["home_xg_form_5"] and feats["away_xg_form_5"]:
        feats["xg_form_sum_5"]  = round(feats["home_xg_form_5"] + feats["away_xg_form_5"], 4)
        feats["xg_form_diff_5"] = round(feats["home_xg_form_5"] - feats["away_xg_form_5"], 4)
        feats["poisson_prob_over25_form5"] = poisson_over(
            feats["home_xg_form_5"], feats["away_xg_form_5"], 2.5)
        feats["poisson_prob_btts_form5"]   = poisson_btts(
            feats["home_xg_form_5"], feats["away_xg_form_5"])
    else:
        feats["xg_form_sum_5"] = feats["xg_form_diff_5"] = None
        feats["poisson_prob_over25_form5"] = feats["poisson_prob_btts_form5"] = None

    return feats


# ─── Asamblare rând features ──────────────────────────────────────────────────
def build_feature_row(row, h_snap, a_snap, h2h_snap, league_baseline):
    home_hist = h_snap
    away_hist = a_snap
    hid       = row.get("home_team_id")

    feats = {
        "event_id":   row["event_id"],
        "date":       row["date"],
        "season_id":  row.get("season_id"),
        "season_year":row.get("season_year"),
        "league":     row.get("league", ""),
        "league_id":  row.get("league_id"),
        "home_team":  row.get("home_team", ""),
        "away_team":  row.get("away_team", ""),
        "home_team_id": row.get("home_team_id"),
        "away_team_id": row.get("away_team_id"),
    }

    # A) Form features
    feats.update(form_features(home_hist, "home"))
    feats.update(form_features(away_hist, "away"))
    feats.update(diff_features(feats, feats))   # home - away diffs

    # B) xG features
    feats.update(xg_features(row, home_hist, away_hist))

    # C) H2H features
    feats.update(h2h_features(h2h_snap, hid))

    # D) Odds / no-vig features
    feats.update(odds_features(row))

    # E) Context features
    feats.update(context_features(row, home_hist, away_hist, league_baseline))

    # F) Target labels
    feats["target_home_win"] = row["home_win"]
    feats["target_draw"]     = row["draw"]
    feats["target_away_win"] = row["away_win"]
    feats["target_btts_yes"] = row["btts_yes"]
    feats["target_over_15"]  = row["over_15"]
    feats["target_over_25"]  = row["over_25"]
    feats["target_under_35"] = row["under_35"]
    feats["target_result_1x2"] = row.get("result_1x2", "")

    # G) Eligibilitate
    home_pre = feats.get("home_matches_pre", 0)
    away_pre = feats.get("away_matches_pre", 0)
    feats["eligible_min3"] = 1 if (home_pre >= 3 and away_pre >= 3) else 0
    feats["eligible_min5"] = 1 if (home_pre >= 5 and away_pre >= 5) else 0

    return feats


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    # 1. Load
    rows = load_warehouse()
    if not rows:
        print("ERROR: Warehouse gol. Rulează fetch_history_batch.py mai întâi.")
        return

    # 2. Sortare cronologică (OBLIGATORIE pentru no-leakage)
    rows_sorted = sorted(rows, key=lambda r: r.get("date", ""))
    print(f"Meciuri sortate: {len(rows_sorted)}")

    # 3. League baselines (pe întreg istoricul → folosit ca context static)
    print("Building league baselines...")
    league_baselines = build_league_baselines(rows_sorted)
    print(f"  {len(league_baselines)} ligi eligibile")

    # 4. Team history snapshots (cronologic, fără leakage)
    print("Building team history snapshots...")
    team_snaps = build_team_histories(rows_sorted)

    # 5. H2H snapshots
    print("Building H2H snapshots...")
    h2h_snaps = build_h2h_tracker(rows_sorted)

    # 6. Build feature rows
    print("Building feature rows...")
    feature_rows = []
    skipped = 0
    for row in rows_sorted:
        eid  = row["event_id"]
        snap = team_snaps.get(eid, {})
        h2h  = h2h_snaps.get(eid, {})
        lb   = league_baselines.get(row.get("league", ""))

        feat_row = build_feature_row(
            row,
            h_snap=snap.get("home_hist", []),
            a_snap=snap.get("away_hist", []),
            h2h_snap=h2h,
            league_baseline=lb,
        )
        feature_rows.append(feat_row)

    print(f"  {len(feature_rows)} rânduri de features generate ({skipped} skipped)")

    # 7. Statistici
    eligible5 = sum(1 for r in feature_rows if r.get("eligible_min5", 0))
    eligible3 = sum(1 for r in feature_rows if r.get("eligible_min3", 0))
    feat_cols  = [k for k in feature_rows[0] if k.startswith(("home_","away_","form_","h2h_",
                 "goals_","btts_","over2","under","xg_","poisson","nv_","odds_","api_",
                 "league_","rest_","month","day_","hour_","season_year","close_","heavy_"))]

    summary = {
        "updated_at":        datetime.now(timezone.utc).isoformat(),
        "version":           "feature_engineering_v2",
        "rows_total":        len(feature_rows),
        "eligible_min3":     eligible3,
        "eligible_min5":     eligible5,
        "pct_eligible_min5": round(eligible5 / len(feature_rows) * 100, 2) if feature_rows else 0,
        "leagues":           len(league_baselines),
        "feature_count":     len(feat_cols),
        "feature_columns":   sorted(feat_cols),
        "targets":           ["home_win","draw","away_win","btts_yes","over_15","over_25","under_35"],
    }

    # 8. Salvare
    DATA_DIR.mkdir(exist_ok=True)
    out_path = DATA_DIR / "features_v2.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(feature_rows, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {out_path} ({out_path.stat().st_size:,} bytes)")

    sum_path = DATA_DIR / "features_v2_summary.json"
    with open(sum_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Saved: {sum_path}")

    with open(DATA_DIR / "league_baselines_v2.json", "w", encoding="utf-8") as f:
        json.dump(league_baselines, f, ensure_ascii=False, indent=2)

    import json as _j
    print("\n" + _j.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
