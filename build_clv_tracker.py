#!/usr/bin/env python3
"""
build_clv_tracker.py — BetAnalytics Pro V3 | Closing Line Value Engine
=======================================================================
Calculează CLV (Closing Line Value) pentru toate pick-urile settle-ate
din ui_picks_log.json.

CLV = cât de mult ai bătut (sau pierdut față de) linia de închidere a pieței.
- CLV > 0  → ai obținut cote mai bune decât closing line → semnal de value real
- CLV < 0  → piața s-a mișcat contra ta → posibil model supraestimează edge-ul

Formula:
    picked_implied  = 1 / opening_odds
    closing_implied = 1 / closing_odds
    clv_pct = (closing_implied - picked_implied) / picked_implied × 100

Output: data/clv_tracker.json

Interpretare automată (Diagnosis):
  CLV+ & ROI+ → Edge serios, semnal real
  CLV+ & ROI- → Varianță normală, continuă
  CLV- & ROI+ → Noroc, nu edge sustenabil
  CLV- & ROI- → Modelul nu bate piața
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path("data")

# ─── helpers ──────────────────────────────────────────────────────────────────

def _f(v: Any, default: float = 0.0) -> float:
    try:
        x = float(v)
        return default if math.isnan(x) or math.isinf(x) else x
    except Exception:
        return default


def load_json(path: Path, default: Any = None) -> Any:
    try:
        with path.open(encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default if default is not None else {}


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


# ─── CLV core ─────────────────────────────────────────────────────────────────

def compute_clv(picked_odds: float, closing_odds: float) -> Optional[float]:
    """
    Returnează CLV% sau None dacă datele sunt invalide.
    CLV > 0  → ai bătut closing line (ai primit cote mai bune decât piața finală)
    CLV < 0  → ai pierdut față de closing line
    """
    if picked_odds <= 1.01 or closing_odds <= 1.01:
        return None
    picked_implied  = 1.0 / picked_odds
    closing_implied = 1.0 / closing_odds
    return round((closing_implied - picked_implied) / picked_implied * 100.0, 4)


def ev_at_pick(model_prob: float, picked_odds: float) -> Optional[float]:
    """EV% la momentul parierii, folosind probabilitatea modelului."""
    if picked_odds <= 1.01 or model_prob <= 0.0:
        return None
    p = model_prob / 100.0 if model_prob > 1.0 else model_prob
    return round((p * (picked_odds - 1.0) - (1.0 - p)) * 100.0, 4)


# ─── procesare picks ──────────────────────────────────────────────────────────

def process_pick(row: Dict) -> Optional[Dict]:
    """
    Procesează un pick din recommendation_log și returnează înregistrarea CLV.
    Returnează None dacă datele sunt insuficiente.
    """
    # Necesităm pick-uri settle-ate
    if row.get("won") is None:
        return None

    opening_odds = _f(row.get("opening_odds"), 0.0)
    closing_odds = _f(row.get("odds"), 0.0)  # ultimele cote cunoscute = closing proxy

    if opening_odds <= 1.01 or closing_odds <= 1.01:
        return None

    picked_implied  = round(1.0 / opening_odds, 6)
    closing_implied = round(1.0 / closing_odds, 6)
    clv             = compute_clv(opening_odds, closing_odds)

    if clv is None:
        return None

    # EV la momentul parierii
    model_prob = _f(row.get("adjusted_prob") or row.get("model_prob"), 0.0)
    ev         = ev_at_pick(model_prob, opening_odds)

    # Data curată pentru sortare/filtrare
    event_date = (
        row.get("event_date") or row.get("settled_at") or
        row.get("logged_at") or ""
    )
    date_str = event_date[:10] if event_date else ""

    # Line movement (de la deschidere la închidere)
    line_move_pct = round(
        ((closing_odds - opening_odds) / opening_odds) * 100.0, 4
    ) if opening_odds > 1.01 else 0.0

    # CLV este credibil doar daca linia s-a miscat (opening != closing).
    # Daca odds-ul nu s-a actualizat in log, CLV=0 nu inseamna ca am batut piata —
    # inseamna ca nu avem date despre closing line reala.
    # clv_reliable=True: linia s-a miscat cel putin 0.5% fata de opening.
    clv_reliable = abs(line_move_pct) >= 0.5

    return {
        "event_id":       str(row.get("event_id") or ""),
        "date":           date_str,
        "home":           row.get("home") or "",
        "away":           row.get("away") or "",
        "league":         row.get("league") or "",
        "market":         row.get("market_key") or row.get("market") or "",
        "picked_odds":    round(opening_odds, 4),
        "closing_odds":   round(closing_odds, 4),
        "picked_implied": picked_implied,
        "closing_implied":closing_implied,
        "clv_pct":        clv,
        "clv_positive":   clv > 0.0,
        "clv_reliable":   clv_reliable,
        "ev_at_pick_pct": ev,
        "model_prob":     round(model_prob, 2),
        "edge_pct":       _f(row.get("edge_pct"), 0.0),
        "score":          int(_f(row.get("score"), 0)),
        "line_move_pct":  line_move_pct,
        "won":            bool(row.get("won")),
        "status":         row.get("status") or ("win" if row.get("won") else "lose"),
        "settled_at":     row.get("settled_at") or "",
        "prediction_id":  row.get("prediction_id"),
    }


# ─── statistici agregate ──────────────────────────────────────────────────────

def aggregate_stats(picks: List[Dict]) -> Dict:
    """Calculează statistici CLV globale."""
    if not picks:
        return {}

    clv_vals  = [p["clv_pct"] for p in picks]
    wins      = [p for p in picks if p["won"]]
    losses    = [p for p in picks if not p["won"]]
    clv_pos   = [p for p in picks if p["clv_positive"]]
    clv_neg   = [p for p in picks if not p["clv_positive"]]

    n          = len(picks)
    avg_clv    = sum(clv_vals) / n
    median_clv = sorted(clv_vals)[n // 2]

    # ROI simplu (flat staking)
    roi_pct = _calc_roi(picks)

    # Win rate
    win_rate = len(wins) / n * 100.0

    reliable = [p for p in picks if p.get("clv_reliable")]
    n_reliable = len(reliable)
    avg_clv_reliable = round(sum(p["clv_pct"] for p in reliable) / n_reliable, 4) if n_reliable else None
    roi_reliable = round(_calc_roi(reliable), 4) if n_reliable else None

    return {
        "total_picks":           n,
        "avg_clv_pct":           round(avg_clv, 4),
        "median_clv_pct":        round(median_clv, 4),
        "clv_positive_n":        len(clv_pos),
        "clv_negative_n":        len(clv_neg),
        "clv_positive_rate":     round(len(clv_pos) / n, 4),
        "avg_clv_wins":          round(sum(p["clv_pct"] for p in wins) / max(len(wins), 1), 4),
        "avg_clv_losses":        round(sum(p["clv_pct"] for p in losses) / max(len(losses), 1), 4),
        "win_rate_pct":          round(win_rate, 2),
        "roi_flat_pct":          round(roi_pct, 4),
        "max_clv_pct":           round(max(clv_vals), 4),
        "min_clv_pct":           round(min(clv_vals), 4),
        "std_clv_pct":           round(_std(clv_vals), 4),
        # Metrici pe picks cu miscare reala de linie (clv_reliable=True)
        # Acestea sunt singurele statistici CLV credibile statistic.
        # Cand opening_odds == closing_odds, CLV=0 nu inseamna ca am batut piata.
        "reliable_n":            n_reliable,
        "reliable_pct":          round(n_reliable / n, 4) if n else 0,
        "avg_clv_reliable":      avg_clv_reliable,
        "roi_reliable":          roi_reliable,
        "proxy_warning":         n_reliable < n * 0.4,
    }


def aggregate_by_market(picks: List[Dict]) -> Dict:
    """Statistici CLV grupate pe piață."""
    groups: Dict[str, List[Dict]] = defaultdict(list)
    for p in picks:
        groups[p["market"]].append(p)

    result = {}
    for mk, items in sorted(groups.items()):
        n           = len(items)
        clv_vals    = [i["clv_pct"] for i in items]
        wins        = [i for i in items if i["won"]]
        clv_pos     = [i for i in items if i["clv_positive"]]
        result[mk]  = {
            "n":                n,
            "avg_clv_pct":      round(sum(clv_vals) / n, 4),
            "clv_positive_rate":round(len(clv_pos) / n, 4),
            "win_rate_pct":     round(len(wins) / n * 100.0, 2),
            "roi_flat_pct":     round(_calc_roi(items), 4),
            "avg_ev_at_pick":   round(
                sum(i["ev_at_pick_pct"] or 0 for i in items) / n, 4
            ),
        }
    return result


def aggregate_clv_buckets(picks: List[Dict]) -> Dict:
    """
    Împarte pick-urile în bucket-uri CLV și compară win rate / ROI.
    Arată dacă CLV prezice rezultatele.
    """
    thresholds = [
        ("clv_strong_pos",  lambda c: c >= 5.0),
        ("clv_mild_pos",    lambda c: 0.0 < c < 5.0),
        ("clv_neutral",     lambda c: -1.0 <= c <= 0.0),
        ("clv_mild_neg",    lambda c: -5.0 < c < -1.0),
        ("clv_strong_neg",  lambda c: c <= -5.0),
    ]
    result = {}
    for label, fn in thresholds:
        bucket = [p for p in picks if fn(p["clv_pct"])]
        if not bucket:
            result[label] = {"n": 0}
            continue
        n    = len(bucket)
        wins = [b for b in bucket if b["won"]]
        result[label] = {
            "n":          n,
            "win_rate":   round(len(wins) / n * 100.0, 2),
            "roi_pct":    round(_calc_roi(bucket), 4),
            "avg_clv":    round(sum(b["clv_pct"] for b in bucket) / n, 4),
        }
    return result


def rolling_clv(picks: List[Dict], days: int = 30) -> Dict:
    """CLV mediu pe ultimele N zile."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    recent = [p for p in picks if p["date"] >= cutoff]
    if not recent:
        return {"n": 0, "avg_clv_pct": None, "win_rate_pct": None}
    n     = len(recent)
    wins  = sum(1 for p in recent if p["won"])
    clvs  = [p["clv_pct"] for p in recent]
    return {
        "n":           n,
        "avg_clv_pct": round(sum(clvs) / n, 4),
        "win_rate_pct":round(wins / n * 100.0, 2),
        "roi_flat_pct":round(_calc_roi(recent), 4),
        "days":        days,
    }


