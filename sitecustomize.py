#!/usr/bin/env python3
"""
Runtime BSD API v2 compatibility shim.

Python imports sitecustomize automatically when this repository is on sys.path.
That lets the existing fetch/build scripts keep their mature analytics logic while
all BSD HTTP calls are upgraded at the boundary to the documented /api/v2 shape.

Can be disabled with BSD_API_V2_SHIM=0.
"""
from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

if str(os.getenv("BSD_API_V2_SHIM", "1")).lower() not in {"0", "false", "no"}:
    try:
        import requests
    except Exception:  # pragma: no cover
        requests = None
else:
    requests = None

BSD_HOST = "sports.bzzoiro.com"
API_PREFIX = "/api/v2"


def _first(*values):
    for value in values:
        if value is not None:
            return value
    return None


def _pct_complement(value):
    try:
        return max(0.0, min(100.0, 100.0 - float(value)))
    except Exception:
        return None


def _rewrite_url(url: str) -> str:
    parsed = urlparse(str(url))
    if parsed.netloc and parsed.netloc != BSD_HOST:
        return url

    path = parsed.path or ""
    if not path.startswith("/api/") or path.startswith("/api/v"):
        return url

    qs = dict(parse_qsl(parsed.query, keep_blank_values=True))

    # v1 -> v2 query parameter aliases from BSD migration docs.
    if "league" in qs and "league_id" not in qs:
        qs["league_id"] = qs.pop("league")
    if "season" in qs and "season_id" not in qs:
        qs["season_id"] = qs.pop("season")
    if "team" in qs and "team_id" not in qs:
        qs["team_id"] = qs.pop("team")
    if "event" in qs and "event_id" not in qs:
        qs["event_id"] = qs.pop("event")
    if "upcoming" in qs and "status" not in qs:
        upcoming = str(qs.pop("upcoming")).lower()
        qs["status"] = "upcoming" if upcoming in {"1", "true", "yes"} else "past"
    qs.pop("tz", None)  # v2 returns ISO UTC; app already normalizes dates.
    if qs.get("market") == "all":
        qs.pop("market", None)

    # v1 page=N -> v2 limit/offset. Keep explicit limit if present.
    if "page" in qs and "offset" not in qs:
        try:
            page = max(1, int(qs.pop("page")))
            limit = int(qs.get("limit") or 50)
            qs["offset"] = str((page - 1) * limit)
            qs.setdefault("limit", str(limit))
        except Exception:
            qs.pop("page", None)

    # Endpoint path aliases.
    if path == "/api/odds/compare/":
        event_id = qs.pop("event_id", None)
        if event_id:
            path = f"{API_PREFIX}/events/{event_id}/odds/comparison/"
        else:
            path = f"{API_PREFIX}/odds/"
    elif path == "/api/odds/":
        event_id = qs.get("event_id")
        # The old analytics parser expects raw rows; keep /odds/ when possible.
        path = f"{API_PREFIX}/odds/"
        if event_id:
            qs["event_id"] = event_id
    else:
        path = API_PREFIX + path[len("/api"):]

    return urlunparse(parsed._replace(path=path, query=urlencode(qs)))


def _team_obj(event: dict, side: str) -> dict:
    obj = event.get(f"{side}_team_obj")
    if isinstance(obj, dict):
        return obj
    team_id = event.get(f"{side}_team_id")
    team_name = event.get(f"{side}_team") or event.get(side)
    if team_id is None and not team_name:
        return {}
    return {"id": team_id, "api_id": team_id, "name": team_name}


def _normalize_event(event):
    if not isinstance(event, dict):
        return event
    out = dict(event)
    if not isinstance(out.get("league"), dict):
        league_id = out.get("league_id")
        league_name = out.get("league_name") or out.get("league")
        if league_id is not None or league_name:
            out["league"] = {"id": league_id, "api_id": league_id, "name": league_name or "Unknown"}
    out["home_team_obj"] = _team_obj(out, "home")
    out["away_team_obj"] = _team_obj(out, "away")
    if out.get("home_halftime_score") is None and out.get("home_score_ht") is not None:
        out["home_halftime_score"] = out.get("home_score_ht")
    if out.get("away_halftime_score") is None and out.get("away_score_ht") is not None:
        out["away_halftime_score"] = out.get("away_score_ht")
    if isinstance(out.get("odds"), dict):
        out.update(_normalize_odds_fields(out.get("odds")))
    return out


