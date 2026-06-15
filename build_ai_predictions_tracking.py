#!/usr/bin/env python3
"""
Build AI predictions tracking — archives daily AI picks and auto-checks results.
Output: data/ai_predictions_tracking.json
"""

import json
import re
import os
from datetime import datetime, timezone, date
from pathlib import Path


# ── Market helpers ──────────────────────────────────────────────────────────

def parse_market(pick_str):
    """Extract market key from pick string like 'BTTS@1.99'."""
    s = pick_str.upper().replace(' ', '')
    if 'BTTS' in s or 'AMBELESCORE' in s:
        return 'btts'
    if 'PESTE3.5' in s or 'OVER3.5' in s:
        return 'over35'
    if 'PESTE2.5' in s or 'OVER2.5' in s:
        return 'over25'
    if 'PESTE1.5' in s or 'OVER1.5' in s:
        return 'over15'
    if 'SUB2.5' in s or 'UNDER2.5' in s:
        return 'under25'
    if 'SUB3.5' in s or 'UNDER3.5' in s:
        return 'under35'
    if 'VICTORIEGAZDA' in s or 'HOMEWIN' in s or '1X2:1' in s:
        return 'home_win'
    if 'VICTORIEOASPETE' in s or 'AWAYWIN' in s or '1X2:2' in s:
        return 'away_win'
    if 'EGAL' in s or 'DRAW' in s or '1X2:X' in s:
        return 'draw'
    return 'unknown'


def parse_odds(pick_str):
    """Extract odds float from 'Market@1.99' string."""
    m = re.search(r'@(\d+(?:\.\d+)?)', pick_str)
    return float(m.group(1)) if m else None


def check_market(market, home_score, away_score):
    """Return 'win' or 'loss' given market key and final scores."""
    total = home_score + away_score
    if market == 'btts':
        return 'win' if home_score > 0 and away_score > 0 else 'loss'
    if market == 'over35':
        return 'win' if total > 3 else 'loss'
    if market == 'over25':
        return 'win' if total > 2 else 'loss'
    if market == 'over15':
        return 'win' if total > 1 else 'loss'
    if market == 'under25':
        return 'win' if total < 3 else 'loss'
    if market == 'under35':
        return 'win' if total < 4 else 'loss'
    if market == 'home_win':
        return 'win' if home_score > away_score else 'loss'
    if market == 'away_win':
        return 'win' if away_score > home_score else 'loss'
    if market == 'draw':
        return 'win' if home_score == away_score else 'loss'
    return 'pending'


# ── Name normalisation ───────────────────────────────────────────────────────

def norm(name):
    return re.sub(r'\s+', '', (name or '').lower())


def build_score_lookup(events):
    """Build {norm(home)+norm(away): (home_score, away_score, status, event_date)} map."""
    lookup = {}
    for ev in events:
        # Support both raw event and wrapper {"event": {...}}
        e = ev.get('event', ev)
        status = e.get('status', '')
        h = e.get('home_team', '') or e.get('home', '')
        a = e.get('away_team', '') or e.get('away', '')
        hs = e.get('home_score')
        aws = e.get('away_score')
        event_date = e.get('event_date', '') or e.get('date', '') or ''
        if h and a:
            key = norm(h) + '||' + norm(a)
            lookup[key] = (hs, aws, status, event_date)
    return lookup


def find_score(meci_str, lookup):
    """Try to match 'Home vs Away' against the lookup. Returns (hs, as, status, event_date) or None."""
    parts = re.split(r'\s+vs\s+', meci_str, flags=re.IGNORECASE)
    if len(parts) < 2:
        return None
    nh, na = norm(parts[0]), norm(parts[1])

    # Exact key
    key = nh + '||' + na
    if key in lookup:
        return lookup[key]

    # Fuzzy: find any key where both team fragments match
    for k, v in lookup.items():
        kh, ka = k.split('||', 1)
        if (nh in kh or kh in nh) and (na in ka or ka in na):
            return v
    return None


def resolve_pick(pick_dict, lookup):
    """Add result/score/eventDate fields to a pick dict. Returns updated dict."""
    meci = pick_dict.get('meci', '')
    pick_str = pick_dict.get('pick', '')
    market = parse_market(pick_str)
    odds = parse_odds(pick_str)
    score_info = find_score(meci, lookup)

    result = 'pending'
    score_str = ''
    event_date = ''
    if score_info:
        hs, aws, status, event_date = score_info
        if status == 'finished' and hs is not None and aws is not None:
            try:
                result = check_market(market, int(hs), int(aws))
                score_str = f"{int(hs)}-{int(aws)}"
            except (ValueError, TypeError):
                result = 'pending'

    out = dict(pick_dict)
    out['market'] = market
    if odds is not None:
        out['odds'] = odds
    out['result'] = result
    if score_str:
        out['score'] = score_str
    if event_date and not out.get('eventDate'):
        out['eventDate'] = event_date
    return out


