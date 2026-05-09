from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False


def write_if_changed(path: str, text: str):
    global changed
    p = ROOT / path
    old = p.read_text(encoding='utf-8') if p.exists() else ''
    if old != text:
        p.write_text(text, encoding='utf-8')
        changed = True


def replace_balanced_div(html: str, element_id: str, replacement: str) -> str:
    m = re.search(r'<div\b[^>]*\bid=["\']' + re.escape(element_id) + r'["\'][^>]*>', html, re.I)
    if not m:
        return html
    start = m.start()
    depth = 0
    for t in re.finditer(r'</?div\b[^>]*>', html[start:], re.I):
        tag = t.group(0).lower()
        if tag.startswith('</'):
            depth -= 1
        else:
            depth += 1
        if depth == 0:
            end = start + t.end()
            return html[:start] + replacement + html[end:]
    return html


# 1) Remove real Dashboard DOM content, keep the Dashboard tab container.
index_path = ROOT / 'index.html'
if index_path.exists():
    html = index_path.read_text(encoding='utf-8')
    blank_dashboard = '  <div class="tab-content active" id="tab-dashboard"></div>\n'
    html = replace_balanced_div(html, 'tab-dashboard', blank_dashboard)
    write_if_changed('index.html', html)

# 2) Prevent Dashboard rendering if legacy code tries to render it.
app_path = ROOT / 'assets/app.js'
if app_path.exists():
    js = app_path.read_text(encoding='utf-8')

    # Remove known direct dashboard-heavy calls. Keep data loading and active tabs intact.
    dashboard_calls = [
        'renderModernDashboard',
        'renderDashboardTab',
        'renderDashboard',
        'renderDashboardStats',
        'renderDashboardVisuals',
        'renderDashboardMonitor',
        'renderTodayBest',
        'renderTopPicks',
        'renderTopSafe',
        'renderFocusPanel',
        'renderMarketPerformance',
        'renderBacktestSummary'
    ]
    for fn in dashboard_calls:
        js = re.sub(r'\n\s*' + re.escape(fn) + r'\s*\([^;]*\)\s*;', '', js)

    # If renderActiveTab has a dashboard branch, make it a no-op branch.
    js = re.sub(
        r"if\s*\(\s*name\s*===\s*['\"]dashboard['\"]\s*\)\s*\{[\s\S]*?return;\s*\}",
        "if(name === 'dashboard'){\n    markTabRendered('dashboard');\n    return;\n  }",
        js,
        count=1
    )

    # Safety no-op override for future hooks after file load.
    guard = """

// Dashboard removed from active app: no-op legacy dashboard renderers.
(function(){
  'use strict';
  window.__BA_DASHBOARD_REMOVED = true;
  var names = [
    'renderModernDashboard','renderDashboardTab','renderDashboard','renderDashboardStats',
    'renderDashboardVisuals','renderDashboardMonitor','renderTodayBest','renderTopPicks',
    'renderTopSafe','renderFocusPanel','renderMarketPerformance','renderBacktestSummary'
  ];
  names.forEach(function(name){
    try { window[name] = function(){ return null; }; } catch(e) {}
  });
})();
"""
    if '__BA_DASHBOARD_REMOVED' not in js:
        js += guard

    write_if_changed('assets/app.js', js)

# 3) CSS no longer needs to hide children of Dashboard because DOM content is gone.
css_path = ROOT / 'assets/pro_command_center.css'
if css_path.exists():
    css = css_path.read_text(encoding='utf-8')
    css = re.sub(r'\n#tab-dashboard > \*\{[^}]*\}\n#tab-dashboard\{[^}]*\}', '\n#tab-dashboard{min-height:calc(100vh - 150px);background:transparent!important;border-color:transparent!important;box-shadow:none!important}', css)
    write_if_changed('assets/pro_command_center.css', css)

if app_path.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
