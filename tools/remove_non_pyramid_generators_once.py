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
    # HTML-ish balanced div scanner for the static index.
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


def remove_html_block_containing(html: str, marker: str, search_back: str = '<div') -> str:
    pos = html.find(marker)
    if pos < 0:
        return html
    start = html.rfind(search_back, 0, pos)
    if start < 0:
        return html
    end = find_block_end(html, start, 'div')
    if end < 0:
        return html
    return html[:start] + html[end:]


def find_js_block_end(src: str, brace_pos: int) -> int:
    depth = 0
    quote = None
    esc = False
    line_comment = False
    block_comment = False
    i = brace_pos
    while i < len(src):
        c = src[i]
        n = src[i+1] if i + 1 < len(src) else ''
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
    return -1


def remove_named_function(src: str, name: str) -> str:
    pattern = re.compile(r'\n?function\s+' + re.escape(name) + r'\s*\([^)]*\)\s*\{')
    out = []
    cur = 0
    changed_local = False
    for m in pattern.finditer(src):
        brace = src.find('{', m.start())
        end = find_js_block_end(src, brace)
        if end < 0:
            continue
        out.append(src[cur:m.start()])
        cur = end
        changed_local = True
    if not changed_local:
        return src
    out.append(src[cur:])
    return ''.join(out)


def remove_functions(src: str, names) -> str:
    for name in names:
        src = remove_named_function(src, name)
    return src


def remove_legacy_generator_calls(src: str, names) -> str:
    # Remove direct calls/assignments for removed generator renderers and handlers where safe.
    for name in names:
        src = re.sub(r'\n\s*' + re.escape(name) + r'\s*\([^;\n]*\)\s*;', '', src)
    return src

# 1) Remove visible Unified Ticket Generator block from SmartBet UI.
index = ROOT / 'index.html'
if index.exists():
    html = index.read_text(encoding='utf-8')
    original = html
    html = remove_html_block_containing(html, 'Generator Bilet Unificat')
    html = re.sub(r'\n{4,}', '\n\n\n', html)
    write_if_changed('index.html', html)

# 2) Remove non-pyramid ticket generators from loaded app.js.
# Keep pyramid_daily_runtime.js untouched; it owns generateStepForSession and pyramid sessions.
non_pyramid_generator_functions = [
    'setGeneratorStatus',
    'handleGenerateAuditTicket',
    'handleGenerateAiMemoryTicket',
    'generateConservativeTicket',
    'generateTicket',
    'toggleAdvancedGenerators',
    'generateControlledComboTicket',
    'generateCustomTicket',
    'generateOver15Ticket',
    'generateOver35Ticket',
    'generateMixTicket',
    'generateBestEventTicket',
    'generateProfitFocusTicket',
    'generateBigWinTicket',
    'generatePortfolioTicket',
    'generateSinglePremiumTicket',
    'generateDoubleConfirmedTicket',
    'generateTripleValueTicket',
    'generateContrarianShotTicket',
    'generateAuditTicket',
    'generateAiMemoryTicket',
    'generateDailyPortfolioTickets',
    'handleGenerateDailyPortfolio',
    'getGeneratorAvailability',
    'generateAuditTicketVariant',
    'generateAiMemoryTicketVariant',
    'handleGenerateAuditTicketRelaxed',
    'handleGenerateAiMemoryTicketRelaxed',
    'renderAuditGenerators',
    'renderAiMemoryGenerators',
    'getSourcePoolForGenerator',
    'generatePortfolioTicketVariant',
    'handleGeneratePortfolioTicket',
    'handleGeneratePortfolioTicketRelaxed',
    'enhanceGeneratorCards',
    'updateGeneratorStatusBadges',
    'renderSmartBetGenerators',
    'handleGenerateSmartBetTicket',
    'generateUnifiedTicket',
]

app = ROOT / 'assets/app.js'
if app.exists():
    js = app.read_text(encoding='utf-8')
    js = remove_legacy_generator_calls(js, [
        'renderAuditGenerators',
        'renderAiMemoryGenerators',
        'renderSmartBetGenerators',
        'enhanceGeneratorCards',
        'updateGeneratorStatusBadges',
        'generateUnifiedTicket',
    ])
    js = remove_functions(js, non_pyramid_generator_functions)
    # Remove leftover safe/balanced/value visible generator references, if any.
    js = re.sub(r'\n\s*window\.(?:' + '|'.join(map(re.escape, non_pyramid_generator_functions)) + r')\s*=\s*[^;]+;', '', js)
    write_if_changed('assets/app.js', js)

# 3) Remove duplicate stale data/app.js if it is not referenced by the public app.
# It is a duplicate old copy and contains removed generators/Cota2. Delete only when no text file references it.
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

# 4) Syntax check loaded app.
if app.exists():
    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

print('changed=' + str(changed))
