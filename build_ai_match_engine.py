#!/usr/bin/env python3
"""
Motor AI — per-match Gemini analysis with confidence scores.
Analyzes top 100 matches (by edge) in batches of 20 via Gemini 1.5 Flash,
falls back to Claude Haiku if Gemini is unavailable.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Market labels
# ---------------------------------------------------------------------------
MARKET_LABELS = {
    'home_win': 'Victorie gazdă',
    'away_win': 'Victorie oaspete',
    'draw': 'Egal',
    'over15': 'Peste 1.5G',
    'over25': 'Peste 2.5G',
    'over35': 'Peste 3.5G',
    'under15': 'Sub 1.5G',
    'under25': 'Sub 2.5G',
    'btts': 'BTTS',
    'dc_1x': 'Șansă 1X',
    'dc_x2': 'Șansă X2',
}

OUTPUT_PATH = Path('data/ai_match_engine.json')
PREDICTIONS_PATH = Path('data/predictions.json')
CACHE_MAX_AGE_HOURS = 4


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def _is_cache_fresh():
    if not OUTPUT_PATH.exists():
        return False
    try:
        data = _load_json(OUTPUT_PATH, {})
        gen_at = data.get('generated_at', '')
        if not gen_at:
            return False
        gen_dt = datetime.fromisoformat(gen_at.replace('Z', '+00:00'))
        age = datetime.now(timezone.utc) - gen_dt
        return age < timedelta(hours=CACHE_MAX_AGE_HOURS)
    except Exception:
        return False


def _format_batch(matches):
    """Build a compact prompt for up to 20 matches."""
    lines = []
    for i, m in enumerate(matches, 1):
        home = m.get('home', '?')
        away = m.get('away', '?')
        league = m.get('league', '?')
        xg_h = m.get('xg_home', 0) or 0
        xg_a = m.get('xg_away', 0) or 0
        home_form = m.get('home_form', '') or ''
        away_form = m.get('away_form', '') or ''
        markets = m.get('markets', [])  # list of "market@odds(prob%+edgepp)"
        market_str = ', '.join(markets) if markets else 'N/A'
        line = (
            f"{i}. {home} vs {away} | {league} | "
            f"xG:{xg_h:.1f}-{xg_a:.1f} | "
            f"Forma G:{home_form} O:{away_form} | "
            f"Piețe:{market_str}"
        )
        lines.append(line)

    prompt = (
        "Ești expert analist sportiv. Analizează fiecare meci și alege CEA MAI SIGURĂ predicție.\n\n"
        "FORMAT RĂSPUNS (o linie per meci, exact):\n"
        "ID|PIATA|COTA|INCREDERE|MOTIV\n\n"
        "Unde:\n"
        "- ID = numărul meciului (1, 2, 3...)\n"
        "- PIATA = exact una din: home_win, away_win, draw, over15, over25, over35, btts, dc_1x, dc_x2\n"
        "- COTA = odds numeric (ex: 1.85)\n"
        "- INCREDERE = procent 0-100 (ex: 78)\n"
        "- MOTIV = maxim 8 cuvinte în română\n\n"
        "MECIURI:\n"
        + '\n'.join(lines)
        + "\n\nRăspunde DOAR cu liniile ID|PIATA|COTA|INCREDERE|MOTIV, fără explicații suplimentare."
    )
    return prompt


def _parse_response(text, batch):
    """Parse AI response lines into pick dicts. Skip lines that don't parse cleanly."""
    picks = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or '|' not in line:
            continue
        parts = line.split('|')
        if len(parts) < 5:
            continue
        try:
            idx_str = parts[0].strip().lstrip('0123456789. ')
            # Try parsing the id part (may be "1", " 1", "1.", etc.)
            id_clean = parts[0].strip().rstrip('.').strip()
            match_idx = int(id_clean) - 1
            if match_idx < 0 or match_idx >= len(batch):
                continue
        except (ValueError, IndexError):
            continue

        piata = parts[1].strip().lower().replace(' ', '_')
        valid_markets = set(MARKET_LABELS.keys())
        if piata not in valid_markets:
            # Try fuzzy: strip common prefixes
            piata_raw = parts[1].strip()
            # Accept anyway if it's close
            if piata_raw not in valid_markets:
                continue

        try:
            cota = float(parts[2].strip())
            if cota < 1.01 or cota > 50:
                continue
        except ValueError:
            continue

        try:
            incredere_str = parts[3].strip().rstrip('%')
            incredere = int(float(incredere_str))
            incredere = max(0, min(100, incredere))
        except ValueError:
            continue

        motiv = '|'.join(parts[4:]).strip()
        if not motiv:
            motiv = ''

        m = batch[match_idx]
        pick = {
            'home': m.get('home', ''),
            'away': m.get('away', ''),
            'league': m.get('league', ''),
            'piata': piata,
            'piata_label': MARKET_LABELS.get(piata, piata),
            'cota': round(cota, 2),
            'incredere': incredere,
            'motiv': motiv,
            'edge_pp': m.get('edge_pp', 0),
            'xg_home': m.get('xg_home', 0),
            'xg_away': m.get('xg_away', 0),
            'home_form': m.get('home_form', ''),
            'away_form': m.get('away_form', ''),
        }
        picks.append(pick)

    return picks


def _call_gemini(prompt, api_key):
    """Call Gemini 1.5 Flash via google-genai SDK."""
    try:
        from google import genai
        from google.genai import types as genai_types
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                max_output_tokens=800,
                temperature=0.3,
            )
        )
        return response.text
    except Exception as e:
        print(f"[Gemini] Error: {e}", flush=True)
        return None


