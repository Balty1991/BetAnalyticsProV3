from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXT = {'.html', '.js', '.css', '.json', '.md', '.txt', '.py', '.yml', '.yaml'}
terms = [
    'ML5 activ',
    'date contextuale',
    'API sync',
    'ML5',
    'sync',
    'toast',
    'snackbar',
    'showToast',
    'notify',
    'bottom',
]

results = []
for p in ROOT.rglob('*'):
    if not p.is_file() or '.git' in p.parts:
        continue
    if p.suffix.lower() not in TEXT_EXT:
        continue
    try:
        text = p.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    rel = str(p.relative_to(ROOT))
    for i, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        matched = [t for t in terms if t.lower() in low]
        if matched:
            results.append({
                'file': rel,
                'line': i,
                'terms': matched,
                'preview': line.strip()[:240]
            })

# Prioritize likely popup/toast sources.
def score(r):
    s = 0
    txt = (r['file'] + ' ' + r['preview']).lower()
    for k in ['toast','snackbar','api sync','ml5 activ','date contextuale','fixed','bottom','status']:
        if k in txt:
            s += 5
    if r['file'].startswith('assets/'):
        s += 3
    if r['file'].endswith('.js'):
        s += 2
    return -s, r['file'], r['line']

results_sorted = sorted(results, key=score)
report = {
    'total_hits': len(results),
    'top_hits': results_sorted[:200],
}
(ROOT / 'cleanup_popup_messages_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

md = ['# Popup message audit', '', f'Total hits: {len(results)}', '']
for r in results_sorted[:120]:
    md.append(f"- `{r['file']}` L{r['line']} terms={','.join(r['terms'])}: `{r['preview']}`")
(ROOT / 'cleanup_popup_messages_audit.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
