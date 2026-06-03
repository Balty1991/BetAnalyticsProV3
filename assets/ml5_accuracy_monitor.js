/**
 * VEYRA — ML5 Accuracy Monitor v4
 * Înregistrează TOATE pariurile din tracking (nu doar cele cu scor ML5).
 * Scorul ML5 se adaugă când / dacă datele sunt disponibile în ALL_MATCHES.
 * Statisticile de acuratețe folosesc doar intrările cu scor ML5 > 0.
 */
(function () {
  'use strict';
  if (window.__veyraML5AccMonV1) return;
  window.__veyraML5AccMonV1 = true;

  var STORAGE_KEY = 'veyra_ml5_accuracy_log';
  var MAX_ENTRIES = 600;

  /* ─── helpers ─── */
  function norm(s) {
    try { s = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch(e) { s = String(s || ''); }
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  function safeN(v, d) { var x = Number(v || 0); return isFinite(x) ? x : (d == null ? 0 : d); }
  function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }
  function normalizeResult(status) {
    var s = String(status || '').toLowerCase().trim();
    if (s === 'win' || s === 'won') return 'won';
    if (s === 'lose' || s === 'lost') return 'lost';
    return 'pending';
  }

  /* ─── storage ─── */
  function loadLog() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveLog(log) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify((log || []).slice(0, MAX_ENTRIES))); } catch(e) {}
  }

  /* ─── extract ML5 data from a match object (returns null if no score) ─── */
  function extractML5(m) {
    if (!m || !(m.smartScore > 0)) return null;
    var f = (m.bestBet && m.bestBet.ml5Factors) || {};
    return {
      ml5Score:    safeN(m.smartScore),
      ml5Prob:     safeN((m.bestBet || {}).adjProb || (m.bestBet || {}).prob),
      ml5Odds:     safeN((m.bestBet || {}).odds),
      ml5Market:   (m.bestBet || {}).label || '',
      ml5League:   m.leagueName || m.league_name || m.league || '',
      ml5EventDate:m.event_date || m.eventDate || m.date || '',
      factors: {
        form: safeN(f.formFactor, 1),
        h2h:  safeN(f.h2hFactor, 1),
        abs:  safeN(f.absenceFactor, 1),
        tact: safeN(f.tactFactor, 1)
      }
    };
  }

  /* ─── find ML5 data for a pick (eventId first, then team names) ─── */
  function findML5ForPick(pick) {
    var home    = pick.home || '';
    var away    = pick.away || '';
    var eventId = pick.eventId ? String(pick.eventId) : '';
    var matches = Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];

    if (eventId) {
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (!m || !(m.smartScore > 0)) continue;
        if (m.eventId && String(m.eventId) === eventId) return extractML5(m);
      }
    }
    for (var j = 0; j < matches.length; j++) {
      var mm = matches[j];
      if (!mm || !(mm.smartScore > 0)) continue;
      var mh = mm.home || mm.homeTeam || mm.home_team || '';
      var ma = mm.away || mm.awayTeam || mm.away_team || '';
      if (teamMatch(mh, home) && teamMatch(ma, away)) return extractML5(mm);
    }
    return null;
  }

  /* ─── build entry (with or without ML5 data) ─── */
  function buildEntry(ticket, pick, ml5, result) {
    return {
      ticketId:  ticket.id,
      savedAt:   ticket.placedAt || ticket.createdAt || new Date().toISOString(),
      home:      pick.home || '',
      away:      pick.away || '',
      eventId:   pick.eventId   || '',
      league:    (ml5 && ml5.ml5League)    || pick.league    || '',
      eventDate: (ml5 && ml5.ml5EventDate) || pick.eventDate || '',
      betLabel:  pick.bet || (ml5 && ml5.ml5Market) || '',
      market:    pick.marketType || '',
      trackOdds: safeN(pick.odds),
      trackProb: safeN(pick.prob),
      ml5Score:  ml5 ? ml5.ml5Score : 0,
      ml5Prob:   ml5 ? ml5.ml5Prob  : 0,
      ml5Odds:   ml5 ? ml5.ml5Odds  : 0,
      factors:   ml5 ? ml5.factors  : null,
      result:    result
    };
  }

  /* ─── intercept TRACKING.unshift ─── */
  function interceptTracking() {
    if (!Array.isArray(window.TRACKING) || window.__ml5AccHooked) return;
    window.__ml5AccHooked = true;
    var TRACKING = window.TRACKING;
    TRACKING.unshift = function () {
      var result = Array.prototype.unshift.apply(this, arguments);
      if (this === TRACKING) {
        try {
          var ticket = arguments[0];
          if (ticket && Array.isArray(ticket.picks)) {
            var log = loadLog();
            var changed = false;
            ticket.picks.forEach(function (pick) {
              if (!pick || (!pick.home && !pick.away)) return;
              var exists = log.some(function (e) {
                return e.ticketId === ticket.id && e.home === pick.home && e.away === pick.away;
              });
              if (exists) return;
              var ml5 = findML5ForPick(pick);
              // Adăugăm chiar și fără ML5 data (ml5Score va fi 0)
              var res = normalizeResult(ticket.status);
              log.unshift(buildEntry(ticket, pick, ml5, res));
              changed = true;
            });
            if (changed) saveLog(log);
          }
        } catch(e) {}
      }
      return result;
    };
  }

  /* ─── retroactive scan: adaugă TOATE pick-urile din TRACKING ─── */
  function scanExistingTracking() {
    var TRACKING = Array.isArray(window.TRACKING) ? window.TRACKING : [];
    if (!TRACKING.length) return 0;
    var log = loadLog();
    var added = 0;
    TRACKING.forEach(function (ticket) {
      if (!ticket || !Array.isArray(ticket.picks)) return;
      ticket.picks.forEach(function (pick) {
        if (!pick || (!pick.home && !pick.away)) return;
        // Omitem pick-urile artificiale (extra tickets)
        if (pick.home === 'Extra' && pick.away === 'Match') return;
        var exists = log.some(function (e) {
          return e.ticketId === ticket.id && e.home === pick.home && e.away === pick.away;
        });
        if (exists) return;
        var ml5 = findML5ForPick(pick);
        var res = normalizeResult(ticket.status);
        log.unshift(buildEntry(ticket, pick, ml5, res));
        added++;
      });
    });
    if (added > 0) saveLog(log);
    return added;
  }

  /* ─── încearcă să adauge scorul ML5 la intrările care au ml5Score=0 ─── */
  function enrichMissingML5() {
    var log = loadLog();
    if (!log.length) return 0;
    var enriched = 0;
    log.forEach(function (entry) {
      if (entry.ml5Score > 0) return; // deja are scor
      var ml5 = findML5ForPick({ home: entry.home, away: entry.away, eventId: entry.eventId });
      if (!ml5 || ml5.ml5Score <= 0) return;
      entry.ml5Score    = ml5.ml5Score;
      entry.ml5Prob     = ml5.ml5Prob;
      entry.ml5Odds     = ml5.ml5Odds;
      entry.factors     = ml5.factors;
      if (!entry.league)     entry.league     = ml5.ml5League;
      if (!entry.eventDate)  entry.eventDate  = ml5.ml5EventDate;
      if (!entry.betLabel)   entry.betLabel   = ml5.ml5Market;
      enriched++;
    });
    if (enriched > 0) saveLog(log);
    return enriched;
  }

  /* ─── sync rezultate din TRACKING ─── */
  function syncResults() {
    var log = loadLog();
    if (!log.length) return;
    var TRACKING = Array.isArray(window.TRACKING) ? window.TRACKING : [];
    var changed = false;
    log.forEach(function (entry) {
      if (entry.result !== 'pending') return;
      var ticket = null;
      for (var i = 0; i < TRACKING.length; i++) {
        if (TRACKING[i] && TRACKING[i].id === entry.ticketId) { ticket = TRACKING[i]; break; }
      }
      if (!ticket) return;
      var res = normalizeResult(ticket.status);
      if (res !== 'pending') { entry.result = res; changed = true; }
    });
    if (changed) saveLog(log);
  }

  /* ─── hook pe syncRecommendationEngine (reîmprospătare date) ─── */
  function hookSyncRec() {
    if (window.__ml5AccSyncRecHooked) return;
    if (typeof window.syncRecommendationEngine !== 'function') return;
    window.__ml5AccSyncRecHooked = true;
    var orig = window.syncRecommendationEngine;
    window.syncRecommendationEngine = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        var a = scanExistingTracking();
        var e = enrichMissingML5();
        syncResults();
        if (a + e > 0) {
          var tab = document.getElementById('tab-ml5');
          if (tab && tab.classList.contains('active')) injectMonitor();
        }
      }, 300);
      return r;
    };
  }

  /* ─── calcule statistici (doar intrările cu ml5Score > 0) ─── */
  function calcStats(entries) {
    var withScore = entries.filter(function (e) { return e.ml5Score > 0; });
    var settled   = withScore.filter(function (e) { return e.result === 'won' || e.result === 'lost'; });
    var wins      = settled.filter(function (e) { return e.result === 'won'; }).length;

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
      total:    entries.length,
      withScore:withScore.length,
      settled:  settled.length,
      wins:     wins,
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
    return '<div style="flex:1;min-width:72px;padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);text-align:center">' +
      '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;line-height:1.3">' + label + '</div>' +
      '<div style="font-size:18px;font-weight:900;color:' + col + '">' + val + '</div>' +
    '</div>';
  }

  /* ─── render section ─── */
  function renderMonitorSection() {
    syncResults();
    var log     = loadLog();
    var stats   = calcStats(log);
    var pending = log.filter(function (e) { return e.result === 'pending'; });

    var overallWR  = stats.settled > 0 ? pct(stats.wins, stats.settled) : null;
    var overallCol = overallWR !== null ? colorWR(overallWR) : 'var(--muted)';

    /* header cards */
    var hdr =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        pill('🎯 Pariuri<br>tracking', stats.total, '#a78bfa') +
        pill('🔬 Cu scor<br>ML5', stats.withScore, '#2BE5C5') +
        pill('📈 Win Rate<br>ML5', overallWR !== null ? overallWR + '%' : '—', overallCol) +
        pill('⏳ În<br>așteptare', pending.length, '#f59e0b') +
      '</div>';

    /* nota: pariuri fara scor ML5 */
    var noScoreCount = log.filter(function (e) { return e.result === 'pending' && e.ml5Score === 0; }).length;
    var noScoreNote = noScoreCount > 0 ?
      '<div style="font-size:11px;color:var(--muted);background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.18);border-radius:10px;padding:8px 12px;margin-bottom:14px">' +
        '⚠️ ' + noScoreCount + ' pari' + (noScoreCount === 1 ? 'u' : 'uri') + ' în așteptare fără scor ML5 disponibil în momentul adăugării.' +
      '</div>' : '';

    /* by score band */
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
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Win Rate pe bandă scor ML5</div>' +
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
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Win Rate pe piață (ML5)</div>' +
        mktRows + '</div>' : '';

    /* recent picks */
    var recentRows = log.slice(0, 15).map(function (e) {
      var icon = e.result === 'won' ? '✅' : e.result === 'lost' ? '❌' : '⏳';
      var rc   = e.result === 'won' ? '#22c55e' : e.result === 'lost' ? '#ef4444' : '#f59e0b';
      var hasScore = e.ml5Score > 0;
      var scCol = e.ml5Score >= 80 ? '#22c55e' : e.ml5Score >= 65 ? '#2BE5C5' : '#f59e0b';
      var scoreBadge = hasScore
        ? '<span style="font-size:11px;font-weight:900;color:' + scCol + ';white-space:nowrap">ML5 ' + e.ml5Score + '</span>'
        : '<span style="font-size:10px;color:var(--muted);white-space:nowrap">fără scor</span>';
      return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
          '<span style="font-size:12px;font-weight:700;color:var(--txt);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.home) + ' vs ' + esc(e.away) + '</span>' +
          scoreBadge +
          '<span style="font-size:16px">' + icon + '</span>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<span>' + esc(e.betLabel || '—') + '</span>' +
          (hasScore && e.ml5Prob ? '<span>prob ' + Math.round(e.ml5Prob * 100) + '%</span>' : '') +
          (e.trackOdds > 1 ? '<span>@ ' + e.trackOdds.toFixed(2) + '</span>' : '') +
          '<span style="color:' + rc + ';font-weight:700">' + (e.result === 'pending' ? 'în așteptare' : e.result) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    var recentSection = recentRows ?
      '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:14px">' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:8px">Pariuri recente (ultimele 15)</div>' +
        recentRows + '</div>' : '';

    var emptyMsg = !stats.total ?
      '<div style="text-align:center;padding:24px 16px;color:var(--muted);font-size:12px;line-height:1.7;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;margin-bottom:14px">' +
        '<div style="font-size:24px;margin-bottom:8px">📋</div>' +
        '<strong style="color:var(--txt);display:block;margin-bottom:6px">Niciun pariu înregistrat în tracking</strong>' +
        'Adaugă un bilet la tracking — scorul ML5 se va salva automat.' +
      '</div>' : '';

    var clearBtn = stats.total > 0 ?
      '<div style="text-align:right;margin-bottom:8px">' +
        '<button onclick="window.__ml5AccClear && window.__ml5AccClear()" ' +
          'style="font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline">Șterge istoricul</button>' +
      '</div>' : '';

    return '<div id="ml5-acc-monitor" style="margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.07)">' +
      '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:12px;display:flex;align-items:center;gap:6px">' +
        '📊 Monitor Acuratețe ML5' +
      '</div>' +
      hdr + noScoreNote + bandsSection + mktSection + recentSection + emptyMsg + clearBtn +
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

  /* ─── hook renderML5Analysis ─── */
  function hookRender() {
    if (window.__ml5AccRenderHooked) return;
    if (typeof window.renderML5Analysis !== 'function') return;
    window.__ml5AccRenderHooked = true;
    var orig = window.renderML5Analysis;
    window.renderML5Analysis = function () {
      var r = orig.apply(this, arguments);
      setTimeout(injectMonitor, 80);
      return r;
    };
  }

  /* ─── clear ─── */
  window.__ml5AccClear = function () {
    if (!confirm('Ștergi tot istoricul de tracking ML5?')) return;
    localStorage.removeItem(STORAGE_KEY);
    injectMonitor();
  };

  /* ─── manual rescan ─── */
  window.__ml5AccRescan = function () {
    var a = scanExistingTracking();
    var e = enrichMissingML5();
    syncResults();
    injectMonitor();
    return 'Adăugate: ' + a + ', Îmbogățite cu ML5: ' + e;
  };

  /* ─── full refresh helper (called on tab switch) ─── */
  function fullRefresh() {
    scanExistingTracking();
    enrichMissingML5();
    syncResults();
    injectMonitor();
  }

  /* ─── tab switch hook ─── */
  function hookTabSwitch() {
    if (window.__ml5AccTabHooked) return;
    if (typeof window.switchTab !== 'function') return;
    window.__ml5AccTabHooked = true;
    var origSwitch = window.switchTab;
    window.switchTab = function (name) {
      var r = origSwitch.apply(this, arguments);
      if (String(name) === 'ml5') setTimeout(fullRefresh, 150);
      return r;
    };
  }

  /* ─── boot ─── */
  function boot() {
    interceptTracking();
    hookRender();
    hookSyncRec();
    hookTabSwitch();
    syncResults();

    [800, 2000, 4000, 8000, 15000].forEach(function (d) {
      setTimeout(function () {
        var a = scanExistingTracking();
        var e = enrichMissingML5();
        syncResults();
        interceptTracking();
        hookRender();
        hookSyncRec();
        hookTabSwitch();
        if (a + e > 0) {
          var tab = document.getElementById('tab-ml5');
          if (tab && tab.classList.contains('active')) injectMonitor();
        }
      }, d);
    });

    var tab = document.getElementById('tab-ml5');
    if (tab && tab.classList.contains('active')) setTimeout(fullRefresh, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
