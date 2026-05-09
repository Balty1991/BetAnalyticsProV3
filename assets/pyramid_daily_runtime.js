(function(){
'use strict';

if(window.__PyramidDailyRuntimeV3) return;
window.__PyramidDailyRuntimeV3 = true;

var W = window;
var D = document;

var STORAGE_SETTINGS = 'bet_pyramid_daily_settings';
var STORAGE_SESSIONS = 'bet_pyramid_daily_sessions';

var ACTIVE_PICKS = [];
var ACTIVE_ENGINE_REPORT = null;

var IDS = {
  stake: ['pyramid-stake','pyrStake'],
  odds: ['pyramid-target-odds','pyrTargetOdds','pyrOdds'],
  steps: ['pyramid-steps','pyrSteps'],
  count: ['pyramid-picks-count','pyrPickCount','pyrCount'],
  profile: ['pyramid-profile','pyrProfile'],
  day: ['pyramid-day-mode','pyrDayMode','pyrDay'],
  useRealOdds: ['pyramid-use-real-odds','pyrUseRealOdds'],

  picks: ['pyramid-picks-list','pyrPicks'],
  badge: ['pyramid-picks-badge','pyrDailyBadge','pyrBadge'],
  summary: ['pyramid-ticket-summary','pyrDailyMeta','pyrSummary'],
  topStats: ['pyramid-top-stats','pyrTopStats'],
  plan: ['pyramid-plan','pyrPlan'],
  sessionStats: ['pyramid-session-stats','pyrSessionStats','pyrStats'],
  sessionList: ['pyramid-session-list','pyrSessions','pyrList'],

  refreshBtn: ['pyramid-refresh','pyrRefresh'],
  startBtn: ['pyramid-start-session','pyrStartSession','pyrStart'],
  saveBtn: ['pyramid-save-settings','pyrSave']
};

function firstId(list){
  for(var i=0;i<list.length;i++){
    var el = D.getElementById(list[i]);
    if(el) return el;
  }
  return null;
}
function el(key){ return firstId(IDS[key] || [key]); }

function esc(v){
  if(typeof W.htmlEsc === 'function') return W.htmlEsc(v);
  return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function n(v, fallback){
  var x = Number(v);
  return isFinite(x) ? x : (fallback || 0);
}
function pctValue(v){
  var x = n(v, 0);
  if(Math.abs(x) <= 1) return x * 100;
  return x;
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function money(v){
  return n(v,0).toLocaleString('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' RON';
}
function fmt(v,d){ return n(v,0).toFixed(d == null ? 2 : d); }
function pct(v){ return fmt(v,1) + '%'; }
function signed(v,d){
  var x = n(v,0);
  return (x >= 0 ? '+' : '') + x.toFixed(d == null ? 1 : d);
}
function readJson(key, fallback){
  try{
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function writeJson(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
}
function todayKeyFromDate(date){
  var d = date ? new Date(date) : new Date();
  if(typeof W.fmtDateKey === 'function') return W.fmtDateKey(d.toISOString());
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function eventDateMs(item){
  if(typeof W.getEventDateMs === 'function'){
    try{ return W.getEventDateMs(item); }catch(e){}
  }
  var raw = item && (item.date || item.event_date || item.eventDate || item.start_time || null);
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function genericKey(item){
  if(typeof W.getGenericEventKey === 'function'){
    try{ return W.getGenericEventKey(item); }catch(e){}
  }
  return [
    item && (item.eventId || item.event_id || item.id || ''),
    item && (item.home || item.homeTeam || ''),
    item && (item.away || item.awayTeam || ''),
    item && (item.date || item.event_date || item.eventDate || '')
  ].join('|');
}
function areCorrelated(a,b){
  if(!a || !b) return false;
  if(typeof W.areRowsCorrelated === 'function'){
    try{ return W.areRowsCorrelated(a,b); }catch(e){}
  }
  if(genericKey(a) === genericKey(b)) return true;
  var aLeague = String(a.league || '').toLowerCase();
  var bLeague = String(b.league || '').toLowerCase();
  var aMs = eventDateMs(a);
  var bMs = eventDateMs(b);
  var sameLeague = aLeague && bLeague && aLeague === bLeague;
  var closeTime = aMs && bMs && Math.abs(aMs - bMs) < 90 * 60000;
  return sameLeague && closeTime;
}

function defaultSettings(){
  return {
    stake: 20,
    targetOdds: 1.30,
    steps: 7,
    picksCount: 1,
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
    targetOdds: clamp(n(raw.targetOdds, d.targetOdds), 1.10, 2.50),
    steps: Math.round(clamp(n(raw.steps, d.steps), 4, 10)),
    picksCount: Math.round(clamp(n(raw.picksCount, d.picksCount), 1, 2)),
    profile: ['ultra','safe','balanced'].indexOf(String(raw.profile || d.profile)) >= 0 ? String(raw.profile || d.profile) : d.profile,
    dayMode: String(raw.dayMode || d.dayMode) === 'tomorrow' ? 'tomorrow' : 'today',
    useRealOdds: raw.useRealOdds === false || raw.useRealOdds === 'no' ? false : true
  };
}
function getSettings(){
  return sanitizeSettings(readJson(STORAGE_SETTINGS, defaultSettings()));
}
function saveSettingsFromUi(silent){
  var settings = sanitizeSettings({
    stake: el('stake') ? el('stake').value : undefined,
    targetOdds: el('odds') ? el('odds').value : undefined,
    steps: el('steps') ? el('steps').value : undefined,
    picksCount: el('count') ? el('count').value : undefined,
    profile: el('profile') ? el('profile').value : undefined,
    dayMode: el('day') ? el('day').value : undefined,
    useRealOdds: el('useRealOdds') ? el('useRealOdds').value !== 'no' : true
  });
  writeJson(STORAGE_SETTINGS, settings);
  if(!silent && typeof W.toast === 'function') W.toast('Setări salvate pentru Piramidă Daily', 'ok');
  return settings;
}
function loadSettingsIntoUi(settings){
  settings = sanitizeSettings(settings || getSettings());
  if(el('stake')) el('stake').value = Number(settings.stake).toFixed(2);
  if(el('odds')) el('odds').value = Number(settings.targetOdds).toFixed(2);
  if(el('steps')) el('steps').value = settings.steps;
  if(el('count')) el('count').value = settings.picksCount;
  if(el('profile')) el('profile').value = settings.profile;
  if(el('day')) el('day').value = settings.dayMode;
  if(el('useRealOdds')) el('useRealOdds').value = settings.useRealOdds ? 'yes' : 'no';
}
function targetDayKey(settings){
  var d = new Date();
  d.setHours(12,0,0,0);
  if(settings.dayMode === 'tomorrow') d.setDate(d.getDate()+1);
  return todayKeyFromDate(d);
}

function marketKeyFrom(value){
  var s = String(value || '').toLowerCase();
  if(s.indexOf('over 1.5') >= 0 || s.indexOf('peste 1.5') >= 0 || s === 'over15') return 'over15';
  if(s.indexOf('under 3.5') >= 0 || s.indexOf('sub 3.5') >= 0 || s === 'under35') return 'under35';
  if(s.indexOf('over 2.5') >= 0 || s.indexOf('peste 2.5') >= 0 || s === 'over25') return 'over25';
  if(s.indexOf('btts') >= 0 || s.indexOf('ambele') >= 0) return 'btts';
  return s;
}
function marketLabel(key, fallback){
  if(fallback) return fallback;
  if(key === 'over15') return 'Over 1.5G';
  if(key === 'under35') return 'Under 3.5G';
  if(key === 'over25') return 'Over 2.5G';
  if(key === 'btts') return 'BTTS';
  return key || '—';
}
function profileCfg(profile){
  if(profile === 'balanced'){
    return {
      minProb: 66,
      minAiScore: 70,
      maxOdds: 1.90,
      maxComboOdds: 2.65
