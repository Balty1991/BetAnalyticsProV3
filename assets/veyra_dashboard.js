(function () {
  'use strict';

  if (window.__veyraDashboard) return;
  window.__veyraDashboard = true;

  var DAYS = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  var MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie',
                'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Bună dimineața';
    if (h < 18) return 'Bună ziua';
    return 'Bună seara';
  }

  function todayLabel() {
    var d = new Date();
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function safeNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function getMatches() { return Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : []; }
  function getTracking() { return Array.isArray(window.TRACKING) ? window.TRACKING : []; }

  function isSameLocalDay(iso) {
    if (!iso) return false;
    var d = new Date(iso);
    var n = new Date();
    return isFinite(d.getTime()) &&
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate();
  }

  function getSyncTime() {
    try {
      if (typeof window.getStatusDisplayTime === 'function') return window.getStatusDisplayTime() || '';
    } catch (e) {}
    return '';
  }

  function getMetrics() {
    var matches = getMatches();
    var tracking = getTracking();
    var openBets = tracking.filter(function (t) { return t && t.status === 'pending'; }).length;

    var wins = 0, losses = 0, profit = 0, staked = 0;
    tracking.forEach(function (t) {
      if (!t) return;
      if (t.status === 'won') {
        wins++;
        var s = safeNum(t.stake || 1);
        staked += s;
        profit += s * (safeNum(t.odds || 0) - 1);
      } else if (t.status === 'lost') {
        losses++;
        var s2 = safeNum(t.stake || 1);
        staked += s2;
        profit -= s2;
      }
    });
    var closedBets = wins + losses;
    var winrate = closedBets ? (wins / closedBets * 100) : null;
    var roi = staked > 0 ? (profit / staked * 100) : null;

    var today = matches.filter(function (m) {
      return isSameLocalDay(m.event_date || m.eventDate || m.date);
    }).length;

    var withOdds = matches.filter(function (m) {
      var bet = m.bestBet || {};
      return Number(bet.odds || bet.displayOdds || 0) > 1.01;
    }).length;

    return {
      mlTotal: matches.length,
      today: today || matches.length,
      withOdds: withOdds,
      openBets: openBets,
      winrate: winrate,
      roi: roi,
      closedBets: closedBets
    };
  }

  function getTopPicks(limit) {
    var matches = getMatches();
    var eligible = matches.filter(function (m) {
      return m && m.analysisState === 'ELIGIBLE' && m.bestBet;
    });
    eligible.sort(function (a, b) {
      var sa = safeNum((a.bestBet || {}).score || (a.bestBet || {}).prob || 0);
      var sb = safeNum((b.bestBet || {}).score || (b.bestBet || {}).prob || 0);
      return sb - sa;
    });
    return eligible.slice(0, limit || 4);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function signed(n, suffix) {
    var v = safeNum(n);
    return (v >= 0 ? '+' : '') + v.toFixed(1) + (suffix || '');
  }

  function buildHtml() {
    var m = getMetrics();
    var syncTime = getSyncTime();
    var picks = getTopPicks(4);

    var roiStr = m.roi !== null ? signed(m.roi, '%') : '—';
    var roiColor = m.roi !== null ? (m.roi >= 0 ? '#22c55e' : '#ef4444') : 'inherit';
    var winrateStr = m.winrate !== null ? m.winrate.toFixed(0) + '%' : '—';

    var picksHtml = '';
    if (picks.length === 0) {
      picksHtml =
        '<div class="vd-empty">' +
          '<div class="vd-empty-icon">🔄</div>' +
          'Nu există predicții disponibile momentan.<br>Apasă butonul de refresh pentru a actualiza datele.' +
        '</div>';
    } else {
      picks.forEach(function (match) {
        var bet = match.bestBet || {};
        var scoreRaw = safeNum(bet.score || bet.prob || 0);
        var confPct = scoreRaw >= 1 ? Math.round(scoreRaw) : Math.round(scoreRaw * 100);
        var home = esc(match.homeTeam || match.home_team || match.home || '?');
        var away = esc(match.awayTeam || match.away_team || match.away || '?');
        var label = esc(bet.label || bet.pick || 'ELIGIBLE');
        var odds = safeNum(bet.odds || bet.displayOdds || 0);
        var league = esc(match.leagueName || match.league_name || match.league || '');
        var oddsStr = odds > 1.01 ? ' · @' + odds.toFixed(2) : '';
        var confCls = 'vd-pick-conf' + (confPct >= 70 ? ' high' : '');
        var badgeCls = 'vd-pick-badge' + (confPct >= 70 ? ' safe' : confPct >= 55 ? '' : ' mod');
        var metaParts = [];
        if (league) metaParts.push(league);
        metaParts.push(label + oddsStr);

        picksHtml +=
          '<div class="vd-pick-card" onclick="switchTab(\'meciuri\')">'+
            '<div class="' + confCls + '">' + confPct + '%</div>'+
            '<div class="vd-pick-main">'+
              '<div class="vd-pick-teams">' + home + ' <span style="opacity:.4;font-weight:400;font-size:10px">vs</span> ' + away + '</div>'+
              '<div class="vd-pick-meta">' + metaParts.join(' · ') + '</div>'+
            '</div>'+
            '<div class="' + badgeCls + '">' + esc(bet.label || bet.pick || 'PICK') + '</div>'+
          '</div>';
      });
    }

    return (
      '<div id="veyra-dash">'+

        '<div class="vd-hero">'+
          '<div class="vd-greeting">' + esc(greeting()) + '</div>'+
          '<div class="vd-date">' + esc(todayLabel()) + '</div>'+
          '<div class="vd-pills">'+
            '<span class="vd-pill live">Live</span>'+
            '<span class="vd-pill">' + m.mlTotal + ' ML</span>'+
            (syncTime ? '<span class="vd-pill">⏱ ' + esc(syncTime) + '</span>' : '')+
          '</div>'+
        '</div>'+

        '<div class="vd-stats">'+
          '<div class="vd-stat-card">'+
            '<div class="vd-stat-val">' + m.mlTotal + '</div>'+
            '<div class="vd-stat-lbl">Predicții ML</div>'+
            '<div class="vd-stat-sub">' + m.today + ' programate azi</div>'+
          '</div>'+
          '<div class="vd-stat-card">'+
            '<div class="vd-stat-val">' + m.withOdds + '</div>'+
            '<div class="vd-stat-lbl">Cu cote BSD</div>'+
            '<div class="vd-stat-sub">preț de pariuri disponibil</div>'+
          '</div>'+
          '<div class="vd-stat-card">'+
            '<div class="vd-stat-val">' + m.openBets + '</div>'+
            '<div class="vd-stat-lbl">Bilete deschise</div>'+
            '<div class="vd-stat-sub">în aşteptare</div>'+
          '</div>'+
          '<div class="vd-stat-card">'+
            '<div class="vd-stat-val" style="color:' + roiColor + '">' + roiStr + '</div>'+
            '<div class="vd-stat-lbl">ROI total</div>'+
            '<div class="vd-stat-sub">' + winrateStr + ' win rate · ' + m.closedBets + ' închise</div>'+
          '</div>'+
        '</div>'+

        '<div class="vd-divider"></div>'+

        '<div class="vd-section">'+
          '<div class="vd-section-hdr"><div class="vd-section-title">Acces rapid</div></div>'+
          '<div class="vd-nav-grid">'+
            '<button class="vd-nav-btn" onclick="switchTab(\'meciuri\')">'+
              '<span class="vd-nav-btn-icon">⚽</span>'+
              '<span class="vd-nav-btn-label">Meciuri</span>'+
              '<span class="vd-nav-btn-sub">Lista completă de predicții ML filtrate</span>'+
            '</button>'+
            '<button class="vd-nav-btn" onclick="switchTab(\'smartbet\')">'+
              '<span class="vd-nav-btn-icon">🎯</span>'+
              '<span class="vd-nav-btn-label">APEX Engine</span>'+
              '<span class="vd-nav-btn-sub">Motor unificat Kelly + AI Memory</span>'+
            '</button>'+
            '<button class="vd-nav-btn" onclick="switchTab(\'clv\')">'+
              '<span class="vd-nav-btn-icon">📈</span>'+
              '<span class="vd-nav-btn-label">CLV Tracker</span>'+
              '<span class="vd-nav-btn-sub">Closing Line Value vs piața</span>'+
            '</button>'+
            '<button class="vd-nav-btn" onclick="switchTab(\'ml5\')">'+
              '<span class="vd-nav-btn-icon">🔬</span>'+
              '<span class="vd-nav-btn-label">Analiză ML5</span>'+
              '<span class="vd-nav-btn-sub">Benchmarks și metrici model</span>'+
            '</button>'+
          '</div>'+
        '</div>'+

        '<div class="vd-divider"></div>'+

        '<div class="vd-section">'+
          '<div class="vd-section-hdr">'+
            '<div class="vd-section-title">Top picks</div>'+
            '<button class="vd-section-link" onclick="switchTab(\'meciuri\')">Vezi toate →</button>'+
          '</div>'+
          picksHtml +
        '</div>'+

      '</div>'
    );
  }

  function render() {
    var host = document.getElementById('dashboard-modern-shell');
    if (!host) return;
    host.dataset.veyraNew = '1';
    var existing = document.getElementById('veyra-dash');
    var newHtml = buildHtml();
    if (existing) {
      var tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      existing.parentNode.replaceChild(tmp.firstChild, existing);
    } else {
      host.innerHTML = newHtml;
    }
  }

  function hookGlobals() {
    if (typeof window.renderAll === 'function' && !window.__vdRenderAllHooked) {
      window.__vdRenderAllHooked = true;
      var orig = window.renderAll;
      window.renderAll = function () {
        var r = orig.apply(this, arguments);
        setTimeout(render, 250);
        return r;
      };
    }
    if (typeof window.doRefresh === 'function' && !window.__vdRefreshHooked) {
      window.__vdRefreshHooked = true;
      var origR = window.doRefresh;
      window.doRefresh = function () {
        var r = origR.apply(this, arguments);
        setTimeout(render, 600);
        return r;
      };
    }
  }

  function boot() {
    hookGlobals();
    render();
    [150, 400, 900, 2000, 4500, 9000].forEach(function (d) {
      setTimeout(function () {
        hookGlobals();
        render();
      }, d);
    });
    setInterval(render, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
