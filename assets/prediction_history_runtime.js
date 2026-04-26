// Validated predictions tracker runtime for BetAnalytics Pro
(function(){
  'use strict';
  if(window.__predictionHistoryRuntimeLoaded) return;
  window.__predictionHistoryRuntimeLoaded = true;

  var DATA_PATH = 'data/prediction_type_history.json';

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

  function render(payload){
    payload = obj(payload);
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
        '<div><div style="font-size:15px;font-weight:900;color:var(--txt)">🎯 Tracker predicții validate</div><div style="font-size:11px;color:var(--muted);margin-top:2px">doar selecțiile oferite de Motorul Unificat după activare</div></div>' +
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
      '<div style="font-size:10px;color:var(--muted);margin-top:9px;line-height:1.35">Nu include arhiva veche. Jurnalul este folosit doar ca să marcheze W/L pentru predicțiile deja urmărite.</div>';
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
