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
    html = re.sub(r'\n\s*<script\b[^>]*src=["\']\.\/assets\/pro_command_center\.js[^"\']*["\'][^>]*><\/script>', '', html, flags=re.I)
    write_if_changed('index.html', html)

stub = ROOT / 'assets/pro_command_center.js'
if stub.exists():
    stub.unlink()
    changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
