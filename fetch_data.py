#!/usr/bin/env python3
# status refresh
"""
BetAnalytics Pro V15 - Fetcher + Historical Audit

Scop:
- predictions/events: la fiecare rulare
- leagues/teams/players_focus: refresh rar
- backtest sumar pe istoric recent, folosind predicții BSD + scor final
- fără live în app (stack static)
"""

import os
import json
import math
import requests
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get("BSD_TOKEN", "").strip()
API_BASE = "https://sports.bzzoiro.com"
HEADERS = {"Authorization": f"Token {TOKEN}"}
TZ = "Europe/Bucharest"
DATA_DIR = "data"

STATIC_REFRESH_HOURS = {0, 6, 12, 18}  # UTC
LOOKAHEAD_DAYS = 30
BACKTEST_LOOKBACK_DAYS = 21

MARKETS = [
    {"key": "homeWin", "label": "1", "prob": lambda r: pct(r.get("prob_home_win")), "odds": lambda e: e.get("odds_home")},
    {"key": "draw", "label": "X", "prob": lambda r: pct(r.get("prob_draw")), "odds": lambda e: e.get("odds_draw")},
    {"key": "awayWin", "label": "2", "prob": lambda r: pct(r.get("prob_away_win")), "odds": lambda e: e.get("odds_away")},
    {"key": "over15", "label": "Over 1.5G", "prob": lambda r: pct(r.get("prob_over_15")), "odds": lambda e: e.get("odds_over_15")},
    {"key": "under15", "label": "Under 1.5G", "prob": lambda r: 100 - pct(r.get("prob_over_15")), "odds": lambda e: e.get("odds_under_15")},
    {"key": "over25", "label": "Over 2.5G", "prob": lambda r: pct(r.get("prob_over_25")), "odds": lambda e: e.get("odds_over_25")},
    {"key": "under25", "label": "Under 2.5G", "prob": lambda r: 100 - pct(r.get("prob_over_25")), "odds": lambda e: e.get("odds_under_25")},
    {"key": "over35", "label": "Over 3.5G", "prob": lambda r: pct(r.get("prob_over_35")), "odds": lambda e: e.get("odds_over_35")},
    {"key": "under35", "label": "Under 3.5G", "prob": lambda r: 100 - pct(r.get("prob_over_35")), "odds": lambda e: e.get("odds_under_35")},
    {"key": "btts", "label": "BTTS", "prob": lambda r: pct(r.get("prob_btts_yes")), "odds": lambda e: e.get("odds_btts_yes")},
    {"key": "bttsNo", "label": "BTTS No", "prob": lambda r: 100 - pct(r.get("prob_btts_yes")), "odds": lambda e: e.get("odds_btts_no")},
]


def ensure_token():
    if not TOKEN:
        raise SystemExit("ERROR: BSD_TOKEN nu este setat in GitHub Secrets.")


def pct(v):
    try:
        n = float(v or 0)
    except Exception:
        return 0.0
    if not math.isfinite(n) or n < 0:
        return 0.0
    return 100.0 if n > 100 else n


def normalize_confidence(v):
    try:
        n = float(v or 0)
    except Exception:
        return 0.0
    if not math.isfinite(n) or n < 0:
        return 0.0
    if n <= 1:
        return n * 100
    return 100.0 if n > 100 else n


def calc_value(prob, odds):
    try:
        o = float(odds or 0)
    except Exception:
        return -999.0
    if o < 1.01:
        return -999.0
    return ((pct(prob) / 100.0) * o) - 1.0


def adjusted_prob(prob, confidence):
    p = pct(prob)
    c = normalize_confidence(confidence)
    factor = 0.82 + (c / 100.0) * 0.18
    return round(p * factor, 2)


def ticket_score(adj_prob, value, confidence):
    c = normalize_confidence(confidence)
    prob_score = min(55.0, (pct(adj_prob) / 100.0) * 55.0)
    value_score = min(25.0, max(0.0, value) * 120.0)
    conf_score = min(20.0, (c / 100.0) * 20.0)
    return round(prob_score + value_score + conf_score)


