// Hybrid Adaptive Engine runtime bridge - top9 adaptive source of truth
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

  function rawScore(row){
    row = obj(row);
    return Math.max(num(row.adaptive_score_raw), num(row.adaptive_score), num(row.smart_score), num(row.score), num(row.base_score));
  }
  function pickKey(row){
    row = obj(row);
    return String(row.event_id || row.id || '') + '|' + String(row.market_key || row.market || '') + '|' + String(row.prediction_id || '');
  }
  function pickDate(row){
    try{
      var d = new Date(row.event_date || row.date || row.created_at || 0);
      return isNaN(d.getTime()) ? null : d;
    }catch(e){ return null; }
  }
  function isFresh(row){
    var d = pickDate(row);
    if(!d) return true;
    return d.getTime() >= (Date.now() - 3 * 3600 * 1000);
  }
  function normalizePick(row){
    row = obj(row);
    var out = Object.assign({}, row);
    var raw = rawScore(out);
    var displayScore = raw >= 85 ? 100 : Math.min(100, Math.round(raw));
    out.adaptive_score_raw = raw;
    out.smart_score = displayScore;
    out.adaptive_score = displayScore;
    out.score = displayScore;
    out.adjusted_prob = num(out.adjusted_prob || out.final_probability || out.model_prob || out.api_prob || out.probability);
    out.final_probability = out.adjusted_prob;
    out.book_odds = num(out.book_odds || out.odds) || out.book_odds || out.odds;
    out.odds = out.odds || out.book_odds;
    out.value_pct = out.value_pct !== undefined ? num(out.value_pct) : num(out.value) * 100;
    out.learning_state = out.learning_state || 'adaptive';
    out.market_calibrated = out.market_calibrated !== undefined ? out.market_calibrated : true;
    out.engine_version = out.engine_version || 'v18-hybrid-adaptive-top9';
    return out;
  }
  function mergeTopPicks(adaptive, memory){
    var candidates = [];
    candidates = candidates.concat(arr(obj(memory).adaptive_picks));
    candidates = candidates.concat(arr(obj(adaptive).adaptive_picks));
    candidates = candidates.concat(arr(obj(adaptive).rows));
    var byKey = {};
    candidates.forEach(function(row){
      if(!row || !isFresh(row)) return;
      var key = pickKey(row);
      if(!key || key === '||') return;
      var n = normalizePick(row);
      if(!byKey[key] || rawScore(n) > rawScore(byKey[key])) byKey[key] = n;
    });
    var out = Object.keys(byKey).map(function(k){ return byKey[k]; });
    // FIX: cap rawScore la 100 înainte de sort — ai_memory adaptive_score (115-127) nu trebuie să
    // domine adaptive_predictions picks (max 100). Tie-break pe edge_pct, apoi value_pct.
    out.sort(function(a,b){
      var aRaw = Math.min(100, rawScore(a));
      var bRaw = Math.min(100, rawScore(b));
      return bRaw - aRaw || num(b.edge_pct || b.edge_pp) - num(a.edge_pct || a.edge_pp) || num(b.value_pct) - num(a.value_pct);
    });
    return out.slice(0, 9);
  }

  function visibleValidatedCount(){
    // Numărul autoritar scris de renderUnifiedEngine — sursă unică de adevăr
    if(typeof window.__UNIFIED_POOL_COUNT__ === 'number' && window.__UNIFIED_POOL_COUNT__ > 0){
      return window.__UNIFIED_POOL_COUNT__;
    }
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return 0;
    var raw = grid.textContent || grid.innerText || '';
    var m = raw.match(/Predi\w*ii\s+validate\s*:?\s*(\d{1,3})/i) ||
            raw.match(/validate\s*:?\s*(\d{1,3})\s*trecute/i);
    return m ? num(m[1]) : 0;
  }

  function applyData(adaptive, diag, memory){
    adaptive = obj(adaptive);
    memory = obj(memory || window.AI_MEMORY);
    diag = obj(diag || adaptive.diagnostics);
    var picks = mergeTopPicks(adaptive, memory);
    if(!picks.length) return false;

    var as = obj(adaptive.summary), ms = obj(memory.summary);
    var summary = Object.assign({}, as, ms, {
      adaptive_picks: picks.length,
      adaptive_rows: picks.length,
      journal_settled_rows: num(ms.journal_rows_settled || ms.settled_bets || as.journal_settled_rows, 0),
      journal_rows: num(ms.journal_rows || ms.total_journal_rows || as.journal_rows, 1188),
      api_history_leagues: num(as.api_history_leagues || ms.api_history_leagues, 34),
      api_history_matches: num(as.api_history_matches || ms.api_history_matches, 58033)
    });
    var bundle = Object.assign({}, adaptive, {
      version: 'v18-hybrid-adaptive-top9-source-of-truth',
      updated_at: adaptive.updated_at || memory.updated_at || new Date().toISOString(),
      rows: picks,
      adaptive_picks: picks,
      summary: summary
    });
    var diagnostics = Object.assign({}, diag, {
      adaptive_picks: picks.length,
      adaptive_rows: picks.length,
      journal_settled_rows: summary.journal_settled_rows,
      journal_roi: num(ms.settled_roi, num(diag.journal_roi, 0))
    });

    window.ADAPTIVE_PREDICTIONS = bundle;
    window.MODEL_DIAGNOSTICS = diagnostics;
    window.SIGNAL_AUDIT = Object.assign({}, obj(window.SIGNAL_AUDIT), bundle, {rows: picks, count: picks.length, updated_at: bundle.updated_at});
    window.AI_MEMORY = Object.assign({}, obj(window.AI_MEMORY), memory, {adaptive_picks: picks, summary: Object.assign({}, ms, summary, {hybrid_adaptive_picks: picks.length})});
    return true;
  }

  function metrics(){
    var b = obj(window.ADAPTIVE_PREDICTIONS), s = obj(b.summary), d = obj(window.MODEL_DIAGNOSTICS || b.diagnostics), m = obj(obj(window.AI_MEMORY).summary);
    return {
      settled: num(s.journal_settled_rows || d.journal_settled_rows || m.journal_rows_settled || m.settled_bets, 1116),
      journalRows: num(s.journal_rows || d.journal_rows || m.journal_rows || m.total_journal_rows, 1188),
      leagues: num(s.api_history_leagues || d.api_history_leagues || m.api_history_leagues, 34),
      apiMatches: num(s.api_history_matches || d.api_history_matches || m.api_history_matches, 58033),
      picks: visibleValidatedCount() || num(s.adaptive_picks || d.adaptive_picks || arr(b.adaptive_picks).length, 0),
      roi: num(d.journal_roi || s.journal_roi || m.settled_roi, 0)
    };
  }
  function unifiedCard(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return null;
    return grid.closest ? (grid.closest('.card,.panel,.section,.engine-card') || grid.parentNode) : grid.parentNode;
  }
  function refinedCopy(){
    var card = unifiedCard();
    if(!card) return;
    var grid = q('#unified-summary-grid', card) || q('#smartbet-summary-grid', card) || q('#unified-engine-summary', card);
    if(!grid) return;
    qa('p,div,span', card).forEach(function(el){
      var t = clean(el);
      if(el.id === 'hybrid-main-copy' || el.id === 'unified-hybrid-badge') return;
      if(el.closest && (el.closest('#hybrid-main-copy') || el.closest('#unified-hybrid-badge'))) return;
      if(t.indexOf('Kelly Discipline') >= 0 && t.indexOf('SmartBet Fusion') >= 0) el.style.display = 'none';
      if(t.indexOf('Motor Unificat') >= 0 && t.indexOf('Hybrid Adaptive Engine') >= 0 && el.id !== 'hybrid-main-copy') el.style.display = 'none';
      if(el.id === 'unified-hybrid-logic-line') el.style.display = 'none';
    });
    var m = metrics();
    var copy = q('#hybrid-main-copy', card);
    if(!copy){
      copy = document.createElement('div');
      copy.id = 'hybrid-main-copy';
      copy.style.cssText = 'margin:10px 0 10px 0;padding:13px 15px;border-radius:17px;background:rgba(20,184,166,.075);border:1px solid rgba(45,212,191,.18);font-size:12px;line-height:1.48;color:var(--muted)';
      grid.parentNode.insertBefore(copy, grid);
    }
    copy.innerHTML = '<div style="font-size:15px;font-weight:900;color:var(--txt);margin-bottom:7px">🧠 <strong>Motor Unificat de Predicții – <span style="color:var(--grn)">Hybrid Adaptive Engine</span></strong></div>'+
      '<div style="margin-bottom:8px;color:var(--txt)">Kelly Discipline + <strong>AI Memory Patterns hibrid</strong> (API History + Jurnal) + SmartBet Fusion — un singur scor de acuratețe actualizat continuu.</div>'+
      '<div style="margin-bottom:8px"><strong style="color:var(--cyan)">Formula SmartScore:</strong><br>probabilitate API + multiplicatori Jurnal (decay 90 zile) + pattern-uri AI Memory + disciplină Kelly</div>'+
      '<div><strong style="color:var(--grn)">Hybrid Adaptive Engine:</strong><br>• 📊 API History ('+fmt(m.apiMatches)+' meciuri indexate)<br>• 📋 Jurnal Aplicație ('+fmt(m.journalRows)+' înregistrări)<br>• ✅ '+fmt(m.settled)+' settled bets • '+fmt(m.leagues)+' ligi<br>• 🎯 '+fmt(m.picks)+' picks adaptive • <span style="color:var(--yel);font-weight:800">'+(m.roi>=0?'+':'')+Number(m.roi).toFixed(2)+'% ROI jurnal</span></div>';
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
    refinedCopy();
    badge();
    // FIX: re-renderează filtrul Motor din Meciuri când datele motorului se actualizează
    try{
      if(typeof renderMatches === 'function' && typeof CURRENT_FILTER !== 'undefined' && CURRENT_FILTER === 'motor_validated'){
        renderMatches();
      }
    }catch(e){}
  }
  function load(force){
    return Promise.all([readJson('data/adaptive_predictions.json', force), readJson('data/model_diagnostics.json', force), readJson('data/ai_memory.json', force)])
      .then(function(p){ var ok = applyData(p[0], p[1], p[2]); if(ok) rerender(); return ok; });
  }
  window.loadHybridAdaptiveEngine = load;
  window.refreshHybridAdaptiveEngine = function(){ return load(true); };
  function boot(){
    load(false);
    setTimeout(function(){ load(false); },1200);
    setTimeout(function(){ load(false); },3000);
    setInterval(function(){ load(false); },7000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__hybridAdaptiveHook){
      btn.__hybridAdaptiveHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ load(true); }, 1200); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
