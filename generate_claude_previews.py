#!/usr/bin/env python3
"""
generate_claude_previews.py — Analiză AI structurată (VERDICT/GASIT/CONCLUZIE).

Rulează DUPĂ enrich_predictions.py. Sortează pick-urile după EV% (nu score) pentru
a alinia PICK PRINCIPAL cu recomandarea reală a aplicației. Include H2H + formă.
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


def _get_sorted_picks(markets_enriched):
    """Sortează pick-urile non-Avoid după EV% descrescător.
    EV mai mare → aliniat cu recomandarea aplicației (care prioritizează valoare).
    """
    candidates = []
    for mk, v in (markets_enriched or {}).items():
        if not isinstance(v, dict):
            continue
        if v.get("risk_tier") == "Avoid":
            continue
        ev    = float(v.get("ev_pct") or 0)
        odds  = float(v.get("odds") or 0)
        prob  = float(v.get("prob") or v.get("bsd_prob") or 0)
        edge  = float(v.get("edge_pp") or 0)
        tier  = v.get("risk_tier", "")
        if odds < 1.01 or prob < 0.01:
            continue
        candidates.append({
            "mk": mk, "ev": ev, "odds": odds,
            "prob": prob, "edge": edge, "tier": tier,
        })
    candidates.sort(key=lambda x: x["ev"], reverse=True)
    return candidates


def _build_prompt(home, away, league, xg_home, xg_away,
                  home_form, away_form, is_derby, funfacts,
                  h2h_line, web_context, sorted_picks):
    derby_line = "\nDERBY LOCAL!" if is_derby else ""
    facts_line = ("\nStatistici: " + " | ".join(str(f) for f in funfacts[:2])) if funfacts else ""

    if sorted_picks:
        lines = []
        for i, p in enumerate(sorted_picks[:3]):
            pick_ro = _MARKET_RO.get(p["mk"], p["mk"])
            tag = " [★ PICK PRINCIPAL]" if i == 0 else ""
            tier_tag = f" [{p['tier']}]" if p["tier"] else ""
            lines.append(
                f"  {'→' if i == 0 else '·'} {pick_ro} @ {p['odds']:.2f}"
                f" | prob {round(p['prob']*100)}%"
                f" | EV {p['ev']:+.1f}% | edge {p['edge']:+.1f}pp"
                f"{tier_tag}{tag}"
            )
        picks_block = "\n".join(lines)

        web_section = (f"\nSTIRI WEB:\n{web_context.strip()}"
                       if web_context and len(web_context.strip()) > 20
                       else "\nSTIRI WEB: nicio stire recenta gasita.")

        return (
            f"Esti analist sportiv. Raspunde STRICT in formatul de mai jos, in romana, fara text extra.\n\n"
            f"MECI: {home} vs {away} | {league}{derby_line}\n"
            f"PICK-URI MODEL:\n{picks_block}\n"
            f"DATE STATISTICE: xG {xg_home:.2f}-{xg_away:.2f}"
            f" | forma {home}:[{home_form or '?'}] {away}:[{away_form or '?'}]"
            f"{h2h_line}{facts_line}{web_section}\n\n"
            f"Concentreaza-te pe PICK PRINCIPAL (marcat cu ★).\n"
            f"FORMAT RASPUNS (respecta exact, fara alte cuvinte):\n"
            f"VERDICT: [CONFIRMA / ATENTIE / CONTRAZICE]\n"
            f"GASIT: [1 propozitie — ce spun stirile/H2H/forma despre PICK PRINCIPAL]\n"
            f"CONCLUZIE: [1 propozitie — de ce PICK PRINCIPAL merita sau nu jucat]"
        )
    else:
        web_section = f"\nWeb: {web_context.strip()}" if web_context and len(web_context.strip()) > 20 else ""
        return (
            f"Esti analist sportiv. Scrie 2 propozitii scurte in romana despre acest meci.\n\n"
            f"{home} vs {away} | {league}\n"
            f"xG {xg_home:.2f}-{xg_away:.2f} | forma [{home_form or '?'}] vs [{away_form or '?'}]"
            f"{facts_line}{web_section}\n\n"
            f"Raspunde DOAR cu cele 2 propozitii, fara titluri."
        )


def main():
    print("=== GENERATE CLAUDE PREVIEWS ===")

    if not _ANTHROPIC_AVAILABLE:
        print("[ClaudePreview] Libraria 'anthropic' nu e instalata — skip.")
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[ClaudePreview] ANTHROPIC_API_KEY lipsa — skip.")
        return

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("[ClaudePreview] predictions.json lipsa — skip.")
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
            print("[ClaudePreview] Tavily activ — context web inclus in preview-uri.")
        except Exception as e:
            print(f"[Tavily] Init esuat (non-fatal): {e}")
    else:
        print("[ClaudePreview] Tavily indisponibil — preview fara context web.")

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

        markets_enriched = row.get("markets_enriched") or {}
        sorted_picks = _get_sorted_picks(markets_enriched)

        # Cache key: event_id + pick principal (EV-based) + odds → invalideaza daca pick-ul sau cotele se schimba
        if sorted_picks:
            p0 = sorted_picks[0]
            cache_key = f"{event_id}:{p0['mk']}@{p0['odds']:.2f}"
        else:
            bm = row.get("best_market") or {}
            mk = bm.get("market_key") or bm.get("market") or ""
            cache_key = f"{event_id}:{mk}" if mk else event_id

        if cache_key in claude_cache:
            row["ai_preview"] = claude_cache[cache_key]
            cached_hits += 1
            continue

        try:
            home    = ev.get("home_team") or "Gazda"
            away    = ev.get("away_team") or "Oaspete"
            lg      = ev.get("league") or {}
            league  = lg.get("name") or "Liga necunoscuta"

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

            # H2H context
            h2h_n     = int(float(row.get("supreme_h2h_matches") or 0))
            h2h_btts  = float(row.get("supreme_h2h_btts_rate") or 0)
            h2h_goals = float(row.get("supreme_h2h_avg_goals") or 0)
            h2h_draw  = float(row.get("supreme_h2h_draw_rate") or 0)
            h2h_parts = []
            if h2h_n > 0:
                if h2h_btts > 0:  h2h_parts.append(f"BTTS {round(h2h_btts*100)}%")
                if h2h_goals > 0: h2h_parts.append(f"media {h2h_goals:.1f}g/meci")
                if h2h_draw > 0:  h2h_parts.append(f"egal {round(h2h_draw*100)}%")
            h2h_line = (f"\nH2H ({h2h_n} meciuri): " + " | ".join(h2h_parts)) if h2h_parts else ""

            web_context = ""
            if tavily_client:
                if event_id in tavily_cache:
                    web_context = tavily_cache[event_id]
                else:
                    web_context = _tavily_search(tavily_client, home, away, ev_date_str)
                    tavily_cache[event_id] = web_context
                    tavily_searches += 1

            prompt = _build_prompt(
                home, away, league, xg_home, xg_away,
                home_form, away_form, is_derby, funfacts,
                h2h_line, web_context, sorted_picks,
            )

            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=240,
                messages=[{"role": "user", "content": prompt}],
            )
            preview = msg.content[0].text.strip()[:500]
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
