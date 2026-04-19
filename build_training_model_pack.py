#!/usr/bin/env python3
import json
import math
from datetime import datetime, timezone

from fetch_data import load_existing_json, save_json, TZ

MIN_ROWS_PER_MARKET = 150


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


def logistic(score):
    score = clamp(score, -12.0, 12.0)
    return 1.0 / (1.0 + math.exp(-score))


def brier(rows, prob_key, target_key):
    vals = []
    for row in rows:
        p = clamp(to_float(row.get(prob_key)) / 100.0, 0.0, 1.0)
        y = 1.0 if to_int(row.get(target_key)) == 1 else 0.0
        vals.append((p - y) ** 2)
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def hit_rate(rows, prob_key, target_key, threshold=50.0):
    if not rows:
        return 0.0
    wins = 0
    bets = 0
    for row in rows:
        prob = to_float(row.get(prob_key))
        if prob < threshold:
            continue
        bets += 1
        pred = 1 if prob >= threshold else 0
        y = to_int(row.get(target_key))
        wins += 1 if pred == y else 0
    return round((wins / bets) * 100.0, 2) if bets else 0.0


def avg(values):
    values = [to_float(v) for v in values]
    return round(sum(values) / len(values), 4) if values else 0.0


def score_home_win(row):
    score = 0.0
    score += 0.42 * (to_float(row.get('form_points_diff_5')) / 3.0)
    score += 0.36 * to_float(row.get('goal_diff_delta_5'))
    score += 0.15 * ((to_float(row.get('league_home_win_rate')) - to_float(row.get('league_away_win_rate'))) / 100.0)
    score += 0.07 * clamp(to_float(row.get('history_balance')) / 5.0, -1.0, 1.0)
    return logistic(score) * 100.0


def score_draw(row):
    closeness = 0.0
    closeness += max(0.0, 1.0 - abs(to_float(row.get('form_points_diff_5')) / 2.5)) * 0.35
    closeness += max(0.0, 1.0 - abs(to_float(row.get('goal_diff_delta_5')) / 1.8)) * 0.35
    closeness += (to_float(row.get('league_draw_rate')) / 100.0) * 0.30
    return clamp(closeness * 100.0, 0.0, 100.0)


def score_away_win(row):
    inv = dict(row)
    inv['form_points_diff_5'] = -to_float(row.get('form_points_diff_5'))
    inv['goal_diff_delta_5'] = -to_float(row.get('goal_diff_delta_5'))
    inv['history_balance'] = -to_float(row.get('history_balance'))
    inv['league_home_win_rate'] = row.get('league_away_win_rate')
    inv['league_away_win_rate'] = row.get('league_home_win_rate')
    return score_home_win(inv)


def score_btts(row):
    score = 0.0
    score += 0.28 * (to_float(row.get('home_btts_rate_5')) / 100.0)
    score += 0.28 * (to_float(row.get('away_btts_rate_5')) / 100.0)
    score += 0.18 * (to_float(row.get('league_btts_rate')) / 100.0)
    score += 0.13 * clamp((to_float(row.get('home_goals_for_avg_5')) + to_float(row.get('away_goals_for_avg_5'))) / 4.0, 0.0, 1.0)
    score += 0.13 * clamp((to_float(row.get('home_goals_against_avg_5')) + to_float(row.get('away_goals_against_avg_5'))) / 4.0, 0.0, 1.0)
    return clamp(score * 100.0, 0.0, 100.0)


def score_over25(row):
    score = 0.0
    score += 0.27 * (to_float(row.get('home_over25_rate_5')) / 100.0)
    score += 0.27 * (to_float(row.get('away_over25_rate_5')) / 100.0)
    score += 0.18 * (to_float(row.get('league_over25_rate')) / 100.0)
    score += 0.18 * clamp((to_float(row.get('home_goals_for_avg_5')) + to_float(row.get('away_goals_for_avg_5'))) / 4.2, 0.0, 1.0)
    score += 0.10 * clamp((to_float(row.get('home_goals_against_avg_5')) + to_float(row.get('away_goals_against_avg_5'))) / 4.2, 0.0, 1.0)
    return clamp(score * 100.0, 0.0, 100.0)


