#!/usr/bin/env python3
"""
build_claude_daily.py — Analiză zilnică Claude AI: toate meciurile → top picks + acumulator.

Genereaza o data la CACHE_FRESH_HOURS ore:
- Top 5 pariuri ale zilei (cu motive)
- Acumulator recomandat 7-10 selectii
- Tipare identificate cross-meci
- Meciuri/piete de evitat

Output: data/claude_daily_analysis.json
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR       = Path("data")
OUTPUT_FILE    = DATA_DIR / "claude_daily_analysis.json"
CACHE_FRESH_HOURS = 10

try:
    import anthropic as _anthropic_mod
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

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


def _format_match(row):
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
    h2h   = f" H2H:{h2h_n}m/{h2h_g:.1f}g" if h2h_n > 0 else ""

    picks = []
    for mk, v in (row.get("markets_enriched") or {}).items():
        if not isinstance(v, dict): continue
        edge = float(v.get("edge_pp") or 0)
        if edge <= 0: continue
        prob = float(v.get("prob") or 0)
        odds = float(v.get("odds") or 0)
        if odds < 1.01 or prob < 0.01: continue
        picks.append((edge * prob, mk, odds, round(prob * 100), edge))
    picks.sort(reverse=True)

    pk = " | ".join(
        f"{_MK_RO.get(mk, mk)}@{odds:.2f}({p}%/+{edge:.0f}pp)"
        for _, mk, odds, p, edge in picks[:3]
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
        upper = line.upper()
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
            if line.upper().startswith("COTA_TOTALA") or line.upper().startswith("COTA TOTALA"):
                try: result["cota_totala"] = float(line.split(":")[-1].strip().replace(",", "."))
                except: pass
            elif line.upper().startswith("SANSA"):
                try: result["sansa_pct"] = int(line.split(":")[-1].strip().rstrip("%"))
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


def main():
    print("=== BUILD CLAUDE DAILY ANALYSIS ===")

    if not _AVAILABLE:
        print("[ClaudeDaily] anthropic lipsa — skip."); return

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("[ClaudeDaily] ANTHROPIC_API_KEY lipsa — skip."); return

    if OUTPUT_FILE.exists():
        age_h = (datetime.now(timezone.utc).timestamp() - OUTPUT_FILE.stat().st_mtime) / 3600
        if age_h < CACHE_FRESH_HOURS:
            print(f"[ClaudeDaily] Analiza recenta ({age_h:.1f}h < {CACHE_FRESH_HOURS}h) — skip."); return

    pred_path = DATA_DIR / "predictions.json"
    if not pred_path.exists():
        print("[ClaudeDaily] predictions.json lipsa — skip."); return

    raw  = _load_json(pred_path, [])
    preds = raw if isinstance(raw, list) else (
        raw.get("predictions") or raw.get("results") or raw.get("events") or [])

    matches = []
    for row in preds:
        ev = row.get("event") or {}
        if ev.get("status") != "notstarted": continue
        me = row.get("markets_enriched") or {}
        if any(isinstance(v, dict) and float(v.get("edge_pp") or 0) > 0 for v in me.values()):
            matches.append(_format_match(row))

    if not matches:
        print("[ClaudeDaily] Niciun meci cu edge pozitiv."); return

    n = len(matches)
    print(f"[ClaudeDaily] Analizeaza {n} meciuri...")

    block = "\n".join(f"{i+1}. {m}" for i, m in enumerate(matches[:80]))

    prompt = (
        f"Esti analist sportiv expert. Analizeaza intreaga oferta disponibila: {n} meciuri cu date statistice reale.\n"
        f"Format date per meci: EchipaG vs EchipaO|Liga|xG g-o|Forma G:[XXXXX] O:[XXXXX]|"
        f"Piata@cota(prob%/+edgepp)\n\n"
        f"DATE MECIURI:\n{block}\n\n"
        f"Genereaza analiza EXACT in formatul urmator (in romana, fara text suplimentar):\n\n"
        f"TOP_PICKS:\n"
        f"1. [Echipa1 vs Echipa2] | [Piata @ cota] | [motiv 6-8 cuvinte]\n"
        f"2. [similar]\n3. [similar]\n4. [similar]\n5. [similar]\n\n"
        f"ACUMULATOR:\n"
        f"[Echipa1 vs Echipa2] → [Piata @ cota]\n"
        f"[repeta pentru 7-9 selectii cu probabilitate ridicata]\n"
        f"COTA_TOTALA: [valoare]\n"
        f"SANSA: [procent]%\n\n"
        f"TIPARE:\n"
        f"• [observatie statistica relevanta din datele de astazi]\n"
        f"• [alta observatie]\n"
        f"• [alta observatie]\n\n"
        f"DE_EVITAT:\n"
        f"• [meci sau piata specifica cu motiv scurt]\n"
        f"• [similar]\n"
    )

    try:
        client  = _anthropic_mod.Anthropic(api_key=api_key)
        msg     = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = msg.content[0].text.strip()
        print(f"[ClaudeDaily] Raspuns: {len(raw_text)} chars")

        out = _parse_response(raw_text)
        out["generated_at"]     = datetime.now(timezone.utc).isoformat()
        out["matches_analyzed"] = n
        out["raw_response"]     = raw_text

        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        print(f"[ClaudeDaily] OK — top:{len(out['top_picks'])} acum:{len(out['acumulator'])} "
              f"tipare:{len(out['tipare'])} evitat:{len(out['de_evitat'])}")

    except Exception as e:
        print(f"[ClaudeDaily] Eroare: {e}")


if __name__ == "__main__":
    main()
