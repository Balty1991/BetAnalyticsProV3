(function(){
'use strict';

if(window.__PyramidDailyRuntimeV4) return;
window.__PyramidDailyRuntimeV4 = true;

var W = window;
var D = document;

var STORAGE_SETTINGS = 'bet_pyramid_daily_settings';
var STORAGE_SESSIONS = 'bet_pyramid_daily_sessions';

var ACTIVE_PICKS = [];
var ACTIVE_REPORT = null;

var IDS = {
  stake:['pyramid-stake','pyrStake'],
  odds:['pyramid-target-odds','pyrTargetOdds','pyrOdds'],
  steps:['pyramid-steps','pyrSteps'],
  count:['pyramid-picks-count','pyrPickCount','pyrCount'],
  profile:['pyramid-profile','pyrProfile'],
  day:['pyramid-day-mode','pyrDayMode','pyrDay'],
  useRealOdds:['pyramid-use-real-odds','pyrUseRealOdds'],

  picks:['pyramid-picks-list','pyrPicks'],
  badge:['pyramid-picks-badge','pyrDailyBadge','pyrBadge'],
  summary:['pyramid-ticket-summary','pyrDailyMeta','pyrSummary'],
  topStats:['pyramid-top-stats','pyrTopStats'],
  plan:['pyramid-plan','pyrPlan'],
  sessionStats:['pyramid-session-stats','pyrSessionStats','pyrStats'],
  sessionList:['pyramid-session-list','pyrSessions','pyrList'],

  refreshBtn:['pyramid-refresh','pyrRefresh'],
  startBtn:['pyramid-start-session','pyrStartSession','pyrStart'],
  saveBtn:['pyramid-save-settings','pyrSave']
};

function first(list){
  for(var i=0;i<list.length;i++){
    var e = D.getElementById(list[i]);
    if(e) return e;
  }
  return null;
}
function el(k){ return first(IDS[k] || [k]); }

function esc(v){
  if(typeof W.htmlEsc === 'function') return W.htmlEsc(v);
  return String(v == null ? '' : v).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function n(v,fb){
  var x = Number(v);
  return isFinite(x) ? x : (fb || 0);
}
function pctRaw(v){
  var x = n(v,0);
  return Math.abs(x) <= 1 && x !== 0 ? x * 100 : x;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function money(v){
  return n(v,0).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' RON';
}
function fmt(v,d){ return n(v,0).toFixed(d == null ? 2 : d); }
function pct(v){ return fmt(v,1) + '%'; }
function signed(v,d){
  var x = n(v,0);
  return (x >= 0 ? '+' : '') + x.toFixed(d == null ? 1 : d);
}
function readJson(k,f){
  try{
    var raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : f;
  }catch(e){ return f; }
}
function writeJson(k,v){
  try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){}
}
function dateKeyFrom(v){
  var d = v ? new Date(v) : new Date();
  if(!isFinite(d.getTime())) d = new Date();
  if(typeof W.fmtDateKey === 'function'){
    try{ return W.fmtDateKey(d.toISOString()); }catch(e){}
  }
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function eventMs(x){
  if(typeof W.getEventDateMs === 'function'){
    try{ return W.getEventDateMs(x); }catch(e){}
  }
  var raw = x && (x.date || x.event_date || x.eventDate || x.start_time || x.startTime || x.kickoff);
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function eventKey(x){
  if(typeof W.getGenericEventKey === 'function'){
    try{ return W.getGenericEventKey(x); }catch(e){}
  }
  return [
    x && (x.eventId || x.event_id || x.id || x.fixture_id || ''),
    x && (x.home || x.homeTeam || x.home_name || ''),
    x && (x.away || x.awayTeam || x.away_name || ''),
    x && (x.date || x.event_date || x.eventDate || '')
  ].join('|').toLowerCase();
}
function correlated(a,b){
  if(!a || !b) return false;
  if(typeof W.areRowsCorrelated === 'function'){
    try{ return W.areRowsCorrelated(a,b); }catch(e){}
  }
  if(eventKey(a) === eventKey(b)) return true;
  var la = String(a.league || '').toLowerCase();
  var lb = String(b.league || '').toLowerCase();
  var ta = eventMs(a);
  var tb = eventMs(b);
  return !!(la && lb && la === lb && ta && tb && Math.abs(ta - tb) < 90 * 60000);
}

function defaultSettings(){
  return {
    stake:20,
    targetOdds:1.30,
    steps:4,
    profile:'ultra',
    dayMode:'today',
    useRealOdds:true
  };
}
function settings(raw){
  var d = defaultSettings();
  raw = raw || {};
  return {
    stake:clamp(n(raw.stake,d.stake),1,100000),
    targetOdds:clamp(n(raw.targetOdds,d.targetOdds),1.10,2.50),
    steps:Math.round(clamp(n(raw.steps,d.steps),4,10)),
    profile:['ultra','safe','balanced'].indexOf(String(raw.profile || d.profile)) >= 0 ? String(raw.profile || d.profile) : d.profile,
    dayMode:String(raw.dayMode || d.dayMode) === 'tomorrow' ? 'tomorrow' : 'today',
    useRealOdds:raw.useRealOdds === false || raw.useRealOdds === 'no' ? false : true
  };
}
function getSettings(){
  return settings(readJson(STORAGE_SETTINGS,defaultSettings()));
}
function saveSettingsFromUi(silent){
  var s = settings({
    stake:el('stake') ? el('stake').value : undefined,
    targetOdds:el('odds') ? el('odds').value : undefined,
    steps:el('steps') ? el('steps').value : undefined,
    profile:el('profile') ? el('profile').value : undefined,
    dayMode:el('day') ? el('day').value : undefined,
    useRealOdds:el('useRealOdds') ? el('useRealOdds').value !== 'no' : true
  });
  writeJson(STORAGE_SETTINGS,s);
  if(!silent && typeof W.toast === 'function') W.toast('Setări salvate', 'ok');
  return s;
}
function loadSettings(s){
  s = settings(s || getSettings());
  if(el('stake')) el('stake').value = String(s.stake).replace('.',',');
  if(el('odds')) el('odds').value = String(s.targetOdds).replace('.',',');
  if(el('steps')) el('steps').value = s.steps;
  if(el('profile')) el('profile').value = s.profile;
  if(el('day')) el('day').value = s.dayMode;
  if(el('useRealOdds')) el('useRealOdds').value = s.useRealOdds ? 'yes' : 'no';

  var c = el('count');
  if(c){
    c.value = '2';
    var wrap = c.closest('.pyr-field,.pyramid-field,div');
    if(wrap) wrap.style.display = 'none';
  }
}

function injectCompactCss(){
  if(D.getElementById('pyramid-daily-compact-js-css')) return;
  var css = D.createElement('style');
  css.id = 'pyramid-daily-compact-js-css';
  css.textContent = `
#tab-piramida{padding-bottom:92px!important;overflow-x:hidden!important}
#tab-piramida .pyramid-daily-shell,#tab-piramida .pyrBox{padding:8px!important;max-width:100%!important;overflow-x:hidden!important}
#tab-piramida .pyr-hero,#tab-piramida .pyramid-hero,#tab-piramida .pyr-panel,#tab-piramida .pyramid-panel{padding:10px!important;margin-bottom:9px!important;border-radius:15px!important}
#tab-piramida h2{font-size:17px!important;line-height:1.15!important;margin:0 0 5px!important}
#tab-piramida .pyr-muted,#tab-piramida .pyramid-muted,#tab-piramida .pyramid-engine-note,#tab-piramida .pyramid-engine-note span{font-size:10.5px!important;line-height:1.42!important}
#tab-piramida .pyr-title,#tab-piramida .pyramid-title{font-size:12px!important;margin-bottom:6px!important}
#tab-piramida .pyr-head,#tab-piramida .pyramid-head{gap:8px!important}
#tab-piramida .pyr-actions,#tab-piramida .pyramid-actions{display:grid!important;grid-template-columns:1fr 1fr 1fr!important;gap:6px!important;margin-top:8px!important}
#tab-piramida .pyr-actions .btn,#tab-piramida .pyramid-actions .btn{min-height:34px!important;padding:7px 8px!important;font-size:10px!important;border-radius:12px!important}
#tab-piramida .pyr-grid,#tab-piramida .pyramid-grid{grid-template-columns:1fr!important;gap:9px!important}
#tab-piramida .pyr-form,#tab-piramida .pyramid-form{grid-template-columns:1fr 1fr!important;gap:7px!important}
#tab-piramida label{font-size:8px!important;margin-bottom:3px!important}
#tab-piramida input,#tab-piramida select{height:36px!important;min-height:36px!important;border-radius:12px!important;font-size:12px!important;padding:0 10px!important}
#tab-piramida .pyramid-picks{grid-template-columns:1fr!important;gap:8px!important}
#tab-piramida .pyramid-pick{padding:10px!important;border-radius:14px!important}
#tab-piramida .pyramid-pick-rank{font-size:8.5px!important;margin-bottom:5px!important}
#tab-piramida .pyramid-pick-teams{font-size:12.5px!important;line-height:1.2!important}
#tab-piramida .pyramid-pick-meta{font-size:9.5px!important;margin-top:3px!important}
#tab-piramida .pyramid-pick-rec{padding:8px 10px!important;margin-top:8px!important;font-size:11px!important;border-radius:11px!important}
#tab-piramida .pyramid-metrics,#tab-piramida .pyrMini{grid-template-columns:1fr 1fr 1fr 1fr!important;gap:5px!important;margin-top:7px!important}
#tab-piramida .pyramid-mini{padding:7px 6px!important;border-radius:10px!important}
#tab-piramida .pyramid-mini-v{font-size:11.5px!important}
#tab-piramida .pyramid-mini-l{font-size:7px!important;margin-top:2px!important}
#tab-piramida .pyramid-engine-breakdown,#tab-piramida .pyramid-reasons{gap:4px!important;margin-top:6px!important}
#tab-piramida .pyramid-engine-breakdown span,#tab-piramida .pyramid-reasons span,#tab-piramida .pyramid-risk{font-size:7.8px!important;padding:3px 5px!important}
#tab-piramida .pyramid-stats,#tab-piramida .pyrStats{grid-template-columns:1fr 1fr!important;gap:6px!important;margin:8px 0!important}
#tab-piramida .pyramid-stat,#tab-piramida .pyrStat{padding:8px!important;border-radius:11px!important}
#tab-piramida .pyramid-stat-v,#tab-piramida .pyrStat b{font-size:14px!important}
#tab-piramida .pyramid-stat-l,#tab-piramida .pyrSmall{font-size:7.6px!important}
#tab-piramida .pyramid-plan-wrap{border-radius:11px!important}
#tab-piramida .pyramid-plan-table{min-width:560px!important;font-size:9px!important}
#tab-piramida .pyramid-plan-table th,#tab-piramida .pyramid-plan-table td{padding:7px 6px!important}
#tab-piramida .pyramid-step-chip{width:20px!important;height:20px!important;border-radius:7px!important}
#tab-piramida .pyramid-warn,#tab-piramida .pyr-warning{font-size:9.5px!important;line-height:1.35!important;padding:8px!important;margin-top:8px!important}
#tab-piramida .pyramid-empty{font-size:10.5px!important;line-height:1.42!important;padding:10px!important;border-radius:12px!important}
#tab-piramida .pyramid-session{padding:10px!important;border-radius:14px!important;margin-top:8px!important}
#tab-piramida .pyramid-session-name{font-size:11.5px!important}
#tab-piramida .pyramid-session-meta{font-size:9.5px!important;line-height:1.4!important}
#tab-piramida .pyramid-session-profit{font-size:12px!important}
#tab-piramida .pyramid-session-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important;padding:8px!important;border-radius:13px!important}
#tab-piramida .pyramid-session-actions .btn{width:100%!important;min-height:34px!important;font-size:10px!important;padding:7px!important}
@media(max-width:430px){
  #tab-piramida .pyr-form,#tab-piramida .pyramid-form{grid-template-columns:1fr!important}
  #tab-piramida .pyr-actions,#tab-piramida .pyramid-actions{grid-template-columns:1fr!important}
  #tab-piramida .pyramid-metrics,#tab-piramida .pyrMini{grid-template-columns:1fr 1fr!important}
}
`;
  D.head.appendChild(css);
}

function marketKey(v){
  var s = String(v || '').toLowerCase();
  if(s.indexOf('over 1.5') >= 0 || s.indexOf('peste 1.5') >= 0 || s === 'over15') return 'over15';
  if(s.indexOf('under 3.5') >= 0 || s.indexOf('sub 3.5') >= 0 || s === 'under35') return 'under35';
  if(s.indexOf('over 2.5') >= 0 || s.indexOf('peste 2.5') >= 0 || s === 'over25') return 'over25';
  if(s.indexOf('btts') >= 0 || s.indexOf('ambele') >= 0) return 'btts';
  if(s.indexOf('1x') >= 0) return '1x';
  if(s.indexOf('x2') >= 0) return 'x2';
  return s;
}
function marketLabel(k,fallback){
  if(fallback) return fallback;
  if(k === 'over15') return 'Over 1.5G';
  if(k === 'under35') return 'Under 3.5G';
  if(k === 'over25') return 'Over 2.5G';
  if(k === 'btts') return 'BTTS';
  if(k === '1x') return '1X';
  if(k === 'x2') return 'X2';
  return k || '—';
}

function rawPool(){
  var out = [];

  function add(x,source){
    if(!x) return;
    if(Array.isArray(x)){ x.forEach(function(y){ add(y,source); }); return; }
    var c = Object.assign({},x);
    c._sourceBucket = source || c._sourceBucket || '';
    out.push(c);
  }

  try{ if(typeof W.getPortfolioMatchPool === 'function') add(W.getPortfolioMatchPool(),'portfolio'); }catch(e){}
  try{ add(W.ALL_MATCHES,'all_matches'); }catch(e){}
  try{ add((W.SIGNAL_AUDIT || {}).rows,'audit'); }catch(e){}
  try{ add((W.AI_MEMORY || {}).adaptive_picks,'ai_memory'); }catch(e){}
  try{ add((W.AI_MEMORY || {}).picks,'ai_memory'); }catch(e){}
  try{ add(W.RECOMMENDATION_LOG,'recommendation_log'); }catch(e){}
  try{ add(W.RECOMMENDATION_JOURNAL,'recommendation_journal'); }catch(e){}
  try{
    if(W.BILETE){
      add(W.BILETE.premium && W.BILETE.premium.picks,'bilete');
      add(W.BILETE.double && W.BILETE.double.picks,'bilete');
      add(W.BILETE.triple && W.BILETE.triple.picks,'bilete');
    }
  }catch(e){}

  var expanded = [];
  out.forEach(function(x){
    if(!x) return;
    if(x.bestBet){
      var b = x.bestBet;
      expanded.push(Object.assign({},x,{
        marketKey:b.type || x.marketKey || x.market_key || '',
        market:b.label || x.market || '',
        odds:b.odds || x.odds || x.book_odds,
        prob:b.adjProb || b.prob || x.prob || x.adjusted_prob || x.final_probability,
        edge:b.edgePct || x.edge || x.edge_pct,
        value:b.value != null ? b.value : x.value,
        score:x.smartScore || x.score || x.adaptive_score || x.confidence
      }));
    }else{
      expanded.push(x);
    }
  });

  return expanded;
}

function normalize(x){
  if(!x) return null;

  var mk = marketKey(x.marketKey || x.market_key || x.market || x.pick || x.bet || x.type || x.prediction || '');
  var odds = n(x.odds || x.displayOdds || x.book_odds || x.bestOdds || x.price || 0,0);
  var prob = pctRaw(x.prob || x.adjusted_prob || x.final_probability || x.model_prob || x.api_prob || x.market_prob || x.confidence || 0);
  var score = pctRaw(x.score || x.smart_score || x.smartScore || x.adaptive_score || x.ticketScore || x.portfolioScore || x.confidence || 0);
  var edge = n(x.edge || x.edgeToPrice || x.edge_pct || x.edgePct || 0,0);
  var valuePct = pctRaw(x.value_pct != null ? x.value_pct : (x.value != null ? x.value : x.ev));
  var date = x.date || x.event_date || x.eventDate || x.start_time || x.startTime || '';
  var ms = eventMs(x);
  var createdAt = x.created_at || x.createdAt || null;
  var ageHours = n(x.age_hours,NaN);
  if(!isFinite(ageHours) && createdAt){
    ageHours = (Date.now() - new Date(createdAt).getTime()) / 36e5;
  }

  var home = x.home || x.homeTeam || x.home_name || x.home_team || '';
  var away = x.away || x.awayTeam || x.away_name || x.away_team || '';

  if(!home && x.match){
    var parts = String(x.match).split(/\s+vs\s+|\s+-\s+/i);
    home = parts[0] || '';
    away = parts[1] || '';
  }

  if(!home || !away) return null;
  if(!odds || odds < 1.05) return null;
  if(!prob) prob = Math.max(50, 100 / odds - 4);
  if(!score) score = prob;

  var c = Object.assign({},x,{
    eventKey:eventKey(x),
    home:home,
    away:away,
    league:x.league || x.competition || x.country || '—',
    date:date,
    dateKey:x.dateKey || (date ? dateKeyFrom(date) : ''),
    eventMs:ms,
    marketKey:mk,
    displayMarket:marketLabel(mk, x.displayMarket || x.market || x.pick || x.bet),
    odds:odds,
    displayOdds:odds,
    prob:prob,
    score:score,
    edge:edge,
    valuePct:valuePct,
    fairOdds:n(x.fair_odds || x.fairOdds || 0,0),
    xgTotal:n(x.xgTotal || x.xg_total || x.total_xg || x.expected_goals_total || 0,0),
    xgHome:n(x.xgHome || x.xg_home || x.home_xg || 0,0),
    xgAway:n(x.xgAway || x.xg_away || x.away_xg || 0,0),
    poissonProb:pctRaw(x.poisson_prob || x.poissonProb || 0),
    poissonDelta:n(x.poisson_delta || x.poissonDelta || 0,0),
    poissonAlert:!!(x.poisson_alert || x.poissonAlert),
    lineMove:n(x.line_movement_pct || x.lineMovementPct || x.from_open_pct || x.fromOpenPct || 0,0),
    journalScore:n(x.journal_score || 0,0),
    journalSample:n(x.journal_sample || x.journalSample || 0,0),
    kelly:n(x.kelly_quarter_pct || x.kellyQuarter || 0,0),
    ageHours:ageHours,
    sourceApi:!!(x.source_api || x.sourceApi),
    sourceHeuristic:x.source_heuristic !== false && x.sourceHeuristic !== false,
    reasonTags:Array.isArray(x.reason_tags) ? x.reason_tags : (Array.isArray(x.reasonTags) ? x.reasonTags : [])
  });

  c.ai = scoreCandidate(c);
  c.pyramidRank = c.ai.total;
  return c;
}

function scoreCandidate(c){
  var safety = clamp(c.prob * 0.58 + c.score * 0.22 + (c.poissonProb || c.prob) * 0.10 + Math.min(100, c.edge * 5 + 55) * 0.10,0,100);

  var market = 55;
  var reasons = [];

  if(c.marketKey === 'over15'){
    market += 18;
    if(c.xgTotal >= 2.25){ market += 8; reasons.push('xG bun pentru Over 1.5'); }
    if(c.xgTotal > 0 && c.xgTotal < 1.90){ market -= 10; reasons.push('xG jos'); }
  }else if(c.marketKey === 'under35'){
    market += 17;
    if(c.xgTotal > 0 && c.xgTotal <= 2.80){ market += 9; reasons.push('xG controlat'); }
    if(c.xgTotal >= 3.35){ market -= 14; reasons.push('xG ridicat'); }
  }else if(c.marketKey === 'over25'){
    market += 5;
    if(c.xgTotal >= 2.85){ market += 9; reasons.push('xG bun pentru Over 2.5'); }
    else market -= 8;
  }else if(c.marketKey === 'btts'){
    market += 2;
    if(c.xgHome >= .90 && c.xgAway >= .80){ market += 10; reasons.push('xG pe ambele echipe'); }
    else market -= 8;
  }else if(c.marketKey === '1x' || c.marketKey === 'x2'){
    market += 6;
  }else{
    market -= 12;
  }

  if(c.poissonProb >= 78) market += 5;
  if(c.poissonAlert) market -= 6;

  var history = 50;
  history += clamp(c.journalScore * 6,-12,18);
  if(c.journalSample >= 250) history += 5;
  else if(c.journalSample >= 80) history += 3;
  if(c.sourceApi && c.sourceHeuristic) history += 5;
  else if(c.sourceApi) history += 3;

  var value = 50;
  value += clamp(c.edge * 2.1,-18,26);
  value += clamp(c.valuePct * 1.0,-16,22);
  value += clamp(c.kelly * 1.4,0,8);

  var stability = 100;
  var risks = [];

  if(c.odds >= 1.80){ stability -= 18; risks.push('cotă volatilă'); }
  else if(c.odds >= 1.60){ stability -= 9; }

  if(c.poissonAlert){ stability -= 7; risks.push('Poisson alert'); }

  if(isFinite(c.ageHours)){
    if(c.ageHours > 120){ stability -= 16; risks.push('predicție veche'); }
    else if(c.ageHours > 72){ stability -= 8; }
  }

  if(c.eventMs){
    var h = (c.eventMs - Date.now()) / 36e5;
    if(h < -0.5){ stability -= 35; risks.push('meci expirat'); }
    else if(h >= 0.5 && h <= 24){ stability += 5; }
  }

  if(c.lineMove > 9){ stability -= 6; risks.push('cotă în urcare'); }
  if(c.lineMove < -9){ stability += 3; }

  var timing = 72;
  if(c.eventMs){
    var ht = (c.eventMs - Date.now()) / 36e5;
    if(ht >= .5 && ht <= 18) timing += 12;
    else if(ht > 18 && ht <= 42) timing += 5;
    else if(ht < .5) timing -= 18;
  }

  var total =
    safety * .31 +
    clamp(market,0,100) * .22 +
    clamp(history,0,100) * .16 +
    clamp(value,0,100) * .13 +
    clamp(stability,0,100) * .12 +
    clamp(timing,0,100) * .06;

  var allReasons = reasons.concat(c.reasonTags || []).slice(0,4);

  return {
    total:clamp(total,0,100),
    safety:clamp(safety,0,100),
    market:clamp(market,0,100),
    history:clamp(history,0,100),
    value:clamp(value,0,100),
    stability:clamp(stability,0,100),
    timing:clamp(timing,0,100),
    risks:risks,
    reasons:allReasons
  };
}

function windowFilter(c,s,relaxed){
  var now = Date.now();
  var ms = c.eventMs;

  if(!ms && !c.dateKey) return true;

  if(s.dayMode === 'tomorrow'){
    var d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+1);
    var start = d.getTime();
    var end = start + 24 * 36e5;
    if(ms) return relaxed ? ms >= now - 36e5 && ms <= now + 72 * 36e5 : ms >= start && ms < end;
    return relaxed ? true : c.dateKey === dateKeyFrom(start);
  }

  var endToday = new Date();
  endToday.setHours(23,59,59,999);
  if(ms) return relaxed ? ms >= now - 36e5 && ms <= now + 72 * 36e5 : ms >= now - 30 * 60000 && ms <= endToday.getTime();
  return relaxed ? true : c.dateKey === dateKeyFrom(new Date());
}

function cfg(profile,tier){
  var base;
  if(profile === 'balanced'){
    base = {minProb:60,minAi:58,maxOdds:2.10,minEdge:-5,maxCombo:4.30};
  }else if(profile === 'safe'){
    base = {minProb:64,minAi:62,maxOdds:1.95,minEdge:-3,maxCombo:3.60};
  }else{
    base = {minProb:68,minAi:66,maxOdds:1.80,minEdge:-2,maxCombo:3.10};
  }

  if(tier === 1){
    base.minProb -= 4;
    base.minAi -= 5;
    base.maxOdds += .20;
    base.minEdge -= 3;
    base.maxCombo += .45;
  }
  if(tier === 2){
    base.minProb -= 8;
    base.minAi -= 10;
    base.maxOdds += .45;
    base.minEdge -= 6;
    base.maxCombo += .90;
  }
  return base;
}

function buildCandidatePool(s){
  var all = rawPool().map(normalize).filter(Boolean);
  var seen = {};
  all = all.filter(function(c){
    var sig = c.eventKey + ':' + c.marketKey;
    if(seen[sig]) return false;
    seen[sig] = true;
    return true;
  });

  var lastReport = null;

  for(var tier=0;tier<=2;tier++){
    var conf = cfg(s.profile,tier);
    var relaxedWindow = tier > 0;
    var filtered = all.filter(function(c){
      if(!windowFilter(c,s,relaxedWindow)) return false;
      if(c.odds < 1.08 || c.odds > conf.maxOdds) return false;
      if(c.prob < conf.minProb) return false;
      if(c.ai.total < conf.minAi) return false;
      if(c.edge < conf.minEdge) return false;
      if(['over15','under35','over25','btts','1x','x2'].indexOf(c.marketKey) < 0) return false;
      return true;
    }).sort(function(a,b){
      if(b.ai.total !== a.ai.total) return b.ai.total - a.ai.total;
      if(b.prob !== a.prob) return b.prob - a.prob;
      return a.odds - b.odds;
    });

    lastReport = {
      raw:all.length,
      candidates:filtered.length,
      tier:tier,
      cfg:conf,
      relaxed:tier > 0
    };

    if(filtered.length) return {pool:filtered, report:lastReport};
  }

  return {pool:[], report:lastReport || {raw:all.length,candidates:0,tier:2}};
}

function comboProb(picks){
  return picks.reduce(function(a,p){ return a * (p.prob / 100); },1) * 100;
}
function comboOdds(picks){
  return picks.reduce(function(a,p){ return a * p.odds; },1);
}
function independencePenalty(picks){
  var p = 0;
  for(var i=0;i<picks.length;i++){
    for(var j=i+1;j<picks.length;j++){
      if(correlated(picks[i],picks[j])) p += 35;
      if(String(picks[i].league || '') === String(picks[j].league || '')) p += 5;
      if(picks[i].marketKey === picks[j].marketKey) p += 3;
      if(picks[i].eventMs && picks[j].eventMs && Math.abs(picks[i].eventMs - picks[j].eventMs) < 2 * 36e5) p += 4;
    }
  }
  return p;
}
function comboQuality(picks,s,maxCombo){
  var odds = comboOdds(picks);
  var prob = comboProb(picks);
  var ai = picks.reduce(function(a,p){ return a + p.ai.total; },0) / picks.length;
  var stab = picks.reduce(function(a,p){ return a + p.ai.stability; },0) / picks.length;
  var edge = picks.reduce(function(a,p){ return a + p.edge; },0) / picks.length;
  var pen = independencePenalty(picks);
  var target = Math.max(s.targetOdds,1.25);
  var oddsFit = 100 - Math.abs(odds - target) * 18;
  if(odds > maxCombo) oddsFit -= (odds - maxCombo) * 35;

  var longStreakBias = picks.length === 1 ? 9 : picks.length === 2 ? 2 : -6;

  var score =
    prob * .40 +
    ai * .28 +
    stab * .13 +
    clamp(oddsFit,0,100) * .10 +
    clamp(edge * 4,0,28) * .09 +
    longStreakBias -
    pen;

  return {score:score,odds:odds,prob:prob,ai:ai,stability:stab,penalty:pen};
}
function combinations(arr,k,limit){
  var res = [];
  function walk(start,cur){
    if(res.length >= limit) return;
    if(cur.length === k){ res.push(cur.slice()); return; }
    for(var i=start;i<arr.length;i++){
      var ok = true;
      for(var j=0;j<cur.length;j++){
        if(correlated(cur[j],arr[i])){ ok = false; break; }
      }
      if(!ok) continue;
      cur.push(arr[i]);
      walk(i+1,cur);
      cur.pop();
    }
  }
  walk(0,[]);
  return res;
}
function aiDecidePicks(s){
  var built = buildCandidatePool(s);
  var pool = built.pool;
  var report = built.report || {};
  report.mode = 'AI auto 1-3';
  report.reason = '';

  if(!pool.length){
    report.reason = 'Nu există niciun candidat suficient de bun după filtrele AI.';
    ACTIVE_REPORT = report;
    return [];
  }

  var conf = cfg(s.profile, report.tier || 0);
  var scan = pool.slice(0,26);
  var options = [];

  [1,2,3].forEach(function(k){
    combinations(scan,k,180).forEach(function(picks){
      var q = comboQuality(picks,s,conf.maxCombo);
      if(k === 1 && q.prob < 58) return;
      if(k === 2 && q.prob < 42 && s.profile === 'ultra') return;
      if(k === 3 && q.prob < 30 && s.profile === 'ultra') return;
      if(k === 3 && q.odds > conf.maxCombo) return;
      if(q.penalty >= 30) return;
      options.push({picks:picks,q:q});
    });
  });

  options.sort(function(a,b){ return b.q.score - a.q.score; });

  var best = options[0] || {picks:[pool[0]],q:comboQuality([pool[0]],s,conf.maxCombo)};

  report.candidates = pool.length;
  report.raw = report.raw || rawPool().length;
  report.selectedLegs = best.picks.length;
  report.combo = best.q;

  if(best.picks.length === 1){
    report.reason = 'AI a ales single: cea mai bună variantă pentru serie lungă și risc minim.';
  }else if(best.picks.length === 2){
    report.reason = 'AI a ales 2 evenimente: raport bun între cotă, probabilitate compusă și independență.';
  }else{
    report.reason = 'AI a ales 3 evenimente doar pentru că scorul compus a depășit variantele 1/2.';
  }

  if(report.relaxed){
    report.reason += ' Filtrul a fost relaxat automat ca să nu rămână secțiunea goală.';
  }

  ACTIVE_REPORT = report;
  return best.picks;
}

function renderTopStats(s,picks){
  var box = el('topStats');
  if(!box) return;
  var odds = picks.length ? comboOdds(picks) : 0;
  var prob = picks.length ? comboProb(picks) : 0;
  var avg = picks.length ? picks.reduce(function(a,p){ return a + p.ai.total; },0) / picks.length : 0;
  var r = ACTIVE_REPORT || {};
  box.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + (r.candidates || 0) + '</div><div class="pyramid-stat-l">Candidați AI</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + (odds ? fmt(odds,2) : '—') + '</div><div class="pyramid-stat-l">Cotă AI</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + (prob ? pct(prob) : '—') + '</div><div class="pyramid-stat-l">Prob. compusă</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (avg ? fmt(avg,0) : '—') + '</div><div class="pyramid-stat-l">Scor mediu</div></div>' +
    '</div>';
}
function mini(label,value,color){
  return '<div class="pyramid-mini"><div class="pyramid-mini-v"' + (color ? ' style="color:'+color+'"' : '') + '>' + value + '</div><div class="pyramid-mini-l">' + label + '</div></div>';
}
function pickCard(c,i){
  var dateText = '';
  if(c.date){
    try{
      var d = new Date(c.date);
      dateText = d.toLocaleDateString('ro-RO',{weekday:'short',day:'2-digit',month:'short'}) + ' ' +
        d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    }catch(e){}
  }
  var reasons = (c.ai.reasons || []).slice(0,3);
  if(!reasons.length){
    reasons = ['AI ' + fmt(c.ai.total,0), 'prob. ' + pct(c.prob), 'risc ' + fmt(100 - c.ai.stability,0)];
  }
  var risk = c.ai.risks && c.ai.risks.length ? '<span class="pyramid-risk">' + esc(c.ai.risks[0]) + '</span>' : '';

  return '<div class="pyramid-pick">' +
    '<div class="pyramid-pick-rank">Pick #' + (i+1) + ' · AI auto ' + risk + '</div>' +
    '<div class="pyramid-pick-teams">' + esc(c.home) + ' vs ' + esc(c.away) + '</div>' +
    '<div class="pyramid-pick-meta">' + esc(c.league || '—') + (dateText ? ' • ' + esc(dateText) : '') + '</div>' +
    '<div class="pyramid-pick-rec">🎯 ' + esc(c.displayMarket) + ' @ ' + fmt(c.odds,2) + '</div>' +
    '<div class="pyramid-metrics">' +
      mini('Prob.', pct(c.prob), 'var(--grn)') +
      mini('Cotă', fmt(c.odds,2), 'var(--yel)') +
      mini('AI', fmt(c.ai.total,0), 'var(--pur)') +
      mini('Risc', fmt(100 - c.ai.stability,0), c.ai.stability >= 74 ? 'var(--grn)' : 'var(--yel)') +
    '</div>' +
    '<div class="pyramid-engine-breakdown">' +
      '<span>Safety ' + fmt(c.ai.safety,0) + '</span>' +
      '<span>Piață ' + fmt(c.ai.market,0) + '</span>' +
      '<span>Istoric ' + fmt(c.ai.history,0) + '</span>' +
      '<span>Value ' + fmt(c.ai.value,0) + '</span>' +
    '</div>' +
    '<div class="pyramid-reasons">' + reasons.map(function(x){ return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
  '</div>';
}
function renderPicks(s){
  var target = el('picks');
  if(!target) return;

  ACTIVE_PICKS = aiDecidePicks(s);
  var picks = ACTIVE_PICKS;
  var r = ACTIVE_REPORT || {};

  renderTopStats(s,picks);

  if(el('badge')) el('badge').textContent = picks.length ? picks.length + ' AI' : '—';

  if(el('summary')){
    el('summary').innerHTML = picks.length
      ? 'AI: <b style="color:var(--acc)">' + picks.length + ' pick' + (picks.length>1?'-uri':'') + '</b> • cotă <b style="color:var(--yel)">' + fmt(comboOdds(picks),2) + '</b> • prob. <b style="color:var(--grn)">' + pct(comboProb(picks)) + '</b>'
      : 'AI nu recomandă intrare acum.';
  }

  if(!picks.length){
    target.innerHTML =
      '<div class="pyramid-empty">' +
        '<b>Nu intrăm forțat.</b><br>' +
        'Am verificat ' + (r.raw || 0) + ' înregistrări, dar nu există încă pick curat. Apasă Recalculează după refresh date sau schimbă ziua pe Mâine.' +
      '</div>';
    return;
  }

  target.innerHTML =
    '<div class="pyramid-engine-note"><b>Decizie AI:</b> ' + esc(r.reason || 'Selecție automată.') +
    '<br><span>AI a ales singur numărul de evenimente. Scorul combină probabilitate, cotă, value/edge, xG/Poisson, istoric, stabilitate, vechime predicție și corelație.</span></div>' +
    '<div class="pyramid-picks">' + picks.map(pickCard).join('') + '</div>';
}
function rowsForPlan(s,picks){
  var usedOdds = picks.length ? comboOdds(picks) : s.targetOdds;
  if(!s.useRealOdds) usedOdds = s.targetOdds;
  usedOdds = Math.max(1.10, usedOdds);

  var stake = s.stake;
  var rows = [];
  for(var i=1;i<=s.steps;i++){
    var gross = stake * usedOdds;
    rows.push({
      step:i,
      stake:stake,
      odds:usedOdds,
      gross:gross,
      withdraw:0,
      next:gross,
      profit:gross - s.stake
    });
    stake = gross;
  }
  return rows;
}
function renderPlan(s){
  var target = el('plan');
  if(!target) return;
  var picks = ACTIVE_PICKS || [];
  var rows = rowsForPlan(s,picks);
  var final = rows[rows.length-1] || {next:0};

  var stats =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + money(s.stake) + '</div><div class="pyramid-stat-l">Start</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + fmt(rows[0] ? rows[0].odds : s.targetOdds,2) + '</div><div class="pyramid-stat-l">Cotă pas</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + money(final.next) + '</div><div class="pyramid-stat-l">Final</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (picks.length ? pct(comboProb(picks)) : '—') + '</div><div class="pyramid-stat-l">Prob. AI</div></div>' +
    '</div>';

  var table =
    '<div class="pyramid-plan-wrap"><table class="pyramid-plan-table"><thead><tr>' +
      '<th>Pas</th><th>Miză</th><th>Cotă</th><th>Câștig</th><th>Retragere</th><th>Următoare</th><th>Profit</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr><td><span class="pyramid-step-chip">' + r.step + '</span></td><td>' + money(r.stake) + '</td><td>' + fmt(r.odds,2) + '</td><td>' + money(r.gross) + '</td><td>' + money(r.withdraw) + '</td><td>' + money(r.next) + '</td><td>' + money(r.profit) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';

  target.innerHTML = stats + table +
    '<div class="pyramid-warn">AI poate decide 1, 2 sau 3 evenimente. Pentru serii lungi, uneori cea mai bună decizie este single sau skip.</div>';
}

function sessions(){
  var a = readJson(STORAGE_SESSIONS,[]);
  return Array.isArray(a) ? a : [];
}
function saveSessions(a){ writeJson(STORAGE_SESSIONS,a || []); }
function profitSession(s){
  if(!s) return 0;
  if(s.status === 'lost') return -n(s.initialStake,0);
  return n(s.currentStake || s.initialStake,0) - n(s.initialStake,0);
}
function createSession(){
  var s = saveSettingsFromUi(true);
  var picks = ACTIVE_PICKS && ACTIVE_PICKS.length ? ACTIVE_PICKS : aiDecidePicks(s);
  if(!picks.length){
    if(typeof W.toast === 'function') W.toast('AI nu recomandă intrare acum.', 'warn');
    return;
  }

  var odds = s.useRealOdds ? comboOdds(picks) : s.targetOdds;
  var arr = sessions();
  arr.unshift({
    id:Date.now(),
    createdAt:new Date().toISOString(),
    status:'active',
    initialStake:s.stake,
    currentStake:s.stake,
    currentStep:1,
    targetSteps:s.steps,
    targetOdds:s.targetOdds,
    lastDailyOdds:odds,
    history:[],
    aiReport:ACTIVE_REPORT,
    picks:picks.map(function(p){
      return {
        home:p.home,
        away:p.away,
        league:p.league,
        market:p.displayMarket,
        odds:p.odds,
        prob:p.prob,
        aiScore:p.ai.total,
        date:p.date
      };
    })
  });
  saveSessions(arr.slice(0,60));
  renderSessions();
  if(typeof W.toast === 'function') W.toast('Sesiune pornită cu decizia AI.', 'ok');
}
function sessionAction(id,action){
  var arr = sessions();
  var s = arr.find(function(x){ return String(x.id) === String(id); });
  if(!s) return;
  s.history = Array.isArray(s.history) ? s.history : [];

  if(action === 'resume'){
    s.status = 'active';
    s.pausedAt = null;
  }

  if(s.status !== 'active'){
    saveSessions(arr);
    renderSessions();
    return;
  }

  if(action === 'win'){
    var before = n(s.currentStake || s.initialStake,0);
    var odds = n(s.lastDailyOdds || s.targetOdds,1.30);
    var after = +(before * odds).toFixed(2);
    s.history.push({
      step:n(s.currentStep,1),
      date:new Date().toISOString(),
      stakeBefore:before,
      odds:odds,
      returnAfter:after
    });
    s.currentStake = after;
    s.currentStep = n(s.currentStep,1) + 1;
    if(s.currentStep > n(s.targetSteps,4)) s.status = 'completed';
  }

  if(action === 'loss'){
    s.status = 'lost';
    s.closedAt = new Date().toISOString();
  }

  if(action === 'cashout'){
    s.status = 'cashout';
    s.closedAt = new Date().toISOString();
  }

  if(action === 'cancelToday'){
    s.status = 'paused';
    s.pausedAt = new Date().toISOString();
    s.pauseReason = 'Pas anulat azi';
  }

  saveSessions(arr);
  renderSessions();
}
function undoStep(id){
  var arr = sessions();
  var s = arr.find(function(x){ return String(x.id) === String(id); });
  if(!s) return;
  s.history = Array.isArray(s.history) ? s.history : [];
  if(!s.history.length){
    if(typeof W.toast === 'function') W.toast('Nu există pas WIN de șters.', 'warn');
    return;
  }
  var last = s.history.pop();
  s.currentStake = n(last.stakeBefore,s.initialStake);
  s.currentStep = n(last.step,1);
  s.status = 'active';
  saveSessions(arr);
  renderSessions();
  if(typeof W.toast === 'function') W.toast('Ultimul pas a fost șters.', 'ok');
}
function deleteSession(id){
  saveSessions(sessions().filter(function(s){ return String(s.id) !== String(id); }));
  renderSessions();
}
function renderSessions(){
  var st = el('sessionStats');
  var list = el('sessionList');
  if(!st || !list) return;

  var arr = sessions();
  var active = arr.filter(function(s){ return s.status === 'active'; }).length;
  var paused = arr.filter(function(s){ return s.status === 'paused'; }).length;
  var pos = arr.filter(function(s){ return s.status === 'completed' || s.status === 'cashout'; }).length;
  var profit = arr.reduce(function(a,s){ return a + profitSession(s); },0);

  st.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v">' + arr.length + '</div><div class="pyramid-stat-l">Total</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + active + '</div><div class="pyramid-stat-l">Active</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + paused + '</div><div class="pyramid-stat-l">Anulate azi</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(profit) + '</div><div class="pyramid-stat-l">Profit</div></div>' +
    '</div>';

  if(!arr.length){
    list.innerHTML = '<div class="pyramid-empty pyramid-empty-soft">Nu ai sesiuni monitorizate.</div>';
    return;
  }

  list.innerHTML = arr.slice(0,20).map(function(s){
    s.history = Array.isArray(s.history) ? s.history : [];

    var label =
      s.status === 'active' ? 'Activă' :
      s.status === 'paused' ? 'Anulată azi' :
      s.status === 'lost' ? 'Lost' :
      s.status === 'completed' ? 'Completă' : 'Cashout';

    var p = profitSession(s);
    var picks = (s.picks || []).map(function(x){
      return esc(x.home || '') + ' vs ' + esc(x.away || '') + ' • ' + esc(x.market || '') + ' @ ' + fmt(x.odds,2);
    }).join('<br>');

    var actions = '';
    if(s.status === 'active'){
      actions =
        '<button class="btn btn-green" onclick="pyramidDailyAction(\''+s.id+'\',\'win\')">✅ Pas WIN</button>' +
        '<button class="btn" onclick="pyramidDailyAction(\''+s.id+'\',\'cashout\')">💰 Cashout</button>' +
        '<button class="btn pyramid-danger" onclick="pyramidDailyAction(\''+s.id+'\',\'loss\')">❌ LOSS</button>' +
        '<button class="btn pyramid-warn-btn" onclick="pyramidDailyAction(\''+s.id+'\',\'cancelToday\')">⏸ Anulează azi</button>';
      if(s.history.length) actions += '<button class="btn" onclick="pyramidUndoLastStep(\''+s.id+'\')">↩ Șterge ultimul pas</button>';
    }else if(s.status === 'paused'){
      actions =
        '<button class="btn btn-green" onclick="pyramidDailyAction(\''+s.id+'\',\'resume\')">▶ Reia</button>' +
        (s.history.length ? '<button class="btn" onclick="pyramidUndoLastStep(\''+s.id+'\')">↩ Șterge pas</button>' : '') +
        '<button class="btn pyramid-danger" onclick="pyramidDeleteSession(\''+s.id+'\')">Șterge</button>';
    }else{
      actions = '<button class="btn" onclick="pyramidDeleteSession(\''+s.id+'\')">Șterge</button>';
    }

    var hist = s.history.length
      ? '<div class="pyramid-history">' + s.history.slice(-3).map(function(h){
          return 'Pas ' + h.step + ': ' + money(h.stakeBefore) + ' × ' + fmt(h.odds,2) + ' = ' + money(h.returnAfter);
        }).join('<br>') + '</div>'
      : '';

    return '<div class="pyramid-session">' +
      '<div class="pyramid-session-head">' +
        '<div>' +
          '<div class="pyramid-session-name">' + label + ' · Pas ' + Math.min(n(s.currentStep,1),n(s.targetSteps,4)) + '/' + n(s.targetSteps,4) + '</div>' +
          '<div class="pyramid-session-meta">Start ' + money(s.initialStake) + ' • curent ' + money(s.currentStake || s.initialStake) + ' • cotă ' + fmt(s.lastDailyOdds || s.targetOdds,2) + '<br>' + picks + '</div>' +
        '</div>' +
        '<div class="pyramid-session-profit" style="color:' + (p >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(p) + '</div>' +
      '</div>' +
      hist +
      '<div class="pyramid-session-actions">' + actions + '</div>' +
    '</div>';
  }).join('');
}

function bind(){
  injectCompactCss();

  var refresh = el('refreshBtn');
  if(refresh && !refresh.__pyrBound){
    refresh.__pyrBound = true;
    refresh.addEventListener('click',refreshPyramidDaily);
  }

  var start = el('startBtn');
  if(start && !start.__pyrBound){
    start.__pyrBound = true;
    start.addEventListener('click',createSession);
  }

  var save = el('saveBtn');
  if(save && !save.__pyrBound){
    save.__pyrBound = true;
    save.addEventListener('click',function(){
      saveSettingsFromUi(false);
      refreshPyramidDaily();
    });
  }

  ['stake','odds','steps','profile','day','useRealOdds'].forEach(function(k){
    var node = el(k);
    if(node && !node.__pyrBound){
      node.__pyrBound = true;
      node.addEventListener('change',function(){
        saveSettingsFromUi(true);
        refreshPyramidDaily();
      });
    }
  });

  var count = el('count');
  if(count){
    count.value = '2';
    var wrap = count.closest('.pyr-field,.pyramid-field,div');
    if(wrap) wrap.style.display = 'none';
  }
}

function renderPyramidDaily(){
  if(!D.getElementById('tab-piramida')) return;
  bind();
  var s = getSettings();
  loadSettings(s);
  renderPicks(s);
  renderPlan(s);
  renderSessions();
}
function refreshPyramidDaily(){
  var s = saveSettingsFromUi(true);
  renderPicks(s);
  renderPlan(s);
  renderSessions();
}

W.renderPyramidDaily = renderPyramidDaily;
W.refreshPyramidDaily = refreshPyramidDaily;
W.createPyramidDailySession = createSession;
W.pyramidDailyAction = sessionAction;
W.pyramidUndoLastStep = undoStep;
W.pyramidDeleteSession = deleteSession;

var oldSwitch = W.switchTab;
if(typeof oldSwitch === 'function' && !oldSwitch.__pyrAutoV4){
  var patched = function(name){
    var r = oldSwitch.apply(this,arguments);
    if(name === 'piramida') setTimeout(renderPyramidDaily,0);
    return r;
  };
  patched.__pyrAutoV4 = true;
  W.switchTab = patched;
}

var oldRefresh = W.doRefresh;
if(typeof oldRefresh === 'function' && !oldRefresh.__pyrAutoV4){
  var patchedRefresh = function(){
    var r = oldRefresh.apply(this,arguments);
    setTimeout(function(){
      var active = D.querySelector('.tab-content.active');
      if(active && active.id === 'tab-piramida') renderPyramidDaily();
    },900);
    return r;
  };
  patchedRefresh.__pyrAutoV4 = true;
  W.doRefresh = patchedRefresh;
}

D.addEventListener('DOMContentLoaded',function(){
  bind();
  var active = D.querySelector('.tab-content.active');
  if(active && active.id === 'tab-piramida') renderPyramidDaily();
});

setTimeout(bind,500);
setTimeout(function(){
  var active = D.querySelector('.tab-content.active');
  if(active && active.id === 'tab-piramida') renderPyramidDaily();
},1400);

})();
