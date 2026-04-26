// API History label override: show total archive + active engine subset
(function(){
  'use strict';
  if(window.__apiHistoryLabelRuntimeLoaded) return;
  window.__apiHistoryLabelRuntimeLoaded = true;

  var totalCount = 58033;
  function q(sel, root){ return (root || document).querySelector(sel); }
  function fmt(n){ try { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); } catch(e){ return String(Math.round(Number(n) || 0)); } }
  function text(el){ return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function activeCount(){
    var s = (((window.ADAPTIVE_PREDICTIONS || {}).summary) || {});
    var m = (((window.AI_MEMORY || {}).summary) || {});
    return Number(s.api_history_active_matches || s.api_history_matches || m.api_history_matches || 0) || 0;
  }
  function loadTotal(force){
    return fetch('data/api_events_history_summary.json' + (force ? '?t=' + Date.now() : ''), {cache: force ? 'no-store' : 'default'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ if(j && Number(j.total_events_counted)) totalCount = Number(j.total_events_counted); })
      .catch(function(){});
  }
  function patch(){
    var box = q('#hybrid-main-copy');
    if(!box) return;
    var active = activeCount();
    if(!active) active = totalCount;
    var html = box.innerHTML || '';
    var replacement = '📊 API History (' + fmt(totalCount) + ' total • ' + fmt(active) + ' active în motor)';
    html = html.replace(/📊 API History \([^)]+\)/g, replacement);
    box.innerHTML = html;
    var title = box.querySelector('strong');
    if(title && text(title).indexOf('Hybrid Adaptive Engine') < 0){
      title.innerHTML = 'Motor Unificat de Predicții – <span style="color:var(--grn)">Hybrid Adaptive Engine</span>';
    }
  }
  function boot(){
    loadTotal(false).then(patch);
    setTimeout(patch, 1200);
    setTimeout(patch, 3500);
    setInterval(patch, 5000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__apiHistoryLabelHook){
      btn.__apiHistoryLabelHook = true;
      btn.addEventListener('click', function(){ setTimeout(function(){ loadTotal(true).then(patch); }, 1400); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();


// Dashboard yesterday index: WIN / LOSS / Winrate / ROI next to "Ieri" strip
(function(){
  'use strict';
  if(window.__baYdayIndexRuntimeLoaded) return;
  window.__baYdayIndexRuntimeLoaded = true;

  function css(){
    if(document.getElementById('ba-yday-index-css')) return;
    var s = document.createElement('style');
    s.id = 'ba-yday-index-css';
    s.textContent = '.dash-yday-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap!important}.dash-yday-head-note{font-family:var(--mono)!important;font-size:9px!important;font-weight:700!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important}.dash-yday-index{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin:10px 0 8px!important}.dash-yday-index-item{min-width:0!important;padding:8px 9px!important;border-radius:13px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;border:1px solid rgba(255,255,255,.075)!important;display:grid!important;gap:3px!important}.dash-yday-index-k{font-family:var(--mono)!important;font-size:8.5px!important;font-weight:800!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important;white-space:nowrap!important}.dash-yday-index-v{font-family:var(--font-display,var(--font-sans,system-ui))!important;font-feature-settings:"tnum" 1!important;font-size:15px!important;font-weight:900!important;line-height:1!important;color:var(--txt);white-space:nowrap!important}.dash-yday-index-win .dash-yday-index-v{color:var(--grn)!important}.dash-yday-index-loss .dash-yday-index-v{color:var(--red)!important}@media(max-width:420px){.dash-yday-index{grid-template-columns:repeat(2,minmax(0,1fr))!important}.dash-yday-head-note{width:100%!important}}';
    document.head.appendChild(s);
  }
  function stamp(r){
    var raw = r && (r.event_date || r.eventDate || r.date || r.logged_at || r.prediction_created_at || null);
    var t = raw ? new Date(raw).getTime() : NaN;
    return isFinite(t) ? t : 0;
  }
  function esc(v){
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function signed(n, suffix){
    var x = Number(n || 0);
    return (x >= 0 ? '+' : '') + x.toFixed(1) + (suffix || '');
  }
  function ydayRows(){
    var out = [];
    try{
      if(typeof window.getHistory21SettledRows === 'function'){
        var cutoff = new Date(Date.now() - 21 * 86400000);
        out = window.getHistory21SettledRows(cutoff) || [];
      }
    }catch(e){ out = []; }
    var start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate() - 1);
    var end = new Date(); end.setHours(0,0,0,0);
    return (out || []).filter(function(r){ var t = stamp(r); return t >= start.getTime() && t < end.getTime(); });
  }
  function tile(k, v, cls, color){
    return '<span class="dash-yday-index-item '+cls+'"><span class="dash-yday-index-k">'+esc(k)+'</span><span class="dash-yday-index-v"'+(color?' style="color:'+color+'"':'')+'>'+esc(v)+'</span></span>';
  }
  function patch(){
    css();
    var strip = document.querySelector('.dash-yday-strip');
    if(!strip) return false;
    var data = ydayRows();
    var pills = strip.querySelectorAll('.dash-yday-pill');
    var total = data.length || pills.length;
    if(!total) return false;
    var wins = data.length ? data.filter(function(r){ return r.status === 'win'; }).length : strip.querySelectorAll('.dash-yday-w').length;
    var losses = Math.max(0, total - wins);
    var profit = NaN;
    if(data.length){
      profit = data.reduce(function(acc, r){
        var odds = Number(r.odds || 0);
        return acc + (r.status === 'win' ? (odds > 1 ? (odds - 1) : 0) : -1);
      }, 0);
    }
    var winrate = total ? wins * 100 / total : 0;
    var roi = isFinite(profit) && total ? profit * 100 / total : null;
    var wrColor = winrate >= 65 ? 'var(--grn)' : (winrate < 50 ? 'var(--red)' : 'var(--txt)');
    var roiColor = roi == null ? 'var(--muted)' : (roi >= 0 ? 'var(--grn)' : 'var(--red)');

    var head = strip.querySelector('.dash-yday-head');
    if(head){
      head.innerHTML = '<span>📅 Ieri · '+total+' finalizate</span><span class="dash-yday-head-note">index 1u / recomandare</span>';
    }
    var box = strip.querySelector('.dash-yday-index');
    if(!box){
      box = document.createElement('div');
      box.className = 'dash-yday-index';
      var scroll = strip.querySelector('.dash-yday-scroll');
      strip.insertBefore(box, scroll || null);
    }
    box.innerHTML = [
      tile('WIN', wins, 'dash-yday-index-win'),
      tile('LOSS', losses, 'dash-yday-index-loss'),
      tile('Winrate', winrate.toFixed(1) + '%', 'dash-yday-index-wr', wrColor),
      tile('ROI', roi == null ? '—' : signed(roi, '%'), 'dash-yday-index-roi', roiColor)
    ].join('');
    return true;
  }
  function boot(){
    patch();
    [250,700,1400,2800,5000].forEach(function(ms){ setTimeout(patch, ms); });
    try{
      var root = document.getElementById('dashboard-modern-shell') || document.body;
      new MutationObserver(function(){ clearTimeout(window.__baYdayIndexTick); window.__baYdayIndexTick = setTimeout(patch, 80); }).observe(root,{childList:true,subtree:true});
    }catch(e){}
    setInterval(patch, 8000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__baYdayIndexHook){
      btn.__baYdayIndexHook = true;
      btn.addEventListener('click', function(){ setTimeout(patch, 1600); setTimeout(patch, 4200); });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
