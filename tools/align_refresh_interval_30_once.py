from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False


def write_if_changed(path, text):
    global changed
    p = ROOT / path
    old = p.read_text(encoding='utf-8')
    if old != text:
        p.write_text(text, encoding='utf-8')
        changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    js = app.read_text(encoding='utf-8')
    old = js
    # Align browser data refresh with the external cron cadence: 30 minutes.
    js = re.sub(r'setInterval\s*\(\s*doRefresh\s*,\s*900000\s*\)', 'setInterval(doRefresh, 1800000)', js)
    js = re.sub(r'setInterval\s*\(\s*function\s*\(\s*\)\s*\{\s*doRefresh\s*\(\s*\)\s*;?\s*\}\s*,\s*900000\s*\)', 'setInterval(function(){ doRefresh(); }, 1800000)', js)
    if js != old:
        write_if_changed('assets/app.js', js)

perf = ROOT / 'assets/performance-patch.js'
if perf.exists():
    text = perf.read_text(encoding='utf-8')
    text = text.replace('doRefresh every 15 minutes must run.', 'doRefresh must remain active; external cron cadence is 30 minutes.')
    write_if_changed('assets/performance-patch.js', text)

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    html = re.sub(r'(\.\/assets\/performance-patch\.js\?v=)[^\"\']+', r'\g<1>20260509autorefresh30', html, count=1)
    html = re.sub(r'(\.\/assets\/app\.js\?v=)[^\"\']+', r'\g<1>20260509autorefresh30', html, count=1)
    write_if_changed('index.html', html)

if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
