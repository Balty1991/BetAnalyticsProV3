#!/usr/bin/env python3
"""
generate_meciuri_snapshot.py — BetAnalytics Pro V21+

Sursă unică de adevăr pentru Istoric Meciuri.

Logica:
  1. INIT (prima rulare a zilei):
       - Adaugă TOATE meciurile pending + viitoare din recommendation_log
         care au eligible_categories valide
       - Adaugă meciuri O2.5 identificate în signal_audit (dacă lipsesc din log)
       - Setează init_date = astazi  →  ziua este "blocată"

  2. UPDATE (rulări ulterioare din aceeași zi):
       - NU adaugă intrări noi (blochează Copa/Sudamericana de la 01:00 AM)
       - Actualizează statusul DOAR pentru intrări deja existente în snapshot

  3. ZI NOUĂ:
       - init_date se schimbă  →  devine din nou rulare de tip INIT
       - START_DATE se actualizează la data curentă (prin env var sau manual)

Regula cheie: Istoric = 100% ce a apărut în Meciuri. Nimic mai mult.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR      = Path("data")
LOG_FILE      = DATA_DIR / "recommendation_log.json"
SNAPSHOT_FILE = DATA_DIR / "meciuri_snapshot.json"
AUDIT_FILE    = DATA_DIR / "signal_audit.json"

# START_DATE poate fi suprascris din env var START_DATE (pentru GitHub Actions)
START_DATE = os.environ.get("SNAPSHOT_START_DATE", "2026-05-07")

VALID_CATS = {"all", "safe", "o15", "o25", "btts", "u35", "value"}
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
    """Determina statusul real al unui meci din datele disponibile."""
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
                "over15":  tot > 1,
                "over25":  tot > 2,
                "under25": tot < 3,
                "under35": tot < 4,
                "btts":    hs > 0 and asy > 0,
                "homeWin": hs > asy,
                "awayWin": asy > hs,
                "draw":    hs == asy,
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
    return {"version": 2, "entries": [], "init_date": ""}


def build_entry(r, status, extra_cats=None):
    """Construieste o intrare pentru snapshot dintr-un rand din log."""
    entry = {}
    for f in KEEP_FIELDS:
        if f in r:
            entry[f] = r[f]
    entry["status"] = status

    cats = list(r.get("eligible_categories") or [])

    # Adauga categorii suplimentare (ex: o25 din signal_audit)
    if extra_cats:
        for c in extra_cats:
            if c not in cats:
                cats.append(c)

    # Filtreaza doar categorii valide
    cats = [c for c in cats if c in VALID_CATS]

    if not cats:
        return None  # Intrare invalida, nu o includem

    if "all" not in cats:
        cats.insert(0, "all")

    entry["eligible_categories"] = cats
    return entry


def load_signal_audit_o25_ids():
    """
    Citeste signal_audit.json si returneaza set de event_id-uri
    pentru meciuri Over 2.5G (care vor primi categoria 'o25' in snapshot).
    """
    o25_ids = set()
    if not AUDIT_FILE.exists():
        return o25_ids
    try:
        data = json.loads(AUDIT_FILE.read_text(encoding="utf-8"))
        rows = data.get("rows", data.get("entries", []))
        if isinstance(rows, list):
            for r in rows:
                mk = str(r.get("market_key") or "").lower()
                mkt = str(r.get("market") or "").lower()
                if mk == "over25" or "over 2.5" in mkt or "o2.5" in mkt:
                    eid = r.get("event_id")
                    if eid is not None:
                        o25_ids.add(int(eid))
    except Exception as e:
        print(f"[snapshot] Avertisment signal_audit: {e}")
    return o25_ids


def build_snapshot():
    if not LOG_FILE.exists():
        print("[snapshot] recommendation_log.json nu exista, skip.")
        return

    log  = json.loads(LOG_FILE.read_text(encoding="utf-8"))
    now  = datetime.now(timezone.utc)
    snap = load_snapshot()

    today_str = now.strftime("%Y-%m-%d")
    snap_init_date = snap.get("init_date", "")

    # ── DETECTIE TIP RULARE ──────────────────────────────────────────────
    # Daca snapshot-ul a fost deja initializat azi → rulare UPDATE
    # Altfel (zi noua sau prima rulare) → rulare INIT
    is_init_run = (snap_init_date != today_str)

    if is_init_run:
        print(f"[snapshot] Rulare INIT pentru {today_str} "
              f"(anterior: '{snap_init_date}')")
    else:
        print(f"[snapshot] Rulare UPDATE pentru {today_str} "
              f"(snapshot deja initializat azi)")

    # ── EVENT IDs DIN SIGNAL AUDIT (O2.5) ───────────────────────────────
    o25_audit_ids = load_signal_audit_o25_ids()
    if o25_audit_ids:
        print(f"[snapshot] O2.5 din signal_audit: {len(o25_audit_ids)} event_id-uri")

    # ── INDEX SNAPSHOT EXISTENT ──────────────────────────────────────────
    existing = {}
    for e in snap.get("entries", []):
        key = f"{e.get('event_id', '')}::{e.get('market_key', '')}"
        existing[key] = e

    added   = 0
    updated = 0
    skipped = 0
    new_snap = {}

    for r in log:
        mk = r.get("market_key", "")

        # Excludem DC (Double Chance) - nu apar in Meciuri
        if mk in DC_MKTS:
            skipped += 1
            continue

        cats = r.get("eligible_categories")
        if not cats or not isinstance(cats, list):
            skipped += 1
            continue

        event_date_raw = r.get("event_date", "")
        # Ignoram meciuri mai vechi de START_DATE
        if event_date_raw[:10] < START_DATE:
            skipped += 1
            continue

        key    = f"{r.get('event_id', '')}::{mk}"
        status = normalize_status(r)

        # Categorii extra din signal_audit
        extra_cats = []
        eid = r.get("event_id")
        if eid is not None and int(eid) in o25_audit_ids:
            if "o25" not in cats:
                extra_cats.append("o25")

        if key in existing:
            # ── UPDATE: actualizare status + score pentru intrare existenta ──
            old = existing[key].copy()
            old["status"]     = status
            old["home_score"] = r.get("home_score")
            old["away_score"] = r.get("away_score")
            old["settled_at"] = r.get("settled_at")
            old["won"]        = r.get("won")

            # Actualizare categorii (daca s-au adaugat categorii noi din audit)
            if extra_cats:
                existing_cats = old.get("eligible_categories") or []
                for ec in extra_cats:
                    if ec not in existing_cats:
                        existing_cats.append(ec)
                old["eligible_categories"] = existing_cats

            new_snap[key] = old
            updated += 1

        elif status == "pending" and is_init_run:
            # ── INIT ONLY: adauga meciuri noi pending viitoare ──
            # Rulare UPDATE → nu adaugam nimic nou (lock Copa/Sudamericana)
            ev_dt = ts(event_date_raw)
            if ev_dt is None or ev_dt <= now:
                skipped += 1
                continue

            entry = build_entry(r, "pending", extra_cats)
            if entry is None:
                skipped += 1
                continue

            new_snap[key] = entry
            added += 1

        else:
            # Meci terminat negasit in snapshot, sau rulare UPDATE cu meci nou → skip
            skipped += 1

    entries = list(new_snap.values())

    def sort_key(e):
        t = ts(e.get("event_date"))
        return t.timestamp() if t else 0

    entries.sort(key=sort_key)

    # ── STATISTICI ──────────────────────────────────────────────────────
    cats_count   = {}
    status_count = {"pending": 0, "win": 0, "lose": 0}
    for e in entries:
        st = e.get("status", "pending")
        status_count[st] = status_count.get(st, 0) + 1
        for c in e.get("eligible_categories", []):
            cats_count[c] = cats_count.get(c, 0) + 1

    # ── SCRIERE ─────────────────────────────────────────────────────────
    snapshot = {
        "version":      2,
        "generated_at": now.isoformat(),
        "start_date":   START_DATE,
        "init_date":    today_str,   # ← lock: ziua curentă
        "note": (
            "Snapshot V2: NUMAI meciuri afisate in Meciuri. "
            "init_date = ziua blocata (rulari ulterioare nu adauga intrari noi, "
            "doar actualizeaza statusuri). "
            "Categorii: all / safe(Top) / o15 / o25 / btts / u35 / value."
        ),
        "total":   len(entries),
        "entries": entries,
    }

    SNAPSHOT_FILE.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    mode_str = "INIT" if is_init_run else "UPDATE"
    print(f"[snapshot] [{mode_str}] Total: {len(entries)} "
          f"(added={added}, updated={updated}, skipped={skipped})")
    print(f"[snapshot] Status:       {status_count}")
    print(f"[snapshot] Per categorie: {cats_count}")
    print(f"[snapshot] Salvat: {SNAPSHOT_FILE}")


def reset_snapshot():
    """
    Reset complet: sterge snapshot-ul existent si reconstruieste de la zero.
    Folosit manual sau la schimbarea START_DATE.
    """
    if SNAPSHOT_FILE.exists():
        SNAPSHOT_FILE.unlink()
        print("[snapshot] Snapshot vechi sters.")

    # Forteaza rulare INIT
    build_snapshot()


if __name__ == "__main__":
    import sys

    if "--reset" in sys.argv:
        print("[snapshot] Mod RESET: sterg snapshot-ul si reconstruiesc de la zero.")
        reset_snapshot()
    else:
        build_snapshot()
