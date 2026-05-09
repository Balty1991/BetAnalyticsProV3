from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False
removed = []
kept = []

candidates = sorted((ROOT / 'assets').glob('index-*')) if (ROOT / 'assets').exists() else []
valid_suffixes = {'.js', '.css'}
candidates = [p for p in candidates if p.suffix in valid_suffixes]

# Read text-like files only, excluding the candidate itself and .git.
search_files = []
for p in ROOT.rglob('*'):
    if not p.is_file():
        continue
    if '.git' in p.parts:
        continue
    if p.suffix.lower() in {'.html', '.js', '.css', '.json', '.yml', '.yaml', '.md', '.txt', '.py'}:
        search_files.append(p)

for candidate in candidates:
    name = candidate.name
    refs = []
    for p in search_files:
        if p == candidate:
            continue
        try:
            text = p.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        if name in text or ('assets/' + name) in text or ('./assets/' + name) in text:
            refs.append(str(p.relative_to(ROOT)))
    if refs:
        kept.append({'file': str(candidate.relative_to(ROOT)), 'refs': refs[:20]})
    else:
        candidate.unlink()
        removed.append(str(candidate.relative_to(ROOT)))
        changed = True

report = ['Unused index bundle cleanup', '', 'Removed:']
report += ['- ' + x for x in removed] or ['- none']
report += ['', 'Kept because referenced:']
for item in kept:
    report.append('- ' + item['file'] + ' referenced by ' + ', '.join(item['refs']))
if not kept:
    report.append('- none')
(ROOT / 'cleanup_unused_index_bundles_report.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('\n'.join(report))
print('changed=' + str(changed))
