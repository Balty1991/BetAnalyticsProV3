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
    /* 1. Real bookmaker odds (market_best_odds) */
    var mbo = ev.market_best_odds || {};
    var mboMap = { home_win:'homeWin', draw:'draw', away_win:'awayWin',
                   btts_yes:'btts', btts_no:'bttsNo',
                   dc_1x:'dc1x', dc_x2:'dcx2', dc_12:'dc12',
                   over_15:'over15', over_25:'over25', over_35:'over35',
                   under_25:'under25', under_35:'under35' };
    if (mboMap[key] && mbo[mboMap[key]] && mbo[mboMap[key]].avg_odds)
      return Math.round(Number(mbo[mboMap[key]].avg_odds) * 100) / 100;
    /* 2. events.json direct odds */
    var evMap = { home_win:ev.odds_home, draw:ev.odds_draw, away_win:ev.odds_away,
                  over_15:ev.odds_over_15, over_25:ev.odds_over_25,
                  under_25:ev.odds_under_25, btts_yes:ev.odds_btts_yes, btts_no:ev.odds_btts_no };
    if (evMap[key]) return Math.round(Number(evMap[key]) * 100) / 100;
    /* 3. From allMarkets array (pre-computed in calcPrediction) */
    if (p && p.allMarkets) {
      var m = p.allMarkets.filter(function(m){ return m.key===key; })[0];
      if (m && m.odds) return m.odds;
    }
    /* 4. Estimate from ML probability */
    if (p) {
      var ph = (p.one||0)/100, pd2 = (p.x||0)/100, pa = (p.two||0)/100;
      if (key==='dc_1x' && ph+pd2>0) return Math.round(100/(ph+pd2)/0.93*100)/100;
      if (key==='dc_x2' && pd2+pa>0) return Math.round(100/(pd2+pa)/0.93*100)/100;
      if (key==='dc_12' && ph+pa>0)  return Math.round(100/(ph+pa)/0.93*100)/100;
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
    if (k === 'dc_1x')        return hs >= as2;
    if (k === 'dc_x2')        return hs <= as2;
    if (k === 'dc_12')        return hs !== as2;
    if (k === 'home_to_score') return hs > 0;
    if (k === 'away_to_score') return as2 > 0;
    if (k === 'goal_fh')      return null; // requires ht score — manual settle
    if (k === 'goal_sh')      return null; // requires ht score — manual settle
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
    home_win:'1 — Victorie gazdă', draw:'X — Egal', away_win:'2 — Victorie oaspete',
    over_15:'Peste 1.5 goluri', over_25:'Peste 2.5 goluri', over_35:'Peste 3.5 goluri',
    under_25:'Sub 2.5 goluri',  under_35:'Sub 3.5 goluri',
    btts_yes:'Ambele marchează', btts_no:'Min. o echipă nu marchează',
    dc_1x:'Șansă dublă 1X', dc_x2:'Șansă dublă X2', dc_12:'Șansă dublă 12',
    home_to_score:'Gazda marchează', away_to_score:'Oaspeții marchează',
    goal_fh:'Gol prima repriță',    goal_sh:'Gol a doua repriță',
    no_goal_fh:'Fără gol prima rep.'
  };
  var MKT_COLORS = {
    home_win:'#22c55e', draw:'#f59e0b', away_win:'#60a5fa',
    over_15:'#a78bfa',  over_25:'#a78bfa', over_35:'#a78bfa',
    under_25:'#34d399', under_35:'#34d399',
    btts_yes:'#f472b6', btts_no:'#94a3b8',
    dc_1x:'#2BE5C5', dc_x2:'#2BE5C5', dc_12:'#2BE5C5',
    home_to_score:'#4ade80', away_to_score:'#93c5fd',
    goal_fh:'#fbbf24', goal_sh:'#fb923c', no_goal_fh:'#64748b'
  };

  /* Estimate bookmaker odds from probability (7% vig for 2-way markets) */
  function estOdds(probPct) {
    if (!probPct || probPct <= 0) return 0;
    return Math.round(100 / probPct / 0.93 * 100) / 100;
  }

  function calcPrediction(ev, pred) {
    var markets = [], hasMl = false;
    var mbo = ev.market_best_odds || {};
    /* Romanian (Claude) preferred; English BSD text shown but not boosted */
    var aiTextRo = (pred && pred.ai_preview) || '';
    var aiText   = aiTextRo || (ev.ai_preview && ev.ai_preview.text) || '';
    var aiBoost  = !!aiTextRo;

    /* xG for derived markets */
    var xgH = pred ? Number(pred.expected_home_goals || 0) : 0;
    var xgA = pred ? Number(pred.expected_away_goals || 0) : 0;
    var xgTotal = xgH + xgA;

    /* Helper: real bookmaker odds for a key (from market_best_odds or events.json) */
    function realOdds(key) {
      var mboKey = { home_win:'homeWin', draw:'draw', away_win:'awayWin',
                     btts_yes:'btts', btts_no:'bttsNo',
                     dc_1x:'dc1x', dc_x2:'dcx2', dc_12:'dc12',
                     over_15:'over15', over_25:'over25', over_35:'over35',
                     under_25:'under25', under_35:'under35' }[key];
      if (mboKey && mbo[mboKey] && mbo[mboKey].avg_odds) return Number(mbo[mboKey].avg_odds);
      var evKey = { home_win:'odds_home', draw:'odds_draw', away_win:'odds_away',
                    over_15:'odds_over_15', over_25:'odds_over_25', over_35:'odds_over_35',
                    under_25:'odds_under_25', btts_yes:'odds_btts_yes', btts_no:'odds_btts_no' }[key];
      if (evKey && ev[evKey]) return Number(ev[evKey]);
      return 0;
    }

    if (pred) {
      hasMl = true;
      var ph = Number(pred.prob_home_win||0), pd = Number(pred.prob_draw||0),
          pa = Number(pred.prob_away_win||0), po25 = Number(pred.prob_over_25||0),
          po15 = Number(pred.prob_over_15||0), po35 = Number(pred.prob_over_35||0),
          pbtts = Number(pred.prob_btts_yes||0);

      function addMl(key, prob) {
        if (prob <= 0) return;
        var ro = realOdds(key);
        markets.push({ key:key, prob:prob, source:'ML', odds:ro || estOdds(prob), oddsReal:ro>0 });
      }
      addMl('home_win', ph);  addMl('draw', pd);  addMl('away_win', pa);
      addMl('over_25', po25); addMl('over_15', po15); addMl('over_35', po35);
      if (pbtts > 0) { addMl('btts_yes', pbtts); addMl('btts_no', 100-pbtts); }

      /* Double chance — prefer bookmaker DC odds for probability if available */
      ['dc_1x','dc_x2','dc_12'].forEach(function(key) {
        var ro = realOdds(key);
        var probFromMl = key==='dc_1x' ? Math.min(ph+pd,99) : key==='dc_x2' ? Math.min(pd+pa,99) : Math.min(ph+pa,99);
        var prob = ro > 0 ? Math.min((1/ro)*100*1.065, 99) : probFromMl;
        if (prob > 0) markets.push({ key:key, prob:prob, source:ro?'Cote':'ML', odds:ro||estOdds(probFromMl), oddsReal:ro>0 });
      });

      /* Store ML engine's best_market key for selection below */
      var _bm = pred.best_market;
      if (_bm && _bm.market_key) {
        var _eng = markets.filter(function(m){ return m.key === _bm.market_key; })[0];
        if (_eng) { _eng.ev = _bm.ev || null; _eng._mlPick = true; }
      }

    } else if (ev.odds_home && ev.odds_draw && ev.odds_away) {
      var inv1 = 1/Number(ev.odds_home), invX = 1/Number(ev.odds_draw), inv2 = 1/Number(ev.odds_away);
      var tot  = inv1 + invX + inv2;
      var ph2 = (inv1/tot)*100, pd2 = (invX/tot)*100, pa2 = (inv2/tot)*100;
      function addCote(key, prob) {
        var ro = realOdds(key);
        markets.push({ key:key, prob:prob, source:'Cote', odds:ro||Number(ev['odds_'+key.replace('home_win','home').replace('away_win','away').replace('draw','draw')])||estOdds(prob), oddsReal:ro>0 });
      }
      addCote('home_win', ph2); addCote('draw', pd2); addCote('away_win', pa2);
      ['dc_1x','dc_x2','dc_12'].forEach(function(key) {
        var ro = realOdds(key);
        var prob = ro > 0 ? Math.min((1/ro)*100*1.065,99) :
          key==='dc_1x'?Math.min(ph2+pd2,99):key==='dc_x2'?Math.min(pd2+pa2,99):Math.min(ph2+pa2,99);
        markets.push({ key:key, prob:prob, source:ro?'Cote':'Est', odds:ro||estOdds(prob), oddsReal:ro>0 });
      });
      if (ev.odds_over_25) { var ro25=realOdds('over_25'); markets.push({key:'over_25',prob:(1/(Number(ev.odds_over_25)*tot/inv1))||45,source:'Cote',odds:ro25||Number(ev.odds_over_25),oddsReal:ro25>0}); }
      if (ev.odds_btts_yes) {
        var pb = (1/Number(ev.odds_btts_yes))*100;
        var rob = realOdds('btts_yes');
        markets.push({key:'btts_yes',prob:Math.min(pb*1.05,92),source:'Cote',odds:rob||Number(ev.odds_btts_yes),oddsReal:rob>0});
        markets.push({key:'btts_no',prob:Math.max(100-pb*1.05,8),source:'Cote',odds:realOdds('btts_no')||estOdds(100-pb*1.05),oddsReal:false});
      }
    }

    /* ── New markets from xG (Poisson model) ────────────────────── */
    if (xgH > 0) {
      var pHS = Math.round((1 - Math.exp(-xgH)) * 100);
      markets.push({ key:'home_to_score', prob:pHS, source:'xG', odds:estOdds(pHS), oddsReal:false, category:'goals' });
    }
    if (xgA > 0) {
      var pAS = Math.round((1 - Math.exp(-xgA)) * 100);
      markets.push({ key:'away_to_score', prob:pAS, source:'xG', odds:estOdds(pAS), oddsReal:false, category:'goals' });
    }
    if (xgTotal > 0) {
      var pFH = Math.round((1 - Math.exp(-xgTotal * 0.43)) * 100);
      var pSH = Math.round((1 - Math.exp(-xgTotal * 0.57)) * 100);
      markets.push({ key:'goal_fh', prob:pFH, source:'xG', odds:estOdds(pFH), oddsReal:false, category:'half' });
      markets.push({ key:'goal_sh', prob:pSH, source:'xG', odds:estOdds(pSH), oddsReal:false, category:'half' });
    }

    if (!markets.length) return null;
    /* Remove duplicates (prefer higher-prob entry per key) */
    var seen = {};
    markets = markets.filter(function(m){
      if (seen[m.key] && seen[m.key].prob >= m.prob) return false;
      seen[m.key] = m; return true;
    });
    markets.sort(function(a,b){ return b.prob - a.prob; });

    /* ── Pick selection ─────────────────────────────────────────────────
       Strategy: primary = ML engine pick OR best non-DC market (variety)
                 DC always shown as "PARIU SIGUR" alternative
    ─────────────────────────────────────────────────────────────────── */
    markets.forEach(function(m){ m.isBest=false; m.isBestDc=false; });

    var bestDC = markets.filter(function(m){ return m.key.indexOf('dc_')===0; })
                        .sort(function(a,b){ return b.prob-a.prob; })[0];

    /* ML engine's recommended pick (already has _mlPick flag + EV) */
    var mlPick = markets.filter(function(m){ return m._mlPick; })[0];

    /* Non-DC, non-half markets sorted by prob */
    var nonDcMkts = markets.filter(function(m){
      return m.key.indexOf('dc_')!==0 && m.key!=='goal_fh' && m.key!=='goal_sh';
    });

    var chosen;
    if (mlPick && mlPick.key.indexOf('dc_')!==0) {
      /* Trust ML engine's EV pick as primary */
      chosen = mlPick;
    } else if (nonDcMkts.length > 0) {
      /* Highest-prob non-DC market (gives variety: home_win, away_win, over_25…) */
      chosen = nonDcMkts[0];
    } else {
      chosen = bestDC || markets[0];
    }
    chosen.isBest = true;

    /* DC always shown as safe alternative when it's not the primary and prob ≥65% */
    if (bestDC && bestDC !== chosen && bestDC.prob >= 65) {
      bestDC.isBestDc = true;
    }

    var one  = markets.filter(function(m){ return m.key==='home_win'; })[0];
    var x    = markets.filter(function(m){ return m.key==='draw'; })[0];
    var two  = markets.filter(function(m){ return m.key==='away_win'; })[0];
    var best = markets.filter(function(m){ return m.isBest; })[0] || markets[0];
    var bDc  = markets.filter(function(m){ return m.isBestDc; })[0] || null;
    var isSafePick = best.key.indexOf('dc_') === 0;

    /* Goal intervals per team (Poisson + goal distribution 43%/57% by half) */
    var goalIntervals = null;
    if (xgH > 0 && xgA > 0) {
      goalIntervals = {
        homeFH: Math.round((1 - Math.exp(-xgH * 0.43)) * 100),
        homeSH: Math.round((1 - Math.exp(-xgH * 0.57)) * 100),
        awayFH: Math.round((1 - Math.exp(-xgA * 0.43)) * 100),
        awaySH: Math.round((1 - Math.exp(-xgA * 0.57)) * 100)
      };
    }

    /* Confidence: DC picks score higher due to structural safety */
    var baseConf = best.prob + (hasMl?5:0) + (aiBoost?3:0) + (isSafePick?6:0);
    return {
      one: one ? Math.round(one.prob) : null,
      x:   x   ? Math.round(x.prob)  : null,
      two: two  ? Math.round(two.prob): null,
      best: { key:best.key, label:MKT_LABELS[best.key]||best.key,
              color:MKT_COLORS[best.key]||'#94a3b8', prob:Math.round(best.prob),
              source:best.source, ev:best.ev||null, isSafe:isSafePick,
              odds:best.odds||0, oddsReal:best.oddsReal||false },
      bestDc: bDc ? { key:bDc.key, label:MKT_LABELS[bDc.key]||bDc.key,
                      color:'#2BE5C5', prob:Math.round(bDc.prob),
                      odds:bDc.odds||0, oddsReal:bDc.oddsReal||false } : null,
      confidence: baseConf>=72?'high':baseConf>=58?'medium':'low',
      hasMl:hasMl, aiBoost:aiBoost, allMarkets:markets,
      goalIntervals:goalIntervals,
      xgHome: xgH > 0 ? Math.round(xgH*100)/100 : null,
      xgAway: xgA > 0 ? Math.round(xgA*100)/100 : null,
      mostLikelyScore: pred && pred.most_likely_score || null
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
            var oddsDisplay = p.best.odds > 0 ? '<span style="font-size:10px;font-weight:700;color:rgba(255,255,255,.4)">'+(p.best.oddsReal?'@':'~@')+Number(p.best.odds).toFixed(2)+'</span>' : '';
            html += '<div style="padding:8px 0 6px;border-top:1px solid rgba(255,255,255,.06);'
              + 'display:flex;justify-content:space-between;align-items:center">'
              + '<div><div style="font-size:9px;color:'+(p.best.isSafe?'#2BE5C5':'var(--muted)')+';margin-bottom:2px">'+pickHeader+'</div>'
              + '<div style="font-size:12px;font-weight:800;color:'+pickColor+'">'+p.best.label+'</div>'
              + (p.best.ev?'<div style="font-size:9px;color:#94a3b8">EV: +'+Number(p.best.ev).toFixed(2)+'</div>':'')
              + '</div>'
              + '<div style="text-align:right">'
              + '<div style="font-size:17px;font-weight:900;color:'+pickColor+'">'+p.best.prob+'%</div>'
              + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px">'
              + (oddsDisplay||'')+'<span style="font-size:9px;color:'+confColor+'">'+confDot+' '+confLabel+'</span></div>'
              + '</div></div>';
          } else {
            html += '<div style="padding:6px 0;border-top:1px solid rgba(255,255,255,.06);'
              + 'display:flex;justify-content:space-between">'
              + '<span style="font-size:9px;color:var(--muted)">PREDICȚIE PRINCIPALĂ</span>'
              + '<span style="font-size:9px;color:'+confColor+'">'+confDot+' '+confLabel+'</span></div>';
          }

          /* Alternative non-safe pick when primary is DC */
          if (p.bestDc && !p.best.isSafe) {
            var dcOddsStr = p.bestDc.odds > 0 ? ' <span style="font-size:9px;opacity:.5">'+(p.bestDc.oddsReal?'@':'~@')+Number(p.bestDc.odds).toFixed(2)+'</span>' : '';
            html += '<div style="background:rgba(43,229,197,.06);border:1px solid rgba(43,229,197,.2);'
              + 'border-radius:8px;padding:6px 10px;display:flex;justify-content:space-between;'
              + 'align-items:center;margin:4px 0 6px">'
              + '<div style="font-size:10px;font-weight:700;color:#2BE5C5">🛡️ '+p.bestDc.label+'</div>'
              + '<div style="font-size:11px;font-weight:900;color:#2BE5C5">'+p.bestDc.prob+'%'+dcOddsStr+'</div></div>';
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
          /* ── Piețe extinse (expandable) ────────────────────────────── */
          var extMkts = p.allMarkets.filter(function(m){
            return m.key!=='home_win'&&m.key!=='draw'&&m.key!=='away_win'&&m.key!==p.best.key;
          }).slice(0, 10);

          if (extMkts.length || p.goalIntervals || p.mostLikelyScore || p.xgHome) {
            var extId = 'ext_' + String(ev.id);
            html += '<details style="margin-top:6px">'
              + '<summary style="list-style:none;cursor:pointer;font-size:10px;color:#64748b;'
              + 'display:flex;justify-content:space-between;align-items:center;'
              + 'padding:6px 0;border-top:1px solid rgba(255,255,255,.05)">'
              + '<span>📊 Piețe extinse (' + extMkts.length + ')</span><span>▾</span></summary>';

            html += '<div style="padding:6px 0 4px">';

            /* xG + most likely score row */
            if (p.xgHome !== null && p.xgAway !== null) {
              html += '<div style="display:flex;gap:8px;margin-bottom:8px;font-size:10px;'
                + 'background:rgba(255,255,255,.03);border-radius:8px;padding:6px 8px">'
                + '<span style="color:var(--muted)">xG:</span>'
                + '<span style="color:#22c55e;font-weight:700">' + p.xgHome + '</span>'
                + '<span style="color:rgba(255,255,255,.2)">vs</span>'
                + '<span style="color:#60a5fa;font-weight:700">' + p.xgAway + '</span>'
                + (p.mostLikelyScore ? '<span style="margin-left:auto;color:#f59e0b;font-weight:700">~' + p.mostLikelyScore + '</span>' : '')
                + '</div>';
            }

            /* Goal intervals table */
            if (p.goalIntervals) {
              var gi = p.goalIntervals;
              html += '<div style="margin-bottom:8px;border:1px solid rgba(255,255,255,.07);'
                + 'border-radius:8px;overflow:hidden">'
                + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;'
                + 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;'
                + 'background:rgba(255,255,255,.04);color:var(--muted)">'
                + '<div style="padding:5px 6px">Echipă</div>'
                + '<div style="padding:5px 6px;text-align:center">Rep. 1</div>'
                + '<div style="padding:5px 6px;text-align:center">Rep. 2</div></div>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:10px">'
                + '<div style="padding:5px 6px;font-weight:700;color:#4ade80;font-size:9px;'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🏠 ' + (ev.home_team||'').split(' ')[0] + '</div>'
                + '<div style="padding:5px 6px;text-align:center;color:#4ade80;font-weight:800">' + gi.homeFH + '%</div>'
                + '<div style="padding:5px 6px;text-align:center;color:#4ade80;font-weight:800">' + gi.homeSH + '%</div>'
                + '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:10px;'
                + 'border-top:1px solid rgba(255,255,255,.05)">'
                + '<div style="padding:5px 6px;font-weight:700;color:#93c5fd;font-size:9px;'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">✈️ ' + (ev.away_team||'').split(' ')[0] + '</div>'
                + '<div style="padding:5px 6px;text-align:center;color:#93c5fd;font-weight:800">' + gi.awayFH + '%</div>'
                + '<div style="padding:5px 6px;text-align:center;color:#93c5fd;font-weight:800">' + gi.awaySH + '%</div>'
                + '</div></div>';
            }

            /* All extended markets with odds */
            extMkts.forEach(function(m) {
              var mc = MKT_COLORS[m.key] || '#64748b';
              var ml = MKT_LABELS[m.key] || m.key;
              var oddsStr = m.odds > 0 ? (m.oddsReal ? '@' : '~@') + Number(m.odds).toFixed(2) : '';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;'
                + 'padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
                + '<div><span style="font-size:10px;font-weight:600;color:' + mc + '">' + ml + '</span>'
                + (m.source==='xG'||m.source==='Est'?'<span style="font-size:8px;color:rgba(255,255,255,.2);margin-left:4px">(' + m.source + ')</span>':'')
                + '</div>'
                + '<div style="display:flex;gap:8px;align-items:center">'
                + '<span style="font-size:11px;font-weight:900;color:' + mc + '">' + Math.round(m.prob) + '%</span>'
                + (oddsStr?'<span style="font-size:9px;color:rgba(255,255,255,.3)">' + oddsStr + '</span>':'')
                + '</div></div>';
            });

            html += '</div></details>';
          }

          /* AI preview: Romanian (Claude) preferred; English BSD as fallback */
          var aiText = (pred && pred.ai_preview) || (ev.ai_preview && ev.ai_preview.text) || '';
          html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">'
            + '<span style="font-size:9px;color:rgba(255,255,255,.2)">'+(p.hasMl?'🤖 Model ML':'📊 Cote')+'</span>'
            + (p.aiBoost?'<span style="font-size:9px;color:#a78bfa">✨ AI analizat</span>':'');
          if (aiText) {
            html += '<button onclick="window.__veyraUpcToggleAI(this)" '
              + 'data-preview="'+encodeURIComponent(aiText.slice(0,600))+'" '
              + 'style="font-size:9px;padding:2px 7px;border-radius:4px;background:rgba(167,139,250,.1);'
              + 'border:1px solid rgba(167,139,250,.3);color:#a78bfa;cursor:pointer">💬 Analiză AI</button>';
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
      next.remove(); btn.textContent='💬 Analiză AI';
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
