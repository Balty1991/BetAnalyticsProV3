/**
 * upcoming_events_runtime.js
 * Afișează TOATE evenimentele din events.json (565 total) grupate pe date,
 * cu predicții calculate pe baza datelor ML, cote și formă.
 */
(function () {
  'use strict';
  if (window.__veyraUpcomingV1) return;
  window.__veyraUpcomingV1 = true;

  var _activeDate = null;
  var _rendered   = false;

  /* ── Hook switchTab ─────────────────────────────────────────────────── */
  function hookSwitchTab() {
    if (typeof window.switchTab !== 'function') { setTimeout(hookSwitchTab, 150); return; }
    var orig = window.switchTab;
    window.switchTab = function (name) {
      orig.apply(this, arguments);
      if (name === 'upcoming') setTimeout(renderUpcomingTab, 80);
    };
  }

  /* ── Helpers de dată ────────────────────────────────────────────────── */
  function todayIso()    { return new Date().toISOString().slice(0, 10); }
  function tomorrowIso() { var d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

  function formatTime(dateStr) {
    if (!dateStr) return '--:--';
    try {
      var d = new Date(dateStr);
      if (!isFinite(d.getTime())) return '--:--';
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    } catch(e) { return '--:--'; }
  }

  function formatDateLabel(iso) {
    var today    = todayIso();
    var tomorrow = tomorrowIso();
    if (iso === today)    return 'Azi';
    if (iso === tomorrow) return 'Mâine';
    var d = new Date(iso + 'T12:00:00');
    var DAYS   = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
    var MONTHS = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* ── Prediction engine ──────────────────────────────────────────────── */

  function buildPredLookup() {
    var preds = Array.isArray(window.__RAW_PREDICTIONS) ? window.__RAW_PREDICTIONS : [];
    var lookup = {};
    preds.forEach(function (p) {
      if (!p) return;
      var id = p.id || (p.event && p.event.id);
      if (id != null) lookup[String(id)] = p;
    });
    return lookup;
  }

  var MKT_LABELS = {
    home_win:  '1 — Victorie gazdă',
    draw:      'X — Egal',
    away_win:  '2 — Victorie oaspete',
    over_15:   'Over 1.5 goluri',
    over_25:   'Over 2.5 goluri',
    over_35:   'Over 3.5 goluri',
    under_25:  'Under 2.5 goluri',
    btts_yes:  'Ambele marchează',
    btts_no:   'Min. o echipă nu marchează',
    dc_1x:     'Șansă dublă 1X',
    dc_x2:     'Șansă dublă X2',
    dc_12:     'Șansă dublă 12'
  };
  var MKT_COLORS = {
    home_win:  '#22c55e',
    draw:      '#f59e0b',
    away_win:  '#60a5fa',
    over_15:   '#a78bfa',
    over_25:   '#a78bfa',
    over_35:   '#a78bfa',
    under_25:  '#34d399',
    btts_yes:  '#f472b6',
    btts_no:   '#94a3b8',
    dc_1x:     '#2BE5C5',
    dc_x2:     '#2BE5C5',
    dc_12:     '#2BE5C5'
  };

  function calcPrediction(ev, pred) {
    var markets = [];
    var hasMl = false;

    if (pred) {
      hasMl = true;
      var ph = Number(pred.prob_home_win || 0);
      var pd = Number(pred.prob_draw     || 0);
      var pa = Number(pred.prob_away_win || 0);
      var po25 = Number(pred.prob_over_25   || 0);
      var po15 = Number(pred.prob_over_15   || 0);
      var pbtts = Number(pred.prob_btts_yes || 0);

      if (ph  > 0) markets.push({ key: 'home_win', prob: ph,   source: 'ML' });
      if (pd  > 0) markets.push({ key: 'draw',     prob: pd,   source: 'ML' });
      if (pa  > 0) markets.push({ key: 'away_win', prob: pa,   source: 'ML' });
      if (po25 > 0) markets.push({ key: 'over_25', prob: po25, source: 'ML' });
      if (po15 > 0) markets.push({ key: 'over_15', prob: po15, source: 'ML' });
      if (pbtts > 0) markets.push({ key: 'btts_yes', prob: pbtts, source: 'ML' });

      /* best_market from the engine has edge/EV calc — prefer it */
      var bm = pred.best_market;
      if (bm && bm.market_key && bm.prob > 0) {
        var bmKey = bm.market_key;
        var existing = markets.filter(function(m){ return m.key === bmKey; })[0];
        if (existing) existing.isBest = true;
      }

    } else if (ev.odds_home && ev.odds_draw && ev.odds_away) {
      /* Derive no-vig probabilities from 1X2 odds */
      var inv1 = 1 / ev.odds_home, invX = 1 / ev.odds_draw, inv2 = 1 / ev.odds_away;
      var total = inv1 + invX + inv2;
      markets.push({ key: 'home_win', prob: (inv1 / total) * 100, source: 'Cote' });
      markets.push({ key: 'draw',     prob: (invX / total) * 100, source: 'Cote' });
      markets.push({ key: 'away_win', prob: (inv2 / total) * 100, source: 'Cote' });

      if (ev.odds_over_25 && ev.odds_under_25) {
        var invOv = 1 / ev.odds_over_25, invUn = 1 / ev.odds_under_25;
        var tot25 = invOv + invUn;
        markets.push({ key: 'over_25',  prob: (invOv / tot25) * 100, source: 'Cote' });
        markets.push({ key: 'under_25', prob: (invUn / tot25) * 100, source: 'Cote' });
      }
    }

    if (!markets.length) return null;

    /* Sort by probability descending — mark highest as best if not already marked */
    markets.sort(function (a, b) { return b.prob - a.prob; });
    var hasBest = markets.some(function(m){ return m.isBest; });
    if (!hasBest) markets[0].isBest = true;

    /* Separate 1X2 markets and best pick */
    var one = markets.filter(function(m){ return m.key === 'home_win'; })[0];
    var x   = markets.filter(function(m){ return m.key === 'draw'; })[0];
    var two = markets.filter(function(m){ return m.key === 'away_win'; })[0];
    var best = markets.filter(function(m){ return m.isBest; })[0] || markets[0];

    return {
      one: one ? Math.round(one.prob) : null,
      x:   x   ? Math.round(x.prob)   : null,
      two: two  ? Math.round(two.prob) : null,
      best: {
        key:    best.key,
        label:  MKT_LABELS[best.key] || best.key,
        color:  MKT_COLORS[best.key] || '#94a3b8',
        prob:   Math.round(best.prob),
        source: best.source
      },
      confidence: best.prob >= 65 ? 'high' : best.prob >= 52 ? 'medium' : 'low',
      hasMl: hasMl,
      allMarkets: markets
    };
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  function renderUpcomingTab() {
    var el = document.getElementById('tab-upcoming');
    if (!el || !el.classList.contains('active')) return;

    /* Ensure events data is loaded */
    var events = Array.isArray(window.ALL_EVENTS) ? window.ALL_EVENTS : [];
    if (!events.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)">'
        + '<div style="font-size:28px;margin-bottom:10px">⏳</div>'
        + '<div style="font-size:13px">Se încarcă evenimentele…</div></div>';
      if (typeof window.loadLazyDataset === 'function') {
        window.loadLazyDataset('events').then(function () { renderUpcomingTab(); });
      }
      return;
    }

    var predLookup = buildPredLookup();
    var today = todayIso();

    /* Filter future + sort */
    var upcoming = events.filter(function (e) {
      return e && (e.event_date || '').slice(0, 10) >= today;
    }).sort(function (a, b) {
      return (a.event_date || '') < (b.event_date || '') ? -1 : 1;
    });

    /* Group by date */
    var byDate = {}, dateOrder = [];
    upcoming.forEach(function (e) {
      var d = (e.event_date || '').slice(0, 10);
      if (!byDate[d]) { byDate[d] = []; dateOrder.push(d); }
      byDate[d].push(e);
    });

    if (!_activeDate || !byDate[_activeDate]) _activeDate = dateOrder[0] || today;

    /* ── HTML ── */
    var html = '<div style="padding:0 0 80px">';

    /* Header */
    html += '<div style="padding:16px 14px 0">'
      + '<div style="font-size:17px;font-weight:900;color:var(--txt)">📅 Evenimente Viitoare</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:2px">'
      + upcoming.length + ' meciuri programate • ' + dateOrder.length + ' zile</div></div>';

    /* Date filter pills */
    html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 8px">'
      + '<div style="display:flex;gap:6px;white-space:nowrap">';

    dateOrder.slice(0, 12).forEach(function (d) {
      var isActive = d === _activeDate;
      var label = formatDateLabel(d);
      var cnt = byDate[d].length;
      html += '<button onclick="window.__veyraUpcomingSetDate(\'' + d + '\')" style="'
        + 'flex-shrink:0;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:11px;font-weight:'
        + (isActive ? '800' : '500') + ';'
        + 'border:1px solid ' + (isActive ? '#3b82f6' : 'rgba(255,255,255,.12)') + ';'
        + 'background:' + (isActive ? 'rgba(59,130,246,.18)' : 'transparent') + ';'
        + 'color:' + (isActive ? '#60a5fa' : 'var(--muted)') + '">'
        + label + ' <span style="opacity:.7">(' + cnt + ')</span></button>';
    });

    if (dateOrder.length > 12) {
      html += '<span style="font-size:10px;color:var(--muted);align-self:center;padding-left:4px">+'
        + (dateOrder.length - 12) + ' zile</span>';
    }

    html += '</div></div>';

    /* Events for selected date */
    var dayEvents = byDate[_activeDate] || [];
    var dayLabel  = formatDateLabel(_activeDate);

    html += '<div style="padding:0 14px">';
    html += '<div style="font-size:12px;font-weight:800;color:var(--txt);margin-bottom:12px">'
      + dayLabel + ' — ' + dayEvents.length + ' meciuri</div>';

    /* Group by league within the day */
    var byLeague = {}, leagueOrder = [];
    dayEvents.forEach(function (e) {
      var lg = (e.league && e.league.name) || 'Altele';
      if (!byLeague[lg]) { byLeague[lg] = []; leagueOrder.push(lg); }
      byLeague[lg].push(e);
    });

    leagueOrder.forEach(function (lgName) {
      var lgEvs = byLeague[lgName];

      /* League header */
      html += '<div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;'
        + 'letter-spacing:.08em;margin:14px 0 8px;display:flex;align-items:center;gap:6px">'
        + '<span style="flex:1;border-bottom:1px solid rgba(255,255,255,.07);padding-bottom:4px">'
        + lgName + '</span>'
        + '<span style="color:rgba(255,255,255,.25);font-size:9px;flex-shrink:0">' + lgEvs.length + '</span>'
        + '</div>';

      lgEvs.forEach(function (ev) {
        var pred = predLookup[String(ev.id)];
        var p    = calcPrediction(ev, pred);
        var time = formatTime(ev.event_date);
        var home = ev.home_team || '?';
        var away = ev.away_team || '?';
        var hasScore = ev.home_score != null && ev.away_score != null;

        var statusBadge = '';
        if (hasScore) {
          statusBadge = '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(34,197,94,.12);color:#22c55e;font-weight:700">FINAL</span>';
        } else if (ev.status && ev.status !== 'notstarted') {
          statusBadge = '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(239,68,68,.15);color:#ef4444;font-weight:700;animation:pulse 1.5s infinite">LIVE</span>';
        }

        html += '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);'
          + 'border-radius:14px;padding:12px;margin-bottom:8px;position:relative">';

        /* Time row */
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          + '<span style="font-size:11px;font-weight:800;color:#94a3b8">'
          + (hasScore ? ev.home_score + ' — ' + ev.away_score : time)
          + '</span>'
          + (statusBadge || '') + '</div>';

        /* Teams */
        html += '<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:' + (p ? '10px' : '0') + '">'
          + '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + home + '</div>'
          + '<div style="font-size:10px;color:rgba(255,255,255,.25);margin:1px 0">vs</div>'
          + '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + away + '</div>'
          + '</div>';

        if (p) {
          /* 1X2 probability bar */
          if (p.one != null && p.x != null && p.two != null) {
            html += '<div style="display:flex;gap:4px;margin-bottom:10px">';
            [
              { label: '1', prob: p.one, color: '#22c55e', key: 'home_win' },
              { label: 'X', prob: p.x,   color: '#f59e0b', key: 'draw'     },
              { label: '2', prob: p.two, color: '#60a5fa', key: 'away_win' }
            ].forEach(function (m) {
              var isTop = p.best.key === m.key;
              html += '<div style="flex:1;text-align:center;padding:5px 4px;border-radius:8px;'
                + 'background:' + (isTop ? 'rgba(' + hexToRgb(m.color) + ',.18)' : 'rgba(255,255,255,.04)') + ';'
                + 'border:1px solid ' + (isTop ? m.color + '44' : 'rgba(255,255,255,.06)') + '">'
                + '<div style="font-size:9px;font-weight:700;color:' + (isTop ? m.color : '#64748b') + '">' + m.label + '</div>'
                + '<div style="font-size:13px;font-weight:900;color:' + (isTop ? m.color : '#94a3b8') + '">' + m.prob + '%</div>'
                + '</div>';
            });
            html += '</div>';
          }

          /* Best pick row */
          var confColor = p.confidence === 'high' ? '#22c55e' : p.confidence === 'medium' ? '#f59e0b' : '#64748b';
          var confLabel = p.confidence === 'high' ? 'Ridicată' : p.confidence === 'medium' ? 'Medie' : 'Scăzută';
          var confDot   = p.confidence === 'high' ? '🟢' : p.confidence === 'medium' ? '🟡' : '⚪';

          /* Only show best pick if different from 1X2 or no 1X2 available */
          var showBestRow = !p.one; /* always show if no 1X2 probs, otherwise it's visible in bar above */
          if (!showBestRow && p.best.key !== 'home_win' && p.best.key !== 'draw' && p.best.key !== 'away_win') {
            showBestRow = true; /* best is O/U or BTTS — show it separately */
          }

          if (showBestRow) {
            html += '<div style="padding:8px 0 0;border-top:1px solid rgba(255,255,255,.06);'
              + 'display:flex;align-items:center;justify-content:space-between">'
              + '<div>'
              + '<div style="font-size:9px;color:var(--muted);margin-bottom:2px">PREDICȚIE</div>'
              + '<div style="font-size:12px;font-weight:800;color:' + p.best.color + '">' + p.best.label + '</div>'
              + '</div>'
              + '<div style="text-align:right">'
              + '<div style="font-size:17px;font-weight:900;color:' + p.best.color + '">' + p.best.prob + '%</div>'
              + '<div style="font-size:9px;color:' + confColor + '">' + confDot + ' ' + confLabel + '</div>'
              + '</div></div>';
          } else {
            /* Just show confidence for 1X2 best */
            html += '<div style="display:flex;justify-content:flex-end;margin-top:2px">'
              + '<span style="font-size:9px;color:' + confColor + '">' + confDot + ' ' + confLabel + '</span>'
              + '</div>';
          }

          /* Source badge */
          html += '<div style="margin-top:6px;display:flex;align-items:center;gap:6px">'
            + '<span style="font-size:9px;color:rgba(255,255,255,.2)">'
            + (p.hasMl ? '🤖 Model ML' : '📊 Cote') + '</span>';

          /* ai_preview button */
          if (ev.ai_preview && ev.ai_preview.text) {
            html += '<button onclick="window.__veyraUpcomingToggleAI(this)" '
              + 'data-preview="' + encodeURIComponent(ev.ai_preview.text.slice(0, 400)) + '" '
              + 'style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(167,139,250,.12);'
              + 'border:1px solid rgba(167,139,250,.3);color:#a78bfa;cursor:pointer">💬 AI Preview</button>';
          }
          html += '</div>';

        } else {
          /* No prediction data */
          html += '<div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:4px">Cote indisponibile</div>';
        }

        html += '</div>'; /* end card */
      });
    });

    html += '</div>'; /* end padding */
    html += '</div>'; /* end outer */

    el.innerHTML = html;
  }

  /* ── Small helpers ──────────────────────────────────────────────────── */
  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ',' + g + ',' + b;
  }

  window.__veyraUpcomingSetDate = function (d) {
    _activeDate = d;
    renderUpcomingTab();
  };

  window.__veyraUpcomingToggleAI = function (btn) {
    var next = btn.nextElementSibling;
    if (next && next.classList.contains('ai-preview-box')) {
      next.remove();
      btn.textContent = '💬 AI Preview';
    } else {
      var text = decodeURIComponent(btn.getAttribute('data-preview') || '');
      var box = document.createElement('div');
      box.className = 'ai-preview-box';
      box.style.cssText = 'margin-top:8px;font-size:10px;line-height:1.5;color:#94a3b8;'
        + 'background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.15);'
        + 'border-radius:8px;padding:8px;';
      box.textContent = text;
      btn.insertAdjacentElement('afterend', box);
      btn.textContent = '💬 Ascunde';
    }
  };

  /* ── Init ───────────────────────────────────────────────────────────── */
  hookSwitchTab();
})();
