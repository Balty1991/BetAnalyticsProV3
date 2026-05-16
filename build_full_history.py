#!/usr/bin/env python3
import os
from datetime import datetime, timezone, timedelta

from fetch_data import (
    TZ,
    ensure_token,
    fetch_all_pages,
    dedupe_and_filter_predictions,
    build_candidate,
    qualifies_for_strategy,
    rank_candidate,
    load_existing_json,
    save_json,
    build_finished_event_index,
    market_outcome,
    MARKETS,
    STRATEGIES,
)
from build_ai_memory_enhanced import enhance_ai_memory

FULL_HISTORY_LOOKBACK_DAYS = int(os.environ.get("FULL_HISTORY_LOOKBACK_DAYS", str(365 * 2)) or (365 * 2))
FULL_HISTORY_MAX_ROWS = int(os.environ.get("FULL_HISTORY_MAX_ROWS", "60000") or 60000)
FULL_HISTORY_PREDICTION_MAX_AGE_HOURS = int(os.environ.get("FULL_HISTORY_PREDICTION_MAX_AGE_HOURS", str((365 * 2 * 24) + 24)) or ((365 * 2 * 24) + 24))
FULL_HISTORY_SCRIPT_TAG = '<script src="./assets/full-history-hotfix.js?v=20260420hotfix1"></script>'
FULL_HISTORY_SCRIPT_MARKER = 'assets/full-history-hotfix.js?v=20260420hotfix1'


def build_enriched_history_rows(predictions):
    rows = []
    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue
        candidates = [build_candidate(row, m["key"]) for m in MARKETS]
        candidates = [c for c in candidates if c and qualifies_for_strategy(c, STRATEGIES["engine_overall"])]
        if not candidates:
            continue
        pick = max(candidates, key=rank_candidate)
        rows.append({
            "date": pick.get("date"),
            "event_date": pick.get("date"),
            "created_at": pick.get("created_at"),
            "logged_at": pick.get("created_at"),
            "event_id": pick.get("event_id"),
            "prediction_id": pick.get("prediction_id"),
            "home": event.get("home_team"),
            "away": event.get("away_team"),
            "league": pick.get("league"),
            "market": pick.get("market"),
            "market_key": pick.get("market_key"),
            "odds": pick.get("odds"),
            "model_prob": pick.get("prob"),
            "api_prob": pick.get("api_prob"),
            "poisson_prob": pick.get("poisson_prob"),
            "poisson_delta": pick.get("poisson_delta"),
            "poisson_alert": pick.get("poisson_alert"),
            "adjusted_prob": pick.get("adj_prob"),
            "market_prob": pick.get("market_prob"),
            "edge_pct": pick.get("edge_pct"),
            "confidence": pick.get("confidence"),
            "value": pick.get("value"),
            "score": pick.get("score"),
            "verdict": pick.get("verdict"),
            "source_api": pick.get("source_api"),
            "source_heuristic": pick.get("source_heuristic"),
            "status": "win" if pick.get("won") else "lose",
            "won": pick.get("won"),
            "home_score": event.get("home_score"),
            "away_score": event.get("away_score"),
            "settled_at": pick.get("date"),
            "source": "api_backfill",
            "source_kind": "api_backfill",
        })
    rows.sort(key=lambda x: (x.get("event_date") or x.get("date") or "", x.get("event_id") or 0), reverse=True)
    return rows[:FULL_HISTORY_MAX_ROWS]


def make_recommendation_journal_id(row):
    event_id = row.get("event_id")
    market_key = row.get("market_key") or row.get("market") or "na"
    prediction_id = row.get("prediction_id") or "na"
    event_date = row.get("event_date") or row.get("date") or row.get("logged_at") or row.get("created_at") or ""
    if event_id:
        return f"{event_id}::{market_key}::{prediction_id}::{str(event_date)[:10]}"
    home = str(row.get("home") or "").strip().lower()
    away = str(row.get("away") or "").strip().lower()
    return f"{home}::{away}::{market_key}::{str(event_date)[:16]}"


