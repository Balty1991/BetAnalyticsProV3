// ═══════════════════════════════════════════════════════════════════════
// Historic Meciuri Tracker  —  BetAnalytics Pro V21+
// Replaces "Istoric 21" cu monitorizare per categorie (identice cu filtrele
// din tab-ul Meciuri: Toate / ⭐ Top / 🔥 O1.5 / 🤝 BTTS / 🧊 U3.5 / 💰 Value)
// Perioade selectabile: 7 zile, 1-3 săptămâni, lună, an.
// Click pe categorie → drill-down cu meciuri W/L per zi.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__batHistoricTrackerV2) return;
  window.__batHistoricTrackerV2 = true;

  /* ────────────────────────────────────────────────────────────────────
     CATEGORII  (cheile corespund filtrelor din Meciuri)
  ──────────────────────────────────────────────────────────────────── */
  var CATS = [
    { key: 'all',   label: 'Toate',    accent: 'rgba(59,130,246,.85)',  bg: 'rgba(59,130,246,.07)',  border: 'rgba(59,130,246,.22)' },
    { key: 'safe',  label: '⭐ Top',   accent: 'rgba(34,197,94,.9)',    bg: 'rgba(34,197,94,.06)',   border: 'rgba(34,197,94,.22)' },
    { key: 'o15',   label: '🔥 O1.5',  accent: 'rgba(249,115,22,.9)',   bg: 'rgba(249,115,22,.06)',  border: 'rgba(249,115,22,.2)' },
    { key: 'btts',  label: '🤝 BTTS',  accent: 'rgba(168,85,247,.9)',   bg: 'rgba(168,85,247,.06)',  border: 'rgba(168,85,247,.2)' },
    { key: 'u35',   label: '🧊 U3.5',  accent: 'rgba(6,182,212,.9)',    bg: 'rgba(6,182,212,.06)',   border: 'rgba(6,182,212,.2)' },
    { key: 'value', label: '💰 Value', accent: 'rgba(245,158,11,.9)',   bg: 'rgba(245,158,11,.06)',  border: 'rgba(245,158,11,.2)' }
  ];

  var MKT_NICE = {
    over15: 'O1.5G', over25: 'O2.5G', under35: 'U3.5G', under25: 'U2.5G',
    btts: 'BTTS', 'Over 1.5G': 'O1.5G', 'Over 2.5G': 'O2.5G',
    'Under 3.5G': 'U3.5G', 'Under 2.5G': 'U2.5G'
  };

  var MONTHS_LONG  = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
                      'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  var MONTHS_SHORT = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var DAYS_RO      = ['Dum','Lun','Mar','Mie','Joi','Vin','Sâm'];

  /* ────────────────────────────────────────────────────────────────────
     STATE
  ──────────────────────────────────────────────────────────────────── */
  var _now = new Date();
  var S = {
    mode:  'days7',        // days7 | weeks | month | year
    weeks: 1,
    month: { y: _now.getFullYear(), m: _now.getMonth() },
    year:  _now.getFullYear(),
    view:  'grid',         // grid | drilldown
    cat:   null
  };

  /* ────────────────────────────────────────────────────────────────────
     HELPERS
  ──────────────────────────────────────────────────────────────────── */
  function n(v)  { return Number(v) || 0; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function pct(v){ var x = n(v); return (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; }
  function roi_color(v, settled){ return settled ? (n(v) > 0 ? 'var(--grn)' : (n(v) < 0 ? 'var(--red)' : 'var(--muted)')) : 'var(--muted)'; }
  function wr_color(v){ return n(v) >= 65 ? 'var(--grn)' : (n(v) >= 50 ? 'var(--yel)' : 'var(--red)'); }
  function getCat(key){ return CATS.find(function(c){ return c.key === key; }) || CATS[0]; }

  /* ────────────────────────────────────────────────────────────────────
     BOUNDS
  ──────────────────────────────────────────────────────────────────── */
  function bounds() {
    var now = new Date();
    var s, e = new Date(now); e.setHours(23,59,59,999);
    if (S.mode === 'days7') {
      s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0,0,0,0);
    } else if (S.mode === 'weeks') {
      s = new Date(now); s.setDate(s.getDate() - (S.weeks * 7 - 1)); s.setHours(0,0,0,0);
    } else if (S.mode === 'month') {
      s = new Date(S.month.y, S.month.m, 1, 0, 0, 0, 0);
      e = new Date(S.month.y, S.month.m + 1, 0, 23, 59, 59, 999);
    } else if (S.mode === 'year') {
      s = new Date(S.year, 0, 1, 0, 0, 0, 0);
      e = new Date(S.year, 11, 31, 23, 59, 59, 999);
    } else {
      s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0,0,0,0);
    }
    return { s: s.getTime(), e: e.getTime() };
  }

  function eventTs(r){
    var raw = r.event_date || r.date || r.logged_at || r.prediction_created_at || null;
    if (!raw) return 0;
    var t = new Date(raw).getTime();
    return isFinite(t) ? t : 0;
  }

  function inPeriod(r){
    var t = eventTs(r);
    if (!t) return false;
    var b = bounds();
    return t >= b.s && t <= b.e;
  }

  /* ────────────────────────────────────────────────────────────────────
     CATEGORY MATCHING  (mirror exact Meciuri filter logic)
  ──────────────────────────────────────────────────────────────────── */
  function rowMatchesCat(r, key) {
    if (key === 'all')   return true;
    var mk = r.market_key || '';
    if (key === 'safe')  return n(r.score) >= 80 || String(r.verdict || '').toLowerCase() === 'safe';
    if (key === 'o15')   return mk === 'over15';
    if (key === 'btts')  return mk === 'btts';
    if (key === 'u35')   return mk === 'under35';
    if (key === 'value') return n(r.value) >= 0.05;
    return false;
  }

  /* ────────────────────────────────────────────────────────────────────
     DATA — identic cu sistemul existent (RECOMMENDATION_LOG + ALL_MATCHES)
  ──────────────────────────────────────────────────────────────────── */
  var SUPPORTED_MKT = { over15: true, over25: true, btts: true, under35: true, under25: true };

  function normalizeStatus(r) {
    var st = String(r.status || r.result || '').toLowerCase().trim();
    if (st === 'win' || st === 'won' || r.won === true) return 'win';
    if (st === 'lose' || st === 'loss' || st === 'lost' || r.won === false) return 'lose';
    /* scor direct */
    if (r.home_score != null && r.away_score != null && r.market_key) {
      if (typeof window.evaluateMarketOutcome === 'function') {
        var ev = window.evaluateMarketOutcome(r.market_key, n(r.home_score), n(r.away_score));
        if (ev === 'win') return 'win';
        if (ev === 'loss') return 'lose';
      }
    }
    return 'pending';
  }

  function getSettled() {
    return (window.RECOMMENDATION_LOG || []).filter(function(r){
      if (!r) return false;
      if (!SUPPORTED_MKT[r.market_key]) return false;
      var st = normalizeStatus(r);
      return st === 'win' || st === 'lose';
    }).map(function(r){
      return Object.assign({}, r, { _st: normalizeStatus(r), source: 'log' });
    });
  }

  function getPending() {
    if (typeof window.getHistory21LivePendingRows === 'function') {
      try {
        return window.getHistory21LivePendingRows().map(function(r){
          return Object.assign({}, r, { _st: 'pending', source: 'live' });
        });
      } catch(e) {}
    }
    return [];
  }

  var _cachedRows = null, _cacheTs = 0;
  function getAllRows() {
    var now = Date.now();
    if (_cachedRows && now - _cacheTs < 8000) return _cachedRows;
    var settled = getSettled();
    var pending = getPending();
    var seen = {};
    var out = [];
    settled.forEach(function(r){
      var k = String(r.event_id || '') + '::' + (r.market_key || '');
      seen[k] = true; out.push(r);
    });
    pending.forEach(function(r){
      var k = String(r.event_id || r.eventId || '') + '::' + (r.market_key || '');
      if (!seen[k]) { seen[k] = true; out.push(r); }
    });
    _cachedRows = out; _cacheTs = now;
    return out;
  }

  /* ────────────────────────────────────────────────────────────────────
     STATS
  ──────────────────────────────────────────────────────────────────── */
  function calcStats(rows) {
    var settled = rows.filter(function(r){ return r._st === 'win' || r._st === 'lose'; });
    var pending = rows.filter(function(r){ return r._st === 'pending'; });
    var wins    = settled.filter(function(r){ return r._st === 'win'; }).length;
    var profit  = settled.reduce(function(acc, r){
      var o = n(r.odds); return acc + (r._st === 'win' ? (o > 1 ? o - 1 : 0) : -1);
    }, 0);
    var edgeSum = settled.reduce(function(acc, r){ return acc + n(r.edge_pct); }, 0);
    var BE      = settled.length ? (settled.reduce(function(a,r){ return a + (n(r.odds) > 1 ? 100/n(r.odds) : 50); },0) / settled.length) : 0;
    return {
      total:   rows.length,
      settled: settled.length,
      wins:    wins,
      losses:  settled.length - wins,
      pending: pending.length,
      winrate: settled.length ? wins * 100 / settled.length : 0,
      roi:     settled.length ? profit * 100 / settled.length : 0,
      avgEdge: settled.length ? edgeSum / settled.length : 0,
      profit:  profit,
      breakEven: BE,
      edge_delta: settled.length ? (wins * 100 / settled.length) - BE : 0
    };
  }

  /* ────────────────────────────────────────────────────────────────────
     PERIOD LABEL
  ──────────────────────────────────────────────────────────────────── */
  function periodLabel() {
    if (S.mode === 'days7')  return 'Ultimele 7 zile';
    if (S.mode === 'weeks')  return 'Ultimele ' + S.weeks + ' săptămân' + (S.weeks === 1 ? 'ă' : 'i');
    if (S.mode === 'month')  return MONTHS_LONG[S.month.m] + ' ' + S.month.y;
    if (S.mode === 'year')   return 'Anul ' + S.year;
    return '7 zile';
  }

  /* ────────────────────────────────────────────────────────────────────
     CSS — injectat o singură dată
  ──────────────────────────────────────────────────────────────────── */
  function injectCss() {
    if (document.getElementById('bat-hist-css-v2')) return;
    var css = [
    /* wrapper */
    '.bh-wrap{padding:2px 0 12px}',
    /* period bar */
    '.bh-pbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
    '.bh-pbtn{padding:7px 13px;border-radius:12px;font-size:12px;font-weight:700',
             ';border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035)',
             ';color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.bh-pbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
    /* sub-bar */
    '.bh-sub{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
    '.bh-sbtn{padding:6px 12px;border-radius:10px;font-size:11px;font-weight:700',
             ';border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.025)',
             ';color:var(--muted);cursor:pointer}',
    '.bh-sbtn.on{background:rgba(43,229,197,.11);border-color:rgba(43,229,197,.32);color:var(--acc)}',
    '.bh-sel{padding:7px 12px;border-radius:10px;font-size:12px;font-weight:600',
            ';border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03)',
            ';color:var(--txt);cursor:pointer;width:auto;max-width:200px}',
    /* summary card (TOATE) */
    '.bh-sum{padding:14px;border-radius:18px;margin-bottom:12px',
            ';background:linear-gradient(135deg,rgba(43,229,197,.07),rgba(59,130,246,.05))',
            ';border:1px solid rgba(43,229,197,.2);box-shadow:0 8px 24px rgba(0,0,0,.12)}',
    '.bh-sum-title{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.bh-pend-tag{font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);color:var(--muted);font-weight:700}',
    '.bh-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '.bh-kcard{padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);text-align:center}',
    '.bh-kval{font-size:20px;font-weight:900;line-height:1;margin-bottom:3px}',
    '.bh-klbl{font-size:9px;color:var(--muted);font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}',
    /* category grid */
    '.bh-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}',
    '.bh-card{padding:13px 11px 10px;border-radius:15px;cursor:pointer',
             ';background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07)',
             ';transition:border-color .15s;position:relative;overflow:hidden',
             ';-webkit-tap-highlight-color:transparent}',
    '.bh-card:active{opacity:.85}',
    '.bh-card-name{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:5px}',
    '.bh-card-roi{font-size:22px;font-weight:900;line-height:1;margin-bottom:5px}',
    '.bh-card-meta{font-size:10px;color:var(--muted);line-height:1.55}',
    '.bh-card-arr{position:absolute;top:11px;right:11px;font-size:16px;opacity:.35;color:var(--txt)}',
    '.bh-card-bar{height:3px;border-radius:2px;margin-top:9px;opacity:.45}',
    /* drill-down */
    '.bh-dd-hdr{display:flex;align-items:center;gap:10px;margin-bottom:11px',
               ';padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.025)',
               ';border:1px solid rgba(255,255,255,.08)}',
    '.bh-back{padding:7px 11px;border-radius:10px;font-size:12px;font-weight:700',
             ';border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)',
             ';color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.bh-dd-title{font-size:14px;font-weight:900;color:var(--txt)}',
    '.bh-dd-period{font-size:10px;color:var(--muted);font-family:var(--mono)}',
    '.bh-dd-stats{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}',
    '.bh-pill{padding:5px 9px;border-radius:9px;font-size:11px;font-weight:700',
             ';background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)}',
    /* day groups */
    '.bh-day{margin-bottom:14px}',
    '.bh-day-lbl{font-size:9px;font-family:var(--mono);color:var(--muted);letter-spacing:.06em;text-transform:uppercase',
                ';padding:5px 0 5px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:7px}',
    '.bh-row{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}',
    '.bh-row:last-child{border-bottom:none}',
    '.bh-badge{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;margin-top:1px}',
    '.bh-w{background:rgba(34,197,94,.18);color:var(--grn);border:1px solid rgba(34,197,94,.28)}',
    '.bh-l{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.22)}',
    '.bh-p{background:rgba(255,255,255,.05);color:var(--muted);border:1px solid rgba(255,255,255,.09)}',
    '.bh-main{flex:1;min-width:0}',
    '.bh-teams{font-size:12px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bh-meta{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}',
    '.bh-odds{font-size:11px;font-weight:700;color:var(--txt);flex-shrink:0;margin-top:2px}',
    '.bh-score{color:var(--acc);font-size:11px;font-family:var(--mono);font-weight:700}',
    /* empty */
    '.bh-empty{text-align:center;padding:36px 16px}',
    '.bh-empty-ico{font-size:34px;margin-bottom:8px}',
    '.bh-empty-txt{font-size:12px;color:var(--muted);line-height:1.6}',
    /* note */
    '.bh-note{font-size:10px;color:var(--muted);line-height:1.5;padding:10px 12px;border-radius:11px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);margin-bottom:10px}',
    /* responsive */
    '@media(max-width:360px){.bh-grid{grid-template-columns:1fr}.bh-kval{font-size:17px}}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'bat-hist-css-v2';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ────────────────────────────────────────────────────────────────────
     PERIOD BAR
  ──────────────────────────────────────────────────────────────────── */
  function renderPeriodBar() {
    var h = '<div class="bh-pbar">' +
      btn('days7','7 Zile') + btn('weeks','Săptămâni') + btn('month','Lună') + btn('year','Anual') +
    '</div>';
    if (S.mode === 'weeks') {
      h += '<div class="bh-sub">' +
        sbtn(1,'1 săpt.') + sbtn(2,'2 săpt.') + sbtn(3,'3 săpt.') +
      '</div>';
    }
    if (S.mode === 'month') {
      var opts = getMonthOptions().map(function(mo){
        var sel = (S.month.y === mo.y && S.month.m === mo.m) ? ' selected' : '';
        return '<option value="'+mo.y+'-'+mo.m+'"'+sel+'>'+MONTHS_LONG[mo.m]+' '+mo.y+'</option>';
      }).join('');
      h += '<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setMonth(this.value)">'+opts+'</select></div>';
    }
    if (S.mode === 'year') {
      var now = new Date();
      var yopts = '';
      for (var i=0; i<4; i++) {
        var yr = now.getFullYear() - i;
        yopts += '<option value="'+yr+'"'+(S.year===yr?' selected':'')+'>'+yr+'</option>';
      }
      h += '<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setYear(this.value)">'+yopts+'</select></div>';
    }
    return h;
    function btn(mode, lbl){ return '<button class="bh-pbtn'+(S.mode===mode?' on':'')+'" onclick="window.batH.mode(\''+mode+'\')">'+lbl+'</button>'; }
    function sbtn(w, lbl)  { return '<button class="bh-sbtn'+(S.weeks===w?' on':'')+'" onclick="window.batH.weeks('+w+')">'+lbl+'</button>'; }
  }

  /* ────────────────────────────────────────────────────────────────────
     SUMMARY CARD  (Toate)
  ──────────────────────────────────────────────────────────────────── */
  function renderSummary(allRows) {
    var rows = allRows.filter(inPeriod);
    var s    = calcStats(rows);
    var nd   = s.settled === 0;
    return '<div class="bh-sum">' +
      '<div class="bh-sum-title">📊 Toate categoriile · <span style="color:var(--acc)">' + esc(periodLabel()) + '</span>' +
        (s.pending > 0 ? '<span class="bh-pend-tag">+'+s.pending+' pending</span>' : '') +
      '</div>' +
      '<div class="bh-kpi">' +
        kcard((nd ? '—' : pct(s.roi)),     roi_color(s.roi, !nd), 'ROI') +
        kcard((nd ? '—' : s.winrate.toFixed(0)+'%'), (nd ? 'var(--muted)' : wr_color(s.winrate)), 'Win Rate') +
        kcard((nd ? '—' : s.wins+'/'+s.settled),     'var(--txt)', 'W / Jucate') +
      '</div>' +
    '</div>';
  }

  function kcard(val, color, lbl){
    return '<div class="bh-kcard"><div class="bh-kval" style="color:'+color+'">'+val+'</div><div class="bh-klbl">'+lbl+'</div></div>';
  }

  /* ────────────────────────────────────────────────────────────────────
     CATEGORY GRID
  ──────────────────────────────────────────────────────────────────── */
  function renderGrid(allRows) {
    var cards = CATS.filter(function(c){ return c.key !== 'all'; }).map(function(cat){
      var rows = allRows.filter(function(r){ return inPeriod(r) && rowMatchesCat(r, cat.key); });
      var s    = calcStats(rows);
      var nd   = s.settled === 0;
      var rColor = roi_color(s.roi, !nd);
      var bColor = nd ? 'rgba(255,255,255,.06)' : (s.roi >= 0 ? 'rgba(34,197,94,.22)' : 'rgba(239,68,68,.18)');
      var barW   = nd ? '15' : Math.min(100, Math.max(10, Math.abs(s.winrate))).toFixed(0);

      return '<div class="bh-card" onclick="window.batH.drill(\''+cat.key+'\')" style="border-color:'+bColor+'">' +
        '<div class="bh-card-arr">›</div>' +
        '<div class="bh-card-name">'+esc(cat.label)+'</div>' +
        '<div class="bh-card-roi" style="color:'+rColor+'">'+(nd ? '—' : pct(s.roi))+'</div>' +
        '<div class="bh-card-meta">' +
          'WR: <b style="color:'+(nd?'var(--muted)':wr_color(s.winrate))+'">'+(nd?'—':s.winrate.toFixed(0)+'%')+'</b>' +
          ' · '+(nd?'—':s.wins+'/'+s.settled+' W') +
          (s.pending > 0 ? ' <span style="opacity:.55">(+'+s.pending+'⏳)</span>' : '') + '<br>' +
          'Edge: <b style="color:'+(nd?'var(--muted)':'var(--cyan)')+'">'+(nd?'—':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%')+'</b>' +
          (s.settled > 0 ? ' · Δ <b style="color:'+(s.edge_delta>=0?'var(--grn)':'var(--red)')+'">'+(s.edge_delta>=0?'+':'')+s.edge_delta.toFixed(1)+'pp</b>' : '') +
        '</div>' +
        '<div class="bh-card-bar" style="background:'+cat.accent+';width:'+barW+'%"></div>' +
      '</div>';
    });

    return '<div class="bh-grid">'+cards.join('')+'</div>';
  }

  /* ────────────────────────────────────────────────────────────────────
     DRILL-DOWN
  ──────────────────────────────────────────────────────────────────── */
  function renderDrilldown(allRows) {
    var cat  = getCat(S.cat);
    var rows = allRows.filter(function(r){ return inPeriod(r) && rowMatchesCat(r, S.cat); });
    rows.sort(function(a,b){ return eventTs(b) - eventTs(a); });
    var s = calcStats(rows);
    var nd = s.settled === 0;

    var header = '<div class="bh-dd-hdr">' +
      '<button class="bh-back" onclick="window.batH.back()">← Înapoi</button>' +
      '<div><div class="bh-dd-title">'+esc(cat.label)+'</div>' +
      '<div class="bh-dd-period">'+esc(periodLabel())+'</div></div>' +
    '</div>';

    var stats = '<div class="bh-dd-stats">' +
      pill('ROI: '+(nd?'—':pct(s.roi)), roi_color(s.roi,!nd)) +
      pill('WR: '+(nd?'—':s.winrate.toFixed(0)+'%'), nd?'var(--muted)':wr_color(s.winrate)) +
      pill('W/J: '+(nd?'—':s.wins+'/'+s.settled), 'var(--txt)') +
      pill('Edge: '+(nd?'—':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%'), 'var(--cyan)') +
      (s.pending>0 ? pill('⏳ '+s.pending+' pending','var(--muted)') : '') +
    '</div>';

    if (!rows.length) {
      return header + stats + '<div class="bh-empty"><div class="bh-empty-ico">🔍</div>' +
        '<div class="bh-empty-txt">Niciun meci în <b>'+esc(periodLabel())+'</b><br>pentru categoria <b>'+esc(cat.label)+'</b>.</div></div>';
    }

    /* grup pe zile */
    var dayMap = {}, dayOrder = [];
    rows.forEach(function(r){
      var t = eventTs(r);
      if (!t) return;
      var d   = new Date(t);
      var key = d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
      if (!dayMap[key]) { dayMap[key] = { date: d, rows: [] }; dayOrder.push(key); }
      dayMap[key].rows.push(r);
    });

    var groups = dayOrder.map(function(k){
      var day = dayMap[k];
      var d   = day.date;
      var lbl = DAYS_RO[d.getDay()]+', '+d.getDate()+' '+MONTHS_SHORT[d.getMonth()]+' '+d.getFullYear();
      var matchHtml = day.rows.map(function(r){
        var st     = r._st;
        var bCls   = st === 'win' ? 'bh-w' : (st === 'lose' ? 'bh-l' : 'bh-p');
        var bTxt   = st === 'win' ? 'W' : (st === 'lose' ? 'L' : '⋯');
        var mkt    = MKT_NICE[r.market_key] || MKT_NICE[r.market] || r.market_key || r.market || '—';
        var score  = (r.home_score != null && r.away_score != null)
          ? ' <span class="bh-score">['+r.home_score+'-'+r.away_score+']</span>' : '';
        var prob   = n(r.adjusted_prob || r.api_prob || r.model_prob);
        var edge   = n(r.edge_pct);
        var metaParts = [esc(mkt), esc(r.league || '—')];
        if (prob > 0) metaParts.push(prob.toFixed(0)+'% prob');
        if (edge > 0) metaParts.push('edge +'+edge.toFixed(1)+'%');

        return '<div class="bh-row">' +
          '<div class="bh-badge '+bCls+'">'+bTxt+'</div>' +
          '<div class="bh-main">' +
            '<div class="bh-teams">'+esc(r.home||'?')+' vs '+esc(r.away||'?')+score+'</div>' +
            '<div class="bh-meta">'+metaParts.join(' · ')+'</div>' +
          '</div>' +
          '<div class="bh-odds">@'+(n(r.odds)>1 ? n(r.odds).toFixed(2) : '—')+'</div>' +
        '</div>';
      }).join('');
      return '<div class="bh-day"><div class="bh-day-lbl">'+esc(lbl)+'</div>'+matchHtml+'</div>';
    }).join('');

    return header + stats + groups;
  }

  function pill(txt, color){ return '<div class="bh-pill" style="color:'+color+'">'+txt+'</div>'; }
  function pad2(n){ return String(n).padStart(2,'0'); }

  /* ────────────────────────────────────────────────────────────────────
     MONTH OPTIONS helper
  ──────────────────────────────────────────────────────────────────── */
  function getMonthOptions(){
    var now = new Date(); var opts = [];
    for (var i=0; i<24; i++){
      var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      opts.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return opts;
  }

  /* ────────────────────────────────────────────────────────────────────
     MAIN RENDER
  ──────────────────────────────────────────────────────────────────── */
  var _lastHtml = '';
  function render() {
    var root = document.getElementById('history21-root');
    if (!root) return;
    injectCss();
    _cachedRows = null; // invalidate cache so we pick up fresh RECOMMENDATION_LOG
    var allRows = getAllRows();
    var html;
    if (S.view === 'drilldown' && S.cat) {
      html = '<div class="bh-wrap">' + renderPeriodBar() + renderDrilldown(allRows) + '</div>';
    } else {
      html = '<div class="bh-wrap">' +
        renderPeriodBar() +
        '<div class="bh-note">📌 Date din recomandările reale ale motorului — identice cu filtrele din tab-ul Meciuri. ' +
        'Categoriile ⭐ Top și 💰 Value pot suprapune alte categorii.</div>' +
        renderSummary(allRows) +
        renderCategoryGrid(allRows) +
      '</div>';
    }
    if (html !== _lastHtml) { root.innerHTML = html; _lastHtml = html; }
  }

  function renderCategoryGrid(rows){ return renderGrid(rows); }

  /* ────────────────────────────────────────────────────────────────────
     PUBLIC API — expus pe window.batH
  ──────────────────────────────────────────────────────────────────── */
  window.batH = {
    mode: function(m) {
      S.mode = m; S.view = 'grid'; S.cat = null;
      if (m === 'weeks' && !S.weeks) S.weeks = 1;
      if (m === 'month') { var now=new Date(); S.month={y:now.getFullYear(),m:now.getMonth()}; }
      if (m === 'year')  { S.year = new Date().getFullYear(); }
      _lastHtml=''; render();
    },
    weeks: function(w) { S.weeks = w; _lastHtml=''; render(); },
    setMonth: function(v) {
      var p = v.split('-'); S.month = { y: parseInt(p[0]), m: parseInt(p[1]) };
      _lastHtml=''; render();
    },
    setYear: function(v) { S.year = parseInt(v); _lastHtml=''; render(); },
    drill: function(key) {
      S.cat = key; S.view = 'drilldown'; _lastHtml=''; render();
      var root = document.getElementById('history21-root');
      if (root && root.scrollIntoView) root.scrollIntoView({ behavior:'smooth', block:'start' });
    },
    back: function() { S.view = 'grid'; S.cat = null; _lastHtml=''; render(); }
  };

  /* ────────────────────────────────────────────────────────────────────
     BOOT — inițializare + hook tab-switch
  ──────────────────────────────────────────────────────────────────── */
  function boot() {
    render();
    [300, 900, 2500, 5000, 12000].forEach(function(t){ setTimeout(render, t); });
    setInterval(render, 45000);

    /* override renderHistory21 so no alt runtime overwrites our content */
    window.renderHistory21 = function() { _lastHtml = ''; render(); };

    /* re-render când se deschide tab-ul Istoric */
    var origSwitch = window.switchTab;
    if (typeof origSwitch === 'function') {
      window.switchTab = function(name) {
        origSwitch.apply(this, arguments);
        if (name === 'istoric21' || name === 'istoric') {
          _lastHtml=''; setTimeout(render, 80); setTimeout(render, 600);
        }
      };
    }

    /* MutationObserver: re-render dacă root se golește (alte runtimes) */
    try {
      var root = document.getElementById('history21-root');
      if (root) {
        new MutationObserver(function(){
          if (!root.querySelector('.bh-wrap')) { _lastHtml=''; render(); }
        }).observe(root, { childList: true });
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
