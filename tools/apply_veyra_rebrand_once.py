from pathlib import Path
import json, re, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
changed=False

def w(rel, txt):
    global changed
    p=ROOT/rel; old=p.read_text(encoding='utf-8') if p.exists() else None
    if old!=txt:
        p.parent.mkdir(parents=True, exist_ok=True); p.write_text(txt, encoding='utf-8'); changed=True

icon='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#35fff0"/><stop offset=".55" stop-color="#14c8c2"/><stop offset="1" stop-color="#047b82"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset="1" stop-color="#d9a93a"/></linearGradient><radialGradient id="b"><stop offset="0" stop-color="#102438"/><stop offset=".6" stop-color="#06101b"/><stop offset="1" stop-color="#02050b"/></radialGradient><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="x"/><feMerge><feMergeNode in="x"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="512" height="512" rx="108" fill="url(#b)"/><rect x="18" y="18" width="476" height="476" rx="96" fill="none" stroke="#69dff5" stroke-opacity=".22" stroke-width="4"/><g opacity=".75" filter="url(#glow)"><path d="M124 198a142 142 0 0 1 62-68M326 130a142 142 0 0 1 62 68M124 314a142 142 0 0 0 62 68M326 382a142 142 0 0 0 62-68" fill="none" stroke="#2be5c5" stroke-width="6" stroke-linecap="round"/><path d="M256 111v88" stroke="#2be5c5" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 20"/></g><g filter="url(#glow)"><path d="M104 164h78l74 150 74-150h78L256 422 104 164Z" fill="none" stroke="url(#t)" stroke-width="32" stroke-linejoin="miter"/><path d="M178 196l78 156 78-156" fill="none" stroke="#07101b" stroke-width="28" stroke-linejoin="miter"/><path d="M214 294l42 86 42-86" fill="none" stroke="url(#g)" stroke-width="12"/><path d="M330 178h78M346 216h44M356 250h28" stroke="url(#t)" stroke-width="18" stroke-linecap="square"/></g></svg>'''
logo='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 360"><defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#35fff0"/><stop offset=".55" stop-color="#12c9c4"/><stop offset="1" stop-color="#047b82"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#c9d0dc"/><stop offset="1" stop-color="#7b8494"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset="1" stop-color="#d9a93a"/></linearGradient></defs><rect width="1280" height="360" fill="#030812"/><g transform="translate(70 56) scale(.62)"><path d="M124 198a142 142 0 0 1 62-68M326 130a142 142 0 0 1 62 68M124 314a142 142 0 0 0 62 68M326 382a142 142 0 0 0 62-68" fill="none" stroke="#2be5c5" stroke-width="6" stroke-linecap="round"/><path d="M256 111v88" stroke="#2be5c5" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 20"/><path d="M104 164h78l74 150 74-150h78L256 422 104 164Z" fill="none" stroke="url(#t)" stroke-width="32"/><path d="M178 196l78 156 78-156" fill="none" stroke="#030812" stroke-width="28"/><path d="M214 294l42 86 42-86" fill="none" stroke="url(#g)" stroke-width="12"/><path d="M330 178h78M346 216h44M356 250h28" stroke="url(#t)" stroke-width="18"/></g><g transform="translate(410 128)"><text x="0" y="0" font-family="Arial, sans-serif" font-size="86" font-weight="800" letter-spacing="34" fill="url(#s)">VEYRA</text><text x="6" y="76" font-family="monospace" font-size="22" font-weight="700" letter-spacing="12" fill="#2be5c5">SPORTS ANALYTICS</text><rect x="396" y="55" width="3" height="24" fill="#e6c15a"/><text x="426" y="76" font-family="monospace" font-size="22" font-weight="700" letter-spacing="10" fill="#2be5c5">AI PREDICTIONS</text></g></svg>'''
w('assets/veyra-icon.svg', icon); w('assets/veyra-logo.svg', logo)
cssp=ROOT/'assets/app.css'
if cssp.exists():
    css=cssp.read_text(encoding='utf-8')
    css=re.sub(r'/\* VEYRA brand patch \*/[\s\S]*$', '', css).rstrip()+'''\n\n/* VEYRA brand patch */
.logo{display:flex;align-items:center;gap:10px;min-width:0}.veyra-brand-mark{width:52px;height:52px;flex:0 0 52px;border-radius:15px;filter:drop-shadow(0 0 14px rgba(43,229,197,.34))}.veyra-brand-copy{display:flex;flex-direction:column;min-width:0}.logo-title,.veyra-wordmark{font-size:30px;line-height:.95;font-weight:950;letter-spacing:.16em;color:#f8fbff;text-transform:uppercase;text-shadow:0 0 18px rgba(43,229,197,.20)}.logo-sub,.veyra-tagline{font-size:10px;letter-spacing:.34em;color:#35fff0;font-family:var(--mono);text-transform:uppercase;white-space:nowrap;opacity:.9}.logo-sync-row{margin-top:7px}@media(max-width:480px){.header-inner{padding:10px 12px;gap:8px}.veyra-brand-mark{width:44px;height:44px;flex-basis:44px;border-radius:13px}.logo-title,.veyra-wordmark{font-size:24px;letter-spacing:.13em}.logo-sub,.veyra-tagline{font-size:8px;letter-spacing:.22em;max-width:220px;overflow:hidden;text-overflow:ellipsis}}
'''
    w('assets/app.css', css)