def build_journal_seed_from_history_row(row):
    base = dict(row or {})
    base["journal_id"] = make_recommendation_journal_id(base)
    base["logged_at"] = base.get("logged_at") or base.get("created_at") or base.get("event_date") or base.get("date")
    base["first_logged_at"] = base.get("logged_at")
    base["last_seen_at"] = base.get("logged_at")
    base["opening_odds"] = base.get("odds")
    base["previous_odds"] = base.get("odds")
    base["line_movement_pct"] = 0.0
    base["from_open_pct"] = 0.0
    base["snapshot_count"] = 1
    base["source"] = "api_backfill"
    base["source_kind"] = "api_backfill"
    return base


def build_journal_seed_from_current_row(row):
    base = dict(row or {})
    base["journal_id"] = make_recommendation_journal_id(base)
    base["first_logged_at"] = base.get("first_logged_at") or base.get("logged_at") or base.get("prediction_created_at") or base.get("event_date")
    base["last_seen_at"] = base.get("logged_at") or base.get("prediction_created_at") or base.get("event_date")
    base["opening_odds"] = base.get("opening_odds") if base.get("opening_odds") is not None else base.get("odds")
    base["previous_odds"] = base.get("previous_odds") if base.get("previous_odds") is not None else base.get("odds")
    base["snapshot_count"] = int(base.get("snapshot_count") or 1)
    base["source"] = "journal_live"
    base["source_kind"] = "journal_live"
    return base


