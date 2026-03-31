#!/usr/bin/env python3
"""
BetAnalytics Pro V12 - Strict GitHub Actions Data Fetcher

Ce face:
- foloseste BSD API direct
- NU mai foloseste fallback spre alt repo
- daca tokenul lipseste sau API-ul pica, workflow-ul esueaza clar
- astfel nu mai ajungi sa salvezi date false / partiale
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"


def fetch_url(url, use_token=True):
    headers = HEADERS if use_token else {}
    last_error = None

    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=30)

            if r.status_code == 401:
                raise RuntimeError(f"401 Unauthorized pentru {url} - token lipsa sau invalid")
            if r.status_code == 403:
                raise RuntimeError(f"403 Forbidden pentru {url}")
            if r.status_code >= 500:
                raise RuntimeError(f"{r.status_code} Server Error pentru {url}")

            r.raise_for_status()
            return r.json()

        except Exception as e:
            last_error = e
            print(f"Attempt {attempt + 1}/3 failed for {url}: {e}")

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
    os.makedirs("data", exist_ok=True)
    path = f"data/{filename}"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(path)
    print(f"Saved: {path} ({size} bytes)")


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


def fetch_focus_players(team_ids, max_teams=80):
    """
    Limitez numarul de echipe procesate, ca sa nu incarcam prea mult Actions.
    """
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


def build_meta(
    predictions,
    live,
    leagues,
    events,
    teams,
    players_focus,
    started_at,
):
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "live_count": len(live),
        "leagues_count": len(leagues),
        "events_count": len(events),
        "teams_count": len(teams),
        "players_focus_count": len(players_focus),
        "status": "ok",
        "version": "v12",
        "source": "bsd_api_strict",
    }


def main():
    started_at = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V12 Fetch [{started_at.strftime('%Y-%m-%d %H:%M UTC')}] ===")

    if not TOKEN:
        raise SystemExit("ERROR: BSD_TOKEN nu este setat in GitHub Secrets.")

    print("Token detected: OK")

    # 1) Predictions
    print("\n[1/6] Fetching predictions...")
    all_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&upcoming=true")
    print(f"Total predictions: {len(all_predictions)}")

    # Sanity check - daca BSD ar da brusc 0, mai bine fail decat sa stricam datele
    if len(all_predictions) == 0:
        raise RuntimeError("Predictions a venit gol. Oprim workflow-ul ca sa nu suprascriem datele bune.")

    # 2) Live
    print("\n[2/6] Fetching live...")
    all_live = fetch_all_pages(f"/api/live/?tz={TZ}")
    print(f"Total live: {len(all_live)}")

    # 3) Leagues
    print("\n[3/6] Fetching leagues...")
    all_leagues = fetch_all_pages("/api/leagues/")
    print(f"Total leagues: {len(all_leagues)}")

    # 4) Teams
    print("\n[4/6] Fetching teams...")
    all_teams = fetch_all_pages("/api/teams/")
    print(f"Total teams: {len(all_teams)}")

    # 5) Events
    print("\n[5/6] Fetching upcoming events (next 7 days)...")
    today = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=7)).strftime("%Y-%m-%d")
    all_upcoming_events = fetch_all_pages(
        f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted"
    )
    print(f"Total upcoming events: {len(all_upcoming_events)}")

    # 6) Focus players
    print("\n[6/6] Fetching focus players for upcoming matches...")
    focus_team_ids = unique_team_ids_from_events(all_upcoming_events)
    print(f"Focus teams from upcoming events: {len(focus_team_ids)}")
    all_focus_players = fetch_focus_players(focus_team_ids, max_teams=80)
    print(f"Total focus players: {len(all_focus_players)}")

    # Save only after ALL critical fetches succeeded
    save_json(all_predictions, "predictions.json")
    save_json(all_live, "live.json")
    save_json(all_leagues, "leagues.json")
    save_json(all_upcoming_events, "events.json")
    save_json(all_teams, "teams.json")
    save_json(all_focus_players, "players_focus.json")

    meta = build_meta(
        predictions=all_predictions,
        live=all_live,
        leagues=all_leagues,
        events=all_upcoming_events,
        teams=all_teams,
        players_focus=all_focus_players,
        started_at=started_at,
    )
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
