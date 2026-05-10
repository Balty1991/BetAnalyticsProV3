// ═══════════════════════════════════════════════════════════════════════
// VEYRA — Historic Meciuri Tracker V8
// Source of truth: ONLY the list currently produced by the Meciuri filters.
// It does NOT create history from ALL_MATCHES, adaptive_predictions or ML pools.
// It only settles already-tracked visible picks using recommendation_log.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__veyraVisibleHistoryTrackerV8) return;
  window.__veyraVisibleHistoryTrackerV8 = true;

  var STORAGE_KEY = 'veyra_visible_history_v1';
  var OLD_STORAGE_KEYS = [
    'bat_meciuri_capture_v1',
    'bet_history21',
    'bet_prediction_history',
    'bet_visible_history'
  ];

  var SNAP_URL = 'data/meciuri_visible_history.json';
  var COMPAT_SNAP_URL = 'data/meciuri_snapshot.json';
  var LOG_URL = 'data/recommendation_log.json';

  var CATS = [
    { key: 'all',   label: 'Toate',  chip: 'Toate' },
    { key: 'safe',  label: '⭐ Top',  chip: 'Top' },
    { key: 'o15',   label: 'O1.5',   chip: 'O1.5' },
    { key: 'o25',   label: 'O2.5',   chip: 'O2.5' },
    { key: 'btts',  label: 'BTTS',   chip: 'BTTS' },
    { key: 'u35',   label: 'U3.5',   chip: 'U3.5' },
    { key: 'value', label: 'Value',  chip: 'Value' }
  ];

  var CAT_LABEL = {};
  CATS.forEach(function (c) { CAT_LABEL[c.key] = c.label; });

  var state = {
    period: 'all',
    category: 'all',
    lastVisibleSignature: '',
    captureTimer: null,
    settlementTimer: null,
    bootstrapped: false
  };

  function byId(id) { return document.getElementById(id); }

  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }

  function text(v) {
    return String(v == null ? '' : v);
  }

  function esc(v) {
    return text(v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function parseDate(v) {
    if (!v) return null;
    var d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function dayKey(v) {
    var d = parseDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtDateTime(v) {
    var d = parseDate(v);
    if (!d) return '—';
    try {
      return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }) + ' ' +
        d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return String(v).slice(0, 16);
    }
  }

  function normalizeMarketKey(raw) {
    var s = text(raw).toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[._-]/g, '')
      .replace(/ș/g, 's')
      .replace(/ş/g, 's')
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ț/g, 't')
      .replace(/ţ/g, 't');

    if (!s) return '';

    var aliases = {
      over15: 'over15', over15g: 'over15', peste15: 'over15', o15: 'over15', o1p5: 'over15',
      over25: 'over25', over25g: 'over25', peste25: 'over25', o25: 'over25', o2p5: 'over25',
      under35: 'under35', under35g: 'under35', sub35: 'under35', u35: 'under35', u3p5: 'under35',
      under25: 'under25', under25g: 'under25', sub25: 'under25', u25: 'under25',
      btts: 'btts', bttsyes: 'btts', bothteamstoscore: 'btts', gg: 'btts', ambelemarcheaza: 'btts',
      homewin: 'homeWin', home: 'homeWin', gazde: 'homeWin', unu: 'homeWin', '1': 'homeWin',
      awaywin: 'awayWin', away: 'awayWin', oaspeti: 'awayWin', doi: 'awayWin', '2': 'awayWin',
      draw: 'draw', egal: 'draw', x: 'draw',
      dc1x: 'dc1x', sansadubla1x: 'dc1x',
      dcx2: 'dcx2', sansadublax2: 'dcx2',
      dc12: 'dc12', sansadubla12: 'dc12'
    };

    if (aliases[s]) return aliases[s];
    if (s.indexOf('over') >= 0 && s.indexOf('15') >= 0) return 'over15';
    if (s.indexOf('over') >= 0 && s.indexOf('25') >= 0) return 'over25';
    if (s.indexOf('under') >= 0 && s.indexOf('35') >= 0) return 'under35';
    if (s.indexOf('btts') >= 0 || s.indexOf('both') >= 0) return 'btts';
    if (s.indexOf('1x') >= 0) return 'dc1x';
    if (s.indexOf('x2') >= 0) return 'dcx2';
    if (s.indexOf('12') >= 0 && s.indexOf('double') >= 0) return 'dc12';
    return s;
  }

  function categoryForMarket(mk) {
    mk = normalizeMarketKey(mk);
    if (mk === 'over15') return 'o15';
    if (mk === 'over25') return 'o25';
    if (mk === 'under35') return 'u35';
    if (mk === 'btts') return 'btts';
    return '';
  }

  function marketLabel(mk, fallback) {
    mk = normalizeMarketKey(mk);
    if (mk === 'over15') return 'Over 1.5G';
    if (mk === 'over25') return 'Over 2.5G';
    if (mk === 'under35') return 'Under 3.5G';
    if (mk === 'btts') return 'BTTS';
    if (mk === 'dc1x') return 'Șansă Dublă 1X';
    if (mk === 'dcx2') return 'Șansă Dublă X2';
    if (mk === 'dc12') return 'Șansă Dublă 12';
    if (mk === 'homeWin') return '1';
    if (mk === 'draw') return 'X';
    if (mk === 'awayWin') return '2';
    return fallback || mk || '—';
  }

  function activeQuickFilter() {
    var f = text(window.CURRENT_FILTER || '').trim();
    if (f) return f;
    var active = document.querySelector('.mx21-chip.active');
    if (!active) return 'all';
    var label = text(active.textContent).toLowerCase();
    if (label.indexOf('top') >= 0) return 'safe';
    if (label.indexOf('o1.5') >= 0) return 'o15';
    if (label.indexOf('o2.5') >= 0) return 'o25';
    if (label.indexOf('btts') >= 0) return 'btts';
    if (label.indexOf('u3.5') >= 0) return 'u35';
    if (label.indexOf('value') >= 0) return 'value';
    return 'all';
  }

  function getBestPick(m) {
    if (!m) return {};
    if (typeof window.bestPickFor === 'function') {
      try {
        var bp = window.bestPickFor(m);
        if (bp) return bp;
      } catch (e) {}
    }
    return m.bestPick || m.bestBet || m.rawBestBet || m.pick || {};
  }

  function candidateList(m) {
    var out = [];
    if (!m) return out;
    ['candidates', 'eligibleTypes', 'eligibleMarkets', 'marketCandidates', 'bets', 'bestBets'].forEach(function (k) {
      if (Array.isArray(m[k])) out = out.concat(m[k]);
    });
    var bp = getBestPick(m);
    if (bp) out.push(bp);
    return out.filter(Boolean);
  }

  function hasCandidate(m, marketKey) {
    marketKey = normalizeMarketKey(marketKey);

    if (typeof window.hasEligibleType === 'function') {
      try {
        if (window.hasEligibleType(m, marketKey)) return true;
      } catch (e) {}
    }

    return candidateList(m).some(function (c) {
      var mk = normalizeMarketKey(c.type || c.market_key || c.market || c.label || c.name);
      return mk === marketKey;
    });
  }

  function computeCategories(m, activeFilter) {
    var cats = ['all'];
    var bp = getBestPick(m);

    activeFilter = activeFilter || activeQuickFilter();

    if (activeFilter && activeFilter !== 'all' && ['safe', 'o15', 'o25', 'btts', 'u35', 'value'].indexOf(activeFilter) >= 0) {
      cats.push(activeFilter);
    }

    if (text(m && m.verdict).toLowerCase() === 'safe' || text(m && m.riskTier).toLowerCase() === 'safe') cats.push('safe');

    var bpValue = num(bp.value);
    var bpEdge = num(bp.edgePct != null ? bp.edgePct : bp.edge_pct);
    if (text(m && m.riskTier).toLowerCase() === 'value' || bpValue >= 0.08 || bpEdge >= 8) cats.push('value');

    ['over15', 'over25', 'btts', 'under35'].forEach(function (mk) {
      if (hasCandidate(m, mk)) {
        var cat = categoryForMarket(mk);
        if (cat) cats.push(cat);
      }
    });

    var bpCat = categoryForMarket(bp.type || bp.market_key || bp.market || bp.label);
    if (bpCat) cats.push(bpCat);

    return cats.filter(function (c, idx, arr) {
      return c && arr.indexOf(c) === idx;
    });
  }

  function visibleSourceList() {
    // Strict source: exactly the current filtered Meciuri cache.
    // Never fall back to ALL_MATCHES, because that reintroduces invisible ML picks.
    if (Array.isArray(window.MATCHES_FILTERED_CACHE)) return window.MATCHES_FILTERED_CACHE.slice();
    return [];
  }

  function visibleSignature(rows) {
    return (rows || []).map(function (m) {
      var bp = getBestPick(m);
      return [
        m && (m.event_id || (m.event && m.event.id) || m.id || ''),
        m && (m.home || (m.event && m.event.home_team) || ''),
        m && (m.away || (m.event && m.event.away_team) || ''),
        m && (m.eventDate || m.event_date || (m.event && m.event.event_date) || ''),
        normalizeMarketKey(bp.type || bp.market_key || bp.market || bp.label),
        activeQuickFilter(),
        byId('league-filter') ? byId('league-filter').value : '',
        byId('match-date-filter') ? byId('match-date-filter').value : '',
        byId('match-market-filter') ? byId('match-market-filter').value : '',
        byId('match-verdict-filter') ? byId('match-verdict-filter').value : '',
        byId('match-min-prob') ? byId('match-min-prob').value : '',
        byId('match-min-edge') ? byId('match-min-edge').value : ''
      ].join('~');
    }).join('|');
  }

  function eventKeyFromMatch(m, bp) {
    var eid = text(m && (m.event_id || (m.event && m.event.id) || m.id || '')).trim();
    var mk = normalizeMarketKey(bp && (bp.type || bp.market_key || bp.market || bp.label));
    var date = dayKey(m && (m.eventDate || m.event_date || (m.event && m.event.event_date)));
    var home = text(m && (m.home || (m.event && m.event.home_team) || '')).trim().toLowerCase();
    var away = text(m && (m.away || (m.event && m.event.away_team) || '')).trim().toLowerCase();

    if (eid && mk) return eid + '::' + mk;
    return [date, home, away, mk].join('::');
  }

  function entryFromMatch(m, activeFilter) {
    var bp = getBestPick(m);
    var mk = normalizeMarketKey(bp.type || bp.market_key || bp.market || bp.label);
    var cats = computeCategories(m, activeFilter);

    if (!mk && activeFilter && ['o15', 'o25', 'btts', 'u35'].indexOf(activeFilter) >= 0) {
      mk = ({ o15: 'over15', o25: 'over25', btts: 'btts', u35: 'under35' })[activeFilter];
    }

    if (!mk) return null;

    var probability = num(bp.adjProb != null ? bp.adjProb : (bp.adjusted_prob != null ? bp.adjusted_prob : (bp.prob != null ? bp.prob : bp.probability)));
    if (probability > 0 && probability <= 1) probability = probability * 100;

    var eventDate = m.eventDate || m.event_date || (m.event && m.event.event_date) || '';
    var home = m.home || (m.event && m.event.home_team) || '';
    var away = m.away || (m.event && m.event.away_team) || '';

    if (!home || !away) return null;

    var entry = {
      tracker_id: '',
      source: 'visible_meciuri_filter_cache',
      status: 'pending',
      event_id: m.event_id || (m.event && m.event.id) || m.id || null,
      prediction_id: m.prediction_id || (bp && bp.prediction_id) || null,
      home: home,
      away: away,
      league: m.league || (m.leagueObj && m.leagueObj.name) || (m.event && m.event.league && m.event.league.name) || '',
      event_date: eventDate,
      market_key: mk,
      market: marketLabel(mk, bp.label || bp.market),
      odds: num(bp.odds || bp.book_odds || bp.price),
      adjusted_prob: +probability.toFixed(2),
      edge_pct: +num(bp.edgePct != null ? bp.edgePct : (bp.edge_pct != null ? bp.edge_pct : bp.edge)).toFixed(2),
      value: +num(bp.value).toFixed(4),
      score: +num(m.smartScore != null ? m.smartScore : (m.score != null ? m.score : bp.score)).toFixed(2),
      verdict: m.verdict || '',
      risk_tier: m.riskTier || '',
      eligible_categories: cats,
      visible_filter: activeFilter || activeQuickFilter(),
      captured_at: nowIso(),
      last_seen_at: nowIso()
    };

    entry.tracker_id = eventKeyFromMatch(m, entry);
    return entry;
  }

  function emptyStore() {
    return {
      version: 1,
      source: 'visible_meciuri_only',
      created_at: nowIso(),
      updated_at: nowIso(),
      total: 0,
      entries: []
    };
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.entries)) return emptyStore();
      obj.entries = obj.entries.filter(Boolean);
      return obj;
    } catch (e) {
      return emptyStore();
    }
  }

  function writeStore(store) {
    try {
      store.updated_at = nowIso();
      store.total = (store.entries || []).length;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      console.warn('[VEYRA history] Nu pot salva localStorage:', e);
      return false;
    }
  }

  function clearOldHistoryOnce() {
    if (localStorage.getItem(STORAGE_KEY + ':old_cleared') === '1') return;
    OLD_STORAGE_KEYS.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    try { localStorage.setItem(STORAGE_KEY + ':old_cleared', '1'); } catch (e) {}
  }

  function resetVisibleHistory() {
    OLD_STORAGE_KEYS.concat([STORAGE_KEY]).forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    writeStore(emptyStore());
    state.lastVisibleSignature = '';
    renderHistory();
    return true;
  }

  function captureVisibleMeciuri(reason) {
    clearOldHistoryOnce();

    var rows = visibleSourceList();
    if (!rows.length) return 0;

    var sig = visibleSignature(rows);
    if (sig && sig === state.lastVisibleSignature) return 0;
    state.lastVisibleSignature = sig;

    var activeFilter = activeQuickFilter();
    var fresh = {};
    rows.forEach(function (m) {
      var entry = entryFromMatch(m, activeFilter);
      if (!entry) return;
      if (!entry.eligible_categories || !entry.eligible_categories.length) return;
      fresh[entry.tracker_id] = entry;
    });

    var keys = Object.keys(fresh);
    if (!keys.length) return 0;

    var store = readStore();
    var map = {};
    (store.entries || []).forEach(function (e) {
      if (!e) return;
      var key = e.tracker_id || (text(e.event_id) + '::' + normalizeMarketKey(e.market_key));
      map[key] = e;
    });

    keys.forEach(function (key) {
      var prev = map[key];
      var next = fresh[key];

      if (prev) {
        // Keep original capture date and settled result, refresh display fields only.
        next.captured_at = prev.captured_at || next.captured_at;
        next.first_seen_at = prev.first_seen_at || prev.captured_at || next.captured_at;

        if (prev.status === 'win' || prev.status === 'lose' || prev.status === 'void') {
          next.status = prev.status;
          next.home_score = prev.home_score;
          next.away_score = prev.away_score;
          next.settled_at = prev.settled_at;
          next.won = prev.won;
          next.profit_units = prev.profit_units;
        }

        // Union categories: a visible pick can belong to multiple Meciuri categories.
        var mergedCats = {};
        (prev.eligible_categories || []).concat(next.eligible_categories || []).forEach(function (c) {
          if (['all', 'safe', 'o15', 'o25', 'btts', 'u35', 'value'].indexOf(c) >= 0) mergedCats[c] = true;
        });
        next.eligible_categories = Object.keys(mergedCats);
        if (next.eligible_categories.indexOf('all') < 0) next.eligible_categories.unshift('all');
      } else {
        next.first_seen_at = next.captured_at;
      }

      map[key] = next;
    });

    store.source = 'visible_meciuri_only';
    store.entries = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return text(b.captured_at).localeCompare(text(a.captured_at));
    });

    writeStore(store);
    if (reason) console.log('[VEYRA history] Captură vizibilă:', keys.length, 'reason=', reason);
    renderHistory();
    scheduleSettlement();
    return keys.length;
  }

  function scheduleCapture(reason) {
    clearTimeout(state.captureTimer);
    state.captureTimer = setTimeout(function () {
      captureVisibleMeciuri(reason || 'scheduled');
    }, 120);
  }

  function computeWon(marketKey, hs, as) {
    if (hs == null || as == null || hs === '' || as === '') return null;
    hs = Number(hs);
    as = Number(as);
    if (!isFinite(hs) || !isFinite(as)) return null;
    var total = hs + as;
    var mk = normalizeMarketKey(marketKey);
    if (mk === 'over15') return total > 1;
    if (mk === 'over25') return total > 2;
    if (mk === 'under35') return total < 4;
    if (mk === 'under25') return total < 3;
    if (mk === 'btts') return hs > 0 && as > 0;
    if (mk === 'homeWin') return hs > as;
    if (mk === 'awayWin') return as > hs;
    if (mk === 'draw') return hs === as;
    if (mk === 'dc1x') return hs >= as;
    if (mk === 'dcx2') return as >= hs;
    if (mk === 'dc12') return hs !== as;
    return null;
  }

  function rowOutcome(row) {
    var st = text(row && (row.status || row.result || row.outcome)).toLowerCase().trim();
    if (row && row.won === true) return 'win';
    if (row && row.won === false) return 'lose';
    if (['win', 'won', 'green', 'success'].indexOf(st) >= 0) return 'win';
    if (['lose', 'loss', 'lost', 'red', 'failed'].indexOf(st) >= 0) return 'lose';
    if (['void', 'push', 'cancelled', 'canceled'].indexOf(st) >= 0) return 'void';
    return 'pending';
  }

  function settleEntriesFromLog(logRows) {
    if (!Array.isArray(logRows) || !logRows.length) return 0;

    var store = readStore();
    if (!store.entries || !store.entries.length) return 0;

    var byEvent = {};
    var byEventMarket = {};
    logRows.forEach(function (r) {
      if (!r) return;
      var eid = text(r.event_id || r.id).trim();
      var mk = normalizeMarketKey(r.market_key || r.market || r.pick);
      var status = rowOutcome(r);
      var hasScore = r.home_score != null && r.away_score != null;
      if (!eid || (!hasScore && status === 'pending')) return;
      byEvent[eid] = r;
      if (mk) byEventMarket[eid + '::' + mk] = r;
    });

    var changed = 0;
    store.entries.forEach(function (e) {
      if (!e || ['win', 'lose', 'void'].indexOf(e.status) >= 0) return;

      var eid = text(e.event_id).trim();
      var mk = normalizeMarketKey(e.market_key);
      var src = byEventMarket[eid + '::' + mk] || byEvent[eid];
      if (!src) return;

      var out = rowOutcome(src);
      var won = null;

      if (out === 'win') won = true;
      else if (out === 'lose') won = false;
      else if (out === 'void') {
        e.status = 'void';
        e.settled_at = src.settled_at || nowIso();
        changed++;
        return;
      } else {
        won = computeWon(mk, src.home_score, src.away_score);
      }

      if (won === null) return;

      e.status = won ? 'win' : 'lose';
      e.won = !!won;
      e.home_score = src.home_score;
      e.away_score = src.away_score;
      e.settled_at = src.settled_at || src.updated_at || nowIso();
      e.profit_units = won ? +(Math.max(0, num(e.odds) - 1)).toFixed(3) : -1;
      changed++;
    });

    if (changed) {
      writeStore(store);
      renderHistory();
      console.log('[VEYRA history] Settlement:', changed, 'intrări actualizate');
    }

    return changed;
  }

  function scheduleSettlement() {
    clearTimeout(state.settlementTimer);
    state.settlementTimer = setTimeout(function () {
      fetch(LOG_URL + '?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(settleEntriesFromLog)
        .catch(function () {});
    }, 250);
  }

  function loadFallbackSnapshot(cb) {
    var store = readStore();
    if (store.entries && store.entries.length) {
      cb(store.entries, 'localStorage');
      return;
    }

    fetch(SNAP_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (data && Array.isArray(data.entries) && data.entries.length) {
          cb(data.entries, 'snapshot');
          return;
        }
        return fetch(COMPAT_SNAP_URL + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
          .then(function (compat) {
            cb((compat && Array.isArray(compat.entries)) ? compat.entries : [], 'empty');
          });
      });
  }

  function inSelectedPeriod(e) {
    if (state.period === 'all') return true;
    var d = parseDate(e.event_date || e.captured_at);
    if (!d) return false;
    var now = new Date();
    var days = { d7: 7, d30: 30, d90: 90, y1: 365 }[state.period] || 0;
    if (!days) return true;
    return d.getTime() >= now.getTime() - days * 86400000;
  }

  function rowsForRender(entries) {
    return (entries || []).filter(function (e) {
      if (!inSelectedPeriod(e)) return false;
      var cats = Array.isArray(e.eligible_categories) ? e.eligible_categories : [];
      if (state.category !== 'all' && cats.indexOf(state.category) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var ap = (a.status === 'pending') ? 1 : 0;
      var bp = (b.status === 'pending') ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return text(a.event_date || a.captured_at).localeCompare(text(b.event_date || b.captured_at));
    });
  }

  function stats(rows) {
    var settled = rows.filter(function (r) { return r.status === 'win' || r.status === 'lose'; });
    var wins = settled.filter(function (r) { return r.status === 'win'; }).length;
    var losses = settled.length - wins;
    var pending = rows.filter(function (r) { return r.status === 'pending'; }).length;
    var profit = settled.reduce(function (acc, r) {
      return acc + (r.status === 'win' ? Math.max(0, num(r.odds) - 1) : -1);
    }, 0);
    return {
      total: rows.length,
      settled: settled.length,
      wins: wins,
      losses: losses,
      pending: pending,
      profit: profit,
      roi: settled.length ? profit * 100 / settled.length : 0,
      winrate: settled.length ? wins * 100 / settled.length : 0
    };
  }

  function categoryStats(entries, cat) {
    return stats((entries || []).filter(function (e) {
      if (!inSelectedPeriod(e)) return false;
      if (cat === 'all') return true;
      return Array.isArray(e.eligible_categories) && e.eligible_categories.indexOf(cat) >= 0;
    }));
  }

  function statusBadge(status) {
    if (status === 'win') return '<span class="vh-badge win">W</span>';
    if (status === 'lose') return '<span class="vh-badge lose">L</span>';
    if (status === 'void') return '<span class="vh-badge void">V</span>';
    return '<span class="vh-badge pending">P</span>';
  }

  function renderHistory() {
    var root = byId('history21-root');
    if (!root) return;

    injectCss();

    loadFallbackSnapshot(function (entries, source) {
      entries = entries || [];
      var rows = rowsForRender(entries);
      var totalStats = stats(rows);

      var periodButtons = [
        ['all', 'Total'],
        ['d7', '7 zile'],
        ['d30', '30 zile'],
        ['d90', '3 luni'],
        ['y1', '1 an']
      ].map(function (p) {
        return '<button class="vh-btn ' + (state.period === p[0] ? 'active' : '') + '" data-vh-period="' + p[0] + '">' + p[1] + '</button>';
      }).join('');

      var catCards = CATS.map(function (cat) {
        var s = categoryStats(entries, cat.key);
        var active = state.category === cat.key ? ' active' : '';
        var roiCls = s.settled ? (s.roi >= 0 ? 'pos' : 'neg') : '';
        return '<button class="vh-cat' + active + '" data-vh-cat="' + cat.key + '">' +
          '<span class="vh-cat-name">' + esc(cat.label) + '</span>' +
          '<span class="vh-cat-big ' + roiCls + '">' + (s.settled ? ((s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%') : '—') + '</span>' +
          '<span class="vh-cat-meta">' + s.pending + ' pending · ' + s.wins + '/' + s.settled + ' W</span>' +
          '</button>';
      }).join('');

      var list = rows.slice(0, 250).map(function (r) {
        var score = (r.home_score != null && r.away_score != null) ? esc(r.home_score + '-' + r.away_score) : '—';
        var cats = (r.eligible_categories || []).filter(function (c) { return c !== 'all'; }).map(function (c) {
          return '<span class="vh-chip">' + esc(CAT_LABEL[c] || c) + '</span>';
        }).join('');
        return '<div class="vh-row">' +
          statusBadge(r.status) +
          '<div class="vh-main">' +
            '<div class="vh-teams">' + esc(r.home) + ' vs ' + esc(r.away) + '</div>' +
            '<div class="vh-meta">' + esc(r.league || '—') + ' · ' + esc(fmtDateTime(r.event_date)) + ' · ' + esc(marketLabel(r.market_key, r.market)) + ' @ ' + (num(r.odds) ? num(r.odds).toFixed(2) : '—') + '</div>' +
            '<div class="vh-cats">' + cats + '</div>' +
          '</div>' +
          '<div class="vh-side">' +
            '<div class="vh-score">' + score + '</div>' +
            '<div class="vh-small">' + (num(r.edge_pct) ? ('Edge ' + num(r.edge_pct).toFixed(1) + '%') : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      if (!rows.length) {
        list = '<div class="vh-empty">' +
          '<div class="vh-empty-title">Istoric nou, curat</div>' +
          '<div class="vh-empty-text">Nu există încă meciuri capturate din lista vizibilă. Deschide tab-ul <b>Meciuri</b>, aplică filtrul dorit, iar ce apare acolo va intra automat aici.</div>' +
        '</div>';
      }

      root.innerHTML =
        '<div class="vh-wrap">' +
          '<div class="vh-note">Sursa activă: <b>' + esc(source) + '</b>. Istoricul folosește doar <b>MATCHES_FILTERED_CACHE</b>, adică lista Meciuri după filtrare. Nu se mai populează din ALL_MATCHES sau predicții ML invizibile.</div>' +
          '<div class="vh-actions">' +
            '<div class="vh-periods">' + periodButtons + '</div>' +
            '<button class="vh-reset" data-vh-reset="1">Reset istoric local</button>' +
          '</div>' +
          '<div class="vh-summary">' +
            '<div><span>Total</span><b>' + totalStats.total + '</b></div>' +
            '<div><span>Pending</span><b>' + totalStats.pending + '</b></div>' +
            '<div><span>Winrate</span><b>' + (totalStats.settled ? totalStats.winrate.toFixed(0) + '%' : '—') + '</b></div>' +
            '<div><span>ROI</span><b class="' + (totalStats.roi >= 0 ? 'pos' : 'neg') + '">' + (totalStats.settled ? ((totalStats.roi >= 0 ? '+' : '') + totalStats.roi.toFixed(1) + '%') : '—') + '</b></div>' +
          '</div>' +
          '<div class="vh-cats-grid">' + catCards + '</div>' +
          '<div class="vh-list-head">' + esc(CAT_LABEL[state.category] || 'Toate') + ' · ' + rows.length + ' selecții</div>' +
          '<div class="vh-list">' + list + '</div>' +
        '</div>';

      bindHistoryEvents(root);
    });
  }

  function bindHistoryEvents(root) {
    root.querySelectorAll('[data-vh-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.period = btn.getAttribute('data-vh-period') || 'all';
        renderHistory();
      });
    });
    root.querySelectorAll('[data-vh-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-vh-cat') || 'all';
        renderHistory();
      });
    });
    var reset = root.querySelector('[data-vh-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        if (confirm('Șterg istoricul local VEYRA și pornesc baza nouă?')) {
          resetVisibleHistory();
        }
      });
    }
  }

  function injectCss() {
    if (byId('veyra-visible-history-css')) return;
    var css = [
      '.vh-wrap{padding:2px 0 80px}',
      '.vh-note{font-size:11px;color:var(--muted);line-height:1.55;padding:10px 12px;margin-bottom:10px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025)}',
      '.vh-actions{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}',
      '.vh-periods{display:flex;gap:6px;flex-wrap:wrap}',
      '.vh-btn,.vh-reset{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);color:var(--muted);border-radius:11px;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer}',
      '.vh-btn.active{color:var(--acc);border-color:rgba(43,229,197,.45);background:rgba(43,229,197,.12)}',
      '.vh-reset{color:#fca5a5;border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.06)}',
      '.vh-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}',
      '.vh-summary>div{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);border-radius:14px;padding:12px;text-align:center}',
      '.vh-summary span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-family:var(--mono)}',
      '.vh-summary b{display:block;color:var(--txt);font-size:22px;margin-top:3px}',
      '.vh-summary b.pos,.vh-cat-big.pos{color:var(--grn)}',
      '.vh-summary b.neg,.vh-cat-big.neg{color:var(--red)}',
      '.vh-cats-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}',
      '.vh-cat{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025);border-radius:15px;padding:11px;text-align:left;cursor:pointer;color:var(--txt)}',
      '.vh-cat.active{border-color:rgba(43,229,197,.45);background:rgba(43,229,197,.08)}',
      '.vh-cat-name{display:block;font-size:12px;font-weight:900}',
      '.vh-cat-big{display:block;font-size:21px;font-weight:950;margin-top:5px}',
      '.vh-cat-meta{display:block;font-size:10px;color:var(--muted);margin-top:3px}',
      '.vh-list-head{font-size:12px;font-weight:900;color:var(--txt);margin:12px 0 6px}',
      '.vh-list{border:1px solid rgba(255,255,255,.06);border-radius:16px;overflow:hidden;background:rgba(255,255,255,.015)}',
      '.vh-row{display:flex;gap:10px;align-items:flex-start;padding:10px;border-bottom:1px solid rgba(255,255,255,.045)}',
      '.vh-row:last-child{border-bottom:0}',
      '.vh-badge{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:950;flex:0 0 auto}',
      '.vh-badge.win{background:rgba(34,197,94,.16);color:var(--grn);border:1px solid rgba(34,197,94,.3)}',
      '.vh-badge.lose{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.24)}',
      '.vh-badge.pending{background:rgba(245,158,11,.13);color:var(--yel);border:1px solid rgba(245,158,11,.25)}',
      '.vh-badge.void{background:rgba(148,163,184,.12);color:var(--muted);border:1px solid rgba(148,163,184,.22)}',
      '.vh-main{flex:1;min-width:0}',
      '.vh-teams{font-size:13px;font-weight:900;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.vh-meta{font-size:10px;color:var(--muted);line-height:1.4;margin-top:2px}',
      '.vh-cats{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}',
      '.vh-chip{font-size:9px;font-weight:800;color:var(--acc);border:1px solid rgba(43,229,197,.2);background:rgba(43,229,197,.07);border-radius:7px;padding:2px 5px}',
      '.vh-side{min-width:48px;text-align:right}',
      '.vh-score{font-size:13px;font-weight:950;color:var(--txt)}',
      '.vh-small{font-size:9px;color:var(--muted);margin-top:4px}',
      '.vh-empty{text-align:center;padding:34px 18px;color:var(--muted)}',
      '.vh-empty-title{font-size:16px;font-weight:950;color:var(--txt);margin-bottom:6px}',
      '.vh-empty-text{font-size:12px;line-height:1.55}',
      '@media(max-width:520px){.vh-summary{grid-template-columns:repeat(2,1fr)}.vh-cats-grid{grid-template-columns:1fr}.vh-teams{white-space:normal}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'veyra-visible-history-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function patchRenderMatches() {
    if (window.__veyraHistoryRenderMatchesPatched) return true;
    if (typeof window.renderMatches !== 'function') return false;

    var original = window.renderMatches;
    window.renderMatches = function () {
      var result = original.apply(this, arguments);
      scheduleCapture('renderMatches');
      return result;
    };

    window.__veyraHistoryRenderMatchesPatched = true;
    return true;
  }

  function patchSetFilter() {
    if (window.__veyraHistorySetFilterPatched) return true;
    if (typeof window.setFilter !== 'function') return false;

    var original = window.setFilter;
    window.setFilter = function () {
      var result = original.apply(this, arguments);
      scheduleCapture('setFilter');
      return result;
    };

    window.__veyraHistorySetFilterPatched = true;
    return true;
  }

  function patchSwitchTab() {
    if (window.__veyraHistorySwitchTabPatched) return true;
    if (typeof window.switchTab !== 'function') return false;

    var original = window.switchTab;
    window.switchTab = function (tab) {
      var result = original.apply(this, arguments);
      if (tab === 'meciuri') scheduleCapture('switchTab:meciuri');
      if (tab === 'istoric21') {
        scheduleCapture('switchTab:istoric');
        setTimeout(function () {
          scheduleSettlement();
          renderHistory();
        }, 80);
      }
      return result;
    };

    window.__veyraHistorySwitchTabPatched = true;
    return true;
  }

  function install() {
    clearOldHistoryOnce();

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var ok1 = patchRenderMatches();
      var ok2 = patchSetFilter();
      var ok3 = patchSwitchTab();
      if ((ok1 && ok2 && ok3) || tries > 40) clearInterval(timer);
    }, 250);

    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (/^(league-filter|match-date-filter|match-market-filter|match-verdict-filter|match-pro-mode|match-min-prob|match-min-edge|match-kickoff-filter|match-tier-filter|match-min-score)$/.test(t.id || '')) {
        scheduleCapture('filter-change:' + t.id);
      }
    }, true);

    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('.mx21-chip,[data-tab="meciuri"],[data-tab="istoric21"]') : null;
      if (!t) return;
      scheduleCapture('click');
      if (t.getAttribute('data-tab') === 'istoric21') setTimeout(renderHistory, 100);
    }, true);

    [700, 1500, 3000, 6000, 10000].forEach(function (delay) {
      setTimeout(function () { scheduleCapture('startup:' + delay); }, delay);
    });

    scheduleSettlement();
    renderHistory();

    window.VEYRA_VISIBLE_HISTORY = {
      capture: captureVisibleMeciuri,
      reset: resetVisibleHistory,
      render: renderHistory,
      store: readStore
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();
