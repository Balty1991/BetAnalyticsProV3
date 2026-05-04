// BetAnalytics Pro consolidated runtime: header metrics, market scope, reason dedupe, dark/light grey theme.
(function(){
  'use strict';
  if(window.__baRuntimeGreyCardsV1)return;
  window.__baRuntimeGreyCardsV1=1;
  var G=window;
  var THEME_KEY='ba-theme-mode-v1';
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b';

  function qsa(s,root){return Array.prototype.slice.call((root||document).querySelectorAll(s));}
  function addStyle(id,css){if(document.getElementById(id))return;var s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s);}
  function n(v){var x=Number(v);return isFinite(x)?x:null;}
  function num(t){var m=String(t||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0;}

  function installHeaderFix(){
    if(typeof G.getStatusDisplayMetrics!=='function'||G.getStatusDisplayMetrics.__baFixed)return;
    G.getStatusDisplayMetrics=function(){
      var matches=Array.isArray(G.ALL_MATCHES)?G.ALL_MATCHES:[];
      var meta=G.APP_META||{}, bs=meta.bsd_status||{}, hs=meta.header_sync||{};
      var apiMl=n(bs.ml_predictions_upcoming), apiOdds=n(bs.with_odds), syncMl=n(hs.upcoming_predictions_count), syncOdds=n(hs.with_odds_upcoming_count);
      var eligible=matches.filter(function(m){return m&&m.analysisState==='ELIGIBLE';}).length;
      return {ml:apiMl!=null?apiMl:(syncMl!=null?syncMl:matches.length),odds:(syncOdds!=null&&syncOdds>0)?syncOdds:((apiOdds!=null&&apiOdds>0)?apiOdds:eligible)};
    };
    G.getStatusDisplayMetrics.__baFixed=1;
    try{G.updateHeaderStatus&&G.updateHeaderStatus();}catch(e){}
  }

  function installMarketScopeFix(){
    if(typeof G.buildMarketCandidate!=='function'||typeof G.isMarketDisabled!=='function'||G.buildMarketCandidate.__baScope)return;
    var oldBuild=G.buildMarketCandidate, oldDisabled=G.isMarketDisabled;
    G.buildMarketCandidate=function(m,type){
      if(oldDisabled&&oldDisabled(type))return null;
      var saved=G.isMarketDisabled;G.isMarketDisabled=function(){return false;};
      try{return oldBuild.apply(this,arguments);}finally{G.isMarketDisabled=saved;}
    };
    G.buildMarketCandidate.__baScope=1;
  }

  function normalizeReason(raw){
    raw=String(raw||'').replace(/<[^>]*>/g,' ').replace(/&bull;|&#8226;|&#x2022;/gi,' • ').replace(/&middot;|&#183;|&#xB7;/gi,' • ').replace(/&nbsp;/gi,' ').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().replace(/^De\s*ce[:\s]*/i,'').trim();
    var out=[],seen={};
    raw.split(/\s*(?:•|·|\||;|,)\s*/g).forEach(function(p){
      p=String(p||'').replace(/^De\s*ce[:\s]*/i,'').replace(/\s+/g,' ').trim();if(!p)return;
      var k=p.toLowerCase().replace(/[.,:!?]+$/g,'').replace(/\s+/g,' ').trim();
      var r=k.match(/recovery\s+probe\s+([a-z0-9.]+)/i);if(r)k='recovery probe '+r[1];
      if(seen[k])return;seen[k]=1;out.push(p);
    });
    return out.slice(0,3).join(' • ');
  }
  function cleanReasons(){
    qsa('.match-why,.card-why,.why-box,.why,.reason,.reasons').forEach(function(el){
      var t=el.textContent||'';if(!/recovery\s+probe/i.test(t)&&t.indexOf('•')<0)return;
      var c=normalizeReason(t);if(!c)return;
      el.innerHTML=/^\s*De\s*ce/i.test(t)?'<strong>De ce:</strong> '+c:c;
    });
    qsa('.match-card,.match-card-pro,.fixture-card,[class*="match-card"],[class*="fixture-card"],[class*="m17-card"],[class*="m16-card"]').forEach(function(card){
      if(!/recovery\s+probe/i.test(card.textContent||''))return;
      try{var w=document.createTreeWalker(card,NodeFilter.SHOW_TEXT,null),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(function(nd){var t=nd.nodeValue||'';if(/recovery\s+probe/i.test(t)){var c=normalizeReason(t);if(c)nd.nodeValue=c;}});}catch(e){}
    });
  }

  function getTheme(){try{var s=localStorage.getItem(THEME_KEY)||'';if(s==='light'||s==='dark')return s;}catch(e){}return 'dark';}
  function setTheme(mode){
    mode=mode==='light'?'light':'dark';
    document.documentElement.setAttribute('data-theme',mode);
    try{localStorage.setItem(THEME_KEY,mode);}catch(e){}
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',mode==='light'?'#dfe7ec':'#06080F');
    qsa('.ba-theme-toggle').forEach(function(btn){
      btn.setAttribute('aria-pressed',mode==='light'?'true':'false');
      btn.setAttribute('aria-label',mode==='light'?'Schimbă pe dark mode':'Schimbă pe light mode');
      var ico=btn.querySelector('.ba-theme-ico');if(ico)ico.textContent=mode==='light'?'☀️':'🌙';
      var txt=btn.querySelector('.ba-theme-txt');if(txt)txt.textContent=mode==='light'?'Light':'Dark';
    });
    setTimeout(applyLightInline,20);
  }
  function ensureThemeButton(){
    var tools=document.querySelector('.header-tools')||document.querySelector('.header-inner');
    if(!tools||document.getElementById('ba-theme-toggle'))return;
    var btn=document.createElement('button');btn.id='ba-theme-toggle';btn.type='button';btn.className='ba-theme-toggle';
    btn.innerHTML='<span class="ba-theme-ico" aria-hidden="true">🌙</span><span class="ba-theme-txt">Dark</span>';
    btn.addEventListener('click',function(){setTheme(getTheme()==='light'?'dark':'light');});
    var refresh=document.getElementById('btn-refresh');if(refresh&&refresh.parentNode===tools)tools.insertBefore(btn,refresh);else tools.appendChild(btn);
    setTheme(getTheme());
  }

  function installThemeCss(){
    addStyle('ba-grey-theme-css',
      '.ba-theme-toggle{display:flex;align-items:center;justify-content:center;gap:6px;height:38px;min-width:38px;padding:0 10px;border-radius:13px;border:1px solid rgba(43,229,197,.32);background:rgba(43,229,197,.11);color:var(--acc,#2BE5C5);font-family:var(--mono,monospace);font-size:11px;font-weight:900;cursor:pointer;flex-shrink:0}'+
      '.ba-theme-toggle:active{transform:scale(.97);opacity:.82}.ba-theme-ico{font-size:15px}.ba-theme-txt{display:none}@media(min-width:760px){.ba-theme-txt{display:inline}}'+
      'html[data-theme="light"]{--bg:#dfe7ec;--bg2:#e8eef2;--panel:#e6eef3;--brd:#bdcbd6;--brd2:#9fb3c0;--txt:#172033;--muted:#5c6b7e;--acc:#0fbaa6;--grn:#059669;--red:#e11d48;--yel:#b45309;--pur:#7c3aed;--cyan:#0891b2;--val:#0f766e}'+
      'html[data-theme="light"] body{background:linear-gradient(180deg,#e7eef3,#dfe7ec 48%,#d6e0e6)!important;color:#172033!important}'+
      'html[data-theme="light"] .header{background:rgba(223,231,236,.94)!important;border-bottom-color:rgba(126,146,160,.38)!important}'+
      'html[data-theme="light"] .logo-title,html[data-theme="light"] .logo-title *{background:none!important;-webkit-background-clip:initial!important;background-clip:initial!important;-webkit-text-fill-color:#087f73!important;color:#087f73!important;opacity:1!important;text-shadow:none!important}'+
      'html[data-theme="light"] .logo-sub,html[data-theme="light"] .status-bar,html[data-theme="light"] #sb-text,html[data-theme="light"] .logo-sync-row{color:#4f5f72!important;opacity:1!important}'+
      'html[data-theme="light"] .mobile-nav,html[data-theme="light"] .tabs{background:#e2eaef!important;border-color:rgba(126,146,160,.38)!important}'+
      'html[data-theme="light"] .tab,html[data-theme="light"] .mobile-nav-btn,html[data-theme="light"] .filter-chip,html[data-theme="light"] .filter-btn,html[data-theme="light"] select{background:rgba(238,244,247,.88)!important;color:#172033!important;border-color:rgba(126,146,160,.34)!important}'+
      'html[data-theme="light"] .tab.active,html[data-theme="light"] .mobile-nav-btn.active,html[data-theme="light"] .filter-chip.active,html[data-theme="light"] .filter-btn.active,html[data-theme="light"] .ba-theme-toggle,html[data-theme="light"] .btn-refresh-ico{background:linear-gradient(135deg,rgba(15,186,166,.22),rgba(56,189,248,.13))!important;color:#087f73!important;border-color:rgba(15,186,166,.46)!important}'+
      'html[data-theme="light"] .match-card,html[data-theme="light"] .match-card-pro,html[data-theme="light"] .fixture-card,html[data-theme="light"] [class*="match-card"],html[data-theme="light"] [class*="fixture-card"],html[data-theme="light"] [class*="m17"],html[data-theme="light"] [class*="m16"]{background:linear-gradient(180deg,#e5edf2,#cedbe4)!important;color:#172033!important;border-color:rgba(15,186,166,.34)!important;box-shadow:0 18px 42px rgba(34,51,68,.16)!important}'+
      'html[data-theme="light"] .section,html[data-theme="light"] .panel,html[data-theme="light"] .card,html[data-theme="light"] .tab-content,html[data-theme="light"] .matches-section-card,html[data-theme="light"] .more-card-btn,html[data-theme="light"] .visual-card,html[data-theme="light"] .focus-shell,html[data-theme="light"] .desktop-more-panel{background:linear-gradient(180deg,#e8eff3,#dae4eb)!important;color:#172033!important;border-color:rgba(132,153,168,.34)!important}'+
      'html[data-theme="light"] .mc-rec,html[data-theme="light"] .mc-stat,html[data-theme="light"] .recommendation-card,html[data-theme="light"] .recommend-card,html[data-theme="light"] .rec-card,html[data-theme="light"] .bet-card,html[data-theme="light"] .analysis-card,html[data-theme="light"] .summary-card,html[data-theme="light"] .details-card,html[data-theme="light"] .stat-card,html[data-theme="light"] .metric-card,html[data-theme="light"] .stats-card{background:linear-gradient(180deg,#eef4f7,#dce7ee)!important;color:#172033!important;border-color:rgba(126,146,160,.32)!important}'+
      'html[data-theme="light"] .match-team,html[data-theme="light"] .mc-team,html[data-theme="light"] .team-name,html[data-theme="light"] .league-name,html[data-theme="light"] .country-name,html[data-theme="light"] .more-card-title,html[data-theme="light"] .visual-card-title,html[data-theme="light"] .sec-title,html[data-theme="light"] h1,html[data-theme="light"] h2,html[data-theme="light"] h3,html[data-theme="light"] h4{color:#172033!important;-webkit-text-fill-color:#172033!important;text-shadow:none!important}'+
      'html[data-theme="light"] .match-why,html[data-theme="light"] .card-why,html[data-theme="light"] .why-box,html[data-theme="light"] .reason,html[data-theme="light"] .reasons,html[data-theme="light"] .more-card-sub,html[data-theme="light"] .visual-card-sub,html[data-theme="light"] .mc-league,html[data-theme="light"] .mc-time,html[data-theme="light"] .mc-stat-lbl,html[data-theme="light"] .mc-rec-val{color:#5c6b7e!important;opacity:1!important}'+
      'html[data-theme="light"] .match-card *,html[data-theme="light"] .match-card-pro *,html[data-theme="light"] .fixture-card *,html[data-theme="light"] [class*="match-card"] *,html[data-theme="light"] [class*="fixture-card"] *{text-shadow:none!important}'
    );
  }

  function important(el,prop,val){if(el)el.style.setProperty(prop,val,'important');}
  function applyLightInline(){
    if(document.documentElement.getAttribute('data-theme')!=='light')return;
    qsa('.logo-title,.logo-title *').forEach(function(el){important(el,'background','none');important(el,'-webkit-text-fill-color','#087f73');important(el,'color','#087f73');important(el,'opacity','1');});
    qsa('.match-card,.match-card-pro,.fixture-card,[class*="match-card"],[class*="fixture-card"],[class*="m17"],[class*="m16"]').forEach(function(el){important(el,'background','linear-gradient(180deg,#e5edf2,#cedbe4)');important(el,'color','#172033');important(el,'border-color','rgba(15,186,166,.34)');});
    qsa('.mc-rec,.mc-stat,.recommendation-card,.recommend-card,.rec-card,.bet-card,.analysis-card,.summary-card,.details-card,.stat-card,.metric-card,.stats-card').forEach(function(el){important(el,'background','linear-gradient(180deg,#eef4f7,#dce7ee)');important(el,'color','#172033');});
    qsa('.match-team,.mc-team,.team-name,.league-name,.country-name,h1,h2,h3,h4').forEach(function(el){important(el,'color','#172033');important(el,'-webkit-text-fill-color','#172033');});
    qsa('.match-why,.card-why,.why-box,.reason,.reasons,.mc-league,.mc-time,.mc-stat-lbl,.mc-rec-val').forEach(function(el){important(el,'color','#5c6b7e');important(el,'opacity','1');});
  }

  function colorPerformance(){
    qsa('.dashboard-v16-performance .dashboard-v16-stat-card').forEach(function(card){
      var k=(card.querySelector('.dashboard-v16-stat-k')||{}).textContent||'', v=card.querySelector('.dashboard-v16-stat-v');
      var val=num(v&&v.textContent), c=k.toUpperCase().indexOf('WIN')>=0?(val>=65?GREEN:(val>=50?YELLOW:RED)):(val>0?GREEN:(val<0?RED:''));
      if(c)setTimeout(function(){if(v)v.style.setProperty('color',c,'important');},0);
    });
  }

  function boot(){
    installThemeCss();ensureThemeButton();installHeaderFix();installMarketScopeFix();cleanReasons();colorPerformance();applyLightInline();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
  document.addEventListener('click',function(){setTimeout(boot,50);setTimeout(applyLightInline,250);},true);
  document.addEventListener('change',function(){setTimeout(boot,50);},true);
  try{new MutationObserver(function(){setTimeout(boot,0);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true});}catch(e){}
  [100,300,700,1200,2500,5000,9000].forEach(function(t){setTimeout(boot,t);});
  setInterval(function(){cleanReasons();colorPerformance();applyLightInline();},1200);
})();
