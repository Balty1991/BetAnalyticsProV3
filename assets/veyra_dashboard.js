/**
 * VEYRA Dashboard v4 – dash17
 * Futuristic redesign: animated ring, scan line, neon glow, pyramid system
 */
(function () {
  'use strict';

  if (window.__veyraDashboardV3) return;
  window.__veyraDashboard   = null;
  window.__veyraDashboardV3 = true;

  var DAYS   = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
  var MONTHS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];

  /* ── Helpers ── */
  function greeting() {
    var h = new Date().getHours();
    if (h < 5)  return 'Bună noaptea';
    if (h < 12) return 'Bună dimineața';
    if (h < 18) return 'Bună ziua';
    return 'Bună seara';
  }
  function todayLabel() {
    var d = new Date();
    return DAYS[d.getDay()] + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function safeNum(v)    { var n = Number(v); return isFinite(n) ? n : 0; }
  function getMatches()  { return Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : []; }
  function getTracking() { return Array.isArray(window.TRACKING)    ? window.TRACKING    : []; }
  function isSameLocalDay(iso) {
    if (!iso) return false;
    var d = new Date(iso), n = new Date();
    return isFinite(d.getTime()) &&
      d.getFullYear() === n.getFullYear() &&
      d.getMonth()    === n.getMonth()    &&
      d.getDate()     === n.getDate();
  }
  function getSyncTime() {
    try { if (typeof window.getStatusDisplayTime === 'function') return window.getStatusDisplayTime() || ''; } catch (e) {}
    return '';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function signed(n, suffix) {
    var v = safeNum(n);
    return (v >= 0 ? '+' : '') + v.toFixed(1) + (suffix || '');
  }

  /* ── Small score ring SVG (opportunity cards) ── */
  function scoreRing(score) {
    var pct = Math.min(100, Math.max(0, safeNum(score)));
    var col = pct >= 85 ? '#7C5CFC' : pct >= 68 ? '#4B83F0' : '#F0A830';
    return (
      '<svg class="vd-ring" viewBox="0 0 36 36" aria-hidden="true">' +
        '<circle cx="18" cy="18" r="15.91" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3.2" pathLength="100"/>' +
        '<circle cx="18" cy="18" r="15.91" fill="none" stroke="' + col + '" stroke-width="3.2"' +
          ' pathLength="100" stroke-dasharray="' + pct.toFixed(1) + ' ' + (100 - pct).toFixed(1) + '"' +
          ' stroke-dashoffset="25" stroke-linecap="round"' +
          ' style="filter:drop-shadow(0 0 4px ' + col + ')"/>' +
        '<text x="18" y="22.5" text-anchor="middle" fill="' + col + '"' +
          ' font-size="10" font-weight="900" font-family="ui-monospace,monospace">' +
          Math.round(pct) +
        '</text>' +
      '</svg>'
    );
  }

  /* ── Big animated ring for hero ── */
  function bigRingSvg(eligible) {
    return (
      '<svg class="vd-big-ring" viewBox="0 0 80 80" aria-hidden="true">' +
        '<defs>' +
          '<filter id="vd-teal-glow" x="-30%" y="-30%" width="160%" height="160%">' +
            '<feGaussianBlur stdDeviation="2.5" result="blur"/>' +
            '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
          '</filter>' +
        '</defs>' +
        /* Track */
        '<circle cx="40" cy="40" r="34" fill="none" stroke="rgba(124,92,252,.09)" stroke-width="5" pathLength="100"/>' +
        /* Inner glow fill */
        '<circle cx="40" cy="40" r="27" fill="rgba(124,92,252,.05)"/>' +
        /* Arc — starts at 0, animated via JS after render */
        '<circle cx="40" cy="40" r="34" fill="none" stroke="#7C5CFC" stroke-width="5"' +
          ' pathLength="100" stroke-dasharray="0 100" stroke-linecap="round"' +
          ' filter="url(#vd-teal-glow)" class="vd-big-ring-arc"/>' +
        /* Tick marks every 25% */
        '<circle cx="40" cy="6"  r="2" fill="rgba(124,92,252,.25)"/>' +
        '<circle cx="74" cy="40" r="2" fill="rgba(124,92,252,.25)"/>' +
        '<circle cx="40" cy="74" r="2" fill="rgba(124,92,252,.25)"/>' +
        '<circle cx="6"  cy="40" r="2" fill="rgba(124,92,252,.25)"/>' +
      '</svg>' +
      '<div class="vd-ring-center">' +
        '<span class="vd-ring-num" id="vd-ring-num">0</span>' +
        '<span class="vd-ring-sub">oport.</span>' +
      '</div>'
    );
  }

  /* ── Sparkline from TRACKING closed bets ── */
  function buildSparkline(tracking) {
    var closed = (tracking || []).filter(function (t) {
      return t && (t.status === 'won' || t.status === 'lost');
    });
    if (closed.length < 2) return '';
    var slice = closed.slice(-22);
    var pts = [100], running = 100;
    slice.forEach(function (t) {
      var s = safeNum(t.stake || 1);
      running += t.status === 'won' ? s * (safeNum(t.odds || 2) - 1) : -s;
      pts.push(Math.max(0, parseFloat(running.toFixed(2))));
    });
    var W = 100, H = 44, P = 3;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    if (lo === hi) { lo -= 2; hi += 2; }
    var coords = pts.map(function (v, i) {
      return [
        (P + (W - P * 2) * (pts.length < 2 ? 0 : i / (pts.length - 1))).toFixed(1),
        (H - P - ((v - lo) / (hi - lo)) * (H - P * 2)).toFixed(1)
      ];
    });
    var polyPts = coords.map(function (c) { return c[0] + ',' + c[1]; }).join(' ');
    var last   = coords[coords.length - 1];
    var isGain = pts[pts.length - 1] >= pts[0];
    var col    = isGain ? '#10D07E' : '#EF4444';
    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible">' +
        '<defs>' +
          '<linearGradient id="vdSpFill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + col + '" stop-opacity=".20"/>' +
            '<stop offset="100%" stop-color="' + col + '" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<path d="M' + coords[0][0] + ',' + H +
          ' L' + coords.map(function (c) { return c[0] + ',' + c[1]; }).join(' L') +
          ' L' + last[0] + ',' + H + 'Z" fill="url(#vdSpFill)"/>' +
        '<polyline points="' + polyPts + '" fill="none" stroke="' + col +
          '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + last[0] + '" cy="' + last[1] +
          '" r="3" fill="' + col + '" stroke="rgba(0,0,0,.6)" stroke-width="1.5"/>' +
      '</svg>'
    );
  }

  /* ── Metrics ── */
  function getMetrics() {
    var matches  = getMatches();
    var tracking = getTracking();
    var openBets = tracking.filter(function (t) { return t && t.status === 'pending'; }).length;
    var wins = 0, losses = 0, profit = 0, staked = 0;
    tracking.forEach(function (t) {
      if (!t) return;
      var s = safeNum(t.stake || 1);
      if (t.status === 'won')  { wins++;   staked += s; profit += s * (safeNum(t.odds || 0) - 1); }
      if (t.status === 'lost') { losses++; staked += s; profit -= s; }
    });
    var closedBets = wins + losses;
    var winrate = closedBets ? (wins / closedBets * 100) : null;
    var roi     = staked > 0 ? (profit / staked * 100) : null;
    var today   = matches.filter(function (m) {
      return m && isSameLocalDay(m.event_date || m.eventDate || m.date);
    }).length;
    var eligible = matches.filter(function (m) {
      if (!m) return false;
      if (typeof window.passesSelectionFilter === 'function') return window.passesSelectionFilter(m);
      return m.analysisState === 'ELIGIBLE' && m.bestBet;
    }).length;
    return { mlTotal: matches.length, today: today || matches.length, eligible: eligible,
             openBets: openBets, winrate: winrate, roi: roi, closedBets: closedBets, wins: wins };
  }

  /* ── Top picks ── */
  function getTopPicks(limit) {
    var matches  = getMatches();
    var eligible = matches.filter(function (m) {
      if (!m) return false;
      if (typeof window.passesSelectionFilter === 'function') return window.passesSelectionFilter(m);
      return m.analysisState === 'ELIGIBLE' && m.bestBet;
    });
    eligible.sort(function (a, b) {
      return safeNum(b.smartScore || (b.bestBet || {}).adjProb || 0) -
             safeNum(a.smartScore || (a.bestBet || {}).adjProb || 0);
    });
    return eligible.slice(0, limit || 4);
  }

  /* ── Best market (21 days) ── */
  function getBestMarket() {
    var tracking = getTracking();
    var cutoff   = Date.now() - 21 * 86400000;
    var byMkt    = {};
    tracking.forEach(function (t) {
      if (!t || (t.status !== 'won' && t.status !== 'lost')) return;
      var ts = new Date(t.date || t.updated_at || t.created_at || 0).getTime();
      if (ts < cutoff) return;
      var k = t.market || t.pick_type || 'other';
      if (!byMkt[k]) byMkt[k] = { wins: 0, total: 0, profit: 0, staked: 0 };
      var s = safeNum(t.stake || 1);
      byMkt[k].total++;
      byMkt[k].staked += s;
      if (t.status === 'won') { byMkt[k].wins++; byMkt[k].profit += s * (safeNum(t.odds || 2) - 1); }
      else                    { byMkt[k].profit -= s; }
    });
    var best = null, bestScore = -Infinity;
    Object.keys(byMkt).forEach(function (k) {
      var g = byMkt[k];
      if (g.total < 2) return;
      var roi = g.staked > 0 ? g.profit / g.staked * 100 : 0;
      var wr  = g.total > 0  ? g.wins  / g.total  * 100 : 0;
      var sc  = roi * 0.7 + wr * 0.3;
      if (sc > bestScore) { bestScore = sc; best = { market: k, roi: roi, winrate: wr, total: g.total, wins: g.wins }; }
    });
    return best;
  }

  /* ── Pyramid Betting System ── */
  var PYR_KEYS  = { '140': 'veyra_pyr_140', '200': 'veyra_pyr_200' };
  var PYR_ODDS  = { '140': 1.40, '200': 2.00 };
  var PYR_COLOR = { '140': 'var(--vd-blue)', '200': 'var(--vd-amber)' };

  function pyrTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function pyrLoad(id) {
    try {
      var s = localStorage.getItem(PYR_KEYS[id]);
      if (!s) return null;
      var state = JSON.parse(s);
      if (state.date === pyrTodayStr()) return state;
      /* Different calendar day — keep state if any step is placed (bet locked in) */
      var hasPlaced = state.steps && state.steps.some(function(st){ return st.placed; });
      if (hasPlaced) return state; /* preserve until user marks WIN / PIERDUT */
      return null; /* no placed bets → start fresh for new day */
    } catch (e) { return null; }
  }
  function pyrSave(id, state) {
    try { localStorage.setItem(PYR_KEYS[id], JSON.stringify(state)); } catch (e) {}
  }
  function pyrGetMatchesForOdds(targetOdds, limit) {
    var lo = targetOdds * 0.82, hi = targetOdds * 1.22;
    var today = pyrTodayStr();
    return getMatches().filter(function (m) {
      if (!m) return false;
      var raw = m.event_date || m.eventDate || m.date || '';
      if (!raw) return false;
      try { var _rd=new Date(raw); if(!isFinite(_rd.getTime())) return false; var _rds=_rd.getFullYear()+'-'+String(_rd.getMonth()+1).padStart(2,'0')+'-'+String(_rd.getDate()).padStart(2,'0'); if(_rds!==today) return false; } catch(e){ return false; }
      var ok = typeof window.passesSelectionFilter === 'function'
        ? window.passesSelectionFilter(m)
        : (m.analysisState === 'ELIGIBLE' && m.bestBet);
      if (!ok) return false;
      var odds = safeNum((m.bestBet || {}).odds || (m.bestBet || {}).displayOdds || 0);
      return odds >= lo && odds <= hi;
    }).sort(function (a, b) {
      return safeNum(b.smartScore || (b.bestBet||{}).adjProb || 0) -
             safeNum(a.smartScore || (a.bestBet||{}).adjProb || 0);
    }).slice(0, limit).map(function (m) {
      var bet = m.bestBet || {};
      var odds = safeNum(bet.odds || bet.displayOdds || 0);
      var timeStr = '';
      try {
        var d = new Date(m.event_date || m.eventDate || m.date || '');
        if (isFinite(d.getTime())) timeStr = d.toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'});
      } catch(e) {}
      return {
        home: esc(m.home || m.homeTeam || m.home_team || '?'),
        away: esc(m.away || m.awayTeam || m.away_team || '?'),
        pick: esc(bet.label || bet.pick || 'PICK'),
        odds: odds,
        time: timeStr
      };
    });
  }
  function pyrInit(id, initStake, numSteps) {
    var tOdds = PYR_ODDS[id] || 1.40;
    var stake = Math.max(0.5, safeNum(initStake) || 10);
    var n     = Math.min(10, Math.max(2, Math.round(safeNum(numSteps) || 5)));
    var matches = pyrGetMatchesForOdds(tOdds, n);
    var steps = [];
    for (var i = 0; i < n; i++) {
      steps.push({
        stake:  parseFloat((stake * Math.pow(tOdds, i)).toFixed(2)),
        payout: parseFloat((stake * Math.pow(tOdds, i + 1)).toFixed(2)),
        status: i === 0 ? 'current' : 'pending',
        match:  matches[i] || null
      });
    }
    var result = { date: pyrTodayStr(), initStake: stake, numSteps: n, currentStep: 0, steps: steps, done: false, doneStatus: null };
    pyrSave(id, result); /* persist immediately so re-renders use same match assignments */
    return result;
  }
  function pyrFillMatches(id, state) {
    /* Fill null match slots in not-yet-played steps */
    var tOdds = PYR_ODDS[id] || 1.40;
    var hasNull = state.steps.some(function(s){ return !s.match && (s.status==='current'||s.status==='pending'); });
    if (!hasNull) return state;
    var taken = {};
    state.steps.forEach(function(s){ if(s.match) taken[s.match.home+'|'+s.match.away]=true; });
    var cands = pyrGetMatchesForOdds(tOdds, state.numSteps * 2).filter(function(c){ return !taken[c.home+'|'+c.away]; });
    var ci = 0, changed = false;
    state.steps.forEach(function(step){
      if (!step.match && (step.status==='current'||step.status==='pending') && ci < cands.length) {
        step.match = cands[ci++]; changed = true;
      }
    });
    if (changed) pyrSave(id, state);
    return state;
  }
  function pyrBuildBlockHtml(id) {
    var tOdds = PYR_ODDS[id]  || 1.40;
    var color  = PYR_COLOR[id] || 'var(--vd-teal)';
    var state  = pyrLoad(id)   || pyrInit(id, 10, 5);
    state = pyrFillMatches(id, state);
    var isDone = state.done;
    var isWon  = isDone && state.doneStatus === 'won';
    var isLost = isDone && state.doneStatus === 'lost';

    var stepsHtml = state.steps.map(function (step, i) {
      var cls = 'vd-pyr-step';
      var ico = '';
      if      (step.status === 'won')     { cls += ' vd-pyr-s-won';  ico = '<span class="vd-pyr-s-ico vd-pyr-s-ico-win">✓</span>'; }
      else if (step.status === 'lost')    { cls += ' vd-pyr-s-lost'; ico = '<span class="vd-pyr-s-ico vd-pyr-s-ico-lose">✗</span>'; }
      else if (step.status === 'current') {
        cls += ' vd-pyr-s-cur';
        if (step.placed) cls += ' vd-pyr-s-placed';
      } else { cls += ' vd-pyr-s-pend'; }
      var placedBadge = (step.status === 'current' && step.placed)
        ? '<span class="vd-pyr-s-lock">📋</span>' : '';
      var matchLine = step.match
        ? '<div class="vd-pyr-s-match">' +
            '<span class="vd-pyr-s-teams">' + step.match.home + ' vs ' + step.match.away + '</span>' +
            '<span class="vd-pyr-s-pill">' + step.match.pick +
              (step.match.odds > 0 ? ' @' + step.match.odds.toFixed(2) : '') +
            '</span>' +
            (step.match.time ? '<span class="vd-pyr-s-time">⏱' + step.match.time + '</span>' : '') +
          '</div>'
        : '<div class="vd-pyr-s-nomatch">— fără meci eligibil azi</div>';
      return (
        '<div class="' + cls + '">' +
          '<div class="vd-pyr-s-hd">' +
            '<span class="vd-pyr-s-n">P' + (i + 1) + '</span>' +
            ico +
            placedBadge +
            '<span class="vd-pyr-s-stk">' + step.stake.toFixed(2) + '</span>' +
            '<span class="vd-pyr-s-arr">→</span>' +
            '<span class="vd-pyr-s-pay">' + step.payout.toFixed(2) + ' RON</span>' +
          '</div>' +
          matchLine +
        '</div>'
      );
    }).join('');

    var lastPayout = state.steps.length ? state.steps[state.steps.length - 1].payout : 0;
    var statusText = isDone
      ? (isWon
          ? '🏆 +' + (lastPayout - state.initStake).toFixed(2) + ' RON'
          : '❌ Pierdut pas ' + (state.currentStep + 1))
      : 'Pas ' + (state.currentStep + 1) + '/' + state.numSteps;

    var cfgHtml = !isDone
      ? '<div class="vd-pyr-cfg">' +
          '<label class="vd-pyr-cfg-lbl">Miză' +
            '<input type="number" id="vd-pyr-stk-' + id + '" class="vd-pyr-inp" value="' + state.initStake + '" min="0.5" max="9999" step="0.5"/>' +
            '<span class="vd-pyr-cfg-unit">RON</span>' +
          '</label>' +
          '<label class="vd-pyr-cfg-lbl">Pași' +
            '<input type="number" id="vd-pyr-stp-' + id + '" class="vd-pyr-inp vd-pyr-stp-inp" value="' + state.numSteps + '" min="2" max="10"/>' +
          '</label>' +
          '<button class="vd-pyr-btn vd-pyr-cfg-ok" onclick="window.__pyrApplyCfg(\'' + id + '\')">↺</button>' +
        '</div>'
      : '';

    var curStep  = !isDone ? state.steps[state.currentStep] : null;
    var isPlaced = curStep && curStep.placed;
    var actHtml = isDone
      ? '<div class="vd-pyr-acts">' +
          '<button class="vd-pyr-btn vd-pyr-new" onclick="window.__pyrReset(\'' + id + '\')">↺ Piramidă nouă</button>' +
        '</div>'
      : !isPlaced
        ? '<div class="vd-pyr-acts">' +
            '<button class="vd-pyr-btn vd-pyr-place" onclick="window.__pyrPlace(\'' + id + '\')">📋 Salvează pas plasat</button>' +
            '<button class="vd-pyr-btn vd-pyr-win"   onclick="window.__pyrWin(\'' + id + '\')">✓</button>' +
            '<button class="vd-pyr-btn vd-pyr-lose"  onclick="window.__pyrLose(\'' + id + '\')">✗</button>' +
          '</div>'
        : '<div class="vd-pyr-acts">' +
            '<span class="vd-pyr-placed-badge">📋 Plasat</span>' +
            '<button class="vd-pyr-btn vd-pyr-win"  onclick="window.__pyrWin(\'' + id + '\')">✓ WIN</button>' +
            '<button class="vd-pyr-btn vd-pyr-lose" onclick="window.__pyrLose(\'' + id + '\')">✗ PIERDUT</button>' +
          '</div>';

    return (
      '<div class="vd-pyr-block' + (isWon ? ' vd-pyr-block-won' : isLost ? ' vd-pyr-block-lost' : '') + '">' +
        '<div class="vd-pyr-blk-hd">' +
          '<span class="vd-pyr-badge" style="color:' + color + ';border-color:' + color + '">@' + tOdds.toFixed(2) + '</span>' +
          '<span class="vd-pyr-status">' + statusText + '</span>' +
        '</div>' +
        cfgHtml +
        '<div class="vd-pyr-steps">' + stepsHtml + '</div>' +
        actHtml +
      '</div>'
    );
  }
  function buildPyrSection() {
    return (
      '<div class="vd-pyramids vd-ani" style="animation-delay:.25s">' +
        '<div class="vd-sec-hd">' +
          '<div class="vd-sec-title">🔺 Sistem Piramidal · meciuri zilnice</div>' +
        '</div>' +
        '<div id="vd-pyr-wrap-140">' + pyrBuildBlockHtml('140') + '</div>' +
        '<div id="vd-pyr-wrap-200">' + pyrBuildBlockHtml('200') + '</div>' +
      '</div>'
    );
  }

  /* ── Motor status bar ── */
  function buildMotorStatus() {
    var matches = getMatches();
    var mlTotal = matches.length;
    if (!mlTotal) return '';
    var syncTime = getSyncTime();
    var eligible = matches.filter(function (m) {
      if (!m) return false;
      if (typeof window.passesSelectionFilter === 'function') return window.passesSelectionFilter(m);
      return m.analysisState === 'ELIGIBLE' && m.bestBet;
    }).length;
    var enriched = matches.filter(function (m) {
      return m && window.ENRICHED_EVENT_CACHE && window.ENRICHED_EVENT_CACHE[String(m.eventId)];
    }).length;
    return (
      '<div class="vd-motor">' +
        '<div class="vd-motor-item">' +
          '<div class="vd-motor-val">' + mlTotal + '</div>' +
          '<div class="vd-motor-lbl">ML sync</div>' +
        '</div>' +
        '<div class="vd-motor-div"></div>' +
        '<div class="vd-motor-item">' +
          '<div class="vd-motor-val" style="color:var(--vd-teal)">' + eligible + '</div>' +
          '<div class="vd-motor-lbl">Eligibile</div>' +
        '</div>' +
        '<div class="vd-motor-div"></div>' +
        '<div class="vd-motor-item">' +
          '<div class="vd-motor-val" style="color:var(--vd-blue)">' + enriched + '</div>' +
          '<div class="vd-motor-lbl">ML5 enrich</div>' +
        '</div>' +
        (syncTime
          ? '<div class="vd-motor-div"></div>' +
            '<div class="vd-motor-item">' +
              '<div class="vd-motor-val vd-motor-time">' + esc(syncTime) + '</div>' +
              '<div class="vd-motor-lbl">Ultimul sync</div>' +
            '</div>'
          : '') +
      '</div>'
    );
  }

  /* ── Main HTML builder ── */
  function buildHtml() {
    var m        = getMetrics();
    var tracking = getTracking();
    var picks    = getTopPicks(4);
    var syncTime = getSyncTime();
    var sparkSvg = buildSparkline(tracking);
    var bestMkt  = getBestMarket();

    var roiCol = m.roi !== null ? (m.roi >= 0 ? 'var(--vd-green)' : 'var(--vd-red)') : '';
    var roiStr = m.roi !== null ? signed(m.roi, '%') : '—';
    var wrCol  = m.winrate !== null ? (m.winrate >= 55 ? 'var(--vd-green)' : m.winrate < 45 ? 'var(--vd-red)' : '') : '';
    var wrStr  = m.winrate !== null ? m.winrate.toFixed(0) + '%' : '—';

    /* Opportunity cards */
    var picksHtml = !picks.length
      ? '<div class="vd-opp-empty">' +
          '<div class="vd-opp-empty-icon">📡</div>' +
          '<div class="vd-opp-empty-title">Scanare în curs</div>' +
          '<div class="vd-opp-empty-sub">Motorul analizează ' + m.mlTotal + ' meciuri. Oportunități disponibile în curând.</div>' +
          '<button class="vd-opp-empty-btn" onclick="switchTab(\'meciuri\')">Vezi toate meciurile →</button>' +
        '</div>'
      : picks.map(function (match, idx) {
          var bet      = match.bestBet || {};
          var scoreRaw = safeNum(match.smartScore || bet.adjProb || 0);
          var score    = scoreRaw > 1 ? Math.min(scoreRaw, 100) : scoreRaw * 100;
          var home     = esc(match.home || match.homeTeam || match.home_team || '?');
          var away     = esc(match.away || match.awayTeam || match.away_team || '?');
          var label    = esc(bet.label || bet.pick || 'PICK');
          var odds     = safeNum(bet.odds || bet.displayOdds || 0);
          var adjProb  = safeNum(bet.adjProb || 0);
          var edgePct  = safeNum(bet.edgePct || 0);
          var oddsStr  = odds > 1.01 ? odds.toFixed(2) : '—';
          var probStr  = adjProb > 1 ? adjProb.toFixed(1) + '%' : adjProb > 0 ? (adjProb * 100).toFixed(1) + '%' : '';
          var timeStr  = '';
          try {
            var raw = match.event_date || match.eventDate || match.date || '';
            if (raw) { var d = new Date(raw); if (isFinite(d.getTime())) timeStr = d.toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'}); }
          } catch (e) {}
          var edgeCls  = edgePct >= 5 ? 'vd-edge-good' : edgePct >= 0 ? 'vd-edge-ok' : 'vd-edge-warn';
          var scoreCol = score >= 85 ? 'var(--vd-teal)' : score >= 68 ? 'var(--vd-blue)' : 'var(--vd-amber)';
          var agr      = bet.ml5Agreement;
          var agrPill  = '';
          if (typeof agr === 'number' && isFinite(agr)) {
            var agrPct = Math.round(agr * 100);
            var agrCls = agr >= 0.75 ? 'vd-edge-good' : agr >= 0.5 ? 'vd-edge-ok' : 'vd-edge-warn';
            agrPill = '<span class="' + agrCls + '" title="Cât de mult sunt de acord sursele de semnal (ML5 + piață)">Consens ' + agrPct + '%</span>';
          }
          return (
            '<button class="vd-opp-card" style="border-left:3px solid ' + scoreCol + '" onclick="switchTab(\'meciuri\')">' +
              '<div class="vd-opp-hd">' +
                scoreRing(score) +
                '<div class="vd-opp-identity">' +
                  '<div class="vd-opp-teams">' + home + '<span class="vd-opp-vs"> vs </span>' + away + '</div>' +
                  (timeStr ? '<div class="vd-opp-time">⏱ ' + esc(timeStr) + '</div>' : '') +
                '</div>' +
                '<span class="vd-opp-rank">#' + (idx + 1) + '</span>' +
              '</div>' +
              '<div class="vd-opp-pick">' + label +
                (oddsStr !== '—' ? '<span class="vd-opp-odds">@' + oddsStr + '</span>' : '') +
              '</div>' +
              '<div class="vd-opp-pills">' +
                (probStr ? '<span class="vd-pill-neutral">Prob ' + probStr + '</span>' : '') +
                '<span class="' + edgeCls + '">Edge ' + (edgePct >= 0 ? '+' : '') + edgePct.toFixed(1) + 'pp</span>' +
                agrPill +
              '</div>' +
            '</button>'
          );
        }).join('');

    /* Performance — trust anchor, shown right after hero */
    var perfHtml =
      '<div class="vd-perf vd-perf-trust">' +
        '<div class="vd-perf-hd">' +
          '<div class="vd-sec-title">📊 Rezultate reale · ' + m.closedBets + ' închise</div>' +
          (m.closedBets > 0 ? '<span class="vd-perf-roi" style="color:' + (roiCol || 'inherit') + '">' + roiStr + '</span>' : '') +
        '</div>' +
        (sparkSvg ? '<div class="vd-spark">' + sparkSvg + '</div>' : '') +
        (m.closedBets > 0
          ? '<div class="vd-perf-row">' +
              '<div class="vd-ps"><div class="vd-ps-v" style="color:' + (roiCol || 'inherit') + '">' + roiStr + '</div><div class="vd-ps-l">ROI</div></div>' +
              '<div class="vd-ps"><div class="vd-ps-v" style="color:' + (wrCol  || 'inherit') + '">' + wrStr  + '</div><div class="vd-ps-l">Win Rate</div></div>' +
              '<div class="vd-ps"><div class="vd-ps-v">' + m.wins + '/' + m.closedBets + '</div><div class="vd-ps-l">W/Total</div></div>' +
            '</div>'
          : '<div class="vd-perf-empty">Niciun pariu închis încă — ROI și win rate apar aici după primele rezultate.</div>') +
      '</div>';

    /* Market recommendation */
    var recoHtml = '';
    if (bestMkt) {
      var mktLabel = (bestMkt.market || '').replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
      recoHtml =
        '<div class="vd-reco">' +
          '<div class="vd-reco-tag">Signal · ultimele 21 zile</div>' +
          '<div class="vd-reco-mkt">' + esc(mktLabel) + '</div>' +
          '<div class="vd-reco-stats">' +
            '<span>ROI ' + signed(bestMkt.roi, '%') + '</span>' +
            '<span>Win ' + bestMkt.winrate.toFixed(0) + '%</span>' +
            '<span>' + bestMkt.wins + '/' + bestMkt.total + '</span>' +
          '</div>' +
        '</div>';
    }

    var motorHtml = buildMotorStatus();

    return (
      '<div id="veyra-dash">' +

        /* ── Hero: grid bg + scan line + ring ── */
        '<div class="vd-hero-block">' +
          '<div class="vd-hero-grid"></div>' +
          '<div class="vd-scan-line"></div>' +
          '<div class="vd-status">' +
            '<span class="vd-live-dot"></span>' +
            '<span class="vd-status-live">Online</span>' +
            (syncTime ? '<span class="vd-status-sync">· ' + esc(syncTime) + '</span>' : '') +
            '<span class="vd-status-date">' + esc(todayLabel()) + '</span>' +
          '</div>' +
          '<div class="vd-hero-inner">' +
            '<div class="vd-hero-text">' +
              '<h1 class="vd-greeting">' + esc(greeting()) + '</h1>' +
              '<p class="vd-subline">' +
                '<span class="vd-hl" id="vd-cnt-opp">' + m.eligible + '</span> oportunități &middot; ' +
                '<span class="vd-hl" id="vd-cnt-ml">' + m.today + '</span> meciuri azi' +
              '</p>' +
            '</div>' +
            '<div class="vd-big-ring-wrap">' +
              bigRingSvg(m.eligible) +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ── Motor status ── */
        (motorHtml ? '<div class="vd-ani" style="animation-delay:.10s">' + motorHtml + '</div>' : '') +

        /* ── Performance — trust first: prove it works before selling the picks ── */
        (perfHtml ? '<div class="vd-ani" style="animation-delay:.13s">' + perfHtml + '</div>' : '') +

        /* ── KPI strip ── */
        '<div class="vd-kpi vd-ani" style="animation-delay:.15s">' +
          '<div class="vd-kpi-card vd-kpi-accent">' +
            '<div class="vd-kpi-v" style="color:var(--vd-teal)">' + m.eligible + '</div>' +
            '<div class="vd-kpi-l">Oportunități</div>' +
            '<div class="vd-kpi-s">eligibile azi</div>' +
          '</div>' +
          '<div class="vd-kpi-card">' +
            '<div class="vd-kpi-v">' + m.today + '</div>' +
            '<div class="vd-kpi-l">Meciuri</div>' +
            '<div class="vd-kpi-s">analizate azi</div>' +
          '</div>' +
          '<div class="vd-kpi-card">' +
            '<div class="vd-kpi-v" style="color:' + (m.openBets > 0 ? 'var(--vd-amber)' : 'inherit') + '">' + m.openBets + '</div>' +
            '<div class="vd-kpi-l">Active</div>' +
            '<div class="vd-kpi-s">bilete pending</div>' +
          '</div>' +
        '</div>' +

        /* ── Market signal ── */
        (recoHtml ? '<div class="vd-ani" style="animation-delay:.18s">' + recoHtml + '</div>' : '') +

        /* ── Top picks ── */
        '<div class="vd-section vd-ani" style="animation-delay:.20s">' +
          '<div class="vd-sec-hd">' +
            '<div class="vd-sec-title">⚡ Top oportunități</div>' +
            '<button class="vd-sec-link" onclick="switchTab(\'meciuri\')">Vezi toate →</button>' +
          '</div>' +
          '<div class="vd-opp-scroll">' + picksHtml + '</div>' +
        '</div>' +

        /* ── Pyramid system ── */
        buildPyrSection() +

        /* ── Quick nav ── */
        '<div class="vd-nav vd-ani" style="animation-delay:.32s">' +
          '<button class="vd-nav-btn" onclick="switchTab(\'master\')">' +
            '<span class="vd-nav-icon" style="font-size:18px">⚡</span>' +
            '<span class="vd-nav-lbl" style="color:#F59E0B">Master</span>' +
          '</button>' +
          '<button class="vd-nav-btn" onclick="switchTab(\'meciuri\')">' +
            '<span class="vd-nav-icon">⚽</span><span class="vd-nav-lbl">Meciuri</span>' +
          '</button>' +
          '<button class="vd-nav-btn" onclick="switchTab(\'bilete\')">' +
            '<span class="vd-nav-icon">🎫</span><span class="vd-nav-lbl">Bilete</span>' +
          '</button>' +
          '<button class="vd-nav-btn" onclick="switchTab(\'ai\')">' +
            '<span class="vd-nav-icon">🧠</span><span class="vd-nav-lbl">AI</span>' +
          '</button>' +
        '</div>' +

      '</div>'
    );
  }

  /* ── Animate hero ring after render ── */
  function animateHeroRing() {
    var m   = getMetrics();
    var arc = document.querySelector('.vd-big-ring-arc');
    var num = document.getElementById('vd-ring-num');
    var opp = document.getElementById('vd-cnt-opp');
    var ml  = document.getElementById('vd-cnt-ml');

    var pct = m.mlTotal > 0
      ? Math.min(99.5, m.eligible / m.mlTotal * 100)
      : (m.eligible > 0 ? Math.min(80, m.eligible * 4) : 0);

    /* Animate arc */
    if (arc) {
      setTimeout(function () {
        arc.style.strokeDasharray = pct.toFixed(1) + ' ' + (100 - pct).toFixed(1);
      }, 120);
    }

    /* Count-up numbers */
    countUp(num, m.eligible, 900);
    countUp(opp, m.eligible, 900);
    countUp(ml,  m.today,    700);
  }

  function countUp(el, target, duration) {
    if (!el || !isFinite(target) || target <= 0) {
      if (el) el.textContent = target || 0;
      return;
    }
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var e = 1 - Math.pow(1 - p, 3); /* ease-out cubic */
      el.textContent = Math.round(target * e);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  var _vdRendering    = false;
  var _vdHadNoData    = true; /* true when last render had 0 matches */

  /* ── Core render ── */
  function doRender() {
    if (_vdRendering) return;
    _vdRendering = true;
    try {
      var host = document.getElementById('dashboard-modern-shell');
      if (!host) { _vdRendering = false; return; }
      var ph = document.getElementById('vd-boot-placeholder');
      if (ph) ph.parentNode.removeChild(ph);
      /* Remove old content without triggering the MutationObserver re-entry */
      host.innerHTML = buildHtml();
      host.dataset.veyraNew = '1';
      _vdHadNoData = getMatches().length === 0;
      setTimeout(animateHeroRing, 60);
    } catch (e) {
      var h = document.getElementById('dashboard-modern-shell');
      if (h) h.innerHTML =
        '<div style="padding:20px 16px;color:#EF4444;font-size:12px;line-height:1.6">' +
        '<strong>Dashboard error:</strong><br>' + String(e) + '</div>';
    }
    _vdRendering = false;
  }

  /* ── Render (with empty-guard bypass) ── */
  function render() {
    if (_vdRendering) return;
    var exists = !!document.getElementById('veyra-dash');
    if (exists) {
      /* Only re-render if we previously had no data and now we do */
      if (!_vdHadNoData || getMatches().length === 0) return;
    }
    doRender();
  }

  /* ── Force re-render (used after data refresh) ── */
  function forceRerender() {
    if (_vdRendering) return;
    /* Remove existing dashboard so doRender can rebuild with fresh data */
    var d = document.getElementById('veyra-dash');
    if (d) {
      _vdRendering = true;          /* suppress MutationObserver while we remove */
      d.parentNode.removeChild(d);
      _vdRendering = false;
    }
    doRender();
  }

  /* ── Watch host for external clears ── */
  function watchShell() {
    var host = document.getElementById('dashboard-modern-shell');
    if (!host || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (_vdRendering) return;
      if (!document.getElementById('veyra-dash')) setTimeout(doRender, 0);
    }).observe(host, { childList: true });
  }

  /* ── Hook global refresh functions ── */
  function hookGlobals() {
    if (typeof window.renderAll === 'function' && !window.__vdRenderAllHooked) {
      window.__vdRenderAllHooked = true;
      var orig = window.renderAll;
      window.renderAll = function () {
        var r = orig.apply(this, arguments);
        setTimeout(forceRerender, 350);
        return r;
      };
    }
    if (typeof window.doRefresh === 'function' && !window.__vdRefreshHooked) {
      window.__vdRefreshHooked = true;
      var origR = window.doRefresh;
      window.doRefresh = function () {
        var r = origR.apply(this, arguments);
        setTimeout(forceRerender, 750);
        return r;
      };
    }
  }

  /* ── Pyramid global handlers ── */
  window.__pyrWin = function (id) {
    var state = pyrLoad(id) || pyrInit(id, 10, 5);
    if (state.done) return;
    state.steps[state.currentStep].status = 'won';
    if (state.currentStep + 1 >= state.numSteps) {
      state.done = true; state.doneStatus = 'won';
    } else {
      state.currentStep++;
      state.steps[state.currentStep].status = 'current';
    }
    pyrSave(id, state);
    var w = document.getElementById('vd-pyr-wrap-' + id);
    if (w) w.innerHTML = pyrBuildBlockHtml(id);
  };
  window.__pyrLose = function (id) {
    var state = pyrLoad(id) || pyrInit(id, 10, 5);
    if (state.done) return;
    state.steps[state.currentStep].status = 'lost';
    state.done = true; state.doneStatus = 'lost';
    pyrSave(id, state);
    var w = document.getElementById('vd-pyr-wrap-' + id);
    if (w) w.innerHTML = pyrBuildBlockHtml(id);
  };
  window.__pyrPlace = function (id) {
    var state = pyrLoad(id);
    if (!state || state.done) return;
    state.steps[state.currentStep].placed = true;
    pyrSave(id, state);
    var w = document.getElementById('vd-pyr-wrap-' + id);
    if (w) w.innerHTML = pyrBuildBlockHtml(id);
  };
  window.__pyrReset = function (id) {
    var existing = pyrLoad(id);
    var stk = existing ? existing.initStake : 10;
    var stp = existing ? existing.numSteps  : 5;
    var stkEl = document.getElementById('vd-pyr-stk-' + id);
    var stpEl = document.getElementById('vd-pyr-stp-' + id);
    if (stkEl) stk = parseFloat(stkEl.value) || stk;
    if (stpEl) stp = parseInt(stpEl.value)   || stp;
    pyrSave(id, pyrInit(id, stk, stp));
    var w = document.getElementById('vd-pyr-wrap-' + id);
    if (w) w.innerHTML = pyrBuildBlockHtml(id);
  };
  window.__pyrApplyCfg = function (id) {
    var stkEl = document.getElementById('vd-pyr-stk-' + id);
    var stpEl = document.getElementById('vd-pyr-stp-' + id);
    var stk = stkEl ? (parseFloat(stkEl.value) || 10) : 10;
    var stp = stpEl ? (parseInt(stpEl.value)   || 5)  : 5;
    pyrSave(id, pyrInit(id, stk, stp));
    var w = document.getElementById('vd-pyr-wrap-' + id);
    if (w) w.innerHTML = pyrBuildBlockHtml(id);
  };

  /* ── Boot ── */
  function boot() {
    hookGlobals();
    render();
    watchShell();
    /* Retry at increasing intervals — catches async data loads */
    [200, 800, 1800, 3500].forEach(function (d) {
      setTimeout(function () { hookGlobals(); render(); }, d);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
