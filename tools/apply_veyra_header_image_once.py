from pathlib import Path
import re
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
changed = False

def w(rel, txt):
    global changed
    p = ROOT / rel
    old = p.read_text(encoding='utf-8')
    if old != txt:
        p.write_text(txt, encoding='utf-8')
        changed = True

idx = ROOT / 'index.html'
if idx.exists():
    h = idx.read_text(encoding='utf-8')
    old_block = '''<div class="logo">
      <img class="veyra-brand-mark" src="./assets/veyra-icon.svg?v=20260509brand1" alt="VEYRA logo"/>
      <div class="veyra-brand-copy">
        <div class="logo-title veyra-wordmark">VEYRA</div>
        <div class="logo-sub veyra-tagline">SPORTS ANALYTICS · AI PREDICTIONS</div>
      <div class="logo-sync-row">
        <div class="sb-dot live" id="sb-dot"></div>
        <span><b id="hq-ml">—</b> ML</span>
        <span class="lsr-dot">·</span>
        <span><b id="hq-odds">—</b> cote</span>
        <span class="lsr-dot">·</span>
        <span id="hq-time">—</span>
      </div>
      <div id="sb-text" role="status" aria-live="polite" class="sr-only"></div>
      <span id="hq-safe" style="display:none"></span>
      </div>
    </div>'''
    new_block = '''<div class="logo veyra-logo-header">
      <img class="veyra-header-logo-img" src="./assets/veyra-logo.svg?v=20260509brand2" alt="VEYRA · Sports Analytics · AI Predictions"/>
      <div class="logo-sync-row veyra-sync-row">
        <div class="sb-dot live" id="sb-dot"></div>
        <span><b id="hq-ml">—</b> ML</span>
        <span class="lsr-dot">·</span>
        <span><b id="hq-odds">—</b> cote</span>
        <span class="lsr-dot">·</span>
        <span id="hq-time">—</span>
      </div>
      <div id="sb-text" role="status" aria-live="polite" class="sr-only"></div>
      <span id="hq-safe" style="display:none"></span>
    </div>'''
    if old_block in h:
        h = h.replace(old_block, new_block, 1)
    else:
        h = re.sub(r'<div class="logo">[\s\S]*?<span id="hq-safe" style="display:none"></span>\s*</div>\s*</div>', new_block, h, count=1)
    h = h.replace('assets/veyra-icon.svg?v=20260509brand1', 'assets/veyra-icon.svg?v=20260509brand2')
    h = h.replace('assets/app.css?v=20260509brand1', 'assets/app.css?v=20260509brand2')
    w('index.html', h)

cssp = ROOT / 'assets/app.css'
if cssp.exists():
    css = cssp.read_text(encoding='utf-8')
    css = re.sub(r'/\* VEYRA header image layout \*/[\s\S]*$', '', css).rstrip()
    css += '''

/* VEYRA header image layout */
.veyra-logo-header{
  display:flex !important;
  flex-direction:column !important;
  align-items:flex-start !important;
  gap:5px !important;
  min-width:0 !important;
  max-width:calc(100vw - 104px) !important;
}
.veyra-header-logo-img{
  display:block !important;
  width:min(330px,calc(100vw - 118px)) !important;
  height:auto !important;
  max-height:76px !important;
  object-fit:contain !important;
  object-position:left center !important;
  filter:drop-shadow(0 0 16px rgba(43,229,197,.22));
}
.veyra-sync-row{
  margin-top:0 !important;
  padding-left:4px !important;
  font-size:11px !important;
  line-height:1.1 !important;
}
@media(max-width:480px){
  .veyra-logo-header{max-width:calc(100vw - 96px) !important;gap:3px !important;}
  .veyra-header-logo-img{width:min(270px,calc(100vw - 112px)) !important;max-height:64px !important;}
  .veyra-sync-row{font-size:10px !important;gap:6px !important;}
}
@media(max-width:370px){
  .veyra-header-logo-img{width:min(238px,calc(100vw - 108px)) !important;max-height:58px !important;}
  .veyra-sync-row{font-size:9px !important;}
}
'''
    w('assets/app.css', css)

app = ROOT / 'assets/app.js'
if app.exists():
    r = subprocess.run(['node','--check','assets/app.js'], cwd=ROOT, text=True, capture_output=True)
    if r.returncode:
        print(r.stdout); print(r.stderr); sys.exit(r.returncode)
print('changed=' + str(changed))
