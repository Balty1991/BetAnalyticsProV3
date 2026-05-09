from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
html_path = ROOT / 'index.html'
report_path = ROOT / 'cleanup_tab_audit.json'

html = html_path.read_text(encoding='utf-8') if html_path.exists() else ''

tabs = sorted(set(re.findall(r'id=["\']tab-([a-zA-Z0-9_-]+)["\']', html)))
switches = sorted(set(re.findall(r'switchTab\(["\']([a-zA-Z0-9_-]+)["\']\)', html)))
data_tabs = sorted(set(re.findall(r'data-tab=["\']([a-zA-Z0-9_-]+)["\']', html)))

# main/visible entry points are explicit switchTab calls or nav data-tab values.
visible_or_reachable = sorted(set(switches) | set(data_tabs))
orphans = sorted([t for t in tabs if t not in visible_or_reachable])
missing_containers = sorted([t for t in visible_or_reachable if ('tab-' + t) not in ['tab-' + x for x in tabs] and t not in ['more']])

report = {
    'tab_containers': tabs,
    'switchTab_calls': switches,
    'data_tab_buttons': data_tabs,
    'visible_or_reachable': visible_or_reachable,
    'orphan_tab_containers': orphans,
    'reachable_without_tab_container': missing_containers,
    'notes': [
        'Dashboard intentionally remains reachable but empty.',
        'more is a menu/panel control, not a tab-content container.',
        'Do not delete reachable tabs without checking whether they are opened from Mai mult or internal buttons.'
    ]
}

report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
