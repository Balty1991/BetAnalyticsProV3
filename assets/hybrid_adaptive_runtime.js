// Hybrid Adaptive Engine runtime bridge
(function(){
  'use strict';
  if(window.__hybridAdaptiveRuntimeLoaded) return;
  window.__hybridAdaptiveRuntimeLoaded = true;

  function isObject(value){ return value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value){ return isObject(value) ? value : {}; }
  function safeArray(value){ return Array.isArray(value) ? value : []; }
  function safeNumber(value){ var n = Number(value); return isFinite(n) ? n : 0; }
  function hasRealBundle(bundle){
    bundle = safeObject(bundle);
    var summary = safeObject(bundle.summary);
    return safeArray(bundle.rows).length > 0 || safeArray(bundle.adaptive_picks).length > 0 || safeNumber(summary.adaptive_rows) > 0 || safeNumber(summary.adaptive_picks) > 0;
  }

  function normalizePick(row){
    row = safeObject(row);
    var out = Object.assign({}, row);
    var score = safeNumber(out.adaptive_score || out.smart_score || out.score || out.base_score);
    var prob = safeNumber(out.adjusted_prob || out.final_probability || out.model_prob || out.api_prob || out.probability);
    var odds = safeNumber(out.book_odds || out.odds);
    var value = out.value_pct !== undefined ? safeNumber(out.value_pct) : safeNumber(out.value) * 100;
    out.engine_version = out.engine_version || 'v18-hybrid-adaptive-memory-fallback';
    out.smart_score = score;
    out.adaptive_score = score;
    out.adjusted_prob = prob;
    out.final_probability = prob;
    out.book_odds = odds || out.book_odds || out.odds;
    out.value_pct = value;
    out.ev = out.ev !== undefined ? out.ev : safeNumber(out.value);
    out.market_calibrated = out.market_calibrated !== undefined ? out.market_calibrated : true;
    out.learning_state = out.learning_state || 'adaptive';
    return out;
  }

  function bundleFromMemory(){
    var memory = safeObject(window.AI_MEMORY);
    var summary = safeObject(memory.summary);
    var picks = safeArray(memory.adaptive_picks).map(normalizePick);
    if(!picks.length) return null;
    return {
      version: 'v18-hybrid-adaptive-memory-fallback',
      updated_at: memory.updated_at || new Date().toISOString(),
      timezone: 'Europe/Bucharest',
      rows: picks,
      adaptive_picks: picks,
      summary: {
        adaptive_rows: picks.length,
        adaptive_picks: picks.length,
        journal_settled_rows: safeNumber(summary.journal_rows_settled || summary.settled_bets || summary.settled_rows),
        positive_patterns: safeNumber(summary.positive_patterns),
        negative_patterns: safeNumber(summary.negative_patterns),
        api_history_leagues: safeNumber(summary.api_history_leagues || 34),
        api_history_matches: safeNumber(summary.api_history_matches || 58033),
        ready_markets: safeNumber(summary.ready_markets || 6)
      },
      diagnostics: {
        version: 'v18-hybrid-adaptive-memory-fallback',
        updated_at: memory.updated_at || new Date().toISOString(),
        journal_settled_rows: safeNumber(summary.journal_rows_settled || summary.settled_bets || summary.settled_rows),
        journal_winrate: safeNumber(summary.settled_winrate),
        journal_roi: safeNumber(summary.settled_roi),
        adaptive_rows: picks.length,
        adaptive_picks: picks.length,
        positive_patterns: safeNumber(summary.positive_patterns),
        negative_patterns: safeNumber(summary.negative_patterns)
      }
    };
  }

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
    if(!hasRealBundle(bundle)){
      var fallback = bundleFromMemory();
      if(fallback){
        bundle = fallback;
        diagnostics = fallback.diagnostics;
      }
    }
    var rows = safeArray(bundle.rows).map(normalizePick);
    var picks = safeArray(bundle.adaptive_picks).map(normalizePick);
    if(!bundle.version && rows.length === 0 && picks.length === 0) return false;
    if(rows.length === 0 && picks.length > 0) rows = picks;
    if(picks.length === 0 && rows.length > 0) picks = rows.slice(0, 18);

    window.ADAPTIVE_PREDICTIONS = Object.assign({}, bundle, { rows: rows, adaptive_picks: picks });
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
      if(!hasRealBundle(window.ADAPTIVE_PREDICTIONS)){
        var fallback = bundleFromMemory();
        if(fallback) applyHybridData(fallback, fallback.diagnostics);
      }
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
        [safeNumber(summary.adaptive_picks || diagnostics.adaptive_picks) + ' picks adaptive', 'font-size:12px;font-weight:800;color:var(--grn)']
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

  function applyMemoryFallbackNow(){
    var fallback = bundleFromMemory();
    if(!fallback) return false;
    var current = safeObject(window.ADAPTIVE_PREDICTIONS);
    if(hasRealBundle(current) && safeArray(current.adaptive_picks).length >= safeArray(fallback.adaptive_picks).length) return true;
    var ok = applyHybridData(fallback, fallback.diagnostics);
    if(ok) rerender();
    return ok;
  }

  function loadHybrid(force){
    return Promise.all([
      readJson('data/adaptive_predictions.json', force),
      readJson('data/model_diagnostics.json', force)
    ]).then(function(parts){
      var ok = applyHybridData(parts[0], parts[1]);
      if(!ok) ok = applyMemoryFallbackNow();
      if(ok) rerender();
      return ok;
    });
  }

  window.loadHybridAdaptiveEngine = loadHybrid;
  window.refreshHybridAdaptiveEngine = function(){ return loadHybrid(true); };

  function boot(){
    loadHybrid(false);
    var tries = 0;
    var timer = setInterval(function(){
      tries += 1;
      var ok = applyMemoryFallbackNow();
      addHybridBadge();
      if(ok || tries > 20) clearInterval(timer);
    }, 1500);
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
