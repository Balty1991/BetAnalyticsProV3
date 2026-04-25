// Hybrid Adaptive Engine runtime bridge
(function(){
  'use strict';
  if(window.__hybridAdaptiveRuntimeLoaded) return;
  window.__hybridAdaptiveRuntimeLoaded = true;

  function isObject(value){ return value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value){ return isObject(value) ? value : {}; }
  function safeArray(value){ return Array.isArray(value) ? value : []; }
  function safeNumber(value){ var n = Number(value); return isFinite(n) ? n : 0; }

  function readJson(path, force){
    var url = path + (force ? '?hybrid=' + Date.now() : '');
    return fetch(url, { cache: force ? 'no-store' : 'default' })
      .then(function(response){
        if(!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .catch(function(){ return {}; });
  }

  function applyHybridData(bundle, diagnostics){
    bundle = safeObject(bundle);
    diagnostics = safeObject(diagnostics || bundle.diagnostics);
    var rows = safeArray(bundle.rows);
    var picks = safeArray(bundle.adaptive_picks);
    if(!bundle.version && rows.length === 0 && picks.length === 0) return false;

    window.ADAPTIVE_PREDICTIONS = bundle;
    window.MODEL_DIAGNOSTICS = diagnostics;

    if(rows.length){
      var audit = safeObject(window.SIGNAL_AUDIT);
      window.__BASE_SIGNAL_AUDIT__ = window.__BASE_SIGNAL_AUDIT__ || audit;
      window.SIGNAL_AUDIT = Object.assign({}, audit, bundle, {
        rows: rows,
        count: rows.length,
        updated_at: bundle.updated_at || audit.updated_at
      });
    }

    if(picks.length){
      var memory = Object.assign({}, safeObject(window.AI_MEMORY));
      var oldSummary = safeObject(memory.summary);
      var summary = safeObject(bundle.summary);
      memory.adaptive_picks = picks;
      memory.updated_at = bundle.updated_at || memory.updated_at;
      memory.version = bundle.version || memory.version || 'hybrid-adaptive';
      memory.summary = Object.assign({}, oldSummary, {
        hybrid_adaptive_picks: picks.length,
        hybrid_journal_settled_rows: summary.journal_settled_rows || oldSummary.journal_rows_settled || 0,
        hybrid_positive_patterns: summary.positive_patterns || oldSummary.positive_patterns || 0,
        hybrid_negative_patterns: summary.negative_patterns || oldSummary.negative_patterns || 0
      });
      window.AI_MEMORY = memory;
    }
    return true;
  }

  function addHybridBadge(){
    try{
      var target = document.getElementById('unified-summary-grid') || document.getElementById('smartbet-summary-grid') || document.getElementById('unified-engine-summary');
      if(!target || !target.parentNode) return;
      var bundle = safeObject(window.ADAPTIVE_PREDICTIONS);
      if(!bundle.version) return;
      var diagnostics = safeObject(window.MODEL_DIAGNOSTICS || bundle.diagnostics);
      var summary = safeObject(bundle.summary);
      var box = document.getElementById('unified-hybrid-badge');
      if(!box){
        box = document.createElement('div');
        box.id = 'unified-hybrid-badge';
        target.parentNode.insertBefore(box, target);
      }
      while(box.firstChild) box.removeChild(box.firstChild);
      var wrap = document.createElement('div');
      wrap.style.cssText = 'margin-bottom:10px;padding:10px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(20,184,166,.13),rgba(59,130,246,.08));border:1px solid rgba(45,212,191,.25);display:flex;flex-wrap:wrap;gap:10px;align-items:center';
      var items = [
        ['Hybrid Adaptive Engine', 'font-size:13px;font-weight:900;color:var(--grn)'],
        ['API History + Jurnal + AI Memory', 'font-size:11px;color:var(--muted)'],
        [safeNumber(summary.journal_settled_rows || diagnostics.journal_settled_rows) + ' settled', 'font-size:12px;font-weight:800;color:var(--cyan)'],
        [safeNumber(summary.api_history_leagues) + ' ligi API', 'font-size:12px;font-weight:800;color:var(--pur)'],
        [safeNumber(summary.adaptive_picks) + ' picks adaptive', 'font-size:12px;font-weight:800;color:var(--grn)']
      ];
      if(diagnostics.journal_roi !== undefined){
        var roi = safeNumber(diagnostics.journal_roi);
        items.push([(roi >= 0 ? '+' : '') + roi.toFixed(2) + '% ROI jurnal', 'font-size:12px;font-weight:800;color:var(--yel)']);
      }
      items.forEach(function(item){
        var span = document.createElement('span');
        span.textContent = item[0];
        span.style.cssText = item[1];
        wrap.appendChild(span);
      });
      box.appendChild(wrap);
    }catch(e){}
  }

  function rerender(){
    try{ if(typeof renderSmartBet === 'function') renderSmartBet(); }catch(e){}
    try{ if(typeof renderUnifiedEngine === 'function') renderUnifiedEngine(); }catch(e){}
    try{ if(typeof renderAiMemory === 'function') renderAiMemory(); }catch(e){}
    addHybridBadge();
  }

  function loadHybrid(force){
    return Promise.all([
      readJson('data/adaptive_predictions.json', force),
      readJson('data/model_diagnostics.json', force)
    ]).then(function(parts){
      var ok = applyHybridData(parts[0], parts[1]);
      if(ok) rerender();
      return ok;
    });
  }

  window.loadHybridAdaptiveEngine = loadHybrid;
  window.refreshHybridAdaptiveEngine = function(){ return loadHybrid(true); };

  function boot(){
    loadHybrid(false);
    setTimeout(addHybridBadge, 2200);
    setInterval(addHybridBadge, 5000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__hybridAdaptiveHook){
      btn.__hybridAdaptiveHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ loadHybrid(true); }, 1400); });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
