(function(){
'use strict';

if(window.__PyramidDailyRuntimeV18) return;
window.__PyramidDailyRuntimeV18 = true;

var W = window;
var D = document;

var STORAGE_SETTINGS = 'bet_pyramid_daily_settings';
var STORAGE_SESSIONS = 'bet_pyramid_daily_sessions';

var ACTIVE_PICKS = [];
var ACTIVE_REPORT = null;
var GENERATOR_CLEARED = true;
var SELECTED_SESSION_ID = null;

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
  return String(v == null ? '' : v).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function n(v, fallback){
  if(typeof v === 'string') v = v.replace(',', '.').trim();
  var x = Number(v);
  return isFinite(x) ? x : (fallback || 0);
}
function maybeNumber(v){
  if(v == null) return null;
  var s = String(v).replace(',', '.').trim();
  if(!s) return null;
  var x = Number(s);
  return isFinite(x) ? x : null;
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function money(v){
  return n(v,0).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' RON';
}
function moneyCompact(v){
  return n(v,0).toLocaleString('ro-RO',{minimumFractionDigits:0,maximumFractionDigits:2}) + ' RON';
}
function fmt(v,d){ return n(v,0).toFixed(d == null ? 2 : d); }
function pct(v){ return fmt(v,1) + '%'; }
function pctRaw(v){
  var x = n(v,0);
  return Math.abs(x) <= 1 && x !== 0 ? x * 100 : x;
}
function readJson(key,fallback){
  try{
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function writeJson(key,value){
  try{ localStorage.setItem(key,JSON.stringify(value)); }catch(e){}
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

  var raw = x && (
    x.date ||
    x.event_date ||
    x.eventDate ||
    x.start_time ||
    x.startTime ||
    x.kickoff ||
    x.fixture_date
  );

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

  return !!(la && lb && la === lb && ta && tb && Math.abs(ta - tb) < 90 * 60000);
}

/* =========================================================
   SETTINGS
========================================================= */

function defaultSettings(){
  return {
    stake:20,
    targetOdds:null,
    steps:4,
    maxPicks:null,
    dayMode:'today',
    useRealOdds:true
  };
}
function sanitizeSettings(raw){
  var d = defaultSettings();
  raw = raw || {};

  var target = null;
  if(raw.targetOdds !== null && raw.targetOdds !== '' && raw.targetOdds !== undefined){
    target = clamp(n(raw.targetOdds,0),1.10,100);
  }

  return {
    stake:clamp(n(raw.stake,d.stake),1,100000),
    targetOdds:target,
    steps:Math.round(clamp(n(raw.steps,d.steps),1,30)),
    maxPicks:null,
    dayMode:String(raw.dayMode || d.dayMode) === 'tomorrow' ? 'tomorrow' : 'today',
    useRealOdds:raw.useRealOdds === false || raw.useRealOdds === 'no' ? false : true
  };
}
function getSettings(){
  return sanitizeSettings(readJson(STORAGE_SETTINGS,defaultSettings()));
}
function hasUserCriteria(s){
  s = sanitizeSettings(s || getSettings());
  return !!s.targetOdds;
}
function saveSettingsFromUi(silent){
  var targetInput = el('odds');
  var target = targetInput ? maybeNumber(targetInput.value) : null;

  var s = sanitizeSettings({
    stake:el('stake') ? el('stake').value : undefined,
    targetOdds:target,
    steps:el('steps') ? el('steps').value : undefined,
    maxPicks:null,
    dayMode:el('day') ? el('day').value : undefined,
    useRealOdds:el('useRealOdds') ? el('useRealOdds').value !== 'no' : true
  });

  writeJson(STORAGE_SETTINGS,s);

  if(!silent && typeof W.toast === 'function'){
    W.toast('Setări salvate', 'ok');
  }

  return s;
}
function loadSettingsIntoUi(s){
  s = sanitizeSettings(s || getSettings());

  if(el('stake')) el('stake').value = String(s.stake).replace('.', ',');
  if(el('odds')){
    el('odds').value = s.targetOdds ? String(s.targetOdds).replace('.', ',') : '';
    el('odds').placeholder = 'ex. 1.30';
  }
  if(el('steps')) el('steps').value = s.steps;
  if(el('day')) el('day').value = s.dayMode;
  if(el('useRealOdds')) el('useRealOdds').value = s.useRealOdds ? 'yes' : 'no';

  hideUnusedControls();
}
function hideUnusedControls(){
  var count = el('count');
  if(count){
    var countWrap = count.closest('.pyr-field,.pyramid-field,div');
    if(countWrap) countWrap.style.display = 'none';
  }

  var profile = el('profile');
  if(profile){
    var profileWrap = profile.closest('.pyr-field,.pyramid-field,div');
    if(profileWrap) profileWrap.style.display = 'none';
  }
}

/* =========================================================
   COMPACT UI + HIDE MARKED INFO
========================================================= */

function injectCompactCss(){
  if(D.getElementById('pyramid-daily-compact-v18')) return;

  var style = D.createElement('style');
  style.id = 'pyramid-daily-compact-v18';
  style.textContent = `
#tab-piramida{
  overflow-x:hidden!important;
  padding-bottom:82px!important;
}
#tab-piramida,
#tab-piramida *{
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-daily-shell,
#tab-piramida .pyrBox{
  padding:5px!important;
  max-width:100%!important;
}
#tab-piramida .pyr-hero,
#tab-piramida .pyramid-hero,
#tab-piramida .pyr-panel,
#tab-piramida .pyramid-panel{
  padding:8px!important;
  margin-bottom:7px!important;
  border-radius:12px!important;
}
#tab-piramida h2{
  font-size:13px!important;
  line-height:1.05!important;
  margin:0!important;
}
#tab-piramida .pyr-title,
#tab-piramida .pyramid-title{
  font-size:10.5px!important;
  margin:0 0 3px!important;
  line-height:1.1!important;
}
#tab-piramida .pyr-muted,
#tab-piramida .pyramid-muted,
#tab-piramida .pyramid-engine-note,
#tab-piramida .pyramid-engine-note span,
#tab-piramida .pyramid-empty,
#tab-piramida .pyramid-warn{
  font-size:8.7px!important;
  line-height:1.22!important;
}
#tab-piramida .pyramid-sub,
#tab-piramida .pyr-hero .pyr-muted,
#tab-piramida .pyr-hero .pyramid-muted,
#tab-piramida .pyramid-hero .pyr-muted,
#tab-piramida .pyramid-hero .pyramid-muted{
  display:none!important;
}
#tab-piramida .pyr-panel > p,
#tab-piramida .pyramid-panel > p,
#tab-piramida .pyramid-engine-note{
  display:none!important;
}
#tab-piramida .pyr-head,
#tab-piramida .pyramid-head{
  gap:5px!important;
}
#tab-piramida .pyr-actions,
#tab-piramida .pyramid-actions{
  display:grid!important;
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:4px!important;
  margin-top:6px!important;
}
#tab-piramida .pyr-actions .btn,
#tab-piramida .pyramid-actions .btn{
  min-height:27px!important;
  height:27px!important;
  font-size:8.2px!important;
  padding:3px 4px!important;
  border-radius:9px!important;
  font-weight:850!important;
}
#tab-piramida .pyr-grid,
#tab-piramida .pyramid-grid{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:7px!important;
}
#tab-piramida .pyr-form,
#tab-piramida .pyramid-form{
  display:grid!important;
  grid-template-columns:1fr 1fr!important;
  gap:5px!important;
}
#tab-piramida label{
  font-size:6.6px!important;
  margin-bottom:2px!important;
  line-height:1!important;
}
#tab-piramida input,
#tab-piramida select{
  height:29px!important;
  min-height:29px!important;
  padding:0 8px!important;
  font-size:10.2px!important;
  border-radius:9px!important;
}
#tab-piramida .pyramid-stats{
  display:grid!important;
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:4px!important;
  margin:5px 0!important;
}
#tab-piramida .pyramid-stat{
  padding:6px!important;
  border-radius:9px!important;
}
#tab-piramida .pyramid-stat-v{
  font-size:10.5px!important;
  line-height:1.05!important;
}
#tab-piramida .pyramid-stat-l{
  font-size:6px!important;
  margin-top:2px!important;
  letter-spacing:.06em!important;
}
#tab-piramida .pyramid-picks{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:6px!important;
}
#tab-piramida .pyramid-pick{
  padding:7px!important;
  border-radius:11px!important;
}
#tab-piramida .pyramid-pick::before{
  top:7px!important;
  bottom:7px!important;
  width:2px!important;
}
#tab-piramida .pyramid-pick-rank{
  font-size:7px!important;
  margin-bottom:3px!important;
  padding-left:5px!important;
  letter-spacing:.07em!important;
}
#tab-piramida .pyramid-pick-teams{
  font-size:10.5px!important;
  line-height:1.12!important;
  padding-left:5px!important;
}
#tab-piramida .pyramid-pick-meta{
  font-size:7.8px!important;
  margin-top:2px!important;
  padding-left:5px!important;
}
#tab-piramida .pyramid-pick-rec{
  font-size:9.2px!important;
  padding:6px 7px!important;
  margin-top:5px!important;
  border-radius:9px!important;
}
#tab-piramida .pyramid-metrics{
  display:grid!important;
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:3px!important;
  margin-top:5px!important;
}
#tab-piramida .pyramid-mini{
  padding:5px 4px!important;
  border-radius:8px!important;
}
#tab-piramida .pyramid-mini-v{
  font-size:9px!important;
  line-height:1!important;
}
#tab-piramida .pyramid-mini-l{
  font-size:5.8px!important;
  margin-top:2px!important;
  line-height:1!important;
}
#tab-piramida .pyramid-engine-breakdown,
#tab-piramida .pyramid-reasons{
  gap:3px!important;
  margin-top:4px!important;
}
#tab-piramida .pyramid-engine-breakdown span,
#tab-piramida .pyramid-reasons span,
#tab-piramida .pyramid-risk{
  font-size:6.2px!important;
  padding:2px 4px!important;
  border-radius:999px!important;
}
#tab-piramida .pyramid-plan-wrap{
  border-radius:9px!important;
}
#tab-piramida .pyramid-plan-table{
  min-width:500px!important;
  font-size:7.8px!important;
}
#tab-piramida .pyramid-plan-table th,
#tab-piramida .pyramid-plan-table td{
  padding:5px 4px!important;
}
#tab-piramida .pyramid-step-chip{
  width:16px!important;
  height:16px!important;
  font-size:8px!important;
  border-radius:5px!important;
}
#tab-piramida .pyramid-session{
  padding:9px!important;
  border-radius:13px!important;
  margin-top:7px!important;
  background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(2,6,23,.78))!important;
}
#tab-piramida .pyramid-session.selected{
  border-color:rgba(245,158,11,.72)!important;
  box-shadow:0 0 0 1px rgba(245,158,11,.38), inset 0 0 26px rgba(245,158,11,.10)!important;
}
#tab-piramida .pyramid-session.collapsed{
  padding:6px 7px!important;
  cursor:pointer!important;
  min-height:40px!important;
}
#tab-piramida .pyramid-session.collapsed .pyramid-session-head{
  align-items:center!important;
}
#tab-piramida .pyramid-session-row{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:6px!important;
  min-width:0!important;
  width:100%!important;
}
#tab-piramida .pyramid-session-row-main{
  display:flex!important;
  align-items:center!important;
  gap:5px!important;
  min-width:0!important;
  flex:1 1 auto!important;
  overflow:hidden!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-row-title{
  color:#f8fafc!important;
  font-size:9.7px!important;
  font-weight:1000!important;
  line-height:1!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-row-chip{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  height:21px!important;
  padding:0 6px!important;
  border-radius:999px!important;
  background:rgba(15,23,42,.82)!important;
  border:1px solid rgba(148,163,184,.18)!important;
  color:#cbd5e1!important;
  font-size:8px!important;
  font-weight:900!important;
  line-height:1!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-row-chip.status{
  color:#fde68a!important;
  border-color:rgba(250,204,21,.28)!important;
  background:rgba(250,204,21,.08)!important;
}
#tab-piramida .pyramid-row-profit{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  height:21px!important;
  padding:0 6px!important;
  border-radius:999px!important;
  background:rgba(15,23,42,.82)!important;
  border:1px solid rgba(148,163,184,.18)!important;
  font-size:8px!important;
  font-weight:1000!important;
  line-height:1!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-row-chevron{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  width:24px!important;
  height:22px!important;
  border-radius:999px!important;
  background:rgba(15,23,42,.92)!important;
  border:1px solid rgba(94,234,212,.24)!important;
  color:#5eead4!important;
  font-size:10px!important;
  font-weight:1000!important;
  flex:0 0 auto!important;
}
#tab-piramida .pyramid-session-toggle{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:28px!important;
  height:22px!important;
  margin-top:4px!important;
  padding:0 8px!important;
  border-radius:999px!important;
  background:rgba(15,23,42,.82)!important;
  border:1px solid rgba(148,163,184,.20)!important;
  color:#94a3b8!important;
  font-size:11px!important;
  font-weight:1000!important;
}
#tab-piramida .pyramid-session.selected .pyramid-session-toggle{
  color:#5eead4!important;
  border-color:rgba(94,234,212,.35)!important;
  background:rgba(20,184,166,.12)!important;
}
#tab-piramida .pyramid-session-collapsed-meta{
  margin-top:4px!important;
  font-size:8.2px!important;
  line-height:1.25!important;
  color:#94a3b8!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
#tab-piramida .pyramid-session-expanded{
  display:block!important;
}
#tab-piramida .pyramid-session-head{
  display:flex!important;
  justify-content:space-between!important;
  align-items:flex-start!important;
  gap:8px!important;
}
#tab-piramida .pyramid-session-name{
  font-size:11px!important;
  line-height:1.18!important;
  color:#f8fafc!important;
}
#tab-piramida .pyramid-session-meta{
  font-size:8.3px!important;
  line-height:1.35!important;
  margin-top:4px!important;
  color:#cbd5e1!important;
}
#tab-piramida .pyramid-session-profit{
  font-size:11px!important;
  min-width:72px!important;
  text-align:right!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-session-actions{
  display:grid!important;
  grid-template-columns:1fr 1fr!important;
  gap:6px!important;
  padding:8px!important;
  border-radius:13px!important;
  margin-top:8px!important;
  background:rgba(2,6,23,.48)!important;
  border:1px solid rgba(45,212,191,.22)!important;
}
#tab-piramida .pyramid-session-actions .btn{
  min-height:34px!important;
  height:auto!important;
  font-size:9.5px!important;
  line-height:1.12!important;
  padding:6px 5px!important;
  border-radius:11px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  text-align:center!important;
  white-space:normal!important;
}
#tab-piramida .pyramid-action-generate{
  grid-column:1/-1!important;
  min-height:36px!important;
  font-size:10px!important;
  color:#07111f!important;
  background:linear-gradient(180deg,#5eead4,#14b8a6)!important;
  border-color:rgba(94,234,212,.65)!important;
}
#tab-piramida .pyramid-action-win{
  color:#052e16!important;
  background:linear-gradient(180deg,#86efac,#22c55e)!important;
  border-color:rgba(134,239,172,.60)!important;
}
#tab-piramida .pyramid-action-loss{
  color:#fff!important;
  background:linear-gradient(180deg,#ef4444,#991b1b)!important;
  border-color:rgba(248,113,113,.55)!important;
}
#tab-piramida .pyramid-action-cashout{
  color:#221205!important;
  background:linear-gradient(180deg,#fde68a,#f59e0b)!important;
  border-color:rgba(251,191,36,.58)!important;
}
#tab-piramida .pyramid-action-pause{
  color:#e2e8f0!important;
  background:linear-gradient(180deg,#334155,#0f172a)!important;
  border-color:rgba(148,163,184,.32)!important;
}
#tab-piramida .pyramid-action-delete{
  color:#fecaca!important;
  background:rgba(127,29,29,.34)!important;
  border-color:rgba(248,113,113,.40)!important;
}
#tab-piramida .pyramid-history{
  font-size:7.5px!important;
  line-height:1.22!important;
  margin-top:6px!important;
}
#tab-piramida .pyramid-session-badge{
  display:inline-flex!important;
  align-items:center!important;
  gap:4px!important;
  margin-top:4px!important;
  padding:4px 7px!important;
  border-radius:999px!important;
  background:rgba(20,184,166,.13)!important;
  border:1px solid rgba(94,234,212,.28)!important;
  color:#5eead4!important;
  font-size:8px!important;
  font-weight:1000!important;
  letter-spacing:.02em!important;
}
#tab-piramida .pyramid-selected-status{
  margin:5px 0 7px!important;
  padding:7px 8px!important;
  border-radius:10px!important;
  background:linear-gradient(180deg,rgba(20,184,166,.16),rgba(15,23,42,.76))!important;
  border:1px solid rgba(94,234,212,.24)!important;
  color:#e2e8f0!important;
  font-size:9px!important;
  font-weight:900!important;
  line-height:1.25!important;
}
#tab-piramida .pyramid-plan-status{
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-width:42px!important;
  padding:3px 6px!important;
  border-radius:999px!important;
  font-size:7px!important;
  font-weight:1000!important;
  text-transform:uppercase!important;
}
#tab-piramida .pyramid-plan-status.win{background:rgba(34,197,94,.20)!important;color:#86efac!important;border:1px solid rgba(34,197,94,.35)!important;}
#tab-piramida .pyramid-plan-status.loss{background:rgba(239,68,68,.20)!important;color:#fca5a5!important;border:1px solid rgba(239,68,68,.35)!important;}
#tab-piramida .pyramid-plan-status.cashout{background:rgba(245,158,11,.20)!important;color:#fde68a!important;border:1px solid rgba(245,158,11,.35)!important;}
#tab-piramida .pyramid-plan-status.current{background:rgba(94,234,212,.16)!important;color:#5eead4!important;border:1px solid rgba(94,234,212,.35)!important;}
#tab-piramida .pyramid-plan-status.wait{background:rgba(148,163,184,.12)!important;color:#cbd5e1!important;border:1px solid rgba(148,163,184,.20)!important;}
#tab-piramida .pyramid-step-list{
  display:grid!important;
  gap:5px!important;
  margin-top:7px!important;
}
#tab-piramida .pyramid-step-detail{
  border-radius:10px!important;
  border:1px solid rgba(148,163,184,.20)!important;
  background:rgba(2,6,23,.38)!important;
  overflow:hidden!important;
}
#tab-piramida .pyramid-step-detail[open]{
  border-color:rgba(94,234,212,.28)!important;
  background:rgba(15,23,42,.68)!important;
}
#tab-piramida .pyramid-step-detail summary{
  cursor:pointer!important;
  list-style:none!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  gap:6px!important;
  align-items:center!important;
  padding:7px 8px!important;
  color:#f8fafc!important;
  font-size:8.7px!important;
  font-weight:1000!important;
}
#tab-piramida .pyramid-step-detail summary::-webkit-details-marker{display:none!important;}
#tab-piramida .pyramid-step-title{
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-step-body{
  padding:0 8px 8px!important;
  color:#cbd5e1!important;
  font-size:8px!important;
  line-height:1.35!important;
}
#tab-piramida .pyramid-step-money{
  display:grid!important;
  grid-template-columns:1fr 1fr!important;
  gap:4px!important;
  margin:4px 0 6px!important;
}
#tab-piramida .pyramid-step-money span{
  padding:5px!important;
  border-radius:8px!important;
  background:rgba(15,23,42,.85)!important;
  border:1px solid rgba(148,163,184,.14)!important;
  font-weight:900!important;
  color:#e2e8f0!important;
}
#tab-piramida .pyramid-step-picks{
  display:grid!important;
  gap:3px!important;
}
#tab-piramida .pyramid-step-pick{
  padding:5px 6px!important;
  border-radius:8px!important;
  background:rgba(20,184,166,.08)!important;
  border:1px solid rgba(94,234,212,.14)!important;
  color:#dbeafe!important;
  font-weight:800!important;
}
#tab-piramida .pyramid-session-actions{
  align-items:stretch!important;
}
#tab-piramida .pyramid-action-delete-session{
  grid-column:1/-1!important;
  color:#fee2e2!important;
  background:linear-gradient(180deg,rgba(127,29,29,.75),rgba(69,10,10,.78))!important;
  border-color:rgba(248,113,113,.55)!important;
}

#tab-piramida .pyramid-monitor-title{
  font-size:9px!important;
  font-weight:900!important;
  letter-spacing:.04em!important;
  text-transform:uppercase!important;
  margin:7px 0 5px!important;
  color:#f8fafc!important;
}
#tab-piramida .pyramid-monitor-grid{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 132px!important;
  gap:6px!important;
  align-items:start!important;
  width:100%!important;
  max-width:100%!important;
  overflow:hidden!important;
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-monitor-grid > div{
  min-width:0!important;
  max-width:100%!important;
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-monitor-wrap{
  width:100%!important;
  max-width:100%!important;
  overflow:hidden!important;
  border:1px solid rgba(250,204,21,.30)!important;
  border-radius:9px!important;
  background:rgba(3,7,18,.78)!important;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),0 0 12px rgba(0,0,0,.25)!important;
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-monitor-table{
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  table-layout:fixed!important;
  border-collapse:collapse!important;
  font-size:7.4px!important;
  line-height:1.12!important;
  color:#f8fafc!important;
}
#tab-piramida .pyramid-monitor-table th,
#tab-piramida .pyramid-monitor-table td{
  padding:5px 3px!important;
  border-bottom:1px solid rgba(148,163,184,.18)!important;
  border-right:1px solid rgba(148,163,184,.16)!important;
  text-align:right!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-monitor-table th{
  background:linear-gradient(180deg,#1f2937,#0f172a)!important;
  color:#fde68a!important;
  text-transform:uppercase!important;
  font-weight:1000!important;
  text-shadow:0 1px 2px rgba(0,0,0,.75)!important;
  border-bottom:1px solid rgba(250,204,21,.40)!important;
}
#tab-piramida .pyramid-monitor-table td{
  color:#f8fafc!important;
  background:rgba(15,23,42,.74)!important;
  font-weight:800!important;
}
#tab-piramida .pyramid-monitor-table th:nth-child(1),
#tab-piramida .pyramid-monitor-table td:nth-child(1){width:22%!important;text-align:center!important;font-weight:900!important;}
#tab-piramida .pyramid-monitor-table th:nth-child(2),
#tab-piramida .pyramid-monitor-table td:nth-child(2){width:21%!important;}
#tab-piramida .pyramid-monitor-table th:nth-child(3),
#tab-piramida .pyramid-monitor-table td:nth-child(3){width:17%!important;}
#tab-piramida .pyramid-monitor-table th:nth-child(4),
#tab-piramida .pyramid-monitor-table td:nth-child(4){width:24%!important;}
#tab-piramida .pyramid-monitor-table th:nth-child(5),
#tab-piramida .pyramid-monitor-table td:nth-child(5){width:16%!important;text-align:center!important;border-right:0!important;}
#tab-piramida .pyramid-monitor-attempt.win{background:#16a34a!important;color:#ecfdf5!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-attempt.loss{background:#dc2626!important;color:#fff!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-attempt.open{background:#facc15!important;color:#111827!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-status.win{color:#86efac!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-status.loss{color:#fca5a5!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-status.open{color:#fde68a!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-summary{
  border:1px solid rgba(250,204,21,.30)!important;
  border-radius:9px!important;
  overflow:hidden!important;
  background:rgba(3,7,18,.78)!important;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.04),0 0 12px rgba(0,0,0,.25)!important;
  max-width:100%!important;
  box-sizing:border-box!important;
}
#tab-piramida .pyramid-monitor-summary-title{
  padding:6px!important;
  font-size:8px!important;
  font-weight:1000!important;
  text-transform:uppercase!important;
  color:#fde68a!important;
  background:linear-gradient(180deg,#1f2937,#0f172a)!important;
  border-bottom:1px solid rgba(250,204,21,.40)!important;
}
#tab-piramida .pyramid-monitor-summary-row{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 52px!important;
  min-height:25px!important;
  border-bottom:1px solid rgba(148,163,184,.16)!important;
}
#tab-piramida .pyramid-monitor-summary-row:last-child{border-bottom:0!important;}
#tab-piramida .pyramid-monitor-summary-label,
#tab-piramida .pyramid-monitor-summary-value{
  padding:6px 6px!important;
  font-size:8.2px!important;
  line-height:1.1!important;
  font-weight:900!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
#tab-piramida .pyramid-monitor-summary-label{background:rgba(15,23,42,.74)!important;color:#f8fafc!important;}
#tab-piramida .pyramid-monitor-summary-label.win{background:rgba(22,101,52,.90)!important;color:#dcfce7!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-summary-label.loss{background:rgba(127,29,29,.94)!important;color:#fee2e2!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-summary-label.profit{background:rgba(113,63,18,.94)!important;color:#fde68a!important;font-weight:1000!important;}
#tab-piramida .pyramid-monitor-summary-value{
  text-align:right!important;
  font-weight:1000!important;
  color:#ffffff!important;
  background:rgba(15,23,42,.82)!important;
}
#tab-piramida .pyramid-monitor-cards-title{
  font-size:8px!important;
  font-weight:900!important;
  text-transform:uppercase!important;
  color:#94a3b8!important;
  margin:8px 0 4px!important;
}

#tab-piramida .pyramid-session-settings{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 82px!important;
  gap:6px!important;
  align-items:end!important;
  margin-top:8px!important;
  padding:8px!important;
  border-radius:12px!important;
  background:rgba(20,184,166,.08)!important;
  border:1px solid rgba(94,234,212,.18)!important;
}
#tab-piramida .pyramid-session-settings label{
  display:block!important;
  color:#cbd5e1!important;
  font-size:8px!important;
  font-weight:950!important;
  margin:0 0 4px!important;
}
#tab-piramida .pyramid-session-settings input{
  width:100%!important;
  height:30px!important;
  min-height:30px!important;
  color:#f8fafc!important;
  background:rgba(15,23,42,.94)!important;
  border:1px solid rgba(148,163,184,.24)!important;
}
#tab-piramida .pyramid-action-save-steps{
  min-height:30px!important;
  height:30px!important;
  font-size:8.5px!important;
  color:#1b1303!important;
  background:linear-gradient(180deg,#fde68a,#f59e0b)!important;
  border-color:rgba(251,191,36,.58)!important;
}
#tab-piramida .pyramid-session-kpi{
  display:grid!important;
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:5px!important;
  margin-top:7px!important;
}
#tab-piramida .pyramid-session-kpi span{
  padding:6px 5px!important;
  border-radius:9px!important;
  background:rgba(2,6,23,.45)!important;
  border:1px solid rgba(148,163,184,.15)!important;
  color:#e2e8f0!important;
  font-size:8.3px!important;
  font-weight:900!important;
  text-align:center!important;
}
#tab-piramida .pyramid-session-kpi b{
  display:block!important;
  color:#fde68a!important;
  font-size:9.3px!important;
  margin-bottom:2px!important;
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
  #tab-piramida .pyramid-stats{
    grid-template-columns:1fr 1fr!important;
  }
  #tab-piramida .pyramid-metrics{
    grid-template-columns:1fr 1fr!important;
  }
  #tab-piramida .pyramid-monitor-grid{
    grid-template-columns:1fr!important;
  }
  #tab-piramida .pyramid-monitor-summary{
    max-width:none!important;
  }
  #tab-piramida .pyramid-session-actions{
    grid-template-columns:1fr 1fr!important;
  }
  #tab-piramida .pyramid-session-actions .btn{
    min-height:32px!important;
    font-size:9px!important;
  }
}`;
  D.head.appendChild(style);
}
function hideInfoTexts(){
  var tab = D.getElementById('tab-piramida');
  if(!tab) return;

  tab.querySelectorAll('.pyr-muted,.pyramid-muted,.pyramid-sub,.pyramid-panel-sub,p,.section-subtitle,.pyramid-engine-note').forEach(function(node){
    var txt = (node.textContent || '').trim();

    if(
      txt.indexOf('Rubrică pentru') >= 0 ||
      txt.indexOf('AI alege automat') >= 0 ||
      txt.indexOf('Selectează doar') >= 0 ||
      txt.indexOf('AI caută') >= 0 ||
      txt.indexOf('Decizie AI') >= 0 ||
      txt.indexOf('AI decide') >= 0 ||
      txt.indexOf('AI alege singur') >= 0 ||
      txt.indexOf('Scorul combină') >= 0 ||
      txt.indexOf('Dacă introduci cotă') >= 0 ||
      txt.indexOf('reinvestire totală') >= 0 ||
      txt.indexOf('vârful zilei') >= 0
    ){
      node.style.display = 'none';
      node.innerHTML = '';
    }
  });
}

/* =========================================================
   DATA NORMALIZATION
========================================================= */

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
function getMeciuriFilteredPool(){
  var cache = [];

  if(Array.isArray(W.MATCHES_FILTERED_CACHE)){
    cache = W.MATCHES_FILTERED_CACHE;
  }

  /*
    Piramida trebuie să folosească strict lista filtrată din tab-ul Meciuri.
    Dacă utilizatorul intră direct în Piramidă după refresh și cache-ul nu a fost
    construit încă, rulăm o singură recalculare a tab-ului Meciuri pentru a aplica
    filtrele curente din UI, apoi citim MATCHES_FILTERED_CACHE.
  */
  if(!cache.length && typeof W.renderMatches === 'function'){
    try{
      W.renderMatches();
      if(Array.isArray(W.MATCHES_FILTERED_CACHE)){
        cache = W.MATCHES_FILTERED_CACHE;
      }
    }catch(e){}
  }

  return Array.isArray(cache) ? cache.filter(Boolean) : [];
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

  add(getMeciuriFilteredPool());

  return out.reduce(function(acc,x){
    if(!x) return acc;

    if(x.bestBet){
      var b = x.bestBet;

      acc.push(Object.assign({},x,{
        marketKey:b.type || b.marketKey || x.marketKey || x.market_key || x.market || '',
        market:b.label || b.market || x.market || '',
        odds:b.odds || b.baseOdds || x.odds || x.book_odds || x.price,
        prob:b.adjProb || b.prob || x.prob || x.adjusted_prob || x.final_probability,
        edge:b.edgePct || b.edge || x.edge || x.edge_pct || x.edgePct,
        value:b.value != null ? b.value : x.value,
        score:b.score || x.smartScore || x.score || x.adaptive_score || x.ticketScore || x.confidence,
        source_api:b.sourceApi !== false && x.source_api !== false,
        source_heuristic:b.sourceHeuristic === true || x.source_heuristic === true
      }));
    }else{
      acc.push(x);
    }

    return acc;
  },[]);
}
function normalize(x){
  if(!x) return null;

  var mk = marketKey(x.marketKey || x.market_key || x.market || x.pick || x.bet || x.type || x.prediction || '');
  var odds = n(x.odds || x.displayOdds || x.book_odds || x.price || x.bestOdds || 0,0);
  var prob = pctRaw(x.prob || x.adjusted_prob || x.final_probability || x.model_prob || x.api_prob || x.market_prob || x.confidence || 0);
  var score = pctRaw(x.score || x.smartScore || x.smart_score || x.adaptive_score || x.ticketScore || x.portfolioScore || x.confidence || 0);
  var edge = n(x.edge || x.edgeToPrice || x.edge_pct || x.edgePct || 0,0);
  var valuePct = pctRaw(x.value_pct != null ? x.value_pct : (x.value != null ? x.value : x.ev));
  var date = x.date || x.event_date || x.eventDate || x.start_time || x.startTime || x.kickoff || '';
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
  if(odds < 1.08) return null;

  if(!prob) prob = clamp((1 / odds) * 100 + 2, 50, 92);
  if(!score) score = prob;

  var c = Object.assign({},x,{
    eventKey:eventKey(x),
    home:home,
    away:away,
    league:x.league || x.competition || x.country || '—',
    date:date,
    dateKey:x.dateKey || (date ? todayKeyFrom(date) : ''),
    eventMs:ms,
    marketKey:mk,
    displayMarket:marketLabel(mk, x.displayMarket || x.market || x.pick || x.bet),
    odds:odds,
    prob:prob,
    score:score,
    edge:edge,
    valuePct:valuePct,
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

/* =========================================================
   AI SCORING
========================================================= */

function scoreCandidate(c){
  var safety = clamp(
    c.prob * 0.56 +
    c.score * 0.24 +
    (c.poissonProb || c.prob) * 0.10 +
    clamp(55 + c.edge * 4,0,100) * 0.10,
    0,
    100
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
    if(c.xgHome >= .95 && c.xgAway >= .85){ market += 10; reasons.push('xG pe ambele'); }
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
  value += clamp(c.valuePct * .9, -14, 18);
  value += clamp(c.kelly * 1.3, 0, 8);

  var stability = 100;
  var risks = [];

  if(c.odds >= 1.85){
    stability -= 20;
    risks.push('cotă volatilă');
  }else if(c.odds >= 1.65){
    stability -= 10;
  }

  if(c.poissonAlert){
    stability -= 8;
    risks.push('Poisson alert');
  }

  if(isFinite(c.ageHours)){
    if(c.ageHours > 120){
      stability -= 16;
      risks.push('predicție veche');
    }else if(c.ageHours > 72){
      stability -= 8;
    }
  }

  if(c.eventMs){
    var h = (c.eventMs - Date.now()) / 36e5;

    if(h < -0.5){
      stability -= 35;
      risks.push('meci expirat');
    }else if(h >= .5 && h <= 22){
      stability += 4;
    }
  }

  if(c.lineMove > 8){
    stability -= 7;
    risks.push('cotă urcă');
  }

  if(c.lineMove < -8){
    stability += 3;
  }

  var total =
    safety * .30 +
    clamp(market,0,100) * .22 +
    clamp(history,0,100) * .14 +
    clamp(value,0,100) * .13 +
    clamp(stability,0,100) * .21;

  return {
    total:clamp(total,0,100),
    safety:clamp(safety,0,100),
    market:clamp(market,0,100),
    history:clamp(history,0,100),
    value:clamp(value,0,100),
    stability:clamp(stability,0,100),
    risks:risks,
    reasons:reasons.concat(c.reasonTags || []).slice(0,4)
  };
}

/* =========================================================
   SMART TARGET ENGINE · V18 SURVIVAL GUARD
   - NU mai forțează cota țintă dacă probabilitatea scade prea mult.
   - Max 3 evenimente.
   - Penalizează automat piețele/ligile care au produs pierderi în sesiunile locale.
   - Penalizează cardurile cu semnal RISC / SKIP / EVITĂ / fragil.
========================================================= */

function filterCfg(tier){
  var cfg = {
    minProb:72,
    minAi:70,
    maxSingleOdds:1.72,
    minEdge:0
  };

  if(tier === 1){
    cfg.minProb -= 3;
    cfg.minAi -= 3;
    cfg.maxSingleOdds += .10;
    cfg.minEdge -= 1;
  }

  if(tier === 2){
    cfg.minProb -= 6;
    cfg.minAi -= 6;
    cfg.maxSingleOdds += .18;
    cfg.minEdge -= 2;
  }

  return cfg;
}
function allowedWindow(c,s,relaxed){
  var now = Date.now();
  var ms = c.eventMs;

  if(s.dayMode === 'tomorrow'){
    var d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+1);

    var start = d.getTime();
    var end = start + 24 * 36e5;

    if(ms){
      return relaxed ? (ms >= now - 36e5 && ms <= now + 72 * 36e5) : (ms >= start && ms < end);
    }

    return relaxed ? true : c.dateKey === todayKeyFrom(start);
  }

  var endToday = new Date();
  endToday.setHours(23,59,59,999);

  if(ms){
    return relaxed ? (ms >= now - 36e5 && ms <= now + 72 * 36e5) : (ms >= now - 30 * 60000 && ms <= endToday.getTime());
  }

  return relaxed ? true : c.dateKey === todayKeyFrom(new Date());
}
function riskTextFor(c){
  return [
    c.verdict,
    c.risk,
    c.riskLabel,
    c.risk_level,
    c.riskLevel,
    c.recommendation,
    c.recommendationLabel,
    c.signal,
    c.signalLabel,
    c.audit_verdict,
    c.auditVerdict,
    c.cardVerdict,
    c.safetyLabel,
    c.badge,
    c.note,
    c.notes,
    c.summary,
    c.description,
    c.market_status,
    c.marketStatus
  ].filter(Boolean).join(' ').toLowerCase();
}
function explicitRiskPenalty(c){
  var t = riskTextFor(c);
  var p = 0;

  if(/evit|skip|nu paria|nu intra|avoid/.test(t)) p += 34;
  if(/risc|risk|fragil|volatil|instabil|stake mic|miz[aă] mic[aă]/.test(t)) p += 22;
  if(/negativ|negative|clv\s*-|roi\s*-|bt\s*-/.test(t)) p += 12;
  if(/pareaz|pariaz|safe|ok|strong|buy|value/.test(t)) p -= 7;

  return clamp(p,0,45);
}
function marketBucket(c){
  return String(c.marketKey || c.displayMarket || c.market || '').toLowerCase();
}
function leagueBucket(c){
  return String(c.league || '').toLowerCase();
}
function oddsBucket(o){
  o = n(o,0);
  if(o < 1.25) return '<1.25';
  if(o < 1.40) return '1.25-1.39';
  if(o < 1.55) return '1.40-1.54';
  if(o < 1.75) return '1.55-1.74';
  return '1.75+';
}
function pyramidMemory(){
  var mem = {market:{},league:{},odds:{},recentLosses:0,total:0,losses:0,wins:0};
  var arr = [];
  try{ arr = getSessions(); }catch(e){ arr = []; }
  if(!Array.isArray(arr)) arr = [];

  arr.slice(0,30).forEach(function(s,idx){
    var lost = s.status === 'lost' || s.status === 'lose';
    var won = s.status === 'completed' || s.status === 'win' || s.status === 'cashout';
    if(!lost && !won) return;

    mem.total++;
    if(lost) mem.losses++;
    if(won) mem.wins++;
    if(lost && idx < 8) mem.recentLosses++;

    var hist = Array.isArray(s.history) ? s.history : [];
    var picks = hist.length ? hist.reduce(function(a,h){ return a.concat(h.picks || []); },[]) : (s.picks || []);
    if(!picks.length) picks = s.picks || [];

    picks.forEach(function(p){
      var mk = marketBucket(p);
      var lg = leagueBucket(p);
      var ob = oddsBucket(p.odds || s.lastDailyOdds || s.targetOdds);

      if(mk){
        mem.market[mk] = mem.market[mk] || {w:0,l:0};
        lost ? mem.market[mk].l++ : mem.market[mk].w++;
      }
      if(lg){
        mem.league[lg] = mem.league[lg] || {w:0,l:0};
        lost ? mem.league[lg].l++ : mem.league[lg].w++;
      }
      if(ob){
        mem.odds[ob] = mem.odds[ob] || {w:0,l:0};
        lost ? mem.odds[ob].l++ : mem.odds[ob].w++;
      }
    });
  });

  return mem;
}
function bucketPenalty(bucket){
  if(!bucket) return 0;
  var sample = n(bucket.w,0) + n(bucket.l,0);
  if(sample < 2) return 0;
  var wr = bucket.w / sample;
  if(bucket.l >= 3 && wr < .45) return 12;
  if(bucket.l >= 2 && wr < .40) return 8;
  if(bucket.l > bucket.w) return 4;
  return 0;
}
function memoryPenalty(c,mem){
  mem = mem || pyramidMemory();
  var p = 0;
  p += bucketPenalty(mem.market[marketBucket(c)]);
  p += bucketPenalty(mem.league[leagueBucket(c)]);
  p += bucketPenalty(mem.odds[oddsBucket(c.odds)]);

  if(mem.recentLosses >= 3) p += 6;
  else if(mem.recentLosses >= 2) p += 3;

  return clamp(p,0,30);
}
function survivalFloor(s,legs){
  var target = n(s && s.targetOdds,0);
  var steps = n(s && s.steps,4);

  var base = steps >= 6 ? 82 : steps >= 4 ? 76 : 72;

  if(target >= 2.00) base += 2;
  else if(target >= 1.70) base += 1;

  if(legs === 1) return base;
  if(legs === 2) return Math.max(70, base - 3);
  return Math.max(66, base - 5);
}
function buildCandidatePool(s){
  var all = rawPool().map(normalize).filter(Boolean);
  var seen = {};
  var mem = pyramidMemory();

  all = all.filter(function(c){
    var sig = c.eventKey + ':' + c.marketKey;
    if(seen[sig]) return false;
    seen[sig] = true;
    return true;
  });

  all.forEach(function(c){
    c.explicitRiskPenalty = explicitRiskPenalty(c);
    c.memoryPenalty = memoryPenalty(c,mem);
    c.guardScore = n(c.ai.total,0) - c.explicitRiskPenalty - c.memoryPenalty;
    c.guardProb = n(c.prob,0) - Math.max(0,c.explicitRiskPenalty * .35) - Math.max(0,c.memoryPenalty * .25);
  });

  var report = null;

  for(var tier=0;tier<=2;tier++){
    var cfg = filterCfg(tier);
    var relaxed = tier > 0;

    var filtered = all.filter(function(c){
      if(!allowedWindow(c,s,relaxed)) return false;
      if(['over15','under35','over25','btts','1x','x2'].indexOf(c.marketKey) < 0) return false;
      if(c.odds < 1.08 || c.odds > cfg.maxSingleOdds) return false;
      if(c.prob < cfg.minProb) return false;
      if(c.ai.total < cfg.minAi) return false;
      if(c.edge < cfg.minEdge) return false;
      if(c.explicitRiskPenalty >= 30) return false;
      if(c.memoryPenalty >= 18) return false;
      if(c.guardProb < cfg.minProb - 2) return false;
      if(c.guardScore < cfg.minAi - 3) return false;
      return true;
    }).sort(function(a,b){
      if(b.guardScore !== a.guardScore) return b.guardScore - a.guardScore;
      if(b.guardProb !== a.guardProb) return b.guardProb - a.guardProb;
      return a.odds - b.odds;
    });

    report = {
      raw:all.length,
      candidates:filtered.length,
      tier:tier,
      relaxed:relaxed,
      cfg:cfg,
      recentLosses:mem.recentLosses,
      guard:'survival-first'
    };

    if(filtered.length){
      return {pool:filtered, report:report};
    }
  }

  return {
    pool:[],
    report:report || {raw:all.length,candidates:0,tier:2,relaxed:true,guard:'survival-first'}
  };
}
function comboOdds(picks){
  return picks.reduce(function(a,p){ return a * n(p.odds,1); },1);
}
function comboProb(picks){
  return picks.reduce(function(a,p){ return a * (n(p.guardProb || p.prob,0) / 100); },1) * 100;
}
function avgAi(picks){
  return picks.reduce(function(a,p){ return a + n(p.guardScore || p.ai.total,0); },0) / (picks.length || 1);
}
function avgStability(picks){
  return picks.reduce(function(a,p){ return a + n(p.ai.stability,0); },0) / (picks.length || 1);
}
function comboPenalty(picks){
  var penalty = 0;

  for(var i=0;i<picks.length;i++){
    penalty += n(picks[i].explicitRiskPenalty,0);
    penalty += n(picks[i].memoryPenalty,0);

    for(var j=i+1;j<picks.length;j++){
      if(correlated(picks[i],picks[j])) penalty += 40;
      if(String(picks[i].league || '') === String(picks[j].league || '')) penalty += 8;
      if(picks[i].marketKey === picks[j].marketKey) penalty += 5;
      if(picks[i].eventMs && picks[j].eventMs && Math.abs(picks[i].eventMs - picks[j].eventMs) < 2 * 36e5) penalty += 6;
    }
  }

  return penalty;
}
function targetFit(odds,target){
  if(!target) return 75;

  var min = target * .97;
  var idealLow = target * .99;
  var idealHigh = target * 1.07;
  var max = target * 1.16;

  if(odds >= idealLow && odds <= idealHigh){
    return 100 - Math.abs(odds - target) * 35;
  }

  if(odds >= min && odds <= max){
    return 82 - Math.abs(odds - target) * 42;
  }

  if(odds < min){
    return 52 - (min - odds) * 90;
  }

  return 44 - (odds - max) * 85;
}
function reachedTarget(odds,target){
  if(!target) return true;
  return odds >= target * .97;
}
function comboQuality(picks,s){
  var odds = comboOdds(picks);
  var prob = comboProb(picks);
  var ai = avgAi(picks);
  var stability = avgStability(picks);
  var edge = picks.reduce(function(a,p){ return a + n(p.edge,0); },0) / picks.length;
  var penalty = comboPenalty(picks);
  var hasTarget = !!s.targetOdds;
  var fit = targetFit(odds,s.targetOdds);
  var floor = survivalFloor(s,picks.length);

  var legBias = 0;
  if(picks.length === 1) legBias = 12;
  else if(picks.length === 2) legBias = 1;
  else legBias = -10;

  if(hasTarget && picks.length === 1 && odds < s.targetOdds * .90) legBias -= 10;
  if(hasTarget && reachedTarget(odds,s.targetOdds)) legBias += 5;

  var survivalGap = Math.max(0, floor - prob);
  var targetWeight = hasTarget ? .10 : .03;

  var score =
    prob * .45 +
    ai * .25 +
    stability * .16 +
    clamp(fit,0,100) * targetWeight +
    clamp(50 + edge * 4,0,100) * .04 +
    legBias -
    penalty -
    survivalGap * 2.4;

  return {
    picks:picks,
    odds:odds,
    prob:prob,
    ai:ai,
    stability:stability,
    edge:edge,
    penalty:penalty,
    fit:fit,
    score:score,
    floor:floor,
    reached:reachedTarget(odds,s.targetOdds),
    survivalOk:prob >= floor
  };
}
function combinations(arr,k,limit){
  var res = [];

  function walk(start,cur){
    if(res.length >= limit) return;

    if(cur.length === k){
      res.push(cur.slice());
      return;
    }

    for(var i=start;i<arr.length;i++){
      var ok = true;

      for(var j=0;j<cur.length;j++){
        if(correlated(cur[j],arr[i])){
          ok = false;
          break;
        }
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
function dynamicMaxLegs(s,pool){
  var target = n(s && s.targetOdds,0);
  var size = Array.isArray(pool) ? pool.length : 0;
  if(!size) return 0;

  // Pentru piramidă, mai multe selecții cresc exponențial riscul.
  // 3 este maximul operațional; dacă targetul nu poate fi atins în 3, mai bine skip.
  if(target >= 1.75) return Math.min(size,3);
  if(target >= 1.45) return Math.min(size,2);
  return 1;
}
function buildDynamicVariants(scan,s,maxLegs){
  var variants = [];
  var level = [{picks:[], lastIndex:-1}];
  var keepPerLevel = 180;

  for(var legs=1; legs<=maxLegs; legs++){
    var next = [];

    level.forEach(function(base){
      for(var i=base.lastIndex + 1; i<scan.length; i++){
        var candidate = scan[i];
        var ok = true;

        for(var j=0;j<base.picks.length;j++){
          if(correlated(base.picks[j],candidate)){
            ok = false;
            break;
          }
        }

        if(!ok) continue;

        var picks = base.picks.concat(candidate);
        var q = comboQuality(picks,s);

        if(q.penalty >= 30) continue;
        if(!q.survivalOk) continue;
        if(legs === 3 && q.prob < 68) continue;

        variants.push(q);
        next.push({picks:picks,lastIndex:i,q:q});
      }
    });

    next.sort(function(a,b){
      if(b.q.score !== a.q.score) return b.q.score - a.q.score;
      if(b.q.prob !== a.q.prob) return b.q.prob - a.q.prob;
      return Math.abs(a.q.odds - n(s.targetOdds,0)) - Math.abs(b.q.odds - n(s.targetOdds,0));
    });

    level = next.slice(0,keepPerLevel);
    if(!level.length) break;
  }

  return variants;
}
function aiDecidePicks(s){
  if(!hasUserCriteria(s)){
    ACTIVE_REPORT = {raw:0,candidates:0,reason:'Aștept criterii de filtrare.',mode:'waiting',guard:'survival-first'};
    return [];
  }

  var built = buildCandidatePool(s);
  var pool = built.pool;
  var report = built.report || {};
  var hasTarget = !!s.targetOdds;

  report.mode = hasTarget ? 'target-survival' : 'auto-risk';

  if(!pool.length){
    report.reason = 'Nu există candidați valizi după filtrul survival.';
    ACTIVE_REPORT = report;
    return [];
  }

  var scan = pool.slice(0,hasTarget ? 24 : 16);
  var maxLegs = dynamicMaxLegs(s,scan);
  var variants = buildDynamicVariants(scan,s,maxLegs);

  if(!variants.length){
    report.reason = 'Skip: nu există combinație care trece pragul minim de supraviețuire pentru piramidă.';
    report.selectedLegs = 0;
    report.combo = null;
    ACTIVE_REPORT = report;
    return [];
  }

  var chosen;

  if(hasTarget){
    var reached = variants.filter(function(v){ return v.reached; });

    if(reached.length){
      reached.sort(function(a,b){
        if(b.score !== a.score) return b.score - a.score;
        if(b.prob !== a.prob) return b.prob - a.prob;
        return a.odds - b.odds;
      });

      chosen = reached[0];
      report.reason = 'AI Survival: target atins doar dacă probabilitatea trece pragul minim de serie.';
    }else{
      variants.sort(function(a,b){
        if(b.score !== a.score) return b.score - a.score;
        if(b.prob !== a.prob) return b.prob - a.prob;
        return Math.abs(a.odds - s.targetOdds) - Math.abs(b.odds - s.targetOdds);
      });

      chosen = variants[0];
      report.reason = 'AI Survival: targetul nu e curat; a ales varianta mai sigură în loc să forțeze.';
    }
  }else{
    variants.sort(function(a,b){
      if(b.score !== a.score) return b.score - a.score;
      if(b.prob !== a.prob) return b.prob - a.prob;
      return a.odds - b.odds;
    });

    chosen = variants[0];
    report.reason = 'AI Survival: fără target, a ales varianta cu risc minim.';
  }

  report.raw = report.raw || rawPool().length;
  report.candidates = pool.length;
  report.selectedLegs = chosen.picks.length;
  report.combo = chosen;
  report.survivalFloor = chosen.floor;

  if(report.relaxed){
    report.reason += ' Filtrele au fost relaxate, dar pragul de survival a rămas activ.';
  }

  ACTIVE_REPORT = report;
  return chosen.picks;
}

/* =========================================================
   RENDER
========================================================= */

function mini(label,value,color){
  return '<div class="pyramid-mini"><div class="pyramid-mini-v"' + (color ? ' style="color:'+color+'"' : '') + '>' + value + '</div><div class="pyramid-mini-l">' + label + '</div></div>';
}
function renderTopStats(s,picks){
  var box = el('topStats');
  if(!box) return;

  var odds = picks.length ? comboOdds(picks) : 0;
  var prob = picks.length ? comboProb(picks) : 0;
  var avg = picks.length ? avgAi(picks) : 0;
  var report = ACTIVE_REPORT || {};

  box.innerHTML =
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + (report.selectedLegs || 0) + '</div><div class="pyramid-stat-l">AI pick</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + (odds ? fmt(odds,2) : '—') + '</div><div class="pyramid-stat-l">Cotă</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + (prob ? pct(prob) : '—') + '</div><div class="pyramid-stat-l">Prob.</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (avg ? fmt(avg,0) : '—') + '</div><div class="pyramid-stat-l">Scor</div></div>' +
    '</div>';
}
function pickCard(c,i){
  var dateText = '';

  if(c.date){
    try{
      var d = new Date(c.date);
      dateText =
        d.toLocaleDateString('ro-RO',{weekday:'short',day:'2-digit',month:'short'}) +
        ' ' +
        d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    }catch(e){}
  }

  var reasons = (c.ai.reasons || []).slice(0,3);

  if(!reasons.length){
    reasons = ['AI ' + fmt(c.ai.total,0), 'Prob. ' + pct(c.prob), 'Stab. ' + fmt(c.ai.stability,0)];
  }

  var risk = c.ai.risks && c.ai.risks.length
    ? '<span class="pyramid-risk">' + esc(c.ai.risks[0]) + '</span>'
    : '';

  return '<div class="pyramid-pick">' +
    '<div class="pyramid-pick-rank">Pick #' + (i+1) + ' · AI AUTO ' + risk + '</div>' +
    '<div class="pyramid-pick-teams">' + esc(c.home) + ' vs ' + esc(c.away) + '</div>' +
    '<div class="pyramid-pick-meta">' + esc(c.league || '—') + (dateText ? ' • ' + esc(dateText) : '') + '</div>' +
    '<div class="pyramid-pick-rec">🎯 ' + esc(c.displayMarket) + ' @ ' + fmt(c.odds,2) + '</div>' +
    '<div class="pyramid-metrics">' +
      mini('Prob.',pct(c.prob),'var(--grn)') +
      mini('Cotă',fmt(c.odds,2),'var(--yel)') +
      mini('AI',fmt(c.ai.total,0),'var(--pur)') +
      mini('Stab.',fmt(c.ai.stability,0),c.ai.stability >= 74 ? 'var(--grn)' : 'var(--yel)') +
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
function renderPicks(s){
  var target = el('picks');
  if(!target) return;

  if(!hasUserCriteria(s)){
    ACTIVE_PICKS = [];
    ACTIVE_REPORT = {raw:0,candidates:0,reason:'Aștept criterii de filtrare.',mode:'waiting'};

    renderTopStats(s,ACTIVE_PICKS);

    if(el('badge')) el('badge').textContent = '—';
    if(el('summary')) el('summary').innerHTML = 'Introdu cotă țintă pentru filtrare.';

    target.innerHTML =
      '<div class="pyramid-empty"><b>Introdu criterii pentru afișare.</b><br>' +
      'Completează cota țintă/pas, apoi apasă Recalculează pick-uri.</div>';

    hideInfoTexts();
    return;
  }

  if(GENERATOR_CLEARED){
    ACTIVE_PICKS = [];
    ACTIVE_REPORT = {raw:0,candidates:0,reason:'Generator liber după pornirea sesiunii.',mode:'cleared'};

    renderTopStats(s,ACTIVE_PICKS);

    if(el('badge')) el('badge').textContent = '—';
    if(el('summary')) el('summary').innerHTML = 'Generator liber pentru altă generare.';

    target.innerHTML =
      '<div class="pyramid-empty"><b>Generator liber.</b><br>' +
      'Apasă Recalculează pick-uri când vrei o variantă nouă.</div>';

    hideInfoTexts();
    return;
  }

  ACTIVE_PICKS = aiDecidePicks(s);

  var picks = ACTIVE_PICKS;
  var report = ACTIVE_REPORT || {};

  renderTopStats(s,picks);

  if(el('badge')){
    el('badge').textContent = picks.length ? picks.length + ' AI' : '—';
  }

  if(el('summary')){
    if(picks.length){
      var text = 'AI: <b style="color:var(--acc)">' + picks.length + '</b>';

      if(s.targetOdds){
        text += ' • țintă <b style="color:var(--yel)">' + fmt(s.targetOdds,2) + '</b>';
      }

      text += ' • cotă <b style="color:var(--yel)">' + fmt(comboOdds(picks),2) + '</b>';
      text += ' • prob. <b style="color:var(--grn)">' + pct(comboProb(picks)) + '</b>';

      el('summary').innerHTML = text;
    }else{
      el('summary').innerHTML = 'AI nu recomandă intrare acum.';
    }
  }

  if(!picks.length){
    target.innerHTML =
      '<div class="pyramid-empty"><b>Nu există intrare bună acum.</b><br>' +
      'Verificat: ' + (report.raw || 0) + ' înregistrări. AI nu forțează piramida dacă nu găsește combinație curată.</div>';
    hideInfoTexts();
    return;
  }

  target.innerHTML =
    '<div class="pyramid-picks">' +
      picks.map(pickCard).join('') +
    '</div>';

  hideInfoTexts();
}
function planRows(s,picks){
  var odds = picks.length ? comboOdds(picks) : (s.targetOdds || 1.30);

  if(!s.useRealOdds && s.targetOdds){
    odds = s.targetOdds;
  }

  odds = Math.max(1.10, odds);

  var rows = [];
  var stake = n(s.stake,0);

  for(var i=1;i<=s.steps;i++){
    var gross = stake * odds;

    rows.push({
      step:i,
      stake:stake,
      odds:odds,
      gross:gross,
      withdraw:0,
      next:gross,
      profit:gross - s.stake
    });

    stake = gross;
  }

  return rows;
}
function selectedStepStatusForPlan(sel, step){
  if(!sel) return {label:'0', cls:'wait'};

  var by = historyByStep(sel);
  var h = by[String(step)];
  if(h) return {label:statusLabel(h.status || 'win'), cls:statusClass(h.status || 'win')};

  if((sel.status === 'active' || sel.status === 'paused') && step === n(sel.currentStep,1)){
    return (sel.picks || []).length
      ? {label:'GENERAT', cls:'current'}
      : {label:'ÎN JOC', cls:'current'};
  }

  return {label:'0', cls:'wait'};
}
function planRowsForSession(sel,s,picks){
  if(!sel) return planRows(s,picks);

  var total = Math.max(1,n(sel.targetSteps || s.steps, s.steps));
  var rows = [];
  var by = historyByStep(sel);
  var stake = n(sel.initialStake || s.stake, s.stake);
  var defaultOdds = n(sel.targetOdds || s.targetOdds || 1.30,1.30);

  for(var i=1;i<=total;i++){
    var h = by[String(i)];
    var isCurrent = (sel.status === 'active' || sel.status === 'paused') && i === n(sel.currentStep,1) && !h;
    var odds = defaultOdds;
    var gross = 0;
    var profit = 0;
    var status = selectedStepStatusForPlan(sel,i);

    if(h){
      stake = n(h.stakeBefore,stake);
      odds = n(h.odds || defaultOdds,defaultOdds);
      gross = n(h.returnAfter,0);
      profit = stepProfitFromHistory(h);

      if((h.status || 'win').toLowerCase() === 'win'){
        stake = gross || +(stake * odds).toFixed(2);
      }
    }else if(isCurrent){
      stake = n(sel.currentStake || stake,stake);
      odds = n(sel.lastDailyOdds || defaultOdds,defaultOdds);
      gross = (sel.picks || []).length ? +(stake * odds).toFixed(2) : 0;
      profit = gross ? gross - stake : 0;
    }else{
      odds = defaultOdds;
      gross = stake ? +(stake * odds).toFixed(2) : 0;
      profit = gross ? gross - stake : 0;
    }

    rows.push({
      step:i,
      stake:stake,
      odds:odds,
      gross:gross,
      withdraw:0,
      next:gross,
      profit:profit,
      statusLabel:status.label,
      statusClass:status.cls
    });
  }

  return rows;
}
function renderPlan(s){
  var box = el('plan');
  if(!box) return;

  var picks = ACTIVE_PICKS || [];

  if(!hasUserCriteria(s)){
    box.innerHTML =
      '<div class="pyramid-empty">Completează cotă țintă/pas pentru calculul piramidei și afișarea evenimentelor.</div>';
    hideInfoTexts();
    return;
  }

  var selected = getSelectedSession();
  var selectedHeader = '';

  if(selected){
    var cur = Math.max(1, Math.min(n(selected.targetSteps,4), n(selected.currentStep,1)));
    var statusText =
      selected.status === 'active' ? 'activă' :
      selected.status === 'paused' ? 'anulată azi' :
      selected.status === 'lost' ? 'închisă LOSS' :
      selected.status === 'completed' ? 'închisă WIN' : 'cashout';

    selectedHeader = '<div class="pyramid-selected-status">🎯 Piramidă selectată: <b>Pas ' + cur + ' din ' + n(selected.targetSteps,4) + '</b> • status ' + esc(statusText) + ' • curent ' + money(selected.currentStake || selected.initialStake) + '</div>';
  }

  var rows = selected ? planRowsForSession(selected,s,picks) : planRows(s,picks);
  var final = rows[rows.length - 1] || {next:0};
  var shownStake = selected ? n(selected.initialStake,s.stake) : s.stake;
  var shownOdds = rows[0] ? rows[0].odds : (s.targetOdds || 1.30);
  var shownProb = picks.length ? pct(comboProb(picks)) : '—';

  box.innerHTML = selectedHeader +
    '<div class="pyramid-stats">' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + money(shownStake) + '</div><div class="pyramid-stat-l">Start</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + fmt(shownOdds,2) + '</div><div class="pyramid-stat-l">Cotă</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + money(selected ? (selected.currentStake || selected.initialStake) : final.next) + '</div><div class="pyramid-stat-l">Curent</div></div>' +
      '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + shownProb + '</div><div class="pyramid-stat-l">Prob.</div></div>' +
    '</div>' +
    '<div class="pyramid-plan-wrap"><table class="pyramid-plan-table"><thead><tr>' +
      '<th>Pas</th><th>Miză</th><th>Cotă</th><th>Câștig</th><th>Status</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr>' +
        '<td><span class="pyramid-step-chip">' + r.step + '</span></td>' +
        '<td>' + money(r.stake) + '</td>' +
        '<td>' + fmt(r.odds,2) + '</td>' +
        '<td>' + (r.gross ? money(r.gross) : '—') + '</td>' +
        '<td><span class="pyramid-plan-status ' + (r.statusClass || 'wait') + '">' + esc(r.statusLabel || '0') + '</span></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';

  hideInfoTexts();
}

/* =========================================================
   SESSIONS
========================================================= */

function getSessions(){
  var arr = readJson(STORAGE_SESSIONS,[]);
  return Array.isArray(arr) ? arr : [];
}
function saveSessions(arr){
  try{
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(arr || []));
    return true;
  }catch(e){
    return false;
  }
}
function compactAiReport(report){
  report = report || {};

  var combo = report.combo || {};

  return {
    raw:n(report.raw,0),
    candidates:n(report.candidates,0),
    tier:n(report.tier,0),
    relaxed:!!report.relaxed,
    mode:report.mode || '',
    reason:report.reason || '',
    selectedLegs:n(report.selectedLegs,0),
    combo:{
      odds:n(combo.odds,0),
      prob:n(combo.prob,0),
      ai:n(combo.ai,0),
      stability:n(combo.stability,0),
      edge:n(combo.edge,0),
      penalty:n(combo.penalty,0),
      score:n(combo.score,0),
      reached:!!combo.reached
    }
  };
}
function compactPickForSession(p){
  p = p || {};

  return {
    home:p.home,
    away:p.away,
    league:p.league,
    market:p.displayMarket || p.market,
    odds:n(p.odds,0),
    prob:n(p.prob,0),
    aiScore:p.ai && p.ai.total ? n(p.ai.total,0) : n(p.aiScore,0),
    date:p.date
  };
}
function clearGeneratorAfterSession(message){
  GENERATOR_CLEARED = true;
  ACTIVE_PICKS = [];
  ACTIVE_REPORT = {raw:0,candidates:0,reason:'Generator liber.',mode:'cleared'};

  var s = getSettings();
  var msg = message || 'Apasă Recalculează pick-uri când vrei o variantă nouă.';

  renderTopStats(s,ACTIVE_PICKS);

  if(el('badge')) el('badge').textContent = '—';
  if(el('summary')) el('summary').innerHTML = 'Generator liber pentru altă generare.';
  if(el('picks')){
    el('picks').innerHTML =
      '<div class="pyramid-empty"><b>Generator liber.</b><br>' +
      esc(msg) + '</div>';
  }

  renderPlan(s);
  hideInfoTexts();
}
function sessionProfit(s){
  if(!s) return 0;

  if(s.status === 'lost'){
    return -Math.max(n(s.currentStake,0), n(s.initialStake,0));
  }

  if(s.status === 'active' || s.status === 'paused'){
    return 0;
  }

  return n(s.currentStake || s.initialStake,0) - n(s.initialStake,0);
}
function sessionClass(s){
  if(!s) return 'open';
  if(s.status === 'lost') return 'loss';
  if(s.status === 'completed' || s.status === 'cashout') return 'win';
  return 'open';
}
function sessionStatusLabel(s){
  if(!s) return '0';
  if(s.status === 'lost') return 'Lose';
  if(s.status === 'completed' || s.status === 'cashout') return 'Win';
  return '0';
}
function sessionMaxStep(s){
  if(!s) return 0;
  var target = n(s.targetSteps,4);
  var current = n(s.currentStep,1);

  if(s.closedStep) return Math.max(1, Math.min(target, n(s.closedStep,1)));
  if(s.status === 'completed') return target;
  if(s.status === 'cashout') return Math.max(1, Math.min(target, current - 1));
  if(s.status === 'lost') return Math.max(1, Math.min(target, current));

  return Math.max(1, Math.min(target, current));
}
function sessionCreatedMs(s){
  var ms = s && s.createdAt ? new Date(s.createdAt).getTime() : NaN;
  return isFinite(ms) ? ms : n(s && s.id,0);
}
function getSelectedSession(){
  var arr = getSessions();
  if(!arr.length) return null;

  var found = arr.find(function(x){ return String(x.id) === String(SELECTED_SESSION_ID || ''); });
  return found || null;
}
function selectSession(id, ev){
  if(ev && ev.target && ev.target.closest && ev.target.closest('button,input,select,textarea,a,summary,details')) return;

  if(String(SELECTED_SESSION_ID || '') === String(id)){
    SELECTED_SESSION_ID = null;
  }else{
    SELECTED_SESSION_ID = id;
  }

  renderSessions();
  renderPlan(getSettings());
}
function historyByStep(s){
  var out = {};
  (Array.isArray(s && s.history) ? s.history : []).forEach(function(h){
    out[String(n(h.step,0))] = h;
  });
  return out;
}
function statusClass(status){
  status = String(status || '').toLowerCase();
  if(status === 'win' || status === 'completed') return 'win';
  if(status === 'loss' || status === 'lost' || status === 'lose') return 'loss';
  if(status === 'cashout') return 'cashout';
  if(status === 'current' || status === 'generated') return 'current';
  return 'wait';
}
function statusLabel(status){
  status = String(status || '').toLowerCase();
  if(status === 'win' || status === 'completed') return 'WIN';
  if(status === 'loss' || status === 'lost' || status === 'lose') return 'LOSS';
  if(status === 'cashout') return 'CASHOUT';
  if(status === 'generated') return 'GENERAT';
  if(status === 'current') return 'ÎN JOC';
  return '0';
}
function stepProfitFromHistory(h){
  if(!h) return 0;
  if(h.profit !== undefined) return n(h.profit,0);

  var st = n(h.stakeBefore,0);
  var ret = n(h.returnAfter,0);
  var status = String(h.status || 'win').toLowerCase();

  if(status === 'loss' || status === 'lost' || status === 'lose') return -st;
  if(status === 'cashout') return ret - st;
  return ret - st;
}
function formatSignedMoney(v){
  v = n(v,0);
  return (v > 0 ? '+' : '') + money(v);
}
function picksHtml(picks){
  picks = Array.isArray(picks) ? picks : [];
  if(!picks.length){
    return '<div class="pyramid-step-pick" style="color:var(--yel)">Nu există bilet generat pentru acest pas.</div>';
  }

  return picks.map(function(p){
    return '<div class="pyramid-step-pick">' +
      esc(p.home || '') + ' vs ' + esc(p.away || '') +
      ' • ' + esc(p.market || p.displayMarket || '') +
      ' @ ' + fmt(p.odds,2) +
    '</div>';
  }).join('');
}
function renderSessionStepHistory(s){
  if(!s) return '';

  var total = Math.max(1, n(s.targetSteps,4));
  var current = Math.max(1, Math.min(total, n(s.currentStep,1)));
  var by = historyByStep(s);
  var items = [];

  for(var i=1;i<=total;i++){
    var h = by[String(i)];
    var isCurrent = (s.status === 'active' || s.status === 'paused') && i === current && !h;
    var status = h ? (h.status || 'win') : (isCurrent ? ((s.picks || []).length ? 'generated' : 'current') : 'wait');
    var cls = statusClass(status);
    var label = statusLabel(status);
    var stake = h ? n(h.stakeBefore,0) : (isCurrent ? n(s.currentStake || s.initialStake,0) : 0);
    var odds = h ? n(h.odds || s.targetOdds || 1.30,1.30) : (isCurrent ? n(s.lastDailyOdds || s.targetOdds || 1.30,1.30) : n(s.targetOdds || 1.30,1.30));
    var ret = h ? n(h.returnAfter,0) : (isCurrent && (s.picks || []).length ? +(stake * odds).toFixed(2) : 0);
    var profit = h ? stepProfitFromHistory(h) : (isCurrent && (s.picks || []).length ? ret - stake : 0);
    var stepPicks = h ? (h.picks || []) : (isCurrent ? (s.picks || []) : []);
    var open = isCurrent || !!h;

    items.push(
      '<details class="pyramid-step-detail '+cls+'" ' + (open ? 'open' : '') + '>' +
        '<summary>' +
          '<span class="pyramid-step-title">Pas ' + i + ' din ' + total + '</span>' +
          '<span class="pyramid-plan-status '+cls+'">' + esc(label) + '</span>' +
        '</summary>' +
        '<div class="pyramid-step-body">' +
          '<div class="pyramid-step-money">' +
            '<span>Miză: ' + (stake ? money(stake) : '—') + '</span>' +
            '<span>Cotă: ' + (odds ? fmt(odds,2) : '—') + '</span>' +
            '<span>Return: ' + (ret ? money(ret) : '—') + '</span>' +
            '<span style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">Profit: ' + formatSignedMoney(profit) + '</span>' +
          '</div>' +
          '<div class="pyramid-step-picks">' + picksHtml(stepPicks) + '</div>' +
        '</div>' +
      '</details>'
    );
  }

  return '<div class="pyramid-step-list">' + items.join('') + '</div>';
}
function renderMonitorTable(arr){
  var chron = (arr || []).slice().sort(function(a,b){
    return sessionCreatedMs(a) - sessionCreatedMs(b);
  });

  if(!chron.length){
    return '<div class="pyramid-monitor-title">EVIDENȚĂ ÎNCERCĂRI PIRAMIDĂ</div>' +
      '<div class="pyramid-empty">Nu ai încercări salvate încă.</div>';
  }

  var rows = chron.map(function(s,i){
    var cls = sessionClass(s);
    return '<tr>' +
      '<td class="pyramid-monitor-attempt '+cls+'">' + (i + 1) + '</td>' +
      '<td>' + money(s.initialStake) + '</td>' +
      '<td>' + sessionMaxStep(s) + '</td>' +
      '<td>' + money(sessionProfit(s)) + '</td>' +
      '<td class="pyramid-monitor-status '+cls+'">' + esc(sessionStatusLabel(s)) + '</td>' +
    '</tr>';
  }).join('');

  return '<div class="pyramid-monitor-title">EVIDENȚĂ ÎNCERCĂRI PIRAMIDĂ</div>' +
    '<div class="pyramid-monitor-wrap"><table class="pyramid-monitor-table">' +
      '<thead><tr>' +
        '<th>Încerc.</th><th>Start</th><th>Pas max</th><th>Profit</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function renderMonitorSummary(arr){
  arr = arr || [];
  var wins = arr.filter(function(s){ return sessionClass(s) === 'win'; }).length;
  var loses = arr.filter(function(s){ return sessionClass(s) === 'loss'; }).length;
  var profit = arr.reduce(function(a,s){ return a + sessionProfit(s); },0);

  return '<div class="pyramid-monitor-summary">' +
    '<div class="pyramid-monitor-summary-title">STATISTICI GENERALE</div>' +
    '<div class="pyramid-monitor-summary-row"><div class="pyramid-monitor-summary-label">Total încercări</div><div class="pyramid-monitor-summary-value">' + arr.length + '</div></div>' +
    '<div class="pyramid-monitor-summary-row"><div class="pyramid-monitor-summary-label win">Serii WIN</div><div class="pyramid-monitor-summary-value">' + wins + '</div></div>' +
    '<div class="pyramid-monitor-summary-row"><div class="pyramid-monitor-summary-label loss">Serii LOSE</div><div class="pyramid-monitor-summary-value">' + loses + '</div></div>' +
    '<div class="pyramid-monitor-summary-row"><div class="pyramid-monitor-summary-label profit">Profit total</div><div class="pyramid-monitor-summary-value" style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(profit) + '</div></div>' +
  '</div>';
}
function createSession(){
  var s = saveSettingsFromUi(true);
  var picks = ACTIVE_PICKS && ACTIVE_PICKS.length && !GENERATOR_CLEARED ? ACTIVE_PICKS : [];

  if(!picks.length){
    if(typeof W.toast === 'function') W.toast('Generează întâi evenimentele, apoi pornește sesiunea.', 'warn');
    return false;
  }

  var odds = s.useRealOdds ? comboOdds(picks) : (s.targetOdds || comboOdds(picks));
  var arr = getSessions();

  var session = {
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
    aiReport:compactAiReport(ACTIVE_REPORT),
    picks:picks.map(compactPickForSession),
    awaitingGeneration:false
  };

  arr.unshift(session);

  if(!saveSessions(arr.slice(0,60))){
    if(typeof W.toast === 'function') W.toast('Nu pot salva sesiunea local. Eliberează cache/localStorage și încearcă din nou.', 'warn');
    return false;
  }

  SELECTED_SESSION_ID = null;
  clearGeneratorAfterSession('Sesiunea a fost plasată. Generatorul este pregătit pentru o nouă generare.');
  renderSessions();

  if(typeof W.toast === 'function'){
    W.toast('Sesiune pornită. Generatorul a fost eliberat.', 'ok');
  }

  return true;
}
function savePyramidDailySettings(){
  saveSettingsFromUi(false);
  clearGeneratorAfterSession('Setările au fost salvate. Recalculează când vrei să generezi evenimente.');
  renderSessions();
}
function sessionAction(id,action){
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
    if(!(s.picks || []).length){
      if(typeof W.toast === 'function') W.toast('Generează întâi pasul pentru această sesiune.', 'warn');
      return;
    }

    var before = n(s.currentStake || s.initialStake,0);
    var odds = n(s.lastDailyOdds || s.targetOdds || 1.30,1.30);
    var after = +(before * odds).toFixed(2);

    s.history.push({
      step:n(s.currentStep,1),
      status:'win',
      date:new Date().toISOString(),
      stakeBefore:before,
      odds:odds,
      returnAfter:after,
      profit:after - before,
      picks:(s.picks || []).slice()
    });

    s.currentStake = after;
    s.currentStep = n(s.currentStep,1) + 1;

    if(s.currentStep > n(s.targetSteps,4)){
      s.status = 'completed';
      s.closedAt = new Date().toISOString();
      s.closedStep = n(s.targetSteps,4);
    }else{
      s.picks = [];
      s.awaitingGeneration = true;
      s.lastDailyOdds = s.targetOdds || null;
    }
  }

  if(action === 'loss'){
    var lossStake = n(s.currentStake || s.initialStake,0);
    var lossOdds = n(s.lastDailyOdds || s.targetOdds || 1.30,1.30);

    if((s.picks || []).length){
      s.history.push({
        step:n(s.currentStep,1),
        status:'loss',
        date:new Date().toISOString(),
        stakeBefore:lossStake,
        odds:lossOdds,
        returnAfter:0,
        profit:-lossStake,
        picks:(s.picks || []).slice()
      });
    }

    s.status = 'lost';
    s.closedAt = new Date().toISOString();
    s.closedStep = Math.max(1, Math.min(n(s.targetSteps,4), n(s.currentStep,1)));
  }

  if(action === 'cashout'){
    var cashStake = n(s.currentStake || s.initialStake,0);
    s.history.push({
      step:n(s.currentStep,1),
      status:'cashout',
      date:new Date().toISOString(),
      stakeBefore:cashStake,
      odds:1,
      returnAfter:cashStake,
      profit:cashStake - n(s.initialStake,0),
      picks:(s.picks || []).slice()
    });

    s.status = 'cashout';
    s.closedAt = new Date().toISOString();
    s.closedStep = Math.max(1, Math.min(n(s.targetSteps,4), n(s.currentStep,1)));
  }

  if(action === 'cancelToday'){
    s.status = 'paused';
    s.pausedAt = new Date().toISOString();
    s.pauseReason = 'Pas anulat azi';
  }

  saveSessions(arr);

  if(action === 'win' || action === 'loss' || action === 'cashout' || action === 'cancelToday'){
    clearGeneratorAfterSession('Generatorul este liber. Selectează sesiunea dorită și generează pasul următor.');
  }

  renderSessions();
}
function generateStepForSession(id){
  var arr = getSessions();
  var s = arr.find(function(x){ return String(x.id) === String(id); });

  if(!s){
    if(typeof W.toast === 'function') W.toast('Sesiunea nu a fost găsită.', 'warn');
    return false;
  }

  if(s.status !== 'active' && s.status !== 'paused'){
    if(typeof W.toast === 'function') W.toast('Poți genera pași doar pentru sesiuni active.', 'warn');
    return false;
  }

  if(s.status === 'paused'){
    s.status = 'active';
    s.pausedAt = null;
  }

  var ui = saveSettingsFromUi(true);
  var currentStep = Math.max(1, n(s.currentStep,1));
  var targetSteps = Math.max(currentStep, n(s.targetSteps || ui.steps, ui.steps));

  ui.stake = n(s.currentStake || s.initialStake, s.initialStake);
  ui.targetOdds = n(s.targetOdds || ui.targetOdds, ui.targetOdds);
  ui.steps = targetSteps;
  ui.maxPicks = null;

  writeJson(STORAGE_SETTINGS, ui);
  loadSettingsIntoUi(ui);

  SELECTED_SESSION_ID = s.id;
  GENERATOR_CLEARED = false;

  renderPicks(ui);

  if(el('summary')){
    var prevSummary = el('summary').innerHTML || '';
    el('summary').innerHTML = '<b style="color:var(--acc)">Pas ' + currentStep + '/' + targetSteps + '</b> • ' + prevSummary;
  }

  var picks = ACTIVE_PICKS || [];

  if(!picks.length){
    s.awaitingGeneration = true;
    s.picks = [];
    saveSessions(arr);
    renderPlan(ui);
    renderSessions();

    if(typeof W.toast === 'function') W.toast('Nu există pick valid pentru pasul acestei sesiuni.', 'warn');
    return false;
  }

  s.picks = picks.map(compactPickForSession);
  s.lastDailyOdds = ui.useRealOdds ? comboOdds(picks) : (ui.targetOdds || comboOdds(picks));
  s.awaitingGeneration = false;
  s.generatedAt = new Date().toISOString();
  s.aiReport = compactAiReport(ACTIVE_REPORT);

  saveSessions(arr);
  renderPlan(ui);
  renderSessions();

  if(typeof W.toast === 'function'){
    W.toast('Pasul ' + currentStep + '/' + targetSteps + ' a fost generat pentru sesiunea selectată.', 'ok');
  }

  return true;
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

  s.currentStake = n(last.stakeBefore,s.initialStake);
  s.currentStep = n(last.step,1);
  s.status = 'active';
  s.picks = Array.isArray(last.picks) ? last.picks : (s.picks || []);
  s.lastDailyOdds = n(last.odds || s.lastDailyOdds || s.targetOdds, s.targetOdds || 1.30);
  s.awaitingGeneration = !((s.picks || []).length);

  saveSessions(arr);
  renderSessions();

  if(typeof W.toast === 'function'){
    W.toast('Ultimul pas a fost șters.', 'ok');
  }
}
function updateSessionSteps(id){
  var arr = getSessions();
  var s = arr.find(function(x){ return String(x.id) === String(id); });

  if(!s) return;

  var input = D.getElementById('pyramid-session-steps-' + id);
  var requested = input ? Math.round(n(input.value,0)) : 0;

  if(!requested){
    if(typeof W.toast === 'function') W.toast('Introdu un număr valid de pași.', 'warn');
    return;
  }

  s.history = Array.isArray(s.history) ? s.history : [];

  var playedMax = s.history.reduce(function(max,h){
    return Math.max(max,n(h.step,0));
  },0);
  playedMax = Math.max(playedMax, n(s.closedStep,0));

  var oldTotal = Math.max(1,n(s.targetSteps,4));
  var newTotal = Math.max(1, Math.min(30, requested));

  if(newTotal < playedMax){
    newTotal = playedMax;
    if(input) input.value = newTotal;
    if(typeof W.toast === 'function') W.toast('Nu pot coborî sub pașii deja jucați. Am păstrat minimul valid.', 'warn');
  }

  s.targetSteps = newTotal;

  if((s.status === 'completed' || s.status === 'cashout') && newTotal > oldTotal){
    s.status = 'active';
    s.closedAt = null;
    s.closedStep = null;
    s.currentStep = Math.max(playedMax + 1, 1);
    s.currentStake = n(s.currentStake || s.initialStake, s.initialStake);
    s.picks = [];
    s.awaitingGeneration = true;
    s.lastDailyOdds = s.targetOdds || null;
  }

  if((s.status === 'active' || s.status === 'paused') && n(s.currentStep,1) > newTotal){
    s.currentStep = newTotal;
  }

  saveSessions(arr);
  SELECTED_SESSION_ID = s.id;
  clearGeneratorAfterSession('Numărul de pași a fost actualizat. Generează pasul curent când ești pregătit.');
  renderSessions();
  renderPlan(getSettings());

  if(typeof W.toast === 'function'){
    W.toast('Piramida a fost actualizată la ' + newTotal + ' pași.', 'ok');
  }
}
function deleteSession(id){
  saveSessions(getSessions().filter(function(s){
    return String(s.id) !== String(id);
  }));

  if(String(SELECTED_SESSION_ID || '') === String(id)){
    SELECTED_SESSION_ID = null;
  }

  renderSessions();
  renderPlan(getSettings());
}
function renderSessions(){
  var stats = el('sessionStats');
  var list = el('sessionList');

  if(!stats || !list) return;

  var arr = getSessions();

  if(arr.length && SELECTED_SESSION_ID && !arr.some(function(x){ return String(x.id) === String(SELECTED_SESSION_ID || ''); })){
    SELECTED_SESSION_ID = null;
  }

  stats.innerHTML =
    '<div class="pyramid-monitor-grid">' +
      '<div>' + renderMonitorTable(arr) + '</div>' +
      '<div>' + renderMonitorSummary(arr) + '</div>' +
    '</div>';

  if(!arr.length){
    list.innerHTML = '<div class="pyramid-empty">Nu ai sesiuni monitorizate.</div>';
    return;
  }

  list.innerHTML = '<div class="pyramid-monitor-cards-title">Sesiuni / acțiuni</div>' + arr.slice(0,20).map(function(s, idx){
    s.history = Array.isArray(s.history) ? s.history : [];

    var selected = String(SELECTED_SESSION_ID || '') === String(s.id);
    var label =
      s.status === 'active' ? 'Piramidă activă' :
      s.status === 'paused' ? 'Piramidă anulată azi' :
      s.status === 'lost' ? 'Piramidă LOSS' :
      s.status === 'completed' ? 'Piramidă WIN' : 'Piramidă cashout';

    var prof = sessionProfit(s);
    var totalSteps = Math.max(1,n(s.targetSteps,4));
    var currentStep = Math.max(1, Math.min(totalSteps, n(s.currentStep,1)));
    if(s.status === 'completed') currentStep = totalSteps;

    var currentPicks = (s.picks || []).length
      ? (s.picks || []).map(function(p){
          return esc(p.home || '') + ' vs ' + esc(p.away || '') + ' • ' + esc(p.market || '') + ' @ ' + fmt(p.odds,2);
        }).join('<br>')
      : '<span style="color:var(--yel);font-weight:800">Fără bilet pe pasul curent. Apasă „Generează pasul”.</span>';

    var playedMax = s.history.reduce(function(max,h){ return Math.max(max,n(h.step,0)); },0);
    playedMax = Math.max(playedMax,n(s.closedStep,0));
    var minEditableSteps = Math.max(1, playedMax || currentStep);
    var selectedSettings = selected
      ? '<div class="pyramid-session-settings" onclick="event.stopPropagation()">' +
          '<div><label>Pași piramidă selectată</label><input id="pyramid-session-steps-' + s.id + '" type="number" min="' + minEditableSteps + '" max="30" step="1" value="' + totalSteps + '"></div>' +
          '<button class="btn pyramid-action-save-steps" onclick="pyramidUpdateSessionSteps(\'' + s.id + '\')">Salvează pași</button>' +
        '</div>'
      : '';

    var cardStatus =
      s.status === 'active' ? 'ACTIVĂ' :
      s.status === 'paused' ? 'PAUZĂ' :
      sessionStatusLabel(s).toUpperCase();

    var sessionKpi = '<div class="pyramid-session-kpi">' +
      '<span><b>' + currentStep + '/' + totalSteps + '</b>Pas curent</span>' +
      '<span><b>' + cardStatus + '</b>Status</span>' +
      '<span><b>' + money(prof) + '</b>Profit</span>' +
    '</div>';

    var actions = '';
    var stop = 'event.stopPropagation();';

    if(s.status === 'active'){
      actions =
        '<button class="btn pyramid-action-generate" onclick="'+stop+'pyramidGenerateSessionStep(\''+s.id+'\')">🎯 Generează pasul ' + currentStep + '/' + totalSteps + '</button>' +
        '<button class="btn pyramid-action-win" onclick="'+stop+'pyramidDailyAction(\''+s.id+'\',\'win\')">✅ WIN</button>' +
        '<button class="btn pyramid-action-loss" onclick="'+stop+'pyramidDailyAction(\''+s.id+'\',\'loss\')">❌ LOSS</button>' +
        '<button class="btn pyramid-action-cashout" onclick="'+stop+'pyramidDailyAction(\''+s.id+'\',\'cashout\')">💰 Cashout</button>' +
        '<button class="btn pyramid-action-pause" onclick="'+stop+'pyramidDailyAction(\''+s.id+'\',\'cancelToday\')">⏸ Anulează azi</button>';

      if(s.history.length){
        actions += '<button class="btn pyramid-action-pause" onclick="'+stop+'pyramidUndoLastStep(\''+s.id+'\')">↩ Șterge ultimul pas</button>';
      }

      actions += '<button class="btn pyramid-action-delete-session" onclick="'+stop+'if(confirm(\'Ștergi definitiv această piramidă?\')) pyramidDeleteSession(\''+s.id+'\')">🗑 Șterge piramidă</button>';
    }else if(s.status === 'paused'){
      actions =
        '<button class="btn pyramid-action-generate" onclick="'+stop+'pyramidDailyAction(\''+s.id+'\',\'resume\')">▶ Reia sesiunea</button>' +
        (s.history.length ? '<button class="btn pyramid-action-pause" onclick="'+stop+'pyramidUndoLastStep(\''+s.id+'\')">↩ Șterge ultimul pas</button>' : '') +
        '<button class="btn pyramid-action-delete-session" onclick="'+stop+'if(confirm(\'Ștergi definitiv această piramidă?\')) pyramidDeleteSession(\''+s.id+'\')">🗑 Șterge piramidă</button>';
    }else{
      actions = '<button class="btn pyramid-action-delete-session" onclick="'+stop+'if(confirm(\'Ștergi definitiv această piramidă?\')) pyramidDeleteSession(\''+s.id+'\')">🗑 Șterge piramidă</button>';
    }

    var stepHistory = renderSessionStepHistory(s);
    var collapsedMeta = 'Start ' + money(s.initialStake) + ' • curent ' + money(s.currentStake || s.initialStake) + ' • cotă ' + fmt(s.lastDailyOdds || s.targetOdds || 1.30,2);

    if(!selected){
      return '<div class="pyramid-session collapsed" onclick="pyramidSelectSession(\''+s.id+'\', event)" role="button" tabindex="0">' +
        '<div class="pyramid-session-row">' +
          '<div class="pyramid-session-row-main">' +
            '<span class="pyramid-row-title">Pir. ' + (idx + 1) + '</span>' +
            '<span class="pyramid-row-chip">Pas ' + currentStep + '/' + totalSteps + '</span>' +
            '<span class="pyramid-row-chip status">' + esc(cardStatus) + '</span>' +
            '<span class="pyramid-row-chip">Miză ' + moneyCompact(s.currentStake || s.initialStake) + '</span>' +
            '<span class="pyramid-row-profit" style="color:' + (prof >= 0 ? 'var(--grn)' : 'var(--red)') + '">P/L ' + moneyCompact(prof) + '</span>' +
          '</div>' +
          '<span class="pyramid-row-chevron">⌄</span>' +
        '</div>' +
      '</div>';
    }

    var expandedContent = '<div class="pyramid-session-expanded">' +
      '<div class="pyramid-session-meta">' + collapsedMeta + '<br>' + currentPicks + '</div>' +
      sessionKpi +
      selectedSettings +
      stepHistory +
      '<div class="pyramid-session-actions">' + actions + '</div>' +
    '</div>';

    return '<div class="pyramid-session selected" onclick="pyramidSelectSession(\''+s.id+'\', event)">' +
      '<div class="pyramid-session-head">' +
        '<div style="min-width:0;flex:1">' +
          '<div class="pyramid-session-name">' + esc(label) + ' · Pas ' + currentStep + ' din ' + totalSteps + '</div>' +
          '<div class="pyramid-session-badge">DESCHIS</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-end;gap:8px;flex-shrink:0">' +
          '<div class="pyramid-session-profit" style="color:' + (prof >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(prof) + '</div>' +
          '<div class="pyramid-session-toggle">⌃</div>' +
        '</div>' +
      '</div>' +
      expandedContent +
    '</div>';
  }).join('');
}

/* =========================================================
   BIND / PATCH
========================================================= */

function bind(){
  injectCompactCss();
  hideUnusedControls();
  hideInfoTexts();

  var refresh = el('refreshBtn');
  if(refresh && !refresh.__pyrV16){
    refresh.__pyrV16 = true;
    refresh.addEventListener('click',refreshPyramidDaily);
  }

  var start = el('startBtn');
  if(start && !start.__pyrV16){
    start.__pyrV16 = true;
    start.addEventListener('click',createSession);
  }

  var save = el('saveBtn');
  if(save && !save.__pyrV16){
    save.__pyrV16 = true;
    save.addEventListener('click',function(){
      savePyramidDailySettings();
    });
  }

  ['stake','odds','steps','day','useRealOdds'].forEach(function(k){
    var node = el(k);

    if(node && !node.__pyrV16){
      node.__pyrV16 = true;

      node.addEventListener('change',function(){
        saveSettingsFromUi(true);
        clearGeneratorAfterSession('Criteriile au fost actualizate. Apasă Recalculează pick-uri pentru generare.');
        renderSessions();
      });

      node.addEventListener('input',function(){
        saveSettingsFromUi(true);
        clearGeneratorAfterSession('Criteriile au fost actualizate. Apasă Recalculează pick-uri pentru generare.');
        renderSessions();
      });
    }
  });
}
function renderPyramidDaily(){
  if(!D.getElementById('tab-piramida')) return;

  bind();

  GENERATOR_CLEARED = true;
  ACTIVE_PICKS = [];
  ACTIVE_REPORT = {raw:0,candidates:0,reason:'Generator gol la intrarea în Piramidă.',mode:'idle'};

  var s = getSettings();

  loadSettingsIntoUi(s);
  renderPicks(s);
  renderPlan(s);
  renderSessions();
  hideInfoTexts();
}
function refreshPyramidDaily(){
  GENERATOR_CLEARED = false;
  var s = saveSettingsFromUi(true);

  renderPicks(s);
  renderPlan(s);
  renderSessions();
  hideInfoTexts();
}

W.renderPyramidDaily = renderPyramidDaily;
W.refreshPyramidDaily = refreshPyramidDaily;
W.createPyramidDailySession = createSession;
W.savePyramidDailySettings = savePyramidDailySettings;
W.pyramidDailyAction = sessionAction;
W.pyramidUndoLastStep = undoStep;
W.pyramidDeleteSession = deleteSession;
W.pyramidUpdateSessionSteps = updateSessionSteps;
W.pyramidGenerateSessionStep = generateStepForSession;
W.pyramidSelectSession = selectSession;

var oldSwitch = W.switchTab;
if(typeof oldSwitch === 'function' && !oldSwitch.__pyrV16){
  var patchedSwitch = function(name){
    var r = oldSwitch.apply(this,arguments);

    if(name === 'piramida'){
      setTimeout(renderPyramidDaily,0);
    }

    return r;
  };

  patchedSwitch.__pyrV16 = true;
  W.switchTab = patchedSwitch;
}

var oldRefresh = W.doRefresh;
if(typeof oldRefresh === 'function' && !oldRefresh.__pyrV16){
  var patchedRefresh = function(){
    var r = oldRefresh.apply(this,arguments);

    setTimeout(function(){
      var active = D.querySelector('.tab-content.active');

      if(active && active.id === 'tab-piramida'){
        renderPyramidDaily();
      }
    },900);

    return r;
  };

  patchedRefresh.__pyrV16 = true;
  W.doRefresh = patchedRefresh;
}

D.addEventListener('DOMContentLoaded',function(){
  bind();

  var active = D.querySelector('.tab-content.active');

  if(active && active.id === 'tab-piramida'){
    renderPyramidDaily();
  }
});

setTimeout(bind,300);
setTimeout(bind,900);
setTimeout(function(){
  var active = D.querySelector('.tab-content.active');

  if(active && active.id === 'tab-piramida'){
    renderPyramidDaily();
  }else{
    hideInfoTexts();
  }
},1400);

})();
