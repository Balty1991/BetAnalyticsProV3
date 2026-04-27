#!/usr/bin/env python3
"""Build data/build_status.json — status pipeline si UI pentru BetAnalytics Pro.

Citeste fisierele din data/ si index.html, calculeaza freshness, conteaza
predictii/meciuri, extrage versiunea UI din ?v= query strings si scrie un
singur fisier de status pe care frontend-ul il poate consuma pentru afisarea
starii datelor (verde/galben/rosu).

Rulare locala:
    python build_status.py

Adaugare in workflow (pro-intelligence.yml, dupa "Build pro intelligence"):
    - name: Build status report
      run: python build_status.py
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DATA_DIR = Path("data")
INDEX_HTML = Path("index.html")
OUT_PATH = DATA_DIR / "build_status.json"

# Praguri pentru semafor freshness (ore)
FRESH_GREEN_HOURS = 6.0
FRESH_YELLOW_HOURS = 24.0


def load_json(path: Path, default: Any = None) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception:
        return default


def file_age_hours(path: Path) -> Optional[float]:
    if not path.exists():
        return None
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    delta = datetime.now(timezone.utc) - mtime
    return round(delta.total_seconds() / 3600.0, 2)


def freshness_tone(hours: Optional[float]) -> str:
    if hours is None:
        return "unknown"
    if hours < FRESH_GREEN_HOURS:
        return "good"
    if hours < FRESH_YELLOW_HOURS:
        return "warn"
    return "bad"


def extract_ui_versions() -> Dict[str, str]:
    """Extrage versiuni din index.html: src/href cu ?v=... pe fisierele din assets/."""
    out: Dict[str, str] = {}
    if not INDEX_HTML.exists():
        return out
    text = INDEX_HTML.read_text(encoding="utf-8", errors="ignore")
    pattern = re.compile(r'(?:src|href)="\./assets/([^"?]+)\?v=([^"]+)"')
    for match in pattern.finditer(text):
        name, version = match.group(1), match.group(2)
        out[name] = version
    return out


def count_list_or_dict(payload: Any, *list_keys: str) -> int:
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for key in list_keys:
            value = payload.get(key)
            if isinstance(value, list):
                return len(value)
        # Fallback: numar cheile dictionarului
        return len(payload)
    return 0


def collect_freshness() -> Tuple[Dict[str, Optional[float]], str]:
    files = {
        "predictions_age_hours": file_age_hours(DATA_DIR / "predictions.json"),
        "events_age_hours": file_age_hours(DATA_DIR / "events.json"),
        "pro_intelligence_age_hours": file_age_hours(DATA_DIR / "pro_intelligence.json"),
        "model_quality_age_hours": file_age_hours(DATA_DIR / "model_quality.json"),
        "backtest_age_hours": file_age_hours(DATA_DIR / "backtest.json"),
    }
    # Freshness global = cea mai recenta dintre predictions si pro_intelligence
    candidates = [v for k, v in files.items() if v is not None and k in (
        "predictions_age_hours", "pro_intelligence_age_hours"
    )]
    overall = min(candidates) if candidates else None
    return files, freshness_tone(overall)


def build_status() -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    # 1. Date principale
    predictions = load_json(DATA_DIR / "predictions.json", []) or []
    events = load_json(DATA_DIR / "events.json", {}) or {}
    leagues = load_json(DATA_DIR / "leagues.json", []) or []

    # 2. Calitate model si pro intelligence
    model_quality = load_json(DATA_DIR / "model_quality.json", {}) or {}
    pro_intel = load_json(DATA_DIR / "pro_intelligence.json", {}) or {}
    backtest = load_json(DATA_DIR / "backtest.json", {}) or {}

    # 3. Counts
    matches_count = count_list_or_dict(events, "data", "events", "matches", "items")
    predictions_count = count_list_or_dict(predictions, "items", "predictions", "data")
    leagues_count = count_list_or_dict(leagues, "data", "leagues", "items")

    # 4. Freshness
    freshness, freshness_overall = collect_freshness()
    if freshness_overall == "bad":
        errors.append(
            f"Date prea vechi (peste {FRESH_YELLOW_HOURS:.0f}h) — verifica workflow-ul fetch."
        )
    elif freshness_overall == "warn":
        warnings.append("Date intre 6 si 24h vechime — actualizare recomandata.")

    # 5. UI versioning
    ui_versions = extract_ui_versions()
    ui_version = (
        ui_versions.get("app.js")
        or ui_versions.get("app.css")
        or "unknown"
    )

    # 6. Validari fisiere critice
    critical = {
        "predictions": DATA_DIR / "predictions.json",
        "events": DATA_DIR / "events.json",
        "model_quality": DATA_DIR / "model_quality.json",
        "pro_intelligence": DATA_DIR / "pro_intelligence.json",
    }
    for label, path in critical.items():
        if not path.exists():
            errors.append(f"Lipseste fisier critic: data/{path.name} ({label})")
        elif path.stat().st_size < 50:
            warnings.append(f"Fisier suspect de mic: {path.name}")

    # 7. Quality summary
    quality_score = (
        model_quality.get("quality_score") if isinstance(model_quality, dict) else None
    )
    quality_grade = (
        model_quality.get("quality_grade") if isinstance(model_quality, dict) else None
    )
    pro_score = (
        pro_intel.get("overall_score") if isinstance(pro_intel, dict) else None
    )

    # 8. Validari logice
    if predictions_count == 0:
        warnings.append("Zero predictii active in data/predictions.json")
    if matches_count == 0:
        warnings.append("Zero meciuri in data/events.json")
    if not backtest:
        warnings.append("backtest.json gol sau lipsa — calibrarea per piata e oarba.")

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "ui_version": ui_version,
        "ui_assets": ui_versions,
        "counts": {
            "matches": matches_count,
            "predictions": predictions_count,
            "leagues": leagues_count,
        },
        "freshness": freshness,
        "freshness_tone": freshness_overall,
        "freshness_thresholds": {
            "green_below_hours": FRESH_GREEN_HOURS,
            "yellow_below_hours": FRESH_YELLOW_HOURS,
        },
        "quality": {
            "model_quality_score": quality_score,
            "model_quality_grade": quality_grade,
            "pro_intelligence_score": pro_score,
            "has_backtest": bool(backtest),
        },
        "warnings": warnings,
        "errors": errors,
        "ok": not errors,
    }


def main() -> None:
    status = build_status()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(
        f"Salvat {OUT_PATH} | ui={status['ui_version']} | "
        f"meciuri={status['counts']['matches']} | "
        f"predictii={status['counts']['predictions']} | "
        f"freshness={status['freshness_tone']} | "
        f"warnings={len(status['warnings'])} | errors={len(status['errors'])}"
    )
    if status["errors"]:
        for e in status["errors"]:
            print(f"  ERROR: {e}")
    if status["warnings"]:
        for w in status["warnings"]:
            print(f"  WARN: {w}")


if __name__ == "__main__":
    main()
