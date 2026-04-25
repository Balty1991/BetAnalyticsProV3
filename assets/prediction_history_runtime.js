// Prediction type history runtime for BetAnalytics Pro
(function(){
  'use strict';
  if(window.__predictionHistoryRuntimeLoaded) return;
  window.__predictionHistoryRuntimeLoaded = true;

  var DATA_PATH = 'data/prediction_type_history.json';

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
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

  function findUnifiedCard(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return null;
    return grid.closest ? (grid.closest('.card,.panel,.section,.engine-card') || grid.parentNode) : grid.parentNode;
  }

  function metricChip(label, value, color){
    return '<span style="display:inline-flex;gap:5px;align-items:center;padding:7px 10px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);font-size:11px;color:var(--muted)"><b style="color:' + color + ';font-size:12px">' + value + '</b>' + label + '</span>';
  }

  function marketRow(row){
    row = obj(row);
    var roi = num(row.roi);
    var roiColor = roi >= 0 ? 'var(--grn)' : 'var(--red)';
    var wr = num(row.winrate);
    var wrColor = wr >= 65 ? 'var(--grn)' : (wr >= 50 ? 'var(--yel)' : 'var(--red)');
    return '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.07)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:7px">' +
        '<div style="font-weight:900;color:var(--txt);font-size:13px">' + (row.market || row.market_key || 'Pronostic') + '</div>' +
        '<div style="font-size:12px;font-weight:900;color:' + roiColor + '">' + fmtPct(roi) + ' ROI</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px">' +
        metricChip('settled', ro(row.settled), 'var(--cyan)') +
        metricChip('W', ro(row.wins), 'var(--grn)') +
        metricChip('L', ro(row.losses), 'var(--red)') +
        metricChip('WR', fmtWin(row.winrate), wrColor) +
        metricChip('pend', ro(row.pending), 'var(--muted)') +
        metricChip('cotă medie', num(row.avg_odds).toFixed(2), 'var(--pur)') +
      '</div>' +
    '</div>';
  }

  function render(payload){
    payload = obj(payload);
    var markets = arr(obj(payload.windows)['21']);
    if(!markets.length) markets = arr(payload.markets);
    if(!markets.length) return false;
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
    box.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:9px">' +
        '<div><div style="font-size:15px;font-weight:900;color:var(--txt)">📚 Istoric pronosticuri</div><div style="font-size:11px;color:var(--muted);margin-top:2px">ultimele 21 zile • win/lose, winrate și ROI pe tip de piață</div></div>' +
        '<div style="text-align:right;font-size:11px;color:var(--muted)"><b style="display:block;color:var(--grn);font-size:14px">' + fmtPct(summary.roi || 0) + '</b>ROI total</div>' +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px">' +
        metricChip('total settled', ro(summary.settled), 'var(--cyan)') +
        metricChip('W', ro(summary.wins), 'var(--grn)') +
        metricChip('L', ro(summary.losses), 'var(--red)') +
        metricChip('WR', fmtWin(summary.winrate), 'var(--grn)') +
      '</div>' + top +
      '<div style="font-size:10px;color:var(--muted);margin-top:9px;line-height:1.35">ROI = miză fixă 1 unitate/pronostic. Pending și void sunt excluse din winrate/ROI.</div>';
    return true;
  }

  function load(force){
    return readJson(force).then(function(payload){
      window.PREDICTION_TYPE_HISTORY = payload;
      return render(payload);
    });
  }

  window.loadPredictionTypeHistory = load;
  window.refreshPredictionTypeHistory = function(){ return load(true); };

  function boot(){
    load(false);
    setTimeout(function(){ load(false); }, 1800);
    setTimeout(function(){ load(false); }, 4200);
    setInterval(function(){ if(window.PREDICTION_TYPE_HISTORY) render(window.PREDICTION_TYPE_HISTORY); }, 5000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__predictionHistoryHook){
      btn.__predictionHistoryHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ load(true); }, 1500); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
