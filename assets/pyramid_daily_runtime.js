(function(){
'use strict';

var W = window;
var STORAGE_SETTINGS = 'bet_pyramid_daily_settings';
var STORAGE_SESSIONS = 'bet_pyramid_daily_sessions';
var ACTIVE_PICKS = [];

function byId(id){ return document.getElementById(id); }
function esc(v){
  if(typeof W.htmlEsc === 'function') return W.htmlEsc(v);
  return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
}
function money(v){ return Number(v || 0).toLocaleString('ro-RO', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' RON'; }
function pct(v){ return Number(v || 0).toFixed(1) + '%'; }
function num(v,d){ return Number(v || 0).toFixed(d == null ? 2 : d); }
function todayKey(){
  if(typeof W.fmtDateKey === 'function') return W.fmtDateKey(new Date().toISOString());
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function readJson(key, fallback){
  try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; }
}
function writeJson(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){}
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function defaultSettings(){ return { stake:20, targetOdds:1.30, steps:7, picksCount:1, profile:'ultra', dayMode:'today' }; }
function sanitizeSettings(raw){
  var d = defaultSettings();
  raw = raw || {};
  return {
    stake: clamp(Number(raw.stake || d.stake), 1, 100000),
    targetOdds: clamp(Number(raw.targetOdds || d.targetOdds), 1.10, 2.50),
    steps: Math.round(clamp(Number(raw.steps || d.steps), 4, 10)),
    picksCount: Math.round(clamp(Number(raw.picksCount || d.picksCount), 1, 2)),
    profile: ['ultra','safe','balanced'].indexOf(String(raw.profile || d.profile)) >= 0 ? String(raw.profile || d.profile) : d.profile,
    dayMode: String(raw.dayMode || d.dayMode) === 'tomorrow' ? 'tomorrow' : 'today'
  };
}
function getSettings(){ return sanitizeSettings(readJson(STORAGE_SETTINGS, defaultSettings())); }
function saveSettingsFromUi(silent){
  var settings = sanitizeSettings({
    stake: byId('pyramid-stake') ? byId('pyramid-stake').value : undefined,
    targetOdds: byId('pyramid-target-odds') ? byId('pyramid-target-odds').value : undefined,
    steps: byId('pyramid-steps') ? byId('pyramid-steps').value : undefined,
    picksCount: byId('pyramid-picks-count') ? byId('pyramid-picks-count').value : undefined,
    profile: byId('pyramid-profile') ? byId('pyramid-profile').value : undefined,
    dayMode: byId('pyramid-day-mode') ? byId('pyramid-day-mode').value : undefined
  });
  writeJson(STORAGE_SETTINGS, settings);
  if(!silent && typeof W.toast === 'function') W.toast('Setările Piramidă Daily au fost salvate', 'ok');
  return settings;
}
function loadSettingsIntoUi(settings){
  settings = sanitizeSettings(settings || getSettings());
  if(byId('pyramid-stake')) byId('pyramid-stake').value = Number(settings.stake).toFixed(2);
  if(byId('pyramid-target-odds')) byId('pyramid-target-odds').value = Number(settings.targetOdds).toFixed(2);
  if(byId('pyramid-steps')) byId('pyramid-steps').value = settings.steps;
  if(byId('pyramid-picks-count')) byId('pyramid-picks-count').value = settings.picksCount;
  if(byId('pyramid-profile')) byId('pyramid-profile').value = settings.profile;
  if(byId('pyramid-day-mode')) byId('pyramid-day-mode').value = settings.dayMode;
}
function targetDayKey(settings){
  var d = new Date();
  d.setHours(12,0,0,0);
  if(settings.dayMode === 'tomorrow') d.setDate(d.getDate() + 1);
  if(typeof W.fmtDateKey === 'function') return W.fmtDateKey(d.toISOString());
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function eventDateMs(item){
  if(typeof W.getEventDateMs === 'function') return W.getEventDateMs(item);
  var raw = item && (item.event_date || item.eventDate || item.date || null);
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}
function genericKey(item){
  if(typeof W.getGenericEventKey === 'function') return W.getGenericEventKey(item);
  if(!item) return 'na';
  return [item.eventId || item.event_id || '', item.home || '', item.away || '', item.date || item.event_date || ''].join('|');
}
function correlated(a,b){
  if(typeof W.areRowsCorrelated === 'function') return W.areRowsCorrelated(a,b);
  return genericKey(a) === genericKey(b);
}
function marketSafetyBoost(item){
  var mk = String(item && (item.marketKey || item.market_key || item.market || '')).toLowerCase();
  if(mk === 'over15') return 10;
  if(mk === 'under35') return 9;
  if(mk === 'over25') return 3;
  if(mk === 'btts') return 1;
  return 0;
}
function profileCfg(profile){
  if(profile === 'balanced') return {minProb:66,minScore:72,maxOdds:1.80,minEdge:-1,minValue:-0.01};
  if(profile === 'safe') return {minProb:70,minScore:75,maxOdds:1.65,minEdge:0,minValue:0};
  return {minProb:74,minScore:78,maxOdds:1.52,minEdge:1,minValue:0};
}
function itemRank(item, settings){
  var odds = Number(item.odds || item.displayOdds || 0);
  var prob = Number(item.prob || 0);
  var edge = Math.max(Number(item.edge || 0), Number(item.edgeToPrice || 0));
  var value = Number(item.value || 0) * 100;
  var score = Number(item.score || item.ticketScore || item.portfolioScore || 0);
  var conf = Number(item.confidence || 0);
  var targetFit = Math.max(-8, 8 - Math.abs(odds - Number(settings.targetOdds || 1.30)) * 22);
  return score + prob * 0.38 + Math.max(0, edge) * 1.10 + Math.max(0, value) * 0.36 + conf * 0.12 + marketSafetyBoost(item) + targetFit;
}
function buildFallbackCandidateFromMatch(m){
  if(!m || !m.bestBet) return null;
  var b = m.bestBet;
  return Object.assign({}, m, {
    eventKey: genericKey(m),
    marketKey: b.type || '',
    market: b.label || '',
    displayMarket: b.label || '',
    displayOdds: Number(b.odds || 0),
    odds: Number(b.odds || 0),
    prob: Number(b.adjProb || b.prob || 0),
    value: Number(b.value || 0),
    edge: Number(b.edgePct || 0),
    edgeToPrice: Number(b.edgePct || 0),
    score: Number(m.smartScore || m.confidence || 0),
    bestBet: Object.assign({}, b)
  });
}
function candidatePool(settings){
  settings = sanitizeSettings(settings);
  var cfg = profileCfg(settings.profile);
  var day = targetDayKey(settings);
  var now = Date.now();
  var raw = [];
  try {
    if(typeof W.getPortfolioMatchPool === 'function') raw = W.getPortfolioMatchPool();
  } catch(e){ raw = []; }
  if(!raw || !raw.length){
    raw = (W.ALL_MATCHES || []).map(buildFallbackCandidateFromMatch).filter(Boolean);
  }
  var seen = {};
  return raw.filter(function(item){
    var key = item.dateKey || (item.date ? (typeof W.fmtDateKey === 'function' ? W.fmtDateKey(item.date) : '') : '');
    if(key !== day) return false;
    var ms = eventDateMs(item);
    if(ms != null && settings.dayMode === 'today' && ms < now - 20 * 60000) return false;
    var odds = Number(item.odds || item.displayOdds || 0);
    var prob = Number(item.prob || 0);
    var score = Number(item.score || item.ticketScore || item.portfolioScore || 0);
    var edge = Math.max(Number(item.edge || 0), Number(item.edgeToPrice || 0));
    var value = Number(item.value || 0);
    if(!(odds >= 1.10 && odds <= cfg.maxOdds)) return false;
    if(prob < cfg.minProb || score < cfg.minScore) return false;
    if(edge < cfg.minEdge || value < cfg.minValue) return false;
    var mk = String(item.marketKey || item.market_key || item.market || '').toLowerCase();
    if(['over15','under35','over25','btts'].indexOf(mk) < 0) return false;
    var sig = genericKey(item) + ':' + mk;
    if(seen[sig]) return false;
    seen[sig] = true;
    return true;
  }).map(function(item){
    var clone = Object.assign({}, item);
    clone.pyramidRank = itemRank(clone, settings);
    return clone;
  }).sort(function(a,b){
    if(Number(b.pyramidRank || 0) !== Number(a.pyramidRank || 0)) return Number(b.pyramidRank || 0) - Number(a.pyramidRank || 0);
    if(Number(b.prob || 0) !== Number(a.prob || 0)) return Number(b.prob || 0) - Number(a.prob || 0);
    return Number(a.odds || 0) - Number(b.odds || 0);
  });
}
function selectDailyPicks(settings){
  settings = sanitizeSettings(settings);
  var pool = candidatePool(settings);
  var picks = [];
  for(var i=0;i<pool.length && picks.length<settings.picksCount;i++){
    var item = pool[i];
    if(picks.some(function(p){ return correlated(p,item); })) continue;
    picks.push(item);
  }
  if(!picks.length && settings.profile !== 'balanced'){
    var relaxed = sanitizeSettings(Object.assign({}, settings, {profile: settings.profile === 'ultra' ? 'safe' : 'balanced'}));
    return selectDailyPicks(relaxed);
  }
  return picks;
}
function totalOddsFor(picks){ return (picks || []).reduce(function(acc,p){ return acc * Number(p.odds || p.displayOdds || 1); }, 1); }
function combinedProbFor(picks){
  if(typeof W.computeConservativeCombinedProb === 'function'){
    try { return W.computeConservativeCombinedProb(picks); } catch(e){}
  }
  return (picks || []).reduce(function(acc,p){ return acc * (Number(p.prob || 0) / 100); }, 1) * 100;
}
function planRows(settings, picks){
  var rows = [];
  var stake = Number(settings.stake || 0);
  var actualOdds = picks && picks.length ? totalOddsFor(picks) : Number(settings.targetOdds || 1.30);
  var displayOdds = Math.max(Number(settings.targetOdds || 1.30), actualOdds > 1.01 ? actualOdds : 0);
  for(var i=1;i<=Number(settings.steps || 7);i++){
    var gross = stake * displayOdds;
    rows.push({ step:i, stake:stake, odds:displayOdds, gross:gross, withdraw:0, next:gross, profit:gross - Number(settings.stake || 0) });
    stake = gross;
  }
  return rows;
}
function renderMini(label, value, color){
  return '<div class="pyramid-mini"><div class="pyramid-mini-v"' + (color ? ' style="color:'+color+'"' : '') + '>' + value + '</div><div class="pyramid-mini-l">' + label + '</div></div>';
}
function renderPickCard(item, idx){
  var odds = Number(item.odds || item.displayOdds || 0);
  var prob = Number(item.prob || 0);
  var edge = Math.max(Number(item.edge || 0), Number(item.edgeToPrice || 0));
  var value = Number(item.value || 0) * 100;
  var score = Number(item.score || item.ticketScore || item.portfolioScore || 0);
  var market = item.displayMarket || item.market || (item.bestBet && item.bestBet.label) || '—';
  var league = item.league || '—';
  var time = [item.dateLabel || '', item.timeLabel || ''].join(' ').trim();
  var reasons = [];
  if(item.why) reasons.push(item.why);
  else {
    reasons.push('probabilitate ' + pct(prob));
    if(edge) reasons.push('edge ' + (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp');
    if(score) reasons.push('scor ' + score.toFixed(0));
  }
  return '<div class="pyramid-pick">' +
    '<div class="pyramid-pick-rank">Pick #' + (idx+1) + ' · Piramidă</div>' +
    '<div class="pyramid-pick-teams">' + esc(item.home || '') + ' vs ' + esc(item.away || '') + '</div>' +
    '<div class="pyramid-pick-meta">' + esc(league) + (time ? ' • ' + esc(time) : '') + '</div>' +
    '<div class="pyramid-pick-rec">🎯 ' + esc(market) + ' @ ' + num(odds,2) + '</div>' +
    '<div class="pyramid-metrics">' +
      renderMini('Prob.', pct(prob), 'var(--grn)') +
      renderMini('Cotă', num(odds,2), 'var(--yel)') +
      renderMini('Edge', (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp', edge >= 0 ? 'var(--acc)' : 'var(--red)') +
      renderMini('Scor', score.toFixed(0), 'var(--pur)') +
    '</div>' +
    '<div style="font-size:10px;color:var(--muted);line-height:1.4;margin-top:9px">' + esc(reasons[0] || '') + (value ? ' • value ' + (value >= 0 ? '+' : '') + value.toFixed(1) + '%' : '') + '</div>' +
  '</div>';
}
function renderPicks(settings){
  var target = byId('pyramid-picks-list');
  if(!target) return;
  var picks = selectDailyPicks(settings);
  ACTIVE_PICKS = picks;
  var count = byId('pyramid-picks-badge');
  if(count) count.textContent = picks.length ? (picks.length + ' pick' + (picks.length > 1 ? '-uri' : '')) : '0 pick-uri';
  var summary = byId('pyramid-ticket-summary');
  if(!picks.length){
    target.innerHTML = '<div class="pyramid-empty">Nu există acum 1–2 evenimente suficient de curate pentru profilul ales. Motorul nu forțează piramida dacă probabilitatea, scorul și cota nu trec pragurile.</div>';
    if(summary) summary.innerHTML = 'Cotă zi: — • Prob. combinată: —';
    return;
  }
  target.innerHTML = '<div class="pyramid-picks">' + picks.map(renderPickCard).join('') + '</div>';
  if(summary){
    summary.innerHTML = 'Cotă zi: <b style="color:var(--yel)">' + num(totalOddsFor(picks),2) + '</b> • Prob. conservatoare: <b style="color:var(--grn)">' + pct(combinedProbFor(picks)) + '</b>';
  }
}
function renderPlan(settings){
  var target = byId('pyramid-plan');
  if(!target) return;
  var picks = ACTIVE_PICKS && ACTIVE_PICKS.length ? ACTIVE_PICKS : selectDailyPicks(settings);
  var rows = planRows(settings, picks);
  var final = rows[rows.length - 1] || {next:0, profit:0};
  var dailyOdds = picks.length ? totalOddsFor(picks) : Number(settings.targetOdds || 1.30);
  var dailyProb = picks.length ? combinedProbFor(picks) : 0;
  var head = '<div class="pyramid-stats">' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + money(settings.stake) + '</div><div class="pyramid-stat-l">Miză start</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--yel)">' + num(dailyOdds,2) + '</div><div class="pyramid-stat-l">Cotă zi</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + money(final.next) + '</div><div class="pyramid-stat-l">Țintă finală</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--pur)">' + (dailyProb ? pct(dailyProb) : '—') + '</div><div class="pyramid-stat-l">Prob. zi</div></div>' +
  '</div>';
  var table = '<div class="pyramid-plan-wrap"><table class="pyramid-plan-table"><thead><tr><th>Pas</th><th>Miză start</th><th>Cotă</th><th>Câștig brut</th><th>Retragere</th><th>Următoare</th><th>Profit net</th></tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr><td><span class="pyramid-step-chip">' + r.step + '</span></td><td>' + money(r.stake) + '</td><td>' + num(r.odds,2) + '</td><td>' + money(r.gross) + '</td><td>' + money(r.withdraw) + '</td><td>' + money(r.next) + '</td><td>' + money(r.profit) + '</td></tr>';
    }).join('') +
  '</tbody></table></div>';
  target.innerHTML = head + table + '<div class="pyramid-warn">Regula aplicată: reinvestire totală, retragere 0 pe pași. Dacă un pas pierde, sesiunea se oprește și netul față de miză inițială devine negativ.</div>';
}
function getSessions(){
  var arr = readJson(STORAGE_SESSIONS, []);
  return Array.isArray(arr) ? arr : [];
}
function saveSessions(arr){ writeJson(STORAGE_SESSIONS, arr || []); }
function getSessionProfit(s){
  if(!s) return 0;
  if(s.status === 'lost') return -Number(s.initialStake || 0);
  var current = Number(s.currentStake || s.initialStake || 0);
  if(s.status === 'completed' || s.status === 'cashout') return current - Number(s.initialStake || 0);
  return current - Number(s.initialStake || 0);
}
function createSession(){
  var settings = saveSettingsFromUi(true);
  var picks = ACTIVE_PICKS && ACTIVE_PICKS.length ? ACTIVE_PICKS : selectDailyPicks(settings);
  if(!picks.length){ if(typeof W.toast === 'function') W.toast('Nu există pick-uri valide pentru a porni sesiunea.', 'warn'); return; }
  var sessions = getSessions();
  var dailyOdds = totalOddsFor(picks);
  var session = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    status:'active',
    initialStake:Number(settings.stake || 0),
    currentStake:Number(settings.stake || 0),
    currentStep:1,
    targetSteps:Number(settings.steps || 7),
    targetOdds:Number(settings.targetOdds || 1.30),
    lastDailyOdds:Number(dailyOdds || settings.targetOdds || 1.30),
    picks:picks.map(function(p){ return {home:p.home,away:p.away,market:p.displayMarket || p.market || '',odds:Number(p.odds || 0),prob:Number(p.prob || 0),league:p.league || '',date:p.date || p.event_date || ''}; })
  };
  sessions.unshift(session);
  saveSessions(sessions.slice(0, 50));
  renderSessions();
  if(typeof W.toast === 'function') W.toast('Sesiune Piramidă Daily pornită', 'ok');
}
function markSession(id, action){
  var sessions = getSessions();
  var s = sessions.find(function(x){ return String(x.id) === String(id); });
  if(!s) return;
  if(s.status !== 'active') return;
  if(action === 'win'){
    var odds = Number(s.lastDailyOdds || s.targetOdds || 1.30);
    s.currentStake = +(Number(s.currentStake || s.initialStake || 0) * odds).toFixed(2);
    s.currentStep = Number(s.currentStep || 1) + 1;
    if(s.currentStep > Number(s.targetSteps || 7)) s.status = 'completed';
  } else if(action === 'loss'){
    s.status = 'lost';
  } else if(action === 'cashout'){
    s.status = 'cashout';
  }
  saveSessions(sessions);
  renderSessions();
}
function deleteSession(id){
  var sessions = getSessions().filter(function(x){ return String(x.id) !== String(id); });
  saveSessions(sessions);
  renderSessions();
}
function renderSessions(){
  var stats = byId('pyramid-session-stats');
  var list = byId('pyramid-session-list');
  if(!stats || !list) return;
  var sessions = getSessions();
  var active = sessions.filter(function(s){ return s.status === 'active'; }).length;
  var completed = sessions.filter(function(s){ return s.status === 'completed' || s.status === 'cashout'; }).length;
  var lost = sessions.filter(function(s){ return s.status === 'lost'; }).length;
  var profit = sessions.reduce(function(acc,s){ return acc + getSessionProfit(s); }, 0);
  stats.innerHTML = '<div class="pyramid-stats">' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v">' + sessions.length + '</div><div class="pyramid-stat-l">Total sesiuni</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--acc)">' + active + '</div><div class="pyramid-stat-l">Active</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:var(--grn)">' + completed + '</div><div class="pyramid-stat-l">Închise +</div></div>' +
    '<div class="pyramid-stat"><div class="pyramid-stat-v" style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(profit) + '</div><div class="pyramid-stat-l">Profit total</div></div>' +
  '</div>';
  if(!sessions.length){
    list.innerHTML = '<div class="pyramid-empty" style="background:rgba(255,255,255,.025);border-color:rgba(255,255,255,.08)">Nu ai încă sesiuni monitorizate. Pornește o sesiune după ce accepți pick-ul/pick-urile zilei.</div>';
    return;
  }
  list.innerHTML = sessions.slice(0,12).map(function(s){
    var profit = getSessionProfit(s);
    var statusLabel = s.status === 'active' ? 'Activă' : (s.status === 'lost' ? 'Lost' : (s.status === 'completed' ? 'Completă' : 'Cashout'));
    var picks = (s.picks || []).map(function(p){ return esc(p.home || '') + ' vs ' + esc(p.away || '') + ' • ' + esc(p.market || '') + ' @ ' + num(p.odds,2); }).join('<br>');
    var actions = s.status === 'active' ?
      '<div class="pyramid-session-actions"><button class="btn btn-green" onclick="pyramidMarkSession(\'' + s.id + '\',\'win\')">✅ Pas WIN</button><button class="btn" onclick="pyramidMarkSession(\'' + s.id + '\',\'cashout\')">💰 Cashout</button><button class="btn" style="color:var(--red);border-color:rgba(239,68,68,.24)" onclick="pyramidMarkSession(\'' + s.id + '\',\'loss\')">❌ LOSS</button></div>' :
      '<div class="pyramid-session-actions"><button class="btn" onclick="pyramidDeleteSession(\'' + s.id + '\')">Șterge</button></div>';
    return '<div class="pyramid-session">' +
      '<div class="pyramid-session-head"><div><div class="pyramid-session-name">' + statusLabel + ' · Pas ' + Math.min(Number(s.currentStep || 1), Number(s.targetSteps || 7)) + '/' + Number(s.targetSteps || 7) + '</div><div class="pyramid-session-meta">Start ' + money(s.initialStake) + ' • curent ' + money(s.currentStake) + ' • cotă zi ' + num(s.lastDailyOdds || s.targetOdds,2) + '<br>' + picks + '</div></div>' +
      '<div class="pyramid-session-profit" style="color:' + (profit >= 0 ? 'var(--grn)' : 'var(--red)') + '">' + money(profit) + '</div></div>' + actions +
    '</div>';
  }).join('');
}
function renderPyramidDaily(){
  if(!byId('tab-piramida')) return;
  var settings = getSettings();
  loadSettingsIntoUi(settings);
  renderPicks(settings);
  renderPlan(settings);
  renderSessions();
}
function refreshPyramid(){
  var settings = saveSettingsFromUi(true);
  renderPicks(settings);
  renderPlan(settings);
}
W.renderPyramidDaily = renderPyramidDaily;
W.refreshPyramidDaily = refreshPyramid;
W.savePyramidDailySettings = function(){ saveSettingsFromUi(false); refreshPyramid(); };
W.createPyramidDailySession = createSession;
W.pyramidMarkSession = markSession;
W.pyramidDeleteSession = deleteSession;

var originalSwitchTab = W.switchTab;
if(typeof originalSwitchTab === 'function'){
  W.switchTab = function(name){
    var result = originalSwitchTab.apply(this, arguments);
    if(name === 'piramida') setTimeout(renderPyramidDaily, 0);
    return result;
  };
}
var originalDoRefresh = W.doRefresh;
if(typeof originalDoRefresh === 'function'){
  W.doRefresh = function(){
    var result = originalDoRefresh.apply(this, arguments);
    setTimeout(function(){
      var active = document.querySelector('.tab-content.active');
      if(active && active.id === 'tab-piramida') renderPyramidDaily();
    }, 900);
    return result;
  };
}
document.addEventListener('DOMContentLoaded', function(){
  if(byId('tab-piramida') && byId('tab-piramida').classList.contains('active')) renderPyramidDaily();
});
})();
