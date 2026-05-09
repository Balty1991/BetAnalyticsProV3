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


def find_block_end(src: str, start: int, tag_name: str = 'div') -> int:
    depth = 0
    tag_re = re.compile(r'</?%s\b[^>]*>' % re.escape(tag_name), re.I)
    for m in tag_re.finditer(src, start):
        tag = m.group(0).lower()
        if tag.startswith('</'):
            depth -= 1
        else:
            depth += 1
        if depth == 0:
            return m.end()
    return -1


def remove_html_block_containing(html: str, marker: str) -> str:
    pos = html.find(marker)
    if pos < 0:
        return html
    start = html.rfind('<div', 0, pos)
    if start < 0:
        return html
    end = find_block_end(html, start, 'div')
    if end < 0:
        return html
    return html[:start] + html[end:]

# Remove the non-pyramid Unified Ticket Generator panel from SmartBet UI.
index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    # First-pass marker before buttons were removed.
    html = remove_html_block_containing(html, 'Generator Bilet Unificat')
    # Second-pass marker after the title/buttons were removed but the empty output panel remained.
    html = remove_html_block_containing(html, 'unified-ticket-output')
    html = re.sub(
        r'\n\s*<button\b(?=[^>]*onclick=["\'][^"\']*generateUnifiedTicket\([^"\']*["\'])[^>]*>[\s\S]*?<\/button>',
        '',
        html,
        flags=re.I,
    )
    html = re.sub(r'\n{4,}', '\n\n\n', html)
    write_if_changed('index.html', html)

# Remove stale duplicate data/app.js if the public app does not reference it.
data_app = ROOT / 'data/app.js'
if data_app.exists():
    refs = []
    for p in ROOT.rglob('*'):
        if not p.is_file() or '.git' in p.parts or p == data_app:
            continue
        if p.suffix.lower() not in {'.html', '.js', '.css', '.json', '.yml', '.yaml', '.md', '.txt', '.py'}:
            continue
        try:
            txt = p.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        if 'data/app.js' in txt or './data/app.js' in txt:
            refs.append(str(p.relative_to(ROOT)))
    if not refs:
        data_app.unlink()
        changed = True

# Keep pyramid runtime untouched and validate loaded app.js.
app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