def parse_scoreline(score):
    if not score or not isinstance(score, str) or "-" not in score:
        return None
    try:
        home, away = score.split("-", 1)
        h = int(home)
        a = int(away)
        return {"home": h, "away": a, "total": h + a, "btts": h > 0 and a > 0}
    except Exception:
        return None


def hard_contradiction(row, market_key):
    score = parse_scoreline(row.get("most_likely_score"))
    if not score:
        return False
    if market_key == "over15" and score["total"] < 2:
        return True
    if market_key == "under15" and score["total"] >= 2:
        return True
    if market_key == "over25" and score["total"] < 3:
        return True
    if market_key == "under25" and score["total"] >= 3:
        return True
    if market_key == "over35" and score["total"] < 4:
        return True
    if market_key == "under35" and score["total"] >= 4:
        return True
    if market_key == "btts" and not score["btts"]:
        return True
    if market_key == "bttsNo" and score["btts"]:
        return True
    if market_key == "homeWin" and score["home"] <= score["away"]:
        return True
    if market_key == "awayWin" and score["away"] <= score["home"]:
        return True
    if market_key == "draw" and score["home"] != score["away"]:
        return True
    return False


def market_outcome(event, market_key):
    hs = event.get("home_score")
    aw = event.get("away_score")
    if hs is None or aw is None:
        return None
    total = hs + aw
    if market_key == "homeWin":
        return hs > aw
    if market_key == "draw":
        return hs == aw
    if market_key == "awayWin":
        return aw > hs
    if market_key == "over15":
        return total >= 2
    if market_key == "under15":
        return total <= 1
    if market_key == "over25":
        return total >= 3
    if market_key == "under25":
        return total <= 2
    if market_key == "over35":
        return total >= 4
    if market_key == "under35":
        return total <= 3
    if market_key == "btts":
        return hs > 0 and aw > 0
    if market_key == "bttsNo":
        return hs == 0 or aw == 0
    return None


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


def build_backtest_summary(predictions, lookback_days):
    finished = []
    engine_picks = []

    by_market = {}
    by_league = {}

    def acc_row(store, key):
        if key not in store:
            store[key] = {"key": key, "bets": 0, "wins": 0, "profit": 0.0}
        return store[key]

    for row in predictions or []:
        event = row.get("event") or {}
        if event.get("status") != "finished":
            continue
        if event.get("home_score") is None or event.get("away_score") is None:
            continue

        confidence = normalize_confidence(row.get("confidence") if row.get("confidence") is not None else row.get("favorite_prob"))
        finished.append(row)

        best_pick = None
        best_rank = -1e9

        for market in MARKETS:
            odds = market["odds"](event)
            if odds in (None, ""):
                continue
            prob = market["prob"](row)
            value = calc_value(prob, odds)
            adj = adjusted_prob(prob, confidence)
            if value <= 0:
                continue
            if hard_contradiction(row, market["key"]):
                continue
            if adj < 60 or confidence < 45:
                continue

            score = ticket_score(adj, value, confidence)
            outcome = market_outcome(event, market["key"])
            if outcome is None:
                continue

            pick = {
                "market": market["label"],
                "market_key": market["key"],
                "odds": float(odds),
                "prob": round(prob, 2),
                "adj_prob": round(adj, 2),
                "value": round(value, 4),
                "score": int(score),
                "won": bool(outcome),
                "league": (event.get("league") or {}).get("name") or "Unknown",
            }
            rank = (score * 1.0) + (max(0.0, value) * 100 * 0.35)
            if rank > best_rank:
                best_rank = rank
                best_pick = pick

        if best_pick:
            engine_picks.append(best_pick)
            market_bucket = acc_row(by_market, best_pick["market"])
            league_bucket = acc_row(by_league, best_pick["league"])
            for bucket in (market_bucket, league_bucket):
                bucket["bets"] += 1
                if best_pick["won"]:
                    bucket["wins"] += 1
                    bucket["profit"] += best_pick["odds"] - 1.0
                else:
                    bucket["profit"] -= 1.0

    bets = len(engine_picks)
    wins = sum(1 for x in engine_picks if x["won"])
    profit = sum((x["odds"] - 1.0) if x["won"] else -1.0 for x in engine_picks)
    staked = float(bets)
    roi = (profit / staked * 100.0) if staked else 0.0
    winrate = (wins / bets * 100.0) if bets else 0.0

    def finalize_rows(store):
        out = []
        for row in store.values():
            bets_local = row["bets"] or 0
            roi_local = (row["profit"] / bets_local * 100.0) if bets_local else 0.0
            winrate_local = (row["wins"] / bets_local * 100.0) if bets_local else 0.0
            out.append({
                "key": row["key"],
                "bets": bets_local,
                "wins": row["wins"],
                "profit": round(row["profit"], 3),
                "roi": round(roi_local, 2),
                "winrate": round(winrate_local, 2),
            })
        out.sort(key=lambda x: (x["roi"], x["bets"]), reverse=True)
        return out

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "lookback_days": lookback_days,
        "finished_predictions": len(finished),
        "engine_bets": bets,
        "engine_wins": wins,
        "engine_profit": round(profit, 3),
        "engine_roi": round(roi, 2),
        "engine_winrate": round(winrate, 2),
        "by_market": finalize_rows(by_market)[:12],
        "by_league": finalize_rows(by_league)[:12],
    }


