#!/usr/bin/env python3
"""
build_claude_daily.py — Analiză zilnică AI: selecție bazată pe edge matematic.

Provider-uri (în ordine):
  1. Google Gemini 2.0 Flash  — gratuit, principal
  2. Anthropic Claude Haiku   — paid, fallback

Output: data/claude_daily_analysis.json
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR          = Path("data")
OUTPUT_FILE       = DATA_DIR / "claude_daily_analysis.json"
CACHE_FRESH_HOURS = 6

# Praguri minime pentru selecție
MIN_EDGE_TOP_PICKS  = 4.0   # pp — sub acest prag, nu intră în top picks
MIN_EDGE_ACUM       = 2.0   # pp — sub acest prag, nu intră în acumulator
AVOID_TIERS         = {"Avoid"}  # tier-uri excluse din top picks

_MK_RO = {
    "home_win": "Victorie gazda", "away_win": "Victorie oaspete", "draw": "Egal",
    "over_15": "Peste 1.5G", "over_25": "Peste 2.5G", "over_35": "Peste 3.5G",
    "under_15": "Sub 1.5G",  "under_25": "Sub 2.5G",  "under_35": "Sub 3.5G",
    "btts_yes": "BTTS", "btts": "BTTS",
    "double_chance_1x": "Sansa 1X", "double_chance_x2": "Sansa X2",
    "double_chance_12": "Sansa 12",
}


def _load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _best_market(markets_enriched, min_edge=0.0, exclude_tiers=None):
    """Returnează cel mai bun market (edge×prob) sau None dacă nu există."""
    exclude_tiers = exclude_tiers or set()
    best = None
    for mk, v in (markets_enriched or {}).items():
        if not isinstance(v, dict):
            continue
        edge = float(v.get("edge_pp") or 0)
        prob = float(v.get("prob") or 0)
        odds = float(v.get("odds") or 0)
        tier = str(v.get("risk_tier") or "")
        if edge < min_edge or odds < 1.05 or prob < 0.05:
            continue
        if tier in exclude_tiers:
            continue
        score = edge * prob
        if best is None or score > best["score"]:
            best = {"mk": mk, "edge": edge, "prob": prob, "odds": odds,
                    "tier": tier, "ev": float(v.get("ev_pct") or 0), "score": score}
    return best


def _format_match(row, min_edge=0.0):
    """Formatează un meci pentru prompt. Returnează None dacă nu îndeplinește criteriile."""
    ev    = row.get("event") or {}
    home  = ev.get("home_team") or "?"
    away  = ev.get("away_team") or "?"
    liga  = (ev.get("league") or {}).get("name") or "?"
    xg_h  = float(row.get("expected_home_goals") or 0)
    xg_a  = float(row.get("expected_away_goals") or 0)
    hf    = row.get("supreme_home_form_string") or row.get("home_form_string") or "?"
    af    = row.get("supreme_away_form_string") or row.get("away_form_string") or "?"
    h2h_n = int(float(row.get("supreme_h2h_matches") or 0))
    h2h_g = float(row.get("supreme_h2h_avg_goals") or 0)
    h2h_b = float(row.get("supreme_h2h_btts_rate") or 0)
    h2h_d = float(row.get("supreme_h2h_draw_rate") or 0)

    h2h_parts = []
    if h2h_n > 0:
        if h2h_b > 0: h2h_parts.append(f"BTTS{round(h2h_b*100)}%")
        if h2h_g > 0: h2h_parts.append(f"{h2h_g:.1f}g")
        if h2h_d > 0: h2h_parts.append(f"egal{round(h2h_d*100)}%")
    h2h = f" H2H:{h2h_n}m/{'/'.join(h2h_parts)}" if h2h_parts else ""

    # Top 3 piete cu edge pozitiv, sortate edge×prob
    picks = []
    for mk, v in (row.get("markets_enriched") or {}).items():
        if not isinstance(v, dict): continue
        edge = float(v.get("edge_pp") or 0)
        prob = float(v.get("prob") or 0)
        odds = float(v.get("odds") or 0)
        tier = str(v.get("risk_tier") or "")
        ev   = float(v.get("ev_pct") or 0)
        if edge < min_edge or odds < 1.05 or prob < 0.05: continue
        picks.append((edge * prob, mk, odds, round(prob * 100), edge, ev, tier))
    picks.sort(reverse=True)

    if not picks:
        return None

    pk = " | ".join(
        f"{_MK_RO.get(mk, mk)}@{odds:.2f}(prob:{p}%/edge:+{edge:.0f}pp/EV:{ev:+.0f}%/{tier})"
        for _, mk, odds, p, edge, ev, tier in picks[:3]
    )
    return f"{home} vs {away}|{liga}|xG{xg_h:.1f}-{xg_a:.1f}|G:[{hf}]O:[{af}]{h2h}|{pk}"


def _parse_response(text):
    result = {"top_picks": [], "acumulator": [], "cota_totala": None,
              "sansa_pct": None, "tipare": [], "de_evitat": []}
    section = None
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        clean = line.lstrip("#*- \t").strip()
        upper = clean.upper()
        if upper.startswith("TOP_PICKS") or upper.startswith("TOP PICKS"):
            section = "top"; continue
        if upper.startswith("ACUMULATOR"):
            section = "acum"; continue
        if upper.startswith("TIPARE"):
            section = "tipare"; continue
        if upper.startswith("DE_EVITAT") or upper.startswith("DE EVITAT"):
            section = "evitat"; continue

        if section == "top":
            m = line.lstrip("0123456789. ").strip()
            parts = [p.strip() for p in m.split("|")]
            if len(parts) >= 2:
                result["top_picks"].append({
                    "meci":  parts[0],
                    "pick":  parts[1] if len(parts) > 1 else "",
                    "motiv": parts[2] if len(parts) > 2 else "",
                })
        elif section == "acum":
            if clean.upper().startswith("COTA_TOTALA") or clean.upper().startswith("COTA TOTALA"):
                try: result["cota_totala"] = float(line.split(":")[-1].strip().replace(",", ".").rstrip("*_ "))
                except: pass
            elif clean.upper().startswith("SANSA"):
                try: result["sansa_pct"] = int(line.split(":")[-1].strip().rstrip("% *_"))
                except: pass
            elif "→" in line or "->" in line:
                parts = line.replace("->", "→").split("→", 1)
                if len(parts) == 2:
                    result["acumulator"].append({"meci": parts[0].strip(), "pick": parts[1].strip()})
        elif section == "tipare":
            t = line.lstrip("•-*· 1234567890.")
            if t: result["tipare"].append(t)
        elif section == "evitat":
            e = line.lstrip("•-*· 1234567890.")
            if e: result["de_evitat"].append(e)

    return result


def _call_gemini(prompt, api_key):
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        text = response.text.strip()
        print(f"[ClaudeDaily] Gemini raspuns: {len(text)} chars")
        return text
    except Exception as e:
        print(f"[ClaudeDaily] Gemini eroare: {e}")
        return None


def _call_claude(prompt, api_key):
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        print(f"[ClaudeDaily] Claude raspuns: {len(text)} chars")
        return text
    except Exception as e:
        print(f"[ClaudeDaily] Claude eroare: {e}")
        return None


def main():
    print("=== BUILD DAILY AI ANALYSIS ===")

    if OUTPUT_FILE.exists():
        try:
            existing = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
            gen_at   = existing.get("generated_at", "")
            if gen_at:
                gen_dt = datetime.fromisoformat(gen_at)
                if gen_dt.tzinfo is None:
                    gen_dt = gen_dt.replace(tzinfo=timezone.utc)
                age_h = (datetime.now(timezone.utc) - gen_dt).total_seconds() / 3600
                if age_h < CACHE_FRESH_HOURS:
                    print(f"[ClaudeDaily] Analiza recenta ({age_h:.1f}h < {CACHE_FRESH_HOURS}h) — skip.")
                    return
        except Exception as e:
            print(f"[ClaudeDaily] Nu pot citi generated_at ({e}) — regenerez.")

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("[ClaudeDaily] predictions.json lipsa — skip."); return

    raw   = _load_json(pred_path, [])
    preds = raw if isinstance(raw, list) else (
        raw.get("predictions") or raw.get("results") or raw.get("events") or [])

    # Formatare meciuri cu edge ≥ MIN_EDGE_TOP_PICKS (filtru strict pentru prompt)
    matches_high = []   # edge ≥ 4pp (pentru top picks și context principal)
    matches_acum = []   # edge ≥ 2pp, tier Safe/Value (pentru acumulator)

    for row in preds:
        ev = row.get("event") or {}
        if ev.get("status") != "notstarted":
            continue
        me = row.get("markets_enriched") or {}

        # Cel mai bun market general (pentru sortare)
        best = _best_market(me, min_edge=MIN_EDGE_TOP_PICKS, exclude_tiers=AVOID_TIERS)
        if best:
            fmt = _format_match(row, min_edge=MIN_EDGE_TOP_PICKS)
            if fmt:
                matches_high.append((best["score"], fmt))

        # Pentru acumulator: piete Safe/Value cu edge ≥ 2pp și odds ≤ 2.10
        best_acum = _best_market(me, min_edge=MIN_EDGE_ACUM,
                                  exclude_tiers={"Avoid"})
        if best_acum and best_acum["odds"] <= 2.10 and best_acum["tier"] in ("Safe", "Value", "Balanced"):
            fmt_a = _format_match(row, min_edge=MIN_EDGE_ACUM)
            if fmt_a:
                matches_acum.append((best_acum["score"], fmt_a))

    # Sortare: cele mai bune meciuri primele
    matches_high.sort(reverse=True)
    matches_acum.sort(reverse=True)

    if not matches_high and not matches_acum:
        print("[ClaudeDaily] Niciun meci cu edge suficient."); return
    if not matches_high:
        print("[ClaudeDaily] Niciun meci cu edge ≥4pp pentru top picks — se omite secțiunea top.")

    n_high = len(matches_high)
    n_acum = len(matches_acum)
    block_high = ("\n".join(f"{i+1}. {m}" for i, (_, m) in enumerate(matches_high[:60]))
                  if matches_high else "(Niciun meci cu edge ≥4pp azi — top picks omis.)")
    block_acum = "\n".join(f"{i+1}. {m}" for i, (_, m) in enumerate(matches_acum[:40]))

    print(f"[ClaudeDaily] Top picks: {n_high} meciuri | Acumulator: {n_acum} meciuri...")

    prompt = (
        f"Esti analist sportiv expert. Analiza zilnica bazata pe edge matematic real.\n\n"
        f"REGULI STRICTE DE SELECTIE:\n"
        f"1. TOP PICKS: alege EXACT 5 meciuri — OBLIGATORIU odds intre 1.30 si 3.20 (nu include cote > 3.50)\n"
        f"2. TOP PICKS: prefer piete cu edge >= 8pp si probabilitate >= 40%\n"
        f"3. MOTIV: include OBLIGATORIU valoarea edge in formatul +Xpp (ex: '+12pp edge, xG 2.1-0.8 sustin')\n"
        f"4. ACUMULATOR: 5-7 selectii NUMAI din meciuri Safe/Value, odds 1.10-2.00\n"
        f"5. Nu include piete cu tier Avoid sau edge < 3pp\n"
        f"6. Tipare: observatii statistice concrete din datele de azi (nu generalitati)\n\n"
        f"FORMAT DATE: EchipaG vs EchipaO|Liga|xG g-o|Forma G:[XXXXX] O:[XXXXX]|"
        f"Piata@cota(prob:X%/edge:+Xpp/EV:+X%/TIER)\n\n"
        f"MECIURI CU EDGE RIDICAT ({n_high} total — pentru TOP PICKS):\n{block_high}\n\n"
        f"MECIURI PENTRU ACUMULATOR ({n_acum} disponibile — Safe/Value/Balanced):\n{block_acum}\n\n"
        f"Genereaza analiza EXACT in formatul urmator (in romana, fara text suplimentar, fara ## sau **):\n\n"
        f"TOP_PICKS:\n"
        f"1. [Echipa1 vs Echipa2] | [Piata @ cota] | [+Xpp edge, motiv 5-7 cuvinte]\n"
        f"2. [Echipa1 vs Echipa2] | [Piata @ cota] | [+Xpp edge, motiv 5-7 cuvinte]\n"
        f"3. [Echipa1 vs Echipa2] | [Piata @ cota] | [+Xpp edge, motiv 5-7 cuvinte]\n"
        f"4. [Echipa1 vs Echipa2] | [Piata @ cota] | [+Xpp edge, motiv 5-7 cuvinte]\n"
        f"5. [Echipa1 vs Echipa2] | [Piata @ cota] | [+Xpp edge, motiv 5-7 cuvinte]\n\n"
        f"ACUMULATOR:\n"
        f"[Echipa1 vs Echipa2] → [Piata @ cota]\n"
        f"[5-7 selectii Safe/Value cu odds 1.10-2.00]\n"
        f"COTA_TOTALA: [valoare]\n"
        f"SANSA: [procent]%\n\n"
        f"TIPARE:\n"
        f"• [pattern concret identificat azi din date — ex: '6/8 meciuri cu xG>2.0 au terminat BTTS']\n"
        f"• [alt pattern cu cifre din datele de azi]\n"
        f"• [al treilea pattern actionabil pentru pariori]\n\n"
        f"DE_EVITAT:\n"
        f"• [meci sau piata specifica cu motiv concret — ex: 'egal in Derby X — piata volatila, H2H 70% BTTS']\n"
        f"• [similar]\n"
    )

    raw_text = None
    provider = None

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        raw_text = _call_gemini(prompt, gemini_key)
        if raw_text:
            provider = "gemini-2.0-flash"

    if not raw_text:
        claude_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if claude_key:
            raw_text = _call_claude(prompt, claude_key)
            if raw_text:
                provider = "claude-haiku"

    if not raw_text:
        print("[ClaudeDaily] Niciun provider disponibil — skip."); return

    out = _parse_response(raw_text)
    out["generated_at"]     = datetime.now(timezone.utc).isoformat()
    out["matches_analyzed"] = n_high
    out["provider"]         = provider
    out["raw_response"]     = raw_text

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_FILE.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        tmp_path.replace(OUTPUT_FILE)  # atomic rename — previous file intact until write succeeds
    except Exception as e:
        print(f"[ClaudeDaily] EROARE la salvare: {e}")
        tmp_path.unlink(missing_ok=True)
        raise

    print(f"[ClaudeDaily] OK [{provider}] — top:{len(out['top_picks'])} "
          f"acum:{len(out['acumulator'])} tipare:{len(out['tipare'])} evitat:{len(out['de_evitat'])}")


if __name__ == "__main__":
    main()
