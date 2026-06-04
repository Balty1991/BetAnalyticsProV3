#!/usr/bin/env python3
"""
generate_claude_previews.py — Analiză AI structurată (VERDICT/GĂSIT/CONCLUZIE).

Rulează DUPĂ enrich_predictions.py care setează markets_enriched + best_market.
Trimite Claude TOP 3 pick-uri (nu doar best_market) + context Tavily web,
astfel încât verdictul să acopere recomandarea reală a aplicației.
"""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_DIR = Path("data")
CLAUDE_PREVIEW_CACHE_FILE = DATA_DIR / "claude_preview_cache.json"
TAVILY_SEARCH_CACHE_FILE  = DATA_DIR / "tavily_search_cache.json"
PREVIEW_MAX_DAYS = 7

try:
    import anthropic as _anthropic_mod
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

try:
    from tavily import TavilyClient as _TavilyClient
    _TAVILY_AVAILABLE = True
except ImportError:
    _TAVILY_AVAILABLE = False

_MARKET_RO = {
    "home_win": "Victorie gazdă",   "away_win": "Victorie oaspete",
    "draw":     "Egal",
    "over_15":  "Peste 1.5 goluri", "over_25":  "Peste 2.5 goluri",
    "over_35":  "Peste 3.5 goluri", "under_15": "Sub 1.5 goluri",
    "under_25": "Sub 2.5 goluri",   "under_35": "Sub 3.5 goluri",
    "btts_yes": "Ambele marchează",
    "homeWin":  "Victorie gazdă",   "awayWin":  "Victorie oaspete",
    "over15":   "Peste 1.5 goluri", "over25":   "Peste 2.5 goluri",
    "over35":   "Peste 3.5 goluri", "btts":     "Ambele marchează",
}


def _load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _save_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def _save_cache(path, cache):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Cache] Eroare salvare {path}: {e}")


def _tavily_search(client, home, away, event_date):
    try:
        month_year = ""
        try:
            dt = datetime.fromisoformat(event_date.replace("Z", "+00:00"))
            month_year = dt.strftime("%B %Y")
        except Exception:
            pass
        query = f"{home} vs {away} preview team news injury lineup {month_year}".strip()
        result = client.search(query=query, search_depth="basic", max_results=3, include_answer=False)
        snippets = []
        for r in (result.get("results") or [])[:3]:
            title   = (r.get("title") or "").strip()
            content = (r.get("content") or "").strip()[:200]
            if content:
                snippets.append(f"• {title}: {content}")
        return "\n".join(snippets)
    except Exception:
        return ""


def _build_picks_text(markets_enriched, bm):
    """Construieste lista de pick-uri top 3 non-Avoid pentru prompt."""
    candidates = []
    for mk, v in (markets_enriched or {}).items():
        if not isinstance(v, dict):
            continue
        tier = v.get("risk_tier", "Avoid")
        score = float(v.get("score") or 0)
        candidates.append((score, mk, v))
    candidates.sort(reverse=True)

    lines = []
    for _, mk, v in candidates[:3]:
        pick_ro = _MARKET_RO.get(mk, mk)
        odds    = float(v.get("odds") or 0)
        prob    = float(v.get("prob") or v.get("bsd_prob") or 0)
        ev      = float(v.get("ev_pct") or 0)
        edge    = float(v.get("edge_pp") or 0)
        tier    = v.get("risk_tier", "")
        tier_tag = f" [{tier}]" if tier and tier != "Avoid" else ""
        lines.append(
            f"  • {pick_ro} @ {odds:.2f} | prob {round(prob*100)}%"
            f" | EV {ev:+.1f}% | edge {edge:+.1f}pp{tier_tag}"
        )

    if not lines and bm:
        mk = bm.get("market_key") or bm.get("market") or ""
        pick_ro = _MARKET_RO.get(mk, mk)
        lines.append(
            f"  • {pick_ro} @ {float(bm.get('odds') or 0):.2f}"
            f" | prob {round(float(bm.get('prob') or 0)*100)}%"
            f" | EV {float(bm.get('ev_pct') or 0):+.1f}%"
            f" | edge {float(bm.get('edge_pp') or 0):+.1f}pp"
        )
    return "\n".join(lines)


def _generate_preview(client, home, away, league,
                      xg_home, xg_away, home_form, away_form,
                      is_derby, funfacts, web_context,
                      picks_text):
    derby_line = "\nDERBY LOCAL!" if is_derby else ""
    facts_line = ("\nStatistici: " + " | ".join(str(f) for f in funfacts[:2])) if funfacts else ""

    if picks_text:
        web_section = (f"\nȘTIRI WEB:\n{web_context.strip()}"
                       if web_context and len(web_context.strip()) > 20
                       else "\nȘTIRI WEB: nicio știre relevantă găsită.")
        prompt = (
            f"Ești analist sportiv. Răspunde STRICT în formatul de mai jos, în română, fără text extra.\n\n"
            f"MECI: {home} vs {away} | {league}{derby_line}\n"
            f"PICK-URI MODEL (evaluează toate):\n{picks_text}\n"
            f"DATE: xG {xg_home:.2f}–{xg_away:.2f} | "
            f"formă {home}:[{home_form or '?'}] {away}:[{away_form or '?'}]"
            f"{facts_line}{web_section}\n\n"
            f"FORMAT RĂSPUNS (respectă exact, fără alte cuvinte):\n"
            f"VERDICT: [CONFIRMĂ / ATENȚIE / CONTRAZICE]\n"
            f"GĂSIT: [1 propoziție — ce informații relevante ai găsit pe web despre acest meci]\n"
            f"CONCLUZIE: [1 propoziție — care pick e cel mai susținut de date și de ce]"
        )
    else:
        web_section = f"\nWeb: {web_context.strip()}" if web_context and len(web_context.strip()) > 20 else ""
        prompt = (
            f"Ești analist sportiv. Scrie 2 propoziții scurte în română despre acest meci.\n\n"
            f"{home} vs {away} | {league}\n"
            f"xG {xg_home:.2f}–{xg_away:.2f} | formă [{home_form or '?'}] vs [{away_form or '?'}]"
            f"{facts_line}{web_section}\n\n"
            f"Răspunde DOAR cu cele 2 propoziții, fără titluri."
        )

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=220,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()[:500]


