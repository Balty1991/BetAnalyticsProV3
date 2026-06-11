(function () {
  'use strict';

  var STORE_KEY = 'veyra_monitor_v2';

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
  function entryKey(m)   { var k = String(m.eventId || m.event_id || '') + '|' + betType(m); return (k === '|' || !m.eventId) ? null : k; }

  /* ── get source matches (filtered cache, or fallback to ALL_MATCHES eligible) ── */
  function getSourceMatches() {
    var fc = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    if (fc.length) return fc;
    /* fallback: all eligible matches from ALL_MATCHES */
    var all = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    return all.filter(function (m) {
      if (!m || !m.eventId) return false;
      var bt = betType(m);
      if (!bt) return false;
      if (typeof window.passesSelectionFilter === 'function') return window.passesSelectionFilter(m);
      return m.analysisState === 'ELIGIBLE';
    });
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

  /* ── render ── */
  window.renderStatsMeciuri = function () {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    syncFromSource();
    autoCheckResults();

    var store = load();
    var rows  = Object.values(store).sort(function (a, b) {
      return new Date(b.addedAt) - new Date(a.addedAt);
    });

    var pending = 0, wins = 0, losses = 0, roiSum = 0;
    rows.forEach(function (e) {
      if      (e.status === 'win')  { wins++;   roiSum += (parseFloat(e.odds) || 1) - 1; }
      else if (e.status === 'loss') { losses++;  roiSum -= 1; }
      else pending++;
    });
    var settled = wins + losses;
    var winRate = settled > 0 ? Math.round(wins / settled * 100) : null;
    var roiPct  = settled > 0 ? (roiSum / settled * 100).toFixed(1) : null;
    var roiPos  = roiPct !== null && parseFloat(roiPct) >= 0;

    var h = '<div style="padding:14px 12px 80px">';

    /* header */
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
    h += '<div><div style="font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.4px">MONITORIZARE MECIURI</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">' + rows.length + ' meciuri urmărite · actualizare automată</div></div>';
    if (rows.length) {
      h += '<button onclick="window._monitorClearAll&&window._monitorClearAll()" '
        + 'style="background:none;border:1px solid #1e293b;color:#475569;border-radius:8px;padding:5px 10px;font-size:10px;cursor:pointer">Resetează</button>';
    }
    h += '</div>';

    /* summary */
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">';
    [
      { val: pending, label: 'AȘTEPTARE', color: '#94a3b8' },
      { val: wins,    label: 'WIN',       color: '#22c55e' },
      { val: losses,  label: 'LOSS',      color: '#ef4444' },
      { val: winRate !== null ? winRate + '%' : '—', label: 'WIN RATE', color: '#60a5fa' }
    ].forEach(function (c) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:10px 4px;text-align:center">';
      h += '<div style="font-size:22px;font-weight:800;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      h += '<div style="font-size:9px;color:#475569;margin-top:3px;letter-spacing:.5px">' + c.label + '</div></div>';
    });
    h += '</div>';

    /* ROI */
    if (roiPct !== null) {
      h += '<div style="background:#0f172a;border:1px solid ' + (roiPos ? '#166534' : '#7f1d1d') + ';border-radius:12px;'
        + 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
      h += '<div><div style="font-size:12px;color:#64748b;font-weight:600">ROI</div>'
        + '<div style="font-size:10px;color:#334155">' + settled + ' meciuri rezolvate</div></div>';
      h += '<span style="font-size:24px;font-weight:800;color:' + (roiPos ? '#22c55e' : '#ef4444') + '">'
        + (roiPos ? '+' : '') + roiPct + '%</span></div>';
    }

    /* list */
    if (!rows.length) {
      h += '<div style="text-align:center;padding:48px 0">';
      h += '<div style="font-size:32px;margin-bottom:12px">📋</div>';
      h += '<div style="font-size:13px;color:#475569">Niciun meci urmărit încă.</div>';
      h += '<div style="font-size:11px;color:#334155;margin-top:6px">Mergi în Meciuri — meciurile afișate<br>apar automat aici.</div>';
      h += '</div>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:8px">';
      rows.forEach(function (e) {
        var color  = MKT_COLOR[e.bestBet] || '#64748b';
        var label  = MKT_LABEL[e.bestBet] || e.bestBet || '';
        var odds   = e.odds   ? parseFloat(e.odds).toFixed(2) : '—';
        var sc     = e.smartScore || 0;
        var st     = e.status || 'pending';

        var timeStr = '';
        if (e.eventDate) {
          var dt = new Date(e.eventDate);
          if (!isNaN(dt)) timeStr = dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })
            + ' ' + dt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        }

        var badge, cardBorder;
        if (st === 'win') {
          cardBorder = '#166534';
          badge = '<span style="font-size:12px;font-weight:700;background:#14532d;color:#22c55e;border-radius:8px;padding:4px 12px">✓ WIN'
            + (e.homeScore != null ? ' · ' + e.homeScore + '-' + e.awayScore : '') + '</span>';
        } else if (st === 'loss') {
          cardBorder = '#7f1d1d';
          badge = '<span style="font-size:12px;font-weight:700;background:#450a0a;color:#ef4444;border-radius:8px;padding:4px 12px">✗ LOSS'
            + (e.homeScore != null ? ' · ' + e.homeScore + '-' + e.awayScore : '') + '</span>';
        } else {
          cardBorder = '#1e293b';
          badge = '<span style="font-size:11px;color:#64748b;background:#1e293b;border-radius:8px;padding:4px 10px">⏳ Așteptare</span>';
        }

        h += '<div style="background:#0f172a;border:1px solid ' + cardBorder + ';border-radius:14px;padding:12px">';
        h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:5px">';
        h += '<span style="font-size:13px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + (e.home || '') + ' <span style="color:#475569;font-weight:400">vs</span> ' + (e.away || '') + '</span>';
        h += '<span style="font-size:10px;color:#475569;white-space:nowrap;margin-left:8px">' + timeStr + '</span>';
        h += '</div>';

        h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
        if (e.league) h += '<span style="font-size:10px;color:#475569">' + e.league + '</span>';
        if (label) h += '<span style="font-size:10px;font-weight:700;color:' + color + ';background:#1e293b;border-radius:5px;padding:2px 8px">' + label + '</span>';
        h += '<span style="font-size:11px;font-weight:700;color:#fbbf24">@ ' + odds + '</span>';
        h += '<span style="font-size:10px;color:#475569">SS:' + sc + '</span>';
        h += '</div>';
        h += badge;
        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    root.innerHTML = h;
  };

  window._monitorClearAll = function () { save({}); window.renderStatsMeciuri(); };

  /* ── hook renderMatches ── */
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
    var n = 0, iv = setInterval(function () {
      hookRender();
      if (window.__statsMeciuriHooked || ++n > 30) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
