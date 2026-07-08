/**
 * upcoming_events_runtime.js v2
 * Evenimente Viitoare — predicții extinse + salvare picks + ROI/winrate tracking
 */
(function () {
  'use strict';
  if (window.__veyraUpcomingV2) return;
  window.__veyraUpcomingV2 = true;
  window.__veyraUpcomingV1 = true;

  var STORE_KEY   = 'veyra_upcoming_picks_v1';
  var _activeDate = null;
  var _activeView = 'matches';

  /* ── Storage ──────────────────────────────────────────────────────── */
  function loadPicks() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    } catch(e) { return {}; }
  }
  function savePicks(obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch(e) {} }

  function togglePick(ev, pred) {
    var picks = loadPicks();
    var k = String(ev.id);
    if (picks[k]) { delete picks[k]; savePicks(picks); return false; }
    var p = calcPrediction(ev, pred);
    if (!p) return false;
    picks[k] = {
      eventId:      k,
      home:         ev.home_team || '',
      away:         ev.away_team || '',
      league:       (ev.league && ev.league.name) || '',
      bestBet:      p.best.key,
      bestBetLabel: p.best.label,
      odds:         getOddsForMarket(ev, p.best.key, p),
      prob:         p.best.prob,
      smartScore:   p.best.prob,
      eventDate:    ev.event_date || '',
      status:       'pending',
      homeScore:    null,
      awayScore:    null,
      resolvedAt:   null,
      savedAt:      new Date().toISOString()
    };
    savePicks(picks);
    return true;
  }

  function getOddsForMarket(ev, key, p) {
    var d = { home_win: ev.odds_home, draw: ev.odds_draw, away_win: ev.odds_away,
              over_25: ev.odds_over_25, over_15: ev.odds_over_15,
              under_25: ev.odds_under_25, btts_yes: ev.odds_btts_yes };
    if (d[key]) return Math.round(Number(d[key]) * 100) / 100;
    if (p && p.one != null && p.x != null && p.two != null) {
      var ph = p.one / 100, pd2 = p.x / 100, pa = p.two / 100;
      if (key === 'dc_1x' && ph + pd2 > 0) return Math.round(100 / (ph + pd2)) / 100;
      if (key === 'dc_x2' && pd2 + pa > 0) return Math.round(100 / (pd2 + pa)) / 100;
      if (key === 'dc_12' && ph + pa  > 0) return Math.round(100 / (ph + pa))  / 100;
    }
    return 0;
  }

  function settleOutcome(pick, hs, as2) {
    hs = Number(hs); as2 = Number(as2);
    var k = pick.bestBet;
    if (k === 'home_win') return hs > as2;
    if (k === 'draw')     return hs === as2;
    if (k === 'away_win') return hs < as2;
    if (k === 'over_25')  return hs + as2 > 2.5;
    if (k === 'over_15')  return hs + as2 > 1.5;
    if (k === 'under_25') return hs + as2 < 2.5;
    if (k === 'btts_yes') return hs > 0 && as2 > 0;
    if (k === 'btts_no')  return hs === 0 || as2 === 0;
    if (k === 'dc_1x')    return hs >= as2;
    if (k === 'dc_x2')    return hs <= as2;
    if (k === 'dc_12')    return hs !== as2;
    return null;
  }

  function autoSettle(picks, evLookup) {
    var changed = false;
    Object.keys(picks).forEach(function(k) {
      var pick = picks[k];
      if (pick.status !== 'pending') return;
      var ev = evLookup[k];
      if (!ev || ev.home_score == null || ev.away_score == null) return;
      var won = settleOutcome(pick, ev.home_score, ev.away_score);
      if (won === null) return;
      pick.status = won ? 'win' : 'loss';
      pick.homeScore = ev.home_score;
      pick.awayScore = ev.away_score;
      pick.resolvedAt = new Date().toISOString();
      changed = true;
    });
    if (changed) savePicks(picks);
    return picks;
  }

  function calcStats(arr) {
    var won  = arr.filter(function(p){ return p.status === 'win'; });
    var lost = arr.filter(function(p){ return p.status === 'loss'; });
    var settled = won.length + lost.length;
    return {
      total:   arr.length,
      pending: arr.filter(function(p){ return p.status === 'pending'; }).length,
      won:     won.length,
      lost:    lost.length,
      winrate: settled > 0 ? Math.round(won.length / settled * 100) : null,
      roi:     settled > 0 ? Math.round(
        (won.reduce(function(s,p){ return s + (Number(p.odds)||1); }, 0) - settled) / settled * 100
      ) : null
    };
  }

  /* ── hookSwitchTab ──────────────────────────────────────────────────── */
  function hookSwitchTab() {
    if (typeof window.switchTab !== 'function') { setTimeout(hookSwitchTab, 150); return; }
    var orig = window.switchTab;
    window.switchTab = function(name) {
      orig.apply(this, arguments);
      if (name === 'upcoming') setTimeout(renderUpcomingTab, 80);
    };
  }

  /* ── Date helpers ──────────────────────────────────────────────────── */
  function todayIso()    { return new Date().toISOString().slice(0, 10); }
  function tomorrowIso() { var d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }

  function formatTime(dateStr) {
    if (!dateStr) return '--:--';
    try {
      var d = new Date(dateStr);
      return isFinite(d.getTime())
        ? d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
        : '--:--';
    } catch(e) { return '--:--'; }
  }

  function formatDateLabel(iso) {
    var today = todayIso(), tom = tomorrowIso();
    if (iso === today) return 'Azi';
    if (iso === tom)   return 'Mâine';
    var d = new Date(iso + 'T12:00:00');
    var DAYS   = ['Dum','Lun','Mar','Mie','Joi','Vin','Sâm'];
    var MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'];
    return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* ── Prediction engine ──────────────────────────────────────────────── */
  function buildPredLookup() {
    var lookup = {};
    (Array.isArray(window.__RAW_PREDICTIONS) ? window.__RAW_PREDICTIONS : []).forEach(function(p) {
      if (!p) return;
      var id = p.id || (p.event && p.event.id);
      if (id != null) lookup[String(id)] = p;
    });
    return lookup;
  }

  var MKT_LABELS = {
    home_win: '1 — Victorie gazdă', draw: 'X — Egal', away_win: '2 — Victorie oaspete',
    over_15: 'Peste 1.5 goluri',    over_25: 'Peste 2.5 goluri',
    under_25: 'Sub 2.5 goluri',     btts_yes: 'Ambele marchează',
    btts_no: 'Min. o echipă nu marchează',
    dc_1x: 'Șansă dublă 1X', dc_x2: 'Șansă dublă X2', dc_12: 'Șansă dublă 12'
  };
  var MKT_COLORS = {
    home_win:'#22c55e', draw:'#f59e0b', away_win:'#60a5fa',
    over_15:'#a78bfa',  over_25:'#a78bfa', under_25:'#34d399',
    btts_yes:'#f472b6', btts_no:'#94a3b8',
    dc_1x:'#2BE5C5',    dc_x2:'#2BE5C5',   dc_12:'#2BE5C5'
  };

  function calcPrediction(ev, pred) {
    var markets = [], hasMl = false;
    var aiText  = (pred && pred.ai_preview) || (ev.ai_preview && ev.ai_preview.text) || '';
    var aiBoost = !!aiText;

    if (pred) {
      hasMl = true;
      var ph = Number(pred.prob_home_win||0), pd = Number(pred.prob_draw||0),
          pa = Number(pred.prob_away_win||0), po25 = Number(pred.prob_over_25||0),
          po15 = Number(pred.prob_over_15||0), pbtts = Number(pred.prob_btts_yes||0);

      if (ph  > 0) markets.push({ key:'home_win', prob:ph,   source:'ML' });
      if (pd  > 0) markets.push({ key:'draw',     prob:pd,   source:'ML' });
      if (pa  > 0) markets.push({ key:'away_win', prob:pa,   source:'ML' });
      if (po25> 0) markets.push({ key:'over_25',  prob:po25, source:'ML' });
      if (po15> 0) markets.push({ key:'over_15',  prob:po15, source:'ML' });
      if (pbtts>0) { markets.push({ key:'btts_yes', prob:pbtts,     source:'ML' });
                     markets.push({ key:'btts_no',  prob:100-pbtts, source:'ML' }); }
      /* Double chance from ML probs */
      if (ph>0&&pd>0) markets.push({ key:'dc_1x', prob:Math.min(ph+pd,99), source:'ML' });
      if (pd>0&&pa>0) markets.push({ key:'dc_x2', prob:Math.min(pd+pa,99), source:'ML' });
      if (ph>0&&pa>0) markets.push({ key:'dc_12', prob:Math.min(ph+pa,99), source:'ML' });

      /* Trust ML engine's best_market (has EV/edge) */
      var bm = pred.best_market;
      if (bm && bm.market_key) {
        var eng = markets.filter(function(m){ return m.key === bm.market_key; })[0];
        if (eng) { eng.isBest = true; eng.ev = bm.ev || null; }
        /* Also mark DC safer alternative for 1X2 best picks */
        if (bm.market_key === 'home_win') {
          var dc1x = markets.filter(function(m){ return m.key === 'dc_1x'; })[0];
          if (dc1x) dc1x.isBestDc = true;
        }
        if (bm.market_key === 'away_win') {
          var dcx2 = markets.filter(function(m){ return m.key === 'dc_x2'; })[0];
          if (dcx2) dcx2.isBestDc = true;
        }
      }

    } else if (ev.odds_home && ev.odds_draw && ev.odds_away) {
      var inv1 = 1/Number(ev.odds_home), invX = 1/Number(ev.odds_draw), inv2 = 1/Number(ev.odds_away);
      var tot  = inv1 + invX + inv2;
      var ph2  = (inv1/tot)*100, pd2 = (invX/tot)*100, pa2 = (inv2/tot)*100;
      markets.push({ key:'home_win', prob:ph2, source:'Cote' });
      markets.push({ key:'draw',     prob:pd2, source:'Cote' });
      markets.push({ key:'away_win', prob:pa2, source:'Cote' });
      markets.push({ key:'dc_1x',    prob:Math.min(ph2+pd2,99), source:'Cote' });
      markets.push({ key:'dc_x2',    prob:Math.min(pd2+pa2,99), source:'Cote' });
      markets.push({ key:'dc_12',    prob:Math.min(ph2+pa2,99), source:'Cote' });
      if (ev.odds_over_25 && ev.odds_under_25) {
        var iOv = 1/Number(ev.odds_over_25), iUn = 1/Number(ev.odds_under_25), t25 = iOv+iUn;
        markets.push({ key:'over_25',  prob:(iOv/t25)*100, source:'Cote' });
        markets.push({ key:'under_25', prob:(iUn/t25)*100, source:'Cote' });
      }
      if (ev.odds_btts_yes) {
        var pb = (1/Number(ev.odds_btts_yes))*100;
        markets.push({ key:'btts_yes', prob:Math.min(pb*1.05,92),    source:'Cote' });
        markets.push({ key:'btts_no',  prob:Math.max(100-pb*1.05,8), source:'Cote' });
      }
    }

    if (!markets.length) return null;
    markets.sort(function(a,b){ return b.prob - a.prob; });

    /* ── Safety-first selection ───────────────────────────────────────
       Priority:
       1. Clear 1X2 favorite (≥62%) — most legible pick
       2. Best DC (≥68%) — safer than BTTS/O-U when no clear favorite
       3. ML engine best_market (if marked and ≥55%)
       4. Any non-DC market ≥55%
       5. Highest-probability market overall
    ─────────────────────────────────────────────────────────────────── */
    var clear1x2 = markets.filter(function(m){
      return (m.key==='home_win'||m.key==='draw'||m.key==='away_win') && m.prob >= 62;
    }).sort(function(a,b){ return b.prob-a.prob; })[0];

    var bestDC = markets.filter(function(m){ return m.key.indexOf('dc_')===0; })
                        .sort(function(a,b){ return b.prob-a.prob; })[0];

    var mlMarked = markets.filter(function(m){ return m.isBest; })[0];

    /* Clear all flags, we'll re-set the winner */
    markets.forEach(function(m){ m.isBest=false; m.isBestDc=false; });

    var chosen;
    if (clear1x2) {
      chosen = clear1x2;
    } else if (bestDC && bestDC.prob >= 68) {
      chosen = bestDC;
    } else if (mlMarked && mlMarked.prob >= 55) {
      chosen = mlMarked;
    } else {
      var noDC2 = markets.filter(function(m){ return m.key.indexOf('dc_')!==0; });
      chosen = (noDC2[0] && noDC2[0].prob >= 55) ? noDC2[0] : (markets[0]);
    }
    chosen.isBest = true;

    /* DC safer alternative: show when primary is a volatile market (BTTS/OU) */
    if (chosen.key!=='home_win'&&chosen.key!=='draw'&&chosen.key!=='away_win'
        &&chosen.key.indexOf('dc_')!==0 && bestDC && bestDC.prob >= 65 && bestDC!==chosen) {
      bestDC.isBestDc = true;
    }
    /* Also show DC when primary is 1X2 with high prob (keep as safer hint) */
    if ((chosen.key==='home_win'||chosen.key==='away_win') && bestDC && bestDC!==chosen && bestDC.prob>=68) {
      bestDC.isBestDc = true;
    }

    var one  = markets.filter(function(m){ return m.key==='home_win'; })[0];
    var x    = markets.filter(function(m){ return m.key==='draw'; })[0];
    var two  = markets.filter(function(m){ return m.key==='away_win'; })[0];
    var best = markets.filter(function(m){ return m.isBest; })[0] || markets[0];
    var bDc  = markets.filter(function(m){ return m.isBestDc; })[0] || null;
    var isSafePick = best.key.indexOf('dc_') === 0;

    /* Confidence: DC picks score higher due to structural safety */
    var baseConf = best.prob + (hasMl?5:0) + (aiBoost?3:0) + (isSafePick?6:0);
    return {
      one: one ? Math.round(one.prob) : null,
      x:   x   ? Math.round(x.prob)  : null,
      two: two  ? Math.round(two.prob): null,
      best: { key:best.key, label:MKT_LABELS[best.key]||best.key,
              color:MKT_COLORS[best.key]||'#94a3b8', prob:Math.round(best.prob),
              source:best.source, ev:best.ev||null, isSafe:isSafePick },
      bestDc: bDc ? { key:bDc.key, label:MKT_LABELS[bDc.key]||bDc.key,
                      color:'#2BE5C5', prob:Math.round(bDc.prob) } : null,
      confidence: baseConf>=72?'high':baseConf>=58?'medium':'low',
      hasMl:hasMl, aiBoost:aiBoost, allMarkets:markets
    };
  }

  function hexToRgb(hex) {
    return parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16);
  }

  /* ── Main render ────────────────────────────────────────────────────── */
  function renderUpcomingTab() {
    var el = document.getElementById('tab-upcoming');
    if (!el || !el.classList.contains('active')) return;

    var events = Array.isArray(window.ALL_EVENTS) ? window.ALL_EVENTS : [];
    if (!events.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)">'
        + '<div style="font-size:28px;margin-bottom:10px">⏳</div>'
        + '<div>Se încarcă evenimentele…</div></div>';
      if (typeof window.loadLazyDataset === 'function')
        window.loadLazyDataset('events').then(function(){ renderUpcomingTab(); });
      return;
    }

    var predLookup = buildPredLookup();
    var today = todayIso();
    var evLookup = {};
    events.forEach(function(e){ if (e&&e.id) evLookup[String(e.id)]=e; });

    var picks    = autoSettle(loadPicks(), evLookup);
    var picksArr = Object.keys(picks).map(function(k){ return picks[k]; })
                         .sort(function(a,b){ return (a.eventDate||'')<(b.eventDate||'')?-1:1; });
    var stats = calcStats(picksArr);

    var upcoming = events.filter(function(e){ return e&&(e.event_date||'').slice(0,10)>=today; })
                         .sort(function(a,b){ return (a.event_date||'')<(b.event_date||'')?-1:1; });

    var byDate={}, dateOrder=[];
    upcoming.forEach(function(e){
      var d=(e.event_date||'').slice(0,10);
      if(!byDate[d]){byDate[d]=[];dateOrder.push(d);}
      byDate[d].push(e);
    });
    if (!_activeDate||!byDate[_activeDate]) _activeDate=dateOrder[0]||today;

    var css = '<style>'
      + '.upc-pills-wrap::-webkit-scrollbar{display:none}'
      + '.upc-save-btn{background:transparent;border:1px solid rgba(255,255,255,.15);'
      + 'border-radius:8px;padding:5px 10px;font-size:10px;color:var(--muted);cursor:pointer}'
      + '.upc-save-btn.saved{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.4);color:#22c55e}'
      + '.upc-settle{border-radius:6px;padding:4px 10px;font-size:10px;cursor:pointer;border:none;font-weight:700}'
      + '.upc-settle.win{background:rgba(34,197,94,.15);color:#22c55e}'
      + '.upc-settle.loss{background:rgba(239,68,68,.12);color:#ef4444}'
      + '</style>';

    var picksCount = picksArr.length;
    var html = css + '<div style="padding:0 0 88px">';

    /* Header */
    html += '<div style="padding:14px 14px 0">'
      + '<div style="font-size:17px;font-weight:900;color:var(--txt)">📅 Evenimente Viitoare</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:2px">'
      + upcoming.length + ' meciuri • ' + dateOrder.length + ' zile</div></div>';

    /* Sub-nav */
    var btnBase = 'flex:1;padding:7px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid ';
    var actStyle = btnBase + 'rgba(59,130,246,.4);background:rgba(59,130,246,.15);color:#60a5fa';
    var inactStyle = btnBase + 'rgba(255,255,255,.1);background:transparent;color:var(--muted)';
    html += '<div style="display:flex;gap:4px;padding:10px 14px 4px">'
      + '<button onclick="window.__veyraUpcView(\'matches\')" style="' + (_activeView==='matches'?actStyle:inactStyle) + '">📅 Meciuri</button>'
      + '<button onclick="window.__veyraUpcView(\'picks\')" style="' + (_activeView==='picks'?actStyle:inactStyle) + '">'
      + '📌 Picks' + (picksCount>0?' ('+picksCount+')':'') + '</button>'
      + '</div>';

    if (_activeView === 'matches') {
      html += renderMatchesView(dateOrder, byDate, predLookup, picks);
    } else {
      html += renderPicksView(picksArr, evLookup, stats);
    }

    html += '</div>';
    el.innerHTML = html;
  }

  /* ── Matches view ──────────────────────────────────────────────────── */
  function renderMatchesView(dateOrder, byDate, predLookup, picks) {
    var html = '';

    /* Date pills — fixed overflow */
    html += '<div class="upc-pills-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;'
      + 'scrollbar-width:none;-ms-overflow-style:none;padding:4px 0 10px">'
      + '<div style="display:inline-flex;gap:6px;padding:0 14px;min-width:max-content">';

    dateOrder.slice(0,20).forEach(function(d) {
      var act = d===_activeDate;
      html += '<button onclick="window.__veyraUpcSetDate(\'' + d + '\')" style="'
        + 'padding:6px 13px;border-radius:20px;cursor:pointer;font-size:11px;white-space:nowrap;font-weight:'
        + (act?'800':'500') + ';border:1px solid ' + (act?'#3b82f6':'rgba(255,255,255,.12)') + ';'
        + 'background:' + (act?'rgba(59,130,246,.18)':'transparent') + ';'
        + 'color:' + (act?'#60a5fa':'var(--muted)') + '">'
        + formatDateLabel(d) + ' <span style="opacity:.7">(' + byDate[d].length + ')</span></button>';
    });
    if (dateOrder.length>20)
      html += '<span style="font-size:10px;color:var(--muted);align-self:center;padding-right:4px">+'+(dateOrder.length-20)+' zile</span>';
    html += '</div></div>';

    var dayEvs  = byDate[_activeDate] || [];
    html += '<div style="padding:0 14px">';
    html += '<div style="font-size:12px;font-weight:800;color:var(--txt);margin-bottom:10px">'
      + formatDateLabel(_activeDate) + ' — ' + dayEvs.length + ' meciuri</div>';

    /* Group by league */
    var byLeague={}, lgOrder=[];
    dayEvs.forEach(function(e){ var lg=(e.league&&e.league.name)||'Altele';
      if(!byLeague[lg]){byLeague[lg]=[];lgOrder.push(lg);} byLeague[lg].push(e); });

    lgOrder.forEach(function(lgName) {
      html += '<div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;'
        + 'letter-spacing:.08em;margin:14px 0 8px;display:flex;align-items:center;gap:6px">'
        + '<span style="flex:1;border-bottom:1px solid rgba(255,255,255,.07);padding-bottom:4px">' + lgName + '</span>'
        + '<span style="color:rgba(255,255,255,.25);font-size:9px">' + byLeague[lgName].length + '</span></div>';

      byLeague[lgName].forEach(function(ev) {
        var pred    = predLookup[String(ev.id)];
        var p       = calcPrediction(ev, pred);
        var time    = formatTime(ev.event_date);
        var isSaved = !!picks[String(ev.id)];

        html += '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);'
          + 'border-radius:14px;padding:12px;margin-bottom:8px">';

        /* Time + save button */
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          + '<span style="font-size:11px;font-weight:800;color:#94a3b8">' + time + '</span>'
          + (p ? '<button class="upc-save-btn'+(isSaved?' saved':'')+'" '
             + 'onclick="window.__veyraUpcSave(\''+String(ev.id)+'\')">'
             + (isSaved ? '✓ Salvat' : '+ Salvează') + '</button>' : '')
          + '</div>';

        /* Teams */
        html += '<div style="margin-bottom:' + (p?'10px':'0') + '">'
          + '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + (ev.home_team||'?') + '</div>'
          + '<div style="font-size:10px;color:rgba(255,255,255,.25);margin:2px 0">vs</div>'
          + '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + (ev.away_team||'?') + '</div>'
          + '</div>';

        if (!p) {
          html += '<div style="font-size:10px;color:rgba(255,255,255,.2)">Date insuficiente</div>';
        } else {
          /* 1X2 probability bar */
          if (p.one!=null && p.x!=null && p.two!=null) {
            html += '<div style="display:flex;gap:4px;margin-bottom:8px">';
            [{lbl:'1',prob:p.one,col:'#22c55e',key:'home_win'},
             {lbl:'X',prob:p.x,  col:'#f59e0b',key:'draw'},
             {lbl:'2',prob:p.two,col:'#60a5fa',key:'away_win'}].forEach(function(m){
              var top = p.best.key===m.key;
              html += '<div style="flex:1;text-align:center;padding:5px 2px;border-radius:8px;'
                + 'background:'+(top?'rgba('+hexToRgb(m.col)+',.18)':'rgba(255,255,255,.04)')+';'
                + 'border:1px solid '+(top?m.col+'44':'rgba(255,255,255,.06)')+'">'
                + '<div style="font-size:9px;font-weight:700;color:'+(top?m.col:'#64748b')+'">'+m.lbl+'</div>'
                + '<div style="font-size:13px;font-weight:900;color:'+(top?m.col:'#94a3b8')+'">'+m.prob+'%</div>'
                + '</div>';
            });
            html += '</div>';
          }

          /* Best pick (non-1X2 or 1X2 context) */
          var notIn1x2 = p.best.key!=='home_win'&&p.best.key!=='draw'&&p.best.key!=='away_win';
          var confColor = p.confidence==='high'?'#22c55e':p.confidence==='medium'?'#f59e0b':'#64748b';
          var confLabel = p.confidence==='high'?'Ridicată':p.confidence==='medium'?'Medie':'Scăzută';
          var confDot   = p.confidence==='high'?'🟢':p.confidence==='medium'?'🟡':'⚪';
          var pickHeader = p.best.isSafe ? '🛡️ PARIU SIGUR' : 'PREDICȚIE';
          var pickColor  = p.best.isSafe ? '#2BE5C5' : p.best.color;

          if (notIn1x2||!p.one||p.best.isSafe) {
            html += '<div style="padding:8px 0 6px;border-top:1px solid rgba(255,255,255,.06);'
              + 'display:flex;justify-content:space-between;align-items:center">'
              + '<div><div style="font-size:9px;color:'+(p.best.isSafe?'#2BE5C5':'var(--muted)')+';margin-bottom:2px">'+pickHeader+'</div>'
              + '<div style="font-size:12px;font-weight:800;color:'+pickColor+'">'+p.best.label+'</div>'
              + (p.best.ev?'<div style="font-size:9px;color:#94a3b8">EV: +'+Number(p.best.ev).toFixed(2)+'</div>':'')
              + '</div>'
              + '<div style="text-align:right">'
              + '<div style="font-size:17px;font-weight:900;color:'+pickColor+'">'+p.best.prob+'%</div>'
              + '<div style="font-size:9px;color:'+confColor+'">'+confDot+' '+confLabel+'</div>'
              + '</div></div>';
          } else {
            html += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.06);'
              + 'display:flex;justify-content:space-between">'
              + '<span style="font-size:9px;color:var(--muted)">PREDICȚIE PRINCIPALĂ</span>'
              + '<span style="font-size:9px;color:'+confColor+'">'+confDot+' '+confLabel+'</span></div>';
          }

          /* Alternative non-safe pick when primary is DC */
          if (p.bestDc && !p.best.isSafe) {
            html += '<div style="background:rgba(43,229,197,.06);border:1px solid rgba(43,229,197,.2);'
              + 'border-radius:8px;padding:6px 10px;display:flex;justify-content:space-between;'
              + 'align-items:center;margin:4px 0 6px">'
              + '<div style="font-size:10px;font-weight:700;color:#2BE5C5">🛡️ '+p.bestDc.label+'</div>'
              + '<div style="font-size:11px;font-weight:900;color:#2BE5C5">'+p.bestDc.prob+'% '
              + '<span style="font-size:9px;opacity:.5">mai sigur</span></div></div>';
          } else if (p.bestDc && p.best.isSafe) {
            /* Primary is already DC; show ML pick as secondary if exists */
            var mlAlt = p.allMarkets.filter(function(m){
              return m.key!==p.best.key && m.key.indexOf('dc_')!==0 && m.prob>=50;
            })[0];
            if (mlAlt) {
              html += '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);'
                + 'border-radius:8px;padding:5px 10px;display:flex;justify-content:space-between;'
                + 'align-items:center;margin:4px 0 6px">'
                + '<div style="font-size:9px;color:var(--muted)">Alt. ML: '
                + '<span style="color:#94a3b8;font-weight:600">'+( MKT_LABELS[mlAlt.key]||mlAlt.key )+'</span></div>'
                + '<div style="font-size:10px;font-weight:700;color:#94a3b8">'+Math.round(mlAlt.prob)+'%</div>'
                + '</div>';
            }
          }

          /* Source + AI label */
          /* AI preview: prefer pred.ai_preview (Romanian) over ev.ai_preview.text (English BSD) */
          var aiText = (pred && pred.ai_preview) || (ev.ai_preview && ev.ai_preview.text) || '';
          html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">'
            + '<span style="font-size:9px;color:rgba(255,255,255,.2)">'+(p.hasMl?'🤖 Model ML':'📊 Cote')+'</span>'
            + (p.aiBoost?'<span style="font-size:9px;color:#a78bfa">✨ AI analizat</span>':'');
          if (aiText) {
            html += '<button onclick="window.__veyraUpcToggleAI(this)" '
              + 'data-preview="'+encodeURIComponent(aiText.slice(0,600))+'" '
              + 'style="font-size:9px;padding:2px 7px;border-radius:4px;background:rgba(167,139,250,.1);'
              + 'border:1px solid rgba(167,139,250,.3);color:#a78bfa;cursor:pointer">💬 AI Preview</button>';
          }
          html += '</div>';
        }
        html += '</div>';
      });
    });

    html += '</div>';
    return html;
  }

  /* ── Picks view ─────────────────────────────────────────────────────── */
  function renderPicksView(picksArr, evLookup, stats) {
    var html = '';

    /* Stats panel */
    html += '<div style="margin:8px 14px 10px;background:rgba(255,255,255,.03);'
      + 'border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px">'
      + '<div style="display:flex;flex-wrap:wrap">';
    [
      {lbl:'Total',     val:stats.total,   col:'var(--txt)'},
      {lbl:'Câștigate', val:stats.won,    col:'#22c55e'},
      {lbl:'Pierdute',  val:stats.lost,   col:'#ef4444'},
      {lbl:'Pending',   val:stats.pending, col:'#f59e0b'},
      {lbl:'Winrate',   val:stats.winrate!=null?stats.winrate+'%':'—',
       col:stats.winrate!=null&&stats.winrate>=55?'#22c55e':'#94a3b8'},
      {lbl:'ROI',       val:stats.roi!=null?(stats.roi>=0?'+':'')+stats.roi+'%':'—',
       col:stats.roi>0?'#22c55e':stats.roi<0?'#ef4444':'#94a3b8'}
    ].forEach(function(s){
      html += '<div style="flex:1;min-width:33%;text-align:center;padding:6px 2px">'
        + '<div style="font-size:18px;font-weight:900;color:'+s.col+'">'+s.val+'</div>'
        + '<div style="font-size:9px;color:var(--muted);margin-top:2px">'+s.lbl+'</div></div>';
    });
    html += '</div></div>';

    if (!picksArr.length) {
      html += '<div style="text-align:center;padding:32px 14px;color:var(--muted)">'
        + '<div style="font-size:24px;margin-bottom:8px">📌</div>'
        + '<div style="font-size:13px">Nicio predicție salvată încă.</div>'
        + '<div style="font-size:11px;margin-top:6px">Mergi la <strong>Meciuri</strong> '
        + 'și apasă <strong>+ Salvează</strong> pe un eveniment.</div></div>';
      return html;
    }

    html += '<div style="padding:0 14px">';
    picksArr.forEach(function(pick) {
      var scol  = pick.status==='win'?'#22c55e':pick.status==='loss'?'#ef4444':'#f59e0b';
      var slbl  = pick.status==='win'?'✓ Câștigat':pick.status==='loss'?'✗ Pierdut':'⏳ Pending';
      var ev    = evLookup[pick.eventId];
      var hasScore = ev && ev.home_score!=null && ev.away_score!=null;
      var bcol  = MKT_COLORS[pick.bestBet] || '#94a3b8';

      html += '<div style="background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);'
        + 'border-radius:12px;padding:11px;margin-bottom:8px">'
        /* top: date + status */
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '<span style="font-size:10px;color:var(--muted)">'
        + formatDateLabel((pick.eventDate||'').slice(0,10)) + ' · ' + formatTime(pick.eventDate)
        + '</span><span style="font-size:10px;font-weight:700;color:'+scol+'">'+slbl+'</span></div>'
        /* teams */
        + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px">'
        + pick.home + ' vs ' + pick.away + '</div>'
        + '<div style="font-size:10px;color:var(--muted);margin-bottom:8px">'+(pick.league||'')+'</div>'
        /* pick details */
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div><div style="font-size:9px;color:var(--muted)">PICK SALVAT</div>'
        + '<div style="font-size:12px;font-weight:800;color:'+bcol+'">'
        + (pick.bestBetLabel||MKT_LABELS[pick.bestBet]||pick.bestBet) + '</div></div>'
        + '<div style="text-align:right">'
        + (pick.odds?'<div style="font-size:15px;font-weight:900;color:'+bcol+'">@'+Number(pick.odds).toFixed(2)+'</div>':'')
        + (pick.prob?'<div style="font-size:9px;color:var(--muted)">'+pick.prob+'% prob.</div>':'')
        + '</div></div>';

      if (hasScore) {
        html += '<div style="font-size:11px;color:#64748b;margin-bottom:8px">Scor: '
          + ev.home_score + ' — ' + ev.away_score + '</div>';
      }

      /* Actions */
      if (pick.status==='pending') {
        html += '<div style="display:flex;gap:6px;align-items:center">'
          + '<button class="upc-settle win" onclick="window.__veyraUpcSettle(\''+pick.eventId+'\',\'win\')">✓ Câștigat</button>'
          + '<button class="upc-settle loss" onclick="window.__veyraUpcSettle(\''+pick.eventId+'\',\'loss\')">✗ Pierdut</button>'
          + '<button onclick="window.__veyraUpcDelete(\''+pick.eventId+'\')" '
          + 'style="margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,.12);'
          + 'border-radius:6px;padding:4px 8px;font-size:10px;color:var(--muted);cursor:pointer">🗑️</button>'
          + '</div>';
      } else {
        html += '<button onclick="window.__veyraUpcDelete(\''+pick.eventId+'\')" '
          + 'style="background:transparent;border:1px solid rgba(255,255,255,.1);'
          + 'border-radius:6px;padding:4px 8px;font-size:10px;color:var(--muted);cursor:pointer">🗑️ Șterge</button>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ── Global handlers ────────────────────────────────────────────────── */
  window.__veyraUpcSetDate = function(d) { _activeDate=d; _activeView='matches'; renderUpcomingTab(); };
  window.__veyraUpcomingSetDate = window.__veyraUpcSetDate; // backward compat

  window.__veyraUpcView = function(v) { _activeView=v; renderUpcomingTab(); };

  window.__veyraUpcSave = function(eventId) {
    var ev = (Array.isArray(window.ALL_EVENTS)?window.ALL_EVENTS:[]).filter(function(e){ return String(e.id)===String(eventId); })[0];
    if (!ev) return;
    togglePick(ev, buildPredLookup()[String(ev.id)]);
    renderUpcomingTab();
  };

  window.__veyraUpcSettle = function(eventId, outcome) {
    var picks = loadPicks();
    if (!picks[eventId]) return;
    picks[eventId].status = outcome;
    picks[eventId].resolvedAt = new Date().toISOString();
    savePicks(picks);
    renderUpcomingTab();
  };

  window.__veyraUpcDelete = function(eventId) {
    var picks = loadPicks(); delete picks[eventId]; savePicks(picks); renderUpcomingTab();
  };

  window.__veyraUpcomingToggleAI = function(btn) {
    window.__veyraUpcToggleAI(btn);
  };
  window.__veyraUpcToggleAI = function(btn) {
    var next = btn.nextElementSibling;
    if (next&&next.classList.contains('ai-preview-box')) {
      next.remove(); btn.textContent='💬 AI Preview';
    } else {
      var box = document.createElement('div');
      box.className='ai-preview-box';
      box.style.cssText='margin-top:8px;font-size:10px;line-height:1.5;color:#94a3b8;'
        + 'background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.15);border-radius:8px;padding:8px';
      box.textContent=decodeURIComponent(btn.getAttribute('data-preview')||'');
      btn.insertAdjacentElement('afterend',box);
      btn.textContent='💬 Ascunde';
    }
  };

  /* ── Init ───────────────────────────────────────────────────────────── */
  hookSwitchTab();
})();