def main():
    ensure_token()
    started_at = datetime.now(timezone.utc)
    print(f"=== BetAnalytics V15 Fetch [{started_at.strftime('%Y-%m-%d %H:%M UTC')}] ===")

    today = started_at.strftime("%Y-%m-%d")
    future = (started_at + timedelta(days=LOOKAHEAD_DAYS)).strftime("%Y-%m-%d")
    past = (started_at - timedelta(days=BACKTEST_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    # FAST DATA - every run
    print(f"\n[1/5] Fetching predictions (next {LOOKAHEAD_DAYS} days)...")
    predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={today}&date_to={future}")
    print(f"Total predictions: {len(predictions)}")
    if not predictions:
        raise RuntimeError("Predictions a venit gol. Oprim workflow-ul.")

    print(f"\n[2/5] Fetching upcoming events (next {LOOKAHEAD_DAYS} days)...")
    events = fetch_all_pages(f"/api/events/?tz={TZ}&date_from={today}&date_to={future}&status=notstarted")
    print(f"Total events: {len(events)}")

    print(f"\n[3/5] Building historical audit (last {BACKTEST_LOOKBACK_DAYS} days)...")
    historical_predictions = fetch_all_pages(f"/api/predictions/?tz={TZ}&date_from={past}&date_to={today}")
    backtest = build_backtest_summary(historical_predictions, BACKTEST_LOOKBACK_DAYS)
    print(f"Finished preds: {backtest['finished_predictions']} | Engine bets: {backtest['engine_bets']} | ROI: {backtest['engine_roi']}%")

    # STATIC-ish DATA - refresh only a few times/day
    refresh_static = should_refresh_static(started_at)
    print(f"\n[4/5] Static refresh window: {'YES' if refresh_static else 'NO'}")

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

    print("\n[5/5] Saving files...")
    save_json(predictions, "predictions.json")
    save_json(events, "events.json")
    save_json(leagues, "leagues.json")
    save_json(teams, "teams.json")
    save_json(players_focus, "players_focus.json")
    save_json(backtest, "backtest.json")

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "started_at": started_at.isoformat(),
        "predictions_count": len(predictions),
        "events_count": len(events),
        "leagues_count": len(leagues),
        "teams_count": len(teams),
        "players_focus_count": len(players_focus),
        "historical_predictions_count": len(historical_predictions),
        "backtest_finished_predictions": backtest["finished_predictions"],
        "backtest_engine_bets": backtest["engine_bets"],
        "backtest_engine_roi": backtest["engine_roi"],
        "status": "ok",
        "version": "v15-audit-engine",
        "timezone": TZ,
        "source": "bsd_api_light",
        "refresh_static": refresh_static,
        "lookahead_days": LOOKAHEAD_DAYS,
        "backtest_lookback_days": BACKTEST_LOOKBACK_DAYS,
    }
    save_json(meta, "meta.json")

    print("\nMeta:")
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    print("=== Done ===")


if __name__ == "__main__":
    main()