def main():
    print("=== GENERATE CLAUDE PREVIEWS ===")

    if not _ANTHROPIC_AVAILABLE:
        print("[ClaudePreview] Librăria 'anthropic' nu e instalată — skip.")
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[ClaudePreview] ANTHROPIC_API_KEY lipsă — skip.")
        return

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("[ClaudePreview] predictions.json lipsă — skip.")
        return

    raw = _load_json(pred_path, [])
    if isinstance(raw, list):
        predictions = raw
    else:
        predictions = (raw.get("predictions") or raw.get("results")
                       or raw.get("events") or list(raw.values()))

    now_utc = datetime.now(timezone.utc)
    cutoff  = now_utc + timedelta(days=PREVIEW_MAX_DAYS)

    claude_cache = _load_json(CLAUDE_PREVIEW_CACHE_FILE, {})
    tavily_cache = _load_json(TAVILY_SEARCH_CACHE_FILE, {})

    client = _anthropic_mod.Anthropic(api_key=api_key)

    tavily_client = None
    tavily_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if _TAVILY_AVAILABLE and tavily_key:
        try:
            tavily_client = _TavilyClient(api_key=tavily_key)
            print("[ClaudePreview] Tavily activ — context web inclus în preview-uri.")
        except Exception as e:
            print(f"[Tavily] Init eșuat (non-fatal): {e}")
    else:
        print("[ClaudePreview] Tavily indisponibil — preview fără context web.")

    generated = cached_hits = tavily_searches = errors = 0

    for row in predictions:
        ev = row.get("event") or {}
        if ev.get("status") != "notstarted":
            continue

        event_id = str(ev.get("id") or "")
        if not event_id:
            continue

        ev_date_str = ev.get("event_date") or ""
        try:
            ev_dt = datetime.fromisoformat(ev_date_str.replace("Z", "+00:00"))
            if ev_dt > cutoff:
                continue
        except Exception:
            continue

        # Cache key: event_id + top markets sorted → regenerăm dacă pick-urile se schimbă
        bm = row.get("best_market") or {}
        markets_enriched = row.get("markets_enriched") or {}
        non_avoid = sorted(
            [(float(v.get("score") or 0), mk) for mk, v in markets_enriched.items()
             if isinstance(v, dict) and v.get("risk_tier") != "Avoid"],
            reverse=True
        )
        top_keys = "+".join(mk for _, mk in non_avoid[:3])
        cache_key = f"{event_id}:{top_keys}" if top_keys else event_id

        if cache_key in claude_cache:
            row["ai_preview"] = claude_cache[cache_key]
            cached_hits += 1
            continue

        try:
            home    = ev.get("home_team") or "Gazdă"
            away    = ev.get("away_team") or "Oaspete"
            lg      = ev.get("league") or {}
            league  = lg.get("name") or "Ligă necunoscută"

            xg_home   = float(row.get("expected_home_goals") or 1.2)
            xg_away   = float(row.get("expected_away_goals") or 1.0)
            home_form = (row.get("supreme_home_form_string")
                         or row.get("home_form_string") or "")
            away_form = (row.get("supreme_away_form_string")
                         or row.get("away_form_string") or "")
            is_derby  = bool(row.get("supreme_is_local_derby")
                             or row.get("is_local_derby")
                             or ev.get("is_local_derby"))
            funfacts  = row.get("funfacts") or []

            picks_text = _build_picks_text(markets_enriched, bm)

            web_context = ""
            if tavily_client:
                if event_id in tavily_cache:
                    web_context = tavily_cache[event_id]
                else:
                    web_context = _tavily_search(tavily_client, home, away, ev_date_str)
                    tavily_cache[event_id] = web_context
                    tavily_searches += 1

            preview = _generate_preview(
                client, home, away, league,
                xg_home, xg_away, home_form, away_form,
                is_derby, funfacts, web_context,
                picks_text,
            )
            row["ai_preview"] = preview
            claude_cache[cache_key] = preview
            generated += 1

        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"[ClaudePreview] Eroare event {event_id}: {e}")

    # Salvare predictions.json cu ai_preview actualizat
    if isinstance(raw, list):
        _save_json(pred_path, predictions)
    else:
        wk = next((k for k in ("predictions", "results", "events") if k in raw), None)
        if wk:
            raw[wk] = predictions
            _save_json(pred_path, raw)
        else:
            _save_json(pred_path, predictions)

    _save_cache(CLAUDE_PREVIEW_CACHE_FILE, claude_cache)
    if tavily_searches > 0 or tavily_client:
        _save_cache(TAVILY_SEARCH_CACHE_FILE, tavily_cache)

    print(f"[ClaudePreview] Generate: {generated} | Cache: {cached_hits} | "
          f"Tavily: {tavily_searches} | Erori: {errors}")


if __name__ == "__main__":
    main()
