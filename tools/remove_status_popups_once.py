from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'assets/app.js'
changed = False


def remove_toast_statements_containing(src: str, needles):
    out = []
    i = 0
    removed = []
    while True:
        idx = src.find('toast(', i)
        if idx < 0:
            out.append(src[i:])
            break
        out.append(src[i:idx])

        # Find end of toast(...) statement safely enough for this codebase.
        depth = 0
        quote = None
        esc = False
        line_comment = False
        block_comment = False
        j = idx
        end = -1
        while j < len(src):
            c = src[j]
            n = src[j + 1] if j + 1 < len(src) else ''
            if line_comment:
                if c in '\r\n':
                    line_comment = False
                j += 1
                continue
            if block_comment:
                if c == '*' and n == '/':
                    block_comment = False
                    j += 2
                    continue
                j += 1
                continue
            if quote:
                if esc:
                    esc = False
                elif c == '\\':
                    esc = True
                elif c == quote:
                    quote = None
                j += 1
                continue
            if c == '/' and n == '/':
                line_comment = True
                j += 2
                continue
            if c == '/' and n == '*':
                block_comment = True
                j += 2
                continue
            if c in ('\"', "'", '`'):
                quote = c
                j += 1
                continue
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    k = j + 1
                    while k < len(src) and src[k].isspace() and src[k] not in '\r\n':
                        k += 1
                    if k < len(src) and src[k] == ';':
                        k += 1
                    if k < len(src) and src[k] in '\r\n':
                        k += 1
                    end = k
                    break
            j += 1

        if end < 0:
            # Fallback: keep original tail if parsing fails.
            out.append(src[idx:])
            break

        stmt = src[idx:end]
        if any(needle in stmt for needle in needles):
            removed.append(stmt.strip().replace('\n', ' ')[:220])
            i = end
        else:
            out.append(stmt)
            i = end
    return ''.join(out), removed

if APP.exists():
    js = APP.read_text(encoding='utf-8')
    js2, removed = remove_toast_statements_containing(js, [
        'ML5 activ',
        'date contextuale',
        'API sync:',
    ])
    if js2 != js:
        APP.write_text(js2, encoding='utf-8')
        changed = True

    result = subprocess.run(['node', '--check', 'assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        sys.exit(result.returncode)

    print('removed_toasts=')
    for item in removed:
        print('- ' + item)

print('changed=' + str(changed))
