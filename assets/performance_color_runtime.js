// BetAnalytics Pro runtime fixes: performance colors + header metrics + Meciuri filter scope.
(function(){
  'use strict';
  if(window.__baRuntimeFixes20260502)return;
  window.__baRuntimeFixes20260502=1;
  var G=(typeof globalThis!=='undefined')?globalThis:window;
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b', MUTED='var(--muted,#8b98ad)', TEXT='var(--txt,#f8fafc)';
  function n(v){var x=Number(v);return isFinite(x)?x:null;}
  function num(txt){var m=String(txt||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0;}
  function cSign(v){return v>0?GREEN:(v<0?RED:TEXT);}
  function cWin(v){return v>=65?GREEN:(v>=50?YELLOW:RED);}
  function set(el,color){if(!el)return;el.style.setProperty('color',color,'important');}

  function addCss(){
    if(document.getElementById('ba-runtime-fixes-css'))return;
    var s=document.createElement('style');s.id='ba-runtime-fixes-css';
    s.textContent='.ba-win-text{color:'+GREEN+'!important;font-weight:900!important}.ba-loss-text{color:'+RED+'!important;font-weight:900!important}.ba-pending-text{color:'+YELLOW+'!important;font-weight:900!important}.ba-closed-text{color:var(--txt,#f8fafc)!important;font-weight:800!important}.dashboard-v16-stat-v{font-variant-numeric:tabular-nums!important}.dash-cat-table td{transition:color .18s ease,box-shadow .18s ease!important}';
    document.head.appendChild(s);
  }

  function colorPerformance(){
    addCss();
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

  function cleanReasonText(raw){
    raw=String(raw||'')
      .replace(/<[^>]*>/g,' ')
      .replace(/&bull;|&#8226;|&#x2022;/gi,' • ')
      .replace(/&middot;|&#183;|&#xB7;/gi,' • ')
      .replace(/&nbsp;/gi,' ')
      .replace(/\u00a0/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    raw=raw.replace(/^De\s*ce[:\s]*/i,'').trim();
    raw=raw.replace(/(Recovery\s+probe\s+[A-Za-z0-9.]+)(?:\s*(?:•|·|\||;|,)?\s*\1)+/gi,'$1');
    var seen={};
    return raw.split(/\s*(?:•|·|\||;|,)\s*/g).map(function(x){return String(x||'').replace(/^De\s*ce[:\s]*/i,'').replace(/\s+/g,' ').trim();}).filter(function(x){
      if(!x)return false;
      var k=x.toLowerCase().replace(/[.,:!?]+$/g,'').replace(/\s+/g,' ').trim();
      var rec=k.match(/^(?:de\s*ce\s*)?recovery\s+probe\s+([a-z0-9.]+)/i);
      if(rec)k='recovery probe '+rec[1];
      if(seen[k])return false;
      seen[k]=true;
      return true;
    }).slice(0,3).join(' • ');
  }
  function dedupeWhyText(){
    document.querySelectorAll('.match-why').forEach(function(el){
      var full=el.textContent||'';
      if(!/recovery\s+probe/i.test(full)&&full.indexOf('•')<0)return;
      var cleaned=cleanReasonText(full);
      if(!cleaned)return;
      var current=full.replace(/^De\s*ce[:\s]*/i,'').replace(/\s+/g,' ').trim();
      if(current===cleaned)return;
      el.innerHTML='<strong>De ce:</strong> '+cleaned;
    });
  }
  function installWhyDedupe(){
    if(G.__baWhyDedupeRuntime)return;
    G.__baWhyDedupeRuntime=1;
    var raf=0;
    function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;dedupeWhyText();});}
    document.addEventListener('DOMContentLoaded',schedule);
    window.addEventListener('load',schedule);
    document.addEventListener('click',function(){setTimeout(schedule,40);},true);
    document.addEventListener('change',function(){setTimeout(schedule,40);},true);
    try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
    var n=0,t=setInterval(function(){dedupeWhyText();n++;if(n>=30)clearInterval(t);},500);
  }

  function boot(){colorPerformance();installHeaderFix();installMarketScopeFix();installWhyDedupe();dedupeWhyText();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){setTimeout(boot,t);});
  setInterval(colorPerformance,1200);
})();
