from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    pattern = re.compile(r'\n\s*<script\b[^>]*src=["\']\.\/assets\/full-history-hotfix\.js[^"\']*["\'][^>]*>\s*<\/script>', re.I)
    matches = list(pattern.finditer(html))
    if len(matches) > 1:
        # Keep the first occurrence, remove all later duplicates.
        remove_ranges = [(m.start(), m.end()) for m in matches[1:]]
        out = []
        cur = 0
        for start, end in remove_ranges:
            out.append(html[cur:start])
            cur = end
        out.append(html[cur:])
        html2 = ''.join(out)
        if html2 != html:
            index.write_text(html2, encoding='utf-8')
            changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