# ── Load events ─────────────────────────────────────────────────────────────

def load_events():
    sources = ['data/predictions.json', 'data/events.json']
    events = []
    for src in sources:
        p = Path(src)
        if not p.exists():
            continue
        try:
            raw = json.loads(p.read_text(encoding='utf-8'))
            items = raw.get('results', raw) if isinstance(raw, dict) else raw
            if isinstance(items, list):
                events.extend(items)
        except Exception as exc:
            print(f"Warning: could not load {src}: {exc}")
    return events


# ── Stats helpers ────────────────────────────────────────────────────────────

def summarise_picks(picks):
    wins = sum(1 for p in picks if p.get('result') == 'win')
    losses = sum(1 for p in picks if p.get('result') == 'loss')
    pending = sum(1 for p in picks if p.get('result') == 'pending')
    return {'wins': wins, 'losses': losses, 'pending': pending}


def acum_result(picks):
    results = [p.get('result') for p in picks]
    if any(r == 'loss' for r in results):
        return 'loss'
    if any(r == 'pending' for r in results):
        return 'pending'
    if all(r == 'win' for r in results):
        return 'win'
    return 'pending'


def compute_stats(history):
    """Compute aggregate stats across history records."""
    tp_total = tp_wins = tp_losses = tp_pending = 0
    ac_total = ac_wins = ac_losses = ac_pending = 0

    for rec in history:
        s = rec.get('top_picks_summary', {})
        tp_wins += s.get('wins', 0)
        tp_losses += s.get('losses', 0)
        tp_pending += s.get('pending', 0)
        if rec.get('top_picks_results'):
            tp_total += 1  # count days

        ar = rec.get('acumulator_result', 'pending')
        if ar in ('win', 'loss'):
            ac_total += 1
            if ar == 'win':
                ac_wins += 1
            else:
                ac_losses += 1
        elif ar == 'pending':
            ac_pending += 1

    # Streak: walk history backwards
    streak_type = ''
    streak_count = 0
    finished = [r for r in reversed(history) if r.get('acumulator_result') in ('win', 'loss')]
    if finished:
        streak_type = finished[0]['acumulator_result']
        for r in finished:
            if r['acumulator_result'] == streak_type:
                streak_count += 1
            else:
                break

    tp_settled = tp_wins + tp_losses
    ac_settled = ac_wins + ac_losses

    # Per-pick stats (not per-day)
    pick_wins = pick_losses = pick_pending = 0
    for rec in history:
        for p in rec.get('top_picks_results', []):
            r = p.get('result', 'pending')
            if r == 'win':
                pick_wins += 1
            elif r == 'loss':
                pick_losses += 1
            else:
                pick_pending += 1

    pick_total = pick_wins + pick_losses + pick_pending
    pick_settled = pick_wins + pick_losses

    return {
        'top_picks': {
            'total': pick_total,
            'wins': pick_wins,
            'losses': pick_losses,
            'pending': pick_pending,
            'winrate': round(pick_wins / pick_settled * 100, 1) if pick_settled else 0.0
        },
        'acumulators': {
            'total': ac_total + ac_pending,
            'wins': ac_wins,
            'losses': ac_losses,
            'pending': ac_pending,
            'winrate': round(ac_wins / ac_settled * 100, 1) if ac_settled else 0.0
        },
        'streak': {
            'current': streak_count,
            'type': streak_type
        }
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def picks_signature(picks):
    """Fingerprint a pick list by (meci, pick) pairs — order-independent."""
    return frozenset(
        (p.get('meci', '').strip().lower(), p.get('pick', '').strip().lower())
        for p in picks
    )


def main():
    today = date.today().isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Load existing tracking
    tracking_path = Path('data/ai_predictions_tracking.json')
    tracking = {'history': [], 'stats': {}, 'updated_at': now_iso}
    if tracking_path.exists():
        try:
            tracking = json.loads(tracking_path.read_text(encoding='utf-8'))
        except Exception as exc:
            print(f"Warning: could not read existing tracking: {exc}")

    history = tracking.get('history', [])

    # Load claude_daily_analysis.json to determine the entry date
    daily_path = Path('data/claude_daily_analysis.json')
    if not daily_path.exists():
        print("data/claude_daily_analysis.json not found — updating results only.")
        events = load_events()
        lookup = build_score_lookup(events)
        for rec in history:
            rec['top_picks_results'] = [resolve_pick(p, lookup) for p in rec.get('top_picks_results', [])]
            rec['acumulator_picks'] = [resolve_pick(p, lookup) for p in rec.get('acumulator_picks', [])]
            rec['top_picks_summary'] = summarise_picks(rec['top_picks_results'])
            rec['acumulator_result'] = acum_result(rec['acumulator_picks'])
    else:
        daily = json.loads(daily_path.read_text(encoding='utf-8'))
        gen_at = daily.get('generated_at', '')
        # Use the analysis's own generation date as the history entry date
        entry_date = gen_at[:10] if len(gen_at) >= 10 else today

        existing_dates = {r.get('date') for r in history}

        events = load_events()
        lookup = build_score_lookup(events)

        # Always re-resolve pending picks in existing history
        for rec in history:
            rec['top_picks_results'] = [resolve_pick(p, lookup) for p in rec.get('top_picks_results', [])]
            rec['acumulator_picks'] = [resolve_pick(p, lookup) for p in rec.get('acumulator_picks', [])]
            rec['top_picks_summary'] = summarise_picks(rec['top_picks_results'])
            rec['acumulator_result'] = acum_result(rec['acumulator_picks'])

        if entry_date in existing_dates:
            print(f"Entry for {entry_date} already archived. Re-resolved results only.")
        else:
            top_picks_raw = daily.get('top_picks', [])
            acumulator_raw = daily.get('acumulator', [])

            # Skip archiving if picks are identical to the most recent history entry
            sorted_history = sorted(history, key=lambda r: r.get('date', ''), reverse=True)
            if sorted_history:
                last = sorted_history[0]
                last_acum_sig = picks_signature(last.get('acumulator_picks', []))
                last_top_sig  = picks_signature(last.get('top_picks_results', []))
                new_acum_sig  = picks_signature(acumulator_raw)
                new_top_sig   = picks_signature(top_picks_raw)
                if last_acum_sig == new_acum_sig and last_top_sig == new_top_sig:
                    print(f"Picks unchanged from {last.get('date')} — no new entry for {entry_date}.")
                    history = sorted_history  # already re-resolved above
                    # Fall through to save updated results without new entry
                    tracking['history'] = history
                    tracking['stats'] = compute_stats(history)
                    tracking['updated_at'] = now_iso
                    os.makedirs('data', exist_ok=True)
                    tracking_path.write_text(json.dumps(tracking, ensure_ascii=False, indent=2), encoding='utf-8')
                    print(f"Written data/ai_predictions_tracking.json — {len(history)} days in history (no new entry, picks unchanged)")
                    return

            top_picks_results = [resolve_pick(dict(p), lookup) for p in top_picks_raw]
            acumulator_picks = [resolve_pick({'meci': a.get('meci', ''), 'pick': a.get('pick', '')}, lookup) for a in acumulator_raw]

            rec = {
                'date': entry_date,
                'generated_at': gen_at or now_iso,
                'provider': daily.get('provider', 'unknown'),
                'matches_analyzed': daily.get('matches_analyzed', 0),
                'top_picks_results': top_picks_results,
                'acumulator_picks': acumulator_picks,
                'acumulator_result': acum_result(acumulator_picks),
                'cota_totala': daily.get('cota_totala'),
                'sansa_pct': daily.get('sansa_pct'),
                'top_picks_summary': summarise_picks(top_picks_results)
            }

            history.append(rec)
            print(f"Archived {entry_date}: {len(top_picks_results)} top picks, {len(acumulator_picks)} acumulator picks")

    # Keep last 30 days, sorted by date desc
    history.sort(key=lambda r: r.get('date', ''), reverse=True)
    history = history[:30]

    tracking['history'] = history
    tracking['stats'] = compute_stats(history)
    tracking['updated_at'] = now_iso

    os.makedirs('data', exist_ok=True)
    tracking_path.write_text(json.dumps(tracking, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Written data/ai_predictions_tracking.json — {len(history)} days in history")
    stats = tracking['stats']
    tp = stats.get('top_picks', {})
    ac = stats.get('acumulators', {})
    print(f"Stats → Top picks: {tp.get('wins')}W/{tp.get('losses')}L/{tp.get('pending')}P ({tp.get('winrate')}%) | Accum: {ac.get('wins')}W/{ac.get('losses')}L ({ac.get('winrate')}%)")


if __name__ == '__main__':
    main()
