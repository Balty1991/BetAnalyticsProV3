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

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    html = re.sub(
        r'\n\s*<div class="section memory-panel memory-mix"[\s\S]*?<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">\s*</div>\s*</div>',
        '',
        html,
        flags=re.I,
    )
    html = re.sub(r'\n\s*<button\b(?=[^>]*generateUnifiedTicket)[\s\S]*?</button>', '', html, flags=re.I)
    html = re.sub(r'\n\s*<div id="unified-ticket-output"></div>', '', html, flags=re.I)
    html = re.sub(r'\n{4,}', '\n\n\n', html)
    write_if_changed('index.html', html)

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
