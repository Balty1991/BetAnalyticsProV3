/* VEYRA — Dashboard blank + header odds cleanup + Meciuri visible count */
(function(){
  'use strict';

  var W = window;
  var pending = 0;
  var wrapped = false;
  var observing = false;

  function $(id){ return document.getElementById(id); }
  function safeNum(v, fallback){ var n = Number(v); return isFinite(n) ? n : (fallback || 0); }

  function removeHeaderOdds(){
    var odds = $('hq-odds');
    if(!odds) return;
    var span = odds.closest ? odds.closest('span') : odds.parentNode;
    if(span && span.parentNode){
      var prev = span.previousElementSibling;
      if(prev && prev.classList && prev.classList.contains('lsr-dot')) prev.remove();
      span.remove();
    } else {
      odds.style.setProperty('display','none','important');
    }
  }

  function getStatusMetrics(){
    try { if(typeof W.getStatusDisplayMetrics === 'function') return W.getStatusDisplayMetrics() || {}; } catch(e){}
    var all = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES : [];
    return { ml: all.length };
  }

  function defaultMeciuriCount(){
    var all = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES : [];
    if(!all.length) return 0;
    try {
      if(typeof W.isMatchStillDisplayable === 'function'){
        return all.filter(function(m){ return m && m.analysisState === 'ELIGIBLE' && W.isMatchStillDisplayable(m); }).length;
      }
    } catch(e){}
    try {
      if(typeof W.passesSelectionFilter === 'function'){
        return all.filter(function(m){ return W.passesSelectionFilter(m); }).length;
      }
    } catch(e){}
    return all.filter(function(m){ return m && m.analysisState === 'ELIGIBLE'; }).length || all.length;
  }

  function countFromFilterPill(){
    var fc = $('filter-count');
    if(!fc) return 0;
    var m = String(fc.textContent || '').match(/(\d+)/);
    return m ? safeNum(m[1], 0) : 0;
  }

  function displayedMeciuriCount(){
    // Sursa principală: valoarea setată de renderMatches() după randarea reală.
    var fromGlobal = safeNum(W.__VEYRA_MECIURI_DISPLAYED_COUNT, 0);
    if(fromGlobal > 0) return fromGlobal;

    // Fallback: pastila existentă din DOM.
    var fromPill = countFromFilterPill();
    if(fromPill > 0) return fromPill;

    // Fallback: cache-ul filtrat, dacă există.
    var cache = W.MATCHES_FILTERED_CACHE;
    if(Array.isArray(cache) && cache.length) return cache.length;

    return defaultMeciuriCount();
  }

  function updateHeaderMlFallback(){
    var mlEl = $('hq-ml');
    if(!mlEl) return;
    var current = safeNum(String(mlEl.textContent || '').replace(/[^0-9.-]/g,''), 0);
    if(current > 0) return;
    var metrics = getStatusMetrics();
    var ml = safeNum(metrics.ml, 0);
    if(ml > 0) mlEl.textContent = String(ml);
  }

  function updateMeciuriCountPill(){
    var fc = $('filter-count');
    if(!fc) return;
    var count = displayedMeciuriCount();
    var filter = String(W.CURRENT_FILTER || 'all');
    var suffix = ' meciuri';
    if(filter === 'bet_ok') suffix = ' OK';
    if(filter === 'motor_validated') suffix = ' validate';
    if(filter === 'dashboard_ml_sync') suffix = ' ML';
    fc.textContent = count + suffix;
    fc.title = count + ' meciuri afișate în categoria Meciuri';
    fc.setAttribute('aria-label', fc.title);
    W.__VEYRA_MECIURI_DISPLAYED_COUNT = count;
  }

  function blankDashboard(){
    var dash = $('tab-dashboard');
    var host = $('dashboard-modern-shell');
    if(!dash) return;

    // Skip blanking when the new dashboard is rendered
    if(host && host.dataset.veyraNew) return;

    dash.classList.add('veyra-dashboard-blank');

    // Elimină complet panoul Status Sistem și orice card injectat în Dashboard.
    var status = $('dashboard-system-status');
    if(status) status.remove();

    if(host){
      if(host.children.length || String(host.textContent || '').trim()){
        host.innerHTML = '';
      }
      host.setAttribute('aria-label','Dashboard gol');
      host.dataset.veyraBlank = '1';
    }

    // Curățare defensivă pentru panouri vechi mutate direct în tab-dashboard.
    var selectors = [
      '#dashboard-system-status',
      '.dashboard-v16-shell',
      '.dashboard-v16-section',
      '.dashboard-v16-performance',
      '.dashboard-v16-reco',
      '#dashboard-stats',
      '#health-panel',
      '#dashboard-visual-panel',
      '#market-performance-panel',
      '#dashboard-help-panel',
      '#dashboard-monitor-grid',
      '#pro-intelligence-shell'
    ];
    selectors.forEach(function(sel){
      try {
        dash.querySelectorAll(sel).forEach(function(el){ el.remove(); });
      } catch(e){}
    });
  }

  function scheduleUpdate(delay){
    if(pending) clearTimeout(pending);
    pending = setTimeout(function(){
      pending = 0;
      try { removeHeaderOdds(); } catch(e){}
      try { updateHeaderMlFallback(); } catch(e){}
      try { updateMeciuriCountPill(); } catch(e){}
      try { blankDashboard(); } catch(e){ console.warn('[VEYRA blank dashboard] failed', e); }
    }, delay == null ? 80 : delay);
  }

  function wrapFunctions(){
    if(wrapped) return;
    wrapped = true;

    if(typeof W.renderAll === 'function'){
      var oldRenderAll = W.renderAll;
      W.renderAll = function(){ var r = oldRenderAll.apply(this, arguments); scheduleUpdate(120); return r; };
    }
    if(typeof W.renderMatches === 'function'){
      var oldRenderMatches = W.renderMatches;
      W.renderMatches = function(){ var r = oldRenderMatches.apply(this, arguments); scheduleUpdate(40); setTimeout(function(){ scheduleUpdate(0); }, 180); return r; };
    }
    if(typeof W.switchTab === 'function'){
      var oldSwitchTab = W.switchTab;
      W.switchTab = function(name){ var r = oldSwitchTab.apply(this, arguments); scheduleUpdate(80); return r; };
    }
  }

  function observeDashboard(){
    if(observing || typeof MutationObserver === 'undefined') return;
    var host = $('dashboard-modern-shell') || $('tab-dashboard');
    if(!host) return;
    observing = true;
    try {
      new MutationObserver(function(){ scheduleUpdate(25); }).observe(host, {childList:true, subtree:true});
    } catch(e){}
  }

  function boot(){
    wrapFunctions();
    scheduleUpdate(40);
    [100,250,700,1400,2500,4500,8000,12000].forEach(function(t){ setTimeout(function(){ scheduleUpdate(0); }, t); });
    setInterval(function(){ scheduleUpdate(0); }, 15000);
    observeDashboard();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
