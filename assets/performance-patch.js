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
    loadScript('assets/hybrid_adaptive_runtime.js?v=20260426hybrid8','hybrid-adaptive-runtime-script');
    loadScript('assets/prediction_history_runtime.js?v=20260426hist2','prediction-history-runtime-script');
    loadScript('assets/adaptive_restore_runtime.js?v=20260426restore2','adaptive-restore-runtime-script');
    loadScript('assets/api_history_label_runtime.js?v=20260428color2','api-history-label-runtime-script');
    loadScript('assets/dashboard_history21_sync.js?v=20260428videoexact3','dashboard-history21-sync-script');
    loadScript('assets/dashboard_motor_tracker_sync.js?v=20260503motortracker21','dashboard-motor-tracker-sync-script');
    loadScript('assets/performance_color_runtime.js?v=20260505rollback669','performance-color-runtime-script');
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

  addStyle('ba-perf-css','.dash-yday-strip{display:none!important}.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:900px){.header-quick-stats{display:none!important}#btn-refresh{min-width:52px!important;border-radius:18px!important}}');
  installBadgeCleaner();
  installO25HistoryHotfix();
  loadRuntimes();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){watchHeader();installToastFilter();prefetch();removeBadges()});else{watchHeader();installToastFilter();prefetch();removeBadges()}
  setTimeout(installToastFilter,1200);
  setTimeout(removeBadges,1600);

  function installO25HistoryHotfix(){ return; }
})();
