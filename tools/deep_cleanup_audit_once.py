from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXT = {'.html', '.js', '.css', '.json', '.yml', '.yaml', '.md', '.txt', '.py'}

files = [p for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts]
text_files = [p for p in files if p.suffix.lower() in TEXT_EXT]

patterns = {
    'cota2_leftovers': ['cota2', 'Cota 2', 'COTA2'],
    'dashboard_leftovers': ['renderModernDashboard', 'renderDashboardTab', 'renderDashboardVisuals', 'renderTodayBest', 'Top 2 pronosticuri', 'dashboard-modern-shell'],
    'removed_tab_leftovers': ['tab-tracking', 'tab-bankroll', 'tab-charts', "switchTab('tracking')", "switchTab('bankroll')", "switchTab('charts')"],
    'missing_container_switches': ["switchTab('apihistory')", "switchTab('istoricfull')", "switchTab('traininglab')"],
    'legacy_full_history': ['ensureFullHistoryAssets', 'full-history.js', 'full-history-hotfix.js'],
}

hits = {k: [] for k in patterns}
for p in text_files:
    try:
        text = p.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    rel = str(p.relative_to(ROOT))
    for group, terms in patterns.items():
        for term in terms:
            if term in text:
                # line numbers, capped
                lines = []
                for i, line in enumerate(text.splitlines(), 1):
                    if term in line:
                        lines.append({'line': i, 'term': term, 'preview': line.strip()[:180]})
                        if len(lines) >= 12:
                            break
                hits[group].append({'file': rel, 'matches': lines})
                break

# Rebuild current tab map after previous cleanup.
html = (ROOT / 'index.html').read_text(encoding='utf-8', errors='ignore') if (ROOT / 'index.html').exists() else ''
tab_containers = sorted(set(re.findall(r'id=["\']tab-([a-zA-Z0-9_-]+)["\']', html)))
switch_calls = sorted(set(re.findall(r'switchTab\(["\']([a-zA-Z0-9_-]+)["\']\)', html)))
data_tabs = sorted(set(re.findall(r'data-tab=["\']([a-zA-Z0-9_-]+)["\']', html)))
reachable = sorted(set(switch_calls) | set(data_tabs))
missing_containers = sorted([x for x in reachable if x != 'more' and x not in tab_containers])
orphan_containers = sorted([x for x in tab_containers if x not in reachable])

# Top large files, to guide future cleanup without deleting blindly.
large_files = []
for p in files:
    try:
        size = p.stat().st_size
    except Exception:
        continue
    if size >= 250_000:
        large_files.append({'file': str(p.relative_to(ROOT)), 'size_mb': round(size / 1024 / 1024, 2)})
large_files.sort(key=lambda x: x['size_mb'], reverse=True)

report = {
    'tab_containers_current': tab_containers,
    'reachable_current': reachable,
    'orphan_tab_containers_current': orphan_containers,
    'reachable_without_tab_container_current': missing_containers,
    'pattern_hits': hits,
    'large_files_over_250kb': large_files[:40],
    'safe_next_steps_suggested': []
}

# Suggestions, conservative.
if hits['cota2_leftovers']:
    report['safe_next_steps_suggested'].append('Review and remove remaining Cota 2 leftovers if they are not only historical notes.')
if hits['removed_tab_leftovers']:
    report['safe_next_steps_suggested'].append('Remove references to deleted tab containers tracking/bankroll/charts if only legacy render code remains.')
if missing_containers:
    report['safe_next_steps_suggested'].append('Fix or remove buttons that call tabs without containers: ' + ', '.join(missing_containers))
if hits['dashboard_leftovers']:
    report['safe_next_steps_suggested'].append('Review remaining Dashboard render functions/strings; delete only if no active tab uses them.')
if hits['legacy_full_history']:
    report['safe_next_steps_suggested'].append('Review full-history hotfix/runtime after checking Istoric and Baza de Invatare dependencies.')

out = ROOT / 'cleanup_deep_audit_report.json'
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

# Also write readable markdown.
md = []
md.append('# Deep cleanup audit')
md.append('')
md.append('## Current tab map')
md.append('- Containers: ' + ', '.join(tab_containers))
md.append('- Reachable: ' + ', '.join(reachable))
md.append('- Orphan containers: ' + (', '.join(orphan_containers) or 'none'))
md.append('- Reachable without container: ' + (', '.join(missing_containers) or 'none'))
md.append('')
md.append('## Pattern hits')
for group, entries in hits.items():
    md.append(f'### {group}')
    if not entries:
        md.append('- none')
    else:
        for entry in entries[:20]:
            md.append(f"- `{entry['file']}`")
            for match in entry['matches'][:5]:
                md.append(f"  - L{match['line']}: `{match['preview']}`")
    md.append('')
md.append('## Large files over 250 KB')
for item in large_files[:40]:
    md.append(f"- `{item['file']}` — {item['size_mb']} MB")
md.append('')
md.append('## Suggested next steps')
for s in report['safe_next_steps_suggested'] or ['No obvious safe deletion step detected.']:
    md.append('- ' + s)
(ROOT / 'cleanup_deep_audit_report.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

print(json.dumps(report, ensure_ascii=False, indent=2))
