#!/usr/bin/env python3
"""
generate_meciuri_snapshot.py — BetAnalytics Pro V21+

Logica:
  1. PENDING  → din recommendation_log: status=pending, event_date in viitor
                 (meciuri care sunt acum in Meciuri, neincepute)
  2. SETTLED  → actualizeaza statusul DOAR pentru intrari deja in snapshot
                 (meciuri care ERAU pending si au primit rezultat)

Regula cheie: niciodata nu adauga meciuri deja terminate care nu au
              trecut prin snapshot ca pending. Asa dispar Copa/Sudamericana
              la 01:00 AM pe care user-ul nu le-a vazut in Meciuri.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR      = Path("data")
LOG_FILE      = DATA_DIR / "recommendation_log.json"
SNAPSHOT_FILE = DATA_DIR / "meciuri_snapshot.json"
START_DATE    = "2026-05-07"   # Ignoram intrari mai vechi de aceasta data

VALID_CATS = {"all", "safe", "o15", "btts", "u35", "value"}
DC_MKTS    = {"dc1x", "dcx2", "dc12"}

KEEP_FIELDS = [
    "log_id", "event_id", "home", "away", "league",
    "event_date", "logged_at", "market_key", "market",
    "odds", "adjusted_prob", "edge_pct", "value",
    "score", "verdict", "risk_tier", "eligible_categories",
    "status", "won", "home_score", "away_score", "settled_at",
]


def ts(raw):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def normalize_status(r):
    st  = str(r.get("status") or "").lower().strip()
    won = r.get("won")
    if st == "win" or won is True:
        return "win"
    if st in ("lose", "loss", "lost") or won is False:
        return "lose"
    hs  = r.get("home_score")
    asy = r.get("away_score")
    mk  = r.get("market_key", "")
    if hs is not None and asy is not None:
        try:
            hs, asy = int(hs), int(asy)
            tot = hs + asy
            table = {
                "over15":  tot > 1, "over25": tot > 2, "under25": tot < 3,
                "under35": tot < 4, "btts":   hs > 0 and asy > 0,
                "homeWin": hs > asy, "awayWin": asy > hs, "draw": hs == asy,
            }
            if mk in table:
                return "win" if table[mk] else "lose"
        except (ValueError, TypeError):
            pass
    return "pending"


def load_snapshot():
    if SNAPSHOT_FILE.exists():
        try:
            return json.loads(SNAPSHOT_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"version": 1, "entries": []}


def build_entry(r, status):
    entry = {}
    for f in KEEP_FIELDS:
        if f in r:
            entry[f] = r[f]
    entry["status"] = status
    cats = [c for c in (r.get("eligible_categories") or []) if c in VALID_CATS]
    if not cats:
        return None
    if "all" not in cats:
        cats.insert(0, "all")
    entry["eligible_categories"] = cats
    return entry


def build_snapshot():
    if not LOG_FILE.exists():
        print("[snapshot] recommendation_log.json nu exista, skip.")
        return

    log  = json.loads(LOG_FILE.read_text(encoding="utf-8"))
    now  = datetime.now(timezone.utc)
    snap = load_snapshot()

    # Index intrari existente in snapshot dupa event_id::market_key
    existing = {}
    for e in snap.get("entries", []):
        key = f"{e.get('event_id','')}::{e.get('market_key','')}"
        existing[key] = e

    added    = 0
    updated  = 0
    skipped  = 0
    new_snap = {}

    for r in log:
        mk = r.get("market_key", "")
        if mk in DC_MKTS:
            skipped += 1
            continue

        cats = r.get("eligible_categories")
        if not cats or not isinstance(cats, list):
            skipped += 1
            continue

        event_date_raw = r.get("event_date", "")
        if event_date_raw[:10] < START_DATE:
            skipped += 1
            continue

        key    = f"{r.get('event_id','')}::{mk}"
        status = normalize_status(r)

        if key in existing:
            # Actualizeaza statusul intrarii deja in snapshot
            old = existing[key].copy()
            old["status"]     = status
            old["home_score"] = r.get("home_score")
            old["away_score"] = r.get("away_score")
            old["settled_at"] = r.get("settled_at")
            old["won"]        = r.get("won")
            new_snap[key]     = old
            updated += 1

        elif status == "pending":
            # Adauga NOU numai daca meciul nu a inceput inca
            ev_dt = ts(event_date_raw)
            if ev_dt is None or ev_dt <= now:
                skipped += 1
                continue
            entry = build_entry(r, "pending")
            if entry is None:
                skipped += 1
                continue
            new_snap[key] = entry
            added += 1

        else:
            # Match deja terminat si nu era in snapshot → ignoram
            skipped += 1

    entries = list(new_snap.values())

    def sort_key(e):
        t = ts(e.get("event_date"))
        return t.timestamp() if t else 0

    entries.sort(key=sort_key)

    # Statistici per categorie
    cats_count = {}
    status_count = {"pending": 0, "win": 0, "lose": 0}
    for e in entries:
        status_count[e["status"]] = status_count.get(e["status"], 0) + 1
        for c in e.get("eligible_categories", []):
            cats_count[c] = cats_count.get(c, 0) + 1

    snapshot = {
        "version":      1,
        "generated_at": now.isoformat(),
        "start_date":   START_DATE,
        "note":         (
            "Snapshot: NUMAI meciuri afisate in Meciuri (pending cand au fost adaugate). "
            "Meciuri deja terminate la momentul primei rulari sunt excluse."
        ),
        "total":   len(entries),
        "entries": entries,
    }

    SNAPSHOT_FILE.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[snapshot] Total: {len(entries)} "
          f"(added={added}, updated={updated}, skipped={skipped})")
    print(f"[snapshot] Status: {status_count}")
    print(f"[snapshot] Per categorie: {cats_count}")
    print(f"[snapshot] Salvat: {SNAPSHOT_FILE}")


if __name__ == "__main__":
    # La prima rulare, stergem snapshot-ul vechi (start curat de azi)
    if SNAPSHOT_FILE.exists():
        old = json.loads(SNAPSHOT_FILE.read_text(encoding="utf-8"))
        if old.get("note", "").startswith("Snapshot generat din recommendation_log"):
            print("[snapshot] Sterg snapshot-ul vechi (format incompatibil)...")
            SNAPSHOT_FILE.unlink()

    build_snapshot()
