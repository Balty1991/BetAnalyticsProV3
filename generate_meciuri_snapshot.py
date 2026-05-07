#!/usr/bin/env python3
"""
generate_meciuri_snapshot.py — BetAnalytics Pro V21+

Citeste recommendation_log.json si produce data/meciuri_snapshot.json.

Snapshot-ul contine EXACT ce apare in tab-ul Meciuri:
  - Se foloseste eligible_categories salvat la momentul logarii
  - Fiecare entry are statusul curent (pending / win / lose)
  - Nu se recalculeaza nimic — snapshot = ground truth pentru Istoric

Rulat de GitHub Actions dupa fiecare fetch, astfel:
  - Pending-urile se actualizeaza la fiecare fetch (status + scor)
  - Istoricul citeste din snapshot, nu recalculeaza din ALL_MATCHES
"""

import json
import os
from datetime import datetime, timezone, date
from pathlib import Path

DATA_DIR = Path("data")
LOG_FILE = DATA_DIR / "recommendation_log.json"
SNAPSHOT_FILE = DATA_DIR / "meciuri_snapshot.json"

# Porneste de la aceasta data — intrari mai vechi nu se includ
START_DATE = date(2026, 5, 7)

# Categorii valide
VALID_CATS = {"all", "safe", "o15", "btts", "u35", "value"}

KEEP_FIELDS = [
    "log_id", "event_id", "home", "away", "league",
    "event_date", "logged_at", "market_key", "market",
    "odds", "adjusted_prob", "edge_pct", "value",
    "score", "verdict", "risk_tier", "eligible_categories",
    "status", "won", "home_score", "away_score", "settled_at",
]


def normalize_status(entry: dict) -> str:
    """Determina statusul curent al unui entry."""
    status = str(entry.get("status") or "").lower().strip()
    won = entry.get("won")

    if status == "win" or won is True:
        return "win"
    if status in ("lose", "loss", "lost") or won is False:
        return "lose"
    if status == "pending" or won is None:
        return "pending"
    # Fallback: daca are scor, evalueaza
    hs = entry.get("home_score")
    as_ = entry.get("away_score")
    mk = entry.get("market_key", "")
    if hs is not None and as_ is not None:
        try:
            hs, as_ = int(hs), int(as_)
            total = hs + as_
            if mk == "over15":
                return "win" if total > 1 else "lose"
            if mk == "over25":
                return "win" if total > 2 else "lose"
            if mk == "under25":
                return "win" if total < 3 else "lose"
            if mk == "under35":
                return "win" if total < 4 else "lose"
            if mk == "btts":
                return "win" if hs > 0 and as_ > 0 else "lose"
            if mk == "homeWin":
                return "win" if hs > as_ else "lose"
            if mk == "awayWin":
                return "win" if as_ > hs else "lose"
            if mk == "draw":
                return "win" if hs == as_ else "lose"
        except (ValueError, TypeError):
            pass
    return "pending"


def get_event_date(entry: dict):
    """Extrage data evenimentului ca date object."""
    raw = entry.get("event_date") or entry.get("logged_at") or ""
    if not raw:
        return None
    try:
        # Trimite cu/fara timezone
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.date()
    except (ValueError, TypeError):
        return None


def build_snapshot():
    if not LOG_FILE.exists():
        print(f"[snapshot] {LOG_FILE} nu exista, skip.")
        return

    log = json.loads(LOG_FILE.read_text(encoding="utf-8"))
    print(f"[snapshot] recommendation_log: {len(log)} intrari")

    # DC markets excluse (la fel ca in Meciuri)
    DC_MKTS = {"dc1x", "dcx2", "dc12"}

    entries = []
    skipped_date = 0
    skipped_no_cats = 0
    skipped_dc = 0

    for r in log:
        # Skip DC markets
        mk = r.get("market_key", "")
        if mk in DC_MKTS:
            skipped_dc += 1
            continue

        # Skip fara eligible_categories
        cats = r.get("eligible_categories")
        if not cats or not isinstance(cats, list) or len(cats) == 0:
            skipped_no_cats += 1
            continue

        # Skip intrari mai vechi de START_DATE
        ev_date = get_event_date(r)
        if ev_date is None or ev_date < START_DATE:
            skipped_date += 1
            continue

        # Construieste entry curat
        entry = {}
        for f in KEEP_FIELDS:
            if f in r:
                entry[f] = r[f]

        # Normalizeaza statusul
        entry["status"] = normalize_status(r)

        # Curata eligible_categories (doar cele valide)
        entry["eligible_categories"] = [
            c for c in cats if c in VALID_CATS
        ]
        if not entry["eligible_categories"]:
            skipped_no_cats += 1
            continue

        # Asigura ca 'all' e inclus daca lipseste
        if "all" not in entry["eligible_categories"]:
            entry["eligible_categories"].insert(0, "all")

        entries.append(entry)

    # Dedup pe event_id + market_key (pastreaza cel mai recent)
    seen = {}
    for e in entries:
        key = f"{e.get('event_id', '')}::{e.get('market_key', '')}"
        if key not in seen:
            seen[key] = e
        else:
            # Pastreaza cel cu logged_at mai nou
            existing = seen[key]
            try:
                ts_new = datetime.fromisoformat(
                    str(e.get("logged_at", "1970")).replace("Z", "+00:00")
                ).timestamp()
                ts_old = datetime.fromisoformat(
                    str(existing.get("logged_at", "1970")).replace("Z", "+00:00")
                ).timestamp()
                if ts_new > ts_old:
                    seen[key] = e
            except (ValueError, TypeError):
                pass

    final_entries = list(seen.values())

    # Sorteaza dupa event_date
    def sort_key(e):
        try:
            return datetime.fromisoformat(
                str(e.get("event_date", "1970")).replace("Z", "+00:00")
            ).timestamp()
        except (ValueError, TypeError):
            return 0

    final_entries.sort(key=sort_key)

    snapshot = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "start_date": START_DATE.isoformat(),
        "note": (
            "Snapshot generat din recommendation_log cu eligible_categories "
            "exacte din tab-ul Meciuri. Istoric citeste DOAR din acest fisier."
        ),
        "total": len(final_entries),
        "entries": final_entries,
    }

    SNAPSHOT_FILE.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Stats
    pending = sum(1 for e in final_entries if e["status"] == "pending")
    wins = sum(1 for e in final_entries if e["status"] == "win")
    losses = sum(1 for e in final_entries if e["status"] == "lose")
    cats_count = {}
    for e in final_entries:
        for c in e["eligible_categories"]:
            cats_count[c] = cats_count.get(c, 0) + 1

    print(f"[snapshot] Generat: {len(final_entries)} intrari "
          f"(pending={pending}, win={wins}, lose={losses})")
    print(f"[snapshot] Skipped: date_veche={skipped_date}, "
          f"fara_cats={skipped_no_cats}, DC={skipped_dc}")
    print(f"[snapshot] Per categorie: {cats_count}")
    print(f"[snapshot] Salvat: {SNAPSHOT_FILE}")


if __name__ == "__main__":
    build_snapshot()
