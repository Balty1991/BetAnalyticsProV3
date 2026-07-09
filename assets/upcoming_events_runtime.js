/**
 * upcoming_events_runtime.js v2
 * Evenimente Viitoare — predicții extinse + salvare picks + ROI/winrate tracking
 */
(function () {
  'use strict';
  if (window.__veyraUpcomingV2) return;
  window.__veyraUpcomingV2 = true;
  window.__veyraUpcomingV1 = true;

  var STORE_KEY    = 'veyra_upcoming_picks_v1';
  var _activeDate  = null;
  var _activeView  = 'matches';
  var _filterEdge  = false; // true = show only non-Avoid predictions

  /* ── Recent results (for auto-settle) ──────────────────────────── */
  var _recentResLookup = null; // null = not loaded yet
  var _recentResLoading = false;

  function ensureRecentResults(cb) {
    if (_recentResLookup !== null) { cb(); return; }
    if (_recentResLoading) return;
    _recentResLoading = true;
    fetch('./data/recent_results.json?_=' + Math.floor(Date.now() / 300000))
      .then(function(r) { return r.ok ? r.json() : []; })
      .catch(function() { return []; })
      .then(function(arr) {
        _recentResLookup = {};
        (arr || []).forEach(function(r) {
          if (r && r.id != null) _recentResLookup[String(r.id)] = r;
        });
        _recentResLoading = false;
        cb();
      });
  }

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
    if (k === 'dc_1x')         return hs >= as2;
    if (k === 'dc_x2')         return hs <= as2;
    if (k === 'dc_12')         return hs !== as2;
    if (k === 'under_25')      return hs + as2 < 2.5;
    if (k === 'under_35')      return hs + as2 < 3.5;
    if (k === 'under_15')      return hs + as2 < 1.5;
    if (k === 'home_to_score') return hs > 0;
    if (k === 'away_to_score') return as2 > 0;
    if (k === 'goal_fh')       return null;
    if (k === 'goal_sh')       return null;
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
      /* p.event.id is the event ID; p.id is the prediction row ID — must use event ID */
      var id = (p.event && p.event.id) || p.id;
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

  var PICK_DESCS = {
    home_win:      'Gazda câștigă la finalul timpului regulamentar',
    draw:          'Meciul se termină la egalitate',
    away_win:      'Oaspeții câștigă la finalul timpului regulamentar',
    dc_1x:         'Gazda câștigă sau meciul se termină la egalitate',
    dc_x2:         'Oaspeții câștigă sau meciul se termină la egalitate',
    dc_12:         'Una din echipe câștigă — egalul este exclus',
    over_25:       'Se marchează minimum 3 goluri în meci',
    over_15:       'Se marchează minimum 2 goluri în meci',
    over_35:       'Se marchează minimum 4 goluri în meci',
    under_25:      'Maximum 2 goluri în total în meci',
    under_35:      'Maximum 3 goluri în total în meci',
    btts_yes:      'Ambele echipe marchează cel puțin un gol',
    home_to_score: 'Echipa gazdă marchează cel puțin un gol',
    away_to_score: 'Echipa oaspete marchează cel puțin un gol',
    goal_fh:       'Cel puțin un gol în prima repriză',
    goal_sh:       'Cel puțin un gol în repriza a doua'
  };

  function buildPickRationale(p, pred) {
    var bm = pred && pred.best_market;
    /* ML's recommended market matches our pick → use its rationale verbatim */
    if (bm && bm.rationale && bm.market_key === p.best.key) return bm.rationale;
    var parts = [];
    var key = p.best.key;
    /* Explain the pick mathematically */
    if (key === 'dc_1x' && p.one != null && p.x != null) {
      parts.push('1X acoperă ' + p.one + '% (gazdă câștigă) + ' + p.x + '% (egal) = ' + Math.round(p.best.prob) + '% probabilitate combinată');
    } else if (key === 'dc_x2' && p.x != null && p.two != null) {
      parts.push('X2 acoperă ' + p.x + '% (egal) + ' + p.two + '% (oaspeți câștigă) = ' + Math.round(p.best.prob) + '% probabilitate combinată');
    } else if (key === 'dc_12' && p.one != null && p.two != null) {
      parts.push('12 acoperă ' + p.one + '% (gazdă) + ' + p.two + '% (oaspeți) = ' + Math.round(p.best.prob) + '%, egalul de ' + p.x + '% exclus');
    } else if (key === 'home_win' && p.one != null) {
      parts.push('Modelul ML estimează ' + p.one + '% șanse de victorie pentru gazdă față de ' + p.two + '% pentru oaspeți');
    } else if (key === 'away_win' && p.two != null) {
      parts.push('Modelul ML estimează ' + p.two + '% șanse de victorie pentru oaspeți față de ' + p.one + '% pentru gazdă');
    } else if (p.one != null) {
      parts.push('Probabilități model 1X2: ' + p.one + '% — ' + p.x + '% — ' + p.two + '%');
    }
    /* xG context */
    if (p.xgHome != null && p.xgAway != null) {
      parts.push('xG estimat: gazdă ' + p.xgHome + ' — oaspeți ' + p.xgAway);
    }
    /* ML's EV pick for extra context when it differs */
    if (bm && bm.rationale && bm.market_key !== key) {
      var firstSentence = (bm.rationale || '').split('.')[0];
      if (firstSentence) parts.push('Piața ML cu cel mai bun EV: ' + firstSentence);
    }
    return parts.join('. ') || '';
  }

  /* Estimate bookmaker odds from probability (7% vig for 2-way markets) */
  function estOdds(probPct) {
    if (!probPct || probPct <= 0) return 0;
    return Math.round(100 / probPct / 0.93 * 100) / 100;
  }

  /* Smallest goal range [0..hi] capturing ≥72% Poisson probability */
  function goalRange(xg) {
    if (!xg || xg <= 0) return { hi:0, prob:100 };
    var pk = Math.exp(-xg), cum = pk, hi = 0;
    while (cum < 0.72 && hi < 6) { hi++; pk = pk * xg / hi; cum += pk; }
    return { hi:hi, prob:Math.round(cum * 100) };
  }

  function calcPrediction(ev, pred) {
    var markets = [], hasMl = false;
    var mbo = ev.market_best_odds || {};
    /* Only show AI text if it contains Romanian diacritics (ă î ș ț â) */
    var _aiRaw  = (pred && pred.ai_preview) || '';
    var aiText  = /[ăîșțâĂÎȘȚÂ]/.test(_aiRaw) ? _aiRaw : '';
    var aiBoost = !!aiText;

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

      /* Poisson fallback when ML probs are 0 but xG is available */
      if (po25 <= 0 && xgTotal > 0) {
        var _ep25 = Math.exp(-xgTotal);
        po25 = Math.max(1, Math.round((1 - _ep25 - _ep25*xgTotal - _ep25*xgTotal*xgTotal/2) * 100));
      }
      if (po15 <= 0 && xgTotal > 0) {
        var _ep15 = Math.exp(-xgTotal);
        po15 = Math.max(1, Math.round((1 - _ep15 - _ep15*xgTotal) * 100));
      }

      function addMl(key, prob) {
        if (prob <= 0) return;
        var ro = realOdds(key);
        markets.push({ key:key, prob:prob, source:'ML', odds:ro || estOdds(prob), oddsReal:ro>0 });
      }
      addMl('home_win', ph);  addMl('draw', pd);  addMl('away_win', pa);
      addMl('over_25', po25); addMl('over_15', po15); addMl('over_35', po35);
      if (po25 > 0) addMl('under_25', 100 - po25);
      if (po35 > 0) addMl('under_35', 100 - po35);
      if (pbtts > 0) { addMl('btts_yes', pbtts); /* btts_no omis — prea generic */ }

      /* Double chance — prefer bookmaker DC odds for probability if available */
      ['dc_1x','dc_x2','dc_12'].forEach(function(key) {
        var ro = realOdds(key);
        var probFromMl = key==='dc_1x' ? Math.min(ph+pd,99) : key==='dc_x2' ? Math.min(pd+pa,99) : Math.min(ph+pa,99);
        var prob = ro > 0 ? Math.min((1/ro)*100*1.065, 99) : probFromMl;
        if (prob > 0) markets.push({ key:key, prob:prob, source:ro?'Cote':'ML', odds:ro||estOdds(probFromMl), oddsReal:ro>0 });
      });

      /* Store ML engine's best_market for pick selection */
      var _bm = pred.best_market;
      if (_bm && _bm.market_key) {
        var _eng = markets.filter(function(m){ return m.key === _bm.market_key; })[0];
        if (!_eng && typeof _bm.prob === 'number') {
          /* Market not yet in list (e.g. under_35 when xG is 0) — add from best_market */
          var _bmProb = _bm.prob <= 1 ? Math.round(_bm.prob * 100) : Math.round(_bm.prob);
          var _bmRo = realOdds(_bm.market_key);
          _eng = { key:_bm.market_key, prob:_bmProb, source:'ML',
                   odds:_bmRo || (typeof _bm.odds === 'number' ? _bm.odds : 0) || estOdds(_bmProb),
                   oddsReal:_bmRo > 0 };
          markets.push(_eng);
        }
        if (_eng) { _eng.ev = _bm.ev_pct || _bm.ev || null; _eng._mlPick = true; }
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
       Priority: 1X2 clear ≥60% → DC safe ≥68% → ML EV pick → fallback
       ML's volatile pick (BTTS/O-U) shown as info strip, not primary
    ─────────────────────────────────────────────────────────────────── */
    markets.forEach(function(m){ m.isBest=false; m.isBestDc=false; m.isMlInfo=false; });

    var bestDC = markets.filter(function(m){ return m.key.indexOf('dc_')===0; })
                        .sort(function(a,b){ return b.prob-a.prob; })[0];

    /* Clear 1X2 favorite */
    var clear1x2 = markets.filter(function(m){
      return (m.key==='home_win'||m.key==='draw'||m.key==='away_win') && m.prob >= 60;
    }).sort(function(a,b){ return b.prob-a.prob; })[0];

    /* ML engine's EV-weighted pick */
    var mlPick = markets.filter(function(m){ return m._mlPick; })[0];

    var chosen;
    if (clear1x2) {
      chosen = clear1x2;
    } else if (bestDC && bestDC.prob >= 68) {
      chosen = bestDC;
    } else if (mlPick) {
      chosen = mlPick;
    } else {
      var noDcFb = markets.filter(function(m){
        return m.key.indexOf('dc_')!==0 && m.key!=='goal_fh' && m.key!=='goal_sh';
      });
      chosen = noDcFb[0] || markets[0];
    }
    chosen.isBest = true;

    /* DC as safe alternative when primary is 1X2 or volatile */
    if (bestDC && bestDC !== chosen && bestDC.prob >= 65) {
      bestDC.isBestDc = true;
    }

    /* ML EV pick shown as info strip when it's not the primary */
    if (mlPick && mlPick !== chosen && mlPick.key.indexOf('dc_')!==0) {
      mlPick.isMlInfo = true;
    }

    var one  = markets.filter(function(m){ return m.key==='home_win'; })[0];
    var x    = markets.filter(function(m){ return m.key==='draw'; })[0];
    var two  = markets.filter(function(m){ return m.key==='away_win'; })[0];
    var best = markets.filter(function(m){ return m.isBest; })[0] || markets[0];
    var bDc  = markets.filter(function(m){ return m.isBestDc; })[0] || null;
    var isSafePick = best.key.indexOf('dc_') === 0;

    /* Per-team goal ranges from Poisson xG */
    var goalRanges = null;
    if (xgH > 0 || xgA > 0) {
      goalRanges = {
        home: xgH > 0 ? {
          name: ev.home_team || '',
          xg: Math.round(xgH * 10) / 10,
          range: goalRange(xgH),
          scoreProb: Math.round((1 - Math.exp(-xgH)) * 100)
        } : null,
        away: xgA > 0 ? {
          name: ev.away_team || '',
          xg: Math.round(xgA * 10) / 10,
          range: goalRange(xgA),
          scoreProb: Math.round((1 - Math.exp(-xgA)) * 100)
        } : null
      };
    }

    var mlInfoMkt = markets.filter(function(m){ return m.isMlInfo; })[0] || null;

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
      mlInfo: mlInfoMkt ? { key:mlInfoMkt.key, label:MKT_LABELS[mlInfoMkt.key]||mlInfoMkt.key,
                            prob:Math.round(mlInfoMkt.prob), odds:mlInfoMkt.odds||0,
                            oddsReal:mlInfoMkt.oddsReal||false, ev:mlInfoMkt.ev||null } : null,
      confidence: baseConf>=72?'high':baseConf>=58?'medium':'low',
      hasMl:hasMl, aiBoost:aiBoost, allMarkets:markets,
      goalRanges:goalRanges,
      xgHome: xgH > 0 ? Math.round(xgH*100)/100 : null,
      xgAway: xgA > 0 ? Math.round(xgA*100)/100 : null,
      mostLikelyScore: (pred && pred.poisson_metrics && pred.poisson_metrics.most_likely_score)
                       || (pred && pred.most_likely_score) || null,
      mlRiskTier: pred && pred.risk_tier ? pred.risk_tier : null,
      mlEdgePp:   pred && typeof pred.edge_pp  === 'number' ? pred.edge_pp  : null,
      mlEvPct:    pred && typeof pred.ev_pct   === 'number' ? pred.ev_pct   : null,
      mlKellyPct: pred && typeof pred.kelly_pct === 'number' ? pred.kelly_pct : null
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

    /* Overlay finished scores from recent_results.json */
    if (_recentResLookup === null) {
      ensureRecentResults(function() { renderUpcomingTab(); });
    }
    if (_recentResLookup) {
      Object.keys(_recentResLookup).forEach(function(id) {
        var r = _recentResLookup[id];
        if (!evLookup[id]) evLookup[id] = { id: Number(id) };
        evLookup[id].home_score = r.home_score;
        evLookup[id].away_score = r.away_score;
      });
    }

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
    var edgeBtnStyle = _filterEdge
      ? btnBase + 'rgba(34,197,94,.4);background:rgba(34,197,94,.15);color:#22c55e'
      : btnBase + 'rgba(255,255,255,.1);background:transparent;color:var(--muted)';
    html += '<div style="display:flex;gap:4px;padding:10px 14px 4px">'
      + '<button onclick="window.__veyraUpcView(\'matches\')" style="' + (_activeView==='matches'?actStyle:inactStyle) + '">📅 Meciuri</button>'
      + '<button onclick="window.__veyraUpcView(\'picks\')" style="' + (_activeView==='picks'?actStyle:inactStyle) + '">'
      + '📌 Picks' + (picksCount>0?' ('+picksCount+')':'') + '</button>'
      + '<button onclick="window.__veyraUpcToggleEdge()" style="' + edgeBtnStyle + '" title="Afișează doar meciuri cu edge pozitiv">⚡</button>'
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

        /* Edge filter: skip Avoid predictions when filter is active */
        var hasEdge = pred && pred.risk_tier && pred.risk_tier !== 'Avoid';
        if (_filterEdge && !hasEdge) return;

        var cardOpacity = (!hasEdge && !_filterEdge) ? '.4' : '1';
        var cardBg      = hasEdge ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.015)';
        html += '<div style="background:' + cardBg + ';border:1px solid rgba(255,255,255,' + (hasEdge ? '.08' : '.04') + ');'
          + 'border-radius:14px;padding:12px;margin-bottom:8px;opacity:' + cardOpacity + '">';

        /* Time + weather + save button */
        var temp    = ev.temperature_c != null ? Math.round(ev.temperature_c) : null;
        var wind    = ev.wind_speed    != null ? Math.round(ev.wind_speed)    : null;
        var wcode   = ev.weather_code  != null ? Number(ev.weather_code)      : null;
        var wIcon   = wcode === 0 ? '☀️' : wcode === 1 ? '🌤️' : wcode === 2 ? '⛅' :
                      wcode === 3 ? '🌧️' : wcode === 4 ? '🌨️' : wcode === 5 ? '⛈️' : null;
        var hotFlag = temp != null && temp > 30;
        var windFlag= wind != null && wind > 25;
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span style="font-size:11px;font-weight:800;color:#94a3b8">' + time + '</span>';
        if (temp != null) {
          html += '<span style="font-size:9px;color:' + (hotFlag ? '#f97316' : 'rgba(255,255,255,.3)') + ';'
            + 'display:flex;align-items:center;gap:2px" title="Temperatura: ' + temp + '°C">'
            + (wIcon ? wIcon + ' ' : '') + temp + '°'
            + (hotFlag ? '<span style="color:#f97316;font-size:8px;margin-left:1px">!</span>' : '')
            + '</span>';
        }
        if (windFlag) {
          html += '<span style="font-size:9px;color:rgba(148,163,184,.5)" title="Vânt: ' + wind + ' km/h">💨 ' + wind + '</span>';
        }
        html += '</div>'
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

          /* ── Professional pick card ──────────────────────────── */
          var pickColor = p.best.isSafe ? '#2BE5C5' : p.best.color;
          var pickRgb   = hexToRgb(pickColor);
          var isSafe    = p.best.isSafe;
          var pickDesc  = PICK_DESCS[p.best.key] || '';
          var rationale = buildPickRationale(p, pred);
          var bm2       = pred && pred.best_market;
          var bmEdge    = bm2 && typeof bm2.edge_pp === 'number' ? Math.round(bm2.edge_pp * 10) / 10 : null;
          var bmEv      = bm2 && typeof bm2.ev_pct  === 'number' ? Math.round(bm2.ev_pct  * 10) / 10 : null;
          var bmTier    = bm2 && bm2.risk_tier ? bm2.risk_tier : null;
          var tierRo    = bmTier === 'Safe' ? 'Sigur' : bmTier === 'Moderate' ? 'Moderat' : bmTier === 'High' ? 'Risc' : null;
          var tierCol   = bmTier === 'Safe' ? '#22c55e' : bmTier === 'Moderate' ? '#f59e0b' : '#ef4444';
          var oddsDisp  = p.best.odds > 0 ? (p.best.oddsReal ? '@' : '~') + Number(p.best.odds).toFixed(2) : '';

          html += '<div style="border-left:3px solid ' + pickColor + ';background:rgba(' + pickRgb + ',.05);'
            + 'border-radius:0 10px 10px 0;padding:10px 12px;margin:8px 0 6px">';

          /* header row: type label + tier badge */
          html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'
            + '<span style="font-size:9px;font-weight:800;color:rgba(' + pickRgb + ',.7);'
            + 'text-transform:uppercase;letter-spacing:.08em">'
            + (isSafe ? '🛡️ Predicție sigură' : '📊 Predicție principală') + '</span>';
          if (tierRo) {
            html += '<span style="font-size:8px;background:rgba(' + hexToRgb(tierCol) + ',.15);color:' + tierCol + ';'
              + 'padding:2px 7px;border-radius:10px;font-weight:700">' + tierRo + '</span>';
          }
          html += '</div>';

          /* pick name + description + prob + odds */
          html += '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:14px;font-weight:900;color:' + pickColor + ';line-height:1.2">' + p.best.label + '</div>';
          if (pickDesc) {
            html += '<div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:3px;line-height:1.4">' + pickDesc + '</div>';
          }
          html += '</div>'
            + '<div style="text-align:right;margin-left:12px;flex-shrink:0">'
            + '<div style="font-size:23px;font-weight:900;color:' + pickColor + ';line-height:1">' + p.best.prob + '%</div>';
          if (oddsDisp) {
            html += '<div style="font-size:10px;margin-top:3px">'
              + '<span style="color:rgba(255,255,255,.45)">' + oddsDisp + '</span>'
              + (!p.best.oddsReal ? '<span style="font-size:8px;color:rgba(255,255,255,.2)"> est.</span>' : '')
              + '</div>';
          }
          html += '</div></div>';

          /* rationale */
          if (rationale) {
            html += '<div style="margin-top:9px;padding-top:9px;border-top:1px solid rgba(' + pickRgb + ',.15)">'
              + '<div style="font-size:8px;font-weight:800;color:rgba(' + pickRgb + ',.5);'
              + 'text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">De ce această predicție?</div>'
              + '<div style="font-size:10px;color:rgba(255,255,255,.5);line-height:1.55">' + rationale + '</div>';
            if (bmEdge !== null || bmEv !== null) {
              html += '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">';
              if (bmEdge !== null) {
                html += '<span style="font-size:9px;font-weight:700;color:#4ade80">▲ +' + bmEdge + 'pp</span>'
                  + '<span style="font-size:9px;color:rgba(255,255,255,.25)">față de cota corectă</span>';
              }
              if (bmEv !== null) {
                html += '<span style="font-size:9px;color:#a78bfa;margin-left:auto">EV '
                  + (bmEv >= 0 ? '+' : '') + bmEv + '%</span>';
              }
              html += '</div>';
            }
            html += '</div>';
          }

          html += '</div>';

          /* DC safe alternative strip (compact) */
          if (p.bestDc) {
            var dcOddsStr = p.bestDc.odds > 0 ? (p.bestDc.oddsReal ? '@' : '~') + Number(p.bestDc.odds).toFixed(2) : '';
            html += '<div style="background:rgba(43,229,197,.04);border:1px solid rgba(43,229,197,.16);'
              + 'border-radius:8px;padding:7px 10px;display:flex;justify-content:space-between;'
              + 'align-items:center;margin-bottom:6px">'
              + '<div>'
              + '<div style="font-size:8px;color:rgba(43,229,197,.45);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Alternativă sigură</div>'
              + '<div style="font-size:10px;font-weight:700;color:#2BE5C5;margin-top:2px">🛡️ ' + p.bestDc.label + '</div>'
              + '</div>'
              + '<div style="text-align:right">'
              + '<div style="font-size:15px;font-weight:900;color:#2BE5C5">' + p.bestDc.prob + '%</div>'
              + (dcOddsStr ? '<div style="font-size:9px;color:rgba(43,229,197,.4)">' + dcOddsStr + '</div>' : '')
              + '</div></div>';
          }

          /* ML edge strip — alternate market with positive edge */
          if (p.mlInfo) {
            var _bmRef  = pred && pred.best_market;
            var _bmEdge2 = _bmRef && typeof _bmRef.edge_pp === 'number' ? Math.round(_bmRef.edge_pp * 10) / 10 : null;
            var mlOddsStr = p.mlInfo.odds > 0 && p.mlInfo.oddsReal ? '@' + Number(p.mlInfo.odds).toFixed(2) : '';
            html += '<div style="background:rgba(167,139,250,.04);border:1px solid rgba(167,139,250,.12);'
              + 'border-radius:8px;padding:6px 10px;display:flex;justify-content:space-between;'
              + 'align-items:center;margin-bottom:6px">'
              + '<div style="flex:1">'
              + '<div style="font-size:8px;color:rgba(167,139,250,.45);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Pick ML alternativ</div>'
              + '<div style="font-size:10px;font-weight:700;color:#a78bfa;margin-top:2px">' + (MKT_LABELS[p.mlInfo.key] || p.mlInfo.key) + '</div>'
              + '</div>'
              + '<div style="text-align:right">'
              + '<div style="font-size:13px;font-weight:900;color:#a78bfa">' + p.mlInfo.prob + '%</div>'
              + (mlOddsStr ? '<div style="font-size:9px;color:rgba(167,139,250,.4)">' + mlOddsStr + '</div>' : '')
              + (_bmEdge2 !== null ? '<div style="font-size:8px;color:#4ade80;margin-top:1px">+' + _bmEdge2 + 'pp edge</div>' : '')
              + '</div></div>';
          }

          /* ── Piețe extinse (expandable) ────────────────────────────── */
          var extMkts = p.allMarkets.filter(function(m){
            return m.key !== 'home_win' && m.key !== 'draw' && m.key !== 'away_win'
              && m.key !== p.best.key
              && m.key !== 'btts_no'
              && m.key !== 'home_to_score' && m.key !== 'away_to_score'
              && m.key !== 'goal_fh' && m.key !== 'goal_sh'
              && (m.oddsReal || m.prob >= 62)
              && m.prob >= 56;
          }).slice(0, 4);

          var hasExt = extMkts.length || p.goalRanges || p.mostLikelyScore;
          if (hasExt) {
            html += '<details style="margin-top:6px">'
              + '<summary style="list-style:none;cursor:pointer;font-size:10px;color:#64748b;'
              + 'display:flex;justify-content:space-between;align-items:center;'
              + 'padding:6px 0;border-top:1px solid rgba(255,255,255,.05)">'
              + '<span>📊 Analiză avansată</span><span>▾</span></summary>';

            html += '<div style="padding:6px 0 4px">';

            /* Per-team goal ranges — most likely score */
            if (p.goalRanges) {
              var grRows = [
                { d:p.goalRanges.home, col:'#4ade80', ico:'🏠' },
                { d:p.goalRanges.away, col:'#93c5fd', ico:'✈️' }
              ].filter(function(r){ return !!r.d; });

              if (grRows.length) {
                html += '<div style="margin-bottom:8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;overflow:hidden">'
                  + '<div style="padding:5px 8px;background:rgba(255,255,255,.04);font-size:9px;font-weight:700;'
                  + 'color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between">'
                  + '<span>Echipă</span>'
                  + '<span style="margin-left:auto;margin-right:16px">Interval goluri</span>'
                  + '<span>Marchează</span></div>';
                grRows.forEach(function(r) {
                  var gr = r.d.range;
                  var shortName = r.d.name.split(' ').slice(0,2).join(' ');
                  html += '<div style="display:flex;justify-content:space-between;align-items:center;'
                    + 'padding:6px 8px;border-top:1px solid rgba(255,255,255,.05)">'
                    + '<div style="font-size:10px;font-weight:700;color:'+r.col+';flex:1;min-width:0;'
                    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+r.ico+' '+shortName+'</div>'
                    + '<div style="font-size:11px;font-weight:900;color:'+r.col+';margin:0 12px;white-space:nowrap">'
                    + '0–'+gr.hi+' goluri</div>'
                    + '<div style="font-size:10px;font-weight:700;color:'+r.col+';white-space:nowrap">'
                    + r.d.scoreProb+'%</div>'
                    + '</div>';
                });
                if (p.mostLikelyScore) {
                  html += '<div style="padding:5px 8px;border-top:1px solid rgba(255,255,255,.05);'
                    + 'font-size:9px;color:rgba(255,255,255,.35)">Scor probabil: '
                    + '<strong style="color:#f59e0b">~'+p.mostLikelyScore+'</strong></div>';
                }
                html += '</div>';
              }
            }

            /* Extended markets */
            extMkts.forEach(function(m) {
              var mc = MKT_COLORS[m.key] || '#64748b';
              var ml = MKT_LABELS[m.key] || m.key;
              var oddsStr = m.odds > 0 ? (m.oddsReal ? '@' : '~@') + Number(m.odds).toFixed(2) : '';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;'
                + 'padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
                + '<span style="font-size:10px;font-weight:600;color:'+mc+'">'+ml+'</span>'
                + '<div style="display:flex;gap:8px;align-items:center">'
                + '<span style="font-size:11px;font-weight:900;color:'+mc+'">'+Math.round(m.prob)+'%</span>'
                + (oddsStr?'<span style="font-size:9px;color:rgba(255,255,255,.3)">'+oddsStr+'</span>':'')
                + '</div></div>';
            });

            html += '</div></details>';
          }

          /* Kelly stake recommendation + metadata footer */
          var _rawAi = (pred && pred.ai_preview) || '';
          var aiText = /[ăîșțâĂÎȘȚÂ]/.test(_rawAi) ? _rawAi : '';
          html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">';
          /* Risk tier badge */
          if (p.mlRiskTier && p.mlRiskTier !== 'Avoid') {
            var rtCol = p.mlRiskTier==='Safe'?'#22c55e':p.mlRiskTier==='Value'?'#a78bfa':'#f59e0b';
            html += '<span style="font-size:8px;background:rgba('+hexToRgb(rtCol)+',.12);color:'+rtCol+';'
              + 'padding:2px 6px;border-radius:8px;font-weight:700">' + p.mlRiskTier + '</span>';
          }
          /* Kelly recommendation */
          if (p.mlKellyPct && p.mlKellyPct > 0 && p.mlRiskTier && p.mlRiskTier !== 'Avoid') {
            html += '<span style="font-size:9px;color:rgba(255,255,255,.35)">Miză: '
              + '<span style="color:rgba(255,255,255,.6);font-weight:700">'
              + Number(p.mlKellyPct).toFixed(1) + '% bankroll</span></span>';
          }
          /* Model source */
          html += '<span style="font-size:9px;color:rgba(255,255,255,.18)">'+(p.hasMl?'🤖 ML':'📊 Cote')+'</span>';
          if (p.aiBoost) {
            html += '<span style="font-size:9px;color:#a78bfa">✨ AI</span>';
          }
          if (aiText) {
            html += '<button onclick="window.__veyraUpcToggleAI(this)" '
              + 'data-preview="'+encodeURIComponent(aiText.slice(0,600))+'" '
              + 'style="font-size:9px;padding:2px 7px;border-radius:4px;background:rgba(167,139,250,.1);'
              + 'border:1px solid rgba(167,139,250,.3);color:#a78bfa;cursor:pointer">💬 AI</button>';
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
  window.__veyraUpcToggleEdge = function() { _filterEdge = !_filterEdge; renderUpcomingTab(); };
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