def clv_ev_correlation(picks: List[Dict]) -> Dict:
    """
    Verifică dacă pick-urile cu EV+ au și CLV+.
    Divergența = model supraestimează edge.
    """
    ev_pos  = [p for p in picks if (p.get("ev_at_pick_pct") or 0) > 0]
    ev_neg  = [p for p in picks if (p.get("ev_at_pick_pct") or 0) <= 0]

    def avg_clv(lst):
        if not lst:
            return None
        return round(sum(p["clv_pct"] for p in lst) / len(lst), 4)

    return {
        "ev_positive_picks": {
            "n":       len(ev_pos),
            "avg_clv": avg_clv(ev_pos),
            "clv_positive_rate": round(
                sum(1 for p in ev_pos if p["clv_positive"]) / max(len(ev_pos), 1), 4
            ),
        },
        "ev_negative_picks": {
            "n":       len(ev_neg),
            "avg_clv": avg_clv(ev_neg),
            "clv_positive_rate": round(
                sum(1 for p in ev_neg if p["clv_positive"]) / max(len(ev_neg), 1), 4
            ),
        },
        "divergence_warning": (
            len(ev_pos) > 10 and
            (avg_clv(ev_pos) or 0) < -2.0
        ),
    }


# ─── diagnostic ───────────────────────────────────────────────────────────────

