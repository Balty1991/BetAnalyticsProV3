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
ELO_START = 1500.0
ELO_K = 22.0
ELO_HOME_ADV = 55.0



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


def poisson_under(xg_home, xg_away, threshold=3.5):
    """P(goluri_total < threshold) pentru praguri .5, ex. Under 3.5 => <=3 goluri."""
    if xg_home is None or xg_away is None:
        return None
    max_goals = int(math.floor(threshold))
    p = 0.0
    for total_g in range(max_goals + 1):
        for h in range(total_g + 1):
            a = total_g - h
            p += _poisson_prob(xg_home, h) * _poisson_prob(xg_away, a)
    return round(p, 6)


def poisson_1x2(xg_home, xg_away, max_goals=10):
    """Distribuție 1X2 din lambda Poisson independent."""
    if xg_home is None or xg_away is None:
        return (None, None, None)
    home = draw = away = 0.0
    for h in range(max_goals + 1):
        ph = _poisson_prob(xg_home, h)
        for a in range(max_goals + 1):
            p = ph * _poisson_prob(xg_away, a)
            if h > a:
                home += p
            elif h == a:
                draw += p
            else:
                away += p
    total = home + draw + away
    if total > 0:
        home, draw, away = home / total, draw / total, away / total
    return (round(home, 6), round(draw, 6), round(away, 6))


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def elo_expected(home_elo, away_elo, home_adv=ELO_HOME_ADV):
    return 1.0 / (1.0 + math.pow(10.0, -((home_elo + home_adv) - away_elo) / 400.0))


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
                "event_id":      eid,
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
                "event_id":      eid,
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

        # Split home/away în istoricul echipei. Pentru predicție reală contează mult
        # cum joacă gazda acasă și oaspetele în deplasare, nu doar media globală.
        home_only = [h for h in hist if h.get("is_home") == 1][-w:]
        away_only = [h for h in hist if h.get("is_home") == 0][-w:]
        feats[f"{prefix}_home_points_avg_{w}"] = _avg([h["points"] for h in home_only]) if home_only else None
        feats[f"{prefix}_away_points_avg_{w}"] = _avg([h["points"] for h in away_only]) if away_only else None
        feats[f"{prefix}_home_goal_diff_avg_{w}"] = _avg([h["goal_diff"] for h in home_only]) if home_only else None
        feats[f"{prefix}_away_goal_diff_avg_{w}"] = _avg([h["goal_diff"] for h in away_only]) if away_only else None
        feats[f"{prefix}_home_goals_for_avg_{w}"] = _avg([h["goals_for"] for h in home_only]) if home_only else None
        feats[f"{prefix}_away_goals_for_avg_{w}"] = _avg([h["goals_for"] for h in away_only]) if away_only else None

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
    for w in windows:
        # Matchup-specific venue form: gazda acasă vs oaspetele în deplasare.
        hp = h_feats.get(f"home_home_points_avg_{w}")
        ap = a_feats.get(f"away_away_points_avg_{w}")
        hg = h_feats.get(f"home_home_goal_diff_avg_{w}")
        ag = a_feats.get(f"away_away_goal_diff_avg_{w}")
        hgf = h_feats.get(f"home_home_goals_for_avg_{w}")
        agf = a_feats.get(f"away_away_goals_for_avg_{w}")
        diffs[f"venue_points_diff_{w}"] = round(_f(hp) - _f(ap), 4) if hp is not None and ap is not None else None
        diffs[f"venue_goal_diff_delta_{w}"] = round(_f(hg) - _f(ag), 4) if hg is not None and ag is not None else None
        diffs[f"venue_goals_for_diff_{w}"] = round(_f(hgf) - _f(agf), 4) if hgf is not None and agf is not None else None
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
    """Baseline per ligă pe tot istoricul. Se salvează pentru inferență live, nu pentru etichete."""
    per_league = defaultdict(list)
    for r in rows:
        lg_raw = r.get("league") or "Unknown"
        if isinstance(lg_raw, dict):
            lg = lg_raw.get("name") or lg_raw.get("short_code") or str(lg_raw.get("id", "Unknown"))
        else:
            lg = str(lg_raw) if lg_raw else "Unknown"
        r["league"] = lg
        per_league[lg].append(r)

    baselines = {}
    for lg, items in per_league.items():
        if len(items) < MIN_MATCHES_LEAGUE:
            continue
        baselines[lg] = league_stats_from_items(items)
    return baselines


