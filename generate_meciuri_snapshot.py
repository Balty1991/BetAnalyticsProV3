#!/usr/bin/env python3
"""
VEYRA — generate_meciuri_snapshot.py V8

Clean history base for the "Istoric Meciuri" tab.

Important:
- The old implementation rebuilt history from recommendation_log / ML output.
- That allowed invisible predictions to appear in history.
- This version creates a clean base file and only settles entries that already
  exist in the visible-history file.
- New history entries are created by assets/historic_meciuri_tracker.js from
  MATCHES_FILTERED_CACHE, i.e. the Meciuri list after filtering.

Outputs:
- data/meciuri_visible_history.json  (new canonical file)
- data/meciuri_snapshot.json         (compatibility alias for old loaders)

Use:
  python generate_meciuri_snapshot.py
  python generate_meciuri_snapshot.py --reset
  python generate_meciuri_snapshot.py --settle-only
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path("data")
CANONICAL_FILE = DATA_DIR / "meciuri_visible_history.json"
COMPAT_FILE = DATA_DIR / "meciuri_snapshot.json"
LOG_FILE = DATA_DIR / "recommendation_log.json"

VERSION = 8
SOURCE = "visible_meciuri_only"

VALID_FINAL = {"win", "lose", "loss", "lost", "void", "push", "cancelled", "canceled"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def normalize_market_key(value: Any) -> str:
    raw = str(value or "").strip().lower()
    compact = (
        raw.replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace(".", "")
        .replace(",", "")
        .replace("ș", "s")
        .replace("ş", "s")
        .replace("ă", "a")
        .replace("â", "a")
        .replace("î", "i")
        .replace("ț", "t")
        .replace("ţ", "t")
    )
    aliases = {
        "over15": "over15",
        "over15g": "over15",
        "o15": "over15",
        "peste15": "over15",
        "over25": "over25",
        "over25g": "over25",
        "o25": "over25",
        "peste25": "over25",
        "under35": "under35",
        "under35g": "under35",
        "u35": "under35",
        "sub35": "under35",
        "under25": "under25",
        "under25g": "under25",
        "u25": "under25",
        "btts": "btts",
        "bttsyes": "btts",
        "gg": "btts",
        "bothteamstoscore": "btts",
        "homewin": "homeWin",
        "home_win": "homeWin",
        "1": "homeWin",
        "draw": "draw",
        "x": "draw",
        "awaywin": "awayWin",
        "away_win": "awayWin",
        "2": "awayWin",
        "dc1x": "dc1x",
        "1x": "dc1x",
        "dcx2": "dcx2",
        "x2": "dcx2",
        "dc12": "dc12",
    }
    if compact in aliases:
        return aliases[compact]
    if "over" in compact and "15" in compact:
        return "over15"
    if "over" in compact and "25" in compact:
        return "over25"
    if "under" in compact and "35" in compact:
        return "under35"
    if "btts" in compact or "both" in compact:
        return "btts"
    return compact


def empty_payload(note: str = "") -> Dict[str, Any]:
    return {
        "version": VERSION,
        "source": SOURCE,
        "generated_at": now_iso(),
        "updated_at": now_iso(),
        "total": 0,
        "entries": [],
        "summary": {
            "total": 0,
            "pending": 0,
            "settled": 0,
            "wins": 0,
            "losses": 0,
            "void": 0,
            "profit_units": 0.0,
            "roi": 0.0,
            "winrate": 0.0,
        },
        "note": note
        or (
            "Bază nouă curată. Nu se populează din recommendation_log sau predicții ML. "
            "Intrările noi sunt capturate în browser din MATCHES_FILTERED_CACHE, adică lista Meciuri după filtrare."
        ),
    }


def status_from_row(row: Dict[str, Any]) -> str:
    raw = str(row.get("status") or row.get("result") or row.get("outcome") or "").lower().strip()
    if row.get("won") is True:
        return "win"
    if row.get("won") is False:
        return "lose"
    if raw in {"win", "won", "green", "success"}:
        return "win"
    if raw in {"lose", "loss", "lost", "red", "failed"}:
        return "lose"
    if raw in {"void", "push", "cancelled", "canceled"}:
        return "void"
    return "pending"


def compute_won(market_key: str, home_score: Any, away_score: Any) -> Optional[bool]:
    try:
        hs = int(home_score)
        aw = int(away_score)
    except Exception:
        return None

    total = hs + aw
    mk = normalize_market_key(market_key)
    table = {
        "over15": total > 1,
        "over25": total > 2,
        "under35": total < 4,
        "under25": total < 3,
        "btts": hs > 0 and aw > 0,
        "homeWin": hs > aw,
        "draw": hs == aw,
        "awayWin": aw > hs,
        "dc1x": hs >= aw,
        "dcx2": aw >= hs,
        "dc12": hs != aw,
    }
    return table.get(mk)


def tracker_key(row: Dict[str, Any]) -> str:
    event_id = str(row.get("event_id") or row.get("id") or "").strip()
    mk = normalize_market_key(row.get("market_key") or row.get("market") or row.get("pick"))
    if event_id and mk:
        return f"{event_id}::{mk}"
    date = str(row.get("event_date") or "")[:10]
    home = str(row.get("home") or row.get("home_team") or "").strip().lower()
    away = str(row.get("away") or row.get("away_team") or "").strip().lower()
    return f"{date}::{home}::{away}::{mk}"


def summarize(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(entries)
    pending = 0
    wins = 0
    losses = 0
    void = 0
    profit = 0.0

    for row in entries:
        st = str(row.get("status") or "pending").lower()
        if st == "win":
            wins += 1
            profit += max(0.0, to_float(row.get("odds")) - 1.0)
        elif st in {"lose", "loss", "lost"}:
            losses += 1
            profit -= 1.0
        elif st == "void":
            void += 1
        else:
            pending += 1

    settled = wins + losses
    return {
        "total": total,
        "pending": pending,
        "settled": settled,
        "wins": wins,
        "losses": losses,
        "void": void,
        "profit_units": round(profit, 3),
        "roi": round((profit / settled) * 100.0, 2) if settled else 0.0,
        "winrate": round((wins / settled) * 100.0, 2) if settled else 0.0,
    }


def load_current_payload() -> Dict[str, Any]:
    payload = load_json(CANONICAL_FILE, None)
    if not isinstance(payload, dict):
        payload = load_json(COMPAT_FILE, None)
    if not isinstance(payload, dict):
        return empty_payload()
    if not isinstance(payload.get("entries"), list):
        payload["entries"] = []
    payload["version"] = VERSION
    payload["source"] = SOURCE
    return payload


def settle_only(payload: Dict[str, Any]) -> Dict[str, Any]:
    entries = payload.get("entries") or []
    if not entries:
        payload["summary"] = summarize([])
        payload["updated_at"] = now_iso()
        return payload

    log_rows = load_json(LOG_FILE, [])
    if not isinstance(log_rows, list):
        log_rows = []

    log_by_key: Dict[str, Dict[str, Any]] = {}
    log_by_event: Dict[str, Dict[str, Any]] = {}

    for row in log_rows:
        if not isinstance(row, dict):
            continue
        eid = str(row.get("event_id") or row.get("id") or "").strip()
        if eid:
            log_by_event[eid] = row
        log_by_key[tracker_key(row)] = row

    changed = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("status") or "pending").lower() in {"win", "lose", "loss", "void"}:
            continue

        key = tracker_key(entry)
        source = log_by_key.get(key)
        if source is None:
            eid = str(entry.get("event_id") or "").strip()
            source = log_by_event.get(eid) if eid else None
        if source is None:
            continue

        status = status_from_row(source)
        if status in {"win", "lose", "void"}:
            entry["status"] = status
            if status == "win":
                entry["won"] = True
                entry["profit_units"] = round(max(0.0, to_float(entry.get("odds")) - 1.0), 3)
            elif status == "lose":
                entry["won"] = False
                entry["profit_units"] = -1.0
            else:
                entry["profit_units"] = 0.0
            changed += 1
        else:
            won = compute_won(entry.get("market_key"), source.get("home_score"), source.get("away_score"))
            if won is None:
                continue
            entry["status"] = "win" if won else "lose"
            entry["won"] = bool(won)
            entry["profit_units"] = round(max(0.0, to_float(entry.get("odds")) - 1.0), 3) if won else -1.0
            changed += 1

        entry["home_score"] = source.get("home_score")
        entry["away_score"] = source.get("away_score")
        entry["settled_at"] = source.get("settled_at") or source.get("updated_at") or now_iso()

    payload["entries"] = entries
    payload["total"] = len(entries)
    payload["summary"] = summarize(entries)
    payload["updated_at"] = now_iso()
    payload["settlement_changed"] = changed
    return payload


def reset() -> Dict[str, Any]:
    payload = empty_payload(
        "Reset complet: istoricul vechi a fost eliminat. De acum se salvează doar ce apare în Meciuri după filtrare."
    )
    save_json(CANONICAL_FILE, payload)
    save_json(COMPAT_FILE, payload)
    return payload


def main() -> None:
    reset_mode = "--reset" in sys.argv
    settle_mode = "--settle-only" in sys.argv

    if reset_mode:
        payload = reset()
    else:
        payload = load_current_payload()
        payload = settle_only(payload)

        # Safety: never create entries from recommendation_log here.
        # This script only maintains an already-visible history base.
        if not settle_mode and payload.get("source") != SOURCE:
            payload = empty_payload()

        save_json(CANONICAL_FILE, payload)
        save_json(COMPAT_FILE, payload)

    print(
        json.dumps(
            {
                "file": str(CANONICAL_FILE),
                "compat_file": str(COMPAT_FILE),
                "source": payload.get("source"),
                "total": payload.get("summary", {}).get("total"),
                "pending": payload.get("summary", {}).get("pending"),
                "settled": payload.get("summary", {}).get("settled"),
                "wins": payload.get("summary", {}).get("wins"),
                "losses": payload.get("summary", {}).get("losses"),
                "roi": payload.get("summary", {}).get("roi"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