def build_diagnosis(summary: Dict, rolling: Dict) -> Dict:
    """
    Interpretare automată a CLV + ROI.
    Returnează signal, interpretare în română și acțiune recomandată.
    """
    avg_clv = summary.get("avg_clv_pct", 0.0) or 0.0
    roi     = summary.get("roi_flat_pct", 0.0) or 0.0
    n       = summary.get("total_picks", 0)
    clv_pos_rate = summary.get("clv_positive_rate", 0.0) or 0.0

    if n < 20:
        return {
            "signal":         "INSUFFICIENT_DATA",
            "interpretation": f"Prea puține date ({n} pick-uri settle-ate). Minim 20 necesare.",
            "action":         "Colectează mai multe pick-uri înainte de interpretare.",
            "confidence":     "low",
        }

    clv_positive = avg_clv > 0.5
    roi_positive = roi > 0.0

    if clv_positive and roi_positive:
        signal = "CLV_POSITIVE_ROI_POSITIVE"
        interp = (
            f"✅ Edge serios detectat. CLV mediu: +{avg_clv:.2f}%, ROI flat: +{roi:.2f}%. "
            f"Modelul bate piața ({clv_pos_rate*100:.0f}% din pick-uri au CLV+). "
            "Semnalul este sustenabil."
        )
        action = "Continuă strategia curentă. Crește gradual stake-urile."

    elif clv_positive and not roi_positive:
        signal = "CLV_POSITIVE_ROI_NEGATIVE"
        interp = (
            f"⚠️ CLV pozitiv (+{avg_clv:.2f}%) dar ROI negativ ({roi:.2f}%). "
            "Probabil varianță nefavorabilă pe termen scurt. "
            "Modelul bate closing line, deci edge-ul există matematic."
        )
        action = "Menține strategia curentă. ROI se va alinia cu CLV pe volum mai mare."

    elif not clv_positive and roi_positive:
        signal = "CLV_NEGATIVE_ROI_POSITIVE"
        interp = (
            f"🎲 ROI pozitiv ({roi:.2f}%) dar CLV negativ ({avg_clv:.2f}%). "
            "Rezultatele pot fi noroc, nu edge real. "
            "Modelul NU bate closing line în medie."
        )
        action = "Revizuiește modelul. ROI-ul pozitiv nu este sustenabil la CLV negativ."

    else:  # both negative
        signal = "CLV_NEGATIVE_ROI_NEGATIVE"
        interp = (
            f"❌ CLV negativ ({avg_clv:.2f}%) și ROI negativ ({roi:.2f}%). "
            "Modelul nu bate piața. Edge-ul calculat nu se reflectă în cotele reale."
        )
        action = "Auditează logica EV și sursele de probabilitate. Modelul necesită recalibrare."

    rolling_trend = "stabil"
    rolling_clv_val = rolling.get("avg_clv_pct")
    if rolling_clv_val is not None:
        if rolling_clv_val > avg_clv + 1.0:
            rolling_trend = "îmbunătățire recentă"
        elif rolling_clv_val < avg_clv - 1.0:
            rolling_trend = "degradare recentă"

    proxy_warning = summary.get("proxy_warning", False)
    reliable_pct = summary.get("reliable_pct", 1.0)
    proxy_note = ""
    if proxy_warning:
        proxy_note = (
            f" ⚠️ Nota: doar {reliable_pct*100:.0f}% din pick-uri au miscare reala de linie "
            f"(opening ≠ closing). CLV mediu calculat include pick-uri cu linie statica "
            f"(CLV=0 artificial). Foloseste avg_clv_reliable pentru interpretare corecta."
        )

    return {
        "signal":         signal,
        "interpretation": interp + proxy_note,
        "action":         action,
        "confidence":     "high" if n >= 100 else "medium" if n >= 50 else "low",
        "rolling_trend":  rolling_trend,
        "proxy_warning":  proxy_warning,
        "reliable_pct":   round(reliable_pct * 100, 1),
    }


