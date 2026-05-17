(function(){
  'use strict';
  var PATCH_ID = 'dashboard-visible-backtest-runtime-v4';

  function $(id){ return document.getElementById(id); }
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function signed(v, suffix){
    var n = num(v);
    return (n >= 0 ? '+' : '') + n.toFixed(1) + (suffix || '');
  }
  function pctColor(v){ return num(v) >= 0 ? 'var(--grn,#22c55e)' : 'var(--red,#ef4444)'; }
  function fmtDateTime(raw){
    if(!raw) return '—';
    var d = new Date(raw);
    if(!isFinite(d.getTime())) return String(raw).slice(0,16);
    try { return d.toLocaleString('ro-RO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}); }
    catch(e){ return d.toISOString().slice(0,16).replace('T',' '); }
  }
  function isDashboardActive(){
    var tab = $('tab-dashboard');
    return !!(tab && tab.classList.contains('active'));
  }
  function unblankDashboard(){
    var dash = $('tab-dashboard');
    if(dash){
      dash.classList.remove('veyra-dashboard-blank');
      dash.style.minHeight = 'auto';
      dash.style.display = 'block';
      dash.style.visibility = 'visible';
      dash.style.opacity = '1';
    }
    var shell = $('dashboard-modern-shell');
    if(shell){
      shell.style.display = 'block';
      shell.style.visibility = 'visible';
      shell.style.opacity = '1';
      shell.style.minHeight = '0';
    }
  }
  function injectCss(){
    if($(PATCH_ID+'-style')) return;
    var st = document.createElement('style');
    st.id = PATCH_ID+'-style';
    st.textContent = [
      '#dashboard-modern-shell{display:block!important;min-height:0!important;width:100%;visibility:visible!important;opacity:1!important}',
      '#tab-dashboard{display:block!important;visibility:visible!important;opacity:1!important}',
      '#tab-dashboard.veyra-dashboard-blank{min-height:auto!important}',
      '#tab-dashboard.veyra-dashboard-blank #dashboard-modern-shell{display:block!important;visibility:visible!important;opacity:1!important}',
      '#tab-dashboard.veyra-dashboard-blank #dashboard-modern-shell > .btv-shell{display:grid!important;visibility:visible!important;opacity:1!important}',
      '.btv-shell{display:grid;gap:14px;padding:0;margin:0}',
      '.btv-hero,.btv-panel{border:1px solid rgba(43,229,197,.18);background:linear-gradient(180deg,rgba(10,18,32,.96),rgba(5,10,20,.98));border-radius:22px;padding:16px 18px;box-shadow:0 16px 36px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.04)}',
      '.btv-hero{background:radial-gradient(circle at 12% 0%,rgba(43,229,197,.14),transparent 34%),linear-gradient(135deg,rgba(9,18,31,.98),rgba(5,10,20,.98))}',
      '.btv-kicker{font:800 10px/1 var(--mono,monospace);letter-spacing:.16em;text-transform:uppercase;color:var(--acc,#2be5c5);opacity:.95}',
      '.btv-title{font-size:21px;font-weight:950;letter-spacing:-.035em;color:var(--txt,#f8fafc);margin-top:7px}',
      '.btv-sub{font-size:12px;line-height:1.55;color:var(--muted,#94a3b8);margin-top:6px}',
      '.btv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}',
      '.btv-card{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.045);border-radius:17px;padding:12px;min-width:0}',
      '.btv-card-k{font:800 9px/1 var(--mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#94a3b8)}',
      '.btv-card-v{font-size:20px;font-weight:950;color:var(--txt,#f8fafc);margin-top:7px;line-height:1.05}',
      '.btv-card-d{font-size:10.5px;line-height:1.45;color:var(--muted,#94a3b8);margin-top:5px}',
      '.btv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}',
      '.btv-head-title{font-size:15px;font-weight:950;color:var(--txt,#f8fafc)}',
      '.btv-head-sub{font-size:11px;color:var(--muted,#94a3b8);line-height:1.45;margin-top:4px}',
      '.btv-badge{font:800 10px/1 var(--mono,monospace);color:var(--acc,#2be5c5);border:1px solid rgba(43,229,197,.25);background:rgba(43,229,197,.08);border-radius:999px;padding:8px 10px;white-space:nowrap}',
      '.btv-table-wrap{overflow-x:auto;margin-top:10px;border:1px solid rgba(255,255,255,.07);border-radius:14px}',
      '.btv-table{width:100%;border-collapse:collapse;font-size:11px;min-width:360px}',
      '.btv-table th,.btv-table td{padding:10px 9px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}',
      '.btv-table th{font:800 9px/1 var(--mono,monospace);letter-spacing:.10em;text-transform:uppercase;color:var(--muted,#94a3b8)}',
      '.btv-table tr:last-child td{border-bottom:0}',
      '.btv-empty{margin-top:10px;border:1px dashed rgba(43,229,197,.25);background:rgba(43,229,197,.055);border-radius:16px;padding:12px;font-size:12px;line-height:1.55;color:var(--muted,#94a3b8)}',
      '.btv-note{font-size:10.5px;line-height:1.45;color:var(--muted,#94a3b8);margin-top:10px}',
      '@media(max-width:420px){.btv-hero,.btv-panel{padding:14px}.btv-grid{gap:8px}.btv-card{padding:10px}.btv-card-v{font-size:18px}.btv-title{font-size:19px}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  function getGlobalBacktest(){
    try {
      if(window.BACKTEST_SUMMARY && typeof window.BACKTEST_SUMMARY === 'object') return window.BACKTEST_SUMMARY;
    } catch(e){}
    return null;
  }
  function fetchBacktest(){
    return fetch('./data/backtest.json?v=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
  }
  function metricCard(k, v, d, color){
    return '<div class="btv-card"><div class="btv-card-k">'+esc(k)+'</div><div class="btv-card-v" style="color:'+esc(color || 'var(--txt,#fff)')+'">'+esc(v)+'</div><div class="btv-card-d">'+esc(d || '')+'</div></div>';
  }
  function renderPanel(bt){
    unblankDashboard();
    injectCss();
    var target = $('dashboard-modern-shell');
    if(!target){
      var dash = $('tab-dashboard');
      if(!dash) return false;
      target = document.createElement('div');
      target.id = 'dashboard-modern-shell';
      dash.appendChild(target);
    }

    bt = bt || {};
    var overall = bt.overall || {};
    var bets = num(bt.engine_bets != null ? bt.engine_bets : overall.bets);
    var wins = num(bt.engine_wins != null ? bt.engine_wins : overall.wins);
    var losses = num(bt.engine_losses != null ? bt.engine_losses : (overall.losses != null ? overall.losses : Math.max(0, bets - wins)));
    var profit = num(bt.engine_profit != null ? bt.engine_profit : overall.profit);
    var roi = num(bt.engine_roi != null ? bt.engine_roi : overall.roi);
    var wr = num(bt.engine_winrate != null ? bt.engine_winrate : overall.winrate);
    var avgOdds = num(bt.engine_avg_odds != null ? bt.engine_avg_odds : overall.avg_odds);
    var avgEdge = num(bt.engine_avg_edge != null ? bt.engine_avg_edge : overall.avg_edge);
    var lookback = num(bt.lookback_days || 21) || 21;
    var source = bt.source || 'meciuri_visible';
    var scope = bt.scope || bt.note || 'Intră doar pick-urile logate ca vizibile în Meciuri.';
    var updated = fmtDateTime(bt.updated_at);
    var sample = bets >= 120 ? 'solid' : bets >= 60 ? 'mediu' : bets > 0 ? 'mic' : 'în așteptare';
    var rawMl = (window.ALL_MATCHES && window.ALL_MATCHES.length) || (($('hq-ml') || {}).textContent || '—');
    var markets = Array.isArray(bt.by_market) ? bt.by_market.slice() : [];
    markets.sort(function(a,b){ return num(b.bets) - num(a.bets) || num(b.roi || b.roi_pct) - num(a.roi || a.roi_pct); });
    var marketHtml = markets.length ?
      '<div class="btv-table-wrap"><table class="btv-table"><thead><tr><th>Piață</th><th>Pariuri</th><th>W%</th><th>ROI</th></tr></thead><tbody>'+
      markets.slice(0,7).map(function(r){
        var rb = num(r.bets), rroi = num(r.roi != null ? r.roi : r.roi_pct), rwr = num(r.winrate);
        return '<tr><td>'+esc(r.label || r.key || '—')+'</td><td>'+rb+'</td><td>'+(rb ? rwr.toFixed(1)+'%' : '—')+'</td><td style="color:'+pctColor(rroi)+'">'+(rb ? signed(rroi,'%') : '—')+'</td></tr>';
      }).join('') + '</tbody></table></div>' :
      '<div class="btv-empty">Backtestul vizibil este resetat curat. Momentan are 0 meciuri închise, dar panoul este activ. După ce predicțiile afișate în Meciuri se finalizează și workflow-ul actualizează datele, aici apar ROI, win rate și performanța pe piețe.</div>';

    target.innerHTML = '<div class="btv-shell" data-runtime="'+PATCH_ID+'">'+
      '<section class="btv-hero">'+
        '<div class="btv-kicker">Dashboard restaurat</div>'+
        '<div class="btv-title">VEYRA · Backtest pe Meciuri vizibile</div>'+
        '<div class="btv-sub">Panoul de Dashboard este desenat direct din <b>data/backtest.json</b>. Nu mai depinde de blocurile vechi care lăsau ecranul gol.</div>'+
        '<div class="btv-grid">'+
          metricCard('Meciuri ML', rawMl, 'pool curent încărcat în aplicație', 'var(--acc,#2be5c5)')+
          metricCard('Sursă backtest', source, 'doar predicții afișate în Meciuri', 'var(--yel,#f59e0b)')+
        '</div>'+
      '</section>'+
      '<section class="btv-panel">'+
        '<div class="btv-head"><div><div class="btv-head-title">🧪 BACKTEST MECIURI VIZIBILE</div><div class="btv-head-sub">Calculează doar predicțiile filtrate și afișate în Meciuri, nu tot ce produce motorul în fundal.</div></div><div class="btv-badge">'+lookback+' zile</div></div>'+
        '<div class="btv-note">Update: '+esc(updated)+' • Sample: '+esc(sample)+'</div>'+ 
        '<div class="btv-grid">'+
          metricCard('Sample', bets ? bets+' închise' : '0 închise', wins+'W / '+losses+'L', 'var(--acc,#2be5c5)')+
          metricCard('ROI', bets ? signed(roi,'%') : '—', 'profit '+signed(profit,'u')+' • 1u/pick', bets ? pctColor(roi) : 'var(--txt,#f8fafc)')+
          metricCard('Win rate', bets ? wr.toFixed(1)+'%' : '—', wins+'/'+bets+' câștigate', 'var(--grn,#22c55e)')+
          metricCard('Medii', bets ? '@'+avgOdds.toFixed(2) : '—', 'edge mediu '+(bets ? signed(avgEdge,'pp') : '—'), 'var(--yel,#f59e0b)')+
        '</div>'+
        marketHtml+
        '<div class="btv-note">'+esc(scope)+'</div>'+ 
      '</section>'+ 
    '</div>';
    target.dataset.btvRendered = String(Date.now());
    return true;
  }
  function renderVisibleBacktestDashboard(){
    var immediate = getGlobalBacktest();
    if(immediate) renderPanel(immediate);
    fetchBacktest().then(function(bt){ renderPanel(bt || immediate || {}); });
  }
  window.renderVisibleBacktestDashboard = renderVisibleBacktestDashboard;

  function delayedRender(){
    unblankDashboard();
    setTimeout(renderVisibleBacktestDashboard, 60);
    setTimeout(renderVisibleBacktestDashboard, 600);
    setTimeout(renderVisibleBacktestDashboard, 1800);
  }

  var originalSwitchTab = window.switchTab;
  if(typeof originalSwitchTab === 'function' && !originalSwitchTab.__btvWrapped){
    var wrapped = function(name){
      var out = originalSwitchTab.apply(this, arguments);
      if(name === 'dashboard') delayedRender();
      return out;
    };
    wrapped.__btvWrapped = true;
    window.switchTab = wrapped;
  }

  document.addEventListener('DOMContentLoaded', function(){
    unblankDashboard();
    delayedRender();
    var dash = $('tab-dashboard');
    if(dash && window.MutationObserver){
      new MutationObserver(function(){ if(isDashboardActive()) delayedRender(); })
        .observe(dash, {attributes:true, attributeFilter:['class']});
    }
  });
  window.addEventListener('load', delayedRender, {once:false});
})();
