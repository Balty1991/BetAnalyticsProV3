// BetAnalyticsProV3 performance + runtime loader
(function(){
  'use strict';
  if(window.__baPerfV21)return; window.__baPerfV21=true;

  var originalFetch=window.fetch&&window.fetch.bind(window);
  var dataRe=/\/data\/[^?#]+\.json(?:[?#].*)?$/;
  var inflight={}, mem={}, ttl=30000;

  function urlOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href)}catch(e){return null}}
  function methodOf(input,init){return String((init&&init.method)||(input&&input.method)||'GET').toUpperCase()}
  function isData(input,init){var u=urlOf(input);return !!u&&u.origin===location.origin&&methodOf(input,init)==='GET'&&dataRe.test(u.pathname)}
  function bypassDataCache(input,init){var u=urlOf(input),mode=String((init&&init.cache)||'').toLowerCase();return !!u&&(mode==='no-store'||mode==='reload'||u.searchParams.has('t')||u.searchParams.has('_t')||u.searchParams.has('fresh'))}
  function keyOf(input){var u=urlOf(input);return u?u.origin+u.pathname:''}
  function headers(h){var o={};try{h.forEach(function(v,k){o[k]=v})}catch(e){}return o}
  function cached(c){return new Response(c.body,{status:c.status,statusText:c.statusText,headers:c.headers})}
  function store(key,res){try{if(!res||!res.ok)return Promise.resolve(res);return res.clone().text().then(function(body){mem[key]={time:Date.now(),body:body,status:res.status,statusText:res.statusText,headers:headers(res.headers)};return res}).catch(function(){return res})}catch(e){return Promise.resolve(res)}}

  if(originalFetch){
    window.fetch=function(input,init){
      if(!isData(input,init))return originalFetch(input,init);
      var key=keyOf(input),c=mem[key];
      if(bypassDataCache(input,init))return originalFetch(input,init).then(function(r){return store(key,r)});
      if(c&&Date.now()-c.time<ttl){originalFetch(input,init).then(function(r){return store(key,r)}).catch(function(){});return Promise.resolve(cached(c))}
      if(inflight[key])return inflight[key].then(function(r){return r.clone()});
      inflight[key]=originalFetch(input,init).then(function(r){return store(key,r)}).finally(function(){delete inflight[key]});
      return inflight[key].then(function(r){return r.clone()});
    };
  }

  function addStyle(id,css){if(document.getElementById(id))return;var s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s)}
  function addLink(href,id){if(document.getElementById(id)||document.querySelector('link[href*="'+href.split('?')[0]+'"]'))return;var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
  function loadScript(src,id){if(document.getElementById(id)||document.querySelector('script[src*="'+src.split('?')[0]+'"]'))return;var s=document.createElement('script');s.id=id;s.src=src;s.defer=true;document.head.appendChild(s)}
  function isBadgeText(txt){txt=String(txt||'').replace(/\s+/g,' ').trim();return txt.indexOf('PRO V22: butoanele Top EV / Safe / Balanced sunt active')>=0||txt.indexOf('PRO v18 activ')>=0||txt.indexOf('PRO v18 activ · analiză live')>=0}
  function removeBadges(){
    ['ba-pro-v22-toast','procc-floating-proof'].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.removeChild(el)});
    document.querySelectorAll('.ba-pro-toast,.procc-floating-proof,#ba-pro-v22-toast,#procc-floating-proof').forEach(function(el){if(el&&el.parentNode)el.parentNode.removeChild(el)});
    document.querySelectorAll('body *').forEach(function(el){var txt=(el.textContent||'').replace(/\s+/g,' ').trim();if(txt.length&&txt.length<180&&isBadgeText(txt)&&el.parentNode)el.parentNode.removeChild(el)});
  }
  function installBadgeCleaner(){
    addStyle('ba-remove-pro-badges-css','#ba-pro-v22-toast,.ba-pro-toast,#procc-floating-proof,.procc-floating-proof{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}');
    removeBadges();
    try{new MutationObserver(function(){setTimeout(removeBadges,0)}).observe(document.documentElement,{childList:true,subtree:true,characterData:true})}catch(e){}
    setInterval(removeBadges,800);
  }
  function loadRuntimes(){
    if(window.__baRuntimeLoaderV21)return; window.__baRuntimeLoaderV21=true;
    loadScript('assets/logic_safety_patch.js?v=20260426logic1','logic-safety-patch-script');
    loadScript('assets/hybrid_adaptive_runtime.js?v=20260504refreshfix3','hybrid-adaptive-runtime-script');
    loadScript('assets/prediction_history_runtime.js?v=20260504refreshfix3','prediction-history-runtime-script');
    loadScript('assets/adaptive_restore_runtime.js?v=20260504refreshfix3','adaptive-restore-runtime-script');
    loadScript('assets/api_history_label_runtime.js?v=20260428color2','api-history-label-runtime-script');
    loadScript('assets/dashboard_history21_sync.js?v=20260428videoexact3','dashboard-history21-sync-script');
    loadScript('assets/dashboard_motor_tracker_sync.js?v=20260503motortracker21','dashboard-motor-tracker-sync-script');
    loadScript('assets/performance_color_runtime.js?v=20260502filterfix1','performance-color-runtime-script');
    addLink('assets/pro_command_center.css?v=20260428weekstable','pro-command-center-css');
    loadScript('assets/pro_command_center.js?v=20260428weekstable','pro-command-center-script');
    loadScript('assets/pro_intelligence_runtime.js?v=20260503m23','pro-intelligence-runtime-script');
  }
  function compactStatusText(){
    var el=document.getElementById('sb-text');if(!el||el.__baCompactBusy)return;
    var raw=(el.textContent||'').trim();if(!raw)return;
    var compact=raw.replace(/\bpredictions?\b/ig,'').replace(/\bcu\s+cote\b/ig,'cote').replace(/\bcote\s+BSD\b/ig,'cote').replace(/\s*[–—-]\s*/g,' • ').replace(/\s+/g,' ').trim();
    var m=raw.match(/(\d+)\s*ML[^0-9]+(\d+)/i);if(m)compact=m[1]+' ML • '+m[2]+' cote';
    if(!compact||compact===raw)return;el.__baCompactBusy=true;el.textContent=compact;el.title=raw;setTimeout(function(){el.__baCompactBusy=false},50);
  }
  function watchHeader(){compactStatusText();var el=document.getElementById('sb-text');if(!el||el.__baStatusObserver)return;el.__baStatusObserver=true;try{new MutationObserver(function(){setTimeout(compactStatusText,0)}).observe(el,{childList:true,characterData:true,subtree:true})}catch(e){}setInterval(compactStatusText,2500)}
  function installToastFilter(){if(typeof window.toast!=='function'||window.toast.__baFilterInstalled)return;var old=window.toast;window.toast=function(msg,type){var t=String(msg||'');if(t.indexOf('API sync:')===0||t.indexOf('ML5')>=0||isBadgeText(t))return;return old.apply(this,arguments)};window.toast.__baFilterInstalled=true}
  function prefetch(){['data/meta.json','data/predictions.json','data/leagues.json','data/backtest.json','data/model_quality.json','data/pro_intelligence.json','data/ev_signals_v2.json'].forEach(function(f){try{originalFetch&&originalFetch(f,{cache:'force-cache'}).catch(function(){})}catch(e){}})}

  function installManualRefreshShield(){
    if(window.__baManualRefreshShieldInstalled)return; window.__baManualRefreshShieldInstalled=true;
    function getBtnTarget(e){try{return e&&e.target&&e.target.closest&&e.target.closest('#btn-refresh')}catch(_){return null}}
    function shortBusy(btn){
      try{
        if(!btn)return;
        btn.classList.add('is-refreshing');
        btn.setAttribute('aria-busy','true');
        clearTimeout(btn.__baManualRefreshBusyT);
        btn.__baManualRefreshBusyT=setTimeout(function(){btn.classList.remove('is-refreshing');btn.setAttribute('aria-busy','false')},650);
      }catch(_){ }
    }
    document.addEventListener('click',function(e){
      var btn=getBtnTarget(e); if(!btn)return;
      e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      window.__BA_MANUAL_SOFT_REFRESH_UNTIL=Date.now()+2500;
      shortBusy(btn);
      try{
        if(typeof window.baSoftRefreshOnly==='function') window.baSoftRefreshOnly();
        else if(typeof window.doSoftRefresh==='function') window.doSoftRefresh();
        else {
          var h=document.getElementById('hq-time');
          if(h){var d=new Date();h.textContent=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
        }
      }catch(err){console.warn('[ManualRefreshShield] soft refresh failed',err)}
    },true);
  }

  installManualRefreshShield();
  addStyle('ba-perf-css','.dash-yday-strip{display:none!important}.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:900px){.header-quick-stats{display:none!important}#btn-refresh{min-width:52px!important;border-radius:18px!important}}');
  installBadgeCleaner();
  installO25HistoryHotfix();
  loadRuntimes();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){watchHeader();installToastFilter();prefetch();removeBadges()});else{watchHeader();installToastFilter();prefetch();removeBadges()}
  setTimeout(installToastFilter,1200);
  setTimeout(removeBadges,1600);

  // Hotfix Istoric: adaugă categoria O2.5 din aceleași surse ca tabul Meciuri.
  function installO25HistoryHotfix(){
    if(window.__baO25HistoryHotfix)return; window.__baO25HistoryHotfix=true;
    var MS=['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'], DR=['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
    function nv(v){return Number(v)||0}
    function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
    function pad2(x){return String(x).padStart(2,'0')}
    function eventTs(r){var raw=r&&(r.event_date||r.date||r.logged_at||r.prediction_created_at); if(!raw)return 0; var t=new Date(raw).getTime(); return isFinite(t)?t:0}
    function bounds(){
      var now=new Date(), root=document.getElementById('history21-root');
      var on=root&&root.querySelector('.bh-mbtn.on'); var mode=(on&&on.textContent||'').toLowerCase();
      if(mode.indexOf('luna')>=0){var sel=root.querySelector('.bh-sub .bh-sel'); var p=(sel&&sel.value?sel.value:(now.getFullYear()+'-'+now.getMonth())).split('-'); var y=+p[0],m=+p[1]; return {s:new Date(y,m,1,0,0,0,0).getTime(),e:new Date(y,m+1,0,23,59,59,999).getTime()}}
      if(mode.indexOf('anual')>=0){var ys=root.querySelector('.bh-sub .bh-sel'); var y2=ys&&ys.value?+ys.value:now.getFullYear(); return {s:new Date(y2,0,1,0,0,0,0).getTime(),e:new Date(y2,11,31,23,59,59,999).getTime()}}
      if(mode.indexOf('sapt')>=0){var wk=root.querySelector('.bh-wkbtn.on'); if(wk){var txt=wk.textContent||''; var m2=txt.match(/(\d{2})\/(\d{2}).*?(\d{2})\/(\d{2})/); var sel2=root.querySelector('.bh-wm-row .bh-sel'); var y3=sel2&&sel2.value?+sel2.value.split('-')[0]:now.getFullYear(); if(m2){var sm=+m2[2]-1, em=+m2[4]-1, sy=y3, ey=y3; if(em<sm)ey++; return {s:new Date(sy,sm,+m2[1],0,0,0,0).getTime(),e:new Date(ey,em,+m2[3],23,59,59,999).getTime()}}}}
      var idx=0, day=root&&root.querySelector('.bh-daybtn.on'); if(day){var all=[].slice.call(root.querySelectorAll('.bh-daybtn')); idx=Math.max(0,all.indexOf(day))}
      var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-idx); var e=new Date(d); e.setHours(23,59,59,999); return {s:d.getTime(),e:e.getTime()};
    }
    function inPeriod(r){var t=eventTs(r), b=bounds(); return !!t&&t>=b.s&&t<=b.e}
    function normSt(r){var st=String(r.status||r.result||'').toLowerCase().trim(); if(st==='win'||st==='won'||r.won===true)return 'win'; if(st==='lose'||st==='loss'||st==='lost'||r.won===false)return 'lose'; if(r.home_score!=null&&r.away_score!=null&&r.market_key&&typeof window.evaluateMarketOutcome==='function'){var ev=window.evaluateMarketOutcome(r.market_key,nv(r.home_score),nv(r.away_score)); if(ev==='win')return 'win'; if(ev==='loss')return 'lose'} return 'pending'}
    function matchEventId(m){return String(m&&(m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:(m.id!=null?m.id:'')))||'')}
    function signalRows(){return window.SIGNAL_AUDIT&&Array.isArray(window.SIGNAL_AUDIT.rows)?window.SIGNAL_AUDIT.rows:[]}
    function isO25Row(r){var mk=String(r&&r.market_key||'').toLowerCase(), ml=String(r&&r.market||'').toLowerCase(); return mk==='over25'||ml==='over 2.5g'||ml==='over 2.5'||ml==='o2.5g'||ml==='o2.5'}
    function auditRow(m){var eid=matchEventId(m); if(!eid)return null; var rows=signalRows(); for(var i=0;i<rows.length;i++){var r=rows[i]||{}, rid=String(r.event_id!=null?r.event_id:(r.eventId!=null?r.eventId:(r.id!=null?r.id:''))); if(rid===eid&&isO25Row(r))return r} return null}
    function hasType(m,t){if(!m)return false; if(m.bestBet&&m.bestBet.type===t)return true; return Array.isArray(m.eligibleCandidates)&&m.eligibleCandidates.some(function(c){return c.bestBet&&c.bestBet.type===t})}
    function pickO25(m){
      var b=m.bestBet||{}, c=null;
      if(b.type==='over25')c={bestBet:b}; else if(Array.isArray(m.eligibleCandidates))c=m.eligibleCandidates.find(function(x){return x.bestBet&&x.bestBet.type==='over25'});
      var a=auditRow(m), bb=(c&&c.bestBet)||b;
      return {key:'over25', label:(bb&&bb.label)||(a&&a.market)||'Over 2.5G', odds:nv((bb&&bb.odds)||(a&&(a.odds||a.best_odds))), prob:nv((bb&&bb.adjProb)||(a&&(a.adjusted_prob||a.model_prob||a.prob))), edge:nv((bb&&bb.edgePct)||(a&&(a.edge_pct||a.edgePct))), value:nv((bb&&bb.value)||(a&&a.value)), score:nv((c&&c.ticketScore)||(bb&&bb.score)||(a&&(a.score||a.smartScore)))};
    }
    function rows(){
      var out=[];
      (window.RECOMMENDATION_LOG||[]).forEach(function(r){if(!r)return; var cats=r.eligible_categories||[]; if(r.market_key==='over25'||(Array.isArray(cats)&&cats.indexOf('o25')>=0)){var st=normSt(r); if((st==='win'||st==='lose')&&inPeriod(r))out.push(Object.assign({},r,{_st:st,source:'log'}))}});
      var seen={}; out.forEach(function(r){seen[String(r.event_id||'')+'::over25']=1});
      var isDisp=typeof window.isMatchStillDisplayable==='function'?window.isMatchStillDisplayable:function(){return true};
      (window.ALL_MATCHES||[]).forEach(function(m){if(!m||!isDisp(m))return; if(!hasType(m,'over25')&&!auditRow(m))return; var p=pickO25(m); var r={_st:'pending',source:'live',event_id:m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:m.id),home:m.home,away:m.away,league:m.league,event_date:m.date||m.event_date,market_key:'over25',market:p.label,odds:p.odds,adjusted_prob:p.prob,edge_pct:p.edge,value:p.value,score:p.score,verdict:m.verdict||'',riskTier:m.riskTier||''}; if(inPeriod(r)&&!seen[String(r.event_id||'')+'::over25'])out.push(r)});
      return out;
    }
    function stats(rs){var s=rs.filter(function(r){return r._st==='win'||r._st==='lose'}), p=rs.filter(function(r){return r._st==='pending'}), w=s.filter(function(r){return r._st==='win'}).length; var profit=s.reduce(function(a,r){var o=nv(r.odds); return a+(r._st==='win'?(o>1?o-1:0):-1)},0), edge=s.reduce(function(a,r){return a+nv(r.edge_pct)},0), be=s.length?s.reduce(function(a,r){return a+(nv(r.odds)>1?100/nv(r.odds):50)},0)/s.length:0; return {total:rs.length,settled:s.length,wins:w,losses:s.length-w,pending:p.length,winrate:s.length?w*100/s.length:0,roi:s.length?profit*100/s.length:0,avgEdge:s.length?edge/s.length:0,delta:s.length?(w*100/s.length)-be:0}}
    function pct(v){v=nv(v); return (v>=0?'+':'')+v.toFixed(1)+'%'}
    function card(){var st=stats(rows()), ok=st.settled>0, col=ok?(st.roi>0?'var(--grn)':(st.roi<0?'var(--red)':'var(--muted)')):'var(--muted)'; return '<div class="bh-card bh-o25-card" onclick="window.baO25History.drill()" style="border-color:rgba(16,185,129,.35)"><div class="bh-card-arr">›</div><div class="bh-card-name">📈 O2.5</div><div class="bh-card-roi" style="color:'+col+'">'+(ok?pct(st.roi):'—')+'</div><div class="bh-card-meta">WR: <b style="color:'+((st.winrate>=65)?'var(--grn)':(st.winrate>=50?'var(--yel)':'var(--red)'))+'">'+(ok?st.winrate.toFixed(0)+'%':'—')+'</b> · '+st.wins+'/'+st.settled+' W '+(st.pending?'<span style="color:var(--yel)">+'+st.pending+'⏳</span>':'')+'<br>Edge: <b style="color:var(--grn)">+'+st.avgEdge.toFixed(1)+'%</b> · Δ'+pct(st.delta)+'pp</div><div class="bh-card-bar" style="background:rgba(16,185,129,.9)"></div></div>'}
    function patchGrid(){var root=document.getElementById('history21-root'), grid=root&&root.querySelector('.bh-grid'); if(!grid)return; var html=card(), old=grid.querySelector('.bh-o25-card'); if(old){if(old.outerHTML!==html)old.outerHTML=html; return} var o15=[].slice.call(grid.querySelectorAll('.bh-card')).find(function(c){return ((c.querySelector('.bh-card-name')||{}).textContent||'').indexOf('O1.5')>=0}); if(o15)o15.insertAdjacentHTML('afterend',html); else grid.insertAdjacentHTML('beforeend',html)}
    function fmtMkt(r){return 'O2.5G'}
    function renderRows(rs){if(!rs.length)return '<div class="bh-empty"><div class="bh-eico">📈</div><div class="bh-etxt">Nu există încă recomandări Over 2.5 în perioada selectată.</div></div>'; rs.sort(function(a,b){return eventTs(b)-eventTs(a)}); var map={}, ord=[]; rs.forEach(function(r){var t=eventTs(r), d=new Date(t), k=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); if(!map[k]){map[k]={d:d,rows:[]};ord.push(k)} map[k].rows.push(r)}); return ord.map(function(k){var g=map[k], d=g.d, lbl=DR[d.getDay()]+', '+d.getDate()+' '+MS[d.getMonth()]+' '+d.getFullYear(); return '<div class="bh-dayg"><div class="bh-daylbl">'+esc(lbl)+'</div>'+g.rows.map(function(r){var st=r._st, pend=st==='pending', bcls=st==='win'?'bh-bw':(st==='lose'?'bh-bl':'bh-bp'), btxt=st==='win'?'W':(st==='lose'?'L':'⏳'), prob=nv(r.adjusted_prob||r.api_prob||r.model_prob), edge=nv(r.edge_pct), sc=(r.home_score!=null&&r.away_score!=null)?' <span class="bh-sc">['+r.home_score+'-'+r.away_score+']</span>':''; var kickoff=''; if(pend&&(r.event_date||r.date)){try{var kd=new Date(r.event_date||r.date); if(isFinite(kd))kickoff=' · '+kd.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}catch(e){}} var mp=[fmtMkt(r),esc(r.league||'—')]; if(prob>0)mp.push(prob.toFixed(0)+'% prob'); if(edge>0)mp.push('edge +'+edge.toFixed(1)+'%'); return '<div class="bh-row'+(pend?' bh-pend-row':'')+'"><div class="bh-badge '+bcls+'">'+btxt+'</div><div class="bh-main"><div class="bh-teams">'+esc(r.home||'?')+' vs '+esc(r.away||'?')+sc+'</div><div class="bh-meta">'+mp.join(' · ')+esc(kickoff)+'</div></div><div class="bh-odds">@'+(nv(r.odds)>1?nv(r.odds).toFixed(2):'—')+'</div></div>'}).join('')+'</div>'}).join('')}
    window.baO25History={drill:function(){var root=document.getElementById('history21-root'); if(!root)return; var rs=rows(), st=stats(rs); root.innerHTML='<div class="bh-wrap"><div class="bh-ddh"><button class="bh-back" onclick="window.batH&&window.batH.back();setTimeout(function(){window.baO25History.patch()},80)">← Înapoi</button><div><div class="bh-ddtitle">📈 O2.5</div><div class="bh-ddper">Over 2.5 · perioada selectată</div></div></div><div class="bh-pills"><div class="bh-pill" style="color:var(--grn)">ROI '+pct(st.roi)+'</div><div class="bh-pill">WR '+(st.settled?st.winrate.toFixed(0)+'%':'—')+'</div><div class="bh-pill">'+st.wins+'/'+st.settled+' W</div><div class="bh-pill" style="color:var(--yel)">'+st.pending+' așteaptă</div></div>'+renderRows(rs)+'</div>'; root.scrollIntoView&&root.scrollIntoView({behavior:'smooth',block:'start'})},patch:patchGrid};
    function tick(){try{patchGrid()}catch(e){}}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick); else tick();
    [200,700,1500,3000,6000,12000].forEach(function(t){setTimeout(tick,t)}); setInterval(tick,2500);
    try{new MutationObserver(function(){setTimeout(tick,0)}).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
  }

})();
