// BetAnalytics Pro: Dark / Light mode switch
(function(){
  'use strict';
  if(window.__baThemeSwitchRuntimeV1)return;
  window.__baThemeSwitchRuntimeV1=true;

  var STORAGE_KEY='ba-theme-mode-v1';
  var root=document.documentElement;

  function getStored(){try{return localStorage.getItem(STORAGE_KEY)||'';}catch(e){return '';}}
  function systemPrefersLight(){try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;}catch(e){return false;}}
  function currentMode(){var s=getStored();return s==='light'||s==='dark'?s:(systemPrefersLight()?'light':'dark');}

  function applyMode(mode){
    mode=(mode==='light')?'light':'dark';
    root.setAttribute('data-theme',mode);
    try{localStorage.setItem(STORAGE_KEY,mode);}catch(e){}
    var meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',mode==='light'?'#f3f7fb':'#06080F');
    document.querySelectorAll('.ba-theme-toggle').forEach(function(btn){
      btn.setAttribute('aria-pressed',mode==='light'?'true':'false');
      btn.setAttribute('title',mode==='light'?'Schimbă pe dark mode':'Schimbă pe light mode');
      btn.setAttribute('aria-label',mode==='light'?'Schimbă pe dark mode':'Schimbă pe light mode');
      var ico=btn.querySelector('.ba-theme-ico');
      var txt=btn.querySelector('.ba-theme-txt');
      if(ico)ico.textContent=mode==='light'?'☀️':'🌙';
      if(txt)txt.textContent=mode==='light'?'Light':'Dark';
    });
  }

  function injectCss(){
    if(document.getElementById('ba-theme-switch-css'))return;
    var s=document.createElement('style');
    s.id='ba-theme-switch-css';
    s.textContent=`
      .ba-theme-toggle{
        display:flex;align-items:center;justify-content:center;gap:6px;
        height:38px;min-width:38px;padding:0 10px;border-radius:13px;
        border:1px solid rgba(43,229,197,.28);
        background:rgba(43,229,197,.10);color:var(--acc,#2BE5C5);
        font-family:var(--mono,ui-monospace,monospace);font-size:11px;font-weight:800;
        cursor:pointer;flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,.12);
      }
      .ba-theme-toggle:active{transform:scale(.97);opacity:.82}
      .ba-theme-ico{font-size:15px;line-height:1}.ba-theme-txt{display:none}
      @media(min-width:760px){.ba-theme-txt{display:inline}}

      html[data-theme="light"]{
        --bg:#f3f7fb;--txt:#101827;--muted:#64748b;--brd:#d8e2ef;--acc:#0d9488;
        --grn:#059669;--red:#e11d48;--yel:#b45309;--pur:#7c3aed;--cyan:#0891b2;--val:#7c3aed;
      }
      html[data-theme="light"] body{
        background:
          radial-gradient(circle at top left,rgba(13,148,136,.14),transparent 34%),
          linear-gradient(180deg,#f7fbff 0%,#edf4fb 100%) !important;
        color:var(--txt)!important;
      }
      html[data-theme="light"] .header{
        background:rgba(247,251,255,.88)!important;
        border-bottom-color:rgba(15,23,42,.09)!important;
        box-shadow:0 10px 28px rgba(15,23,42,.07)!important;
      }
      html[data-theme="light"] .section,
      html[data-theme="light"] .panel,
      html[data-theme="light"] .card,
      html[data-theme="light"] .tab-content,
      html[data-theme="light"] .match-card,
      html[data-theme="light"] .match-card-pro,
      html[data-theme="light"] .visual-card,
      html[data-theme="light"] .focus-shell,
      html[data-theme="light"] .more-card-btn,
      html[data-theme="light"] .desktop-more-panel{
        background:rgba(255,255,255,.78)!important;
        border-color:rgba(100,116,139,.24)!important;
        color:var(--txt)!important;
        box-shadow:0 16px 40px rgba(15,23,42,.09)!important;
      }
      html[data-theme="light"] .mobile-nav,
      html[data-theme="light"] .tabs{
        background:rgba(248,250,252,.92)!important;
        border-color:rgba(100,116,139,.22)!important;
        box-shadow:0 -12px 34px rgba(15,23,42,.12)!important;
      }
      html[data-theme="light"] .btn-refresh-ico,
      html[data-theme="light"] .ba-theme-toggle,
      html[data-theme="light"] .filter-chip,
      html[data-theme="light"] .tab,
      html[data-theme="light"] .mobile-nav-btn,
      html[data-theme="light"] .match-pill,
      html[data-theme="light"] .sec-badge,
      html[data-theme="light"] .bh-pill{
        background:rgba(255,255,255,.72)!important;
        border-color:rgba(13,148,136,.24)!important;
        color:var(--txt)!important;
      }
      html[data-theme="light"] .tab.active,
      html[data-theme="light"] .mobile-nav-btn.active,
      html[data-theme="light"] .filter-chip.active,
      html[data-theme="light"] .ba-theme-toggle{
        background:linear-gradient(135deg,rgba(13,148,136,.16),rgba(14,165,233,.10))!important;
        color:var(--acc)!important;
        border-color:rgba(13,148,136,.40)!important;
      }
      html[data-theme="light"] .logo-title,
      html[data-theme="light"] .match-team,
      html[data-theme="light"] .visual-card-title,
      html[data-theme="light"] .sec-title,
      html[data-theme="light"] .bh-card-name,
      html[data-theme="light"] .bh-ddtitle{color:#0f172a!important}
      html[data-theme="light"] .logo-sub,
      html[data-theme="light"] .status-bar,
      html[data-theme="light"] .visual-card-sub,
      html[data-theme="light"] .match-why,
      html[data-theme="light"] .bh-meta,
      html[data-theme="light"] .bh-ddper{color:#64748b!important}
      html[data-theme="light"] .loader{background:#f8fafc!important;color:#0f172a!important}
      html[data-theme="light"] input,
      html[data-theme="light"] select,
      html[data-theme="light"] textarea{
        background:rgba(255,255,255,.85)!important;color:#0f172a!important;border-color:rgba(100,116,139,.28)!important;
      }
    `;
    document.head.appendChild(s);
  }

  function ensureButton(){
    var tools=document.querySelector('.header-tools')||document.querySelector('.header-inner');
    if(!tools||document.getElementById('ba-theme-toggle'))return;
    var btn=document.createElement('button');
    btn.id='ba-theme-toggle';
    btn.type='button';
    btn.className='ba-theme-toggle';
    btn.innerHTML='<span class="ba-theme-ico" aria-hidden="true">🌙</span><span class="ba-theme-txt">Dark</span>';
    btn.addEventListener('click',function(){applyMode(currentMode()==='light'?'dark':'light');});
    var refresh=document.getElementById('btn-refresh');
    if(refresh&&refresh.parentNode===tools)tools.insertBefore(btn,refresh);
    else tools.appendChild(btn);
    applyMode(currentMode());
  }

  function boot(){injectCss();applyMode(currentMode());ensureButton();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
  try{new MutationObserver(function(){ensureButton();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();
