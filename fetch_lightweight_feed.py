#!/usr/bin/env python3
"""Refreshul programat VEYRA cu buget strict de cereri Sports API.

Fiecare execuție poate efectua o singură cerere către endpointul de predicții.
Registrul versionat din ``data/api_request_budget.json`` oprește orice execuție
după primele două cereri UTC din aceeași zi. Fișierele istorice și cache-urile
avansate rămân neschimbate, astfel încât aplicația afișează ultimul set valid
atunci când bugetul este epuizat sau sursa răspunde incomplet.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests


API_BASE = "https://sports.bzzoiro.com/api"
TIMEZONE = "Europe/Bucharest"
DAILY_REQUEST_BUDGET = 2


def load_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)


def daily_state(data_dir: Path, now: datetime) -> tuple[Path, dict[str, Any]]:
    path = data_dir / "api_request_budget.json"
    day = now.date().isoformat()
    current = load_json(path, {})
    if current.get("utcDate") != day:
        current = {
            "utcDate": day,
            "budget": DAILY_REQUEST_BUDGET,
            "requestsUsed": 0,
            "executions": [],
        }
    current["budget"] = DAILY_REQUEST_BUDGET
    current.setdefault("requestsUsed", 0)
    current.setdefault("executions", [])
    return path, current


def refresh(data_dir: Path, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    now = now.astimezone(timezone.utc)
    usage_path, usage = daily_state(data_dir, now)

    if int(usage["requestsUsed"]) >= DAILY_REQUEST_BUDGET:
        save_json(usage_path, usage)
        return {
            "status": "skipped_budget_exhausted",
            "requestsUsed": int(usage["requestsUsed"]),
            "budget": DAILY_REQUEST_BUDGET,
        }

    token = os.environ.get("BSD_TOKEN", "").strip()
    if not token:
        raise RuntimeError("BSD_TOKEN lipsește; refreshul compact nu poate porni.")

    today = now.date().isoformat()
    future = (now + timedelta(days=7)).date().isoformat()
    query = urlencode({
        "tz": TIMEZONE,
        "date_from": today,
        "date_to": future,
        "limit": 200,
    })
    endpoint = f"{API_BASE}/predictions/?{query}"
    result: dict[str, Any] = {
        "at": now.isoformat(),
        "endpoint": "/api/predictions/",
    }

    try:
        response = requests.get(
            endpoint,
            headers={"Authorization": f"Token {token}", "Accept-Language": "ro-RO,ro;q=0.9"},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        predictions = payload.get("results") if isinstance(payload, dict) else payload
        if not isinstance(predictions, list) or not predictions:
            raise ValueError("Răspunsul de predicții nu conține selecții utilizabile.")

        save_json(data_dir / "predictions.json", predictions)
        result.update({"status": "success", "predictions": len(predictions)})
    except Exception as error:  # Cererea a fost consumată chiar și atunci când sursa eșuează.
        result.update({"status": "failed", "error": str(error)})

    usage["requestsUsed"] = int(usage["requestsUsed"]) + 1
    usage["lastUpdatedAt"] = now.isoformat()
    usage["executions"].append(result)
    save_json(usage_path, usage)

    meta_path = data_dir / "meta.json"
    meta = load_json(meta_path, {})
    meta["api_budget"] = {
        "utc_date": usage["utcDate"],
        "budget": DAILY_REQUEST_BUDGET,
        "requests_used": usage["requestsUsed"],
        "last_execution": result,
    }
    if result["status"] == "success":
        meta["updated_at"] = now.isoformat()
        meta["fetched_at"] = now.isoformat()
        meta["predictions_count"] = result["predictions"]
        meta["source"] = "bsd_api_compact_budgeted"
    save_json(meta_path, meta)
    return {**result, "requestsUsed": usage["requestsUsed"], "budget": DAILY_REQUEST_BUDGET}


if __name__ == "__main__":
    output = refresh(Path(os.environ.get("DATA_DIR", "data")))
    print(json.dumps(output, ensure_ascii=False))
