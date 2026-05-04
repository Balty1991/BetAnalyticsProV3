// Validated predictions tracker runtime for BetAnalytics Pro
(function(){
  'use strict';
  if(window.__predictionHistoryRuntimeLoaded) return;
  window.__predictionHistoryRuntimeLoaded = true;

  var DATA_PATH = 'data/prediction_type_history.json';
  var EXPECTED_VERSION = 'v2-validated-prediction-tracker';

  function q(sel, root){ return (root || document).querySelector(sel); }
  function num(v,d){ var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function fmtPct(v){ return (num(v) >= 0 ? '+' : '') + num(v).toFixed(2) + '%'; }
  function fmtWin(v){ return num(v).toFixed(1) + '%'; }
  function ro(n){ try { return Math.round(num(n)).toLocaleString('ro-RO'); } catch(e){ return String(Math.round(num(n))); } }
  function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function arr(v){ return Array.isArray(v) ? v : []; }

  function readJson(force){
    return fetch(DATA_PATH + (force ? '?t=' + Date.now() : ''), {cache: force ? 'no-store' : 'default'})
      .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function(){ return {}; });
  }

  function keyOf(p){ return String(p.event_id || p.id || '') + '|' + String(p.market_key || p.market || '') + '|' + String(p.prediction_id || ''); }
  function marketKey(p){
    var raw = String(p.market_key || p.market || '').toLowerCase().replace(/\s+/g,'').replace(/\./g,'');
    if(raw.indexOf('under') >= 0 && raw.indexOf('35') >= 0) return 'under35';
    if(raw.indexOf('over') >= 0 && raw.indexOf('15') >= 0) return 'over15';
    if(raw.indexOf('over') >= 0 && raw.indexOf('25') >= 0) return 'over25';
    if(raw.indexOf('btts') >= 0) return 'btts';
    return raw || 'unknown';
  }
  function marketLabel(k){ return ({under35:'Under 3.5G',over15:'Over 1.5G',over25:'Over 2.5G',btts:'BTTS'})[k] || k; }
  function activePicksPayload(){
    var b = obj(window.ADAPTIVE_PREDICTIONS);
    var picks = arr(b.adaptive_picks).length ? arr(b.adaptive_picks) : arr(b.rows);
    var byKey = {};
    picks.forEach(function(p){
      if(!p) return;
      var k = keyOf(p);
      if(!k || k === '||') return;
      byKey[k] = p;
    });
    var rows = Object.keys(byKey).map(function(k){
      var p = byKey[k], mk = marketKey(p);
      return {
        tracker_id: String(p.event_id || p.id || '') + '|' + mk,
        status: 'pending',
        event_id: p.event_id || p.id,
        prediction_id: p.prediction_id,
        event_date: p.event_date || p.date,
        home: p.home || p.home_team,
        away: p.away || p.away_team,
        league: p.league,
        market_key: mk,
        market: marketLabel(mk),
        odds: num(p.odds || p.book_odds),
        score: num(p.score || p.smart_score || p.adaptive_score),
        probability: num(p.adjusted_prob || p.final_probability || p.model_prob || p.api_prob),
        edge_pct: num(p.edge_pct || p.edge_pp),
        source: 'validated_unified_engine'
      };
    }).slice(0, 12);
    var markets = {}, totalOdds = 0;
    rows.forEach(function(r){
      totalOdds += num(r.odds);
      if(!markets[r.market_key]) markets[r.market_key] = {market_key:r.market_key, market:r.market, tracked:0, settled:0, wins:0, losses:0, pending:0, void:0, stake_units:0, profit_units:0, winrate:0, roi:0, avg_odds:0};
      markets[r.market_key].tracked += 1;
      markets[r.market_key].pending += 1;
      markets[r.market_key].avg_odds += num(r.odds);
    });
    Object.keys(markets).forEach(function(k){ markets[k].avg_odds = markets[k].tracked ? markets[k].avg_odds / markets[k].tracked : 0; });
    return {
      version: EXPECTED_VERSION,
      scope: 'validated_predictions_from_activation_only',
      summary: {tracked: rows.length, settled:0, wins:0, losses:0, pending:rows.length, void:0, stake_units:0, profit_units:0, winrate:0, roi:0, avg_odds: rows.length ? totalOdds / rows.length : 0},
      markets: Object.keys(markets).map(function(k){ return markets[k]; }),
      tracked_predictions: rows,
      current_validated_count: rows.length
    };
  }

  function findUnifiedCard(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return null;
    return grid.closest ? (grid.closest('.card,.panel,.section,.engine-card') || grid.parentNode) : grid.parentNode;
  }

  function chip(label, value, color){
    return '<span style="display:inline-flex;gap:5px;align-items:center;padding:7px 10px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);font-size:11px;color:var(--muted)"><b style="color:' + color + ';font-size:12px">' + value + '</b>' + label + '</span>';
  }

  function marketRow(row){
    row = obj(row);
    var settled = num(row.settled);
    var roi = num(row.roi);
    var wr = num(row.winrate);
    var roiColor = settled ? (roi >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--muted)';
    var wrColor = settled ? (wr >= 65 ? 'var(--grn)' : (wr >= 50 ? 'var(--yel)' : 'var(--red)')) : 'var(--muted)';
    return '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.07)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:7px">' +
        '<div style="font-weight:900;color:var(--txt);font-size:13px">' + (row.market || row.market_key || 'Pronostic') + '</div>' +
        '<div style="font-size:12px;font-weight:900;color:' + roiColor + '">' + (settled ? fmtPct(roi) + ' ROI' : 'în așteptare') + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px">' +
        chip('urmărite', ro(row.tracked), 'var(--cyan)') +
        chip('settled', ro(row.settled), 'var(--cyan)') +
        chip('W', ro(row.wins), 'var(--grn)') +
        chip('L', ro(row.losses), 'var(--red)') +
        chip('WR', fmtWin(row.winrate), wrColor) +
        chip('pend', ro(row.pending), 'var(--muted)') +
      '</div>' +
    '</div>';
  }

  function livePoolRows(){
    // Citeste pool-ul curent SmartBet din browser (cele care trec acum prin
    // filtrele Kelly + AI Memory + SmartBet). Returneaza null daca app.js
    // nu a expus inca getSmartBetAnalysis (la primele cateva ms din boot).
    var fn = (typeof window.getSmartBetAnalysis === 'function') ? window.getSmartBetAnalysis : null;
    if(!fn) return null;
    var pool = [];
    try {
      var analysis = fn() || {};
      pool = arr(analysis.pool);
    } catch(e){ return null; }
    if(typeof window.calcUnifiedScore === 'function'){
      pool = pool.map(function(row){
        var copy = Object.assign({}, row);
        try { copy._unifiedScore = window.calcUnifiedScore(row); } catch(e){ copy._unifiedScore = num(row.score); }
        return copy;
      }).sort(function(a,b){ return num(b._unifiedScore) - num(a._unifiedScore); });
    }
    return pool.map(function(p){
      var mk = marketKey(p);
      return {
        tracker_id: String(p.event_id || p.id || '') + '|' + mk,
        status: 'pending',
        event_id: p.event_id || p.id,
        prediction_id: p.prediction_id,
        event_date: p.event_date || p.date,
        home: p.home || p.home_team,
        away: p.away || p.away_team,
        league: p.league,
        market_key: mk,
        market: marketLabel(mk),
        odds: num(p.odds || p.book_odds || p.displayOdds),
        score: num(p._unifiedScore || p.score || p.smart_score || p.adaptive_score),
        probability: num(p.adjusted_prob || p.prob || p.final_probability || p.api_prob),
        edge_pct: num(p.edge_pct || p.edge_pp || p.edge),
        source: 'live_smartbet_pool'
      };
    });
  }

  function settledOnly(rows){
    return arr(rows).filter(function(r){
      var s = String(obj(r).status||'').toLowerCase();
      return s === 'win' || s === 'loss' || s === 'lose' || s === 'void';
    });
  }

  function aggregateMarkets(rows){
    var markets = {};
    var totals = {tracked:0, settled:0, wins:0, losses:0, pending:0, void_:0, stake:0, profit:0, oddsSum:0};
    rows.forEach(function(r){
      var mk = r.market_key || marketKey(r);
      if(!markets[mk]) markets[mk] = {market_key:mk, market:r.market||marketLabel(mk), tracked:0, settled:0, wins:0, losses:0, pending:0, void:0, stake_units:0, profit_units:0, winrate:0, roi:0, avg_odds:0, _o:0};
      var m = markets[mk];
      m.tracked++; m._o += num(r.odds);
      totals.tracked++; totals.oddsSum += num(r.odds);
      var st = String(r.status||'').toLowerCase();
      if(st === 'win'){
        m.settled++; m.wins++; m.stake_units++; m.profit_units += (num(r.odds)-1);
        totals.settled++; totals.wins++; totals.stake++; totals.profit += (num(r.odds)-1);
      } else if(st === 'loss' || st === 'lose'){
        m.settled++; m.losses++; m.stake_units++; m.profit_units -= 1;
        totals.settled++; totals.losses++; totals.stake++; totals.profit -= 1;
      } else if(st === 'void'){
        m.void++; totals.void_++;
      } else {
        m.pending++; totals.pending++;
      }
    });
    Object.keys(markets).forEach(function(k){
      var m = markets[k];
      m.avg_odds = m.tracked ? (m._o / m.tracked) : 0;
      m.winrate = m.settled ? (100 * m.wins / m.settled) : 0;
      m.roi = m.stake_units ? (100 * m.profit_units / m.stake_units) : 0;
      delete m._o;
    });
    return {
      markets: Object.keys(markets).map(function(k){ return markets[k]; })
        .sort(function(a,b){ return num(b.tracked) - num(a.tracked); }),
      summary: {
        tracked: totals.tracked,
        settled: totals.settled,
        wins: totals.wins,
        losses: totals.losses,
        pending: totals.pending,
        void: totals.void_,
        stake_units: totals.stake,
        profit_units: totals.profit,
        winrate: totals.settled ? (100 * totals.wins / totals.settled) : 0,
        roi: totals.stake ? (100 * totals.profit / totals.stake) : 0,
        avg_odds: totals.tracked ? (totals.oddsSum / totals.tracked) : 0
      }
    };
  }

  function sanitizePayload(payload){
    // Strategia noua: pending = pool-ul live SmartBet (cele 8 valide acum).
    // Settled (W/L/void) = pastrate din JSON-ul istoric ca sa ramana ce s-a jucat.
    payload = obj(payload);
    var live = livePoolRows();
    if(live === null){
      // SmartBet nu e inca disponibil (boot prea timpuriu) -> folosim payload-ul
      // original ca sa nu spargem UI-ul. Va re-randa cand ajungem la urmatorul tick.
      return payload;
    }
    var historyRows = arr(payload.tracked_predictions);
    var settled = settledOnly(historyRows);
    var settledKeys = {};
    settled.forEach(function(r){ if(r && r.tracker_id) settledKeys[r.tracker_id] = true; });
    var pending = live.filter(function(r){ return !settledKeys[r.tracker_id]; });
    var rows = settled.concat(pending);
    var agg = aggregateMarkets(rows);
    return {
      version: EXPECTED_VERSION,
      scope: 'validated_predictions_from_activation_only',
      summary: agg.summary,
      markets: agg.markets,
      tracked_predictions: rows,
      current_validated_count: pending.length
    };
  }

  function render(payload){
    payload = sanitizePayload(payload);
    var markets = arr(payload.markets);
    var summary = obj(payload.summary);
    var card = findUnifiedCard();
    if(!card) return false;
    var grid = q('#unified-summary-grid', card) || q('#smartbet-summary-grid', card) || q('#unified-engine-summary', card);
    if(!grid || !grid.parentNode) return false;

    var box = q('#prediction-type-history-box', card);
    if(!box){
      box = document.createElement('div');
      box.id = 'prediction-type-history-box';
      box.style.cssText = 'margin:12px 0 14px 0;padding:13px 15px;border-radius:18px;background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(20,184,166,.07));border:1px solid rgba(96,165,250,.18);';
      grid.parentNode.insertBefore(box, grid.nextSibling);
    }

    var top = markets.slice(0, 6).map(marketRow).join('');
    if(!top){
      top = '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.07);font-size:12px;color:var(--muted)">Tracker activ. Primele predicții validate vor apărea după următorul refresh de date.</div>';
    }
    var settled = num(summary.settled);
    var totalRoi = settled ? fmtPct(summary.roi || 0) : '0.00%';
    var totalRoiColor = settled ? (num(summary.roi) >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--muted)';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:9px">' +
        '<div><div style="font-size:15px;font-weight:900;color:var(--txt)">🎯 Tracker predicții validate</div><div style="font-size:11px;color:var(--muted);margin-top:2px">doar selecțiile din 🏆 Predicții validate — Scor Unificat</div></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--muted)"><b style="display:block;color:' + totalRoiColor + ';font-size:14px">' + totalRoi + '</b>ROI tracker</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px">' +
        chip('urmărite', ro(summary.tracked), 'var(--cyan)') +
        chip('settled', ro(summary.settled), 'var(--cyan)') +
        chip('W', ro(summary.wins), 'var(--grn)') +
        chip('L', ro(summary.losses), 'var(--red)') +
        chip('pending', ro(summary.pending), 'var(--muted)') +
        chip('WR', fmtWin(summary.winrate), settled ? 'var(--grn)' : 'var(--muted)') +
      '</div>' + top +
      '<div style="font-size:10px;color:var(--muted);margin-top:9px;line-height:1.35">Nu include arhiva veche. Urmărește doar predicțiile validate apărute în acest bloc; jurnalul marchează W/L când se termină.</div>';
    window.PREDICTION_TYPE_HISTORY = payload;
    return true;
  }

  function load(force){
    return readJson(force).then(function(payload){ return render(payload); });
  }

  window.loadPredictionTypeHistory = load;
  window.refreshPredictionTypeHistory = function(){ return load(true); };

  function boot(){
    load(false);
    setTimeout(function(){ load(false); }, 2200);
    // fără reload forțat după boot
    // Re-randam la 5s ca sa surprindem schimbarile in pool-ul live SmartBet
    // (cotele se schimba, AI Memory se actualizeaza, etc.). sanitizePayload
    // ia mereu pool-ul live proaspat din getSmartBetAnalysis().
    setInterval(function(){ if(window.PREDICTION_TYPE_HISTORY) render(window.PREDICTION_TYPE_HISTORY); }, 3000);
    // Manual refresh nu mai reîncarcă Prediction History.

  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
