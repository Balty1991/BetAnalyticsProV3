// BetAnalytics Pro runtime fixes: performance colors + header metrics + Meciuri filter scope + reason dedupe + polished dark/light switch.
(function(){
  'use strict';
  if(window.__baRuntimeFixes20260504LightPolish)return;
  window.__baRuntimeFixes20260504LightPolish=1;

  var G=(typeof globalThis!=='undefined')?globalThis:window;
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b', MUTED='var(--muted,#8b98ad)', TEXT='var(--txt,#f8fafc)';
  var THEME_KEY='ba-theme-mode-v1';

  function n(v){var x=Number(v);return isFinite(x)?x:null;}
  function num(txt){var m=String(txt||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0;}
  function cSign(v){return v>0?GREEN:(v<0?RED:TEXT);}
  function cWin(v){return v>=65?GREEN:(v>=50?YELLOW:RED);}
  function set(el,color){if(el)el.style.setProperty('color',color,'important');}
  function addStyle(id,css){if(document.getElementById(id))return;var s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s);}

  function addRuntimeCss(){
    addStyle('ba-runtime-fixes-css','.ba-win-text{color:'+GREEN+'!important;font-weight:900!important}.ba-loss-text{color:'+RED+'!important;font-weight:900!important}.ba-pending-text{color:'+YELLOW+'!important;font-weight:900!important}.ba-closed-text{color:var(--txt,#f8fafc)!important;font-weight:800!important}.dashboard-v16-stat-v{font-variant-numeric:tabular-nums!important}.dash-cat-table td{transition:color .18s ease,box-shadow .18s ease!important}');
  }

  function colorPerformance(){
    addRuntimeCss();
    document.querySelectorAll('.dashboard-v16-performance .dashboard-v16-stat-card').forEach(function(card){
      var k=(card.querySelector('.dashboard-v16-stat-k')||{}).textContent||'';
      var v=card.querySelector('.dashboard-v16-stat-v');
      var sub=card.querySelector('.dashboard-v16-stat-sub');
      var color=k.trim().toUpperCase().indexOf('WIN')>=0?cWin(num(v&&v.textContent)):cSign(num(v&&v.textContent));
      set(v,color);
      card.style.setProperty('border-color',color===GREEN?'rgba(52,211,153,.28)':color===RED?'rgba(251,113,133,.28)':color===YELLOW?'rgba(245,158,11,.25)':'rgba(255,255,255,.075)','important');
      if(sub){
        sub.style.setProperty('color',MUTED,'important');
        var raw=(sub.textContent||'').trim();
        if(/\d+W\s*\/\s*\d+L/i.test(raw)) sub.innerHTML=raw.replace(/(\d+)W/i,'<span class="ba-win-text">$1W</span>').replace(/(\d+)L/i,'<span class="ba-loss-text">$1L</span>');
        else if(/pending\s+\d+/i.test(raw)) sub.innerHTML=raw.replace(/(pending\s+)(\d+)/i,'<span style="color:'+MUTED+'">$1</span><span class="ba-pending-text">$2</span>');
        else if(/închise/i.test(raw)) sub.innerHTML=raw.replace(/(\d+)\s+închise/i,'<span class="ba-closed-text">$1 închise</span>');
      }
    });
    document.querySelectorAll('.dashboard-v16-performance .dash-cat-table tbody tr').forEach(function(row){
      var cells=row.children;if(!cells||cells.length<5)return;
      var roi=num(cells[1].textContent), wr=num(cells[2].textContent), pend=num(cells[4].textContent);
      set(cells[0],cSign(roi));set(cells[1],cSign(roi));set(cells[2],cWin(wr));
      cells[3].style.setProperty('color',TEXT,'important');cells[4].style.setProperty('color',pend>0?YELLOW:MUTED,'important');
    });
  }

  function installHeaderFix(){
    if(typeof G.getStatusDisplayMetrics!=='function')return false;
    if(G.getStatusDisplayMetrics.__baHeaderOnlyHotfix)return true;
    G.getStatusDisplayMetrics=function(){
      var matches=Array.isArray(G.ALL_MATCHES)?G.ALL_MATCHES:[];
      var totalLocal=matches.length;
      var eligibleLocal=matches.filter(function(m){return m&&m.analysisState==='ELIGIBLE';}).length;
      var meta=G.APP_META||{}, bs=meta.bsd_status||{}, hs=meta.header_sync||{};
      var apiMl=n(bs.ml_predictions_upcoming), apiOdds=n(bs.with_odds), syncMl=n(hs.upcoming_predictions_count), syncOdds=n(hs.with_odds_upcoming_count);
      return {ml:apiMl!=null?apiMl:(syncMl!=null?syncMl:totalLocal), odds:(syncOdds!=null&&syncOdds>0)?syncOdds:((apiOdds!=null&&apiOdds>0)?apiOdds:eligibleLocal)};
    };
    G.getStatusDisplayMetrics.__baHeaderOnlyHotfix=true;
    try{if(typeof G.updateHeaderStatus==='function')G.updateHeaderStatus();}catch(e){}
    return true;
  }

  function installMarketScopeFix(){
    if(typeof G.buildMarketCandidate!=='function'||typeof G.isMarketDisabled!=='function')return false;
    if(G.buildMarketCandidate.__baMarketDisabledScopeHotfix)return true;
    var originalBuild=G.buildMarketCandidate, originalDisabled=G.isMarketDisabled;
    G.buildMarketCandidate=function(m,type){
      if(originalDisabled&&originalDisabled(type))return null;
      var saved=G.isMarketDisabled;
      G.isMarketDisabled=function(){return false;};
      try{return originalBuild.apply(this,arguments);}finally{G.isMarketDisabled=saved;}
    };
    G.buildMarketCandidate.__baMarketDisabledScopeHotfix=true;
    try{if(typeof G.syncRecommendationEngine==='function')G.syncRecommendationEngine();}catch(e){}
    try{var tab=document.getElementById('tab-meciuri');if(typeof G.renderMatches==='function'&&tab&&tab.classList.contains('active'))G.renderMatches();}catch(e){}
    try{if(typeof G.updateHeaderStatus==='function')G.updateHeaderStatus();}catch(e){}
    return true;
  }

  function normalizeReason(raw){
    raw=String(raw||'').replace(/<[^>]*>/g,' ').replace(/&bull;|&#8226;|&#x2022;/gi,' • ').replace(/&middot;|&#183;|&#xB7;/gi,' • ').replace(/&nbsp;/gi,' ').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().replace(/^De\s*ce[:\s]*/i,'').trim();
    var out=[], seen={};
    raw.split(/\s*(?:•|·|\||;|,)\s*/g).forEach(function(part){
      part=String(part||'').replace(/^De\s*ce[:\s]*/i,'').replace(/\s+/g,' ').trim();
      if(!part)return;
      var key=part.toLowerCase().replace(/[.,:!?]+$/g,'').replace(/\s+/g,' ').trim();
      var rec=key.match(/recovery\s+probe\s+([a-z0-9.]+)/i);
      if(rec)key='recovery probe '+rec[1];
      if(seen[key])return;
      seen[key]=1;
      out.push(part);
    });
    return out.slice(0,3).join(' • ');
  }
  function cleanTextNode(node){var raw=node.nodeValue||'';if(!/recovery\s+probe/i.test(raw))return;var cleaned=normalizeReason(raw);if(cleaned&&raw.replace(/\s+/g,' ').trim()!==cleaned)node.nodeValue=cleaned;}
  function dedupeCompactAndDetailReasons(){
    document.querySelectorAll('.match-why,.card-why,.why-box,.why,.reason,.reasons').forEach(function(el){
      var full=el.textContent||'';if(!/recovery\s+probe/i.test(full)&&full.indexOf('•')<0)return;var cleaned=normalizeReason(full);if(!cleaned)return;if(/^\s*De\s*ce/i.test(full))el.innerHTML='<strong>De ce:</strong> '+cleaned;else el.textContent=cleaned;
    });
    document.querySelectorAll('.match-card,.match-card-pro,.fixture-card,[class*="match-card"],[class*="fixture-card"]').forEach(function(card){
      if(!/recovery\s+probe/i.test(card.textContent||''))return;try{var walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT,null);var nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(cleanTextNode);}catch(e){}
    });
  }
  function installWhyDedupe(){
    var raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;dedupeCompactAndDetailReasons();});}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
    window.addEventListener('load',schedule);document.addEventListener('click',function(){setTimeout(schedule,40);},true);document.addEventListener('change',function(){setTimeout(schedule,40);},true);
    try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
    var i=0,t=setInterval(function(){dedupeCompactAndDetailReasons();i++;if(i>=60)clearInterval(t);},250);
  }

  function getTheme(){
    try{var s=localStorage.getItem(THEME_KEY)||'';if(s==='light'||s==='dark')return s;}catch(e){}
    try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}catch(e){return 'dark';}
  }
  function setTheme(mode){
    mode=(mode==='light')?'light':'dark';
    document.documentElement.setAttribute('data-theme',mode);
    try{localStorage.setItem(THEME_KEY,mode);}catch(e){}
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',mode==='light'?'#eef6f8':'#06080F');
    document.querySelectorAll('.ba-theme-toggle').forEach(function(btn){
      btn.setAttribute('aria-pressed',mode==='light'?'true':'false');
      btn.setAttribute('title',mode==='light'?'Schimbă pe dark mode':'Schimbă pe light mode');
      btn.setAttribute('aria-label',mode==='light'?'Schimbă pe dark mode':'Schimbă pe light mode');
      var ico=btn.querySelector('.ba-theme-ico'), txt=btn.querySelector('.ba-theme-txt');
      if(ico)ico.textContent=mode==='light'?'☀️':'🌙';
      if(txt)txt.textContent=mode==='light'?'Light':'Dark';
    });
  }

  function installThemeCss(){
    addStyle('ba-theme-switch-css',
      '.ba-theme-toggle{display:flex;align-items:center;justify-content:center;gap:6px;height:38px;min-width:38px;padding:0 10px;border-radius:13px;border:1px solid rgba(43,229,197,.32);background:rgba(43,229,197,.11);color:var(--acc,#2BE5C5);font-family:var(--mono,ui-monospace,monospace);font-size:11px;font-weight:900;cursor:pointer;flex-shrink:0;box-shadow:0 8px 24px rgba(0,0,0,.12)}'+
      '.ba-theme-toggle:active{transform:scale(.97);opacity:.82}.ba-theme-ico{font-size:15px;line-height:1}.ba-theme-txt{display:none}@media(min-width:760px){.ba-theme-txt{display:inline}}'+
      'html[data-theme="light"]{--bg:#eef6f8;--txt:#0f172a;--muted:#64748b;--brd:#d5e3ed;--acc:#0fbaa6;--grn:#059669;--red:#e11d48;--yel:#b45309;--pur:#7c3aed;--cyan:#0891b2;--val:#7c3aed}'+
      'html[data-theme="light"] body{background:radial-gradient(circle at 12% 0%,rgba(15,186,166,.18),transparent 30%),linear-gradient(180deg,#f8fcff 0%,#eef6f8 48%,#e7f1f4 100%)!important;color:#0f172a!important}'+
      'html[data-theme="light"] .header{background:rgba(248,252,255,.88)!important;border-bottom-color:rgba(15,23,42,.10)!important;box-shadow:0 10px 28px rgba(15,23,42,.08)!important}'+
      'html[data-theme="light"] .logo-title{color:#0f766e!important;text-shadow:none!important}html[data-theme="light"] .logo-sub,html[data-theme="light"] .logo-sync-row,html[data-theme="light"] .status-bar{color:#475569!important}html[data-theme="light"] .logo-sync-row b{color:#0fbaa6!important}'+
      'html[data-theme="light"] .btn-refresh-ico,html[data-theme="light"] .ba-theme-toggle{background:rgba(255,255,255,.82)!important;border-color:rgba(15,186,166,.34)!important;color:#0fbaa6!important;box-shadow:0 8px 24px rgba(15,23,42,.13)!important}'+
      'html[data-theme="light"] .tabs,html[data-theme="light"] .mobile-nav{background:rgba(248,250,252,.95)!important;border-color:rgba(100,116,139,.22)!important;box-shadow:0 -12px 34px rgba(15,23,42,.14)!important}'+
      'html[data-theme="light"] .tab,html[data-theme="light"] .mobile-nav-btn{background:rgba(255,255,255,.74)!important;border-color:rgba(100,116,139,.22)!important;color:#111827!important}'+
      'html[data-theme="light"] .tab.active,html[data-theme="light"] .mobile-nav-btn.active{background:linear-gradient(135deg,rgba(15,186,166,.20),rgba(14,165,233,.12))!important;border-color:rgba(15,186,166,.42)!important;color:#0f766e!important}'+
      'html[data-theme="light"] .tab-content,html[data-theme="light"] .section,html[data-theme="light"] .panel,html[data-theme="light"] .card,html[data-theme="light"] .visual-card,html[data-theme="light"] .focus-shell,html[data-theme="light"] .desktop-more-panel,html[data-theme="light"] .more-card-btn{background:rgba(255,255,255,.88)!important;border-color:rgba(100,116,139,.22)!important;color:#0f172a!important;box-shadow:0 16px 42px rgba(15,23,42,.09)!important}'+
      'html[data-theme="light"] .match-card,html[data-theme="light"] .match-card-pro,html[data-theme="light"] .fixture-card,html[data-theme="light"] [class*="match-card"],html[data-theme="light"] [class*="fixture-card"]{background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(241,247,251,.92))!important;border-color:rgba(15,186,166,.34)!important;color:#0f172a!important;box-shadow:0 18px 44px rgba(15,23,42,.12)!important}'+
      'html[data-theme="light"] .match-card *,html[data-theme="light"] .match-card-pro *,html[data-theme="light"] .fixture-card *,html[data-theme="light"] [class*="match-card"] *,html[data-theme="light"] [class*="fixture-card"] *{text-shadow:none!important}'+
      'html[data-theme="light"] .match-team,html[data-theme="light"] .team-name,html[data-theme="light"] .league-name,html[data-theme="light"] .country-name,html[data-theme="light"] .more-card-title,html[data-theme="light"] .visual-card-title,html[data-theme="light"] .sec-title,html[data-theme="light"] .bh-card-name,html[data-theme="light"] .bh-ddtitle{color:#0f172a!important}'+
      'html[data-theme="light"] .match-why,html[data-theme="light"] .card-why,html[data-theme="light"] .why-box,html[data-theme="light"] .reason,html[data-theme="light"] .reasons,html[data-theme="light"] .more-card-sub,html[data-theme="light"] .visual-card-sub,html[data-theme="light"] .bh-meta,html[data-theme="light"] .bh-ddper{color:#526174!important}'+
      'html[data-theme="light"] .recommendation-card,html[data-theme="light"] .recommend-card,html[data-theme="light"] .rec-card,html[data-theme="light"] .bet-card,html[data-theme="light"] .analysis-card,html[data-theme="light"] .summary-card,html[data-theme="light"] .details-card,html[data-theme="light"] .stat-card,html[data-theme="light"] .metric-card,html[data-theme="light"] .stats-card{background:rgba(248,251,253,.88)!important;border-color:rgba(100,116,139,.24)!important;color:#0f172a!important}'+
      'html[data-theme="light"] .filter-chip,html[data-theme="light"] .match-pill,html[data-theme="light"] .sec-badge,html[data-theme="light"] .bh-pill,html[data-theme="light"] .sort-select,html[data-theme="light"] select,html[data-theme="light"] input,html[data-theme="light"] textarea{background:rgba(255,255,255,.82)!important;border-color:rgba(100,116,139,.25)!important;color:#0f172a!important}'+
      'html[data-theme="light"] .filter-chip.active,html[data-theme="light"] .match-pill.active,html[data-theme="light"] .sec-badge.active{background:rgba(15,186,166,.18)!important;border-color:rgba(15,186,166,.42)!important;color:#0f766e!important}'+
      'html[data-theme="light"] .prob,html[data-theme="light"] .probability,html[data-theme="light"] [class*="prob"]{color:#059669!important}html[data-theme="light"] .edge,html[data-theme="light"] [class*="edge"]{color:#2563eb!important}html[data-theme="light"] .value,html[data-theme="light"] [class*="value"]{color:#7c3aed!important}'+
      'html[data-theme="light"] .loader{background:#f8fafc!important;color:#0f172a!important}'
    );
  }

  function ensureThemeButton(){
    var tools=document.querySelector('.header-tools')||document.querySelector('.header-inner');
    if(!tools||document.getElementById('ba-theme-toggle'))return;
    var btn=document.createElement('button');
    btn.id='ba-theme-toggle';btn.type='button';btn.className='ba-theme-toggle';
    btn.innerHTML='<span class="ba-theme-ico" aria-hidden="true">🌙</span><span class="ba-theme-txt">Dark</span>';
    btn.addEventListener('click',function(){setTheme(getTheme()==='light'?'dark':'light');setTimeout(applyLightTextPolish,20);});
    var refresh=document.getElementById('btn-refresh');
    if(refresh&&refresh.parentNode===tools)tools.insertBefore(btn,refresh);else tools.appendChild(btn);
    setTheme(getTheme());
  }

  function applyLightTextPolish(){
    if(document.documentElement.getAttribute('data-theme')!=='light')return;
    document.querySelectorAll('.match-card,.match-card-pro,.fixture-card,[class*="match-card"],[class*="fixture-card"],.more-card-btn').forEach(function(card){
      card.querySelectorAll('h1,h2,h3,h4,.match-team,.team-name,.league-name,.more-card-title,.sec-title').forEach(function(el){el.style.setProperty('color','#0f172a','important');});
      card.querySelectorAll('.match-why,.card-why,.why-box,.reason,.reasons,.more-card-sub,.visual-card-sub,.bh-meta').forEach(function(el){el.style.setProperty('color','#526174','important');});
    });
  }

  function installThemeSwitch(){installThemeCss();setTheme(getTheme());ensureThemeButton();applyLightTextPolish();}

  function boot(){
    colorPerformance();installHeaderFix();installMarketScopeFix();installWhyDedupe();dedupeCompactAndDetailReasons();installThemeSwitch();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
  try{new MutationObserver(function(){ensureThemeButton();applyLightTextPolish();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  [100,300,700,1200,2500,5000,9000].forEach(function(t){setTimeout(boot,t);});
  setInterval(colorPerformance,1200);
})();
