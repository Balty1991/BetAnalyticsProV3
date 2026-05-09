(function(){
'use strict';

if(window.__PyramidDailyRuntimeV5) return;
window.__PyramidDailyRuntimeV5 = true;

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
    var node = D.getElementById(list[i]);
    if(node) return node;
  }
  return null;
}
function el(key){ return first(IDS[key] || [key]); }

function esc(v){
  if(typeof W.htmlEsc === 'function') return W.htmlEsc(v);
  return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function n(v, fb){
  if(typeof v === 'string') v = v.replace(',', '.').trim();
  var x = Number(v);
  return isFinite(x) ? x : (fb || 0);
}
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function money(v){
  return n(v,0).toLocaleString('ro-RO', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' RON';
}
function fmt(v, d){ return n(v,0).toFixed(d == null ? 2 : d); }
function pct(v){ return fmt(v,1) + '%'; }
function signed(v,d){
  var x = n(v,0);
  return (x >= 0 ? '+' : '') + x.toFixed(d == null ? 1 : d);
}
function pctRaw(v){
  var x = n(v,0);
  if(Math.abs(x) <= 1 && x !== 0) return x * 100;
  return x;
}
function readJson(k, fallback){
  try{
    var raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function writeJson(k, value){
  try{ localStorage.setItem(k, JSON.stringify(value)); }catch(e){}
}
function todayKeyFrom(v){
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
  var raw = x && (x.date || x.event_date || x.eventDate || x.start_time || x.startTime || x.kickoff || x.fixture_date);
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function eventKey(x){
  if(typeof W.getGenericEventKey === 'function'){
    try{ return W.getGenericEventKey(x); }catch(e){}
  }
  return [
    x && (x.eventId || x.event_id || x.id || x.fixture_id || ''),
    x && (x.home || x.homeTeam || x.home_name || x.home_team || ''),
    x && (x.away || x.awayTeam || x.away_name || x.away_team || ''),
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

  if(la && lb && la === lb && ta && tb && Math.abs(ta - tb) < 90 * 60000) return true;
  return false;
}

function defaultSettings(){
  return {
    stake: 20,
    targetOdds: 1.30,
    steps: 4,
    profile: 'ultra',
    dayMode: 'today',
    useRealOdds: true
  };
}
function sanitizeSettings(raw){
  var d = defaultSettings();
  raw = raw || {};
  return {
    stake: clamp(n(raw.stake, d.stake), 1, 100000),
    targetOdds: clamp(n(raw.targetOdds, d.targetOdds), 1.10, 3.00),
    steps: Math.round(clamp(n(raw.steps, d.steps), 4, 10)),
    profile: ['ultra','safe','balanced'].indexOf(String(raw.profile || d.profile)) >= 0 ? String(raw.profile || d.profile) : d.profile,
    dayMode: String(raw.dayMode || d.dayMode) === 'tomorrow' ? 'tomorrow' : 'today',
    useRealOdds: raw.useRealOdds === false || raw.useRealOdds === 'no' ? false : true
  };
}
function getSettings(){
  return sanitizeSettings(readJson(STORAGE_SETTINGS, defaultSettings()));
}
function saveSettingsFromUi(silent){
  var s = sanitizeSettings({
    stake: el('stake') ? el('stake').value : undefined,
    targetOdds: el('odds') ? el('odds').value : undefined,
    steps: el('steps') ? el('steps').value : undefined,
    profile: el('profile') ? el('profile').value : undefined,
    dayMode: el('day') ? el('day').value : undefined,
    useRealOdds: el('useRealOdds') ? el('useRealOdds').value !== 'no' : true
  });
  writeJson(STORAGE_SETTINGS, s);
  if(!silent && typeof W.toast === 'function') W.toast('Setări salvate', 'ok');
  return s;
}
function loadSettingsIntoUi(s){
  s = sanitizeSettings(s || getSettings());
  if(el('stake')) el('stake').value = String(s.stake).replace('.', ',');
  if(el('odds')) el('odds').value = String(s.targetOdds).replace('.', ',');
  if(el('steps')) el('steps').value = s.steps;
  if(el('profile')) el('profile').value = s.profile;
  if(el('day')) el('day').value = s.dayMode;
  if(el('useRealOdds')) el('useRealOdds').value = s.useRealOdds ? 'yes' : 'no';

  var c = el('count');
  if(c){
    c.value = 'auto';
    var wrap = c.closest('.pyr-field,.pyramid-field,div');
    if(wrap) wrap.style.display = 'none';
  }
}

/* =========================
   COMPACT MOBILE UI
========================= */
function injectCompactCss(){
  if(D.getElementById('pyramid-daily-compact-v5')) return;
  var style = D.createElement('style');
  style.id = 'pyramid-daily-compact-v5';
  style.textContent = `
  #tab-piramida{
    overflow-x:hidden!important;
    padding-bottom:88px!important;
  }
  #tab-piramida, #tab-piramida *{
    box-sizing:border-box!important;
  }
  #tab-piramida .pyramid-daily-shell,
  #tab-piramida .pyrBox{
    padding:6px!important;
    max-width:100%!important;
  }
  #tab-piramida .pyr-hero,
  #tab-piramida .pyramid-hero,
  #tab-piramida .pyr-panel,
  #tab-piramida .pyramid-panel{
    padding:9px!important;
    margin-bottom:8px!important;
    border-radius:14px!important;
  }
  #tab-piramida h2{
    font-size:15px!important;
    line-height:1.08!important;
    margin:0 0 4px!important;
  }
  #tab-piramida .pyr-title,
  #tab-piramida .pyramid-title{
    font-size:11px!important;
    margin:0 0 4px!important;
  }
  #tab-piramida .pyr-muted,
  #tab-piramida .pyramid-muted,
  #tab-piramida .pyramid-engine-note,
  #tab-piramida .pyramid-engine-note span,
  #tab-piramida .pyramid-empty,
  #tab-piramida .pyramid-warn{
    font-size:9.5px!important;
    line-height:1.28!important;
  }
  #tab-piramida .pyr-head,
  #tab-piramida .pyramid-head{
    gap:6px!important;
  }
  #tab-piramida .pyr-actions,
  #tab-piramida .pyramid-actions{
    display:grid!important;
    grid-template-columns:1fr 1fr 1fr!important;
    gap:5px!important;
    margin-top:6px!important;
  }
  #tab-piramida .pyr-actions .btn,
  #tab-piramida .pyramid-actions .btn{
    min-height:30px!important;
    height:30px!important;
    font-size:9px!important;
    padding:4px 6px!important;
    border-radius:10px!important;
    font-weight:800!important;
  }
  #tab-piramida .pyr-grid,
  #tab-piramida .pyramid-grid{
    display:grid!important;
    grid-template-columns:1fr!important;
    gap:8px!important;
  }
  #tab-piramida .pyr-form,
  #tab-piramida .pyramid-form{
    display:grid!important;
    grid-template-columns:1fr 1fr!important;
    gap:6px!important;
  }
  #tab-piramida label{
    font-size:7px!important;
    margin-bottom:2px!important;
    line-height:1.1!important;
  }
  #tab-piramida input,
  #tab-piramida select{
    height:32px!important;
    min-height:32px!important;
    padding:0 9px!important;
    font-size:11px!important;
    border-radius:10px!important;
  }
  #tab-piramida .pyramid-stats{
    display:grid!important;
    grid-template-columns:1fr 1fr!important;
    gap:5px!important;
    margin:6px 0!important;
  }
  #tab-piramida .pyramid-stat{
    padding:7px!important;
    border-radius:10px!important;
  }
  #tab-piramida .pyramid-stat-v{
    font-size:12px!important;
    line-height:1.1!important;
  }
  #tab-piramida .pyramid-stat-l{
    font-size:6.8px!important;
    margin-top:2px!important;
  }
  #tab-piramida .pyramid-picks{
    display:grid!important;
    grid-template-columns:1fr!important;
    gap:7px!important;
  }
  #tab-piramida .pyramid-pick{
    padding:8px!important;
    border-radius:12px!important;
  }
  #tab-piramida .pyramid-pick::before{
    top:8px!important;
    bottom:8px!important;
    width:2px!important;
  }
  #tab-piramida .pyramid-pick-rank{
    font-size:7.8px!important;
    margin-bottom:4px!important;
    letter-spacing:.08em!important;
    padding-left:6px!important;
  }
  #tab-piramida .pyramid-pick-teams{
    font-size:11.5px!important;
    line-height:1.16!important;
    padding-left:6px!important;
  }
  #tab-piramida .pyramid-pick-meta{
    font-size:8.5px!important;
    margin-top:2px!important;
    padding-left:6px!important;
  }
  #tab-piramida .pyramid-pick-rec{
    font-size:10px!important;
    padding:7px 8px!important;
    margin-top:6px!important;
    border-radius:10px!important;
  }
  #tab-piramida .pyramid-metrics{
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    gap:4px!important;
    margin-top:6px!important;
  }
  #tab-piramida .pyramid-mini{
    padding:6px 5px!important;
    border-radius:9px!important;
  }
  #tab-piramida .pyramid-mini-v{
    font-size:10px!important;
    line-height:1.05!important;
  }
  #tab-piramida .pyramid-mini-l{
    font-size:6.4px!important;
    margin-top:2px!important;
    line-height:1!important;
  }
  #tab-piramida .pyramid-engine-breakdown,
  #tab-piramida .pyramid-reasons{
    gap:3px!important;
    margin-top:5px!important;
  }
  #tab-piramida .pyramid-engine-breakdown span,
  #tab-piramida .pyramid-reasons span,
  #tab-piramida .pyramid-risk{
    font-size:6.9px!important;
    padding:3px 5px!important;
    border-radius:999px!important;
  }
  #tab-piramida .pyramid-plan-wrap{
    border-radius:10px!important;
  }
  #tab-piramida .pyramid-plan-table{
    min-width:520px!important;
    font-size:8.5px!important;
  }
  #tab-piramida .pyramid-plan-table th,
  #tab-piramida .pyramid-plan-table td{
    padding:6px 5px!important;
  }
  #tab-piramida .pyramid-step-chip{
    width:18px!important;
    height:18px!important;
    font-size:9px!important;
    border-radius:6px!important;
  }
  #tab-piramida .pyramid-session{
    padding:8px!important;
    border-radius:12px!important;
    margin-top:7px!important;
  }
  #tab-piramida .pyramid-session-name{
    font-size:10.8px!important;
  }
  #tab-piramida .pyramid-session-meta{
    font-size:8.8px!important;
    line-height:1.28!important;
    margin-top:4px!important;
  }
  #tab-piramida .pyramid-session-profit{
    font-size:11px!important;
  }
  #tab-piramida .pyramid-session-actions{
    display:grid!important;
    grid-template-columns:1fr 1fr!important;
    gap:5px!important;
    padding:7px!important;
    border-radius:12px!important;
    margin-top:7px!important;
  }
  #tab-piramida .pyramid-session-actions .btn{
    min-height:30px!important;
    height:30px!important;
    font-size:8.8px!important;
    padding:4px 5px!important;
    border-radius:10px!important;
  }
  #tab-piramida .pyramid-history{
    font-size:8px!important;
    line-height:1.28!important;
    margin-top:6px!important;
  }
  @media(max-width:430px){
    #tab-piramida .pyr-form,
    #tab-piramida .pyramid-form{
      grid-template-columns:1fr!important;
    }
    #tab-piramida .pyr-actions,
    #tab-piramida .pyramid-actions{
      grid-template-columns:1fr!important;
    }
    #tab-piramida .pyramid-metrics{
      grid-template-columns:1fr 1fr!important;
    }
  }`;
  D.head.appendChild(style);
}
function compactStaticText(){
  var all = D.querySelectorAll('#tab-piramida p, #tab-piramida .pyr-muted, #tab-piramida .pyramid-muted, #tab-piramida .section-subtitle');
  all.forEach(function(node){
    var txt = (node.textContent || '').trim();

    if(txt.indexOf('Rubrică pentru') >= 0){
      node.textContent = 'AI alege automat 1–3 evenimente, optimizate pentru cota țintă și risc controlat.';
    }
    if(txt.indexOf('Selectează doar vârful zilei') >= 0){
      node.textContent = 'AI caută automat cea mai bună combinație pentru ținta setată.';
    }
    if(txt.indexOf('După fiecare pas marchezi') >= 0){
      node.textContent = 'Monitor local sesiuni: WIN / LOSS / Cashout / Anulează azi.';
    }
  });
}

/* =========================
   DATA NORMALIZATION
========================= */
function marketKey(v){
  var s = String(v || '').toLowerCase().trim();
  if(s.indexOf('over 1.5') >= 0 || s.indexOf('peste 1.5') >= 0 || s === 'over15') return 'over15';
  if(s.indexOf('under 3.5') >= 0 || s.indexOf('sub 3.5') >= 0 || s === 'under35') return 'under35';
  if(s.indexOf('over 2.5') >= 0 || s.indexOf('peste 2.5') >= 0 || s === 'over25') return 'over25';
  if(s.indexOf('btts') >= 0 || s.indexOf('ambele') >= 0) return 'btts';
  if(s === '1x' || s.indexOf('double chance 1x') >= 0 || s.indexOf('șansă dublă 1x') >= 0) return '1x';
  if(s === 'x2' || s.indexOf('double chance x2') >= 0 || s.indexOf('șansă dublă x2') >= 0) return 'x2';
  return s;
}
function marketLabel(k, fallback){
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

  function add(v){
    if(!v) return;
    if(Array.isArray(v)){
      v.forEach(add);
      return;
    }
    out.push(v);
  }

  try{ if(typeof W.getPortfolioMatchPool === 'function') add(W.getPortfolioMatchPool()); }catch(e){}
  try{ add(W.ALL_MATCHES); }catch(e){}
  try{ add(W.MATCH_POOL); }catch(e){}
  try{ add(W.PORTFOLIO_MATCH_POOL); }catch(e){}
  try{ add((W.SIGNAL_AUDIT || {}).rows); }catch(e){}
  try{ add((W.AI_MEMORY || {}).adaptive_picks); }catch(e){}
  try{ add((W.AI_MEMORY || {}).picks); }catch(e){}
  try{ add(W.RECOMMENDATION_LOG); }catch(e){}
  try{ add(W.RECOMMENDATION_JOURNAL); }catch(e){}
  try{
    if(W.BILETE){
      add(W.BILETE.premium && W.BILETE.premium.picks);
      add(W.BILETE.double && W.BILETE.double.picks);
      add(W.BILETE.triple && W.BILETE.triple.picks);
    }
  }catch(e){}

  return out.reduce(function(acc, x){
    if(!x) return acc;

    if(x.bestBet){
      var b = x.bestBet;
      acc.push(Object.assign({}, x, {
        marketKey: b.type || x.marketKey || x.market_key || x.market || '',
        market: b.label || x.market || '',
        odds: b.odds || x.odds || x.book_odds || x.price,
        prob: b.adjProb || b.prob || x.prob || x.adjusted_prob || x.final_probability,
        edge: b.edgePct || x.edge || x.edge_pct || x.edgePct,
        value: b.value != null ? b.value : x.value,
        score: x.smartScore || x.score || x.adaptive_score || x.ticketScore || x.confidence
      }));
    } else {
      acc.push(x);
    }
    return acc;
  }, []);
}
function normalize(x){
  if(!x) return null;

  var mk = marketKey(x.marketKey || x.market_key || x.market || x.pick || x.bet || x.type || x.prediction || '');
  var odds = n(x.odds || x.displayOdds || x.book_odds || x.price || x.bestOdds || 0, 0);
  var prob = pctRaw(x.prob || x.adjusted_prob || x.final_probability || x.model_prob || x.api_prob || x.market_prob || x.confidence || 0);
  var score = pctRaw(x.score || x.smartScore || x.smart_score || x.adaptive_score || x.ticketScore || x.portfolioScore || x.confidence || 0);
  var edge = n(x.edge || x.edgeToPrice || x.edge_pct || x.edgePct || 0, 0);
  var valuePct = pctRaw(x.value_pct != null ? x.value_pct : (x.value != null ? x.value : x.ev));
  var date = x.date || x.event_date || x.eventDate || x.start_time || x.startTime || x.kickoff || '';
  var ms = eventMs(x);
  var createdAt = x.created_at || x.createdAt || null;
  var ageHours = n(x.age_hours, NaN);
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
  if(odds < 1.08) return null;

  if(!prob) prob = clamp((1 / odds) * 100 + 2, 50, 92);
  if(!score) score = prob;

  var c = Object.assign({}, x, {
    eventKey: eventKey(x),
    home: home,
    away: away,
    league: x.league || x.competition || x.country || '—',
    date: date,
    dateKey: x.dateKey || (date ? todayKeyFrom(date) : ''),
    eventMs: ms,
    marketKey: mk,
    displayMarket: marketLabel(mk, x.displayMarket || x.market || x.pick || x.bet),
    odds: odds,
    prob: prob,
    score: score,
    edge: edge,
    valuePct: valuePct,
    fairOdds: n(x.fair_odds || x.fairOdds || 0,0),
    xgTotal: n(x.xgTotal || x.xg_total || x.total_xg || x.expected_goals_total || 0,0),
    xgHome: n(x.xgHome || x.xg_home || x.home_xg || 0,0),
    xgAway: n(x.xgAway || x.xg_away || x.away_xg || 0,0),
    poissonProb: pctRaw(x.poisson_prob || x.poissonProb || 0),
    poissonDelta: n(x.poisson_delta || x.poissonDelta || 0,0),
    poissonAlert: !!(x.poisson_alert || x.poissonAlert),
    lineMove: n(x.line_movement_pct || x.lineMovementPct || x.from_open_pct || x.fromOpenPct || 0,0),
    journalScore: n(x.journal_score || 0,0),
    journalSample: n(x.journal_sample || x.journalSample || 0,0),
    kelly: n(x.kelly_quarter_pct || x.kellyQuarter || 0,0),
    ageHours: ageHours,
    sourceApi: !!(x.source_api || x.sourceApi),
    sourceHeuristic: x.source_heuristic !== false && x.sourceHeuristic !== false,
    reasonTags: Array.isArray(x.reason_tags) ? x.reason_tags : (Array.isArray(x.reasonTags) ? x.reasonTags : [])
  });

  c.ai = scoreCandidate(c);
  c.pyramidRank = c.ai.total;

  return c;
}

/* =========================
   SINGLE PICK AI SCORE
========================= */
function scoreCandidate(c){
  var safety = clamp(
    c.prob * 0.56 +
    c.score * 0.24 +
    (c.poissonProb || c.prob) * 0.10 +
    clamp(55 + c.edge * 4, 0, 100) * 0.10,
    0, 100
  );

  var market = 55;
  var reasons = [];

  if(c.marketKey === 'over15'){
    market += 18;
    if(c.xgTotal >= 2.20){ market += 8; reasons.push('xG bun'); }
    if(c.xgTotal > 0 && c.xgTotal < 1.90){ market -= 9; reasons.push('xG jos'); }
  }else if(c.marketKey === 'under35'){
    market += 18;
    if(c.xgTotal > 0 && c.xgTotal <= 2.85){ market += 9; reasons.push('xG controlat'); }
    if(c.xgTotal >= 3.30){ market -= 15; reasons.push('xG ridicat'); }
  }else if(c.marketKey === 'over25'){
    market += 6;
    if(c.xgTotal >= 2.80){ market += 10; reasons.push('xG ofensiv'); }
    else market -= 8;
  }else if(c.marketKey === 'btts'){
    market += 2;
    if(c.xgHome >= 0.95 && c.xgAway >= 0.85){ market += 10; reasons.push('xG pe ambele'); }
    else market -= 7;
  }else if(c.marketKey === '1x' || c.marketKey === 'x2'){
    market += 7;
  }else{
    market -= 12;
  }

  if(c.poissonProb >= 78) market += 5;
  if(c.poissonAlert) market -= 6;

  var history = 50;
  history += clamp(c.journalScore * 6, -12, 18);
  if(c.journalSample >= 250) history += 5;
  else if(c.journalSample >= 80) history += 3;
  if(c.sourceApi && c.sourceHeuristic) history += 4;
  else if(c.sourceApi) history += 2;

  var value = 50;
  value += clamp(c.edge * 2.2, -18, 26);
  value += clamp(c.valuePct * 0.9, -14, 18);
  value += clamp(c.kelly * 1.3, 0, 8);

  var stability = 100;
  var risks = [];

  if(c.odds >= 1.85){ stability -= 20; risks.push('cotă volatilă'); }
  else if(c.odds >= 1.65){ stability -= 10; }

  if(c.poissonAlert){ stability -= 8; risks.push('Poisson alert'); }

  if(isFinite(c.ageHours)){
    if(c.ageHours > 120){ stability -= 16; risks.push('predicție veche'); }
    else if(c.ageHours > 72){ stability -= 8; }
  }

  if(c.eventMs){
    var h = (c.eventMs - Date.now()) / 36e5;
    if(h < -0.5){ stability -= 35; risks.push('meci expirat'); }
    else if(h >= 0.5 && h <= 22){ stability += 4; }
  }

  if(c.lineMove > 8){ stability -= 7; risks.push('cotă urcă'); }
  if(c.lineMove < -8){ stability += 3; }

  var total =
    safety * 0.30 +
    clamp(market,0,100) * 0.22 +
    clamp(history,0,100) * 0.14 +
    clamp(value,0,100) * 0.13 +
    clamp(stability,0,100) * 0.21;

  return {
    total: clamp(total,0,100),
    safety: clamp(safety,0,100),
    market: clamp(market,0,100),
    history: clamp(history,0,100),
    value: clamp(value,0,100),
    stability: clamp(stability,0,100),
    risks: risks,
    reasons: reasons.concat(c.reasonTags || []).slice(0,4)
  };
}

/* =========================
   AI FILTERS & TARGET ENGINE
========================= */
function profileCfg(profile, tier){
  var cfg;
  if(profile === 'balanced'){
    cfg = {
      minProb: 58,
      minAi: 57,
      maxSingleOdds: 2.05,
      minEdge: -6
    };
  }else if(profile === 'safe'){
    cfg = {
      minProb: 62,
      minAi: 61,
      maxSingleOdds: 1.92,
      minEdge: -4
    };
  }else{
    cfg = {
      minProb: 66,
      minAi: 65,
      maxSingleOdds: 1.80,
      minEdge: -2
    };
  }

  if(tier === 1){
    cfg.minProb -= 4;
    cfg.minAi -= 4;
    cfg.maxSingleOdds += 0.18;
    cfg.minEdge -= 2;
  }
  if(tier === 2){
    cfg.minProb -= 8;
    cfg.minAi -= 8;
    cfg.maxSingleOdds += 0.35;
    cfg.minEdge -= 4;
  }
  return cfg;
}
function allowedWindow(c, settings, relaxed){
  var now = Date.now();
  var ms = c.eventMs;

  if(settings.dayMode === 'tomorrow'){
    var d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 1);
    var start = d.getTime();
    var end = start + 24*36e5;
    if(ms) return relaxed ? (ms >= now - 36e5 && ms <= now + 72*36e5) : (ms >= start && ms < end);
    return relaxed ? true : c.dateKey === todayKeyFrom(start);
  }

  var endToday = new Date();
  endToday.setHours(23,59,59,999);
  if(ms) return relaxed ? (ms >= now - 36e5 && ms <= now + 72*36e5) : (ms >= now - 30*60000 && ms <= endToday.getTime());
  return relaxed ? true : c.dateKey === todayKeyFrom(new Date());
}
function buildCandidatePool(settings){
  var all = rawPool().map(normalize).filter(Boolean);
  var seen = {};
  all = all.filter(function(c){
    var sig = c.eventKey + ':' + c.marketKey;
    if(seen[sig]) return false;
    seen[sig] = true;
    return true;
  });

  var report = null;

  for(var tier=0;tier<=2;tier++){
    var cfg = profileCfg(settings.profile, tier);
    var relaxed = tier > 0;

    var filtered = all.filter(function(c){
      if(!allowedWindow(c, settings, relaxed)) return false;
      if(['over15','under35','over25','btts','1x','x2'].indexOf(c.marketKey) < 0) return false;
      if(c.odds < 1.08 || c.odds > cfg.maxSingleOdds) return false;
      if(c.prob < cfg.minProb) return false;
      if(c.ai.total < cfg.minAi) return false;
      if(c.edge < cfg.minEdge) return false;
      return true;
    }).sort(function(a,b){
      if(b.ai.total !== a.ai.total) return b.ai.total - a.ai.total;
      if(b.prob !== a.prob) return b.prob - a.prob;
      return a.odds - b.odds;
    });

    report = { raw: all.length, candidates: filtered.length, tier: tier, relaxed: relaxed, cfg: cfg };

    if(filtered.length) return {pool: filtered, report: report};
  }

  return {pool: [], report: report || {raw: all.length, candidates: 0, tier: 2, relaxed: true}};
}
function comboOdds(picks){
  return picks.reduce(function(acc,p){ return acc * n(p.odds,1); }, 1);
}
function comboProb(picks){
  return picks.reduce(function(acc,p){ return acc * (n(p.prob,0) / 100); }, 1) * 100;
}
function avgAi(picks){
  return picks.reduce(function(acc,p){ return acc + n(p.ai.total,0); },0) / (picks.length || 1);
}
function avgStability(picks){
  return picks.reduce(function(acc,p){ return acc + n(p.ai.stability,0); },0) / (picks.length || 1);
}
function comboPenalty(picks){
  var pen = 0;
  for(var i=0;i<picks.length;i++){
    for(var j=i+1;j<picks.length;j++){
      if(correlated(picks[i], picks[j])) pen += 34;
      if(String(picks[i].league || '') === String(picks[j].league || '')) pen += 5;
      if(picks[i].marketKey === picks[j].marketKey) pen += 3;
      if(picks[i].eventMs && picks[j].eventMs && Math.abs(picks[i].eventMs - picks[j].eventMs) < 2 * 36e5) pen += 4;
    }
  }
  return pen;
}
function targetFitScore(odds, target){
  var minBand = target * 0.97;
  var idealLow = target * 0.99;
  var idealHigh = target * 1.08;
  var maxBand = target * 1.22;

  if(odds >= idealLow && odds <= idealHigh){
    return 100 - Math.abs(odds - target) * 40;
  }
  if(odds >= minBand && odds <= maxBand){
    return 82 - Math.abs(odds - target) * 48;
  }
  if(odds < minBand){
    return 58 - (minBand - odds) * 95;
  }
  return 50 - (odds - maxBand) * 80;
}
function targetReached(odds, target){
  return odds >= target * 0.97;
}
function comboQuality(picks, settings){
  var odds = comboOdds(picks);
  var prob = comboProb(picks);
  var ai = avgAi(picks);
  var stability = avgStability(picks);
  var edge = picks.reduce(function(acc,p){ return acc + n(p.edge,0); }, 0) / picks.length;
  var penalty = comboPenalty(picks);
  var target = n(settings.targetOdds, 1.30);
  var fit = targetFitScore(odds, target);

  var legBias = 0;
  if(picks.length === 1) legBias = 4;
  if(picks.length === 2) legBias = 0;
  if(picks.length === 3) legBias = -4;

  if(target >= 1.60 && picks.length === 1 && odds < target * 0.92){
    legBias -= 10; // descurajează single dacă e prea jos față de țintă
  }

  var score =
    prob * 0.35 +
    ai * 0.24 +
    stability * 0.14 +
    clamp(fit,0,100) * 0.22 +
    clamp(50 + edge * 4,0,100) * 0.05 +
    legBias -
    penalty;

  return {
    picks: picks,
    odds: odds,
    prob: prob,
    ai: ai,
    stability: stability,
    edge: edge,
    penalty: penalty,
    fit: fit,
    score: score,
    reached: targetReached(odds, target)
  };
}
function combinations(arr, k, limit){
  var res = [];
  function walk(start, cur){
    if(res.length >= limit) return;
    if(cur.length === k){
      res.push(cur.slice());
      return;
    }
    for(var i=start;i<arr.length;i++){
      var ok = true;
      for(var j=0;j<cur.length;j++){
        if(correlated(cur[j], arr[i])){ ok = false; break; }
      }
      if(!ok) continue;
      cur.push(arr[i]);
      walk(i+1, cur);
      cur.pop();
    }
  }
  walk(0, []);
  return res;
}
function aiDecidePicks(settings){
  var built = buildCandidatePool(settings);
  var pool = built.pool;
  var report = built.report || {};
  report.mode = 'smart-target';

  if(!pool.length){
    report.reason = 'Nu există candidați valizi după filtrare.';
    ACTIVE_REPORT = report;
    return [];
  }

  var scan = pool.slice(0, 18);
  var variants = [];

  [1,2,3].forEach(function(legs){
    combinations(scan, legs, 180).forEach(function(picks){
      var q = comboQuality(picks, settings);
      if(q.penalty >= 30) return;
      if(legs === 2 && q.prob < 40 && settings.profile === 'ultra') return;
      if(legs === 3 && q.prob < 27 && settings.profile === 'ultra') return;
      variants.push(q);
    });
  });

  if(!variants.length){
    var single = comboQuality([pool[0]], settings);
    report.reason = 'Fallback pe cel mai bun single.';
    report.selectedLegs = 1;
    report.combo = single;
    ACTIVE_REPORT = report;
    return single.picks;
  }

  var reached = variants.filter(function(v){ return v.reached; });
  var chosen;

  if(reached.length){
    reached.sort(function(a,b){
      if(b.score !== a.score) return b.score - a.score;
      if(b.prob !== a.prob) return b.prob - a.prob;
      return Math.abs(a.odds - settings.targetOdds) - Math.abs(b.odds - settings.targetOdds);
    });
    chosen = reached[0];
    report.reason = 'AI a ales combinația cu probabilitate maximă care atinge ținta setată.';
  } else {
    variants.sort(function(a,b){
      var da = Math.abs(a.odds - settings.targetOdds);
      var db = Math.abs(b.odds - settings.targetOdds);
      if(da !== db) return da - db;
      if(b.score !== a.score) return b.score - a.score;
      return b.prob - a.prob;
    });
    chosen = variants[0];
    report.reason = 'Nu există variantă care atinge exact ținta; AI a ales cea mai apropiată și cea mai productivă.';
  }

  report.raw = report.raw || rawPool().length;
  report.candidates = pool.length;
  report.selectedLegs = chosen.picks.length;
  report.combo = chosen;

  if(report.relaxed){
    report.reason += ' Filtrele au fost relaxate automat pentru a evita secțiune goală.';
  }

  ACTIVE_REPORT = report;
  return chosen.picks;
}

/* =========================
   RENDER UI
========================= */
function mini(label, value, color){
  return '<div class="pyramid-mini"><div class="pyramid-mini-v"' + (color ? ' style="color:'+color+'"' : '') + '>' + value + '</div><div class="pyramid-mini-l">' + label + '</div></div>';
}
function renderTopStats(settings, picks){
  var box = el('topStats');
  if(!box) return;

  var odds = picks.length ? comboOdds(picks) : 0;
  var prob = picks.length ? comboProb(picks) : 0;
  var avg = picks.length ? avgAi(picks) : 0;
  var report = ACTIVE_REPORT || {};

  box.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + (report.selectedLegs || 0) + '</div><div class="pyramid-stat-l">Evenimente AI</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + (odds ? fmt(odds,2) : '—') + '</div><div class="pyramid-stat-l">Cotă AI</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + (prob ? pct(prob) : '—') + '</div><div class="pyramid-stat-l">Prob. combo</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (avg ? fmt(avg,0) : '—') + '</div><div class="pyramid-stat-l">Scor AI</div></div>' +
    '</div>';
}
function pickCard(c, i){
  var dateText = '';
  if(c.date){
    try{
      var d = new Date(c.date);
      dateText = d.toLocaleDateString('ro-RO', {weekday:'short', day:'2-digit', month:'short'}) + ' ' +
                 d.toLocaleTimeString('ro-RO', {hour:'2-digit', minute:'2-digit'});
    }catch(e){}
  }
  var reasons = (c.ai.reasons || []).slice(0,3);
  if(!reasons.length){
    reasons = ['AI ' + fmt(c.ai.total,0), 'Prob. ' + pct(c.prob), 'Stab. ' + fmt(c.ai.stability,0)];
  }
  var risk = c.ai.risks && c.ai.risks.length ? '<span class="pyramid-risk">' + esc(c.ai.risks[0]) + '</span>' : '';

  return '<div class="pyramid-pick">' +
    '<div class="pyramid-pick-rank">Pick #' + (i+1) + ' · AI AUTO ' + risk + '</div>' +
    '<div class="pyramid-pick-teams">' + esc(c.home) + ' vs ' + esc(c.away) + '</div>' +
    '<div class="pyramid-pick-meta">' + esc(c.league || '—') + (dateText ? ' • ' + esc(dateText) : '') + '</div>' +
    '<div class="pyramid-pick-rec">🎯 ' + esc(c.displayMarket) + ' @ ' + fmt(c.odds,2) + '</div>' +
    '<div class="pyramid-metrics">' +
      mini('Prob.', pct(c.prob), 'var(--grn)') +
      mini('Cotă', fmt(c.odds,2), 'var(--yel)') +
      mini('AI', fmt(c.ai.total,0), 'var(--pur)') +
      mini('Stab.', fmt(c.ai.stability,0), c.ai.stability >= 74 ? 'var(--grn)' : 'var(--yel)') +
    '</div>' +
    '<div class="pyramid-engine-breakdown">' +
      '<span>Safety ' + fmt(c.ai.safety,0) + '</span>' +
      '<span>Piață ' + fmt(c.ai.market,0) + '</span>' +
      '<span>Istoric ' + fmt(c.ai.history,0) + '</span>' +
      '<span>Value ' + fmt(c.ai.value,0) + '</span>' +
    '</div>' +
    '<div class="pyramid-reasons">' + reasons.map(function(r){ return '<span>' + esc(r) + '</span>'; }).join('') + '</div>' +
  '</div>';
}
function renderPicks(settings){
  var target = el('picks');
  if(!target) return;

  ACTIVE_PICKS = aiDecidePicks(settings);
  var picks = ACTIVE_PICKS;
  var report = ACTIVE_REPORT || {};

  renderTopStats(settings, picks);

  if(el('badge')){
    el('badge').textContent = picks.length ? (picks.length + ' AI') : '—';
  }

  if(el('summary')){
    el('summary').innerHTML = picks.length
      ? 'AI: <b style="color:var(--acc)">' + picks.length + '</b> • țintă <b style="color:var(--yel)">' + fmt(settings.targetOdds,2) + '</b> • obținut <b style="color:var(--yel)">' + fmt(comboOdds(picks),2) + '</b> • prob. <b style="color:var(--grn)">' + pct(comboProb(picks)) + '</b>'
      : 'AI nu recomandă intrare acum.';
  }

  if(!picks.length){
    target.innerHTML =
      '<div class="pyramid-empty"><b>Nu există intrare bună acum.</b><br>' +
      'Am verificat ' + (report.raw || 0) + ' înregistrări. În acest moment nu există selecție suficient de curată pentru strategia piramidală.</div>';
    return;
  }

  target.innerHTML =
    '<div class="pyramid-engine-note"><b>Decizie AI:</b> ' + esc(report.reason || 'Selecție automată.') +
    '<br><span>AI decide singur 1, 2 sau 3 evenimente și urmărește în primul rând să atingă cota țintă cu probabilitate cât mai mare.</span></div>' +
    '<div class="pyramid-picks">' + picks.map(pickCard).join('') + '</div>';
}
function planRows(settings, picks){
  var odds = picks.length ? comboOdds(picks) : settings.targetOdds;
  if(!settings.useRealOdds) odds = settings.targetOdds;
  odds = Math.max(1.10, odds);

  var rows = [];
  var stake = n(settings.stake, 0);
  for(var i=1;i<=settings.steps;i++){
    var gross = stake * odds;
    rows.push({
      step: i,
      stake: stake,
      odds: odds,
      gross: gross,
      withdraw: 0,
      next: gross,
      profit: gross - settings.stake
    });
    stake = gross;
  }
  return rows;
}
function renderPlan(settings){
  var box = el('plan');
  if(!box) return;
  var picks = ACTIVE_PICKS || [];
  var rows = planRows(settings, picks);
  var final = rows[rows.length - 1] || {next:0};

  box.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + money(settings.stake) + '</div><div class="pyramid-stat-l">Start</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + fmt(rows[0] ? rows[0].odds : settings.targetOdds,2) + '</div><div class="pyramid-stat-l">Cotă pas</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + money(final.next) + '</div><div class="pyramid-stat-l">Final</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (picks.length ? pct(comboProb(picks)) : '—') + '</div><div class="pyramid-stat-l">Prob. AI</div></div>' +
    '</div>' +
    '<div class="pyramid-plan-wrap"><table class="pyramid-plan-table"><thead><tr>' +
      '<th>Pas</th><th>Miză</th><th>Cotă</th><th>Câștig</th><th>Retragere</th><th>Următoare</th><th>Profit</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr><td><span class="pyramid-step-chip">' + r.step + '</span></td><td>' + money(r.stake) + '</td><td>' + fmt(r.odds,2) + '</td><td>' + money(r.gross) + '</td><td>' + money(r.withdraw) + '</td><td>' + money(r.next) + '</td><td>' + money(r.profit) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    '<div class="pyramid-warn">AI poate alege până la 3 evenimente. Dacă există variantă bună care atinge ținta, o preferă. Dacă nu, alege cea mai apropiată variantă cu probabilitate mai mare.</div>';
}

/* =========================
   SESSIONS
========================= */
function getSessions(){
  var arr = readJson(STORAGE_SESSIONS, []);
  return Array.isArray(arr) ? arr : [];
}
function saveSessions(arr){
  writeJson(STORAGE_SESSIONS, arr || []);
}
function sessionProfit(s){
  if(!s) return 0;
  if(s.status === 'lost') return -n(s.initialStake,0);
  return n(s.currentStake || s.initialStake,0) - n(s.initialStake,0);
}
function createSession(){
  var settings = saveSettingsFromUi(true);
  var picks = ACTIVE_PICKS && ACTIVE_PICKS.length ? ACTIVE_PICKS : aiDecidePicks(settings);
  if(!picks.length){
    if(typeof W.toast === 'function') W.toast('AI nu recomandă intrare acum.', 'warn');
    return;
  }

  var odds = settings.useRealOdds ? comboOdds(picks) : settings.targetOdds;
  var arr = getSessions();

  arr.unshift({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    status: 'active',
    initialStake: settings.stake,
    currentStake: settings.stake,
    currentStep: 1,
    targetSteps: settings.steps,
    targetOdds: settings.targetOdds,
    lastDailyOdds: odds,
    history: [],
    aiReport: ACTIVE_REPORT,
    picks: picks.map(function(p){
      return {
        home: p.home,
        away: p.away,
        league: p.league,
        market: p.displayMarket,
        odds: p.odds,
        prob: p.prob,
        aiScore: p.ai.total,
        date: p.date
      };
    })
  });

  saveSessions(arr.slice(0, 60));
  renderSessions();
  if(typeof W.toast === 'function') W.toast('Sesiune pornită', 'ok');
}
function sessionAction(id, action){
  var arr = getSessions();
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
    var before = n(s.currentStake || s.initialStake, 0);
    var odds = n(s.lastDailyOdds || s.targetOdds, 1.30);
    var after = +(before * odds).toFixed(2);
    s.history.push({
      step: n(s.currentStep,1),
      date: new Date().toISOString(),
      stakeBefore: before,
      odds: odds,
      returnAfter: after
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
  var arr = getSessions();
  var s = arr.find(function(x){ return String(x.id) === String(id); });
  if(!s) return;
  s.history = Array.isArray(s.history) ? s.history : [];
  if(!s.history.length){
    if(typeof W.toast === 'function') W.toast('Nu există pas WIN de șters.', 'warn');
    return;
  }
  var last = s.history.pop();
  s.currentStake = n(last.stakeBefore, s.initialStake);
  s.currentStep = n(last.step, 1);
  s.status = 'active';
  saveSessions(arr);
  renderSessions();
  if(typeof W.toast === 'function') W.toast('Ultimul pas a fost șters.', 'ok');
}
function deleteSession(id){
  saveSessions(getSessions().filter(function(s){ return String(s.id) !== String(id); }));
  renderSessions();
}
function renderSessions(){
  var stats = el('sessionStats');
  var list = el('sessionList');
  if(!stats || !list) return;

  var arr = getSessions();
  var active = arr.filter(function(s){ return s.status === 'active'; }).length;
  var paused = arr.filter(function(s){ return s.status === 'paused'; }).length;
  var profit = arr.reduce(function(a,s){ return a + sessionProfit(s); }, 0);

  stats.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v">' + arr.length + '</div><div class="pyramid-stat-l">Total</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + active + '</div><div class="pyramid-stat-l">Active</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + paused + '</div><div class="pyramid-stat-l">Anulate azi</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(profit) + '</div><div class="pyramid-stat-l">Profit</div></div>' +
    '</div>';

  if(!arr.length){
    list.innerHTML = '<div class="pyramid-empty">Nu ai sesiuni monitorizate.</div>';
    return;
  }

  list.innerHTML = arr.slice(0,20).map(function(s){
    s.history = Array.isArray(s.history) ? s.history : [];
    var label =
      s.status === 'active' ? 'Activă' :
      s.status === 'paused' ? 'Anulată azi' :
      s.status === 'lost' ? 'Lost' :
      s.status === 'completed' ? 'Completă' : 'Cashout';

    var prof = sessionProfit(s);
    var picks = (s.picks || []).map(function(p){
      return esc(p.home || '') + ' vs ' + esc(p.away || '') + ' • ' + esc(p.market || '') + ' @ ' + fmt(p.odds,2);
    }).join('<br>');

    var actions = '';
    if(s.status === 'active'){
      actions =
        '<button class="btn btn-green" onclick="pyramidDailyAction(\''+s.id+'\',\'win\')">✅ WIN</button>' +
        '<button class="btn" onclick="pyramidDailyAction(\''+s.id+'\',\'cashout\')">💰 Cashout</button>' +
        '<button class="btn pyramid-danger" onclick="pyramidDailyAction(\''+s.id+'\',\'loss\')">❌ LOSS</button>' +
        '<button class="btn pyramid-warn-btn" onclick="pyramidDailyAction(\''+s.id+'\',\'cancelToday\')">⏸ Anulează azi</button>';
      if(s.history.length){
        actions += '<button class="btn" onclick="pyramidUndoLastStep(\''+s.id+'\')">↩ Șterge pas</button>';
      }
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
          '<div class="pyramid-session-name">' + label + ' · Pas ' + Math.min(n(s.currentStep,1), n(s.targetSteps,4)) + '/' + n(s.targetSteps,4) + '</div>' +
          '<div class="pyramid-session-meta">Start ' + money(s.initialStake) + ' • curent ' + money(s.currentStake || s.initialStake) + ' • cotă ' + fmt(s.lastDailyOdds || s.targetOdds,2) + '<br>' + picks + '</div>' +
        '</div>' +
        '<div class="pyramid-session-profit" style="color:' + (prof >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(prof) + '</div>' +
      '</div>' +
      hist +
      '<div class="pyramid-session-actions">' + actions + '</div>' +
    '</div>';
  }).join('');
}

/* =========================
   BIND / RENDER
========================= */
function bind(){
  injectCompactCss();
  compactStaticText();

  var refresh = el('refreshBtn');
  if(refresh && !refresh.__pyrBound){
    refresh.__pyrBound = true;
    refresh.addEventListener('click', refreshPyramidDaily);
  }

  var start = el('startBtn');
  if(start && !start.__pyrBound){
    start.__pyrBound = true;
    start.addEventListener('click', createSession);
  }

  var save = el('saveBtn');
  if(save && !save.__pyrBound){
    save.__pyrBound = true;
    save.addEventListener('click', function(){
      saveSettingsFromUi(false);
      refreshPyramidDaily();
    });
  }

  ['stake','odds','steps','profile','day','useRealOdds'].forEach(function(k){
    var node = el(k);
    if(node && !node.__pyrBound){
      node.__pyrBound = true;
      node.addEventListener('change', function(){
        saveSettingsFromUi(true);
        refreshPyramidDaily();
      });
    }
  });

  var c = el('count');
  if(c){
    c.value = 'auto';
    var wrap = c.closest('.pyr-field,.pyramid-field,div');
    if(wrap) wrap.style.display = 'none';
  }
}
function renderPyramidDaily(){
  if(!D.getElementById('tab-piramida')) return;
  bind();
  var s = getSettings();
  loadSettingsIntoUi(s);
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

/* exports */
W.renderPyramidDaily = renderPyramidDaily;
W.refreshPyramidDaily = refreshPyramidDaily;
W.createPyramidDailySession = createSession;
W.pyramidDailyAction = sessionAction;
W.pyramidUndoLastStep = undoStep;
W.pyramidDeleteSession = deleteSession;

/* patch switchTab */
var oldSwitch = W.switchTab;
if(typeof oldSwitch === 'function' && !oldSwitch.__pyrV5){
  var patchedSwitch = function(name){
    var r = oldSwitch.apply(this, arguments);
    if(name === 'piramida') setTimeout(renderPyramidDaily, 0);
    return r;
  };
  patchedSwitch.__pyrV5 = true;
  W.switchTab = patchedSwitch;
}

/* patch doRefresh */
var oldRefresh = W.doRefresh;
if(typeof oldRefresh === 'function' && !oldRefresh.__pyrV5){
  var patchedRefresh = function(){
    var r = oldRefresh.apply(this, arguments);
    setTimeout(function(){
      var active = D.querySelector('.tab-content.active');
      if(active && active.id === 'tab-piramida') renderPyramidDaily();
    }, 900);
    return r;
  };
  patchedRefresh.__pyrV5 = true;
  W.doRefresh = patchedRefresh;
}

D.addEventListener('DOMContentLoaded', function(){
  bind();
  var active = D.querySelector('.tab-content.active');
  if(active && active.id === 'tab-piramida') renderPyramidDaily();
});

setTimeout(bind, 500);
setTimeout(function(){
  var active = D.querySelector('.tab-content.active');
  if(active && active.id === 'tab-piramida') renderPyramidDaily();
}, 1400);

})();