def update_recommendation_journal(existing_rows, current_rows, finished_events, settled_at_iso, history_rows=None):
    existing_rows = existing_rows or []
    by_id = {}
    by_event_market = {}

    for row in existing_rows:
        row = dict(row or {})
        row["journal_id"] = row.get("journal_id") or make_recommendation_journal_id(row)
        by_id[row["journal_id"]] = row
        event_id = row.get("event_id")
        market_key = row.get("market_key") or row.get("market")
        if event_id and market_key:
            by_event_market[f"{event_id}::{market_key}"] = row["journal_id"]

    for hist in history_rows or []:
        hist_seed = build_journal_seed_from_history_row(hist)
        event_market_key = None
        if hist_seed.get("event_id") and hist_seed.get("market_key"):
            event_market_key = f"{hist_seed.get('event_id')}::{hist_seed.get('market_key')}"
        if hist_seed["journal_id"] in by_id:
            continue
        if event_market_key and event_market_key in by_event_market:
            continue
        by_id[hist_seed["journal_id"]] = hist_seed
        if event_market_key:
            by_event_market[event_market_key] = hist_seed["journal_id"]

    for row in current_rows or []:
        seed = build_journal_seed_from_current_row(row)
        journal_id = seed["journal_id"]
        existing = by_id.get(journal_id)
        if not existing:
            by_id[journal_id] = seed
            event_market_key = f"{seed.get('event_id')}::{seed.get('market_key')}" if seed.get('event_id') and seed.get('market_key') else None
            if event_market_key:
                by_event_market[event_market_key] = journal_id
            continue

        first_logged_at = existing.get("first_logged_at") or existing.get("logged_at") or seed.get("logged_at")
        previous_odds = existing.get("odds") if existing.get("odds") is not None else seed.get("odds")
        opening_odds = existing.get("opening_odds") if existing.get("opening_odds") is not None else seed.get("odds")
        seed["first_logged_at"] = first_logged_at
        seed["last_seen_at"] = seed.get("logged_at") or existing.get("last_seen_at") or existing.get("logged_at")
        seed["opening_odds"] = opening_odds
        seed["previous_odds"] = previous_odds
        seed["snapshot_count"] = int(existing.get("snapshot_count") or 1) + 1
        try:
            if previous_odds and seed.get("odds"):
                seed["line_movement_pct"] = round(((float(seed.get("odds")) - float(previous_odds)) / float(previous_odds)) * 100.0, 2)
            else:
                seed["line_movement_pct"] = 0.0
            if opening_odds and seed.get("odds"):
                seed["from_open_pct"] = round(((float(seed.get("odds")) - float(opening_odds)) / float(opening_odds)) * 100.0, 2)
            else:
                seed["from_open_pct"] = 0.0
        except Exception:
            seed["line_movement_pct"] = 0.0
            seed["from_open_pct"] = 0.0
        seed["status"] = existing.get("status") or seed.get("status")
        seed["won"] = existing.get("won") if existing.get("won") is not None else seed.get("won")
        seed["home_score"] = existing.get("home_score") if existing.get("home_score") is not None else seed.get("home_score")
        seed["away_score"] = existing.get("away_score") if existing.get("away_score") is not None else seed.get("away_score")
        seed["settled_at"] = existing.get("settled_at") or seed.get("settled_at")
        seed["source"] = existing.get("source") or seed.get("source") or "journal_live"
        seed["source_kind"] = existing.get("source_kind") or seed.get("source_kind") or "journal_live"
        by_id[journal_id] = seed

    for row in by_id.values():
        if row.get("status") in {"win", "lose"}:
            continue
        event = finished_events.get(row.get("event_id"))
        if not event:
            continue
        won = market_outcome(event, row.get("market_key"))
        if won is None:
            continue
        row["status"] = "win" if won else "lose"
        row["won"] = bool(won)
        row["home_score"] = event.get("home_score")
        row["away_score"] = event.get("away_score")
        row["settled_at"] = settled_at_iso

    # Cleanup: intrări pending de >7 zile fără scor → marcate "void"
    # Acestea nu se mai pot settle (API nu le mai returnează) și
    # contaminează datele de învățare AI Memory cu false pending
    now_utc = datetime.now(timezone.utc)
    stale_void_count = 0
    for row in by_id.values():
        if row.get("status") not in (None, "pending"):
            continue
        event_date_str = row.get("event_date") or row.get("date") or ""
        if not event_date_str:
            continue
        try:
            event_dt = datetime.fromisoformat(str(event_date_str).replace("Z", "+00:00"))
            if event_dt.tzinfo is None:
                event_dt = event_dt.replace(tzinfo=timezone.utc)
            hours_since = (now_utc - event_dt.astimezone(timezone.utc)).total_seconds() / 3600
            if hours_since > 168:  # 7 zile = 168 ore
                row["status"] = "void"
                row["settled_at"] = settled_at_iso
                row["void_reason"] = "stale_no_score"
                stale_void_count += 1
        except Exception:
            pass
    if stale_void_count:
        print(f"  Cleanup: {stale_void_count} intrări marcate void (pending >7 zile fără scor)")

    out = list(by_id.values())
    out.sort(
        key=lambda x: (
            x.get("first_logged_at") or x.get("logged_at") or x.get("prediction_created_at") or x.get("event_date") or "",
            x.get("event_id") or 0,
            x.get("prediction_id") or 0,
        ),
        reverse=True,
    )
    return out[:FULL_HISTORY_MAX_ROWS]


def ensure_full_history_script_tag(index_path="index.html"):
    if not os.path.exists(index_path):
        return False
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
    if FULL_HISTORY_SCRIPT_MARKER in html:
        return False
    if "</body>" in html:
        html = html.replace("</body>", f"  {FULL_HISTORY_SCRIPT_TAG}\n</body>", 1)
    elif "</html>" in html:
        html = html.replace("</html>", f"  {FULL_HISTORY_SCRIPT_TAG}\n</html>", 1)
    else:
        html += "\n" + FULL_HISTORY_SCRIPT_TAG + "\n"
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(html)
    return True


def build_lookback_candidates():
    base = [
        FULL_HISTORY_LOOKBACK_DAYS,
        540,
        365,
        270,
        180,
        120,
        90,
        60,
        45,
        30,
        21,
        14,
        7,
    ]
    out = []
    seen = set()
    for days in base:
        try:
            days = int(days)
        except Exception:
            continue
        if days <= 0 or days in seen:
            continue
        out.append(days)
        seen.add(days)
    return out


