from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXT = {'.html', '.js', '.css', '.json', '.md', '.txt', '.py'}

files = [p for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts and p.suffix.lower() in TEXT_EXT]

report = {
    'index_visible_generator_controls': [],
    'index_hidden_generator_controls': [],
    'index_ticket_related_ids': [],
    'js_generator_functions': [],
    'js_ticket_related_functions': [],
    'js_generator_calls': [],
    'ticket_storage_keys': [],
    'summary': {},
    'notes': []
}

html_path = ROOT / 'index.html'
html = html_path.read_text(encoding='utf-8', errors='ignore') if html_path.exists() else ''

# Extract button-like controls that mention generator/bilet or call generator functions.
button_re = re.compile(r'<button\b[\s\S]*?</button>', re.I)
for m in button_re.finditer(html):
    block = m.group(0)
    low = block.lower()
    if any(k in low for k in ['generează', 'genereaza', 'generator', 'bilet', 'ticket', 'generate']):
        line = html[:m.start()].count('\n') + 1
        text = re.sub(r'<[^>]+>', ' ', block)
        text = re.sub(r'\s+', ' ', text).strip()
        onclick = re.search(r'onclick=["\']([^"\']+)["\']', block, re.I)
        item = {
            'line': line,
            'text': text[:220],
            'onclick': onclick.group(1) if onclick else '',
            'html_preview': block[:260].replace('\n', ' ')
        }
        if 'display:none' in low or 'display: none' in low or 'display:none!important' in low or 'hidden' in low:
            report['index_hidden_generator_controls'].append(item)
        else:
            report['index_visible_generator_controls'].append(item)

# Extract ids related to tickets/generators.
for m in re.finditer(r'id=["\']([^"\']*(?:ticket|bilet|generator)[^"\']*)["\']', html, re.I):
    report['index_ticket_related_ids'].append({'line': html[:m.start()].count('\n') + 1, 'id': m.group(1)})

# JS function and call scanning.
fn_re = re.compile(r'function\s+([A-Za-z0-9_$]+)\s*\(', re.I)
call_re = re.compile(r'\b([A-Za-z0-9_$]*(?:generate|generator|ticket|bilet)[A-Za-z0-9_$]*)\s*\(', re.I)
storage_re = re.compile(r'(?:localStorage\.(?:getItem|setItem|removeItem)\(|localStorage\[[^\]]+\])\s*["\']([^"\']*(?:ticket|bilet|cota2|pyramid|journal|tracking)[^"\']*)["\']', re.I)

for p in files:
    rel = str(p.relative_to(ROOT))
    try:
        text = p.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    if rel == 'index.html':
        continue

    for m in fn_re.finditer(text):
        name = m.group(1)
        low = name.lower()
        if 'generate' in low or 'generator' in low:
            report['js_generator_functions'].append({'file': rel, 'line': text[:m.start()].count('\n') + 1, 'name': name})
        if 'ticket' in low or 'bilet' in low:
            report['js_ticket_related_functions'].append({'file': rel, 'line': text[:m.start()].count('\n') + 1, 'name': name})

    for m in call_re.finditer(text):
        name = m.group(1)
        # ignore definitions already captured, but keep call map capped.
        if len(report['js_generator_calls']) < 350:
            report['js_generator_calls'].append({'file': rel, 'line': text[:m.start()].count('\n') + 1, 'name': name})

    for m in storage_re.finditer(text):
        key = m.group(1)
        item = {'file': rel, 'line': text[:m.start()].count('\n') + 1, 'key': key}
        if item not in report['ticket_storage_keys']:
            report['ticket_storage_keys'].append(item)

# Categorize likely active generators by visible inline controls.
visible_onclicks = [x['onclick'] for x in report['index_visible_generator_controls']]
visible_texts = [x['text'] for x in report['index_visible_generator_controls']]
fn_names = {x['name'] for x in report['js_generator_functions']}

def has_visible_call(name):
    return any(name in o for o in visible_onclicks)

report['summary'] = {
    'visible_generator_controls_count': len(report['index_visible_generator_controls']),
    'hidden_generator_controls_count': len(report['index_hidden_generator_controls']),
    'generator_functions_count': len(report['js_generator_functions']),
    'ticket_related_functions_count': len(report['js_ticket_related_functions']),
    'likely_visible_generators': [],
    'likely_code_only_generators': [],
}

for name in sorted(fn_names):
    item = {'function': name, 'visible_onclick': has_visible_call(name)}
    if item['visible_onclick']:
        report['summary']['likely_visible_generators'].append(item)
    else:
        # Keep likely real generators, ignore helper names with very generic patterns if possible.
        if any(k in name.lower() for k in ['ticket', 'bilet', 'unified', 'smart', 'pyramid', 'daily']):
            report['summary']['likely_code_only_generators'].append(item)

# Human-readable markdown.
md = []
md.append('# Ticket generator audit')
md.append('')
md.append('## Summary')
for k, v in report['summary'].items():
    if isinstance(v, list):
        continue
    md.append(f'- {k}: {v}')
md.append('')
md.append('## Visible generator controls in index.html')
if report['index_visible_generator_controls']:
    for x in report['index_visible_generator_controls']:
        md.append(f"- L{x['line']}: `{x['text']}` — onclick: `{x['onclick']}`")
else:
    md.append('- none')
md.append('')
md.append('## Hidden generator controls in index.html')
if report['index_hidden_generator_controls']:
    for x in report['index_hidden_generator_controls']:
        md.append(f"- L{x['line']}: `{x['text']}` — onclick: `{x['onclick']}`")
else:
    md.append('- none')
md.append('')
md.append('## Generator functions found')
if report['js_generator_functions']:
    for x in report['js_generator_functions'][:120]:
        md.append(f"- `{x['name']}` in `{x['file']}` L{x['line']}")
else:
    md.append('- none')
md.append('')
md.append('## Ticket-related storage keys')
if report['ticket_storage_keys']:
    for x in report['ticket_storage_keys'][:120]:
        md.append(f"- `{x['key']}` in `{x['file']}` L{x['line']}")
else:
    md.append('- none')
md.append('')
md.append('## Likely visible generator functions')
if report['summary']['likely_visible_generators']:
    for x in report['summary']['likely_visible_generators']:
        md.append(f"- `{x['function']}`")
else:
    md.append('- none')
md.append('')
md.append('## Likely code-only generator functions')
if report['summary']['likely_code_only_generators']:
    for x in report['summary']['likely_code_only_generators'][:80]:
        md.append(f"- `{x['function']}`")
else:
    md.append('- none')

(ROOT / 'cleanup_ticket_generator_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
(ROOT / 'cleanup_ticket_generator_audit.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