def league_stats_from_items(items):
    n = len(items)
    if n <= 0:
        return None
    return {
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


def build_league_baseline_snapshots(rows_sorted):
    """Baseline pre-match per ligă: doar meciuri anterioare evenimentului (fără leakage)."""
    per_league = defaultdict(list)
    global_items = []
    snapshots = {}
    for row in rows_sorted:
        lg = row.get("league") or "Unknown"
        league_items = per_league[lg]
        if len(league_items) >= MIN_MATCHES_LEAGUE:
            snap = league_stats_from_items(league_items)
            snap["baseline_scope"] = "league_rolling"
        elif len(global_items) >= MIN_MATCHES_LEAGUE:
            snap = league_stats_from_items(global_items)
            snap["baseline_scope"] = "global_rolling"
        else:
            snap = None
        snapshots[row["event_id"]] = snap
        league_items.append(row)
        global_items.append(row)
    return snapshots


def build_elo_snapshots(rows_sorted):
    """ELO pre-match pentru fiecare eveniment, actualizat cronologic după rezultat."""
    ratings = defaultdict(lambda: ELO_START)
    snapshots = {}
    for row in rows_sorted:
        hid, aid = row.get("home_team_id"), row.get("away_team_id")
        h_elo = ratings[hid] if hid else ELO_START
        a_elo = ratings[aid] if aid else ELO_START
        exp_h = elo_expected(h_elo, a_elo)
        snapshots[row["event_id"]] = {
            "home_elo_pre": round(h_elo, 2),
            "away_elo_pre": round(a_elo, 2),
            "elo_diff_pre": round(h_elo - a_elo, 2),
            "elo_expected_home": round(exp_h, 6),
        }
        if hid and aid:
            actual_h = 1.0 if row.get("home_win") else (0.5 if row.get("draw") else 0.0)
            margin = abs(_f(row.get("home_score")) - _f(row.get("away_score")))
            mov = math.log(max(1.0, margin) + 1.0)
            k = ELO_K * mov
            delta = k * (actual_h - exp_h)
            ratings[hid] = h_elo + delta
            ratings[aid] = a_elo - delta
    return snapshots

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
    feats["nv_prob_under_15"] = nv_ou15[1] if len(nv_ou15) > 1 else None

    ov35 = row.get("odds_over_35")
    ou35 = row.get("odds_under_35")
    nv_ou35 = _no_vig([ov35, ou35])
    feats["nv_prob_over_35"]  = nv_ou35[0]
    feats["nv_prob_under_35"] = nv_ou35[1]

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
        feats["league_baseline_matches"] = league_baseline.get("matches")
        feats["league_baseline_scope_code"] = 2 if league_baseline.get("baseline_scope") == "league_rolling" else 1
    else:
        for k in ["league_home_advantage","league_avg_goals","league_btts_rate",
                  "league_over25_rate","league_under35_rate","league_home_win_rate",
                  "league_draw_rate","league_away_win_rate","league_avg_xg_home","league_avg_xg_away",
                  "league_baseline_matches","league_baseline_scope_code"]:
            feats[k] = None

    # Referee features
    ref_avg_y   = row.get("ref_avg_yellow")
    ref_avg_g   = row.get("ref_avg_goals")
    ref_trend_y = row.get("ref_yellow_trend")
    ref_trend_g = row.get("ref_goals_trend")
    feats["ref_avg_yellow"]        = round(float(ref_avg_y),  3) if ref_avg_y  is not None else None
    feats["ref_avg_goals"]         = round(float(ref_avg_g),  3) if ref_avg_g  is not None else None
    feats["ref_yellow_trend"]      = round(float(ref_trend_y),3) if ref_trend_y is not None else None
    feats["ref_goals_trend"]       = round(float(ref_trend_g),3) if ref_trend_g is not None else None
    feats["ref_is_strict"]         = 1 if row.get("ref_is_strict")     else 0
    feats["ref_is_high_goals"]     = 1 if row.get("ref_is_high_goals") else 0
    feats["ref_stricter_recent"]   = 1 if (ref_trend_y and float(ref_trend_y) >=  0.5) else 0
    feats["ref_looser_recent"]     = 1 if (ref_trend_y and float(ref_trend_y) <= -0.5) else 0
    feats["ref_more_goals_recent"] = 1 if (ref_trend_g and float(ref_trend_g) >=  0.3) else 0

    # BSD model confidence (0-1, normalizat din v1 confidence 0-100)
    api_conf = row.get("api_confidence")
    feats["api_confidence"]          = round(float(api_conf) / 100, 4) if api_conf is not None else None
    feats["api_confidence_high"]     = 1 if (api_conf and float(api_conf) >= 60) else 0
    feats["api_confidence_very_high"]= 1 if (api_conf and float(api_conf) >= 70) else 0

    return feats


# ─── xG features ──────────────────────────────────────────────────────────────
def xg_features(row, home_hist, away_hist):
    feats = {}
    xgh = row.get("xg_home")
    xga = row.get("xg_away")

    # Poisson-based probs din xG actual (dacă disponibil)
    feats["poisson_prob_over25_xg"] = poisson_over(xgh, xga, 2.5)
    feats["poisson_prob_over15_xg"] = poisson_over(xgh, xga, 1.5)
    feats["poisson_prob_under35_xg"] = poisson_under(xgh, xga, 3.5)
    feats["poisson_prob_btts_xg"]   = poisson_btts(xgh, xga)
    ph, pd, pa = poisson_1x2(xgh, xga)
    feats["poisson_prob_home_xg"] = ph
    feats["poisson_prob_draw_xg"] = pd
    feats["poisson_prob_away_xg"] = pa

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
        feats["poisson_prob_over15_form5"] = poisson_over(
            feats["home_xg_form_5"], feats["away_xg_form_5"], 1.5)
        feats["poisson_prob_over25_form5"] = poisson_over(
            feats["home_xg_form_5"], feats["away_xg_form_5"], 2.5)
        feats["poisson_prob_under35_form5"] = poisson_under(
            feats["home_xg_form_5"], feats["away_xg_form_5"], 3.5)
        feats["poisson_prob_btts_form5"]   = poisson_btts(
            feats["home_xg_form_5"], feats["away_xg_form_5"])
        ph, pd, pa = poisson_1x2(feats["home_xg_form_5"], feats["away_xg_form_5"])
        feats["poisson_prob_home_form5"] = ph
        feats["poisson_prob_draw_form5"] = pd
        feats["poisson_prob_away_form5"] = pa
    else:
        # Fallback Poisson din goluri/concedate rolling, util când API nu oferă xG.
        lh = _avg([h.get("goals_for") for h in home_hist[-5:]]) if home_hist else None
        la = _avg([h.get("goals_for") for h in away_hist[-5:]]) if away_hist else None
        h_conc = _avg([h.get("goals_against") for h in home_hist[-5:]]) if home_hist else None
        a_conc = _avg([h.get("goals_against") for h in away_hist[-5:]]) if away_hist else None
        if lh is not None and la is not None and h_conc is not None and a_conc is not None:
            lam_h = _clamp((lh + a_conc) / 2.0, 0.15, 3.8)
            lam_a = _clamp((la + h_conc) / 2.0, 0.15, 3.8)
            feats["xg_form_sum_5"]  = round(lam_h + lam_a, 4)
            feats["xg_form_diff_5"] = round(lam_h - lam_a, 4)
            feats["poisson_prob_over15_form5"] = poisson_over(lam_h, lam_a, 1.5)
            feats["poisson_prob_over25_form5"] = poisson_over(lam_h, lam_a, 2.5)
            feats["poisson_prob_under35_form5"] = poisson_under(lam_h, lam_a, 3.5)
            feats["poisson_prob_btts_form5"] = poisson_btts(lam_h, lam_a)
            ph, pd, pa = poisson_1x2(lam_h, lam_a)
            feats["poisson_prob_home_form5"] = ph
            feats["poisson_prob_draw_form5"] = pd
            feats["poisson_prob_away_form5"] = pa
        else:
            feats["xg_form_sum_5"] = feats["xg_form_diff_5"] = None
            for k in ["over15","over25","under35","btts","home","draw","away"]:
                feats[f"poisson_prob_{k}_form5"] = None

    return feats



# ─── Stats features (din stats_cache.json — /events/{id}/stats/) ──────────────
def stats_features(home_hist, away_hist, stats_cache: dict) -> dict:
    """
    Features derivate din /api/v2/events/{id}/stats/ pentru echipele home/away.
    Calculează medie rolling pe ultimele 5 meciuri disponibile în cache.
    """
    feats = {}

    def _get_stat(hist, field_when_home, field_when_away, window=5):
        vals = []
        for m in hist[-int(window):]:
            eid = str(m.get("event_id", ""))
            item = stats_cache.get(eid) if isinstance(stats_cache, dict) else None
            if item:
                field = field_when_home if m.get("is_home") == 1 else field_when_away
                v = item.get(field)
                if v is not None and _f(v, -1) >= 0:
                    vals.append(float(v))
        return round(sum(vals) / len(vals), 4) if vals else None

    # Volum + calitate șuturi
    home_shots = _get_stat(home_hist, "home_shots", "away_shots")
    home_sot = _get_stat(home_hist, "home_shots_on_target", "away_shots_on_target")
    away_shots = _get_stat(away_hist, "home_shots", "away_shots")
    away_sot = _get_stat(away_hist, "home_shots_on_target", "away_shots_on_target")

    feats["home_shots_form5"] = home_shots
    feats["home_sot_form5"] = home_sot
    feats["away_shots_form5"] = away_shots
    feats["away_sot_form5"] = away_sot
    feats["home_sot_ratio_form5"] = round(home_sot / home_shots, 4) if home_shots and home_sot is not None else None
    feats["away_sot_ratio_form5"] = round(away_sot / away_shots, 4) if away_shots and away_sot is not None else None
    feats["home_shots_diff_form5"] = round((home_shots or 0) - (away_shots or 0), 4) if home_shots is not None and away_shots is not None else None
    feats["home_sot_diff_form5"] = round((home_sot or 0) - (away_sot or 0), 4) if home_sot is not None and away_sot is not None else None

    # Control joc + presiune
    feats["home_possession_form5"] = _get_stat(home_hist, "home_possession", "away_possession")
    feats["away_possession_form5"] = _get_stat(away_hist, "home_possession", "away_possession")
    feats["home_attack_form5"] = _get_stat(home_hist, "home_attack", "away_attack")
    feats["away_attack_form5"] = _get_stat(away_hist, "home_attack", "away_attack")
    feats["home_ball_safe_form5"] = _get_stat(home_hist, "home_ball_safe", "away_ball_safe")
    feats["away_ball_safe_form5"] = _get_stat(away_hist, "home_ball_safe", "away_ball_safe")
    feats["home_dangerous_attack_form5"] = _get_stat(home_hist, "home_dangerous_attack", "away_dangerous_attack")
    feats["away_dangerous_attack_form5"] = _get_stat(away_hist, "home_dangerous_attack", "away_dangerous_attack")
    feats["home_dangerous_attack_diff_form5"] = round((feats.get("home_dangerous_attack_form5") or 0) - (feats.get("away_dangerous_attack_form5") or 0), 4) if feats.get("home_dangerous_attack_form5") is not None and feats.get("away_dangerous_attack_form5") is not None else None

    # xG agregat din endpointul stats
    feats["home_xg_stats_form5"] = _get_stat(home_hist, "home_xg_stats", "away_xg_stats")
    feats["away_xg_stats_form5"] = _get_stat(away_hist, "home_xg_stats", "away_xg_stats")
    feats["xg_stats_sum_form5"] = round((feats.get("home_xg_stats_form5") or 0) + (feats.get("away_xg_stats_form5") or 0), 4) if feats.get("home_xg_stats_form5") is not None and feats.get("away_xg_stats_form5") is not None else None
    feats["xg_stats_diff_form5"] = round((feats.get("home_xg_stats_form5") or 0) - (feats.get("away_xg_stats_form5") or 0), 4) if feats.get("home_xg_stats_form5") is not None and feats.get("away_xg_stats_form5") is not None else None

    # Ritm xG și momentum final
    feats["home_xg_at70_ratio_form5"] = _get_stat(home_hist, "home_xg_at70_ratio", "away_xg_at70_ratio")
    feats["away_xg_at70_ratio_form5"] = _get_stat(away_hist, "home_xg_at70_ratio", "away_xg_at70_ratio")
    feats["home_momentum_last15_form5"] = _get_stat(home_hist, "momentum_last15", "momentum_last15")
    feats["away_momentum_last15_form5"] = _get_stat(away_hist, "momentum_last15", "momentum_last15")

    # Pase
    feats["home_pass_accuracy_form5"] = _get_stat(home_hist, "home_pass_accuracy", "away_pass_accuracy")
    feats["away_pass_accuracy_form5"] = _get_stat(away_hist, "home_pass_accuracy", "away_pass_accuracy")

    return feats


# ─── Shotmap features (din shotmap_cache.json — /events/{id}/stats/.shotmap) ─
def shotmap_features(home_hist, away_hist, shotmap_cache: dict) -> dict:
    """
    Features din shotmap: xG/șut, big chances, open-play xG, set-piece xG.
    Sunt side-aware și folosesc ultimele 5 meciuri disponibile.
    """
    feats = {}

    def _get(hist, home_field, away_field, window=5):
        vals = []
        for m in hist[-int(window):]:
            eid = str(m.get("event_id", ""))
            item = shotmap_cache.get(eid) if isinstance(shotmap_cache, dict) else None
            if item:
                field = home_field if m.get("is_home") == 1 else away_field
                v = item.get(field)
                if v is not None and _f(v, -1) >= 0:
                    vals.append(float(v))
        return round(sum(vals) / len(vals), 4) if vals else None

    pairs = [
        ("shotmap_shots", "home_shotmap_shots", "away_shotmap_shots"),
        ("shotmap_sot", "home_shotmap_sot", "away_shotmap_sot"),
        ("shotmap_goals", "home_shotmap_goals", "away_shotmap_goals"),
        ("shotmap_xg", "home_shotmap_xg", "away_shotmap_xg"),
        ("xg_per_shot", "home_xg_per_shot", "away_xg_per_shot"),
        ("big_chances", "home_big_chances", "away_big_chances"),
        ("open_play_xg", "home_open_play_xg", "away_open_play_xg"),
        ("set_piece_xg", "home_set_piece_xg", "away_set_piece_xg"),
        ("penalty_xg", "home_penalty_xg", "away_penalty_xg"),
        ("header_shots", "home_header_shots", "away_header_shots"),
    ]
    for short, hf, af in pairs:
        feats[f"home_{short}_form5"] = _get(home_hist, hf, af)
        feats[f"away_{short}_form5"] = _get(away_hist, hf, af)
        h = feats.get(f"home_{short}_form5")
        a = feats.get(f"away_{short}_form5")
        feats[f"home_{short}_diff_form5"] = round((h or 0) - (a or 0), 4) if h is not None and a is not None else None

    hxg = feats.get("home_shotmap_xg_form5")
    axg = feats.get("away_shotmap_xg_form5")
    if hxg is not None and axg is not None:
        feats["xg_shotmap_sum_form5"] = round(hxg + axg, 4)
        feats["xg_shotmap_diff_form5"] = round(hxg - axg, 4)
        feats["poisson_prob_over15_shotmap5"] = poisson_over(hxg, axg, 1.5)
        feats["poisson_prob_over25_shotmap5"] = poisson_over(hxg, axg, 2.5)
        feats["poisson_prob_under35_shotmap5"] = poisson_under(hxg, axg, 3.5)
        feats["poisson_prob_btts_shotmap5"] = poisson_btts(hxg, axg)
        ph, pd, pa = poisson_1x2(hxg, axg)
        feats["poisson_prob_home_shotmap5"] = ph
        feats["poisson_prob_draw_shotmap5"] = pd
        feats["poisson_prob_away_shotmap5"] = pa
    else:
        feats["xg_shotmap_sum_form5"] = None
        feats["xg_shotmap_diff_form5"] = None
        for k in ["over15", "over25", "under35", "btts", "home", "draw", "away"]:
            feats[f"poisson_prob_{k}_shotmap5"] = None

    return feats


# ─── PlayerStats features (din player_stats_cache.json — /events/{id}/player-stats/) ─
def player_stats_features(home_hist, away_hist, player_stats_cache: dict) -> dict:
    """Features din statisticile per-jucător: rating, xG/xA, șuturi, key passes, portar.

    Se agregă side-aware pe ultimele 5 meciuri disponibile, fără live și fără leakage.
    """
    feats = {}

    def _get(hist, home_field, away_field, window=5):
        vals = []
        for m in hist[-int(window):]:
            eid = str(m.get("event_id", ""))
            item = player_stats_cache.get(eid) if isinstance(player_stats_cache, dict) else None
            if item:
                field = home_field if m.get("is_home") == 1 else away_field
                v = item.get(field)
                if v is not None and _f(v, -1) >= 0:
                    vals.append(float(v))
        return round(sum(vals) / len(vals), 4) if vals else None

    pairs = [
        ("player_rating", "home_player_rating_avg", "away_player_rating_avg"),
        ("player_rating_top5", "home_player_rating_top5", "away_player_rating_top5"),
        ("player_xg", "home_player_xg_sum", "away_player_xg_sum"),
        ("player_xa", "home_player_xa_sum", "away_player_xa_sum"),
        ("player_attack_xg", "home_player_attack_xg", "away_player_attack_xg"),
        ("player_top3_xg", "home_player_top3_xg", "away_player_top3_xg"),
        ("player_shots", "home_player_shots", "away_player_shots"),
        ("player_sot", "home_player_sot", "away_player_sot"),
        ("player_key_pass", "home_player_key_pass", "away_player_key_pass"),
        ("player_pass_accuracy", "home_player_pass_accuracy", "away_player_pass_accuracy"),
        ("player_tackles", "home_player_tackles", "away_player_tackles"),
        ("player_interceptions", "home_player_interceptions", "away_player_interceptions"),
        ("player_yellow_cards", "home_player_yellow_cards", "away_player_yellow_cards"),
        ("player_red_cards", "home_player_red_cards", "away_player_red_cards"),
        ("keeper_saves", "home_keeper_saves", "away_keeper_saves"),
    ]
    for short, hf, af in pairs:
        feats[f"home_{short}_form5"] = _get(home_hist, hf, af)
        feats[f"away_{short}_form5"] = _get(away_hist, hf, af)
        h = feats.get(f"home_{short}_form5")
        a = feats.get(f"away_{short}_form5")
        feats[f"player_{short}_diff_form5"] = round((h or 0) - (a or 0), 4) if h is not None and a is not None else None

    hxg = feats.get("home_player_attack_xg_form5")
    axg = feats.get("away_player_attack_xg_form5")
    if hxg is not None and axg is not None:
        feats["player_attack_xg_sum_form5"] = round(hxg + axg, 4)
        feats["player_attack_xg_diff_form5"] = round(hxg - axg, 4)
        feats["poisson_prob_over15_player5"] = poisson_over(hxg, axg, 1.5)
        feats["poisson_prob_over25_player5"] = poisson_over(hxg, axg, 2.5)
        feats["poisson_prob_under35_player5"] = poisson_under(hxg, axg, 3.5)
        feats["poisson_prob_btts_player5"] = poisson_btts(hxg, axg)
        ph, pd, pa = poisson_1x2(hxg, axg)
        feats["poisson_prob_home_player5"] = ph
        feats["poisson_prob_draw_player5"] = pd
        feats["poisson_prob_away_player5"] = pa
    else:
        feats["player_attack_xg_sum_form5"] = None
        feats["player_attack_xg_diff_form5"] = None
        for k in ["over15", "over25", "under35", "btts", "home", "draw", "away"]:
            feats[f"poisson_prob_{k}_player5"] = None

    hrat = feats.get("home_player_rating_form5")
    arat = feats.get("away_player_rating_form5")
    feats["player_rating_diff_form5"] = round((hrat or 0) - (arat or 0), 4) if hrat is not None and arat is not None else None
    return feats


# ─── Incidents features (din incidents_cache.json — /events/{id}/incidents/) ──
def incidents_features(home_hist, away_hist, incidents_cache: dict) -> dict:
    """
    Features derivate din /api/v2/events/{id}/incidents/ pentru echipele home/away.
    Calculează rate rolling pe ultimele 5 meciuri disponibile în cache.
    """
    feats = {}

    def _get_inc(hist, field_when_home, field_when_away, window=5):
        vals = []
        for m in hist[-int(window):]:
            eid = str(m.get("event_id", ""))
            item = incidents_cache.get(eid) if isinstance(incidents_cache, dict) else None
            if item:
                field = field_when_home if m.get("is_home") == 1 else field_when_away
                v = item.get(field)
                if v is not None:
                    vals.append(float(v))
        return round(sum(vals) / len(vals), 4) if vals else None

    feats["home_early_goal_rate5"] = _get_inc(home_hist, "early_goal_home", "early_goal_away")
    feats["away_early_goal_rate5"] = _get_inc(away_hist, "early_goal_home", "early_goal_away")
    feats["home_late_goal_rate5"] = _get_inc(home_hist, "late_goal_home", "late_goal_away")
    feats["away_late_goal_rate5"] = _get_inc(away_hist, "late_goal_home", "late_goal_away")
    feats["home_first_goal_min_avg5"] = _get_inc(home_hist, "first_goal_home_min", "first_goal_away_min")
    feats["away_first_goal_min_avg5"] = _get_inc(away_hist, "first_goal_home_min", "first_goal_away_min")
    feats["home_goals_incidents_avg5"] = _get_inc(home_hist, "home_goals_count", "away_goals_count")
    feats["away_goals_incidents_avg5"] = _get_inc(away_hist, "home_goals_count", "away_goals_count")
    feats["home_yellow_cards_avg5"] = _get_inc(home_hist, "home_yellow_cards", "away_yellow_cards")
    feats["away_yellow_cards_avg5"] = _get_inc(away_hist, "home_yellow_cards", "away_yellow_cards")
    feats["home_red_cards_avg5"] = _get_inc(home_hist, "home_red_cards", "away_red_cards")
    feats["away_red_cards_avg5"] = _get_inc(away_hist, "home_red_cards", "away_red_cards")

    h_y = feats.get("home_yellow_cards_avg5") or 0
    a_y = feats.get("away_yellow_cards_avg5") or 0
    feats["home_total_yellow_avg5"] = round(h_y + a_y, 4) if (h_y or a_y) else None
    feats["home_red_card_risk_diff5"] = round((feats.get("home_red_cards_avg5") or 0) - (feats.get("away_red_cards_avg5") or 0), 4) if feats.get("home_red_cards_avg5") is not None and feats.get("away_red_cards_avg5") is not None else None

    return feats


# ─── Asamblare rând features ──────────────────────────────────────────────────
def build_feature_row(row, h_snap, a_snap, h2h_snap, league_baseline,
                      stats_cache=None, incidents_cache=None, shotmap_cache=None, player_stats_cache=None, elo_snapshot=None):
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

    # E1b) Rating ELO pre-match, fără leakage.
    if elo_snapshot:
        feats.update(elo_snapshot)
    else:
        feats.update({"home_elo_pre": None, "away_elo_pre": None, "elo_diff_pre": None, "elo_expected_home": None})

    # Data-quality score: folosit de model și de gating la inferență.
    h_pre = feats.get("home_matches_pre", 0) or 0
    a_pre = feats.get("away_matches_pre", 0) or 0
    base_matches = feats.get("league_baseline_matches") or 0
    quality = 35.0
    quality += min(25.0, min(h_pre, a_pre) * 3.0)
    quality += 12.0 if row.get("odds_home") and row.get("odds_draw") and row.get("odds_away") else 0.0
    quality += 10.0 if feats.get("xg_sum") is not None or feats.get("xg_form_sum_5") is not None else 0.0
    quality += min(18.0, float(base_matches or 0) / 10.0)
    feats["data_quality_score"] = round(_clamp(quality, 0.0, 100.0), 2)

    # E2) BSD model confidence — feature ensemble puternic
    api_conf = row.get("api_confidence")
    feats["api_confidence"]       = round(float(api_conf) / 100, 4) if api_conf is not None else None
    feats["api_confidence_above60"] = 1 if (api_conf and float(api_conf) >= 60) else 0
    feats["api_confidence_above70"] = 1 if (api_conf and float(api_conf) >= 70) else 0

    # F) Stats + Shotmap features (shots, possession, dangerous attacks, xG/shot)
    if stats_cache:
        feats.update(stats_features(home_hist, away_hist, stats_cache))
    if shotmap_cache:
        feats.update(shotmap_features(home_hist, away_hist, shotmap_cache))
    if player_stats_cache:
        feats.update(player_stats_features(home_hist, away_hist, player_stats_cache))

    # G) Incidents features (early/late goals, cards)
    if incidents_cache:
        feats.update(incidents_features(home_hist, away_hist, incidents_cache))

    # Targets
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

    # 1b. Load stats + incidents cache (opțional — generate de fetch_stats_incidents_cache.py)
    def _load_cache(path):
        if path.exists():
            try:
                return json.load(open(path))
            except Exception as e:
                print(f"  WARN cache {path.name}: {e}")
        return {}

    stats_cache     = _load_cache(DATA_DIR / "stats_cache.json")
    incidents_cache = _load_cache(DATA_DIR / "incidents_cache.json")
    shotmap_cache   = _load_cache(DATA_DIR / "shotmap_cache.json")
    player_stats_cache = _load_cache(DATA_DIR / "player_stats_cache.json")
    print(f"Stats cache: {len([v for v in stats_cache.values() if v])} entries valide")
    print(f"Incidents cache: {len([v for v in incidents_cache.values() if v])} entries valide")
    print(f"Shotmap cache: {len([v for v in shotmap_cache.values() if v])} entries valide")
    print(f"PlayerStats cache: {len([v for v in player_stats_cache.values() if v])} entries valide")

    # 2. Sortare cronologică (OBLIGATORIE pentru no-leakage)
    rows_sorted = sorted(rows, key=lambda r: r.get("date", ""))
    print(f"Meciuri sortate: {len(rows_sorted)}")

    # 3. League baselines: static pentru inferență + rolling pre-match pentru training fără leakage
    print("Building league baselines...")
    league_baselines = build_league_baselines(rows_sorted)
    league_baseline_snaps = build_league_baseline_snapshots(rows_sorted)
    print(f"  {len(league_baselines)} ligi eligibile")

    print("Building ELO snapshots...")
    elo_snaps = build_elo_snapshots(rows_sorted)

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
        lb   = league_baseline_snaps.get(eid) or league_baselines.get(row.get("league", ""))

        feat_row = build_feature_row(
            row,
            h_snap=snap.get("home_hist", []),
            a_snap=snap.get("away_hist", []),
            h2h_snap=h2h,
            league_baseline=lb,
            stats_cache=stats_cache,
            incidents_cache=incidents_cache,
            shotmap_cache=shotmap_cache,
            player_stats_cache=player_stats_cache,
            elo_snapshot=elo_snaps.get(eid, {}),
        )
        feature_rows.append(feat_row)

    print(f"  {len(feature_rows)} rânduri de features generate ({skipped} skipped)")

    # 7. Statistici
    eligible5 = sum(1 for r in feature_rows if r.get("eligible_min5", 0))
    eligible3 = sum(1 for r in feature_rows if r.get("eligible_min3", 0))
    feat_cols  = [k for k in feature_rows[0] if k.startswith(("home_","away_","form_","h2h_",
                 "goals_","btts_","over2","under","xg_","poisson","nv_","odds_","api_",
                 "league_","rest_","month","day_","hour_","season_year","close_","heavy_",
                 "venue_","elo_","data_quality","ref_","shotmap_","player_","keeper_"))]

    summary = {
        "updated_at":        datetime.now(timezone.utc).isoformat(),
        "version":           "feature_engineering_v3_leakage_safe_elo_poisson",
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
