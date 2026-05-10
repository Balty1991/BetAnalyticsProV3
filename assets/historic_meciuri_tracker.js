// ═══════════════════════════════════════════════════════════════════════
// VEYRA — Istoric Meciuri Tracker v3.0
// Scop: istoricul folosește DOAR meciurile vizibile/filtrate în tab-ul „Meciuri”.
// Nu mai adaugă predicții ascunse din recommendation_log / ML pool.
// recommendation_log este folosit doar pentru actualizarea statusului W/L.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__VEYRA_VISIBLE_HISTORY_V3__) return;
  window.__VEYRA_VISIBLE_HISTORY_V3__ = true;

  var STORAGE_KEY = 'veyra_visible_meciuri_history_v3';
  var OLD_KEYS = ['bat_meciuri_capture_v1', 'bat_meciuri_visible_capture_v2'];
  var LOG_URL = 'data/recommendation_log.json';

  var CATS = [
    { key:'all',   label:'Toate',     icon:'',   accent:'rgba(59,130,246,.85)' },
    { key:'safe',  label:'Top',       icon:'⭐', accent:'rgba(34,197,94,.9)' },
    { key:'o15',   label:'O1.5',      icon:'🔥', accent:'rgba(249,115,22,.9)' },
    { key:'o25',   label:'O2.5',      icon:'📊', accent:'rgba(234,179,8,.9)' },
    { key:'btts',  label:'BTTS',      icon:'🤝', accent:'rgba(168,85,247,.9)' },
    { key:'u35',   label:'U3.5',      icon:'🧊', accent:'rgba(6,182,212,.9)' },
    { key:'value', label:'Value',     icon:'💰', accent:'rgba(245,158,11,.9)' }
  ];

  var MARKET_LABELS = {
    over15:'Over 1.5G', over_15:'Over 1.5G', 'over 1.5g':'Over 1.5G', 'over 1.5':'Over 1.5G',
    over25:'Over 2.5G', over_25:'Over 2.5G', 'over 2.5g':'Over 2.5G', 'over 2.5':'Over 2.5G',
    under35:'Under 3.5G', under_35:'Under 3.5G', 'under 3.5g':'Under 3.5G', 'under 3.5':'Under 3.5G',
    btts:'BTTS', btts_yes:'BTTS', 'btts yes':'BTTS',
    homewin:'1', homeWin:'1', home_win:'1',
    awaywin:'2', awayWin:'2', away_win:'2',
    draw:'X'
  };

  var MONTHS_LONG = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  var MONTHS_SHORT = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var DAYS_SHORT = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];

  var _cache = null;
  var _cacheAt = 0;
  var _lastHtml = '';
  var _logCache = null;
  var _logFetchRunning = false;
  var _captureTimer = null;
  var _lastSource = 'localStorage';
  var _booted = false;

  var now0 = new Date();
  var STATE = {
    mode:'days7',
    selDay:0,
    weeksMonth:{ y:now0.getFullYear(), m:now0.getMonth() },
    selWeekIdx:-1,
    month:{ y:now0.getFullYear(), m:now0.getMonth() },
    year:now0.getFullYear(),
    view:'grid',
    cat:null
  };

  // ───────────────────────────────────────────────────────────────────
  // Utils
  // ───────────────────────────────────────────────────────────────────
  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  function esc(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function uniq(arr) {
    var out = [];
    (arr || []).forEach(function (x) {
      x = normalizeCatKey(x);
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    if (out.indexOf('all') < 0) out.unshift('all');
    return out;
  }

  function pad2(x) { return String(x).padStart(2, '0'); }

  function getGlobal(name) {
    try {
      if (Object.prototype.hasOwnProperty.call(window, name)) return window[name];
      if (window[name] !== undefined) return window[name];
    } catch(e) {}
    try {
      return Function('return (typeof ' + name + ' !== "undefined") ? ' + name + ' : undefined;')();
    } catch(e2) {
      return undefined;
    }
  }

  function getArrayGlobal(name) {
    var v = getGlobal(name);
    return Array.isArray(v) ? v : [];
  }

  function normalizeMarketKey(k) {
    var raw = str(k).trim();
    if (!raw) return '';
    var s = raw.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/-/g, '_')
      .replace(/[()]/g, '');

    var map = {
      'over_15':'over15', 'over 1.5':'over15', 'over 1.5g':'over15', 'o1.5':'over15', 'o15':'over15',
      'over_25':'over25', 'over 2.5':'over25', 'over 2.5g':'over25', 'o2.5':'over25', 'o25':'over25',
      'under_35':'under35', 'under 3.5':'under35', 'under 3.5g':'under35', 'u3.5':'under35', 'u35':'under35',
      'btts_yes':'btts', 'btts yes':'btts', 'both teams to score':'btts',
      'home_win':'homeWin', 'homewin':'homeWin', '1':'homeWin',
      'away_win':'awayWin', 'awaywin':'awayWin', '2':'awayWin',
      'x':'draw', 'draw':'draw'
    };
    return map[s] || raw;
  }

  function marketLabel(k, fallback) {
    var mk = normalizeMarketKey(k);
    return MARKET_LABELS[mk] || MARKET_LABELS[str(mk).toLowerCase()] || fallback || mk || '—';
  }

  function marketToCat(mk) {
    mk = normalizeMarketKey(mk);
    if (mk === 'over15') return 'o15';
    if (mk === 'over25') return 'o25';
    if (mk === 'btts') return 'btts';
    if (mk === 'under35') return 'u35';
    return '';
  }

  function normalizeCatKey(k) {
    var s = str(k).trim().toLowerCase();
    if (!s) return '';
    var map = {
      'all':'all', 'toate':'all',
      'top':'safe', 'safe':'safe', 'star':'safe', '⭐ top':'safe',
      'value':'value', 'valoare':'value',
      'o15':'o15', 'over15':'o15', 'over_15':'o15', 'over 1.5':'o15', 'over 1.5g':'o15', '🔥 o1.5':'o15',
      'o25':'o25', 'over25':'o25', 'over_25':'o25', 'over 2.5':'o25', 'over 2.5g':'o25',
      'btts':'btts', 'btts_yes':'btts',
      'u35':'u35', 'under35':'u35', 'under_35':'u35', 'under 3.5':'u35', 'under 3.5g':'u35'
    };
    return map[s] || '';
  }

  function currentFilterKey() {
    var f = getGlobal('CURRENT_FILTER');
    var nk = normalizeCatKey(f);
    if (nk) return nk;

    var selectors = [
      '#matches-filters .active',
      '.match-filter.active',
      '.filter-btn.active',
      '.market-filter.active',
      '[data-filter].active',
      '[data-market].active'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      nk = normalizeCatKey(el.getAttribute('data-filter') || el.getAttribute('data-market') || el.textContent);
      if (nk) return nk;
    }
    return 'all';
  }

  function firstNonEmpty() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  function deepGet(obj, path) {
    try {
      var cur = obj;
      for (var i = 0; i < path.length; i++) {
        if (!cur) return undefined;
        cur = cur[path[i]];
      }
      return cur;
    } catch(e) {
      return undefined;
    }
  }

  function rowEventId(m) {
    return firstNonEmpty(
      m.event_id, m.eventId, m.id, m.fixture_id, m.fixtureId, m.match_id, m.matchId,
      deepGet(m, ['event','id']),
      deepGet(m, ['fixture','id']),
      deepGet(m, ['raw','event_id'])
    );
  }

  function rowHome(m) {
    return firstNonEmpty(
      m.home, m.homeTeam, m.home_team, m.team_home,
      deepGet(m, ['event','home']),
      deepGet(m, ['event','home_team']),
      deepGet(m, ['teams','home','name']),
      deepGet(m, ['raw','home'])
    );
  }

  function rowAway(m) {
    return firstNonEmpty(
      m.away, m.awayTeam, m.away_team, m.team_away,
      deepGet(m, ['event','away']),
      deepGet(m, ['event','away_team']),
      deepGet(m, ['teams','away','name']),
      deepGet(m, ['raw','away'])
    );
  }

  function rowLeague(m) {
    return firstNonEmpty(
      m.league, m.leagueName, m.league_name,
      deepGet(m, ['leagueObj','name']),
      deepGet(m, ['event','league','name']),
      deepGet(m, ['fixture','league','name']),
      deepGet(m, ['raw','league'])
    );
  }

  function rowDate(m) {
    return firstNonEmpty(
      m.event_date, m.eventDate, m.date, m.kickoff, m.startTime, m.start_time,
      deepGet(m, ['event','event_date']),
      deepGet(m, ['event','date']),
      deepGet(m, ['fixture','date']),
      deepGet(m, ['raw','event_date']),
      m.logged_at,
      m.first_logged_at
    );
  }

  function candidateScore(c) {
    return (
      num(c.score) * 10 +
      num(c.value) * 100 +
      num(c.edge_pct || c.edgePct) +
      num(c.adjusted_prob || c.prob || c.probability) / 100
    );
  }

  function bestPickOf(m) {
    if (!m) return null;

    // Dacă rândul este deja o recomandare/pick.
    if (m.market_key || m.market || m.odds || m.adjusted_prob || m.edge_pct || m.model_prob) {
      return m;
    }

    // Funcția oficială din app.js, dacă există.
    var bestPickFor = getGlobal('bestPickFor');
    if (typeof bestPickFor === 'function') {
      try {
        var b0 = bestPickFor(m);
        if (b0) return b0;
      } catch(e) {}
    }

    var direct = m.bestPick || m.bestBet || m.recommendation || m.pick || m.topPick;
    if (direct) return direct;

    var arr = [];
    ['candidates','eligibleTypes','picks','bets','markets','recommendations'].forEach(function (k) {
      if (Array.isArray(m[k])) arr = arr.concat(m[k]);
    });
    if (!arr.length) return null;

    arr = arr.filter(function (x) { return x && (x.market_key || x.market || x.type || x.key || x.odds); });
    if (!arr.length) return null;
    arr.sort(function (a, b) { return candidateScore(b) - candidateScore(a); });
    return arr[0];
  }

  function collectMarketCatsFromRow(m, best) {
    var cats = [];
    var existing = m.eligible_categories || m.eligibleCategories || m.categories || (best && (best.eligible_categories || best.eligibleCategories));
    if (Array.isArray(existing)) cats = cats.concat(existing);

    var mk = normalizeMarketKey(firstNonEmpty(best && (best.market_key || best.marketKey || best.type || best.key), m.market_key, m.marketKey, m.type));
    var c = marketToCat(mk);
    if (c) cats.push(c);

    var arrays = [];
    ['candidates','eligibleTypes','picks','bets','markets','recommendations'].forEach(function (k) {
      if (Array.isArray(m[k])) arrays = arrays.concat(m[k]);
    });
    arrays.forEach(function (x) {
      if (!x) return;
      var xmk = normalizeMarketKey(firstNonEmpty(x.market_key, x.marketKey, x.market, x.type, x.key));
      var xc = marketToCat(xmk);
      if (xc) cats.push(xc);
    });

    var risk = str(firstNonEmpty(m.riskTier, m.risk_tier, best && (best.riskTier || best.risk_tier))).toLowerCase();
    var verdict = str(firstNonEmpty(m.verdict, best && best.verdict)).toLowerCase();
    if (risk === 'safe' || verdict === 'safe') cats.push('safe');
    if (risk === 'value' || verdict === 'value' || num(best && (best.value)) > 0.04 || num(best && (best.edge_pct || best.edgePct)) >= 6) cats.push('value');

    var cf = currentFilterKey();
    if (cf && cf !== 'all') cats.push(cf);

    return uniq(cats);
  }

  function normalizeEntry(row, visibleSource) {
    if (!row) return null;
    var best = bestPickOf(row) || {};
    var eventId = rowEventId(row);
    var home = rowHome(row);
    var away = rowAway(row);
    var date = rowDate(row);
    var mk = normalizeMarketKey(firstNonEmpty(best.market_key, best.marketKey, best.type, best.key, row.market_key, row.marketKey, row.type, best.market));
    if (!mk) {
      var cat = currentFilterKey();
      if (cat === 'o15') mk = 'over15';
      else if (cat === 'o25') mk = 'over25';
      else if (cat === 'u35') mk = 'under35';
      else if (cat === 'btts') mk = 'btts';
    }

    // Avem nevoie de minim echipe + dată sau event_id; altfel nu putem monitoriza.
    if (!eventId && (!home || !away || !date)) return null;

    var cats = collectMarketCatsFromRow(row, best);
    var key = String(firstNonEmpty(eventId, home + '|' + away + '|' + date)) + '::' + String(mk || 'pick');

    var prob = num(firstNonEmpty(best.adjusted_prob, best.model_prob, best.prob, best.probability, row.adjusted_prob, row.model_prob));
    if (prob > 0 && prob <= 1) prob = prob * 100;

    var entry = {
      key: key,
      event_id: eventId || null,
      prediction_id: firstNonEmpty(row.prediction_id, best.prediction_id) || null,
      home: home || '?',
      away: away || '?',
      league: rowLeague(row) || '',
      event_date: date || '',
      market_key: mk || '',
      market: marketLabel(mk, firstNonEmpty(best.label, best.market, row.market)),
      odds: num(firstNonEmpty(best.odds, row.odds)),
      adjusted_prob: prob,
      edge_pct: num(firstNonEmpty(best.edge_pct, best.edgePct, row.edge_pct, row.edgePct)),
      value: num(firstNonEmpty(best.value, row.value)),
      score: num(firstNonEmpty(best.score, row.score, row.smartScore)),
      verdict: firstNonEmpty(row.verdict, best.verdict),
      risk_tier: firstNonEmpty(row.riskTier, row.risk_tier, best.riskTier, best.risk_tier),
      eligible_categories: cats,
      visible_filter: currentFilterKey(),
      visible_source: visibleSource,
      status: normalizeStatus(firstNonEmpty(row.status, best.status)) || 'pending',
      won: row.won != null ? row.won : (best.won != null ? best.won : null),
      home_score: firstNonEmpty(row.home_score, best.home_score) || null,
      away_score: firstNonEmpty(row.away_score, best.away_score) || null,
      captured_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return entry;
  }

  function normalizeStatus(s) {
    s = str(s).toLowerCase();
    if (s === 'win' || s === 'won' || s === 'w' || s === 'true') return 'win';
    if (s === 'lose' || s === 'loss' || s === 'lost' || s === 'l' || s === 'false') return 'lose';
    if (s === 'void' || s === 'push') return 'void';
    if (s === 'pending' || s === 'open') return 'pending';
    return '';
  }

  function getVisibleRowsNow() {
    var rows = getArrayGlobal('MATCHES_FILTERED_CACHE');
    if (rows.length) return { rows: rows, source: 'MATCHES_FILTERED_CACHE' };

    // Unele build-uri pot expune alt nume.
    var aliases = ['FILTERED_MATCHES', 'CURRENT_MATCHES', 'VISIBLE_MATCHES', 'MATCHES_VISIBLE_CACHE'];
    for (var i = 0; i < aliases.length; i++) {
      rows = getArrayGlobal(aliases[i]);
      if (rows.length) return { rows: rows, source: aliases[i] };
    }

    // Fallback strict: doar dacă DOM-ul de Meciuri există și avem un cache auxiliar salvat anterior în sesiune.
    // Nu folosim ALL_MATCHES automat ca să nu bage predicții invizibile.
    return { rows: [], source: 'none' };
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version:3, source:'visible-meciuri', entries:[], updated_at:null };
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.entries)) return { version:3, source:'visible-meciuri', entries:[], updated_at:null };
      return obj;
    } catch(e) {
      return { version:3, source:'visible-meciuri', entries:[], updated_at:null };
    }
  }

  function writeStore(obj) {
    try {
      obj.version = 3;
      obj.source = 'visible-meciuri';
      obj.updated_at = new Date().toISOString();
      obj.total = (obj.entries || []).length;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
      _cache = null; _cacheAt = 0;
      return true;
    } catch(e) {
      console.warn('[VEYRA History] Nu pot salva localStorage:', e);
      return false;
    }
  }

  function migrateOldStores() {
    var cur = readStore();
    if (cur.entries && cur.entries.length) return;
    var migrated = [];
    OLD_KEYS.forEach(function (k) {
      try {
        var raw = localStorage.getItem(k);
        if (!raw) return;
        var obj = JSON.parse(raw);
        var entries = Array.isArray(obj) ? obj : (obj && obj.entries);
        if (Array.isArray(entries)) migrated = migrated.concat(entries);
      } catch(e) {}
    });
    if (migrated.length) {
      var seen = {};
      var clean = migrated.map(function (x) {
        x.key = x.key || (String(firstNonEmpty(x.event_id, x.home + '|' + x.away + '|' + x.event_date)) + '::' + String(x.market_key || 'pick'));
        x.eligible_categories = uniq(x.eligible_categories || x.categories || ['all']);
        return x;
      }).filter(function (x) {
        if (!x.key || seen[x.key]) return false;
        seen[x.key] = true;
        return true;
      });
      writeStore({ entries: clean });
    }
  }

  function captureVisibleMatches(reason) {
    var src = getVisibleRowsNow();
    if (!src.rows.length) return 0;

    var existing = readStore();
    var map = {};
    (existing.entries || []).forEach(function (e) {
      if (!e || !e.key) return;
      map[e.key] = e;
    });

    var added = 0, updated = 0;
    src.rows.forEach(function (row) {
      var e = normalizeEntry(row, src.source);
      if (!e) return;

      var old = map[e.key];
      if (old) {
        // Păstrăm statusul final, dar actualizăm categoriile/sursa/cotele dacă meciul e încă pending.
        var finalStatus = old.status === 'win' || old.status === 'lose' || old.status === 'void';
        e.eligible_categories = uniq([].concat(old.eligible_categories || [], e.eligible_categories || []));
        if (finalStatus) {
          e.status = old.status;
          e.won = old.won;
          e.home_score = old.home_score;
          e.away_score = old.away_score;
          e.settled_at = old.settled_at;
        }
        e.captured_at = old.captured_at || e.captured_at;
        map[e.key] = Object.assign({}, old, e, { updated_at:new Date().toISOString() });
        updated++;
      } else {
        map[e.key] = e;
        added++;
      }
    });

    var entries = Object.keys(map).map(function (k) { return map[k]; });
    entries.sort(function (a, b) { return entryTime(a) - entryTime(b); });
    writeStore({ entries: entries, last_capture_reason: reason || 'manual', last_capture_source: src.source });
    _lastSource = src.source;

    if (added || updated) {
      console.log('[VEYRA History] capture', {reason:reason, source:src.source, rows:src.rows.length, added:added, updated:updated, total:entries.length});
    }
    return added + updated;
  }

  function scheduleCapture(reason, delay) {
    clearTimeout(_captureTimer);
    _captureTimer = setTimeout(function () {
      var n = captureVisibleMatches(reason);
      if (n) {
        syncStatusFromRecommendationLog();
        refreshRender();
      }
    }, delay == null ? 350 : delay);
  }

  // ───────────────────────────────────────────────────────────────────
  // W/L sync — doar actualizează ce a fost deja capturat vizibil.
  // ───────────────────────────────────────────────────────────────────
  function getRecommendationLog(cb) {
    var globalLog = getArrayGlobal('RECOMMENDATION_LOG');
    if (globalLog.length) {
      _logCache = globalLog;
      cb(globalLog);
      return;
    }
    if (_logCache) { cb(_logCache); return; }
    if (_logFetchRunning) { setTimeout(function(){ getRecommendationLog(cb); }, 600); return; }

    _logFetchRunning = true;
    fetch(LOG_URL + '?t=' + Date.now(), { cache:'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        _logCache = Array.isArray(data) ? data : [];
        _logFetchRunning = false;
        cb(_logCache);
      })
      .catch(function () {
        _logFetchRunning = false;
        cb([]);
      });
  }

  function computeWon(marketKey, homeScore, awayScore) {
    var hs = Number(homeScore), as = Number(awayScore);
    if (!isFinite(hs) || !isFinite(as)) return null;
    var total = hs + as;
    var mk = normalizeMarketKey(marketKey);
    if (mk === 'over15') return total > 1.5;
    if (mk === 'over25') return total > 2.5;
    if (mk === 'under35') return total < 3.5;
    if (mk === 'btts') return hs > 0 && as > 0;
    if (mk === 'homeWin') return hs > as;
    if (mk === 'awayWin') return as > hs;
    if (mk === 'draw') return hs === as;
    return null;
  }

  function syncStatusFromRecommendationLog(done) {
    getRecommendationLog(function (log) {
      if (!Array.isArray(log) || !log.length) { if (done) done(0); return; }

      var byEventMarket = {};
      var byEvent = {};
      log.forEach(function (r) {
        if (!r) return;
        var eid = firstNonEmpty(r.event_id, r.eventId);
        if (!eid) return;
        var mk = normalizeMarketKey(firstNonEmpty(r.market_key, r.marketKey, r.type, r.market));
        if (mk) byEventMarket[eid + '::' + mk] = r;
        byEvent[eid] = r;
      });

      var store = readStore();
      var changed = 0;
      (store.entries || []).forEach(function (e) {
        if (!e || !e.event_id) return;
        if (e.status === 'win' || e.status === 'lose' || e.status === 'void') return;

        var lr = byEventMarket[e.event_id + '::' + normalizeMarketKey(e.market_key)] || byEvent[e.event_id];
        if (!lr) return;

        var hs = firstNonEmpty(lr.home_score, lr.homeScore, lr.score_home);
        var as = firstNonEmpty(lr.away_score, lr.awayScore, lr.score_away);
        var st = normalizeStatus(lr.status);
        var won = null;

        if ((st === 'win' || st === 'lose') && hs !== '' && as !== '') {
          won = computeWon(e.market_key, hs, as);
          if (won === null) won = st === 'win';
        } else if (hs !== '' && as !== '') {
          won = computeWon(e.market_key, hs, as);
        }

        if (won !== null) {
          e.status = won ? 'win' : 'lose';
          e.won = !!won;
          e.home_score = Number(hs);
          e.away_score = Number(as);
          e.settled_at = firstNonEmpty(lr.settled_at, lr.updated_at, new Date().toISOString());
          e.updated_at = new Date().toISOString();
          changed++;
        }
      });

      if (changed) writeStore(store);
      if (done) done(changed);
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // Period filters
  // ───────────────────────────────────────────────────────────────────
  function entryTime(e) {
    var d = new Date(firstNonEmpty(e.event_date, e.logged_at, e.captured_at, e.first_logged_at));
    var t = d.getTime();
    return isFinite(t) ? t : 0;
  }

  function dayBounds(idx) {
    var d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - idx);
    var e = new Date(d);
    e.setHours(23,59,59,999);
    return { s:d.getTime(), e:e.getTime(), date:d };
  }

  function weekMonday(d) {
    var x = new Date(d);
    x.setHours(0,0,0,0);
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
      var end = new Date(cur);
      end.setDate(cur.getDate() + 6);
      end.setHours(23,59,59,999);
      weeks.push({ startDate:new Date(cur), endDate:new Date(end), s:cur.getTime(), e:end.getTime() });
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }

  function activeWeekBounds() {
    var weeks = getWeeksForMonth(STATE.weeksMonth.y, STATE.weeksMonth.m);
    var idx = STATE.selWeekIdx;
    if (idx < 0 || idx >= weeks.length) {
      var now = Date.now();
      idx = weeks.findIndex(function (w) { return now >= w.s && now <= w.e; });
      if (idx < 0) idx = Math.max(0, weeks.length - 1);
      STATE.selWeekIdx = idx;
    }
    return weeks[idx] || { s:0, e:0, startDate:new Date(), endDate:new Date() };
  }

  function isCurrentWeek(w) {
    var n = Date.now();
    return w && n >= w.s && n <= w.e;
  }

  function inPeriod(e) {
    var t = entryTime(e);
    if (!t) return false;
    if (STATE.mode === 'days7') {
      var d = dayBounds(STATE.selDay);
      return t >= d.s && t <= d.e;
    }
    if (STATE.mode === 'weeks') {
      var w = activeWeekBounds();
      return t >= w.s && t <= w.e;
    }
    if (STATE.mode === 'month') {
      var dt = new Date(t);
      return dt.getFullYear() === STATE.month.y && dt.getMonth() === STATE.month.m;
    }
    if (STATE.mode === 'year') {
      return new Date(t).getFullYear() === STATE.year;
    }
    return true;
  }

  function periodLabel() {
    if (STATE.mode === 'days7') {
      var db = dayBounds(STATE.selDay), d = db.date;
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
    }
    if (STATE.mode === 'weeks') {
      var wb = activeWeekBounds();
      return pad2(wb.startDate.getDate()) + '/' + pad2(wb.startDate.getMonth()+1) + ' – ' + pad2(wb.endDate.getDate()) + '/' + pad2(wb.endDate.getMonth()+1);
    }
    if (STATE.mode === 'month') return MONTHS_LONG[STATE.month.m] + ' ' + STATE.month.y;
    if (STATE.mode === 'year') return 'Anul ' + STATE.year;
    return '';
  }

  function getMonthOpts() {
    var now = new Date(), out = [];
    for (var i=0; i<24; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ y:d.getFullYear(), m:d.getMonth() });
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────────
  // Stats / rows
  // ───────────────────────────────────────────────────────────────────
  function loadEntries() {
    // Fix important: când deschizi Istoric după Meciuri, încercăm captura imediat.
    captureVisibleMatches('history-render');
    if (_cache && Date.now() - _cacheAt < 2500) return _cache;
    var store = readStore();
    _cache = (store.entries || []).filter(Boolean);
    _cacheAt = Date.now();
    return _cache;
  }

  function rowsForCat(catKey, entries) {
    return (entries || []).filter(function (e) {
      if (!inPeriod(e)) return false;
      var cats = Array.isArray(e.eligible_categories) ? e.eligible_categories.map(normalizeCatKey) : ['all'];
      return catKey === 'all' || cats.indexOf(catKey) >= 0;
    });
  }

  function calcStats(rows) {
    var settled = rows.filter(function (r) { return r.status === 'win' || r.status === 'lose'; });
    var pending = rows.filter(function (r) { return !r.status || r.status === 'pending'; });
    var wins = settled.filter(function (r) { return r.status === 'win'; }).length;
    var profit = settled.reduce(function (acc, r) {
      var o = num(r.odds);
      return acc + (r.status === 'win' ? Math.max(0, o - 1) : -1);
    }, 0);
    var avgEdge = settled.length ? settled.reduce(function(a,r){ return a + num(r.edge_pct); }, 0) / settled.length : 0;
    var breakEven = settled.length ? settled.reduce(function(a,r){ var o=num(r.odds); return a + (o>1 ? 100/o : 50); }, 0) / settled.length : 0;
    var winrate = settled.length ? wins * 100 / settled.length : 0;
    return {
      total: rows.length,
      pending: pending.length,
      settled: settled.length,
      wins: wins,
      losses: settled.length - wins,
      roi: settled.length ? profit * 100 / settled.length : 0,
      winrate: winrate,
      avgEdge: avgEdge,
      profit: profit,
      breakEven: breakEven,
      delta: settled.length ? winrate - breakEven : 0
    };
  }

  function signedPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
  function roiColor(v, has) { return !has ? 'var(--muted)' : (v >= 0 ? 'var(--grn)' : 'var(--red)'); }
  function wrColor(v, has) { return !has ? 'var(--muted)' : (v >= 65 ? 'var(--grn)' : (v >= 50 ? 'var(--yel)' : 'var(--red)')); }
  function getCat(k) { return CATS.filter(function(c){ return c.key === k; })[0] || CATS[0]; }

  // ───────────────────────────────────────────────────────────────────
  // CSS + Render
  // ───────────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('veyra-visible-history-v3-css')) return;
    var css = [
      '.bh-wrap{padding:2px 0 12px}',
      '.bh-mbar{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.bh-mbtn{padding:10px 15px;border-radius:16px;font-size:13px;font-weight:800;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}',
      '.bh-mbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.55);color:var(--acc)}',
      '.bh-days{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 12px}',
      '.bh-daybtn{display:flex;flex-direction:column;align-items:center;gap:1px;padding:9px 10px;border-radius:17px;min-width:48px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-daybtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.55);color:var(--acc)}',
      '.bh-dlbl{font-size:10px;font-weight:800;opacity:.78}.bh-dnum{font-size:25px;font-weight:950;line-height:1}.bh-dmo{font-size:11px;font-weight:700;opacity:.72}',
      '.bh-wm-row{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}.bh-wm-lbl{font-size:12px;color:var(--muted);font-weight:700}',
      '.bh-sel{padding:9px 13px;border-radius:14px;font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:var(--txt);max-width:220px}',
      '.bh-weeks{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}',
      '.bh-wkbtn{padding:10px 12px;border-radius:16px;font-size:13px;font-weight:800;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:var(--muted);cursor:pointer}',
      '.bh-wkbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.55);color:var(--acc)}.bh-wkbtn.current{border-color:rgba(245,158,11,.38);color:var(--yel)}',
      '.bh-note{font-size:12px;color:var(--muted);line-height:1.5;padding:12px 14px;border-radius:15px;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.13);margin:12px 0}',
      '.bh-sum{padding:16px;border-radius:22px;margin-bottom:14px;background:linear-gradient(135deg,rgba(43,229,197,.08),rgba(59,130,246,.04));border:1px solid rgba(43,229,197,.28);box-shadow:0 12px 30px rgba(0,0,0,.14)}',
      '.bh-stitle{font-size:18px;font-weight:950;color:var(--txt);margin-bottom:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bh-stitle b{color:var(--acc)}',
      '.bh-ptag{font-size:11px;padding:3px 8px;border-radius:999px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.32);color:var(--yel);font-weight:800}',
      '.bh-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.bh-kcard{padding:13px 8px;border-radius:18px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);text-align:center}',
      '.bh-kval{font-size:20px;font-weight:950;line-height:1;margin-bottom:6px}.bh-klbl{font-size:10px;color:var(--muted);font-family:var(--mono);letter-spacing:.09em;text-transform:uppercase}',
      '.bh-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}',
      '.bh-card{padding:15px 12px 12px;border-radius:20px;cursor:pointer;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent;min-height:118px}',
      '.bh-card:active{opacity:.84}.bh-card-name{font-size:18px;font-weight:950;color:var(--txt);margin-bottom:8px;white-space:nowrap}.bh-card-arr{position:absolute;top:12px;right:12px;font-size:22px;opacity:.28;color:var(--txt)}',
      '.bh-card-roi{font-size:24px;font-weight:950;line-height:1.05;margin-bottom:7px}.bh-card-meta{font-size:12px;color:var(--muted);line-height:1.55}.bh-card-meta strong{color:var(--txt)}',
      '.bh-card-bar{height:4px;border-radius:8px;margin-top:10px;opacity:.52}',
      '.bh-ddh{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:12px;border-radius:18px;background:rgba(255,255,255,.028);border:1px solid rgba(255,255,255,.08)}',
      '.bh-back{padding:8px 12px;border-radius:12px;font-size:13px;font-weight:800;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:var(--txt);cursor:pointer}.bh-ddtitle{font-size:16px;font-weight:950;color:var(--txt)}.bh-ddper{font-size:11px;color:var(--muted);font-family:var(--mono)}',
      '.bh-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.bh-pill{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}',
      '.bh-dayg{margin-bottom:15px}.bh-daylbl{font-size:11px;font-family:var(--mono);color:var(--muted);letter-spacing:.07em;text-transform:uppercase;padding:7px 0 6px;border-bottom:1px solid rgba(255,255,255,.055);margin-bottom:8px}',
      '.bh-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.045)}.bh-row:last-child{border-bottom:none}',
      '.bh-badge{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:950;margin-top:1px}.bh-bw{background:rgba(34,197,94,.18);color:var(--grn);border:1px solid rgba(34,197,94,.28)}.bh-bl{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.24)}.bh-bp{background:rgba(245,158,11,.13);color:var(--yel);border:1px solid rgba(245,158,11,.30)}',
      '.bh-main{flex:1;min-width:0}.bh-teams{font-size:13px;font-weight:850;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bh-meta{font-size:11px;color:var(--muted);margin-top:3px;line-height:1.45}.bh-odds{font-size:12px;font-weight:850;color:var(--txt);flex-shrink:0;margin-top:2px}.bh-sc{color:var(--acc);font-size:11px;font-family:var(--mono);font-weight:850}',
      '.bh-empty{text-align:center;padding:34px 16px;color:var(--muted);font-size:13px;line-height:1.6}.bh-empty b{color:var(--txt)}',
      '@media(max-width:430px){.bh-kpi{grid-template-columns:repeat(2,1fr)}.bh-grid{grid-template-columns:1fr 1fr;gap:10px}.bh-card{min-height:126px;padding:14px 10px}.bh-card-name{font-size:17px}.bh-card-roi{font-size:22px}.bh-mbtn{padding:10px 14px}.bh-daybtn{min-width:44px}.bh-kval{font-size:19px}}',
      '@media(max-width:350px){.bh-grid{grid-template-columns:1fr}.bh-kpi{grid-template-columns:1fr 1fr}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'veyra-visible-history-v3-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function renderPeriodBar() {
    function mb(mode, lbl) {
      return '<button class="bh-mbtn ' + (STATE.mode === mode ? 'on' : '') + '" onclick="batH.mode(\'' + mode + '\')">' + lbl + '</button>';
    }
    var h = '<div class="bh-mbar">' + mb('days7','7 Zile') + mb('weeks','Săptămâni') + mb('month','Luna') + mb('year','Anual') + '</div>';

    if (STATE.mode === 'days7') {
      h += '<div class="bh-days">';
      for (var i=0; i<7; i++) {
        var db = dayBounds(i), d = db.date;
        var top = i === 0 ? 'Azi' : (i === 1 ? 'Ieri' : DAYS_SHORT[d.getDay()]);
        h += '<button class="bh-daybtn ' + (STATE.selDay === i ? 'on' : '') + '" onclick="batH.day(' + i + ')">' +
          '<span class="bh-dlbl">' + esc(top) + '</span><span class="bh-dnum">' + d.getDate() + '</span><span class="bh-dmo">' + MONTHS_SHORT[d.getMonth()] + '</span></button>';
      }
      h += '</div>';
    }

    if (STATE.mode === 'weeks') {
      var mo = getMonthOpts().map(function(o) {
        var sel = (o.y === STATE.weeksMonth.y && o.m === STATE.weeksMonth.m) ? ' selected' : '';
        return '<option value="' + o.y + '-' + o.m + '"' + sel + '>' + MONTHS_LONG[o.m] + ' ' + o.y + '</option>';
      }).join('');
      h += '<div class="bh-wm-row"><span class="bh-wm-lbl">Luna:</span><select class="bh-sel" onchange="batH.setWeeksMonth(this.value)">' + mo + '</select></div>';
      var weeks = getWeeksForMonth(STATE.weeksMonth.y, STATE.weeksMonth.m);
      var active = STATE.selWeekIdx >= 0 ? STATE.selWeekIdx : weeks.findIndex(isCurrentWeek);
      if (active < 0) active = Math.max(0, weeks.length - 1);
      h += '<div class="bh-weeks">';
      weeks.forEach(function(w, idx) {
        h += '<button class="bh-wkbtn ' + (idx === active ? 'on ' : '') + (isCurrentWeek(w) ? 'current' : '') + '" onclick="batH.week(' + idx + ')">' +
          pad2(w.startDate.getDate()) + '/' + pad2(w.startDate.getMonth()+1) + ' – ' + pad2(w.endDate.getDate()) + '/' + pad2(w.endDate.getMonth()+1) + (isCurrentWeek(w) ? ' ⏳' : '') + '</button>';
      });
      h += '</div>';
    }

    if (STATE.mode === 'month') {
      var mo2 = getMonthOpts().map(function(o) {
        var sel = (o.y === STATE.month.y && o.m === STATE.month.m) ? ' selected' : '';
        return '<option value="' + o.y + '-' + o.m + '"' + sel + '>' + MONTHS_LONG[o.m] + ' ' + o.y + '</option>';
      }).join('');
      h += '<div class="bh-wm-row"><select class="bh-sel" onchange="batH.setMonth(this.value)">' + mo2 + '</select></div>';
    }

    if (STATE.mode === 'year') {
      var yopts = '', y = new Date().getFullYear();
      for (var yi=0; yi<5; yi++) {
        var yr = y - yi;
        yopts += '<option value="' + yr + '"' + (STATE.year === yr ? ' selected' : '') + '>' + yr + '</option>';
      }
      h += '<div class="bh-wm-row"><select class="bh-sel" onchange="batH.setYear(this.value)">' + yopts + '</select></div>';
    }

    return h;
  }

  function kpi(val, color, label) {
    return '<div class="bh-kcard"><div class="bh-kval" style="color:' + color + '">' + val + '</div><div class="bh-klbl">' + label + '</div></div>';
  }

  function renderSummary(entries) {
    var rows = rowsForCat('all', entries);
    var s = calcStats(rows);
    var has = s.settled > 0;
    var wk = STATE.mode === 'weeks' && isCurrentWeek(activeWeekBounds());
    return '<div class="bh-sum">' +
      '<div class="bh-stitle">Toate · <b>' + esc(periodLabel()) + '</b> ' +
      (wk ? '<span class="bh-ptag">⏳ Săpt. în curs</span>' : '') +
      (s.pending ? '<span class="bh-ptag">⏳ ' + s.pending + ' pending</span>' : '') +
      '</div>' +
      '<div class="bh-kpi">' +
      kpi(has ? signedPct(s.roi) : '—', roiColor(s.roi, has), 'ROI') +
      kpi(has ? s.winrate.toFixed(0) + '%' : '—', wrColor(s.winrate, has), 'Win Rate') +
      kpi(has ? (s.wins + '/' + s.settled) : '0/0', 'var(--txt)', 'W / Jucate') +
      kpi(String(s.pending), s.pending ? 'var(--yel)' : 'var(--muted)', 'Pending') +
      '</div></div>';
  }

  function renderGrid(entries) {
    return '<div class="bh-grid">' + CATS.filter(function(c){ return c.key !== 'all'; }).map(function(cat) {
      var rows = rowsForCat(cat.key, entries);
      var s = calcStats(rows);
      var has = s.settled > 0;
      var rCol = roiColor(s.roi, has);
      var barW = has ? Math.max(10, Math.min(100, Math.abs(s.winrate))).toFixed(0) : (s.pending ? 32 : 14);
      var bCol = has ? (s.roi >= 0 ? 'rgba(34,197,94,.34)' : 'rgba(239,68,68,.26)') : (s.pending ? 'rgba(245,158,11,.35)' : 'rgba(148,163,184,.18)');
      return '<div class="bh-card" onclick="batH.drill(\'' + cat.key + '\')">' +
        '<div class="bh-card-arr">›</div>' +
        '<div class="bh-card-name">' + cat.icon + ' ' + esc(cat.label) + '</div>' +
        '<div class="bh-card-roi" style="color:' + rCol + '">' + (has ? signedPct(s.roi) : (s.pending ? s.pending + ' ⏳' : '—')) + '</div>' +
        '<div class="bh-card-meta">' +
          'Total: <strong>' + s.total + '</strong><br>' +
          'WR: ' + (has ? s.winrate.toFixed(0) + '%' : '—') + ' · W/J: ' + (has ? s.wins + '/' + s.settled : '0/0') + '<br>' +
          'Edge: ' + (has ? (s.avgEdge >= 0 ? '+' : '') + s.avgEdge.toFixed(1) + '%' : '—') +
        '</div>' +
        '<div class="bh-card-bar" style="width:' + barW + '%;background:' + bCol + '"></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderDrilldown(entries) {
    var cat = getCat(STATE.cat);
    var rows = rowsForCat(cat.key, entries).slice().sort(function(a,b) {
      if ((a.status || 'pending') === 'pending' && (b.status || 'pending') !== 'pending') return -1;
      if ((a.status || 'pending') !== 'pending' && (b.status || 'pending') === 'pending') return 1;
      return entryTime(a) - entryTime(b);
    });
    var s = calcStats(rows), has = s.settled > 0;

    var h = '<div class="bh-ddh"><button class="bh-back" onclick="batH.back()">← Înapoi</button><div><div class="bh-ddtitle">' +
      cat.icon + ' ' + esc(cat.label) + '</div><div class="bh-ddper">' + esc(periodLabel()) + '</div></div></div>';

    h += '<div class="bh-pills">' +
      pill('Total: ' + s.total, 'var(--txt)') +
      pill('Pending: ' + s.pending, s.pending ? 'var(--yel)' : 'var(--muted)') +
      pill('ROI: ' + (has ? signedPct(s.roi) : '—'), roiColor(s.roi, has)) +
      pill('WR: ' + (has ? s.winrate.toFixed(0) + '%' : '—'), wrColor(s.winrate, has)) +
      pill('W/J: ' + (has ? s.wins + '/' + s.settled : '0/0'), 'var(--txt)') +
      '</div>';

    if (!rows.length) {
      return h + '<div class="bh-empty">Nu există meciuri capturate pentru <b>' + esc(cat.label) + '</b> în perioada selectată.<br>Intră în <b>Meciuri</b>, lasă lista să se încarce, apoi revino aici.</div>';
    }

    var groups = {};
    var order = [];
    rows.forEach(function(r) {
      var d = new Date(entryTime(r));
      var k = d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
      if (!groups[k]) { groups[k] = { date:d, rows:[] }; order.push(k); }
      groups[k].rows.push(r);
    });

    order.forEach(function(k) {
      var g = groups[k], d = g.date;
      h += '<div class="bh-dayg"><div class="bh-daylbl">' + DAYS_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + '</div>';
      h += g.rows.map(renderRow).join('');
      h += '</div>';
    });

    return h;
  }

  function pill(txt, color) {
    return '<span class="bh-pill" style="color:' + color + '">' + esc(txt) + '</span>';
  }

  function renderRow(r) {
    var st = normalizeStatus(r.status) || 'pending';
    var bcls = st === 'win' ? 'bh-bw' : (st === 'lose' ? 'bh-bl' : 'bh-bp');
    var btxt = st === 'win' ? 'W' : (st === 'lose' ? 'L' : '⏳');
    var sc = (r.home_score !== null && r.home_score !== undefined && r.away_score !== null && r.away_score !== undefined) ? ' <span class="bh-sc">[' + esc(r.home_score) + '-' + esc(r.away_score) + ']</span>' : '';
    var kick = '';
    if (st === 'pending' && r.event_date) {
      try {
        var kd = new Date(r.event_date);
        if (isFinite(kd.getTime())) kick = ' · ' + kd.toLocaleTimeString('ro-RO', {hour:'2-digit', minute:'2-digit'});
      } catch(e) {}
    }
    var prob = num(r.adjusted_prob);
    var edge = num(r.edge_pct);
    var meta = [
      marketLabel(r.market_key, r.market),
      r.league || '—'
    ];
    if (prob > 0) meta.push(prob.toFixed(0) + '% prob');
    if (edge > 0) meta.push('edge +' + edge.toFixed(1) + '%');

    return '<div class="bh-row">' +
      '<div class="bh-badge ' + bcls + '">' + btxt + '</div>' +
      '<div class="bh-main">' +
        '<div class="bh-teams">' + esc(r.home || '?') + ' vs ' + esc(r.away || '?') + sc + '</div>' +
        '<div class="bh-meta">' + esc(meta.join(' · ')) + esc(kick) + '</div>' +
      '</div>' +
      '<div class="bh-odds">@' + (num(r.odds) > 1 ? num(r.odds).toFixed(2) : '—') + '</div>' +
      '</div>';
  }

  function render() {
    var root = document.getElementById('history21-root');
    if (!root) return;
    injectCss();

    var entries = loadEntries();
    var store = readStore();
    var src = store.last_capture_source || _lastSource || 'Meciuri';
    var sourceText = entries.length
      ? ('📌 Sursa: captură din Meciuri (' + esc(src) + ') — doar ce a fost afișat după filtrare.')
      : ('📌 Sursa: captură din Meciuri — momentan nu există date. Intră în tab-ul Meciuri ca să se salveze lista vizibilă.');

    var body = '<div class="bh-wrap">' + renderPeriodBar() +
      '<div class="bh-note">' + sourceText + '</div>';

    if (STATE.view === 'drilldown' && STATE.cat) {
      body += renderDrilldown(entries);
    } else {
      body += renderSummary(entries) + renderGrid(entries);
      if (!entries.length) {
        body += '<div class="bh-empty">Nu am încă nicio captură vizibilă.<br><b>Pași:</b> Meciuri → așteaptă lista → Istoric. Nu se mai folosesc predicții ML ascunse.</div>';
      }
    }
    body += '</div>';

    if (body !== _lastHtml) {
      root.innerHTML = body;
      _lastHtml = body;
    }
  }

  function refreshRender() {
    _lastHtml = '';
    _cache = null;
    _cacheAt = 0;
    render();
  }

  // ───────────────────────────────────────────────────────────────────
  // Hooks
  // ───────────────────────────────────────────────────────────────────
  function wrapSwitchTab() {
    var fn = getGlobal('switchTab');
    if (typeof fn !== 'function' || fn.__veyraVisibleHistoryWrapped) return false;

    var wrapped = function(name) {
      var ret = fn.apply(this, arguments);
      if (name === 'meciuri' || name === 'matches') {
        scheduleCapture('switchTab:meciuri:fast', 250);
        scheduleCapture('switchTab:meciuri:late', 1200);
        scheduleCapture('switchTab:meciuri:final', 2600);
      }
      if (name === 'istoric21' || name === 'istoric' || name === 'history') {
        scheduleCapture('switchTab:istoric21', 50);
        setTimeout(function(){ syncStatusFromRecommendationLog(refreshRender); }, 350);
        setTimeout(refreshRender, 120);
        setTimeout(refreshRender, 900);
      }
      return ret;
    };
    wrapped.__veyraVisibleHistoryWrapped = true;
    window.switchTab = wrapped;
    return true;
  }

  function wrapRenderMatches() {
    var fn = getGlobal('renderMatches');
    if (typeof fn !== 'function' || fn.__veyraVisibleHistoryWrapped) return false;

    var wrapped = function() {
      var ret = fn.apply(this, arguments);
      scheduleCapture('renderMatches', 250);
      scheduleCapture('renderMatches-late', 1100);
      return ret;
    };
    wrapped.__veyraVisibleHistoryWrapped = true;
    window.renderMatches = wrapped;
    return true;
  }

  function observeMatchesContainer() {
    var box = document.getElementById('matches-container');
    if (!box || box.__veyraVisibleHistoryObserved) return;
    box.__veyraVisibleHistoryObserved = true;
    try {
      new MutationObserver(function() {
        scheduleCapture('matches-container-mutated', 450);
      }).observe(box, { childList:true, subtree:false });
    } catch(e) {}
  }

  function boot() {
    if (_booted) return;
    _booted = true;
    migrateOldStores();
    injectCss();

    wrapSwitchTab();
    wrapRenderMatches();
    observeMatchesContainer();

    // În caz că funcțiile apar după acest script.
    var tries = 0;
    var hookInt = setInterval(function() {
      wrapSwitchTab();
      wrapRenderMatches();
      observeMatchesContainer();
      if (++tries > 20) clearInterval(hookInt);
    }, 500);

    // Captură inițială dacă Meciuri a fost deja randat.
    [800, 1800, 3500, 6500].forEach(function(t) {
      setTimeout(function() { scheduleCapture('boot-' + t, 0); }, t);
    });

    // Actualizare status periodică.
    setTimeout(function(){ syncStatusFromRecommendationLog(refreshRender); }, 2500);
    setInterval(function(){ syncStatusFromRecommendationLog(refreshRender); }, 180000);

    // Dacă intră direct în Istoric.
    render();
  }

  // API public pentru test/debug în consolă.
  window.batH = {
    mode: function(m) {
      STATE.mode = m;
      STATE.view = 'grid';
      STATE.cat = null;
      if (m === 'days7') STATE.selDay = 0;
      if (m === 'weeks') STATE.selWeekIdx = -1;
      if (m === 'month') { var n = new Date(); STATE.month = { y:n.getFullYear(), m:n.getMonth() }; }
      if (m === 'year') STATE.year = new Date().getFullYear();
      refreshRender();
    },
    day: function(i) { STATE.selDay = Number(i) || 0; refreshRender(); },
    week: function(i) { STATE.selWeekIdx = Number(i) || 0; refreshRender(); },
    setWeeksMonth: function(v) { var p = String(v).split('-'); STATE.weeksMonth = { y:Number(p[0]), m:Number(p[1]) }; STATE.selWeekIdx = -1; refreshRender(); },
    setMonth: function(v) { var p = String(v).split('-'); STATE.month = { y:Number(p[0]), m:Number(p[1]) }; refreshRender(); },
    setYear: function(v) { STATE.year = Number(v); refreshRender(); },
    drill: function(k) { STATE.cat = k; STATE.view = 'drilldown'; refreshRender(); var r=document.getElementById('history21-root'); if(r&&r.scrollIntoView) r.scrollIntoView({behavior:'smooth', block:'start'}); },
    back: function() { STATE.view = 'grid'; STATE.cat = null; refreshRender(); },
    refresh: function() { scheduleCapture('manual-refresh', 0); syncStatusFromRecommendationLog(refreshRender); refreshRender(); },
    capture: function() { var n = captureVisibleMatches('manual'); syncStatusFromRecommendationLog(refreshRender); refreshRender(); return n; },
    clearCapture: function() { try { localStorage.removeItem(STORAGE_KEY); _cache=null; _cacheAt=0; refreshRender(); return true; } catch(e) { return false; } },
    debug: function() {
      var visible = getVisibleRowsNow();
      var store = readStore();
      return {
        version: 3,
        storageKey: STORAGE_KEY,
        currentFilter: currentFilterKey(),
        visibleSource: visible.source,
        visibleRows: visible.rows.length,
        savedEntries: (store.entries || []).length,
        lastCaptureSource: store.last_capture_source,
        firstSaved: (store.entries || [])[0] || null,
        globals: {
          MATCHES_FILTERED_CACHE: getArrayGlobal('MATCHES_FILTERED_CACHE').length,
          ALL_MATCHES: getArrayGlobal('ALL_MATCHES').length,
          RECOMMENDATION_LOG: getArrayGlobal('RECOMMENDATION_LOG').length
        }
      };
    }
  };

  // Compatibilitate cu app.js.
  window.renderHistory21 = function() {
    scheduleCapture('renderHistory21', 0);
    setTimeout(render, 80);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();