def score_under35(row):
    score = 0.0
    score += 0.32 * (to_float(row.get('home_under35_rate_5')) / 100.0)
    score += 0.32 * (to_float(row.get('away_under35_rate_5')) / 100.0)
    score += 0.22 * (to_float(row.get('league_under35_rate')) / 100.0)
    total_attack = to_float(row.get('home_goals_for_avg_5')) + to_float(row.get('away_goals_for_avg_5'))
    score += 0.14 * max(0.0, 1.0 - clamp(total_attack / 4.2, 0.0, 1.0))
    return clamp(score * 100.0, 0.0, 100.0)


def apply_scores(rows):
    out = []
    for row in rows or []:
        row = dict(row)
        row['model_prob_home_win'] = round(score_home_win(row), 2)
        row['model_prob_draw'] = round(score_draw(row), 2)
        row['model_prob_away_win'] = round(score_away_win(row), 2)
        row['model_prob_btts_yes'] = round(score_btts(row), 2)
        row['model_prob_over_25'] = round(score_over25(row), 2)
        row['model_prob_under_35'] = round(score_under35(row), 2)
        out.append(row)
    return out


def summarize_market(rows, label, prob_key, target_key):
    eligible = [r for r in rows if to_int(r.get('eligible_min5')) == 1]
    bets = len(eligible)
    return {
        'market': label,
        'rows': bets,
        'avg_prob': avg(r.get(prob_key) for r in eligible),
        'actual_rate': round((sum(to_int(r.get(target_key)) for r in eligible) * 100.0 / bets), 2) if bets else 0.0,
        'brier': brier(eligible, prob_key, target_key),
        'hit_rate_50': hit_rate(eligible, prob_key, target_key, threshold=50.0),
        'ready': bets >= MIN_ROWS_PER_MARKET,
    }


def build_pack(scored_rows):
    return {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'timezone': TZ,
        'version': 'phase2-rule-ensemble',
        'min_rows_per_market': MIN_ROWS_PER_MARKET,
        'markets': {
            '1X2': {
                'home_win': {'prob_key': 'model_prob_home_win', 'target_key': 'target_home_win'},
                'draw': {'prob_key': 'model_prob_draw', 'target_key': 'target_draw'},
                'away_win': {'prob_key': 'model_prob_away_win', 'target_key': 'target_away_win'}
            },
            'BTTS': {'prob_key': 'model_prob_btts_yes', 'target_key': 'target_btts_yes'},
            'Over2.5': {'prob_key': 'model_prob_over_25', 'target_key': 'target_over_25'},
            'Under3.5': {'prob_key': 'model_prob_under_35', 'target_key': 'target_under_35'}
        }
    }


def build_summary(scored_rows):
    eligible = [r for r in scored_rows if to_int(r.get('eligible_min5')) == 1]
    return {
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'version': 'phase2-rule-ensemble',
        'rows_total': len(scored_rows),
        'rows_eligible_min5': len(eligible),
        'markets': [
            summarize_market(scored_rows, 'Home Win', 'model_prob_home_win', 'target_home_win'),
            summarize_market(scored_rows, 'Draw', 'model_prob_draw', 'target_draw'),
            summarize_market(scored_rows, 'Away Win', 'model_prob_away_win', 'target_away_win'),
            summarize_market(scored_rows, 'BTTS Yes', 'model_prob_btts_yes', 'target_btts_yes'),
            summarize_market(scored_rows, 'Over 2.5', 'model_prob_over_25', 'target_over_25'),
            summarize_market(scored_rows, 'Under 3.5', 'model_prob_under_35', 'target_under_35')
        ],
        'feature_basis': [
            'form_points_diff_5', 'goal_diff_delta_5', 'league_home_win_rate', 'league_away_win_rate',
            'home_btts_rate_5', 'away_btts_rate_5', 'league_btts_rate',
            'home_over25_rate_5', 'away_over25_rate_5', 'league_over25_rate',
            'home_under35_rate_5', 'away_under35_rate_5', 'league_under35_rate'
        ]
    }


def main():
    print('=== Build training model pack ===')
    rows = load_existing_json('training_features.json', [])
    scored_rows = apply_scores(rows)
    pack = build_pack(scored_rows)
    summary = build_summary(scored_rows)
    save_json(pack, 'training_model_pack.json')
    save_json(summary, 'training_model_summary.json')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print('=== Done training model pack ===')


if __name__ == '__main__':
    main()
