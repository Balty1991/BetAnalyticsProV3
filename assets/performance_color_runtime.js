// Dashboard Performance semantic colors: ROI/profit red or green, WIN by threshold, table rows by situation.
(function(){
  'use strict';
  if(window.__baPerformanceColorRuntime)return;
  window.__baPerformanceColorRuntime=1;
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b', MUTED='var(--muted,#8b98ad)', TEXT='var(--txt,#f8fafc)';
  function num(txt){var m=String(txt||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0}
  function colorBySign(v){return v>0?GREEN:(v<0?RED:TEXT)}
  function colorByWin(v){return v>=65?GREEN:(v>=50?YELLOW:RED)}
  function set(el,color){if(!el)return;el.style.setProperty('color',color,'important');el.style.setProperty('text-shadow','0 0 18px '+(color===GREEN?'rgba(52,211,153,.20)':color===RED?'rgba(251,113,133,.18)':color===YELLOW?'rgba(245,158,11,.16)':'transparent'),'important')}
  function softBorder(card,color){if(!card)return;card.style.setProperty('border-color',color===GREEN?'rgba(52,211,153,.28)':color===RED?'rgba(251,113,133,.28)':color===YELLOW?'rgba(245,158,11,.25)':'rgba(255,255,255,.075)','important');card.style.setProperty('background',color===GREEN?'linear-gradient(180deg,rgba(52,211,153,.055),rgba(255,255,255,.025))':color===RED?'linear-gradient(180deg,rgba(251,113,133,.055),rgba(255,255,255,.025))':color===YELLOW?'linear-gradient(180deg,rgba(245,158,11,.052),rgba(255,255,255,.025))':'rgba(255,255,255,.025)','important')}
  function colorKpis(){
    document.querySelectorAll('.dashboard-v16-performance .dashboard-v16-stat-card').forEach(function(card){
      var k=(card.querySelector('.dashboard-v16-stat-k')||{}).textContent||'';
      var v=card.querySelector('.dashboard-v16-stat-v');
      var sub=card.querySelector('.dashboard-v16-stat-sub');
      var key=k.trim().toUpperCase();
      var x=num(v&&v.textContent);
      var c=key.indexOf('WIN')>=0?colorByWin(x):colorBySign(x);
      set(v,c);softBorder(card,c);
      if(sub){
        sub.style.setProperty('color',MUTED,'important');
        var raw=(sub.textContent||'').trim();
        if(/\d+W\s*\/\s*\d+L/i.test(raw)){
          sub.innerHTML=raw.replace(/(\d+)W/i,'<span class="ba-win-text">$1W</span>').replace(/(\d+)L/i,'<span class="ba-loss-text">$1L</span>');
        }else if(/pending\s+\d+/i.test(raw)){
          sub.innerHTML=raw.replace(/(pending\s+)(\d+)/i,'<span style="color:'+MUTED+'">$1</span><span class="ba-pending-text">$2</span>');
        }else if(/închise/i.test(raw)){
          sub.innerHTML=raw.replace(/(\d+)\s+închise/i,'<span class="ba-closed-text">$1 închise</span>');
        }
      }
    });
  }
  function colorTable(){
    document.querySelectorAll('.dashboard-v16-performance .dash-cat-table tbody tr').forEach(function(row){
      var cells=row.children;if(!cells||cells.length<5)return;
      var roi=num(cells[1].textContent), wr=num(cells[2].textContent), pend=num(cells[4].textContent);
      var rc=colorBySign(roi), wc=colorByWin(wr);
      row.classList.toggle('ba-loss-row',roi<0);row.classList.toggle('ba-profit-row',roi>0);
      set(cells[0],rc);set(cells[1],rc);set(cells[2],wc);
      cells[3].style.setProperty('color',TEXT,'important');
      cells[4].style.setProperty('color',pend>0?YELLOW:MUTED,'important');
      row.style.setProperty('box-shadow','inset 4px 0 0 '+(roi>0?'rgba(52,211,153,.78)':roi<0?'rgba(251,113,133,.78)':'rgba(148,163,184,.35)'),'important');
    });
  }
  function colorRuler(){
    document.querySelectorAll('.ba-21-ruler-head span:last-child').forEach(function(el){set(el,colorBySign(num(el.textContent)))});
    document.querySelectorAll('.ba-21-up').forEach(function(el){el.style.setProperty('background',GREEN,'important')});
    document.querySelectorAll('.ba-21-down').forEach(function(el){el.style.setProperty('background',RED,'important')});
  }
  function addCss(){
    if(document.getElementById('ba-performance-color-css'))return;
    var s=document.createElement('style');s.id='ba-performance-color-css';
    s.textContent='.ba-win-text{color:'+GREEN+'!important;font-weight:900!important}.ba-loss-text{color:'+RED+'!important;font-weight:900!important}.ba-pending-text{color:'+YELLOW+'!important;font-weight:900!important}.ba-closed-text{color:var(--txt,#f8fafc)!important;font-weight:800!important}.dashboard-v16-stat-v{font-variant-numeric:tabular-nums!important}.dash-cat-table td{transition:color .18s ease,box-shadow .18s ease!important}';
    document.head.appendChild(s);
  }
  function apply(){addCss();colorKpis();colorTable();colorRuler()}
  function boot(){apply();[100,350,900,1700,3000,6000].forEach(function(t){setTimeout(apply,t)});setInterval(apply,1200);try{new MutationObserver(function(){clearTimeout(window.__baPerformanceColorT);window.__baPerformanceColorT=setTimeout(apply,40)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true,characterData:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

// Meciuri backend best_market restore hotfix — prevents legacy UI filters from hiding backend-validated picks.
(function(){
  'use strict';
  if(window.__baMeciuriBackendHotfixV1)return;
  window.__baMeciuriBackendHotfixV1=1;

  function n(v){var x=Number(v); return isFinite(x)?x:0;}
  function pct(v){var x=n(v); if(x>0&&x<=1)x*=100; return x;}
  function normKey(k){
    k=String(k||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    if(k==='btts_yes'||k==='both_teams_to_score'||k==='gg')return'btts';
    if(k==='over_15'||k==='over15')return'over15';
    if(k==='over_25'||k==='over25')return'over25';
    if(k==='over_35'||k==='over35')return'over35';
    if(k==='under_25'||k==='under25')return'under25';
    if(k==='under_35'||k==='under35')return'under35';
    if(k==='home_win'||k==='homewin'||k==='1')return'homeWin';
    if(k==='away_win'||k==='awaywin'||k==='2')return'awayWin';
    if(k==='draw'||k==='x')return'draw';
    if(k==='dc_1x'||k==='double_chance_1x'||k==='1x')return'dc1x';
    if(k==='dc_x2'||k==='double_chance_x2'||k==='x2')return'dcx2';
    if(k==='dc_12'||k==='double_chance_12'||k==='12')return'dc12';
    return k;
  }
  function label(type,row){
    var L={over15:'Over 1.5G',over25:'Over 2.5G',over35:'Over 3.5G',under25:'Under 2.5G',under35:'Under 3.5G',btts:'BTTS',homeWin:'Victorie gazdă',draw:'Egal',awayWin:'Victorie oaspeți',dc1x:'Șansă Dublă 1X',dcx2:'Șansă Dublă X2',dc12:'Șansă Dublă 12'};
    return L[type]||String((row&&(row.label||row.market||row.market_key))||'Recomandare');
  }
  function verdict(tier){
    var t=String(tier||'').toLowerCase();
    if(t==='safe')return'safe';
    if(t==='value')return'value';
    return 'moderate';
  }
  function rawId(raw){
    var e=raw&&raw.event||{};
    return String((e&&e.id!=null?e.id:(raw&&(raw.event_id!=null?raw.event_id:raw.id)))||'');
  }
  function matchId(m){return String((m&&(m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:m.id)))||'');}
  function attachBackend(m,raw){
    if(!m||!raw)return m;
    if(!m.backendBestMarket)m.backendBestMarket=raw.best_market||null;
    if(!m.backendRiskTier)m.backendRiskTier=raw.risk_tier||null;
    if(!m.backendRationale)m.backendRationale=raw.rationale||'';
    if(m.backendEvPct==null&&raw.ev_pct!=null)m.backendEvPct=n(raw.ev_pct);
    if(m.backendKellyPct==null&&raw.kelly_pct!=null)m.backendKellyPct=n(raw.kelly_pct);
    if(!m.backendMarketsEnriched)m.backendMarketsEnriched=raw.markets_enriched||null;
    return m;
  }
  function buildBackendBet(m){
    var row=m&&m.backendBestMarket;
    if(!row||typeof row!=='object')return null;
    var tier=String(m.backendRiskTier||row.risk_tier||'').toLowerCase();
    if(tier==='avoid')return null;
    var type=normKey(row.market_key||row.market||'');
    var prob=pct(row.prob!=null?row.prob:(row.adjusted_prob!=null?row.adjusted_prob:row.bsd_prob));
    var odds=n(row.odds||row.book_odds);
    if(!type||!(prob>0)||!(odds>1.01))return null;
    var ev=row.ev_pct!=null?n(row.ev_pct):(m.backendEvPct!=null?n(m.backendEvPct):null);
    var edge=row.edge_pp!=null?n(row.edge_pp):(row.edgePct!=null?n(row.edgePct):null);
    var score=n(row.score)||prob;
    var kelly=row.kelly_pct!=null?n(row.kelly_pct):(m.backendKellyPct!=null?n(m.backendKellyPct):0);
    var fair=row.fair_odds!=null?n(row.fair_odds):(prob>0?100/prob:0);
    return {
      type:type,label:label(type,row),prob:+prob.toFixed(2),apiProb:row.bsd_prob!=null?+pct(row.bsd_prob).toFixed(2):+prob.toFixed(2),
      poissonProb:row.poisson_prob!=null?+pct(row.poisson_prob).toFixed(2):null,poissonAlert:!!row.poisson_alert,
      odds:+odds.toFixed(3),baseOdds:+odds.toFixed(3),bestOdds:+odds.toFixed(3),oddsSource:'BACKEND',
      value:ev!=null&&isFinite(ev)?+(ev/100).toFixed(4):((prob/100)*odds-1),adjProb:+prob.toFixed(2),
      edgePct:edge!=null&&isFinite(edge)?+edge.toFixed(2):null,score:Math.round(score),fairOdds:fair>0?+fair.toFixed(3):null,
      verdict:verdict(tier),kellyPct:isFinite(kelly)?+kelly.toFixed(3):0,sourceApi:true,sourceHeuristic:false,sourceBackend:true,backendPick:true,
      rationale:row.rationale||m.backendRationale||''
    };
  }
  function restoreMatch(m,rawMap){
    if(!m)return false;
    var rid=matchId(m);
    if(rawMap&&rid&&rawMap[rid])attachBackend(m,rawMap[rid]);
    if(m.analysisState==='ELIGIBLE'&&m.bestBet)return false;
    var b=buildBackendBet(m);
    if(!b)return false;
    m.bestBet=b;
    m.smartScore=Math.round(b.score||b.adjProb||0);
    m.verdict=b.verdict||'moderate';
    m.analysisState='ELIGIBLE';
    m.why=b.rationale||m.backendRationale||'Selecție validată de backend best_market';
    m.eligibleCandidates=[{bestBet:Object.assign({},b),ticketScore:m.smartScore,why:m.why}];
    return true;
  }
  function rawMap(){
    var arr=Array.isArray(window.__RAW_PREDICTIONS)?window.__RAW_PREDICTIONS:[];
    var map={};
    arr.forEach(function(r){var id=rawId(r); if(id)map[id]=r;});
    return map;
  }
  function restoreAll(){
    var list=Array.isArray(window.ALL_MATCHES)?window.ALL_MATCHES:[];
    if(!list.length)return 0;
    var map=rawMap(), changed=0;
    list.forEach(function(m){if(restoreMatch(m,map))changed++;});
    return changed;
  }
  function patchAnalyze(){
    if(typeof window.analyzeMatch!=='function'||window.analyzeMatch.__baBackendHotfix)return false;
    var old=window.analyzeMatch;
    window.analyzeMatch=function(raw){var m=old.apply(this,arguments);return attachBackend(m,raw);};
    window.analyzeMatch.__baBackendHotfix=true;
    return true;
  }
  function patchSync(){
    if(typeof window.syncRecommendationEngine!=='function'||window.syncRecommendationEngine.__baBackendHotfix)return false;
    var old=window.syncRecommendationEngine;
    window.syncRecommendationEngine=function(){var r=old.apply(this,arguments);restoreAll();return r;};
    window.syncRecommendationEngine.__baBackendHotfix=true;
    return true;
  }
  function patchMetrics(){
    if(typeof window.getStatusDisplayMetrics!=='function'||window.getStatusDisplayMetrics.__baBackendHotfix)return false;
    window.getStatusDisplayMetrics=function(){
      var matches=Array.isArray(window.ALL_MATCHES)?window.ALL_MATCHES:[];
      var totalLocal=matches.length;
      var eligibleLocal=matches.filter(function(m){return m&&m.analysisState==='ELIGIBLE';}).length;
      var meta=window.APP_META||{}, bs=meta.bsd_status||{}, hs=meta.header_sync||{};
      var apiMl=bs.ml_predictions_upcoming!=null?n(bs.ml_predictions_upcoming):null;
      var apiOdds=bs.with_odds!=null?n(bs.with_odds):null;
      var syncMl=hs.upcoming_predictions_count!=null?n(hs.upcoming_predictions_count):null;
      var syncOdds=hs.with_odds_upcoming_count!=null?n(hs.with_odds_upcoming_count):null;
      var oddsValue=syncOdds!=null&&syncOdds>0?syncOdds:(apiOdds!=null&&apiOdds>0?apiOdds:eligibleLocal);
      return {ml:apiMl!=null&&!isNaN(apiMl)?apiMl:(syncMl!=null&&!isNaN(syncMl)?syncMl:totalLocal),odds:oddsValue};
    };
    window.getStatusDisplayMetrics.__baBackendHotfix=true;
    return true;
  }
  function rerenderIfNeeded(changed){
    if(!changed)return;
    try{if(typeof window.updateHeaderStatus==='function')window.updateHeaderStatus();}catch(e){}
    try{if(typeof window.renderMatches==='function'&&((typeof window.getCurrentActiveTabName==='function'&&window.getCurrentActiveTabName()==='meciuri')||document.getElementById('tab-meciuri')&&document.getElementById('tab-meciuri').classList.contains('active')))window.renderMatches();}catch(e){}
    try{if(typeof window.renderDashboard==='function'&&typeof window.getCurrentActiveTabName==='function'&&window.getCurrentActiveTabName()==='dashboard')window.renderDashboard();}catch(e){}
  }
  function boot(){
    patchAnalyze();patchSync();patchMetrics();
    var changed=restoreAll();
    rerenderIfNeeded(changed);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [200,600,1200,2500,5000].forEach(function(t){setTimeout(boot,t);});
})();
