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
  var dataRe=/\/data\/[^?#]+\.json(?:[?#].*)?$/;
  var files=['data/meta.json','data/events.json','data/predictions.json','data/leagues.json','data/teams.json','data/ai_memory.json','data/backtest.json','data/history_engine.json','data/recommendation_log.json','data/recommendation_journal.json','data/signal_audit.json','data/finished_events.json','data/adaptive_predictions.json','data/model_diagnostics.json','data/journal_learning_memory.json'];

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
    s.textContent='.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:560px){.header-inner{display:grid!important;grid-template-columns:minmax(0,1fr)56px!important;grid-template-areas:"logo refresh" "status refresh"!important;align-items:center!important;gap:8px 10px!important;padding:10px 14px!important}.logo{grid-area:logo!important;min-width:0!important}.logo-title{font-size:18px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.logo-sub{font-size:10px!important}.status-bar{grid-area:status!important;width:100%!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:36px!important;padding:8px 12px!important;border-radius:14px!important;justify-content:flex-start!important}.status-bar span,#sb-text{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important;display:block!important;font-size:12px!important}.header-tools{grid-area:refresh!important;justify-self:end!important;align-self:center!important}.header-quick-stats{display:none!important}#btn-refresh{width:56px!important;height:56px!important;min-width:56px!important;border-radius:18px!important;padding:0!important;font-size:0!important;display:flex!important;align-items:center!important;justify-content:center!important}#btn-refresh:before{content:"↻";font-size:26px!important;line-height:1!important}}';
    document.head.appendChild(s);
  }
  function loadHybridRuntime(){
    if(window.__hybridAdaptiveRuntimeLoader)return;
    window.__hybridAdaptiveRuntimeLoader=true;
    var s=document.createElement('script');
    s.src='assets/hybrid_adaptive_runtime.js?v=20260426hybrid';
    s.defer=true;
    document.head.appendChild(s);
  }
  function prefetch(){files.forEach(function(f){try{originalFetch(f,{cache:'force-cache'}).catch(function(){})}catch(e){}})}
  addCss();
  loadHybridRuntime();
  if('requestIdleCallback'in window)requestIdleCallback(prefetch,{timeout:2500});else setTimeout(prefetch,600);
})();
