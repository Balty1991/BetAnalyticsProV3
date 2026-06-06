/* VEYRA — Statistici Predicții
   Covers: AI Claude · ML5 · APEX · Meciuri
   All computation is client-side from existing data — zero extra API calls.
*/
(function () {
  'use strict';

  var MKT = {
    btts:'BTTS', over15:'Peste 1.5G', over25:'Peste 2.5G', over35:'Peste 3.5G',
    under25:'Sub 2.5G', under35:'Sub 3.5G', home_win:'Gazdă câștigă',
    away_win:'Oaspete câștigă', draw:'Egal', unknown:'Altele'
  };

  // ─── SVG helpers ─────────────────────────────────────────────────────────────

  function donut(pct, color, sz) {
    var r = sz / 2 - 9, c = sz / 2;
    var circ = 2 * Math.PI * r;
    var d = Math.max(0, Math.min(100, pct)) / 100 * circ;
    var col = color || (pct >= 60 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444');
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 ' + sz + ' ' + sz + '">'
      + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="9"/>'
      + '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="9"'
      + ' stroke-dasharray="' + d.toFixed(1) + ' ' + circ.toFixed(1) + '" stroke-linecap="round"'
      + ' transform="rotate(-90 ' + c + ' ' + c + ')"/>'
      + '<text x="' + c + '" y="' + (c + 5) + '" text-anchor="middle" font-size="' + Math.floor(sz / 5) + '"'
      + ' font-weight="900" fill="' + col + '">' + pct + '%</text>'
      + '</svg>';
  }

  function lineChart(pts, W, H, col) {
    if (!pts || pts.length < 2) {
      return '<div style="height:' + H + 'px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px">Date insuficiente</div>';
    }
    var pL = 28, pR = 8, pT = 10, pB = 18;
    var cW = W - pL - pR, cH = H - pT - pB;
    var ys = pts.map(function (p) { return p.y; });
    var yMax = Math.max.apply(null, ys);
    var yMin = Math.max(0, Math.min.apply(null, ys) - 10);
    var range = yMax - yMin || 1;

    var coords = pts.map(function (p, i) {
      return {
        cx: pL + (i / (pts.length - 1)) * cW,
        cy: pT + (1 - (p.y - yMin) / range) * cH,
        label: p.x,
        val: p.y
      };
    });

    var pathD = coords.map(function (c, i) { return (i ? 'L' : 'M') + c.cx.toFixed(1) + ',' + c.cy.toFixed(1); }).join(' ');
    var areaD = pathD + ' L' + coords[coords.length - 1].cx.toFixed(1) + ',' + (pT + cH) + ' L' + pL + ',' + (pT + cH) + ' Z';

    var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible">';
    [0, 25, 50, 75, 100].forEach(function (v) {
      if (v < yMin - 5 || v > yMax + 5) return;
      var gy = pT + (1 - (v - yMin) / range) * cH;
      svg += '<line x1="' + pL + '" y1="' + gy.toFixed(1) + '" x2="' + (pL + cW) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,.05)" stroke-width="1"/>';
      svg += '<text x="' + (pL - 3) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" font-size="7" fill="#64748b">' + v + '</text>';
    });
    svg += '<path d="' + areaD + '" fill="' + col + '" fill-opacity="0.12"/>';
    svg += '<path d="' + pathD + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    var step = Math.max(1, Math.ceil(coords.length / 6));
    coords.forEach(function (c, i) {
      svg += '<circle cx="' + c.cx.toFixed(1) + '" cy="' + c.cy.toFixed(1) + '" r="3" fill="' + col + '" stroke="var(--bg2,#0E1424)" stroke-width="1.5"/>';
      if (i % step === 0 || i === coords.length - 1)
        svg += '<text x="' + c.cx.toFixed(1) + '" y="' + (pT + cH + 12) + '" text-anchor="middle" font-size="7" fill="#64748b">' + c.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }

  function hBars(rows) {
    if (!rows || !rows.length) return '<div style="color:#64748b;font-size:11px;text-align:center;padding:12px">Fără date suficiente</div>';
    var W = 280, rowH = 32;
    var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + (rows.length * rowH + 4) + '" style="overflow:visible">';
    rows.forEach(function (r, i) {
      var y = i * rowH;
      var bW = Math.max(0, Math.min(160, Math.round((r.wr || 0) / 100 * 160)));
      var wrCol = (r.wr || 0) >= 60 ? '#22c55e' : (r.wr || 0) >= 45 ? '#f59e0b' : '#ef4444';
      var roi = r.roi != null ? r.roi : 0;
      var roiStr = (roi >= 0 ? '+' : '') + roi + '%';
      var roiCol = roi >= 0 ? '#22c55e' : '#ef4444';
      var lbl = String(r.label || '').slice(0, 20);
      svg += '<text x="0" y="' + (y + 11) + '" font-size="10" fill="var(--txt,#e2e8f0)" font-weight="600">' + lbl + '</text>';
      svg += '<rect x="0" y="' + (y + 15) + '" width="160" height="10" rx="5" fill="rgba(255,255,255,.05)"/>';
      if (bW > 0) svg += '<rect x="0" y="' + (y + 15) + '" width="' + bW + '" height="10" rx="5" fill="' + wrCol + '" fill-opacity="0.75"/>';
      svg += '<text x="' + (bW + 4) + '" y="' + (y + 24) + '" font-size="9" fill="' + wrCol + '" font-weight="700">' + (r.wr || 0) + '%</text>';
      svg += '<text x="205" y="' + (y + 24) + '" font-size="9" fill="' + roiCol + '" font-weight="700" text-anchor="middle">' + roiStr + '</text>';
      svg += '<text x="270" y="' + (y + 24) + '" font-size="9" fill="#64748b" text-anchor="end">' + (r.total || 0) + 'x</text>';
    });
    svg += '</svg>';
    return svg;
  }

  // ─── Layout helpers ───────────────────────────────────────────────────────────

  function card(inner, border) {
    return '<div style="background:var(--bg2,#0E1424);border:1px solid ' + (border || 'rgba(255,255,255,.1)') + ';border-radius:14px;padding:14px 16px;margin-bottom:12px">' + inner + '</div>';
  }

  function secHead(txt, col) {
    return '<div style="font-size:10px;font-weight:800;color:' + (col || '#64748b') + ';text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">' + txt + '</div>';
  }

  function statRow(label, value, valCol) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0">'
      + '<span style="font-size:11px;color:#64748b">' + label + '</span>'
      + '<span style="font-size:12px;font-weight:700;color:' + (valCol || 'var(--txt,#e2e8f0)') + '">' + value + '</span>'
      + '</div>';
  }

  function roiStr(v) { return (v >= 0 ? '+' : '') + v + '%'; }
  function roiCol(v) { return v > 0 ? '#22c55e' : v === 0 ? '#f59e0b' : '#ef4444'; }

  // ─── Compute helpers ──────────────────────────────────────────────────────────

  function computeMarkets(picks, mktFn, wonFn, oddsFn) {
    var m = {};
    picks.forEach(function (p) {
      var k = mktFn(p) || 'unknown';
      if (!m[k]) m[k] = { wins: 0, losses: 0, rSum: 0 };
      if (wonFn(p)) { m[k].wins++; m[k].rSum += (oddsFn(p) || 2) - 1; }
      else { m[k].losses++; m[k].rSum -= 1; }
    });
    return Object.keys(m).map(function (k) {
      var t = m[k].wins + m[k].losses;
      return { label: MKT[k] || k, wr: t ? Math.round(m[k].wins / t * 100) : 0, roi: t ? Math.round(m[k].rSum / t * 100) : 0, total: t };
    }).sort(function (a, b) { return b.total - a.total; }).slice(0, 7);
  }

  function computeLeagues(picks, leagueFn, wonFn, oddsFn) {
    var m = {};
    picks.forEach(function (p) {
      var k = (leagueFn(p) || 'Altele').slice(0, 28);
      if (!m[k]) m[k] = { wins: 0, losses: 0, rSum: 0 };
      if (wonFn(p)) { m[k].wins++; m[k].rSum += (oddsFn ? (oddsFn(p) || 2) : 2) - 1; }
      else { m[k].losses++; m[k].rSum -= 1; }
    });
    return Object.keys(m).map(function (k) {
      var t = m[k].wins + m[k].losses;
      return { label: k, wr: t ? Math.round(m[k].wins / t * 100) : 0, roi: t ? Math.round(m[k].rSum / t * 100) : 0, total: t };
    }).sort(function (a, b) { return b.total - a.total; }).slice(0, 6);
  }

  function trendFromHistory(hist, dateFn, wrFn) {
    return hist.slice(0, 14).reverse().map(function (r) {
      var dt = dateFn(r);
      return { x: dt ? dt.slice(8, 10) + '.' + dt.slice(5, 7) : '', y: wrFn(r) };
    }).filter(function (p) { return p.x; });
  }

  function trendFromLog(settled, dateFn, wonFn) {
    var byDate = {};
    settled.forEach(function (r) {
      var d = dateFn(r);
      if (!d) return;
      if (!byDate[d]) byDate[d] = { w: 0, t: 0 };
      byDate[d].t++;
      if (wonFn(r)) byDate[d].w++;
    });
    return Object.keys(byDate).sort().slice(-14).map(function (d) {
      var v = byDate[d];
      return { x: d.slice(8, 10) + '.' + d.slice(5, 7), y: Math.round(v.w / v.t * 100) };
    });
  }

  function overviewBlock(donutSvg, rows) {
    return '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">'
      + donutSvg
      + '<div style="flex:1">' + rows + '</div>'
      + '</div>';
  }

  // ─── AI Claude ───────────────────────────────────────────────────────────────

  function claudeStats() {
    var trk = window.AI_PRED_TRACKING || {};
    var hist = trk.history || [];
    var st = trk.stats || {};
    var tp = st.top_picks || {};
    var ac = st.acumulators || {};
    var streak = st.streak || {};

    if (!hist.length) return '<div style="text-align:center;padding:48px 20px;color:#64748b;font-size:13px">Nu există date. Rulează workflow-ul <b style="color:var(--txt)">Fetch VEYRA Data</b> o dată.</div>';

    var tpRoiSum = 0, tpRoiCnt = 0;
    var acRoiSum = 0, acSettled = 0, acWon = 0;
    var acPW = 0, acPL = 0, acPRoiSum = 0;
    hist.forEach(function (r) {
      (r.top_picks_results || []).forEach(function (p) {
        if (p.result === 'win') { tpRoiSum += (p.odds || 2) - 1; tpRoiCnt++; }
        else if (p.result === 'loss') { tpRoiSum -= 1; tpRoiCnt++; }
      });
      var ar = r.acumulator_result || 'pending';
      if (ar === 'win') { acRoiSum += (r.cota_totala || 1) - 1; acSettled++; acWon++; }
      else if (ar === 'loss') { acRoiSum -= 1; acSettled++; }
      (r.acumulator_picks || []).forEach(function (p) {
        if (p.result === 'win') { acPW++; acPRoiSum += (p.odds || 1.3) - 1; }
        else if (p.result === 'loss') { acPL++; acPRoiSum -= 1; }
      });
    });

    var tpWR = Math.round(tp.winrate || 0);
    var tpROI = tpRoiCnt ? Math.round(tpRoiSum / tpRoiCnt * 100) : 0;
    var acPCnt = acPW + acPL;
    var acPWR = acPCnt ? Math.round(acPW / acPCnt * 100) : 0;
    var acPROI = acPCnt ? Math.round(acPRoiSum / acPCnt * 100) : 0;
    var acBROI = acSettled ? Math.round(acRoiSum / acSettled * 100) : 0;
    var strN = streak.current || 0, strT = streak.type || '';
    var strCol = strT === 'win' ? '#22c55e' : strT === 'loss' ? '#ef4444' : '#64748b';

    var html = '';

    html += card(
      secHead('🏆 Top 5 Picks', '#2BE5C5')
      + overviewBlock(donut(tpWR, '#2BE5C5', 84),
        statRow('Total picks', tp.total || 0)
        + statRow('Win', tp.wins || 0, '#22c55e')
        + statRow('Loss', tp.losses || 0, '#ef4444')
        + (tp.pending ? statRow('Pending', tp.pending, '#f59e0b') : '')
        + '<div style="border-top:1px solid rgba(43,229,197,.15);margin-top:5px;padding-top:5px">'
        + statRow('ROI per pick', roiStr(tpROI), roiCol(tpROI))
        + '</div>'
      )
      + secHead('Trend Win Rate — ultimele ' + Math.min(hist.length, 14) + ' zile', '#64748b')
      + lineChart(
          trendFromHistory(hist, function (r) { return r.date; }, function (r) {
            var s = r.top_picks_summary || {};
            var t = (s.wins || 0) + (s.losses || 0);
            return t ? Math.round((s.wins || 0) / t * 100) : 0;
          }),
          280, 80, '#2BE5C5'),
      'rgba(43,229,197,.2)'
    );

    var allPicks = [];
    hist.forEach(function (r) { allPicks = allPicks.concat(r.top_picks_results || []); });
    var settledPicks = allPicks.filter(function (p) { return p.result === 'win' || p.result === 'loss'; });
    var mktRows = computeMarkets(settledPicks,
      function (p) { return p.market; },
      function (p) { return p.result === 'win'; },
      function (p) { return p.odds || 2; }
    );
    if (mktRows.length) html += card(secHead('📊 Per Piață — Top 5', '#64748b') + hBars(mktRows), 'rgba(43,229,197,.12)');

    html += card(
      secHead('🎰 Acumulatoare', '#818cf8')
      + overviewBlock(donut(acPWR, '#818cf8', 84),
        statRow('Bilete jucate', acSettled)
        + statRow('Bilete câștigate', acWon, '#22c55e')
        + statRow('Picks: ' + acPCnt, acPW + 'W / ' + acPL + 'L')
        + '<div style="border-top:1px solid rgba(99,102,241,.2);margin-top:5px;padding-top:5px">'
        + statRow('ROI picks', roiStr(acPROI), roiCol(acPROI))
        + statRow('ROI bilet', roiStr(acBROI), roiCol(acBROI))
        + '</div>'
      ),
      'rgba(99,102,241,.2)'
    );

    html += '<div style="background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.2);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Streak Acumulator</div>'
      + '<div style="font-size:17px;font-weight:900;color:' + strCol + '">' + (strN ? strN + ' ' + (strT === 'win' ? 'WIN' : 'LOSS') : '—') + '</div>'
      + '</div>';

    return html;
  }

  // ─── ML5 ─────────────────────────────────────────────────────────────────────

  function ml5Stats() {
    var raw = [];
    try { raw = JSON.parse(localStorage.getItem('veyra_ml5_accuracy_log_v2') || '[]'); } catch (e) {}
    if (!Array.isArray(raw)) raw = [];
    var settled = raw.filter(function (e) { return e.result === 'won' || e.result === 'lost'; });
    var pending = raw.filter(function (e) { return e.result === 'pending'; });

    if (!settled.length) return '<div style="text-align:center;padding:48px 20px;color:#64748b;font-size:13px">Fără predicții ML5 înregistrate.<br>Navighează pe tab-ul <b style="color:var(--txt)">Meciuri</b> — tracking-ul pornește automat.</div>';

    var wins = settled.filter(function (e) { return e.result === 'won'; });
    var wr = Math.round(wins.length / settled.length * 100);
    var roiSum = 0;
    settled.forEach(function (e) { roiSum += e.result === 'won' ? ((e.odds || 2) - 1) : -1; });
    var roi = Math.round(roiSum / settled.length * 100);

    var html = '';

    html += card(
      secHead('🧠 ML5 — Rezumat', '#22c55e')
      + overviewBlock(donut(wr, '#22c55e', 84),
        statRow('Total înregistrate', raw.length)
        + statRow('Decontate', settled.length)
        + statRow('Win', wins.length, '#22c55e')
        + statRow('Loss', settled.length - wins.length, '#ef4444')
        + (pending.length ? statRow('Pending', pending.length, '#f59e0b') : '')
        + '<div style="border-top:1px solid rgba(34,197,94,.15);margin-top:5px;padding-top:5px">'
        + statRow('ROI', roiStr(roi), roiCol(roi))
        + '</div>'
      )
      + secHead('Trend Win Rate', '#64748b')
      + lineChart(
          trendFromLog(settled,
            function (e) { return (e.eventDate || e.savedAt || '').slice(0, 10); },
            function (e) { return e.result === 'won'; }
          ),
          280, 80, '#22c55e'),
      'rgba(34,197,94,.2)'
    );

    var mktRows = computeMarkets(settled,
      function (e) { return e.market; },
      function (e) { return e.result === 'won'; },
      function (e) { return e.odds || 1.5; }
    );
    if (mktRows.length) html += card(secHead('📊 Per Piață', '#64748b') + hBars(mktRows), 'rgba(34,197,94,.12)');

    var recent = raw.filter(function (e) { return e.result !== 'expired'; }).slice(0, 8);
    if (recent.length) {
      html += card(
        secHead('🕐 Ultimele Predicții', '#64748b')
        + recent.map(function (e) {
          var col = e.result === 'won' ? '#22c55e' : e.result === 'lost' ? '#ef4444' : '#f59e0b';
          var icon = e.result === 'won' ? '✅' : e.result === 'lost' ? '❌' : '⏳';
          var dt = (e.eventDate || e.savedAt || '').slice(5, 10).replace('-', '.');
          return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
            + '<span>' + icon + '</span>'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:11px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (e.home || '') + (e.away ? ' — ' + e.away : '') + '</div>'
            + '<div style="font-size:10px;color:#22c55e">' + (MKT[e.market] || e.market || '') + (e.odds ? ' @' + e.odds : '') + '</div>'
            + '</div>'
            + '<div style="text-align:right">'
            + '<div style="font-size:10px;color:#64748b">' + dt + '</div>'
            + '<div style="font-size:10px;font-weight:700;color:' + col + '">' + e.result.toUpperCase() + '</div>'
            + '</div>'
            + '</div>';
        }).join(''),
        'rgba(34,197,94,.12)'
      );
    }

    return html;
  }

  // ─── APEX ────────────────────────────────────────────────────────────────────

  function apexStats() {
    var log = Array.isArray(window.RECOMMENDATION_LOG) ? window.RECOMMENDATION_LOG : [];
    var settled = log.filter(function (r) { return r.won === true || r.won === false; });

    if (!settled.length) return '<div style="text-align:center;padding:48px 20px;color:#64748b;font-size:13px">Fără predicții APEX decontate în log.</div>';

    var wins = settled.filter(function (r) { return r.won === true; });
    var wr = Math.round(wins.length / settled.length * 100);
    var roiSum = 0;
    settled.forEach(function (r) { roiSum += r.won ? ((r.odds || 1.5) - 1) : -1; });
    var roi = Math.round(roiSum / settled.length * 100);
    var edgeSum = 0;
    settled.forEach(function (r) { edgeSum += (r.edge_pct || 0); });
    var avgEdge = settled.length ? parseFloat((edgeSum / settled.length).toFixed(1)) : 0;

    var html = '';

    html += card(
      secHead('⚡ APEX Neural Engine — Rezumat', '#818cf8')
      + overviewBlock(donut(wr, '#818cf8', 84),
        statRow('Decontate', settled.length)
        + statRow('Win', wins.length, '#22c55e')
        + statRow('Loss', settled.length - wins.length, '#ef4444')
        + statRow('Edge mediu', (avgEdge >= 0 ? '+' : '') + avgEdge + '%', avgEdge >= 2 ? '#22c55e' : '#f59e0b')
        + '<div style="border-top:1px solid rgba(99,102,241,.2);margin-top:5px;padding-top:5px">'
        + statRow('ROI', roiStr(roi), roiCol(roi))
        + '</div>'
      )
      + secHead('Trend Win Rate', '#64748b')
      + lineChart(
          trendFromLog(settled,
            function (r) { return (r.date || '').slice(0, 10); },
            function (r) { return r.won === true; }
          ),
          280, 80, '#818cf8'),
      'rgba(99,102,241,.2)'
    );

    var mktRows = computeMarkets(settled,
      function (r) { return r.market_key || r.market || 'unknown'; },
      function (r) { return r.won === true; },
      function (r) { return r.odds || 1.5; }
    );
    if (mktRows.length) html += card(secHead('📊 Per Piață', '#64748b') + hBars(mktRows), 'rgba(99,102,241,.12)');

    var lgRows = computeLeagues(settled,
      function (r) { return r.league; },
      function (r) { return r.won === true; },
      function (r) { return r.odds || 1.5; }
    );
    if (lgRows.length) html += card(secHead('🌍 Per Ligă — Top 6', '#64748b') + hBars(lgRows), 'rgba(99,102,241,.12)');

    var bands = [
      { label: '≥80% încredere', min: 80, max: 101 },
      { label: '70–79%', min: 70, max: 80 },
      { label: '60–69%', min: 60, max: 70 },
      { label: '<60%', min: 0, max: 60 }
    ];
    var bandRows = bands.map(function (b) {
      var bp = settled.filter(function (r) { var c = r.confidence || r.model_prob || 0; return c >= b.min && c < b.max; });
      var bw = bp.filter(function (r) { return r.won === true; });
      var bRoi = 0;
      if (bp.length) { var s = 0; bp.forEach(function (r) { s += r.won ? (r.odds || 1.5) - 1 : -1; }); bRoi = Math.round(s / bp.length * 100); }
      return { label: b.label, wr: bp.length ? Math.round(bw.length / bp.length * 100) : 0, roi: bRoi, total: bp.length };
    }).filter(function (r) { return r.total > 0; });
    if (bandRows.length) html += card(secHead('🎯 Per Nivel Încredere', '#64748b') + hBars(bandRows), 'rgba(99,102,241,.12)');

    return html;
  }

  // ─── Meciuri ─────────────────────────────────────────────────────────────────

  function meciuriStats() {
    var preds = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    var log = Array.isArray(window.RECOMMENDATION_LOG) ? window.RECOMMENDATION_LOG : [];
    var settled = log.filter(function (r) { return r.won === true || r.won === false; });
    var wins = settled.filter(function (r) { return r.won === true; });

    var html = '';

    if (preds.length) {
      var liveStatuses = ['inprogress', 'live', 'in_progress', '1h', '2h', 'ht', 'et', 'break'];
      var liveCount = preds.filter(function (m) { return liveStatuses.indexOf(String(m.status || '').toLowerCase()) >= 0; }).length;

      // Meciuri eligibile = trec de passesSelectionFilter (acelaşi filtru ca tab-ul Meciuri)
      var eligibleMatches = preds.filter(function (m) {
        if (typeof passesSelectionFilter === 'function') return passesSelectionFilter(m);
        return m.analysisState === 'ELIGIBLE' && m.bestBet;
      });
      var pendingCount = eligibleMatches.filter(function (m) {
        return liveStatuses.indexOf(String(m.status || '').toLowerCase()) < 0;
      }).length;

      var leagueMap = {};
      preds.forEach(function (m) {
        var l = m.league || m.competition || 'Altele';
        if (typeof l === 'object' && l !== null) l = l.name || 'Altele';
        leagueMap[l] = (leagueMap[l] || 0) + 1;
      });
      var topLeagues = Object.keys(leagueMap).sort(function (a, b) { return leagueMap[b] - leagueMap[a]; }).slice(0, 8);

      html += card(
        secHead('⚽ Meciuri Afișate Azi', '#2BE5C5')
        + '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">'
        + '<div style="flex:1;min-width:70px;text-align:center;background:rgba(43,229,197,.07);border:1px solid rgba(43,229,197,.2);border-radius:10px;padding:10px 6px">'
        + '<div style="font-size:22px;font-weight:900;color:#2BE5C5">' + preds.length + '</div>'
        + '<div style="font-size:9px;color:#64748b;margin-top:2px">Total API</div>'
        + '</div>'
        + '<div style="flex:1;min-width:70px;text-align:center;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:10px 6px">'
        + '<div style="font-size:22px;font-weight:900;color:#fbbf24">' + pendingCount + '</div>'
        + '<div style="font-size:9px;color:#64748b;margin-top:2px">Predicții eligibile</div>'
        + '</div>'
        + '<div style="flex:1;min-width:70px;text-align:center;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:10px 6px">'
        + '<div style="font-size:22px;font-weight:900;color:#22c55e">' + liveCount + '</div>'
        + '<div style="font-size:9px;color:#64748b;margin-top:2px">Live acum</div>'
        + '</div>'
        + '<div style="flex:1;min-width:70px;text-align:center;background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:10px 6px">'
        + '<div style="font-size:22px;font-weight:900;color:#818cf8">' + Object.keys(leagueMap).length + '</div>'
        + '<div style="font-size:9px;color:#64748b;margin-top:2px">Ligi</div>'
        + '</div>'
        + '</div>'
        + secHead('Top Ligi Azi', '#64748b')
        + topLeagues.map(function (l) {
          var cnt = leagueMap[l];
          var bW = Math.round(cnt / preds.length * 180);
          return '<div style="margin-bottom:6px">'
            + '<div style="display:flex;justify-content:space-between;margin-bottom:2px">'
            + '<span style="font-size:11px;color:var(--txt)">' + String(l).slice(0, 28) + '</span>'
            + '<span style="font-size:10px;color:#2BE5C5;font-weight:700">' + cnt + '</span>'
            + '</div>'
            + '<div style="height:5px;border-radius:3px;background:rgba(255,255,255,.06)">'
            + '<div style="height:5px;width:' + bW + 'px;max-width:100%;border-radius:3px;background:rgba(43,229,197,.5)"></div>'
            + '</div>'
            + '</div>';
        }).join(''),
        'rgba(43,229,197,.2)'
      );
    }

    if (settled.length) {
      var wr = Math.round(wins.length / settled.length * 100);
      var roiSum = 0;
      settled.forEach(function (r) { roiSum += r.won ? ((r.odds || 1.5) - 1) : -1; });
      var roi = Math.round(roiSum / settled.length * 100);

      html += card(
        secHead('📈 Performanță Predicții Istorice', '#f59e0b')
        + overviewBlock(donut(wr, '#f59e0b', 84),
          statRow('Total decontate', settled.length)
          + statRow('Win', wins.length, '#22c55e')
          + statRow('Loss', settled.length - wins.length, '#ef4444')
          + '<div style="border-top:1px solid rgba(245,158,11,.15);margin-top:5px;padding-top:5px">'
          + statRow('ROI', roiStr(roi), roiCol(roi))
          + '</div>'
        )
        + secHead('Trend Win Rate', '#64748b')
        + lineChart(
            trendFromLog(settled,
              function (r) { return (r.date || '').slice(0, 10); },
              function (r) { return r.won === true; }
            ),
            280, 80, '#f59e0b'),
        'rgba(245,158,11,.2)'
      );

      var mktRows = computeMarkets(settled,
        function (r) { return r.market_key || r.market || 'unknown'; },
        function (r) { return r.won === true; },
        function (r) { return r.odds || 1.5; }
      );
      if (mktRows.length) html += card(secHead('📊 Per Piață', '#64748b') + hBars(mktRows), 'rgba(245,158,11,.12)');
    } else if (!preds.length) {
      html += '<div style="text-align:center;padding:40px 20px;color:#64748b;font-size:13px">Date indisponibile.</div>';
    }

    return html;
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  var TABS = [
    { id: 'claude',   label: '🤖 AI Claude', col: '#2BE5C5' },
    { id: 'ml5',      label: '🧠 ML5',       col: '#22c55e' },
    { id: 'apex',     label: '⚡ APEX',      col: '#818cf8' },
    { id: 'meciuri',  label: '⚽ Meciuri',   col: '#f59e0b' }
  ];

  window.renderStatisticiTab = function () {
    var root = document.getElementById('statistici-root');
    if (!root) return;

    var activeTab = window._statsTab || 'claude';

    var html = '<div style="padding:0 4px 24px">';

    html += '<div style="background:linear-gradient(135deg,rgba(43,229,197,.1),rgba(99,102,241,.08));border:1px solid rgba(43,229,197,.2);border-radius:16px;padding:16px 18px;margin-bottom:14px">'
      + '<div style="font-size:17px;font-weight:900;color:var(--txt,#e2e8f0)">📊 Statistici Predicții</div>'
      + '<div style="font-size:11px;color:#64748b;margin-top:3px">Win rate · ROI · Trend · Per piață · Per ligă</div>'
      + '</div>';

    html += '<div style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch">';
    TABS.forEach(function (t) {
      var active = activeTab === t.id;
      html += '<button onclick="window._statsTab=\'' + t.id + '\';renderStatisticiTab()" style="'
        + 'flex-shrink:0;padding:7px 14px;border-radius:20px;cursor:pointer;'
        + 'border:1px solid ' + t.col + (active ? '70' : '28') + ';'
        + 'background:' + (active ? t.col + '18' : 'transparent') + ';'
        + 'color:' + (active ? t.col : '#64748b') + ';'
        + 'font-size:12px;font-weight:' + (active ? '800' : '500') + '">'
        + t.label + '</button>';
    });
    html += '</div>';

    if (activeTab === 'claude') html += claudeStats();
    else if (activeTab === 'ml5') html += ml5Stats();
    else if (activeTab === 'apex') html += apexStats();
    else html += meciuriStats();

    html += '</div>';
    root.innerHTML = html;
  };

})();
