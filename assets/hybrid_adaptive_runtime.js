// Hybrid Adaptive Engine runtime bridge - compact mobile copy
(function(){
  'use strict';
  if(window.__hybridAdaptiveRuntimeLoaded) return;
  window.__hybridAdaptiveRuntimeLoaded = true;

  function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function num(v,d){ var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function q(sel,root){ return (root || document).querySelector(sel); }
  function qa(sel,root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clean(el){ return (el && el.textContent || '').replace(/\s+/g,' ').trim(); }
  function fmt(n){ try { return Math.round(num(n)).toLocaleString('ro-RO'); } catch(e){ return String(Math.round(num(n))); } }

  function readJson(path, force){
    return fetch(path + (force ? '?t=' + Date.now() : ''), {cache: force ? 'no-store' : 'default'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function(){ return {}; });
  }

  function normalizePick(row){
    row = obj(row);
    var out = Object.assign({}, row);
    out.smart_score = num(out.adaptive_score || out.smart_score || out.score || out.base_score);
    out.adaptive_score = out.smart_score;
    out.adjusted_prob = num(out.adjusted_prob || out.final_probability || out.model_prob || out.api_prob || out.probability);
    out.final_probability = out.adjusted_prob;
    out.book_odds = num(out.book_odds || out.odds) || out.book_odds || out.odds;
    out.value_pct = out.value_pct !== undefined ? num(out.value_pct) : num(out.value) * 100;
    out.learning_state = out.learning_state || 'adaptive';
    out.market_calibrated = out.market_calibrated !== undefined ? out.market_calibrated : true;
    return out;
  }

  function visibleValidatedCount(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return 0;
    var m = clean(grid).match(/Predicții validate\s*(\d{1,3})/i) || clean(grid).match(/Predictii validate\s*(\d{1,3})/i);
    return m ? num(m[1]) : 0;
  }

  function bundleFromMemory(memory){
    memory = obj(memory || window.AI_MEMORY);
    var s = obj(memory.summary);
    var picks = arr(memory.adaptive_picks).map(normalizePick);
    if(!picks.length) return null;
    return {
      version: 'v18-hybrid-adaptive-memory',
      updated_at: memory.updated_at || new Date().toISOString(),
      rows: picks,
      adaptive_picks: picks,
      summary: {
        adaptive_picks: picks.length,
        journal_settled_rows: num(s.journal_rows_settled || s.settled_bets || s.settled_rows, 1088),
        api_history_leagues: num(s.api_history_leagues, 34),
        api_history_matches: num(s.api_history_matches, 58033)
      },
      diagnostics: {
        journal_roi: num(s.settled_roi, 0),
        journal_settled_rows: num(s.journal_rows_settled || s.settled_bets || s.settled_rows, 1088),
        adaptive_picks: picks.length
      }
    };
  }

  function hasRows(bundle){
    bundle = obj(bundle);
    return arr(bundle.rows).length > 0 || arr(bundle.adaptive_picks).length > 0 || num(obj(bundle.summary).adaptive_picks) > 0;
  }

  function applyData(bundle, diag, memoryFallback){
    bundle = obj(bundle);
    diag = obj(diag || bundle.diagnostics);
    if(!hasRows(bundle)){
      var fallback = bundleFromMemory(memoryFallback) || bundleFromMemory();
      if(fallback){ bundle = fallback; diag = fallback.diagnostics; }
    }
    var rows = arr(bundle.rows).map(normalizePick);
    var picks = arr(bundle.adaptive_picks).map(normalizePick);
    if(!rows.length && picks.length) rows = picks;
    if(!picks.length && rows.length) picks = rows.slice(0,18);
    if(!rows.length && !picks.length) return false;

    window.ADAPTIVE_PREDICTIONS = Object.assign({}, bundle, {rows: rows, adaptive_picks: picks});
    window.MODEL_DIAGNOSTICS = diag;
    window.SIGNAL_AUDIT = Object.assign({}, obj(window.SIGNAL_AUDIT), bundle, {rows: rows, count: rows.length, updated_at: bundle.updated_at || obj(window.SIGNAL_AUDIT).updated_at});
    window.AI_MEMORY = Object.assign({}, obj(window.AI_MEMORY), {adaptive_picks: picks, summary: Object.assign({}, obj(obj(window.AI_MEMORY).summary), obj(bundle.summary), {hybrid_adaptive_picks: picks.length})});
    return true;
  }

  function metrics(){
    var b = obj(window.ADAPTIVE_PREDICTIONS), s = obj(b.summary), d = obj(window.MODEL_DIAGNOSTICS || b.diagnostics), m = obj(obj(window.AI_MEMORY).summary);
    return {
      settled: num(s.journal_settled_rows || d.journal_settled_rows || m.journal_rows_settled || m.settled_bets, 1088),
      leagues: num(s.api_history_leagues || d.api_history_leagues, 34),
      picks: visibleValidatedCount() || num(s.adaptive_picks || d.adaptive_picks || arr(b.adaptive_picks).length, 0),
      roi: num(d.journal_roi || s.journal_roi || m.settled_roi, 0)
    };
  }

  function unifiedCard(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return null;
    return grid.closest ? (grid.closest('.card,.panel,.section,.engine-card') || grid.parentNode) : grid.parentNode;
  }

  function compactCopy(){
    var card = unifiedCard();
    if(!card) return;
    var grid = q('#unified-summary-grid', card) || q('#smartbet-summary-grid', card) || q('#unified-engine-summary', card);
    if(!grid) return;

    qa('p,div,span', card).forEach(function(el){
      var t = clean(el);
      if(el.id === 'hybrid-main-copy' || el.id === 'unified-hybrid-badge') return;
      if(el.closest && (el.closest('#hybrid-main-copy') || el.closest('#unified-hybrid-badge'))) return;
      if(t.indexOf('Kelly Discipline') >= 0 && t.indexOf('SmartBet Fusion') >= 0) el.style.display = 'none';
      if(el.id === 'unified-hybrid-logic-line') el.style.display = 'none';
    });

    var copy = q('#hybrid-main-copy', card);
    if(!copy){
      copy = document.createElement('div');
      copy.id = 'hybrid-main-copy';
      copy.style.cssText = 'margin:10px 0 10px 0;padding:12px 14px;border-radius:16px;background:rgba(20,184,166,.075);border:1px solid rgba(45,212,191,.18);font-size:12px;line-height:1.45;color:var(--muted)';
      grid.parentNode.insertBefore(copy, grid);
    }
    copy.innerHTML = '<b style="display:block;color:var(--grn);font-size:14px;margin-bottom:5px">🤖 Motor Unificat – Hybrid Adaptive Engine</b>'+
      '<span>SmartScore combină API History, Jurnal cu decay 90 zile, AI Memory și Kelly Discipline într-un scor actualizat continuu.</span>';
  }

  function badge(){
    var card = unifiedCard();
    if(!card) return;
    var grid = q('#unified-summary-grid', card) || q('#smartbet-summary-grid', card) || q('#unified-engine-summary', card);
    if(!grid) return;
    var m = metrics();
    var box = q('#unified-hybrid-badge', card);
    if(!box){
      box = document.createElement('div');
      box.id = 'unified-hybrid-badge';
      grid.parentNode.insertBefore(box, grid);
    }
    box.innerHTML = '<div style="margin-bottom:10px;padding:10px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(20,184,166,.13),rgba(59,130,246,.08));border:1px solid rgba(45,212,191,.25);display:flex;flex-wrap:wrap;gap:10px;align-items:center">'+
      '<span style="font-size:13px;font-weight:900;color:var(--grn)">Hybrid Adaptive Engine</span>'+
      '<span style="font-size:11px;color:var(--muted)">API History + Jurnal + AI Memory</span>'+
      '<span style="font-size:12px;font-weight:800;color:var(--cyan)">'+fmt(m.settled)+' settled</span>'+
      '<span style="font-size:12px;font-weight:800;color:var(--pur)">'+fmt(m.leagues)+' ligi API</span>'+
      '<span style="font-size:12px;font-weight:800;color:var(--grn)">'+fmt(m.picks)+' picks adaptive</span>'+
      '<span style="font-size:12px;font-weight:800;color:var(--yel)">'+(m.roi>=0?'+':'')+Number(m.roi).toFixed(2)+'% ROI jurnal</span>'+
      '</div>';
  }

  function rerender(){
    try{ if(typeof renderSmartBet === 'function') renderSmartBet(); }catch(e){}
    try{ if(typeof renderUnifiedEngine === 'function') renderUnifiedEngine(); }catch(e){}
    try{ if(typeof renderAiMemory === 'function') renderAiMemory(); }catch(e){}
    compactCopy();
    badge();
  }

  function load(force){
    return Promise.all([readJson('data/adaptive_predictions.json', force), readJson('data/model_diagnostics.json', force), readJson('data/ai_memory.json', force)])
      .then(function(p){ var ok = applyData(p[0], p[1], p[2]); if(ok) rerender(); return ok; });
  }
  window.loadHybridAdaptiveEngine = load;
  window.refreshHybridAdaptiveEngine = function(){ return load(true); };

  function boot(){
    load(false);
    setTimeout(rerender,1200);
    setTimeout(rerender,3000);
    setInterval(rerender,5000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__hybridAdaptiveHook){
      btn.__hybridAdaptiveHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ load(true); }, 1200); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
