#!/usr/bin/env python3
import json
from datetime import datetime, timezone

from fetch_data import load_existing_json, save_json, TZ

VALID_MARKETS = {"over15", "over25", "under35", "btts"}


def to_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def to_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def parse_dt(value):
    try:
        if not value:
            return None
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None


def recency_weight(value, now_utc):
    dt = parse_dt(value)
    if not dt:
        return 0.72
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now_utc - dt.astimezone(timezone.utc)).total_seconds() / 86400.0)
    if age_days <= 14:
        return 1.2
    if age_days <= 45:
        return 1.08
    if age_days <= 90:
        return 0.98
    if age_days <= 180:
        return 0.88
    if age_days <= 365:
        return 0.76
    return 0.64


def odds_bucket(value):
    odd = to_float(value)
    if odd <= 0:
        return '—'
    if odd < 1.35:
        return '1.01–1.34'
    if odd < 1.50:
        return '1.35–1.49'
    if odd < 1.66:
        return '1.50–1.65'
    if odd < 1.81:
        return '1.66–1.80'
    return '1.81+'


def conf_bucket(value):
    v = to_float(value)
    if v < 50:
        return '<50'
    if v < 60:
        return '50–59'
    if v < 70:
        return '60–69'
    if v < 80:
        return '70–79'
    return '80+'


def edge_bucket(value):
    v = to_float(value)
    if v < 3:
        return '<3%'
    if v < 5:
        return '3–4.9%'
    if v < 8:
        return '5–7.9%'
    return '8%+'


def weekday_label(value):
    dt = parse_dt(value)
    if not dt:
        return '—'
    names = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']
    return names[dt.weekday()]


def source_label(row):
    src = str(row.get('source_api') or row.get('source') or row.get('source_kind') or '').lower()
    if 'ml' in src:
        return 'ml'
    if 'heur' in src:
        return 'heuristic'
    if 'api_backfill' in src:
        return 'backfill'
    return src[:24] if src else '—'


def won_flag(row):
    if row.get('won') is not None:
        return bool(row.get('won'))
    status = str(row.get('status') or '').lower()
    if status in {'win', 'won'}:
        return True
    if status in {'lose', 'lost'}:
        return False
    return None


def journal_rows():
    rows = load_existing_json('recommendation_journal.json', [])
    out = []
    seen = set()
    for row in rows or []:
        market_key = str(row.get('market_key') or row.get('market') or '').lower().strip()
        if market_key not in VALID_MARKETS:
            continue
        won = won_flag(row)
        if won is None:
            continue
        key = f"{row.get('event_id') or row.get('home')}|{market_key}|{str(row.get('event_date') or row.get('date') or row.get('logged_at') or '')[:10]}"
        if key in seen:
            continue
        seen.add(key)
        out.append({
            'event_id': row.get('event_id'),
            'market_key': market_key,
            'market': row.get('market') or market_key,
            'league': row.get('league') or 'Unknown',
            'odds': row.get('odds') or row.get('opening_odds'),
            'confidence': row.get('confidence'),
            'edge_pct': row.get('edge_pct'),
            'event_date': row.get('event_date') or row.get('date'),
            'settled_at': row.get('settled_at') or row.get('event_date') or row.get('date'),
            'source': source_label(row),
            'won': won,
        })
    return out


def update_stat(store, kind, key, label, row, weight):
    bucket = store.setdefault(kind, {})
    stat = bucket.setdefault(key, {
        'kind': kind,
        'key': key,
        'label': label,
        'raw_bets': 0,
        'bets_w': 0.0,
        'wins_w': 0.0,
        'profit_w': 0.0,
        'edge_sum': 0.0,
        'odds_sum': 0.0,
    })
    stat['raw_bets'] += 1
    stat['bets_w'] += weight
    if row.get('won'):
        stat['wins_w'] += weight
        stat['profit_w'] += (to_float(row.get('odds')) - 1.0) * weight
    else:
        stat['profit_w'] -= 1.0 * weight
    stat['edge_sum'] += to_float(row.get('edge_pct'))
    stat['odds_sum'] += to_float(row.get('odds'))


