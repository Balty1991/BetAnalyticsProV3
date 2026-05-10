// ═══════════════════════════════════════════════════════════════════════
// VEYRA — Historic Meciuri Tracker V9 HOTFIX
// Păstrează schița/UI-ul vechi al tab-ului Istoric.
// Schimbă DOAR sursa istoricului:
//   ✅ citește exclusiv lista filtrată din tab-ul Meciuri: window.MATCHES_FILTERED_CACHE
//   ❌ nu citește ALL_MATCHES / adaptive_predictions / ML pools pentru a adăuga meciuri
//   ✅ recommendation_log.json este folosit doar pentru settlement W/L al intrărilor deja capturate
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__veyraHistoricMeciuriV9Hotfix) return;
  window.__veyraHistoricMeciuriV9Hotfix = true;

  var STORAGE_KEY = 'bat_meciuri_visible_capture_v2';
  var RESET_FLAG = STORAGE_KEY + ':reset_done_20260510';
  var LOG_URL = 'data/recommendation_log.json';

  // Chei vechi/poluate pe care le golim o singură dată ca să pornim cu bază curată.
  var OLD_KEYS = [
    'bat_meciuri_capture_v1',
    'bet_history21',
    'bet_prediction_history',
    'bet_visible_history',
    'veyra_visible_history_v1'
  ];

  var CATS = [
    { key: 'all',   label: 'Toate',      accent: 'rgba(59,130,246,.85)' },
    { key: 'safe',  label: '⭐ Top',      accent: 'rgba(34,197,94,.9)' },
    { key: 'o15',   label: '🔥 O1.5',    accent: 'rgba(249,115,22,.9)' },
    { key: 'o25',   label: '📊 O2.5',    accent: 'rgba(234,179,8,.9)' },
    { key: 'btts',  label: '🤝 BTTS',    accent: 'rgba(168,85,247,.9)' },
    { key: 'u35',   label: '🧊 U3.5',    accent: 'rgba(6,182,212,.9)' },
    { key: 'value', label: '💰 Value',   accent: 'rgba(245,158,11,.9)' }
  ];

  var MKT_NICE = {
    over15: 'O1.5G',
    over25: 'O2.5G',
    under35: 'U3.5G',
    under25: 'U2.5G',
    btts: 'BTTS',
    btts_no: 'BTTS NO',
    homeWin: '1',
    awayWin: '2',
    draw: 'X',
    dc1x: '1X',
    dcx2: 'X2',
    dc12: '12'
  };

  var MONTH_LONG = [
    'Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
    'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'
  ];
  var MONTH_SHORT = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var DAY_SHORT = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];

  var initDate = new Date();
  var S = {
    mode: 'days7',
    selDay: 0,
    weeksMonth: { y: initDate.getFullYear(), m: initDate.getMonth() },
    selWeekIdx: -1,
    month: { y: initDate.getFullYear(), m: initDate.getMonth() },
    year: initDate.getFullYear(),
    view: 'grid',
    cat: null
  };

  var localCache = null;
  var lastHtml = '';
  var captureTimer = null;
  var settleTimer = null;
  var lastVisibleSignature = '';

  function $(id) { return document.getElementById(id); }
  function nv(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }
  function txt(v) { return String(v == null ? '' : v); }
  function esc(s) {
    return txt(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function pad2(x) { return String(x).padStart(2, '0'); }
  function nowIso() { return new Date().toISOString(); }

  function parseDate(v) {
    if (!v) return null;
    var raw = txt(v);
    var d = new Date(raw);
    if (isNaN(d.getTime())) d = new Date(raw.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }
  function entryTs(r) {
    var d = parseDate(r && (r.event_date || r.kickoff || r.captured_at || r.logged_at));
    return d ? d.getTime() : 0;
  }
  function dayKey(v) {
    var d = parseDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDM(d) { return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); }

  function pct(v) {
    var x = nv(v);
    return (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
  }
  function rcol(v, ok) {
    if (!ok) return 'var(--muted)';
    return nv(v) > 0 ? 'var(--grn)' : (nv(v) < 0 ? 'var(--red)' : 'var(--muted)');
  }
  function wcol(v) {
    return nv(v) >= 65 ? 'var(--grn)' : (nv(v) >= 50 ? 'var(--yel)' : 'var(--red)');
  }
  function getCat(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].key === k) return CATS[i];
    return CATS[0];
  }

  function normalizeMarketKey(mk) {
    var s = txt(mk).toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[._-]/g, '')
      .replace(/ș/g, 's').replace(/ş/g, 's')
      .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
      .replace(/ț/g, 't').replace(/ţ/g, 't');

    if (!s) return '';
    var map = {
      over15: 'over15', over15g: 'over15', peste15: 'over15', o15: 'over15', o1p5: 'over15',
      over25: 'over25', over25g: 'over25', peste25: 'over25', o25: 'over25', o2p5: 'over25',
      under35: 'under35', under35g: 'under35', sub35: 'under35', u35: 'under35', u3p5: 'under35',
      under25: 'under25', under25g: 'under25', sub25: 'under25', u25: 'under25',
      btts: 'btts', bttsyes: 'btts', bothteamstoscore: 'btts', gg: 'btts', ambelemarcheaza: 'btts',
      bttsno: 'btts_no',
      homewin: 'homeWin', home: 'homeWin', gazde: 'homeWin', unu: 'homeWin', '1': 'homeWin',
      awaywin: 'awayWin', away: 'awayWin', oaspeti: 'awayWin', doi: 'awayWin', '2': 'awayWin',
      draw: 'draw', egal: 'draw', x: 'draw',
      dc1x: 'dc1x', sansadubla1x: 'dc1x', doublechance1x: 'dc1x',
      dcx2: 'dcx2', sansadublax2: 'dcx2', doublechancex2: 'dcx2',
      dc12: 'dc12', sansadubla12: 'dc12', doublechance12: 'dc12'
    };
    if (map[s]) return map[s];
    if (s.indexOf('over') >= 0 && s.indexOf('15') >= 0) return 'over15';
    if (s.indexOf('over') >= 0 && s.indexOf('25') >= 0) return 'over25';
    if (s.indexOf('under') >= 0 && s.indexOf('35') >= 0) return 'under35';
    if (s.indexOf('btts') >= 0 || s.indexOf('both') >= 0) return 'btts';
    if (s.indexOf('1x') >= 0) return 'dc1x';
    if (s.indexOf('x2') >= 0) return 'dcx2';
    return s;
  }

  function catForMarket(mk) {
    mk = normalizeMarketKey(mk);
    if (mk === 'over15') return 'o15';
    if (mk === 'over25') return 'o25';
    if (mk === 'under35') return 'u35';
    if (mk === 'btts') return 'btts';
    return '';
  }

  function marketFromCat(cat) {
    return ({ o15: 'over15', o25: 'over25', btts: 'btts', u35: 'under35' })[cat] || '';
  }

  function marketLabel(mk, fallback) {
    mk = normalizeMarketKey(mk);
    return MKT_NICE[mk] || fallback || mk || '—';
  }

  function activeQuickFilter() {
    var f = txt(window.CURRENT_FILTER || '').trim().toLowerCase();
    if (f) {
      var nf = normalizeMarketKey(f);
      var cf = catForMarket(nf);
      if (cf) return cf;
      if (f.indexOf('safe') >= 0 || f.indexOf('top') >= 0) return 'safe';
      if (f.indexOf('value') >= 0) return 'value';
      if (f === 'all' || f === 'toate') return 'all';
    }

    var active = document.querySelector(
      '.mx21-chip.active,.mx20-chip.active,.ba-qf.active,.filter-chip.active,.match-filter-chip.active,[data-filter].active,[data-market].active'
    );
    if (!active) return 'all';

    var val = txt(active.getAttribute('data-filter') || active.getAttribute('data-market') || active.textContent).toLowerCase();
    if (val.indexOf('top') >= 0 || val.indexOf('safe') >= 0) return 'safe';
    if (val.indexOf('o1.5') >= 0 || val.indexOf('over 1.5') >= 0 || val.indexOf('over15') >= 0) return 'o15';
    if (val.indexOf('o2.5') >= 0 || val.indexOf('over 2.5') >= 0 || val.indexOf('over25') >= 0) return 'o25';
    if (val.indexOf('btts') >= 0) return 'btts';
    if (val.indexOf('u3.5') >= 0 || val.indexOf('under 3.5') >= 0 || val.indexOf('under35') >= 0) return 'u35';
    if (val.indexOf('value') >= 0) return 'value';
    return 'all';
  }

  function bestPickOf(m) {
    if (!m) return {};
    if (typeof window.bestPickFor === 'function') {
      try {
        var b = window.bestPickFor(m);
        if (b) return b;
      } catch (e) {}
    }
    return m.bestPick || m.bestBet || m.rawBestBet || m.pick || {};
  }

  function rawOf(m) {
    return (m && (m.raw || m.event || m.source || m)) || {};
  }

  function candidateArrays(m) {
    var out = [];
    if (!m) return out;
    ['candidates', 'eligibleTypes', 'eligibleMarkets', 'marketCandidates', 'bets', 'bestBets', 'valueBets', 'markets'].forEach(function (k) {
      if (Array.isArray(m[k])) out = out.concat(m[k]);
    });
    var bp = bestPickOf(m);
    if (bp) out.push(bp);
    return out.filter(Boolean);
  }

  function candidateForMarket(m, mk) {
    mk = normalizeMarketKey(mk);
    var arr = candidateArrays(m);
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i] || {};
      var cmk = normalizeMarketKey(c.type || c.market_key || c.market || c.key || c.label || c.name);
      if (cmk === mk) return c;
    }
    return null;
  }

  function hasVisibleMarket(m, mk) {
    mk = normalizeMarketKey(mk);
    if (typeof window.hasEligibleType === 'function') {
      try {
        if (window.hasEligibleType(m, mk)) return true;
      } catch (e) {}
    }
    if (candidateForMarket(m, mk)) return true;

    var raw = rawOf(m);
    if (mk === 'over15') return nv(raw.prob_over_15 || m.prob_over_15) > 0 || nv(raw.odds_over_15 || m.odds_over_15) > 0;
    if (mk === 'over25') return nv(raw.prob_over_25 || m.prob_over_25) > 0 || nv(raw.odds_over_25 || m.odds_over_25) > 0;
    if (mk === 'under35') return nv(raw.prob_under_35 || raw.prob_over_35 || m.prob_under_35 || m.prob_over_35) > 0 || nv(raw.odds_under_35 || m.odds_under_35) > 0;
    if (mk === 'btts') return nv(raw.prob_btts_yes || m.prob_btts_yes) > 0 || nv(raw.odds_btts_yes || m.odds_btts_yes) > 0;
    return false;
  }

  function pickForActiveFilter(m, activeFilter) {
    var mk = marketFromCat(activeFilter);
    if (mk) {
      var cand = candidateForMarket(m, mk) || {};
      cand.type = cand.type || cand.market_key || mk;
      return cand;
    }
    return bestPickOf(m) || {};
  }

  function probFromRaw(m, mk) {
    var raw = rawOf(m);
    var v = 0;
    if (mk === 'over15') v = raw.prob_over_15 || m.prob_over_15;
    else if (mk === 'over25') v = raw.prob_over_25 || m.prob_over_25;
    else if (mk === 'under35') v = raw.prob_under_35 || m.prob_under_35 || (100 - nv(raw.prob_over_35 || m.prob_over_35));
    else if (mk === 'btts') v = raw.prob_btts_yes || m.prob_btts_yes;
    else if (mk === 'homeWin') v = raw.prob_home_win || m.prob_home_win;
    else if (mk === 'awayWin') v = raw.prob_away_win || m.prob_away_win;
    else if (mk === 'draw') v = raw.prob_draw || m.prob_draw;
    return nv(v);
  }

  function oddsFromRaw(m, mk) {
    var raw = rawOf(m);
    if (mk === 'over15') return nv(raw.odds_over_15 || m.odds_over_15);
    if (mk === 'over25') return nv(raw.odds_over_25 || m.odds_over_25);
    if (mk === 'under35') return nv(raw.odds_under_35 || m.odds_under_35);
    if (mk === 'btts') return nv(raw.odds_btts_yes || m.odds_btts_yes);
    if (mk === 'homeWin') return nv(raw.odds_home || m.odds_home);
    if (mk === 'awayWin') return nv(raw.odds_away || m.odds_away);
    if (mk === 'draw') return nv(raw.odds_draw || m.odds_draw);
    return 0;
  }

  function computeCats(m, activeFilter, mk, pick) {
    var cats = ['all'];
    activeFilter = activeFilter || 'all';
    mk = normalizeMarketKey(mk || (pick && (pick.type || pick.market_key || pick.market || pick.label)));

    if (['safe','o15','o25','btts','u35','value'].indexOf(activeFilter) >= 0) cats.push(activeFilter);

    var verdict = txt(m && m.verdict).toLowerCase();
    var risk = txt(m && m.riskTier || m && m.risk_tier).toLowerCase();
    if (verdict === 'safe' || risk === 'safe') cats.push('safe');

    var edge = nv(pick && (pick.edgePct != null ? pick.edgePct : (pick.edge_pct != null ? pick.edge_pct : pick.edge)));
    var value = nv(pick && pick.value);
    if (risk === 'value' || value >= 0.08 || edge >= 8) cats.push('value');

    var mcat = catForMarket(mk);
    if (mcat) cats.push(mcat);

    // Dacă suntem pe Toate, marcăm doar categoriile pe care meciul le are în cache-ul filtrat,
    // dar nu adăugăm meciuri noi din afara cache-ului.
    if (activeFilter === 'all') {
      [['over15','o15'], ['over25','o25'], ['btts','btts'], ['under35','u35']].forEach(function (pair) {
        if (hasVisibleMarket(m, pair[0])) cats.push(pair[1]);
      });
    }

    var seen = {};
    return cats.filter(function (c) {
      if (!c || seen[c]) return false;
      seen[c] = true;
      return true;
    });
  }

  function eventKeyFrom(m, mk, eventDate, home, away) {
    var eid = txt(m && (m.event_id || (m.event && m.event.id) || m.id || '')).trim();
    mk = normalizeMarketKey(mk);
    if (eid && mk) return eid + '::' + mk;
    return [dayKey(eventDate), txt(home).toLowerCase().trim(), txt(away).toLowerCase().trim(), mk].join('::');
  }

  function visibleSourceList() {
    // SINGURA sursă permisă pentru adăugare în istoric.
    // Nu există fallback la ALL_MATCHES, pentru că exact asta producea meciuri invizibile în Istoric.
    if (Array.isArray(window.MATCHES_FILTERED_CACHE)) {
      return window.MATCHES_FILTERED_CACHE.slice();
    }
    return [];
  }

  function visibleSignature(rows, activeFilter) {
    return (rows || []).map(function (m) {
      var bp = bestPickOf(m);
      return [
        m && (m.event_id || (m.event && m.event.id) || m.id || ''),
        m && (m.home || (m.event && m.event.home_team) || ''),
        m && (m.away || (m.event && m.event.away_team) || ''),
        m && (m.eventDate || m.event_date || (m.event && m.event.event_date) || ''),
        normalizeMarketKey(bp.type || bp.market_key || bp.market || bp.label),
        activeFilter,
        $('league-filter') ? $('league-filter').value : '',
        $('match-date-filter') ? $('match-date-filter').value : '',
        $('match-market-filter') ? $('match-market-filter').value : '',
        $('match-verdict-filter') ? $('match-verdict-filter').value : '',
        $('match-min-prob') ? $('match-min-prob').value : '',
        $('match-min-edge') ? $('match-min-edge').value : '',
        $('match-kickoff-filter') ? $('match-kickoff-filter').value : '',
        $('match-tier-filter') ? $('match-tier-filter').value : '',
        $('match-min-score') ? $('match-min-score').value : ''
      ].join('~');
    }).join('|');
  }

  function matchToEntry(m, activeFilter) {
    if (!m) return null;

    var pick = pickForActiveFilter(m, activeFilter);
    var mk = normalizeMarketKey(pick.type || pick.market_key || pick.market || pick.label || marketFromCat(activeFilter));
    if (!mk && activeFilter && activeFilter !== 'all') mk = marketFromCat(activeFilter);
    if (!mk) {
      var bp = bestPickOf(m);
      mk = normalizeMarketKey(bp.type || bp.market_key || bp.market || bp.label);
      pick = bp || pick;
    }
    if (!mk) return null;

    // Dacă filtrul activ e de piață, nu capturăm meciul dacă nu are acea piață în cache.
    if (marketFromCat(activeFilter) && !hasVisibleMarket(m, marketFromCat(activeFilter))) {
      // Totuși, dacă Meciuri l-a filtrat deja și pick-ul are piața activă, îl păstrăm.
      if (mk !== marketFromCat(activeFilter)) return null;
    }

    var eventDate = m.eventDate || m.event_date || m.kickoff || (m.event && m.event.event_date) || '';
    var home = m.home || m.home_team || (m.event && m.event.home_team) || '';
    var away = m.away || m.away_team || (m.event && m.event.away_team) || '';
    if (!home || !away) return null;

    var prob = nv(
      pick.adjProb != null ? pick.adjProb :
      pick.adjusted_prob != null ? pick.adjusted_prob :
      pick.prob != null ? pick.prob :
      pick.probability != null ? pick.probability :
      probFromRaw(m, mk)
    );
    if (prob > 0 && prob <= 1) prob *= 100;

    var odds = nv(pick.odds || pick.book_odds || pick.price || oddsFromRaw(m, mk));
    var edge = nv(pick.edgePct != null ? pick.edgePct : (pick.edge_pct != null ? pick.edge_pct : pick.edge));
    var value = nv(pick.value);
    var cats = computeCats(m, activeFilter, mk, pick);
    if (!cats.length) cats = ['all'];

    var entry = {
      tracker_id: '',
      source: 'MATCHES_FILTERED_CACHE',
      status: 'pending',
      event_id: m.event_id || (m.event && m.event.id) || m.id || null,
      prediction_id: m.prediction_id || pick.prediction_id || null,
      home: home,
      away: away,
      league: m.league || (m.leagueObj && m.leagueObj.name) || (m.event && m.event.league && m.event.league.name) || '',
      event_date: eventDate,
      market_key: mk,
      market: marketLabel(mk, pick.label || pick.market),
      odds: +odds.toFixed(3),
      adjusted_prob: +prob.toFixed(2),
      edge_pct: +edge.toFixed(2),
      value: +value.toFixed(4),
      score: +nv(m.smartScore != null ? m.smartScore : (m.score != null ? m.score : pick.score)).toFixed(2),
      verdict: m.verdict || '',
      risk_tier: m.riskTier || m.risk_tier || '',
      eligible_categories: cats,
      visible_filter: activeFilter || 'all',
      captured_at: nowIso(),
      last_seen_at: nowIso()
    };

    entry.tracker_id = eventKeyFrom(m, mk, eventDate, home, away);
    return entry;
  }

  function emptyCapture() {
    return {
      version: 2,
      source: 'MATCHES_FILTERED_CACHE_ONLY',
      created_at: nowIso(),
      captured_at: nowIso(),
      total: 0,
      entries: []
    };
  }

  function migrateOnce() {
    try {
      if (localStorage.getItem(RESET_FLAG) === '1') return;
      OLD_KEYS.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(RESET_FLAG, '1');
    } catch (e) {}
  }

  function readCapture() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyCapture();
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.entries)) return emptyCapture();
      obj.entries = obj.entries.filter(Boolean);
      return obj;
    } catch (e) {
      return emptyCapture();
    }
  }

  function writeCapture(capture) {
    try {
      capture.version = 2;
      capture.source = 'MATCHES_FILTERED_CACHE_ONLY';
      capture.captured_at = nowIso();
      capture.total = (capture.entries || []).length;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capture));
      localCache = capture.entries || [];
      return true;
    } catch (e) {
      console.warn('[VEYRA Istoric] Nu pot salva în localStorage:', e);
      return false;
    }
  }

  function invalidateLocalCache() {
    localCache = null;
  }

  function captureFromMeciuri(reason) {
    migrateOnce();

    var rows = visibleSourceList();
    if (!rows.length) return 0;

    var activeFilter = activeQuickFilter();
    var sig = visibleSignature(rows, activeFilter);
    if (sig && sig === lastVisibleSignature) return 0;
    lastVisibleSignature = sig;

    var fresh = {};
    rows.forEach(function (m) {
      var entry = matchToEntry(m, activeFilter);
      if (!entry || !entry.tracker_id) return;
      fresh[entry.tracker_id] = entry;
    });

    var keys = Object.keys(fresh);
    if (!keys.length) return 0;

    var capture = readCapture();
    var map = {};
    (capture.entries || []).forEach(function (e) {
      if (!e) return;
      var key = e.tracker_id || eventKeyFrom(e, e.market_key, e.event_date, e.home, e.away);
      map[key] = e;
    });

    keys.forEach(function (key) {
      var next = fresh[key];
      var prev = map[key];

      if (prev) {
        next.captured_at = prev.captured_at || next.captured_at;
        next.first_seen_at = prev.first_seen_at || prev.captured_at || next.captured_at;

        if (['win','lose','void'].indexOf(prev.status) >= 0) {
          next.status = prev.status;
          next.home_score = prev.home_score;
          next.away_score = prev.away_score;
          next.settled_at = prev.settled_at;
          next.won = prev.won;
          next.profit_units = prev.profit_units;
        }

        // Păstrăm apartenența pe categorii, dar doar pentru meciuri capturate din cache vizibil.
        var merged = {};
        (prev.eligible_categories || []).concat(next.eligible_categories || []).forEach(function (c) {
          if (['all','safe','o15','o25','btts','u35','value'].indexOf(c) >= 0) merged[c] = true;
        });
        next.eligible_categories = Object.keys(merged);
        if (next.eligible_categories.indexOf('all') < 0) next.eligible_categories.unshift('all');
      } else {
        next.first_seen_at = next.captured_at;
      }

      map[key] = next;
    });

    capture.entries = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return entryTs(b) - entryTs(a); });

    writeCapture(capture);
    render();
    scheduleSettlement();

    console.log('[VEYRA Istoric] Captură strict vizibilă:', keys.length, 'filtru=', activeFilter, 'reason=', reason || '');
    return keys.length;
  }

  function scheduleCapture(reason) {
    clearTimeout(captureTimer);
    captureTimer = setTimeout(function () { captureFromMeciuri(reason || 'scheduled'); }, 180);
  }

  function computeWonFromScores(marketKey, hs, as) {
    if (hs == null || as == null || hs === '' || as === '') return null;
    hs = Number(hs); as = Number(as);
    if (!isFinite(hs) || !isFinite(as)) return null;

    var total = hs + as;
    var mk = normalizeMarketKey(marketKey);
    if (mk === 'over15') return total > 1;
    if (mk === 'over25') return total > 2;
    if (mk === 'under35') return total < 4;
    if (mk === 'under25') return total < 3;
    if (mk === 'btts') return hs > 0 && as > 0;
    if (mk === 'btts_no') return !(hs > 0 && as > 0);
    if (mk === 'homeWin') return hs > as;
    if (mk === 'awayWin') return as > hs;
    if (mk === 'draw') return hs === as;
    if (mk === 'dc1x') return hs >= as;
    if (mk === 'dcx2') return as >= hs;
    if (mk === 'dc12') return hs !== as;
    return null;
  }

  function rowOutcome(row) {
    var st = txt(row && (row.status || row.result || row.outcome)).toLowerCase().trim();
    if (row && row.won === true) return 'win';
    if (row && row.won === false) return 'lose';
    if (['win','won','green','success'].indexOf(st) >= 0) return 'win';
    if (['lose','loss','lost','red','failed'].indexOf(st) >= 0) return 'lose';
    if (['void','push','cancelled','canceled'].indexOf(st) >= 0) return 'void';
    return 'pending';
  }

  function syncStatusFromLogRows(log) {
    if (!Array.isArray(log) || !log.length) return 0;

    var capture = readCapture();
    var entries = capture.entries || [];
    if (!entries.length) return 0;

    var byEvent = {};
    var byEventMarket = {};
    log.forEach(function (r) {
      if (!r) return;
      var eid = txt(r.event_id || r.id).trim();
      if (!eid) return;
      var mk = normalizeMarketKey(r.market_key || r.market || r.pick || r.type);
      byEvent[eid] = r;
      if (mk) byEventMarket[eid + '::' + mk] = r;
    });

    var changed = 0;
    entries.forEach(function (e) {
      if (!e || ['win','lose','void'].indexOf(e.status) >= 0) return;

      var eid = txt(e.event_id).trim();
      var mk = normalizeMarketKey(e.market_key);
      var src = byEventMarket[eid + '::' + mk] || byEvent[eid];
      if (!src) return;

      var out = rowOutcome(src);
      var won = null;

      if (out === 'win') won = true;
      else if (out === 'lose') won = false;
      else if (out === 'void') {
        e.status = 'void';
        e.settled_at = src.settled_at || src.updated_at || nowIso();
        changed++;
        return;
      } else {
        won = computeWonFromScores(mk, src.home_score, src.away_score);
      }

      if (won === null) return;

      e.status = won ? 'win' : 'lose';
      e.won = !!won;
      e.home_score = src.home_score;
      e.away_score = src.away_score;
      e.settled_at = src.settled_at || src.updated_at || nowIso();
      e.profit_units = won ? +(Math.max(0, nv(e.odds) - 1)).toFixed(3) : -1;
      changed++;
    });

    if (changed) {
      writeCapture(capture);
      render();
      console.log('[VEYRA Istoric] Settlement W/L:', changed);
    }
    return changed;
  }

  function syncStatusFromLog() {
    fetch(LOG_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(syncStatusFromLogRows)
      .catch(function () {});
  }

  function scheduleSettlement() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(syncStatusFromLog, 450);
  }

  function loadEntries(cb) {
    migrateOnce();
    if (localCache) {
      cb(localCache);
      return;
    }
    var capture = readCapture();
    localCache = capture.entries || [];
    cb(localCache);
  }

  function weekMonday(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    var dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return x;
  }

  function getWeeksForMonth(y, m) {
    var first = new Date(y, m, 1);
    var last = new Date(y, m + 1, 0);
    var cur = weekMonday(first);
    var weeks = [];
    while (cur <= last) {
      var wEnd = new Date(cur);
      wEnd.setDate(cur.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);
      weeks.push({ startDate: new Date(cur), endDate: new Date(wEnd), s: cur.getTime(), e: wEnd.getTime() });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }

  function currentWeekIdx(weeks) {
    var now = Date.now();
    for (var i = 0; i < weeks.length; i++) {
      if (now >= weeks[i].s && now <= weeks[i].e) return i;
    }
    return Math.max(0, weeks.length - 1);
  }

  function isCurrentWeek(w) {
    var now = Date.now();
    return w && now >= w.s && now <= w.e;
  }

  function dayBounds(idx) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - idx);
    var e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return { s: d.getTime(), e: e.getTime(), date: new Date(d) };
  }

  function activeWeekBounds() {
    var weeks = getWeeksForMonth(S.weeksMonth.y, S.weeksMonth.m);
    var idx = S.selWeekIdx >= 0 && S.selWeekIdx < weeks.length ? S.selWeekIdx : currentWeekIdx(weeks);
    return weeks[idx] || weeks[0];
  }

  function inPeriod(row) {
    var t = entryTs(row);
    if (!t) return false;

    if (S.mode === 'days7') {
      var db = dayBounds(S.selDay);
      return t >= db.s && t <= db.e;
    }

    if (S.mode === 'weeks') {
      var wb = activeWeekBounds();
      return t >= wb.s && t <= wb.e;
    }

    var d = new Date(t);

    if (S.mode === 'month') {
      return d.getFullYear() === S.month.y && d.getMonth() === S.month.m;
    }

    if (S.mode === 'year') {
      return d.getFullYear() === S.year;
    }

    return true;
  }

  function periodLabel() {
    if (S.mode === 'days7') {
      var db = dayBounds(S.selDay);
      var d = db.date;
      return d.getDate() + ' ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();
    }
    if (S.mode === 'weeks') {
      var wb = activeWeekBounds();
      return fmtDM(wb.startDate) + ' – ' + fmtDM(wb.endDate);
    }
    if (S.mode === 'month') return MONTH_LONG[S.month.m] + ' ' + S.month.y;
    if (S.mode === 'year') return 'Anul ' + S.year;
    return '';
  }

  function getRowsForCat(catKey, entries) {
    return (entries || []).filter(function (r) {
      if (!inPeriod(r)) return false;
      var cats = Array.isArray(r.eligible_categories) ? r.eligible_categories : [];
      return catKey === 'all' || cats.indexOf(catKey) >= 0;
    }).map(function (r) {
      return {
        _st: r.status || 'pending',
        event_id: r.event_id,
        home: r.home,
        away: r.away,
        league: r.league,
        event_date: r.event_date,
        market_key: r.market_key,
        market: r.market,
        odds: nv(r.odds),
        adjusted_prob: nv(r.adjusted_prob),
        edge_pct: nv(r.edge_pct),
        value: nv(r.value),
        score: nv(r.score),
        verdict: r.verdict || '',
        home_score: r.home_score,
        away_score: r.away_score,
        eligible_categories: r.eligible_categories || []
      };
    });
  }

  function calcStats(rows) {
    var settled = rows.filter(function (r) { return r._st === 'win' || r._st === 'lose'; });
    var pending = rows.filter(function (r) { return r._st === 'pending'; });
    var wins = settled.filter(function (r) { return r._st === 'win'; }).length;
    var profit = settled.reduce(function (acc, r) {
      var o = nv(r.odds);
      return acc + (r._st === 'win' ? (o > 1 ? o - 1 : 0) : -1);
    }, 0);
    var edgeSum = settled.reduce(function (acc, r) { return acc + nv(r.edge_pct); }, 0);
    var breakEven = settled.length ? settled.reduce(function (a, r) {
      return a + (nv(r.odds) > 1 ? 100 / nv(r.odds) : 50);
    }, 0) / settled.length : 0;

    return {
      total: rows.length,
      settled: settled.length,
      wins: wins,
      losses: settled.length - wins,
      pending: pending.length,
      winrate: settled.length ? wins * 100 / settled.length : 0,
      roi: settled.length ? profit * 100 / settled.length : 0,
      avgEdge: settled.length ? edgeSum / settled.length : 0,
      profit: profit,
      breakEven: breakEven,
      delta: settled.length ? (wins * 100 / settled.length) - breakEven : 0
    };
  }

  function injectCss() {
    if ($('bat-hist-v9-css')) return;

    var css = [
      '.bh-wrap{padding:2px 0 84px}',
      '.bh-mbar{display:flex;gap:10px;margin:10px 0 10px;padding:10px;border-radius:25px;background:linear-gradient(135deg,rgba(43,229,197,.08),rgba(59,130,246,.04));border:1px solid rgba(43,229,197,.18);box-shadow:0 16px 40px rgba(0,0,0,.18);flex-wrap:wrap}',
      '.bh-mbtn{padding:14px 19px;border-radius:18px;font-size:14px;font-weight:900;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(18,24,42,.92),rgba(12,17,31,.92));color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}',
      '.bh-mbtn.on{background:linear-gradient(135deg,rgba(43,229,197,.20),rgba(30,41,59,.68));border-color:rgba(43,229,197,.65);color:var(--acc);box-shadow:0 0 0 1px rgba(43,229,197,.12),0 10px 28px rgba(43,229,197,.12)}',
      '.bh-days,.bh-weeks{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 16px;padding:10px;border-radius:22px;background:rgba(15,23,42,.45);border:1px solid rgba(43,229,197,.16)}',
      '.bh-daybtn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 13px;border-radius:17px;min-width:54px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(180deg,rgba(18,24,42,.92),rgba(10,15,28,.92));color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-dlbl{font-size:11px;font-weight:800;opacity:.78}',
      '.bh-dnum{font-size:31px;font-weight:950;letter-spacing:-.05em;line-height:1;color:var(--txt)}',
      '.bh-dmo{font-size:12px;font-weight:800;opacity:.78}',
      '.bh-daybtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.55);color:var(--acc)}',
      '.bh-daybtn.on .bh-dnum{color:var(--acc)}',
      '.bh-wm-row{display:flex;align-items:center;gap:9px;margin:4px 0 10px;flex-wrap:wrap}',
      '.bh-wm-lbl{font-size:13px;color:var(--muted);font-weight:700}',
      '.bh-sel{padding:11px 18px;border-radius:17px;font-size:14px;font-weight:800;border:1px solid rgba(255,255,255,.10);background:linear-gradient(180deg,rgba(18,24,42,.92),rgba(10,15,28,.92));color:var(--txt);cursor:pointer;max-width:240px}',
      '.bh-wkbtn{padding:13px 18px;border-radius:17px;font-size:14px;font-weight:900;border:1px solid rgba(255,255,255,.09);background:rgba(18,24,42,.76);color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-wkbtn.on{background:rgba(43,229,197,.14);border-color:rgba(43,229,197,.55);color:var(--acc)}',
      '.bh-wkbtn.current{border-color:rgba(245,158,11,.42);color:var(--yel)}',
      '.bh-source{font-size:13px;color:var(--muted);line-height:1.45;padding:15px 17px;border-radius:18px;background:rgba(15,23,42,.55);border:1px solid rgba(59,130,246,.17);margin:10px 0 16px}',
      '.bh-source b{color:var(--txt)}',
      '.bh-sum{padding:18px 16px;border-radius:24px;margin-bottom:16px;background:linear-gradient(135deg,rgba(43,229,197,.08),rgba(59,130,246,.05));border:1px solid rgba(43,229,197,.42);box-shadow:0 18px 44px rgba(0,0,0,.18)}',
      '.bh-stitle{font-size:18px;font-weight:950;color:var(--txt);margin-bottom:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;letter-spacing:-.03em}',
      '.bh-stitle b{color:var(--acc)}',
      '.bh-ptag{font-size:11px;padding:5px 10px;border-radius:999px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.32);color:var(--yel);font-weight:800}',
      '.bh-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}',
      '.bh-kcard{padding:19px 8px;border-radius:18px;background:linear-gradient(180deg,rgba(18,24,42,.74),rgba(9,13,25,.86));border:1px solid rgba(255,255,255,.08);text-align:center;min-height:92px;display:flex;flex-direction:column;justify-content:center}',
      '.bh-kval{font-size:24px;font-weight:950;line-height:1;margin-bottom:9px;letter-spacing:-.04em}',
      '.bh-klbl{font-size:12px;color:var(--muted);font-family:var(--mono);letter-spacing:.18em;text-transform:uppercase}',
      '.bh-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:4px}',
      '.bh-card{padding:18px 15px 14px;border-radius:22px;cursor:pointer;background:linear-gradient(180deg,rgba(18,24,42,.62),rgba(8,13,24,.82));border:1px solid rgba(255,255,255,.08);position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent;box-shadow:0 14px 35px rgba(0,0,0,.16)}',
      '.bh-card:active{opacity:.82}',
      '.bh-card::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(circle at 20% 0%,rgba(43,229,197,.09),transparent 45%);pointer-events:none}',
      '.bh-card-name{font-size:19px;font-weight:950;color:var(--txt);margin-bottom:13px;position:relative;z-index:1}',
      '.bh-card-roi{font-size:30px;font-weight:950;line-height:1;margin-bottom:13px;position:relative;z-index:1;letter-spacing:-.04em}',
      '.bh-card-meta{font-size:13px;color:var(--muted);line-height:1.45;position:relative;z-index:1}',
      '.bh-card-arr{position:absolute;top:15px;right:13px;font-size:23px;opacity:.33;color:var(--txt)}',
      '.bh-card-bar{height:4px;border-radius:999px;margin-top:14px;opacity:.50;position:relative;z-index:1}',
      '.bh-ddh{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:13px 14px;border-radius:18px;background:rgba(15,23,42,.50);border:1px solid rgba(255,255,255,.08)}',
      '.bh-back{padding:9px 13px;border-radius:13px;font-size:13px;font-weight:850;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-ddtitle{font-size:16px;font-weight:950;color:var(--txt)}',
      '.bh-ddper{font-size:11px;color:var(--muted);font-family:var(--mono)}',
      '.bh-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
      '.bh-pill{padding:7px 10px;border-radius:11px;font-size:12px;font-weight:800;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)}',
      '.bh-dayg{margin-bottom:16px}',
      '.bh-daylbl{font-size:10px;font-family:var(--mono);color:var(--muted);letter-spacing:.08em;text-transform:uppercase;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:8px}',
      '.bh-row{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.045)}',
      '.bh-row:last-child{border-bottom:none}',
      '.bh-badge{width:31px;height:31px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:950;margin-top:1px}',
      '.bh-bw{background:rgba(34,197,94,.18);color:var(--grn);border:1px solid rgba(34,197,94,.28)}',
      '.bh-bl{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.22)}',
      '.bh-bp{background:rgba(245,158,11,.12);color:var(--yel);border:1px solid rgba(245,158,11,.28)}',
      '.bh-main{flex:1;min-width:0}',
      '.bh-teams{font-size:13px;font-weight:850;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bh-meta{font-size:11px;color:var(--muted);margin-top:3px;line-height:1.45}',
      '.bh-odds{font-size:12px;font-weight:900;color:var(--txt);flex-shrink:0;margin-top:2px}',
      '.bh-pend-row{border-left:2px solid rgba(245,158,11,.45);padding-left:7px;opacity:.9}',
      '.bh-empty{text-align:center;padding:36px 16px}',
      '.bh-eico{font-size:34px;margin-bottom:8px}',
      '.bh-etxt{font-size:13px;color:var(--muted);line-height:1.6}',
      '.bh-loading{text-align:center;padding:34px 16px;color:var(--muted);font-size:13px}',
      '@media(max-width:420px){.bh-mbar{gap:8px;padding:9px}.bh-mbtn{padding:13px 18px;font-size:14px}.bh-grid{gap:12px}.bh-card{padding:16px 13px}.bh-card-name{font-size:18px}.bh-card-roi{font-size:27px}.bh-kval{font-size:22px}.bh-daybtn{min-width:50px;padding:11px 10px}.bh-dnum{font-size:29px}.bh-wkbtn{font-size:13px;padding:12px 16px}}',
      '@media(max-width:350px){.bh-grid{grid-template-columns:1fr}.bh-kpi{grid-template-columns:1fr}.bh-mbtn{padding:11px 14px}.bh-daybtn{min-width:44px}}'
    ].join('');

    var el = document.createElement('style');
    el.id = 'bat-hist-v9-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function getMonthOpts() {
    var now = new Date();
    var opts = [];
    for (var i = 0; i < 24; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return opts;
  }

  function renderPeriodBar() {
    function mb(mode, lbl) {
      return '<button class="bh-mbtn' + (S.mode === mode ? ' on' : '') + '" onclick="batH.mode(\'' + mode + '\')">' + lbl + '</button>';
    }

    var h = '<div class="bh-mbar">' +
      mb('days7', '7 Zile') +
      mb('weeks', 'Saptamani') +
      mb('month', 'Luna') +
      mb('year', 'Anual') +
      '</div>';

    if (S.mode === 'days7') {
      h += '<div class="bh-days">';
      for (var di = 0; di < 7; di++) {
        var db = dayBounds(di);
        var d = db.date;
        var top = di === 0 ? 'Azi' : (di === 1 ? 'Ieri' : DAY_SHORT[d.getDay()]);
        h += '<button class="bh-daybtn' + (S.selDay === di ? ' on' : '') + '" onclick="batH.day(' + di + ')">' +
          '<span class="bh-dlbl">' + esc(top) + '</span>' +
          '<span class="bh-dnum">' + d.getDate() + '</span>' +
          '<span class="bh-dmo">' + MONTH_SHORT[d.getMonth()] + '</span>' +
          '</button>';
      }
      h += '</div>';
    }

    if (S.mode === 'weeks') {
      var mopts = getMonthOpts().map(function (o) {
        var sel = (S.weeksMonth.y === o.y && S.weeksMonth.m === o.m) ? ' selected' : '';
        return '<option value="' + o.y + '-' + o.m + '"' + sel + '>' + MONTH_LONG[o.m] + ' ' + o.y + '</option>';
      }).join('');

      h += '<div class="bh-wm-row"><span class="bh-wm-lbl">Luna:</span>' +
        '<select class="bh-sel" onchange="batH.setWeeksMonth(this.value)">' + mopts + '</select></div>';

      var weeks = getWeeksForMonth(S.weeksMonth.y, S.weeksMonth.m);
      var activeIdx = S.selWeekIdx >= 0 && S.selWeekIdx < weeks.length ? S.selWeekIdx : currentWeekIdx(weeks);

      h += '<div class="bh-weeks">';
      weeks.forEach(function (w, idx) {
        var cur = isCurrentWeek(w);
        h += '<button class="bh-wkbtn' + (idx === activeIdx ? ' on' : '') + (cur ? ' current' : '') +
          '" onclick="batH.week(' + idx + ')">' +
          fmtDM(w.startDate) + ' – ' + fmtDM(w.endDate) + (cur ? ' ⏳' : '') +
          '</button>';
      });
      h += '</div>';
    }

    if (S.mode === 'month') {
      var mo = getMonthOpts().map(function (o) {
        var sel = (S.month.y === o.y && S.month.m === o.m) ? ' selected' : '';
        return '<option value="' + o.y + '-' + o.m + '"' + sel + '>' + MONTH_LONG[o.m] + ' ' + o.y + '</option>';
      }).join('');
      h += '<div class="bh-wm-row"><select class="bh-sel" onchange="batH.setMonth(this.value)">' + mo + '</select></div>';
    }

    if (S.mode === 'year') {
      var yopts = '';
      var now = new Date();
      for (var yi = 0; yi < 4; yi++) {
        var yr = now.getFullYear() - yi;
        yopts += '<option value="' + yr + '"' + (S.year === yr ? ' selected' : '') + '>' + yr + '</option>';
      }
      h += '<div class="bh-wm-row"><select class="bh-sel" onchange="batH.setYear(this.value)">' + yopts + '</select></div>';
    }

    return h;
  }

  function kpiCard(val, col, lbl) {
    return '<div class="bh-kcard">' +
      '<div class="bh-kval" style="color:' + col + '">' + val + '</div>' +
      '<div class="bh-klbl">' + lbl + '</div>' +
      '</div>';
  }

  function renderSummary(entries) {
    var rows = getRowsForCat('all', entries);
    var s = calcStats(rows);
    var empty = s.settled === 0;
    var isCurWk = S.mode === 'weeks' && isCurrentWeek(activeWeekBounds());

    return '<div class="bh-sum">' +
      '<div class="bh-stitle">Toate · <b>' + esc(periodLabel()) + '</b>' +
      (isCurWk ? '<span class="bh-ptag">⏳ Sapt. in curs</span>' : '') +
      (s.pending > 0 ? '<span class="bh-ptag">' + s.pending + ' pending</span>' : '') +
      '</div>' +
      '<div class="bh-kpi">' +
      kpiCard(empty ? '—' : pct(s.roi), rcol(s.roi, !empty), 'ROI') +
      kpiCard(empty ? '—' : s.winrate.toFixed(0) + '%', empty ? 'var(--muted)' : wcol(s.winrate), 'Win Rate') +
      kpiCard(empty ? '—' : s.wins + '/' + s.settled, 'var(--txt)', 'W / Jucate') +
      '</div>' +
      '</div>';
  }

  function renderGrid(entries) {
    var cards = CATS.filter(function (c) { return c.key !== 'all'; }).map(function (cat) {
      var rows = getRowsForCat(cat.key, entries);
      var s = calcStats(rows);
      var empty = s.settled === 0;
      var color = rcol(s.roi, !empty);
      var barColor = empty ? 'rgba(148,163,184,.30)' : (s.roi >= 0 ? 'rgba(34,197,94,.65)' : 'rgba(239,68,68,.60)');
      var barW = empty ? '15' : Math.min(100, Math.max(10, Math.abs(s.winrate))).toFixed(0);

      return '<div class="bh-card" onclick="batH.drill(\'' + cat.key + '\')">' +
        '<div class="bh-card-arr">›</div>' +
        '<div class="bh-card-name">' + esc(cat.label) + '</div>' +
        '<div class="bh-card-roi" style="color:' + color + '">' + (empty ? '—' : pct(s.roi)) + '</div>' +
        '<div class="bh-card-meta">' +
        'WR: ' + (empty ? '—' : s.winrate.toFixed(0) + '%') +
        ' · ' + (empty ? '—' : s.wins + '/' + s.settled + ' W') +
        (s.pending > 0 ? ' +' + s.pending + '⏳' : '') +
        '<br>Edge: ' + (empty ? '—' : (s.avgEdge >= 0 ? '+' : '') + s.avgEdge.toFixed(1) + '%') +
        (s.settled > 0 ? ' · Δ' + (s.delta >= 0 ? '+' : '') + s.delta.toFixed(1) + 'pp' : '') +
        '</div>' +
        '<div class="bh-card-bar" style="width:' + barW + '%;background:' + barColor + '"></div>' +
        '</div>';
    }).join('');

    return '<div class="bh-grid">' + cards + '</div>';
  }

  function pill(txtValue, col) {
    return '<span class="bh-pill" style="color:' + col + '">' + esc(txtValue) + '</span>';
  }

  function renderDrilldown(entries) {
    var cat = getCat(S.cat);
    var rows = getRowsForCat(S.cat, entries);

    rows.sort(function (a, b) {
      if (a._st === 'pending' && b._st !== 'pending') return 1;
      if (a._st !== 'pending' && b._st === 'pending') return -1;
      return entryTs(b) - entryTs(a);
    });

    var s = calcStats(rows);
    var empty = s.settled === 0;

    var html = '<div class="bh-ddh">' +
      '<button class="bh-back" onclick="batH.back()">← Înapoi</button>' +
      '<div><div class="bh-ddtitle">' + esc(cat.label) + '</div>' +
      '<div class="bh-ddper">' + esc(periodLabel()) + '</div></div>' +
      '</div>' +
      '<div class="bh-pills">' +
      pill('ROI: ' + (empty ? '—' : pct(s.roi)), rcol(s.roi, !empty)) +
      pill('WR: ' + (empty ? '—' : s.winrate.toFixed(0) + '%'), empty ? 'var(--muted)' : wcol(s.winrate)) +
      pill('W/J: ' + (empty ? '—' : s.wins + '/' + s.settled), 'var(--txt)') +
      pill('Edge: ' + (empty ? '—' : (s.avgEdge >= 0 ? '+' : '') + s.avgEdge.toFixed(1) + '%'), 'var(--cyan)') +
      (s.pending > 0 ? pill('⏳ ' + s.pending + ' așteaptă', 'var(--yel)') : '') +
      '</div>';

    if (!rows.length) {
      return html +
        '<div class="bh-empty">' +
        '<div class="bh-eico">🔍</div>' +
        '<div class="bh-etxt">Niciun meci în ' + esc(periodLabel()) + '<br>pentru ' + esc(cat.label) + '.</div>' +
        '</div>';
    }

    var dayMap = {};
    var order = [];
    rows.forEach(function (r) {
      var t = entryTs(r);
      if (!t) return;
      var d = new Date(t);
      var k = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (!dayMap[k]) {
        dayMap[k] = { date: d, rows: [] };
        order.push(k);
      }
      dayMap[k].rows.push(r);
    });

    html += order.map(function (k) {
      var day = dayMap[k];
      var d = day.date;
      var lbl = DAY_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();

      var rowsHtml = day.rows.map(function (r) {
        var st = r._st;
        var pending = st === 'pending';
        var bcls = st === 'win' ? 'bh-bw' : (st === 'lose' ? 'bh-bl' : 'bh-bp');
        var btxt = st === 'win' ? 'W' : (st === 'lose' ? 'L' : '⏳');
        var mkt = marketLabel(r.market_key, r.market);
        var score = (r.home_score != null && r.away_score != null) ? ' [' + r.home_score + '-' + r.away_score + ']' : '';
        var prob = nv(r.adjusted_prob);
        var edge = nv(r.edge_pct);
        var kickoff = '';

        if (pending && r.event_date) {
          try {
            var kd = new Date(r.event_date);
            if (isFinite(kd.getTime())) {
              kickoff = ' · ' + kd.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
            }
          } catch (e) {}
        }

        var meta = [esc(mkt), esc(r.league || '—')];
        if (prob > 0) meta.push(prob.toFixed(0) + '% prob');
        if (edge > 0) meta.push('edge +' + edge.toFixed(1) + '%');

        return '<div class="bh-row' + (pending ? ' bh-pend-row' : '') + '">' +
          '<div class="bh-badge ' + bcls + '">' + btxt + '</div>' +
          '<div class="bh-main">' +
          '<div class="bh-teams">' + esc(r.home || '?') + ' vs ' + esc(r.away || '?') + score + '</div>' +
          '<div class="bh-meta">' + meta.join(' · ') + esc(kickoff) + '</div>' +
          '</div>' +
          '<div class="bh-odds">@' + (nv(r.odds) > 1 ? nv(r.odds).toFixed(2) : '—') + '</div>' +
          '</div>';
      }).join('');

      return '<div class="bh-dayg"><div class="bh-daylbl">' + esc(lbl) + '</div>' + rowsHtml + '</div>';
    }).join('');

    return html;
  }

  function render() {
    var root = $('history21-root');
    if (!root) return;

    injectCss();

    if (!localCache && root.innerHTML.indexOf('bh-wrap') < 0) {
      root.innerHTML = '<div class="bh-loading">⧗ Se incarca istoricul…</div>';
    }

    loadEntries(function (entries) {
      var html;

      if (S.view === 'drilldown' && S.cat) {
        html = '<div class="bh-wrap">' + renderPeriodBar() + renderDrilldown(entries) + '</div>';
      } else {
        html = '<div class="bh-wrap">' +
          renderPeriodBar() +
          '<div class="bh-source">📌 Sursa: <b>Meciuri filtrate</b> — istoricul salvează numai intrările din <b>MATCHES_FILTERED_CACHE</b>, adică lista afișată după filtre. Nu mai adaugă evenimente din ML ascuns.</div>' +
          renderSummary(entries) +
          renderGrid(entries) +
          '</div>';
      }

      if (html !== lastHtml) {
        var r2 = $('history21-root');
        if (r2) {
          r2.innerHTML = html;
          lastHtml = html;
        }
      }
    });
  }

  window.batH = {
    mode: function (m) {
      S.mode = m;
      S.view = 'grid';
      S.cat = null;
      if (m === 'days7') S.selDay = 0;
      if (m === 'weeks') S.selWeekIdx = -1;
      if (m === 'month') {
        var n = new Date();
        S.month = { y: n.getFullYear(), m: n.getMonth() };
      }
      if (m === 'year') S.year = new Date().getFullYear();
      lastHtml = '';
      render();
    },
    day: function (i) { S.selDay = i; lastHtml = ''; render(); },
    week: function (i) { S.selWeekIdx = i; lastHtml = ''; render(); },
    setWeeksMonth: function (v) {
      var p = txt(v).split('-');
      S.weeksMonth = { y: parseInt(p[0], 10), m: parseInt(p[1], 10) };
      S.selWeekIdx = -1;
      lastHtml = '';
      render();
    },
    setMonth: function (v) {
      var p = txt(v).split('-');
      S.month = { y: parseInt(p[0], 10), m: parseInt(p[1], 10) };
      lastHtml = '';
      render();
    },
    setYear: function (v) { S.year = parseInt(v, 10); lastHtml = ''; render(); },
    drill: function (k) {
      S.cat = k;
      S.view = 'drilldown';
      lastHtml = '';
      render();
      var r = $('history21-root');
      if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    back: function () { S.view = 'grid'; S.cat = null; lastHtml = ''; render(); },
    refresh: function () { invalidateLocalCache(); lastHtml = ''; render(); },
    capture: function () { return captureFromMeciuri('manual'); },
    syncStatus: function () { syncStatusFromLog(); },
    clearCapture: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(RESET_FLAG);
        OLD_KEYS.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        invalidateLocalCache();
        lastVisibleSignature = '';
        lastHtml = '';
        render();
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  window.renderHistory21 = function () {
    invalidateLocalCache();
    lastHtml = '';
    render();
    scheduleSettlement();
  };

  function hookRenderMatches() {
    if (window.__veyraHistV9HookedRenderMatches) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__veyraHistV9HookedRenderMatches = true;

    var original = window.renderMatches;
    window.renderMatches = function () {
      var ret = original.apply(this, arguments);
      setTimeout(function () { captureFromMeciuri('renderMatches'); }, 250);
      setTimeout(function () { captureFromMeciuri('renderMatches-late'); }, 900);
      return ret;
    };
  }

  function hookSwitchTab() {
    if (window.__veyraHistV9HookedSwitchTab) return;
    if (typeof window.switchTab !== 'function') return;
    window.__veyraHistV9HookedSwitchTab = true;

    var original = window.switchTab;
    window.switchTab = function (name) {
      var ret = original.apply(this, arguments);

      if (name === 'meciuri' || name === 'matches') {
        setTimeout(function () { captureFromMeciuri('switchTab:meciuri'); }, 450);
        setTimeout(function () { captureFromMeciuri('switchTab:meciuri-late'); }, 1500);
        setTimeout(syncStatusFromLog, 2500);
      }

      if (name === 'istoric21' || name === 'istoric' || name === 'history') {
        invalidateLocalCache();
        lastHtml = '';
        setTimeout(render, 80);
        setTimeout(render, 700);
        setTimeout(syncStatusFromLog, 1200);
      }

      return ret;
    };
  }

  function observeFilterClicks() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.mx21-chip,.mx20-chip,.ba-qf,.filter-chip,.match-filter-chip,[data-filter],[data-market]')) {
        setTimeout(function () { scheduleCapture('filter-click'); }, 450);
        setTimeout(function () { scheduleCapture('filter-click-late'); }, 1200);
      }
    }, true);

    document.addEventListener('change', function (ev) {
      var id = ev.target && ev.target.id;
      if (/^(league-filter|match-date-filter|match-market-filter|match-verdict-filter|match-min-prob|match-min-edge|match-kickoff-filter|match-tier-filter|match-min-score)$/.test(id || '')) {
        setTimeout(function () { scheduleCapture('filter-change'); }, 450);
        setTimeout(function () { scheduleCapture('filter-change-late'); }, 1200);
      }
    }, true);
  }

  function boot() {
    migrateOnce();
    render();
    hookRenderMatches();
    hookSwitchTab();
    observeFilterClicks();

    // În caz că app.js definește funcțiile puțin mai târziu.
    setTimeout(hookRenderMatches, 600);
    setTimeout(hookSwitchTab, 600);

    // Dacă utilizatorul se află deja pe Meciuri și cache-ul există.
    setTimeout(function () {
      if (visibleSourceList().length) {
        captureFromMeciuri('boot');
        syncStatusFromLog();
      }
    }, 1800);

    setInterval(function () {
      hookRenderMatches();
      hookSwitchTab();

      // Captură periodică doar dacă există cache filtrat deja produs de Meciuri.
      if (visibleSourceList().length) captureFromMeciuri('interval');
    }, 60000);

    setInterval(syncStatusFromLog, 180000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
