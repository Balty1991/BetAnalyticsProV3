(function () {
  'use strict';

  var STORE_KEY = 'veyra_monitor_v3';

  var MKT_LABEL = {
    over25: 'Over 2.5G', under35: 'Under 3.5G', btts: 'BTTS',
    over15: 'Over 1.5G', dc1x: 'DC 1X', dcx2: 'DC X2', dc12: 'DC 12'
  };
  var MKT_COLOR = {
    over25: '#f59e0b', under35: '#3b82f6', btts: '#ec4899',
    over15: '#10b981', dc1x: '#8b5cf6', dcx2: '#06b6d4', dc12: '#f97316'
  };

  /* ── helpers ── */
  function load()        { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function save(obj)     { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {} }

  /* bestBet can be an object {type,odds,...} or a string */
  function betType(m)    { var b = m.bestBet; return b && typeof b === 'object' ? (b.type || '') : (b || ''); }
  function betOdds(m)    { var b = m.bestBet; return b && typeof b === 'object' ? (b.bestOdds || b.odds || null) : (m.bestOdds || m.odds || null); }
  function matchDate(m)  { return m.date || m.eventDate || m.event_date || ''; }
  function entryKey(m) {
    var bt  = betType(m);
    if (!bt) return null;
    var eid = String(m.eventId != null ? m.eventId : (m.event_id != null ? m.event_id : '')).trim();
    if (eid && eid !== '0') return eid + '|' + bt;
    var h = String(m.home || '').toLowerCase().trim();
    var a = String(m.away || '').toLowerCase().trim();
    if (h && a) return h + '|' + a + '|' + String(m.date || m.eventDate || m.event_date || '').slice(0, 10) + '|' + bt;
    return null;
  }

  /* ── get source matches — ONLY what's currently displayed (never ALL_MATCHES) ── */
  function getSourceMatches() {
    /* 1. live MATCHES_FILTERED_CACHE — exact filtered display */
    var fc = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    if (fc.length) return fc;
    /* 2. last saved snapshot by display_snapshot.js (same filtered list, persisted) */
    try {
      var snap = JSON.parse(localStorage.getItem('veyra_display_snapshot_v2') || 'null');
      if (snap && Array.isArray(snap.matches) && snap.matches.length) return snap.matches;
    } catch (e) {}
    return [];
  }

  /* ── sync matches into store ── */
  function syncFromSource() {
    var preds = getSourceMatches();
    if (!preds.length) return;
    var store = load();
    var added = 0;
    preds.forEach(function (m) {
      var k = entryKey(m);
      if (!k) return;
      if (!store[k]) {
        store[k] = {
          eventId:     String(m.eventId || ''),
          home:        m.home  || '',
          away:        m.away  || '',
          league:      m.league || '',
          country:     m.country || '',
          bestBet:     betType(m),
          odds:        betOdds(m),
          smartScore:  m.smartScore || 0,
          eventDate:   matchDate(m),
          addedAt:     new Date().toISOString(),
          status:      'pending',
          homeScore:   null,
          awayScore:   null,
          autoDetected: false,
          resolvedAt:  null
        };
        added++;
      }
    });
    if (added) save(store);
  }

  /* ── auto-detect results from ALL_MATCHES ── */
  function autoCheckResults() {
    var all = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    if (!all.length) return false;

    var byId = {};
    all.forEach(function (m) {
      var eid = String(m.eventId || m.event_id || '');
      if (eid) byId[eid] = m;
    });

    var store   = load();
    var changed = false;

    Object.keys(store).forEach(function (k) {
      var entry = store[k];
      if (entry.status !== 'pending') return;
      var live = byId[entry.eventId];
      if (!live) return;
      var hs = live.homeScore != null ? live.homeScore : null;
      var as = live.awayScore != null ? live.awayScore : null;
      if (hs === null || as === null) return;

      var result;
      if (typeof window.evaluateMarketOutcome === 'function') {
        result = window.evaluateMarketOutcome(entry.bestBet, hs, as);
      } else {
        var tot = Number(hs) + Number(as);
        var bet = entry.bestBet;
        if      (bet === 'over15')  result = tot >= 2 ? 'win' : 'loss';
        else if (bet === 'over25')  result = tot >= 3 ? 'win' : 'loss';
        else if (bet === 'under35') result = tot <= 3 ? 'win' : 'loss';
        else if (bet === 'btts')    result = (Number(hs) > 0 && Number(as) > 0) ? 'win' : 'loss';
        else result = 'pending';
      }

      if (result === 'win' || result === 'loss') {
        entry.status       = result;
        entry.homeScore    = hs;
        entry.awayScore    = as;
        entry.autoDetected = true;
        entry.resolvedAt   = new Date().toISOString();
        changed = true;
      }
    });

    if (changed) save(store);
    return changed;
  }

  var _dayOpen = {};
  var _activeMonitorTab = 'meciuri'; /* 'meciuri' | 'apex' | 'ml5' */

  window._monitorToggleDay = function (dk) { _dayOpen[dk] = !_dayOpen[dk]; window.renderStatsMeciuri(); };
  window._monitorSwitchTab = function (t)  { _activeMonitorTab = t; window.renderStatsMeciuri(); };

  window.renderStatsMeciuri = function () {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    syncFromSource();  autoCheckResults();
    syncApex();        autoCheckApex();
    syncMl5();         autoCheckMl5();

    var meciuriRows = Object.values(load()).sort(function(a,b){ return new Date(a.eventDate||a.addedAt)-new Date(b.eventDate||b.addedAt); });
    var apexRows    = Object.values(loadApex()).sort(function(a,b){ return new Date(a.eventDate||a.addedAt)-new Date(b.eventDate||b.addedAt); });
    var ml5Rows     = Object.values(loadMl5()).sort(function(a,b){ return new Date(a.eventDate||a.addedAt)-new Date(b.eventDate||b.addedAt); });

    var h = '<div style="padding:14px 12px 80px">';

    /* ── tab switcher ── */
    h += '<div style="display:flex;gap:8px;margin-bottom:16px;background:#0a0f1e;border-radius:14px;padding:5px">';
    [
      { key: 'meciuri', label: '⚽ Meciuri', count: meciuriRows.length },
      { key: 'apex',    label: '⚡ APEX',    count: apexRows.length    },
      { key: 'ml5',     label: '🔬 ML5',     count: ml5Rows.length     }
    ].forEach(function (tab) {
      var active = _activeMonitorTab === tab.key;
      h += '<button onclick="window._monitorSwitchTab(\'' + tab.key + '\')" '
        + 'style="flex:1;padding:9px 8px;border-radius:10px;border:none;cursor:pointer;font-size:12px;font-weight:700;'
        + 'background:' + (active ? '#1e293b' : 'transparent') + ';'
        + 'color:' + (active ? '#e2e8f0' : '#475569') + ';transition:all .2s">'
        + tab.label
        + (tab.count ? ' <span style="font-size:10px;font-weight:600;color:' + (active ? '#60a5fa' : '#334155') + ';background:' + (active ? '#1e3a5f' : '#1e293b') + ';border-radius:5px;padding:1px 6px;margin-left:4px">' + tab.count + '</span>' : '')
        + '</button>';
    });
    h += '</div>';

    /* ── active section ── */
    if (_activeMonitorTab === 'meciuri') {
      h += renderSummaryBlock(meciuriRows, 'window._monitorToggleDay', 'window._monitorClearAll',
        'MONITORIZARE MECIURI',
        '<div style="font-size:32px;margin-bottom:8px">📋</div>Mergi în Meciuri — meciurile afișate apar automat aici.',
        '#e2e8f0');
      h += renderDayGroup(meciuriRows, _dayOpen, 'window._monitorToggleDay', 'meciuri');
    } else if (_activeMonitorTab === 'apex') {
      h += renderSummaryBlock(apexRows, 'window._apexToggleDay', 'window._apexClearAll',
        '⚡ MONITORIZARE APEX',
        '<div style="font-size:32px;margin-bottom:8px">⚡</div>Deschide APEX Neural Engine — pick-urile apar automat aici.',
        '#a78bfa');
      h += renderDayGroup(apexRows, _apexDayOpen, 'window._apexToggleDay', 'picks');
    } else {
      h += renderSummaryBlock(ml5Rows, 'window._ml5ToggleDay', 'window._ml5ClearAll',
        '🔬 MONITORIZARE ML5',
        '<div style="font-size:32px;margin-bottom:8px">🔬</div>Deschide ML5 Analysis — pick-urile apar automat aici.',
        '#10b981');
      h += renderDayGroup(ml5Rows, _ml5DayOpen, 'window._ml5ToggleDay', 'picks');
    }

    h += '</div>';
    root.innerHTML = h;
  };

  window._monitorClearAll = function () { save({}); window.renderStatsMeciuri(); };

  /* ═══════════════════════════════════════════════
     APEX MONITOR
  ═══════════════════════════════════════════════ */
  var APEX_KEY   = 'veyra_apex_monitor_v1';
  var _apexDayOpen = {};

  function loadApex()    { try { return JSON.parse(localStorage.getItem(APEX_KEY) || '{}'); } catch (e) { return {}; } }
  function saveApex(obj) { try { localStorage.setItem(APEX_KEY, JSON.stringify(obj)); } catch (e) {} }

  function apexKey(p) {
    var mk  = p.marketKey || p.market_key || p.market || '';
    if (!mk) return null;
    var eid = String(p.event_id != null ? p.event_id : (p.eventId != null ? p.eventId : '')).trim();
    if (eid && eid !== '0') return eid + '|' + mk;
    /* fallback: use home|away|date|market for picks without event_id */
    var h = String(p.home || '').toLowerCase().trim();
    var a = String(p.away || '').toLowerCase().trim();
    if (h && a) return h + '|' + a + '|' + String(p.event_date || p.eventDate || '').slice(0, 10) + '|' + mk;
    return null;
  }

  function syncApex() {
    var analysis = window.SMARTBET_LAST_ANALYSIS;
    var pool = analysis && Array.isArray(analysis.pool) ? analysis.pool.filter(Boolean) : [];
    if (!pool.length) return;
    var store   = loadApex();
    var changed = false;

    /* remove pending entries no longer in current pool */
    var curKeys = {};
    pool.forEach(function(p){ var k = apexKey(p); if (k) curKeys[k] = true; });
    Object.keys(store).forEach(function(k){
      if (store[k].status === 'pending' && !curKeys[k]) { delete store[k]; changed = true; }
    });

    pool.forEach(function (p) {
      var k = apexKey(p);
      if (!k) return;
      if (!store[k]) {
        store[k] = {
          eventId:    String(p.event_id || p.eventId || ''),
          home:       p.home  || '',
          away:       p.away  || '',
          league:     p.league || '',
          bestBet:    p.marketKey || p.market_key || p.market || '',
          odds:       p.displayOdds || p.book_odds || p.odds || null,
          smartScore: p.smartScore  || p.score    || 0,
          eventDate:  p.event_date  || p.eventDate || '',
          addedAt:    new Date().toISOString(),
          status:     'pending',
          homeScore:  null,
          awayScore:  null,
          resolvedAt: null
        };
        changed = true;
      }
    });
    if (changed) saveApex(store);
  }

  function autoCheckApex() {
    var all = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    if (!all.length) return false;
    var byId = {};
    all.forEach(function (m) {
      var eid = String(m.eventId || m.event_id || '');
      if (eid) byId[eid] = m;
    });
    var store = loadApex(), changed = false;
    Object.keys(store).forEach(function (k) {
      var e = store[k];
      if (e.status !== 'pending') return;
      var live = byId[e.eventId];
      if (!live) return;
      var hs = live.homeScore != null ? live.homeScore : null;
      var as = live.awayScore != null ? live.awayScore : null;
      if (hs === null || as === null) return;
      var result;
      if (typeof window.evaluateMarketOutcome === 'function') {
        result = window.evaluateMarketOutcome(e.bestBet, hs, as);
      } else {
        var tot = Number(hs) + Number(as);
        var b   = e.bestBet;
        if      (b === 'over15')  result = tot >= 2 ? 'win' : 'loss';
        else if (b === 'over25')  result = tot >= 3 ? 'win' : 'loss';
        else if (b === 'under35') result = tot <= 3 ? 'win' : 'loss';
        else if (b === 'btts')    result = (Number(hs) > 0 && Number(as) > 0) ? 'win' : 'loss';
        else result = 'pending';
      }
      if (result === 'win' || result === 'loss') {
        e.status = result; e.homeScore = hs; e.awayScore = as; e.resolvedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) saveApex(store);
    return changed;
  }

  function renderDayGroup(rows, dayOpen, toggleFn, unit) {
    var dayMap = {}, dayOrder = [];
    rows.forEach(function (e) {
      var dk = (e.eventDate || '').slice(0, 10) || 'necunoscut';
      if (!dayMap[dk]) { dayMap[dk] = []; dayOrder.push(dk); }
      dayMap[dk].push(e);
    });
    dayOrder.sort();
    dayOrder.forEach(function (dk) { if (dayOpen[dk] === undefined) dayOpen[dk] = false; });

    var h = '';
    dayOrder.forEach(function (dayKey) {
      var dr   = dayMap[dayKey];
      var isOp = !!dayOpen[dayKey];
      var lbl  = '—';
      if (dayKey !== 'necunoscut') {
        var dt = new Date(dayKey + 'T12:00:00');
        if (!isNaN(dt)) {
          var today = new Date(); today.setHours(0,0,0,0);
          var tom   = new Date(today); tom.setDate(today.getDate() + 1);
          if (dt.getTime() === today.getTime())   lbl = 'Azi · '  + dt.toLocaleDateString('ro-RO', {day:'2-digit',month:'short'});
          else if (dt.getTime() === tom.getTime()) lbl = 'Mâine · ' + dt.toLocaleDateString('ro-RO', {day:'2-digit',month:'short'});
          else lbl = dt.toLocaleDateString('ro-RO', {weekday:'short',day:'2-digit',month:'short'});
        }
      }
      var dW = 0, dL = 0, dP = 0;
      dr.forEach(function(e){ if(e.status==='win') dW++; else if(e.status==='loss') dL++; else dP++; });

      h += '<div style="margin-bottom:8px">';
      h += '<button onclick="' + toggleFn + '(\'' + dayKey + '\')" '
        + 'style="width:100%;background:#0f172a;border:1px solid #1e293b;border-radius:12px;'
        + 'padding:11px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-align:left">';
      h += '<div style="display:flex;align-items:center;gap:10px">';
      h += '<span style="font-size:12px;font-weight:700;color:#e2e8f0">' + lbl + '</span>';
      h += '<span style="font-size:11px;color:#475569">' + dr.length + ' ' + unit + '</span></div>';
      h += '<div style="display:flex;align-items:center;gap:6px">';
      if (dW) h += '<span style="font-size:10px;font-weight:700;color:#22c55e;background:#14532d;border-radius:5px;padding:2px 7px">' + dW + ' W</span>';
      if (dL) h += '<span style="font-size:10px;font-weight:700;color:#ef4444;background:#450a0a;border-radius:5px;padding:2px 7px">' + dL + ' L</span>';
      if (dP) h += '<span style="font-size:10px;color:#64748b;background:#1e293b;border-radius:5px;padding:2px 7px">' + dP + ' ⏳</span>';
      h += '<span style="font-size:14px;color:#475569;margin-left:4px">' + (isOp ? '▲' : '▼') + '</span>';
      h += '</div></button>';

      if (isOp) {
        h += '<div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">';
        dr.forEach(function (e) {
          var color  = MKT_COLOR[e.bestBet] || '#64748b';
          var label  = MKT_LABEL[e.bestBet] || e.bestBet || '';
          var odds   = e.odds ? parseFloat(e.odds).toFixed(2) : '—';
          var sc     = e.smartScore || 0;
          var st     = e.status || 'pending';
          var timeStr = '';
          if (e.eventDate) { var edt = new Date(e.eventDate); if (!isNaN(edt)) timeStr = edt.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}); }
          var badge, cardBorder;
          if (st === 'win') {
            cardBorder = '#166534';
            badge = '<span style="font-size:11px;font-weight:700;background:#14532d;color:#22c55e;border-radius:7px;padding:3px 10px">✓ WIN' + (e.homeScore != null ? ' · '+e.homeScore+'-'+e.awayScore : '') + '</span>';
          } else if (st === 'loss') {
            cardBorder = '#7f1d1d';
            badge = '<span style="font-size:11px;font-weight:700;background:#450a0a;color:#ef4444;border-radius:7px;padding:3px 10px">✗ LOSS' + (e.homeScore != null ? ' · '+e.homeScore+'-'+e.awayScore : '') + '</span>';
          } else {
            cardBorder = '#1e293b';
            badge = '<span style="font-size:11px;color:#64748b;background:#1e293b;border-radius:7px;padding:3px 9px">⏳ Așteptare</span>';
          }
          h += '<div style="background:#0a0f1e;border:1px solid ' + cardBorder + ';border-radius:12px;padding:11px 12px">';
          h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
          h += '<span style="font-size:12px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (e.home||'') + ' <span style="color:#475569;font-weight:400">vs</span> ' + (e.away||'') + '</span>';
          h += '<span style="font-size:10px;color:#64748b;white-space:nowrap;margin-left:8px">' + timeStr + '</span></div>';
          h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">';
          if (e.league) h += '<span style="font-size:10px;color:#475569">' + e.league + '</span>';
          if (label)    h += '<span style="font-size:10px;font-weight:700;color:' + color + ';background:#1e293b;border-radius:5px;padding:2px 7px">' + label + '</span>';
          h += '<span style="font-size:11px;font-weight:700;color:#fbbf24">@ ' + odds + '</span>';
          h += '<span style="font-size:10px;color:#475569">SS:' + sc + '</span></div>';
          h += badge + '</div>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    return h;
  }

  function renderSummaryBlock(rows, toggleFn, clearFn, title, subtitle, accentColor) {
    var pending = 0, wins = 0, losses = 0, roiSum = 0;
    rows.forEach(function (e) {
      if      (e.status === 'win')  { wins++;   roiSum += (parseFloat(e.odds)||1) - 1; }
      else if (e.status === 'loss') { losses++;  roiSum -= 1; }
      else pending++;
    });
    var settled = wins + losses;
    var winRate = settled > 0 ? Math.round(wins/settled*100) : null;
    var roiPct  = settled > 0 ? (roiSum/settled*100).toFixed(1) : null;
    var roiPos  = roiPct !== null && parseFloat(roiPct) >= 0;

    var dayMap = {};
    rows.forEach(function(e){ var dk=(e.eventDate||'').slice(0,10)||'x'; dayMap[dk]=1; });
    var nDays = Object.keys(dayMap).length;

    var h = '';
    /* section header */
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
    h += '<div>';
    h += '<div style="font-size:13px;font-weight:700;color:' + accentColor + ';letter-spacing:.4px">' + title + '</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">' + rows.length + ' picks · ' + nDays + ' zile · auto-update</div>';
    h += '</div>';
    if (rows.length) h += '<button onclick="' + clearFn + '()" style="background:none;border:1px solid #1e293b;color:#475569;border-radius:8px;padding:5px 10px;font-size:10px;cursor:pointer">Resetează</button>';
    h += '</div>';

    /* summary pills */
    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px">';
    [
      { val: pending, label: 'AȘTEPTARE', color: '#94a3b8' },
      { val: wins,    label: 'WIN',       color: '#22c55e' },
      { val: losses,  label: 'LOSS',      color: '#ef4444' },
      { val: winRate !== null ? winRate+'%' : '—', label: 'WIN RATE', color: '#60a5fa' },
      { val: roiPct  !== null ? (roiPos?'+':'')+roiPct+'%' : '—', label: 'ROI', color: roiPct!==null?(roiPos?'#22c55e':'#ef4444'):'#475569' }
    ].forEach(function(c){
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:9px 3px;text-align:center">';
      h += '<div style="font-size:' + (String(c.val).length>4?'13':'20') + 'px;font-weight:800;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      h += '<div style="font-size:8px;color:#475569;margin-top:3px;letter-spacing:.4px">' + c.label + '</div></div>';
    });
    h += '</div>';

    if (!rows.length) {
      h += '<div style="text-align:center;padding:32px 0;color:#334155;font-size:12px">';
      h += subtitle;
      h += '</div>';
    }
    return h;
  }

  /* ═══════════════════════════════════════════════
     ML5 MONITOR
  ═══════════════════════════════════════════════ */
  var ML5_KEY      = 'veyra_ml5_monitor_v1';
  var _ml5DayOpen  = {};

  function loadMl5()    { try { return JSON.parse(localStorage.getItem(ML5_KEY) || '{}'); } catch (e) { return {}; } }
  function saveMl5(obj) { try { localStorage.setItem(ML5_KEY, JSON.stringify(obj)); } catch (e) {} }

  function syncMl5() {
    var all = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    var pool = all.filter(function (m) {
      return m && m.isEnriched && m.bestBet && m.eventId;
    });
    if (!pool.length) return;
    var store = loadMl5(), changed = false;

    /* remove pending entries no longer in current pool */
    var curKeys = {};
    pool.forEach(function(m){ var k = entryKey(m); if (k) curKeys[k] = true; });
    Object.keys(store).forEach(function(k){
      if (store[k].status === 'pending' && !curKeys[k]) { delete store[k]; changed = true; }
    });

    pool.forEach(function (m) {
      var k = entryKey(m);
      if (!k) return;
      if (!store[k]) {
        store[k] = {
          eventId:    String(m.eventId || ''),
          home:       m.home   || '',
          away:       m.away   || '',
          league:     m.league || '',
          bestBet:    betType(m),
          odds:       betOdds(m),
          smartScore: m.smartScore || 0,
          eventDate:  matchDate(m),
          addedAt:    new Date().toISOString(),
          status:     'pending',
          homeScore:  null,
          awayScore:  null,
          resolvedAt: null
        };
        changed = true;
      }
    });
    if (changed) saveMl5(store);
  }

  function autoCheckMl5() {
    var all = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    if (!all.length) return false;
    var byId = {};
    all.forEach(function (m) { var eid = String(m.eventId || ''); if (eid) byId[eid] = m; });
    var store = loadMl5(), changed = false;
    Object.keys(store).forEach(function (k) {
      var e = store[k];
      if (e.status !== 'pending') return;
      var live = byId[e.eventId];
      if (!live) return;
      var hs = live.homeScore != null ? live.homeScore : null;
      var as = live.awayScore != null ? live.awayScore : null;
      if (hs === null || as === null) return;
      var result = typeof window.evaluateMarketOutcome === 'function'
        ? window.evaluateMarketOutcome(e.bestBet, hs, as) : 'pending';
      if (result === 'win' || result === 'loss') {
        e.status = result; e.homeScore = hs; e.awayScore = as; e.resolvedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) saveMl5(store);
    return changed;
  }

  window._ml5ToggleDay = function (dk) { _ml5DayOpen[dk] = !_ml5DayOpen[dk]; window.renderStatsMeciuri(); };
  window._ml5ClearAll  = function ()   { saveMl5({}); window.renderStatsMeciuri(); };

  /* ── hook renderML5Analysis ── */
  function hookMl5() {
    if (window.__ml5MonitorHooked) return;
    if (typeof window.renderML5Analysis !== 'function') return;
    window.__ml5MonitorHooked = true;
    var orig = window.renderML5Analysis;
    window.renderML5Analysis = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        syncMl5(); autoCheckMl5();
        var root = document.getElementById('tab-stats-meciuri');
        if (root && root.offsetParent !== null) window.renderStatsMeciuri();
      }, 300);
      return r;
    };
  }
  function hookSmartBet() {
    if (window.__apexMonitorHooked) return;
    if (typeof window.renderSmartBet !== 'function') return;
    window.__apexMonitorHooked = true;
    var orig = window.renderSmartBet;
    window.renderSmartBet = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        syncApex();
        autoCheckApex();
        var root = document.getElementById('tab-stats-meciuri');
        if (root && root.offsetParent !== null) window.renderStatsMeciuri();
      }, 300);
      return r;
    };
  }
  function hookRender() {
    if (window.__statsMeciuriHooked) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__statsMeciuriHooked = true;
    var orig = window.renderMatches;
    window.renderMatches = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        syncFromSource();
        autoCheckResults();
        var root = document.getElementById('tab-stats-meciuri');
        if (root && root.offsetParent !== null) window.renderStatsMeciuri();
      }, 250);
      return r;
    };
  }

  function boot() {
    hookRender();
    hookSmartBet();
    hookMl5();
    var n = 0, iv = setInterval(function () {
      hookRender();
      hookSmartBet();
      hookMl5();
      if ((window.__statsMeciuriHooked && window.__apexMonitorHooked && window.__ml5MonitorHooked) || ++n > 30) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
