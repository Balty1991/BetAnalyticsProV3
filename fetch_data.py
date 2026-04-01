#!/usr/bin/env python3
"""
BetAnalytics Pro V15 - Resilient Fetcher
- Improved retry logic with exponential backoff
- Detailed error reporting for meta.json
- Robust handling of API timeouts and empty responses
"""

import os
import json
import requests
import time
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC

def ensure_token():
    if not TOKEN:
        print("CRITICAL ERROR: BSD_TOKEN is missing from environment.")
        return False
    return True

def fetch_url(url):
    last_error = None
    # Increased retries to 5 with backoff
    for attempt in range(5):
        try:
            # Added a small delay between retries
            if attempt > 0:
                sleep_time = 2 ** attempt
                print(f"Waiting {sleep_time}s before retry...")
                time.sleep(sleep_time)
                
            r = requests.get(url, headers=HEADERS, timeout=45) # Increased timeout
            
            if r.status_code == 401:
                return {"error": "Unauthorized", "status_code": 401}
            
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_error = e
            print(f"Attempt {attempt+1}/5 failed for {url}: {e}")
            
    return {"error": str(last_error), "status_code": 500}

def fetch_all_pages(endpoint, extra_params=""):
    all_results = []
    next_url = f"{API_BASE}{endpoint}{extra_params}"
    page_count = 0

    while next_url:
        page_count += 1
        print(f"Page {page_count}: {next_url}")
        data = fetch_url(next_url)

        if isinstance(data, dict) and "error" in data:
            print(f"Error fetching {next_url}: {data['error']}")
            return all_results, data["error"]

        if isinstance(data, list):
            all_results.extend(data)
            break

        results = data.get("results", [])
        all_results.extend(results)
        next_url = data.get("next")
        if next_url and next_url.startswith("http://"):
            next_url = next_url.replace("http://", "https://", 1)

    return all_results, None

def save_json(data, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Saved: {path} ({os.path.getsize(path)} bytes)")

def load_existing_json(filename, default):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def main():
    started_at = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V15 Resilient Fetch [{started_at.strftime('%Y-%m-%d %H:%M UTC')}] ===")
    
    if not ensure_token():
        meta = {"status": "error", "error": "Missing BSD_TOKEN", "updated_at": started_at.isoformat()}
        save_json(meta, "meta.json")
        return

    # 1. Predictions
    print("\n[1/4] Fetching predictions...")
    predictions, err = fetch_all_pages(f"/api/predictions/?tz={TZ}&upcoming=true")
    if err:
        meta = {"status": "error", "error": f"Predictions API error: {err}", "updated_at": started_at.isoformat()}
        save_json(meta, "meta.json")
        print(f"Aborting due to API error: {err}")
        return

    if not predictions:
        print("Warning: Predictions list is empty.")

    # 2. Events
    print("\n[2/4] Fetching upcoming events...")
    today = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=7)).strftime("%Y-%m-%d")
    events, _ = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")

    # 3. Static Data
    refresh_static = started_at.hour in STATIC_REFRESH_HOURS or not os.path.exists(os.path.join(DATA_DIR, "leagues.json"))
    
    if refresh_static:
        print("\n[3/4] Refreshing static data (leagues/teams)...")
        leagues, _ = fetch_all_pages("/api/leagues/")
        teams, _ = fetch_all_pages("/api/teams/")
    else:
        print("\n[3/4] Using cached static data.")
        leagues = load_existing_json("leagues.json", [])
        teams = load_existing_json("teams.json", [])

    # 4. Save & Meta
    print("\n[4/4] Saving files...")
    save_json(predictions, "predictions.json")
    save_json(events, "events.json")
    save_json(leagues, "leagues.json")
    save_json(teams, "teams.json")

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "events_count": len(events),
        "status": "ok",
        "version": "v15-resilient",
        "timezone": TZ
    }
    save_json(meta, "meta.json")
    print("\nFetch completed successfully.")

if __name__ == "__main__":
    main()
