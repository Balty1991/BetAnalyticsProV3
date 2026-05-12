(function(){
'use strict';

if(window.__VeyraBetSafeRuntimeV7) return;
window.__VeyraBetSafeRuntimeV7 = true;

var W = window;
var D = document;
var STORAGE = 'veyra_bet_safe_state_v2';
var HISTORY_STORAGE = 'veyra_bet_safe_history_v2';
var VIP_LOCK_STORAGE = 'veyra_bet_safe_vip_daily_lock_v3';
var state = readState();

function readState(){
  try{
    var raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    return {
      dayMode: raw.dayMode === 'tomorrow' ? 'tomorrow' : 'today',
      view: raw.view === 'ultra' ? 'ultra' : 'all',
      screen: raw.screen === 'history' ? 'history' : 'live',
      historyDay: raw.historyDay || dayKeyFromDate(new Date())
    };
  }catch(e){ return {dayMode:'today', view:'all', screen:'live', historyDay:dayKeyFromDate(new Date())}; }
}
function saveState(){
  try{ localStorage.setItem(STORAGE, JSON.stringify(state)); }catch(e){}
}
function esc(v){
  if(typeof W.htmlEsc === 'function'){
    try{ return W.htmlEsc(v); }catch(e){}
  }
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function n(v, fallback){
  if(typeof v === 'string') v = v.replace(',', '.').trim();
  var x = Number(v);
  return isFinite(x) ? x : (fallback || 0);
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function pct(v,d){ return n(v,0).toFixed(d == null ? 1 : d) + '%'; }
function odds(v){
  var o = n(v,0);
  if(!o || o < 1.01) return '—';
  return o.toFixed(2);
}
function fairOddsFromProb(prob){
  var p = clamp(n(prob,0), 1, 99.9);
  return +(100 / p).toFixed(2);
}

function impliedProbFromOddsLocal(od){
  var o = n(od,0);
  return o > 1.01 ? clamp(100 / o, 1, 99.7) : 0;
}
function rawEventOf(m){
  if(!m || typeof m !== 'object') return {};
  return (m.event && typeof m.event === 'object') ? m.event : ((m.rawEvent && typeof m.rawEvent === 'object') ? m.rawEvent : {});
}
function marketMapOf(m){
  var ev = rawEventOf(m);
  var map = (m && (m.market_best_odds || m.marketBestOdds || m.market_compare || m.marketCompare)) ||
            (ev && (ev.market_best_odds || ev.marketBestOdds || ev.market_compare || ev.marketCompare)) || {};
  return (map && typeof map === 'object' && !Array.isArray(map)) ? map : {};
}
function marketInfoByKeys(m, keys){
  var map = marketMapOf(m);
  for(var i=0;i<(keys||[]).length;i++){
    var row = map[keys[i]];
    if(row && typeof row === 'object'){
      var bo = n(row.best_odds != null ? row.best_odds : row.bestOdds,0);
      var ao = n(row.avg_odds != null ? row.avg_odds : row.avgOdds,0);
      var od = bo > 1.01 ? bo : ao;
      if(od > 1.01){
        return {
          odds:+od.toFixed(3),
          source:(row.best_bookmaker || row.bestBookmaker || 'API/odds'),
          implied:n(row.avg_implied_probability != null ? row.avg_implied_probability : row.avgImpliedProbability,0) || n(row.best_implied_probability != null ? row.best_implied_probability : row.bestImpliedProbability,0) || impliedProbFromOddsLocal(od),
          real:true,
          key:keys[i]
        };
      }
    }
  }
  return null;
}
function directOddsByKeys(m, keys){
  var ev = rawEventOf(m);
  var objs = [m || {}, ev || {}];
  for(var oi=0; oi<objs.length; oi++){
    var obj = objs[oi];
    for(var i=0;i<(keys||[]).length;i++){
      var od = n(obj[keys[i]],0);
      if(od > 1.01 && od < 20) return {odds:+od.toFixed(3), source:'cotă API', implied:impliedProbFromOddsLocal(od), real:true, key:keys[i]};
    }
  }
  return null;
}
function findFlatOddsByHints(m, positiveHints, negativeHints){
  var ev = rawEventOf(m);
  var objs = [m || {}, ev || {}];
  var best = null;
  function okKey(k){
    var key = String(k || '').toLowerCase().replace(/[^a-z0-9]+/g,'_');
    if(key.indexOf('odds') < 0 && key.indexOf('odd') < 0) return false;
    for(var i=0;i<(positiveHints||[]).length;i++) if(key.indexOf(positiveHints[i]) < 0) return false;
    for(var j=0;j<(negativeHints||[]).length;j++) if(key.indexOf(negativeHints[j]) >= 0) return false;
    return true;
  }
  objs.forEach(function(obj){
    Object.keys(obj || {}).forEach(function(k){
      if(!okKey(k)) return;
      var od = n(obj[k],0);
      if(od > 1.01 && od < 3.0 && (!best || od < best.odds)) best = {odds:+od.toFixed(3), source:'cotă API detectată', implied:impliedProbFromOddsLocal(od), real:true, key:k};
    });
  });
  return best;
}
function marketAdjustedProb(modelProb, marketInfo, haircut){
  var p = clamp(n(modelProb,0), 0, 99.5);
  if(!marketInfo || !(marketInfo.odds > 1.01)) return p;
  var imp = n(marketInfo.implied,0) || impliedProbFromOddsLocal(marketInfo.odds);
  var factor = haircut != null ? haircut : (marketInfo.odds <= 1.12 ? 0.965 : (marketInfo.odds <= 1.20 ? 0.94 : (marketInfo.odds <= 1.28 ? 0.90 : 0.86)));
  return clamp(Math.max(p, imp * factor), 0, 99.5);
}
function getTeamO05MarketQuote(m, side, xgProb){
  var home = side === 'home';
  var direct = directOddsByKeys(m, home ? [
    'odds_home_over_05','odds_home_o05','odds_home_team_over_05','odds_home_team_goals_over_05','odds_home_total_goals_over_05','home_over_05_odds','home_team_over_05_odds','home_team_goals_over_05_odds','home_to_score_odds','odds_home_scores'
  ] : [
    'odds_away_over_05','odds_away_o05','odds_away_team_over_05','odds_away_team_goals_over_05','odds_away_total_goals_over_05','away_over_05_odds','away_team_over_05_odds','away_team_goals_over_05_odds','away_to_score_odds','odds_away_scores'
  ]);
  if(!direct){
    direct = findFlatOddsByHints(m, home ? ['home','over','05'] : ['away','over','05'], home ? ['away'] : ['home']);
  }
  if(direct){
    direct.prob = marketAdjustedProb(xgProb, direct, 0.965);
    direct.label = 'cotă API team goals';
    return direct;
  }

  // Dacă API-ul nu oferă piața „goluri echipă”, NU mai folosim fair odds 100/prob pur.
  // Pentru piețele foarte mici, fair odds din model iese artificial mare (ex. 1.18 vs 1.05 Superbet).
  // Calibrăm estimarea cu piețele reale disponibile: 1X/X2, Over 1.5 și 1X2.
  var dc = marketInfoByKeys(m, home ? ['dc1x','homeOrDraw','doubleChance1X'] : ['dcx2','awayOrDraw','doubleChanceX2']);
  var o15 = marketInfoByKeys(m, ['over15','over_15','totalOver15']);
  var win = marketInfoByKeys(m, home ? ['homeWin','home','1'] : ['awayWin','away','2']);
  var p = clamp(n(xgProb,0), 0, 99.5);
  if(dc && dc.odds <= 1.22){
    var dcHaircut = (p >= 82 && dc.odds <= 1.12) ? 0.995 : 0.985;
    p = Math.max(p, n(dc.implied,0) * dcHaircut);
  }
  if(o15 && o15.odds <= 1.22) p = Math.max(p, n(o15.implied,0) * 0.955);
  if(win && win.odds <= 1.55) p = Math.max(p, n(win.implied,0) * 0.985);
  p = clamp(p, 0, 98.8);
  var estimatedOdds = fairOddsFromProb(p);
  // rotunjire realistă pentru low-odds: în practică bookmakerul nu afișează 1.083, ci 1.08/1.07/1.05.
  if(estimatedOdds <= 1.12) estimatedOdds = Math.max(1.03, Math.round(estimatedOdds * 100) / 100);
  return {
    odds:+estimatedOdds.toFixed(2),
    prob:+p.toFixed(2),
    real:false,
    source:'estimare calibrată din piață',
    label:'estimare xG + odds reale',
    key:home ? 'home_o05_est' : 'away_o05_est'
  };
}

function dayKeyFromDate(d){
  var x = d ? new Date(d) : new Date();
  if(!isFinite(x.getTime())) x = new Date();
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
}
function targetDayKey(){
  var d = new Date();
  if(state.dayMode === 'tomorrow') d.setDate(d.getDate()+1);
  return dayKeyFromDate(d);
}
function dateLabelForKey(key){
  var parts = String(key || '').split('-').map(Number);
  var d = parts.length === 3 ? new Date(parts[0], parts[1]-1, parts[2]) : new Date();
  if(!isFinite(d.getTime())) d = new Date();
  var roDays = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
  return roDays[d.getDay()] + ' · ' + d.toLocaleDateString('ro-RO', {day:'2-digit', month:'short', year:'numeric'});
}
function shortDateLabel(key){
  var parts = String(key || '').split('-').map(Number);
  var d = parts.length === 3 ? new Date(parts[0], parts[1]-1, parts[2]) : new Date();
  if(!isFinite(d.getTime())) d = new Date();
  return d.toLocaleDateString('ro-RO', {day:'2-digit', month:'2-digit'});
}
function eventMs(m){
  var raw = m && (m.date || m.event_date || m.eventDate || m.start_time || m.kickoff || m.created_at || '');
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function matchDateKey(m){
  if(m && m.dateKey) return String(m.dateKey);
  var raw = m && (m.date || m.event_date || m.eventDate || m.start_time || m.kickoff || m.created_at || '');
  if(typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  var ms = eventMs(m);
  return ms ? dayKeyFromDate(new Date(ms)) : '';
}
function statusText(m){ return String((m && (m.status || m.matchStatus || m.period)) || '').toLowerCase(); }
function isVoidStatus(s){
  s = String(s || '').toLowerCase();
  return ['cancelled','canceled','postponed','abandoned','void','anulat'].indexOf(s) >= 0;
}
function isFinishedStatus(s){
  s = String(s || '').toLowerCase();
  return ['finished','ft','aet','pen','after_penalties','completed','closed','final','ended'].indexOf(s) >= 0;
}
function isFinished(m){ return isFinishedStatus(statusText(m)); }
function isUpcomingEnough(m){
  if(!m || isFinished(m) || isVoidStatus(statusText(m))) return false;
  var ms = eventMs(m);
  if(!ms) return true;
  return ms > Date.now() - 90 * 60000;
}
function countryFlag(country){
  var c = String(country || '').toLowerCase();
  var map = {
    romania:'🇷🇴', england:'🏴', spain:'🇪🇸', italy:'🇮🇹', germany:'🇩🇪', france:'🇫🇷', netherlands:'🇳🇱', portugal:'🇵🇹', belgium:'🇧🇪', denmark:'🇩🇰', norway:'🇳🇴', sweden:'🇸🇪', turkey:'🇹🇷', saudi:'🇸🇦', 'saudi arabia':'🇸🇦', indonesia:'🇮🇩', canada:'🇨🇦', ireland:'🇮🇪', bolivia:'🇧🇴', brazil:'🇧🇷', argentina:'🇦🇷', usa:'🇺🇸', 'united states':'🇺🇸', japan:'🇯🇵', china:'🇨🇳', scotland:'🏴', wales:'🏴'
  };
  Object.keys(map).some(function(k){ if(c.indexOf(k) >= 0){ c = map[k]; return true; } return false; });
  return c.length <= 4 && /[\uD800-\uDBFF]/.test(c) ? c : '🏳️';
}
function leagueLabel(m){
  var flag = countryFlag(m && m.country);
  var l = (m && m.league) || 'Liga necunoscută';
  return flag + ' ' + l;
}
function scorePairFromSource(src){
  if(!src) return {homeScore:null, awayScore:null};
  var h = src.homeScore; if(h == null) h = src.home_score; if(h == null) h = src.home_goals; if(h == null) h = src.score_home; if(h == null) h = src.goals_home;
  var a = src.awayScore; if(a == null) a = src.away_score; if(a == null) a = src.away_goals; if(a == null) a = src.score_away; if(a == null) a = src.goals_away;
  if((h == null || a == null) && typeof src.score === 'string'){
    var m = src.score.match(/(\d+)\s*[-:]\s*(\d+)/);
    if(m){ h = h == null ? m[1] : h; a = a == null ? m[2] : a; }
  }
  h = h == null || h === '' ? null : Number(h);
  a = a == null || a === '' ? null : Number(a);
  return {homeScore:isFinite(h) ? h : null, awayScore:isFinite(a) ? a : null};
}
function scoreLabel(m){
  var sp = scorePairFromSource(m);
  if(m && isFinished(m) && sp.homeScore != null && sp.awayScore != null) return String(sp.homeScore) + ' : ' + String(sp.awayScore);
  return '- : -';
}
function getBet(m,type){
  if(typeof W.getBetByType === 'function'){
    try{ var fromApp = W.getBetByType(m,type); if(fromApp) return fromApp; }catch(e){}
  }
  return ((m && m.allBets) || []).filter(function(b){ return b && b.type === type; })[0] || null;
}
function poissonScoreAtLeastOne(lambda){
  var l = Math.max(0, n(lambda,0));
  return clamp((1 - Math.exp(-l)) * 100, 0, 99.5);
}
function poissonTotalBetween(totalLambda, minGoals, maxGoals){
  var l = Math.max(0, n(totalLambda,0));
  function fact(k){ var out=1; for(var i=2;i<=k;i++) out*=i; return out; }
  function p(k){ return (Math.pow(l,k) * Math.exp(-l)) / fact(k); }
  var s = 0;
  for(var g=minGoals; g<=maxGoals; g++) s += p(g);
  return clamp(s * 100, 0, 99.5);
}
function addCandidate(out, m, cfg){
  var prob = clamp(n(cfg.prob,0), 0, 99.5);
  var od = n(cfg.odds,0);
  if(prob < 72 || od < 1.01 || od > 1.40) return;

  var sourcePenalty = cfg.real ? 0 : 3.5;
  var oddsPenalty = od > 1.30 ? (od - 1.30) * 44 : 0;
  var xgBonus = Math.min(4, Math.max(0, n(m.xgTotal,0) - 1.8));
  var injuryPenalty = Math.min(5, Math.max(0, n(m.nUnavailHome,0) + n(m.nUnavailAway,0)) * 0.13);
  var confidenceBonus = Math.max(0, Math.min(4, (n(m.confidence,0) - 50) / 12));
  var score = prob + xgBonus + confidenceBonus - sourcePenalty - oddsPenalty - injuryPenalty + n(cfg.priority,0);

  var grade = 'watch';
  if(prob >= 91 && od <= 1.25) grade = 'ultra';
  else if(prob >= 86 && od <= 1.30) grade = 'safe';
  else if(prob >= 80 && od <= 1.35) grade = 'ok';

  out.push({
    eventId: m.eventId || m.id || [m.home,m.away,m.date].join('|'),
    match: m,
    market: cfg.market,
    label: cfg.label,
    short: cfg.short || cfg.label,
    prob: +prob.toFixed(2),
    odds: +od.toFixed(2),
    real: !!cfg.real,
    grade: grade,
    score: +score.toFixed(2),
    reason: cfg.reason || '',
    source: cfg.source || (cfg.real ? 'cotă API' : 'estimat/calibrat'),
    marketKey: cfg.marketKey || cfg.market
  });
}
function addExistingBet(out,m,type,label,short,minProb,maxOdds,priority){
  var b = getBet(m,type);
  if(!b) return;
  var rawProb = Math.max(n(b.adjProb,0), n(b.prob,0));
  var od = n(b.odds || b.bestOdds || b.baseOdds,0);
  var prob = marketAdjustedProb(rawProb, {odds:od, implied:(n(b.avgImpliedProb,0) || n(b.bestImpliedProb,0) || impliedProbFromOddsLocal(od))});
  if(prob < minProb || od > maxOdds || od < 1.01) return;
  var edge = b.edgeVsMarket != null ? n(b.edgeVsMarket,0) : (b.edgePct != null ? n(b.edgePct,0) : null);
  var edgeTxt = edge != null ? 'edge ' + (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp' : 'edge n/a';
  addCandidate(out,m,{
    market:type,
    marketKey:type,
    label:label,
    short:short,
    prob:prob,
    odds:od,
    real:true,
    priority:priority,
    source:(b.bestBookmaker ? b.bestBookmaker : (b.oddsSource || 'cotă API')),
    reason:'Prob AI/market ' + pct(prob,1) + ' · model ' + pct(rawProb,1) + ' · ' + edgeTxt + ' · xG total ' + n(m.xgTotal,0).toFixed(2)
  });
}
function buildCandidatesForMatch(m, context){
  var out = [];
  if(!m || !isUpcomingEnough(m)) return out;

  addExistingBet(out,m,'under35','Sub 3.5 goluri','Under 3.5',82,1.35,4);
  addExistingBet(out,m,'over15','Peste 1.5 goluri','Over 1.5',78,1.35,2.5);
  addExistingBet(out,m,'dc1x','Șansă dublă 1X','1X',82,1.35,3);
  addExistingBet(out,m,'dcx2','Șansă dublă X2','X2',82,1.35,3);

  var homeGoalProb = poissonScoreAtLeastOne(m.xgHome);
  var awayGoalProb = poissonScoreAtLeastOne(m.xgAway);
  if(homeGoalProb >= 75){
    var homeQuote = getTeamO05MarketQuote(m, 'home', homeGoalProb);
    var homeP = homeQuote.prob || homeGoalProb;
    // Protecție Bet Safe: nu mai publicăm „fair din xG” slab ca pont safe.
    // Păstrăm piața doar dacă are cotă reală/API sau dacă estimarea este foarte joasă și susținută de probabilitate mare.
    if((homeQuote.real && homeP >= 82 && homeQuote.odds <= 1.22) || (!homeQuote.real && homeP >= 88 && homeQuote.odds <= 1.16)){
      addCandidate(out,m,{
        market:'home_o05', label:(m.home || 'Gazde') + ' marchează 0.5+', short:'1-over 0.5 ⚽', prob:homeP,
        odds:homeQuote.odds, real:!!homeQuote.real, priority:homeQuote.real ? 1.4 : -1.2, source:homeQuote.source || 'estimare calibrată', marketKey:'home_o05',
        reason:'xG gazde ' + n(m.xgHome,0).toFixed(2) + ' ⇒ model gol ' + pct(homeGoalProb,1) + '. Cotă ' + (homeQuote.real ? 'din API' : 'estimare strictă: minim 88% și cotă ≤1.16') + '.'
      });
    }
  }
  if(awayGoalProb >= 75){
    var awayQuote = getTeamO05MarketQuote(m, 'away', awayGoalProb);
    var awayP = awayQuote.prob || awayGoalProb;
    if((awayQuote.real && awayP >= 82 && awayQuote.odds <= 1.22) || (!awayQuote.real && awayP >= 88 && awayQuote.odds <= 1.16)){
      addCandidate(out,m,{
        market:'away_o05', label:(m.away || 'Oaspeți') + ' marchează 0.5+', short:'2-over 0.5 ⚽', prob:awayP,
        odds:awayQuote.odds, real:!!awayQuote.real, priority:awayQuote.real ? 1.2 : -1.4, source:awayQuote.source || 'estimare calibrată', marketKey:'away_o05',
        reason:'xG oaspeți ' + n(m.xgAway,0).toFixed(2) + ' ⇒ model gol ' + pct(awayGoalProb,1) + '. Cotă ' + (awayQuote.real ? 'din API' : 'estimare strictă: minim 88% și cotă ≤1.16') + '.'
      });
    }
  }

  var intervalProb = poissonTotalBetween(n(m.xgTotal,0), 1, 4);
  if(intervalProb >= 86){
    addCandidate(out,m,{
      market:'goals_1_4', label:'Interval total 1–4 goluri', short:'1–4 goluri', prob:intervalProb,
      odds:fairOddsFromProb(intervalProb), real:false, priority:0.4, source:'fair din xG',
      reason:'xG total ' + n(m.xgTotal,0).toFixed(2) + ' ⇒ probabilitate interval 1–4: ' + pct(intervalProb,1) + '. Folosește doar dacă găsești piața disponibilă.'
    });
  }

  var sorted = out.sort(function(a,b){
    if(b.grade !== a.grade){
      var w = {ultra:4,safe:3,ok:2,watch:1};
      return (w[b.grade]||0) - (w[a.grade]||0);
    }
    if((b.score||0) !== (a.score||0)) return (b.score||0) - (a.score||0);
    return (b.prob||0) - (a.prob||0);
  });
  return sorted.slice(0, context === 'vip' ? 5 : 2);
}
function getPool(){
  var list = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES.slice() : [];
  var key = targetDayKey();
  return list.filter(function(m){ return matchDateKey(m) === key && isUpcomingEnough(m); })
    .sort(function(a,b){ return (eventMs(a)||0) - (eventMs(b)||0); });
}
function buildAllCandidates(context){
  var seen = {};
  var raw = [];
  getPool().forEach(function(m){
    buildCandidatesForMatch(m, context).forEach(function(c){
      var sig = String(c.eventId) + '|' + c.market;
      if(!seen[sig]){ seen[sig] = true; raw.push(c); }
    });
  });
  raw.sort(function(a,b){
    if((b.grade === 'ultra') !== (a.grade === 'ultra')) return b.grade === 'ultra' ? 1 : -1;
    if((b.real?1:0) !== (a.real?1:0)) return (b.real?1:0) - (a.real?1:0);
    if((b.score||0) !== (a.score||0)) return (b.score||0) - (a.score||0);
    return (a.odds||0) - (b.odds||0);
  });
  return raw;
}
function uniqueEvents(cands){
  var seen = {};
  return cands.filter(function(c){
    var id = String(c.eventId || '');
    if(seen[id]) return false;
    seen[id] = true;
    return true;
  });
}
function comboStats(items){
  var od = 1;
  var p = 1;
  items.forEach(function(c){ od *= n(c.odds,1); p *= clamp(n(c.prob,0)/100,0,1); });
  return {odds:+od.toFixed(2), prob:+(p*100).toFixed(2), tenSteps:+(Math.pow(p,10)*100).toFixed(2)};
}
function combinations(arr, len, start, cur, out){
  if(cur.length === len){ out.push(cur.slice()); return; }
  for(var i=start; i<arr.length; i++){
    cur.push(arr[i]); combinations(arr, len, i+1, cur, out); cur.pop();
  }
}
function vipLegScore(c){
  var od = n(c.odds, 1);
  var prob = n(c.prob, 0);
  var oddsRisk = Math.max(0, od - 1.18) * 58 + Math.max(0, od - 1.25) * 115;
  var modelPenalty = c.real ? 0 : 5.2;
  var gradeBonus = c.grade === 'ultra' ? 7 : (c.grade === 'safe' ? 4 : (c.grade === 'ok' ? 1 : 0));
  return prob + gradeBonus + (c.real ? 1.5 : 0) - oddsRisk - modelPenalty + n(c.score,0) * 0.08;
}
function prepareVipPool(candidates, layer){
  var byEvent = {};
  candidates.forEach(function(c){
    if(!c || c.odds < 1.01 || c.odds > layer.maxOdds || c.prob < layer.minProb) return;
    var mk = normalizeMarketKey(c.marketKey || c.market || c.short || c.label || '');
    var isTeamGoal = mk === 'home_o05' || mk === 'away_o05' || mk.indexOf('1-over 0.5') === 0 || mk.indexOf('2-over 0.5') === 0;
    // VIP trebuie să fie foarte conservator: estimările fără cotă reală intră doar dacă sunt ultra low-odds.
    if(!c.real && isTeamGoal && (c.odds > 1.16 || c.prob < 88)) return;
    if(!c.real && !isTeamGoal && (c.odds > 1.22 || c.prob < 86)) return;
    var id = String(c.eventId || '');
    if(!id) return;
    if(!byEvent[id]) byEvent[id] = [];
    byEvent[id].push(c);
  });
  var out = [];
  Object.keys(byEvent).forEach(function(id){
    byEvent[id].sort(function(a,b){
      var sa = vipLegScore(a), sb = vipLegScore(b);
      if(sb !== sa) return sb - sa;
      if(b.prob !== a.prob) return b.prob - a.prob;
      return a.odds - b.odds;
    });
    // păstrăm maximum două piețe / meci, ca motorul să poată alege varianta cea mai potrivită
    out = out.concat(byEvent[id].slice(0,2));
  });
  out.sort(function(a,b){
    var sa = vipLegScore(a), sb = vipLegScore(b);
    if(sb !== sa) return sb - sa;
    return a.odds - b.odds;
  });
  return out.slice(0, layer.limit || 34);
}
function comboHasUniqueEvents(items){
  var seen = {};
  for(var i=0;i<items.length;i++){
    var id = String(items[i].eventId || '');
    if(seen[id]) return false;
    seen[id] = true;
  }
  return true;
}
function scoreVipCombo(items, layer){
  var st = comboStats(items);
  var inTarget = st.odds >= 1.30 && st.odds <= 1.50;
  var nearTarget = st.odds >= 1.22 && st.odds <= 1.55;
  var probs = items.map(function(x){ return n(x.prob,0); });
  var oddsArr = items.map(function(x){ return n(x.odds,1); });
  var minLegProb = Math.min.apply(null, probs);
  var avgLegProb = probs.reduce(function(s,x){ return s+x; },0) / Math.max(1, probs.length);
  var maxLegOdds = Math.max.apply(null, oddsArr);
  var avgLegOdds = oddsArr.reduce(function(s,x){ return s+x; },0) / Math.max(1, oddsArr.length);
  var realCount = items.filter(function(x){ return x.real; }).length;
  var centerGap = Math.abs(1.38 - st.odds);
  var highLegPenalty = oddsArr.reduce(function(s,o){
    return s + Math.max(0, o - 1.20) * 90 + Math.max(0, o - 1.28) * 165;
  },0);
  var concentrationPenalty = Math.max(0, maxLegOdds - avgLegOdds) * 70;
  var modelPenalty = items.filter(function(x){ return !x.real; }).length * 3.8;
  var lengthBonus = items.length === 3 ? 15 : (items.length === 2 ? 9 : -10);
  var targetBonus = inTarget ? 240 : (nearTarget ? 42 : -80);
  var underTargetPenalty = st.odds < 1.30 ? (1.30 - st.odds) * 210 : 0;
  var overTargetPenalty = st.odds > 1.50 ? (st.odds - 1.50) * 260 : 0;
  var layerBonus = layer.rank || 0;

  var score = targetBonus + layerBonus + (st.prob * 3.2) + (minLegProb * 0.75) + (avgLegProb * 0.35) + lengthBonus + (realCount * 1.2)
    - (centerGap * 32) - highLegPenalty - concentrationPenalty - modelPenalty - underTargetPenalty - overTargetPenalty;

  return {
    items:items,
    stats:st,
    inTarget:inTarget,
    soft:nearTarget,
    score:score,
    maxLegOdds:maxLegOdds,
    minLegProb:minLegProb,
    avgLegOdds:avgLegOdds,
    avgLegProb:avgLegProb,
    aiLayer:layer.name,
    aiReason:layer.reason
  };
}
function enumerateVipCombos(pool, layer){
  var combos = [];
  [3,2,1].forEach(function(len){ combinations(pool, len, 0, [], combos); });
  return combos.filter(comboHasUniqueEvents).map(function(items){ return scoreVipCombo(items, layer); });
}
function sortVipCombos(a,b){
  // 1) întâi respectăm intervalul cerut, 2) apoi probabilitatea, 3) apoi evităm piciorul scump
  if((b.inTarget?1:0) !== (a.inTarget?1:0)) return (b.inTarget?1:0) - (a.inTarget?1:0);
  if(b.score !== a.score) return b.score - a.score;
  if(b.stats.prob !== a.stats.prob) return b.stats.prob - a.stats.prob;
  if(a.maxLegOdds !== b.maxLegOdds) return a.maxLegOdds - b.maxLegOdds;
  if(b.items.length !== a.items.length) return b.items.length - a.items.length;
  return Math.abs(1.38 - a.stats.odds) - Math.abs(1.38 - b.stats.odds);
}
function buildVip(candidates){
  var layers = [
    {name:'AI Ultra', minProb:88, maxOdds:1.20, limit:30, rank:18, reason:'doar cote/eveniment ≤1.20 și probabilitate foarte ridicată'},
    {name:'AI Safe+', minProb:84, maxOdds:1.23, limit:34, rank:12, reason:'relaxare mică pentru a atinge intervalul fără picior scump'},
    {name:'AI Balanced', minProb:78, maxOdds:1.28, limit:38, rank:6, reason:'echilibru între cotă totală 1.30–1.50 și probabilitate combinată'},
    {name:'AI Adaptive', minProb:72, maxOdds:1.35, limit:42, rank:0, reason:'folosit doar când oferta safe strictă nu poate construi bilet în interval'}
  ];

  var globalBest = null;
  var bestTarget = null;

  for(var li=0; li<layers.length; li++){
    var layer = layers[li];
    var pool = prepareVipPool(candidates, layer);
    if(!pool.length) continue;
    var scored = enumerateVipCombos(pool, layer).filter(function(c){ return c.soft || c.inTarget; }).sort(sortVipCombos);
    if(!scored.length) continue;

    if(!globalBest || sortVipCombos(scored[0], globalBest) < 0) globalBest = scored[0];

    var target = scored.filter(function(c){ return c.inTarget; }).sort(sortVipCombos)[0];
    if(target){
      bestTarget = target;
      break; // primul layer care poate atinge intervalul este cel mai sigur layer disponibil
    }
  }

  if(bestTarget) return bestTarget;
  if(globalBest) return globalBest;

  // ultimă protecție: dacă nu există combo valid, afișăm cel mai bun singur eveniment, dar marcat explicit ca fallback
  var emergency = candidates.filter(function(c){ return c && c.prob >= 80 && c.odds >= 1.01 && c.odds <= 1.35; }).sort(function(a,b){
    var sa = vipLegScore(a), sb = vipLegScore(b);
    if(sb !== sa) return sb - sa;
    return a.odds - b.odds;
  })[0];
  if(emergency){
    var fallbackLayer = {name:'AI Fallback', minProb:80, maxOdds:1.35, rank:-12, reason:'nu există suficiente selecții compatibile pentru 1.30–1.50'};
    return scoreVipCombo([emergency], fallbackLayer);
  }
  return null;
}
function gradeLabel(g){
  if(g === 'ultra') return 'ULTRA SAFE';
  if(g === 'safe') return 'SAFE';
  if(g === 'ok') return 'OK';
  return 'WATCH';
}
function normalizeMarketKey(k){
  return String(k || '').toLowerCase()
    .replace(/[⚽️]/g,'')
    .replace(/\s+/g,' ')
    .replace(/,/g,'.')
    .trim();
}
function marketResult(marketKey, h, a){
  h = Number(h); a = Number(a);
  if(!isFinite(h) || !isFinite(a)) return 'pending';
  var total = h + a;
  var k = normalizeMarketKey(marketKey);
  var compact = k.replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');

  // Totaluri meci
  if(compact === 'under35' || compact === 'u35' || compact === 'under_35' || k.indexOf('under 3.5') >= 0 || k.indexOf('sub 3.5') >= 0) return total <= 3 ? 'win' : 'loss';
  if(compact === 'over15' || compact === 'o15' || compact === 'over_15' || k.indexOf('over 1.5') >= 0 || k.indexOf('peste 1.5') >= 0) return total >= 2 ? 'win' : 'loss';

  // Șansă dublă
  if(compact === 'dc1x' || compact === '1x' || k === '1x') return h >= a ? 'win' : 'loss';
  if(compact === 'dcx2' || compact === 'x2' || k === 'x2') return a >= h ? 'win' : 'loss';

  // Gol echipă: 1-over 0.5 = gazda marchează cel puțin un gol; 2-over 0.5 = oaspetele marchează cel puțin un gol.
  if(compact === 'home_o05' || compact === 'home05' || compact === 'home_over_05' || compact === 'home_team_over_05' || /^1[_\s-]*over[_\s-]*0_?5/.test(compact) || k.indexOf('1-over 0.5') === 0) return h >= 1 ? 'win' : 'loss';
  if(compact === 'away_o05' || compact === 'away05' || compact === 'away_over_05' || compact === 'away_team_over_05' || /^2[_\s-]*over[_\s-]*0_?5/.test(compact) || k.indexOf('2-over 0.5') === 0) return a >= 1 ? 'win' : 'loss';

  if(compact === 'goals_1_4' || compact === '1_4_goals' || k.indexOf('1–4') >= 0 || k.indexOf('1-4') >= 0) return total >= 1 && total <= 4 ? 'win' : 'loss';
  return 'pending';
}
function listSources(){
  var out = [];
  if(Array.isArray(W.ALL_MATCHES)) out = out.concat(W.ALL_MATCHES.map(function(x){ x.__bsSource = x.__bsSource || 'meciuri'; return x; }));
  if(Array.isArray(W.ALL_EVENTS)) out = out.concat(W.ALL_EVENTS.map(function(x){ x.__bsSource = x.__bsSource || 'events'; return x; }));
  if(Array.isArray(W.HISTORY_ENGINE)) out = out.concat(W.HISTORY_ENGINE.map(function(x){ x.__bsSource = x.__bsSource || 'history'; return x; }));
  if(Array.isArray(W.RECOMMENDATION_LOG)) out = out.concat(W.RECOMMENDATION_LOG.map(function(x){ x.__bsSource = x.__bsSource || 'log'; return x; }));
  return out;
}
function normName(v){ return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function sourceScore(src, entry){
  if(!src || !entry) return -999;
  var sc = 0;
  var srcId = src.eventId != null ? src.eventId : (src.event_id != null ? src.event_id : src.id);
  if(entry.eventId != null && srcId != null && String(entry.eventId) === String(srcId)) sc += 1000;
  var sh = normName(src.home || src.home_team || src.localteam || '');
  var sa = normName(src.away || src.away_team || src.visitorteam || '');
  var eh = normName(entry.home || '');
  var ea = normName(entry.away || '');
  if(sh && eh && sh === eh) sc += 110;
  if(sa && ea && sa === ea) sc += 110;
  var sd = matchDateKey(src);
  if(sd && entry.dateKey && sd === entry.dateKey) sc += 50;
  var srcMarket = normalizeMarketKey(src.market_key || src.marketKey || src.market || '');
  var entryMarket = normalizeMarketKey(entry.marketKey || entry.market || entry.short || entry.label || '');
  if(srcMarket && entryMarket){
    if(srcMarket === entryMarket) sc += 55;
    else if((srcMarket === 'over15' && entryMarket.indexOf('over 1.5') >= 0) || (srcMarket === 'under35' && entryMarket.indexOf('under 3.5') >= 0)) sc += 35;
    else sc -= 8;
  }
  var st = statusText(src);
  if(isFinishedStatus(st)) sc += 18;
  if(isVoidStatus(st)) sc += 18;
  var sp = scorePairFromSource(src);
  if(sp.homeScore != null && sp.awayScore != null) sc += 30;
  return sc;
}
function findSourceForEntry(entry){
  var best = null;
  var bestScore = -999;
  listSources().forEach(function(src){
    var sc = sourceScore(src, entry);
    if(sc > bestScore){ bestScore = sc; best = src; }
  });
  return bestScore >= 170 ? best : null;
}
function settleEntry(entry){
  if(!entry) return entry;

  // Nu folosim getAutoSettlementForPick aici. În app-ul principal acel helper poate întoarce row.won
  // din recommendation_log pentru altă piață a aceluiași meci. Asta marca greșit, de exemplu:
  // 1-over 0.5 la scor 0-0 ca WIN sau Benfica 2-2 / 1-over 0.5 ca LOSS.
  // Bet Safe își calculează statusul strict din scor + piața exactă.
  var src = findSourceForEntry(entry);
  if(!src){ entry.result = entry.result || 'pending'; return entry; }
  var st = statusText(src);
  var sp = scorePairFromSource(src);
  entry.matchStatus = st || entry.matchStatus || 'pending';
  if(sp.homeScore != null && sp.awayScore != null){
    entry.homeScore = sp.homeScore;
    entry.awayScore = sp.awayScore;
  }
  if(isVoidStatus(st)){
    entry.result = 'anulat';
    entry.autoSource = src.__bsSource || 'source';
    entry.settledAt = entry.settledAt || new Date().toISOString();
    return entry;
  }
  if(isFinishedStatus(st) || (sp.homeScore != null && sp.awayScore != null && String(st).indexOf('live') < 0)){
    var res = marketResult(entry.marketKey || entry.market, sp.homeScore, sp.awayScore);
    entry.result = res === 'lose' ? 'loss' : res;
    entry.matchStatus = 'finished';
    entry.autoSource = src.__bsSource || 'source';
    if(entry.result !== 'pending') entry.settledAt = entry.settledAt || new Date().toISOString();
  }else{
    entry.result = entry.result || 'pending';
  }
  return entry;
}
function loadHistory(){
  try{
    var raw = JSON.parse(localStorage.getItem(HISTORY_STORAGE) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  }catch(e){ return {}; }
}
function saveHistory(hist){
  try{ localStorage.setItem(HISTORY_STORAGE, JSON.stringify(hist || {})); }catch(e){}
}
function historyDays(){
  var out = [];
  var now = new Date();
  for(var i=0;i<7;i++){
    var d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dayKeyFromDate(d));
  }
  return out;
}
function pickKey(p){ return String(p.eventId || (p.home + '|' + p.away + '|' + p.eventDate)) + '|' + String(p.marketKey || p.market || ''); }
function candidateToHistory(c, dateKey){
  var m = c.match || {};
  return {
    key: String(c.eventId || '') + '|' + String(c.marketKey || c.market || ''),
    dateKey: dateKey || matchDateKey(m) || targetDayKey(),
    eventId: c.eventId,
    eventDate: m.date || m.event_date || m.eventDate || '',
    timeLabel: m.timeLabel || '',
    home: m.home || 'Gazde',
    away: m.away || 'Oaspeți',
    league: m.league || '',
    country: m.country || '',
    market: c.market,
    marketKey: c.marketKey || c.market,
    label: c.label,
    short: c.short || c.label,
    odds: +n(c.odds,0).toFixed(2),
    prob: +n(c.prob,0).toFixed(2),
    source: c.source || '',
    real: !!c.real,
    grade: c.grade || 'watch',
    score: +n(c.score,0).toFixed(2),
    xgHome: +n(m.xgHome,0).toFixed(2),
    xgAway: +n(m.xgAway,0).toFixed(2),
    loggedAt: new Date().toISOString(),
    result: 'pending',
    matchStatus: 'pending',
    homeScore: null,
    awayScore: null
  };
}
function syncHistory(currentCandidates, currentVip){
  var hist = loadHistory();
  historyDays().forEach(function(k){ if(!hist[k]) hist[k] = {dateKey:k, picks:[], vip:null, updatedAt:null}; });

  var key = targetDayKey();
  if(currentCandidates && currentCandidates.length){
    if(!hist[key]) hist[key] = {dateKey:key, picks:[], vip:null, updatedAt:null};
    var map = {};
    (hist[key].picks || []).forEach(function(p){ map[pickKey(p)] = p; });
    currentCandidates.slice(0,20).forEach(function(c){
      var hp = candidateToHistory(c, key);
      var pk = pickKey(hp);
      if(map[pk]){
        var keep = map[pk];
        ['odds','prob','score','source','grade','label','short','timeLabel','xgHome','xgAway'].forEach(function(f){ keep[f] = hp[f]; });
        keep.lastSeenAt = new Date().toISOString();
      }else{
        map[pk] = hp;
      }
    });
    hist[key].picks = Object.keys(map).map(function(k2){ return map[k2]; }).sort(function(a,b){ return (a.timeLabel || '').localeCompare(b.timeLabel || '') || n(b.score,0) - n(a.score,0); });
    if(currentVip && currentVip.items && currentVip.items.length){
      hist[key].vip = {
        dateKey:key,
        loggedAt:(hist[key].vip && hist[key].vip.loggedAt) || new Date().toISOString(),
        updatedAt:new Date().toISOString(),
        odds: currentVip.stats.odds,
        prob: currentVip.stats.prob,
        tenSteps: currentVip.stats.tenSteps,
        inTarget: !!currentVip.inTarget,
        picks: currentVip.items.map(function(c){ return candidateToHistory(c, key); }),
        result:'pending'
      };
    }
    hist[key].updatedAt = new Date().toISOString();
  }

  Object.keys(hist).forEach(function(k){
    var day = hist[k] || {};
    day.picks = (day.picks || []).map(settleEntry);
    if(day.vip && Array.isArray(day.vip.picks)){
      day.vip.picks = day.vip.picks.map(settleEntry);
      var rs = day.vip.picks.map(function(p){ return p.result || 'pending'; });
      if(rs.some(function(r){ return r === 'loss' || r === 'lose'; })) day.vip.result = 'loss';
      else if(rs.some(function(r){ return r === 'pending' || !r; })) day.vip.result = 'pending';
      else if(rs.length && rs.every(function(r){ return r === 'win' || r === 'anulat'; })) day.vip.result = 'win';
      else day.vip.result = 'pending';
    }
    hist[k] = day;
  });

  var allowed = historyDays().reduce(function(acc,k){ acc[k] = true; return acc; },{});
  Object.keys(hist).forEach(function(k){ if(!allowed[k]) delete hist[k]; });
  saveHistory(hist);
  return hist;
}
function resultLabel(res){
  res = String(res || 'pending').toLowerCase();
  if(res === 'win') return 'WIN';
  if(res === 'loss' || res === 'lose') return 'LOSS';
  if(res === 'anulat' || res === 'void') return 'VOID';
  return 'PENDING';
}
function resultClass(res){
  res = String(res || 'pending').toLowerCase();
  if(res === 'win') return 'win';
  if(res === 'loss' || res === 'lose') return 'loss';
  if(res === 'anulat' || res === 'void') return 'void';
  return 'pending';
}
function daySummary(day){
  var rows = (day && day.picks) || [];
  var settled = rows.filter(function(p){ return ['win','loss','lose','anulat','void'].indexOf(String(p.result || '').toLowerCase()) >= 0; });
  var wins = rows.filter(function(p){ return String(p.result || '').toLowerCase() === 'win'; }).length;
  var losses = rows.filter(function(p){ return ['loss','lose'].indexOf(String(p.result || '').toLowerCase()) >= 0; }).length;
  var pending = rows.filter(function(p){ return !p.result || String(p.result).toLowerCase() === 'pending'; }).length;
  var roi = 0;
  settled.forEach(function(p){
    var r = String(p.result || '').toLowerCase();
    if(r === 'win') roi += n(p.odds,1) - 1;
    else if(r === 'loss' || r === 'lose') roi -= 1;
  });
  return {total:rows.length, settled:settled.length, wins:wins, losses:losses, pending:pending, winrate:settled.length ? wins * 100 / settled.length : 0, roi:settled.length ? roi * 100 / settled.length : 0};
}
function serializeVipCandidate(c){
  var m = c.match || {};
  return {
    eventId:c.eventId,
    market:c.market,
    marketKey:c.marketKey || c.market,
    label:c.label,
    short:c.short || c.label,
    prob:+n(c.prob,0).toFixed(2),
    odds:+n(c.odds,0).toFixed(2),
    real:!!c.real,
    grade:c.grade || 'watch',
    score:+n(c.score,0).toFixed(2),
    reason:c.reason || '',
    source:c.source || '',
    match:{
      eventId:c.eventId,
      id:c.eventId,
      date:m.date || m.event_date || m.eventDate || '',
      event_date:m.event_date || m.date || m.eventDate || '',
      dateKey:matchDateKey(m) || targetDayKey(),
      timeLabel:m.timeLabel || '',
      home:m.home || 'Gazde',
      away:m.away || 'Oaspeți',
      league:m.league || '',
      country:m.country || '',
      xgHome:n(m.xgHome,0),
      xgAway:n(m.xgAway,0),
      xgTotal:n(m.xgTotal,0),
      status:m.status || m.matchStatus || 'notstarted'
    }
  };
}
function isLockableVip(vip){
  return !!(vip && Array.isArray(vip.items) && vip.items.length >= 2 && vip.inTarget && n(vip.stats && vip.stats.odds,0) >= 1.30 && n(vip.stats && vip.stats.odds,0) <= 1.50);
}
function loadVipLocks(){
  try{
    var raw = JSON.parse(localStorage.getItem(VIP_LOCK_STORAGE) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  }catch(e){ return {}; }
}
function saveVipLocks(locks){
  try{ localStorage.setItem(VIP_LOCK_STORAGE, JSON.stringify(locks || {})); }catch(e){}
}
function comboFromLockedVip(lock){
  if(!lock || !Array.isArray(lock.items) || !lock.items.length) return null;
  var combo = {
    items: lock.items,
    stats: {odds:n(lock.odds,0), prob:n(lock.prob,0), tenSteps:n(lock.tenSteps,0)},
    inTarget: !!lock.inTarget,
    soft: true,
    score:n(lock.score,0),
    maxLegOdds:n(lock.maxLegOdds,0),
    minLegProb:n(lock.minLegProb,0),
    avgLegOdds:n(lock.avgLegOdds,0),
    avgLegProb:n(lock.avgLegProb,0),
    aiLayer: lock.aiLayer || 'AI Locked',
    aiReason: lock.aiReason || 'biletul VIP a fost fixat la prima recomandare validă a zilei',
    locked:true,
    lockedAt:lock.lockedAt || ''
  };
  return combo;
}
function getOrCreateDailyVip(dateKey, freshVip){
  if(state.dayMode !== 'today') return freshVip;
  var locks = loadVipLocks();
  Object.keys(locks).forEach(function(k){
    if(k !== dateKey) delete locks[k];
  });
  if(locks[dateKey]){
    var locked = comboFromLockedVip(locks[dateKey]);
    if(locked) return locked;
    delete locks[dateKey];
  }
  if(isLockableVip(freshVip)){
    locks[dateKey] = {
      version:'v7',
      dateKey:dateKey,
      lockedAt:new Date().toISOString(),
      odds:freshVip.stats.odds,
      prob:freshVip.stats.prob,
      tenSteps:freshVip.stats.tenSteps,
      inTarget:freshVip.inTarget,
      score:freshVip.score,
      maxLegOdds:freshVip.maxLegOdds,
      minLegProb:freshVip.minLegProb,
      avgLegOdds:freshVip.avgLegOdds,
      avgLegProb:freshVip.avgLegProb,
      aiLayer:freshVip.aiLayer,
      aiReason:freshVip.aiReason,
      items:freshVip.items.map(serializeVipCandidate)
    };
    saveVipLocks(locks);
    var out = comboFromLockedVip(locks[dateKey]);
    if(out) return out;
  }
  saveVipLocks(locks);
  return freshVip;
}
function renderStats(pool,cands,vip,hist){
  var ultra = cands.filter(function(c){ return c.grade === 'ultra'; }).length;
  var real = cands.filter(function(c){ return c.real; }).length;
  var vipText = vip ? (odds(vip.stats.odds) + ' / ' + pct(vip.stats.prob,1)) : '—';
  var histDay = hist && hist[state.historyDay];
  var sum = daySummary(histDay || {});
  return '<div class="bet-safe-stats">' +
    '<div class="bet-safe-stat"><b>' + pool.length + '</b><span>Meciuri azi din pool</span></div>' +
    '<div class="bet-safe-stat"><b>' + cands.length + '</b><span>Semnale safe generate</span></div>' +
    '<div class="bet-safe-stat"><b>' + ultra + '</b><span>Ultra safe</span></div>' +
    '<div class="bet-safe-stat"><b>' + esc(vipText) + '</b><span>VIP cotă / probabilitate</span></div>' +
    '<div class="bet-safe-stat"><b>' + sum.wins + '/' + sum.settled + '</b><span>Istoric zi selectată</span></div>' +
  '</div>';
}
function renderCandidateCard(c){
  var m = c.match || {};
  var color = c.grade === 'ultra' || c.grade === 'safe' ? 'green' : 'gold';
  var oddsPrefix = c.real ? '' : '≈';
  return '<div class="bet-safe-card ' + color + '">' +
    '<div class="bet-safe-card-top">' +
      '<div class="bet-safe-league">' + esc(leagueLabel(m)) + '</div>' +
      '<div class="bet-safe-time">' + esc(m.timeLabel || '') + '</div>' +
    '</div>' +
    '<div class="bet-safe-teams">' +
      '<div class="bet-safe-team"><strong>' + esc(m.home || 'Gazde') + '</strong><small>xG ' + n(m.xgHome,0).toFixed(2) + '</small></div>' +
      '<div class="bet-safe-score">' + esc(scoreLabel(m)) + '</div>' +
      '<div class="bet-safe-team"><strong>' + esc(m.away || 'Oaspeți') + '</strong><small>xG ' + n(m.xgAway,0).toFixed(2) + '</small></div>' +
    '</div>' +
    '<div class="bet-safe-selection"><b>' + esc(c.short || c.label) + '</b><span class="bet-safe-odds">' + oddsPrefix + esc(odds(c.odds)) + '</span></div>' +
    '<div class="bet-safe-card-meta">' +
      '<span class="bet-safe-mini green">' + esc(gradeLabel(c.grade)) + '</span>' +
      '<span class="bet-safe-mini">Prob ' + esc(pct(c.prob,1)) + '</span>' +
      '<span class="bet-safe-mini ' + (c.real ? 'green' : 'gold') + '">' + esc(c.source) + '</span>' +
      '<span class="bet-safe-mini">Score ' + esc(String(Math.round(c.score))) + '</span>' +
    '</div>' +
    '<div class="bet-safe-why">' + esc(c.reason) + '</div>' +
  '</div>';
}
function renderVip(vip){
  if(!vip){
    return '<div class="bet-safe-empty"><b>Nu am construit VIP.</b><br>Nu există încă suficiente selecții low-odds cu probabilitate ridicată pentru un combo VIP.</div>';
  }
  var dateKey = targetDayKey();
  var dayTitle = dateLabelForKey(dateKey).split(' · ')[0];
  var rows = vip.items.map(function(c){
    var m = c.match || {};
    return '<div class="bet-safe-vip-row">' +
      '<div class="bet-safe-vip-top"><div class="bet-safe-vip-league">' + esc(leagueLabel(m)) + '</div><div class="bet-safe-time">' + esc(m.timeLabel || '') + '</div></div>' +
      '<div class="bet-safe-vip-teams"><span>' + esc(m.home || 'Gazde') + '</span><strong class="bet-safe-score" style="font-size:20px;color:#f6b51d">' + esc(scoreLabel(m)) + '</strong><span>' + esc(m.away || 'Oaspeți') + '</span></div>' +
      '<div class="bet-safe-vip-pick"><span>' + esc(c.short || c.label) + '</span><em>' + (c.real ? '' : '≈') + esc(odds(c.odds)) + '</em></div>' +
    '</div>';
  }).join('');
  var warning = vip.inTarget ? '' : '<div class="bet-safe-warning">Motorul AI nu a găsit o combinație suficient de bună în intervalul 1.30–1.50. Afișez cel mai bun fallback safe găsit, cota ' + esc(odds(vip.stats.odds)) + ', fără să forțez risc inutil.</div>';
  var aiNote = '<div class="bet-safe-warning"><b>Decizie ' + esc(vip.aiLayer || 'AI') + ':</b> ' + esc(vip.aiReason || 'optimizare probabilitate + cotă totală') + '. A ales ' + vip.items.length + ' eveniment(e), max cotă/eveniment ' + esc(odds(vip.maxLegOdds)) + ', probabilitate minimă/picior ' + esc(pct(vip.minLegProb,1)) + '.</div>';
  var probWarn = vip.stats.prob >= 90 ? '' : '<div class="bet-safe-warning">Probabilitatea combinată este ' + esc(pct(vip.stats.prob,1)) + ', nu 90%+. Pentru piramidă, tratează biletul ca risc controlat, nu garantat.</div>';
  var source = vip.items.every(function(c){ return c.real; }) ? 'toate cotele din API/odds' : 'include estimări strict filtrate unde API-ul nu are piața';
  return '<div class="bet-safe-vip-box">' +
      '<div class="bet-safe-vip-day">👑 ' + esc(dayTitle) + ' · VIP Safe</div>' +
      '<div class="bet-safe-vip-list">' + rows + '</div>' +
    '</div>' +
    '<div class="bet-safe-vip-total">Total: ' + esc(odds(vip.stats.odds)) + '</div>' +
    '<div class="bet-safe-card-meta" style="padding:0 12px 2px">' +
      '<span class="bet-safe-mini green">Prob. combinată ' + esc(pct(vip.stats.prob,1)) + '</span>' +
      '<span class="bet-safe-mini gold">Țintă cotă 1.30–1.50</span>' +
      (vip.locked ? '<span class="bet-safe-mini green">🔒 fixat azi</span>' : '') +
      '<span class="bet-safe-mini green">' + esc(vip.aiLayer || 'AI') + '</span>' +
      '<span class="bet-safe-mini gold">10 pași ≈ ' + esc(pct(vip.stats.tenSteps,1)) + '</span>' +
      '<span class="bet-safe-mini">' + esc(source) + '</span>' +
    '</div>' + aiNote + warning + probWarn;
}
function renderHistoryPick(p){
  var cls = resultClass(p.result);
  var score = (p.homeScore != null && p.awayScore != null) ? (p.homeScore + ' : ' + p.awayScore) : '- : -';
  return '<div class="bet-safe-history-row ' + cls + '">' +
    '<div class="bet-safe-history-status ' + cls + '">' + esc(resultLabel(p.result)) + '</div>' +
    '<div class="bet-safe-history-main">' +
      '<div class="bet-safe-history-top"><span>' + esc((p.country ? countryFlag(p.country) + ' ' : '') + (p.league || 'Liga')) + '</span><em>' + esc(p.timeLabel || '') + '</em></div>' +
      '<div class="bet-safe-history-teams"><strong>' + esc(p.home || 'Gazde') + '</strong><b>' + esc(score) + '</b><strong>' + esc(p.away || 'Oaspeți') + '</strong></div>' +
      '<div class="bet-safe-history-pick"><span>' + esc(p.short || p.label || p.market) + '</span><em>' + (p.real ? '' : '≈') + esc(odds(p.odds)) + '</em></div>' +
      '<div class="bet-safe-card-meta"><span class="bet-safe-mini">Prob ' + esc(pct(p.prob,1)) + '</span><span class="bet-safe-mini ' + (p.real ? 'green' : 'gold') + '">' + esc(p.source || 'model') + '</span>' + (p.autoSource ? '<span class="bet-safe-mini">auto ' + esc(p.autoSource) + '</span>' : '') + '</div>' +
    '</div>' +
  '</div>';
}
function renderHistoryVip(vip){
  if(!vip || !vip.picks || !vip.picks.length) return '<div class="bet-safe-empty"><b>Fără VIP salvat.</b><br>Deschide Bet Safe în ziua respectivă ca să salvez biletul recomandat.</div>';
  return '<div class="bet-safe-history-vip">' +
    '<div class="bet-safe-history-vip-head"><div><b>👑 VIP recomandat</b><small>Cotă ' + esc(odds(vip.odds)) + ' · Prob ' + esc(pct(vip.prob,1)) + '</small></div><span class="bet-safe-history-status ' + resultClass(vip.result) + '">' + esc(resultLabel(vip.result)) + '</span></div>' +
    vip.picks.map(renderHistoryPick).join('') +
  '</div>';
}
function renderHistory(hist){
  var days = historyDays();
  if(days.indexOf(state.historyDay) < 0) state.historyDay = days[0];
  var day = hist[state.historyDay] || {dateKey:state.historyDay,picks:[]};
  var sum = daySummary(day);
  var buttons = days.map(function(k,idx){
    var label = idx === 0 ? 'Azi' : (idx === 1 ? 'Ieri' : shortDateLabel(k));
    var dsum = daySummary(hist[k] || {});
    return '<button class="bet-safe-day-btn ' + (state.historyDay === k ? 'active' : '') + '" onclick="setBetSafeHistoryDay(\'' + k + '\')"><b>' + esc(label) + '</b><small>' + dsum.wins + '/' + dsum.settled + '</small></button>';
  }).join('');
  var rows = (day.picks || []).length ? day.picks.map(renderHistoryPick).join('') : '<div class="bet-safe-empty"><b>Nu există predicții salvate pe ziua asta.</b><br>Istoricul salvează automat ce a fost afișat în Bet Safe și actualizează statusul când găsește scorul final în datele aplicației.</div>';
  return '<div class="bet-safe-layout history">' +
    '<div class="bet-safe-panel">' +
      '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">📆 Istoric Bet Safe · 7 zile</div><div class="bet-safe-panel-sub">Monitorizează automat predicțiile afișate și biletul VIP recomandat.</div></div><span class="bet-safe-pill green">auto status</span></div>' +
      '<div class="bet-safe-day-strip">' + buttons + '</div>' +
      '<div class="bet-safe-history-summary">' +
        '<div><b>' + sum.total + '</b><span>predicții salvate</span></div>' +
        '<div><b>' + sum.wins + '</b><span>WIN</span></div>' +
        '<div><b>' + sum.losses + '</b><span>LOSS</span></div>' +
        '<div><b>' + pct(sum.winrate,1) + '</b><span>winrate închise</span></div>' +
        '<div><b>' + (sum.roi >= 0 ? '+' : '') + pct(sum.roi,1) + '</b><span>ROI unit stake</span></div>' +
      '</div>' +
      '<div class="bet-safe-history-list">' + rows + '</div>' +
    '</div>' +
    '<div class="bet-safe-panel">' +
      '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">👑 Monitorizare VIP</div><div class="bet-safe-panel-sub">Biletul VIP salvat pentru ziua selectată.</div></div></div>' +
      renderHistoryVip(day.vip) +
      '<div class="bet-safe-disclaimer"><b>Actualizare automată:</b> secțiunea caută scorurile în ALL_MATCHES, ALL_EVENTS, HISTORY_ENGINE și RECOMMENDATION_LOG. Dacă API-ul nu a adus încă rezultatul final, rămâne PENDING.</div>' +
    '</div>' +
  '</div>';
}
function renderHero(key){
  return '<div class="bet-safe-hero">' +
      '<div class="bet-safe-hero-top">' +
        '<div><div class="bet-safe-title"><span class="bet-safe-title-badge">🛡️</span><span>Bet Safe</span></div>' +
        '<div class="bet-safe-sub">Listă construită din meciurile din aplicație pentru ziua selectată. Caută piețe cu risc mic: 1X/X2, Under 3.5, Over 1.5 și doar estimări xG strict filtrate. VIP folosește un motor decizional AI heuristic: testează combinații de 1–3 evenimente, caută întâi intervalul 1.30–1.50, apoi maximizează probabilitatea și evită piciorul scump.</div></div>' +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><span class="bet-safe-pill green">Piramidă friendly</span><span class="bet-safe-pill gold">VIP low odds</span></div>' +
      '</div>' +
      '<div class="bet-safe-view-tabs">' +
        '<button class="bet-safe-view-btn ' + (state.screen === 'live' ? 'active' : '') + '" onclick="setBetSafeScreen(\'live\')">Tips + VIP</button>' +
        '<button class="bet-safe-view-btn ' + (state.screen === 'history' ? 'active' : '') + '" onclick="setBetSafeScreen(\'history\')">Istoric 7 zile</button>' +
      '</div>' +
      '<div class="bet-safe-mode-row">' +
        '<button class="bet-safe-mode ' + (state.dayMode === 'today' ? 'active' : '') + '" onclick="setBetSafeDay(\'today\')">Today</button>' +
        '<button class="bet-safe-mode ' + (state.dayMode === 'tomorrow' ? 'active' : '') + '" onclick="setBetSafeDay(\'tomorrow\')">Tomorrow</button>' +
        '<div class="bet-safe-date-chip">' + esc(dateLabelForKey(key)) + '</div>' +
      '</div>' +
    '</div>';
}
function renderMain(){
  var root = D.getElementById('betsafe-root');
  if(!root) return;

  var key = targetDayKey();
  var pool = getPool();
  var allCands = buildAllCandidates();
  var vipCands = buildAllCandidates('vip');
  var vip = getOrCreateDailyVip(key, buildVip(vipCands));
  var hist = syncHistory(allCands, vip);
  var visible = state.view === 'ultra' ? allCands.filter(function(c){ return c.grade === 'ultra' || c.grade === 'safe'; }) : allCands;

  if((!Array.isArray(W.ALL_MATCHES) || !W.ALL_MATCHES.length) && state.screen === 'live'){
    root.innerHTML = '<div class="bet-safe-shell">' + renderHero(key) + '<div class="bet-safe-empty"><b>Se încarcă predicțiile...</b><br>Secțiunea Bet Safe pornește automat după ce se populează lista Meciuri.</div></div>';
    return;
  }

  var content = '';
  if(state.screen === 'history'){
    content = renderHistory(hist);
  }else{
    var cards = visible.slice(0,20).map(renderCandidateCard).join('');
    if(!cards){
      cards = '<div class="bet-safe-empty"><b>Nu am semnale safe pentru ' + esc(state.dayMode === 'today' ? 'azi' : 'mâine') + '.</b><br>Filtrul nu forțează pariuri când probabilitatea/cota nu intră în zona safe. Verifică și tabul Meciuri sau schimbă pe ' + (state.dayMode === 'today' ? 'Mâine' : 'Azi') + '.</div>';
    }
    content = '<div class="bet-safe-layout">' +
      '<div class="bet-safe-panel">' +
        '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">Tips Safe · ' + esc(state.dayMode === 'today' ? 'azi' : 'mâine') + '</div><div class="bet-safe-panel-sub">Nu sunt ponturi garantate; sunt shortlist-uri statistice cu cotă mică și probabilitate ridicată.</div></div>' +
        '<div class="bet-safe-toolbar"><button class="bet-safe-small-btn ' + (state.view === 'all' ? 'active' : '') + '" onclick="setBetSafeView(\'all\')">Toate</button><button class="bet-safe-small-btn ' + (state.view === 'ultra' ? 'active' : '') + '" onclick="setBetSafeView(\'ultra\')">Ultra/Safe</button></div></div>' +
        '<div class="bet-safe-list">' + cards + '</div>' +
      '</div>' +
      '<div class="bet-safe-panel">' +
        '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">👑 VIP Safe Combo</div><div class="bet-safe-panel-sub">Motor AI: alege cea mai bună combinație de 1–3 selecții din oferta zilnică pentru cotă 1.30–1.50, cu prioritate pe probabilitatea combinată și cote mici/eveniment.</div></div><span class="bet-safe-pill gold">auto</span></div>' +
        renderVip(vip) +
        '<div class="bet-safe-disclaimer"><b>Important:</b> probabilitatea combinată este produsul probabilităților modelului și presupune independență între evenimente. La 10 pași piramidali, riscul se multiplică rapid; secțiunea te ajută să nu forțezi bilet când nu există value/siguranță suficientă.</div>' +
      '</div>' +
    '</div>';
  }

  root.innerHTML = '<div class="bet-safe-shell">' + renderHero(key) + renderStats(pool, allCands, vip, hist) + content + '</div>';
}

W.setBetSafeDay = function(mode){
  state.dayMode = mode === 'tomorrow' ? 'tomorrow' : 'today';
  saveState();
  renderMain();
};
W.setBetSafeView = function(view){
  state.view = view === 'ultra' ? 'ultra' : 'all';
  saveState();
  renderMain();
};
W.setBetSafeScreen = function(screen){
  state.screen = screen === 'history' ? 'history' : 'live';
  saveState();
  renderMain();
};
W.setBetSafeHistoryDay = function(day){
  state.historyDay = day || dayKeyFromDate(new Date());
  state.screen = 'history';
  saveState();
  renderMain();
};
W.renderBetSafe = renderMain;

function hook(){
  if(W.__BetSafeHooksInstalledV2) return;
  W.__BetSafeHooksInstalledV2 = true;

  if(typeof W.renderActiveTab === 'function'){
    var oldRenderActive = W.renderActiveTab;
    W.renderActiveTab = function(name, opts){
      var result = oldRenderActive.apply(this, arguments);
      if(name === 'betsafe') renderMain();
      return result;
    };
  }

  if(typeof W.switchTab === 'function'){
    var oldSwitch = W.switchTab;
    W.switchTab = function(name){
      var result = oldSwitch.apply(this, arguments);
      if(name === 'betsafe') setTimeout(renderMain, 0);
      return result;
    };
  }

  if(typeof W.renderAll === 'function'){
    var oldRenderAll = W.renderAll;
    W.renderAll = function(){
      var result = oldRenderAll.apply(this, arguments);
      var active = D.querySelector('.tab-content.active');
      if(active && active.id === 'tab-betsafe') setTimeout(renderMain, 0);
      return result;
    };
  }
}

if(D.readyState === 'loading'){
  D.addEventListener('DOMContentLoaded', function(){ hook(); setTimeout(renderMain, 500); });
}else{
  hook(); setTimeout(renderMain, 500);
}

})();