def _call_claude(prompt, api_key):
    """Call Claude Haiku as fallback."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=800,
            messages=[{'role': 'user', 'content': prompt}],
        )
        return msg.content[0].text
    except Exception as e:
        print(f"[Claude] Error: {e}", flush=True)
        return None


def _prepare_matches(raw_predictions):
    """Extract and prepare match data from predictions.json entries."""
    prepared = []
    for entry in raw_predictions:
        event = entry.get('event', {})
        if not event:
            continue
        # Only notstarted matches
        status = event.get('status', {})
        if isinstance(status, dict):
            status_type = status.get('type', '') or status.get('code', '')
        else:
            status_type = str(status)
        notstarted_codes = {'notstarted', 'NS', '0', 0, 'scheduled', 'prematch'}
        if status_type not in notstarted_codes and str(status_type).lower() not in {'notstarted', 'ns', 'scheduled', 'prematch'}:
            # Skip if clearly in-progress or finished
            if status_type in {'inprogress', 'finished', 'FT', 'HT', '1H', '2H', 'canceled', 'postponed'}:
                continue

        home = event.get('home_team', '') or ''
        away = event.get('away_team', '') or ''
        if not home or not away:
            continue

        league_info = event.get('league', {}) or {}
        league = league_info.get('name', '') if isinstance(league_info, dict) else str(league_info)

        xg_home = entry.get('expected_home_goals', 0) or 0
        xg_away = entry.get('expected_away_goals', 0) or 0
        home_form = entry.get('home_form_string', '') or ''
        away_form = entry.get('away_form_string', '') or ''

        markets_enriched = entry.get('markets_enriched', {}) or {}

        # Collect markets with positive edge
        market_entries = []
        best_edge = 0
        for mk, mv in markets_enriched.items():
            if not isinstance(mv, dict):
                continue
            edge = mv.get('edge_pp', 0) or 0
            if edge <= 0:
                continue
            prob = mv.get('prob', 0) or 0
            odds = mv.get('odds', 0) or 0
            if odds < 1.01:
                continue
            market_entries.append((mk, odds, prob, edge))
            if edge > best_edge:
                best_edge = edge

        if not market_entries:
            continue

        # Sort by edge desc, take top 3
        market_entries.sort(key=lambda x: -x[3])
        market_entries = market_entries[:3]

        markets_str_list = []
        for mk, odds, prob, edge in market_entries:
            markets_str_list.append(f"{mk}@{odds:.2f}({prob:.0f}%+{edge:.1f}pp)")

        prepared.append({
            'home': home,
            'away': away,
            'league': league,
            'xg_home': float(xg_home),
            'xg_away': float(xg_away),
            'home_form': home_form,
            'away_form': away_form,
            'markets': markets_str_list,
            'edge_pp': float(best_edge),
        })

    return prepared


def main():
    if _is_cache_fresh():
        print('[Motor AI] Cache fresh (< 4h). Skipping.', flush=True)
        sys.exit(0)

    gemini_key = os.environ.get('GEMINI_API_KEY', '').strip()
    anthropic_key = os.environ.get('ANTHROPIC_API_KEY', '').strip()

    if not gemini_key and not anthropic_key:
        print('[Motor AI] No API keys found. Skipping.', flush=True)
        sys.exit(0)

    print('[Motor AI] Loading predictions...', flush=True)
    pred_data = _load_json(PREDICTIONS_PATH, [])
    if isinstance(pred_data, dict):
        raw_preds = pred_data.get('results', pred_data.get('predictions', [])) or []
    else:
        raw_preds = pred_data or []

    if not raw_preds:
        print('[Motor AI] No predictions found. Skipping.', flush=True)
        sys.exit(0)

    matches = _prepare_matches(raw_preds)
    print(f'[Motor AI] {len(matches)} matches with positive edge found.', flush=True)

    # Sort by edge desc, take top 100
    matches.sort(key=lambda x: -x['edge_pp'])
    matches = matches[:100]

    if not matches:
        print('[Motor AI] No matches to analyze.', flush=True)
        sys.exit(0)

    # Process in batches of 20
    all_picks = []
    batch_size = 20
    provider_used = None

    for batch_start in range(0, len(matches), batch_size):
        batch = matches[batch_start:batch_start + batch_size]
        batch_num = batch_start // batch_size + 1
        total_batches = (len(matches) + batch_size - 1) // batch_size
        print(f'[Motor AI] Processing batch {batch_num}/{total_batches} ({len(batch)} matches)...', flush=True)

        prompt = _format_batch(batch)
        response_text = None

        if gemini_key:
            response_text = _call_gemini(prompt, gemini_key)
            if response_text:
                provider_used = provider_used or 'gemini-1.5-flash'

        if not response_text and anthropic_key:
            print(f'[Motor AI] Falling back to Claude Haiku for batch {batch_num}...', flush=True)
            response_text = _call_claude(prompt, anthropic_key)
            if response_text:
                provider_used = provider_used or 'claude-haiku-4-5-20251001'

        if not response_text:
            print(f'[Motor AI] No response for batch {batch_num}. Skipping.', flush=True)
            continue

        picks = _parse_response(response_text, batch)
        print(f'[Motor AI] Batch {batch_num}: {len(picks)} picks parsed.', flush=True)
        all_picks.extend(picks)

        # Small delay to avoid rate limits
        if batch_start + batch_size < len(matches):
            time.sleep(1)

    print(f'[Motor AI] Total picks: {len(all_picks)}', flush=True)

    output = {
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'matches_analyzed': len(matches),
        'provider': provider_used or 'unknown',
        'picks': all_picks,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'[Motor AI] Saved {len(all_picks)} picks to {OUTPUT_PATH}', flush=True)


if __name__ == '__main__':
    main()
