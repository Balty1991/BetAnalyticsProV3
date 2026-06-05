#!/usr/bin/env python3
"""
generate_claude_previews.py — Analiză AI v4: Claude alege singur cel mai bun pariu.

Rulează DUPĂ enrich_predictions.py.
Claude primeste TOP 3 piete cu edge pozitiv (sortate edge×prob) si alege singur
cel mai bun pariu pe baza datelor statistice disponibile.

Format raspuns: PICK / VERDICT / MOTIV / RISC
Cache key: {event_id}:v4:{top1_market}@{odds}
"""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_DIR = Path("data")
CLAUDE_PREVIEW_CACHE_FILE = DATA_DIR / "claude_preview_cache_v4.json"
PREVIEW_MAX_DAYS = 7
CACHE_FRESH_HOURS = 8
MAX_NEW_PER_RUN   = 30

try:
    import anthropic as _anthropic_mod
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

_MARKET_RO = {
    "home_win":        "Victorie gazda",
    "away_win":        "Victorie oaspete",
    "draw":            "Egal",
    "over_15":         "Peste 1.5 goluri",
    "over_25":         "Peste 2.5 goluri",
    "over_35":         "Peste 3.5 goluri",
    "under_15":        "Sub 1.5 goluri",
    "under_25":        "Sub 2.5 goluri",
    "under_35":        "Sub 3.5 goluri",
    "btts_yes":        "Ambele marcheaza",
    "double_chance_1x":"Sansa dubla 1X",
    "double_chance_x2":"Sansa dubla X2",
    "double_chance_12":"Sansa dubla 12",
    "homeWin":         "Victorie gazda",
    "awayWin":         "Victorie oaspete",
    "over15":          "Peste 1.5 goluri",
    "over25":          "Peste 2.5 goluri",
    "over35":          "Peste 3.5 goluri",
    "btts":            "Ambele marcheaza",
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
    parts = []
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
            parts.append("Stiri: " + " • ".join(str(n) for n in news_items[:2]))

    prof_ev = (profiles_cache.get("events") or {}).get(str(event_id)) or {}
    if prof_ev:
        h_atk = float(prof_ev.get("home_attack_quality") or 0)
        a_atk = float(prof_ev.get("away_attack_quality") or 0)
        h_def = float(prof_ev.get("home_defense_quality") or 0)
        a_def = float(prof_ev.get("away_defense_quality") or 0)
        if h_atk > 0 or a_atk > 0:
            parts.append(
                f"Calitate: atac gazda {h_atk:.0f} | atac oaspete {a_atk:.0f}"
                f" | aparare gazda {h_def:.0f} | aparare oaspete {a_def:.0f}"
            )
        h_miss = float(prof_ev.get("home_missing_atk_quality") or 0)
        a_miss = float(prof_ev.get("away_missing_def_quality") or 0)
        if h_miss > 5: parts.append(f"Absente gazda (atac): -{h_miss:.0f}")
        if a_miss > 5: parts.append(f"Absente oaspete (aparare): -{a_miss:.0f}")
        top_h = prof_ev.get("top_home_player") or {}
        top_a = prof_ev.get("top_away_player") or {}
        players = []
        if top_h.get("name"):
            r = float(top_h.get("rating") or top_h.get("overall") or 0)
            players.append(f"gazda: {top_h['name']}" + (f" ({r:.1f})" if r > 0 else ""))
        if top_a.get("name"):
            r = float(top_a.get("rating") or top_a.get("overall") or 0)
            players.append(f"oaspete: {top_a['name']}" + (f" ({r:.1f})" if r > 0 else ""))
        if players:
            parts.append("Jucator cheie: " + " | ".join(players))

    return "\n".join(parts)


def _get_top_picks(markets_enriched, n=3):
    """
    Returneaza top N piete cu edge pozitiv, sortate dupa edge_pp × prob.
    Aceasta formula replica cel mai bine cum app-ul stabileste RECOMANDAREA.
    Toate pietele cu edge pozitiv sunt eligibile (inclusiv Avoid).
    """
    candidates = []
    for mk, v in (markets_enriched or {}).items():
        if not isinstance(v, dict):
            continue
        edge = float(v.get("edge_pp") or 0)
        if edge <= 0:
            continue
        odds = float(v.get("odds") or 0)
        prob = float(v.get("prob") or v.get("bsd_prob") or 0)
        if odds < 1.01 or prob < 0.01:
            continue
        candidates.append({
            "mk":   mk,
            "ev":   float(v.get("ev_pct") or 0),
            "odds": odds,
            "prob": prob,
            "edge": edge,
            "tier": str(v.get("risk_tier") or ""),
            "score": edge * prob,
        })
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:n]


