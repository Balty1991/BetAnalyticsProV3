from pathlib import Path
import re, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
changed=False

def w(rel, txt):
    global changed
    p=ROOT/rel
    old=p.read_text(encoding='utf-8')
    if old!=txt:
        p.write_text(txt, encoding='utf-8')
        changed=True

idx=ROOT/'index.html'
if idx.exists():
    h=idx.read_text(encoding='utf-8')
    old='''<div class="logo veyra-logo-header">
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
    new='''<div class="logo veyra-framed-brand">
      <div class="veyra-emblem-frame">
        <img class="veyra-emblem-img" src="./assets/veyra-icon.svg?v=20260509brand3" alt="VEYRA logo"/>
      </div>
      <div class="veyra-brand-textblock">
        <div class="logo-title veyra-wordmark-clean">VEYRA</div>
        <div class="logo-sub veyra-tagline-clean">SPORTS ANALYTICS · AI</div>
        <div class="logo-sync-row veyra-sync-row">
          <div class="sb-dot live" id="sb-dot"></div>
          <span><b id="hq-ml">—</b> ML</span>
          <span class="lsr-dot">·</span>
          <span><b id="hq-odds">—</b> cote</span>
          <span class="lsr-dot">·</span>
          <span id="hq-time">—</span>
        </div>
      </div>
      <div id="sb-text" role="status" aria-live="polite" class="sr-only"></div>
      <span id="hq-safe" style="display:none"></span>
    </div>'''
    if old in h:
        h=h.replace(old,new,1)
    else:
        h=re.sub(r'<div class="logo veyra-logo-header">[\s\S]*?<span id="hq-safe" style="display:none"></span>\s*</div>', new, h, count=1)
    h=h.replace('assets/app.css?v=20260509brand2','assets/app.css?v=20260509brand3')
    h=h.replace('assets/veyra-icon.svg?v=20260509brand2','assets/veyra-icon.svg?v=20260509brand3')
    w('index.html',h)

cssp=ROOT/'assets/app.css'
if cssp.exists():
    css=cssp.read_text(encoding='utf-8')
    css=re.sub(r'/\* VEYRA framed brand layout \*/[\s\S]*$', '', css).rstrip()
    css += '''

/* VEYRA framed brand layout */
.veyra-framed-brand{
  display:flex !important;
  flex-direction:row !important;
  align-items:center !important;
  gap:12px !important;
  min-width:0 !important;
  max-width:calc(100vw - 96px) !important;
}
.veyra-emblem-frame{
  width:72px !important;
  height:72px !important;
  flex:0 0 72px !important;
  border-radius:20px !important;
  padding:5px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  background:
    radial-gradient(circle at 50% 18%, rgba(43,229,197,.22), transparent 58%),
    linear-gradient(145deg, rgba(4,12,22,.96), rgba(3,7,14,.82)) !important;
  border:1px solid rgba(43,229,197,.32) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,.035) inset,
    0 0 22px rgba(43,229,197,.22),
    0 12px 30px rgba(0,0,0,.45) !important;
}
.veyra-emblem-img{
  width:100% !important;
  height:100% !important;
  object-fit:contain !important;
  display:block !important;
  filter:drop-shadow(0 0 10px rgba(43,229,197,.45));
}
.veyra-brand-textblock{
  display:flex !important;
  flex-direction:column !important;
  min-width:0 !important;
  justify-content:center !important;
}
.veyra-wordmark-clean{
  font-size:34px !important;
  line-height:.94 !important;
  font-weight:950 !important;
  letter-spacing:.055em !important;
  color:#fff !important;
  text-transform:uppercase !important;
  text-shadow:0 0 18px rgba(43,229,197,.18) !important;
  white-space:nowrap !important;
}
.veyra-tagline-clean{
  margin-top:7px !important;
  font-size:10px !important;
  line-height:1 !important;
  letter-spacing:.24em !important;
  font-family:var(--mono) !important;
  color:rgba(232,239,255,.72) !important;
  text-transform:uppercase !important;
  white-space:nowrap !important;
}
.veyra-sync-row{
  margin-top:10px !important;
  padding-left:0 !important;
  font-size:11px !important;
  line-height:1.05 !important;
}
@media(max-width:480px){
  .header-inner{padding:10px 12px !important;gap:8px !important;}
  .veyra-framed-brand{gap:10px !important;max-width:calc(100vw - 94px) !important;}
  .veyra-emblem-frame{width:64px !important;height:64px !important;flex-basis:64px !important;border-radius:18px !important;padding:5px !important;}
  .veyra-wordmark-clean{font-size:30px !important;letter-spacing:.045em !important;}
  .veyra-tagline-clean{font-size:8.5px !important;letter-spacing:.18em !important;max-width:190px !important;overflow:hidden !important;text-overflow:ellipsis !important;}
  .veyra-sync-row{margin-top:9px !important;font-size:10px !important;gap:6px !important;}
}
@media(max-width:370px){
  .veyra-emblem-frame{width:58px !important;height:58px !important;flex-basis:58px !important;}
  .veyra-wordmark-clean{font-size:26px !important;}
  .veyra-tagline-clean{max-width:158px !important;font-size:8px !important;letter-spacing:.14em !important;}
  .veyra-sync-row{font-size:9px !important;gap:5px !important;}
}
'''
    w('assets/app.css',css)

app=ROOT/'assets/app.js'
if app.exists():
    r=subprocess.run(['node','--check','assets/app.js'],cwd=ROOT,text=True,capture_output=True)
    if r.returncode:
        print(r.stdout); print(r.stderr); sys.exit(r.returncode)
print('changed='+str(changed))
