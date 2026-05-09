from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
changed = False
removed = []
kept = []

for rel in [
    'cleanup_ticket_generator_audit.json',
    'cleanup_ticket_generator_audit.md',
    'cleanup_deep_audit_report.json',
    'cleanup_deep_audit_report.md',
]:
    p = ROOT / rel
    if p.exists():
        p.unlink()
        removed.append(rel)
        changed = True

# Check whether data/app.js is referenced outside temporary/report/tool files.
data_app = ROOT / 'data/app.js'
if data_app.exists():
    refs = []
    ignored_names = {
        'cleanup_ticket_generator_audit.json',
        'cleanup_ticket_generator_audit.md',
        'cleanup_deep_audit_report.json',
        'cleanup_deep_audit_report.md',
        'final_temp_and_data_app_cleanup_once.py',
    }
    for p in ROOT.rglob('*'):
        if not p.is_file() or '.git' in p.parts or p == data_app:
            continue
        if p.name in ignored_names:
            continue
        if p.suffix.lower() not in {'.html', '.js', '.css', '.json', '.yml', '.yaml', '.md', '.txt', '.py'}:
            continue
        try:
            txt = p.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        if 'data/app.js' in txt or './data/app.js' in txt:
            refs.append(str(p.relative_to(ROOT)))
    if refs:
        kept.append('data/app.js referenced by: ' + ', '.join(refs[:20]))
    else:
        data_app.unlink()
        removed.append('data/app.js')
        changed = True

app = ROOT / 'assets/app.js'
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('removed=' + ', '.join(removed) if removed else 'removed=none')
print('kept=' + ' | '.join(kept) if kept else 'kept=none')
print('changed=' + str(changed))
