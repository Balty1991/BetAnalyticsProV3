// BetAnalyticsProV3 performance + Meciuri v24 restore loader
// Restores the requested Meciuri UI behavior: no injected PRO panel, no Motor chip, no add-to-ticket buttons.
(function(){
  'use strict';
  if(window.__baPerfMeciuriV24Restore) return;
  window.__baPerfMeciuriV24Restore = true;

  var originalFetch = window.fetch && window.fetch.bind(window);
  var dataRe = /\/data\/[^?#]+\.json(?:[?#].*)?$/;
  var inflight = {}, mem = {}, ttl = 30000;

  function urlOf(input){ try { return new URL(typeof input === 'string' ? input : input.url, location.href); } catch(e){ return null; } }
  function methodOf(input, init){ return String((init && init.method) || (input && input.method) || 'GET').toUpperCase(); }
  function isData(input, init){ var u = urlOf(input); return !!u && u.origin === location.origin && methodOf(input, init) === 'GET' && dataRe.test(u.pathname); }
  function bypassDataCache(input, init){ var u = urlOf(input), mode = String((init && init.cache) || '').toLowerCase(); return !!u && (mode === 'no-store' || mode === 'reload' || u.searchParams.has('t') || u.searchParams.has('_t') || u.searchParams.has('fresh')); }
  function keyOf(input){ var u = urlOf(input); return u ? u.origin + u.pathname : ''; }
  function headers(h){ var o = {}; try { h.forEach(function(v,k){ o[k] = v; }); } catch(e){} return o; }
  function cached(c){ return new Response(c.body, {status:c.status, statusText:c.statusText, headers:c.headers}); }
  function store(key, res){
    try{
      if(!res || !res.ok) return Promise.resolve(res);
      return res.clone().text().then(function(body){
        mem[key] = {time:Date.now(), body:body, status:res.status, statusText:res.statusText, headers:headers(res.headers)};
        return res;
      }).catch(function(){ return res; });
    }catch(e){ return Promise.resolve(res); }
  }

  if(originalFetch){
    window.fetch = function(input, init){
      if(!isData(input, init)) return originalFetch(input, init);
      var key = keyOf(input), c = mem[key];
      if(bypassDataCache(input, init)) return originalFetch(input, init).then(function(r){ return store(key, r); });
      if(c && Date.now() - c.time < ttl){
        originalFetch(input, init).then(function(r){ return store(key, r); }).catch(function(){});
        return Promise.resolve(cached(c));
      }
      if(inflight[key]) return inflight[key].then(function(r){ return r.clone(); });
      inflight[key] = originalFetch(input, init).then(function(r){ return store(key, r); }).finally(function(){ delete inflight[key]; });
      return inflight[key].then(function(r){ return r.clone(); });
    };
  }

  function $(id){ return document.getElementById(id); }
  function addStyle(id, css){
    if($(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }
  function removeNode(el){ if(el && el.parentNode) el.parentNode.removeChild(el); }
  function norm(v){
    try { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    catch(e){ return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  }
  function textHasAny(text, words){
    text = norm(text);
    return words.some(function(w){ return text.indexOf(w) >= 0; });
  }
  function isMotorButton(btn){
    var text = norm(btn && btn.textContent);
    var onclick = String((btn && btn.getAttribute('onclick')) || '').toLowerCase();
    return onclick.indexOf('motor_validated') >= 0 || text === 'motor' || text.indexOf(' motor') >= 0 || text.indexOf('motor ') >= 0;
  }
  function isTicketButton(btn){
    var text = norm(btn && btn.textContent);
    var onclick = String((btn && btn.getAttribute('onclick')) || '').toLowerCase();
    return onclick.indexOf('quickaddmatchtoticket') >= 0 || text.indexOf('adauga la bilet') >= 0 || text.indexOf('adauga pe bilet') >= 0;
  }
  function cleanupMeciuri(){
    removeNode($('ba-match-probar'));
    removeNode($('ba-pro-v22-toast'));
    removeNode($('procc-floating-proof'));
    Array.prototype.slice.call(document.querySelectorAll('.ba-pro-toast,.procc-floating-proof')).forEach(removeNode);

    var tab = $('tab-meciuri');
    if(tab){
      Array.prototype.slice.call(tab.querySelectorAll('button,a,[role="button"]')).forEach(function(el){
        if(isMotorButton(el) || isTicketButton(el)) removeNode(el);
      });
      Array.prototype.slice.call(tab.querySelectorAll('.ba-match-probar,#ba-match-probar,.meciuri-pro-panel,.motor-panel,.pro-panel')).forEach(removeNode);
    }

    Array.prototype.slice.call(document.querySelectorAll('button,a,[role="tab"],[role="button"]')).forEach(function(el){
      var t = norm(el.textContent);
      var oc = String(el.getAttribute('onclick') || '').toLowerCase();
      if(t === 'motor' || oc.indexOf('motor_validated') >= 0) removeNode(el);
    });
  }
  function installCleanup(){
    addStyle('ba-meciuri-v24-restore-css', [
      '#ba-match-probar,.ba-match-probar,.meciuri-pro-panel,.motor-panel,.pro-panel{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#tab-meciuri button[onclick*="motor_validated"],#tab-meciuri .ba-motor-chip-hidden{display:none!important}',
      '#tab-meciuri .ba-ticket-btn-hidden{display:none!important}',
      '#tab-meciuri .m17-actions{grid-template-columns:1fr!important}',
      '#tab-meciuri .m17-actions:empty{display:none!important}',
      '#ba-pro-v22-toast,.ba-pro-toast,#procc-floating-proof,.procc-floating-proof{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}'
    ].join('\n'));
    cleanupMeciuri();
    [50,150,350,700,1200,2200,4000,7000].forEach(function(ms){ setTimeout(cleanupMeciuri, ms); });
    setInterval(cleanupMeciuri, 1000);
    try { new MutationObserver(function(){ clearTimeout(window.__baMeciuriV24RestoreTimer); window.__baMeciuriV24RestoreTimer = setTimeout(cleanupMeciuri, 20); }).observe(document.documentElement, {childList:true, subtree:true}); } catch(e){}
  }

  function patchVisibleVersion(){
    try{ document.title = 'BetAnalytics Pro · Meciuri v18'; }catch(e){}
    var sub = document.querySelector('.logo-sub');
    if(sub && /PRO V21|PRO V22|V26/i.test(sub.textContent || '')) sub.textContent = 'PRO V21 · Intelligence';
  }
  function compactStatusText(){
    var el = $('sb-text');
    if(!el || el.__baCompactBusy) return;
    var raw = (el.textContent || '').trim();
    if(!raw) return;
    var compact = raw.replace(/\bpredictions?\b/ig,'').replace(/\bcu\s+cote\b/ig,'cote').replace(/\bcote\s+BSD\b/ig,'cote').replace(/\s*[–—-]\s*/g,' • ').replace(/\s+/g,' ').trim();
    var m = raw.match(/(\d+)\s*ML[^0-9]+(\d+)/i);
    if(m) compact = m[1] + ' ML • ' + m[2] + ' cote';
    if(!compact || compact === raw) return;
    el.__baCompactBusy = true;
    el.textContent = compact;
    el.title = raw;
    setTimeout(function(){ el.__baCompactBusy = false; }, 50);
  }
  function watchHeader(){
    compactStatusText();
    var el = $('sb-text');
    if(!el || el.__baStatusObserver) return;
    el.__baStatusObserver = true;
    try { new MutationObserver(function(){ setTimeout(compactStatusText,0); }).observe(el,{childList:true,characterData:true,subtree:true}); } catch(e){}
    setInterval(compactStatusText,2500);
  }
  function installToastFilter(){
    if(typeof window.toast !== 'function' || window.toast.__baFilterInstalled) return;
    var old = window.toast;
    window.toast = function(msg, type){
      var t = String(msg || '');
      if(t.indexOf('API sync:') === 0 || t.indexOf('ML5') >= 0 || t.indexOf('PRO V22:') >= 0 || t.indexOf('PRO V26:') >= 0) return;
      return old.apply(this, arguments);
    };
    window.toast.__baFilterInstalled = true;
  }
  function prefetch(){
    ['data/meta.json','data/predictions.json','data/leagues.json','data/backtest.json','data/model_quality.json','data/pro_intelligence.json','data/ev_signals_v2.json'].forEach(function(f){
      try { originalFetch && originalFetch(f,{cache:'force-cache'}).catch(function(){}); } catch(e){}
    });
  }

  addStyle('ba-perf-css-meciuri-v24-restore', '.dash-yday-strip{display:none!important}.match-card,.top-pick-card,.ml-card,.bilet-card,.ticket-card,.bankroll-card,.visual-card,.history-table-wrapper{content-visibility:auto;contain-intrinsic-size:1px 260px}.matches-grid,.top-picks-grid,.ml-grid,.focus-grid,.visual-grid{contain:layout style paint}@media(max-width:900px){.header-quick-stats{display:none!important}}');
  installCleanup();
  patchVisibleVersion();

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ patchVisibleVersion(); watchHeader(); installToastFilter(); prefetch(); cleanupMeciuri(); });
  }else{
    patchVisibleVersion(); watchHeader(); installToastFilter(); prefetch(); cleanupMeciuri();
  }
  setTimeout(installToastFilter, 1200);
  setTimeout(cleanupMeciuri, 1600);
})();
