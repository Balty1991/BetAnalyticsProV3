(function () {
  'use strict';

  /*
   * ARHITECTURA v2 (manual-save):
   *   Picks disponibile = calculat LIVE din datele curente, NU se auto-salvează
   *   Istoric = DOAR picks salvate manual prin butonul "Salvează"
   *   win/loss = stocat în localStorage, auto-rezolvat după meci
   */

  var STORE_KEY = 'veyra_monitor_v4';
  var APEX_KEY  = 'veyra_apex_monitor_v2';
  var ML5_KEY   = 'veyra_ml5_monitor_v2';

  var _REPO  = 'Balty1991/VEYRA';
  var _RFILE = 'data/monitor_stats.json';
  var _syncT = null;

  var MKT_LABEL = {
    over25:'Over 2.5G', under35:'Under 3.5G', btts:'BTTS',
    over15:'Over 1.5G', dc1x:'DC 1X', dcx2:'DC X2', dc12:'DC 12',
    homewin:'1 (Home Win)', awaywin:'2 (Away Win)', draw:'X (Egal)',
    homeWin:'1 (Home Win)', awayWin:'2 (Away Win)',
    home_win:'1 (Home Win)', away_win:'2 (Away Win)'
  };
  var MKT_COLOR = {
    over25:'#f59e0b', under35:'#3b82f6', btts:'#ec4899',
    over15:'#10b981', dc1x:'#8b5cf6', dcx2:'#06b6d4', dc12:'#f97316',
    homewin:'#22c55e', awaywin:'#ef4444', draw:'#94a3b8',
    homeWin:'#22c55e', awayWin:'#ef4444',
    home_win:'#22c55e', away_win:'#ef4444'
  };

  /* mirrors mktKey() in veyra_apex_engine.js — keep in sync */
  function normalizeApexMkt(raw) {
    var r = String(raw||'').toLowerCase().replace(/\s+/g,'');
    if (/over1\.?5|over15/.test(r))   return 'over15';
    if (/over2\.?5|over25/.test(r))   return 'over25';
    if (/under3\.?5|under35/.test(r)) return 'under35';
    if (/btts|bothteams/.test(r))     return 'btts';
    if (/home_win|homewin/.test(r))   return 'home_win';
    if (/away_win|awaywin/.test(r))   return 'away_win';
    if (/draw/.test(r))               return 'draw';
    return r || 'unknown';
  }

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
    /* Use _mk if present (already normalized by APEX engine); otherwise normalize raw field */
    var rawMkt = p.marketKey || p.market_key || p.market || '';
    var mk = p._mk || (rawMkt ? normalizeApexMkt(rawMkt) : '');
    if (!mk || mk === 'unknown') return null;
    var eid = String(p.event_id != null ? p.event_id : (p.eventId != null ? p.eventId : '')).trim();
    if (eid && eid !== '0') return eid + '|' + mk;
    var h = String(p.home || '').toLowerCase().trim();
    var a = String(p.away || '').toLowerCase().trim();
    if (h && a) return h + '|' + a + '|' + String(p.event_date || p.eventDate || '').slice(0,10) + '|' + mk;
    return null;
  }

  function evalOutcome(betKey, hs, as) {
    if (hs == null || as == null) return 'pending';
    var h = Number(hs), a = Number(as), tot = h + a;
    if (betKey === 'over15')  return tot >= 2 ? 'win' : 'loss';
    if (betKey === 'over25')  return tot >= 3 ? 'win' : 'loss';
    if (betKey === 'over35')  return tot >= 4 ? 'win' : 'loss';
    if (betKey === 'under25') return tot <= 2 ? 'win' : 'loss';
    if (betKey === 'under35') return tot <= 3 ? 'win' : 'loss';
    if (betKey === 'btts')    return (h > 0 && a > 0) ? 'win' : 'loss';
    if (betKey === 'homewin' || betKey === 'homeWin' || betKey === 'home_win') return h > a ? 'win' : 'loss';
    if (betKey === 'awaywin' || betKey === 'awayWin' || betKey === 'away_win') return a > h ? 'win' : 'loss';
    if (betKey === 'draw')    return h === a ? 'win' : 'loss';
    if (betKey === 'dc1x')    return h >= a ? 'win' : 'loss';
    if (betKey === 'dcx2')    return a >= h ? 'win' : 'loss';
    if (betKey === 'dc12')    return h !== a ? 'win' : 'loss';
    return 'pending';
  }

  /* ══════════════════════════════════════════════════
     LIVE POOLS — returnează datele live (nesalvate)
  ══════════════════════════════════════════════════ */

  function _getMeciuriLivePool() {
    var pool = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    if (!pool.length) {
      try {
        var snap = JSON.parse(localStorage.getItem('veyra_display_snapshot_v2') || 'null');
        if (snap && Array.isArray(snap.matches) && snap.matches.length) pool = snap.matches;
      } catch(e) {}
    }
    return pool;
  }

  function _getApexLivePool() {
    var analysis = window.SMARTBET_LAST_ANALYSIS;
    if (!analysis && typeof window.getSmartBetAnalysis === 'function') {
      try { analysis = window.getSmartBetAnalysis(); } catch(e) {}
    }
    return analysis && Array.isArray(analysis.pool) ? analysis.pool.filter(Boolean) : [];
  }

  function _getMl5LivePool() {
    var _now = Date.now();
    var all  = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    return all.filter(function(m) {
      if (!m || !m.isEnriched || !m.bestBet) return false;
      if (m.date) { var _d = new Date(m.date); if (isFinite(_d.getTime()) && _d.getTime() < _now - 2*3600*1000) return false; }
      return true;
    });
  }

  /* Returnează rows din STORE (manual saved), fara auto-save */
  function _getStoredRows(storeKey) {
    var store = loadStore(storeKey);
    return Object.keys(store).map(function(k) {
      var e = store[k];
      return e ? Object.assign({}, e, { _storeKey: storeKey, _key: k }) : null;
    }).filter(Boolean);
  }

  /* Returnează picks din live pool care NU sunt inca salvate */
  function _getAvailablePicks(livePool, storeKey, keyFn, shapeFn) {
    var store = loadStore(storeKey);
    var result = [];
    livePool.forEach(function(item) {
      var k = keyFn(item);
      if (!k) return;
      var shaped = shapeFn(item);
      shaped._key = k;
      shaped._alreadySaved = !!store[k];
      result.push(shaped);
    });
    return result;
  }

  /* ══════════════════════════════════════════════════
     SAVE / DELETE / SETTLE — acțiuni manuale
  ══════════════════════════════════════════════════ */

  window._savePick = function(storeKey, encodedPick) {
    var pick;
    try { pick = JSON.parse(decodeURIComponent(encodedPick)); } catch(e) { return; }
    var k = pick._key;
    if (!k) return;
    var store = loadStore(storeKey);
    if (store[k]) {
      if (typeof toast === 'function') toast('⚠️ Meci deja salvat în istoric!', 'warn');
      return;
    }
    var entry = Object.assign({}, pick, { status: 'pending', homeScore: null, awayScore: null, resolvedAt: null });
    delete entry._key;
    delete entry._alreadySaved;
    delete entry._storeKey;
    store[k] = entry;
    saveStore(storeKey, store);
    if (typeof toast === 'function') toast('💾 ' + (pick.home||'Meci') + ' salvat!', 'ok');
    window.renderStatsMeciuri();
  };

  window._deletePick = function(storeKey, k) {
    var store = loadStore(storeKey);
    delete store[k];
    saveStore(storeKey, store);
    window.renderStatsMeciuri();
  };

  var _pendingEntries = [];

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

  window._monitorSwitchTab = function(t)  { _activeMonitorTab = t; window.renderStatsMeciuri(); };
  window._monitorToggleDay = function(dk) { _dayOpen[dk]     = !_dayOpen[dk];     window.renderStatsMeciuri(); };
  window._apexToggleDay    = function(dk) { _apexDayOpen[dk] = !_apexDayOpen[dk]; window.renderStatsMeciuri(); };
  window._ml5ToggleDay     = function(dk) { _ml5DayOpen[dk]  = !_ml5DayOpen[dk];  window.renderStatsMeciuri(); };
  window._monitorClearAll  = function()   { saveStore(STORE_KEY, {}); window.renderStatsMeciuri(); };
  window._apexClearAll     = function()   { saveStore(APEX_KEY,  {}); window.renderStatsMeciuri(); };
  window._ml5ClearAll      = function()   { saveStore(ML5_KEY,   {}); window.renderStatsMeciuri(); };

  /* ══════════════════════════════════════════════════
     REGISTRY GLOBAL — buton Salvează pe carduri externe
  ══════════════════════════════════════════════════ */

  var _monRegCounter = 0;
  window._VEYRA_MON_REG = {};

  function _monReg(storeKey, k, home, away, eid, mkt, date, odds, score, league) {
    if (!k) return null;
    var isSaved = !!loadStore(storeKey)[k];
    var numId = ++_monRegCounter;
    window._VEYRA_MON_REG[numId] = {
      storeKey: storeKey, key: k, isSaved: isSaved,
      entry: {
        eventId: String(eid != null ? eid : ''), home: String(home||''), away: String(away||''),
        league: String(league||''), bestBet: mkt, odds: Number(odds||0),
        smartScore: Number(score||0), eventDate: String(date||'')
      }
    };
    return { id: numId, isSaved: isSaved };
  }

  /* Store-specific reg functions — use same key functions as Statistics tab */
  window._veyraMonRegMeciuri = function(m) {
    var k = entryKey(m);
    var eid = m.eventId != null ? m.eventId : (m.event_id != null ? m.event_id : '');
    return _monReg(STORE_KEY, k, m.home, m.away, eid, betType(m), matchDate(m), betOdds(m), m.smartScore, m.league);
  };

  window._veyraMonRegML5 = function(m) {
    var k = entryKey(m);
    var eid = m.eventId != null ? m.eventId : (m.event_id != null ? m.event_id : '');
    return _monReg(ML5_KEY, k, m.home, m.away, eid, betType(m), matchDate(m), betOdds(m), m.smartScore, m.league);
  };

  window._veyraMonRegApex = function(s, mk) {
    if (!mk) return null;
    var proxy = { marketKey: mk, event_id: s.event_id, eventId: s.eventId,
                  home: s.home||s.home_team, away: s.away||s.away_team, event_date: s.event_date };
    var k = apexKey(proxy);
    var eid = s.event_id != null ? s.event_id : (s.eventId != null ? s.eventId : '');
    return _monReg(APEX_KEY, k, s.home||s.home_team, s.away||s.away_team, eid, mk, s.event_date, s._odds, s._apexScore, s.league||s.league_name);
  };

  /* Legacy generic reg (kept for backward compat) */
  window._veyraMonReg = function(storeKey, home, away, eid, mkt, date, odds, score, league) {
    if (!mkt) return null;
    var eidStr = String(eid != null ? eid : '').trim();
    var k;
    if (eidStr && eidStr !== '0' && eidStr !== 'undefined' && eidStr !== 'null') {
      k = eidStr + '|' + mkt;
    } else {
      var h = String(home||'').toLowerCase().trim();
      var a = String(away||'').toLowerCase().trim();
      if (!h || !a) return null;
      k = h + '|' + a + '|' + String(date||'').slice(0,10) + '|' + mkt;
    }
    return _monReg(storeKey, k, home, away, eidStr, mkt, date, odds, score, league);
  };

  window._veyraMonSave = function(numId) {
    var r = window._VEYRA_MON_REG[numId];
    if (!r) return;
    var store = loadStore(r.storeKey);
    if (store[r.key]) {
      if (typeof toast === 'function') toast('⚠️ Deja salvat!', 'warn');
      return;
    }
    store[r.key] = Object.assign({}, r.entry, {status:'pending', homeScore:null, awayScore:null, resolvedAt:null});
    saveStore(r.storeKey, store);
    if (typeof toast === 'function') toast('💾 '+(r.entry.home||'Pick')+' salvat!', 'ok');
    try {
      var btn = document.querySelector('[data-mon-id="'+numId+'"]');
      if (btn) { btn.textContent = '✓ Salvat'; btn.disabled = true; btn.style.color = '#22c55e'; btn.style.opacity = '.6'; }
    } catch(e) {}
    _triggerUpdate();
  };

  /* ══════════════════════════════════════════════════
     AUTO-CHECK — updatează win/loss din scoruri reale
  ══════════════════════════════════════════════════ */

  function _autoCheck(storeKey) {
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

  var _dayOpen          = {};
  var _apexDayOpen      = {};
  var _ml5DayOpen       = {};
  var _activeMonitorTab = 'meciuri';
  var _availableOpen    = { meciuri: false, apex: false, ml5: false };

  window._toggleAvailable = function(tab) {
    _availableOpen[tab] = !_availableOpen[tab];
    window.renderStatsMeciuri();
  };

  window.renderStatsMeciuri = function() {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    _pendingEntries = [];

    /* auto-check win/loss pentru picks deja salvate */
    _autoCheck(STORE_KEY);
    _autoCheck(APEX_KEY);
    _autoCheck(ML5_KEY);

    /* stored rows (manual saved) */
    var meciuriRows = _getStoredRows(STORE_KEY).sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    var apexRows    = _getStoredRows(APEX_KEY).sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });
    var ml5Rows     = _getStoredRows(ML5_KEY).sort(function(a,b){ return new Date(a.eventDate)-new Date(b.eventDate); });

    /* available picks (live, not yet saved) */
    var meciuriAvail = _getAvailablePicks(_getMeciuriLivePool(), STORE_KEY, entryKey,
      function(m){ return { eventId:String(m.eventId||m.event_id||''), home:m.home||'', away:m.away||'', league:m.league||'', bestBet:betType(m), odds:betOdds(m), smartScore:m.smartScore||0, eventDate:matchDate(m) }; });
    var apexAvail    = _getAvailablePicks(_getApexLivePool(), APEX_KEY, apexKey,
      function(p){ var rawMkt=p.marketKey||p.market_key||p.market||''; return { eventId:String(p.event_id!=null?p.event_id:(p.eventId!=null?p.eventId:'')), home:p.home||p.home_team||'', away:p.away||p.away_team||'', league:p.league||'', bestBet:p._mk||(rawMkt?normalizeApexMkt(rawMkt):''), odds:p._odds||p.displayOdds||p.book_odds||p.odds||null, smartScore:p._apexScore||p.smartScore||p.score||0, eventDate:p.event_date||p.eventDate||'' }; });
    var ml5Avail     = _getAvailablePicks(_getMl5LivePool(), ML5_KEY, entryKey,
      function(m){ return { eventId:String(m.eventId||m.event_id||''), home:m.home||'', away:m.away||'', league:m.league||'', bestBet:betType(m), odds:betOdds(m), smartScore:m.smartScore||0, eventDate:matchDate(m) }; });

    var curRows  = _activeMonitorTab === 'meciuri' ? meciuriRows  : (_activeMonitorTab === 'apex' ? apexRows  : ml5Rows);
    var curAvail = _activeMonitorTab === 'meciuri' ? meciuriAvail : (_activeMonitorTab === 'apex' ? apexAvail : ml5Avail);
    var curStore = _activeMonitorTab === 'meciuri' ? STORE_KEY    : (_activeMonitorTab === 'apex' ? APEX_KEY  : ML5_KEY);
    var curClear = _activeMonitorTab === 'meciuri' ? 'window._monitorClearAll' : (_activeMonitorTab === 'apex' ? 'window._apexClearAll' : 'window._ml5ClearAll');
    var curToggle= _activeMonitorTab === 'meciuri' ? 'window._monitorToggleDay' : (_activeMonitorTab === 'apex' ? 'window._apexToggleDay' : 'window._ml5ToggleDay');
    var curDayOpen = _activeMonitorTab === 'meciuri' ? _dayOpen : (_activeMonitorTab === 'apex' ? _apexDayOpen : _ml5DayOpen);
    var curKeyFn = _activeMonitorTab === 'apex' ? apexKey : entryKey;
    var curTabLabel = _activeMonitorTab === 'meciuri' ? '⚽ MECIURI' : (_activeMonitorTab === 'apex' ? '⚡ APEX' : '🔬 ML5');
    var curAccent = _activeMonitorTab === 'meciuri' ? '#e2e8f0' : (_activeMonitorTab === 'apex' ? '#a78bfa' : '#10b981');

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

    /* stats summary */
    h += renderSummaryBlock(curRows, curClear, curTabLabel, curAccent);

    /* picks disponibile */
    h += renderAvailableSection(curAvail, curStore, _activeMonitorTab);

    /* istoric salvat */
    if (curRows.length) {
      h += '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:14px 0 8px">📊 Istoric salvat</div>';
      h += renderDayGroup(curRows, curDayOpen, curToggle, _activeMonitorTab === 'meciuri' ? 'meciuri' : 'picks', curStore, curKeyFn);
    }

    h += '</div>';
    root.innerHTML = h;
  };

  /* ══════════════════════════════════════════════════
     UI COMPONENTS
  ══════════════════════════════════════════════════ */

  function renderSummaryBlock(rows, clearFn, title, accentColor) {
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
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">' + rows.length + ' salvate · ' + nDays + ' zile · manual-save</div>';
    h += '</div>';
    h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">';
    h += '<button id="veyra-sync-status" onclick="window._setMonitorToken()" style="font-size:10px;font-weight:600;color:' + syncClr + ';background:' + syncBg + ';border:1px solid ' + syncBord + ';border-radius:7px;padding:4px 10px;cursor:pointer">' + syncLabel + '</button>';
    if (rows.length) h += '<button onclick="' + clearFn + '()" style="background:none;border:1px solid #1e293b;color:#ef4444;border-radius:8px;padding:5px 10px;font-size:10px;cursor:pointer">🗑 Resetează</button>';
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
    return h;
  }

  function renderAvailableSection(avail, storeKey, tabKey) {
    if (!avail.length) return '';
    var unsaved = avail.filter(function(p){ return !p._alreadySaved; });
    var isOpen  = !!_availableOpen[tabKey];

    var h = '<div style="margin-bottom:12px">';
    h += '<button onclick="window._toggleAvailable(\'' + tabKey + '\')" '
      + 'style="width:100%;background:linear-gradient(135deg,rgba(43,229,197,.07),rgba(139,92,246,.05));border:1px solid rgba(43,229,197,.2);border-radius:12px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-align:left;margin-bottom:' + (isOpen?'6':'0') + 'px">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<span style="font-size:12px;font-weight:700;color:#2BE5C5">📋 Picks disponibile</span>'
      + '<span style="font-size:11px;color:#475569">' + unsaved.length + ' nesalvate</span>'
      + '</div>'
      + '<span style="font-size:14px;color:#475569">' + (isOpen?'▲':'▼') + '</span>'
      + '</button>';

    if (isOpen) {
      h += '<div style="display:flex;flex-direction:column;gap:6px">';
      avail.forEach(function(p) {
        var color  = MKT_COLOR[p.bestBet] || '#64748b';
        var label  = MKT_LABEL[p.bestBet] || p.bestBet || '';
        var odds   = p.odds ? parseFloat(p.odds).toFixed(2) : '—';
        var timeStr = '';
        if (p.eventDate) { var edt = new Date(p.eventDate); if (!isNaN(edt)) timeStr = edt.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}); }
        var alreadySaved = p._alreadySaved;

        /* encode pick for onclick */
        var pickEncoded = encodeURIComponent(JSON.stringify(p));

        h += '<div style="background:#0a0f1e;border:1px solid ' + (alreadySaved?'rgba(34,197,94,.2)':'#1e293b') + ';border-radius:12px;padding:11px 12px">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">';
        h += '<span style="font-size:12px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + (p.home||'') + ' <span style="color:#475569;font-weight:400">vs</span> ' + (p.away||'') + '</span>';
        h += '<span style="font-size:10px;color:#64748b;white-space:nowrap;margin-left:8px">' + timeStr + '</span>';
        h += '</div>';
        h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">';
        if (p.league) h += '<span style="font-size:10px;color:#475569">' + p.league + '</span>';
        if (label)    h += '<span style="font-size:10px;font-weight:700;color:' + color + ';background:#1e293b;border-radius:5px;padding:2px 7px">' + label + '</span>';
        h += '<span style="font-size:11px;font-weight:700;color:#fbbf24">@ ' + odds + '</span>';
        if (p.smartScore) h += '<span style="font-size:10px;color:#475569">SS:' + p.smartScore + '</span>';
        h += '</div>';
        if (alreadySaved) {
          h += '<span style="font-size:10px;color:#22c55e;font-weight:600">✓ Deja în istoric</span>';
        } else {
          h += '<button onclick="window._savePick(\'' + storeKey + '\',\'' + pickEncoded.replace(/'/g,"\\'") + '\')" '
            + 'style="width:100%;padding:7px;border-radius:8px;border:1px solid rgba(43,229,197,.4);background:rgba(43,229,197,.08);color:#2BE5C5;font-size:11px;font-weight:700;cursor:pointer">'
            + '💾 Salvează în istoric</button>';
        }
        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  function renderDayGroup(rows, dayOpen, toggleFn, unit, storeKey, keyFn) {
    var dayMap = {}, dayOrder = [];
    rows.forEach(function(e) {
      var dk = (e.eventDate||'').slice(0,10) || 'necunoscut';
      if (!dayMap[dk]) { dayMap[dk] = []; dayOrder.push(dk); }
      dayMap[dk].push(e);
    });
    dayOrder.sort().reverse(); /* cel mai recent primul */
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

          var eKey = e._key || (keyFn ? (keyFn(e) || (e.home+'|'+e.away+'|'+e.bestBet)) : (e.home+'|'+e.away+'|'+e.bestBet));
          var badge, cardBorder;
          if (st === 'win') {
            cardBorder = '#166534';
            badge = '<div style="display:flex;align-items:center;justify-content:space-between">'
              + '<span style="font-size:11px;font-weight:700;background:#14532d;color:#22c55e;border-radius:7px;padding:3px 10px">✓ WIN' + (e.homeScore!=null?' · '+e.homeScore+'-'+e.awayScore:'') + '</span>'
              + '<button onclick="window._deletePick(\'' + storeKey + '\',\'' + eKey.replace(/'/g,"\\'") + '\')" style="font-size:10px;padding:2px 7px;border-radius:6px;border:1px solid #1e293b;background:transparent;color:#475569;cursor:pointer">🗑</button>'
              + '</div>';
          } else if (st === 'loss') {
            cardBorder = '#7f1d1d';
            badge = '<div style="display:flex;align-items:center;justify-content:space-between">'
              + '<span style="font-size:11px;font-weight:700;background:#450a0a;color:#ef4444;border-radius:7px;padding:3px 10px">✗ LOSS' + (e.homeScore!=null?' · '+e.homeScore+'-'+e.awayScore:'') + '</span>'
              + '<button onclick="window._deletePick(\'' + storeKey + '\',\'' + eKey.replace(/'/g,"\\'") + '\')" style="font-size:10px;padding:2px 7px;border-radius:6px;border:1px solid #1e293b;background:transparent;color:#475569;cursor:pointer">🗑</button>'
              + '</div>';
          } else {
            cardBorder = '#1e293b';
            var idx = _pendingEntries.length;
            _pendingEntries.push({ storeKey: storeKey, key: eKey, entry: e });
            badge = '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
              + '<span style="font-size:11px;color:#64748b;background:#1e293b;border-radius:7px;padding:3px 9px">⏳ Așteptare</span>'
              + '<button onclick="window._manualSettle(' + idx + ',\'win\')" style="font-size:10px;font-weight:700;color:#22c55e;background:#14532d;border:1px solid #166534;border-radius:6px;padding:2px 9px;cursor:pointer">✓ WIN</button>'
              + '<button onclick="window._manualSettle(' + idx + ',\'loss\')" style="font-size:10px;font-weight:700;color:#ef4444;background:#450a0a;border:1px solid #7f1d1d;border-radius:6px;padding:2px 9px;cursor:pointer">✗ LOSS</button>'
              + '<button onclick="window._deletePick(\'' + storeKey + '\',\'' + eKey.replace(/'/g,"\\'") + '\')" style="font-size:10px;padding:2px 7px;border-radius:6px;border:1px solid #1e293b;background:transparent;color:#475569;cursor:pointer;margin-left:auto">🗑</button>'
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
     HOOKS
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

  function _periodicFetch() {
    if (!window.fetch) return;
    var t = Date.now();
    Promise.all([
      fetch('data/predictions.json?_t='    + t, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
      fetch('data/recent_results.json?_t=' + t, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
    ]).then(function(results) {
      var preds  = results[0] ? (Array.isArray(results[0]) ? results[0] : (results[0].results||[])) : [];
      var recent = results[1] ? (Array.isArray(results[1]) ? results[1] : []) : [];
      var merged = preds.concat(recent.map(function(r){ return { event: r }; }));
      if (!merged.length) return;
      window.__RAW_PREDICTIONS = merged;
      var before = JSON.stringify([loadStore(STORE_KEY), loadStore(APEX_KEY), loadStore(ML5_KEY)]);
      _autoCheck(STORE_KEY); _autoCheck(APEX_KEY); _autoCheck(ML5_KEY);
      var after = JSON.stringify([loadStore(STORE_KEY), loadStore(APEX_KEY), loadStore(ML5_KEY)]);
      if (before !== after) _triggerUpdate();
      // Also check ML5 accumulator bilete when fresh results arrive
      try { if (typeof window.autoCheckML5AccumResults === 'function') window.autoCheckML5AccumResults(); } catch(e) {}
      try { if (typeof window.autoCheckMotorAIResults === 'function') window.autoCheckMotorAIResults(); } catch(e) {}
    });
  }

  function boot() {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