def _build_prompt(home, away, league, xg_home, xg_away,
                  home_form, away_form, is_derby, funfacts,
                  h2h_line, local_context, top_picks):
    derby_line = "\nDERBY LOCAL!" if is_derby else ""
    facts_line = ("\nStatistici: " + " | ".join(str(f) for f in funfacts[:2])) if funfacts else ""

    if not top_picks:
        ctx = f"\n{local_context}" if local_context else ""
        return (
            f"Esti analist sportiv. Scrie 2 propozitii scurte in romana despre acest meci.\n\n"
            f"{home} vs {away} | {league}\n"
            f"xG {xg_home:.2f}-{xg_away:.2f} | forma [{home_form or '?'}] vs [{away_form or '?'}]"
            f"{facts_line}{ctx}\n\n"
            f"Raspunde DOAR cu cele 2 propozitii, fara titluri."
        )

    lines = []
    for p in top_picks:
        pick_ro  = _MARKET_RO.get(p["mk"], p["mk"])
        tier_tag = f" [{p['tier']}]" if p["tier"] else ""
        lines.append(
            f"  • {pick_ro} @ {p['odds']:.2f}"
            f" | prob {round(p['prob']*100)}%"
            f" | edge {p['edge']:+.1f}pp"
            f" | EV {p['ev']:+.1f}%"
            f"{tier_tag}"
        )
    picks_block = "\n".join(lines)

    ctx_section = (f"\nCONTEXT:\n{local_context}"
                   if local_context else "\nCONTEXT: date statistice standard.")

    return (
        f"Esti analist sportiv expert. Ai datele de mai jos si trebuie sa alegi CEL MAI BUN pariu.\n\n"
        f"MECI: {home} vs {away} | {league}{derby_line}\n"
        f"DATE: xG {xg_home:.2f}-{xg_away:.2f}"
        f" | forma {home}:[{home_form or '?'}] {away}:[{away_form or '?'}]"
        f"{h2h_line}{facts_line}{ctx_section}\n\n"
        f"PIETE CU EDGE POZITIV (alege DOAR din aceasta lista):\n{picks_block}\n\n"
        f"Bazeaza-te pe xG, forma, H2H si context. Alege pariul cu cel mai bun echilibru "
        f"intre probabilitate, edge si risc.\n"
        f"FORMAT RASPUNS (exact, fara text suplimentar, in romana):\n"
        f"PICK: [denumire exacta din lista @ cota]\n"
        f"VERDICT: [JUCABIL / CU GRIJA / EVITA]\n"
        f"MOTIV: [1 propozitie — de ce acest pariu e cel mai bun]\n"
        f"RISC: [1 propozitie — riscul principal sau: Risc scazut]"
    )


def main():
    print("=== GENERATE CLAUDE PREVIEWS v4 ===")

    if not _ANTHROPIC_AVAILABLE:
        print("[ClaudePreview] Libraria 'anthropic' nu e instalata — skip.")
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[ClaudePreview] ANTHROPIC_API_KEY lipsa — skip.")
        return

    # Verifica daca mai generam preview-uri noi sau doar aplicam cache-ul existent
    claude_cache = _load_json(CLAUDE_PREVIEW_CACHE_FILE, {})
    skip_new_generation = False
    if CLAUDE_PREVIEW_CACHE_FILE.exists() and claude_cache:
        age_hours = (datetime.now(timezone.utc).timestamp()
                     - CLAUDE_PREVIEW_CACHE_FILE.stat().st_mtime) / 3600
        if age_hours < CACHE_FRESH_HOURS:
            skip_new_generation = True
            print(f"[ClaudePreview] Cache v4 proaspat ({age_hours:.1f}h) — aplicam cache, fara generare noua.")

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("[ClaudePreview] predictions.json lipsa — skip.")
        return

    raw = _load_json(pred_path, [])
    predictions = raw if isinstance(raw, list) else (
        raw.get("predictions") or raw.get("results")
        or raw.get("events") or list(raw.values())
    )

    social_cache   = _load_json(DATA_DIR / "social_news_cache.json", {})
    profiles_cache = _load_json(DATA_DIR / "player_profiles_cache.json", {})
    print(f"[ClaudePreview] Context local: "
          f"{len(social_cache.get('events') or {})} social + "
          f"{len(profiles_cache.get('events') or {})} profile events")

    now_utc  = datetime.now(timezone.utc)
    cutoff   = now_utc + timedelta(days=PREVIEW_MAX_DAYS)
    client   = None if skip_new_generation else _anthropic_mod.Anthropic(api_key=api_key)
    generated = cached_hits = errors = 0

    for row in predictions:
        ev = row.get("event") or {}
        if ev.get("status") != "notstarted":
            continue

        event_id = str(ev.get("id") or "")
        if not event_id:
            continue

        try:
            ev_dt = datetime.fromisoformat(
                (ev.get("event_date") or "").replace("Z", "+00:00"))
            if ev_dt > cutoff:
                continue
        except Exception:
            continue

        markets_enriched = row.get("markets_enriched") or {}
        top_picks = _get_top_picks(markets_enriched)

        if top_picks:
            p0 = top_picks[0]
            cache_key = f"{event_id}:v4:{p0['mk']}@{p0['odds']:.2f}"
        else:
            cache_key = f"{event_id}:v4"

        # Aplica intotdeauna cache-ul existent
        if cache_key in claude_cache:
            row["ai_preview"] = claude_cache[cache_key]
            cached_hits += 1
            continue

        # Generare noua — doar daca nu suntem in modul skip si nu am depasit limita
        if skip_new_generation or generated >= MAX_NEW_PER_RUN:
            continue

        try:
            home   = ev.get("home_team") or "Gazda"
            away   = ev.get("away_team") or "Oaspete"
            lg     = ev.get("league") or {}
            league = lg.get("name") or "Liga necunoscuta"

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

            h2h_n     = int(float(row.get("supreme_h2h_matches") or 0))
            h2h_btts  = float(row.get("supreme_h2h_btts_rate") or 0)
            h2h_goals = float(row.get("supreme_h2h_avg_goals") or 0)
            h2h_draw  = float(row.get("supreme_h2h_draw_rate") or 0)
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
                h2h_line, local_context, top_picks,
            )

            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
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

    # Salveaza predictions.json cu ai_preview actualizat
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
