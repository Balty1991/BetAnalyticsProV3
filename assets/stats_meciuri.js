(function () {
  'use strict';

  /*
   * ARHITECTURA:
   *   pending = calculat LIVE din datele curente la fiecare render (nu e stocat)
   *   win/loss = stocat în localStorage (nu se poate desincroniza niciodată)
   *
   * Astfel contoarele corespund mereu cu ce afișează APEX / ML5 / Meciuri.
   */

  /* ── storage keys ── */
  var STORE_KEY = 'veyra_monitor_v4';
  var APEX_KEY  = 'veyra_apex_monitor_v2';
  var ML5_KEY   = 'veyra_ml5_monitor_v2';

  var _REPO  = 'Balty1991/VEYRA';
  var _RFILE = 'data/monitor_stats.json';
  var _syncT = null;

  var MKT_LABEL = {
    over25:'Over 2.5G', under35:'Under 3.5G', btts:'BTTS',
    over15:'Over 1.5G', dc1x:'DC 1X', dcx2:'DC X2', dc12:'DC 12',
    homewin:'1 (Home Win)', awaywin:'2 (Away Win)', draw:'X (Egal)'
  };
  var MKT_COLOR = {
    over25:'#f59e0b', under35:'#3b82f6', btts:'#ec4899',
    over15:'#10b981', dc1x:'#8b5cf6',   dcx2:'#06b6d4', dc12:'#f97316',
    homewin:'#22c55e', awaywin:'#ef4444', draw:'#94a3b8'
  };

  /* ── storage helpers ── */
  function loadStore(key)           { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; } }
  function saveStoreLocal(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch(e) {} }
  function saveStore(key, obj)      { saveStoreLocal(key, obj); _scheduleRepoSave(); }

  /* ── GitHub repo sync ── */
  function _pat() { return localStorage.getItem('veyra_github_pat') || ''; }

  function _setSyncStatus(msg, color) {
    var el = document.getElementById('veyra-sync-status');
    if (el) { el.textContent = msg; el.style.color = color || '#94a3b8'; }
  }

  function _repoFetch(cb) {
    fetch('https://api.github.com/repos/' + _REPO + '/contents/' + _RFILE + '?_t=' + Date.now(), {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(meta) {
      if (!meta || !meta.content) return cb(null, null);
      try { cb(JSON.parse(atob(meta.content.replace(/\s/g,''))), meta.sha); }
      catch(e) { cb(null, meta.sha || null); }
    }).catch(function() { cb(null, null); });
  }

  function _scheduleRepoSave() {
    if (!_pat()) return;
    clearTimeout(_syncT);
    _syncT = setTimeout(function() {
      _setSyncStatus('☁ Se salvează…', '#94a3b8');
      _repoFetch(function(existing, sha) {
        var payload = {
          meciuri:  loadStore(STORE_KEY),
          apex:     loadStore(APEX_KEY),
          ml5:      loadStore(ML5_KEY),
          saved_at: new Date().toISOString()
        };
        var body = { message: 'VEYRA monitor stats', content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))) };
        if (sha) body.sha = sha;
        fetch('https://api.github.com/repos/' + _REPO + '/contents/' + _RFILE, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + _pat(), 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
          body: JSON.stringify(body)
        }).then(function(r) {
          if (r.ok) _setSyncStatus('☁ Salvat ✓', '#22c55e');
          else _setSyncStatus('☁ Eroare ' + r.status, '#ef4444');
        }).catch(function() { _setSyncStatus('☁ Offline', '#f59e0b'); });
      });
    }, 2000);
  }

  function _repoLoadAndMerge(done) {
    _repoFetch(function(data) {
      if (!data) return done && done();
      function merge(storeKey, incoming) {
        if (!incoming || typeof incoming !== 'object') return;
        var local = loadStore(storeKey), dirty = false;
        Object.keys(incoming).forEach(function(k) {
          var ri = incoming[k], li = local[k];
          if (!li) { local[k] = ri; dirty = true; return; }
          var rt = ri.resolvedAt || '', lt = li.resolvedAt || '';
          if (rt && (!lt || rt > lt)) { local[k] = ri; dirty = true; }
        });
        if (dirty) saveStoreLocal(storeKey, local);
      }
      merge(STORE_KEY, data.meciuri);
      merge(APEX_KEY,  data.apex);
      merge(ML5_KEY,   data.ml5);
      done && done();
    });
  }

  window._setMonitorToken = function() {
    var cur = _pat();
    var t = prompt(
      'Token GitHub Personal Access (scope: Contents → Read and write)\n\n' +
      (cur ? 'Token setat. Lasă gol pentru a dezactiva sincronizarea.' : 'Lipește tokenul tău:')
    );
    if (t === null) return;
    if (t.trim()) { localStorage.setItem('veyra_github_pat', t.trim()); _scheduleRepoSave(); }
    else           { localStorage.removeItem('veyra_github_pat'); }
    window.renderStatsMeciuri && window.renderStatsMeciuri();
  };

  function betType(m)   { var b = m.bestBet; return b && typeof b === 'object' ? (b.type || '') : (b || ''); }
  function betOdds(m)   { var b = m.bestBet; return b && typeof b === 'object' ? (b.bestOdds || b.odds || null) : (m.bestOdds || m.odds || null); }
  function matchDate(m) { return m.date || m.eventDate || m.event_date || ''; }

  function entryKey(m) {
    var bt  = betType(m);
    if (!bt) return null;
    var eid = String(m.eventId != null ? m.eventId : (m.event_id != null ? m.event_id : '')).trim();
    if (eid && eid !== '0') return eid + '|' + bt;
    var h = String(m.home || '').toLowerCase().trim();
    var a = String(m.away || '').toLowerCase().trim();
    if (h && a) return h + '|' + a + '|' + String(m.date || m.eventDate || m.event_date || '').slice(0,10) + '|' + bt;
    return null;
  }

  function apexKey(p) {
    var mk  = p.marketKey || p.market_key || p.market || '';
    if (!mk) return null;
    var eid = String(p.event_id != null ? p.event_id : (p.eventId != null ? p.eventId : '')).trim();
    if (eid && eid !== '0') return eid + '|' + mk;
    var h = String(p.home || '').toLowerCase().trim();
    var a = String(p.away || '').toLowerCase().trim();
    if (h && a) return h + '|' + a + '|' + String(p.event_date || p.eventDate || '').slice(0,10) + '|' + mk;
    return null;
  }

  /* ── evaluate result — complete standalone implementation ── */
  function evalOutcome(betKey, hs, as) {
    if (hs == null || as == null) return 'pending';
    var h = Number(hs), a = Number(as), tot = h + a;
    if (betKey === 'over15')  return tot >= 2 ? 'win' : 'loss';
    if (betKey === 'over25')  return tot >= 3 ? 'win' : 'loss';
    if (betKey === 'over35')  return tot >= 4 ? 'win' : 'loss';
    if (betKey === 'under25') return tot <= 2 ? 'win' : 'loss';
    if (betKey === 'under35') return tot <= 3 ? 'win' : 'loss';
    if (betKey === 'btts')    return (h > 0 && a > 0) ? 'win' : 'loss';
    if (betKey === 'homewin') return h > a ? 'win' : 'loss';
    if (betKey === 'awaywin') return a > h ? 'win' : 'loss';
    if (betKey === 'draw')    return h === a ? 'win' : 'loss';
    if (betKey === 'dc1x')    return h >= a ? 'win' : 'loss';
    if (betKey === 'dcx2')    return a >= h ? 'win' : 'loss';
    if (betKey === 'dc12')    return h !== a ? 'win' : 'loss';
    return 'pending';
  }

  /* ══════════════════════════════════════════════════
     GET ROWS — live pending merged with stored win/loss
  ══════════════════════════════════════════════════ */

  function getMeciuriRows() {
    /* live pool = exact filtered matches shown in Meciuri */
    var pool = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    if (!pool.length) {
      try {
        var snap = JSON.parse(localStorage.getItem('veyra_display_snapshot_v2') || 'null');
        if (snap && Array.isArray(snap.matches) && snap.matches.length) pool = snap.matches;
      } catch(e) {}
    }
    return _mergeRows(pool, STORE_KEY,
      function(m){ return entryKey(m); },
      function(m){ return {
        eventId:   String(m.eventId || m.event_id || ''),
        home:      m.home  || '', away:  m.away  || '',
        league:    m.league || '', country: m.country || '',
        bestBet:   betType(m), odds: betOdds(m),
        smartScore: m.smartScore || 0, eventDate: matchDate(m)
      }; }
    );
  }

  function getApexRows() {
    var analysis = window.SMARTBET_LAST_ANALYSIS;
    if (!analysis && typeof window.getSmartBetAnalysis === 'function') {
      try { analysis = window.getSmartBetAnalysis(); } catch(e) {}
    }
    var pool = analysis && Array.isArray(analysis.pool) ? analysis.pool.filter(Boolean) : [];
    return _mergeRows(pool, APEX_KEY,
      function(p){ return apexKey(p); },
      function(p){ return {
        eventId:   String(p.event_id || p.eventId || ''),
        home:      p.home  || '', away:  p.away  || '',
        league:    p.league || '',
        bestBet:   p.marketKey || p.market_key || p.market || '',
        odds:      p.displayOdds || p.book_odds || p.odds || null,
        smartScore: p.smartScore || p.score || 0,
        eventDate:  p.event_date || p.eventDate || ''
      }; }
    );
  }

  function getMl5Rows() {
    var _now = Date.now();
    var all  = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    var pool = all.filter(function(m) {
      if (!m || !m.isEnriched || !m.bestBet) return false;
      if (m.date) { var _d = new Date(m.date); if (isFinite(_d.getTime()) && _d.getTime() < _now - 2*3600*1000) return false; }
      return true;
    });
    return _mergeRows(pool, ML5_KEY,
      function(m){ return entryKey(m); },
      function(m){ return {
        eventId:   String(m.eventId || m.event_id || ''),
        home:      m.home  || '', away:  m.away  || '',
        league:    m.league || '',
        bestBet:   betType(m), odds: betOdds(m),
        smartScore: m.smartScore || 0, eventDate: matchDate(m)
      }; }
    );
  }

  /* core merge: live pool picks + resolved history from localStorage */
  function _mergeRows(pool, storeKey, keyFn, shapeFn) {
    var resolved = loadStore(storeKey);
    var rows = [];
    var seen = {};
    var storeChanged = false;

    pool.forEach(function(item) {
      var k = keyFn(item);
      if (!k) return;
      seen[k] = true;
      var hist = resolved[k];
      if (hist && hist.status !== 'pending') {
        rows.push(hist);
      } else {
        var base = shapeFn(item);
        var entry = Object.assign({}, base, {
          status: 'pending', homeScore: null, awayScore: null, resolvedAt: null
        });
        /* snapshot pending pick so it survives pipeline updates */
        if (!hist) { resolved[k] = entry; storeChanged = true; }
        rows.push(entry);
      }
    });

    if (storeChanged) saveStore(storeKey, resolved);

    /* show ALL historical entries not in current pool — WIN/LOSS and all past recommendations */
    Object.keys(resolved).forEach(function(k) {
      if (!seen[k]) rows.push(resolved[k]);
    });

    /* Deduplicate by eventId+bestBet: prefer resolved over pending.
       This cleans up any duplicate name-based entries created by old auto-check logic. */
    var byMatch = {};
    rows.forEach(function(r) {
      if (!r || !r.eventId || !r.bestBet) return;
      var mk = r.eventId + '|' + r.bestBet;
      var cur = byMatch[mk];
      if (!cur || (cur.status === 'pending' && r.status !== 'pending')) byMatch[mk] = r;
    });
    return rows.filter(function(r) {
      if (!r || !r.eventId || !r.bestBet) return true;
      return byMatch[r.eventId + '|' + r.bestBet] === r;
    });
  }

  /* ══════════════════════════════════════════════════
     AUTO-CHECK — updates localStorage win/loss from ALL_MATCHES
  ══════════════════════════════════════════════════ */

  function _autoCheck(rows, storeKey, keyFn) {
    var rawPreds = Array.isArray(window.__RAW_PREDICTIONS) ? window.__RAW_PREDICTIONS : [];
    if (!rawPreds.length) return;

    var byId   = {};
    var byName = {};
    rawPreds.forEach(function(raw) {
      var ev = raw && raw.event ? raw.event : null;
      if (!ev) return;
      var hs = (ev.home_score != null && String(ev.home_score) !== 'None') ? Number(ev.home_score) : null;
      var as = (ev.away_score != null && String(ev.away_score) !== 'None') ? Number(ev.away_score) : null;
      var sd = { homeScore: hs, awayScore: as, status: ev.status || '' };
      var eid = String(ev.id != null ? ev.id : '').trim();
      if (eid) byId[eid] = sd;
      var h = String(ev.home_team || '').toLowerCase().trim();
      var a = String(ev.away_team || '').toLowerCase().trim();
      if (h && a) byName[h + '|' + a] = sd;
    });

    var store   = loadStore(storeKey);
    var changed = false;
    /* Iterate store keys directly so we always update the existing key,
       preventing a new name-based key being created alongside the id-based one. */
    Object.keys(store).forEach(function(k) {
      var entry = store[k];
      if (!entry || entry.status !== 'pending') return;
      var eid = String(entry.eventId || '');
      var sd  = (eid && eid !== '0') ? byId[eid] : null;
      if (!sd) {
        var h = String(entry.home || '').toLowerCase().trim();
        var a = String(entry.away || '').toLowerCase().trim();
        if (h && a) sd = byName[h + '|' + a];
      }
      if (!sd) return;
      var hs = sd.homeScore, as = sd.awayScore;
      if (hs === null || as === null || isNaN(hs) || isNaN(as)) return;
      var result = evalOutcome(entry.bestBet, hs, as);
      if (result === 'win' || result === 'loss') {
        store[k] = Object.assign({}, entry, {
          status: result, homeScore: hs, awayScore: as,
          resolvedAt: new Date().toISOString()
        });
        changed = true;
      }
    });
    if (changed) saveStore(storeKey, store);
  }

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */

  var _dayOpen     = {};
  var _apexDayOpen = {};
  var _ml5DayOpen  = {};
  var _activeMonitorTab = 'meciuri';
  var _pendingEntries   = [];  /* reset each render; used by manual settle */

  window._monitorSwitchTab = function(t)  { _activeMonitorTab = t; window.renderStatsMeciuri(); };
  window._monitorToggleDay = function(dk) { _dayOpen[dk]     = !_dayOpen[dk];     window.renderStatsMeciuri(); };
  window._apexToggleDay    = function(dk) { _apexDayOpen[dk] = !_apexDayOpen[dk]; window.renderStatsMeciuri(); };
  window._ml5ToggleDay     = function(dk) { _ml5DayOpen[dk]  = !_ml5DayOpen[dk];  window.renderStatsMeciuri(); };
  window._monitorClearAll  = function()   { saveStore(STORE_KEY, {}); window.renderStatsMeciuri(); };
  window._apexClearAll     = function()   { saveStore(APEX_KEY,  {}); window.renderStatsMeciuri(); };
  window._ml5ClearAll      = function()   { saveStore(ML5_KEY,   {}); window.renderStatsMeciuri(); };

  window._manualSettle = function(idx, result) {
    var item = _pendingEntries[idx];
    if (!item) return;
    var store = loadStore(item.storeKey);
    store[item.key] = Object.assign({}, item.entry, {
      status: result, resolvedAt: new Date().toISOString(), manual: true
    });
    saveStore(item.storeKey, store);
    window.renderStatsMeciuri();
  };

  window.renderStatsMeciuri = function() {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    _pendingEntries = [];  /* reset index for manual settle buttons */

    /* compute rows live */
    var meciuriRows = getMeciuriRows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    var apexRows    = getApexRows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    var ml5Rows     = getMl5Rows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });

    /* update win/loss from finished matches */
    _autoCheck(meciuriRows, STORE_KEY, entryKey);
    _autoCheck(apexRows,    APEX_KEY,  apexKey);
    _autoCheck(ml5Rows,     ML5_KEY,   entryKey);

    /* re-fetch rows after potential autocheck updates */
    meciuriRows = getMeciuriRows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    apexRows    = getApexRows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    ml5Rows     = getMl5Rows().sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });

    var h = '<div style="padding:14px 12px 80px">';

    /* tab switcher */
    h += '<div style="display:flex;gap:8px;margin-bottom:16px;background:#0a0f1e;border-radius:14px;padding:5px">';
    [
      { key:'meciuri', label:'⚽ Meciuri', count: meciuriRows.length },
      { key:'apex',    label:'⚡ APEX',    count: apexRows.length    },
      { key:'ml5',     label:'🔬 ML5',     count: ml5Rows.length     }
    ].forEach(function(tab) {
      var active = _activeMonitorTab === tab.key;
      h += '<button onclick="window._monitorSwitchTab(\'' + tab.key + '\')" '
        + 'style="flex:1;padding:9px 8px;border-radius:10px;border:none;cursor:pointer;font-size:12px;font-weight:700;'
        + 'background:' + (active ? '#1e293b' : 'transparent') + ';'
        + 'color:' + (active ? '#e2e8f0' : '#475569') + ';transition:all .2s">'
        + tab.label
        + (tab.count ? ' <span style="font-size:10px;font-weight:600;color:' + (active?'#60a5fa':'#334155')
            + ';background:' + (active?'#1e3a5f':'#1e293b') + ';border-radius:5px;padding:1px 6px;margin-left:4px">'
            + tab.count + '</span>' : '')
        + '</button>';
    });
    h += '</div>';

    if (_activeMonitorTab === 'meciuri') {
      h += renderSummaryBlock(meciuriRows, 'window._monitorClearAll', 'MONITORIZARE MECIURI',
        '<div style="font-size:32px;margin-bottom:8px">📋</div>Mergi în Meciuri — meciurile afișate apar automat aici.',
        '#e2e8f0');
      h += renderDayGroup(meciuriRows, _dayOpen,     'window._monitorToggleDay', 'meciuri', STORE_KEY, entryKey);
    } else if (_activeMonitorTab === 'apex') {
      h += renderSummaryBlock(apexRows, 'window._apexClearAll', '⚡ MONITORIZARE APEX',
        '<div style="font-size:32px;margin-bottom:8px">⚡</div>Deschide APEX Neural Engine — pick-urile apar automat aici.',
        '#a78bfa');
      h += renderDayGroup(apexRows, _apexDayOpen, 'window._apexToggleDay',    'picks', APEX_KEY, apexKey);
    } else {
      h += renderSummaryBlock(ml5Rows, 'window._ml5ClearAll', '🔬 MONITORIZARE ML5',
        '<div style="font-size:32px;margin-bottom:8px">🔬</div>Deschide ML5 Analysis — pick-urile apar automat aici.',
        '#10b981');
      h += renderDayGroup(ml5Rows, _ml5DayOpen, 'window._ml5ToggleDay',    'picks', ML5_KEY, entryKey);
    }

    h += '</div>';
    root.innerHTML = h;
  };

  /* ══════════════════════════════════════════════════
     UI COMPONENTS
  ══════════════════════════════════════════════════ */

  function renderSummaryBlock(rows, clearFn, title, subtitle, accentColor) {
    var pending = 0, wins = 0, losses = 0, roiSum = 0;
    rows.forEach(function(e) {
      if      (e.status === 'win')  { wins++;   roiSum += (parseFloat(e.odds)||1) - 1; }
      else if (e.status === 'loss') { losses++;  roiSum -= 1; }
      else pending++;
    });
    var settled = wins + losses;
    var winRate = settled > 0 ? Math.round(wins/settled*100) : null;
    var roiPct  = settled > 0 ? (roiSum/settled*100).toFixed(1) : null;
    var roiPos  = roiPct !== null && parseFloat(roiPct) >= 0;
    var nDays   = Object.keys(rows.reduce(function(m,e){ m[(e.eventDate||'').slice(0,10)||'x']=1; return m; }, {})).length;

    var hasPat    = !!localStorage.getItem('veyra_github_pat');
    var syncLabel = hasPat ? '☁ Sincronizat' : '☁ Salvare repo';
    var syncBg    = hasPat ? '#14532d' : '#1e293b';
    var syncBord  = hasPat ? '#166534' : '#334155';
    var syncClr   = hasPat ? '#22c55e' : '#94a3b8';

    var h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
    h += '<div>';
    h += '<div style="font-size:13px;font-weight:700;color:' + accentColor + ';letter-spacing:.4px">' + title + '</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">' + rows.length + ' picks · ' + nDays + ' zile · auto-update</div>';
    h += '</div>';
    h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">';
    h += '<button id="veyra-sync-status" onclick="window._setMonitorToken()" style="font-size:10px;font-weight:600;color:' + syncClr + ';background:' + syncBg + ';border:1px solid ' + syncBord + ';border-radius:7px;padding:4px 10px;cursor:pointer">' + syncLabel + '</button>';
    if (rows.length) h += '<button onclick="' + clearFn + '()" style="background:none;border:1px solid #1e293b;color:#475569;border-radius:8px;padding:5px 10px;font-size:10px;cursor:pointer">Resetează</button>';
    h += '</div>';
    h += '</div>';

    h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px">';
    [
      { val: pending, label:'AȘTEPTARE', color:'#94a3b8' },
      { val: wins,    label:'WIN',       color:'#22c55e' },
      { val: losses,  label:'LOSS',      color:'#ef4444' },
      { val: winRate !== null ? winRate+'%' : '—', label:'WIN RATE', color:'#60a5fa' },
      { val: roiPct  !== null ? (roiPos?'+':'')+roiPct+'%' : '—', label:'ROI',
        color: roiPct!==null ? (roiPos?'#22c55e':'#ef4444') : '#475569' }
    ].forEach(function(c) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:9px 3px;text-align:center">';
      h += '<div style="font-size:' + (String(c.val).length>4?'13':'20') + 'px;font-weight:800;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      h += '<div style="font-size:8px;color:#475569;margin-top:3px;letter-spacing:.4px">' + c.label + '</div></div>';
    });
    h += '</div>';

    if (!rows.length) {
      h += '<div style="text-align:center;padding:32px 0;color:#334155;font-size:12px">' + subtitle + '</div>';
    }
    return h;
  }

  function renderDayGroup(rows, dayOpen, toggleFn, unit, storeKey, keyFn) {
    var dayMap = {}, dayOrder = [];
    rows.forEach(function(e) {
      var dk = (e.eventDate||'').slice(0,10) || 'necunoscut';
      if (!dayMap[dk]) { dayMap[dk] = []; dayOrder.push(dk); }
      dayMap[dk].push(e);
    });
    dayOrder.sort();
    dayOrder.forEach(function(dk) { if (dayOpen[dk] === undefined) dayOpen[dk] = false; });

    var h = '';
    dayOrder.forEach(function(dayKey) {
      var dr   = dayMap[dayKey];
      var isOp = !!dayOpen[dayKey];
      var lbl  = '—';
      if (dayKey !== 'necunoscut') {
        var dt = new Date(dayKey + 'T12:00:00');
        if (!isNaN(dt)) {
          var today = new Date(); today.setHours(0,0,0,0);
          var tom   = new Date(today); tom.setDate(today.getDate()+1);
          if      (dt.getTime() === today.getTime()) lbl = 'Azi · '   + dt.toLocaleDateString('ro-RO',{day:'2-digit',month:'short'});
          else if (dt.getTime() === tom.getTime())   lbl = 'Mâine · ' + dt.toLocaleDateString('ro-RO',{day:'2-digit',month:'short'});
          else lbl = dt.toLocaleDateString('ro-RO',{weekday:'short',day:'2-digit',month:'short'});
        }
      }
      var dW=0, dL=0, dP=0;
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
        dr.forEach(function(e) {
          var color   = MKT_COLOR[e.bestBet] || '#64748b';
          var label   = MKT_LABEL[e.bestBet] || e.bestBet || '';
          var odds    = e.odds ? parseFloat(e.odds).toFixed(2) : '—';
          var sc      = e.smartScore || 0;
          var st      = e.status || 'pending';
          var timeStr = '';
          if (e.eventDate) { var edt = new Date(e.eventDate); if (!isNaN(edt)) timeStr = edt.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}); }
          var badge, cardBorder;
          if (st === 'win') {
            cardBorder = '#166534';
            badge = '<span style="font-size:11px;font-weight:700;background:#14532d;color:#22c55e;border-radius:7px;padding:3px 10px">✓ WIN'  + (e.homeScore!=null?' · '+e.homeScore+'-'+e.awayScore:'') + '</span>';
          } else if (st === 'loss') {
            cardBorder = '#7f1d1d';
            badge = '<span style="font-size:11px;font-weight:700;background:#450a0a;color:#ef4444;border-radius:7px;padding:3px 10px">✗ LOSS' + (e.homeScore!=null?' · '+e.homeScore+'-'+e.awayScore:'') + '</span>';
          } else {
            cardBorder = '#1e293b';
            var idx = _pendingEntries.length;
            var eKey = keyFn ? (keyFn(e) || (e.home+'|'+e.away+'|'+e.bestBet)) : (e.home+'|'+e.away+'|'+e.bestBet);
            _pendingEntries.push({ storeKey: storeKey, key: eKey, entry: e });
            badge = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
              + '<span style="font-size:11px;color:#64748b;background:#1e293b;border-radius:7px;padding:3px 9px">⏳ Așteptare</span>'
              + '<button onclick="window._manualSettle(' + idx + ',\'win\')" style="font-size:10px;font-weight:700;color:#22c55e;background:#14532d;border:1px solid #166534;border-radius:6px;padding:2px 9px;cursor:pointer">✓ WIN</button>'
              + '<button onclick="window._manualSettle(' + idx + ',\'loss\')" style="font-size:10px;font-weight:700;color:#ef4444;background:#450a0a;border:1px solid #7f1d1d;border-radius:6px;padding:2px 9px;cursor:pointer">✗ LOSS</button>'
              + '</div>';
          }
          h += '<div style="background:#0a0f1e;border:1px solid ' + cardBorder + ';border-radius:12px;padding:11px 12px">';
          h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
          h += '<span style="font-size:12px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
            + (e.home||'') + ' <span style="color:#475569;font-weight:400">vs</span> ' + (e.away||'') + '</span>';
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

  /* ══════════════════════════════════════════════════
     HOOKS — trigger re-render when source data changes
  ══════════════════════════════════════════════════ */

  function _triggerUpdate() {
    var root = document.getElementById('tab-stats-meciuri');
    if (root && root.offsetParent !== null) window.renderStatsMeciuri();
  }

  function hookRender() {
    if (window.__statsMeciuriHooked) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__statsMeciuriHooked = true;
    var orig = window.renderMatches;
    window.renderMatches = function() {
      var r = orig.apply(this, arguments);
      setTimeout(_triggerUpdate, 250);
      return r;
    };
  }

  function hookSmartBet() {
    if (window.__apexMonitorHooked) return;
    if (typeof window.renderSmartBet !== 'function') return;
    window.__apexMonitorHooked = true;
    var orig = window.renderSmartBet;
    window.renderSmartBet = function() {
      var r = orig.apply(this, arguments);
      setTimeout(_triggerUpdate, 300);
      return r;
    };
  }

  function hookMl5() {
    if (window.__ml5MonitorHooked) return;
    if (typeof window.renderML5Analysis !== 'function') return;
    window.__ml5MonitorHooked = true;
    var orig = window.renderML5Analysis;
    window.renderML5Analysis = function() {
      var r = orig.apply(this, arguments);
      setTimeout(_triggerUpdate, 300);
      return r;
    };
  }

  /* ── periodic re-fetch: every 5 min, refresh predictions and auto-resolve ── */
  function _periodicFetch() {
    if (!window.fetch) return;
    var t = Date.now();
    Promise.all([
      fetch('data/predictions.json?_t='    + t, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
      fetch('data/recent_results.json?_t=' + t, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
    ]).then(function(results) {
      var predData    = results[0];
      var recentData  = results[1];

      var preds = predData  ? (Array.isArray(predData)  ? predData  : (predData.results  || [])) : [];
      var recent = recentData ? (Array.isArray(recentData) ? recentData : []) : [];

      /* wrap recent_results entries to match __RAW_PREDICTIONS format */
      var recentWrapped = recent.map(function(r) { return { event: r }; });

      var merged = preds.concat(recentWrapped);
      if (!merged.length) return;
      window.__RAW_PREDICTIONS = merged;

      var before = JSON.stringify([loadStore(STORE_KEY), loadStore(APEX_KEY), loadStore(ML5_KEY)]);
      _autoCheck(getMeciuriRows(), STORE_KEY, entryKey);
      _autoCheck(getApexRows(),    APEX_KEY,  apexKey);
      _autoCheck(getMl5Rows(),     ML5_KEY,   entryKey);
      var after = JSON.stringify([loadStore(STORE_KEY), loadStore(APEX_KEY), loadStore(ML5_KEY)]);
      if (before !== after) window.renderStatsMeciuri();
    });
  }

  function boot() {
    _recoverMissingPicks();
    _repoLoadAndMerge(function() {
      window.renderStatsMeciuri && window.renderStatsMeciuri();
    });
    hookRender(); hookSmartBet(); hookMl5();
    var n = 0, iv = setInterval(function() {
      hookRender(); hookSmartBet(); hookMl5();
      if ((window.__statsMeciuriHooked && window.__apexMonitorHooked && window.__ml5MonitorHooked) || ++n > 30)
        clearInterval(iv);
    }, 500);
    setInterval(_periodicFetch, 5 * 60 * 1000);
  }

  /* one-time recovery for picks that disappeared before snapshot fix */
  function _recoverMissingPicks() {
    var ml5 = loadStore(ML5_KEY);
    if (!ml5['209500|dc1x']) {
      ml5['209500|dc1x'] = {
        eventId: '209500', home: 'Difaâ Hassani El-Jadidi', away: 'Olympique Dcheira',
        league: 'Botola Pro', bestBet: 'dc1x', odds: 1.29, smartScore: 0,
        eventDate: '2026-06-12', status: 'win', homeScore: 2, awayScore: 2,
        resolvedAt: '2026-06-12T21:00:00.000Z', manual: true
      };
      saveStoreLocal(ML5_KEY, ml5);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