idx=ROOT/'index.html'
if idx.exists():
    h=idx.read_text(encoding='utf-8')
    h=h.replace('BetAnalytics Pro oferă dashboard mobil pentru analiză pariuri, tracking, bilete, SmartBet și istoric de performanță.','VEYRA oferă sports analytics, predicții AI, ML5, tracking și istoric de performanță pentru decizii mai clare.')
    h=h.replace('<title>BetAnalytics Pro · Meciuri v18</title>','<title>VEYRA · Sports Analytics AI</title>')
    h=h.replace('<meta name="apple-mobile-web-app-title" content="BetAnalytics"/>','<meta name="apple-mobile-web-app-title" content="VEYRA"/>')
    h=h.replace('<link rel="icon" href="icon-192.png"/>','<link rel="icon" type="image/svg+xml" href="./assets/veyra-icon.svg?v=20260509brand1"/>')
    h=h.replace('<link rel="apple-touch-icon" href="icon-192.png"/>','<link rel="apple-touch-icon" href="icon-192.png"/>\n<link rel="preload" href="./assets/veyra-icon.svg?v=20260509brand1" as="image" type="image/svg+xml"/>')
    h=re.sub(r'\.\/assets\/app\.css\?v=[^"\']+', './assets/app.css?v=20260509brand1', h, count=1)
    h=h.replace('<div class="logo-title">BetAnalytics Pro</div>\n      <div class="logo-sub">PRO V21 · Intelligence</div>','<img class="veyra-brand-mark" src="./assets/veyra-icon.svg?v=20260509brand1" alt="VEYRA logo"/>\n      <div class="veyra-brand-copy">\n        <div class="logo-title veyra-wordmark">VEYRA</div>\n        <div class="logo-sub veyra-tagline">SPORTS ANALYTICS · AI PREDICTIONS</div>')
    h=h.replace('<div id="sb-text" role="status" aria-live="polite" class="sr-only"></div>\n      <span id="hq-safe" style="display:none"></span>\n    </div>','<div id="sb-text" role="status" aria-live="polite" class="sr-only"></div>\n      <span id="hq-safe" style="display:none"></span>\n      </div>\n    </div>',1)
    h=h.replace('<h1 class="sr-only">BetAnalytics Pro</h1>','<h1 class="sr-only">VEYRA</h1>')
    w('index.html', h)
man=ROOT/'manifest.json'
if man.exists():
    d=json.loads(man.read_text(encoding='utf-8'))
    d['name']='VEYRA · Sports Analytics AI'; d['short_name']='VEYRA'; d['description']='Sports analytics, predicții AI, ML5, tracking și istoric de performanță.'; d['background_color']='#030812'; d['theme_color']='#06080F'
    d['shortcuts']=[{'name':'Meciuri azi','short_name':'Meciuri','description':'Vezi meciurile cu cote și predicții','url':'index.html?v=aurora#meciuri','icons':[{'src':'icon-192.png','sizes':'192x192'}]},{'name':'Piramidă Daily','short_name':'Piramidă','description':'Reinvestire în etape cu selecții AI','url':'index.html?v=aurora#piramida','icons':[{'src':'icon-192.png','sizes':'192x192'}]}]
    w('manifest.json', json.dumps(d, ensure_ascii=False, indent=2)+'\n')
rd=ROOT/'README.md'
if rd.exists(): w('README.md', rd.read_text(encoding='utf-8').replace('BetAnalytics Pro','VEYRA').replace('BetAnalytics','VEYRA'))
app=ROOT/'assets/app.js'
if app.exists():
    r=subprocess.run(['node','--check','assets/app.js'],cwd=ROOT,text=True,capture_output=True)
    if r.returncode: print(r.stdout,r.stderr); sys.exit(r.returncode)
print('changed='+str(changed))
