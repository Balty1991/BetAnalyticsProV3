(function () {
  'use strict';

  var RESULTS_KEY = 'veyra_monitor_results';

  var MKT_LABEL = {
    over25: 'Over 2.5G', under35: 'Under 3.5G', btts: 'BTTS',
    over15: 'Over 1.5G', dc1x: 'DC 1X', dcx2: 'DC X2', dc12: 'DC 12'
  };
  var MKT_COLOR = {
    over25: '#f59e0b', under35: '#3b82f6', btts: '#ec4899',
    over15: '#10b981', dc1x: '#8b5cf6', dcx2: '#06b6d4', dc12: '#f97316'
  };

  /* ── storage ── */
  function loadResults() {
    try { return JSON.parse(localStorage.getItem(RESULTS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveResults(obj) {
    try { localStorage.setItem(RESULTS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function matchKey(m) {
    return [m.eventId || '', m.home || '', m.away || '', m.bestBet || ''].join('|');
  }

  /* ── get current matches ── */
  function getMatches() {
    var live = Array.isArray(window.MATCHES_FILTERED_CACHE)
      ? window.MATCHES_FILTERED_CACHE.filter(Boolean)
      : [];
    if (live.length) return live;
    /* fallback: snapshot saved by display_snapshot.js */
    try {
      var snap = JSON.parse(localStorage.getItem('veyra_display_snapshot') || 'null');
      if (snap && Array.isArray(snap.matches) && snap.matches.length) return snap.matches;
    } catch (e) {}
    return [];
  }

  /* ── mark result ── */
  window.monitorMark = function (key, status) {
    var res = loadResults();
    if (!res[key]) return;
    res[key].status = status;
    res[key].markedAt = new Date().toISOString();
    saveResults(res);
    window.renderStatsMeciuri();
  };

  /* ── main render ── */
  window.renderStatsMeciuri = function () {
    var root = document.getElementById('tab-stats-meciuri');
    if (!root) return;

    var matches = getMatches();
    var res     = loadResults();
    var now     = new Date();

    /* sync results store with current matches */
    matches.forEach(function (m) {
      var k = matchKey(m);
      if (!res[k]) {
        res[k] = {
          home:      m.home      || m.homeTeam   || '',
          away:      m.away      || m.awayTeam   || '',
          league:    m.league    || m.leagueName || '',
          country:   m.country   || '',
          bestBet:   m.bestBet   || '',
          odds:      m.bestOdds  || m.odds       || null,
          smartScore:m.smartScore|| 0,
          eventDate: m.eventDate || m.event_date || m.date || '',
          status:    'pending',
          markedAt:  null
        };
      }
    });
    saveResults(res);

    /* build display list: current matches merged with stored results */
    var rows = matches.map(function (m) {
      return { key: matchKey(m), data: res[matchKey(m)] || {}, raw: m };
    });

    /* ── summary ── */
    var pending = 0, wins = 0, losses = 0, roi = 0;
    rows.forEach(function (r) {
      var s = r.data.status;
      var o = parseFloat(r.data.odds) || 1;
      if (s === 'win')  { wins++;    roi += (o - 1); }
      else if (s === 'loss') { losses++; roi -= 1; }
      else pending++;
    });
    var settled   = wins + losses;
    var winRate   = settled > 0 ? Math.round(wins / settled * 100) : null;
    var roiPct    = settled > 0 ? (roi / settled * 100).toFixed(1) : null;
    var roiPlus   = roiPct !== null && parseFloat(roiPct) >= 0;

    /* ── HTML ── */
    var h = '<div style="padding:14px 12px 80px">';

    /* title */
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
    h += '<div>';
    h += '<div style="font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.4px">MONITORIZARE MECIURI</div>';
    h += '<div style="font-size:11px;color:#475569;margin-top:2px">Actualizat ' + now.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}) + ' · ' + rows.length + ' meciuri</div>';
    h += '</div>';
    h += '</div>';

    /* summary row */
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px">';
    var sumCards = [
      { val: pending,  label: 'AȘTEPTARE', color: '#94a3b8' },
      { val: wins,     label: 'WIN',       color: '#22c55e' },
      { val: losses,   label: 'LOSS',      color: '#ef4444' },
      { val: winRate !== null ? winRate + '%' : '—', label: 'WIN RATE', color: '#60a5fa' }
    ];
    sumCards.forEach(function (c) {
      h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:10px 4px;text-align:center">';
      h += '<div style="font-size:22px;font-weight:800;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      h += '<div style="font-size:9px;color:#475569;margin-top:3px;letter-spacing:.5px">' + c.label + '</div>';
      h += '</div>';
    });
    h += '</div>';

    /* ROI banner */
    if (roiPct !== null) {
      var roiColor = roiPlus ? '#22c55e' : '#ef4444';
      h += '<div style="background:#0f172a;border:1px solid ' + (roiPlus ? '#166534' : '#7f1d1d') + ';border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
      h += '<span style="font-size:12px;color:#64748b;font-weight:600">ROI (' + settled + ' meciuri rezolvate)</span>';
      h += '<span style="font-size:20px;font-weight:800;color:' + roiColor + '">' + (roiPlus ? '+' : '') + roiPct + '%</span>';
      h += '</div>';
    }

    /* match list */
    if (rows.length === 0) {
      h += '<div style="text-align:center;padding:48px 0;color:#334155;font-size:13px">Niciun meci afișat.<br><span style="font-size:11px">Mergi în Meciuri și aplică filtrele.</span></div>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:8px">';
      rows.forEach(function (r) {
        var d = r.data;
        var bet   = d.bestBet || '';
        var color = MKT_COLOR[bet] || '#64748b';
        var label = MKT_LABEL[bet] || bet;
        var odds  = d.odds ? parseFloat(d.odds).toFixed(2) : '—';
        var sc    = d.smartScore || 0;
        var st    = d.status || 'pending';

        var timeStr = '';
        if (d.eventDate) {
          var dt = new Date(d.eventDate);
          if (!isNaN(dt)) timeStr = dt.toLocaleDateString('ro-RO',{day:'2-digit',month:'short'})
            + ' ' + dt.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
        }

        var statusBadge = st === 'win'
          ? '<span style="font-size:11px;font-weight:700;background:#14532d;color:#22c55e;border-radius:7px;padding:3px 10px">✓ WIN</span>'
          : st === 'loss'
          ? '<span style="font-size:11px;font-weight:700;background:#450a0a;color:#ef4444;border-radius:7px;padding:3px 10px">✗ LOSS</span>'
          : '<span style="font-size:11px;color:#64748b;background:#1e293b;border-radius:7px;padding:3px 10px">⏳ Așteptare</span>';

        var btnWin  = '<button onclick="monitorMark(\'' + r.key.replace(/'/g,"\\'") + '\',\'win\')"  style="flex:1;background:' + (st==='win'?'#14532d':'#0f172a') + ';border:1px solid '+(st==='win'?'#16a34a':'#1e293b')+';color:'+(st==='win'?'#22c55e':'#475569')+';border-radius:9px;padding:8px 0;font-size:12px;font-weight:600;cursor:pointer">✓ WIN</button>';
        var btnLoss = '<button onclick="monitorMark(\'' + r.key.replace(/'/g,"\\'") + '\',\'loss\')" style="flex:1;background:' + (st==='loss'?'#450a0a':'#0f172a') + ';border:1px solid '+(st==='loss'?'#dc2626':'#1e293b')+';color:'+(st==='loss'?'#ef4444':'#475569')+';border-radius:9px;padding:8px 0;font-size:12px;font-weight:600;cursor:pointer">✗ LOSS</button>';
        var btnReset= st !== 'pending' ? '<button onclick="monitorMark(\'' + r.key.replace(/'/g,"\\'") + '\',\'pending\')" style="background:#0f172a;border:1px solid #1e293b;color:#334155;border-radius:9px;padding:8px 10px;font-size:11px;cursor:pointer">↩</button>' : '';

        h += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:12px">';

        /* team row */
        h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
        h += '<span style="font-size:12px;font-weight:700;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          + (d.home||'') + ' <span style="color:#475569">vs</span> ' + (d.away||'') + '</span>';
        h += '<span style="font-size:10px;color:#475569;margin-left:8px;white-space:nowrap">' + timeStr + '</span>';
        h += '</div>';

        /* meta row */
        h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
        h += '<span style="font-size:10px;color:#475569">' + (d.league||'') + '</span>';
        if (label) h += '<span style="font-size:10px;font-weight:700;color:' + color + ';background:#1e293b;border-radius:5px;padding:2px 8px">' + label + '</span>';
        h += '<span style="font-size:11px;font-weight:700;color:#fbbf24">@ ' + odds + '</span>';
        h += '<span style="font-size:10px;color:#475569">SS:' + sc + '</span>';
        h += '</div>';

        /* buttons */
        h += '<div style="display:flex;gap:6px">' + btnWin + btnLoss + btnReset + '</div>';
        h += '</div>';
      });
      h += '</div>';
    }

    h += '</div>';
    root.innerHTML = h;
  };

  /* ── hook renderMatches ── */
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
