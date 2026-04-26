// Runtime UI patches for BetAnalytics Pro
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

// Dashboard 7-day event index: date buttons + total 7 days
(function(){
  'use strict';
  window.__baSevenDayIndexRuntimeLoaded = true;

  var DAY_MS = 86400000;
  var DAYS = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
  var MONTHS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  window.__baSevenDayIndexSelected = window.__baSevenDayIndexSelected || 'd1';

  function css(){
    if(document.getElementById('ba-seven-day-index-css')) return;
    var s = document.createElement('style');
    s.id = 'ba-seven-day-index-css';
    s.textContent = [
      '.dash-yday-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap!important}',
      '.dash-yday-head-note{font-family:var(--mono)!important;font-size:9px!important;font-weight:700!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important}',
      '.dash-yday-date-row{display:flex!important;gap:7px!important;overflow-x:auto!important;scrollbar-width:none!important;padding:9px 0 10px!important;margin:2px 0 0!important;-webkit-overflow-scrolling:touch!important}',
      '.dash-yday-date-row::-webkit-scrollbar{display:none!important}',
      '.dash-yday-date-btn{flex:0 0 auto!important;min-width:74px!important;border:1px solid rgba(255,255,255,.075)!important;background:rgba(255,255,255,.035)!important;color:var(--muted)!important;border-radius:999px!important;padding:7px 10px!important;font-family:var(--mono)!important;font-size:9px!important;font-weight:900!important;letter-spacing:.06em!important;text-transform:uppercase!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;white-space:nowrap!important}',
      '.dash-yday-date-btn span{font-family:var(--font-sans,system-ui)!important;font-size:10px!important;font-weight:900!important;letter-spacing:0!important;color:var(--txt)!important;opacity:.9!important}',
      '.dash-yday-date-btn.active{border-color:rgba(43,229,197,.45)!important;background:linear-gradient(135deg,rgba(43,229,197,.17),rgba(59,130,246,.08))!important;color:var(--acc)!important;box-shadow:0 0 0 1px rgba(43,229,197,.08) inset!important}',
      '.dash-yday-date-btn.total{min-width:108px!important}',
      '.dash-yday-index{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin:0 0 8px!important}',
      '.dash-yday-index-item{min-width:0!important;padding:8px 9px!important;border-radius:13px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;border:1px solid rgba(255,255,255,.075)!important;display:grid!important;gap:3px!important}',
      '.dash-yday-index-k{font-family:var(--mono)!important;font-size:8.5px!important;font-weight:800!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important;white-space:nowrap!important}',
      '.dash-yday-index-v{font-family:var(--font-display,var(--font-sans,system-ui))!important;font-feature-settings:"tnum" 1!important;font-size:15px!important;font-weight:900!important;line-height:1!important;color:var(--txt);white-space:nowrap!important}',
      '.dash-yday-index-win .dash-yday-index-v{color:var(--grn)!important}',
      '.dash-yday-index-loss .dash-yday-index-v{color:var(--red)!important}',
      '.dash-yday-more{flex:0 0 auto!important;padding:9px 12px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.08)!important;color:var(--muted)!important;background:rgba(255,255,255,.03)!important;font-family:var(--mono)!important;font-size:9px!important;font-weight:800!important}',
      '.dash-yday-pill em{font-style:normal!important;color:var(--muted)!important;margin-left:4px!important}',
      '@media(max-width:420px){.dash-yday-index{grid-template-columns:repeat(2,minmax(0,1fr))!important}.dash-yday-head-note{width:100%!important}.dash-yday-date-btn{min-width:68px!important;padding:7px 9px!important}}'
    ].join('');
    document.head.appendChild(s);
  }
  function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function signed(n, suffix){ var x = Number(n || 0); return (x >= 0 ? '+' : '') + x.toFixed(1) + (suffix || ''); }
  function fmtInt(n){ try{ return Math.round(Number(n) || 0).toLocaleString('ro-RO'); }catch(e){ return String(Math.round(Number(n) || 0)); } }
  function startOfLocalDay(d){ var x = new Date(d || Date.now()); x.setHours(0,0,0,0); return x; }
  function dayKeyFromDate(d){ var x = startOfLocalDay(d); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); }
  function dateForOffset(offset){ var d = startOfLocalDay(new Date()); d.setDate(d.getDate() - offset); return d; }
  function stamp(r){
    var raw = r && (r.event_date || r.eventDate || r.match_date || r.date || r.kickoff || r.start_time || r.logged_at || r.prediction_created_at || null);
    var t = raw ? new Date(raw).getTime() : NaN;
    return isFinite(t) ? t : 0;
  }
  function boolResult(v){
    if(v === true || v === 1 || v === '1') return 'win';
    if(v === false || v === 0 || v === '0') return 'loss';
    var s = String(v == null ? '' : v).toLowerCase().trim();
    if(['true','yes','y','won','win','w','hit','success','passed'].indexOf(s) >= 0) return 'win';
    if(['false','no','n','lost','loss','l','miss','failed','fail'].indexOf(s) >= 0) return 'loss';
    return '';
  }
  function statusOf(r){
    if(!r) return '';
    var b = boolResult(r.won);
    if(b) return b;
    b = boolResult(r.is_win);
    if(b) return b;
    b = boolResult(r.isWon);
    if(b) return b;
    b = boolResult(r.success);
    if(b) return b;
    b = boolResult(r.hit);
    if(b) return b;
    var s = String((r.status || r.result || r.outcome || r.final_status || '')).toLowerCase().trim();
    if(!s) return '';
    if(s === 'w' || s === 'win' || s === 'won' || s.indexOf('win') >= 0 || s.indexOf('won') >= 0 || s.indexOf('hit') >= 0) return 'win';
    if(s === 'l' || s === 'loss' || s === 'lost' || s.indexOf('loss') >= 0 || s.indexOf('lost') >= 0 || s.indexOf('miss') >= 0 || s.indexOf('fail') >= 0) return 'loss';
    return '';
  }
  function allSettledRows(){
    var out = [];
    try{
      if(typeof window.getHistory21SettledRows === 'function'){
        out = window.getHistory21SettledRows(new Date(Date.now() - 21 * DAY_MS)) || [];
      }
    }catch(e){ out = []; }
    if(!out.length && Array.isArray(window.HISTORY_ENGINE)) out = window.HISTORY_ENGINE;
    if(!out.length && Array.isArray(window.RECOMMENDATION_LOG)) out = window.RECOMMENDATION_LOG;
    return (out || []).filter(function(r){ return !!statusOf(r) && !!stamp(r); });
  }
  function buildDays(rows){
    var days = [], byKey = {};
    for(var i=1;i<=7;i++){
      var d = dateForOffset(i), key = dayKeyFromDate(d);
      var label = i === 1 ? 'Ieri' : (DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]);
      var item = {key:key, offset:i, date:d, label:label, title:label, rows:[]};
      days.push(item); byKey[key] = item;
    }
    rows.forEach(function(r){ var t = stamp(r); if(!t) return; var key = dayKeyFromDate(new Date(t)); if(byKey[key]) byKey[key].rows.push(r); });
    days.forEach(function(d){ d.rows.sort(function(a,b){ return stamp(b) - stamp(a); }); });
    return days;
  }
  function calc(rows){
    var settled = (rows || []).filter(function(r){ return !!statusOf(r); });
    var total = settled.length;
    var wins = settled.filter(function(r){ return statusOf(r) === 'win'; }).length;
    var losses = settled.filter(function(r){ return statusOf(r) === 'loss'; }).length;
    var profit = settled.reduce(function(acc, r){
      if(statusOf(r) === 'loss') return acc - 1;
      var odds = Number(r.odds || r.book_odds || r.final_odds || r.baseOdds || r.market_odds || 0);
      return acc + (odds > 1 ? odds - 1 : 0);
    }, 0);
    return {total:total, wins:wins, losses:losses, winrate:total ? wins * 100 / total : 0, roi:total ? profit * 100 / total : null};
  }
  function tile(k, v, cls, color){ return '<span class="dash-yday-index-item '+cls+'"><span class="dash-yday-index-k">'+esc(k)+'</span><span class="dash-yday-index-v"'+(color?' style="color:'+color+'"':'')+'>'+esc(v)+'</span></span>'; }
  function teamName(r, side){
    if(!r) return '—';
    if(side === 'home') return r.home || r.home_team || r.homeName || r.team_home || r.localteam || r.home_name || '—';
    return r.away || r.away_team || r.awayName || r.team_away || r.visitorteam || r.away_name || '—';
  }
  function marketName(r){ return r && (r.market || r.bet || r.pick || r.prediction || r.type || r.label || ''); }
  function pillHtml(r){
    var st = statusOf(r), cls = st === 'win' ? 'dash-yday-w' : 'dash-yday-l', badge = st === 'win' ? 'W' : 'L';
    return '<span class="dash-yday-pill '+cls+'"><b>'+badge+'</b><span>'+esc(teamName(r,'home'))+' vs '+esc(teamName(r,'away'))+'</span><em>'+esc(marketName(r))+'</em></span>';
  }
  function ensureControls(strip, indexBox){
    var row = strip.querySelector('.dash-yday-date-row');
    if(!row){ row = document.createElement('div'); row.className = 'dash-yday-date-row'; strip.insertBefore(row, indexBox || strip.querySelector('.dash-yday-scroll') || null); }
    return row;
  }
  function selectedDay(days){
    var selected = window.__baSevenDayIndexSelected || 'd1';
    if(/^d\d+$/.test(selected)) return days[Math.max(0, Math.min(6, Number(selected.slice(1)) - 1))] || days[0];
    return days.filter(function(d){ return d.key === selected; })[0] || days[0];
  }
  function selectedRows(days){
    if((window.__baSevenDayIndexSelected || 'd1') === 'total') return days.reduce(function(acc, d){ return acc.concat(d.rows); }, []);
    return selectedDay(days).rows;
  }
  function selectedTitle(days){ return (window.__baSevenDayIndexSelected || 'd1') === 'total' ? 'Total 7 zile' : selectedDay(days).title; }
  function renderButtons(row, days){
    var selected = window.__baSevenDayIndexSelected || 'd1';
    var html = days.map(function(d){
      var key = d.offset === 1 ? 'd1' : d.key;
      var active = selected === key || selected === d.key || selected === ('d'+d.offset);
      return '<button type="button" class="dash-yday-date-btn '+(active?'active':'')+'" data-ba-yday-key="'+esc(key)+'">'+esc(d.label)+' <span>'+fmtInt(d.rows.length)+'</span></button>';
    }).join('');
    var totalCount = days.reduce(function(acc,d){ return acc + d.rows.length; }, 0);
    row.innerHTML = html + '<button type="button" class="dash-yday-date-btn total '+(selected === 'total' ? 'active' : '')+'" data-ba-yday-key="total">TOTAL 7 ZILE <span>'+fmtInt(totalCount)+'</span></button>';
  }
  function renderPills(strip, rows, isTotal){
    var scroll = strip.querySelector('.dash-yday-scroll');
    if(!scroll){ scroll = document.createElement('div'); scroll.className = 'dash-yday-scroll'; strip.appendChild(scroll); }
    var sorted = (rows || []).slice().sort(function(a,b){ return stamp(b) - stamp(a); });
    var limit = isTotal ? 80 : sorted.length;
    scroll.innerHTML = sorted.slice(0, limit).map(pillHtml).join('') + (sorted.length > limit ? '<span class="dash-yday-more">+'+fmtInt(sorted.length - limit)+' meciuri</span>' : '');
  }
  function patch(){
    css();
    var strip = document.querySelector('.dash-yday-strip');
    if(!strip) return false;
    if(!strip.__baSevenDayClickHookFix){
      strip.__baSevenDayClickHookFix = true;
      strip.addEventListener('click', function(ev){
        var btn = ev.target && ev.target.closest ? ev.target.closest('.dash-yday-date-btn') : null;
        if(!btn) return;
        ev.preventDefault(); ev.stopPropagation();
        window.__baSevenDayIndexSelected = btn.getAttribute('data-ba-yday-key') || 'd1';
        setTimeout(patch, 0);
      }, true);
    }
    var days = buildDays(allSettledRows());
    var totalRows = days.reduce(function(acc, d){ return acc.concat(d.rows); }, []);
    if(!totalRows.length) return false;
    var box = strip.querySelector('.dash-yday-index');
    if(!box){ box = document.createElement('div'); box.className = 'dash-yday-index'; strip.insertBefore(box, strip.querySelector('.dash-yday-scroll') || null); }
    renderButtons(ensureControls(strip, box), days);
    var selected = window.__baSevenDayIndexSelected || 'd1';
    var data = selectedRows(days), stats = calc(data);
    var wrColor = stats.winrate >= 65 ? 'var(--grn)' : (stats.winrate < 50 ? 'var(--red)' : 'var(--txt)');
    var roiColor = stats.roi == null ? 'var(--muted)' : (stats.roi >= 0 ? 'var(--grn)' : 'var(--red)');
    var head = strip.querySelector('.dash-yday-head');
    if(head) head.innerHTML = '<span>📅 '+esc(selectedTitle(days))+' · '+fmtInt(stats.total)+' finalizate</span><span class="dash-yday-head-note">index 1u / recomandare</span>';
    box.innerHTML = [
      tile('WIN', stats.wins, 'dash-yday-index-win'),
      tile('LOSS', stats.losses, 'dash-yday-index-loss'),
      tile('Winrate', stats.winrate.toFixed(1) + '%', 'dash-yday-index-wr', wrColor),
      tile('ROI', stats.roi == null ? '—' : signed(stats.roi, '%'), 'dash-yday-index-roi', roiColor)
    ].join('');
    renderPills(strip, data, selected === 'total');
    return true;
  }
  function boot(){
    patch();
    [250,700,1400,2800,5000].forEach(function(ms){ setTimeout(patch, ms); });
    try{
      var root = document.getElementById('dashboard-modern-shell') || document.body;
      new MutationObserver(function(){ clearTimeout(window.__baSevenDayIndexTickFix); window.__baSevenDayIndexTickFix = setTimeout(patch, 80); }).observe(root,{childList:true,subtree:true});
    }catch(e){}
    setInterval(patch, 8000);
    var btn = document.getElementById('btn-refresh');
    if(btn && !btn.__baSevenDayIndexHookFix){ btn.__baSevenDayIndexHookFix = true; btn.addEventListener('click', function(){ setTimeout(patch, 1600); setTimeout(patch, 4200); }); }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
