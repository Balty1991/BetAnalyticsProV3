// BetAnalyticsProV3 performance helper - response-time only
(function(){
  'use strict';
  if(window.__baPerfV3)return;
  window.__baPerfV3=true;

  var originalFetch=window.fetch&&window.fetch.bind(window);
  if(!originalFetch)return;

  var inflight={};
  var mem={};
  var ttl=30000;
  var headerUpdateLabel='';
  var dataRe=/\/data\/[^?#]+\.json(?:[?#].*)?$/;
  var files=['data/meta.json','data/events.json','data/predictions.json','data/leagues.json','data/teams.json','data/ai_memory.json','data/backtest.json','data/history_engine.json','data/recommendation_log.json','data/recommendation_journal.json','data/signal_audit.json','data/finished_events.json','data/adaptive_predictions.json','data/model_diagnostics.json','data/journal_learning_memory.json','data/prediction_type_history.json','data/api_events_history_summary.json'];

  function urlOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href)}catch(e){return null}}
  function methodOf(input,init){return String((init&&init.method)||(input&&input.method)||'GET').toUpperCase()}
  function isData(input,init){var u=urlOf(input);return !!u&&u.origin===location.origin&&methodOf(input,init)==='GET'&&dataRe.test(u.pathname)}
  function keyOf(input){var u=urlOf(input);return u?u.origin+u.pathname:''}
  function copyHeaders(headers){var o={};try{headers.forEach(function(v,k){o[k]=v})}catch(e){}return o}
  function cachedResponse(c){return new Response(c.body,{status:c.status,statusText:c.statusText,headers:c.headers})}
  function store(key,res){
    try{
      if(!res||!res.ok)return Promise.resolve(res);
      return res.clone().text().then(function(body){mem[key]={time:Date.now(),body:body,status:res.status,statusText:res.statusText,headers:copyHeaders(res.headers)};return res}).catch(function(){return res});
    }catch(e){return Promise.resolve(res)}
  }

  window.fetch=function(input,init){
    if(!isData(input,init))return originalFetch(input,init);
    var key=keyOf(input), c=mem[key];
    if(c&&Date.now()-c.time<ttl){
      originalFetch(input,init).then(function(r){return store(key,r)}).catch(function(){});
      return Promise.resolve(cachedResponse(c));
    }
    if(inflight[key])return inflight[key].then(function(r){return r.clone()});
    inflight[key]=originalFetch(input,init).then(function(r){return store(key,r)}).finally(function(){delete inflight[key]});
    return inflight[key].then(function(r){return r.clone()});
  };

  function addCss(){
    if(document.getElementById('ba-perf-css'))return;
    var s=document.createElement('style');
    s.id='ba-perf-css';
    s.textContent='.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:900px){.header-inner{display:grid!important;grid-template-columns:minmax(0,1fr)64px!important;grid-template-areas:"logo refresh" "status refresh"!important;align-items:center!important;gap:6px 10px!important;padding:10px 14px!important}.logo{grid-area:logo!important;min-width:0!important}.logo-title{font-size:18px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.logo-sub{font-size:10px!important}.status-bar{grid-area:status!important;width:100%!important;max-width:none!important;min-width:0!important;height:34px!important;padding:7px 12px!important;border-radius:14px!important;justify-content:flex-start!important}.status-bar span,#sb-text{white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important;line-height:1.2!important;display:block!important;font-size:12px!important}.header-tools{grid-area:refresh!important;justify-self:end!important;align-self:center!important}.header-quick-stats{display:none!important}#btn-refresh{width:56px!important;height:56px!important;min-width:56px!important;border-radius:18px!important;padding:0!important;font-size:0!important;display:flex!important;align-items:center!important;justify-content:center!important}#btn-refresh:before{content:"↻";font-size:26px!important;line-height:1!important}}';
    document.head.appendChild(s);
  }
  function formatUpdateLabel(value){
    if(!value)return '';
    try{
      var d=new Date(String(value));
      if(isNaN(d.getTime()))return '';
      return d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Bucharest'});
    }catch(e){return ''}
  }
  function loadHeaderUpdateTime(force){
    originalFetch('data/meta.json'+(force?'?t='+Date.now():''),{cache:force?'no-store':'default'})
      .then(function(r){return r.ok?r.json():null})
      .then(function(meta){
        if(!meta)return;
        var source=(meta.bsd_status&&meta.bsd_status.fetched_at)||meta.updated_at||meta.started_at;
        var label=formatUpdateLabel(source);
        if(label){headerUpdateLabel='upd '+label;compactStatusText();}
      })
      .catch(function(){});
  }
  function compactStatusText(){
    var el=document.getElementById('sb-text');
    if(!el||el.__baCompactBusy)return;
    var raw=(el.textContent||'').trim();
    if(!raw)return;
    var compact=raw.replace(/\bpredictions?\b/ig,'').replace(/\bcu\s+cote\b/ig,'cote').replace(/\bcote\s+BSD\b/ig,'cote').replace(/\s*[–—-]\s*/g,' • ').replace(/\s+/g,' ').trim();
    compact=compact.replace(/\s*•\s*upd\s*\d{1,2}:\d{2}\s*$/i,'').trim();
    var m=raw.match(/(\d+)\s*ML[^0-9]+(\d+)/i);
    if(m)compact=m[1]+' ML • '+m[2]+' cote';
    if(headerUpdateLabel&&compact.indexOf(headerUpdateLabel)<0)compact+=' • '+headerUpdateLabel;
    if(!compact||compact===raw)return;
    el.__baCompactBusy=true;
    el.textContent=compact;
    el.title=raw;
    setTimeout(function(){el.__baCompactBusy=false},50);
  }
  function watchHeaderStatus(){
    compactStatusText();
    var el=document.getElementById('sb-text');
    if(!el||el.__baStatusObserver)return;
    el.__baStatusObserver=true;
    try{new MutationObserver(function(){setTimeout(compactStatusText,0)}).observe(el,{childList:true,characterData:true,subtree:true})}catch(e){}
    setInterval(compactStatusText,2500);
  }
  function loadScript(src,id){
    if(id&&document.getElementById(id))return;
    var s=document.createElement('script');
    if(id)s.id=id;
    s.src=src;
    s.defer=true;
    document.head.appendChild(s);
  }
  function loadRuntimes(){
    if(window.__baRuntimeLoader)return;
    window.__baRuntimeLoader=true;
    loadScript('assets/logic_safety_patch.js?v=20260426logic1','logic-safety-patch-script');
    loadScript('assets/hybrid_adaptive_runtime.js?v=20260426hybrid8','hybrid-adaptive-runtime-script');
    loadScript('assets/prediction_history_runtime.js?v=20260426hist2','prediction-history-runtime-script');
    loadScript('assets/adaptive_restore_runtime.js?v=20260426restore2','adaptive-restore-runtime-script');
    loadScript('assets/api_history_label_runtime.js?v=20260426hist21exact1','api-history-label-runtime-script');
    loadScript('assets/dashboard_history21_sync.js?v=20260426hist21sync2','dashboard-history21-sync-script');
    // FIX 2026-04-26: ruler_sync rescrie .ba-21-ruler la 350ms iar api_history_label_runtime
    // o face la 700ms + MutationObserver -> licarit pe rigla 21 zile.
    // api_history_label_runtime.js deja patcheaza rigla cu aceleasi date, deci nu pierdem nimic.
    // loadScript('assets/dashboard_history21_ruler_sync.js?v=20260426rulersync1','dashboard-history21-ruler-sync-script');
    // FIX 2026-04-26: layout cu 4 carduri (ROI/WIN RATE/WIN-JUCATE/PENDING) intra in conflict
    // cu layout-ul de 3 carduri (ROI/WIN/PROFIT) din api_history_label_runtime.js
    // si producea flicker. Pastram doar layout-ul cu 3 carduri pe un rand.
    // loadScript('assets/dashboard_history21_exact_ui.js?v=20260426exactui1','dashboard-history21-exact-ui-script');
  }
  function prefetch(){files.forEach(function(f){try{originalFetch(f,{cache:'force-cache'}).catch(function(){})}catch(e){}})}
  addCss();
  loadHeaderUpdateTime(false);
  watchHeaderStatus();
  loadRuntimes();
  document.addEventListener('DOMContentLoaded',function(){watchHeaderStatus();loadHeaderUpdateTime(false)});
  var btn=document.getElementById('btn-refresh');
  if(btn&&!btn.__baMetaRefreshHook){
    btn.__baMetaRefreshHook=true;
    btn.addEventListener('click',function(){setTimeout(function(){loadHeaderUpdateTime(true)},1200)});
  }
  setInterval(function(){loadHeaderUpdateTime(false)},60000);
  if('requestIdleCallback'in window)requestIdleCallback(prefetch,{timeout:2500});else setTimeout(prefetch,600);
})();