def finalize_stat(stat):
    raw_bets = to_int(stat.get('raw_bets'))
    bets_w = to_float(stat.get('bets_w'))
    if raw_bets <= 0 or bets_w <= 0:
        return None
    wins_w = to_float(stat.get('wins_w'))
    profit_w = to_float(stat.get('profit_w'))
    roi = (profit_w * 100.0 / bets_w) if bets_w else 0.0
    winrate = (wins_w * 100.0 / bets_w) if bets_w else 0.0
    avg_edge = to_float(stat.get('edge_sum')) / raw_bets if raw_bets else 0.0
    avg_odds = to_float(stat.get('odds_sum')) / raw_bets if raw_bets else 0.0
    sample_factor = min(1.0, raw_bets / 12.0)
    score = (roi * 0.28) + ((winrate - 54.0) * 0.16) + (avg_edge * 0.70)
    score *= sample_factor
    out = dict(stat)
    out.update({
        'wins': int(round(wins_w)),
        'losses': max(0, raw_bets - int(round(wins_w))),
        'roi': round(roi, 2),
        'winrate': round(winrate, 2),
        'profit': round(profit_w, 3),
        'avg_edge': round(avg_edge, 2),
        'avg_odds': round(avg_odds, 3),
        'memory_score': round(clamp(score, -12.0, 12.0), 2),
    })
    return out


def build_patterns(rows, now_utc):
    patterns = {}
    for row in rows:
        weight = recency_weight(row.get('settled_at') or row.get('event_date'), now_utc)
        market_key = row.get('market_key') or '—'
        market_label = row.get('market') or market_key
        league = row.get('league') or 'Unknown'
        update_stat(patterns, 'market', market_key, market_label, row, weight)
        update_stat(patterns, 'market_league', f'{market_key}|{league}', f'{market_label} • {league}', row, weight)
        update_stat(patterns, 'market_odds', f'{market_key}|{odds_bucket(row.get("odds"))}', f'{market_label} • cote {odds_bucket(row.get("odds"))}', row, weight)
        update_stat(patterns, 'market_conf', f'{market_key}|{conf_bucket(row.get("confidence"))}', f'{market_label} • conf {conf_bucket(row.get("confidence"))}', row, weight)
        update_stat(patterns, 'market_edge', f'{market_key}|{edge_bucket(row.get("edge_pct"))}', f'{market_label} • edge {edge_bucket(row.get("edge_pct"))}', row, weight)
        wd = weekday_label(row.get('event_date'))
        if wd != '—':
            update_stat(patterns, 'market_weekday', f'{market_key}|{wd}', f'{market_label} • {wd}', row, weight)
        src = source_label(row)
        if src != '—':
            update_stat(patterns, 'market_source', f'{market_key}|{src}', f'{market_label} • {src}', row, weight)
    flat = []
    final = {}
    for kind, bucket in patterns.items():
        final[kind] = {}
        for key, stat in bucket.items():
            fin = finalize_stat(stat)
            if not fin:
                continue
            final[kind][key] = fin
            flat.append(fin)
    return final, flat


def select_diverse(rows, limit=10, max_per_market=2):
    out = []
    per_market = {}
    for row in rows:
        market = str(row.get('key') or '').split('|', 1)[0]
        if per_market.get(market, 0) >= max_per_market:
            continue
        out.append(row)
        per_market[market] = per_market.get(market, 0) + 1
        if len(out) >= limit:
            break
    return out


def lookup(patterns, kind, key, min_bets=5):
    row = patterns.get(kind, {}).get(key)
    if not row or to_int(row.get('raw_bets')) < min_bets:
        return None
    return row


def merge_patterns(base_rows, extra_rows, positive=True):
    merged = {}
    for row in (base_rows or []) + (extra_rows or []):
        key = f"{row.get('kind')}::{row.get('key')}"
        current = merged.get(key)
        if not current:
            merged[key] = dict(row)
            continue
        if positive:
            better = row if to_float(row.get('memory_score')) > to_float(current.get('memory_score')) else current
        else:
            better = row if to_float(row.get('memory_score')) < to_float(current.get('memory_score')) else current
        merged[key] = better
    rows = list(merged.values())
    rows.sort(key=lambda r: (abs(to_float(r.get('memory_score'))), to_int(r.get('raw_bets'))), reverse=True)
    return select_diverse(rows, limit=12, max_per_market=3)


