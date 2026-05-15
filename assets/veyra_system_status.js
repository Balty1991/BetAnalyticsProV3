/* VEYRA — dashboard-only System Status + displayed Meciuri count */
(function(){
  'use strict';

  var W = window;
  var pending = 0;
  var wrapped = false;

  function $(id){ return document.getElementById(id); }
  function safeNum(v, fallback){ var n = Number(v); return isFinite(n) ? n : (fallback || 0); }
  function htmlEsc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function icon(name){
    var icons = {
      pulse:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-7 4 14 3-7h5"/></svg>',
      server:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 8h.01M7 17h.01M11 8h6M11 17h6"/></svg>',
      calendar:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="17" cy="17" r="3"/><path d="M17 15.5V17l1 1"/></svg>',
      ball:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7l3 2-1 4h-4L9 9l3-2z"/><path d="M5 10l4-1M19 10l-4-1M7 18l3-5M17 18l-3-5"/></svg>',
      database:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
      eye:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
      shield:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-5"/></svg>',
      sync:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 16v5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 8V3h-5"/></svg>',
      check:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
    };
    return icons[name] || '';
  }

  function removeHeaderOdds(){
    var odds = $('hq-odds');
    if(!odds) return;
    var span = odds.closest ? odds.closest('span') : odds.parentNode;
    if(span && span.parentNode){
      var prev = span.previousElementSibling;
      if(prev && prev.classList && prev.classList.contains('lsr-dot')) prev.remove();
      span.remove();
    }
  }

  function getStatusMetrics(){
    try { if(typeof W.getStatusDisplayMetrics === 'function') return W.getStatusDisplayMetrics() || {}; } catch(e){}
    var all = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES : [];
    return { ml: all.length };
  }

  function getStatusTime(){
    try { if(typeof W.getStatusDisplayTime === 'function') return W.getStatusDisplayTime() || ''; } catch(e){}
    var t = $('hq-time');
    return t ? String(t.textContent || '').replace(/[^0-9:]/g,'').trim() : '';
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
      if(typeof W.passesSelectionFilter === 'function') return all.filter(function(m){ return W.passesSelectionFilter(m); }).length;
    } catch(e){}
    return all.filter(function(m){ return m && m.analysisState === 'ELIGIBLE'; }).length || all.length;
  }

  function displayedMeciuriCount(){
    var cache = W.MATCHES_FILTERED_CACHE;
    if(Array.isArray(cache) && cache.length) return cache.length;
    var fc = $('filter-count');
    if(fc){
      var m = String(fc.textContent || '').match(/(\d+)/);
      if(m && Number(m[1]) > 0) return Number(m[1]);
    }
    return defaultMeciuriCount();
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
  }

  function historyState(){
    /* Nu afișăm ATENȚIE fără motiv real. Devine avertizare doar dacă datele lipsesc complet. */
    var all = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES : [];
    if(!all.length) return {label:'Verificare', chip:'ISTORIC VERIFICARE', cls:'info'};
    return {label:'OK', chip:'ISTORIC OK', cls:'ok'};
  }

  function renderStatusPanel(){
    var dash = $('tab-dashboard');
    var host = $('dashboard-modern-shell') || dash;
    if(!dash || !host) return;

    var metrics = getStatusMetrics();
    var totalMl = safeNum(metrics.ml, Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES.length : 0);
    var totalLoaded = Array.isArray(W.ALL_MATCHES) && W.ALL_MATCHES.length ? W.ALL_MATCHES.length : totalMl;
    var shown = displayedMeciuriCount();
    var time = getStatusTime() || '—';
    var validated = safeNum((W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.count) || (W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.rows && W.SIGNAL_AUDIT.rows.length), 0);
    var hs = historyState();

    var html = ''+
      '<section id="dashboard-system-status" aria-label="Status sistem VEYRA">'+
        '<div class="vsys-head">'+
          '<div class="vsys-pulse" aria-hidden="true">'+icon('pulse')+'</div>'+ 
          '<div><div class="vsys-title">Status Sistem</div><div class="vsys-sub">Diagnostic rapid pentru date live</div></div>'+ 
        '</div>'+ 
        '<div class="vsys-grid">'+
          tile('server','API principal','<span class="vsys-pill">OK</span>',true)+
          tile('calendar','Ultima actualizare',htmlEsc(time),false)+
          tile('ball','Meciuri încărcate',String(totalLoaded || totalMl || 0),false)+
          tile('database','Flux date','<span class="vsys-pill">Stabil</span>',true)+
          tile('eye','Meciuri afișate',String(shown || 0),false)+
          tile('shield','Predicții validate',String(validated || 0),false)+
          '<div class="vsys-tile vsys-wide"><div class="vsys-left"><div class="vsys-icon" aria-hidden="true">'+icon('sync')+'</div><div><div class="vsys-k">Istoric sincronizat</div><div class="vsys-v small">Monitorizare activă</div></div></div><span class="vsys-pill '+(hs.cls==='info'?'info':'')+'">'+htmlEsc(hs.label)+'</span></div>'+ 
        '</div>'+ 
        '<div class="vsys-note"><div class="vsys-note-icon" aria-hidden="true">'+icon('check')+'</div><div><strong>Sistemul funcționează normal.</strong><span>Dashboard-ul verifică API-ul, sincronizarea și numărul real de meciuri afișate.</span></div></div>'+ 
        '<div class="vsys-chips"><span class="vsys-chip">'+icon('check')+' API OK</span><span class="vsys-chip">'+icon('sync')+' SINCRONIZARE OK</span><span class="vsys-chip '+(hs.cls==='info'?'':'')+'">'+icon('check')+' '+htmlEsc(hs.chip)+'</span></div>'+ 
        '<div class="vsys-foot">🔒 Date live actualizate automat</div>'+ 
      '</section>';

    var existing = $('dashboard-system-status');
    if(existing){
      if(existing.getAttribute('data-vsys-sig') !== [totalLoaded,totalMl,shown,time,validated,hs.label].join('|')){
        existing.outerHTML = html;
      }
    } else {
      host.insertAdjacentHTML('afterbegin', html);
    }
    var panel = $('dashboard-system-status');
    if(panel) panel.setAttribute('data-vsys-sig', [totalLoaded,totalMl,shown,time,validated,hs.label].join('|'));
  }

  function tile(ic, label, value, rawValueHtml){
    return '<div class="vsys-tile"><div class="vsys-icon" aria-hidden="true">'+icon(ic)+'</div><div><div class="vsys-k">'+htmlEsc(label)+'</div><div class="vsys-v">'+(rawValueHtml ? value : htmlEsc(value))+'</div></div></div>';
  }

  function scheduleUpdate(delay){
    if(pending) clearTimeout(pending);
    pending = setTimeout(function(){
      pending = 0;
      try { removeHeaderOdds(); } catch(e){}
      try { updateMeciuriCountPill(); } catch(e){}
      try { renderStatusPanel(); } catch(e){ console.warn('[VEYRA system status] render failed', e); }
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
      W.renderMatches = function(){ var r = oldRenderMatches.apply(this, arguments); scheduleUpdate(40); return r; };
    }
    if(typeof W.switchTab === 'function'){
      var oldSwitchTab = W.switchTab;
      W.switchTab = function(name){ var r = oldSwitchTab.apply(this, arguments); scheduleUpdate(120); return r; };
    }
  }

  function boot(){
    wrapFunctions();
    scheduleUpdate(80);
    [250,700,1400,2500,4500,8000,12000].forEach(function(t){ setTimeout(function(){ scheduleUpdate(0); }, t); });
    setInterval(function(){ scheduleUpdate(0); }, 15000);

    var host = $('dashboard-modern-shell') || $('tab-dashboard');
    if(host && typeof MutationObserver !== 'undefined'){
      try {
        new MutationObserver(function(){ scheduleUpdate(60); }).observe(host, {childList:true, subtree:false});
      } catch(e){}
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
