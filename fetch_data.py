#!/usr/bin/env python3
"""
BetAnalytics Pro V14 - ML API Expanded Fetcher

Scop:
- predictions: la fiecare rulare
- events: la fiecare rulare
- leagues/teams/players_focus: doar la anumite intervale sau daca lipsesc
- fara live (nu mai este folosit in app)
- mai usor pentru GitHub Actions, mai stabil pentru schedule
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC


def ensure_token():
    if not TOKEN:
        raise SystemExit("ERROR: BSD_TOKEN nu este setat in GitHub Secrets.")


def fetch_url(url):
    last_error = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 401:
                raise RuntimeError(f"401 Unauthorized pentru {url}")
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_error = e
            print(f"Attempt {attempt+1}/3 failed for {url}: {e}")
    raise RuntimeError(f"Fetch esuat definitiv pentru {url}: {last_error}")


def fetch_all_pages(endpoint, extra_params=""):
    all_results = []
    next_url = f"{API_BASE}{endpoint}{extra_params}"
    page_count = 0

    while next_url:
        page_count += 1
        print(f"Page {page_count}: {next_url}")
        data = fetch_url(next_url)

        if isinstance(data, list):
            all_results.extend(data)
            break

        if not isinstance(data, dict):
            raise RuntimeError(f"Raspuns invalid pentru {next_url}: {type(data)}")

        results = data.get("results", [])
        all_results.extend(results)
        next_url = data.get("next")
        if next_url and next_url.startswith("http://"):
            next_url = next_url.replace("http://", "https://", 1)

    return all_results


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


def unique_team_ids_from_events(events):
    ids = set()
    for event in events or []:
        home = (event.get("home_team_obj") or {}).get("id")
        away = (event.get("away_team_obj") or {}).get("id")
        if home:
            ids.add(home)
        if away:
            ids.add(away)
    return sorted(ids)


def fetch_focus_players(team_ids, max_teams=60):
    players = []
    seen = set()
    limited_ids = team_ids[:max_teams]
    total = len(limited_ids)

    for idx, team_id in enumerate(limited_ids, start=1):
        print(f"Players for team {team_id} ({idx}/{total})...")
        rows = fetch_all_pages(f"/api/players/?team={team_id}")
        for row in rows:
            pid = row.get("id")
            if pid and pid not in seen:
                seen.add(pid)
                players.append(row)

    return players


def should_refresh_static(now_utc):
    return now_utc.hour in STATIC_REFRESH_HOURS


def main():
    ensure_token()
    started_at = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V13 Light Fetch [{started_at.strftime('%Y-%m-%d %H:%M UTC')}] ===")

    # FAST DATA - every run
    print("\n[1/4] Fetching predictions...")
    predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&upcoming=true")
    print(f"Total predictions: {len(predictions)}")
    if not predictions:
        raise RuntimeError("Predictions a venit gol. Oprim workflow-ul.")

    print("\n[2/4] Fetching upcoming events (next 7 days)...")
    today = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=7)).strftime("%Y-%m-%d")
    events = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")
    print(f"Total events: {len(events)}")

    # STATIC-ish DATA - refresh only a few times/day
    refresh_static = should_refresh_static(started_at)
    print(f"\n[3/4] Static refresh window: {'YES' if refresh_static else 'NO'}")

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "leagues.json")):
        leagues = fetch_all_pages("/api/leagues/")
    else:
        leagues = load_existing_json("leagues.json", [])

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "teams.json")):
        teams = fetch_all_pages("/api/teams/")
    else:
        teams = load_existing_json("teams.json", [])

    if refresh_static or not os.path.exists(os.path.join(DATA_DIR, "players_focus.json")):
        focus_team_ids = unique_team_ids_from_events(events)
        players_focus = fetch_focus_players(focus_team_ids, max_teams=60)
    else:
        players_focus = load_existing_json("players_focus.json", [])

    print(f"Leagues: {len(leagues)} | Teams: {len(teams)} | Players focus: {len(players_focus)}")

    print("\n[4/4] Saving files...")
    save_json(predictions, "predictions.json")
    save_json(events, "events.json")
    save_json(leagues, "leagues.json")
    save_json(teams, "teams.json")
    save_json(players_focus, "players_focus.json")

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "events_count": len(events),
        "leagues_count": len(leagues),
        "teams_count": len(teams),
        "players_focus_count": len(players_focus),
        "status": "ok",
        "version": "v14-ml-expanded",
        "timezone": TZ,
        "source": "bsd_api_light",
        "refresh_static": refresh_static,
    }
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
