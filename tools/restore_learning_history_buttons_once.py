from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
index = ROOT / 'index.html'
changed = False

buttons = '''        <button class="btn btn-ghost" style="font-size:11px;padding:7px 12px" onclick="switchTab('istoricfull')">📋 Jurnal complet →</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:7px 12px" onclick="switchTab('apihistory')">🌐 Baza API →</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:7px 12px" onclick="switchTab('traininglab')">🤖 Model AI →</button>'''

if index.exists():
    html = index.read_text(encoding='utf-8')
    if "switchTab('istoricfull')" not in html and "switchTab('apihistory')" not in html and "switchTab('traininglab')" not in html:
        marker = '      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">\n      </div>'
        replacement = '      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">\n' + buttons + '\n      </div>'
        if marker not in html:
            raise RuntimeError('Target empty learning buttons container not found')
        html = html.replace(marker, replacement, 1)
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
