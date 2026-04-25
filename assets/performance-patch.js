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
  var files=['data/meta.json','data/events.json','data/predictions.json','data/leagues.json','data/teams.json','data/ai_memory.json','data/backtest.json','data/history_engine.json','data/recommendation_log.json','data/recommendation_journal.json','data/signal_audit.json','data/finished_events.json'];

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
    s.textContent='.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}';
    document.head.appendChild(s);
  }
  function prefetch(){files.forEach(function(f){try{originalFetch(f,{cache:'force-cache'}).catch(function(){})}catch(e){}})}
  addCss();
  if('requestIdleCallback'in window)requestIdleCallback(prefetch,{timeout:2500});else setTimeout(prefetch,600);
})();
