// Restore/stabilize Unified Engine adaptive picks priority
// Keeps Motor Unificat on the richer Hybrid Adaptive/AI Memory set instead of falling back to a smaller strict set.
(function(){
  'use strict';
  if(window.__adaptiveRestoreRuntimeLoaded) return;
  window.__adaptiveRestoreRuntimeLoaded = true;

  function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function num(v,d){ var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function keyOf(p){ return String(p.event_id || p.id || '') + '|' + String(p.market_key || p.market || '') + '|' + String(p.prediction_id || ''); }
  function pickDate(p){ try { var d = new Date(p.event_date || p.date || p.created_at || 0); return isNaN(d.getTime()) ? null : d; } catch(e){ return null; } }
  function scoreOf(p){ return Math.max(num(p.adaptive_score), num(p.smart_score), num(p.score), num(p.base_score)); }
  function isFresh(p){
    var d = pickDate(p);
    if(!d) return true;
    return d.getTime() >= (Date.now() - 3 * 3600 * 1000);
  }
  function normalize(p){
    p = Object.assign({}, obj(p));
    var rawScore = scoreOf(p);
    var displayScore = rawScore >= 90 ? 100 : Math.min(100, Math.round(rawScore));
    p.score = displayScore;
    p.smart_score = displayScore;
    p.adaptive_score_raw = rawScore;
    p.adaptive_score = displayScore;
    p.adjusted_prob = num(p.adjusted_prob || p.final_probability || p.model_prob || p.api_prob || p.probability);
    p.final_probability = p.adjusted_prob;
    p.book_odds = num(p.book_odds || p.odds) || p.book_odds || p.odds;
    p.odds = p.odds || p.book_odds;
    p.value_pct = p.value_pct !== undefined ? num(p.value_pct) : num(p.value) * 100;
    p.learning_state = p.learning_state || 'adaptive';
    p.market_calibrated = p.market_calibrated !== undefined ? p.market_calibrated : true;
    p.engine_version = p.engine_version || 'v18-hybrid-adaptive-restored';
    return p;
  }
  function readJson(path, force){
    return fetch(path + (force ? '?restore=' + Date.now() : ''), {cache: force ? 'no-store' : 'default'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function(){ return {}; });
  }
  function mergePicks(memory, adaptive){
    var candidates = [];
    candidates = candidates.concat(arr(obj(memory).adaptive_picks));
    candidates = candidates.concat(arr(obj(adaptive).adaptive_picks));
    candidates = candidates.concat(arr(obj(adaptive).rows));
    var byKey = {};
    candidates.forEach(function(p){
      if(!p || !isFresh(p)) return;
      var k = keyOf(p);
      if(!k || k === '||') return;
      var n = normalize(p);
      if(!byKey[k] || scoreOf(n) > scoreOf(byKey[k])) byKey[k] = n;
    });
    var out = Object.keys(byKey).map(function(k){ return byKey[k]; });
    out.sort(function(a,b){ return scoreOf(b) - scoreOf(a) || num(b.edge_pct) - num(a.edge_pct) || num(b.value_pct) - num(a.value_pct); });
    return out.slice(0, 9);
  }
  function applyRestored(memory, adaptive){
    var picks = mergePicks(memory, adaptive);
    if(!picks.length) return false;
    var ms = obj(obj(memory).summary);
    var as = obj(obj(adaptive).summary);
    var summary = Object.assign({}, as, ms, {
      adaptive_picks: picks.length,
      adaptive_rows: picks.length,
      journal_settled_rows: num(ms.journal_rows_settled || ms.settled_bets || as.journal_settled_rows, 0),
      api_history_leagues: num(as.api_history_leagues || ms.api_history_leagues || 34, 34),
      api_history_matches: num(as.api_history_matches || ms.api_history_matches || 58033, 58033)
    });
    var bundle = Object.assign({}, obj(adaptive), {
      version: 'v18-hybrid-adaptive-restored-top9',
      updated_at: obj(adaptive).updated_at || obj(memory).updated_at || new Date().toISOString(),
      rows: picks,
      adaptive_picks: picks,
      summary: summary
    });
    var diag = Object.assign({}, obj(bundle.diagnostics), {
      adaptive_picks: picks.length,
      adaptive_rows: picks.length,
      journal_settled_rows: summary.journal_settled_rows,
      journal_roi: num(obj(memory).summary && obj(memory).summary.settled_roi, num(obj(bundle.diagnostics).journal_roi, 0))
    });

    window.ADAPTIVE_PREDICTIONS = bundle;
    window.MODEL_DIAGNOSTICS = diag;
    window.SIGNAL_AUDIT = Object.assign({}, obj(window.SIGNAL_AUDIT), bundle, { rows: picks, count: picks.length, updated_at: bundle.updated_at });
    window.AI_MEMORY = Object.assign({}, obj(window.AI_MEMORY), memory, { adaptive_picks: picks, summary: Object.assign({}, ms, summary, { hybrid_adaptive_picks: picks.length }) });
    return true;
  }
  function rerender(){
    try{ if(typeof renderSmartBet === 'function') renderSmartBet(); }catch(e){}
    try{ if(typeof renderUnifiedEngine === 'function') renderUnifiedEngine(); }catch(e){}
    try{ if(typeof renderAiMemory === 'function') renderAiMemory(); }catch(e){}
    try{ if(typeof window.loadHybridAdaptiveEngine === 'function') window.loadHybridAdaptiveEngine(false); }catch(e){}
  }
  function run(force){
    return Promise.all([
      readJson('data/ai_memory.json', force),
      readJson('data/adaptive_predictions.json', force)
    ]).then(function(parts){
      var ok = applyRestored(parts[0], parts[1]);
      if(ok) rerender();
      return ok;
    });
  }
  window.restoreAdaptiveTopPicks = run;
  function boot(){
    run(false);
    setTimeout(function(){ run(false); }, 1500);
    setTimeout(function(){ run(false); }, 3500);
    setInterval(function(){ run(false); }, 7000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__adaptiveRestoreHook){
      btn.__adaptiveRestoreHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ run(true); }, 1600); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
