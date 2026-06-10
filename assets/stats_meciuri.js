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

  /* ── storage ── */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function entryKey(m) {
    return String(m.eventId || m.event_id || '') + '|' + (m.bestBet || '');
  }

  /* ── sync new matches from MATCHES_FILTERED_CACHE into store ── */
  function syncFromFiltered() {
    var preds = Array.isArray(window.MATCHES_FILTERED_CACHE)
      ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    if (!preds.length) return;
    var store = load();
    preds.forEach(function (m) {
      var k = entryKey(m);
      if (!k || k === '|') return;
      if (!store[k]) {
        store[k] = {
          eventId:    String(m.eventId    || m.event_id   || ''),
          home:       m.home              || m.homeTeam    || '',
          away:       m.away              || m.awayTeam    || '',
          league:     m.league            || m.leagueName  || '',
          country:    m.country           || '',
          bestBet:    m.bestBet           || '',
          odds:       m.bestOdds          || m.odds        || null,
          smartScore: m.smartScore        || 0,
          eventDate:  m.eventDate         || m.event_date  || m.date || '',
          addedAt:    new Date().toISOString(),
          status:     'pending',
          homeScore:  null,
          awayScore:  null,
          autoDetected: false,
          resolvedAt: null
        };
      }
    });
    save(store);
  }

  /* ── auto-detect results from ALL_MATCHES ── */
  function autoCheckResults() {
    var allMatches = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    if (!allMatches.length) return false;

    /* build lookup: eventId → match */
    var byId = {};
    allMatches.forEach(function (m) {
      var eid = String(m.eventId || m.event_id || '');
      if (eid) byId[eid] = m;
    });

    var store  = load();
    var changed = false;

    Object.keys(store).forEach(function (k) {
      var entry = store[k];
      if (entry.status !== 'pending') return;

      var live = byId[entry.eventId];
      if (!live) return;

      var hs = live.homeScore != null ? live.homeScore : null;
      var as = live.awayScore != null ? live.awayScore : null;
      if (hs === null || as === null) return;

      /* use existing evaluateMarketOutcome if available, else inline */
      var result;
      if (typeof window.evaluateMarketOutcome === 'function') {
        result = window.evaluateMarketOutcome(entry.bestBet, hs, as);
      } else {
        var tot = Number(hs) + Number(as);
        var bet = entry.bestBet;
        if (bet === 'over15')  result = tot >= 2 ? 'win' : 'loss';
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

  /* ── main render ── */
  window.renderStatsMeciuri = function () {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    syncFromFiltered();
    autoCheckResults();

    var store  = load();
    var rows   = Object.values(store).sort(function (a, b) {
      return new Date(b.addedAt) - new Date(a.addedAt);
    });

    /* summary */
    var pending = 0, wins = 0, losses = 0, roiSum = 0;
    rows.forEach(function (e) {
      if (e.status === 'win')   { wins++;   roiSum += (parseFloat(e.odds) || 1) - 1; }
      else if (e.status === 'loss') { losses++; roiSum -= 1; }
      else pending++;
    });
    var settled  = wins + losses;
    var winRate  = settled > 0 ? Math.round(wins / settled * 100) : null;
    var roiPct   = settled > 0 ? (roiSum / settled * 100).toFixed(1) : null;
    var roiPos   = roiPct !== null && parseFloat(roiPct) >= 0;

    /* ── HTML ── */
    var h = '<div style="padding:14px 12px 80px">';

    /* header */
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
    h += '<div>';
    h += '<div style="font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.4px">MONITORIZARE MECIURI</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">'
      + rows.length + ' meciuri urmărite · actualizare automată</div>';
    h += '</div>';
    if (rows.length > 0) {
      h += '<button onclick="window._monitorClearAll&&window._monitorClearAll()" '
        + 'style="background:none;border:1px solid #1e293b;color:#475569;border-radius:8px;'
        + 'padding:5px 10px;font-size:10px;cursor:pointer">Resetează</button>';
    }
    h += '</div>';

    /* summary row */
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">';
    [
      { val: pending,  label: 'AȘTEPTARE', color: '#94a3b8' },
      { val: wins,     label: 'WIN',       color: '#22c55e' },
      { val: losses,   label: 'LOSS',      color: '#ef4444' },
      { val: winRate !== null ? winRate + '%' : '—', label: 'WIN RATE', color: '#60a5fa' }
    ].forEach(function (c) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:10px 4px;text-align:center">';
      h += '<div style="font-size:22px;font-weight:800;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      h += '<div style="font-size:9px;color:#475569;margin-top:3px;letter-spacing:.5px">' + c.label + '</div>';
      h += '</div>';
    });
    h += '</div>';

    /* ROI */
    if (roiPct !== null) {
      var rColor = roiPos ? '#22c55e' : '#ef4444';
      var rBorder = roiPos ? '#166534' : '#7f1d1d';
      h += '<div style="background:#0f172a;border:1px solid ' + rBorder + ';border-radius:12px;'
        + 'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
      h += '<div><div style="font-size:12px;color:#64748b;font-weight:600">ROI</div>'
        + '<div style="font-size:10px;color:#334155">' + settled + ' meciuri rezolvate</div></div>';
      h += '<span style="font-size:24px;font-weight:800;color:' + rColor + '">'
        + (roiPos ? '+' : '') + roiPct + '%</span>';
      h += '</div>';
    }

    /* match list */
    if (!rows.length) {
      h += '<div style="text-align:center;padding:48px 0;color:#334155">';
      h += '<div style="font-size:32px;margin-bottom:12px">📋</div>';
      h += '<div style="font-size:13px;color:#475569">Niciun meci urmărit încă.</div>';
      h += '<div style="font-size:11px;color:#334155;margin-top:6px">Mergi în Meciuri — meciurile afișate<br>apar automat aici.</div>';
      h += '</div>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:8px">';
      rows.forEach(function (e) {
        var bet    = e.bestBet || '';
        var color  = MKT_COLOR[bet] || '#64748b';
        var label  = MKT_LABEL[bet] || bet;
        var odds   = e.odds ? parseFloat(e.odds).toFixed(2) : '—';
        var sc     = e.smartScore || 0;
        var st     = e.status || 'pending';

        var timeStr = '';
        if (e.eventDate) {
          var dt = new Date(e.eventDate);
          if (!isNaN(dt)) timeStr = dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' })
            + ' ' + dt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        }

        /* status badge */
        var badge, cardBorder;
        if (st === 'win') {
          cardBorder = '#166534';
          badge = '<span style="font-size:12px;font-weight:700;background:#14532d;color:#22c55e;'
            + 'border-radius:8px;padding:4px 12px">✓ WIN'
            + (e.homeScore != null ? ' · ' + e.homeScore + '-' + e.awayScore : '')
            + '</span>';
        } else if (st === 'loss') {
          cardBorder = '#7f1d1d';
          badge = '<span style="font-size:12px;font-weight:700;background:#450a0a;color:#ef4444;'
            + 'border-radius:8px;padding:4px 12px">✗ LOSS'
            + (e.homeScore != null ? ' · ' + e.homeScore + '-' + e.awayScore : '')
            + '</span>';
        } else {
          cardBorder = '#1e293b';
          badge = '<span style="font-size:11px;color:#64748b;background:#1e293b;'
            + 'border-radius:8px;padding:4px 10px">⏳ Așteptare</span>';
        }

        h += '<div style="background:#0f172a;border:1px solid ' + cardBorder + ';border-radius:14px;padding:12px">';

        /* teams + time */
        h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:5px">';
        h += '<span style="font-size:13px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;'
          + 'text-overflow:ellipsis;white-space:nowrap">'
          + (e.home || '') + ' <span style="color:#475569;font-weight:400">vs</span> ' + (e.away || '') + '</span>';
        h += '<span style="font-size:10px;color:#475569;white-space:nowrap;margin-left:8px">' + timeStr + '</span>';
        h += '</div>';

        /* meta */
        h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
        if (e.league) h += '<span style="font-size:10px;color:#475569">' + e.league + '</span>';
        if (label) h += '<span style="font-size:10px;font-weight:700;color:' + color
          + ';background:#1e293b;border-radius:5px;padding:2px 8px">' + label + '</span>';
        h += '<span style="font-size:11px;font-weight:700;color:#fbbf24">@ ' + odds + '</span>';
        h += '<span style="font-size:10px;color:#475569">SS:' + sc + '</span>';
        h += '</div>';

        /* result badge */
        h += badge;
        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    root.innerHTML = h;
  };

  /* reset all */
  window._monitorClearAll = function () {
    save({});
    window.renderStatsMeciuri();
  };

  /* ── hook renderMatches → sync + auto-check ── */
  function hookRender() {
    if (window.__statsMeciuriHooked) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__statsMeciuriHooked = true;
    var orig = window.renderMatches;
    window.renderMatches = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        syncFromFiltered();
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
