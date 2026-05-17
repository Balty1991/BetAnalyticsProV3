(function(){
  'use strict';
  var PATCH_ID = 'veyra-dashboard-loader-rescue-v4';
  var startTs = Date.now();

  function $(id){ return document.getElementById(id); }
  function safeNum(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function signed(v, suffix){ var n = safeNum(v); return (n >= 0 ? '+' : '') + n.toFixed(1) + (suffix || ''); }
  function colorPct(v){ return safeNum(v) >= 0 ? '#22c55e' : '#ef4444'; }
  function fmtDateTime(raw){
    if(!raw) return '—';
    var d = new Date(raw);
    if(!isFinite(d.getTime())) return String(raw).slice(0,16);
    try { return d.toLocaleString('ro-RO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}); }
    catch(e){ return d.toISOString().slice(0,16).replace('T',' '); }
  }

  function injectRescueCss(){
    if($(PATCH_ID+'-style')) return;
    var st = document.createElement('style');
    st.id = PATCH_ID+'-style';
    st.textContent = [
      '#tab-dashboard{display:block!important;visibility:visible!important;opacity:1!important}',
      '#tab-dashboard.active{display:block!important;visibility:visible!important;opacity:1!important}',
      '#tab-dashboard.veyra-dashboard-blank{min-height:auto!important}',
      '#tab-dashboard.veyra-dashboard-blank #dashboard-modern-shell{display:block!important;visibility:visible!important;opacity:1!important;min-height:0!important;margin:0!important;padding:0!important}',
      '#tab-dashboard.veyra-dashboard-blank #dashboard-modern-shell>*{display:block!important;visibility:visible!important;opacity:1!important}',
      '#dashboard-modern-shell{display:block!important;visibility:visible!important;opacity:1!important;width:100%;min-height:0!important}',
      'body.'+PATCH_ID+' #loader, body.'+PATCH_ID+' .loader{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}',
      '.btv-shell{display:grid!important;gap:14px!important;padding:0 0 86px!important;margin:0!important}',
      '.btv-hero,.btv-panel{display:block!important;visibility:visible!important;opacity:1!important;border:1px solid rgba(43,229,197,.22)!important;background:linear-gradient(180deg,rgba(10,18,32,.98),rgba(5,10,20,.98))!important;border-radius:22px!important;padding:16px 18px!important;box-shadow:0 16px 36px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05)!important}',
      '.btv-hero{background:radial-gradient(circle at 16% 0%,rgba(43,229,197,.16),transparent 36%),linear-gradient(135deg,rgba(9,18,31,.98),rgba(5,10,20,.98))!important}',
      '.btv-kicker{font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace!important;letter-spacing:.16em!important;text-transform:uppercase!important;color:#2be5c5!important;opacity:.95!important}',
      '.btv-title{font-size:21px!important;font-weight:950!important;letter-spacing:-.035em!important;color:#f8fafc!important;margin-top:7px!important}',
      '.btv-sub{font-size:12px!important;line-height:1.55!important;color:#94a3b8!important;margin-top:6px!important}',
      '.btv-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:14px!important}',
      '.btv-card{display:block!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(255,255,255,.045)!important;border-radius:17px!important;padding:12px!important;min-width:0!important}',
      '.btv-card-k{font:800 9px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace!important;letter-spacing:.12em!important;text-transform:uppercase!important;color:#94a3b8!important}',
      '.btv-card-v{font-size:20px!important;font-weight:950!important;color:#f8fafc!important;margin-top:7px!important;line-height:1.05!important}',
      '.btv-card-d{font-size:10.5px!important;line-height:1.45!important;color:#94a3b8!important;margin-top:5px!important}',
      '.btv-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:10px!important;margin-bottom:10px!important}',
      '.btv-head-title{font-size:15px!important;font-weight:950!important;color:#f8fafc!important}',
      '.btv-head-sub{font-size:11px!important;color:#94a3b8!important;line-height:1.45!important;margin-top:4px!important}',
      '.btv-badge{font:800 10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace!important;color:#2be5c5!important;border:1px solid rgba(43,229,197,.25)!important;background:rgba(43,229,197,.08)!important;border-radius:999px!important;padding:8px 10px!important;white-space:nowrap!important}',
      '.btv-table-wrap{display:block!important;overflow-x:auto!important;margin-top:10px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:14px!important}',
      '.btv-table{width:100%!important;border-collapse:collapse!important;font-size:11px!important;min-width:360px!important}',
      '.btv-table th,.btv-table td{padding:10px 9px!important;text-align:left!important;border-bottom:1px solid rgba(255,255,255,.06)!important}',
      '.btv-table th{font:800 9px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:#94a3b8!important}',
      '.btv-empty{display:block!important;margin-top:10px!important;border:1px dashed rgba(43,229,197,.25)!important;background:rgba(43,229,197,.055)!important;border-radius:16px!important;padding:12px!important;font-size:12px!important;line-height:1.55!important;color:#94a3b8!important}',
      '.btv-note{font-size:10.5px!important;line-height:1.45!important;color:#94a3b8!important;margin-top:10px!important}',
      '@media(max-width:420px){.btv-hero,.btv-panel{padding:14px!important}.btv-grid{gap:8px!important}.btv-card{padding:10px!important}.btv-card-v{font-size:18px!important}.btv-title{font-size:19px!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function forceHideLoader(reason){
    try{
      document.body.classList.add(PATCH_ID);
      var loader = $('loader');
      if(loader){
        loader.classList.remove('show');
        loader.setAttribute('aria-hidden','true');
        loader.style.setProperty('display','none','important');
        loader.style.setProperty('visibility','hidden','important');
        loader.style.setProperty('opacity','0','important');
        loader.style.setProperty('pointer-events','none','important');
        loader.dataset.rescueReason = reason || 'loader-timeout';
      }
    }catch(e){}
  }

  function makeCard(k,v,d,color){
    return '<div class="btv-card"><div class="btv-card-k">'+esc(k)+'</div><div class="btv-card-v" style="color:'+esc(color || '#f8fafc')+'">'+esc(v)+'</div><div class="btv-card-d">'+esc(d || '')+'</div></div>';
  }

  function normalizeBacktest(bt){
    bt = bt || {};
    var overall = bt.overall || {};
    var bets = safeNum(bt.engine_bets != null ? bt.engine_bets : overall.bets);
    var wins = safeNum(bt.engine_wins != null ? bt.engine_wins : overall.wins);
    var losses = safeNum(bt.engine_losses != null ? bt.engine_losses : (overall.losses != null ? overall.losses : Math.max(0, bets - wins)));
    return {
      bets:bets,
      wins:wins,
      losses:losses,
      profit:safeNum(bt.engine_profit != null ? bt.engine_profit : overall.profit),
      roi:safeNum(bt.engine_roi != null ? bt.engine_roi : overall.roi),
      wr:safeNum(bt.engine_winrate != null ? bt.engine_winrate : overall.winrate),
      avgOdds:safeNum(bt.engine_avg_odds != null ? bt.engine_avg_odds : overall.avg_odds),
      avgEdge:safeNum(bt.engine_avg_edge != null ? bt.engine_avg_edge : overall.avg_edge),
      lookback:safeNum(bt.lookback_days || 21) || 21,
      updated:fmtDateTime(bt.updated_at),
      source:bt.source || 'meciuri_visible',
      scope:bt.scope || bt.note || 'Intră doar pick-urile logate ca vizibile în Meciuri.',
      markets:Array.isArray(bt.by_market) ? bt.by_market.slice() : []
    };
  }

  function renderDashboard(bt, statusText){
    injectRescueCss();
    var dash = $('tab-dashboard');
    if(dash){
      dash.classList.remove('veyra-dashboard-blank');
      dash.style.setProperty('display','block','important');
      dash.style.setProperty('visibility','visible','important');
      dash.style.setProperty('opacity','1','important');
    }
    var target = $('dashboard-modern-shell');
    if(!target && dash){
      target = document.createElement('div');
      target.id = 'dashboard-modern-shell';
      dash.appendChild(target);
    }
    if(!target) return false;
    target.style.setProperty('display','block','important');
    target.style.setProperty('visibility','visible','important');
    target.style.setProperty('opacity','1','important');

    var d = normalizeBacktest(bt);
    var rawMl = '—';
    try{
      if(window.ALL_MATCHES && window.ALL_MATCHES.length) rawMl = String(window.ALL_MATCHES.length);
      else if($('hq-ml') && $('hq-ml').textContent) rawMl = $('hq-ml').textContent.trim() || '—';
    }catch(e){}

    var markets = d.markets.sort(function(a,b){ return safeNum(b.bets)-safeNum(a.bets); }).slice(0,7);
    var marketHtml = markets.length ? '<div class="btv-table-wrap"><table class="btv-table"><thead><tr><th>Piață</th><th>Pariuri</th><th>W%</th><th>ROI</th></tr></thead><tbody>'+
      markets.map(function(r){
        var rb = safeNum(r.bets), rroi = safeNum(r.roi != null ? r.roi : r.roi_pct), rwr = safeNum(r.winrate);
        return '<tr><td>'+esc(r.label || r.key || '—')+'</td><td>'+rb+'</td><td>'+(rb ? rwr.toFixed(1)+'%' : '—')+'</td><td style="color:'+colorPct(rroi)+'">'+(rb ? signed(rroi,'%') : '—')+'</td></tr>';
      }).join('')+'</tbody></table></div>' : '<div class="btv-empty">Backtestul vizibil este activ, dar încă nu are meciuri închise. După finalizarea predicțiilor afișate în Meciuri și următorul update, aici apar ROI, win rate și performanța pe piețe.</div>';

    target.innerHTML = '<div class="btv-shell" data-runtime="'+PATCH_ID+'">'+
      '<section class="btv-hero">'+
        '<div class="btv-kicker">Dashboard restaurat</div>'+ 
        '<div class="btv-title">VEYRA · Backtest pe Meciuri vizibile</div>'+ 
        '<div class="btv-sub">Am scos blocarea Dashboard-ului și am adăugat protecție pentru loader blocat. Panoul de mai jos citește <b>data/backtest.json</b> și rămâne vizibil chiar dacă încărcarea principală întârzie.</div>'+ 
        '<div class="btv-grid">'+
          makeCard('Meciuri ML', rawMl, 'pool curent / header aplicație', '#2be5c5')+
          makeCard('Stare încărcare', statusText || 'runtime activ', 'rescue runtime '+Math.round((Date.now()-startTs)/1000)+'s', '#f59e0b')+
        '</div>'+ 
      '</section>'+ 
      '<section class="btv-panel">'+
        '<div class="btv-head"><div><div class="btv-head-title">🧪 BACKTEST MECIURI VIZIBILE</div><div class="btv-head-sub">Calculează doar predicțiile filtrate și afișate în Meciuri, nu tot ce produce motorul în fundal.</div></div><div class="btv-badge">'+d.lookback+' zile</div></div>'+ 
        '<div class="btv-note">Update: '+esc(d.updated)+' • Sursă: '+esc(d.source)+'</div>'+ 
        '<div class="btv-grid">'+
          makeCard('Sample', d.bets ? d.bets+' închise' : '0 închise', d.wins+'W / '+d.losses+'L', '#2be5c5')+
          makeCard('ROI', d.bets ? signed(d.roi,'%') : '—', 'profit '+signed(d.profit,'u')+' • 1u/pick', d.bets ? colorPct(d.roi) : '#f8fafc')+
          makeCard('Win rate', d.bets ? d.wr.toFixed(1)+'%' : '—', d.wins+'/'+d.bets+' câștigate', '#22c55e')+
          makeCard('Medii', d.bets ? '@'+d.avgOdds.toFixed(2) : '—', 'edge mediu '+(d.bets ? signed(d.avgEdge,'pp') : '—'), '#f59e0b')+
        '</div>'+ marketHtml + '<div class="btv-note">'+esc(d.scope)+'</div>'+ 
      '</section></div>';
    return true;
  }

  function fetchBacktestThenRender(statusText){
    var localBt = null;
    try{ if(window.BACKTEST_SUMMARY && typeof window.BACKTEST_SUMMARY === 'object') localBt = window.BACKTEST_SUMMARY; }catch(e){}
    renderDashboard(localBt || {}, statusText || 'inițializare');
    try{
      fetch('./data/backtest.json?v=' + Date.now(), {cache:'no-store'})
        .then(function(r){ return r && r.ok ? r.json() : null; })
        .then(function(bt){ renderDashboard(bt || localBt || {}, statusText || 'date backtest citite'); })
        .catch(function(){ renderDashboard(localBt || {}, 'backtest indisponibil temporar'); });
    }catch(e){ renderDashboard(localBt || {}, 'fetch blocat'); }
  }

  function rescueTick(label, hide){
    injectRescueCss();
    if(hide) forceHideLoader(label);
    fetchBacktestThenRender(label);
  }

  window.renderVisibleBacktestDashboard = function(){ rescueTick('apel manual dashboard', true); };

  window.addEventListener('error', function(ev){
    if(Date.now() - startTs < 15000){
      rescueTick('eroare JS interceptată', true);
    }
  });
  window.addEventListener('unhandledrejection', function(){
    if(Date.now() - startTs < 15000){
      rescueTick('promisiune blocată/interceptată', true);
    }
  });

  var oldSwitch = window.switchTab;
  if(typeof oldSwitch === 'function' && !oldSwitch.__veyraRescueWrapped){
    var wrapped = function(name){
      var out;
      try{ out = oldSwitch.apply(this, arguments); }catch(e){ out = undefined; }
      if(name === 'dashboard') setTimeout(function(){ rescueTick('tab dashboard', true); }, 80);
      return out;
    };
    wrapped.__veyraRescueWrapped = true;
    window.switchTab = wrapped;
  }

  document.addEventListener('DOMContentLoaded', function(){
    rescueTick('DOMContentLoaded', false);
    setTimeout(function(){ rescueTick('verificare 1s', false); }, 1000);
    setTimeout(function(){ rescueTick('loader rescue 4s', true); }, 4000);
    setTimeout(function(){ rescueTick('loader rescue 8s', true); }, 8000);
  });
  window.addEventListener('load', function(){
    setTimeout(function(){ rescueTick('window load', false); }, 100);
    setTimeout(function(){ rescueTick('post-load rescue', true); }, 5000);
  });
  setTimeout(function(){ rescueTick('fallback 6s', true); }, 6000);
})();
