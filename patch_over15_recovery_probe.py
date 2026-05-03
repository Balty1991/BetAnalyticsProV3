#!/usr/bin/env python3
"""Patch Over 1.5 dynamic thresholds into recovery probe mode.

The benchmark engine can legitimately mark over15 as none_profitable when every
edge bucket is negative. Fully disabling the market creates a data deadlock:
no new over15 signals are collected, so the market cannot prove recovery.

This patch keeps over15 out of normal betting flow unless it passes a strict
15%+ edge probe gate. The frontend runtime adds extra probability/xG/value
filters on top of this threshold.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

DATA_DIR = Path("data")
BENCHMARKS_PATH = DATA_DIR / "model_benchmarks.json"
HISTORY_PATH = DATA_DIR / "threshold_history.json"

PROBE_EDGE = 15.0
PROBE_TARGET_N = 20


def load_json(path: Path, default: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def over15_probe_n(payload: Dict[str, Any]) -> int:
    try:
        return int(
            payload.get("real_backtest", {})
            .get("by_market_bucket", {})
            .get("over15", {})
            .get("15%+", {})
            .get("n", 0)
            or 0
        )
    except Exception:
        return 0


def should_patch(over15_threshold: Dict[str, Any]) -> bool:
    if not over15_threshold:
        return True
    # Keep refreshing already-active probe metadata so the UI never shows undefined.
    if over15_threshold.get("probe_mode") is True:
        return True
    return bool(over15_threshold.get("disabled")) or over15_threshold.get("basis") == "none_profitable"


def append_history(change: Dict[str, Any]) -> List[Dict[str, Any]]:
    history = load_json(HISTORY_PATH, [])
    if not isinstance(history, list):
        history = []

    duplicate = any(
        item.get("market") == change["market"]
        and item.get("type") == change["type"]
        and item.get("new_edge") == change["new_edge"]
        and item.get("message") == change["message"]
        for item in history[-5:]
        if isinstance(item, dict)
    )
    if not duplicate:
        history = (history + [change])[-50:]
        save_json(HISTORY_PATH, history)
    return history


def main() -> None:
    payload = load_json(BENCHMARKS_PATH, {})
    if not isinstance(payload, dict):
        print("Over15 recovery probe: model_benchmarks.json invalid; skipped")
        return

    thresholds = payload.setdefault("dynamic_thresholds", {})
    if not isinstance(thresholds, dict):
        thresholds = {}
        payload["dynamic_thresholds"] = thresholds

    previous = thresholds.get("over15", {}) if isinstance(thresholds.get("over15", {}), dict) else {}
    if not should_patch(previous):
        print("Over15 recovery probe: market has a valid profitable threshold")
        return

    prev_edge = previous.get("prev_edge")
    if prev_edge is None:
        prev_edge = previous.get("min_edge", 999.0)
    now = datetime.now(timezone.utc).isoformat()
    change = {
        "market": "over15",
        "type": "recovery_probe",
        "prev_edge": prev_edge,
        "new_edge": PROBE_EDGE,
        "message": f"over15: recovery probe activ, prag strict = {PROBE_EDGE}%",
        "timestamp": now,
    }

    # Important for the current UI: it reads prev_edge/new_edge directly from
    # dynamic_thresholds.over15 when changed=true. Keep these top-level fields
    # present so the dashboard does not render `undefined%`.
    thresholds["over15"] = {
        "min_edge": PROBE_EDGE,
        "disabled": False,
        "basis": "recovery_probe",
        "roi_at_threshold": None,
        "bootstrap_min_edge": PROBE_EDGE,
        "bootstrap_n": over15_probe_n(payload),
        "bootstrap_target_n": PROBE_TARGET_N,
        "probe_mode": True,
        "recovery_from": "none_profitable",
        "recovery_note": "Piața nu se închide definitiv; permite doar probe Over 1.5 foarte stricte ca să adune eșantion nou.",
        "prev_edge": prev_edge,
        "new_edge": PROBE_EDGE,
        "changed": True,
        "recent_changes": [change],
    }

    embedded_history = payload.get("threshold_history", [])
    if isinstance(embedded_history, list):
        payload["threshold_history"] = (embedded_history + [change])[-10:]

    save_json(BENCHMARKS_PATH, payload)
    append_history(change)
    print(f"Over15 recovery probe: active at edge >= {PROBE_EDGE}%")


if __name__ == "__main__":
    main()
