#!/usr/bin/env python3
"""
BetAnalytics Pro V11 - GitHub Actions Data Fetcher
Fixes:
- adauga /api/teams/
- adauga /api/players/ doar pentru echipele din meciurile urmatoare (focus players)
- extinde events la urmatoarele 7 zile
- salveaza teams.json si players_focus.json
"""

import os
import json
import requests
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get('BSD_TOKEN', '')
API_BASE = 'https://sports.bzzoiro.com'
HEADERS = {'Authorization': f'Token {TOKEN}'}
TZ = 'Europe/Bucharest'
V1_BASE = 'https://balty1991.github.io/BetAnalyticsPro/data'


def fetch_url(url, use_token=True):
    headers = HEADERS if use_token else {}
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  Attempt {attempt + 1} failed for {url}: {e}")
            if attempt == 2:
                return None
    return None


def fetch_all_pages(endpoint, extra_params=''):
    all_results = []
    next_url = f"{API_BASE}{endpoint}{extra_params}"
    page_count = 0
    while next_url:
        page_count += 1
        print(f"  Page {page_count}: {next_url}")
        data = fetch_url(next_url)
        if not data:
            break
        if isinstance(data, list):
            all_results.extend(data)
            break
        results = data.get('results', [])
        all_results.extend(results)
        next_url = data.get('next')
        if next_url and next_url.startswith('http://'):
            next_url = next_url.replace('http://', 'https://', 1)
    return all_results


def fetch_from_v1(filename):
    url = f"{V1_BASE}/{filename}?t={int(datetime.now().timestamp())}"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        print(f"  Fallback V1 OK: {url}")
        return r.json()
    except Exception as e:
        print(f"  Fallback V1 FAIL: {e}")
        return None


def save_json(data, filename):
    os.makedirs('data', exist_ok=True)
    path = f'data/{filename}'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(path)
    print(f"  Salvat: {path} ({size} bytes)")


def unique_team_ids_from_events(events):
    ids = set()
    for event in events or []:
        home = (event.get('home_team_obj') or {}).get('id')
        away = (event.get('away_team_obj') or {}).get('id')
        if home:
            ids.add(home)
        if away:
            ids.add(away)
    return sorted(ids)


def fetch_focus_players(team_ids):
    players = []
    seen = set()
    total = len(team_ids)
    for idx, team_id in enumerate(team_ids, start=1):
        print(f"  Players for team {team_id} ({idx}/{total})...")
        rows = fetch_all_pages(f'/api/players/?team={team_id}')
        for row in rows:
            pid = row.get('id')
            if pid and pid not in seen:
                seen.add(pid)
                players.append(row)
    return players


def main():
    now_utc = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V11 Fetch [{now_utc.strftime('%Y-%m-%d %H:%M UTC')}] ===")

    all_predictions = []
    all_live = []
    all_leagues = []
    all_upcoming_events = []
    all_teams = []
    all_focus_players = []

    if TOKEN:
        print("\n[1/6] Fetching predictions...")
        all_predictions = fetch_all_pages(f'/api/predictions/?tz={TZ}&upcoming=true')
        print(f"  Total predictions: {len(all_predictions)}")

        print("\n[2/6] Fetching live...")
        all_live = fetch_all_pages(f'/api/live/?tz={TZ}')
        print(f"  Total live: {len(all_live)}")

        print("\n[3/6] Fetching leagues...")
        all_leagues = fetch_all_pages('/api/leagues/')
        print(f"  Total leagues: {len(all_leagues)}")

        print("\n[4/6] Fetching teams...")
        all_teams = fetch_all_pages('/api/teams/')
        print(f"  Total teams: {len(all_teams)}")

        print("\n[5/6] Fetching upcoming events (next 7 days)...")
        today = now_utc.strftime('%Y-%m-%d')
        future = (now_utc + timedelta(days=7)).strftime('%Y-%m-%d')
        all_upcoming_events = fetch_all_pages(
            f'/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted'
        )
        print(f"  Total upcoming events: {len(all_upcoming_events)}")

        print("\n[6/6] Fetching focus players for upcoming matches...")
        focus_team_ids = unique_team_ids_from_events(all_upcoming_events)
        print(f"  Focus teams from upcoming events: {len(focus_team_ids)}")
        all_focus_players = fetch_focus_players(focus_team_ids)
        print(f"  Total focus players: {len(all_focus_players)}")

    else:
        print('WARN: BSD_TOKEN nu este setat - folosim fallback V1 pentru fisierele principale')

    if not all_predictions:
        print('Fallback: citire predictions din V1...')
        v1_data = fetch_from_v1('predictions.json')
        if v1_data:
            all_predictions = v1_data.get('results', v1_data) if isinstance(v1_data, (dict, list)) else []

    if not all_live:
        print('Fallback: citire live din V1...')
        v1_live = fetch_from_v1('live.json')
        if v1_live:
            all_live = v1_live.get('results', v1_live) if isinstance(v1_live, (dict, list)) else []

    save_json(all_predictions, 'predictions.json')
    save_json(all_live, 'live.json')
    save_json(all_leagues, 'leagues.json')
    save_json(all_upcoming_events, 'events.json')
    save_json(all_teams, 'teams.json')
    save_json(all_focus_players, 'players_focus.json')

    meta = {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'predictions_count': len(all_predictions),
        'live_count': len(all_live),
        'leagues_count': len(all_leagues),
        'events_count': len(all_upcoming_events),
        'teams_count': len(all_teams),
        'players_focus_count': len(all_focus_players),
        'status': 'ok',
        'version': 'v11'
    }
    save_json(meta, 'meta.json')
    print(f"\nMeta: {meta}")
    print('=== Done ===')


if __name__ == '__main__':
    main()
