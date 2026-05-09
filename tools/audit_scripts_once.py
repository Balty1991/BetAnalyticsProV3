from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text(encoding='utf-8')
scripts = re.findall(r'<script\b[^>]*src=["\']([^"\']+)["\'][^>]*>', html, flags=re.I)
styles = re.findall(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>', html, flags=re.I)
report = {
    'scripts': scripts,
    'stylesheets': styles,
    'suspect_scripts': [s for s in scripts if any(k in s.lower() for k in ['full-history','hotfix','dashboard','pro_command'])],
    'notes': [
        'Review suspect_scripts before removal.',
        'Keep app.js, pyramid_daily_runtime.js and active feature runtimes unless proven unused.'
    ]
}
(ROOT / 'cleanup_script_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
