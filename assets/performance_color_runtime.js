// BetAnalytics Pro runtime fixes: performance colors + header metrics + Meciuri filter scope + reason dedupe.
(function(){
  'use strict';
  if(window.__baRuntimeFixes20260504CompactWhy)return;
  window.__baRuntimeFixes20260504CompactWhy=1;

  var G=(typeof globalThis!=='undefined')?globalThis:window;
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b', MUTED='var(--muted,#8b98ad)', TEXT='var(--txt,#f8fafc)';

  function n(v){var x=Number(v);return isFinite(x)?x:null;}
  function num(txt){var m=String(txt||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0;}
  function cSign(v){return v>0?GREEN:(v<0?RED:TEXT);}
  function cWin(v){return v>=65?GREEN:(v>=50?YELLOW:RED);}
  function set(el,color){if(el)el.style.setProperty('color',color,'important');}

  function addCss(){
    if(document.getElementById('ba-runtime-fixes-css'))return;
    var s=document.createElement('style');
    s.id='ba-runtime-fixes-css';
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
      cells[3].style.setProperty('color',TEXT,'important');
      cells[4].style.setProperty('color',pend>0?YELLOW:MUTED,'important');
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
    raw=String(raw||'')
      .replace(/<[^>]*>/g,' ')
      .replace(/&bull;|&#8226;|&#x2022;/gi,' • ')
      .replace(/&middot;|&#183;|&#xB7;/gi,' • ')
      .replace(/&nbsp;/gi,' ')
      .replace(/\u00a0/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .replace(/^De\s*ce[:\s]*/i,'')
      .trim();

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

  function cleanTextNode(node){
    var raw=node.nodeValue||'';
    if(!/recovery\s+probe/i.test(raw))return;
    var cleaned=normalizeReason(raw);
    if(cleaned&&raw.replace(/\s+/g,' ').trim()!==cleaned)node.nodeValue=cleaned;
  }

  function dedupeCompactAndDetailReasons(){
    document.querySelectorAll('.match-why,.card-why,.why-box,.why,.reason,.reasons').forEach(function(el){
      var full=el.textContent||'';
      if(!/recovery\s+probe/i.test(full)&&full.indexOf('•')<0)return;
      var cleaned=normalizeReason(full);
      if(!cleaned)return;
      if(/^\s*De\s*ce/i.test(full))el.innerHTML='<strong>De ce:</strong> '+cleaned;
      else el.textContent=cleaned;
    });

    // Cardul mic nu are mereu clasa .match-why; curățăm text-node-ul din fiecare card de meci.
    document.querySelectorAll('.match-card,.match-card-pro,.fixture-card,[class*="match-card"],[class*="fixture-card"]').forEach(function(card){
      if(!/recovery\s+probe/i.test(card.textContent||''))return;
      try{
        var walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT,null);
        var nodes=[];
        while(walker.nextNode())nodes.push(walker.currentNode);
        nodes.forEach(cleanTextNode);
      }catch(e){}
    });
  }

  function installWhyDedupe(){
    var raf=0;
    function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;dedupeCompactAndDetailReasons();});}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
    window.addEventListener('load',schedule);
    document.addEventListener('click',function(){setTimeout(schedule,40);},true);
    document.addEventListener('change',function(){setTimeout(schedule,40);},true);
    try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
    var n=0,t=setInterval(function(){dedupeCompactAndDetailReasons();n++;if(n>=60)clearInterval(t);},250);
  }

  function boot(){
    colorPerformance();
    installHeaderFix();
    installMarketScopeFix();
    installWhyDedupe();
    dedupeCompactAndDetailReasons();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){setTimeout(boot,t);});
  setInterval(colorPerformance,1200);
})();
