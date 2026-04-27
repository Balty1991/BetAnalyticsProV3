// BetAnalyticsProV3 performance + runtime loader
(function(){
  'use strict';
  if(window.__baPerfV5)return; window.__baPerfV5=true;
  var originalFetch=window.fetch&&window.fetch.bind(window);
  var dataRe=/\/data\/[^?#]+\.json(?:[?#].*)?$/;
  var inflight={}, mem={}, ttl=30000;
  function urlOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href)}catch(e){return null}}
  function methodOf(input,init){return String((init&&init.method)||(input&&input.method)||'GET').toUpperCase()}
  function isData(input,init){var u=urlOf(input);return !!u&&u.origin===location.origin&&methodOf(input,init)==='GET'&&dataRe.test(u.pathname)}
  function keyOf(input){var u=urlOf(input);return u?u.origin+u.pathname:''}
  function headers(h){var o={};try{h.forEach(function(v,k){o[k]=v})}catch(e){}return o}
  function cached(c){return new Response(c.body,{status:c.status,statusText:c.statusText,headers:c.headers})}
  function store(key,res){try{if(!res||!res.ok)return Promise.resolve(res);return res.clone().text().then(function(body){mem[key]={time:Date.now(),body:body,status:res.status,statusText:res.statusText,headers:headers(res.headers)};return res}).catch(function(){return res})}catch(e){return Promise.resolve(res)}}
  if(originalFetch){
    window.fetch=function(input,init){
      if(!isData(input,init))return originalFetch(input,init);
      var key=keyOf(input), c=mem[key];
      if(c&&Date.now()-c.time<ttl){ originalFetch(input,init).then(function(r){return store(key,r)}).catch(function(){}); return Promise.resolve(cached(c)); }
      if(inflight[key])return inflight[key].then(function(r){return r.clone()});
      inflight[key]=originalFetch(input,init).then(function(r){return store(key,r)}).finally(function(){delete inflight[key]});
      return inflight[key].then(function(r){return r.clone()});
    };
  }
  function addStyle(id,css){if(document.getElementById(id))return;var s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s)}
  function addLink(href,id){if(document.getElementById(id))return;var l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
  function loadScript(src,id){if(document.getElementById(id))return;var s=document.createElement('script');s.id=id;s.src=src;s.defer=true;document.head.appendChild(s)}
  function isBadgeText(txt){txt=String(txt||'').replace(/\s+/g,' ').trim();return txt.indexOf('PRO V22: butoanele Top EV / Safe / Balanced sunt active')>=0||txt.indexOf('PRO v18 activ')>=0||txt.indexOf('PRO v18 activ · analiză live')>=0}
  function removeBadges(){
    ['ba-pro-v22-toast','procc-floating-proof'].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.removeChild(el)});
    document.querySelectorAll('.ba-pro-toast,.procc-floating-proof,#ba-pro-v22-toast,#procc-floating-proof').forEach(function(el){if(el&&el.parentNode)el.parentNode.removeChild(el)});
    document.querySelectorAll('body *').forEach(function(el){
      var txt=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(txt.length&&txt.length<180&&isBadgeText(txt)&&el.parentNode)el.parentNode.removeChild(el);
    });
  }
  function installBadgeCleaner(){
    addStyle('ba-remove-pro-badges-css','#ba-pro-v22-toast,.ba-pro-toast,#procc-floating-proof,.procc-floating-proof{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}');
    removeBadges();
    try{new MutationObserver(function(){setTimeout(removeBadges,0)}).observe(document.documentElement,{childList:true,subtree:true,characterData:true})}catch(e){}
    setInterval(removeBadges,800);
  }
  function installWeekHistory(){
    if(window.__baWeekHistoryInstalled)return; window.__baWeekHistoryInstalled=true;
    var active='d1', lastHtml='', days=['Dum','Lun','Mar','Mie','Joi','Vin','Sâm'], months=['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
    addStyle('ba-week-history-css','.dash-yday-strip{display:none!important}.dash-week-strip{margin-top:10px!important;border-radius:18px!important;border:1px solid rgba(255,255,255,.10)!important;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.01))!important;overflow:hidden!important}.dash-week-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:9px 12px 7px!important;border-bottom:1px solid rgba(255,255,255,.06)!important}.dash-week-title,.dash-week-sub{font-family:var(--font-mono,ui-monospace,monospace)!important;font-size:9px!important;font-weight:800!important;letter-spacing:.11em!important;text-transform:uppercase!important;color:var(--muted,#9AA8BD)!important}.dash-week-tabs{display:flex!important;gap:6px!important;padding:8px 10px 2px!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;scrollbar-width:none!important}.dash-week-tabs::-webkit-scrollbar,.dash-week-scroll::-webkit-scrollbar{display:none!important}.dash-week-tab{appearance:none!important;border:1px solid rgba(255,255,255,.10)!important;background:rgba(255,255,255,.03)!important;color:var(--muted,#9AA8BD)!important;border-radius:999px!important;padding:7px 10px!important;font-family:var(--font-mono,ui-monospace,monospace)!important;font-size:10px!important;font-weight:800!important;white-space:nowrap!important;flex:0 0 auto!important}.dash-week-tab.active{color:var(--txt,#fff)!important;border-color:rgba(43,229,197,.28)!important;background:linear-gradient(180deg,rgba(43,229,197,.16),rgba(43,229,197,.06))!important}.dash-week-stats{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;padding:8px 10px 10px!important}.dash-week-stat{border-radius:14px!important;border:1px solid rgba(255,255,255,.07)!important;background:rgba(255,255,255,.02)!important;padding:8px 9px!important;display:grid!important;gap:4px!important;min-width:0!important}.dash-week-stat span{font-family:var(--font-mono,ui-monospace,monospace)!important;font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.08em!important;color:var(--muted,#9AA8BD)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.dash-week-stat b{display:block!important;font-size:16px!important;line-height:1.1!important;letter-spacing:-.02em!important;color:var(--txt,#fff)!important;white-space:nowrap!important;overflow:visible!important}.dash-week-scroll-wrap{padding:0 10px 10px!important}.dash-week-scroll{display:flex!important;gap:5px!important;padding:2px 0!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;scrollbar-width:none!important;flex-wrap:nowrap!important}.dash-week-pill{display:inline-flex!important;align-items:center!important;gap:5px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.09)!important;background:rgba(255,255,255,.018)!important;padding:4px 8px!important;flex-shrink:0!important;min-height:28px!important}.dash-week-w{border-color:rgba(34,197,94,.20)!important;background:rgba(34,197,94,.04)!important}.dash-week-l{border-color:rgba(239,68,68,.20)!important;background:rgba(239,68,68,.04)!important}.dash-week-badge{font-weight:900!important;font-size:10px!important;min-width:12px!important}.dash-week-w .dash-week-badge{color:var(--grn,#22C55E)!important}.dash-week-l .dash-week-badge{color:var(--red,#EF4444)!important}.dash-week-label{font-weight:750!important;font-size:10px!important;color:var(--txt,#fff)!important;white-space:nowrap!important}.dash-week-mkt{font-family:var(--font-mono,ui-monospace,monospace)!important;font-size:8px!important;color:var(--muted,#9AA8BD)!important;white-space:nowrap!important}.dash-week-empty{padding:10px 12px 12px!important;color:var(--muted,#9AA8BD)!important;font-size:12px!important}@media(max-width:500px){.dash-week-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}.dash-week-stat b{font-size:15px!important}}');
    function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
    function stamp(r){var raw=r&&(r.event_date||r.eventDate||r.date||r.logged_at||r.prediction_created_at||r.created_at);var ms=raw?new Date(raw).getTime():NaN;return isFinite(ms)?ms:0}
    function rows(){var cutoff=new Date(Date.now()-8*86400000);cutoff.setHours(0,0,0,0);try{if(typeof window.getHistory21SettledRows==='function')return window.getHistory21SettledRows(cutoff).filter(function(r){return stamp(r)>=cutoff.getTime()})}catch(e){}var p=[];try{if(Array.isArray(window.RECOMMENDATION_JOURNAL))p=p.concat(window.RECOMMENDATION_JOURNAL)}catch(e){}try{if(Array.isArray(window.HISTORY_ENGINE))p=p.concat(window.HISTORY_ENGINE)}catch(e){}return p.filter(function(r){return r&&(r.status==='win'||r.status==='loss')})}
    function met(rs){var w=rs.filter(function(r){return r.status==='win'}).length,p=rs.reduce(function(a,r){var o=Number(r.odds||r.book_odds||0);return a+(r.status==='win'?(o>1?o-1:0):-1)},0),n=rs.length;return {n:n,w:w,roi:n?p*100/n:0,wr:n?w*100/n:0}}
    function team(x){return String(x||'').trim().split(/\s+/).filter(Boolean).slice(0,2).join(' ')||'—'}
    function sign(n,s){n=Number(n||0);return(n>=0?'+':'')+n.toFixed(1)+(s||'')}
    function viewData(){var now=new Date();now.setHours(0,0,0,0);var all=rows(),v=[];for(var i=1;i<=7;i++){var st=new Date(now);st.setDate(st.getDate()-i);var en=new Date(st);en.setDate(en.getDate()+1);var rs=all.filter(function(r){var t=stamp(r);return t>=st.getTime()&&t<en.getTime()});v.push({key:'d'+i,tab:i===1?'Ieri':days[st.getDay()]+' '+st.getDate(),full:i===1?'Ieri':days[st.getDay()]+' · '+st.getDate()+' '+months[st.getMonth()],rows:rs,m:met(rs)})}var total=[];v.forEach(function(x){total=total.concat(x.rows)});v.push({key:'total',tab:'Total',full:'Total 7 zile',rows:total,m:met(total)});return v}
    function html(){var v=viewData(),a=v.filter(function(x){return x.key===active})[0]||v[0],tabs=v.map(function(x){return '<button type="button" class="dash-week-tab '+(x.key===a.key?'active':'')+'" data-week-key="'+x.key+'">'+esc(x.tab)+'</button>'}).join(''),pills=a.rows.map(function(r){var ok=r.status==='win',label=(r.home&&r.away)?team(r.home)+' - '+team(r.away):(r.match||r.market||'—');return '<span class="dash-week-pill '+(ok?'dash-week-w':'dash-week-l')+'"><span class="dash-week-badge">'+(ok?'W':'L')+'</span><span class="dash-week-label">'+esc(label)+'</span><span class="dash-week-mkt">'+esc(r.market||r.bet||r.pick||'')+'</span></span>'}).join(''),m=a.m,roiTxt=m.n?sign(m.roi,'%'):'0.0%',wrTxt=m.n?m.wr.toFixed(1)+'%':'0.0%';return '<div class="dash-week-strip" id="dash-week-strip"><div class="dash-week-head"><div class="dash-week-title">📅 ULTIMELE 7 ZILE</div><div class="dash-week-sub">'+esc(a.full)+'</div></div><div class="dash-week-tabs">'+tabs+'</div><div class="dash-week-stats"><div class="dash-week-stat"><span>Evenimente</span><b>'+m.n+'</b></div><div class="dash-week-stat"><span>Win/Jucate</span><b>'+m.w+'/'+m.n+'</b></div><div class="dash-week-stat"><span>ROI</span><b style="color:'+(m.n?(m.roi>=0?'var(--grn)':'var(--red)'):'var(--muted)')+'">'+roiTxt+'</b></div><div class="dash-week-stat"><span>Winrate</span><b>'+wrTxt+'</b></div></div>'+(pills?'<div class="dash-week-scroll-wrap"><div class="dash-week-scroll">'+pills+'</div></div>':'<div class="dash-week-empty">Nu există evenimente finalizate pentru selecția aleasă.</div>')+'</div>'}
    function mount(force){
      document.querySelectorAll('.dash-yday-strip').forEach(function(e){e.remove()});
      var perf=document.querySelector('.dashboard-v16-performance'); if(!perf)return;
      var old=document.getElementById('dash-week-strip'),cat=perf.querySelector('.dash-cat-table-wrap'),next=html();
      if(old){ if(!force && lastHtml===next)return; old.outerHTML=next; lastHtml=next; return; }
      if(cat)cat.insertAdjacentHTML('afterend',next); else perf.insertAdjacentHTML('beforeend',next); lastHtml=next;
    }
    document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.dash-week-tab');if(!b)return;active=b.getAttribute('data-week-key')||'d1';lastHtml='';mount(true)});
    mount(true);[250,700,1400,2600].forEach(function(ms){setTimeout(function(){mount(false)},ms)});setInterval(function(){mount(false)},2500);
    try{new MutationObserver(function(){clearTimeout(window.__baWeekMountT);window.__baWeekMountT=setTimeout(function(){mount(false)},40)}).observe(document.body,{childList:true,subtree:true})}catch(e){}
  }
  function loadRuntimes(){
    if(window.__baRuntimeLoaderV5)return; window.__baRuntimeLoaderV5=true;
    loadScript('assets/logic_safety_patch.js?v=20260426logic1','logic-safety-patch-script');
    loadScript('assets/hybrid_adaptive_runtime.js?v=20260426hybrid8','hybrid-adaptive-runtime-script');
    loadScript('assets/prediction_history_runtime.js?v=20260426hist2','prediction-history-runtime-script');
    loadScript('assets/adaptive_restore_runtime.js?v=20260426restore2','adaptive-restore-runtime-script');
    loadScript('assets/api_history_label_runtime.js?v=20260426hist21exact1','api-history-label-runtime-script');
    loadScript('assets/dashboard_history21_sync.js?v=20260426hist21sync2','dashboard-history21-sync-script');
    addLink('assets/pro_command_center.css?v=20260427clean2','pro-command-center-css');
    loadScript('assets/pro_command_center.js?v=20260427clean2','pro-command-center-script');
    loadScript('assets/pro_intelligence_runtime.js?v=20260427clean2','pro-intelligence-runtime-script');
  }
  function compactStatusText(){
    var el=document.getElementById('sb-text'); if(!el||el.__baCompactBusy)return;
    var raw=(el.textContent||'').trim(); if(!raw)return;
    var compact=raw.replace(/\bpredictions?\b/ig,'').replace(/\bcu\s+cote\b/ig,'cote').replace(/\bcote\s+BSD\b/ig,'cote').replace(/\s*[–—-]\s*/g,' • ').replace(/\s+/g,' ').trim();
    var m=raw.match(/(\d+)\s*ML[^0-9]+(\d+)/i); if(m)compact=m[1]+' ML • '+m[2]+' cote';
    if(!compact||compact===raw)return; el.__baCompactBusy=true; el.textContent=compact; el.title=raw; setTimeout(function(){el.__baCompactBusy=false},50);
  }
  function watchHeader(){compactStatusText();var el=document.getElementById('sb-text');if(!el||el.__baStatusObserver)return;el.__baStatusObserver=true;try{new MutationObserver(function(){setTimeout(compactStatusText,0)}).observe(el,{childList:true,characterData:true,subtree:true})}catch(e){}setInterval(compactStatusText,2500)}
  function installToastFilter(){if(typeof window.toast!=='function'||window.toast.__baFilterInstalled)return;var old=window.toast;window.toast=function(msg,type){var t=String(msg||'');if(t.indexOf('API sync:')===0||t.indexOf('ML5')>=0||isBadgeText(t))return;return old.apply(this,arguments)};window.toast.__baFilterInstalled=true}
  function prefetch(){['data/meta.json','data/predictions.json','data/leagues.json','data/backtest.json','data/model_quality.json','data/pro_intelligence.json','data/ev_signals_v2.json'].forEach(function(f){try{originalFetch&&originalFetch(f,{cache:'force-cache'}).catch(function(){})}catch(e){}})}
  addStyle('ba-perf-css','.dashboard-v16-perf-stats{display:none!important}.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:900px){.header-quick-stats{display:none!important}#btn-refresh{min-width:52px!important;border-radius:18px!important}}');
  installBadgeCleaner();
  installWeekHistory();
  loadRuntimes();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){watchHeader();installToastFilter();prefetch();removeBadges()});else{watchHeader();installToastFilter();prefetch();removeBadges()}
  setTimeout(installToastFilter,1200);
  setTimeout(removeBadges,1600);
})();