# ─── helpers interne ──────────────────────────────────────────────────────────

def _calc_roi(picks: List[Dict]) -> float:
    """ROI flat staking (1 unitate per pariu)."""
    if not picks:
        return 0.0
    total_staked = float(len(picks))
    profit = sum(
        (_f(p["closing_odds"]) - 1.0) if p["won"] else -1.0
        for p in picks
    )
    return profit / total_staked * 100.0


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    n   = len(values)
    mu  = sum(values) / n
    var = sum((x - mu) ** 2 for x in values) / (n - 1)
    return math.sqrt(var)


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== Build CLV Tracker ===")

    log_path = DATA_DIR / "ui_picks_log.json"
    if not log_path.exists():
        print(f"[CLV] ui_picks_log.json lipsă: {log_path}")
        return

    raw     = load_json(log_path, [])
    all_rows = raw if isinstance(raw, list) else raw.get("log", [])

    print(f"[CLV] Total intrări recommendation_log: {len(all_rows)}")

    # Procesăm toate pick-urile settle-ate
    picks: List[Dict] = []
    skipped = 0
    for row in all_rows:
        result = process_pick(row)
        if result:
            picks.append(result)
        elif row.get("won") is not None:
            skipped += 1

    picks.sort(key=lambda p: p["date"], reverse=True)

    print(f"[CLV] Pick-uri procesate: {len(picks)} | Sărite (date insuficiente): {skipped}")

    if not picks:
        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "summary":    {"total_picks": 0},
            "diagnosis":  {"signal": "NO_DATA", "interpretation": "Fără date CLV disponibile."},
            "picks":      [],
        }
        save_json(DATA_DIR / "clv_tracker.json", payload)
        print("[CLV] Fișier gol salvat.")
        return

    # Statistici
    summary        = aggregate_stats(picks)
    by_market      = aggregate_by_market(picks)
    clv_buckets    = aggregate_clv_buckets(picks)
    rolling_30d    = rolling_clv(picks, 30)
    rolling_90d    = rolling_clv(picks, 90)
    ev_correlation = clv_ev_correlation(picks)
    diagnosis      = build_diagnosis(summary, rolling_30d)

    # Log diagnostic
    print(f"[CLV] Avg CLV: {summary['avg_clv_pct']:+.2f}% | "
          f"CLV+ rate: {summary['clv_positive_rate']*100:.1f}% | "
          f"ROI flat: {summary['roi_flat_pct']:+.2f}%")
    print(f"[CLV] Diagnostic: {diagnosis['signal']}")
    print(f"[CLV]   → {diagnosis['interpretation'][:100]}...")

    # Per market summary
    print("[CLV] Per piață:")
    for mk, stats in sorted(by_market.items(), key=lambda x: -abs(x[1]["avg_clv_pct"])):
        print(f"  {mk:12s} n={stats['n']:4d} CLV={stats['avg_clv_pct']:+.2f}% "
              f"WR={stats['win_rate_pct']:.1f}% ROI={stats['roi_flat_pct']:+.2f}%")

    payload = {
        "updated_at":     datetime.now(timezone.utc).isoformat(),
        "summary":        summary,
        "by_market":      by_market,
        "clv_buckets":    clv_buckets,
        "rolling_30d":    rolling_30d,
        "rolling_90d":    rolling_90d,
        "ev_correlation": ev_correlation,
        "diagnosis":      diagnosis,
        "picks":          picks,  # toate pick-urile (UI poate filtra/pagina)
    }

    out_path = DATA_DIR / "clv_tracker.json"
    save_json(out_path, payload)
    print(f"[CLV] Salvat: {out_path} ({len(picks)} pick-uri)")


if __name__ == "__main__":
    main()