def _normalize_odds_fields(odds):
    if isinstance(odds, dict) and isinstance(odds.get("odds"), dict):
        odds = odds.get("odds")
    if not isinstance(odds, dict):
        return {}
    return {
        "odds_home": _first(odds.get("home_win"), odds.get("home"), odds.get("odds_home")),
        "odds_draw": _first(odds.get("draw"), odds.get("odds_draw")),
        "odds_away": _first(odds.get("away_win"), odds.get("away"), odds.get("odds_away")),
        "odds_over_15": _first(odds.get("over_15_goals"), odds.get("over_15"), odds.get("odds_over_15")),
        "odds_under_15": _first(odds.get("under_15_goals"), odds.get("under_15"), odds.get("odds_under_15")),
        "odds_over_25": _first(odds.get("over_25_goals"), odds.get("over_25"), odds.get("odds_over_25")),
        "odds_under_25": _first(odds.get("under_25_goals"), odds.get("under_25"), odds.get("odds_under_25")),
        "odds_over_35": _first(odds.get("over_35_goals"), odds.get("over_35"), odds.get("odds_over_35")),
        "odds_under_35": _first(odds.get("under_35_goals"), odds.get("under_35"), odds.get("odds_under_35")),
        "odds_btts_yes": _first(odds.get("btts_yes"), odds.get("odds_btts_yes")),
        "odds_btts_no": _first(odds.get("btts_no"), odds.get("odds_btts_no")),
    }


def _normalize_prediction(row):
    if not isinstance(row, dict):
        return row
    out = dict(row)
    event = _normalize_event(out.get("event") or {})
    if event:
        out["event"] = event

    markets = out.get("markets") or {}
    recs = out.get("recommendations") or {}
    model = out.get("model") or {}
    match = markets.get("match_result") or {}
    xg = markets.get("expected_goals") or {}
    ou = markets.get("over_under") or {}
    btts = markets.get("btts") or {}
    score = markets.get("score") or {}

    out.setdefault("prob_home_win", match.get("prob_home"))
    out.setdefault("prob_draw", match.get("prob_draw"))
    out.setdefault("prob_away_win", match.get("prob_away"))
    out.setdefault("predicted_result", match.get("predicted"))
    out.setdefault("expected_home_goals", xg.get("home"))
    out.setdefault("expected_away_goals", xg.get("away"))
    out.setdefault("prob_over_15", ou.get("prob_over_15"))
    out.setdefault("prob_over_25", ou.get("prob_over_25"))
    out.setdefault("prob_over_35", ou.get("prob_over_35"))
    out.setdefault("prob_btts_yes", btts.get("prob_yes"))
    if out.get("prob_btts_no") is None and out.get("prob_btts_yes") is not None:
        out["prob_btts_no"] = _pct_complement(out.get("prob_btts_yes"))
    out.setdefault("most_likely_score", score.get("most_likely"))

    out.setdefault("favorite", recs.get("favorite"))
    out.setdefault("favorite_prob", recs.get("favorite_prob"))
    out.setdefault("favorite_recommend", recs.get("bet_favorite"))
    out.setdefault("over_15_recommend", recs.get("over_15"))
    out.setdefault("over_25_recommend", recs.get("over_25"))
    out.setdefault("over_35_recommend", recs.get("over_35"))
    out.setdefault("btts_recommend", recs.get("btts"))
    out.setdefault("winner_recommend", recs.get("winner"))
    out.setdefault("confidence", model.get("confidence"))
    out.setdefault("model_version", model.get("version"))

    # Promote slim event summary fields expected throughout the legacy engine.
    for key in ("id", "event_date", "status", "home_team", "away_team", "league", "league_name", "home_score", "away_score"):
        if out.get(key) is None and isinstance(event, dict) and event.get(key) is not None:
            out[key] = event.get(key)
    if out.get("event_id") is None and isinstance(event, dict):
        out["event_id"] = event.get("id")
    if out.get("league_name") is None and isinstance(event, dict):
        lg = event.get("league")
        out["league_name"] = event.get("league_name") or (lg.get("name") if isinstance(lg, dict) else lg)
    if out.get("home_team") is None and isinstance(event, dict):
        out["home_team"] = event.get("home_team") or event.get("home")
    if out.get("away_team") is None and isinstance(event, dict):
        out["away_team"] = event.get("away_team") or event.get("away")
    return out


def _normalize_payload(data):
    if isinstance(data, dict):
        out = dict(data)
        if isinstance(out.get("results"), list):
            out["results"] = [_normalize_payload(x) for x in out["results"]]
            return out
        if isinstance(out.get("events"), list):
            out["events"] = [_normalize_event(x) for x in out["events"]]
            return out
        if isinstance(out.get("event"), dict) or isinstance(out.get("markets"), dict) or isinstance(out.get("recommendations"), dict):
            return _normalize_prediction(out)
        if isinstance(out.get("odds"), dict):
            out.update(_normalize_odds_fields(out.get("odds")))
            return out
        if {"home_team", "away_team", "event_date"} & set(out):
            return _normalize_event(out)
        return out
    if isinstance(data, list):
        return [_normalize_payload(x) for x in data]
    return data


if requests is not None:
    _original_request = requests.sessions.Session.request
    _original_json = requests.models.Response.json

    def _patched_request(self, method, url, **kwargs):
        return _original_request(self, method, _rewrite_url(url), **kwargs)

    def _patched_json(self, **kwargs):
        return _normalize_payload(_original_json(self, **kwargs))

    requests.sessions.Session.request = _patched_request
    requests.models.Response.json = _patched_json
