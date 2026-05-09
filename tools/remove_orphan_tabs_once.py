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


def remove_balanced_div(html: str, element_id: str) -> str:
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
            return html[:start] + html[end:]
    raise RuntimeError(f'Could not balance div for {element_id}')

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    for element_id in ['tab-bankroll', 'tab-charts', 'tab-tracking']:
        html = remove_balanced_div(html, element_id)
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
