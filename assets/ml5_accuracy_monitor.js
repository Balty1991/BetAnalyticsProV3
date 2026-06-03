/**
 * VEYRA — ML5 Accuracy Monitor v6
 * Înregistrează AUTOMAT toate predicțiile ML5 curente ca "în așteptare".
 * Nu necesită adăugare manuală în tracking.
 * Rezultatele se pot sincroniza din TRACKING (dacă userul a plasat și bilete).
 */
(function () {
  'use strict';
  if (window.__veyraML5AccMonV1) return;
  window.__veyraML5AccMonV1 = true;

  var STORAGE_KEY = 'veyra_ml5_accuracy_log';
  var MAX_ENTRIES = 1000;

  /* ─── helpers ─── */
  function norm(s) {
    try { s = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch(e) { s = String(s || ''); }
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function safeN(v, d) { var x = Number(v || 0); return isFinite(x) ? x : (d == null ? 0 : d); }
  function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }
  function normalizeResult(status) {
    var s = String(status || '').toLowerCase().trim();
    if (s === 'win' || s === 'won') return 'won';
    if (s === 'lose' || s === 'lost') return 'lost';
    return 'pending';
  }
  function teamMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    var as = na.split(' ').slice(0, 2).join(' ');
    var bs = nb.split(' ').slice(0, 2).join(' ');
    if (as.length >= 3 && nb.indexOf(as) >= 0) return true;
    if (bs.length >= 3 && na.indexOf(bs) >= 0) return true;
    var aw = na.split(' ')[0], bw = nb.split(' ')[0];
    if (aw.length >= 4 && bw.length >= 4 && aw === bw) return true;
    return false;
  }
  function entryKey(home, away, eventDate) {
    return norm(home) + '|' + norm(away) + '|' + String(eventDate || '').substring(0, 10);
  }

  /* ─── storage ─── */
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveLog(log) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify((log || []).slice(0, MAX_ENTRIES))); } catch(e) {}
  }

  /* ─── expirare predicții vechi (nu mai sunt în ALL_MATCHES + data trecută) ─── */
  function expireOldPredictions() {
    var log = loadLog();
    if (!log.length) return 0;
    var matches = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    var activeEids = {}, activeKeys = {};
    matches.forEach(function (m) {
      if (!m) return;
      if (m.eventId) activeEids[String(m.eventId)] = true;
      activeKeys[entryKey(m.home, m.away, m.event_date || m.eventDate || m.date || '')] = true;
    });
    var now = Date.now();
    var changed = 0;
    log.forEach(function (e) {
      if (!e.autoTracked || e.result !== 'pending') return;
      var isActive = (e.eventId && activeEids[e.eventId]) || activeKeys[entryKey(e.home, e.away, e.eventDate)];
      if (isActive) return;
      // Nu mai e în datele curente — verificăm data evenimentului
      var evTs = e.eventDate ? new Date(e.eventDate).getTime() : 0;
      var saveTs = e.savedAt ? new Date(e.savedAt).getTime() : 0;
      var ref = evTs > 0 ? evTs : saveTs;
      if (ref > 0 && (now - ref) > 12 * 3600 * 1000) {
        e.result = 'expired'; changed++;
      }
    });
    if (changed > 0) saveLog(log);
    return changed;
  }

  /* ─── auto-înregistrare din ALL_MATCHES ─── */
  function autoRegisterPredictions() {
    var matches = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
    // Același filtru ca renderML5Analysis + renderML5MatchCard: isEnriched + bestBet
    var preds = matches.filter(function (m) {
      return m && m.isEnriched && m.bestBet && m.smartScore > 0;
    });

    var log = loadLog();

    // Purge stale autoTracked pending entries not present in current preds.
    // This handles future-dated stale entries that expireOldPredictions() misses.
    if (preds.length > 0) {
      var predEids = {}, predKeys = {};
      preds.forEach(function (m) {
        var eid = m.eventId ? String(m.eventId) : '';
        var ed  = m.event_date || m.eventDate || m.date || '';
        if (eid) predEids[eid] = true;
        predKeys[entryKey(m.home, m.away, ed)] = true;
      });
      var lenBefore = log.length;
      log = log.filter(function (e) {
        if (!e.autoTracked || e.result !== 'pending') return true;
        return (e.eventId && predEids[e.eventId]) || predKeys[entryKey(e.home, e.away, e.eventDate)];
      });
      if (log.length !== lenBefore) saveLog(log);
    }

    if (!preds.length) return 0;

    var existingKeys = {};
    var existingEids = {};
    log.forEach(function (e) {
      existingKeys[entryKey(e.home, e.away, e.eventDate)] = true;
      if (e.eventId) existingEids[String(e.eventId)] = true;
    });

    var added = 0;
    preds.forEach(function (m) {
      var eid = m.eventId ? String(m.eventId) : '';
      var ed  = m.event_date || m.eventDate || m.date || '';
      var key = entryKey(m.home, m.away, ed);

      if ((eid && existingEids[eid]) || existingKeys[key]) return;

      var b = m.bestBet || {};
      var f = b.ml5Factors || {};
      log.unshift({
        eventId:     eid,
        savedAt:     new Date().toISOString(),
        ticketId:    null,
        home:        m.home || '',
        away:        m.away || '',
        league:      m.league || m.leagueName || '',
        eventDate:   ed,
        betLabel:    b.label || '',
        market:      b.type || '',
        trackOdds:   safeN(b.odds),
        trackProb:   safeN(b.adjProb || b.prob),
        ml5Score:    safeN(m.smartScore),
        ml5Prob:     safeN(b.adjProb || b.prob), // stored as 0–100 (adjProb is %)

        ml5Odds:     safeN(b.odds),
        factors: {
          form: safeN(f.formFactor, 1),
          h2h:  safeN(f.h2hFactor, 1),
          abs:  safeN(f.absenceFactor, 1),
          tact: safeN(f.tactFactor, 1)
        },
        result:      'pending',
        autoTracked: true
      });
      added++;
      if (eid) existingEids[eid] = true;
      existingKeys[key] = true;
    });

    if (added > 0) saveLog(log);
    return added;
  }

  /* ─── sincronizare rezultate din TRACKING (bilete manuale) ─── */
  function syncFromTracking() {
    var TRACKING = Array.isArray(window.TRACKING) ? window.TRACKING : [];
    if (!TRACKING.length) return 0;
    var log = loadLog();
    if (!log.length) return 0;
    var changed = 0;

    log.forEach(function (entry) {
      if (entry.result !== 'pending') return;
      for (var i = 0; i < TRACKING.length; i++) {
        var ticket = TRACKING[i];
        if (!ticket || !Array.isArray(ticket.picks)) continue;
        var tickRes = normalizeResult(ticket.status);
        if (tickRes === 'pending') continue;

        var found = ticket.picks.some(function (pick) {
          if (!pick) return false;
          if (entry.eventId && pick.eventId && String(pick.eventId) === entry.eventId) return true;
          return teamMatch(pick.home || '', entry.home) && teamMatch(pick.away || '', entry.away);
        });
        if (found) {
          entry.result = tickRes;
          changed++;
          break;
        }
      }
    });

    if (changed > 0) saveLog(log);
    return changed;
  }

  /* ─── hook pe syncRecommendationEngine (date noi) ─── */
  function hookSyncRec() {
    if (window.__ml5AccSyncRecHooked) return;
    if (typeof window.syncRecommendationEngine !== 'function') return;
    window.__ml5AccSyncRecHooked = true;
    var orig = window.syncRecommendationEngine;
    window.syncRecommendationEngine = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        autoRegisterPredictions();
        syncFromTracking();
        var tab = document.getElementById('tab-ml5');
        if (tab && tab.classList.contains('active')) injectMonitor();
      }, 400);
      return r;
    };
  }

  /* ─── hook pe renderML5Analysis ─── */
  function hookRender() {
    if (window.__ml5AccRenderHooked) return;
    if (typeof window.renderML5Analysis !== 'function') return;
    window.__ml5AccRenderHooked = true;
    var orig = window.renderML5Analysis;
    window.renderML5Analysis = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        autoRegisterPredictions();
        syncFromTracking();
        injectMonitor();
      }, 100);
      return r;
    };
  }

  /* ─── hook pe switchTab ─── */
  function hookTabSwitch() {
    if (window.__ml5AccTabHooked) return;
    if (typeof window.switchTab !== 'function') return;
    window.__ml5AccTabHooked = true;
    var orig = window.switchTab;
    window.switchTab = function (name) {
      var r = orig.apply(this, arguments);
      if (String(name) === 'ml5') {
        setTimeout(function () {
          autoRegisterPredictions();
          syncFromTracking();
          injectMonitor();
        }, 300);
      }
      return r;
    };
  }

  /* ─── calcule statistici ─── */
  function calcStats(entries) {
    var active  = entries.filter(function (e) { return e.result !== 'expired'; });
    var settled = active.filter(function (e) { return e.result === 'won' || e.result === 'lost'; });
    var wins    = settled.filter(function (e) { return e.result === 'won'; }).length;
    var pending = active.filter(function (e) { return e.result === 'pending'; });

    var bands = [
      { label: '≥ 85', min: 85, max: 101 },
      { label: '75 – 84', min: 75, max: 85 },
      { label: '65 – 74', min: 65, max: 75 },
      { label: '55 – 64', min: 55, max: 65 },
      { label: '< 55',   min: 0,  max: 55 }
    ];
    var byBand = bands.map(function (b) {
      var bE = settled.filter(function (e) { return e.ml5Score >= b.min && e.ml5Score < b.max; });
      var bW = bE.filter(function (e) { return e.result === 'won'; }).length;
      return { label: b.label, total: bE.length, wins: bW, pct: pct(bW, bE.length) };
    });

    var byMarket = {};
    settled.forEach(function (e) {
      var k = e.betLabel || e.market || '—';
      if (!byMarket[k]) byMarket[k] = { total: 0, wins: 0 };
      byMarket[k].total++;
      if (e.result === 'won') byMarket[k].wins++;
    });

    return {
      total:    active.length,
      settled:  settled.length,
      wins:     wins,
      pending:  pending.length,
      byBand:   byBand,
      byMarket: byMarket
    };
  }

  /* ─── UI helpers ─── */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }
  function colorWR(v) {
    if (v >= 60) return '#22c55e';
    if (v >= 50) return '#f59e0b';
    return '#ef4444';
  }
  function bar(p, col) {
    return '<div style="height:5px;border-radius:3px;background:rgba(255,255,255,.07);margin-top:5px;overflow:hidden">' +
      '<div style="height:100%;width:' + Math.min(100, p) + '%;background:' + col + ';border-radius:3px;transition:width .4s"></div></div>';
  }
  function pill(label, val, col) {
    return '<div style="flex:1;min-width:70px;padding:10px 6px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);text-align:center">' +
      '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;line-height:1.3">' + label + '</div>' +
      '<div style="font-size:18px;font-weight:900;color:' + col + '">' + val + '</div>' +
    '</div>';
  }

  /* ─── render ─── */
  function renderMonitorSection() {
    var log   = loadLog();
    var stats = calcStats(log);

    var overallWR  = stats.settled > 0 ? pct(stats.wins, stats.settled) : null;
    var overallCol = overallWR !== null ? colorWR(overallWR) : 'var(--muted)';

    var hdr =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        pill('🎯 Predicții<br>ML5', stats.total, '#a78bfa') +
        pill('✅ Decontate', stats.settled, '#3b82f6') +
        pill('📈 Win Rate', overallWR !== null ? overallWR + '%' : '—', overallCol) +
        pill('⏳ În<br>așteptare', stats.pending, '#f59e0b') +
      '</div>';

    /* bands */
    var bandRows = stats.byBand.map(function (b) {
      if (!b.total) return '';
      var c = colorWR(b.pct);
      return '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px">' +
          '<span style="color:var(--txt);font-weight:700">ML5 ' + esc(b.label) + '</span>' +
          '<span style="color:' + c + ';font-weight:900">' + b.pct + '%</span>' +
          '<span style="color:var(--muted)">' + b.wins + '/' + b.total + '</span>' +
        '</div>' + bar(b.pct, c) + '</div>';
    }).join('');
    var bandsSection = bandRows ?
      '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:14px">' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Acuratețe pe bandă scor ML5</div>' +
        bandRows + '</div>' : '';

    /* by market */
    var mktKeys = Object.keys(stats.byMarket).sort(function (a, b) {
      return stats.byMarket[b].total - stats.byMarket[a].total;
    }).slice(0, 6);
    var mktRows = mktKeys.map(function (k) {
      var m  = stats.byMarket[k];
      var wp = pct(m.wins, m.total);
      var c  = colorWR(wp);
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px">' +
        '<span style="color:var(--txt);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(k) + '</span>' +
        '<span style="color:' + c + ';font-weight:900;margin-left:10px">' + wp + '%</span>' +
        '<span style="color:var(--muted);margin-left:8px">' + m.wins + '/' + m.total + '</span>' +
      '</div>';
    }).join('');
    var mktSection = mktRows ?
      '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:14px">' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Acuratețe pe piață (decontate)</div>' +
        mktRows + '</div>' : '';

    /* recent */
    var recentRows = log.slice(0, 15).map(function (e) {
      var icon = e.result === 'won' ? '✅' : e.result === 'lost' ? '❌' : '⏳';
      var rc   = e.result === 'won' ? '#22c55e' : e.result === 'lost' ? '#ef4444' : '#f59e0b';
      var sc   = e.ml5Score >= 80 ? '#22c55e' : e.ml5Score >= 65 ? '#2BE5C5' : '#f59e0b';
      var dateStr = e.eventDate ? ('<span>' + String(e.eventDate).substring(0, 10) + '</span>') : '';
      return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<span style="font-size:12px;font-weight:700;color:var(--txt);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.home) + ' vs ' + esc(e.away) + '</span>' +
          '<span style="font-size:11px;font-weight:900;color:' + sc + ';white-space:nowrap">ML5 ' + e.ml5Score + '</span>' +
          '<span style="font-size:16px">' + icon + '</span>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<span>' + esc(e.betLabel || '—') + '</span>' +
          (e.ml5Prob > 0 ? '<span>prob ' + (e.ml5Prob > 1 ? Math.round(e.ml5Prob) : Math.round(e.ml5Prob * 100)) + '%</span>' : '') +
          (e.trackOdds > 1 ? '<span>@ ' + safeN(e.trackOdds).toFixed(2) + '</span>' : '') +
          dateStr +
          '<span style="color:' + rc + ';font-weight:700">' + (e.result === 'pending' ? 'în așteptare' : e.result) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    var recentSection = recentRows ?
      '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:14px">' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Predicții înregistrate (ultimele 15)</div>' +
        recentRows + '</div>' : '';

    var pendingNote = stats.pending > 0 && stats.settled === 0 ?
      '<div style="font-size:11px;color:var(--muted);background:rgba(43,229,197,.05);border:1px solid rgba(43,229,197,.15);border-radius:10px;padding:8px 12px;margin-bottom:14px">' +
        'ℹ️ Predicțiile sunt salvate automat. Acuratețea se va calcula după ce meciurile sunt jucate.' +
      '</div>' : '';

    var emptyMsg = !stats.total ?
      '<div style="text-align:center;padding:24px 16px;color:var(--muted);font-size:12px;line-height:1.7;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:14px">' +
        '<div style="font-size:24px;margin-bottom:8px">🔬</div>' +
        '<strong style="color:var(--txt);display:block;margin-bottom:6px">Se încarcă predicțiile ML5...</strong>' +
        'Predicțiile se înregistrează automat la deschiderea acestui tab.' +
      '</div>' : '';

    var clearBtn = stats.total > 0 ?
      '<div style="text-align:right;margin-bottom:8px">' +
        '<button onclick="window.__ml5AccClear && window.__ml5AccClear()" ' +
          'style="font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline">Resetează istoricul</button>' +
      '</div>' : '';

    return '<div id="ml5-acc-monitor" style="margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07)">' +
      '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:12px;display:flex;align-items:center;gap:6px">' +
        '📊 Monitor Acuratețe ML5' +
      '</div>' +
      hdr + pendingNote + bandsSection + mktSection + recentSection + emptyMsg + clearBtn +
    '</div>';
  }

  /* ─── inject în tab-ml5 ─── */
  function injectMonitor() {
    var root = document.getElementById('ml5-root');
    if (!root) return;
    var existing = document.getElementById('ml5-acc-monitor');
    if (existing) { existing.outerHTML = renderMonitorSection(); return; }
    var div = document.createElement('div');
    div.innerHTML = renderMonitorSection();
    var child = div.firstElementChild;
    if (child) root.appendChild(child);
  }

  /* ─── comenzi publice ─── */
  window.__ml5AccClear = function () {
    if (!confirm('Resetezi tot istoricul de predicții ML5?')) return;
    localStorage.removeItem(STORAGE_KEY);
    autoRegisterPredictions();
    syncFromTracking();
    injectMonitor();
  };
  window.__ml5AccRescan = function () {
    var a = autoRegisterPredictions();
    var s = syncFromTracking();
    injectMonitor();
    return 'Adăugate: ' + a + ', Sincronizate: ' + s;
  };

  /* ─── boot ─── */
  function boot() {
    hookSyncRec();
    hookRender();
    hookTabSwitch();

    [600, 1500, 3000, 6000, 12000].forEach(function (d) {
      setTimeout(function () {
        autoRegisterPredictions();
        syncFromTracking();
        hookSyncRec();
        hookRender();
        hookTabSwitch();
        var tab = document.getElementById('tab-ml5');
        if (tab && tab.classList.contains('active')) injectMonitor();
      }, d);
    });

    var tab = document.getElementById('tab-ml5');
    if (tab && tab.classList.contains('active')) {
      setTimeout(function () {
        autoRegisterPredictions();
        syncFromTracking();
        injectMonitor();
      }, 400);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
