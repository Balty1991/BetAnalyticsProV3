(function () {
  'use strict';

  var MKT_LABEL = {
    over25: 'Over 2.5G', under35: 'Under 3.5G', btts: 'BTTS',
    over15: 'Over 1.5G', dc1x: 'DC 1X', dcx2: 'DC X2', dc12: 'DC 12'
  };
  var MKT_COLOR = {
    over25: '#f59e0b', under35: '#3b82f6', btts: '#ec4899',
    over15: '#10b981', dc1x: '#8b5cf6', dcx2: '#06b6d4', dc12: '#f97316'
  };

  function fmt(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' })
      + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDay(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function bar(pct, color, h) {
    h = h || 5;
    return '<div style="background:#1e293b;border-radius:4px;height:' + h + 'px;overflow:hidden">'
      + '<div style="background:' + color + ';height:' + h + 'px;border-radius:4px;width:' + pct + '%;transition:width .35s ease"></div></div>';
  }

  window.renderStatsMeciuri = function () {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    var matches = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE.filter(Boolean) : [];
    var filter  = window.CURRENT_FILTER   || 'all';
    var mode    = window.MATCH_CARD_MODE  || 'simple';
    var now     = new Date();

    /* ── aggregate ── */
    var markets = {}, leagues = {}, byDate = {};
    var scoreRanges = { '75-100': 0, '50-74': 0, '25-49': 0, '0-24': 0 };

    matches.forEach(function (m) {
      var bet = m.bestBet || 'other';
      markets[bet] = (markets[bet] || 0) + 1;

      var sc = m.smartScore || 0;
      if (sc >= 75) scoreRanges['75-100']++;
      else if (sc >= 50) scoreRanges['50-74']++;
      else if (sc >= 25) scoreRanges['25-49']++;
      else scoreRanges['0-24']++;

      var lg = m.league || m.leagueName || 'Altele';
      leagues[lg] = (leagues[lg] || 0) + 1;

      var d = (m.eventDate || m.event_date || m.date || '').slice(0, 10);
      if (d) byDate[d] = (byDate[d] || 0) + 1;
    });

    var topMarkets  = Object.entries(markets).sort(function (a, b) { return b[1] - a[1]; });
    var topLeagues  = Object.entries(leagues).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    var datesSorted = Object.entries(byDate).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    var maxMkt      = topMarkets.length ? topMarkets[0][1] : 1;

    var filterLabel = filter === 'all' ? 'Toate' : (MKT_LABEL[filter] || filter.toUpperCase());
    var modeLabel   = mode === 'simple' ? 'Simplu' : mode === 'expert' ? 'Expert' : mode === 'verdict' ? 'Verdict' : mode;

    var scoreColors = { '75-100': '#22c55e', '50-74': '#3b82f6', '25-49': '#f59e0b', '0-24': '#ef4444' };

    /* ── HTML ── */
    var h = '';

    /* header */
    h += '<div style="padding:16px 12px 80px">';
    h += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">';
    h += '<div><div style="font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.4px">STATISTICĂ PAGINA MECIURI</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:3px">Actualizat la '
      + now.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) + '</div></div>';
    h += '<div style="background:#1e293b;border-radius:10px;padding:6px 11px;font-size:11px;color:#64748b;white-space:nowrap">'
      + modeLabel + ' · <span style="color:#60a5fa;font-weight:600">' + filterLabel + '</span></div>';
    h += '</div>';

    /* summary pills */
    h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">';
    var pills = [
      { val: matches.length, label: 'AFIȘATE',    color: '#60a5fa' },
      { val: Object.keys(leagues).length, label: 'LIGI', color: '#34d399' },
      { val: datesSorted.length, label: 'ZILE',   color: '#a78bfa' }
    ];
    pills.forEach(function (p) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px 8px;text-align:center">';
      h += '<div style="font-size:30px;font-weight:800;color:' + p.color + ';line-height:1">' + p.val + '</div>';
      h += '<div style="font-size:10px;color:#475569;margin-top:4px;letter-spacing:.6px">' + p.label + '</div></div>';
    });
    h += '</div>';

    /* markets */
    if (topMarkets.length) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">';
      h += '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;margin-bottom:12px">DISTRIBUȚIE PIEȚE</div>';
      topMarkets.forEach(function (e) {
        var key = e[0], cnt = e[1];
        var label = MKT_LABEL[key] || key;
        var color = MKT_COLOR[key] || '#64748b';
        var pct   = Math.round(cnt / maxMkt * 100);
        h += '<div style="margin-bottom:10px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
        h += '<span style="font-size:12px;color:#cbd5e1">' + label + '</span>';
        h += '<span style="font-size:13px;font-weight:700;color:' + color + '">' + cnt + '</span></div>';
        h += bar(pct, color, 6);
        h += '</div>';
      });
      h += '</div>';
    }

    /* smart score */
    h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;margin-bottom:12px">DISTRIBUȚIE SMART SCORE</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">';
    Object.entries(scoreRanges).forEach(function (e) {
      var range = e[0], cnt = e[1];
      var color = scoreColors[range];
      h += '<div style="background:#1e293b;border-radius:12px;padding:12px;text-align:center">';
      h += '<div style="font-size:26px;font-weight:800;color:' + color + ';line-height:1">' + cnt + '</div>';
      h += '<div style="font-size:10px;color:#64748b;margin-top:4px">' + range + '</div></div>';
    });
    h += '</div></div>';

    /* top leagues */
    if (topLeagues.length) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">';
      h += '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;margin-bottom:12px">TOP LIGI</div>';
      topLeagues.forEach(function (e, i) {
        var sep = i < topLeagues.length - 1 ? 'border-bottom:1px solid #1e293b;' : '';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;' + sep + '">';
        h += '<div style="display:flex;align-items:center;gap:8px">';
        h += '<span style="font-size:11px;color:#334155;width:18px">#' + (i + 1) + '</span>';
        h += '<span style="font-size:12px;color:#cbd5e1">' + e[0] + '</span></div>';
        h += '<span style="font-size:12px;font-weight:700;color:#60a5fa;background:#1e3a5f;border-radius:7px;padding:2px 9px">' + e[1] + '</span>';
        h += '</div>';
      });
      h += '</div>';
    }

    /* by date */
    if (datesSorted.length) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">';
      h += '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;margin-bottom:12px">MECIURI PE ZILE</div>';
      datesSorted.forEach(function (e, i) {
        var sep = i < datesSorted.length - 1 ? 'border-bottom:1px solid #1e293b;' : '';
        var pct = Math.round(e[1] / matches.length * 100);
        h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;' + sep + '">';
        h += '<span style="font-size:12px;color:#94a3b8;min-width:90px">' + fmtDay(e[0]) + '</span>';
        h += '<div style="flex:1;margin:0 10px">' + bar(pct, '#3b82f6', 5) + '</div>';
        h += '<span style="font-size:13px;font-weight:700;color:#60a5fa;min-width:20px;text-align:right">' + e[1] + '</span>';
        h += '</div>';
      });
      h += '</div>';
    }

    /* matches list */
    if (matches.length) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">';
      h += '<div style="font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;margin-bottom:12px">LISTA MECIURI (' + matches.length + ')</div>';
      matches.forEach(function (m, i) {
        var bet    = m.bestBet || '';
        var color  = MKT_COLOR[bet] || '#64748b';
        var label  = MKT_LABEL[bet] || bet;
        var odds   = m.bestOdds || m.odds || null;
        var sc     = m.smartScore || 0;
        var time   = fmt(m.eventDate || m.event_date || m.date || '');
        var sep    = i < matches.length - 1 ? 'border-bottom:1px solid #0d1829;' : '';

        h += '<div style="padding:9px 0;' + sep + '">';
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">';
        h += '<span style="font-size:12px;font-weight:600;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + (m.home || '') + ' vs ' + (m.away || '') + '</span>';
        h += '<span style="font-size:10px;color:#475569;margin-left:8px;white-space:nowrap">' + time + '</span>';
        h += '</div>';
        h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
        h += '<span style="font-size:10px;color:#475569">' + (m.league || '') + '</span>';
        if (label) h += '<span style="font-size:10px;background:#1e293b;color:' + color + ';border-radius:5px;padding:1px 7px;font-weight:600">' + label + '</span>';
        if (odds) h += '<span style="font-size:10px;color:#fbbf24;font-weight:700">@ ' + (typeof odds === 'number' ? odds.toFixed(2) : odds) + '</span>';
        h += '<span style="font-size:10px;color:#475569">SS:' + sc + '</span>';
        h += '</div></div>';
      });
      h += '</div>';
    }

    if (!matches.length) {
      h += '<div style="text-align:center;padding:48px 0;color:#334155;font-size:13px">Niciun meci afișat momentan.<br><span style="font-size:11px">Schimbă filtrele din tab-ul Meciuri.</span></div>';
    }

    h += '</div>';
    root.innerHTML = h;
  };

  /* auto-refresh when renderMatches runs */
  function hookRender() {
    if (window.__statsMeciuriHooked) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__statsMeciuriHooked = true;
    var orig = window.renderMatches;
    window.renderMatches = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        var root = document.getElementById('tab-stats-meciuri');
        if (root && root.offsetParent !== null) window.renderStatsMeciuri();
      }, 200);
      return r;
    };
  }

  function boot() {
    hookRender();
    var attempts = 0;
    var iv = setInterval(function () {
      hookRender();
      if (window.__statsMeciuriHooked || ++attempts > 30) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
