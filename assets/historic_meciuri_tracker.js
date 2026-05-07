// ═══════════════════════════════════════════════════════════════════════
// Historic Meciuri Tracker  —  BetAnalytics Pro V21+ (Client-Side Capture)
//
// Două componente:
//   1. CAPTURE — la fiecare vizualizare a tab-ului Meciuri:
//      • Citește window.ALL_MATCHES (sursa reală pe care Meciuri o afișează)
//      • Filtrează ELIGIBLE (analysisState === 'ELIGIBLE')
//      • Calculează eligible_categories cu EXACT logica din Meciuri
//      • Salvează în localStorage (cheia 'bat_meciuri_capture_v1')
//      • Sincronizează status (win/lose) din recommendation_log pe baza scorurilor
//
//   2. RENDER — la deschiderea tab-ului Istoric:
//      • PRIMARY: localStorage capture (ce a apărut efectiv în Meciuri)
//      • FALLBACK: data/meciuri_snapshot.json (când localStorage e gol)
//
// Categorii sincronizate exact cu Meciuri:
//   all(Toate) / safe(Top) / o15(O1.5) / o25(O2.5) / btts / u35 / value
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__batHistoricTrackerV7) return;
  window.__batHistoricTrackerV7 = true;

  // ── STORAGE ──────────────────────────────────────────────────────────
  var STORAGE_KEY = 'bat_meciuri_capture_v1';
  var SNAP_URL    = 'data/meciuri_snapshot.json';
  var LOG_URL     = 'data/recommendation_log.json';

  // ── CATEGORII — identice cu filtrele din tab-ul Meciuri ─────────────
  var CATS = [
    { key:'all',   label:'Toate',                  accent:'rgba(59,130,246,.85)'  },
    { key:'safe',  label:'\u2B50 Top',             accent:'rgba(34,197,94,.9)'    },
    { key:'o15',   label:'\uD83D\uDD25 O1.5',      accent:'rgba(249,115,22,.9)'   },
    { key:'o25',   label:'\uD83D\uDCCA O2.5',      accent:'rgba(234,179,8,.9)'    },
    { key:'btts',  label:'\uD83E\uDD1D BTTS',      accent:'rgba(168,85,247,.9)'   },
    { key:'u35',   label:'\uD83E\uDDCA U3.5',      accent:'rgba(6,182,212,.9)'    },
    { key:'value', label:'\uD83D\uDCB0 Value',     accent:'rgba(245,158,11,.9)'   }
  ];

  var MKT_NICE = {
    over15:'O1.5G', over25:'O2.5G', under35:'U3.5G', under25:'U2.5G',
    btts:'BTTS', homeWin:'1', awayWin:'2', draw:'X',
    'over_15':'O1.5G', 'over_25':'O2.5G', 'under_35':'U3.5G', 'under_25':'U2.5G',
    'btts_yes':'BTTS', 'home_win':'1', 'away_win':'2', 'btts_no':'BTTS NO',
    'Over 1.5G':'O1.5G', 'Over 2.5G':'O2.5G',
    'Under 3.5G':'U3.5G', 'Under 2.5G':'U2.5G'
  };

  function nv(v){ return Number(v)||0; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }

  // ═════════════════════════════════════════════════════════════════════
  // PARTEA 1 — CAPTURE din tab-ul Meciuri
  // ═════════════════════════════════════════════════════════════════════

  function _bestPickOf(m){
    if (!m) return null;
    if (typeof window.bestPickFor === 'function') {
      try { return window.bestPickFor(m); } catch(e) {}
    }
    return m.bestPick || m.bestBet || null;
  }

  function _hasEligibleType(m, type){
    if (typeof window.hasEligibleType === 'function') {
      try { return !!window.hasEligibleType(m, type); } catch(e) {}
    }
    var cands = m && (m.candidates || m.eligibleTypes || []);
    if (!Array.isArray(cands)) return false;
    return cands.some(function(c){
      if (!c) return false;
      var t = c.type || c.market || c.market_key || '';
      return t === type;
    });
  }

  function _normalizeMarketKey(mk){
    if (!mk) return '';
    var s = String(mk).toLowerCase();
    var map = {
      'over_15':'over15', 'over_25':'over25', 'over_35':'over35',
      'under_15':'under15', 'under_25':'under25', 'under_35':'under35',
      'btts_yes':'btts', 'btts_no':'btts_no',
      'home_win':'homeWin', 'away_win':'awayWin'
    };
    return map[s] || s;
  }

  // Calculează eligible_categories cu EXACT logica din Meciuri (app.js)
  function _computeCats(m){
    if (!m || m.analysisState !== 'ELIGIBLE') return [];
    var cats = ['all'];

    // Top (safe)
    if (m.verdict === 'safe' || m.riskTier === 'Safe') cats.push('safe');

    // Value
    var b = _bestPickOf(m);
    if (m.riskTier === 'Value' || (b && nv(b.value) >= 0.08 && nv(b.edgePct || b.edge_pct) >= 3)) {
      cats.push('value');
    }

    // Markets
    if (_hasEligibleType(m, 'over15'))  cats.push('o15');
    if (_hasEligibleType(m, 'over25'))  cats.push('o25');
    if (_hasEligibleType(m, 'btts'))    cats.push('btts');
    if (_hasEligibleType(m, 'under35')) cats.push('u35');

    // O2.5 din SIGNAL_AUDIT (cum face și Meciuri)
    var sa = window.SIGNAL_AUDIT;
    if (sa && cats.indexOf('o25') < 0) {
      var rows = sa.entries || sa.rows || [];
      if (Array.isArray(rows)) {
        var found = rows.some(function(r){
          if (!r) return false;
          var rmk = String(r.market_key || '').toLowerCase();
          return Number(r.event_id) === Number(m.event_id) &&
                 (rmk === 'over25' || rmk === 'over_25');
        });
        if (found) cats.push('o25');
      }
    }

    return cats;
  }

  function _matchToEntry(m){
    var b = _bestPickOf(m) || {};
    var mkRaw = b.type || b.market || b.market_key || '';
    var mk = _normalizeMarketKey(mkRaw);
    var prob = b.prob || b.probability || b.adjusted_prob || 0;
    if (prob > 0 && prob < 2) prob = prob * 100; // dacă e fraction, convertim

    return {
      event_id: m.event_id || (m.event && m.event.id),
      home: m.home || (m.event && m.event.home_team) || '?',
      away: m.away || (m.event && m.event.away_team) || '?',
      league: m.league || (m.leagueObj && m.leagueObj.name) ||
              (m.event && m.event.league && m.event.league.name) || '',
      event_date: m.eventDate || m.event_date ||
                  (m.event && m.event.event_date) || '',
      market_key: mk,
      market: b.label || b.market || mkRaw,
      odds: nv(b.odds),
      adjusted_prob: nv(prob),
      edge_pct: nv(b.edgePct || b.edge_pct),
      value: nv(b.value),
      score: nv(m.score || m.smartScore || b.score),
      verdict: m.verdict || '',
      risk_tier: m.riskTier || '',
      eligible_categories: _computeCats(m),
      status: 'pending',
      captured_at: new Date().toISOString()
    };
  }

  function _readCapture(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { version:1, entries:[] };
      var obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.entries)) return { version:1, entries:[] };
      return obj;
    } catch(e) { return { version:1, entries:[] }; }
  }

  function _writeCapture(capture){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capture));
      return true;
    } catch(e) {
      console.warn('[HistoricTracker] Storage error:', e);
      return false;
    }
  }

  function captureFromMeciuri(){
    var ALL = window.ALL_MATCHES;
    if (!Array.isArray(ALL) || ALL.length === 0) return 0;

    var fresh = {};
    ALL.forEach(function(m){
      var cats = _computeCats(m);
      if (cats.length === 0) return; // nu e ELIGIBLE
      var entry = _matchToEntry(m);
      if (!entry.event_id || !entry.market_key) return;
      var key = entry.event_id + '::' + entry.market_key;
      fresh[key] = entry;
    });

    if (Object.keys(fresh).length === 0) return 0;

    // Merge cu existent (păstrează status terminat)
    var existing = _readCapture();
    var existingMap = {};
    (existing.entries || []).forEach(function(e){
      existingMap[e.event_id + '::' + e.market_key] = e;
    });

    Object.keys(fresh).forEach(function(key){
      var prev = existingMap[key];
      if (prev && (prev.status === 'win' || prev.status === 'lose')) {
        fresh[key].status = prev.status;
        fresh[key].home_score = prev.home_score;
        fresh[key].away_score = prev.away_score;
        fresh[key].settled_at = prev.settled_at;
        fresh[key].won = prev.won;
      }
      existingMap[key] = fresh[key];
    });

    var allEntries = [];
    Object.keys(existingMap).forEach(function(k){ allEntries.push(existingMap[k]); });

    var capture = {
      version: 1,
      captured_at: new Date().toISOString(),
      total: allEntries.length,
      entries: allEntries
    };
    _writeCapture(capture);
    invalidateLocalCache();
    console.log('[HistoricTracker] Capturat ' + Object.keys(fresh).length + ' meciuri din Meciuri (total: ' + allEntries.length + ')');
    return Object.keys(fresh).length;
  }

  // ── Sincronizare status din recommendation_log (folosind scorurile) ──
  function _computeWonFromScores(market_key, hs, asy){
    if (hs == null || asy == null) return null;
    hs = Number(hs); asy = Number(asy);
    if (!isFinite(hs) || !isFinite(asy)) return null;
    var tot = hs + asy;
    var mk = String(market_key||'').toLowerCase();
    var table = {
      'over15':  tot > 1, 'over_15':  tot > 1,
      'over25':  tot > 2, 'over_25':  tot > 2,
      'over35':  tot > 3, 'over_35':  tot > 3,
      'under15': tot < 2, 'under_15': tot < 2,
      'under25': tot < 3, 'under_25': tot < 3,
      'under35': tot < 4, 'under_35': tot < 4,
      'btts':    hs > 0 && asy > 0, 'btts_yes': hs > 0 && asy > 0,
      'btts_no': !(hs > 0 && asy > 0),
      'homewin': hs > asy, 'home_win': hs > asy,
      'awaywin': asy > hs, 'away_win': asy > hs,
      'draw':    hs === asy
    };
    if (mk in table) return table[mk];
    return null;
  }

  function syncStatusFromLog(){
    fetch(LOG_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(log){
        if (!Array.isArray(log)) return;
        var capture = _readCapture();
        var entries = capture.entries || [];
        if (entries.length === 0) return;

        // Indexare log pe event_id (pentru a obține scoruri finale)
        var logByEvent = {};
        log.forEach(function(r){
          var eid = r.event_id;
          if (!eid) return;
          var st = String(r.status||'').toLowerCase();
          if ((st === 'win' || st === 'lose' || st === 'loss')
              && r.home_score != null && r.away_score != null) {
            logByEvent[eid] = r;
          }
        });

        var changed = 0;
        entries.forEach(function(e){
          if (e.status === 'win' || e.status === 'lose') return;
          var lr = logByEvent[e.event_id];
          if (!lr) return;
          var won = _computeWonFromScores(e.market_key, lr.home_score, lr.away_score);
          if (won === null) return;
          e.status = won ? 'win' : 'lose';
          e.home_score = lr.home_score;
          e.away_score = lr.away_score;
          e.settled_at = lr.settled_at || new Date().toISOString();
          e.won = won;
          changed++;
        });

        if (changed > 0) {
          capture.entries = entries;
          capture.captured_at = new Date().toISOString();
          _writeCapture(capture);
          invalidateLocalCache();
          console.log('[HistoricTracker] Status sincronizat: ' + changed + ' meciuri terminate');
        }
      })
      .catch(function(){});
  }

  // ═════════════════════════════════════════════════════════════════════
  // PARTEA 2 — RENDER tab-ul Istoric
  // ═════════════════════════════════════════════════════════════════════

  var _localCache = null;
  var _localCacheTs = 0;
  var LOCAL_TTL = 5000;
  var _isUsingCapture = false;

  function invalidateLocalCache(){ _localCacheTs = 0; _localCache = null; }

  function loadEntries(cb){
    var now = Date.now();
    if (_localCache && (now - _localCacheTs) < LOCAL_TTL) {
      cb(_localCache);
      return;
    }

    var capture = _readCapture();
    var localEntries = capture.entries || [];

    // PRIMARY: localStorage (capturat din Meciuri)
    if (localEntries.length > 0) {
      _isUsingCapture = true;
      _localCache = localEntries;
      _localCacheTs = now;
      cb(localEntries);
      return;
    }

    // FALLBACK: snapshot.json (când localStorage e gol)
    _isUsingCapture = false;
    fetch(SNAP_URL + '?t=' + now, { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(data){
        var entries = (data && Array.isArray(data.entries)) ? data.entries : [];
        _localCache = entries;
        _localCacheTs = Date.now();
        cb(entries);
      })
      .catch(function(){
        _localCache = [];
        _localCacheTs = Date.now();
        cb([]);
      });
  }

  // ── State pentru UI ─────────────────────────────────────────────────
  var ML = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
            'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  var MS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var DR = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];

  var _ini = new Date();
  var S = {
    mode:'days7', selDay:0,
    weeksMonth:{y:_ini.getFullYear(),m:_ini.getMonth()}, selWeekIdx:-1,
    month:{y:_ini.getFullYear(),m:_ini.getMonth()},
    year:_ini.getFullYear(), view:'grid', cat:null
  };

  function pct(v){ var x=nv(v);return(x>=0?'+':'')+x.toFixed(1)+'%'; }
  function rcol(v,ok){ return ok?(nv(v)>0?'var(--grn)':(nv(v)<0?'var(--red)':'var(--muted)')):'var(--muted)'; }
  function wcol(v){ return nv(v)>=65?'var(--grn)':(nv(v)>=50?'var(--yel)':'var(--red)'); }
  function getCat(k){ return CATS.find(function(c){return c.key===k;})||CATS[0]; }
  function pad2(x){ return String(x).padStart(2,'0'); }
  function fmtDM(d){ return pad2(d.getDate())+'/'+pad2(d.getMonth()+1); }

  function weekMonday(d){
    var x=new Date(d);x.setHours(0,0,0,0);
    var dow=x.getDay();x.setDate(x.getDate()-(dow===0?6:dow-1));return x;
  }
  function getWeeksForMonth(y,m){
    var first=new Date(y,m,1),last=new Date(y,m+1,0);
    var cur=weekMonday(first),weeks=[];
    while(cur<=last){
      var wEnd=new Date(cur);wEnd.setDate(cur.getDate()+6);wEnd.setHours(23,59,59,999);
      weeks.push({startDate:new Date(cur),endDate:new Date(wEnd),s:cur.getTime(),e:wEnd.getTime()});
      cur=new Date(cur);cur.setDate(cur.getDate()+7);
    }
    return weeks;
  }
  function currentWeekIdx(weeks){
    var now=Date.now();
    for(var i=0;i<weeks.length;i++) if(now>=weeks[i].s&&now<=weeks[i].e) return i;
    return weeks.length-1;
  }
  function isCurrentWeek(w){ return Date.now()>=w.s&&Date.now()<=w.e; }

  function dayBounds(idx){
    var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-idx);
    var e=new Date(d);e.setHours(23,59,59,999);
    return{s:d.getTime(),e:e.getTime(),date:new Date(d)};
  }
  function activeWeekBounds(){
    var weeks=getWeeksForMonth(S.weeksMonth.y,S.weeksMonth.m);
    var idx=S.selWeekIdx>=0&&S.selWeekIdx<weeks.length?S.selWeekIdx:currentWeekIdx(weeks);
    return weeks[idx]||weeks[weeks.length-1];
  }
  function bounds(){
    if(S.mode==='days7') return dayBounds(S.selDay);
    if(S.mode==='weeks') return activeWeekBounds();
    if(S.mode==='month') return{s:new Date(S.month.y,S.month.m,1,0,0,0,0).getTime(),e:new Date(S.month.y,S.month.m+1,0,23,59,59,999).getTime()};
    if(S.mode==='year')  return{s:new Date(S.year,0,1,0,0,0,0).getTime(),e:new Date(S.year,11,31,23,59,59,999).getTime()};
    return dayBounds(0);
  }
  function entryTs(r){
    var raw=r.event_date||r.logged_at||null;
    if(!raw)return 0;var t=new Date(raw).getTime();return isFinite(t)?t:0;
  }
  function inPeriod(r){var t=entryTs(r);if(!t)return false;var b=bounds();return t>=b.s&&t<=b.e;}

  function periodLabel(){
    if(S.mode==='days7'){var db=dayBounds(S.selDay),d=db.date;return d.getDate()+' '+MS[d.getMonth()]+' '+d.getFullYear();}
    if(S.mode==='weeks'){var wb=activeWeekBounds();return fmtDM(wb.startDate)+' \u2013 '+fmtDM(wb.endDate);}
    if(S.mode==='month')return ML[S.month.m]+' '+S.month.y;
    if(S.mode==='year') return 'Anul '+S.year;
    return '';
  }

  function getRowsForCat(catKey, entries) {
    return (entries||[]).filter(function(r){
      if(!inPeriod(r))return false;
      var cats=r.eligible_categories;
      if(!Array.isArray(cats)||cats.length===0)return false;
      return catKey==='all'||(cats.indexOf(catKey)>=0);
    }).map(function(r){
      return{
        _st:r.status||'pending',
        event_id:r.event_id, home:r.home, away:r.away, league:r.league,
        event_date:r.event_date, logged_at:r.logged_at,
        market_key:r.market_key, market:r.market,
        odds:nv(r.odds), adjusted_prob:nv(r.adjusted_prob),
        edge_pct:nv(r.edge_pct), value:nv(r.value), score:nv(r.score),
        verdict:r.verdict||'', home_score:r.home_score, away_score:r.away_score,
        eligible_categories:r.eligible_categories
      };
    });
  }

  function calcStats(rows){
    var s=rows.filter(function(r){return r._st==='win'||r._st==='lose';});
    var p=rows.filter(function(r){return r._st==='pending';});
    var w=s.filter(function(r){return r._st==='win';}).length;
    var profit=s.reduce(function(acc,r){var o=nv(r.odds);return acc+(r._st==='win'?(o>1?o-1:0):-1);},0);
    var eSum=s.reduce(function(acc,r){return acc+nv(r.edge_pct);},0);
    var BE=s.length?s.reduce(function(a,r){return a+(nv(r.odds)>1?100/nv(r.odds):50);},0)/s.length:0;
    return{
      total:rows.length, settled:s.length, wins:w, losses:s.length-w, pending:p.length,
      winrate:s.length?w*100/s.length:0,
      roi:s.length?profit*100/s.length:0,
      avgEdge:s.length?eSum/s.length:0,
      profit:profit, breakEven:BE,
      delta:s.length?(w*100/s.length)-BE:0
    };
  }

  function injectCss(){
    if(document.getElementById('bat-hist-v7-css'))return;
    var css=[
      '.bh-wrap{padding:2px 0 12px}',
      '.bh-mbar{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}',
      '.bh-mbtn{padding:7px 13px;border-radius:12px;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035);color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-mbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      '.bh-days{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}',
      '.bh-daybtn{display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 8px;border-radius:12px;min-width:38px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-dlbl{font-size:9px;font-weight:700;opacity:.7}',
      '.bh-dnum{font-size:17px;font-weight:900;line-height:1}',
      '.bh-dmo{font-size:9px;opacity:.65}',
      '.bh-daybtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      '.bh-daybtn.on .bh-dnum{color:var(--acc)}',
      '.bh-wm-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.bh-wm-lbl{font-size:11px;color:var(--muted);font-weight:600}',
      '.bh-sel{padding:7px 12px;border-radius:10px;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);color:var(--txt);cursor:pointer;max-width:200px}',
      '.bh-weeks{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
      '.bh-wkbtn{padding:6px 10px;border-radius:11px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;gap:5px}',
      '.bh-wkbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      '.bh-wkbtn.current{border-color:rgba(245,158,11,.35);color:var(--yel)}',
      '.bh-wkbtn.current.on{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.5)}',
      '.bh-wk-pend{font-size:9px;opacity:.7}',
      '.bh-sub{margin-bottom:10px}',
      '.bh-sum{padding:14px;border-radius:18px;margin-bottom:12px;background:linear-gradient(135deg,rgba(43,229,197,.07),rgba(59,130,246,.05));border:1px solid rgba(43,229,197,.2);box-shadow:0 8px 24px rgba(0,0,0,.12)}',
      '.bh-stitle{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.bh-ptag{font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:var(--yel);font-weight:700}',
      '.bh-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.bh-kcard{padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);text-align:center}',
      '.bh-kval{font-size:20px;font-weight:900;line-height:1;margin-bottom:3px}',
      '.bh-klbl{font-size:9px;color:var(--muted);font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}',
      '.bh-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}',
      '.bh-card{padding:13px 11px 10px;border-radius:15px;cursor:pointer;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent}',
      '.bh-card:active{opacity:.82}',
      '.bh-card-name{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:5px}',
      '.bh-card-roi{font-size:22px;font-weight:900;line-height:1;margin-bottom:5px}',
      '.bh-card-meta{font-size:10px;color:var(--muted);line-height:1.55}',
      '.bh-card-arr{position:absolute;top:11px;right:11px;font-size:16px;opacity:.35;color:var(--txt)}',
      '.bh-card-bar{height:3px;border-radius:2px;margin-top:9px;opacity:.45}',
      '.bh-ddh{display:flex;align-items:center;gap:10px;margin-bottom:11px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08)}',
      '.bh-back{padding:7px 11px;border-radius:10px;font-size:12px;font-weight:700;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-ddtitle{font-size:14px;font-weight:900;color:var(--txt)}',
      '.bh-ddper{font-size:10px;color:var(--muted);font-family:var(--mono)}',
      '.bh-pills{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}',
      '.bh-pill{padding:5px 9px;border-radius:9px;font-size:11px;font-weight:700;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)}',
      '.bh-dayg{margin-bottom:14px}',
      '.bh-daylbl{font-size:9px;font-family:var(--mono);color:var(--muted);letter-spacing:.06em;text-transform:uppercase;padding:5px 0 5px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:7px}',
      '.bh-row{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}',
      '.bh-row:last-child{border-bottom:none}',
      '.bh-badge{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;margin-top:1px}',
      '.bh-bw{background:rgba(34,197,94,.18);color:var(--grn);border:1px solid rgba(34,197,94,.28)}',
      '.bh-bl{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.22)}',
      '.bh-bp{background:rgba(245,158,11,.12);color:var(--yel);border:1px solid rgba(245,158,11,.28)}',
      '.bh-main{flex:1;min-width:0}',
      '.bh-teams{font-size:12px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bh-meta{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}',
      '.bh-odds{font-size:11px;font-weight:700;color:var(--txt);flex-shrink:0;margin-top:2px}',
      '.bh-sc{color:var(--acc);font-size:10px;font-family:var(--mono);font-weight:700}',
      '.bh-pend-row{border-left:2px solid rgba(245,158,11,.45);padding-left:7px;opacity:.85}',
      '.bh-empty{text-align:center;padding:36px 16px}',
      '.bh-eico{font-size:34px;margin-bottom:8px}',
      '.bh-etxt{font-size:12px;color:var(--muted);line-height:1.6}',
      '.bh-note{font-size:10px;color:var(--muted);line-height:1.5;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);margin-bottom:10px}',
      '.bh-loading{text-align:center;padding:32px 16px;color:var(--muted);font-size:12px}',
      '@media(max-width:360px){.bh-grid{grid-template-columns:1fr}.bh-kval{font-size:17px}.bh-days{gap:4px}.bh-daybtn{min-width:34px;padding:6px 6px}}'
    ].join('');
    var el=document.createElement('style');el.id='bat-hist-v7-css';el.textContent=css;
    document.head.appendChild(el);
  }

  function renderPeriodBar(){
    var h='<div class="bh-mbar">'+
      mb('days7','7 Zile')+mb('weeks','Saptamani')+mb('month','Luna')+mb('year','Anual')+
    '</div>';
    if(S.mode==='days7'){
      h+='<div class="bh-days">';
      for(var di=0;di<7;di++){
        var db=dayBounds(di),d=db.date;
        var top=di===0?'Azi':(di===1?'Ieri':DR[d.getDay()]);
        h+='<button class="bh-daybtn'+(S.selDay===di?' on':'')+'" onclick="window.batH.day('+di+')">'+
             '<span class="bh-dlbl">'+top+'</span><span class="bh-dnum">'+d.getDate()+'</span>'+
             '<span class="bh-dmo">'+MS[d.getMonth()]+'</span></button>';
      }
      h+='</div>';
    }
    if(S.mode==='weeks'){
      var mopts=getMonthOpts().map(function(o){
        var sel=(S.weeksMonth.y===o.y&&S.weeksMonth.m===o.m)?' selected':'';
        return'<option value="'+o.y+'-'+o.m+'"'+sel+'>'+ML[o.m]+' '+o.y+'</option>';
      }).join('');
      h+='<div class="bh-wm-row"><span class="bh-wm-lbl">Luna:</span>'+
           '<select class="bh-sel" onchange="window.batH.setWeeksMonth(this.value)">'+mopts+'</select></div>';
      var weeks=getWeeksForMonth(S.weeksMonth.y,S.weeksMonth.m);
      var activeIdx=S.selWeekIdx>=0&&S.selWeekIdx<weeks.length?S.selWeekIdx:currentWeekIdx(weeks);
      h+='<div class="bh-weeks">';
      weeks.forEach(function(w,i){
        var isNow=isCurrentWeek(w);
        h+='<button class="bh-wkbtn'+(i===activeIdx?' on':'')+(isNow?' current':'')+'" onclick="window.batH.week('+i+')">'+
             fmtDM(w.startDate)+' \u2013 '+fmtDM(w.endDate)+(isNow?'<span class="bh-wk-pend">\u23F3</span>':'')+
           '</button>';
      });
      h+='</div>';
    }
    if(S.mode==='month'){
      var mo2=getMonthOpts().map(function(o){
        var sel=(S.month.y===o.y&&S.month.m===o.m)?' selected':'';
        return'<option value="'+o.y+'-'+o.m+'"'+sel+'>'+ML[o.m]+' '+o.y+'</option>';
      }).join('');
      h+='<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setMonth(this.value)">'+mo2+'</select></div>';
    }
    if(S.mode==='year'){
      var now=new Date(),yopts='';
      for(var yi=0;yi<4;yi++){var yr=now.getFullYear()-yi;yopts+='<option value="'+yr+'"'+(S.year===yr?' selected':'')+'>'+yr+'</option>';}
      h+='<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setYear(this.value)">'+yopts+'</select></div>';
    }
    return h;
    function mb(mode,lbl){return'<button class="bh-mbtn'+(S.mode===mode?' on':'')+'" onclick="window.batH.mode(\''+mode+'\')">'+lbl+'</button>';}
  }

  function getMonthOpts(){
    var now=new Date(),opts=[];
    for(var i=0;i<24;i++){var d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push({y:d.getFullYear(),m:d.getMonth()});}
    return opts;
  }

  function renderSummary(entries){
    var rows=getRowsForCat('all',entries);
    var s=calcStats(rows); var nd=s.settled===0;
    var isCurWk=S.mode==='weeks'&&isCurrentWeek(activeWeekBounds());
    return'<div class="bh-sum">'+
      '<div class="bh-stitle">Toate \u00B7 <span style="color:var(--acc)">'+esc(periodLabel())+'</span>'+
        (isCurWk?'<span class="bh-ptag">\u23F3 Sapt. in curs</span>':'')+
        (s.pending>0?'<span class="bh-ptag">+'+s.pending+' a\u015Fteapt\u0103</span>':'')+
      '</div><div class="bh-kpi">'+
        kc(nd?'\u2014':pct(s.roi),rcol(s.roi,!nd),'ROI')+
        kc(nd?'\u2014':s.winrate.toFixed(0)+'%',nd?'var(--muted)':wcol(s.winrate),'Win Rate')+
        kc(nd?'\u2014':s.wins+'/'+s.settled,'var(--txt)','W / Jucate')+
      '</div></div>';
  }
  function kc(val,col,lbl){return'<div class="bh-kcard"><div class="bh-kval" style="color:'+col+'">'+val+'</div><div class="bh-klbl">'+lbl+'</div></div>';}

  function renderGrid(entries){
    // Toate categoriile vizibile mereu, identic cu filtrele din Meciuri
    var cards=CATS.filter(function(c){return c.key!=='all';}).map(function(cat){
      var rows=getRowsForCat(cat.key,entries);
      var s=calcStats(rows); var nd=s.settled===0;
      var rCol=rcol(s.roi,!nd);
      var bCol=nd?'rgba(255,255,255,.06)':(s.roi>=0?'rgba(34,197,94,.22)':'rgba(239,68,68,.18)');
      var barW=nd?'15':Math.min(100,Math.max(10,Math.abs(s.winrate))).toFixed(0);
      return'<div class="bh-card" onclick="window.batH.drill(\''+cat.key+'\')" style="border-color:'+bCol+'">'+
        '<div class="bh-card-arr">\u203A</div>'+
        '<div class="bh-card-name">'+esc(cat.label)+'</div>'+
        '<div class="bh-card-roi" style="color:'+rCol+'">'+(nd?'\u2014':pct(s.roi))+'</div>'+
        '<div class="bh-card-meta">WR: <b style="color:'+(nd?'var(--muted)':wcol(s.winrate))+'">'+(nd?'\u2014':s.winrate.toFixed(0)+'%')+'</b>'+
          ' \u00B7 '+(nd?'\u2014':s.wins+'/'+s.settled+' W')+
          (s.pending>0?' <span style="color:var(--yel);opacity:.85">+'+s.pending+'\u23F3</span>':'')+
          '<br>Edge: <b style="color:'+(nd?'var(--muted)':'var(--cyan)')+'">'+
          (nd?'\u2014':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%')+'</b>'+
          (s.settled>0?' \u00B7 \u0394<b style="color:'+(s.delta>=0?'var(--grn)':'var(--red)')+'">'+
          (s.delta>=0?'+':'')+s.delta.toFixed(1)+'pp</b>':'')+
        '</div><div class="bh-card-bar" style="background:'+cat.accent+';width:'+barW+'%"></div>'+
      '</div>';
    });
    return'<div class="bh-grid">'+cards.join('')+'</div>';
  }

  function renderDrilldown(entries){
    var cat=getCat(S.cat);
    var rows=getRowsForCat(S.cat,entries);
    rows.sort(function(a,b){
      if(a._st==='pending'&&b._st!=='pending')return 1;
      if(a._st!=='pending'&&b._st==='pending')return-1;
      return entryTs(b)-entryTs(a);
    });
    var s=calcStats(rows); var nd=s.settled===0;
    var hdr='<div class="bh-ddh"><button class="bh-back" onclick="window.batH.back()">\u2190 \xCEnapoi</button>'+
      '<div><div class="bh-ddtitle">'+esc(cat.label)+'</div><div class="bh-ddper">'+esc(periodLabel())+'</div></div></div>';
    var pills='<div class="bh-pills">'+
      pl('ROI: '+(nd?'\u2014':pct(s.roi)),rcol(s.roi,!nd))+
      pl('WR: '+(nd?'\u2014':s.winrate.toFixed(0)+'%'),nd?'var(--muted)':wcol(s.winrate))+
      pl('W/J: '+(nd?'\u2014':s.wins+'/'+s.settled),'var(--txt)')+
      pl('Edge: '+(nd?'\u2014':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%'),'var(--cyan)')+
      (s.pending>0?pl('\u23F3 '+s.pending+' a\u015Fteapt\u0103','var(--yel)'):'')+
    '</div>';
    if(!rows.length)return hdr+pills+'<div class="bh-empty"><div class="bh-eico">\uD83D\uDD0D</div>'+
      '<div class="bh-etxt">Niciun meci \xEEn <b>'+esc(periodLabel())+'</b><br>pentru <b>'+esc(cat.label)+'</b></div></div>';
    var dayMap={},dayOrder=[];
    rows.forEach(function(r){
      var t=entryTs(r);if(!t)return;
      var d=new Date(t);
      var k=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
      if(!dayMap[k]){dayMap[k]={date:d,rows:[]};dayOrder.push(k);}
      dayMap[k].rows.push(r);
    });
    var groups=dayOrder.map(function(k){
      var day=dayMap[k],d=day.date;
      var lbl=DR[d.getDay()]+', '+d.getDate()+' '+MS[d.getMonth()]+' '+d.getFullYear();
      var mhtml=day.rows.map(function(r){
        var st=r._st,isPend=st==='pending';
        var bcls=st==='win'?'bh-bw':(st==='lose'?'bh-bl':'bh-bp');
        var btxt=st==='win'?'W':(st==='lose'?'L':'\u23F3');
        var mkt=MKT_NICE[r.market_key]||MKT_NICE[r.market]||r.market_key||r.market||'\u2014';
        var sc=(r.home_score!=null&&r.away_score!=null)?' <span class="bh-sc">['+r.home_score+'-'+r.away_score+']</span>':'';
        var prob=nv(r.adjusted_prob),edge=nv(r.edge_pct),kickoff='';
        if(isPend&&r.event_date){try{var kd=new Date(r.event_date);if(isFinite(kd))kickoff=' \u00B7 '+kd.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});}catch(e){}}
        var mp=[esc(mkt),esc(r.league||'\u2014')];
        if(prob>0)mp.push(prob.toFixed(0)+'% prob');
        if(edge>0)mp.push('edge +'+edge.toFixed(1)+'%');
        return'<div class="bh-row'+(isPend?' bh-pend-row':'')+'">'+
          '<div class="bh-badge '+bcls+'">'+btxt+'</div>'+
          '<div class="bh-main"><div class="bh-teams">'+esc(r.home||'?')+' vs '+esc(r.away||'?')+sc+'</div>'+
          '<div class="bh-meta">'+mp.join(' \u00B7 ')+esc(kickoff)+'</div></div>'+
          '<div class="bh-odds">@'+(nv(r.odds)>1?nv(r.odds).toFixed(2):'\u2014')+'</div></div>';
      }).join('');
      return'<div class="bh-dayg"><div class="bh-daylbl">'+esc(lbl)+'</div>'+mhtml+'</div>';
    }).join('');
    return hdr+pills+groups;
  }
  function pl(txt,col){return'<div class="bh-pill" style="color:'+col+'">'+txt+'</div>';}

  var _last='';
  function render(){
    var root=document.getElementById('history21-root');
    if(!root)return;
    injectCss();
    if(!_localCache && root.innerHTML.indexOf('bh-wrap')<0){
      root.innerHTML='<div class="bh-loading">\u29D7 Se incarca istoricul\u2026</div>';
    }
    loadEntries(function(entries){
      var html;
      if(S.view==='drilldown'&&S.cat){
        html='<div class="bh-wrap">'+renderPeriodBar()+renderDrilldown(entries)+'</div>';
      }else{
        var src = _isUsingCapture ? 'capturat din Meciuri' : 'snapshot.json';
        html='<div class="bh-wrap">'+renderPeriodBar()+
          '<div class="bh-note">\uD83D\uDCCC Sursa: <b>'+src+'</b> \u2014 acelea\u015Fi meciuri ca \xEEn Meciuri.</div>'+
          renderSummary(entries)+renderGrid(entries)+'</div>';
      }
      if(html!==_last){
        var r2=document.getElementById('history21-root');
        if(r2){r2.innerHTML=html;_last=html;}
      }
    });
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────
  window.batH={
    mode:function(m){S.mode=m;S.view='grid';S.cat=null;if(m==='days7')S.selDay=0;if(m==='weeks')S.selWeekIdx=-1;if(m==='month'){var now=new Date();S.month={y:now.getFullYear(),m:now.getMonth()};}if(m==='year')S.year=new Date().getFullYear();_last='';render();},
    day:function(i){S.selDay=i;_last='';render();},
    week:function(i){S.selWeekIdx=i;_last='';render();},
    setWeeksMonth:function(v){var p=v.split('-');S.weeksMonth={y:parseInt(p[0]),m:parseInt(p[1])};S.selWeekIdx=-1;_last='';render();},
    setMonth:function(v){var p=v.split('-');S.month={y:parseInt(p[0]),m:parseInt(p[1])};_last='';render();},
    setYear:function(v){S.year=parseInt(v);_last='';render();},
    drill:function(k){S.cat=k;S.view='drilldown';_last='';render();var r=document.getElementById('history21-root');if(r&&r.scrollIntoView)r.scrollIntoView({behavior:'smooth',block:'start'});},
    back:function(){S.view='grid';S.cat=null;_last='';render();},
    refresh:function(){invalidateLocalCache();_last='';render();},
    capture:function(){return captureFromMeciuri();},
    syncStatus:function(){syncStatusFromLog();},
    clearCapture:function(){try{localStorage.removeItem(STORAGE_KEY);invalidateLocalCache();_last='';render();return true;}catch(e){return false;}}
  };

  // ── BOOT ──────────────────────────────────────────────────────────────
  function boot(){
    render();

    // Hook în switchTab pentru a captura când utilizatorul merge la Meciuri
    var origSwitch = window.switchTab;
    if (typeof origSwitch === 'function') {
      window.switchTab = function(name){
        origSwitch.apply(this, arguments);
        if (name === 'meciuri' || name === 'matches') {
          // Captură când Meciuri se randează
          setTimeout(captureFromMeciuri, 800);
          setTimeout(captureFromMeciuri, 2200);
          setTimeout(syncStatusFromLog, 3500);
        } else if (name === 'istoric21' || name === 'istoric' || name === 'history') {
          invalidateLocalCache();
          _last='';
          setTimeout(render, 80);
          setTimeout(render, 700);
        }
      };
    }

    // Captură inițială (dacă utilizatorul deja e pe Meciuri la load)
    setTimeout(function(){
      if (window.ALL_MATCHES && window.ALL_MATCHES.length > 0) {
        captureFromMeciuri();
        syncStatusFromLog();
      }
    }, 2500);

    // Captură periodică (în caz că ALL_MATCHES e actualizat)
    setInterval(function(){
      if (window.ALL_MATCHES && window.ALL_MATCHES.length > 0) {
        captureFromMeciuri();
      }
    }, 60000); // 1 min

    // Sincronizare status periodică
    setInterval(syncStatusFromLog, 180000); // 3 min

    // Compatibilitate cu cod vechi
    window.renderHistory21 = function(){ invalidateLocalCache(); _last=''; render(); };

    try{
      var root=document.getElementById('history21-root');
      if(root) new MutationObserver(function(){
        if(!root.querySelector('.bh-wrap')){_last='';render();}
      }).observe(root,{childList:true});
    }catch(e){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