def fetch_predictions_with_fallback(started_at, today):
    last_error = None
    attempts = []
    for lookback_days in build_lookback_candidates():
        past = (started_at - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        try:
            print(f"Full history fetch attempt: lookback_days={lookback_days} from={past} to={today}")
            predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past}&date_to={today}")
            return predictions, lookback_days, attempts, None
        except Exception as e:
            last_error = str(e)
            attempts.append({"lookback_days": lookback_days, "error": last_error})
            print(f"WARN: full history fetch failed for lookback_days={lookback_days}: {last_error}")
    return [], 0, attempts, last_error


def main():
    ensure_token()
    started_at = datetime.now(timezone.utc)
    today = started_at.strftime("%Y-%m-%d")

    recommendation_log = load_existing_json("ui_picks_log.json", [])
    recommendation_journal = load_existing_json("recommendation_journal.json", [])
    settled_at_iso = datetime.now(timezone.utc).isoformat()

    predictions, effective_lookback_days, fetch_attempts, fetch_error = fetch_predictions_with_fallback(started_at, today)

    if predictions:
        predictions, prep = dedupe_and_filter_predictions(
            predictions,
            now_utc=started_at,
            max_age_hours=FULL_HISTORY_PREDICTION_MAX_AGE_HOURS,
        )
        history_rows = build_enriched_history_rows(predictions)
        finished_events = build_finished_event_index(predictions)
        recommendation_journal = update_recommendation_journal(
            recommendation_journal,
            recommendation_log,
            finished_events,
            settled_at_iso,
            history_rows=history_rows,
        )
        meta = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "status": "ok_partial" if effective_lookback_days and effective_lookback_days < FULL_HISTORY_LOOKBACK_DAYS else "ok",
            "lookback_days": effective_lookback_days or FULL_HISTORY_LOOKBACK_DAYS,
            "lookback_days_requested": FULL_HISTORY_LOOKBACK_DAYS,
            "prediction_rows": len(predictions),
            "history_rows": len(history_rows),
            "journal_rows": len(recommendation_journal),
            "preprocess": prep,
            "fetch_attempts": fetch_attempts,
        }
        if fetch_error and effective_lookback_days and effective_lookback_days < FULL_HISTORY_LOOKBACK_DAYS:
            meta["warning"] = f"Lookback redus automat din cauza erorilor API. Ultima eroare: {fetch_error}"
    else:
        history_rows = []
        finished_events = {}
        recommendation_journal = update_recommendation_journal(
            recommendation_journal,
            recommendation_log,
            finished_events,
            settled_at_iso,
            history_rows=[],
        )
        meta = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "status": "fallback_existing",
            "lookback_days": 0,
            "lookback_days_requested": FULL_HISTORY_LOOKBACK_DAYS,
            "prediction_rows": 0,
            "history_rows": 0,
            "journal_rows": len(recommendation_journal),
            "preprocess": {
                "input_count": 0,
                "kept_count": 0,
                "stale_removed": 0,
                "duplicate_removed": 0,
                "max_age_hours": FULL_HISTORY_PREDICTION_MAX_AGE_HOURS,
            },
            "fetch_error": fetch_error or "unknown error",
            "fetch_attempts": fetch_attempts,
            "warning": "BSD API a răspuns cu erori la backfill-ul istoric. Workflow-ul continuă folosind jurnalul existent.",
        }

    save_json(recommendation_journal, "recommendation_journal.json")
    save_json(meta, "full_history_meta.json")
    index_changed = ensure_full_history_script_tag("index.html")
    enhance_ai_memory()
    print(
        f"Full history built: predictions={len(predictions)} history_rows={len(history_rows)} journal_rows={len(recommendation_journal)} index_changed={index_changed} status={meta.get('status')} lookback={meta.get('lookback_days')}"
    )

if __name__ == "__main__":
    main()