def enhance_ai_memory():
    now_utc = datetime.now(timezone.utc)
    base = load_existing_json('ai_memory.json', {}) or {}
    base_picks = list(base.get('adaptive_picks') or [])
    journal = journal_rows()
    patterns, flat = build_patterns(journal, now_utc)

    positive = sorted([r for r in flat if to_int(r.get('raw_bets')) >= 5 and to_float(r.get('memory_score')) > 0], key=lambda r: (to_float(r.get('memory_score')), to_float(r.get('roi')), to_int(r.get('raw_bets'))), reverse=True)
    negative = sorted([r for r in flat if to_int(r.get('raw_bets')) >= 5 and to_float(r.get('memory_score')) < 0], key=lambda r: (to_float(r.get('memory_score')), -to_int(r.get('raw_bets'))))
    top_patterns = merge_patterns(base.get('top_patterns') or [], select_diverse(positive, limit=12, max_per_market=3), positive=True)
    avoid_patterns = merge_patterns(base.get('avoid_patterns') or [], select_diverse(negative, limit=12, max_per_market=3), positive=False)

    enhanced_picks = []
    for row in base_picks:
        market_key = row.get('market_key') or '—'
        market_label = row.get('market') or market_key
        league = row.get('league') or 'Unknown'
        checks = [
            ('market', market_key, 8, 0.55, market_label),
            ('market_league', f'{market_key}|{league}', 5, 0.75, f'{market_label} în {league}'),
            ('market_odds', f'{market_key}|{odds_bucket(row.get("odds"))}', 5, 0.24, f'{market_label} la cote {odds_bucket(row.get("odds"))}'),
            ('market_conf', f'{market_key}|{conf_bucket(row.get("confidence"))}', 5, 0.20, f'{market_label} la conf {conf_bucket(row.get("confidence"))}'),
            ('market_edge', f'{market_key}|{edge_bucket(row.get("edge_pct"))}', 5, 0.18, f'{market_label} la edge {edge_bucket(row.get("edge_pct"))}'),
            ('market_weekday', f'{market_key}|{weekday_label(row.get("event_date"))}', 5, 0.12, f'{market_label} în {weekday_label(row.get("event_date"))}'),
        ]
        journal_bonus = 0.0
        journal_reasons = []
        for kind, key, min_bets, weight, label in checks:
            stat = lookup(patterns, kind, key, min_bets=min_bets)
            if not stat:
                continue
            impact = to_float(stat.get('memory_score')) * weight
            journal_bonus += impact
            if abs(impact) >= 0.9:
                journal_reasons.append({
                    'label': f'Journal: {label}',
                    'impact': round(impact, 2),
                    'bets': to_int(stat.get('raw_bets')),
                    'roi': round(to_float(stat.get('roi')), 2),
                })
        journal_bonus = round(clamp(journal_bonus, -6.0, 6.0), 2)
        base_bonus = to_float(row.get('memory_bonus'))
        total_bonus = round(clamp(base_bonus + journal_bonus, -12.0, 12.0), 2)
        base_score = to_float(row.get('base_score') if row.get('base_score') is not None else row.get('adaptive_score'))
        adaptive_score = round(base_score + total_bonus, 2)
        new_row = dict(row)
        new_row['base_memory_bonus'] = round(base_bonus, 2)
        new_row['journal_memory_bonus'] = journal_bonus
        new_row['memory_bonus'] = total_bonus
        new_row['adaptive_score'] = adaptive_score
        if journal_bonus >= 2.5:
            new_row['learning_state'] = 'accelerating'
        elif journal_bonus <= -2.5:
            new_row['learning_state'] = 'cautious'
        else:
            new_row['learning_state'] = 'stable'
        reasons = list(new_row.get('reasons') or [])
        new_row['reasons'] = (journal_reasons[:2] + reasons)[:6]
        enhanced_picks.append(new_row)

    enhanced_picks.sort(key=lambda r: (to_float(r.get('adaptive_score')), to_float(r.get('memory_bonus')), to_float(r.get('adjusted_prob'))), reverse=True)

    base['updated_at'] = now_utc.isoformat()
    base['version'] = 'v1.2-journal-linked-adaptive-memory'
    base['journal_learning'] = {
        'rows_settled': len(journal),
        'positive_patterns': len([r for r in positive if to_float(r.get('memory_score')) > 0]),
        'negative_patterns': len([r for r in negative if to_float(r.get('memory_score')) < 0]),
        'updated_at': now_utc.isoformat(),
    }
    base['top_patterns'] = top_patterns
    base['avoid_patterns'] = avoid_patterns
    base['adaptive_picks'] = enhanced_picks[:12]
    summary = dict(base.get('summary') or {})
    summary['journal_rows_settled'] = len(journal)
    summary['adaptive_picks_journal_adjusted'] = len(base['adaptive_picks'])
    base['summary'] = summary
    notes = list(base.get('notes') or [])
    notes.append('AI Memory V1.2 conectează SmartBet Engine la recommendation_journal și adaugă bonusuri/penalizări de învățare pe termen lung.')
    notes.append('Pattern-urile din jurnal sunt ponderate cu recență, astfel încât memoria rămâne adaptivă când intră rezultate noi.')
    base['notes'] = notes[-6:]
    save_json(base, 'ai_memory.json')
    save_json({
        'updated_at': now_utc.isoformat(),
        'version': base['version'],
        'journal_rows_settled': len(journal),
        'adaptive_picks': len(base['adaptive_picks']),
        'top_patterns': len(top_patterns),
        'avoid_patterns': len(avoid_patterns),
    }, 'ai_memory_learning_summary.json')
    print(json.dumps(base.get('summary') or {}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    enhance_ai_memory()
