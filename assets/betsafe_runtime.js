(function(){
'use strict';

if(window.__VeyraBetSafeRuntimeV1) return;
window.__VeyraBetSafeRuntimeV1 = true;

var W = window;
var D = document;
var STORAGE = 'veyra_bet_safe_state_v1';
var state = readState();

function readState(){
  try{
    var raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    return {
      dayMode: raw.dayMode === 'tomorrow' ? 'tomorrow' : 'today',
      view: raw.view === 'ultra' ? 'ultra' : 'all'
    };
  }catch(e){ return {dayMode:'today', view:'all'}; }
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
function eventMs(m){
  var raw = m && (m.date || m.event_date || m.eventDate || m.start_time || m.kickoff || '');
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function matchDateKey(m){
  if(m && m.dateKey) return String(m.dateKey);
  var ms = eventMs(m);
  return ms ? dayKeyFromDate(new Date(ms)) : '';
}
function statusText(m){ return String((m && m.status) || '').toLowerCase(); }
function isFinished(m){
  var s = statusText(m);
  return ['finished','ft','aet','pen','cancelled','canceled','postponed','abandoned'].indexOf(s) >= 0;
}
function isUpcomingEnough(m){
  if(!m || isFinished(m)) return false;
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
function scoreLabel(m){
  if(m && m.status && isFinished(m) && m.homeScore != null && m.awayScore != null) return String(m.homeScore) + ' : ' + String(m.awayScore);
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
  if(prob < 72 || od < 1.01 || od > 1.36) return;

  var sourcePenalty = cfg.real ? 0 : 3.5;
  var oddsPenalty = od > 1.25 ? (od - 1.25) * 38 : 0;
  var xgBonus = Math.min(4, Math.max(0, n(m.xgTotal,0) - 1.8));
  var injuryPenalty = Math.min(5, Math.max(0, n(m.nUnavailHome,0) + n(m.nUnavailAway,0)) * 0.13);
  var confidenceBonus = Math.max(0, Math.min(4, (n(m.confidence,0) - 50) / 12));
  var score = prob + xgBonus + confidenceBonus - sourcePenalty - oddsPenalty - injuryPenalty + n(cfg.priority,0);

  var grade = 'watch';
  if(prob >= 91 && od <= 1.22) grade = 'ultra';
  else if(prob >= 86 && od <= 1.26) grade = 'safe';
  else if(prob >= 80 && od <= 1.30) grade = 'ok';

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
    source: cfg.source || (cfg.real ? 'cotă API' : 'fair/model'),
    marketKey: cfg.marketKey || cfg.market
  });
}
function addExistingBet(out,m,type,label,short,minProb,maxOdds,priority){
  var b = getBet(m,type);
  if(!b) return;
  var prob = Math.max(n(b.adjProb,0), n(b.prob,0));
  var od = n(b.odds || b.bestOdds || b.baseOdds,0);
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
    reason:'Model ' + pct(prob,1) + ' · ' + edgeTxt + ' · xG total ' + n(m.xgTotal,0).toFixed(2)
  });
}
function buildCandidatesForMatch(m){
  var out = [];
  if(!m || !isUpcomingEnough(m)) return out;

  addExistingBet(out,m,'under35','Sub 3.5 goluri','Under 3.5',82,1.28,4);
  addExistingBet(out,m,'over15','Peste 1.5 goluri','Over 1.5',78,1.28,2.5);
  addExistingBet(out,m,'dc1x','Șansă dublă 1X','1X',82,1.30,3);
  addExistingBet(out,m,'dcx2','Șansă dublă X2','X2',82,1.30,3);

  var homeGoalProb = poissonScoreAtLeastOne(m.xgHome);
  var awayGoalProb = poissonScoreAtLeastOne(m.xgAway);
  if(homeGoalProb >= 75){
    addCandidate(out,m,{
      market:'home_o05', label:(m.home || 'Gazde') + ' marchează 0.5+', short:'1-over 0.5 ⚽', prob:homeGoalProb,
      odds:fairOddsFromProb(homeGoalProb), real:false, priority:1.4, source:'fair din xG',
      reason:'xG gazde ' + n(m.xgHome,0).toFixed(2) + ' ⇒ șansă gol ' + pct(homeGoalProb,1) + '. Cota este fair/model, nu cotă bookmaker.'
    });
  }
  if(awayGoalProb >= 75){
    addCandidate(out,m,{
      market:'away_o05', label:(m.away || 'Oaspeți') + ' marchează 0.5+', short:'2-over 0.5 ⚽', prob:awayGoalProb,
      odds:fairOddsFromProb(awayGoalProb), real:false, priority:1.2, source:'fair din xG',
      reason:'xG oaspeți ' + n(m.xgAway,0).toFixed(2) + ' ⇒ șansă gol ' + pct(awayGoalProb,1) + '. Cota este fair/model, nu cotă bookmaker.'
    });
  }

  var intervalProb = poissonTotalBetween(n(m.xgTotal,0), 1, 4);
  if(intervalProb >= 86){
    addCandidate(out,m,{
      market:'goals_1_4', label:'Interval total 1–4 goluri', short:'1–4 goluri', prob:intervalProb,
      odds:fairOddsFromProb(intervalProb), real:false, priority:0.4, source:'fair din xG',
      reason:'xG total ' + n(m.xgTotal,0).toFixed(2) + ' ⇒ probabilitate interval 1–4: ' + pct(intervalProb,1) + '. Folosește doar dacă găsești piața disponibilă.'
    });
  }

  return out.sort(function(a,b){
    if(b.grade !== a.grade){
      var w = {ultra:4,safe:3,ok:2,watch:1};
      return (w[b.grade]||0) - (w[a.grade]||0);
    }
    if((b.score||0) !== (a.score||0)) return (b.score||0) - (a.score||0);
    return (b.prob||0) - (a.prob||0);
  }).slice(0,2);
}
function getPool(){
  var list = Array.isArray(W.ALL_MATCHES) ? W.ALL_MATCHES.slice() : [];
  var key = targetDayKey();
  return list.filter(function(m){ return matchDateKey(m) === key && isUpcomingEnough(m); })
    .sort(function(a,b){ return (eventMs(a)||0) - (eventMs(b)||0); });
}
function buildAllCandidates(){
  var seen = {};
  var raw = [];
  getPool().forEach(function(m){
    buildCandidatesForMatch(m).forEach(function(c){
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
function buildVip(candidates){
  var base = uniqueEvents(candidates)
    .filter(function(c){ return c.prob >= 86 && c.odds <= 1.24; })
    .slice(0,12);
  var combos = [];
  [3,2,1].forEach(function(len){ combinations(base, len, 0, [], combos); });
  var viable = combos.map(function(items){
    var st = comboStats(items);
    return {items:items, stats:st, strict:st.prob >= 90 && st.odds <= 1.30};
  }).filter(function(c){ return c.stats.odds <= 1.30; });

  var strict = viable.filter(function(c){ return c.strict; }).sort(function(a,b){
    if(b.items.length !== a.items.length) return b.items.length - a.items.length;
    if(Math.abs(1.24 - a.stats.odds) !== Math.abs(1.24 - b.stats.odds)) return Math.abs(1.24 - a.stats.odds) - Math.abs(1.24 - b.stats.odds);
    return b.stats.prob - a.stats.prob;
  })[0];
  if(strict) return strict;

  var fallback = viable.sort(function(a,b){
    if(b.stats.prob !== a.stats.prob) return b.stats.prob - a.stats.prob;
    return b.stats.odds - a.stats.odds;
  })[0];
  if(fallback) return fallback;
  if(base.length) return {items:[base[0]], stats:comboStats([base[0]]), strict:false};
  return null;
}
function gradeLabel(g){
  if(g === 'ultra') return 'ULTRA SAFE';
  if(g === 'safe') return 'SAFE';
  if(g === 'ok') return 'OK';
  return 'WATCH';
}
function renderStats(pool,cands,vip){
  var ultra = cands.filter(function(c){ return c.grade === 'ultra'; }).length;
  var real = cands.filter(function(c){ return c.real; }).length;
  var vipText = vip ? (odds(vip.stats.odds) + ' / ' + pct(vip.stats.prob,1)) : '—';
  return '<div class="bet-safe-stats">' +
    '<div class="bet-safe-stat"><b>' + pool.length + '</b><span>Meciuri azi din pool</span></div>' +
    '<div class="bet-safe-stat"><b>' + cands.length + '</b><span>Semnale safe generate</span></div>' +
    '<div class="bet-safe-stat"><b>' + ultra + '</b><span>Ultra safe</span></div>' +
    '<div class="bet-safe-stat"><b>' + esc(vipText) + '</b><span>VIP cotă / probabilitate</span></div>' +
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
    return '<div class="bet-safe-empty"><b>Nu am construit VIP.</b><br>Nu există încă semnale suficiente pentru cotă până la 1.30.</div>';
  }
  var dateKey = targetDayKey();
  var dayTitle = dateLabelForKey(dateKey).split(' · ')[0];
  var rows = vip.items.map(function(c){
    var m = c.match || {};
    return '<div class="bet-safe-vip-row">' +
      '<div class="bet-safe-vip-top"><div class="bet-safe-vip-league">' + esc(leagueLabel(m)) + '</div><div class="bet-safe-time">' + esc(m.timeLabel || '') + '</div></div>' +
      '<div class="bet-safe-vip-teams"><span>' + esc(m.home || 'Gazde') + '</span><strong class="bet-safe-score" style="font-size:20px;color:#f6b51d">- : -</strong><span>' + esc(m.away || 'Oaspeți') + '</span></div>' +
      '<div class="bet-safe-vip-pick"><span>' + esc(c.short || c.label) + '</span><em>' + (c.real ? '' : '≈') + esc(odds(c.odds)) + '</em></div>' +
    '</div>';
  }).join('');
  var warning = vip.strict ? '' : '<div class="bet-safe-warning">Nu forțez eticheta de „90%+ combinat”: cel mai bun bilet găsit are ' + esc(pct(vip.stats.prob,1)) + '. Pentru piramidă, joacă doar dacă accepți riscul sau coboară miza.</div>';
  var source = vip.items.every(function(c){ return c.real; }) ? 'toate cotele din API/odds' : 'include cote fair/model unde API-ul nu are piața';
  return '<div class="bet-safe-vip-box">' +
      '<div class="bet-safe-vip-day">👑 ' + esc(dayTitle) + ' · VIP Safe</div>' +
      '<div class="bet-safe-vip-list">' + rows + '</div>' +
    '</div>' +
    '<div class="bet-safe-vip-total">Total: ' + esc(odds(vip.stats.odds)) + '</div>' +
    '<div class="bet-safe-card-meta" style="padding:0 12px 2px">' +
      '<span class="bet-safe-mini green">Prob. combinată ' + esc(pct(vip.stats.prob,1)) + '</span>' +
      '<span class="bet-safe-mini gold">10 pași piramidă ≈ ' + esc(pct(vip.stats.tenSteps,1)) + '</span>' +
      '<span class="bet-safe-mini">' + esc(source) + '</span>' +
    '</div>' + warning;
}
function renderMain(){
  var root = D.getElementById('betsafe-root');
  if(!root) return;

  if(!Array.isArray(W.ALL_MATCHES) || !W.ALL_MATCHES.length){
    root.innerHTML = '<div class="bet-safe-shell"><div class="bet-safe-empty"><b>Se încarcă predicțiile...</b><br>Secțiunea Bet Safe pornește automat după ce se populează lista Meciuri.</div></div>';
    return;
  }

  var key = targetDayKey();
  var pool = getPool();
  var allCands = buildAllCandidates();
  var visible = state.view === 'ultra' ? allCands.filter(function(c){ return c.grade === 'ultra' || c.grade === 'safe'; }) : allCands;
  var vip = buildVip(allCands);

  var cards = visible.slice(0,20).map(renderCandidateCard).join('');
  if(!cards){
    cards = '<div class="bet-safe-empty"><b>Nu am semnale safe pentru ' + esc(state.dayMode === 'today' ? 'azi' : 'mâine') + '.</b><br>Filtrul nu forțează pariuri când probabilitatea/cota nu intră în zona safe. Verifică și tabul Meciuri sau schimbă pe ' + (state.dayMode === 'today' ? 'Mâine' : 'Azi') + '.</div>';
  }

  root.innerHTML = '<div class="bet-safe-shell">' +
    '<div class="bet-safe-hero">' +
      '<div class="bet-safe-hero-top">' +
        '<div><div class="bet-safe-title"><span class="bet-safe-title-badge">🛡️</span><span>Bet Safe</span></div>' +
        '<div class="bet-safe-sub">Listă construită din meciurile din aplicație pentru ziua selectată. Caută piețe cu risc mic: 1X/X2, Under 3.5, Over 1.5 și piețe estimate din xG, cu prioritate pentru cote mici până în zona 1.20–1.30.</div></div>' +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end"><span class="bet-safe-pill green">Piramidă friendly</span><span class="bet-safe-pill gold">Max VIP 1.30</span></div>' +
      '</div>' +
      '<div class="bet-safe-mode-row">' +
        '<button class="bet-safe-mode ' + (state.dayMode === 'today' ? 'active' : '') + '" onclick="setBetSafeDay(\'today\')">Today</button>' +
        '<button class="bet-safe-mode ' + (state.dayMode === 'tomorrow' ? 'active' : '') + '" onclick="setBetSafeDay(\'tomorrow\')">Tomorrow</button>' +
        '<div class="bet-safe-date-chip">' + esc(dateLabelForKey(key)) + '</div>' +
      '</div>' +
    '</div>' +
    renderStats(pool, allCands, vip) +
    '<div class="bet-safe-layout">' +
      '<div class="bet-safe-panel">' +
        '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">Tips Safe · ' + esc(state.dayMode === 'today' ? 'azi' : 'mâine') + '</div><div class="bet-safe-panel-sub">Nu sunt ponturi garantate; sunt shortlist-uri statistice cu cotă mică și probabilitate ridicată.</div></div>' +
        '<div class="bet-safe-toolbar"><button class="bet-safe-small-btn ' + (state.view === 'all' ? 'active' : '') + '" onclick="setBetSafeView(\'all\')">Toate</button><button class="bet-safe-small-btn ' + (state.view === 'ultra' ? 'active' : '') + '" onclick="setBetSafeView(\'ultra\')">Ultra/Safe</button></div></div>' +
        '<div class="bet-safe-list">' + cards + '</div>' +
      '</div>' +
      '<div class="bet-safe-panel">' +
        '<div class="bet-safe-panel-head"><div><div class="bet-safe-panel-title">👑 VIP Safe Combo</div><div class="bet-safe-panel-sub">1–3 selecții, cotă totală ≤ 1.30, țintă model ≥90% combinat.</div></div><span class="bet-safe-pill gold">auto</span></div>' +
        renderVip(vip) +
        '<div class="bet-safe-disclaimer"><b>Important:</b> probabilitatea combinată este produsul probabilităților modelului și presupune independență între evenimente. La 10 pași piramidali, riscul se multiplică rapid; secțiunea te ajută să nu forțezi bilet când nu există value/siguranță suficientă.</div>' +
      '</div>' +
    '</div>' +
  '</div>';
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
W.renderBetSafe = renderMain;

function hook(){
  if(W.__BetSafeHooksInstalled) return;
  W.__BetSafeHooksInstalled = true;

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
