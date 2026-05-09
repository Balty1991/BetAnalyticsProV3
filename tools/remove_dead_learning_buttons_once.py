from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    original = html
    dead_tabs = ['apihistory', 'istoricfull', 'traininglab']
    for tab in dead_tabs:
        html = re.sub(
            r'\n\s*<button\b(?=[^>]*onclick=["\'][^"\']*switchTab\(["\']' + re.escape(tab) + r'["\']\)[^"\']*["\'])[^>]*>[\s\S]*?<\/button>',
            '',
            html,
            flags=re.I
        )
    html = re.sub(r'\n{4,}', '\n\n\n', html)
    if html != original:
        index.write_text(html, encoding='utf-8')
        changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
