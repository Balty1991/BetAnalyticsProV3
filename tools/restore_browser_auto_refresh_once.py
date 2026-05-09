from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False

perf = ROOT / 'assets/performance-patch.js'
if perf.exists():
    text = perf.read_text(encoding='utf-8')
    original = text
    text = re.sub(
        r"\n\s*// Legacy auto refresh every 15 minutes\. Manual refresh button remains available\.\n\s*if \(ms === 900000 && \(name === 'doRefresh' \|\| src\.indexOf\('doRefresh'\) >= 0\)\) \{\n\s*console\.info\('\[BA\] skipped legacy doRefresh interval'\);\n\s*return 0;\n\s*\}\n",
        "\n      // Keep app data auto-refresh active. doRefresh every 15 minutes must run.\n",
        text,
        flags=re.S,
    )
    if text != original:
        perf.write_text(text, encoding='utf-8')
        changed = True

index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    original = html
    html = re.sub(
        r"(\.\/assets\/performance-patch\.js\?v=)[^\"']+",
        r"\g<1>20260509autorefresh1",
        html,
        count=1,
    )
    if html != original:
        index.write_text(html, encoding='utf-8')
        changed = True

# Validate JS syntax for the loaded app file.
app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
