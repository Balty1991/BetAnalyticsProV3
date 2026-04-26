// API History label override: show total archive + active engine subset
(function(){
  'use strict';
  if(window.__apiHistoryLabelRuntimeLoaded) return;
  window.__apiHistoryLabelRuntimeLoaded = true;

  var totalCount = 58033;
  function q(sel, root){ return (root || document).querySelector(sel); }
  function fmt(n){ try { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); } catch(e){ return String(Math.round(Number(n) || 0)); } }
  function text(el){ return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function activeCount(){
    var s = (((window.ADAPTIVE_PREDICTIONS || {}).summary) || {});
    var m = (((window.AI_MEMORY || {}).summary) || {});
    return Number(s.api_history_active_matches || s.api_history_matches || m.api_history_matches || 0) || 0;
  }
  function loadTotal(force){
    return fetch('data/api_events_history_summary.json' + (force ? '?t=' + Date.now() : ''), {cache: force ? 'no-store' : 'default'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if(j && Number(j.total_events_counted)) totalCount = Number(j.total_events_counted); })
      .catch(function(){});
  }
  function patch(){
    var box = q('#hybrid-main-copy');
    if(!box) return;
    var active = activeCount();
    if(!active) active = totalCount;
    var html = box.innerHTML || '';
    var replacement = '📊 API History (' + fmt(totalCount) + ' total • ' + fmt(active) + ' active în motor)';
    html = html.replace(/📊 API History \([^)]+\)/g, replacement);
    box.innerHTML = html;
    var title = box.querySelector('strong');
    if(title && text(title).indexOf('Hybrid Adaptive Engine') < 0){
      title.innerHTML = 'Motor Unificat de Predicții – <span style="color:var(--grn)">Hybrid Adaptive Engine</span>';
    }
  }
  function boot(){
    loadTotal(false).then(patch);
    setTimeout(patch, 1200);
    setTimeout(patch, 3500);
    setInterval(patch, 5000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__apiHistoryLabelHook){
      btn.__apiHistoryLabelHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ loadTotal(true).then(patch); }, 1400); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
