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
      return {
        ml: syncMl!=null ? syncMl : (apiMl!=null ? apiMl : totalLocal),
        odds: syncOdds!=null ? syncOdds : (eligibleLocal || (apiOdds!=null ? apiOdds : 0))
      };
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

  function boot(){colorPerformance();installHeaderFix();installMarketScopeFix();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){setTimeout(boot,t);});
  setInterval(colorPerformance,1200);
})();
