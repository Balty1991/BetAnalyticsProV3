#!/usr/bin/env python3
"""
generate_claude_previews.py — Analiză AI structurată (VERDICT/GASIT/CONCLUZIE/ALTERNATIVA).

Rulează DUPĂ enrich_predictions.py. Folosește date locale deja existente:
- data/social_news_cache.json  → riscuri accidentați, suspendări, știri
- data/player_profiles_cache.json → calitate lot, jucători cheie, absențe

Fără API extern plătit — zero cost suplimentar față de Claude Haiku.
"""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_DIR = Path("data")
CLAUDE_PREVIEW_CACHE_FILE = DATA_DIR / "claude_preview_cache.json"
PREVIEW_MAX_DAYS = 7
CACHE_FRESH_HOURS = 8   # skip generation if cache younger than this
MAX_NEW_PER_RUN   = 30  # cap API calls per single run

try:
    import anthropic as _anthropic_mod
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

_MARKET_RO = {
    "home_win": "Victorie gazda",   "away_win": "Victorie oaspete",
    "draw":     "Egal",
    "over_15":  "Peste 1.5 goluri", "over_25":  "Peste 2.5 goluri",
    "over_35":  "Peste 3.5 goluri", "under_15": "Sub 1.5 goluri",
    "under_25": "Sub 2.5 goluri",   "under_35": "Sub 3.5 goluri",
    "btts_yes": "Ambele marcheaza",
    "homeWin":  "Victorie gazda",   "awayWin":  "Victorie oaspete",
    "over15":   "Peste 1.5 goluri", "over25":   "Peste 2.5 goluri",
    "over35":   "Peste 3.5 goluri", "btts":     "Ambele marcheaza",
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


def _build_local_context(event_id, social_cache, profiles_cache):
    """Construieste contextul local din cache-urile BSD deja existente."""
    parts = []

    # ─── Social news: riscuri accidentati, suspendari, stiri ──────────────
    soc = (social_cache.get("events") or {}).get(str(event_id)) or {}
    if soc:
        risk_parts = []
        inj = float(soc.get("injury_risk") or 0)
        sus = float(soc.get("suspension_risk") or 0)
        unc = float(soc.get("lineup_uncertainty") or 0)
        mor = float(soc.get("morale_risk") or 0)
        if inj > 0.15: risk_parts.append(f"accidentati {round(inj*100)}%")
        if sus > 0.10: risk_parts.append(f"suspendati {round(sus*100)}%")
        if unc > 0.20: risk_parts.append(f"lot incert {round(unc*100)}%")
        if mor > 0.25: risk_parts.append(f"moral scazut {round(mor*100)}%")
        if risk_parts:
            parts.append("Riscuri: " + " | ".join(risk_parts))

        news_items = soc.get("news_items") or []
        if news_items:
            news_str = " • ".join(str(n) for n in news_items[:3])
            parts.append(f"Stiri: {news_str}")

    # ─── Player profiles: calitate lot, absente, jucatori cheie ───────────
    prof_ev = (profiles_cache.get("events") or {}).get(str(event_id)) or {}
    if prof_ev:
        h_atk  = float(prof_ev.get("home_attack_quality") or 0)
        h_def  = float(prof_ev.get("home_defense_quality") or 0)
        a_atk  = float(prof_ev.get("away_attack_quality") or 0)
        a_def  = float(prof_ev.get("away_defense_quality") or 0)
        if h_atk > 0 or a_atk > 0:
            parts.append(
                f"Calitate lot: atac gazda {h_atk:.0f} | atac oaspete {a_atk:.0f}"
                f" | aparare gazda {h_def:.0f} | aparare oaspete {a_def:.0f}"
            )

        h_miss = float(prof_ev.get("home_missing_atk_quality") or 0)
        a_miss = float(prof_ev.get("away_missing_def_quality") or 0)
        if h_miss > 5:
            parts.append(f"Absente gazda (atac): -{h_miss:.0f} calitate")
        if a_miss > 5:
            parts.append(f"Absente oaspete (aparare): -{a_miss:.0f} calitate")

        players = []
        top_h = prof_ev.get("top_home_player") or {}
        top_a = prof_ev.get("top_away_player") or {}
        if top_h.get("name"):
            r = float(top_h.get("rating") or top_h.get("overall") or 0)
            players.append(f"gazda: {top_h['name']}" + (f" ({r:.1f})" if r > 0 else ""))
        if top_a.get("name"):
            r = float(top_a.get("rating") or top_a.get("overall") or 0)
            players.append(f"oaspete: {top_a['name']}" + (f" ({r:.1f})" if r > 0 else ""))
        if players:
            parts.append("Jucator cheie " + " | ".join(players))

    return "\n".join(parts)


def _build_picks_list(best_market, markets_enriched):
    """
    Construieste lista de pick-uri pentru prompt.
    PICK PRINCIPAL = best_market (setat de enrich_predictions.py, aliniat cu RECOMANDARE din app).
    Alternative = restul pick-urilor non-Avoid sortate dupa edge_pp descrescator.
    """
    bm_key = ""
    picks = []

    if best_market and isinstance(best_market, dict):
        bm_key = str(best_market.get("market_key") or best_market.get("market") or "")
        ev   = float(best_market.get("ev_pct") or 0)
        odds = float(best_market.get("odds") or 0)
        prob = float(best_market.get("prob") or best_market.get("bsd_prob") or 0)
        edge = float(best_market.get("edge_pp") or 0)
        tier = str(best_market.get("risk_tier") or "")
        if bm_key and odds >= 1.01 and prob >= 0.01:
            picks.append({"mk": bm_key, "ev": ev, "odds": odds,
                          "prob": prob, "edge": edge, "tier": tier})

    # Adauga alternative din markets_enriched sortate dupa edge_pp
    alts = []
    for mk, v in (markets_enriched or {}).items():
        if not isinstance(v, dict) or v.get("risk_tier") == "Avoid":
            continue
        if mk == bm_key:
            continue
        odds = float(v.get("odds") or 0)
        prob = float(v.get("prob") or v.get("bsd_prob") or 0)
        if odds < 1.01 or prob < 0.01:
            continue
        alts.append({
            "mk":   mk,
            "ev":   float(v.get("ev_pct") or 0),
            "odds": odds,
            "prob": prob,
            "edge": float(v.get("edge_pp") or 0),
            "tier": str(v.get("risk_tier") or ""),
        })
    alts.sort(key=lambda x: x["edge"], reverse=True)
    picks.extend(alts[:2])

    # Fallback: daca best_market lipsea, sorteaza tot dupa edge_pp
    if not picks:
        for mk, v in (markets_enriched or {}).items():
            if not isinstance(v, dict) or v.get("risk_tier") == "Avoid":
                continue
            odds = float(v.get("odds") or 0)
            prob = float(v.get("prob") or v.get("bsd_prob") or 0)
            if odds < 1.01 or prob < 0.01:
                continue
            picks.append({
                "mk":   mk,
                "ev":   float(v.get("ev_pct") or 0),
                "odds": odds,
                "prob": prob,
                "edge": float(v.get("edge_pp") or 0),
                "tier": str(v.get("risk_tier") or ""),
            })
        picks.sort(key=lambda x: x["edge"], reverse=True)

    return picks


def _build_prompt(home, away, league, xg_home, xg_away,
                  home_form, away_form, is_derby, funfacts,
                  h2h_line, local_context, sorted_picks):
    derby_line = "\nDERBY LOCAL!" if is_derby else ""
    facts_line = ("\nStatistici: " + " | ".join(str(f) for f in funfacts[:2])) if funfacts else ""

    if sorted_picks:
        lines = []
        for i, p in enumerate(sorted_picks[:3]):
            pick_ro = _MARKET_RO.get(p["mk"], p["mk"])
            tag     = " [★ PICK PRINCIPAL]" if i == 0 else ""
            tier_tag = f" [{p['tier']}]" if p["tier"] else ""
            lines.append(
                f"  {'→' if i == 0 else '·'} {pick_ro} @ {p['odds']:.2f}"
                f" | prob {round(p['prob']*100)}%"
                f" | EV {p['ev']:+.1f}% | edge {p['edge']:+.1f}pp"
                f"{tier_tag}{tag}"
            )
        picks_block = "\n".join(lines)

        ctx_section = (f"\nCONTEXT:\n{local_context}"
                       if local_context
                       else "\nCONTEXT: date statistice standard.")

        alt_instruction = (
            "ALTERNATIVA: [daca VERDICT=ATENTIE sau CONTRAZICE: alege UN pick din LISTA DE MAI SUS"
            " (nu inventa piete noi!) + motiv max 8 cuvinte | daca VERDICT=CONFIRMA: NICIUNA]"
        )
        return (
            f"Esti analist sportiv. Raspunde STRICT in formatul de mai jos, in romana, fara text extra.\n\n"
            f"MECI: {home} vs {away} | {league}{derby_line}\n"
            f"PICK-URI MODEL:\n{picks_block}\n"
            f"DATE: xG {xg_home:.2f}-{xg_away:.2f}"
            f" | forma {home}:[{home_form or '?'}] {away}:[{away_form or '?'}]"
            f"{h2h_line}{facts_line}{ctx_section}\n\n"
            f"Concentreaza-te pe PICK PRINCIPAL (marcat cu ★).\n"
            f"IMPORTANT: Foloseste DOAR pick-urile din PICK-URI MODEL de mai sus, nu inventa piete noi.\n"
            f"FORMAT RASPUNS (respecta exact, fara alte cuvinte):\n"
            f"VERDICT: [CONFIRMA / ATENTIE / CONTRAZICE]\n"
            f"GASIT: [1 propozitie — ce indica contextul despre PICK PRINCIPAL]\n"
            f"CONCLUZIE: [1 propozitie — de ce PICK PRINCIPAL merita sau nu jucat]\n"
            f"{alt_instruction}"
        )
    else:
        ctx_section = f"\n{local_context}" if local_context else ""
        return (
            f"Esti analist sportiv. Scrie 2 propozitii scurte in romana despre acest meci.\n\n"
            f"{home} vs {away} | {league}\n"
            f"xG {xg_home:.2f}-{xg_away:.2f} | forma [{home_form or '?'}] vs [{away_form or '?'}]"
            f"{facts_line}{ctx_section}\n\n"
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

    # Sari daca cache-ul e proaspat — evita cheltuieli in update-meciuri (la 30 min)
    if CLAUDE_PREVIEW_CACHE_FILE.exists():
        age_hours = (datetime.now(timezone.utc).timestamp()
                     - CLAUDE_PREVIEW_CACHE_FILE.stat().st_mtime) / 3600
        if age_hours < CACHE_FRESH_HOURS:
            print(f"[ClaudePreview] Cache proaspat ({age_hours:.1f}h < {CACHE_FRESH_HOURS}h) — skip generare.")
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

    # Incarca cache-urile locale (gratuite, deja existente)
    social_cache   = _load_json(DATA_DIR / "social_news_cache.json", {})
    profiles_cache = _load_json(DATA_DIR / "player_profiles_cache.json", {})
    social_events_count   = len((social_cache.get("events") or {}))
    profiles_events_count = len((profiles_cache.get("events") or {}))
    print(f"[ClaudePreview] Context local: {social_events_count} social + {profiles_events_count} profile events")

    now_utc = datetime.now(timezone.utc)
    cutoff  = now_utc + timedelta(days=PREVIEW_MAX_DAYS)

    claude_cache = _load_json(CLAUDE_PREVIEW_CACHE_FILE, {})
    client = _anthropic_mod.Anthropic(api_key=api_key)

    generated = cached_hits = errors = 0

    for row in predictions:
        if generated >= MAX_NEW_PER_RUN:
            print(f"[ClaudePreview] Limita {MAX_NEW_PER_RUN} apeluri/rulare atinsa — stop.")
            break
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

        best_market      = row.get("best_market") or {}
        markets_enriched = row.get("markets_enriched") or {}
        sorted_picks     = _build_picks_list(best_market, markets_enriched)

        # Cache key: best_market (RECOMANDARE din app) + cota — invalideaza la schimbari
        bm_key  = str(best_market.get("market_key") or best_market.get("market") or "")
        bm_odds = float(best_market.get("odds") or 0)
        if bm_key and bm_odds >= 1.01:
            cache_key = f"{event_id}:{bm_key}@{bm_odds:.2f}"
        elif sorted_picks:
            p0 = sorted_picks[0]
            cache_key = f"{event_id}:{p0['mk']}@{p0['odds']:.2f}"
        else:
            cache_key = event_id

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

            h2h_n    = int(float(row.get("supreme_h2h_matches") or 0))
            h2h_btts = float(row.get("supreme_h2h_btts_rate") or 0)
            h2h_goals= float(row.get("supreme_h2h_avg_goals") or 0)
            h2h_draw = float(row.get("supreme_h2h_draw_rate") or 0)
            h2h_parts = []
            if h2h_n > 0:
                if h2h_btts  > 0: h2h_parts.append(f"BTTS {round(h2h_btts*100)}%")
                if h2h_goals > 0: h2h_parts.append(f"media {h2h_goals:.1f}g/meci")
                if h2h_draw  > 0: h2h_parts.append(f"egal {round(h2h_draw*100)}%")
            h2h_line = (f"\nH2H ({h2h_n} meciuri): " + " | ".join(h2h_parts)) if h2h_parts else ""

            local_context = _build_local_context(event_id, social_cache, profiles_cache)

            prompt = _build_prompt(
                home, away, league, xg_home, xg_away,
                home_form, away_form, is_derby, funfacts,
                h2h_line, local_context, sorted_picks,
            )

            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=320,
                messages=[{"role": "user", "content": prompt}],
            )
            preview = msg.content[0].text.strip()[:700]
            row["ai_preview"] = preview
            claude_cache[cache_key] = preview
            generated += 1

        except Exception as e:
            errors += 1
            if errors <= 3:
                print(f"[ClaudePreview] Eroare event {event_id}: {e}")

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
    print(f"[ClaudePreview] Generate: {generated} | Cache: {cached_hits} | Erori: {errors}")


if __name__ == "__main__":
    main()
