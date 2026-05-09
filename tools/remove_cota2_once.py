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
    return html


def remove_cota2_buttons(html: str) -> str:
    # Remove any complete button block that references cota2 / Cota 2.
    def repl(m):
        block = m.group(0)
        low = block.lower()
        return '' if ('cota2' in low or 'cota 2' in low) else block
    return re.sub(r'\n\s*<button\b[\s\S]*?</button>', repl, html, flags=re.I)


def remove_function_blocks_containing(js: str, needles) -> str:
    starts = []
    for m in re.finditer(r'function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{', js):
        name = m.group(1).lower()
        if any(n in name for n in needles):
            starts.append(m.start())
    if not starts:
        return js

    def find_end(pos):
        brace = js.find('{', pos)
        if brace < 0:
            return pos
        depth = 0
        quote = None
        esc = False
        line_comment = False
        block_comment = False
        i = brace
        while i < len(js):
            c = js[i]
            n = js[i + 1] if i + 1 < len(js) else ''
            if line_comment:
                if c in '\r\n':
                    line_comment = False
                i += 1
                continue
            if block_comment:
                if c == '*' and n == '/':
                    block_comment = False
                    i += 2
                    continue
                i += 1
                continue
            if quote:
                if esc:
                    esc = False
                elif c == '\\':
                    esc = True
                elif c == quote:
                    quote = None
                i += 1
                continue
            if c == '/' and n == '/':
                line_comment = True
                i += 2
                continue
            if c == '/' and n == '*':
                block_comment = True
                i += 2
                continue
            if c in ('"', "'", '`'):
                quote = c
                i += 1
                continue
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        return pos

    ranges = [(s, find_end(s)) for s in starts]
    ranges = [(s, e) for s, e in ranges if e > s]
    ranges.sort()
    out = []
    cur = 0
    for s, e in ranges:
        if s < cur:
            continue
        out.append(js[cur:s])
        cur = e
    out.append(js[cur:])
    return ''.join(out)


# index.html
p = ROOT / 'index.html'
if p.exists():
    html = p.read_text(encoding='utf-8')
    html = remove_cota2_buttons(html)
    html = remove_balanced_div(html, 'tab-cota2')
    html = re.sub(r'\n\s*<!--[^>]*(?:cota2|Cota 2)[\s\S]*?-->', '', html, flags=re.I)
    write_if_changed('index.html', html)

# assets/app.js
p = ROOT / 'assets/app.js'
if p.exists():
    js = p.read_text(encoding='utf-8')
    js = re.sub(r'\n?var\s+COTA2_[A-Z0-9_]+\s*=\s*[^;]*;', '', js)
    js = re.sub(r'\n\s*renderCota2Section\s*\([^;]*\)\s*;', '', js)
    js = re.sub(r'\n\s*generateCota2[A-Za-z0-9_]*\s*\([^;]*\)\s*;', '', js)
    js = remove_function_blocks_containing(js, ['cota2'])
    write_if_changed('assets/app.js', js)

# CSS temporary hide block removal
p = ROOT / 'assets/pro_command_center.css'
if p.exists():
    css = p.read_text(encoding='utf-8')
    css = re.sub(r'\n/\* Cota 2 removed from visible app \*/[\s\S]*?\.more-card-btn\[onclick\*="cota2"\]\{[^}]*\}\n?', '\n', css)
    write_if_changed('assets/pro_command_center.css', css)

if (ROOT / 'assets/app.js').exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
