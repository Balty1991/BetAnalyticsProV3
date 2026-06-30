

/* ===== Inline script block 1 ===== */
'use strict';
// BetAnalytics Pro v16 - Fixed build (duplicate functions removed)

// ============================================================
// GLOBAL STATE
// ============================================================
var ALL_MATCHES = [];
var ALL_LEAGUES = [];
var ALL_EVENTS = [];
var ALL_TEAMS = [];
var ALL_PLAYERS = [];
var BACKTEST_SUMMARY = {};
var HISTORY_ENGINE = [];
var RECOMMENDATION_LOG = [];
var RECOMMENDATION_JOURNAL = [];
var LEARNING_ENGINE = null;
var SIGNAL_AUDIT = {};
var AI_MEMORY = {};
var TRAINING_MARKET_BASELINES = [];
var TRAINING_SCORING_SUMMARY = {};
var TRAINING_BASELINE_MAP = new Map();
var AI_MEMORY_TICKETS = {premium:null, double:null, triple:null, contrarian:null};
var AUDIT_TICKETS = {premium:null, double:null, triple:null, contrarian:null};
var APP_META = {};
var BUILD_STATUS = {};
var MODEL_BENCHMARKS = {};
var BILETE = null;
var CURRENT_FILTER = 'all';
var MATCH_CARD_MODE = localStorage.getItem('bet_match_card_mode') || 'simple';
var MATCHES_PAGE_SIZE = 9999;      // afișează toate cardurile filtrate; evită diferența între count și lista vizibilă
var MATCHES_RENDERED_COUNT = 0;    // câte carduri sunt acum în DOM
var MATCHES_FILTERED_CACHE = [];   // lista filtrată curentă (pentru load more)
var MATCHES_SCROLL_OBSERVER = null; // IntersectionObserver sentinel
var TRACKING = JSON.parse(localStorage.getItem('bet_tracking') || '[]');
var TICKET_JOURNAL = JSON.parse(localStorage.getItem('bet_ticket_journal') || '[]');
var BANKROLL_SETTINGS = JSON.parse(localStorage.getItem('bet_bankroll_settings') || '{"initial":1000,"single":4,"double":2.5,"triple":1.5,"contrarian":0.8}');
var API_TOKEN = ''; // setat din meta.json sau localStorage
// ============================================================
// MOTOR MULTI-FACTOR v1 — cache global pentru enrichment live
// ============================================================
var ENRICHED_EVENT_CACHE = {};   // eventId -> detail object
var ENRICHMENT_PENDING   = {};   // eventId -> Promise
var ENRICHMENT_BATCH_RUNNING = false;
var DATA_BASE = '';
var OPEN_TICKET_IDX = null;
var LAST_DAY_KEY = '';

// ============================================================
// UTILS
// ============================================================
function $(id){ return document.getElementById(id); }
function fmt(n,d){ return (d===undefined?Math.round(n):n.toFixed(d)); }
function fmtPct(n){ return n.toFixed(1)+'%'; }
function fmtSignedPct(n){
  var num = Number(n || 0);
  return (num >= 0 ? '+' : '') + fmtPct(num);
}
function rankBacktestRows(a,b){
  if((Number(b && b.roi || 0)) !== (Number(a && a.roi || 0))) return Number(b && b.roi || 0) - Number(a && a.roi || 0);
  if((Number(b && b.winrate || 0)) !== (Number(a && a.winrate || 0))) return Number(b && b.winrate || 0) - Number(a && a.winrate || 0);
  return Number(b && b.bets || 0) - Number(a && a.bets || 0);
}
function fmtDateTime(iso){
  if(!iso) return '—';
  var d=new Date(iso);
  return d.toLocaleDateString('ro-RO')+' '+d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
}
function hoursSince(iso){
  if(!iso) return null;
  var diff = (Date.now() - new Date(iso).getTime()) / 36e5;
  return isFinite(diff) ? diff : null;
}
function fmtDate(iso){
  var d=new Date(iso);
  var days=['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
  var months=['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  return days[d.getDay()]+' '+d.getDate()+' '+months[d.getMonth()];
}
function fmtTime(iso){
  var d=new Date(iso);
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
function fmtDateKey(iso){
  var d=new Date(iso);
  return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0');
}
function sourceTypeFromBet(b){
  if(!b) return 'none';
  if(b.sourceApi && b.sourceHeuristic) return 'mixed';
  if(b.sourceApi) return 'api';
  if(b.sourceHeuristic) return 'heuristic';
  return 'heuristic';
}
function sourceLabelFromBet(b){
  var t = sourceTypeFromBet(b);
  if(t === 'api') return 'ML/API';
  if(t === 'mixed') return 'ML + heuristic';
  if(t === 'heuristic') return 'heuristic';
  return '—';
}
function sourceChipHtmlForBet(b){
  var t = sourceTypeFromBet(b);
  if(t === 'api') return '<span class="source-chip source-chip-api">ML/API</span>';
  if(t === 'mixed') return '<span class="source-chip source-chip-mixed">ML + heuristic</span>';
  if(t === 'heuristic') return '<span class="source-chip source-chip-heur">heuristic</span>';
  return '';
}
function sourceChipHtmlForAuditRow(r){
  if(r && r.source_api && r.source_heuristic) return '<span class="source-chip source-chip-mixed">ML + heuristic</span>';
  if(r && r.source_api) return '<span class="source-chip source-chip-api">ML/API</span>';
  if(r && r.source_heuristic) return '<span class="source-chip source-chip-heur">heuristic</span>';
  return '<span class="source-chip source-chip-heur">heuristic</span>';
}
function getOddsSourceMeta(b){
  if(!b) return {active:'STD', activeOdds:0, hasAny:false, hasCompare:false, hasBest:false, hasCmp:false, hasStd:false, bestOdds:0, cmpOdds:0, stdOdds:0, bestBookmaker:'', bookmakersCount:0, gapPct:0};
  var stdOdds = Number(b.baseOdds || 0);
  var displayedOdds = Number(b.odds || 0);
  var bestOdds = Number((b.bestOdds != null ? b.bestOdds : displayedOdds) || 0);
  var cmpOdds = Number(b.avgMarketOdds || 0);
  var bookmakersCount = Math.max(0, Math.round(Number(b.bookmakersCount || 0)));
  var gapPct = Number(b.marketGapPct || 0);
  var hasStd = stdOdds > 1.01;
  var hasBest = bestOdds > 1.01;
  var hasCmp = cmpOdds > 1.01;
  var compareSignals = !!(bookmakersCount > 0 || hasCmp || !!String(b.bestBookmaker || '').trim() || !!b.hasMarketCompare || !!b.marketComparePresent || !!b.marketCompareRow);
  var active = 'STD';
  var explicit = String(b.oddsSource || b.marketOddsSource || '').toUpperCase().trim();
  if((explicit === 'BEST' || explicit === 'CMP' || explicit === 'STD')){
    active = explicit;
  }else if(hasBest && compareSignals && Math.abs(displayedOdds - bestOdds) < 0.011){
    active = 'BEST';
  }else if(hasCmp && Math.abs(displayedOdds - cmpOdds) < 0.011){
    active = 'CMP';
  }else if(!hasStd && hasCmp){
    active = 'CMP';
  }else if(!hasStd && hasBest){
    active = 'BEST';
  }
  var activeOdds = active === 'BEST' ? bestOdds : (active === 'CMP' ? cmpOdds : stdOdds);
  if(!(activeOdds > 1.01)) activeOdds = displayedOdds > 1.01 ? displayedOdds : 0;
  var hasCompare = !!(compareSignals || (hasStd && hasBest && Math.abs(bestOdds - stdOdds) >= 0.009));
  return {
    active:active,
    activeOdds:activeOdds > 1.01 ? +activeOdds.toFixed(2) : 0,
    hasAny:!!(hasStd || hasBest || hasCmp),
    hasCompare:hasCompare,
    hasBest:hasBest,
    hasCmp:hasCmp,
    hasStd:hasStd,
    bestOdds:hasBest ? +bestOdds.toFixed(2) : 0,
    cmpOdds:hasCmp ? +cmpOdds.toFixed(2) : 0,
    stdOdds:hasStd ? +stdOdds.toFixed(2) : 0,
    bestBookmaker:String(b.bestBookmaker || ''),
    bookmakersCount:bookmakersCount,
    gapPct:isFinite(gapPct) ? +gapPct.toFixed(2) : 0
  };
}
function inlineOddsSourceTagHtml(meta){
  if(!meta || !meta.hasAny) return '';
  var cls = meta.active === 'BEST' ? 'best' : (meta.active === 'CMP' ? 'cmp' : 'std');
  return '<span class="odds-inline-source odds-inline-source-' + cls + '">' + meta.active + '</span>';
}
function oddsSourceBadgeHtml(meta){
  if(!meta || !meta.hasAny) return '';
  var tone = meta.active === 'BEST' ? 'var(--grn)' : (meta.active === 'CMP' ? 'var(--acc)' : 'var(--muted)');
  var label = meta.active === 'BEST' ? 'cea mai bună cotă' : (meta.active === 'CMP' ? 'medie comparată' : 'cotă standard');
  return '<span class="card-reco-badge" style="border-color:rgba(255,255,255,.10);color:' + tone + '">Sursă cotă ' + meta.active + ' • ' + label + '</span>';
}
function oddsSourceChipHtml(code, value, active, note){
  var v = Number(value || 0);
  if(!(v > 1.01)) return '';
  var cls = code === 'BEST' ? 'best' : (code === 'CMP' ? 'cmp' : 'std');
  return '<span class="odds-source-chip ' + cls + (active ? ' active' : '') + '"><span class="odds-source-chip-k">' + code + '</span><span class="odds-source-chip-v">' + v.toFixed(2) + '</span>' + (note ? '<span class="odds-source-chip-note" title="' + htmlEsc(note) + '">' + htmlEsc(note) + '</span>' : '') + '</span>';
}
function renderOddsSourceCompareHtml(meta){
  if(!meta || !meta.hasAny) return '';
  var chips = [];
  chips.push(oddsSourceChipHtml('BEST', meta.bestOdds, meta.active === 'BEST', meta.bestBookmaker ? ('@ ' + meta.bestBookmaker) : 'top'));
  chips.push(oddsSourceChipHtml('CMP', meta.cmpOdds, meta.active === 'CMP', meta.bookmakersCount > 0 ? (meta.bookmakersCount + ' case') : 'medie'));
  chips.push(oddsSourceChipHtml('STD', meta.stdOdds, meta.active === 'STD', 'API/base'));
  chips = chips.filter(Boolean);
  if(!chips.length) return '';
  var summary = 'Sursă activă: ' + meta.active + (meta.activeOdds > 1.01 ? (' @ ' + meta.activeOdds.toFixed(2)) : '');
  if(meta.active === 'BEST' && meta.gapPct > 0.01) summary += ' • +' + meta.gapPct.toFixed(1) + '% vs STD';
  else if(meta.hasCompare && meta.bookmakersCount > 0) summary += ' • comparație din ' + meta.bookmakersCount + ' case';
  return '<div class="odds-source-block"><div class="odds-source-head"><div class="odds-source-title">Sursă cotă</div><div class="odds-source-summary">' + summary + '</div></div><div class="odds-source-grid">' + chips.join('') + '</div></div>';
}
function ageBucketLabel(hours){
  var h = Number(hours || 0);
  if(!isFinite(h) || h <= 0) return '—';
  if(h < 24) return h.toFixed(1)+'h';
  return (h/24).toFixed(1)+' zile';
}
function ageBadgeHtml(createdAt){
  if(!createdAt) return '';
  var h = hoursSince(createdAt);
  if(!isFinite(h) || h <= 0) return '';
  var label = ageBucketLabel(h);
  if(h >= 168){ // >7 zile — predicție foarte veche
    return '<span class="card-reco-badge" style="color:var(--red);border-color:rgba(239,68,68,.3)" title="Predicție veche — datele pot fi depășite">⚠️ '+label+'</span>';
  }
  if(h >= 72){ // >3 zile — avertisment
    return '<span class="card-reco-badge" style="color:var(--yel);border-color:rgba(245,158,11,.3)" title="Predicție mai veche de 3 zile">⏱ '+label+'</span>';
  }
  return '<span class="card-reco-badge" style="color:var(--muted)">'+label+'</span>';
}
function toast(msg,type){
  var w=$('toast-wrap');
  var t=document.createElement('div');
  t.className='toast toast-'+(type||'ok');
  t.textContent=msg;
  w.appendChild(t);
  setTimeout(function(){t.remove();},3500);
}
function showLoader(msg){
  $('loader').classList.add('show');
  if(msg) $('loader-sub').textContent=msg;
}
function hideLoader(){ $('loader').classList.remove('show'); }


var TERM_HELP = {
  kelly_quarter:{title:'Kelly 1/4',text:'Kelly 1/4 este miza recomandată la un sfert din Kelly complet. Îl folosești ca variantă mai disciplinată, ca să nu supraexpui bankroll-ul atunci când modelul vede avantaj, dar realitatea rămâne volatilă.'},
  edge:{title:'Edge',text:'Edge-ul măsoară diferența dintre probabilitatea modelului și probabilitatea implicită a pieței. Cu cât Edge-ul este mai mare și validat pe o piață stabilă, cu atât semnalul este mai interesant.'},
  xg:{title:'xG',text:'xG sau expected goals estimează câte goluri ar fi logic să producă o echipă sau un meci pe baza calității ocaziilor. Nu este scor final, ci un indicator de volum și calitate ofensivă.'},
  confidence:{title:'Confidence',text:'Confidence este scorul de încredere al modelului pentru selecția sau verdictul afișat. Îl citești împreună cu Edge și contextul pieței, nu izolat.'},
  value:{title:'Value',text:'Value înseamnă valoare așteptată pozitivă. Nu spune că pariul va ieși sigur, ci că prețul pieței este mai bun decât ar sugera estimarea internă a modelului.'},
  fair_odds:{title:'Fair odds',text:'Fair odds reprezintă cota teoretică rezultată din probabilitatea estimată de model. Compari cota casei cu fair odds ca să vezi dacă piața oferă sau nu valoare.'},
  adjusted_prob:{title:'Probabilitate ajustată',text:'Probabilitatea ajustată este scorul final folosit în selecție după filtre, corecții și reguli de siguranță. Este mai utilă operațional decât o probabilitate brută izolată.'},
  adaptive_score:{title:'Adaptive score',text:'Adaptive score este scorul compozit din AI Memory. El combină probabilitatea curentă cu istoricul de pattern-uri, penalizările și bonusurile de memorie.'},
  memory_bonus:{title:'Memory bonus',text:'Memory bonus arată cât de mult ajută sau trage în jos istoricul relevant pentru selecția curentă. Valoarea pozitivă susține selecția; valoarea negativă cere mai multă prudență.'},
  roi:{title:'ROI',text:'ROI-ul arată randamentul raportat la suma mizată. Un ROI pozitiv indică eficiență bună a setului analizat; unul negativ indică faptul că istoricul nu susține încă strategia.'},
  positive_patterns:{title:'Pattern-uri pozitive',text:'Aceste pattern-uri sunt contexte care au confirmat mai des decât media. Nu sunt garanții, dar ajută la prioritizarea selecțiilor curate.'},
  negative_patterns:{title:'Pattern-uri de evitat',text:'Aceste pattern-uri au tras în jos performanța istorică. Le folosești ca filtru de risc, nu ca verdict absolut.'},
  single_premium_stake:{title:'Single Premium',text:'Single Premium folosește cea mai mare miză relativă pentru că ai exact o selecție cu edge mare și eviți taxa de corelație din combo-uri.'},
  double_confirmed_stake:{title:'Double Confirmed',text:'Double Confirmed reduce corelația și păstrează doar două selecții puternice. Miza rămâne sub single, dar peste triple și contrarian.'},
  triple_value_stake:{title:'Triple Value',text:'Triple Value este pentru 3 selecții bune, dar mai fragile decât single sau double. Miza rămâne controlată tocmai pentru că probabilitatea compusă scade repede.'},
  contrarian_stake:{title:'Contrarian Shot',text:'Contrarian Shot este expunere mică, speculativă. Intră doar cu miză redusă, pentru că urmărește prețuri greșite, nu volum mare de pariuri.'},
  bankroll_flow:{title:'Flux bankroll',text:'Fluxul bankroll-ului înseamnă cum se modifică suma totală după fiecare bilet înregistrat. Graficul te ajută să vezi dacă evoluția este stabilă, volatilă sau în degradare.'}
};
function showInlineHelp(targetId, termKey){
  var box = $(targetId);
  var item = TERM_HELP[termKey];
  if(!box || !item) return;
  box.classList.add('show');
  box.innerHTML = '<div class="help-output-title">'+item.title+'</div><div class="help-output-text">'+item.text+'</div><div class="help-output-note">Explicația rămâne în tabul curent ca să poți compara imediat cu datele afișate.</div>';
}
function setButtonBusy(btn, busy, idleText, busyText){
  if(!btn) return;
  btn.disabled = !!busy;
  btn.textContent = busy ? (busyText || 'Se procesează...') : idleText;
}
function setGeneratorStatus(id, text, tone){
  var el = $(id);
  if(!el) return;
  el.textContent = text;
  el.style.color = tone === 'ok' ? 'var(--grn)' : (tone === 'err' ? 'var(--red)' : (tone === 'warn' ? 'var(--yel)' : 'var(--muted)'));
}
function escapeCsv(value){
  if(value === null || value === undefined) return '';
  var str = String(value).replace(/\r?\n/g, ' ');
  if(/[",;]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}
function downloadTextFile(filename, content, mime){
  var blob = new Blob([content], {type:mime || 'text/plain;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function downloadCsv(filename, headers, rows){
  var lines = [headers.map(escapeCsv).join(',')].concat(rows.map(function(row){ return row.map(escapeCsv).join(','); }));
  downloadTextFile(filename, lines.join('\n'), 'text/csv;charset=utf-8');
}
function exportTrackingCsv(){
  try{
    var headers = ['created_at','date','type','mode','status','stake','total_odds','profit','picks_count','match_names','pick_types'];
    var rows = (TRACKING || []).map(function(t){
      return [t.createdAt || '', t.date || '', t.type || '', t.mode || '', t.status || '', Number(t.stake || 0).toFixed(2), Number(t.totalOdds || 0).toFixed(2), Number(t.profit || 0).toFixed(2), (t.picks || []).length, (t.picks || []).map(function(p){ return (p.home || '—') + ' vs ' + (p.away || '—'); }).join(' | '), (t.picks || []).map(function(p){ return p.bet || '—'; }).join(' | ')];
    });
    downloadCsv('tracking_export.csv', headers, rows);
    toast('Tracking exportat în CSV', 'ok');
  }catch(e){ console.error(e); toast('Eroare la export CSV', 'err'); }
}
function exportAuditCsv(){
  try{
    var rows = Array.isArray((SIGNAL_AUDIT || {}).rows) ? SIGNAL_AUDIT.rows : [];
    var headers = ['event_date','league','home','away','market','book_odds','adjusted_prob','edge_pct','value_pct','kelly_quarter_pct','fair_odds','model_version'];
    var csvRows = rows.map(function(r){ return [r.event_date || '', r.league || '', r.home || '', r.away || '', r.market || '', Number(r.book_odds || 0).toFixed(2), Number(r.adjusted_prob || 0).toFixed(2), Number(r.edge_pct || 0).toFixed(2), (Number(r.value || 0) * 100).toFixed(2), Number(r.kelly_quarter_pct || 0).toFixed(2), r.fair_odds != null ? Number(r.fair_odds).toFixed(2) : '', r.model_version || '']; });
    downloadCsv('audit_kelly_export.csv', headers, csvRows);
    toast('Audit Kelly exportat în CSV', 'ok');
  }catch(e){ console.error(e); toast('Eroare la export CSV', 'err'); }
}
function exportAiMemoryCsv(){
  try{
    var rows = Array.isArray((AI_MEMORY || {}).adaptive_picks) ? AI_MEMORY.adaptive_picks : [];
    var headers = ['event_date','league','home','away','market','odds','adjusted_prob','adaptive_score','memory_bonus','value_pct'];
    var csvRows = rows.map(function(r){ return [r.event_date || '', r.league || '', r.home || '', r.away || '', r.market || '', Number(r.odds || 0).toFixed(2), Number(r.adjusted_prob || 0).toFixed(2), Number(r.adaptive_score || 0).toFixed(2), Number(r.memory_bonus || 0).toFixed(2), (Number(r.value || 0) * 100).toFixed(2)]; });
    downloadCsv('ai_memory_export.csv', headers, csvRows);
    toast('AI Memory exportat în CSV', 'ok');
  }catch(e){ console.error(e); toast('Eroare la export CSV', 'err'); }
}
function handleGenerateAuditTicket(type, btn){
  setButtonBusy(btn, true, 'Generează', 'Se generează...');
  setGeneratorStatus('audit-status-' + type, 'Generatorul pregătește selecțiile...', '');
  setTimeout(function(){
    generateAuditTicket(type, false);
    var ticket = AUDIT_TICKETS[type];
    var ok = !!(ticket && ticket.picks && ticket.picks.length);
    setGeneratorStatus('audit-status-' + type, ok ? ('Generat: ' + fmtDateTime(ticket.generatedAt || new Date().toISOString())) : (ticket && ticket.error ? ticket.error : 'Nu au fost găsite selecții suficiente.'), ok ? 'ok' : 'warn');
    setButtonBusy(btn, false, 'Generează', 'Se generează...');
  }, 120);
}
function handleGenerateAiMemoryTicket(type, btn){
  setButtonBusy(btn, true, 'Generează', 'Se generează...');
  setGeneratorStatus('aimemory-status-' + type, 'Generatorul pregătește selecțiile...', '');
  setTimeout(function(){
    generateAiMemoryTicket(type, false);
    var ticket = AI_MEMORY_TICKETS[type];
    var ok = !!(ticket && ticket.picks && ticket.picks.length);
    setGeneratorStatus('aimemory-status-' + type, ok ? ('Generat: ' + fmtDateTime(ticket.generatedAt || new Date().toISOString())) : (ticket && ticket.error ? ticket.error : 'Nu au fost găsite selecții suficiente.'), ok ? 'ok' : 'warn');
    setButtonBusy(btn, false, 'Generează', 'Se generează...');
  }, 120);
}
function buildBankrollSeries(initialBk){
  var current = Number(initialBk || 0);
  var series = [{label:'Start', value:current, profit:0}];
  (TRACKING || []).forEach(function(t, idx){
    current += Number(t.profit || 0);
    series.push({label:'B'+(idx+1), value:current, profit:Number(t.profit || 0), status:t.status || 'pending'});
  });
  return series;
}
function renderBankrollTrend(initialBk){
  var chart = $('bankroll-trend-chart');
  var meta = $('bankroll-trend-meta');
  if(!chart || !meta) return;
  var series = buildBankrollSeries(initialBk);
  if(series.length <= 1){
    chart.innerHTML = '<div class="empty-state" style="padding:26px 14px">Graficul va apărea după ce există bilete în Tracking.</div>';
    meta.innerHTML = '<div class="trend-meta-card"><div class="trend-meta-label">Stare</div><div class="trend-meta-value" style="color:var(--muted)">Fără date</div></div>';
    return;
  }
  var values = series.map(function(p){ return Number(p.value || 0); });
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  if(min === max){ min -= 1; max += 1; }
  var w = 860, h = 180, padX = 18, padTop = 14, padBottom = 22;
  var plotW = w - padX * 2, plotH = h - padTop - padBottom;
  var points = series.map(function(p, idx){
    var x = padX + (plotW * idx / Math.max(1, series.length - 1));
    var y = padTop + (max - Number(p.value || 0)) * plotH / Math.max(1e-9, (max - min));
    return {x:x, y:y, value:Number(p.value || 0), profit:Number(p.profit || 0), label:p.label};
  });
  var path = points.map(function(p, idx){ return (idx ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  var last = points[points.length - 1];
  var baseY = h - padBottom;
  var grid = [0, 0.5, 1].map(function(r){ var y = padTop + plotH * r; return '<line x1="'+padX+'" y1="'+y.toFixed(1)+'" x2="'+(w-padX)+'" y2="'+y.toFixed(1)+'" stroke="rgba(255,255,255,.08)" stroke-dasharray="4 4" />'; }).join('');
  var circles = points.map(function(p, idx){ return '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+(idx === points.length - 1 ? 4.5 : 3)+'" fill="'+(idx === points.length - 1 ? '#22c55e' : '#3b82f6')+'" opacity=".95" />'; }).join('');
  chart.innerHTML = '<svg viewBox="0 0 '+w+' '+h+'" class="trend-chart" preserveAspectRatio="none">'+grid+'<path d="'+path+'" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /><line x1="'+padX+'" y1="'+baseY+'" x2="'+(w-padX)+'" y2="'+baseY+'" stroke="rgba(255,255,255,.10)" />'+circles+'<text x="'+last.x.toFixed(1)+'" y="'+(last.y - 10).toFixed(1)+'" fill="#22c55e" font-size="11" text-anchor="end">'+last.value.toFixed(2)+' RON</text></svg>';
  var totalProfit = values[values.length - 1] - Number(initialBk || 0);
  var best = Math.max.apply(null, values), worst = Math.min.apply(null, values);
  meta.innerHTML = [
    ['Puncte urmărite', series.length - 1, 'var(--acc)'],
    ['Maxim bankroll', best.toFixed(2) + ' RON', 'var(--grn)'],
    ['Minim bankroll', worst.toFixed(2) + ' RON', 'var(--red)'],
    ['Diferență netă', (totalProfit >= 0 ? '+' : '') + totalProfit.toFixed(2) + ' RON', totalProfit >= 0 ? 'var(--grn)' : 'var(--red)']
  ].map(function(row){ return '<div class="trend-meta-card"><div class="trend-meta-label">'+row[0]+'</div><div class="trend-meta-value" style="color:'+row[2]+'">'+row[1]+'</div></div>'; }).join('');
}
function renderVisualBarList(targetId, rows, valueFormatter){
  var target = $(targetId);
  if(!target) return;
  if(!rows || !rows.length){
    target.innerHTML = '<div class="visual-empty">Nu există încă suficiente date.</div>';
    return;
  }
  var maxAbs = rows.reduce(function(acc,row){ return Math.max(acc, Math.abs(Number(row.value || 0))); }, 0) || 1;
  target.innerHTML = '<div class="visual-list">' + rows.map(function(row){
    var val = Number(row.value || 0);
    var pct = Math.max(6, Math.abs(val) * 100 / maxAbs);
    var color = row.color || (val >= 0 ? 'var(--grn)' : 'var(--red)');
    var display = valueFormatter ? valueFormatter(val, row) : val.toFixed(1);
    return '<div class="visual-row"><div class="visual-row-top"><span class="visual-row-label">'+row.label+'</span><span class="visual-row-value" style="color:'+color+'">'+display+'</span></div><div class="visual-bar"><div class="visual-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div></div>';
  }).join('') + '</div>';
}
function renderProfitTrendChart(targetId, items){
  var target = $(targetId);
  if(!target) return;
  if(!items || !items.length){
    target.innerHTML = '<div class="visual-empty">Nu există bilete suficiente pentru trend.</div>';
    return;
  }
  var values = items.map(function(it){ return Number(it.value || 0); });
  var maxAbs = Math.max.apply(null, values.map(function(v){ return Math.abs(v); }).concat([1]));
  var w = 760, h = 170, padX = 14, padTop = 12, padBottom = 18;
  var midY = h / 2;
  var barW = Math.max(12, Math.floor((w - padX*2) / items.length) - 4);
  var gap = 4;
  var x = padX;
  var rects = items.map(function(it){
    var v = Number(it.value || 0);
    var bh = Math.max(4, Math.abs(v) * ((h/2 - padTop - 8) / maxAbs));
    var y = v >= 0 ? (midY - bh) : midY;
    var color = v >= 0 ? '#22c55e' : '#ef4444';
    var r = '<rect x="'+x+'" y="'+y.toFixed(1)+'" width="'+barW+'" height="'+bh.toFixed(1)+'" rx="4" fill="'+color+'" opacity=".92" />' +
            '<title>'+(it.label || '')+' '+(v>=0?'+':'')+v.toFixed(2)+' RON</title>';
    x += barW + gap;
    return r;
  }).join('');
  target.innerHTML = '<svg viewBox="0 0 '+w+' '+h+'" class="visual-svg" preserveAspectRatio="none"><line x1="'+padX+'" y1="'+midY+'" x2="'+(w-padX)+'" y2="'+midY+'" stroke="rgba(255,255,255,.12)" />'+rects+'</svg>';
}
function renderWinLossDistribution(targetId, stats){
  var target = $(targetId);
  if(!target) return;
  var total = (stats.win || 0) + (stats.loss || 0) + (stats.pending || 0);
  if(!total){
    target.innerHTML = '<div class="visual-empty">Nu există încă bilete pentru distribuție.</div>';
    return;
  }
  var wp = ((stats.win || 0) * 100 / total);
  var lp = ((stats.loss || 0) * 100 / total);
  var pp = ((stats.pending || 0) * 100 / total);
  target.innerHTML = '<div class="visual-distribution"><div class="visual-dist-big">'+total+' bilete</div><div class="visual-dist-stack"><div class="visual-dist-seg" style="width:'+wp.toFixed(1)+'%;background:var(--grn)"></div><div class="visual-dist-seg" style="width:'+lp.toFixed(1)+'%;background:var(--red)"></div><div class="visual-dist-seg" style="width:'+pp.toFixed(1)+'%;background:var(--yel)"></div></div><div class="visual-dist-legend"><span class="visual-dist-pill">WIN '+(stats.win||0)+' • '+wp.toFixed(0)+'%</span><span class="visual-dist-pill">LOSS '+(stats.loss||0)+' • '+lp.toFixed(0)+'%</span><span class="visual-dist-pill">PENDING '+(stats.pending||0)+' • '+pp.toFixed(0)+'%</span></div></div>';
}
function renderDashboardVisuals(){
  var cutoff = new Date(Date.now() - (21 * 86400000));
  var settledRows = getHistory21SettledRows(cutoff);
  var livePendingRows = getHistory21LivePendingRows();
  if($('dash-profit-meta')) $('dash-profit-meta').textContent = settledRows.length ? ('ultimele ' + Math.min(12, settledRows.length) + ' închise • 21 zile') : '21 zile';
  var profitItems = settledRows.slice().sort(function(a,b){ return new Date(a.logged_at || a.prediction_created_at || 0) - new Date(b.logged_at || b.prediction_created_at || 0); }).slice(-12).map(function(r, idx){
    var o = Number(r.odds || 0);
    var profit = r.status === 'win' ? (o > 1 ? (o - 1) : 0) : -1;
    return { label:'R' + (idx + 1), value:profit };
  });
  renderProfitTrendChart('dash-profit-chart', profitItems);

  var dist = {win:0, loss:0, pending:livePendingRows.length};
  settledRows.forEach(function(r){ if(r.status === 'win') dist.win++; else if(r.status === 'lose') dist.loss++; });
  if($('dash-dist-meta')) $('dash-dist-meta').textContent = 'istoric real • 21 zile';
  renderWinLossDistribution('dash-winloss-chart', dist);

  var rows = settledRows.concat(livePendingRows);
  var categoryDefs = [
    {key:'all', label:'Toate'},
    {key:'safe', label:'Top analizate'},
    {key:'value', label:'Value'},
    {key:'over15', label:'Over 1.5G'},
    {key:'over25', label:'Over 2.5G'},
    {key:'btts', label:'BTTS'},
    {key:'under35', label:'Under 3.5G'}
  ];
  var catRows = categoryDefs.map(function(def){ return buildHistory21Group(def.label, def.key, rows.filter(function(r){ return historyRowMatchesCategory(r, def.key); })); }).map(function(s){
    return {label:s.label + ' • ' + s.total, value:Number(s.roi || 0), color:Number(s.roi || 0) >= 0 ? 'var(--grn)' : 'var(--red)'};
  });
  if($('dash-category-meta')) $('dash-category-meta').textContent = 'aceleași categorii • 21 zile';
  renderVisualBarList('dash-category-chart', catRows, function(v){ return (v>=0?'+':'') + v.toFixed(1) + '%'; });
}

function renderDashboardMonitor(){
  var target = $('dashboard-monitor-grid');
  if(!target) return;
  var visibleMatches = (ALL_MATCHES || []).filter(function(m){ return m && passesSelectionFilter(m); });
  var eligible = visibleMatches.filter(function(m){ return m.bestBet && m.analysisState === 'ELIGIBLE'; });
  var premiumSingles = eligible.filter(function(m){ return Number(m.smartScore || 0) >= 88 && Number((m.bestBet || {}).edgePct || 0) >= 10; });
  var cutoff = new Date(Date.now() - (21 * 86400000));
  var settledRows = getHistory21SettledRows(cutoff);
  var livePendingRows = getHistory21LivePendingRows();
  var allRows = settledRows.concat(livePendingRows);
  var categories = getHistory21CategoryDefs(allRows).filter(function(def){ return def.key !== 'all'; });
  var summary = categories.map(function(def){ return buildHistory21Group(def.label, def.key, allRows.filter(function(r){ return historyRowMatchesCategory(r, def.key); })); }).filter(function(g){ return g && g.total > 0; });
  summary.sort(function(a,b){
    if((b.roi || -999) !== (a.roi || -999)) return (b.roi || -999) - (a.roi || -999);
    return (b.winrate || 0) - (a.winrate || 0);
  });
  var best = summary[0] || null;
  var trackingTotal = (TRACKING || []).length;
  var trackingOpen = (TRACKING || []).filter(function(t){ return t.status === 'pending'; }).length;
  var cards = [
    {kicker:'Live', value:visibleMatches.length, label:'Meciuri afișate acum', meta:'după filtrele curente din Analiză'},
    {kicker:'Eligibile', value:eligible.length, label:'Meciuri cu setup valid', meta:'au pronostic activ și pot intra în bilete'},
    {kicker:'Premium', value:premiumSingles.length, label:'Single-uri premium în pool', meta:'scor ≥ 88 și edge real ≥ 10pp'},
    {kicker:'Istoric', value:allRows.length, label:'Recomandări în 21 zile', meta:settledRows.length + ' închise • ' + livePendingRows.length + ' pending'},
    {kicker:'Tracking', value:trackingTotal, label:'Bilete în jurnal', meta:trackingOpen + ' încă deschise'},
    {kicker:'Top piață', value:best ? ((Number(best.roi || 0) >= 0 ? '+' : '') + Number(best.roi || 0).toFixed(1) + '%') : '—', label:best ? best.label : 'Fără sample suficient', meta:best ? ('win rate ' + Number(best.winrate || 0).toFixed(1) + '% • ' + Number(best.wins || 0) + '/' + Number(best.bets || 0)) : 'așteaptă mai mult istoric'}
  ];
  target.innerHTML = cards.map(function(card){
    return '<div class="monitor-card">'+
      '<div class="monitor-kicker">'+card.kicker+'</div>'+
      '<div class="monitor-value">'+card.value+'</div>'+
      '<div class="monitor-label">'+card.label+'</div>'+
      '<div class="monitor-meta">'+card.meta+'</div>'+
    '</div>';
  }).join('');
}


function renderModernDashboard(){
  var target = $('dashboard-modern-shell');
  if(!target) return;

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function signed(n, suffix){
    var num = Number(n || 0);
    return (num >= 0 ? '+' : '') + num.toFixed(1) + (suffix || '');
  }
  function getGreeting(){
    var h = new Date().getHours();
    if(h < 12) return 'Bună dimineața';
    if(h < 18) return 'Bună ziua';
    return 'Bună seara';
  }
  function isSameLocalDay(iso){
    if(!iso) return false;
    var d = new Date(iso); if(!isFinite(d.getTime())) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  function eventStamp(obj){
    var raw = obj && (obj.event_date || obj.eventDate || obj.date || obj.logged_at || obj.prediction_created_at || null);
    var ms = raw ? new Date(raw).getTime() : NaN;
    return isFinite(ms) ? ms : 0;
  }
  function oppSortScore(m){
    return (Number(m.smartScore || 0) * 0.54) +
      (Number((m.bestBet || {}).adjProb || 0) * 0.30) +
      (Math.max(0, Number((m.bestBet || {}).edgePct || 0)) * 2.6) +
      (Math.max(0, Number((m.bestBet || {}).value || 0)) * 100 * 0.55);
  }
  function spark(values){
    var series = Array.isArray(values) && values.length ? values.slice() : [100,100];
    if(series.length === 1) series.push(series[0]);
    var w = 520, h = 160, pad = 14;
    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    if(min === max){ min -= 1; max += 1; }
    var pts = series.map(function(v, i){
      var x = pad + ((w - pad * 2) * (series.length === 1 ? 0 : i / (series.length - 1)));
      var y = h - pad - (((v - min) / (max - min)) * (h - pad * 2));
      return [x, y];
    });
    var line = pts.map(function(p){ return p[0].toFixed(2)+','+p[1].toFixed(2); }).join(' ');
    var area = 'M '+pts[0][0].toFixed(2)+' '+(h-pad).toFixed(2)+' L '+pts.map(function(p){ return p[0].toFixed(2)+' '+p[1].toFixed(2); }).join(' L ')+' L '+pts[pts.length-1][0].toFixed(2)+' '+(h-pad).toFixed(2)+' Z';
    var guides = [25,50,75].map(function(p){
      var y = (h-pad) - ((h - pad * 2) * p / 100);
      return '<line x1="'+pad+'" y1="'+y.toFixed(2)+'" x2="'+(w-pad)+'" y2="'+y.toFixed(2)+'" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 6" />';
    }).join('');
    return '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
      '<defs><linearGradient id="dashAreaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(59,130,246,.30)"/><stop offset="100%" stop-color="rgba(59,130,246,0)"/></linearGradient><linearGradient id="dashLineGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs>'+
      guides+
      '<path d="'+area+'" fill="url(#dashAreaGrad)"></path>'+
      '<polyline points="'+line+'" fill="none" stroke="url(#dashLineGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>'+
      '<circle cx="'+pts[pts.length-1][0].toFixed(2)+'" cy="'+pts[pts.length-1][1].toFixed(2)+'" r="5" fill="#22c55e" stroke="rgba(15,23,42,.95)" stroke-width="2"></circle>'+
    '</svg>';
  }

  var statusMetrics = typeof getStatusDisplayMetrics === 'function' ? getStatusDisplayMetrics() : {ml:ALL_MATCHES.length, odds:ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE'; }).length};
  var statusTime = typeof getStatusDisplayTime === 'function' ? getStatusDisplayTime() : '';
  var rawMl = Number(statusMetrics.ml || 0);
  var rawOdds = Number(statusMetrics.odds || 0);
  var eligibleLocal = (ALL_MATCHES || []).filter(function(m){ return m && passesSelectionFilter(m); });
  var analyzedCount = eligibleLocal.length;
  var proActiveCount = eligibleLocal.filter(function(m){ return isProActiveMatch(m); }).length;
  var trackingOpen = (TRACKING || []).filter(function(t){ return t.status === 'pending'; }).length;
  var topMatches = eligibleLocal.slice().sort(function(a,b){ return oppSortScore(b) - oppSortScore(a); });
  var above90 = topMatches.filter(function(m){ return Number(m.smartScore || 0) >= 90; });
  var topOpps = (above90.length ? above90 : topMatches).slice(0,3);

  var cutoff30 = new Date(Date.now() - (21 * 86400000));
  var settled30 = typeof getHistory21SettledRows === 'function' ? getHistory21SettledRows(cutoff30).filter(function(r){ return eventStamp(r) >= cutoff30.getTime(); }) : [];
  var pending30 = typeof getHistory21LivePendingRows === 'function' ? getHistory21LivePendingRows().filter(function(r){ return eventStamp(r) >= cutoff30.getTime(); }) : [];
  settled30.sort(function(a,b){ return eventStamp(a) - eventStamp(b); });
  var bets30 = settled30.length;
  var wins30 = settled30.filter(function(r){ return r.status === 'win'; }).length;
  var profit30 = settled30.reduce(function(acc, r){
    var odds = Number(r.odds || 0);
    return acc + (r.status === 'win' ? (odds > 1 ? (odds - 1) : 0) : -1);
  }, 0);
  var roi30 = bets30 ? (profit30 * 100 / bets30) : 0;
  var winrate30 = bets30 ? (wins30 * 100 / bets30) : 0;
  var bankrollSeries = [100];
  var running = 100;
  settled30.forEach(function(r){
    var odds = Number(r.odds || 0);
    running += (r.status === 'win' ? (odds > 1 ? (odds - 1) : 0) : -1);
    bankrollSeries.push(+running.toFixed(2));
  });
  if(bankrollSeries.length < 2) bankrollSeries.push(bankrollSeries[0]);
  var perfChart = spark(bankrollSeries);

  // ── Per-category breakdown (21 zile) ──────────────────────
  var combined30 = [];
  var merged = {};
  settled30.forEach(function(r){ merged[getHistory21RowKey ? getHistory21RowKey(r) : String(Math.random())] = r; });
  pending30.forEach(function(r){ merged[getHistory21RowKey ? getHistory21RowKey(r) : String(Math.random())] = r; });
  combined30 = Object.keys(merged).map(function(k){ return merged[k]; });

  var catTableHtml = '';
  if(typeof getHistory21CategoryDefs === 'function' && typeof buildHistory21Group === 'function' && combined30.length){
    var catDefs = [
      {key:'over15',  label:'Over 1.5G'},
      {key:'over25',  label:'Over 2.5G'},
      {key:'under35', label:'Under 3.5G'},
      {key:'btts',    label:'BTTS'},
      {key:'safe',    label:'Top analizate'},
      {key:'value',   label:'Value'}
    ];
    var catGroups = catDefs.map(function(def){
      return buildHistory21Group(def.label, def.key, combined30.filter(function(r){ return historyRowMatchesCategory(r, def.key); }));
    }).filter(function(g){ return g && g.bets > 0; });

    if(catGroups.length){
      var catRows = catGroups.map(function(g){
        var roi = Number(g.roi || 0);
        var wr  = Number(g.winrate || 0);
        var roiColor = roi >= 5 ? 'var(--grn)' : roi < 0 ? 'var(--red)' : 'var(--txt)';
        var wrColor  = wr  >= 65 ? 'var(--grn)' : wr < 50 ? 'var(--red)' : 'var(--txt)';
        return '<tr class="dash-cat-row">'+
          '<td class="dash-cat-name">'+ esc(g.label) +'</td>'+
          '<td class="dash-cat-val" style="color:'+ roiColor +'">'+ (roi>=0?'+':'') + roi.toFixed(1) +'%</td>'+
          '<td class="dash-cat-val" style="color:'+ wrColor +'">'+ (g.bets ? wr.toFixed(0)+'%' : '—') +'</td>'+
          '<td class="dash-cat-val">'+ Number(g.wins||0) +'/'+ Number(g.bets||0) +'</td>'+
          '<td class="dash-cat-val dash-cat-pending">'+ (Number(g.pending||0)||'—') +'</td>'+
        '</tr>';
      }).join('');
      catTableHtml =
        '<div class="dash-cat-table-wrap">'+
          '<table class="dash-cat-table">'+
            '<thead><tr>'+
              '<th>Categorie</th><th>ROI</th><th>W%</th><th>W/Total</th><th>Pend.</th>'+
            '</tr></thead>'+
            '<tbody>'+ catRows +'</tbody>'+
          '</table>'+
        '</div>';
    }
  }

  // ── Yesterday's results strip ────────────────────────────
  var yesterdayStart = new Date(); yesterdayStart.setHours(0,0,0,0); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  var yesterdayEnd   = new Date(); yesterdayEnd.setHours(0,0,0,0);
  var yesterdayRows  = settled30.filter(function(r){
    var t = eventStamp(r);
    return t >= yesterdayStart.getTime() && t < yesterdayEnd.getTime();
  });
  var yesterdayHtml = '';
  if(yesterdayRows.length){
    var pills = yesterdayRows.map(function(r){
      var isW = r.status === 'win';
      var label = (r.home && r.away) ? (r.home.split(' ')[0] + ' vs ' + r.away.split(' ')[0]) : (r.market || '—');
      return '<span class="dash-yday-pill '+ (isW ? 'dash-yday-w' : 'dash-yday-l') +'">'+
        '<span class="dash-yday-badge">'+ (isW ? 'W' : 'L') +'</span>'+
        '<span class="dash-yday-label">'+ esc(label) +'</span>'+
        '<span class="dash-yday-mkt">'+ esc(r.market || '') +'</span>'+
      '</span>';
    }).join('');
    yesterdayHtml =
      '<div class="dash-yday-strip">'+
        '<div class="dash-yday-head">📅 Ieri · '+ yesterdayRows.length +' finalizate</div>'+
        '<div class="dash-yday-scroll">'+ pills +'</div>'+
      '</div>';
  }
  var bestHistoryMarket = null;
  if(typeof getHistory21CategoryDefs === 'function' && typeof buildHistory21Group === 'function' && combined30.length){
    var defs = getHistory21CategoryDefs(combined30).filter(function(def){ return ['all','safe','value'].indexOf(def.key) === -1; });
    var groups = defs.map(function(def){
      return buildHistory21Group(def.label, def.key, combined30.filter(function(r){ return historyRowMatchesCategory(r, def.key); }));
    }).filter(function(g){ return g && g.total > 0; });
    groups.sort(function(a,b){
      var aScore = (Number(a.roi || 0) * 1.3) + (Number(a.winrate || 0) * 0.45) + (Number(a.bets || 0) * 0.4);
      var bScore = (Number(b.roi || 0) * 1.3) + (Number(b.winrate || 0) * 0.45) + (Number(b.bets || 0) * 0.4);
      return bScore - aScore;
    });
    bestHistoryMarket = groups[0] || null;
  }

  var availableToday = 0;
  if(bestHistoryMarket){
    availableToday = eligibleLocal.filter(function(m){
      return inferMarketTypeFromLabel(((m.bestBet || {}).label) || '') === bestHistoryMarket.market && isSameLocalDay(m.event_date || m.eventDate);
    }).length;
    if(!availableToday){
      availableToday = eligibleLocal.filter(function(m){
        return inferMarketTypeFromLabel(((m.bestBet || {}).label) || '') === bestHistoryMarket.market;
      }).length;
    }
  }

  var recommendationMain = bestHistoryMarket
    ? ('Bazat pe istoricul recent, ai semnal bun pe „' + esc(bestHistoryMarket.label) + '”.')
    : 'Nu există încă suficient istoric închis pentru o recomandare personalizată.';
  var recommendationSub = bestHistoryMarket
    ? (availableToday + ' meciuri disponibile ' + (availableToday && eligibleLocal.some(function(m){ return inferMarketTypeFromLabel(((m.bestBet || {}).label) || '') === bestHistoryMarket.market && isSameLocalDay(m.event_date || m.eventDate); }) ? 'azi' : 'în pool-ul curent') + ' în această piață • ROI ' + signed(bestHistoryMarket.roi || 0, '%') + ' • win ' + Number(bestHistoryMarket.winrate || 0).toFixed(1) + '% • ' + Number(bestHistoryMarket.wins || 0) + '/' + Number(bestHistoryMarket.bets || 0) + ' închise.')
    : 'Pe măsură ce se închid recomandările, dashboard-ul îți va sugera automat piețele unde performezi mai bine.';

  // Piața zilei - weekday-aware recommendation
  var _todayWd = (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  var _wdNames2 = ['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică'];
  var _marketGood = {
    0: ['Under 3.5G'], 1: ['Under 3.5G','BTTS'], 2: ['Over 2.5G','BTTS','Over 1.5G'],
    3: ['BTTS'], 4: ['Over 2.5G','BTTS'], 5: ['Under 3.5G','BTTS','Over 1.5G'], 6: ['BTTS']
  };
  var _marketBad = {
    0: ['Over 1.5G'], 1: [], 2: ['Under 3.5G'], 3: ['Under 3.5G','Over 1.5G'],
    4: ['Under 3.5G','Over 1.5G'], 5: [], 6: ['Under 3.5G']
  };
  var _goodToday = (_marketGood[_todayWd] || []).join(' • ') || '—';
  var _badToday = (_marketBad[_todayWd] || []).join(' • ') || '—';

  var topOppHtml = topOpps.length ? topOpps.map(function(m, idx){
    var bestBet = m.bestBet || {};
    var score = Math.round(Number(m.smartScore || oppSortScore(m) || 0));
    var edge = Number(bestBet.edgePct || 0);
    var adj = Number(bestBet.adjProb || 0);
    var odds = Number(bestBet.odds || 0);
    var rawKickoff = m.event_date || m.eventDate || m.date || m.starts_at || m.kickoff || m.start_time || '';
    var kickoffLabel = rawKickoff ? (function(v){ var d = new Date(v); return isFinite(d.getTime()) ? (d.toLocaleDateString('ro-RO') + ' • ' + d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})) : String(v); })(rawKickoff) : 'Data indisponibilă';
    return '<button class="dashboard-v16-opp-card" onclick="openDashboardOpportunity(\'' + getMatchCardKey(m) + '\')">'+
      '<div class="dashboard-v16-opp-top"><span class="dashboard-v16-rank">TOP ' + (idx + 1) + '</span><div><div class="dashboard-v16-score">' + score + '</div><div class="dashboard-v16-score-label">smart score</div></div></div>'+
      '<div class="dashboard-v16-opp-match">' + esc((m.home || '—') + ' vs ' + (m.away || '—')) + '</div>'+
      '<div class="dashboard-v16-opp-meta">' + esc((m.league || '—')) + '</div>'+
      '<div class="dashboard-v16-opp-meta">📅 ' + esc(kickoffLabel) + '</div>'+
      '<div class="dashboard-v16-opp-bet">' + esc((bestBet.label || 'Pronostic indisponibil')) + (odds > 1 ? (' @ ' + odds.toFixed(2)) : '') + '</div>'+
      '<div class="dashboard-v16-opp-pills">'+
        '<span class="dashboard-v16-opp-pill">Prob ' + adj.toFixed(1) + '%</span>'+
        '<span class="dashboard-v16-opp-pill">Edge ' + (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp</span>'+
        '<span class="dashboard-v16-opp-pill">Val ' + signed(Number(bestBet.value || 0) * 100, '%') + '</span>'+
      '</div>'+
    '</button>';
  }).join('') : '<div class="dashboard-v16-empty">Nu există încă oportunități eligibile în pool-ul curent.</div>';

  var todayLiveCount = eligibleLocal.filter(function(m){ return isSameLocalDay(m.event_date || m.eventDate); }).length || analyzedCount;
  var helloText = todayLiveCount + ' meciuri disponibile azi';

  target.innerHTML = '<div class="dashboard-v16-shell">'+
    '</div>'+

    '</div>'+

    '<div class="dashboard-v16-section">'+
      '<div class="dashboard-v16-section-head"><div><div class="dashboard-v16-section-title">🔥 TOP 3 OPORTUNITĂȚI</div><div class="dashboard-v16-section-sub">Scor SmartBet ridicat și context bun în pool-ul curent. Cardurile pot fi glisate orizontal.</div></div><div class="dashboard-v16-swipe-note">Swipe →</div></div>'+
      '<div class="dashboard-v16-opp-scroll">' + topOppHtml + '</div>'+
    '</div>'+

    '<div class="dashboard-v16-performance">'+
      '<div class="dashboard-v16-chart-wrap">'+
        '<div class="dashboard-v16-chart-head"><div><div class="dashboard-v16-chart-title">📊 PERFORMANȚA TA · ultimele 21 zile</div><div class="dashboard-v16-chart-note">Model 1 unit / recomandare închisă • pending separat</div></div><div class="dashboard-v16-swipe-note">' + bets30 + ' închise • ' + pending30.length + ' pending</div></div>'+
        '<div class="dashboard-v16-chart">' + perfChart + '</div>'+
      '</div>'+
      '<div class="dashboard-v16-perf-stats">'+
        '<div class="dashboard-v16-stat-card"><div class="dashboard-v16-stat-k">ROI</div><div class="dashboard-v16-stat-v" style="color:' + (bets30 ? (roi30 >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--txt)') + '">' + (bets30 ? signed(roi30, '%') : '—') + '</div><div class="dashboard-v16-stat-sub">rentabilitate pe recomandările închise din ultimele 21 de zile</div></div>'+
        '<div class="dashboard-v16-stat-card"><div class="dashboard-v16-stat-k">Win</div><div class="dashboard-v16-stat-v">' + (bets30 ? winrate30.toFixed(1) + '%' : '—') + '</div><div class="dashboard-v16-stat-sub">' + wins30 + ' câștigate din ' + bets30 + ' închise</div></div>'+
        '<div class="dashboard-v16-stat-card"><div class="dashboard-v16-stat-k">Profit unit</div><div class="dashboard-v16-stat-v" style="color:' + (bets30 ? (profit30 >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--txt)') + '">' + (bets30 ? signed(profit30, 'u') : '—') + '</div><div class="dashboard-v16-stat-sub">bankroll modelat de la 100u • pending ' + pending30.length + '</div></div>'+
      '</div>'+
      (catTableHtml ? catTableHtml : '')+
      (yesterdayHtml ? yesterdayHtml : '')+
    '</div>'+

    '<div class="dashboard-v16-reco">'+
      '<div class="dashboard-v16-section-head"><div><div class="dashboard-v16-section-title">🎯 RECOMANDĂRI PENTRU TINE</div><div class="dashboard-v16-section-sub">Motorul caută piața cu semnal istoric mai bun și o compară cu meciurile disponibile acum.</div></div></div>'+
      '<div class="dashboard-v16-reco-main">' + recommendationMain + '</div>'+
      '<div class="dashboard-v16-reco-sub">' + recommendationSub + '</div>'+
      '<div class="dashboard-v16-reco-pills">'+
        '<span class="dashboard-v16-reco-pill">ML sync ' + rawMl + '</span>'+
        '<span class="dashboard-v16-reco-pill">Cu cote ' + rawOdds + '</span>'+
        '<span class="dashboard-v16-reco-pill">Pool eligibil ' + analyzedCount + '</span>'+
        (_goodToday !== '—' ? '<span class="dashboard-v16-reco-pill" style="background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.25);color:var(--grn)">✓ ' + _goodToday + '</span>' : '')+
        (_badToday !== '—' ? '<span class="dashboard-v16-reco-pill" style="background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.22);color:var(--red)">✗ ' + _badToday + '</span>' : '')+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderAuditVisuals(){
  var rows = Array.isArray((SIGNAL_AUDIT || {}).rows) ? SIGNAL_AUDIT.rows.slice() : [];
  if(!rows.length){
    renderVisualBarList('audit-metric-bars', []);
    renderVisualBarList('audit-market-bars', []);
    return;
  }
  var avgProb = rows.reduce(function(acc,r){ return acc + Number(r.adjusted_prob || 0); }, 0) / rows.length;
  var avgEdge = rows.reduce(function(acc,r){ return acc + Number(r.edge_pct || 0); }, 0) / rows.length;
  var avgKelly = rows.reduce(function(acc,r){ return acc + Number(r.kelly_quarter_pct || 0); }, 0) / rows.length;
  var avgValue = rows.reduce(function(acc,r){ return acc + Number(r.value || 0) * 100; }, 0) / rows.length;
  renderVisualBarList('audit-metric-bars', [
    {label:'Prob. ajustată', value:avgProb, color:'var(--acc)'},
    {label:'Edge mediu', value:avgEdge, color:'var(--grn)'},
    {label:'Kelly 1/4', value:avgKelly, color:'var(--pur)'},
    {label:'Value mediu', value:avgValue, color:'var(--yel)'}
  ], function(v,row){ return (row.label === 'Prob. ajustată' ? v.toFixed(1) + '%' : (v>=0?'+':'') + v.toFixed(1) + '%'); });

  var byMarket = {};
  rows.forEach(function(r){
    var key = r.market || '—';
    byMarket[key] = byMarket[key] || {count:0, kelly:0};
    byMarket[key].count += 1;
    byMarket[key].kelly += Number(r.kelly_quarter_pct || 0);
  });
  var marketRows = Object.keys(byMarket).map(function(key){
    return {label:key + ' • ' + byMarket[key].count, value:byMarket[key].kelly / Math.max(1, byMarket[key].count), color:'var(--acc)'};
  }).sort(function(a,b){ return Number(b.value||0) - Number(a.value||0); }).slice(0,6);
  renderVisualBarList('audit-market-bars', marketRows, function(v){ return v.toFixed(1) + '%'; });
}
function renderAiMemoryVisuals(){
  var rows = Array.isArray((AI_MEMORY || {}).by_market) ? AI_MEMORY.by_market.slice(0, 8) : [];
  if(!rows.length){
    renderVisualBarList('aimemory-roi-bars', []);
    renderVisualBarList('aimemory-score-bars', []);
    return;
  }
  var roiRows = rows.map(function(r){ return {label:(r.market || '—') + ' • ' + Number(r.bets || 0), value:Number(r.roi || 0), color:Number(r.roi || 0) >= 0 ? 'var(--grn)' : 'var(--red)'}; });
  var scoreRows = rows.map(function(r){ return {label:(r.market || '—') + ' • ' + Number(r.bets || 0), value:Number(r.memory_score || 0), color:'var(--pur)'}; });
  renderVisualBarList('aimemory-roi-bars', roiRows, function(v){ return (v>=0?'+':'') + v.toFixed(1) + '%'; });
  renderVisualBarList('aimemory-score-bars', scoreRows, function(v){ return v.toFixed(1); });
}



// Logo helpers - uses BSD API /img/ endpoint
function teamLogoUrl(apiId){
  if(!apiId) return '';
  return API_TOKEN ? ('https://sports.bzzoiro.com/img/team/'+apiId+'/?token='+API_TOKEN) : ('https://sports.bzzoiro.com/img/team/'+apiId+'/');
}
function leagueLogoUrl(apiId){
  if(!apiId) return '';
  return API_TOKEN ? ('https://sports.bzzoiro.com/img/league/'+apiId+'/?token='+API_TOKEN) : ('https://sports.bzzoiro.com/img/league/'+apiId+'/');
}
function teamInitials(name){
  if(!name) return '?';
  var parts = String(name).trim().split(/\s+/);
  if(parts.length === 1) return parts[0].substring(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}
function logoImgHtml(url, alt, size, extraClass, options){
  var fs = Math.max(8, Math.round(size * 0.38));
  var initials = teamInitials(alt);
  var cls = String(extraClass || '').trim();
  var clsAttr = cls ? (' ' + cls) : '';
  var opts = options || {};
  var noFallback = !!opts.noFallback;
  var fallback = '<span class="'+cls+'" style="width:'+size+'px;height:'+size+'px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);font-size:'+fs+'px;font-weight:800;color:var(--muted);font-family:var(--mono);flex-shrink:0">'+initials+'</span>';
  if(!url) return noFallback ? '' : fallback;
  if(noFallback){
    return '<img src="'+url+'" alt="'+alt+'" width="'+size+'" height="'+size+'" class="mc-team-logo'+clsAttr+'" style="flex-shrink:0" onerror="this.remove()" loading="lazy"/>';
  }
  return '<img src="'+url+'" alt="'+alt+'" width="'+size+'" height="'+size+'" class="mc-team-logo'+clsAttr+'" style="flex-shrink:0" onerror="this.outerHTML=\''+fallback.replace(/'/g,"\\'")+'\'" loading="lazy"/>';
}
function htmlEsc(v){
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function pickDefined(){
  for(var i = 0; i < arguments.length; i++){
    var value = arguments[i];
    if(value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}
function normalizeVisualKey(value){
  return String(value == null ? '' : value).trim().toLowerCase();
}
var VISUAL_MATCH_INDEX = { built:false, event:{}, prediction:{}, slug:{} };
function buildVisualMatchSlug(row){
  if(!row) return '';
  var dateRaw = pickDefined(row.event_date, row.eventDate, row.date, row.logged_at, row.prediction_created_at, '');
  return [
    normalizeVisualKey(row.home),
    normalizeVisualKey(row.away),
    normalizeVisualKey(row.league),
    String(dateRaw || '').slice(0,10)
  ].join('|');
}
function rebuildVisualMatchIndex(){
  VISUAL_MATCH_INDEX = { built:true, event:{}, prediction:{}, slug:{} };
  (ALL_MATCHES || []).forEach(function(m){
    if(!m) return;
    if(m.eventId !== undefined && m.eventId !== null && m.eventId !== '') VISUAL_MATCH_INDEX.event[String(m.eventId)] = m;
    if(m.id !== undefined && m.id !== null && m.id !== '') VISUAL_MATCH_INDEX.prediction[String(m.id)] = m;
    var slug = buildVisualMatchSlug({ home:m.home, away:m.away, league:m.league, date:m.date });
    if(slug && !VISUAL_MATCH_INDEX.slug[slug]) VISUAL_MATCH_INDEX.slug[slug] = m;
  });
}
function findVisualMatch(row){
  if(!row) return null;
  if(!VISUAL_MATCH_INDEX.built && (ALL_MATCHES || []).length) rebuildVisualMatchIndex();
  var eventId = pickDefined(row.eventId, row.event_id, row.eventID);
  if(eventId !== '' && VISUAL_MATCH_INDEX.event[String(eventId)]) return VISUAL_MATCH_INDEX.event[String(eventId)];
  var predictionId = pickDefined(row.predictionId, row.prediction_id, row.id);
  if(predictionId !== '' && VISUAL_MATCH_INDEX.prediction[String(predictionId)]) return VISUAL_MATCH_INDEX.prediction[String(predictionId)];
  var slug = buildVisualMatchSlug(row);
  if(slug && VISUAL_MATCH_INDEX.slug[slug]) return VISUAL_MATCH_INDEX.slug[slug];
  return null;
}
function resolveVisualMeta(row){
  var linked = findVisualMatch(row) || {};
  return {
    home: pickDefined(row && row.home, linked.home, '—'),
    away: pickDefined(row && row.away, linked.away, '—'),
    league: pickDefined(row && row.league, linked.league, '—'),
    homeApiId: pickDefined(row && row.homeApiId, row && row.home_api_id, row && row.home_team_api_id, row && row.home_team_id, linked.homeApiId, linked.home_api_id),
    awayApiId: pickDefined(row && row.awayApiId, row && row.away_api_id, row && row.away_team_api_id, row && row.away_team_id, linked.awayApiId, linked.away_api_id),
    leagueApiId: pickDefined(row && row.leagueApiId, row && row.league_api_id, row && row.leagueId, row && row.league_id, linked.leagueApiId, linked.league_api_id)
  };
}
function renderEventIdentity(row, options){
  var meta = resolveVisualMeta(row || {});
  var opts = options || {};
  var logoSize = Number(opts.logoSize || 18);
  var leagueSize = Number(opts.leagueSize || Math.max(12, logoSize - 4));
  var secondaryHtml = opts.secondaryHtml || '';
  var scoreBadgeHtml = opts.scoreBadgeHtml || '';
  var showLeague = opts.showLeague !== false;
  var homeLogo = logoImgHtml(teamLogoUrl(meta.homeApiId), meta.home, logoSize, 'event-inline-logo', { noFallback:true });
  var awayLogo = logoImgHtml(teamLogoUrl(meta.awayApiId), meta.away, logoSize, 'event-inline-logo', { noFallback:true });
  var leagueLogo = showLeague ? logoImgHtml(leagueLogoUrl(meta.leagueApiId), meta.league, leagueSize, 'event-inline-logo event-inline-league-logo', { noFallback:true }) : '';
  var leagueHtml = showLeague ? ('<span class="event-inline-league">'+leagueLogo+'<span>'+htmlEsc(meta.league || '—')+'</span></span>') : '';
  var subLine = (leagueHtml || secondaryHtml) ? ('<div class="event-inline-sub">'+leagueHtml+(secondaryHtml ? '<span class="event-inline-secondary">'+secondaryHtml+'</span>' : '')+'</div>') : '';
  return '<div class="event-inline-stack">'+
    '<div class="event-inline-teams">'+
      '<span class="event-inline-team">'+homeLogo+'<span>'+htmlEsc(meta.home || '—')+'</span></span>'+
      '<span class="event-inline-vs">vs</span>'+
      '<span class="event-inline-team">'+awayLogo+'<span>'+htmlEsc(meta.away || '—')+'</span></span>'+
      (scoreBadgeHtml ? '<span class="event-inline-score">'+scoreBadgeHtml+'</span>' : '')+
    '</div>'+
    subLine+
  '</div>';
}
function renderLeagueBadge(row, size){
  var meta = resolveVisualMeta(row || {});
  var iconSize = Number(size || 12);
  return '<span class="event-inline-league">'+logoImgHtml(leagueLogoUrl(meta.leagueApiId), meta.league, iconSize, 'event-inline-logo event-inline-league-logo', { noFallback:true })+'<span>'+htmlEsc(meta.league || '—')+'</span></span>';
}

// ============================================================
// TAB SWITCHING
// ============================================================
function setMobileNavActive(name){
  var primary = ['dashboard','meciuri','claudeai','bilete'];
  document.querySelectorAll('.mobile-nav-btn').forEach(function(btn){ btn.classList.remove('active'); });
  var activeKey = primary.indexOf(name) >= 0 ? name : 'more';
  var target = document.querySelector('.mobile-nav-btn[data-tab="'+activeKey+'"]');
  if(target) target.classList.add('active');
}
function setDesktopTabActive(name){
  var primary = ['dashboard','meciuri','claudeai','bilete'];
  document.querySelectorAll('.tab').forEach(function(btn){ btn.classList.remove('active'); });
  var activeKey = primary.indexOf(name) >= 0 ? name : 'more';
  var target = document.querySelector('.tab[data-tab="'+activeKey+'"]');
  if(target) target.classList.add('active');
}
function getCurrentActiveTabName(){
  var active = document.querySelector('.tab-content.active');
  return active ? String(active.id || '').replace('tab-','') : 'dashboard';
}
function updateMorePanelOffset(){
  var tabs = document.querySelector('.tabs');
  if(!tabs) return;
  var rect = tabs.getBoundingClientRect();
  document.documentElement.style.setProperty('--more-panel-top', Math.max(0, Math.round(rect.bottom)) + 'px');
}
function toggleDesktopMore(){
  var panel = $('desktop-more-panel');
  if(!panel) return;
  updateMorePanelOffset();
  panel.classList.toggle('show');
  document.body.classList.toggle('more-open', panel.classList.contains('show'));
  if(panel.classList.contains('show')){
    document.querySelectorAll('.tab').forEach(function(btn){ btn.classList.remove('active'); });
    var moreBtn = document.querySelector('.tab[data-tab="more"]');
    if(moreBtn) moreBtn.classList.add('active');
  } else {
    setDesktopTabActive(getCurrentActiveTabName());
  }
}
function closeDesktopMore(skipActive){
  var panel = $('desktop-more-panel');
  if(panel) panel.classList.remove('show');
  document.body.classList.remove('more-open');
  if(!skipActive) setDesktopTabActive(getCurrentActiveTabName());
}
window.addEventListener('resize', updateMorePanelOffset, {passive:true});
window.addEventListener('scroll', function(){
  var panel = $('desktop-more-panel');
  if(panel && panel.classList.contains('show')) updateMorePanelOffset();
}, {passive:true});
function toggleMobileMore(){
  var sheet = $('mobile-sheet');
  if(!sheet) return;
  sheet.classList.toggle('show');
  setMobileNavActive(sheet.classList.contains('show') ? 'more' : getCurrentActiveTabName());
}
function closeMobileMore(){
  var sheet = $('mobile-sheet');
  if(sheet) sheet.classList.remove('show');
  setMobileNavActive(getCurrentActiveTabName());
}
function setMatchCardMode(mode, btn){
  MATCH_CARD_MODE = mode === 'expert' ? 'expert' : 'simple';
  localStorage.setItem('bet_match_card_mode', MATCH_CARD_MODE);
  document.querySelectorAll('.view-mode-btn,.mf-mode-btn,.mx20-mode-btn,.mx21-mode-btn,.ba-mode-btn').forEach(function(el){
    el.classList.toggle('active', el.getAttribute('data-mode') === MATCH_CARD_MODE);
  });
  if(typeof renderMatches === 'function') renderMatches();
}

var TAB_RENDER_STATE = {};
var NONCRITICAL_PREFETCH_STARTED = false;

function scheduleIdleTask(fn, timeout){
  if(typeof window.requestIdleCallback === 'function'){
    return window.requestIdleCallback(function(){ try{ fn(); }catch(e){ console.warn(e); } }, { timeout: timeout || 1500 });
  }
  return setTimeout(function(){ try{ fn(); }catch(e){ console.warn(e); } }, Math.min(timeout || 1500, 1200));
}
function isTabActive(name){
  var el = $('tab-' + name);
  return !!(el && el.classList.contains('active'));
}
function markTabRendered(name){
  TAB_RENDER_STATE[name] = Date.now();
}
function renderDashboardTab(opts){
  opts = opts || {};
  if(opts.deferSecondary){
    scheduleIdleTask(function(){
      if(!isTabActive('dashboard')) return;
      renderBacktest();
      renderMarketDistribution();
      renderFocusCenter();
      renderTicketLaneBoard();
      renderSignalAudit();
      renderAuditVisuals();
      markTabRendered('dashboard');
    }, 1800);
    return;
  }
  renderBacktest();
  renderMarketDistribution();
  renderFocusCenter();
  renderTicketLaneBoard();
  renderSignalAudit();
  renderAuditVisuals();
  markTabRendered('dashboard');
}
function renderMatchesTab(){
  renderML();
  renderML15();
  renderML35();
  renderMlApiCenter();
  renderMatches();
  markTabRendered('meciuri');
}
// ============================================================
// CLAUDE AI DAILY ANALYSIS TAB
// ============================================================
function renderClaudeAITab(){
  var root = document.getElementById('claudeai-root');
  if(!root) return;
  var d = window.CLAUDE_DAILY || {};
  var topPicks = d.top_picks || [];
  var acumulator = d.acumulator || [];
  var tipare = d.tipare || [];
  var deEvitat = d.de_evitat || [];
  var generatedAt = d.generated_at || '';
  var matchesAnalyzed = d.matches_analyzed || 0;

  // Tracking data — needed early for result lookups in Top5 & Acumulator
  var trk = window.AI_PRED_TRACKING || {};
  var trkHistory = trk.history || [];
  var trkStats   = trk.stats   || {};
  var tpStats    = trkStats.top_picks   || {};
  var acStats    = trkStats.acumulators || {};
  var streak     = trkStats.streak      || {};

  // Build kickoff lookup: normalized "home vs away" → time string
  var _kickoffMap = {};
  (window.ALL_MATCHES || []).forEach(function(m){
    var timeStr = m.timeLabel || (m.date ? fmtTime(m.date) : '');
    if(!timeStr || timeStr === '00:00') return;
    var dateStr = '';
    if(m.date){
      var _d = new Date(m.date);
      if(isFinite(_d.getTime()))
        dateStr = _d.getDate().toString().padStart(2,'0') + '.' + (_d.getMonth()+1).toString().padStart(2,'0');
    }
    var label = dateStr ? (dateStr + ' · ' + timeStr) : timeStr;
    var key = ((m.home||'')+(m.away||'')).toLowerCase().replace(/\s+/g,'');
    if(key) _kickoffMap[key] = label;
  });
  function _getKickoff(meciStr){
    var parts = meciStr.split(/\s+vs\s+/i);
    if(parts.length < 2) return '';
    var h = parts[0].trim().toLowerCase().replace(/\s+/g,'');
    var a = parts[1].trim().toLowerCase().replace(/\s+/g,'');
    // exact key match
    var key = h + a;
    if(_kickoffMap[key]) return _kickoffMap[key];
    // fuzzy: find any key that starts with home fragment and ends with away fragment
    for(var k in _kickoffMap){
      if(k.indexOf(h) !== -1 && k.indexOf(a) !== -1) return _kickoffMap[k];
    }
    return '';
  }
  var cotaTotala = d.cota_totala || null;
  var sansaPct = d.sansa_pct || null;

  if(!generatedAt && !topPicks.length && !acumulator.length){
    root.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--muted,#64748b)">'
      + '<div style="font-size:32px;margin-bottom:12px">🤖</div>'
      + '<div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--txt)">Analiza nu este disponibilă</div>'
      + '<div style="font-size:13px">Analiza zilnică Claude se generează automat la fiecare rulare a workflow-ului.<br>Încearcă din nou mai târziu.</div>'
      + '</div>';
    return;
  }

  var genStr = '';
  if(generatedAt){
    try{
      var gd = new Date(generatedAt);
      genStr = gd.toLocaleString('ro-RO', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    }catch(e){ genStr = generatedAt.slice(0,16).replace('T',' '); }
  }

  var html = '<div style="padding:0 4px">';

  // Header
  html += '<div style="background:linear-gradient(135deg,rgba(43,229,197,.1),rgba(99,102,241,.08));border:1px solid rgba(43,229,197,.25);border-radius:16px;padding:16px 18px;margin-bottom:14px">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '<div><div style="font-size:17px;font-weight:900;color:var(--txt)">🤖 Predicții AI Claude</div>'
    + (genStr ? '<div style="font-size:11px;color:var(--muted)">Generat ' + genStr + (matchesAnalyzed ? ' · ' + matchesAnalyzed + ' meciuri analizate' : '') + '</div>' : '')
    + '</div>'
    + '</div></div>';

  // Build result lookup from today's tracking entry
  var _todayStr = new Date().toISOString().slice(0,10);
  var _todayRec = null;
  for(var _ti=0; _ti < trkHistory.length; _ti++){
    if(trkHistory[_ti].date === _todayStr){ _todayRec = trkHistory[_ti]; break; }
  }
  var _topResMap = {};
  if(_todayRec && Array.isArray(_todayRec.top_picks_results)){
    _todayRec.top_picks_results.forEach(function(r){
      var k = (r.meci||'').toLowerCase().replace(/\s+/g,'');
      if(k) _topResMap[k] = r;
    });
  }
  var _acumResMap = {};
  if(_todayRec && Array.isArray(_todayRec.acumulator_picks)){
    _todayRec.acumulator_picks.forEach(function(r){
      var k = (r.meci||'').toLowerCase().replace(/\s+/g,'');
      if(k) _acumResMap[k] = r;
    });
  }
  function _resultBadge(res, compact){
    if(!res || !res.result || res.result === 'pending') return '';
    var scoreStr = res.score ? ' <span style="font-size:10px;color:var(--muted);font-weight:400">'+res.score+'</span>' : '';
    if(res.result === 'win')  return '<span style="color:#22c55e;font-size:'+(compact?'11':'12')+'px;font-weight:800">✅ WIN</span>'+scoreStr;
    if(res.result === 'loss') return '<span style="color:#ef4444;font-size:'+(compact?'11':'12')+'px;font-weight:800">❌ LOSS</span>'+scoreStr;
    return '';
  }

  // Top Picks
  if(topPicks.length){
    html += '<div style="background:var(--bg2,#0E1424);border:1px solid rgba(43,229,197,.2);border-radius:14px;padding:14px 16px;margin-bottom:12px">'
      + '<div style="font-size:14px;font-weight:800;color:#2BE5C5;margin-bottom:10px">🏆 Top 5 Pariuri ale Zilei</div>';
    topPicks.forEach(function(p, i){
      var _res = _topResMap[(p.meci||'').toLowerCase().replace(/\s+/g,'')];
      var _badge = _resultBadge(_res, false);
      var _borderCol = _res && _res.result === 'win' ? 'rgba(34,197,94,.25)' : _res && _res.result === 'loss' ? 'rgba(239,68,68,.2)' : 'rgba(43,229,197,.12)';
      html += '<div style="background:rgba(43,229,197,.05);border:1px solid '+_borderCol+';border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<div style="min-width:22px;height:22px;border-radius:50%;background:#2BE5C5;color:#0E1424;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center">' + (i+1) + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px">'
        + '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + (p.meci || '') + '</div>'
        + (_badge ? '<div>'+_badge+'</div>' : '')
        + '</div>'
        + (function(){ var t=_getKickoff(p.meci||''); return t?'<div style="font-size:11px;color:var(--muted);margin-bottom:3px">🕐 '+t+'</div>':''; })()
        + (p.pick ? '<div style="font-size:12px;color:#2BE5C5;margin-bottom:2px">' + p.pick + '</div>' : '')
        + (p.motiv ? '<div style="font-size:11px;color:var(--muted)">' + p.motiv + '</div>' : '')
        + '</div></div></div>';
    });
    html += '</div>';
  }

  // Acumulator
  if(acumulator.length){
    var _acumTodayResult = _todayRec ? (_todayRec.acumulator_result || 'pending') : 'pending';
    var _acumBadge = _acumTodayResult === 'win'
      ? '<span style="color:#22c55e;font-size:13px;font-weight:900">✅ WIN</span>'
      : _acumTodayResult === 'loss'
      ? '<span style="color:#ef4444;font-size:13px;font-weight:900">❌ LOSS</span>'
      : '';
    html += '<div style="background:var(--bg2,#0E1424);border:1px solid rgba(99,102,241,.25);border-radius:14px;padding:14px 16px;margin-bottom:12px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px">'
      + '<div style="font-size:14px;font-weight:800;color:#818cf8">🎰 Acumulator Recomandat</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + (_acumBadge ? _acumBadge : '')
      + (cotaTotala ? '<span style="font-size:12px;font-weight:700;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:20px;padding:3px 10px;color:#818cf8">Cotă: ' + cotaTotala.toFixed(2) + '</span>' : '')
      + (sansaPct ? '<span style="font-size:12px;font-weight:700;background:rgba(20,138,92,.12);border:1px solid rgba(20,138,92,.3);border-radius:20px;padding:3px 10px;color:#10b981">Șansă: ' + sansaPct + '%</span>' : '')
      + '</div></div>';
    acumulator.forEach(function(a){
      var _at = _getKickoff(a.meci || '');
      var _ar = _acumResMap[(a.meci||'').toLowerCase().replace(/\s+/g,'')];
      var _ab = _resultBadge(_ar, true);
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--brd)">'
        + '<div style="font-size:16px">' + (_ar && _ar.result === 'win' ? '✅' : _ar && _ar.result === 'loss' ? '❌' : '⚽') + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:12px;font-weight:600;color:var(--txt)">' + (a.meci || '') + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<div style="font-size:11px;color:#818cf8">' + (a.pick || '') + '</div>'
        + (_at ? '<div style="font-size:10px;color:var(--muted)">🕐 ' + _at + '</div>' : '')
        + (_ab ? '<div>'+_ab+'</div>' : '')
        + '</div>'
        + '</div></div>';
    });
    html += '</div>';
  }

  // Tipare — collapsible
  if(tipare.length){
    html += '<div style="background:var(--bg2,#0E1424);border:1px solid rgba(251,191,36,.2);border-radius:14px;margin-bottom:12px;overflow:hidden">'
      + '<div onclick="var b=document.getElementById(\'tip-body\');var a=document.getElementById(\'tip-arr\');if(b.style.display===\'none\'){b.style.display=\'block\';a.textContent=\'▴\';}else{b.style.display=\'none\';a.textContent=\'▾\';}" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;user-select:none">'
      + '<div style="font-size:14px;font-weight:800;color:#fbbf24">📊 Tipare Identificate <span style="font-size:11px;font-weight:400;color:var(--muted)">('+tipare.length+')</span></div>'
      + '<span id="tip-arr" style="font-size:12px;color:var(--muted)">&#9662;</span>'
      + '</div>'
      + '<div id="tip-body" style="display:none;padding:0 16px 14px 16px">';
    tipare.forEach(function(t){
      html += '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd)">'
        + '<div style="color:#fbbf24;font-size:14px;flex-shrink:0">•</div>'
        + '<div style="font-size:12px;color:var(--txt);line-height:1.5">' + t + '</div>'
        + '</div>';
    });
    html += '</div></div>';
  }

  // De evitat — collapsible
  if(deEvitat.length){
    html += '<div style="background:var(--bg2,#0E1424);border:1px solid rgba(196,32,64,.2);border-radius:14px;margin-bottom:12px;overflow:hidden">'
      + '<div onclick="var b=document.getElementById(\'dev-body\');var a=document.getElementById(\'dev-arr\');if(b.style.display===\'none\'){b.style.display=\'block\';a.textContent=\'▴\';}else{b.style.display=\'none\';a.textContent=\'▾\';}" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;user-select:none">'
      + '<div style="font-size:14px;font-weight:800;color:#f87171">⚠️ Meciuri / Piețe de Evitat <span style="font-size:11px;font-weight:400;color:var(--muted)">('+deEvitat.length+')</span></div>'
      + '<span id="dev-arr" style="font-size:12px;color:var(--muted)">&#9662;</span>'
      + '</div>'
      + '<div id="dev-body" style="display:none;padding:0 16px 14px 16px">';
    deEvitat.forEach(function(e){
      html += '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd)">'
        + '<div style="color:#f87171;font-size:14px;flex-shrink:0">✗</div>'
        + '<div style="font-size:12px;color:var(--txt);line-height:1.5">' + e + '</div>'
        + '</div>';
    });
    html += '</div></div>';
  }

  // ── Monitorizare & Statistici ──────────────────────────────────────────────

  html += '<div style="background:var(--bg2,#0E1424);border:1px solid rgba(139,92,246,.25);border-radius:14px;padding:14px 16px;margin-bottom:12px">'
    + '<div style="font-size:14px;font-weight:800;color:#a78bfa;margin-bottom:12px">📊 Monitorizare & Statistici</div>';

  if(!trkHistory.length){
    html += '<div style="text-align:center;padding:20px 0;color:var(--muted);font-size:12px">Statisticile se acumulează zilnic. Revin mâine cu primul raport.</div>';
  } else {
    // ── ROI computations ──────────────────────────────────────────────────────
    var _tp_roi_sum = 0, _tp_roi_cnt = 0;
    trkHistory.forEach(function(rec){
      (rec.top_picks_results || []).forEach(function(p){
        if(p.result === 'win'){ _tp_roi_sum += (p.odds || 2) - 1; _tp_roi_cnt++; }
        else if(p.result === 'loss'){ _tp_roi_sum -= 1; _tp_roi_cnt++; }
      });
    });
    var _tp_roi_pct = _tp_roi_cnt ? Math.round(_tp_roi_sum / _tp_roi_cnt * 100) : 0;

    var _ac_roi_sum = 0, _ac_settled = 0, _ac_won = 0, _ac_lost = 0, _ac_pend_cnt = 0;
    var _ac_pick_wins = 0, _ac_pick_losses = 0;
    var _ac_pick_roi_sum = 0, _ac_pick_roi_cnt = 0;
    trkHistory.forEach(function(rec){
      var ar = rec.acumulator_result || 'pending';
      if(ar === 'win'){ _ac_roi_sum += (rec.cota_totala || 1) - 1; _ac_settled++; _ac_won++; }
      else if(ar === 'loss'){ _ac_roi_sum -= 1; _ac_settled++; _ac_lost++; }
      else { _ac_pend_cnt++; }
      (rec.acumulator_picks || []).forEach(function(p){
        if(p.result === 'win'){ _ac_pick_wins++; _ac_pick_roi_sum += (p.odds || 1.3) - 1; _ac_pick_roi_cnt++; }
        else if(p.result === 'loss'){ _ac_pick_losses++; _ac_pick_roi_sum -= 1; _ac_pick_roi_cnt++; }
      });
    });
    var _ac_roi_pct = _ac_settled ? Math.round(_ac_roi_sum / _ac_settled * 100) : 0;
    var _ac_pick_roi_pct = _ac_pick_roi_cnt ? Math.round(_ac_pick_roi_sum / _ac_pick_roi_cnt * 100) : 0;
    var _ac_wr_pct  = _ac_settled ? parseFloat((_ac_won / _ac_settled * 100).toFixed(1)) : 0;

    // ── Existing top-picks aggregate ──────────────────────────────────────────
    var tpW = tpStats.wins || 0, tpL = tpStats.losses || 0, tpP = tpStats.pending || 0;
    var tpWR = (tpStats.winrate != null) ? tpStats.winrate : 0;
    var tpTotal = tpW + tpL + tpP;
    var tpColor    = tpWR >= 60 ? '#22c55e' : (tpWR >= 50 ? '#f59e0b' : '#ef4444');
    var tpRoiColor = _tp_roi_pct > 0 ? '#22c55e' : (_tp_roi_pct === 0 ? '#f59e0b' : '#ef4444');
    var acColor    = _ac_wr_pct >= 50 ? '#22c55e' : '#ef4444';
    var acRoiColor = _ac_roi_pct > 0 ? '#22c55e' : (_ac_roi_pct === 0 ? '#f59e0b' : '#ef4444');

    var strN = streak.current || 0, strT = streak.type || '';
    var strColor = strT === 'win' ? '#22c55e' : (strT === 'loss' ? '#ef4444' : '#64748b');
    var strLabel = strN ? (strN + ' ' + strT.toUpperCase()) : '—';

    // ── Two dedicated monitoring cards ────────────────────────────────────────
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
      // Top 5 card
      + '<div style="background:rgba(43,229,197,.05);border:1px solid rgba(43,229,197,.25);border-radius:12px;padding:12px 10px">'
      + '<div style="font-size:10px;font-weight:800;color:#2BE5C5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🏆 Top 5 Picks</div>'
      + '<div style="font-size:22px;font-weight:900;color:'+tpColor+';line-height:1">'+tpWR.toFixed(0)+'%</div>'
      + '<div style="font-size:9px;color:var(--muted);margin-top:2px;margin-bottom:8px">Win Rate</div>'
      + '<div style="display:flex;flex-direction:column;gap:3px">'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:var(--muted)">Jucate</span><span style="font-size:10px;font-weight:700;color:var(--txt)">'+tpTotal+'</span></div>'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#22c55e">Win</span><span style="font-size:10px;font-weight:700;color:#22c55e">'+tpW+'</span></div>'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#ef4444">Loss</span><span style="font-size:10px;font-weight:700;color:#ef4444">'+tpL+'</span></div>'
      + (tpP ? '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#f59e0b">Pending</span><span style="font-size:10px;font-weight:700;color:#f59e0b">'+tpP+'</span></div>' : '')
      + '<div style="display:flex;justify-content:space-between;margin-top:5px;padding-top:5px;border-top:1px solid rgba(43,229,197,.15)">'
      + '<span style="font-size:10px;color:var(--muted)">ROI</span>'
      + '<span style="font-size:12px;font-weight:900;color:'+tpRoiColor+'">'+(_tp_roi_pct > 0 ? '+' : '')+_tp_roi_pct+'%</span>'
      + '</div>'
      + '</div></div>'
      // Accumulator card
      + '<div style="background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.25);border-radius:12px;padding:12px 10px">'
      + '<div style="font-size:10px;font-weight:800;color:#818cf8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🎰 Acumulatoare</div>'
      + (function(){
          var pickSettled = _ac_pick_wins + _ac_pick_losses;
          var pickWR = pickSettled ? Math.round(_ac_pick_wins / pickSettled * 100) : 0;
          var pickWRColor = pickWR >= 70 ? '#22c55e' : (pickWR >= 55 ? '#f59e0b' : '#ef4444');
          return '<div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:2px">'
            + '<div><div style="font-size:22px;font-weight:900;color:'+acColor+';line-height:1">'+_ac_wr_pct.toFixed(0)+'%</div>'
            + '<div style="font-size:8px;color:var(--muted);margin-top:1px">bilete</div></div>'
            + '<div style="width:1px;height:24px;background:rgba(99,102,241,.25);margin-bottom:4px"></div>'
            + '<div><div style="font-size:22px;font-weight:900;color:'+pickWRColor+';line-height:1">'+pickWR+'%</div>'
            + '<div style="font-size:8px;color:var(--muted);margin-top:1px">events</div></div>'
            + '</div>'
            + '<div style="font-size:9px;color:var(--muted);margin-bottom:8px">Win Rate</div>';
        })()
      + '<div style="display:flex;flex-direction:column;gap:3px">'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:var(--muted)">Bilete jucate</span><span style="font-size:10px;font-weight:700;color:var(--txt)">'+(_ac_won+_ac_lost+_ac_pend_cnt)+'</span></div>'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#22c55e">Bilete câșt.</span><span style="font-size:10px;font-weight:700;color:#22c55e">'+_ac_won+'</span></div>'
      + '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#ef4444">Bilete piers.</span><span style="font-size:10px;font-weight:700;color:#ef4444">'+_ac_lost+'</span></div>'
      + (_ac_pend_cnt ? '<div style="display:flex;justify-content:space-between"><span style="font-size:10px;color:#f59e0b">Pending</span><span style="font-size:10px;font-weight:700;color:#f59e0b">'+_ac_pend_cnt+'</span></div>' : '')
      + ((_ac_pick_wins + _ac_pick_losses) > 0 ? '<div style="display:flex;justify-content:space-between;margin-top:3px;padding-top:3px;border-top:1px solid rgba(99,102,241,.12)"><span style="font-size:10px;color:var(--muted)">Picks câșt./piers.</span><span style="font-size:10px;font-weight:700;color:var(--txt)"><span style="color:#22c55e">'+_ac_pick_wins+'W</span> <span style="color:#ef4444">'+_ac_pick_losses+'L</span></span></div>' : '')
      + '<div style="display:flex;justify-content:space-between;margin-top:5px;padding-top:5px;border-top:1px solid rgba(99,102,241,.15)">'
      + '<span style="font-size:10px;color:var(--muted)">ROI bilet</span>'
      + '<span style="font-size:12px;font-weight:900;color:'+acRoiColor+'">'+(_ac_roi_pct > 0 ? '+' : '')+_ac_roi_pct+'%</span>'
      + '</div>'
      + (function(){ var c=_ac_pick_roi_pct>0?'#22c55e':(_ac_pick_roi_pct===0?'#f59e0b':'#ef4444'); return '<div style="display:flex;justify-content:space-between;margin-top:2px"><span style="font-size:10px;color:var(--muted)">ROI picks</span><span style="font-size:11px;font-weight:700;color:'+c+'">'+(_ac_pick_roi_pct>0?'+':'')+_ac_pick_roi_pct+'%</span></div>'; })()
      + '</div></div>'
      + '</div>';

    // Streak row
    html += '<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.2);border-radius:10px;padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">'
      + '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Streak Acumulator</div>'
      + '<div style="font-size:15px;font-weight:900;color:'+strColor+'">'+strLabel+' <span style="font-size:10px;font-weight:400;color:var(--muted)">consecutiv</span></div>'
      + '</div>';

    // ── SVG Bar chart — ultimele 14 zile ──────────────────────────────────────
    var chartData = trkHistory.slice(0, 14).reverse();
    if(chartData.length){
      var cW = 300, cH = 70, barW = Math.floor((cW - 8) / chartData.length) - 2, maxH = 50;
      var svgBars = '';
      chartData.forEach(function(rec, i){
        var s = rec.top_picks_summary || {};
        var w = s.wins || 0, l = s.losses || 0, p = s.pending || 0;
        var tot = w + l + p || 1;
        var x = 4 + i * (barW + 2);
        var wH = Math.round(w / tot * maxH), lH = Math.round(l / tot * maxH), pH = Math.round(p / tot * maxH);
        var y = cH - 16;
        // stacked: wins bottom, losses middle, pending top
        if(pH) svgBars += '<rect x="'+x+'" y="'+(y-wH-lH-pH)+'" width="'+barW+'" height="'+pH+'" fill="#94a3b8" rx="2"/>';
        if(lH) svgBars += '<rect x="'+x+'" y="'+(y-wH-lH)+'" width="'+barW+'" height="'+lH+'" fill="#ef4444" rx="2"/>';
        if(wH) svgBars += '<rect x="'+x+'" y="'+(y-wH)+'" width="'+barW+'" height="'+wH+'" fill="#22c55e" rx="2"/>';
        // date label
        var dd = rec.date ? rec.date.slice(8,10)+'.'+rec.date.slice(5,7) : '';
        svgBars += '<text x="'+(x+barW/2)+'" y="'+(cH-2)+'" text-anchor="middle" font-size="8" fill="#64748b">'+dd+'</text>';
      });
      html += '<div style="margin-bottom:12px">'
        + '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">Picks / zi — ultimele '+chartData.length+' zile</div>'
        + '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">'
        + '<span style="font-size:10px;display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:#22c55e;border-radius:2px;display:inline-block"></span>Win</span>'
        + '<span style="font-size:10px;display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:#ef4444;border-radius:2px;display:inline-block"></span>Loss</span>'
        + '<span style="font-size:10px;display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;background:#94a3b8;border-radius:2px;display:inline-block"></span>Pending</span>'
        + '</div>'
        + '<svg width="100%" viewBox="0 0 '+cW+' '+cH+'" style="overflow:visible">'+svgBars+'</svg>'
        + '</div>';
    }

    // ── Istoric Top 5 ─────────────────────────────────────────────────────────
    html += '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">Istoric Top 5 — ultimele '+ Math.min(trkHistory.length,7) + ' înregistrări</div>';
    trkHistory.slice(0,7).forEach(function(rec, idx){
      var dateStr = '';
      if(rec.date){
        var months = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
        var dp = rec.date.split('-');
        dateStr = parseInt(dp[2],10)+' '+months[parseInt(dp[1],10)-1];
      }
      var prov = rec.provider || '';
      var provLabel = prov.indexOf('gemini') !== -1 ? 'Gemini' : (prov.indexOf('claude') !== -1 ? 'Claude' : prov || '?');
      var provColor = prov.indexOf('gemini') !== -1 ? '#2BE5C5' : '#818cf8';
      var s = rec.top_picks_summary || {};
      var tpW5 = s.wins || 0, tpL5 = s.losses || 0, tpP5 = s.pending || 0;
      var tp5Html = '<span style="color:#22c55e">'+tpW5+'W</span> <span style="color:#ef4444">'+tpL5+'L</span>'+(tpP5 ? ' <span style="color:#f59e0b">'+tpP5+'P</span>' : '');
      var settled5 = tpW5 + tpL5;
      var wr5 = settled5 ? Math.round(tpW5 / settled5 * 100) : 0;
      var wr5Color = wr5 >= 60 ? '#22c55e' : (wr5 >= 50 ? '#f59e0b' : '#ef4444');
      var tp5picks = rec.top_picks_results || [];
      var detId5 = 'tp5d-'+idx, arrId5 = 'tp5a-'+idx;
      var toggleFn5 = "var d=document.getElementById('"+detId5+"');var a=document.getElementById('"+arrId5+"');if(d.style.display==='none'){d.style.display='block';a.textContent='▴';}else{d.style.display='none';a.textContent='▾';}";
      html += '<div onclick="'+toggleFn5+'" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--brd);cursor:pointer;user-select:none">'
        + '<div style="font-size:12px;font-weight:700;color:var(--txt);min-width:52px">'+dateStr+'</div>'
        + '<span style="font-size:10px;font-weight:700;background:'+provColor+'22;border:1px solid '+provColor+'44;color:'+provColor+';padding:2px 7px;border-radius:20px">'+provLabel+'</span>'
        + '<span style="font-size:11px">'+tp5Html+'</span>'
        + '<span style="font-size:11px;font-weight:700;color:'+wr5Color+';margin-left:auto">'+wr5+'%</span>'
        + (tp5picks.length ? '<span id="'+arrId5+'" style="font-size:10px;color:var(--muted);margin-left:4px">&#9662;</span>' : '')
        + '</div>';
      if(tp5picks.length){
        html += '<div id="'+detId5+'" style="display:none;padding:4px 0 6px 6px;border-bottom:1px solid var(--brd)">';
        tp5picks.forEach(function(p){
          var res = p.result || 'pending';
          var icon = res === 'win' ? '✅' : res === 'loss' ? '❌' : '⏳';
          var col  = res === 'win' ? '#22c55e' : res === 'loss' ? '#ef4444' : '#f59e0b';
          var dateLabel = '';
          if(p.eventDate){
            try{
              var ed = new Date(p.eventDate);
              dateLabel = ed.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            }catch(e){ dateLabel = String(p.eventDate).slice(0,10); }
          }
          html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">'
            + '<span style="font-size:13px">'+icon+'</span>'
            + '<div style="flex:1;min-width:0;overflow:hidden">'
            + '<div style="font-size:11px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(p.meci||'')+'</div>'
            + '<div style="font-size:10px;color:#2BE5C5">'+(p.pick||'')+(dateLabel ? ' · <span style="color:#64748b">'+dateLabel+'</span>' : '')+'</div>'
            + '</div>'
            + (p.score ? '<div style="font-size:11px;font-weight:700;color:'+col+';white-space:nowrap">'+p.score+'</div>' : '')
            + '</div>';
        });
        html += '</div>';
      }
    });

    // ── Istoric Acumulator ────────────────────────────────────────────────────
    html += '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px;margin-top:14px">Istoric Acumulator — ultimele '+ Math.min(trkHistory.length,7) + ' înregistrări</div>';
    trkHistory.slice(0,7).forEach(function(rec, idx){
      var dateStr = '';
      if(rec.date){
        var months = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
        var dp = rec.date.split('-');
        dateStr = parseInt(dp[2],10)+' '+months[parseInt(dp[1],10)-1];
      }
      var prov = rec.provider || '';
      var provLabel = prov.indexOf('gemini') !== -1 ? 'Gemini' : (prov.indexOf('claude') !== -1 ? 'Claude' : prov || '?');
      var provColor = prov.indexOf('gemini') !== -1 ? '#2BE5C5' : '#818cf8';
      var acPs = rec.acumulator_picks || [];
      var acPW = acPs.filter(function(p){ return p.result === 'win'; }).length;
      var acPL = acPs.filter(function(p){ return p.result === 'loss'; }).length;
      var pickStr = acPs.length ? ('<span style="color:#22c55e">'+acPW+'W</span> <span style="color:#ef4444">'+acPL+'L</span>') : '—';
      var ar = rec.acumulator_result || 'pending';
      var arHtml = ar === 'win' ? '<span style="color:#22c55e;font-weight:700">✅ WIN</span>'
                 : ar === 'loss' ? '<span style="color:#ef4444;font-weight:700">❌ LOSS</span>'
                 : '<span style="color:#64748b">⏳ Pending</span>';
      var cotaStr = rec.cota_totala ? ' · @'+Number(rec.cota_totala).toFixed(2) : '';
      var detIdA = 'acd-'+idx, arrIdA = 'aca-'+idx;
      var toggleFnA = "var d=document.getElementById('"+detIdA+"');var a=document.getElementById('"+arrIdA+"');if(d.style.display==='none'){d.style.display='block';a.textContent='▴';}else{d.style.display='none';a.textContent='▾';}";
      html += '<div onclick="'+toggleFnA+'" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--brd);cursor:pointer;user-select:none">'
        + '<div style="font-size:12px;font-weight:700;color:var(--txt);min-width:52px">'+dateStr+'</div>'
        + '<span style="font-size:10px;font-weight:700;background:'+provColor+'22;border:1px solid '+provColor+'44;color:'+provColor+';padding:2px 7px;border-radius:20px">'+provLabel+'</span>'
        + '<span style="font-size:11px">'+pickStr+'</span>'
        + '<span style="font-size:11px;margin-left:auto">'+arHtml+cotaStr+'</span>'
        + (acPs.length ? '<span id="'+arrIdA+'" style="font-size:10px;color:var(--muted);margin-left:4px">&#9662;</span>' : '')
        + '</div>';
      if(acPs.length){
        html += '<div id="'+detIdA+'" style="display:none;padding:4px 0 6px 6px;border-bottom:1px solid var(--brd)">';
        acPs.forEach(function(p){
          var res = p.result || 'pending';
          var icon = res === 'win' ? '✅' : res === 'loss' ? '❌' : '⏳';
          var col  = res === 'win' ? '#22c55e' : res === 'loss' ? '#ef4444' : '#f59e0b';
          var dateLabel = '';
          if(p.eventDate){
            try{
              var ed = new Date(p.eventDate);
              dateLabel = ed.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            }catch(e){ dateLabel = String(p.eventDate).slice(0,10); }
          }
          html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0">'
            + '<span style="font-size:13px">'+icon+'</span>'
            + '<div style="flex:1;min-width:0;overflow:hidden">'
            + '<div style="font-size:11px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(p.meci||'')+'</div>'
            + '<div style="font-size:10px;color:#818cf8">'+(p.pick||'')+(dateLabel ? ' · <span style="color:#64748b">'+dateLabel+'</span>' : '')+'</div>'
            + '</div>'
            + (p.score ? '<div style="font-size:11px;font-weight:700;color:'+col+';white-space:nowrap">'+p.score+'</div>' : '')
            + '</div>';
        });
        html += '</div>';
      }
    });
  }

  html += '</div>';
  // ── End monitorizare ────────────────────────────────────────────────────────

  html += '</div>';
  root.innerHTML = html;
}

// ============================================================
// MOTOR AI TAB — per-match Gemini predictions
// ============================================================
function renderMotorAITab(){
  var root = document.getElementById('motorai-root');
  if(!root) return;
  var eng = window.AI_MATCH_ENGINE || {};
  var picks = eng.picks || [];
  var generatedAt = eng.generated_at || '';
  var provider = eng.provider || '';
  var matchesAnalyzed = eng.matches_analyzed || 0;

  // Format generated time
  var genStr = '';
  if(generatedAt){
    try{
      var gd = new Date(generatedAt);
      genStr = gd.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    }catch(e){ genStr = generatedAt.slice(0,16).replace('T',' '); }
  }

  var html = '<div style="padding:0 4px">';

  // Header
  var provLabel = provider.indexOf('gemini') !== -1 ? 'Gemini 1.5 Flash' : (provider.indexOf('claude') !== -1 ? 'Claude Haiku' : (provider || 'AI'));
  html += '<div style="background:linear-gradient(135deg,rgba(139,92,246,.12),rgba(43,229,197,.08));border:1px solid rgba(139,92,246,.3);border-radius:16px;padding:16px 18px;margin-bottom:14px">'
    + '<div style="font-size:17px;font-weight:900;color:var(--txt)">⚡ Motor AI — Predicții per Meci</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:4px">'
    + (genStr ? 'Generat ' + genStr : '')
    + (matchesAnalyzed ? ' · ' + matchesAnalyzed + ' meciuri analizate' : '')
    + (provLabel ? ' · ' + provLabel : '')
    + '</div></div>';

  if(!picks.length){
    html += '<div style="text-align:center;padding:60px 20px;color:var(--muted)">'
      + '<div style="font-size:32px;margin-bottom:12px">⚡</div>'
      + '<div style="font-size:15px;font-weight:700;color:var(--txt);margin-bottom:8px">Analiza se generează</div>'
      + '<div style="font-size:13px">Motorul AI rulează la fiecare actualizare de date.<br>Revino după următorul refresh al workflow-ului.</div>'
      + '</div>';
    html += '</div>';
    root.innerHTML = html;
    return;
  }

  // Filter controls (confidence threshold)
  html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:nowrap;align-items:center;overflow-x:auto">'
    + '<span style="font-size:12px;color:var(--muted);white-space:nowrap;flex-shrink:0">Filtrează:</span>'
    + '<button onclick="window._motorAIFilter=0;renderMotorAITab()" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid var(--brd);background:var(--bg2,#0E1424);color:var(--txt);cursor:pointer">Toate ('+picks.length+')</button>'
    + '<button onclick="window._motorAIFilter=70;renderMotorAITab()" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid rgba(43,229,197,.4);background:rgba(43,229,197,.08);color:#2BE5C5;cursor:pointer">≥70% ('+picks.filter(function(p){return(p.incredere||0)>=70;}).length+')</button>'
    + '<button onclick="window._motorAIFilter=80;renderMotorAITab()" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid rgba(34,197,94,.4);background:rgba(34,197,94,.08);color:#22c55e;cursor:pointer">≥80% ('+picks.filter(function(p){return(p.incredere||0)>=80;}).length+')</button>'
    + '</div>';

  var minConf = window._motorAIFilter || 0;
  var filtered = minConf > 0 ? picks.filter(function(p){ return (p.incredere||0) >= minConf; }) : picks;
  // Sort by incredere desc
  filtered = filtered.slice().sort(function(a,b){ return (b.incredere||0)-(a.incredere||0); });

  filtered.forEach(function(p){
    var conf = p.incredere || 0;
    var confColor = conf >= 80 ? '#22c55e' : (conf >= 65 ? '#2BE5C5' : (conf >= 50 ? '#f59e0b' : '#ef4444'));
    var xgStr = (p.xg_home || p.xg_away) ? ('xG '+Number(p.xg_home||0).toFixed(1)+'-'+Number(p.xg_away||0).toFixed(1)) : '';
    var edgeStr = p.edge_pp ? ('+'+Number(p.edge_pp).toFixed(1)+'pp') : '';
    var kickoffStr = '';
    if(p.event_date){
      var _kd = new Date(p.event_date);
      if(isFinite(_kd.getTime())){
        kickoffStr = String(_kd.getDate()).padStart(2,'0')+'.'+String(_kd.getMonth()+1).padStart(2,'0')
          +' · '+String(_kd.getHours()).padStart(2,'0')+':'+String(_kd.getMinutes()).padStart(2,'0');
      }
    }

    html += '<div style="background:var(--bg2,#0E1424);border:1px solid var(--brd);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
      // Top row: confidence + teams
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      + '<div style="min-width:44px;height:44px;border-radius:50%;background:'+confColor+'18;border:2px solid '+confColor+';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      + '<div style="text-align:center"><div style="font-size:13px;font-weight:900;color:'+confColor+'">'+conf+'%</div></div>'
      + '</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:2px">'+htmlEsc(p.home||'')+' vs '+htmlEsc(p.away||'')+'</div>'
      + '<div style="font-size:11px;color:var(--muted)">'+htmlEsc(p.league||'')+(xgStr?' · '+xgStr:'')+(kickoffStr?' · 🕐 '+kickoffStr:'')+'</div>'
      + '</div>'
      + '</div>'
      // Pick row
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:13px;font-weight:800;color:'+confColor+'">'+htmlEsc(p.piata_label||p.piata||'')+'</span>'
      + (p.cota ? '<span style="font-size:12px;font-weight:700;background:'+confColor+'18;border:1px solid '+confColor+'44;color:'+confColor+';padding:2px 8px;border-radius:20px">@'+Number(p.cota).toFixed(2)+'</span>' : '')
      + (edgeStr ? '<span style="font-size:11px;color:#2BE5C5">'+edgeStr+'</span>' : '')
      + '</div>'
      // Motiv
      + (p.motiv ? '<div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic">'+htmlEsc(p.motiv)+'</div>' : '')
      + '</div>';
  });

  if(!filtered.length){
    html += '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px">Niciun meci cu ≥'+minConf+'% încredere.</div>';
  }

  html += '</div>';
  root.innerHTML = html;
}

function renderActiveTab(name, opts){
  opts = opts || {};
  if(name === 'dashboard'){
    markTabRendered('dashboard');
    return;
  }
  if(name === 'meciuri'){
    renderMatchesTab();
    return;
  }
  if(name === 'bilete'){
    renderBilete();
    markTabRendered('bilete');
    return;
  }
  if(name === 'tracking'){
    try { autoSyncTrackingStatuses(); } catch(e){}
    renderTracking();
    markTabRendered('tracking');
    return;
  }
  if(name === 'charts'){
    renderAdvancedCharts();
    markTabRendered('charts');
    return;
  }
  if(name === 'smartbet'){
    try { renderSmartBet(); } catch(e){}
    try { switchSmartLearnSection(window._smartLearnSection || 'predictii'); } catch(e){}
    markTabRendered('smartbet');
    return;
  }
  if(name === 'bankroll'){
    calcBankroll();
    markTabRendered('bankroll');
    return;
  }
  if(name === 'cota2'){
    markTabRendered('cota2');
    return;
  }
  if(name === 'ml5'){
    renderML5Analysis();
    markTabRendered('ml5');
    return;
  }
  if(name === 'claudeai'){
    renderClaudeAITab();
    markTabRendered('claudeai');
    return;
  }
  if(name === 'motorai'){
    renderMotorAITab();
    markTabRendered('motorai');
    return;
  }
  if(name === 'statistici'){
    if(typeof renderStatisticiTab === 'function') renderStatisticiTab();
    markTabRendered('statistici');
    return;
  }
  if(name === 'stats-meciuri'){
    if(typeof window.renderStatsMeciuri === 'function'){
      window.renderStatsMeciuri();
      /* retry once after data settles, in case MATCHES_FILTERED_CACHE wasn't ready */
      setTimeout(function(){ if(typeof window.renderStatsMeciuri==='function') window.renderStatsMeciuri(); }, 600);
    }
    markTabRendered('stats-meciuri');
    return;
  }
}
function prefetchNonCriticalTabData(){
  if(NONCRITICAL_PREFETCH_STARTED) return;
  NONCRITICAL_PREFETCH_STARTED = true;
  scheduleIdleTask(function(){
    loadLazyDataset('recommendationLog').catch(function(err){ console.warn('[Prefetch] recommendationLog failed', err); });
  }, 2200);
  scheduleIdleTask(function(){
    loadLazyDataset('historyEngine').catch(function(err){ console.warn('[Prefetch] historyEngine failed', err); });
  }, 3400);
  scheduleIdleTask(function(){
    ensureArchiveSummaryData().catch(function(err){ console.warn('[Prefetch] archiveSummary failed', err); });
  }, 4200);
  // Preîncarcă full-history.js în background — populează decoratorii din meniu automat
  scheduleIdleTask(function(){
    ensureFullHistoryAssets().catch(function(err){ console.warn('[Prefetch] fullHistory failed', err); });
  }, 6000);
}
function switchTab(name){
  if(name==='istoricfull' || name==='apihistory' || name==='traininglab'){
    if(!LAZY_DATA_READY.fullHistoryAssets){
      ensureFullHistoryAssets().then(function(){
        switchTab(name);
      }).catch(function(err){
        console.warn('[LazyData] full history assets failed', err);
        toast('Nu am putut încărca baza extinsă.', 'warn');
      });
      return;
    }
  }
  document.querySelectorAll('.tab-content').forEach(function(el){ el.classList.remove('active'); });
  var _tabEl = $('tab-'+name);
  if(!_tabEl){ console.warn('[switchTab] tab not found:', name); return; }
  _tabEl.classList.add('active');
  closeDesktopMore(true);
  closeMobileMore();
  setDesktopTabActive(name);
  setMobileNavActive(name);
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  if(name==='audit'){ switchTab('smartbet'); switchSmartLearnSection('predictii'); return; }
  if(name==='aimemory'){ switchTab('smartbet'); switchSmartLearnSection('predictii'); return; }
  renderActiveTab(name, { deferDashboardSecondary: name === 'dashboard' });
  renderTicketQuickPeek();
  ensureTabData(name).then(function(){
    if(getCurrentActiveTabName() !== name) return;
    rerenderTabAfterLazyLoad(name);
  }).catch(function(err){
    console.warn('[LazyData] failed for tab', name, err);
  });
}

// ============================================================
// CORE ENGINE — VALUE BET ANALYSIS
// ============================================================
var BET_TYPES = [
  {key:'over15',   label:'Over 1.5G',    probField:'prob_over_15',   oddsField:'odds_over_15'},
  {key:'over25',   label:'Over 2.5G',    probField:'prob_over_25',   oddsField:'odds_over_25'},
  {key:'under35',  label:'Under 3.5G',   probField:'prob_under_35',  oddsField:'odds_under_35', probGetter:function(raw){ return 100 - safePct(raw.prob_over_35); }},
  {key:'btts',     label:'BTTS',         probField:'prob_btts_yes',  oddsField:'odds_btts_yes'},
  {key:'homeWin',  label:'1 (Acasă)',    probGetter:function(raw){ return safePct(raw.prob_home_win); }, oddsGetter:function(e){ return Number(e.odds_home || 0); }},
  // Double Chance markets: odds calculated from 1X2 (margin is minimal on DC)
  {key:'dc1x',     label:'Șansă Dublă 1X', probGetter:function(raw){ return safePct(raw.prob_home_win) + safePct(raw.prob_draw); }, oddsGetter:function(e){ var h=Number(e.odds_home||0), d=Number(e.odds_draw||0); if(h<1.01||d<1.01) return 0; return +(1/(1/h + 1/d)).toFixed(2); }},
  {key:'dcx2',     label:'Șansă Dublă X2', probGetter:function(raw){ return safePct(raw.prob_away_win) + safePct(raw.prob_draw); }, oddsGetter:function(e){ var d=Number(e.odds_draw||0), a=Number(e.odds_away||0); if(d<1.01||a<1.01) return 0; return +(1/(1/d + 1/a)).toFixed(2); }},
  {key:'dc12',     label:'Șansă Dublă 12', probGetter:function(raw){ return safePct(raw.prob_home_win) + safePct(raw.prob_away_win); }, oddsField:'odds_dc_12'},
];

function getSupportedMarketTypes(){
  return ['over15','over25','under35','btts','homeWin','dc1x','dcx2','dc12'];
}

function isSaneOddsForType(type, odds){
  var o = Number(odds || 0);
  if(!isFinite(o) || o < 1.01) return false;
  if(type === 'over15') return o <= 2.20;
  if(type === 'under15') return o <= 8.00;
  if(type === 'over25' || type === 'under25' || type === 'btts') return o <= 4.50;
  if(type === 'under35') return o <= 2.60;
  if(type === 'homeWin' || type === 'awayWin' || type === 'draw') return o <= 12.00;
  if(type === 'dc1x' || type === 'dcx2' || type === 'dc12') return o >= 1.05 && o <= 2.50;
  return o <= 20.00;
}

function normalizeConfidence(conf){
  var c = Number(conf || 0);
  if(!isFinite(c) || c < 0) return 0;
  if(c <= 1) return c * 100;
  if(c <= 100) return c;
  return 100;
}
function safePct(v){
  var n = Number(v || 0);
  if(!isFinite(n) || n < 0) return 0;
  if(n > 100) return 100;
  return n;
}
function factorial(n){
  var num = Math.max(0, Math.floor(Number(n || 0)));
  if(num <= 1) return 1;
  var out = 1;
  for(var i = 2; i <= num; i++) out *= i;
  return out;
}
function poissonProbability(lambda, k){
  var l = Math.max(0, Number(lambda || 0));
  var goalCount = Math.max(0, Math.floor(Number(k || 0)));
  return (Math.pow(l, goalCount) * Math.exp(-l)) / factorial(goalCount);
}
function poissonCdf(lambda, maxGoals){
  var cutoff = Math.max(0, Math.floor(Number(maxGoals || 0)));
  var total = 0;
  for(var i = 0; i <= cutoff; i++) total += poissonProbability(lambda, i);
  return total;
}
function calculatePoissonOverProbability(homeLambda, awayLambda, threshold){
  var totalLambda = Math.max(0, Number(homeLambda || 0)) + Math.max(0, Number(awayLambda || 0));
  return safePct((1 - poissonCdf(totalLambda, threshold)) * 100);
}
function calculatePoissonUnderProbability(homeLambda, awayLambda, threshold){
  var totalLambda = Math.max(0, Number(homeLambda || 0)) + Math.max(0, Number(awayLambda || 0));
  return safePct(poissonCdf(totalLambda, threshold) * 100);
}
function calculatePoissonBttsProbability(homeLambda, awayLambda){
  var h = Math.max(0, Number(homeLambda || 0));
  var a = Math.max(0, Number(awayLambda || 0));
  var prob = 1 - Math.exp(-h) - Math.exp(-a) + Math.exp(-(h + a));
  return safePct(prob * 100);
}
function buildPoissonMetrics(raw){
  if(!raw) return null;
  if(raw.__poissonMetrics) return raw.__poissonMetrics;
  var homeLambda = Math.max(0, Number(raw.expected_home_goals || 0));
  var awayLambda = Math.max(0, Number(raw.expected_away_goals || 0));
  var totalLambda = homeLambda + awayLambda;
  if(!(totalLambda > 0)){
    raw.__poissonMetrics = null;
    return null;
  }
  raw.__poissonMetrics = {
    homeLambda: +homeLambda.toFixed(4),
    awayLambda: +awayLambda.toFixed(4),
    totalLambda: +totalLambda.toFixed(4),
    over15: +calculatePoissonOverProbability(homeLambda, awayLambda, 1.5).toFixed(2),
    under15: +calculatePoissonUnderProbability(homeLambda, awayLambda, 1.5).toFixed(2),
    over25: +calculatePoissonOverProbability(homeLambda, awayLambda, 2.5).toFixed(2),
    under25: +calculatePoissonUnderProbability(homeLambda, awayLambda, 2.5).toFixed(2),
    under35: +calculatePoissonUnderProbability(homeLambda, awayLambda, 3.5).toFixed(2),
    btts: +calculatePoissonBttsProbability(homeLambda, awayLambda).toFixed(2)
  };
  return raw.__poissonMetrics;
}
function getApiProbForMarket(raw, marketKey){
  if(marketKey === 'homeWin') return safePct(raw.prob_home_win);
  if(marketKey === 'draw') return safePct(raw.prob_draw);
  if(marketKey === 'awayWin') return safePct(raw.prob_away_win);
  if(marketKey === 'over15') return safePct(raw.prob_over_15);
  if(marketKey === 'under15') return 100 - safePct(raw.prob_over_15);
  if(marketKey === 'over25') return safePct(raw.prob_over_25);
  if(marketKey === 'under25') return 100 - safePct(raw.prob_over_25);
  if(marketKey === 'under35') return 100 - safePct(raw.prob_over_35);
  if(marketKey === 'btts') return safePct(raw.prob_btts_yes);
  if(marketKey === 'dc1x') return safePct(raw.prob_home_win) + safePct(raw.prob_draw);
  if(marketKey === 'dcx2') return safePct(raw.prob_away_win) + safePct(raw.prob_draw);
  if(marketKey === 'dc12') return safePct(raw.prob_home_win) + safePct(raw.prob_away_win);
  return 0;
}
function getPoissonProbForMarket(metrics, marketKey){
  if(!metrics) return null;
  if(marketKey === 'over15') return metrics.over15;
  if(marketKey === 'under15') return metrics.under15;
  if(marketKey === 'over25') return metrics.over25;
  if(marketKey === 'under25') return metrics.under25;
  if(marketKey === 'under35') return metrics.under35;
  if(marketKey === 'btts') return metrics.btts;
  return null;
}
function buildHybridProbForMarket(raw, marketKey){
  if(!raw) return { apiProb:0, poissonProb:null, effectiveProb:0, delta:null, alert:false, direction:'flat', totalLambda:null };
  raw.__hybridProbCache = raw.__hybridProbCache || {};
  if(raw.__hybridProbCache[marketKey]) return raw.__hybridProbCache[marketKey];
  var apiProb = safePct(getApiProbForMarket(raw, marketKey));
  var poisson = buildPoissonMetrics(raw);
  var poissonProb = getPoissonProbForMarket(poisson, marketKey);
  var effectiveProb = apiProb;
  var delta = null;
  var alert = false;
  var direction = 'flat';
  if(poissonProb != null){
    delta = +(poissonProb - apiProb).toFixed(2);
    alert = Math.abs(delta) > 5;
    var apiWeight = alert ? 0.55 : 0.72;
    var poissonWeight = 1 - apiWeight;
    effectiveProb = +((apiProb * apiWeight) + (poissonProb * poissonWeight)).toFixed(2);
    if(delta > 5) direction = 'value';
    else if(delta < -5) direction = 'risk';
  }
  // Injury adjustment (pre-calibration: corecteaza pentru un factor pe care modelul nu-l vede)
  var injury = {adjustment:0, applied:false, home:0, away:0, summary:''};
  try { injury = calcInjuryAdjustment(raw, marketKey) || injury; } catch(e){}
  var preCalibrationProb = effectiveProb;
  if(injury && injury.applied && injury.adjustment){
    effectiveProb = +Math.max(1, Math.min(99, effectiveProb + Number(injury.adjustment))).toFixed(2);
  }
  // Calibration (DOAR informatie de diagnostic — nu modifica effectiveProb)
  // Calibrarea bucket-based elimina diferentierea inter-meci si distruge ranking-ul EV.
  // O mentinem pentru vizibilitate in tab-ul Motor Invatare + ca posibil ajustaj la scor,
  // dar nu altereaza probabilitatea folosita in calcValue/calcSmartScore.
  var calibratedProb = null;
  try { calibratedProb = calibrateProb(effectiveProb, marketKey); } catch(e){}
  var calibrationDelta = null;
  if(calibratedProb != null && isFinite(calibratedProb)){
    calibrationDelta = +(calibratedProb - effectiveProb).toFixed(2);
    // NU aplicam calibratedProb pe effectiveProb — pastram doar delta ca informatie
  }
  raw.__hybridProbCache[marketKey] = {
    apiProb: +apiProb.toFixed(2),
    poissonProb: poissonProb != null ? +Number(poissonProb).toFixed(2) : null,
    effectiveProb: +effectiveProb.toFixed(2),
    delta: delta,
    alert: alert,
    direction: direction,
    totalLambda: poisson ? poisson.totalLambda : null,
    homeLambda: poisson ? poisson.homeLambda : null,
    awayLambda: poisson ? poisson.awayLambda : null,
    preCalibrationProb: +preCalibrationProb.toFixed(2),
    injuryAdjustment: injury.adjustment || 0,
    injuryApplied: !!injury.applied,
    injurySummary: injury.summary || '',
    injuryHome: injury.home || 0,
    injuryAway: injury.away || 0,
    calibrationDelta: calibrationDelta
  };
  return raw.__hybridProbCache[marketKey];
}
function calcValue(prob, odds){
  var p = safePct(prob);
  var o = Number(odds || 0);
  if(!o || o < 1.01) return -999;
  return ((p / 100) * o) - 1;
}
function getBacktestRows(key){
  if(!BACKTEST_SUMMARY || !BACKTEST_SUMMARY[key] || !Array.isArray(BACKTEST_SUMMARY[key])) return [];
  return BACKTEST_SUMMARY[key];
}
function findBacktestRow(key, value){
  if(!value) return null;
  return getBacktestRows(key).find(function(r){ return String((r && r.key) || '') === String(value); }) || null;
}
function getOddsBucketLabel(odds){
  var o = Number(odds || 0);
  if(o <= 1.25) return '1.10-1.25';
  if(o <= 1.45) return '1.26-1.45';
  if(o <= 1.70) return '1.46-1.70';
  if(o <= 2.10) return '1.71-2.10';
  return '2.10+';
}
function getLeagueTierInfo(leagueName){
  var row = findBacktestRow('by_league', leagueName) || {};
  var bets = Number(row.bets || 0);
  var roi = Number(row.roi || 0);
  var winrate = Number(row.winrate || 0);
  if(bets >= 5 && roi >= 12 && winrate >= 70) return { tier:'high', label:'Tier 1', multiplier:1.03 };
  if(bets >= 5 && roi <= -5) return { tier:'avoid', label:'Tier 3', multiplier:0.96 };
  return { tier:'neutral', label:'Tier 2', multiplier:1.0 };
}
function getMarketBacktestMultiplier(type){
  var labelMap = { over15:'Over 1.5G', over25:'Over 2.5G', under35:'Under 3.5G', btts:'BTTS' };
  var row = findBacktestRow('by_market', labelMap[type] || type) || {};
  var bets = Number(row.bets || 0);
  var roi = Number(row.roi || 0);
  var winrate = Number(row.winrate || 0);
  if(bets < 4) return 1.0;
  if(roi >= 8 && winrate >= 72) return 1.02;
  if(roi <= -4) return 0.97;
  return 1.0;
}
function getOddsBucketMultiplier(odds){
  var row = findBacktestRow('by_odds_bucket', getOddsBucketLabel(odds)) || {};
  var bets = Number(row.bets || 0);
  var roi = Number(row.roi || 0);
  if(bets < 4) return 1.0;
  if(roi >= 8) return 1.01;
  if(roi <= -4) return 0.98;
  return 1.0;
}
function calcAdjustedProb(prob, confidence, leagueName, marketKey, odds){
  var p = safePct(prob);
  var c = normalizeConfidence(confidence);
  var factor = 0.93 + (c / 100) * 0.07;
  factor *= getLeagueTierInfo(leagueName).multiplier;
  factor *= getMarketBacktestMultiplier(marketKey);
  factor *= getOddsBucketMultiplier(odds);
  factor = Math.max(0.86, Math.min(1.08, factor));
  // V17 FIX: clip absolute deviation to ±5pp (Adjusted strong bucket was -2.60% ROI @ 87 bets)
  var raw = p * factor;
  var delta = Math.max(-5, Math.min(5, raw - p));
  return +(p + delta).toFixed(2);
}
function oddsInRanges(odds, ranges){
  var o = Number(odds || 0);
  return (ranges || []).some(function(range){ return o >= range[0] && o <= range[1]; });
}

var _MARKET_THRESHOLDS_CACHE = null;

function getMarketThresholds() {
  if (_MARKET_THRESHOLDS_CACHE) return _MARKET_THRESHOLDS_CACHE;
  _MARKET_THRESHOLDS_CACHE = (MODEL_BENCHMARKS && MODEL_BENCHMARKS.dynamic_thresholds) || {};
  return _MARKET_THRESHOLDS_CACHE;
}

var EDGE_FALLBACK = { over15: 10.0, under35: 15.0, over25: 3.0, btts: 5.0 };
function getMarketMinEdge(marketKey) {
  // Safety floor: dynamic_thresholds poate coborî prea mult pragul când un bucket are ROI marginal.
  var HARD_EDGE_FLOORS = { under35: 8.0, over15: 10.0, over25: 5.0, btts: 5.0 };
  var hardFloor = HARD_EDGE_FLOORS[marketKey] != null ? HARD_EDGE_FLOORS[marketKey] : 0;
  var t = getMarketThresholds()[marketKey];
  var edge = EDGE_FALLBACK[marketKey] != null ? EDGE_FALLBACK[marketKey] : 3.0;
  if (t && !t.disabled && typeof t.min_edge === 'number'){
    // Bootstrap activ: bucketul profitabil are date insuficiente (n < bootstrap_target_n).
    // Folosim bootstrap_min_edge doar dacă nu coboară sub safety floor.
    if(typeof t.bootstrap_min_edge === 'number' && t.bootstrap_min_edge > 0){
      edge = t.bootstrap_min_edge;
    } else {
      edge = t.min_edge;
    }
  }
  return Math.max(hardFloor, Number(edge || 0));
}
function isMarketDisabled(marketKey) {
  var t = getMarketThresholds()[marketKey];
  return t && t.disabled === true;
}

function getBenchmarkData(marketKey, edgePct) {
  try {
    var bt = MODEL_BENCHMARKS && MODEL_BENCHMARKS.real_backtest;
    if (!bt || !bt.by_market) return null;
    var mktStats = bt.by_market[marketKey];
    var mktRoi   = mktStats ? Number(mktStats.roi_pct || 0) : null;
    var mktN     = mktStats ? Number(mktStats.n || 0) : 0;
    var edge = Number(edgePct || 0);
    var bucketKey = '', bucketStats = null;
    var mktBuckets = bt.by_market_bucket && bt.by_market_bucket[marketKey];
    var src = mktBuckets || bt.by_edge_bucket || {};
    if (edge < 5)        { bucketKey = '0-5%';   bucketStats = src['0-5%'];   }
    else if (edge < 10)  { bucketKey = '5-10%';  bucketStats = src['5-10%'];  }
    else if (edge < 15)  { bucketKey = '10-15%'; bucketStats = src['10-15%']; }
    else                 { bucketKey = '15%+';   bucketStats = src['15%+'];   }
    var bucketRoi = bucketStats ? Number(bucketStats.roi_pct || 0) : null;
    var bucketN   = bucketStats ? Number(bucketStats.n || 0) : 0;
    return {
      mktRoi: mktRoi, mktN: mktN,
      bucketKey: bucketKey, bucketRoi: bucketRoi, bucketN: bucketN,
      edgeBad: bucketRoi !== null && bucketN >= 5 && bucketRoi < 0
    };
  } catch(e) { return null; }
}

function getBenchmarkRow(marketKey, edgePct) {
  var d = getBenchmarkData(marketKey, edgePct);
  if (!d) return '';
  if (d.mktRoi === null && d.bucketRoi === null) return '';
  var isBad  = d.edgeBad;
  var bg     = isBad ? 'rgba(239,68,68,.10)'  : 'rgba(16,185,129,.08)';
  var border = isBad ? 'rgba(239,68,68,.28)'  : 'rgba(16,185,129,.22)';
  var icon   = isBad ? '\u26a0\ufe0f' : '\ud83d\udcca';
  var mktStr = '';
  if (d.mktRoi !== null && d.mktN >= 20) {
    var mc = d.mktRoi >= 3 ? '#22c55e' : d.mktRoi >= 0 ? '#f59e0b' : '#ef4444';
    mktStr = 'BT <b style="color:' + mc + '">' + (d.mktRoi >= 0 ? '+' : '') + d.mktRoi.toFixed(1) + '%</b>';
  }
  var bucketStr = '';
  if (d.bucketRoi !== null && d.bucketN >= 5) {
    var bc  = d.bucketRoi >= 3 ? '#22c55e' : d.bucketRoi >= 0 ? '#f59e0b' : '#ef4444';
    var suf = isBad ? ' <b style="color:#ef4444">\u26a0 evita</b>' : ' <span style="color:#22c55e">\u2713</span>';
    bucketStr = d.bucketKey + ' <b style="color:' + bc + '">' + (d.bucketRoi >= 0 ? '+' : '') + d.bucketRoi.toFixed(1) + '%</b>' + suf;
  }
  var inner = [mktStr, bucketStr].filter(Boolean).join('<span style="color:rgba(255,255,255,.2);margin:0 5px">&bull;</span>');
  return '<div style="margin-top:6px;padding:5px 10px;border-radius:8px;background:' + bg + ';border:1px solid ' + border + ';font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + icon + ' ' + inner + '</div>';
}

function benchmarkEdgeIsBad(marketKey, edgePct) {
  var d = getBenchmarkData(marketKey, edgePct);
  return d ? d.edgeBad : false;
}

function getBetVerdict(match, bet) {
  if (!bet) return null;
  var mkeyRaw = String(bet.type || bet.marketKey || '');
  var mkey    = mkeyRaw.toLowerCase();
  var edgePct = Number(bet.edgePct || 0);
  var adjProb = Number(bet.adjProb || 0);
  var value   = Number(bet.value   || 0);
  var odds    = Number(bet.odds || bet.bestOdds || bet.baseOdds || 0);
  var bd      = getBenchmarkData(mkeyRaw, edgePct) || getBenchmarkData(mkey, edgePct);
  var btBad   = bd ? bd.edgeBad : false;
  var btMktOk = bd && bd.mktRoi !== null && bd.mktN >= 20 && bd.mktRoi >= 0;
  var bucketOk= bd && bd.bucketRoi !== null && bd.bucketN >= 5 && bd.bucketRoi >= 3;

  var consensusFlag = String(bet.consensusFlag || bet.oddsConsensusFlag || (match && match.consensusFlag) || '').toUpperCase();
  var marketText = [
    bet.consensusFlag, bet.oddsConsensusFlag, bet.marketFlag, bet.marketSignal, bet.marketLabel,
    bet.why, bet.reason, bet.note, match && match.marketFlag, match && match.marketSignal, match && match.why
  ].filter(Boolean).join(' ').toLowerCase();
  var isAgainstMarket = !!(
    bet.againstMarket === true || bet.isAgainstMarket === true ||
    consensusFlag === 'AGAINST_MARKET' || consensusFlag === 'CONTRA_PIETEI' ||
    marketText.indexOf('against_market') !== -1 ||
    marketText.indexOf('against market') !== -1 ||
    marketText.indexOf('contra pie') !== -1 ||
    marketText.indexOf('contra piet') !== -1
  );
  var books = Number(bet.bookmakersCount || bet.polymarketBookmakersCount || (match && match.polymarketBookmakersCount) || (match && match.bookmakersCount) || 0);
  var lowBooks = consensusFlag === 'LOW_BOOKS' || (books > 0 && books < 6);
  var isolatedOdds = consensusFlag === 'ISOLATED_ODDS';
  var weakConsensus = consensusFlag === 'WEAK_CONSENSUS';

  var cb = String((match && match.catboostSignal) || bet.catboostSignal || '').toUpperCase();
  var cbPositive = cb.indexOf('BUY') !== -1 || cb === 'WATCH';
  var cbNegative = cb === 'SELL' || cb === 'AVOID' || cb === 'NO BUY';

  var likely = match ? parseLikelyScore(match.mostLikelyScore) : null;
  var xgTotal = Number((match && match.xgTotal) || 0);
  var whyText = String((match && match.why) || bet.trainingReason || (match && match.rationale) || '').toLowerCase();
  var underControlled = mkey === 'under35' && (
    whyText.indexOf('xg total controlat') !== -1 ||
    (xgTotal > 0 && xgTotal <= 2.85) ||
    (likely && likely.total <= 3)
  );
  var overControlled = (mkey === 'over15' || mkey === 'over25') && (xgTotal >= (mkey === 'over15' ? 2.05 : 2.35));
  var marketFitOk = underControlled || overControlled || btMktOk || bucketOk || cbPositive;

  var playerRisk = Number((match && (match.playerAvailabilityRisk != null ? match.playerAvailabilityRisk : match.player_availability_risk)) || 0);
  var totalContextRisk = playerRisk + Number((match && match.contextRisk) || 0) + Number((match && match.lineupRisk) || 0);

  function verdict(state, label, sub, color, bg, border, score){
    return { state:state, label:label, sub:sub, bg:bg, border:border, color:color, score:score || 0 };
  }
  function avoid(sub, score){
    return verdict('avoid', '⚠️ Prezintă risc', sub || 'Risc peste prag', '#f97316', 'rgba(249,115,22,.10)', 'rgba(249,115,22,.30)', score || 0);
  }
  function watch(sub, score){
    return verdict('watch', '👀 WATCH', sub || 'Semnal bun, dar cu avertisment', '#f59e0b', 'rgba(245,158,11,.10)', 'rgba(245,158,11,.32)', score || 2);
  }
  function markBet(sub, score){
    return verdict('bet', '✅ PARIAZA', sub || 'Semnal curat', '#22c55e', 'rgba(16,185,129,.12)', 'rgba(16,185,129,.34)', score || 4);
  }

  // v7: Praguri ridicate pentru PARIAZA. Cerință minimă: prob ≥83, edge ≥7, value ≥0.02
  // Hard-stop: probabilitate mică, EV negativ, cotă invalidă sau contradicție reală.
  var minProbHard = mkey === 'under35' ? 72 : (mkey === 'over15' ? 74 : 62);
  if (adjProb < minProbHard) return avoid('Probabilitate prea mică (' + adjProb.toFixed(1) + '%)', 0);
  if (value <= 0) return avoid('EV/value negativ', 0);
  if (odds && (odds < 1.10 || odds > 3.20)) return avoid('Cotă în afara profilului', 0);
  if (cbNegative && adjProb < 90) return avoid('CatBoost contra', 0);
  if (totalContextRisk >= 0.42 && adjProb < 90) return avoid('Risc context/jucători mare', 0);
  if (btBad && !(adjProb >= 88 && edgePct >= 10 && value >= 0.05 && (cbPositive || marketFitOk))) {
    return avoid('Backtest edge negativ', 0);
  }

  // Avertismente de piață: nu le marcăm PARIAZĂ, dar nu le ascundem ca EVITĂ când cifrele sunt bune.
  if (isAgainstMarket) {
    if (adjProb >= 82 && edgePct >= 5 && value > 0) return watch('Contra pieței — doar value/stake redus', 2);
    return avoid('Contra pieței', 0);
  }
  if (isolatedOdds) {
    if (adjProb >= 85 && edgePct >= 7 && value >= 0.03) return watch('Cotă izolată — confirmă manual', 2);
    return avoid('Cotă izolată', 0);
  }
  if (lowBooks) {
    if (adjProb >= 84 && edgePct >= 7 && value >= 0.03) return watch('Puțini bookmakeri — nu e OK safe', 2);
    return avoid('Puțini bookmakeri', 0);
  }

  // v7: PARIAZA necesită prob ≥85 sau (prob ≥83 + edge ≥8). Threshold ridicat față de v6.
  var strongSafe = adjProb >= 90 && edgePct >= 7 && value >= 0.018 && marketFitOk && !weakConsensus;
  var solidSafe  = adjProb >= 82 && edgePct >= 8 && value >= 0.018 && (cbPositive || marketFitOk);
  var cleanCommon = !isAgainstMarket && !lowBooks && !isolatedOdds && !cbNegative;

  if (cleanCommon && (strongSafe || solidSafe)) {
    var subParts = [];
    if (adjProb >= 90) subParts.push('prob ≥90%'); else subParts.push('prob ≥85%');
    if (cbPositive) subParts.push('CB confirmă');
    if (underControlled) subParts.push('xG controlat');
    if (weakConsensus) subParts.push('consens slab');
    return markBet(subParts.join(' • '), 5);
  }

  // v7: WATCH necesită prob ≥80 (era 82) + edge ≥5 (era 4)
  if (adjProb >= 80 && edgePct >= 5 && value >= 0.01) {
    if (weakConsensus) return watch('Edge/consens slab — urmărește cota', 3);
    if (playerRisk >= 0.25) return watch('Risc jucători — stake redus', 3);
    if (!marketFitOk) return watch('Lipsește confirmare xG/BT/CB', 3);
    return watch('Aproape OK — cere confirmare', 3);
  }

  // Fallback pe semnalele vechi, dar fără să suprascriem regulile de piață de mai sus.
  var edgeSig, valueSig, edgeBonusSig;
  if (mkey === 'under35') { edgeSig = 6; valueSig = 0.01; edgeBonusSig = 8; }
  else if (mkey === 'over15') { edgeSig = 7; valueSig = 0.02; edgeBonusSig = 9; }
  else if (mkey === 'over25') { edgeSig = 8; valueSig = 0.03; edgeBonusSig = 11; }
  else if (mkey === 'btts') { edgeSig = 7; valueSig = 0.03; edgeBonusSig = 10; }
  else { edgeSig = 9; valueSig = 0.04; edgeBonusSig = 12; }

  var signals = 0;
  if (edgePct >= edgeSig)  signals++;
  if (value  >= valueSig)  signals++;
  if (adjProb >= 75)       signals++;
  if (btMktOk)             signals++;
  if (bucketOk)            signals++;

  if (signals >= 4 && adjProb >= 80) return markBet('Semnale pozitive (' + signals + '/5)', signals);
  if (signals >= 3 && edgePct >= edgeBonusSig && adjProb >= 78) return watch(signals + '/5 semnale + edge solid', signals);
  if (signals >= 2) return watch(signals + '/5 semnale — mixt', signals);
  return avoid('Semnale insuficiente (' + signals + '/5)', signals);
}


function getBettingCommonOkProfile(match, bet) {
  if (!match || !bet) return { ok:false, reason:'fără selecție' };
  if (match.analysisState !== 'ELIGIBLE') return { ok:false, reason:'meci neeligibil' };

  var verdict = getBetVerdict(match, bet);
  if (!verdict || verdict.state !== 'bet') return { ok:false, reason:'nu are verdict PARIAZĂ' };

  var prob  = Number(bet.adjProb || bet.prob || 0);
  var edge  = Number(bet.edgePct || 0);
  var value = Number(bet.value || 0);
  var odds  = Number(bet.odds || bet.baseOdds || bet.bestOdds || 0);
  var score = Number(match.smartScore || bet.score || 0);
  var kelly = Number(bet.kellyPct || bet.kelly_pct || bet.kellyQuarterPct || 0);
  var market = String(bet.type || bet.marketKey || '').toLowerCase();
  var tier = String(match.leagueTier || 'neutral').toLowerCase();
  var risk = String(match.riskTier || bet.riskTier || '').toLowerCase();
  var books = Number(bet.bookmakersCount || bet.polymarketBookmakersCount || match.polymarketBookmakersCount || 0);
  var cb = String(match.catboostSignal || bet.catboostSignal || '').toUpperCase();
  var consensusFlag = String(bet.consensusFlag || bet.oddsConsensusFlag || match.consensusFlag || '').toUpperCase();
  var marketText = [
    bet.consensusFlag, bet.oddsConsensusFlag, bet.marketFlag, bet.marketSignal, bet.marketLabel,
    bet.why, bet.reason, bet.note, match.marketFlag, match.marketSignal, match.why
  ].filter(Boolean).join(' ').toLowerCase();
  var isAgainstMarket = !!(
    bet.againstMarket === true || bet.isAgainstMarket === true ||
    consensusFlag === 'AGAINST_MARKET' || consensusFlag === 'CONTRA_PIETEI' ||
    marketText.indexOf('against_market') !== -1 ||
    marketText.indexOf('against market') !== -1 ||
    marketText.indexOf('contra pie') !== -1 ||
    marketText.indexOf('contra piet') !== -1
  );

  // Praguri comune pentru un pick pe care merită să-l vezi separat:
  // 1) deja a trecut verdictul final PARIAZĂ; 2) probabilitate mare;
  // 3) edge/value real; 4) cotă jucabilă; 5) fără risc evident de ligă/profil.
  if (prob < 80) return { ok:false, reason:'probabilitate sub 80%' };
  if (edge < 3) return { ok:false, reason:'edge sub 3pp' };
  if (value < 0.005) return { ok:false, reason:'value sub 0.5%' };
  if (odds && (odds < 1.15 || odds > 2.40)) return { ok:false, reason:'cotă în afara zonei comune' };
  if (consensusFlag === 'LOW_BOOKS') return { ok:false, reason:'puțini bookmakeri' };
  if (consensusFlag === 'ISOLATED_ODDS') return { ok:false, reason:'cotă izolată' };
  if (consensusFlag === 'WEAK_CONSENSUS') return { ok:false, reason:'edge/consens slab' };
  var playerRiskOk = Number(match.playerAvailabilityRisk || match.player_availability_risk || 0);
  if (playerRiskOk >= 0.25) return { ok:false, reason:'risc jucători' };
  if (tier === 'avoid' && score < 88) return { ok:false, reason:'ligă slabă fără scor suficient' };
  if (risk === 'avoid') return { ok:false, reason:'risk tier avoid' };
  if (kelly && kelly > 8) return { ok:false, reason:'Kelly prea agresiv' };
  if (books && books < 6 && score < 90) return { ok:false, reason:'consens piață slab' };
  if (isAgainstMarket) return { ok:false, reason:'contra pieței' };
  if (cb === 'SELL' || cb === 'AVOID') return { ok:false, reason:'CatBoost contra' };

  var tags = [];
  tags.push('PARIAZĂ');
  tags.push('Prob ' + prob.toFixed(1) + '%');
  tags.push('Edge +' + edge.toFixed(1) + 'pp');
  if (value) tags.push('Value +' + (value * 100).toFixed(1) + '%');
  if (books) tags.push(books + ' case');
  if (market) tags.push(market);
  return { ok:true, reason:tags.join(' • '), prob:prob, edge:edge, value:value, odds:odds, score:score };
}

function isBettingCommonOkMatch(match, bet) {
  return getBettingCommonOkProfile(match, bet).ok === true;
}

function getVerdictPill(match, bet) {
  var v = getBetVerdict(match, bet);
  if (!v) return '';
  return '<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;background:' + v.bg + ';border:1px solid ' + v.border + ';font-size:12px;font-weight:800;color:' + v.color + '">' + v.label + '</div>';
}

function buildAnalysisSection(title, content, extraClass) {
  if (!content) return '';
  return '<section class="analysis-detail-section' + (extraClass ? ' ' + extraClass : '') + '">' +
    (title ? '<div class="analysis-detail-title">' + title + '</div>' : '') +
    '<div class="analysis-detail-body">' + content + '</div>' +
  '</section>';
}

function getVerdictBlock(match, bet) {
  var v = getBetVerdict(match, bet);
  if (!v) return '';
  var bd      = bet ? getBenchmarkData(String(bet.type || bet.marketKey || ''), Number(bet.edgePct || 0)) : null;
  var edgePct = Number((bet || {}).edgePct || 0);
  var adjProb = Number((bet || {}).adjProb || 0);
  var value   = Number((bet || {}).value   || 0);
  var rows = [
    { label:'Edge', ok: edgePct >= 10, val: (edgePct>=0?'+':'') + edgePct.toFixed(1) + 'pp',  note: edgePct >= 10 ? '>= 10pp' : edgePct >= 8 ? 'la limită' : '< 8pp' },
    { label:'Value', ok: value  >= 0.05, val: (value>=0?'+':'') + (value*100).toFixed(1) + '%', note: value >= 0.05 ? '>= 5%' : '< 5%' },
    { label:'Probabilitate', ok: adjProb>= 75,  val: adjProb.toFixed(1) + '%', note: adjProb >= 75 ? '>= 75%' : '< 75%' },
    { label:'BT piață', ok: bd && bd.mktRoi !== null && bd.mktRoi >= 0,
      val:  bd && bd.mktRoi !== null ? (bd.mktRoi>=0?'+':'')  + bd.mktRoi.toFixed(1)  + '%' : 'N/A',
      note: bd && bd.mktRoi  !== null && bd.mktRoi  >= 0 ? 'profitabil' : 'negativ' },
    { label:'BT edge bucket', ok: bd && bd.bucketRoi !== null && bd.bucketRoi >= 3,
      val:  bd && bd.bucketRoi !== null ? (bd.bucketRoi>=0?'+':'') + bd.bucketRoi.toFixed(1) + '%' : 'N/A',
      note: bd && bd.bucketRoi !== null && bd.bucketRoi >= 3 ? '>= 3%' : bd && bd.bucketRoi !== null && bd.bucketRoi >= 0 ? 'marginală' : 'negativ' },
    { label:'Motor', ok: !benchmarkEdgeIsBad(String((bet||{}).type||(bet||{}).marketKey||''), edgePct),
      val:'', note: !benchmarkEdgeIsBad(String((bet||{}).type||(bet||{}).marketKey||''), edgePct) ? 'OK' : 'conflict' }
  ];
  var stateClass = v.state === 'bet' ? 'bet' : ((v.state === 'risk' || v.state === 'watch') ? 'risk' : 'avoid');
  var rowsHtml = rows.map(function(r) {
    return '<div class="verdict-row ' + (r.ok ? 'ok' : 'bad') + '">' +
      '<div class="verdict-row-left"><span class="verdict-dot"></span><span class="verdict-label">' + r.label + '</span></div>' +
      '<div class="verdict-row-right">' +
        (r.val ? '<span class="verdict-value">' + r.val + '</span>' : '') +
        '<span class="verdict-note">' + r.note + (r.ok ? ' ✓' : ' ✕') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div class="verdict-panel ' + stateClass + '">' +
    '<div class="verdict-panel-head">' +
      '<div class="verdict-panel-title">' + v.label + '</div>' +
      '<div class="verdict-panel-sub">' + v.sub + '</div>' +
    '</div>' +
    '<div class="verdict-panel-body">' + rowsHtml + '</div>' +
  '</div>';
}


// ====================================================================
// PERFORMANTA VERDICT - render tab
// ====================================================================
function renderPerformantaVerdict() {
  var el = document.getElementById('perf-verdict-content');
  if (!el) return;

  var log = [];
  try {
    // Folosim recommendation_log deja incarcat in BACKTEST_SUMMARY sau fetch direct
    var bt = MODEL_BENCHMARKS && MODEL_BENCHMARKS.real_backtest;
    if (!bt || !bt.n_total) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">Date insuficiente. Asteapta urmatorul fetch.</div>';
      return;
    }

    // Reconstruim verdictele pe baza datelor din recommendation_log prin model_benchmarks
    // Folosim by_market_bucket + by_edge_bucket pentru a simula distributia verdictelor
    var byMkt    = bt.by_market       || {};
    var byBucket = bt.by_edge_bucket  || {};
    var byMktBkt = bt.by_market_bucket || {};
    var overall  = bt.overall         || {};

    // --- Card overall ---
    var roiColor = overall.roi_pct >= 3 ? '#22c55e' : overall.roi_pct >= 0 ? '#f59e0b' : '#ef4444';
    var roiSign  = overall.roi_pct >= 0 ? '+' : '';

    var overallHtml =
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Global</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
          _perfMetric('Total pariuri', overall.n || 0, '') +
          _perfMetric('ROI', roiSign + (overall.roi_pct||0).toFixed(1) + '%', '', roiColor) +
          _perfMetric('Winrate', (overall.winrate||0).toFixed(1) + '%', '', overall.winrate >= 65 ? '#22c55e' : '#f59e0b') +
          _perfMetric('Profit', (overall.profit >= 0 ? '+' : '') + (overall.profit||0).toFixed(2) + 'u', '', overall.profit >= 0 ? '#22c55e' : '#ef4444') +
          _perfMetric('Max drawdown', (overall.max_drawdown||0).toFixed(2) + 'u', '', '#f59e0b') +
          _perfMetric('Avg odds', (overall.avg_odds||0).toFixed(3), '') +
        '</div>' +
      '</div>';

    // --- Card per piata ---
    var mktRows = Object.keys(byMkt).sort().map(function(mkey) {
      var s = byMkt[mkey];
      var rc = s.roi_pct >= 3 ? '#22c55e' : s.roi_pct >= 0 ? '#f59e0b' : '#ef4444';
      var rs = s.roi_pct >= 0 ? '+' : '';
      var minEdge = (MODEL_BENCHMARKS.dynamic_thresholds && MODEL_BENCHMARKS.dynamic_thresholds[mkey])
        ? MODEL_BENCHMARKS.dynamic_thresholds[mkey].min_edge : '?';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + mkey + '</div>' +
          '<div style="font-size:10px;color:var(--muted)">Prag dinamic: edge &ge; ' + minEdge + '%</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          '<span style="font-size:11px;color:var(--muted)">' + s.n + ' par.</span>' +
          '<span style="font-size:13px;font-weight:800;color:' + rc + '">' + rs + s.roi_pct.toFixed(1) + '%</span>' +
          '<span style="font-size:11px;color:var(--muted)">' + s.winrate.toFixed(0) + '% win</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var mktHtml =
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">ROI per piata</div>' +
        mktRows +
      '</div>';

    // --- Card edge bucket ---
    var bucketOrder = ['0-5%','5-10%','10-15%','15%+'];
    var bucketRows = bucketOrder.filter(function(b){ return byBucket[b]; }).map(function(bk) {
      var s = byBucket[bk];
      var rc = s.roi_pct >= 3 ? '#22c55e' : s.roi_pct >= 0 ? '#f59e0b' : '#ef4444';
      var rs = s.roi_pct >= 0 ? '+' : '';
      var verdict = s.roi_pct >= 3 ? '\u2705 Profitabil' : s.roi_pct >= 0 ? '\u26a0\ufe0f Marginal' : '\u274c Pierdere';
      var vc = s.roi_pct >= 3 ? '#22c55e' : s.roi_pct >= 0 ? '#f59e0b' : '#ef4444';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;color:var(--txt)">Edge ' + bk + '</div>' +
          '<div style="font-size:10px;color:' + vc + '">' + verdict + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center">' +
          '<span style="font-size:11px;color:var(--muted)">' + s.n + ' par.</span>' +
          '<span style="font-size:13px;font-weight:800;color:' + rc + '">' + rs + s.roi_pct.toFixed(1) + '%</span>' +
          '<span style="font-size:11px;color:var(--muted)">' + s.winrate.toFixed(0) + '% win</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var bucketHtml =
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">ROI per bucket edge</div>' +
        bucketRows +
      '</div>';

    // --- Card praguri dinamice ---
    var dt = MODEL_BENCHMARKS.dynamic_thresholds || {};
    var dtRows = Object.keys(dt).sort().map(function(mkey) {
      var t = dt[mkey];
      var disabled = t.disabled;
      var tc = disabled ? '#ef4444' : t.min_edge >= 10 ? '#f59e0b' : '#22c55e';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
        '<div style="font-size:13px;font-weight:700;color:var(--txt)">' + mkey + '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          (disabled
            ? '<span style="font-size:11px;color:#ef4444">\u274c Dezactivat</span>'
            : '<span style="font-size:12px;font-weight:700;color:' + tc + '">Edge \u2265 ' + t.min_edge + '%</span>') +
          '<span style="font-size:10px;color:var(--muted)">din ' + (t.basis||'?') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    var dtHtml =
      '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Praguri dinamice active</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Recalculate automat la fiecare fetch din date reale.</div>' +
        dtRows +
      '</div>';

    // --- Warnings ---
    var warnings = (bt.warnings || []);
    var warnHtml = warnings.length
      ? '<div style="padding:12px;border-radius:10px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.22);margin-bottom:14px">' +
          warnings.map(function(w){ return '<div style="font-size:12px;color:#f59e0b;margin-bottom:4px">\u26a0\ufe0f ' + w + '</div>'; }).join('') +
        '</div>'
      : '';

    // Notificari modificari prag
    var dt2 = MODEL_BENCHMARKS.dynamic_thresholds || {};
    var changedMarkets = Object.keys(dt2).filter(function(m){ return dt2[m].changed; });
    var changeNotifHtml = '';
    if (changedMarkets.length) {
      changeNotifHtml = '<div style="padding:12px 14px;border-radius:12px;background:rgba(99,102,241,.10);border:1px solid rgba(99,102,241,.30);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:800;color:#818cf8;margin-bottom:8px">\ud83d\udd04 Praguri auto-recalibrate</div>' +
        changedMarkets.map(function(m) {
          var t = dt2[m];
          var arrow = t.new_edge > t.prev_edge ? '\u2191' : '\u2193';
          var ac = t.new_edge > t.prev_edge ? '#ef4444' : '#22c55e';
          return '<div style="font-size:12px;color:var(--txt);margin-bottom:4px">' +
            '<b>' + m + '</b>: ' + t.prev_edge + '% ' +
            '<span style="color:' + ac + ';font-weight:900">' + arrow + ' ' + t.new_edge + '%</span>' +
            (t.roi_at_threshold != null ? ' <span style="color:var(--muted)">(ROI ' + (t.roi_at_threshold >= 0 ? '+' : '') + t.roi_at_threshold.toFixed(1) + '%)</span>' : '') +
          '</div>';
        }).join('') +
      '</div>';
    }

    // Istoric modificari
    var history = MODEL_BENCHMARKS.threshold_history || [];
    var histHtml = '';
    if (history.length) {
      histHtml = '<div style="padding:14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Istoric modificari prag</div>' +
        history.slice().reverse().map(function(c) {
          var tc = c.type === 'disabled' ? '#ef4444' : c.new_edge > c.prev_edge ? '#f59e0b' : '#22c55e';
          var d = c.timestamp ? new Date(c.timestamp).toLocaleDateString('ro-RO') : '?';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)">' +
            '<div style="font-size:12px;color:var(--txt)">' + c.message + '</div>' +
            '<div style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:8px">' + d + '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    var updAt = MODEL_BENCHMARKS.updated_at ? new Date(MODEL_BENCHMARKS.updated_at).toLocaleString('ro-RO') : '?';
    var metaHtml = '<div style="font-size:10px;color:var(--muted);margin-bottom:14px">Ultima actualizare: ' + updAt + ' &nbsp;|&nbsp; ' + (bt.n_total||0) + ' pariuri finalizate cu cote reale</div>';

    el.innerHTML = metaHtml + changeNotifHtml + warnHtml + overallHtml + mktHtml + bucketHtml + histHtml + dtHtml;

  } catch(e) {
    el.innerHTML = '<div style="color:#ef4444;padding:20px;font-size:12px">Eroare: ' + e.message + '</div>';
    console.error('renderPerformantaVerdict:', e);
  }
}

function _perfMetric(label, val, sub, color) {
  return '<div style="text-align:center;padding:8px 4px;border-radius:10px;background:rgba(255,255,255,.03)">' +
    '<div style="font-size:15px;font-weight:900;color:' + (color || 'var(--txt)') + '">' + val + '</div>' +
    '<div style="font-size:10px;color:var(--muted);margin-top:2px">' + label + '</div>' +
    (sub ? '<div style="font-size:9px;color:var(--muted)">' + sub + '</div>' : '') +
  '</div>';
}
// ====================================================================

function calcSmartScore(adjProb, value, confidence, edgePct){
  // Sincronizat cu fetch_data.py:calc_smart_score — aceeași scală, penalizări identice
  var c = normalizeConfidence(confidence);
  var edge = Number(edgePct || 0);
  var val  = Number(value  || 0);
  var probScore  = Math.min(58, (safePct(adjProb)/100)*58);
  var valueScore = Math.min(14, Math.max(0, val)  * 120);
  var edgeScore  = Math.min(18, Math.max(0, edge) * 2.0);
  var confScore  = Math.min(8,  (c/100)*8);
  var penalty = 0;
  if(val  < -0.03) penalty += 8;
  if(edge < -2.0)  penalty += 12;
  return Math.min(100, Math.round(probScore + valueScore + edgeScore + confScore - penalty));
}

// ============================================================
// MOTOR MULTI-FACTOR v1 — 5 STRATURI DE ANALIZĂ
// ============================================================
// Arhitectura:
//   Layer 1  — ML BASE        (prob_home/draw/away, prob_over25, prob_btts, confidence)
//   Layer 2  — FORMĂ & H2H   (home_form, away_form, head_to_head din /api/events/{id}/)
//   Layer 3  — CONTEXT        (absențe îmbunătățite, tactici coach, arbitru)
//   Layer 4  — CONSENSUS      (No-Vig Shin, market agreement score)
//   Layer 5  — PROB FINALĂ    (multiplicativ dampened ±25%, SmartScoreML5, Kelly ¼ cap 5%)
// ============================================================

// --- FETCH LIVE DETAIL (Layer 2 & 3 data source) ---
function fetchEventDetail(eventId){
  if(!eventId) return Promise.resolve(null);
  var eid = String(eventId);
  if(ENRICHED_EVENT_CACHE[eid]) return Promise.resolve(ENRICHED_EVENT_CACHE[eid]);
  if(ENRICHMENT_PENDING[eid])   return ENRICHMENT_PENDING[eid];

  var token = API_TOKEN || localStorage.getItem('bsd_token') || '';
  if(!token) return Promise.resolve(null);

  var url = 'https://sports.bzzoiro.com/api/events/' + eid + '/';
  ENRICHMENT_PENDING[eid] = fetch(url, {
    headers:{ 'Authorization':'Token ' + token },
    cache:'no-store'
  })
  .then(function(r){ return r.ok ? r.json() : null; })
  .then(function(data){
    if(data){ ENRICHED_EVENT_CACHE[eid] = data; }
    delete ENRICHMENT_PENDING[eid];
    return data || null;
  })
  .catch(function(){
    delete ENRICHMENT_PENDING[eid];
    return null;
  });
  return ENRICHMENT_PENDING[eid];
}

// --- LAYER 2: FORM FACTOR ---
// Returnează multiplicator 0.80–1.20 pe baza formei recente (form_string + xG stats)
function calcFormFactor(homeForm, awayForm, marketKey){
  if(!homeForm || !awayForm) return 1.0;

  // Form string score: W=3, D=1, L=0, din ultimele 5 meciuri → 0..1
  function formScore(fs){
    if(!fs) return 0.5;
    var pts = String(fs).toUpperCase().split('').slice(-5).reduce(function(acc,c){
      return acc + (c==='W'?3:c==='D'?1:0);
    },0);
    return Math.min(1.0, pts / 15);
  }
  var hScore = formScore(homeForm.form_string);
  var aScore = formScore(awayForm.form_string);

  // xG avansat dacă există
  var hXG   = Number(homeForm.avg_xg             || 0);
  var aXG   = Number(awayForm.avg_xg             || 0);
  var hXGc  = Number(homeForm.avg_xg_conceded    || 0);
  var aXGc  = Number(awayForm.avg_xg_conceded    || 0);
  // Fallback la goluri dacă xG nu e disponibil
  var hGoals = hXG > 0.05 ? hXG : (Number(homeForm.goals_scored_last_n||0)/Math.max(1,Number(homeForm.matches_played||5)));
  var aGoals = aXG > 0.05 ? aXG : (Number(awayForm.goals_scored_last_n||0)/Math.max(1,Number(awayForm.matches_played||5)));
  var hConc  = hXGc > 0.05 ? hXGc : (Number(homeForm.goals_conceded_last_n||0)/Math.max(1,Number(homeForm.matches_played||5)));
  var aConc  = aXGc > 0.05 ? aXGc : (Number(awayForm.goals_conceded_last_n||0)/Math.max(1,Number(awayForm.matches_played||5)));

  var mk = marketKey;
  var factor = 1.0;

  if(mk==='homeWin'){
    // Home formă vs away formă + avantaj acasă (home_ppg)
    var hPPG = Number(homeForm.home_ppg  || 0);
    var aPPG = Number(awayForm.away_ppg  || 0);
    var diff = (hScore - aScore) * 0.12 + (hPPG - aPPG) * 0.04;
    factor = 1.0 + Math.max(-0.15, Math.min(0.20, diff));
  } else if(mk==='awayWin'){
    var diff = (aScore - hScore) * 0.12 + (Number(awayForm.away_ppg||0) - Number(homeForm.home_ppg||0)) * 0.04;
    factor = 1.0 + Math.max(-0.15, Math.min(0.20, diff));
  } else if(mk==='draw'){
    // Draw mai probabil când echipele sunt echilibrate
    var evenness = 1.0 - Math.abs(hScore - aScore);
    factor = 0.90 + evenness * 0.12;
  } else if(mk==='over25'||mk==='over35'){
    var avgGoalFlow = (hGoals + aGoals + hConc + aConc) / 4;
    factor = 0.88 + Math.min(0.28, (avgGoalFlow - 1.0) * 0.14);
  } else if(mk==='over15'){
    var avgGoalFlow = (hGoals + aGoals + hConc + aConc) / 4;
    factor = 0.92 + Math.min(0.18, (avgGoalFlow - 0.8) * 0.10);
  } else if(mk==='under25'||mk==='under35'){
    var avgGoalFlow = (hGoals + aGoals + hConc + aConc) / 4;
    // Echipe cu puține goluri → Under mai probabil
    var cleanH = Number(homeForm.clean_sheets || 0) / Math.max(1, Number(homeForm.matches_played||5));
    var cleanA = Number(awayForm.clean_sheets  || 0) / Math.max(1, Number(awayForm.matches_played||5));
    factor = 1.02 + (cleanH + cleanA) * 0.06 - Math.min(0.20, (avgGoalFlow - 1.0) * 0.10);
  } else if(mk==='btts'){
    // Ambele marchează: ambele echipe în formă bună la atac, ambele înscriu (nu clean sheets)
    var homeSc = Math.min(1.15, 0.85 + hGoals * 0.12);
    var awaySc = Math.min(1.15, 0.85 + aGoals * 0.12);
    var cleanPenalty = (Number(homeForm.clean_sheets||0) + Number(awayForm.clean_sheets||0)) /
                       Math.max(1, Number(homeForm.matches_played||5) + Number(awayForm.matches_played||5));
    factor = (homeSc + awaySc) / 2 - cleanPenalty * 0.08;
  }

  return Math.max(0.80, Math.min(1.20, +factor.toFixed(4)));
}

// --- LAYER 2: H2H FACTOR ---
// Returnează multiplicator 0.85–1.15 din istoricul direct
function calcH2HFactor(h2h, marketKey){
  if(!h2h || !h2h.total_matches || Number(h2h.total_matches) < 3) return 1.0;
  var total  = Number(h2h.total_matches);
  var homeWR = Number(h2h.home_win_rate  || 0);   // 0-1
  var awayWR = Number(h2h.away_win_rate  || 0);   // 0-1
  var drawR  = Math.max(0, 1 - homeWR - awayWR);
  var avgG   = Number(h2h.avg_total_goals|| 2.5);
  var hGoals = Number(h2h.home_goals     || 0);
  var aGoals = Number(h2h.away_goals     || 0);

  // Reliability: mai multe meciuri = mai sigur, cap la 12
  var rel = Math.min(1.0, total / 12);

  var factor = 1.0;
  var mk = marketKey;

  if(mk==='homeWin'){
    factor = 1.0 + (homeWR - 0.45) * 0.22 * rel;
  } else if(mk==='awayWin'){
    factor = 1.0 + (awayWR - 0.28) * 0.22 * rel;
  } else if(mk==='draw'){
    factor = 1.0 + (drawR  - 0.27) * 0.28 * rel;
  } else if(mk==='over25'){
    factor = 0.90 + Math.min(0.22, (avgG - 2.0) * 0.12) * rel;
  } else if(mk==='over35'){
    factor = 0.88 + Math.min(0.24, (avgG - 2.5) * 0.16) * rel;
  } else if(mk==='under25'){
    factor = 1.0  + Math.max(-0.20, (2.0 - avgG) * 0.10) * rel;
  } else if(mk==='btts'){
    // Ambele marchează dacă în H2H au înscris în general
    var bothScoredRate = (total > 0 && hGoals > 0 && aGoals > 0) ?
      Math.min(1.0, Math.min(hGoals, aGoals) / total) : 0.5;
    factor = 0.92 + bothScoredRate * 0.20 * rel;
  }

  return Math.max(0.85, Math.min(1.15, +factor.toFixed(4)));
}

// --- LAYER 3: ABSENCE FACTOR v2 (îmbunătățit față de calcInjuryAdjustment) ---
// Returnează multiplicator 0.72–1.10 cu greutăți pe poziție implicită
function calcAbsenceFactorV2(unavailablePlayers, marketKey){
  if(!unavailablePlayers) return 1.0;
  var up = unavailablePlayers;
  function weight(list){
    if(!Array.isArray(list)) return 0;
    return list.reduce(function(acc, p){
      if(!p) return acc;
      var s = String(p.status||'').toLowerCase();
      var w = (s==='injured'||s==='suspended') ? 1.0 : s==='doubtful' ? 0.45 : 0.75;
      return acc + w;
    }, 0);
  }
  var h = weight(up.home);
  var a = weight(up.away);
  var total = h + a;
  if(total < 0.8) return 1.0;

  var mk = marketKey;
  var factor = 1.0;
  // Penalizare: fiecare absent "complet" reduce probabilitatea echipei afectate cu ~5%
  if(mk==='homeWin'){
    factor = 1.0 - Math.min(0.22, h * 0.055) + Math.min(0.06, a * 0.022);
  } else if(mk==='awayWin'){
    factor = 1.0 - Math.min(0.22, a * 0.055) + Math.min(0.06, h * 0.022);
  } else if(mk==='draw'){
    // Draw poate creste sau scade; absente multe reduce draw (dezechilibru)
    factor = 1.0 - Math.abs(h - a) * 0.035 - Math.max(0, total - 2) * 0.025;
  } else if(mk==='over35'){
    factor = 1.0 - Math.min(0.22, total * 0.045);
  } else if(mk==='over25'){
    factor = 1.0 - Math.min(0.18, total * 0.038);
  } else if(mk==='over15'){
    factor = 1.0 - Math.min(0.12, total * 0.025);
  } else if(mk==='under25'||mk==='under35'){
    factor = 1.0 + Math.min(0.12, total * 0.030);
  } else if(mk==='btts'){
    factor = 1.0 - Math.min(0.16, total * 0.032);
  }

  return Math.max(0.72, Math.min(1.10, +factor.toFixed(4)));
}

// --- LAYER 3: TACTICAL FACTOR ---
// Returnează multiplicator 0.83–1.17 din pressing_intensity, defensive_line, top_styles
function calcTactFactor(homeCoach, awayCoach, marketKey){
  if(!homeCoach && !awayCoach) return 1.0;

  // pressing_intensity: 1-10 (10 = gegenpressing maxim)
  // defensive_line: 1-10 (10 = linie sus, risc mai mare)
  var hPress  = Number((homeCoach && homeCoach.pressing_intensity) || 5);
  var aPress  = Number((awayCoach && awayCoach.pressing_intensity) || 5);
  var hDefLn  = Number((homeCoach && homeCoach.defensive_line)     || 5);
  var aDefLn  = Number((awayCoach && awayCoach.defensive_line)     || 5);

  var hStyles = Array.isArray(homeCoach && homeCoach.top_styles) ? homeCoach.top_styles : [];
  var aStyles = Array.isArray(awayCoach && awayCoach.top_styles) ? awayCoach.top_styles : [];

  var attackStyles   = ['tiki_taka','gegenpressing','counter_attack','high_press','direct_play'];
  var defensiveStyles= ['low_block','park_the_bus','defensive','deep_defensive'];

  var hAttack  = hStyles.some(function(s){ return attackStyles.indexOf(s)>=0; })   ? 1 : 0;
  var aAttack  = aStyles.some(function(s){ return attackStyles.indexOf(s)>=0; })   ? 1 : 0;
  var hDefense = hStyles.some(function(s){ return defensiveStyles.indexOf(s)>=0; }) ? 1 : 0;
  var aDefense = aStyles.some(function(s){ return defensiveStyles.indexOf(s)>=0; }) ? 1 : 0;

  var mk = marketKey;
  var factor = 1.0;

  if(mk==='over25'||mk==='over35'){
    // Presing ridicat + linie sus → mai multe goluri
    var pressFactor = ((hPress + aPress) / 10) * 0.12;           // 0–0.12
    var lineFactor  = ((hDefLn + aDefLn) / 10) * 0.08;           // 0–0.08
    factor = 0.90 + pressFactor + lineFactor
             - aDefense * 0.06 - hDefense * 0.06
             + hAttack  * 0.04 + aAttack  * 0.04;
  } else if(mk==='over15'){
    factor = 0.93 + ((hPress + aPress) / 10) * 0.08 - aDefense * 0.04;
  } else if(mk==='under25'||mk==='under35'){
    factor = 1.10 - ((hPress + aPress) / 10) * 0.08 + aDefense * 0.05 + hDefense * 0.05;
  } else if(mk==='btts'){
    factor = 0.94 + hAttack * 0.07 + aAttack * 0.07 - aDefense * 0.05 - hDefense * 0.05;
  } else if(mk==='homeWin'){
    factor = 1.0 + hAttack * 0.05 - aDefense * 0.04 + (hPress - 5) * 0.008;
  } else if(mk==='awayWin'){
    factor = 1.0 + aAttack * 0.05 - hDefense * 0.04 + (aPress - 5) * 0.008;
  }

  // Supliment v2: statistici reale antrenori (over25_pct, btts_pct, clean_sheet_pct)
  var hO25 = Number((homeCoach && homeCoach.over25_pct)      || 0);
  var aO25 = Number((awayCoach && awayCoach.over25_pct)      || 0);
  var hB   = Number((homeCoach && homeCoach.btts_pct)        || 0);
  var aB   = Number((awayCoach && awayCoach.btts_pct)        || 0);
  var hCs  = Number((homeCoach && homeCoach.clean_sheet_pct) || 0);
  var aCs  = Number((awayCoach && awayCoach.clean_sheet_pct) || 0);
  if(hO25 > 0 && aO25 > 0){
    var avgO25 = (hO25 + aO25) / 2;
    if(mk==='over25') factor += Math.max(-0.05, Math.min(0.06, (avgO25 - 55) * 0.003));
    else if(mk==='under35'||mk==='under25') factor += Math.max(-0.04, Math.min(0.04, (50 - avgO25) * 0.002));
  }
  if(hB > 0 && aB > 0 && mk==='btts'){
    factor += Math.max(-0.05, Math.min(0.07, ((hB + aB) / 2 - 50) * 0.003));
  }
  if((mk==='under35'||mk==='under25') && (hCs > 30 || aCs > 30)){
    factor += Math.min(0.04, (Math.max(hCs, aCs) - 30) * 0.001);
  }

  return Math.max(0.83, Math.min(1.17, +factor.toFixed(4)));
}

// --- LAYER 3: REFEREE FACTOR ---
// Pre-meci: neutru 1.0 (datele istorice arbitru vin din /api/referees/ — implementare viitoare)
// Post-meci (yellowCards/redCards pe meciul curent): penalizare Over dacă cartonașe puține
function calcRefFactor(referee, marketKey){
  if(!referee) return 1.0;
  var avgGoals  = Number(referee.avg_goals_per_match  || 0);
  var avgYellow = Number(referee.avg_yellow_per_match || 0);
  var matches   = Number(referee.matches || 0);
  if(!avgGoals || matches < 20) return 1.0;
  var goalDelta = avgGoals - 2.5;
  var factor = 1.0;
  var mk = marketKey;
  if(mk==='over25'||mk==='over15'){
    factor = 1.0 + Math.max(-0.08, Math.min(0.10, goalDelta * 0.055));
  } else if(mk==='under35'||mk==='under25'){
    factor = 1.0 - Math.max(-0.08, Math.min(0.10, goalDelta * 0.055));
  } else if(mk==='btts'){
    factor = 1.0 + Math.max(-0.05, Math.min(0.08, goalDelta * 0.04));
  } else if(mk==='homeWin'||mk==='awayWin'){
    if(avgYellow > 4.5) factor = 1.0 - 0.02;
  }
  return Math.max(0.88, Math.min(1.12, +factor.toFixed(4)));
}

// --- LAYER 3b: CONTEXT FACTOR (derby, vreme, deplasare, teren) ---
function calcContextFactor(context, marketKey){
  if(!context) return 1.0;
  var factor = 1.0;
  var mk = marketKey;
  if(context.is_local_derby){
    if(mk==='over25'||mk==='over15') factor -= 0.05;
    else if(mk==='under25'||mk==='under35') factor += 0.04;
    else if(mk==='homeWin'||mk==='awayWin') factor -= 0.03;
  }
  if(context.is_neutral_ground){ if(mk==='homeWin') factor -= 0.06; }
  var wCode = Number(context.weather_code || 0);
  if(wCode===3){
    if(mk==='over25') factor -= 0.05;
    else if(mk==='over15') factor -= 0.03;
    else if(mk==='under25'||mk==='under35') factor += 0.04;
  } else if(wCode===4){
    if(mk==='over25') factor -= 0.08; else if(mk==='over15') factor -= 0.05;
    else if(mk==='under25'||mk==='under35') factor += 0.06;
  } else if(wCode===5){
    if(mk==='over25'||mk==='over15') factor -= 0.10;
    else if(mk==='under25'||mk==='under35') factor += 0.08;
  }
  var pitch = Number(context.pitch_condition || 1);
  if(pitch >= 2){
    var pp = (pitch - 1) * 0.025;
    if(mk==='over25') factor -= pp;
    else if(mk==='over15') factor -= pp * 0.6;
    else if(mk==='under25'||mk==='under35') factor += pp * 0.8;
  }
  var travel = Number(context.travel_distance_km || 0);
  if(travel > 4000){
    if(mk==='homeWin') factor += 0.05; else if(mk==='awayWin') factor -= 0.05;
    else if(mk==='under35') factor += 0.02;
  } else if(travel > 2000){
    if(mk==='homeWin') factor += 0.03; else if(mk==='awayWin') factor -= 0.03;
    else if(mk==='under35') factor += 0.01;
  }
  return Math.max(0.85, Math.min(1.15, +factor.toFixed(4)));
}

// --- LAYER 4: MARKET AGREEMENT SCORE ---
// Cât de mult sunt de acord piața (no-vig) și modelul ML?
// Returnează 0.0–1.0; folosit ca factor de încredere în Layer 5
function calcMarketAgreementScore(noVigProb, mlProb){
  if(!noVigProb || !mlProb || noVigProb <= 0 || mlProb <= 0) return 0.50;
  var diff = Math.abs(Number(noVigProb) - Number(mlProb));
  if(diff <  2) return 1.00;
  if(diff <  4) return 0.90;
  if(diff <  7) return 0.78;
  if(diff < 10) return 0.65;
  if(diff < 15) return 0.52;
  return 0.40;
}

// --- LAYER 5: PROBABILITATE FINALĂ MULTI-FACTOR ---
// Formula: FinalProb = MLProb × Σ(factors) [dampened ±25%]
// Blending: 68% ML base + 32% factor-adjusted pentru stabilitate
function calcFinalProbML5(mlProb, enrichedDetail, marketKey, noVigProb){
  if(!enrichedDetail){
    return { finalProb: mlProb, factors: null, agreementScore: 0.5 };
  }

  var homeForm = enrichedDetail.home_form   || null;
  var awayForm = enrichedDetail.away_form   || null;
  var h2h      = enrichedDetail.head_to_head|| null;
  var upPlayers= enrichedDetail.unavailable_players || null;
  var hCoach   = enrichedDetail.home_coach  || null;
  var aCoach   = enrichedDetail.away_coach  || null;
  var referee  = enrichedDetail.referee     || null;
  var context  = enrichedDetail.match_context || null;

  var formF  = calcFormFactor(homeForm, awayForm, marketKey);
  var h2hF   = calcH2HFactor(h2h, marketKey);
  var absF   = calcAbsenceFactorV2(upPlayers, marketKey);
  var tactF  = calcTactFactor(hCoach, aCoach, marketKey);
  var refF   = calcRefFactor(referee, marketKey);
  var ctxF   = calcContextFactor(context, marketKey);

  var combined = formF * h2hF * absF * tactF * refF * ctxF;
  combined = Math.max(0.75, Math.min(1.25, combined));

  // Agreement score Layer 4
  var agreementScore = calcMarketAgreementScore(noVigProb, mlProb);

  // Blending: 68% ML + 32% factor-ajustat; agreement redus dampens factorul
  var factorWeight = 0.32 * agreementScore;
  var mlWeight     = 1.0 - factorWeight;
  // Nu mutăm probabilitatea absolut — scalăm multiplicativ față de ML
  var adjustedProb = mlProb * (mlWeight + factorWeight * combined);

  // Clamp realist
  adjustedProb = Math.max(5, Math.min(92, adjustedProb));

  return {
    finalProb: +adjustedProb.toFixed(2),
    factors: {
      formFactor   : formF,
      h2hFactor    : h2hF,
      absenceFactor: absF,
      tactFactor   : tactF,
      refFactor    : refF,
      ctxFactor    : ctxF,
      combined     : +combined.toFixed(4)
    },
    agreementScore: agreementScore
  };
}

// --- LAYER 5: SMART SCORE ML5 (extins față de calcSmartScore) ---
// Aceeași scală 0-100 dar cu bonus/penalizare din factorii contextuali
function calcSmartScoreML5(adjProb, value, confidence, edgePct, factors, agreementScore){
  var c    = normalizeConfidence(confidence);
  var edge = Number(edgePct || 0);
  var val  = Number(value   || 0);

  // Componente identice cu v17 (pentru backward compatibility în Python)
  var probScore  = Math.min(55, (safePct(adjProb)/100) * 55);
  var valueScore = Math.min(14, Math.max(0, val)  * 120);
  var edgeScore  = Math.min(17, Math.max(0, edge) * 2.0);
  var confScore  = Math.min(8,  (c/100) * 8);

  // Bonus contextual din factori (Layer 2+3): max ±5 puncte
  var factorBonus = 0;
  if(factors){
    var c5 = Number(factors.combined || 1.0);
    if     (c5 >= 1.12) factorBonus =  5;
    else if(c5 >= 1.06) factorBonus =  3;
    else if(c5 >= 1.02) factorBonus =  1;
    else if(c5 <= 0.88) factorBonus = -5;
    else if(c5 <= 0.94) factorBonus = -3;
    else if(c5 <= 0.98) factorBonus = -1;
  }

  // Bonus acord piata (Layer 4): max +1 punct
  var agrBonus = 0;
  if(agreementScore != null){
    if(agreementScore >= 0.90)      agrBonus = 1;
    else if(agreementScore <= 0.45) agrBonus = -1;
  }

  // Penalizări
  var penalty = 0;
  if(val  < -0.03) penalty += 8;
  if(edge < -2.0)  penalty += 12;

  return Math.min(100, Math.round(
    probScore + valueScore + edgeScore + confScore + factorBonus + agrBonus - penalty
  ));
}

// --- KELLY ¼ CU CAP 5% ---
function calcKellyML5(prob, odds, bankrollPct){
  var p = Number(prob || 0) / 100;
  var o = Number(odds || 0);
  if(p <= 0 || o <= 1.01) return 0;
  var kelly = (p * (o - 1) - (1 - p)) / (o - 1);
  var quarter = kelly / 4;
  return Math.max(0, Math.min(5, +quarter.toFixed(2))); // cap 5%
}

// --- ENRICHMENT APPLY ---
// Aplică datele live (Layer 2+3) pe un match deja analizat
function applyEnrichmentToMatch(m, raw, enrichedDetail){
  if(!enrichedDetail) return m;

  // Re-scorăm fiecare bet cu probabilitati multi-layer
  var enrichedBets = (m.allBets || []).map(function(bet){
    var noVig = bet.marketProb;
    var ml5   = calcFinalProbML5(bet.prob, enrichedDetail, bet.type, noVig);
    var newAdj= ml5.finalProb;
    var newSc = calcSmartScoreML5(newAdj, bet.value, m.confidence, bet.edgePct, ml5.factors, ml5.agreementScore);
    var newKelly = calcKellyML5(newAdj, bet.odds, null);

    return Object.assign({}, bet, {
      adjProb      : newAdj,
      score        : newSc,
      ml5Factors   : ml5.factors,
      ml5Agreement : ml5.agreementScore,
      ml5Kelly     : newKelly,
      isEnriched   : true
    });
  });

  var newBest = enrichedBets.reduce(function(best, b){
    return (!best || b.score > best.score) ? b : best;
  }, null);

  // Date vizibile pe card
  var hf = enrichedDetail.home_form    || null;
  var af = enrichedDetail.away_form    || null;
  var h2 = enrichedDetail.head_to_head || null;
  var hc = enrichedDetail.home_coach   || null;
  var ac = enrichedDetail.away_coach   || null;

  // Form string compact: ultimi 5
  function fStr(form){ return form && form.form_string ? String(form.form_string).slice(-5) : ''; }

  return Object.assign({}, m, {
    allBets    : enrichedBets,
    bestBet    : newBest,
    smartScore : newBest ? newBest.score : m.smartScore,
    isEnriched : true,
    enrichedAt : Date.now(),
    // Layer 2 summary
    homeForm   : hf,
    awayForm   : af,
    homeFormStr: fStr(hf),
    awayFormStr: fStr(af),
    h2h        : h2,
    h2hLabel   : h2 ? (h2.total_matches + ' H2H, ' + (h2.avg_total_goals||0).toFixed(1) + 'g/m') : '',
    // Layer 3 summary
    homeCoach  : hc,
    awayCoach  : ac,
    homeCoachName : hc ? (hc.short_name || hc.name || '') : '',
    awayCoachName : ac ? (ac.short_name || ac.name || '') : '',
    homeCoachStyles: hc && hc.top_styles ? hc.top_styles : [],
    awayCoachStyles: ac && ac.top_styles ? ac.top_styles : [],
    matchContext  : enrichedDetail.match_context || null,
    isDerby       : !!((enrichedDetail.match_context || {}).is_local_derby),
    weatherCode   : (enrichedDetail.match_context || {}).weather_code || 0,
    weatherDesc   : (enrichedDetail.match_context || {}).weather_desc || '',
    travelDistKm  : (enrichedDetail.match_context || {}).travel_distance_km || 0,
    pitchCondition: (enrichedDetail.match_context || {}).pitch_condition || 1
  });
}

// --- ENRICHMENT BACKGROUND BATCH ---
// Fetch top 30 meciuri (după SmartScore) în background la 150ms/request
function enrichTopMatchesBackground(){
  if(ENRICHMENT_BATCH_RUNNING) return Promise.resolve();
  var token = API_TOKEN || localStorage.getItem('bsd_token') || '';
  if(!token) return Promise.resolve();

  ENRICHMENT_BATCH_RUNNING = true;

  var candidates = (window.ALL_MATCHES || [])
    .filter(function(m){ return m.eventId && Number(m.smartScore||0) > 0; })
    .sort(function(a,b){ return (b.smartScore||0)-(a.smartScore||0); })
    .slice(0, 15); // ↓ redus de la 30 la 15

  var toFetch = candidates.filter(function(m){
    return !ENRICHED_EVENT_CACHE[String(m.eventId)];
  });

  if(!toFetch.length){
    ENRICHMENT_BATCH_RUNNING = false;
    return Promise.resolve();
  }

  // Fetch secvențial cu delay mai mic (100ms în loc de 150ms)
  var chain = Promise.resolve(0);
  toFetch.forEach(function(m){
    chain = chain.then(function(count){
      return new Promise(function(res){ setTimeout(res, 100); })
        .then(function(){ return fetchEventDetail(m.eventId); })
        .then(function(d){ return count + (d ? 1 : 0); });
    });
  });

  return chain.then(function(enriched){
    ENRICHMENT_BATCH_RUNNING = false;
    if(enriched > 0){
      try {
        var preds = window.__RAW_PREDICTIONS || [];
        // Actualizează doar meciurile care au primit enrichment nou
        // NU re-rulăm toată pipeline-ul — doar patch-uim în ALL_MATCHES
        var enrichedEids = {};
        toFetch.forEach(function(m){ if(ENRICHED_EVENT_CACHE[String(m.eventId)]) enrichedEids[String(m.eventId)] = true; });

        ALL_MATCHES = preds.map(function(raw){
          var m = analyzeMatch(raw);
          var eid = String(m.eventId||'');
          if(eid && ENRICHED_EVENT_CACHE[eid])
            return applyEnrichmentToMatch(m, raw, ENRICHED_EVENT_CACHE[eid]);
          return m;
        });
        rebuildVisualMatchIndex();
        syncRecommendationEngine();

        // Re-render doar tab-ul activ, nu tot renderAll()
        var activeTab = getCurrentActiveTabName ? getCurrentActiveTabName() : 'dashboard';
        try { renderActiveTab(activeTab, {}); } catch(e){}
              } catch(e){ console.warn('[ML5] Re-render failed', e); }
    }
    return enriched;
  }).catch(function(e){
    ENRICHMENT_BATCH_RUNNING = false;
    console.warn('[ML5] Enrichment batch error', e);
  });
}

// ============================================================
// END MOTOR MULTI-FACTOR v1
// ============================================================

// V17 FIX 4: Stake sizing scalar (inlocuieste blocking-ul cu sizing diferentiat).
// Returneaza un multiplicator 0.25-1.30 aplicat peste Kelly 1/4 precomputat.
// Fundament: datele jurnalului (996 bets settled) arata:
//  - edge<5% = zero edge real (roi ~-1%), edge>=15% = sweet spot pozitiv
//  - odds 1.45-1.85 = sweet spot (+6.6% ROI), restul aproape breakeven
//  - sursa "Adjusted strong" = -2.60% ROI -> reducere severa
//  - pattern toxic din learning = reducere severa
function computeStakeMultiplier(row){
  if(!row) return 1.0;
  var edge = Number(row.edge_pct != null ? row.edge_pct : (row.edge || 0));
  var odds = Number(row.odds != null ? row.odds : (row.book_odds || row.displayOdds || 0));
  var modelProb = Number(row.model_prob || row.api_prob || 0);
  var adjProb = Number(row.adjusted_prob != null ? row.adjusted_prob : (row.prob || 0));
  var poissonDelta = Math.abs(Number(row.poisson_delta || 0));
  var fromOpenPct = Number(row.from_open_pct || 0);

  // Edge multiplier: edge<5% -> 0.45, edge=10% -> 0.9, edge>=15% -> 1.15, cap 1.25
  var edgeMult = 1.0;
  if(edge <= 0) edgeMult = 0.35;
  else if(edge < 5) edgeMult = 0.45 + (edge / 5) * 0.15;
  else if(edge < 10) edgeMult = 0.60 + ((edge - 5) / 5) * 0.30;
  else if(edge < 15) edgeMult = 0.90 + ((edge - 10) / 5) * 0.20;
  else edgeMult = Math.min(1.25, 1.10 + (edge - 15) * 0.01);

  // Odds multiplier: sweet spot 1.45-1.85 = 1.10, 1.30-1.45 sau 1.85-2.10 = 0.95, restul = 0.75
  var oddsMult = 0.80;
  if(odds >= 1.45 && odds <= 1.85) oddsMult = 1.10;
  else if((odds >= 1.30 && odds < 1.45) || (odds > 1.85 && odds <= 2.10)) oddsMult = 0.95;
  else if(odds >= 1.20 && odds < 1.30) oddsMult = 0.80; // cotele sub 1.30 sug profit prin marja
  else if(odds > 2.10 && odds <= 2.80) oddsMult = 0.80;
  else if(odds < 1.20 || odds > 2.80) oddsMult = 0.55;

  // Source multiplier: sursa cu cel mai bun ROI istoric (Poisson hybrid +0.93%) vs cea proasta (Adjusted strong -2.60%)
  var sourceMult = 1.0;
  if(poissonDelta >= 3 && poissonDelta < 5) sourceMult = 1.10; // Poisson hybrid zone
  else if(poissonDelta >= 5) sourceMult = 0.55; // Adjusted strong zone -> penalizat greu
  // daca model_prob si adjusted sunt aproape identice -> API dominant (breakeven)
  else if(modelProb > 0 && Math.abs(adjProb - modelProb) < 2) sourceMult = 1.00;

  // Toxic pattern: daca motorul de invatare il semnaleaza ca toxic, stake drastic redus
  if(row.learningToxic === true) sourceMult *= 0.40;

  // Line movement guard: daca linia s-a miscat >3% impotriva noastra, reducere
  if(fromOpenPct < -5) sourceMult *= 0.55;
  else if(fromOpenPct < -3) sourceMult *= 0.75;

  // Edge bucket 15-20% este anomalie (ROI -8% in jurnal) - reducere moderata
  if(edge >= 15 && edge < 20) edgeMult *= 0.75;

  var total = edgeMult * oddsMult * sourceMult;
  return Math.max(0.25, Math.min(1.30, total));
}

// Returneaza Kelly-ul ajustat pentru display si decizie, cu fallback daca row e incomplet.
function computeAdjustedKelly(row){
  var baseKelly = Number(row && row.kelly_quarter_pct || 0);
  if(!baseKelly) return 0;
  var mult = computeStakeMultiplier(row);
  return +(baseKelly * mult).toFixed(2);
}

function getXGClass(val) {
  if (val >= 2.5) return { label: 'ELITE', color: '#ff4d4d', bg: 'rgba(255,77,77,0.15)' };
  if (val >= 2.0) return { label: 'STRONG', color: 'var(--grn)', bg: 'rgba(34,197,94,0.15)' };
  if (val >= 1.4) return { label: 'GOOD', color: 'var(--cyan)', bg: 'rgba(6,182,212,0.15)' };
  if (val >= 1.0) return { label: 'AVG', color: 'var(--yel)', bg: 'rgba(245,158,11,0.15)' };
  return { label: 'WEAK', color: 'var(--red)', bg: 'rgba(239,68,68,0.15)' };
}
function getVerdict(adjProb, value, confidence){
  var c = normalizeConfidence(confidence);
  if(adjProb >= 72 && value >= 0.04 && c >= 55) return 'safe';
  if(adjProb >= 60 && value >= 0.00) return 'moderate';
  return 'avoid';
}
function getExtraMarkets(raw){
  var probHome = safePct(raw.prob_home_win);
  var probDraw = safePct(raw.prob_draw);
  var probAway = safePct(raw.prob_away_win);
  var prob1X = +(probHome + probDraw).toFixed(2);
  var probX2 = +(probAway + probDraw).toFixed(2);
  var prob12 = +(probHome + probAway).toFixed(2);
  function fairOdds(prob){ return prob > 0 ? +(1 / (prob / 100)).toFixed(2) : null; }
  return {
    prob1X: prob1X,
    probX2: probX2,
    prob12: prob12,
    fairOdds1X: fairOdds(prob1X),
    fairOddsX2: fairOdds(probX2),
    fairOdds12: fairOdds(prob12)
  };
}


function computeNoVigThreeWay(odds1, oddsX, odds2){
  var a = Number(odds1 || 0), x = Number(oddsX || 0), b = Number(odds2 || 0);
  if(a < 1.01 || x < 1.01 || b < 1.01) return null;
  var p1 = 1 / a, px = 1 / x, p2 = 1 / b;
  var sum = p1 + px + p2;
  if(!sum || !isFinite(sum)) return null;
  return { homeWin: +(p1 * 100 / sum).toFixed(2), draw: +(px * 100 / sum).toFixed(2), awayWin: +(p2 * 100 / sum).toFixed(2) };
}
function computeNoVigTwoWay(oddsA, oddsB){
  var a = Number(oddsA || 0), b = Number(oddsB || 0);
  if(a < 1.01 || b < 1.01) return null;
  var pa = 1 / a, pb = 1 / b;
  var sum = pa + pb;
  if(!sum || !isFinite(sum)) return null;
  return { a: +(pa * 100 / sum).toFixed(2), b: +(pb * 100 / sum).toFixed(2) };
}
function getNoVigMarketProbFromRaw(raw, marketKey){
  var e = raw.event || {};
  var threeWay = computeNoVigThreeWay(e.odds_home, e.odds_draw, e.odds_away);
  var ou15 = computeNoVigTwoWay(e.odds_over_15, e.odds_under_15);
  var ou25 = computeNoVigTwoWay(e.odds_over_25, e.odds_under_25);
  var ou35 = computeNoVigTwoWay(e.odds_over_35, e.odds_under_35);
  var btts = computeNoVigTwoWay(e.odds_btts_yes, e.odds_btts_no);
  if(threeWay){
    if(marketKey === 'homeWin') return threeWay.homeWin;
    if(marketKey === 'draw') return threeWay.draw;
    if(marketKey === 'awayWin') return threeWay.awayWin;
  }
  if(ou15){
    if(marketKey === 'over15') return ou15.a;
    if(marketKey === 'under15') return ou15.b;
  }
  if(ou25){
    if(marketKey === 'over25') return ou25.a;
    if(marketKey === 'under25') return ou25.b;
  }
  if(ou35){
    if(marketKey === 'under35') return ou35.b;
  }
  if(btts){
    if(marketKey === 'btts') return btts.a;
  }
  return null;
}
function apiRecommendForRaw(raw, marketKey){
  if(marketKey === 'over15') return !!raw.over_15_recommend;
  if(marketKey === 'over25') return !!raw.over_25_recommend;
  if(marketKey === 'btts') return !!raw.btts_recommend;
  if(marketKey === 'homeWin') return !!(raw.favorite_recommend && raw.favorite === 'H' && raw.predicted_result === 'H');
  if(marketKey === 'awayWin') return !!(raw.favorite_recommend && raw.favorite === 'A' && raw.predicted_result === 'A');
  return false;
}
function heuristicRecommendForRaw(raw, marketKey){
  var ls = parseLikelyScore(raw.most_likely_score || null);
  var xgHome = Number(raw.expected_home_goals || 0);
  var xgAway = Number(raw.expected_away_goals || 0);
  var xgTotal = xgHome + xgAway;
  var probDraw = safePct(raw.prob_draw);
  var gap = Math.abs(xgHome - xgAway);
  if(marketKey === 'over15') return safePct(raw.prob_over_15) >= 76 && xgTotal >= 2.10 && (!ls || ls.total >= 2);
  if(marketKey === 'over25') return safePct(raw.prob_over_25) >= 60 && xgTotal >= 2.60 && (!ls || ls.total >= 3);
  if(marketKey === 'under25') return (100 - safePct(raw.prob_over_25)) >= 56 && xgTotal <= 2.55 && (!ls || ls.total <= 2);
  if(marketKey === 'under35') return (100 - safePct(raw.prob_over_35)) >= 68 && xgTotal <= 3.05 && (!ls || ls.total <= 3);
  if(marketKey === 'btts') return safePct(raw.prob_btts_yes) >= 58 && xgHome >= 0.90 && xgAway >= 0.90 && (!ls || ls.btts);
  if(marketKey === 'homeWin') return raw.predicted_result === 'H' && raw.favorite === 'H' && (xgHome - xgAway) >= 0.30 && probDraw < 27;
  if(marketKey === 'draw') return probDraw >= 28 && gap <= 0.25 && (!ls || ls.home === ls.away);
  if(marketKey === 'awayWin') return raw.predicted_result === 'A' && raw.favorite === 'A' && (xgAway - xgHome) >= 0.30 && probDraw < 27;
  return false;
}


function getDoubleChancePick(raw, extra, confidence){
  var options = [
    {label:'1X', prob: extra.prob1X, fairOdds: extra.fairOdds1X, side:'home'},
    {label:'X2', prob: extra.probX2, fairOdds: extra.fairOddsX2, side:'away'}
  ].filter(function(x){ return x.prob >= 72; });
  if(!options.length) return null;
  options.sort(function(a,b){ return b.prob - a.prob; });
  var best = options[0];
  var strength = best.prob >= 82 ? 'FOARTE PUTERNIC' : (best.prob >= 76 ? 'PUTERNIC' : 'MODERAT');
  return {
    label: best.label,
    prob: +best.prob.toFixed(2),
    fairOdds: best.fairOdds,
    confidence: normalizeConfidence(confidence),
    side: best.side,
    strength: strength
  };
}


function normalizeTrainingLeagueKey(name){
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function rebuildTrainingBaselineMap(){
  TRAINING_BASELINE_MAP = new Map();
  (Array.isArray(TRAINING_MARKET_BASELINES) ? TRAINING_MARKET_BASELINES : []).forEach(function(row){
    if(!row) return;
    var league = String(row.league || '').trim();
    if(!league) return;
    TRAINING_BASELINE_MAP.set(league, row);
    var normalized = normalizeTrainingLeagueKey(league);
    if(normalized) TRAINING_BASELINE_MAP.set(normalized, row);
  });
}
function getTrainingBaselineForLeague(leagueName){
  var name = String(leagueName || '').trim();
  if(!name || !TRAINING_BASELINE_MAP || !TRAINING_BASELINE_MAP.size) return null;
  return TRAINING_BASELINE_MAP.get(name) || TRAINING_BASELINE_MAP.get(normalizeTrainingLeagueKey(name)) || null;
}
function trainingMarketIsSupported(type){
  return ['over15','over25','under35','btts'].indexOf(String(type || '')) !== -1;
}
function getTrainingSummaryRateForType(type){
  var summary = TRAINING_SCORING_SUMMARY || {};
  if(type === 'over15') return Number(summary.over_15_rate_total || 0);
  if(type === 'over25') return Number(summary.over_25_rate_total || 0);
  if(type === 'under35') return Number(summary.under_35_rate_total || 0);
  if(type === 'btts') return Number(summary.btts_yes_rate_total || 0);
  return 0;
}
function getTrainingBaselineRateForType(baseline, type){
  var row = baseline || {};
  if(type === 'over15') return Number(row.over_15_rate || 0);
  if(type === 'over25') return Number(row.over_25_rate || 0);
  if(type === 'under35') return Number(row.under_35_rate || 0);
  if(type === 'btts') return Number(row.btts_yes_rate || 0);
  return 0;
}
function getTrainingMarketGate(type){
  if(type === 'over15') return { minRate:74, minProb:74, maxBoost:10 };
  if(type === 'over25') return { minRate:50, minProb:60, maxBoost:10 };
  if(type === 'under35') return { minRate:71, minProb:68, maxBoost:9 };
  if(type === 'btts') return { minRate:53, minProb:60, maxBoost:9 };
  return { minRate:0, minProb:0, maxBoost:0 };
}
function getTrainingBoostMeta(m, type, bet){
  if(!m || !bet || !trainingMarketIsSupported(type)){
    return { boost:0, reason:'', eligible:false, leagueRate:null, globalRate:null, deltaVsGlobal:null, matches:0 };
  }
  if(!Array.isArray(TRAINING_MARKET_BASELINES) || !TRAINING_MARKET_BASELINES.length){
    return { boost:0, reason:'', eligible:false, leagueRate:null, globalRate:null, deltaVsGlobal:null, matches:0 };
  }

  var leagueName = String(m.league || '').trim();
  var baseline = getTrainingBaselineForLeague(leagueName);
  var globalRate = getTrainingSummaryRateForType(type);
  var gate = getTrainingMarketGate(type);
  var prob = Number(bet.adjProb != null ? bet.adjProb : bet.prob || 0);

  if(!baseline){
    if(!leagueName){
      return { boost:0, reason:'', eligible:false, leagueRate:null, globalRate:isFinite(globalRate) ? globalRate : null, deltaVsGlobal:null, matches:0 };
    }
    return {
      boost:-4,
      reason:'Training -4.0 (ligă fără istoric eligibil)',
      eligible:false,
      leagueRate:null,
      globalRate:isFinite(globalRate) ? globalRate : null,
      deltaVsGlobal:null,
      matches:0
    };
  }

  var leagueRate = getTrainingBaselineRateForType(baseline, type);
  var matches = Number(baseline.matches || 0);
  var minMatches = Number((TRAINING_SCORING_SUMMARY || {}).min_scoring_matches || 120);
  var deltaVsGlobal = (isFinite(globalRate) ? (leagueRate - globalRate) : 0);
  var boost = 0;

  boost += Math.max(-4, Math.min(5, (leagueRate - gate.minRate) * 0.35));
  boost += Math.max(-2.5, Math.min(3.5, (prob - gate.minProb) * 0.18));
  boost += Math.max(-3, Math.min(3, deltaVsGlobal * 0.25));

  if(matches >= minMatches * 2) boost += 0.8;
  else if(matches >= minMatches * 1.4) boost += 0.4;

  if(leagueRate >= gate.minRate + 6 && prob >= gate.minProb + 8) boost += 1.0;
  if(leagueRate <= gate.minRate - 5 && prob <= gate.minProb - 4) boost -= 1.0;

  boost = Math.max(-5, Math.min(gate.maxBoost, boost));
  boost = Math.round(boost * 10) / 10;

  var reason = 'Training ' + (boost >= 0 ? '+' : '') + boost.toFixed(1) + ' (Liga ' + leagueRate.toFixed(1) + '% vs global ' + globalRate.toFixed(1) + '%)';
  return {
    boost: boost,
    reason: reason,
    eligible: true,
    leagueRate: leagueRate,
    globalRate: globalRate,
    deltaVsGlobal: deltaVsGlobal,
    matches: matches
  };
}


// ============================================================
// LEARNING ENGINE — continuous pattern discovery from journal
// Analizeaza toate pariurile settled din RECOMMENDATION_JOURNAL
// si deriveaza multiplicatori/filtre adaptive pentru smartScore.
// ============================================================
var LEARNING_ENGINE_VERSION = 'v1.0';
var LEARNING_ENGINE_HALF_LIFE = 90; // zile, decay exponential

function learningBuckets(){
  return {
    oddsBuckets: [
      {min:1.00, max:1.25, label:'1.00-1.25'},
      {min:1.25, max:1.40, label:'1.25-1.40'},
      {min:1.40, max:1.60, label:'1.40-1.60'},
      {min:1.60, max:1.85, label:'1.60-1.85'},
      {min:1.85, max:2.20, label:'1.85-2.20'},
      {min:2.20, max:999,  label:'2.20+'}
    ],
    edgeBuckets: [
      {min:-999, max:3,   label:'<3%'},
      {min:3,    max:5,   label:'3-5%'},
      {min:5,    max:8,   label:'5-8%'},
      {min:8,    max:12,  label:'8-12%'},
      {min:12,   max:999, label:'12%+'}
    ],
    scoreBuckets: [
      {min:0,  max:65, label:'<65'},
      {min:65, max:75, label:'65-75'},
      {min:75, max:85, label:'75-85'},
      {min:85, max:95, label:'85-95'},
      {min:95, max:999,label:'95+'}
    ],
    probBuckets: [
      {min:0,  max:55, label:'<55'},
      {min:55, max:65, label:'55-65'},
      {min:65, max:75, label:'65-75'},
      {min:75, max:85, label:'75-85'},
      {min:85, max:999,label:'85+'}
    ],
    weekdayNames: ['Duminica','Luni','Marti','Miercuri','Joi','Vineri','Sambata']
  };
}

function learningAssignBucket(value, buckets){
  var v = Number(value);
  if(!isFinite(v)) return null;
  for(var i=0;i<buckets.length;i++){
    if(v >= buckets[i].min && v < buckets[i].max) return buckets[i].label;
  }
  return null;
}

function learningRowOutcome(row){
  if(!row) return null;
  if(row.won === true) return 1;
  if(row.won === false) return 0;
  var st = String(row.status || '').toLowerCase();
  if(st === 'win') return 1;
  if(st === 'lose' || st === 'loss') return 0;
  return null;
}

function learningRowProfit(row){
  var outcome = learningRowOutcome(row);
  if(outcome === null) return 0;
  var odds = Number(row && row.odds || 0);
  if(!isFinite(odds) || odds < 1.01) return outcome === 1 ? 0 : -1;
  return outcome === 1 ? (odds - 1) : -1;
}

function learningRowWeekdayIdx(row){
  var dt = row && (row.event_date || row.settled_at || row.first_logged_at);
  if(!dt) return -1;
  try {
    var d = new Date(dt);
    var di = d.getDay();
    return (di >= 0 && di <= 6) ? di : -1;
  } catch(e){ return -1; }
}

function learningRowAgeDays(row, nowMs){
  var dt = row && (row.settled_at || row.event_date || row.first_logged_at);
  if(!dt) return 999;
  try {
    var t = new Date(dt).getTime();
    if(!isFinite(t)) return 999;
    return Math.max(0, (nowMs - t) / 86400000);
  } catch(e){ return 999; }
}

function learningDecayWeight(ageDays){
  return Math.pow(0.5, ageDays / LEARNING_ENGINE_HALF_LIFE);
}

function learningWilsonLCB(wins, n, z){
  z = z || 1.28; // 80% CI - mai permisiv pentru sample-uri medii
  if(n <= 0) return 0;
  var p = wins / n;
  var a = p + z*z/(2*n);
  var b = z * Math.sqrt(p*(1-p)/n + z*z/(4*n*n));
  return (a - b) / (1 + z*z/n);
}

function learningStatsAcc(){
  return {
    bets:0, wins:0, losses:0, profit:0, edge_sum:0, odds_sum:0,
    bets_w:0, wins_w:0, profit_w:0,
    bets_30:0, wins_30:0, profit_30:0,
    bets_90:0, wins_90:0, profit_90:0
  };
}

function learningAddRow(stats, row, weight, ageDays){
  var outcome = learningRowOutcome(row);
  if(outcome === null) return;
  var profit = learningRowProfit(row);
  var odds = Number(row.odds || 0);
  var edge = Number(row.edge_pct || 0);
  stats.bets += 1;
  stats.profit += profit;
  stats.edge_sum += edge;
  stats.odds_sum += odds;
  if(outcome === 1) stats.wins += 1; else stats.losses += 1;
  stats.bets_w += weight;
  stats.profit_w += weight * profit;
  if(outcome === 1) stats.wins_w += weight;
  if(ageDays <= 30){
    stats.bets_30 += 1; stats.profit_30 += profit;
    if(outcome === 1) stats.wins_30 += 1;
  }
  if(ageDays <= 90){
    stats.bets_90 += 1; stats.profit_90 += profit;
    if(outcome === 1) stats.wins_90 += 1;
  }
}

function learningFinalize(stats){
  if(!stats || stats.bets <= 0){
    if(stats){
      stats.roi=0; stats.winrate=0; stats.avg_odds=0; stats.avg_edge=0;
      stats.roi_w=0; stats.winrate_w=0;
      stats.roi_30=0; stats.winrate_30=0;
      stats.roi_90=0; stats.winrate_90=0;
      stats.wilson_lcb=0;
    }
    return stats;
  }
  stats.roi = stats.profit / stats.bets;
  stats.winrate = stats.wins / stats.bets;
  stats.avg_odds = stats.odds_sum / stats.bets;
  stats.avg_edge = stats.edge_sum / stats.bets;
  stats.roi_w = stats.bets_w > 0 ? stats.profit_w / stats.bets_w : 0;
  stats.winrate_w = stats.bets_w > 0 ? stats.wins_w / stats.bets_w : 0;
  stats.roi_30 = stats.bets_30 > 0 ? stats.profit_30 / stats.bets_30 : 0;
  stats.winrate_30 = stats.bets_30 > 0 ? stats.wins_30 / stats.bets_30 : 0;
  stats.roi_90 = stats.bets_90 > 0 ? stats.profit_90 / stats.bets_90 : 0;
  stats.winrate_90 = stats.bets_90 > 0 ? stats.wins_90 / stats.bets_90 : 0;
  stats.wilson_lcb = learningWilsonLCB(stats.wins, stats.bets);
  return stats;
}

function learningStatsMultiplier(stats){
  var MIN_CONF_SAMPLE = 12;
  if(!stats || stats.bets < 2){
    return {multiplier:1.0, confidence:'insufficient', toxic:false, boost:0, roi:0, bets:0, raw_bets:(stats&&stats.bets)||0};
  }
  var roi = stats.roi_w;
  var sampleFactor = Math.min(1.0, stats.bets_w / MIN_CONF_SAMPLE);
  // V17 FIX: Threshold mult mai strict. Walk-forward arata ca motorul blocheaza prea mult.
  // Vechi: bets>=12, ROI<=-20% -> prea multe fals-pozitive (24% din blocate erau win-uri ratate)
  // Nou: bets>=20, ROI<=-25% -> doar pattern-uri cu adevarat stabile si nocive
  var toxic = (stats.bets >= 20) && (roi <= -0.25);
  // Multiplicator: 1 + ROI * 1.5 * sampleFactor, clamp [0.60, 1.40]
  var multi = 1.0 + (roi * 1.5 * sampleFactor);
  multi = Math.max(0.60, Math.min(1.40, multi));
  // Boost aditiv pentru baseScore
  var boost = roi * 30 * sampleFactor;
  boost = Math.max(-10, Math.min(12, boost));
  boost = Math.round(boost * 10) / 10;
  var conf = stats.bets >= 20 ? 'high' : (stats.bets >= MIN_CONF_SAMPLE ? 'medium' : 'low');
  return {
    multiplier: multi, confidence: conf, toxic: toxic, boost: boost,
    roi: roi, winrate: stats.winrate_w, bets: stats.bets_w, raw_bets: stats.bets
  };
}

// ============================================================
// Orchestrator — ruleaza la fiecare refresh pe RECOMMENDATION_JOURNAL
// ============================================================
// ============================================================
// INJURY ADJUSTMENT — ajusteaza probabilitati in functie de absentele
// din raw.event.unavailable_players (injured, doubtful, suspended).
// ============================================================
function calcInjuryAdjustment(raw, marketKey){
  var up = raw && raw.event && raw.event.unavailable_players;
  if(!up || typeof up !== 'object'){
    return {adjustment:0, home:0, away:0, summary:'', applied:false};
  }
  function weight(list){
    if(!Array.isArray(list)) return 0;
    var w = 0;
    list.forEach(function(p){
      if(!p) return;
      var s = String(p.status || '').toLowerCase();
      if(s === 'injured') w += 1.0;
      else if(s === 'suspended') w += 1.0;
      else if(s === 'doubtful') w += 0.5;
      else if(s === 'unavailable') w += 0.8;
    });
    return w;
  }
  var h = weight(up.home);
  var a = weight(up.away);
  var total = h + a;
  if(total < 1.0){
    return {adjustment:0, home:h, away:a, summary:'', applied:false};
  }
  // Pragul de 1.0 — pana la 1 absent cumulat, nu ajustam (rotatie normala)
  var baseAbs = Math.min(4.5, (total - 1.0) * 0.55);
  var adjustment = 0;
  switch(marketKey){
    case 'over15':  adjustment = -baseAbs * 0.65; break;
    case 'over25':  adjustment = -baseAbs * 0.90; break;
    case 'over35':  adjustment = -baseAbs * 1.00; break;
    case 'under15': adjustment =  baseAbs * 0.65; break;
    case 'under25': adjustment =  baseAbs * 0.90; break;
    case 'under35': adjustment =  baseAbs * 0.65; break;
    case 'btts':    adjustment = -baseAbs * 0.70; break;
    case 'homeWin': adjustment = -h * 1.10 + a * 0.55; break;
    case 'awayWin': adjustment = -a * 1.10 + h * 0.55; break;
    case 'draw':    adjustment =  Math.abs(h - a) * 0.25 - Math.max(0, total - 2) * 0.35; break;
    default: adjustment = 0;
  }
  adjustment = Math.max(-6, Math.min(6, adjustment));
  adjustment = Math.round(adjustment * 10) / 10;
  var summary = '';
  if(Math.abs(adjustment) >= 0.3){
    var parts = [];
    if(h > 0) parts.push(h.toFixed(1).replace(/\.0$/,'') + ' acasa');
    if(a > 0) parts.push(a.toFixed(1).replace(/\.0$/,'') + ' deplasare');
    summary = 'Absente ' + parts.join(' / ') + ': ' + (adjustment >= 0 ? '+' : '') + adjustment.toFixed(1) + 'pp';
  }
  return {
    adjustment: adjustment,
    home: Math.round(h * 10) / 10,
    away: Math.round(a * 10) / 10,
    summary: summary,
    applied: Math.abs(adjustment) >= 0.3
  };
}

// ============================================================
// PROBABILITY CALIBRATION — invata din jurnal un mapping
// monoton intre probabilitate prezisa si rata reala de hit.
// Smoothed Bayesian + interpolare liniara intre buckets.
// ============================================================
var CALIBRATION_MAP = null;

function buildCalibrationMap(){
  var journal = (window.RECOMMENDATION_JOURNAL || RECOMMENDATION_JOURNAL || []);
  if(!Array.isArray(journal) || journal.length < 20){
    CALIBRATION_MAP = null;
    return null;
  }
  var BUCKET = 5; // 40-45, 45-50, ..., 95-100
  var tmp = {};
  journal.forEach(function(r){
    if(!r || (r.won !== true && r.won !== false)) return;
    var mk = String(r.market_key || ''); if(!mk) return;
    var prob = Number(r.adjusted_prob != null ? r.adjusted_prob : r.model_prob || 0);
    if(!isFinite(prob) || prob < 35 || prob > 99) return;
    var bkt = Math.floor(prob / BUCKET) * BUCKET;
    var key = mk + '|' + bkt;
    if(!tmp[key]) tmp[key] = {market:mk, bucket:bkt, mid:bkt + BUCKET/2, wins:0, bets:0};
    tmp[key].bets += 1;
    if(r.won === true) tmp[key].wins += 1;
  });
  var byMarket = {};
  Object.keys(tmp).forEach(function(k){
    var row = tmp[k];
    // Bayesian smoothing: prior 3W + 3L
    row.smoothed = 100 * (row.wins + 3) / (row.bets + 6);
    row.raw_rate = 100 * row.wins / Math.max(1, row.bets);
    if(!byMarket[row.market]) byMarket[row.market] = [];
    byMarket[row.market].push(row);
  });
  // Aplicam Pool Adjacent Violators (versiune simplificata) + blend cu identitate la sample mic
  var MIN_BETS = 10;
  var calibrated = {};
  Object.keys(byMarket).forEach(function(mk){
    var rows = byMarket[mk].slice().sort(function(a,b){ return a.mid - b.mid; });
    // Pass 1: calcul "final" initial — buckets sub MIN_BETS folosesc identitate (nu distorsioneaza PAV)
    rows.forEach(function(r){
      if(r.bets < MIN_BETS){
        // sub pragul minim: pondere 15% smoothed / 85% identitate (prea sensibil altfel la outlier)
        r.final = 0.15 * r.smoothed + 0.85 * r.mid;
        r.low_confidence = true;
      } else {
        r.final = r.smoothed;
        r.low_confidence = false;
      }
    });
    // Pass 2: PAV forward — asigura monotonicitate non-decrescanta
    var groups = rows.map(function(r){ return {rows:[r], total:r.final, w:1}; });
    var changed = true;
    while(changed){
      changed = false;
      for(var i = 0; i < groups.length - 1; i++){
        var meanA = groups[i].total / groups[i].w;
        var meanB = groups[i+1].total / groups[i+1].w;
        if(meanA > meanB){
          // merge i+1 into i
          groups[i].rows = groups[i].rows.concat(groups[i+1].rows);
          groups[i].total += groups[i+1].total;
          groups[i].w += groups[i+1].w;
          groups.splice(i+1, 1);
          changed = true;
          break;
        }
      }
    }
    // Scrie valorile merged inapoi in rows
    groups.forEach(function(g){
      var mean = g.total / g.w;
      g.rows.forEach(function(r){ r.final = mean; });
    });
    calibrated[mk] = rows;
  });
  CALIBRATION_MAP = calibrated;
  try {
    var marketsTxt = Object.keys(calibrated).map(function(k){ return k + '(' + calibrated[k].length + 'b)'; }).join(', ');
    console.log('[Calibration] built for', Object.keys(calibrated).length, 'markets:', marketsTxt);
  } catch(e){}
  return CALIBRATION_MAP;
}

function calibrateProb(probRaw, marketKey){
  var p = Number(probRaw);
  if(!isFinite(p) || p <= 0) return null;
  if(!CALIBRATION_MAP || !CALIBRATION_MAP[marketKey]) return null;
  var rows = CALIBRATION_MAP[marketKey];
  if(!rows || rows.length < 2) return null;
  // Interpolare liniara intre midpoints
  if(p <= rows[0].mid) return rows[0].final;
  if(p >= rows[rows.length - 1].mid) return rows[rows.length - 1].final;
  for(var i = 0; i < rows.length - 1; i++){
    if(p >= rows[i].mid && p <= rows[i+1].mid){
      var span = rows[i+1].mid - rows[i].mid;
      if(span <= 0) return rows[i].final;
      var t = (p - rows[i].mid) / span;
      return rows[i].final + t * (rows[i+1].final - rows[i].final);
    }
  }
  return null;
}

// ============================================================
// WALK-FORWARD VALIDATION — simuleaza ce s-ar fi intamplat daca
// motorul de invatare ar fi fost activ de la prima intrare in jurnal.
// Foloseste doar datele anterioare fiecarui pariu ca sa ia decizia.
// ============================================================
var WALK_FORWARD_CACHE = null;

function computeWalkForwardValidation(){
  var journal = (window.RECOMMENDATION_JOURNAL || RECOMMENDATION_JOURNAL || [])
    .filter(function(r){ return r && (r.won === true || r.won === false) && r.market_key; })
    .slice()
    .sort(function(a,b){
      var ta = new Date(a.settled_at || a.event_date || a.first_logged_at || 0).getTime();
      var tb = new Date(b.settled_at || b.event_date || b.first_logged_at || 0).getTime();
      if(!isFinite(ta)) ta = 0; if(!isFinite(tb)) tb = 0;
      return ta - tb;
    });
  if(journal.length < 30){
    WALK_FORWARD_CACHE = null;
    return null;
  }
  var buckets = learningBuckets();
  var prior = {market_league:{}, market_edge:{}, market_weekday:{}};
  function ensure(tbl, key){ if(!tbl[key]) tbl[key] = {bets:0, wins:0, profit:0}; return tbl[key]; }
  // V17 FIX: aliniat cu thresholds noi din learningStatsMultiplier (20 bets / -25% ROI).
  // Vechi: bets>=12, ROI<=-20% -> prea agresiv, 87+ winners blocati.
  // Nou: bets>=20, ROI<=-25% -> doar pattern-uri cu adevarat nocive.
  function isToxic(s){ return s && s.bets >= 20 && (s.profit / s.bets) <= -0.25; }
  // V17 FIX: weekday check dezactivat complet (zero cauzalitate "Sambata" -> rezultat).
  function isToxicWeekday(s){ return s && s.bets >= 30 && (s.profit / s.bets) <= -0.35; }

  var actualProfit = 0, simulatedProfit = 0;
  var savedLosses = 0, savedUnits = 0, missedWins = 0, missedUnits = 0;
  var blockedSamples = [];
  var correctBlocks = 0, wrongBlocks = 0;

  // Pentru ROI rolling (ultimele 90 zile vs total) — sliding window incremental ar fi mai complex, sarim
  var rollingDelta = [];

  journal.forEach(function(r, idx){
    var mk = String(r.market_key || '');
    var league = String(r.league || '—');
    var odds = Number(r.odds || 0);
    var edge = Number(r.edge_pct || 0);
    var wdIdx = learningRowWeekdayIdx(r);
    var wdName = (wdIdx >= 0 && wdIdx <= 6) ? buckets.weekdayNames[wdIdx] : null;
    var eB = learningAssignBucket(edge, buckets.edgeBuckets);
    var profit = (r.won === true) ? Math.max(0, odds - 1) : -1;

    // Decizie bazata DOAR pe pariurile anterioare
    var wouldBlock = false, reason = '', reasonKind = '';
    var sL = prior.market_league[mk+'|'+league];
    var sE = eB ? prior.market_edge[mk+'|'+eB] : null;
    var sW = wdName ? prior.market_weekday[mk+'|'+wdName] : null;
    if(isToxic(sL)){ wouldBlock = true; reason = league; reasonKind = 'liga'; }
    else if(isToxic(sE)){ wouldBlock = true; reason = 'edge ' + eB; reasonKind = 'edge'; }
    else if(isToxicWeekday(sW)){ wouldBlock = true; reason = wdName; reasonKind = 'zi'; }

    actualProfit += profit;
    if(wouldBlock){
      if(r.won === true){
        missedWins += 1;
        missedUnits += Math.max(0, odds - 1);
        wrongBlocks += 1;
      } else {
        savedLosses += 1;
        savedUnits += 1;
        correctBlocks += 1;
      }
      if(blockedSamples.length < 30){
        blockedSamples.push({
          row: r, reason: reason, reasonKind: reasonKind, profit: profit, won: r.won === true,
          settled_at: r.settled_at || r.event_date || ''
        });
      }
    } else {
      simulatedProfit += profit;
    }

    if(idx > 0 && idx % 25 === 0){
      rollingDelta.push({
        idx: idx, actual_roi: actualProfit / (idx+1),
        sim_roi: simulatedProfit / Math.max(1, (idx+1) - (correctBlocks + wrongBlocks))
      });
    }

    // Update priors cu pariul curent pentru iteratiile urmatoare
    function upd(tbl, key){
      var s = ensure(tbl, key);
      s.bets += 1;
      if(r.won === true) s.wins += 1;
      s.profit += profit;
    }
    upd(prior.market_league, mk+'|'+league);
    if(eB) upd(prior.market_edge, mk+'|'+eB);
    if(wdName) upd(prior.market_weekday, mk+'|'+wdName);
  });

  var totalBets = journal.length;
  var simulatedBets = totalBets - (correctBlocks + wrongBlocks);
  var actualROI = actualProfit / totalBets;
  var simROI = simulatedBets > 0 ? simulatedProfit / simulatedBets : 0;
  var engineNetUnits = savedUnits - missedUnits;
  var totalBlocks = correctBlocks + wrongBlocks;
  var blockAccuracy = totalBlocks > 0 ? correctBlocks / totalBlocks : 0;

  // V17: simulare sizing-aware — testeaza impactul computeStakeMultiplier(row)
  // Ruleaza pe aceeasi secventa, dar in loc de "block da/nu", fiecare pariu primeste
  // un multiplicator de miza 0.25-1.30 si calculam ROI ponderat + profit ponderat.
  var sizingProfit = 0, sizingStakeSum = 0, sizingBetsFull = 0, sizingBetsReduced = 0;
  var sizingFlatProfit = 0; // pentru comparatie: acelasi pool, miza fixa
  if(typeof computeStakeMultiplier === 'function'){
    journal.forEach(function(r){
      var odds = Number(r.odds || 0);
      var profit = (r.won === true) ? Math.max(0, odds - 1) : -1;
      var mult = computeStakeMultiplier({
        edge_pct: Number(r.edge_pct || 0),
        odds: odds,
        poisson_delta: Number(r.poisson_delta || 0),
        adjusted_prob: Number(r.adjusted_prob || 0),
        model_prob: Number(r.model_prob || r.api_prob || 0),
        from_open_pct: Number(r.from_open_pct || 0),
        learningToxic: false
      });
      sizingProfit += profit * mult;
      sizingStakeSum += mult;
      sizingFlatProfit += profit;
      if(mult >= 1.0) sizingBetsFull += 1;
      else sizingBetsReduced += 1;
    });
  }
  var sizingROI = sizingStakeSum > 0 ? (sizingProfit / sizingStakeSum) : 0;
  var sizingFlatROI = journal.length > 0 ? (sizingFlatProfit / journal.length) : 0;
  var sizingDeltaPP = (sizingROI - sizingFlatROI) * 100;
  // Net units aditional prin sizing: fata de miza fixa 1u, cat am produs in plus?
  var sizingFlatTotalUnits = journal.length; // stake 1u per pariu = total stake
  var sizingFlatProfitPerUnit = sizingFlatProfit; // profit absolut la miza fixa 1u
  var sizingFinalProfit = sizingProfit; // profit absolut cu stake variabil
  var sizingNetUnits = sizingFinalProfit - (sizingFlatProfitPerUnit * (sizingStakeSum / sizingFlatTotalUnits));

  WALK_FORWARD_CACHE = {
    total_bets: totalBets,
    actual_profit: actualProfit,
    actual_roi: actualROI,
    simulated_bets: simulatedBets,
    simulated_profit: simulatedProfit,
    simulated_roi: simROI,
    delta_roi_pp: (simROI - actualROI) * 100,
    engine_net_units: engineNetUnits,
    total_blocks: totalBlocks,
    correct_blocks: correctBlocks,
    wrong_blocks: wrongBlocks,
    block_accuracy: blockAccuracy,
    saved_losses: savedLosses,
    saved_units: savedUnits,
    missed_wins: missedWins,
    missed_units: missedUnits,
    blocked_samples: blockedSamples.reverse(), // cele mai recente primele
    rolling_delta: rollingDelta,
    journal_sorted_count: journal.length,
    // V17: sizing simulation
    sizing_roi: sizingROI,
    sizing_flat_roi: sizingFlatROI,
    sizing_delta_pp: sizingDeltaPP,
    sizing_stake_sum: sizingStakeSum,
    sizing_profit: sizingProfit,
    sizing_bets_full: sizingBetsFull,
    sizing_bets_reduced: sizingBetsReduced,
    sizing_net_units: sizingNetUnits
  };
  try { console.log('[WalkForward] total=' + totalBets + ' blocks=' + totalBlocks + ' correct=' + correctBlocks + ' wrong=' + wrongBlocks + ' net=' + engineNetUnits.toFixed(2) + 'u deltaROI=' + ((simROI - actualROI) * 100).toFixed(2) + 'pp | sizing_delta=' + sizingDeltaPP.toFixed(2) + 'pp sizing_net=' + sizingNetUnits.toFixed(2) + 'u'); } catch(e){}
  return WALK_FORWARD_CACHE;
}

// ============================================================
// EXTENDED ANALYTICS — time-to-kickoff, probability source, A/B filter
// Apelate din buildLearningEngine, afișate în renderLearningEngine.
// ============================================================

function buildTimeToKickoffAnalysis(journal){
  // Buckets: <24h (same-day), 24-48h, 48-72h, 72h+
  var buckets = {
    '<24h':  {bets:0, wins:0, profit:0, by_market:{}},
    '24-48h':{bets:0, wins:0, profit:0, by_market:{}},
    '48-72h':{bets:0, wins:0, profit:0, by_market:{}},
    '72h+':  {bets:0, wins:0, profit:0, by_market:{}}
  };
  var order = ['<24h','24-48h','48-72h','72h+'];
  function bucketFor(hrs){
    if(hrs < 24) return '<24h';
    if(hrs < 48) return '24-48h';
    if(hrs < 72) return '48-72h';
    return '72h+';
  }
  (journal || []).forEach(function(r){
    if(!r || (r.won !== true && r.won !== false)) return;
    var ed = r.event_date, fl = r.first_logged_at;
    if(!ed || !fl) return;
    try {
      var edMs = new Date(ed).getTime(), flMs = new Date(fl).getTime();
      if(!isFinite(edMs) || !isFinite(flMs)) return;
      var hrs = (edMs - flMs) / 3600000;
      if(hrs < 0 || hrs > 1000) return;
      var bk = bucketFor(hrs);
      var mk = String(r.market_key || '');
      var odds = Number(r.odds || 0);
      var profit = r.won === true ? Math.max(0, odds - 1) : -1;
      buckets[bk].bets += 1;
      buckets[bk].profit += profit;
      if(r.won === true) buckets[bk].wins += 1;
      if(mk){
        if(!buckets[bk].by_market[mk]) buckets[bk].by_market[mk] = {bets:0, wins:0, profit:0};
        buckets[bk].by_market[mk].bets += 1;
        buckets[bk].by_market[mk].profit += profit;
        if(r.won === true) buckets[bk].by_market[mk].wins += 1;
      }
    } catch(e){}
  });
  // Finalize
  order.forEach(function(k){
    var b = buckets[k];
    b.roi = b.bets > 0 ? b.profit / b.bets : 0;
    b.winrate = b.bets > 0 ? b.wins / b.bets : 0;
    Object.keys(b.by_market).forEach(function(mk){
      var m = b.by_market[mk];
      m.roi = m.bets > 0 ? m.profit / m.bets : 0;
      m.winrate = m.bets > 0 ? m.wins / m.bets : 0;
    });
  });
  return { buckets: buckets, order: order };
}

function buildProbabilitySourceAnalysis(journal){
  // Categoriile: model-only (api_prob == adjusted_prob), hybrid (poisson ∆ > 5pp de API),
  // adjusted-only (adjusted ∆ > 2pp față de model, dar poisson ≈ api), fallback
  var groups = {
    'API dominant':    {bets:0, wins:0, profit:0, label:'API dominant', desc:'Poisson delta < 5pp'},
    'Poisson hybrid':  {bets:0, wins:0, profit:0, label:'Poisson hybrid', desc:'Poisson ajustează API cu >5pp'},
    'Adjusted strong': {bets:0, wins:0, profit:0, label:'Adjusted strong', desc:'AI adjustment >5pp față de model'}
  };
  (journal || []).forEach(function(r){
    if(!r || (r.won !== true && r.won !== false)) return;
    var api = Number(r.api_prob || 0);
    var poisson = Number(r.poisson_prob || 0);
    var model = Number(r.model_prob || 0);
    var adjusted = Number(r.adjusted_prob || 0);
    var odds = Number(r.odds || 0);
    var profit = r.won === true ? Math.max(0, odds - 1) : -1;

    var poissonDelta = poisson && api ? Math.abs(poisson - api) : 0;
    var adjDelta = adjusted && model ? Math.abs(adjusted - model) : 0;

    var g;
    if(poissonDelta > 5) g = 'Poisson hybrid';
    else if(adjDelta > 5) g = 'Adjusted strong';
    else g = 'API dominant';

    groups[g].bets += 1;
    groups[g].profit += profit;
    if(r.won === true) groups[g].wins += 1;
  });
  Object.keys(groups).forEach(function(k){
    var g = groups[k];
    g.roi = g.bets > 0 ? g.profit / g.bets : 0;
    g.winrate = g.bets > 0 ? g.wins / g.bets : 0;
  });
  return groups;
}

function buildFilterABAnalysis(journal){
  // Compara: pool brut (toate value>0) vs pool dupa filter "SmartBet-like"
  // Filter: adjusted_prob >= 70 AND edge_pct >= 3 AND score >= 75
  var raw = {bets:0, wins:0, profit:0};
  var filtered = {bets:0, wins:0, profit:0};
  var lost_wins = 0, lost_wins_units = 0;
  var avoided_losses = 0, avoided_losses_units = 0;
  var sample_lost = [];

  (journal || []).forEach(function(r){
    if(!r || (r.won !== true && r.won !== false)) return;
    var val = Number(r.value || 0);
    if(val <= 0) return;
    var odds = Number(r.odds || 0);
    var profit = r.won === true ? Math.max(0, odds - 1) : -1;
    raw.bets += 1; raw.profit += profit;
    if(r.won === true) raw.wins += 1;

    var prob = Number(r.adjusted_prob || 0);
    var edge = Number(r.edge_pct || 0);
    var score = Number(r.score || 0);
    var passes = prob >= 70 && edge >= 3 && score >= 75;

    if(passes){
      filtered.bets += 1; filtered.profit += profit;
      if(r.won === true) filtered.wins += 1;
    } else {
      if(r.won === true){
        lost_wins += 1; lost_wins_units += profit;
        if(sample_lost.length < 10) sample_lost.push({row:r, profit:profit, kind:'lost_win'});
      } else {
        avoided_losses += 1; avoided_losses_units += 1;
      }
    }
  });

  raw.roi = raw.bets > 0 ? raw.profit / raw.bets : 0;
  raw.winrate = raw.bets > 0 ? raw.wins / raw.bets : 0;
  filtered.roi = filtered.bets > 0 ? filtered.profit / filtered.bets : 0;
  filtered.winrate = filtered.bets > 0 ? filtered.wins / filtered.bets : 0;

  return {
    raw: raw,
    filtered: filtered,
    delta_roi_pp: (filtered.roi - raw.roi) * 100,
    delta_net_units: filtered.profit - raw.profit,
    lost_wins: lost_wins,
    lost_wins_units: lost_wins_units,
    avoided_losses: avoided_losses,
    avoided_losses_units: avoided_losses_units,
    net_filter_value: avoided_losses_units - lost_wins_units,
    sample_lost: sample_lost.slice(0, 8)
  };
}

function buildSmartBetModeABAnalysis(journal){
  var rows = (journal || []).filter(function(r){
    return r && (r.won === true || r.won === false) && Number(r.value || 0) > 0;
  });
  function makeStats(label){
    return { label:label, bets:0, wins:0, profit:0, roi:0, winrate:0 };
  }
  var modes = {
    off: makeStats('OFF / Pool brut'),
    balanced: makeStats('BALANCED'),
    strict: makeStats('STRICT')
  };
  rows.forEach(function(r){
    var odds = Number(r.odds || 0);
    var profit = r.won === true ? Math.max(0, odds - 1) : -1;
    var prob = Number(r.adjusted_prob || 0);
    var edge = Number(r.edge_pct || 0);
    var score = Number(r.score || 0);
    [['off', true], ['balanced', prob >= 68 && edge >= 2 && score >= 70], ['strict', prob >= 70 && edge >= 3 && score >= 75]].forEach(function(def){
      if(!def[1]) return;
      var s = modes[def[0]];
      s.bets += 1;
      s.profit += profit;
      if(r.won === true) s.wins += 1;
    });
  });
  ['off','balanced','strict'].forEach(function(key){
    var s = modes[key];
    s.roi = s.bets ? (s.profit / s.bets) : 0;
    s.winrate = s.bets ? (s.wins / s.bets) : 0;
  });
  var eligible = ['off','balanced','strict'].map(function(key){
    return { key:key, stats:modes[key] };
  }).filter(function(entry){ return entry.stats.bets >= 12; });
  eligible.sort(function(a,b){
    if(Number(b.stats.roi || 0) !== Number(a.stats.roi || 0)) return Number(b.stats.roi || 0) - Number(a.stats.roi || 0);
    if(Number(b.stats.profit || 0) !== Number(a.stats.profit || 0)) return Number(b.stats.profit || 0) - Number(a.stats.profit || 0);
    return Number(b.stats.bets || 0) - Number(a.stats.bets || 0);
  });
  var bestKey = eligible.length ? eligible[0].key : 'off';
  return {
    modes:modes,
    bestMode:bestKey,
    strictDeltaRoi: (modes.strict.roi - modes.off.roi) * 100,
    balancedDeltaRoi: (modes.balanced.roi - modes.off.roi) * 100
  };
}

function getSmartBetModeThresholds(mode){
  // v7 Profit Edition: un singur set de praguri ridicate.
  // Modul 'off' eliminat — dacă motorul nu adaugă valoare, e mai bine să pariezi zero.
  // Modul 'strict' este noul default. 'balanced' relaxat minim pentru zile cu puțin volume.
  if(mode === 'balanced'){
    return {
      mode:'balanced', label:'BALANCED',
      blockNegative:true, minNegPatternBets:6, minNegPatternRoi:-8,
      directProb:68, directEdge:5,
      highProb:76, highKelly:1.5, highEdge:7, highScore:80,
      // signalStrong ELIMINAT — nu mai există calea fără confirmare AI Memory
      patternProb:74, patternKelly:0.8, patternEdge:6,
      oddsMin:1.20
    };
  }
  if(mode === 'off'){
    // 'off' redirectat la balanced — nu mai expunem pool brut
    return getSmartBetModeThresholds('balanced');
  }
  // strict (default)
  return {
    mode:'strict', label:'STRICT',
    blockNegative:true, minNegPatternBets:4, minNegPatternRoi:0,
    directProb:72, directEdge:6,
    highProb:80, highKelly:2.0, highEdge:8, highScore:82,
    // signalStrong ELIMINAT complet
    patternProb:76, patternKelly:1.0, patternEdge:7,
    oddsMin:1.20
  };
}

function getSmartBetEnginePolicy(){
  var journal = (window.RECOMMENDATION_JOURNAL || RECOMMENDATION_JOURNAL || []);
  var modeAB = buildSmartBetModeABAnalysis(journal);
  var wf = WALK_FORWARD_CACHE || computeWalkForwardValidation();
  var mode = modeAB.bestMode || 'balanced';
  var state = 'neutral';
  var reason = 'Se merge pe modul cu cel mai bun ROI din sample-ul recent.';
  if(wf && wf.total_bets >= 30){
    if(wf.delta_roi_pp <= -0.75 || wf.engine_net_units <= -2 || wf.block_accuracy < 0.30){
      mode = 'off';
      state = 'harmful';
      reason = 'Motorul blochează prea multe win-uri și scade profitul.';
    } else if(wf.delta_roi_pp < 0 || wf.engine_net_units < 0 || wf.block_accuracy < 0.42){
      if(mode === 'strict') mode = 'balanced';
      state = mode === 'off' ? 'harmful' : 'neutral';
      reason = mode === 'balanced'
        ? 'STRICT este prea agresiv; BALANCED păstrează mai multă valoare.'
        : 'E mai sigur fără blocare agresivă până se repară pattern-urile negative.';
    } else if(wf.delta_roi_pp >= 1 && wf.engine_net_units > 0 && wf.block_accuracy >= 0.50){
      state = 'positive';
      reason = mode === 'strict'
        ? 'STRICT adaugă valoare și poate rămâne activ.'
        : 'Motorul este sănătos, dar BALANCED păstrează raportul risc/volum mai bun.';
    } else {
      state = mode === 'off' ? 'harmful' : 'neutral';
      reason = mode === 'balanced'
        ? 'BALANCED este varianta prudentă pe sample-ul actual.'
        : 'Motorul nu e suficient de puternic pentru STRICT.';
    }
  } else {
    state = mode === 'strict' ? 'positive' : 'neutral';
    reason = 'Sample insuficient pentru auto-switch hard; se folosește cel mai bun mod din A/B.';
  }
  var label = mode === 'off' ? 'OFF / Pool brut' : (mode === 'balanced' ? 'BALANCED' : 'STRICT');
  return {
    mode: mode,
    label: label,
    state: state,
    reason: reason,
    modeAB: modeAB,
    wf: wf
  };
}

// ============================================================
// UI RENDERING — extended analytics block
// ============================================================

function renderExtendedAnalytics(){
  var root = document.getElementById('extended-analytics-root');
  if(!root) return;
  var journal = (window.RECOMMENDATION_JOURNAL || RECOMMENDATION_JOURNAL || []);
  if(!Array.isArray(journal) || journal.length < 20){
    root.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Analitica extinsă are nevoie de minim 20 de pariuri settled.</div>';
    return;
  }

  var ttk = buildTimeToKickoffAnalysis(journal);
  var probSrc = buildProbabilitySourceAnalysis(journal);
  var ab = buildFilterABAnalysis(journal);

  var signedPct = function(n, d){ d = d == null ? 2 : d; var v = Number(n||0)*100; return (v>=0?'+':'') + v.toFixed(d) + '%'; };
  var absPct = function(n, d){ d = d == null ? 1 : d; return Number(n||0).toFixed(d) + '%'; };
  var signedU = function(n, d){ d = d == null ? 2 : d; var v = Number(n||0); return (v>=0?'+':'') + v.toFixed(d) + 'u'; };
  var esc = (typeof learningEsc === 'function') ? learningEsc : function(s){ return String(s||''); };
  var col = function(v){ return v >= 0 ? 'var(--grn)' : 'var(--red)'; };

  // === 1. TIME TO KICKOFF ===
  var ttkCards = ttk.order.map(function(k){
    var b = ttk.buckets[k];
    if(b.bets === 0) return '';
    var c = col(b.roi);
    return '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">'+
      '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">'+k+' inainte</div>'+
      '<div style="font-size:22px;font-weight:900;margin-top:6px;color:'+c+'">'+signedPct(b.roi)+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+b.bets+' pariuri • WR '+absPct(b.winrate*100)+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:2px">Profit net: '+signedU(b.profit, 1)+'</div>'+
    '</div>';
  }).filter(Boolean).join('');

  // Best/worst TTK bucket (min 15 bets)
  var ttkRanked = ttk.order.map(function(k){ return {k:k, b:ttk.buckets[k]}; }).filter(function(x){ return x.b.bets >= 15; });
  ttkRanked.sort(function(a,b){ return b.b.roi - a.b.roi; });
  var ttkInsight = '';
  if(ttkRanked.length >= 2){
    var best = ttkRanked[0], worst = ttkRanked[ttkRanked.length - 1];
    var diff = (best.b.roi - worst.b.roi) * 100;
    if(diff >= 3){
      ttkInsight = '<div style="margin-top:10px;padding:9px 11px;border-radius:10px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.22);font-size:11px;line-height:1.55">' +
        '💡 <b>'+best.k+'</b> bate <b>'+worst.k+'</b> cu <b style="color:var(--grn)">'+diff.toFixed(1)+'pp</b> ROI. Dacă adaugi pariuri mai devreme/târziu față de meci, reflectă în strategie.' +
      '</div>';
    } else {
      ttkInsight = '<div style="margin-top:10px;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);font-size:11px;color:var(--muted);line-height:1.55">' +
        'Diferența ROI între bucket-uri e mică (<3pp). Timpul până la start nu influențează semnificativ performanța.' +
      '</div>';
    }
  }

  // === 2. PROBABILITY SOURCE ===
  var probCards = Object.keys(probSrc).map(function(k){
    var g = probSrc[k];
    if(g.bets === 0) return '';
    var c = col(g.roi);
    return '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">'+
      '<div style="font-size:11px;font-weight:800;color:var(--txt)">'+esc(g.label)+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+esc(g.desc)+'</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px">'+
        '<div style="font-size:22px;font-weight:900;color:'+c+'">'+signedPct(g.roi)+'</div>'+
        '<div style="font-size:11px;color:var(--muted);font-family:var(--mono)">'+g.bets+' • '+absPct(g.winrate*100)+' WR</div>'+
      '</div>'+
    '</div>';
  }).filter(Boolean).join('');

  // === 3. A/B FILTER ===
  var policy = getSmartBetEnginePolicy();
  var modeAB = policy.modeAB || buildSmartBetModeABAnalysis(journal);
  var offMode = modeAB.modes.off;
  var balancedMode = modeAB.modes.balanced;
  var strictMode = modeAB.modes.strict;
  var abColor = policy.state === 'positive' ? 'var(--grn)' : (policy.state === 'harmful' ? 'var(--red)' : 'var(--yel)');
  var abIcon = policy.state === 'positive' ? '✅' : (policy.state === 'harmful' ? '⛔' : '➖');
  var abVerdict = policy.state === 'positive'
    ? ('Mod recomandat: ' + policy.label)
    : (policy.state === 'harmful' ? ('STRICT dăunează — recomandat ' + policy.label) : ('Motor neutru — recomandat ' + policy.label));

  var abSamples = (ab.sample_lost || []).map(function(s){
    var r = s.row;
    return '<div style="padding:8px 11px;border-radius:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.22);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:160px">' +
        '<div style="font-size:12px;font-weight:700;color:var(--txt)">'+esc(r.home || '?')+' — '+esc(r.away || '?')+'</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+esc(r.market)+' @ '+Number(r.odds||0).toFixed(2)+' • prob '+Number(r.adjusted_prob||0).toFixed(1)+'% • edge '+(Number(r.edge_pct||0)>=0?'+':'')+Number(r.edge_pct||0).toFixed(1)+'%</div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--grn);font-weight:800">+'+s.profit.toFixed(2)+'u win ratat</div>' +
    '</div>';
  }).join('');

  // === RENDER ===
  root.innerHTML =
    '<div class="section" style="margin-top:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(245,158,11,.05),rgba(0,0,0,0));border:1px solid rgba(245,158,11,.22)">'+
      '<div style="font-size:15px;font-weight:900;color:var(--txt);margin-bottom:6px">⏱️ ROI pe Timpul Până la Start</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.5">Performanța pariurilor în funcție de cât timp înainte de start au fost înregistrate. Util pentru a ști dacă trebuie să miști strategia mai aproape/mai departe de kickoff.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+(ttkCards || '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Date insuficiente.</div>')+'</div>'+
      ttkInsight+
    '</div>'+

    '<div class="section" style="margin-top:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(99,102,241,.05),rgba(0,0,0,0));border:1px solid rgba(99,102,241,.22)">'+
      '<div style="font-size:15px;font-weight:900;color:var(--txt);margin-bottom:6px">🧠 ROI pe Sursa Probabilității</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.5">Cum performează pariurile în funcție de ce motor domină calculul probabilității. Dacă "Poisson hybrid" are ROI semnificativ mai bun, merită să dai mai multă greutate Poisson-ului în engine.</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">'+(probCards || '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Date insuficiente.</div>')+'</div>'+
    '</div>'+

    '<div class="section" style="margin-top:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,'+(policy.state==='positive'?'rgba(16,185,129,.05)':policy.state==='harmful'?'rgba(239,68,68,.05)':'rgba(245,158,11,.05)')+',rgba(0,0,0,0));border:1px solid '+(policy.state==='positive'?'rgba(16,185,129,.22)':policy.state==='harmful'?'rgba(239,68,68,.22)':'rgba(245,158,11,.22)')+'">'+
      '<div style="font-size:15px;font-weight:900;color:var(--txt);margin-bottom:6px">🎯 A/B Test — OFF vs BALANCED vs STRICT</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-bottom:12px;line-height:1.5">Comparația se face pe pariurile settled cu value &gt; 0 din jurnal. În loc de un singur filtru agresiv, aplicația îți arată acum clar care mod păstrează cel mai bun ROI pe sample-ul real.</div>'+
      '<div style="padding:10px 12px;border-radius:12px;background:'+(policy.state==='positive'?'rgba(16,185,129,.08)':policy.state==='harmful'?'rgba(239,68,68,.08)':'rgba(245,158,11,.08)')+';border:1px solid '+(policy.state==='positive'?'rgba(16,185,129,.22)':policy.state==='harmful'?'rgba(239,68,68,.22)':'rgba(245,158,11,.22)')+';margin-bottom:12px">'+
        '<div style="font-size:13px;font-weight:800;color:'+abColor+'">'+abIcon+' '+abVerdict+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">'+policy.reason+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:6px">Δ STRICT vs OFF: <b style="color:'+(modeAB.strictDeltaRoi>=0?'var(--grn)':'var(--red)')+'">'+(modeAB.strictDeltaRoi>=0?'+':'')+modeAB.strictDeltaRoi.toFixed(2)+'pp</b> • Δ BALANCED vs OFF: <b style="color:'+(modeAB.balancedDeltaRoi>=0?'var(--grn)':'var(--red)')+'">'+(modeAB.balancedDeltaRoi>=0?'+':'')+modeAB.balancedDeltaRoi.toFixed(2)+'pp</b></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">'+
        '<div style="padding:12px;border-radius:14px;background:'+(policy.mode==='off'?'rgba(59,130,246,.08)':'rgba(255,255,255,.03)')+';border:1px solid '+(policy.mode==='off'?'rgba(59,130,246,.26)':'rgba(255,255,255,.08)')+'">'+
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">🌐 OFF / Pool brut</div>'+
          '<div style="font-size:22px;font-weight:900;margin-top:6px;color:'+col(offMode.roi)+'">'+signedPct(offMode.roi)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+offMode.bets+' pariuri • WR '+absPct(offMode.winrate*100)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Profit: '+signedU(offMode.profit, 1)+'</div>'+
        '</div>'+
        '<div style="padding:12px;border-radius:14px;background:'+(policy.mode==='balanced'?'rgba(245,158,11,.08)':'rgba(255,255,255,.03)')+';border:1px solid '+(policy.mode==='balanced'?'rgba(245,158,11,.26)':'rgba(255,255,255,.08)')+'">'+
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">⚖️ BALANCED</div>'+
          '<div style="font-size:22px;font-weight:900;margin-top:6px;color:'+col(balancedMode.roi)+'">'+signedPct(balancedMode.roi)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+balancedMode.bets+' pariuri • WR '+absPct(balancedMode.winrate*100)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Profit: '+signedU(balancedMode.profit, 1)+'</div>'+
        '</div>'+
        '<div style="padding:12px;border-radius:14px;background:'+(policy.mode==='strict'?'rgba(168,85,247,.08)':'rgba(255,255,255,.03)')+';border:1px solid '+(policy.mode==='strict'?'rgba(168,85,247,.26)':'rgba(255,255,255,.08)')+'">'+
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">🔒 STRICT</div>'+
          '<div style="font-size:22px;font-weight:900;margin-top:6px;color:'+col(strictMode.roi)+'">'+signedPct(strictMode.roi)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+strictMode.bets+' pariuri • WR '+absPct(strictMode.winrate*100)+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:2px">Profit: '+signedU(strictMode.profit, 1)+'</div>'+
        '</div>'+
        '<div style="padding:12px;border-radius:14px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.18)">'+
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">❌ Win-uri pierdute de STRICT</div>'+
          '<div style="font-size:22px;font-weight:900;margin-top:6px;color:var(--red)">'+ab.lost_wins+'</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+signedU(ab.lost_wins_units, 1)+' win ratat</div>'+
        '</div>'+
      '</div>'+
      (abSamples ? ('<div style="margin-top:14px"><div style="font-size:11px;font-weight:800;color:var(--txt);margin-bottom:8px">Exemple win-uri pe care STRICT le-ar fi eliminat:</div><div style="display:flex;flex-direction:column;gap:6px">'+abSamples+'</div></div>') : '')+
    '</div>';
}


function renderWalkForwardValidation(){
  var root = document.getElementById('walk-forward-root');
  if(!root) return;
  var wf = WALK_FORWARD_CACHE || computeWalkForwardValidation();
  if(!wf){
    root.innerHTML = '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Validarea walk-forward are nevoie de minimum 30 de pariuri settled in jurnal.</div>';
    return;
  }
  var pct = function(n, d){ d = d == null ? 1 : d; return (Number(n||0)*100).toFixed(d) + '%'; };
  var signedPct = function(n, d){ d = d == null ? 1 : d; var v = Number(n||0)*100; return (v>=0?'+':'') + v.toFixed(d) + '%'; };
  var signedPP = function(n, d){ d = d == null ? 2 : d; var v = Number(n||0); return (v>=0?'+':'') + v.toFixed(d) + 'pp'; };
  var signedU = function(n, d){ d = d == null ? 2 : d; var v = Number(n||0); return (v>=0?'+':'') + v.toFixed(d) + 'u'; };
  var esc = (typeof learningEsc === 'function') ? learningEsc : function(s){ return String(s||''); };

  var policy = getSmartBetEnginePolicy();

  // V17: verdict holistic — blocare + sizing impact combinate
  var sizingDelta = Number(wf.sizing_delta_pp || 0);
  var blockDelta = Number(wf.delta_roi_pp || 0);
  var combinedDelta = sizingDelta + blockDelta;
  // Verdict prioritizeaza sizing care e mecanismul principal V17
  var verdictState, verdictColor, verdictIcon, verdictTitle, verdictReason;
  if(sizingDelta >= 0.4 && combinedDelta >= 0){
    verdictState = 'positive'; verdictColor = 'var(--grn)'; verdictIcon = '✅';
    verdictTitle = 'Motorul adauga valoare • sizing +' + sizingDelta.toFixed(2) + 'pp';
    verdictReason = 'Stake sizing-ul V17 amplifica pariurile cu edge mare si reduce expunerea pe cele slabe.';
  } else if(combinedDelta < -0.5){
    verdictState = 'harmful'; verdictColor = 'var(--red)'; verdictIcon = '⛔';
    verdictTitle = 'Motorul dauneaza • Δ combinat ' + signedPP(combinedDelta, 2);
    verdictReason = policy.reason;
  } else {
    verdictState = 'neutral'; verdictColor = 'var(--yel)'; verdictIcon = '➖';
    verdictTitle = 'Motor neutru • mod recomandat: ' + policy.label;
    verdictReason = sizingDelta > 0
      ? ('Sizing-ul adauga +' + sizingDelta.toFixed(2) + 'pp; blocarea nu mai face mult pe sample-ul curent.')
      : 'Datele nu sunt inca decisive. Continua sa generezi recomandari pentru calibrare.';
  }

  var cardsHtml =
    '<div style="margin-bottom:12px;padding:10px 12px;border-radius:12px;background:'+(verdictState==='positive'?'rgba(16,185,129,.08)':verdictState==='harmful'?'rgba(239,68,68,.08)':'rgba(245,158,11,.08)')+';border:1px solid '+(verdictState==='positive'?'rgba(16,185,129,.22)':verdictState==='harmful'?'rgba(239,68,68,.22)':'rgba(245,158,11,.22)')+'"><div style="font-size:13px;font-weight:800;color:'+verdictColor+'">'+verdictIcon+' '+verdictTitle+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+verdictReason+'</div></div>' +
    // V17: Sizing impact cards (principalul mecanism)
    '<div style="margin-bottom:6px;font-size:11px;font-weight:800;color:var(--txt);letter-spacing:.05em">📏 IMPACT STAKE SIZING (V17)</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">' +
      '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">ROI flat (1u/pariu)</div>' +
        '<div style="font-size:22px;font-weight:900;margin-top:6px;color:' + (wf.sizing_flat_roi>=0?'var(--grn)':'var(--red)') + '">' + signedPct(wf.sizing_flat_roi, 2) + '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">baseline fara sizing</div>' +
      '</div>' +
      '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">ROI cu sizing</div>' +
        '<div style="font-size:22px;font-weight:900;margin-top:6px;color:' + (wf.sizing_roi>=0?'var(--grn)':'var(--red)') + '">' + signedPct(wf.sizing_roi, 2) + '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + Number(wf.sizing_stake_sum||0).toFixed(0) + 'u stake total</div>' +
      '</div>' +
      '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,' + (sizingDelta>=0?'rgba(16,185,129,.14),rgba(16,185,129,.03)':'rgba(239,68,68,.12),rgba(239,68,68,.02)') + ');border:1px solid ' + (sizingDelta>=0?'rgba(16,185,129,.28)':'rgba(239,68,68,.24)') + '">' +
        '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Delta Sizing</div>' +
        '<div style="font-size:22px;font-weight:900;margin-top:6px;color:' + (sizingDelta>=0?'var(--grn)':'var(--red)') + '">' + signedPP(sizingDelta, 2) + '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">impactul stake variabil</div>' +
      '</div>' +
      '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Distributie stake</div>' +
        '<div style="font-size:16px;font-weight:900;margin-top:6px;color:var(--txt);line-height:1.3">' + Number(wf.sizing_bets_full||0) + ' full<br><span style="color:var(--muted);font-size:12px;font-weight:700">' + Number(wf.sizing_bets_reduced||0) + ' reduse</span></div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">full ≥ 1.0x stake</div>' +
      '</div>' +
    '</div>' +
    // Blocare impact (secundar, compact cand e zero)
    '<div style="margin:14px 0 6px 0;font-size:11px;font-weight:800;color:var(--txt);letter-spacing:.05em">🚫 IMPACT BLOCARE</div>';

  // Compact vs full blocking view depending on number of blocks
  var blockingHtml;
  if(Number(wf.total_blocks || 0) <= 3){
    // Compact: blocking is essentially inactive
    blockingHtml = '<div style="padding:12px;border-radius:14px;background:rgba(16,185,129,.05);border:1px solid rgba(16,185,129,.18)">' +
      '<div style="font-size:12px;font-weight:700;color:var(--grn)">✓ Motorul nu mai blocheaza pariuri. ' +
      (Number(wf.total_blocks || 0) === 0 ? 'Zero blocari pe intreg jurnalul.' : Number(wf.total_blocks) + ' blocari marginale.') +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">Pragurile V17 (20 bets, ROI ≤ -25%) sunt stricte tocmai ca sa nu blocam winners.</div>' +
    '</div>';
  } else {
    // Full blocking breakdown
    blockingHtml =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">' +
        '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">ROI Actual</div>' +
          '<div style="font-size:20px;font-weight:900;margin-top:6px;color:' + (wf.actual_roi>=0?'var(--grn)':'var(--red)') + '">' + signedPct(wf.actual_roi, 2) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + wf.total_bets + ' pariuri' +
        '</div></div>' +
        '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">ROI dupa blocare</div>' +
          '<div style="font-size:20px;font-weight:900;margin-top:6px;color:' + (wf.simulated_roi>=0?'var(--grn)':'var(--red)') + '">' + signedPct(wf.simulated_roi, 2) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + wf.simulated_bets + ' pastrate</div>' +
        '</div>' +
        '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,' + (blockDelta>=0?'rgba(16,185,129,.10),rgba(16,185,129,.02)':'rgba(239,68,68,.08),rgba(239,68,68,.02)') + ');border:1px solid ' + (blockDelta>=0?'rgba(16,185,129,.22)':'rgba(239,68,68,.20)') + '">' +
          '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Delta blocare</div>' +
          '<div style="font-size:20px;font-weight:900;margin-top:6px;color:' + (blockDelta>=0?'var(--grn)':'var(--red)') + '">' + signedPP(blockDelta, 2) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + wf.correct_blocks + ' corecte / ' + wf.wrong_blocks + ' gresite</div>' +
        '</div>' +
      '</div>';
  }

  cardsHtml += blockingHtml;

  // Breakdown (blocari corecte/gresite/acuratete) — afisat DOAR cand sunt suficiente blocari
  var breakdownHtml = '';
  if(Number(wf.total_blocks || 0) >= 5){
    breakdownHtml =
    '<div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">' +
      '<div style="padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(0,0,0,0));border:1px solid rgba(16,185,129,.22)">' +
        '<div style="font-size:11px;font-weight:800;color:var(--grn);margin-bottom:6px">✅ Blocari corecte</div>' +
        '<div style="font-size:18px;font-weight:900;color:var(--txt)">' + wf.correct_blocks + ' pariuri</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:4px">Pierderi evitate: ' + wf.saved_units.toFixed(1) + ' u</div>' +
      '</div>' +
      '<div style="padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,rgba(239,68,68,.08),rgba(0,0,0,0));border:1px solid rgba(239,68,68,.22)">' +
        '<div style="font-size:11px;font-weight:800;color:var(--red);margin-bottom:6px">❌ Blocari gresite</div>' +
        '<div style="font-size:18px;font-weight:900;color:var(--txt)">' + wf.wrong_blocks + ' pariuri</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:4px">Castiguri ratate: ' + wf.missed_units.toFixed(1) + ' u</div>' +
      '</div>' +
      '<div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-size:11px;font-weight:800;color:var(--txt);margin-bottom:6px">🎯 Acuratete blocari</div>' +
        '<div style="font-size:18px;font-weight:900;color:' + (wf.block_accuracy>=0.5?'var(--grn)':'var(--red)') + '">' + pct(wf.block_accuracy, 1) + '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:4px">Random ar fi ~' + (100 * (wf.total_bets - (wf.actual_profit + wf.total_bets)/2) / wf.total_bets).toFixed(0) + '% (rata pierderi)</div>' +
      '</div>' +
    '</div>';
  }

  var samplesHtml = '';
  if(wf.blocked_samples && wf.blocked_samples.length && Number(wf.total_blocks || 0) >= 5){
    samplesHtml = '<div style="margin-top:14px">' +
      '<div style="font-size:12px;font-weight:800;color:var(--txt);margin-bottom:8px">🔍 Ultimele ' + Math.min(10, wf.blocked_samples.length) + ' pariuri pe care motorul le-ar fi blocat</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
        wf.blocked_samples.slice(0, 10).map(function(b){
          var r = b.row;
          var borderColor = b.won ? 'rgba(239,68,68,.22)' : 'rgba(16,185,129,.22)';
          var tagColor = b.won ? 'var(--red)' : 'var(--grn)';
          var tagLabel = b.won ? '❌ Era win ratat' : '✓ Pierdere evitata';
          var date = r.settled_at ? new Date(r.settled_at).toLocaleDateString('ro-RO') : '';
          return '<div style="padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid ' + borderColor + ';display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">' +
            '<div style="flex:1;min-width:160px">' +
              '<div style="font-size:12px;font-weight:700;color:var(--txt)">' + esc(r.home || '?') + ' — ' + esc(r.away || '?') + '</div>' +
              '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + esc(r.market) + ' @ ' + Number(r.odds||0).toFixed(2) + ' • ' + esc(r.league) + ' • ' + date + '</div>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:10px;color:' + tagColor + ';font-weight:800">' + tagLabel + '</div>' +
              '<div style="font-size:9px;color:var(--muted);margin-top:2px">Motiv: ' + esc(b.reason) + '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  root.innerHTML =
    '<div class="section" style="margin-top:12px;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(59,130,246,.06),rgba(0,0,0,0));border:1px solid rgba(59,130,246,.22)">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:900;color:var(--txt)">🔬 Validare Walk-Forward V17</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.5">Simulare cronologica pe doua axe: <b>stake sizing</b> (cat risti per pariu in functie de edge/odds/sursa) si <b>blocare toxic</b> (ce ai fi refuzat complet). Pentru fiecare pariu se folosesc DOAR pariurile anterioare lui.</div>' +
        '</div>' +
      '</div>' +
      cardsHtml +
      breakdownHtml +
      samplesHtml +
    '</div>';
}


function buildLearningEngine(){
  var journal = (window.RECOMMENDATION_JOURNAL || RECOMMENDATION_JOURNAL || []);
  if(!Array.isArray(journal)) journal = [];
  var now = Date.now();
  var buckets = learningBuckets();

  var stats = {
    global: learningStatsAcc(),
    by_market: {}, by_market_league: {}, by_market_odds: {},
    by_market_edge: {}, by_market_weekday: {}, by_market_score: {},
    by_market_source: {}, by_market_prob: {}, by_league: {}
  };

  journal.forEach(function(row){
    if(learningRowOutcome(row) === null) return;
    var market = String(row.market_key || '').trim();
    if(!market) return;
    var league = String(row.league || '').trim() || '—';
    var odds = Number(row.odds || 0);
    var edge = Number(row.edge_pct || 0);
    var score = Number(row.score || 0);
    var prob = Number(row.adjusted_prob || 0);
    var ageDays = learningRowAgeDays(row, now);
    var weight = learningDecayWeight(ageDays);
    var wIdx = learningRowWeekdayIdx(row);
    var wName = (wIdx >= 0 && wIdx < 7) ? buckets.weekdayNames[wIdx] : null;
    var oB = learningAssignBucket(odds, buckets.oddsBuckets);
    var eB = learningAssignBucket(edge, buckets.edgeBuckets);
    var sB = learningAssignBucket(score, buckets.scoreBuckets);
    var pB = learningAssignBucket(prob, buckets.probBuckets);
    var src = row.source_api ? 'api' : (row.source_heuristic ? 'heuristic' : 'mixed');

    learningAddRow(stats.global, row, weight, ageDays);
    function ensure(table, key){ if(!table[key]) table[key] = learningStatsAcc(); return table[key]; }
    learningAddRow(ensure(stats.by_market, market), row, weight, ageDays);
    learningAddRow(ensure(stats.by_market_league, market+'|'+league), row, weight, ageDays);
    learningAddRow(ensure(stats.by_league, league), row, weight, ageDays);
    learningAddRow(ensure(stats.by_market_source, market+'|'+src), row, weight, ageDays);
    if(oB) learningAddRow(ensure(stats.by_market_odds, market+'|'+oB), row, weight, ageDays);
    if(eB) learningAddRow(ensure(stats.by_market_edge, market+'|'+eB), row, weight, ageDays);
    if(wName) learningAddRow(ensure(stats.by_market_weekday, market+'|'+wName), row, weight, ageDays);
    if(sB) learningAddRow(ensure(stats.by_market_score, market+'|'+sB), row, weight, ageDays);
    if(pB) learningAddRow(ensure(stats.by_market_prob, market+'|'+pB), row, weight, ageDays);
  });

  // Finalize
  learningFinalize(stats.global);
  ['by_market','by_market_league','by_market_odds','by_market_edge','by_market_weekday','by_market_score','by_market_source','by_market_prob','by_league'].forEach(function(k){
    Object.keys(stats[k]).forEach(function(kk){ learningFinalize(stats[k][kk]); });
  });

  // Multiplicatori
  var multipliers = { market:{}, market_league:{}, market_odds:{}, market_edge:{}, market_weekday:{}, market_score:{}, market_source:{} };
  [['by_market','market'],['by_market_league','market_league'],['by_market_odds','market_odds'],
   ['by_market_edge','market_edge'],['by_market_weekday','market_weekday'],['by_market_score','market_score'],
   ['by_market_source','market_source']].forEach(function(pair){
    var s = stats[pair[0]], d = multipliers[pair[1]];
    Object.keys(s).forEach(function(k){ d[k] = learningStatsMultiplier(s[k]); });
  });

  // Filtre dinamice: edge buckets profitabili / toxici per piata
  // V17 FIX: praguri mai stricte pentru toxic (walk-forward a arătat că blocăm winners).
  // Vechi: edge_toxic @ bets>=8, ROI<-8% -> prea sensibil.
  // Nou: edge_toxic @ bets>=15, ROI<-15% -> doar zone cu adevarat pierdere stabila.
  var dynamicFilters = {};
  Object.keys(stats.by_market_edge).forEach(function(k){
    var parts = k.split('|');
    var market = parts[0], bucket = parts[1];
    if(!dynamicFilters[market]) dynamicFilters[market] = { edge_profitable:[], edge_toxic:[] };
    var s = stats.by_market_edge[k];
    if(s.bets >= 6 && s.roi_w > 0.02) dynamicFilters[market].edge_profitable.push(bucket);
    if(s.bets >= 15 && s.roi_w < -0.15) dynamicFilters[market].edge_toxic.push(bucket);
  });
  // Weekday toxice per piata
  // V17 FIX: weekday e noise pur (zero cauzalitate intre "Sambata" si rezultat).
  // Walk-forward a aratat blocari de tip "Motiv: Duminica" pe winners.
  // Prag urcat masiv: bets>=30, ROI<=-35% -> practic dezactivat, doar cazuri extreme raman.
  var toxicWeekdays = {};
  Object.keys(stats.by_market_weekday).forEach(function(k){
    var parts = k.split('|');
    var market = parts[0], wd = parts[1];
    var s = stats.by_market_weekday[k];
    if(s.bets >= 30 && s.roi_w <= -0.35){
      if(!toxicWeekdays[market]) toxicWeekdays[market] = [];
      toxicWeekdays[market].push(wd);
    }
  });

  // Top pattern-uri pozitive & toxice
  var topBoost = [], topToxic = [];
  ['market','market_league','market_odds','market_edge','market_weekday','market_score'].forEach(function(kind){
    Object.keys(multipliers[kind]).forEach(function(k){
      var m = multipliers[kind][k];
      if(!m || m.raw_bets < 5) return;
      var rec = {kind:kind, key:k, multiplier:m.multiplier, roi:m.roi, winrate:m.winrate, bets:m.bets, raw_bets:m.raw_bets, boost:m.boost, toxic:m.toxic, confidence:m.confidence};
      if(m.multiplier >= 1.05 && m.roi >= 0.03) topBoost.push(rec);
      if(m.toxic) topToxic.push(rec);
    });
  });
  topBoost.sort(function(a,b){ return (b.multiplier * Math.sqrt(b.raw_bets)) - (a.multiplier * Math.sqrt(a.raw_bets)); });
  topToxic.sort(function(a,b){ return a.roi - b.roi; });

  // Calibrare: predicted vs actual per prob bucket
  var calibration = [];
  var calibMap = {};
  Object.keys(stats.by_market_prob).forEach(function(k){
    var s = stats.by_market_prob[k];
    if(s.bets < 5) return;
    var parts = k.split('|');
    var market = parts[0], bucket = parts[1];
    if(!calibMap[bucket]) calibMap[bucket] = { bucket:bucket, bets:0, wins:0, predicted_sum:0, markets:{} };
    calibMap[bucket].bets += s.bets;
    calibMap[bucket].wins += s.wins;
    // predicted probability ~ middle of bucket
    var mid = buckets.probBuckets.filter(function(b){ return b.label === bucket; })[0];
    if(mid){
      var midVal = (mid.min + Math.min(99, mid.max)) / 2;
      calibMap[bucket].predicted_sum += midVal * s.bets;
    }
    calibMap[bucket].markets[market] = s;
  });
  Object.keys(calibMap).forEach(function(k){
    var c = calibMap[k];
    if(c.bets > 0){
      c.actual_rate = 100 * c.wins / c.bets;
      c.predicted_rate = c.predicted_sum / c.bets;
      c.bias = c.actual_rate - c.predicted_rate;
      calibration.push(c);
    }
  });
  calibration.sort(function(a,b){ return a.predicted_rate - b.predicted_rate; });

  LEARNING_ENGINE = {
    version: LEARNING_ENGINE_VERSION,
    updated_at: new Date().toISOString(),
    journal_rows: journal.length,
    settled_rows: stats.global.bets,
    stats: stats,
    multipliers: multipliers,
    dynamic_filters: dynamicFilters,
    toxic_weekdays: toxicWeekdays,
    top_boost_patterns: topBoost.slice(0, 20),
    top_toxic_patterns: topToxic.slice(0, 12),
    calibration: calibration,
    buckets: buckets,
    half_life_days: LEARNING_ENGINE_HALF_LIFE
  };
  try { console.log('[LearningEngine] built from', stats.global.bets, 'settled bets (global ROI', (stats.global.roi_w*100).toFixed(2), '%, winrate', (stats.global.winrate_w*100).toFixed(1), '%)'); } catch(e){}
  // Calibration + walk-forward se construiesc tot aici pentru a fi gata la primul render
  try { buildCalibrationMap(); } catch(e){ console.warn('[Calibration] failed', e); }
  try { computeWalkForwardValidation(); } catch(e){ console.warn('[WalkForward] failed', e); }
  return LEARNING_ENGINE;
}

// Aplica motor pe o selectie: returneaza boost/multiplicator + reasons
function learningApplyToCandidate(ctx){
  // ctx: {marketKey, leagueName, odds, edgePct, score, probAdj, weekdayIdx}
  if(!LEARNING_ENGINE || !LEARNING_ENGINE.multipliers){
    return {boost:0, multiplier:1.0, toxic:false, reasons:[]};
  }
  var buckets = LEARNING_ENGINE.buckets;
  var M = LEARNING_ENGINE.multipliers;
  var reasons = [];
  var totalBoost = 0;
  var combinedMulti = 1.0;
  var toxic = false;

  function apply(kind, key, label){
    var m = M[kind] && M[kind][key];
    if(!m || m.raw_bets < 4) return;
    if(m.toxic){
      toxic = true;
      reasons.push('🚫 Toxic ' + label + ' (ROI ' + (m.roi*100).toFixed(1) + '% / ' + m.raw_bets + ' pariuri)');
      return;
    }
    if(Math.abs(m.boost) >= 1.0){
      totalBoost += m.boost;
      // Combinam multiplicatorii cu moderare (radacina patrata) ca sa nu se acumuleze explosiv
      combinedMulti *= (1 + (m.multiplier - 1) * 0.55);
      var sign = m.boost >= 0 ? '+' : '';
      reasons.push((m.boost >= 0 ? '📈 ' : '📉 ') + label + ' ' + sign + m.boost.toFixed(1) + ' (ROI ' + (m.roi*100).toFixed(1) + '%, ' + m.raw_bets + ' pariuri)');
    }
  }

  var mk = ctx.marketKey, lg = ctx.leagueName || '—';
  apply('market', mk, 'Piata ' + mk);
  apply('market_league', mk+'|'+lg, lg);
  if(Number(ctx.odds) > 0){
    var ob = learningAssignBucket(ctx.odds, buckets.oddsBuckets);
    if(ob) apply('market_odds', mk+'|'+ob, 'cote ' + ob);
  }
  if(ctx.edgePct != null){
    var eb = learningAssignBucket(ctx.edgePct, buckets.edgeBuckets);
    if(eb) apply('market_edge', mk+'|'+eb, 'edge ' + eb);
  }
  if(ctx.weekdayIdx != null && ctx.weekdayIdx >= 0 && ctx.weekdayIdx < 7){
    apply('market_weekday', mk+'|'+buckets.weekdayNames[ctx.weekdayIdx], buckets.weekdayNames[ctx.weekdayIdx]);
  }
  if(Number(ctx.score) > 0){
    var sb = learningAssignBucket(ctx.score, buckets.scoreBuckets);
    if(sb) apply('market_score', mk+'|'+sb, 'scor ' + sb);
  }

  combinedMulti = Math.max(0.55, Math.min(1.55, combinedMulti));
  totalBoost = Math.max(-15, Math.min(18, totalBoost));
  return {
    boost: Math.round(totalBoost * 10) / 10,
    multiplier: combinedMulti,
    toxic: toxic,
    reasons: reasons.slice(0, 5)
  };
}

// Check daca o piata/edge este blocat dinamic (toxic bucket cu sample adecvat)
function learningDisqualifiesEdge(marketKey, edgePct){
  if(!LEARNING_ENGINE || !LEARNING_ENGINE.dynamic_filters) return false;
  if(edgePct == null) return false;
  var df = LEARNING_ENGINE.dynamic_filters[marketKey];
  if(!df || !df.edge_toxic || !df.edge_toxic.length) return false;
  var eb = learningAssignBucket(edgePct, LEARNING_ENGINE.buckets.edgeBuckets);
  if(!eb) return false;
  return df.edge_toxic.indexOf(eb) >= 0;
}
function learningDisqualifiesWeekday(marketKey, weekdayIdx){
  if(!LEARNING_ENGINE || !LEARNING_ENGINE.toxic_weekdays) return false;
  if(weekdayIdx == null || weekdayIdx < 0) return false;
  var list = LEARNING_ENGINE.toxic_weekdays[marketKey];
  if(!list || !list.length) return false;
  var wd = LEARNING_ENGINE.buckets.weekdayNames[weekdayIdx];
  return list.indexOf(wd) >= 0;
}

// ============================================================
// LEARNING ENGINE — UI render
// ============================================================
function learningFmtPct(n, dec){
  var v = Number(n || 0) * 100;
  return (v >= 0 ? '+' : '') + v.toFixed(dec != null ? dec : 1) + '%';
}
function learningFmtPctAbs(n, dec){
  return Number(n || 0).toFixed(dec != null ? dec : 1) + '%';
}
function learningEsc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

function renderLearningEngine(){
  var root = document.getElementById('learning-engine-root');
  if(!root) return;
  var L = LEARNING_ENGINE;
  if(!L || !L.stats || L.settled_rows === 0){
    root.innerHTML = '<div class="help-panel" style="text-align:center;padding:32px"><div style="font-size:14px;font-weight:800;color:var(--txt);margin-bottom:8px">🧬 Motorul de invatare asteapta date</div><div style="font-size:12px;color:var(--muted);line-height:1.55">Motorul are nevoie de <code>recommendation_journal.json</code> cu pariuri deja incheiate.<br>Verifica fluxul <code>fetch_data.py</code> si workflow-ul GitHub Actions.</div></div>';
    return;
  }
  var g = L.stats.global;
  var roi_color = g.roi_w >= 0 ? 'var(--grn)' : 'var(--red)';

  var summary = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">' +
    '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,.10),rgba(16,185,129,.04));border:1px solid rgba(16,185,129,.22)">' +
      '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Pariuri invatate</div>' +
      '<div style="font-size:26px;font-weight:900;margin-top:6px">' + g.bets.toLocaleString('ro-RO') + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + g.wins + ' W / ' + g.losses + ' L</div>' +
    '</div>' +
    '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,rgba(99,102,241,.10),rgba(99,102,241,.04));border:1px solid rgba(99,102,241,.22)">' +
      '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">ROI weighted</div>' +
      '<div style="font-size:26px;font-weight:900;margin-top:6px;color:' + roi_color + '">' + learningFmtPct(g.roi_w, 2) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">decay 90 zile • absolut ' + learningFmtPct(g.roi, 2) + '</div>' +
    '</div>' +
    '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(245,158,11,.04));border:1px solid rgba(245,158,11,.22)">' +
      '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Winrate global</div>' +
      '<div style="font-size:26px;font-weight:900;margin-top:6px">' + learningFmtPctAbs(g.winrate_w * 100, 1) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">30z ' + learningFmtPctAbs(g.winrate_30*100,1) + ' • 90z ' + learningFmtPctAbs(g.winrate_90*100,1) + '</div>' +
    '</div>' +
    '<div style="padding:12px;border-radius:14px;background:linear-gradient(135deg,rgba(168,85,247,.10),rgba(168,85,247,.04));border:1px solid rgba(168,85,247,.22)">' +
      '<div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em">Tipare active</div>' +
      '<div style="font-size:26px;font-weight:900;margin-top:6px">' + L.top_boost_patterns.length + ' / ' + L.top_toxic_patterns.length + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px"><span style="color:var(--grn)">boost</span> / <span style="color:var(--red)">blocate</span></div>' +
    '</div>' +
  '</div>';

  // Per-market breakdown
  var marketOrder = ['over15','over25','under35','btts','over35','under25','homeWin','awayWin','draw'];
  var marketRows = marketOrder
    .filter(function(mk){ return L.stats.by_market[mk]; })
    .map(function(mk){ return [mk, L.stats.by_market[mk]]; })
    .concat(Object.keys(L.stats.by_market).filter(function(k){ return marketOrder.indexOf(k) < 0; }).map(function(k){ return [k, L.stats.by_market[k]]; }));

  var marketTable = '<div style="overflow-x:auto;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02)">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="background:rgba(255,255,255,.04)">' +
      '<th style="padding:9px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Piata</th>' +
      '<th style="padding:9px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Pariuri</th>' +
      '<th style="padding:9px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Winrate</th>' +
      '<th style="padding:9px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">ROI</th>' +
      '<th style="padding:9px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Multi</th>' +
      '<th style="padding:9px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">30z</th>' +
    '</tr></thead><tbody>' +
    marketRows.map(function(pair){
      var mk = pair[0], s = pair[1];
      var mul = learningStatsMultiplier(s);
      var roiCol = s.roi_w >= 0 ? 'var(--grn)' : 'var(--red)';
      var roi30Col = s.roi_30 >= 0 ? 'var(--grn)' : (s.bets_30 === 0 ? 'var(--muted)' : 'var(--red)');
      var mulCol = mul.multiplier > 1.02 ? 'var(--grn)' : (mul.multiplier < 0.98 ? 'var(--red)' : 'var(--txt)');
      var toxicTag = mul.toxic ? ' <span style="padding:1px 5px;border-radius:4px;background:rgba(239,68,68,.18);color:var(--red);font-size:9px;font-weight:800">TOXIC</span>' : '';
      return '<tr>' +
        '<td style="padding:9px 10px;font-weight:700;color:var(--txt)">' + learningEsc(mk) + toxicTag + '</td>' +
        '<td style="padding:9px 10px;text-align:right;font-family:var(--mono)">' + s.bets + '<span style="font-size:10px;color:var(--muted)"> (' + s.wins + 'W)</span></td>' +
        '<td style="padding:9px 10px;text-align:right;font-family:var(--mono)">' + learningFmtPctAbs(s.winrate_w*100,1) + '</td>' +
        '<td style="padding:9px 10px;text-align:right;font-family:var(--mono);color:' + roiCol + ';font-weight:800">' + learningFmtPct(s.roi_w,2) + '</td>' +
        '<td style="padding:9px 10px;text-align:right;font-family:var(--mono);color:' + mulCol + ';font-weight:800">x' + mul.multiplier.toFixed(2) + '</td>' +
        '<td style="padding:9px 10px;text-align:right;font-family:var(--mono);color:' + roi30Col + '">' + (s.bets_30 === 0 ? '—' : learningFmtPct(s.roi_30,1)) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table></div>';

  // Top boost
  var boostCards = L.top_boost_patterns.slice(0, 10).map(function(p){
    var label = p.key.split('|').slice(1).join(' • ');
    var marketShort = p.key.split('|')[0];
    return '<div style="padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,rgba(16,185,129,.10),rgba(16,185,129,.02));border:1px solid rgba(16,185,129,.22)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:4px">' +
        '<div style="font-size:11px;font-weight:800;color:var(--txt)">' + learningEsc(marketShort) + (label ? ' <span style="color:var(--muted);font-weight:600">• ' + learningEsc(label) + '</span>' : '') + '</div>' +
        '<div style="font-size:13px;font-weight:900;color:var(--grn);font-family:var(--mono)">x' + p.multiplier.toFixed(2) + '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">' +
        '<span>ROI <b style="color:var(--grn)">' + learningFmtPct(p.roi,1) + '</b></span>' +
        '<span>WR ' + learningFmtPctAbs(p.winrate*100,0) + '</span>' +
        '<span>' + p.raw_bets + ' pariuri</span>' +
        '<span style="text-transform:uppercase">' + p.kind.replace('market_','') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  // Top toxic
  var toxicCards = L.top_toxic_patterns.slice(0, 8).map(function(p){
    var label = p.key.split('|').slice(1).join(' • ');
    var marketShort = p.key.split('|')[0];
    return '<div style="padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(239,68,68,.02));border:1px solid rgba(239,68,68,.22)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:4px">' +
        '<div style="font-size:11px;font-weight:800;color:var(--txt)">🚫 ' + learningEsc(marketShort) + (label ? ' <span style="color:var(--muted);font-weight:600">• ' + learningEsc(label) + '</span>' : '') + '</div>' +
        '<div style="font-size:13px;font-weight:900;color:var(--red);font-family:var(--mono)">x' + p.multiplier.toFixed(2) + '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap">' +
        '<span>ROI <b style="color:var(--red)">' + learningFmtPct(p.roi,1) + '</b></span>' +
        '<span>WR ' + learningFmtPctAbs(p.winrate*100,0) + '</span>' +
        '<span>' + p.raw_bets + ' pariuri</span>' +
        '<span style="text-transform:uppercase">' + p.kind.replace('market_','') + '</span>' +
      '</div>' +
    '</div>';
  }).join('') || '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Niciun tipar toxic detectat. 👌</div>';

  // Calibration
  var calibBody = (L.calibration || []).map(function(c){
    var biasCol = Math.abs(c.bias) < 5 ? 'var(--grn)' : (Math.abs(c.bias) < 10 ? 'var(--yel)' : 'var(--red)');
    var signal = c.bias >= 0 ? '📈 Sub-estimat' : '📉 Supra-estimat';
    return '<tr>' +
      '<td style="padding:8px 10px;font-weight:700">' + learningEsc(c.bucket) + '</td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono)">' + c.predicted_rate.toFixed(1) + '%</td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-weight:700">' + c.actual_rate.toFixed(1) + '%</td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);color:' + biasCol + ';font-weight:800">' + (c.bias >= 0 ? '+' : '') + c.bias.toFixed(1) + 'pp</td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);color:var(--muted);font-size:11px">' + c.bets + ' pariuri</td>' +
      '<td style="padding:8px 10px;text-align:right;font-size:11px;color:var(--muted)">' + (c.bets >= 10 ? signal : '—') + '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Date insuficiente.</td></tr>';

  // Render
  root.innerHTML =
    '<div class="section" style="margin-bottom:12px;padding:14px;background:linear-gradient(135deg,rgba(168,85,247,.06),rgba(16,185,129,.04));border:1px solid rgba(168,85,247,.22);border-radius:16px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        '<div>' +
          '<div style="font-size:16px;font-weight:900;color:var(--txt)">🧬 Motor de Invatare Continua</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.5">Recalculat la fiecare refresh din jurnalul de pariuri. Decay exponential pe ' + L.half_life_days + ' zile. Multiplicatori aplicati automat pe SmartScore si filtrele din Meciuri.</div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);font-family:var(--mono)">v' + L.version + '</div>' +
      '</div>' +
      summary +
    '</div>' +

    '<div class="section" style="margin-bottom:12px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.08)">' +
      '<div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">📊 Performanta pe piata</div>' +
      marketTable +
    '</div>' +

    '<div class="section" style="margin-bottom:12px;padding:14px;border-radius:14px;border:1px solid rgba(16,185,129,.18);background:linear-gradient(135deg,rgba(16,185,129,.03),rgba(0,0,0,0))">' +
      '<div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🚀 Top tipare cu boost activ</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">' +
        (boostCards || '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Niciun tipar pozitiv cu confidence suficient. Se vor forma pe masura ce cresc pariurile settled.</div>') +
      '</div>' +
    '</div>' +

    '<div class="section" style="margin-bottom:12px;padding:14px;border-radius:14px;border:1px solid rgba(239,68,68,.18);background:linear-gradient(135deg,rgba(239,68,68,.03),rgba(0,0,0,0))">' +
      '<div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🚫 Tipare toxice (auto-blocate)</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">' + toxicCards + '</div>' +
    '</div>' +

    '<div class="section" style="margin-bottom:12px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.08)">' +
      '<div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:6px">🎯 Calibrare probabilitate prezisa vs realitate</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.55">Daca actual &gt; predicted (bias pozitiv), piata este sub-estimata si poti creste incredere. Invers, supra-estimata.</div>' +
      '<div style="overflow-x:auto;border-radius:12px;border:1px solid rgba(255,255,255,.08)">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr style="background:rgba(255,255,255,.04)">' +
          '<th style="padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Interval prob</th>' +
          '<th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Prezis</th>' +
          '<th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Real</th>' +
          '<th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Bias</th>' +
          '<th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Sample</th>' +
          '<th style="padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.08);font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Semnal</th>' +
        '</tr></thead><tbody>' + calibBody + '</tbody></table></div>' +
    '</div>' +

    '<div id="walk-forward-root"></div>' +
    '<div id="extended-analytics-root"></div>';

  // Render walk-forward validation panel separately (uses its own cache + DOM root)
  try { renderWalkForwardValidation(); } catch(e){ console.warn('[WalkForward] render failed', e); }
  // Render extended analytics (time-to-kickoff, prob source, A/B filter)
  try { renderExtendedAnalytics(); } catch(e){ console.warn('[ExtendedAnalytics] render failed', e); }
}


function analyzeMatch(raw){
  var e = raw.event || {};
  var conf = normalizeConfidence(raw.confidence != null ? raw.confidence : raw.favorite_prob);
  var bestBet = null;
  var bestScore = -1;
  var allBets = [];
  var over15Meta = buildHybridProbForMarket(raw, 'over15');
  var over25Meta = buildHybridProbForMarket(raw, 'over25');
  var under25Meta = buildHybridProbForMarket(raw, 'under25');
  var under35Meta = buildHybridProbForMarket(raw, 'under35');
  var bttsMeta = buildHybridProbForMarket(raw, 'btts');
  var poissonMetrics = buildPoissonMetrics(raw);

  BET_TYPES.forEach(function(bt){
    var probMeta = buildHybridProbForMarket(raw, bt.key);
    var fallbackProb = bt.probGetter ? safePct(bt.probGetter(raw)) : safePct(raw[bt.probField]);
    var prob = probMeta && probMeta.effectiveProb != null ? safePct(probMeta.effectiveProb) : fallbackProb;
    var baseOdds = bt.oddsGetter ? Number(bt.oddsGetter(e) || 0) : Number(e[bt.oddsField] || 0);
    var compareMeta = getMarketCompareInfo(raw, bt.key, baseOdds);
    var odds = Number(compareMeta.bestOdds || baseOdds || 0);
    if(!prob || !odds || !isSaneOddsForType(bt.key, odds)) return;

    var value = calcValue(prob, odds);
    var marketProb = getNoVigMarketProbFromRaw(raw, bt.key);
    var edgePct = marketProb != null ? +(prob - marketProb).toFixed(2) : null;
    var adjProb = calcAdjustedProb(prob, conf, e.league ? e.league.name : '', bt.key, odds);
    var score = calcSmartScore(adjProb, value, conf, edgePct);
    if(probMeta && probMeta.alert){
      score += probMeta.direction === 'value' ? 2 : -3;
    }
    var verdict = getVerdict(adjProb, value, conf);

    var item = {
      type: bt.key,
      label: bt.label,
      prob: prob,
      apiProb: probMeta ? probMeta.apiProb : fallbackProb,
      poissonProb: probMeta ? probMeta.poissonProb : null,
      poissonDelta: probMeta ? probMeta.delta : null,
      poissonAlert: !!(probMeta && probMeta.alert),
      poissonDirection: probMeta ? probMeta.direction : 'flat',
      totalLambda: probMeta ? probMeta.totalLambda : null,
      odds: odds,
      baseOdds: baseOdds,
      bestOdds: compareMeta ? compareMeta.bestOdds : odds,
      oddsSource: compareMeta ? compareMeta.activeSource : 'STD',
      hasMarketCompare: !!(compareMeta && compareMeta.hasCompare),
      marketComparePresent: !!(compareMeta && compareMeta.rowPresent),
      usesBestOdds: !!(compareMeta && compareMeta.hasCompare && Number(compareMeta.bestOdds || 0) >= Number(baseOdds || 0) && Number(compareMeta.bestOdds || 0) > 1.01),
      bestBookmaker: compareMeta ? compareMeta.bestBookmaker : '',
      bookmakersCount: compareMeta ? compareMeta.bookmakersCount : 0,
      avgMarketOdds: compareMeta ? compareMeta.avgOdds : 0,
      marketGapPct: compareMeta ? compareMeta.gapPct : 0,
      bestImpliedProb: compareMeta ? compareMeta.bestImpliedProb : null,
      avgImpliedProb: compareMeta ? compareMeta.avgImpliedProb : null,
      value: +value.toFixed(4),
      adjProb: adjProb,
      score: score,
      verdict: verdict,
      marketProb: marketProb,
      edgePct: edgePct,
      kellyPct: (function(p, o){
        if(!p || !o || o < 1.01) return 0;
        var b2 = o - 1, pf = p / 100;
        var k = (pf * b2 - (1 - pf)) / b2;
        return +Math.max(0, Math.min(k * 0.25, 0.06) * 100).toFixed(3);
      })(adjProb, odds),
      sourceApi: apiRecommendForRaw(raw, bt.key),
      sourceHeuristic: heuristicRecommendForRaw(raw, bt.key),
      probabilityEngine: (probMeta && probMeta.poissonProb != null) ? 'hybrid' : 'api',
      injuryAdjustment: probMeta ? Number(probMeta.injuryAdjustment || 0) : 0,
      injuryApplied: !!(probMeta && probMeta.injuryApplied),
      injurySummary: probMeta && probMeta.injurySummary ? String(probMeta.injurySummary) : '',
      injuryHome: probMeta ? Number(probMeta.injuryHome || 0) : 0,
      injuryAway: probMeta ? Number(probMeta.injuryAway || 0) : 0,
      calibrationDelta: probMeta && probMeta.calibrationDelta != null ? Number(probMeta.calibrationDelta) : null,
      preCalibrationProb: probMeta && probMeta.preCalibrationProb != null ? Number(probMeta.preCalibrationProb) : null,
      // ─── Odds Consensus ────────────────────────────────────────────────────
      consensusFlag: (function(){
        var hasCompare = !!(compareMeta && compareMeta.hasCompare && Number(compareMeta.bestOdds || 0) > 1.01);
        if(hasCompare){
          var bkCount = compareMeta ? Number(compareMeta.bookmakersCount || 0) : 0;
          var bestO = compareMeta ? Number(compareMeta.bestOdds || 0) : 0;
          var avgO  = compareMeta ? Number(compareMeta.avgOdds  || 0) : 0;
          // no-vig: folosim avgOdds dacă există, altfel bestOdds
          var useO  = (avgO > 1.01) ? avgO : bestO;
          var mNoVig = useO > 1.01 ? (100 / useO) : 0;
          var edgeVM = mNoVig > 0 ? (adjProb - mNoVig) : null;
          if(bkCount > 0 && bkCount < 3) return 'LOW_BOOKS';
          if(avgO > 1.01 && bestO > avgO * 1.08) return 'ISOLATED_ODDS';
          if(edgeVM !== null && edgeVM < -2) return 'AGAINST_MARKET';
          if(edgeVM !== null && edgeVM >= 0 && edgeVM < 2) return 'WEAK_CONSENSUS';
          return 'OK';
        }
        // ── Fallback: cotă directă din event (Bzzoiro API single-source) ──
        // BSD /api/odds/compare/ returnează doar 1X2 + BTTS în market_best_odds;
        // pentru under35/over15/over25 etc. folosim cota event.odds_<market> și,
        // dacă există ambele părți ale pieței, no-vig prob din getNoVigMarketProbFromRaw.
        var evOdds = Number(baseOdds || 0);
        if(evOdds > 1.01){
          var mProbSingle = (marketProb != null && Number(marketProb) > 0) ? Number(marketProb) : (100 / evOdds);
          var edgeSingle = adjProb - mProbSingle;
          if(edgeSingle < -2) return 'AGAINST_MARKET';
          if(edgeSingle < 2)  return 'WEAK_CONSENSUS';
          return 'OK';
        }
        return 'NO_DATA';
      })(),
      edgeVsMarket: (function(){
        var hasCompare = !!(compareMeta && compareMeta.hasCompare && Number(compareMeta.bestOdds || 0) > 1.01);
        if(hasCompare){
          var bestO = compareMeta ? Number(compareMeta.bestOdds || 0) : 0;
          var avgO  = compareMeta ? Number(compareMeta.avgOdds  || 0) : 0;
          var useO  = (avgO > 1.01) ? avgO : bestO;
          var mNoVig = useO > 1.01 ? (100 / useO) : 0;
          return mNoVig > 0 ? +((adjProb - mNoVig).toFixed(2)) : null;
        }
        // Fallback single-source pe baseOdds (event.odds_*) cu preferință no-vig
        var evOdds = Number(baseOdds || 0);
        if(evOdds > 1.01){
          var mProbSingle = (marketProb != null && Number(marketProb) > 0) ? Number(marketProb) : (100 / evOdds);
          return +((adjProb - mProbSingle).toFixed(2));
        }
        return null;
      })()
    };

    allBets.push(item);
    if(score > bestScore){
      bestScore = score;
      bestBet = item;
    }
  });

  var extra = getExtraMarkets(raw);
  var doubleChancePick = getDoubleChancePick(raw, extra, conf);

  var candidates = allBets.slice().sort(function(a,b){
    if((b.adjProb || 0) !== (a.adjProb || 0)) return (b.adjProb || 0) - (a.adjProb || 0);
    return (b.value || 0) - (a.value || 0);
  }).slice(0, 3).map(function(item){
    return {
      label: item.label,
      prob: item.adjProb || item.prob || 0,
      tag: item.type
    };
  });

  var mlFlags = {
    o15: allBets.some(function(x){ return x.type === 'over15'; }),
    o25: allBets.some(function(x){ return x.type === 'over25'; }),
    u35: allBets.some(function(x){ return x.type === 'under35'; }),
    o35: false,
    btts: allBets.some(function(x){ return x.type === 'btts'; }),
    winner: false,
    fav: !!raw.favorite_recommend
  };
  var homeApiId = e.home_team_obj ? (e.home_team_obj.api_id || e.home_team_obj.id || null) : null;
  var awayApiId = e.away_team_obj ? (e.away_team_obj.api_id || e.away_team_obj.id || null) : null;
  var leagueApiId = e.league ? (e.league.api_id || e.league.id || null) : null;

  var leagueTierInfo = getLeagueTierInfo(e.league ? e.league.name : '');
  return {
    id: raw.id,
    eventId: e.id,
    home: e.home_team,
    away: e.away_team,
    homeApiId: homeApiId,
    awayApiId: awayApiId,
    league: e.league ? e.league.name : '',
    country: e.league ? e.league.country : '',
    leagueApiId: leagueApiId,
    leagueTier: leagueTierInfo.tier,
    leagueTierLabel: leagueTierInfo.label,
    date: e.event_date,
    dateKey: fmtDateKey(e.event_date),
    dateLabel: fmtDate(e.event_date),
    timeLabel: fmtTime(e.event_date),
    status: e.status,
    confidence: conf,
    createdAt: raw.created_at || null,
    xgHome: Number(raw.expected_home_goals || 0),
    xgAway: Number(raw.expected_away_goals || 0),
    xgTotal: Number(raw.expected_home_goals || 0) + Number(raw.expected_away_goals || 0),
    poisson: poissonMetrics,
    bestBet: bestBet,
    allBets: allBets,
    extraMarkets: extra,
    smartScore: bestBet ? bestBet.score : 0,
    verdict: bestBet ? bestBet.verdict : 'avoid',
    mlPicks: candidates,
    hasMlRec: candidates.length > 0,
    mlFlags: mlFlags,
    probHome: safePct(raw.prob_home_win),
    probDraw: safePct(raw.prob_draw),
    probAway: safePct(raw.prob_away_win),
    prob1X: extra.prob1X,
    probX2: extra.probX2,
    prob12: extra.prob12,
    fairOdds1X: extra.fairOdds1X,
    fairOddsX2: extra.fairOddsX2,
    fairOdds12: extra.fairOdds12,
    doubleChancePick: doubleChancePick,
    probOver15: over15Meta.effectiveProb,
    apiProbOver15: over15Meta.apiProb,
    poissonProbOver15: over15Meta.poissonProb,
    probUnder15: 100 - over15Meta.effectiveProb,
    probOver25: over25Meta.effectiveProb,
    apiProbOver25: over25Meta.apiProb,
    poissonProbOver25: over25Meta.poissonProb,
    probUnder25: under25Meta.effectiveProb,
    apiProbUnder25: under25Meta.apiProb,
    poissonProbUnder25: under25Meta.poissonProb,
    probOver35: safePct(raw.prob_over_35),
    probUnder35: under35Meta.effectiveProb,
    apiProbUnder35: under35Meta.apiProb,
    poissonProbUnder35: under35Meta.poissonProb,
    probBtts: bttsMeta.effectiveProb,
    apiProbBtts: bttsMeta.apiProb,
    poissonProbBtts: bttsMeta.poissonProb,
    probBttsNo: 100 - bttsMeta.effectiveProb,
    mostLikelyScore: raw.most_likely_score || null,
    favorite: raw.favorite || null,
    favoriteProp: raw.favorite_prob || null,
    favoriteRecommend: raw.favorite_recommend || false,
    winnerRecommend: raw.winner_recommend || false,
    oddsHome: e.odds_home,
    oddsDraw: e.odds_draw,
    oddsAway: e.odds_away,
    oddsOver15: e.odds_over_15,
    oddsUnder15: e.odds_under_15,
    oddsOver25: e.odds_over_25,
    oddsUnder25: e.odds_under_25,
    oddsOver35: e.odds_over_35,
    oddsUnder35: e.odds_under_35,
    oddsBtts: e.odds_btts_yes,
    oddsBttsNo: e.odds_btts_no,
    predictedResult: raw.predicted_result,
    modelVersion: raw.model_version,
    rawBestBet: bestBet ? Object.assign({}, bestBet) : null,
    rawSmartScore: bestBet ? bestBet.score : 0,
    rawVerdict: bestBet ? bestBet.verdict : 'avoid',
    analysisState: bestBet ? 'RAW_ONLY' : 'NO_ODDS',
    eligibleCandidates: [],
    apiFlagsCount: [raw.over_15_recommend, raw.over_25_recommend, raw.btts_recommend, raw.favorite_recommend, raw.winner_recommend].filter(Boolean).length,
    // ML5 fields (completate de applyEnrichmentToMatch)
    isEnriched   : false,
    enrichedAt   : null,
    homeForm     : null,
    awayForm     : null,
    homeFormStr  : '',
    awayFormStr  : '',
    h2h          : null,
    h2hLabel     : '',
    homeCoach    : null,
    awayCoach    : null,
    homeCoachName: '',
    awayCoachName: '',
    homeCoachStyles: [],
    awayCoachStyles: [],
    // Câmpuri îmbogățite din enrich_predictions.py
    riskTier       : raw.risk_tier || null,
    rationale      : raw.rationale || null,
    enrichedKellyPct: raw.kelly_pct != null ? Number(raw.kelly_pct) : null,
    enrichedEvPct  : raw.ev_pct != null ? Number(raw.ev_pct) : null,
    catboostSignal : raw.catboost_signal || null,
    polymarketSignal   : raw.polymarket_signal     || null,
    polymarketDivergence: raw.polymarket_divergence != null ? Number(raw.polymarket_divergence) : null,
    polymarketMarket   : raw.polymarket_market     || null,
    funfacts           : Array.isArray(raw.funfacts) ? raw.funfacts : [],
    catboostMarket : raw.catboost_market || null,
    catboostScore  : raw.catboost_score != null ? Number(raw.catboost_score) : null,
    catboostEvPct  : raw.catboost_ev_pct != null ? Number(raw.catboost_ev_pct) : null,
    catboostKellyPct: raw.catboost_kelly_pct != null ? Number(raw.catboost_kelly_pct) : null,
    supremeAdjustedProb: raw.supreme_adjusted_prob != null ? Number(raw.supreme_adjusted_prob) : null,
    supremeFinalProb   : raw.supreme_final_prob != null ? Number(raw.supreme_final_prob) : null,
    supremeAgreement   : raw.supreme_agreement != null ? Number(raw.supreme_agreement) : null,
    supremeReliability : raw.supreme_reliability != null ? Number(raw.supreme_reliability) : null,
    supremeDataQuality : raw.supreme_data_quality_score != null ? Number(raw.supreme_data_quality_score) : null,
    lineupRisk         : raw.supreme_lineup_risk != null ? Number(raw.supreme_lineup_risk) : 0,
    contextRisk        : raw.supreme_context_risk != null ? Number(raw.supreme_context_risk) : 0,
    statsProfileProb   : raw.stats_profile_prob != null ? Number(raw.stats_profile_prob) : null,
    statsContextBonus  : raw.stats_context_bonus != null ? Number(raw.stats_context_bonus) : null,
    playerContextBonus : raw.player_context_bonus != null ? Number(raw.player_context_bonus) : null,
    playerAvailabilityRisk: raw.player_availability_risk != null ? Number(raw.player_availability_risk) : 0,
    playerRatingDiffForm5 : raw.player_rating_diff_form5 != null ? Number(raw.player_rating_diff_form5) : null,
    playerAttackXgSumForm5: raw.player_attack_xg_sum_form5 != null ? Number(raw.player_attack_xg_sum_form5) : null,
    playerAttackXgDiffForm5: raw.player_attack_xg_diff_form5 != null ? Number(raw.player_attack_xg_diff_form5) : null,
    bookmakersCount    : raw.market_bookmakers_count != null ? Number(raw.market_bookmakers_count) : 0,
    v2Recommended  : !!raw.v2_recommended,
    xgdDiff        : raw.xgd_diff        != null ? Number(raw.xgd_diff)          : null,
    homeXgd        : raw.home_xgd        != null ? Number(raw.home_xgd)          : null,
    awayXgd        : raw.away_xgd        != null ? Number(raw.away_xgd)          : null,
    homeMgrO25     : raw.home_mgr_over25_pct != null ? Number(raw.home_mgr_over25_pct) : null,
    awayMgrO25     : raw.away_mgr_over25_pct != null ? Number(raw.away_mgr_over25_pct) : null,
    homeMgrBtts    : raw.home_mgr_btts_pct  != null ? Number(raw.home_mgr_btts_pct)   : null,
    awayMgrBtts    : raw.away_mgr_btts_pct  != null ? Number(raw.away_mgr_btts_pct)   : null,
    homeMgrCs      : raw.home_mgr_cs_pct    != null ? Number(raw.home_mgr_cs_pct)     : null,
    awayMgrCs      : raw.away_mgr_cs_pct    != null ? Number(raw.away_mgr_cs_pct)     : null,
    // ─── BSD API v2 signals ───────────────────────────────────────────────────
    v2Recommended  : !!raw.v2_recommended,
    xgdDiff        : raw.xgd_diff        != null ? Number(raw.xgd_diff)          : null,
    homeXgd        : raw.home_xgd        != null ? Number(raw.home_xgd)          : null,
    awayXgd        : raw.away_xgd        != null ? Number(raw.away_xgd)          : null,
    homeMgrO25     : raw.home_mgr_over25_pct != null ? Number(raw.home_mgr_over25_pct) : null,
    awayMgrO25     : raw.away_mgr_over25_pct != null ? Number(raw.away_mgr_over25_pct) : null,
    homeMgrBtts    : raw.home_mgr_btts_pct  != null ? Number(raw.home_mgr_btts_pct)   : null,
    awayMgrBtts    : raw.away_mgr_btts_pct  != null ? Number(raw.away_mgr_btts_pct)   : null,
    homeMgrCs      : raw.home_mgr_cs_pct    != null ? Number(raw.home_mgr_cs_pct)     : null,
    awayMgrCs      : raw.away_mgr_cs_pct    != null ? Number(raw.away_mgr_cs_pct)     : null,
    // ─── Referee stats (fetch_referee_stats.py) ──────────────────────────────
    refName        : raw.ref_name     || null,
    refCountry     : raw.ref_country  || null,
    refAvgYellow   : raw.ref_avg_yellow  != null ? Number(raw.ref_avg_yellow)  : null,
    refAvgRed      : raw.ref_avg_red     != null ? Number(raw.ref_avg_red)     : null,
    refAvgGoals    : raw.ref_avg_goals   != null ? Number(raw.ref_avg_goals)   : null,
    refAvgFouls    : raw.ref_avg_fouls   != null ? Number(raw.ref_avg_fouls)   : null,
    refStyle       : raw.ref_style    || null,
    refIsStrict    : raw.ref_is_strict    != null ? !!raw.ref_is_strict    : null,
    refIsHighGoals : raw.ref_is_high_goals!= null ? !!raw.ref_is_high_goals: null,
    refMatches     : raw.ref_matches   != null ? Number(raw.ref_matches)   : null,
    refYellowTrend : raw.ref_yellow_trend != null ? Number(raw.ref_yellow_trend) : null,
    refGoalsTrend  : raw.ref_goals_trend  != null ? Number(raw.ref_goals_trend)  : null,
    // ─── Lineup (fetch_lineups_today.py + v1 event unavailable_players) ──
    lineupStatus   : (function(){
      if(raw.lineup_status) return raw.lineup_status;
      var eu = raw.event && raw.event.unavailable_players;
      if(eu && (( Array.isArray(eu.home) && eu.home.length) || (Array.isArray(eu.away) && eu.away.length))) return 'predicted';
      return null;
    })(),
    homeFormation  : raw.home_formation || null,
    awayFormation  : raw.away_formation || null,
    nInjuredHome   : raw.n_injured_home != null ? Number(raw.n_injured_home) : 0,
    nInjuredAway   : raw.n_injured_away != null ? Number(raw.n_injured_away) : 0,
    nUnavailHome   : (function(){
      if(raw.n_unavail_home > 0) return Number(raw.n_unavail_home);
      var eu = raw.event && raw.event.unavailable_players;
      return (eu && Array.isArray(eu.home)) ? eu.home.length : 0;
    })(),
    nUnavailAway   : (function(){
      if(raw.n_unavail_away > 0) return Number(raw.n_unavail_away);
      var eu = raw.event && raw.event.unavailable_players;
      return (eu && Array.isArray(eu.away)) ? eu.away.length : 0;
    })(),
    homeUnavailable: (function(){
      if(Array.isArray(raw.home_unavailable) && raw.home_unavailable.length) return raw.home_unavailable;
      var eu = raw.event && raw.event.unavailable_players;
      return (eu && Array.isArray(eu.home)) ? eu.home : [];
    })(),
    awayUnavailable: (function(){
      if(Array.isArray(raw.away_unavailable) && raw.away_unavailable.length) return raw.away_unavailable;
      var eu = raw.event && raw.event.unavailable_players;
      return (eu && Array.isArray(eu.away)) ? eu.away : [];
    })(),
    homeStarters   : Array.isArray(raw.home_starters)    ? raw.home_starters    : [],
    awayStarters   : Array.isArray(raw.away_starters)    ? raw.away_starters    : [],
    homeConfidence : raw.home_confidence != null ? Number(raw.home_confidence) : null,
    awayConfidence : raw.away_confidence != null ? Number(raw.away_confidence) : null
  };
}

function isMatchStillDisplayable(m){
  if(!m) return false;
  if(String(m.status || '').toLowerCase() === 'finished') return false;
  var matchTime = new Date(m.date).getTime();
  if(!isFinite(matchTime)) return false;
  var now = new Date().getTime();
  return matchTime > (now - 90 * 60 * 1000);
}

function passesSelectionFilter(m){
  if(!m || !m.bestBet || m.analysisState !== 'ELIGIBLE') return false;
  return isMatchStillDisplayable(m);
}

function isProActiveMatch(m){
  if(!passesSelectionFilter(m)) return false;
  var b = m.bestBet || {};
  return m.leagueTier !== 'avoid' && Number(b.adjProb || 0) >= 72 && Number(b.edgePct != null ? b.edgePct : -999) >= 1.5 && Number(b.value || 0) >= 0.01;
}

function getBetByType(m, type){
  return (m && m.allBets || []).find(function(x){ return x.type === type; }) || null;
}

function getAnalysisStateMeta(state){
  if(state === 'ELIGIBLE') return {label:'✅ ELIGIBLE', color:'var(--grn)', bg:'rgba(34,197,94,.12)', border:'rgba(34,197,94,.25)'};
  if(state === 'CONTRADICTED') return {label:'⚠️ CONTRADICTED', color:'var(--yel)', bg:'rgba(245,158,11,.12)', border:'rgba(245,158,11,.25)'};
  if(state === 'FILTERED_OUT') return {label:'🧠 FILTERED', color:'var(--acc)', bg:'rgba(59,130,246,.12)', border:'rgba(59,130,246,.25)'};
  if(state === 'NO_EDGE') return {label:'⛔ NO EDGE', color:'var(--red)', bg:'rgba(239,68,68,.12)', border:'rgba(239,68,68,.25)'};
  return {label:'🛰️ NO ODDS', color:'var(--muted)', bg:'rgba(148,163,184,.12)', border:'rgba(148,163,184,.25)'};
}

function syncRecommendationEngine(){
  ALL_MATCHES.forEach(function(m){
    var positive = [];
    var eligible = [];
    var anyOdds = false;

    getSupportedMarketTypes().forEach(function(type){
      var rawBet = getBetByType(m, type);
      if(rawBet){
        anyOdds = true;
        if(rawBet.value > 0) positive.push(type);
      }
      var cand = buildMarketCandidate(m, type);
      if(cand && cand.bestBet) eligible.push(cand);
    });

    eligible.sort(function(a, b){
      if((b.ticketScore || 0) !== (a.ticketScore || 0)) return (b.ticketScore || 0) - (a.ticketScore || 0);
      if((b.bestBet.value || 0) !== (a.bestBet.value || 0)) return (b.bestBet.value || 0) - (a.bestBet.value || 0);
      return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
    });

    m.eligibleCandidates = eligible;

    if(eligible.length){
      m.bestBet = Object.assign({}, eligible[0].bestBet);
      m.smartScore = eligible[0].ticketScore || m.bestBet.score || 0;
      m.verdict = m.bestBet.verdict || 'moderate';
      m.analysisState = 'ELIGIBLE';
      m.why = eligible[0].why || '';
    } else {
      m.bestBet = null;
      m.smartScore = 0;
      m.verdict = 'avoid';
      m.why = '';
      if(!anyOdds) m.analysisState = 'NO_ODDS';
      else if(positive.length && positive.every(function(t){ return isHardContradiction(m, t); })) m.analysisState = 'CONTRADICTED';
      else if(positive.length) m.analysisState = 'FILTERED_OUT';
      else m.analysisState = 'NO_EDGE';
    }
  });
}

// ============================================================
// DATA LOADING
// ============================================================
function getBase(){
  return document.location.pathname.replace(/\/[^\/]*$/, '');
}

var LAZY_DATA_PROMISES = {};
var LAZY_DATA_READY = {
  predictions:false,
  meta:false,
  leagues:false,
  backtest:false,
  signalAudit:false,
  aiMemory:false,
  trainingBaselines:false,
  trainingSummary:false,
  events:false,
  recommendationLog:false,
  historyEngine:false,
  recommendationJournal:false,
  archiveSummary:false,
  fullHistoryAssets:false
};
var FULL_HISTORY_ASSETS_PROMISE = null;
var DATASET_CACHE_VERSION = '20260425archivefix1';

function getDatasetCacheKey(key){
  return 'bet_dataset_cache_' + DATASET_CACHE_VERSION + '_' + key;
}
function readDatasetCache(key, maxAgeMs){
  try {
    var raw = localStorage.getItem(getDatasetCacheKey(key));
    if(!raw) return null;
    var payload = JSON.parse(raw);
    if(!payload || typeof payload !== 'object') return null;
    if(maxAgeMs && payload.ts && (Date.now() - Number(payload.ts)) > maxAgeMs) return null;
    return payload.data;
  } catch(err){
    return null;
  }
}
function writeDatasetCache(key, data){
  try {
    localStorage.setItem(getDatasetCacheKey(key), JSON.stringify({ ts: Date.now(), data: data }));
  } catch(err){}
}
function hydrateLazyBootstrapCache(){
  if(!(RECOMMENDATION_LOG || []).length){
    var cachedLog = readDatasetCache('recommendationLog', 12 * 3600 * 1000);
    if(Array.isArray(cachedLog) && cachedLog.length) RECOMMENDATION_LOG = normalizeResultList(cachedLog);
  }
  if(!(HISTORY_ENGINE || []).length){
    var cachedHistory = readDatasetCache('historyEngine', 24 * 3600 * 1000);
    if(Array.isArray(cachedHistory) && cachedHistory.length) HISTORY_ENGINE = normalizeResultList(cachedHistory);
  }
}

// ── In-memory JSON cache (5 minute TTL) ──────────────────────
var _JSON_MEM_CACHE = {};
var _JSON_CACHE_TTL = 5 * 60 * 1000; // 5 min

function getJson(path, fallback, _forceRefresh){
  var now = Date.now();
  var entry = _JSON_MEM_CACHE[path];
  if(!_forceRefresh && entry && (now - entry.ts) < _JSON_CACHE_TTL){
    return Promise.resolve(entry.data);
  }
  // Only bust cache on explicit force-refresh, use normal browser cache otherwise
  var url = getBase() + path + (_forceRefresh ? ('?t=' + now) : '');
  return fetch(url, { cache: _forceRefresh ? 'no-store' : 'default' })
    .then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + path);
      return r.json();
    })
    .then(function(data){
      _JSON_MEM_CACHE[path] = { ts: Date.now(), data: data };
      return data;
    })
    .catch(function(){ return fallback; });
}

function getJsonFresh(path, fallback){
  delete _JSON_MEM_CACHE[path];
  return getJson(path, fallback, true);
}

var ARCHIVE_SUMMARY_PROMISE = null;
var ARCHIVE_SUMMARY_LOADING = false;
var ARCHIVE_SUMMARY_STATE = { loaded:false };

function archiveSummarySkeletonCard(label){
  return '<div style="padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
    '<div style="height:18px;width:58%;border-radius:8px;background:rgba(255,255,255,.08);margin-bottom:12px"></div>' +
    '<div style="height:26px;width:72%;border-radius:10px;background:rgba(255,255,255,.10);margin-bottom:8px"></div>' +
    '<div style="height:12px;width:78%;border-radius:8px;background:rgba(255,255,255,.06);margin-bottom:10px"></div>' +
    '<div style="font-size:11px;color:var(--muted)">' + (label || 'Se încarcă...') + '</div>' +
  '</div>';
}

function renderArchiveSummarySkeleton(){
  var cards = document.getElementById('archive-summary-cards');
  var impact = document.getElementById('archive-learning-impact');
  if(cards){
    cards.innerHTML = [
      archiveSummarySkeletonCard('Jurnal aplicație'),
      archiveSummarySkeletonCard('Baza istorică API'),
      archiveSummarySkeletonCard('Model AI + patterns')
    ].join('');
  }
  if(impact){
    impact.innerHTML = '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);font-size:12px;color:var(--muted)">Se încarcă rezumatul bazei de învățare...</div>';
  }
}

function applyArchiveSummaryData(bundle){
  ARCHIVE_SUMMARY_STATE = Object.assign({ loaded:true }, bundle || {});
  LAZY_DATA_READY.archiveSummary = true;
  writeDatasetCache('archiveSummary', ARCHIVE_SUMMARY_STATE);
  try {
    if(ARCHIVE_SUMMARY_STATE.aiMemory) AI_MEMORY = ARCHIVE_SUMMARY_STATE.aiMemory;
    if(ARCHIVE_SUMMARY_STATE.baselines) TRAINING_MARKET_BASELINES = ARCHIVE_SUMMARY_STATE.baselines;
    // SmartBet Fusion v2 — stochează în window pentru acces global
    if(ARCHIVE_SUMMARY_STATE.modelPackV2) window.__SBV2_MODEL_PACK__ = ARCHIVE_SUMMARY_STATE.modelPackV2;
    if(ARCHIVE_SUMMARY_STATE.sbMetaV2)   window.__SBV2_META__       = ARCHIVE_SUMMARY_STATE.sbMetaV2;
  } catch(err){}
}

function ensureArchiveSummaryData(){
  if(LAZY_DATA_READY.archiveSummary && ARCHIVE_SUMMARY_STATE && ARCHIVE_SUMMARY_STATE.loaded){
    return Promise.resolve(true);
  }
  if(ARCHIVE_SUMMARY_PROMISE) return ARCHIVE_SUMMARY_PROMISE;

  var cached = readDatasetCache('archiveSummary', 24 * 3600 * 1000);
  if(cached && cached.loaded){
    ARCHIVE_SUMMARY_STATE = cached;
    LAZY_DATA_READY.archiveSummary = true;
    try {
      if(cached.aiMemory) AI_MEMORY = cached.aiMemory;
      if(cached.baselines) TRAINING_MARKET_BASELINES = cached.baselines;
    } catch(err){}
  }

  ARCHIVE_SUMMARY_LOADING = true;
  if((window._smartLearnSection || '') === 'arhiva') renderArchivePanel();

  var jobs = {
    fullMeta: getJson('/data/full_history_meta.json', null),
    apiSummary: getJson('/data/api_history_summary.json', null),
    apiEventsSummary: getJson('/data/api_events_history_summary.json', null),
    trainSum: getJson('/data/training_dataset_summary.json', null),
    trainModel: getJson('/data/training_model_summary.json', null),
    baselines: getJson('/data/training_market_baselines.json', []),
    aiMemory: getJson('/data/ai_memory.json', null),
    modelPackV2: getJson('/data/model_pack_v2.json', null),
    sbMetaV2: getJson('/data/smartbet_meta_v2.json', null)
  };

  ARCHIVE_SUMMARY_PROMISE = Promise.all([
    jobs.fullMeta,
    jobs.apiSummary,
    jobs.apiEventsSummary,
    jobs.trainSum,
    jobs.trainModel,
    jobs.baselines,
    jobs.aiMemory,
    jobs.modelPackV2,
    jobs.sbMetaV2
  ]).then(function(values){
    applyArchiveSummaryData({
      fullMeta: values[0] || {},
      apiSummary: values[1] || {},
      apiEventsSummary: values[2] || {},
      trainSum: values[3] || {},
      trainModel: values[4] || {},
      baselines: Array.isArray(values[5]) ? values[5] : [],
      aiMemory: values[6] || {},
      modelPackV2: values[7] || null,
      sbMetaV2: values[8] || null
    });
    return true;
  }).catch(function(err){
    console.warn('[ArchiveSummary] load failed', err);
    return false;
  }).finally(function(){
    ARCHIVE_SUMMARY_LOADING = false;
    ARCHIVE_SUMMARY_PROMISE = null;
  });

  return ARCHIVE_SUMMARY_PROMISE;
}


function normalizeResultList(data){
  return Array.isArray(data) ? data : ((data && data.results) || []);
}

function rerunPredictionPipeline(rawPredictions){
  var preds = Array.isArray(rawPredictions) ? rawPredictions : [];
  rebuildTrainingBaselineMap();

  return new Promise(function(resolve){
    if(preds.length === 0){
      ALL_MATCHES = [];
      rebuildVisualMatchIndex();
      syncRecommendationEngine();
      resolve();
      return;
    }

    // Procesare în chunks de 60 pentru a nu bloca thread-ul principal
    var CHUNK = 60;
    var results = new Array(preds.length);
    var idx = 0;

    function processChunk(){
      var end = Math.min(idx + CHUNK, preds.length);
      for(var i = idx; i < end; i++){
        var raw = preds[i];
        var m = analyzeMatch(raw);
        var eid = String(m.eventId||'');
        if(eid && ENRICHED_EVENT_CACHE[eid])
          m = applyEnrichmentToMatch(m, raw, ENRICHED_EVENT_CACHE[eid]);
        results[i] = m;
      }
      idx = end;
      if(idx < preds.length){
        // Yield la browser între chunks — UI rămâne responsiv
        setTimeout(processChunk, 0);
      } else {
        ALL_MATCHES = results;
        rebuildVisualMatchIndex();
        syncRecommendationEngine();
        // Enrichment în background după 2s
        setTimeout(function(){
          enrichTopMatchesBackground().catch(function(){});
        }, 2000);
        resolve();
      }
    }
    processChunk();
  });
}

var PREDICTION_RESYNC_SCHEDULED = false;
function schedulePredictionResync(reason){
  if(PREDICTION_RESYNC_SCHEDULED) return;
  PREDICTION_RESYNC_SCHEDULED = true;
  var runner = function(){
    PREDICTION_RESYNC_SCHEDULED = false;
    try {
      (window.__RAW_PREDICTIONS || []).forEach(function(raw){ if(raw) raw.__hybridProbCache = null; });
      rerunPredictionPipeline(window.__RAW_PREDICTIONS || []).then(function(){
        if(typeof getCurrentActiveTabName === 'function' && getCurrentActiveTabName() === 'smartbet'){
          try { renderSmartBet(); } catch(e){}
          try {
            if((window._smartLearnSection || 'predictii') === 'predictii') renderUnifiedEngine();
          } catch(e){}
        }
      });
    } catch(e){
      console.warn('[LearningEngine] deferred re-sync failed' + (reason ? ' (' + reason + ')' : ''), e);
    }
  };
  if(window.requestIdleCallback){
    window.requestIdleCallback(runner, { timeout: 1200 });
  } else {
    setTimeout(runner, 250);
  }
}

function applyLazyDataset(key, data){
  if(key === 'events'){
    ALL_EVENTS = normalizeResultList(data);
    return;
  }
  if(key === 'recommendationLog'){
    RECOMMENDATION_LOG = normalizeResultList(data);
    writeDatasetCache('recommendationLog', RECOMMENDATION_LOG);
    try { autoSyncTrackingStatuses(); } catch(e){}
    return;
  }
  if(key === 'historyEngine'){
    HISTORY_ENGINE = normalizeResultList(data);
    writeDatasetCache('historyEngine', HISTORY_ENGINE);
    return;
  }
  if(key === 'recommendationJournal'){
    RECOMMENDATION_JOURNAL = normalizeResultList(data);
    try { window.RECOMMENDATION_JOURNAL = RECOMMENDATION_JOURNAL; } catch(e){}
    try { buildLearningEngine(); } catch(e){ console.warn('[LearningEngine] build failed', e); }
    schedulePredictionResync('recommendationJournal');
    return;
  }
}

function loadLazyDataset(key){
  if(LAZY_DATA_READY[key]) return Promise.resolve(true);
  if(LAZY_DATA_PROMISES[key]) return LAZY_DATA_PROMISES[key];

  var cfg = {
    events:{ path:'/data/events.json', fallback:[] },
    recommendationLog:{ path:'/data/recommendation_log.json', fallback:[] },
    historyEngine:{ path:'/data/history_engine.json', fallback:[] },
    recommendationJournal:{ path:'/data/recommendation_journal.json', fallback:[] }
  }[key];

  if(!cfg) return Promise.resolve(false);

  LAZY_DATA_PROMISES[key] = getJson(cfg.path, cfg.fallback).then(function(data){
    applyLazyDataset(key, data);
    LAZY_DATA_READY[key] = true;
    return true;
  }).finally(function(){
    delete LAZY_DATA_PROMISES[key];
  });

  return LAZY_DATA_PROMISES[key];
}

function loadScriptSequentially(srcs){
  return srcs.reduce(function(chain, src){
    return chain.then(function(){
      return new Promise(function(resolve, reject){
        var existing = document.querySelector('script[data-lazy-src="' + src + '"]');
        if(existing){
          if(existing.dataset.loaded === '1') return resolve();
          existing.addEventListener('load', function(){ resolve(); }, { once:true });
          existing.addEventListener('error', function(err){ reject(err); }, { once:true });
          return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.dataset.lazySrc = src;
        s.onload = function(){ s.dataset.loaded = '1'; resolve(); };
        s.onerror = reject;
        document.body.appendChild(s);
      });
    });
  }, Promise.resolve());
}

function ensureFullHistoryAssets(){
  if(LAZY_DATA_READY.fullHistoryAssets) return Promise.resolve(true);
  if(FULL_HISTORY_ASSETS_PROMISE) return FULL_HISTORY_ASSETS_PROMISE;
  showLoader('Se încarcă istoricul extins...');
  FULL_HISTORY_ASSETS_PROMISE = loadScriptSequentially([
    './assets/full-history.js?v=20260418',
    './assets/full-history-hotfix.js?v=20260420hotfix2'
  ]).then(function(){
    LAZY_DATA_READY.fullHistoryAssets = true;
    return true;
  }).finally(function(){
    hideLoader();
  });
  return FULL_HISTORY_ASSETS_PROMISE;
}

function rerenderTabAfterLazyLoad(name){
  if(name === 'tracking'){
    try { autoSyncTrackingStatuses(); } catch(e){}
    renderTracking();
    return;
  }
  if(name === 'charts'){
    renderAdvancedCharts();
    return;
  }
  if(name === 'smartbet'){
    try { renderSmartBet(); } catch(e){}
    try { switchSmartLearnSection(window._smartLearnSection || 'predictii'); } catch(e){}
    return;
  }
  if(name === 'dashboard'){
    return;
  }
}

function ensureTabData(name){
  var keys = [];
  if(name === 'tracking') keys = ['events', 'recommendationLog'];
  else if(name === 'charts') keys = ['recommendationLog', 'historyEngine'];
  else if(name === 'smartbet') keys = ['recommendationLog', 'historyEngine', 'recommendationJournal'];
  if(!keys.length) return Promise.resolve(false);
  return Promise.all(keys.map(loadLazyDataset));
}

function doRefresh(isManual){
  var shouldShowLoader = !!isManual || !LAZY_DATA_READY.predictions;
  if(shouldShowLoader) showLoader('Incarcare date actualizate...');

  LAZY_DATA_PROMISES = {};
  LAZY_DATA_READY.events = false;
  LAZY_DATA_READY.recommendationLog = false;
  LAZY_DATA_READY.historyEngine = false;
  LAZY_DATA_READY.recommendationJournal = false;

  // Manual refresh (buton) = forțăm re-descărcarea; auto-refresh = folosim cache-ul dacă e valid
  var fetch9 = isManual ? getJsonFresh : getJson;

  Promise.all([
    fetch9('/data/predictions.json', null),
    fetch9('/data/meta.json', {}),
    fetch9('/data/leagues.json', []),
    fetch9('/data/backtest.json', {}),
    fetch9('/data/signal_audit.json', {}),
    fetch9('/data/ai_memory.json', {}),
    fetch9('/data/training_market_baselines.json', []),
    fetch9('/data/training_scoring_summary.json', {}),
    fetch9('/data/enriched.json', {}),  // ML5 pre-baked enrichment
    fetch9('/data/build_status.json', {}),
    fetch9('/data/model_benchmarks.json', {}),
    fetch9('/data/claude_daily_analysis.json', {}),
    fetch9('/data/ai_predictions_tracking.json', {}),
    fetch9('/data/ai_match_engine.json', {})
  ]).then(function(results){
    var predData = results[0];
    var meta = results[1];
    var leaguesData = results[2];
    var backtestData = results[3];
    var signalAuditData = results[4];
    var aiMemoryData = results[5];
    var trainingBaselinesData = results[6];
    var trainingSummaryData = results[7];
    var enrichedFile = results[8] || {};
    BUILD_STATUS = results[9] || {};
    MODEL_BENCHMARKS = results[10] || {};
    window.CLAUDE_DAILY = results[11] || {};
    window.AI_PRED_TRACKING = results[12] || {};
    window.AI_MATCH_ENGINE = results[13] || {};
    _MARKET_THRESHOLDS_CACHE = null;
    if(document.getElementById('perf-verdict-content')) try{ renderPerformantaVerdict(); }catch(e){}

    // predData === null înseamnă fetch eșuat (rețea/HTTP/parse) — distinct de "server a
    // răspuns cu listă goală". Nu suprascriem meciurile existente cu o listă vidă falsă
    // (poate apărea tranzitoriu în timpul redeploy-ului GitHub Pages din workflow-ul auto).
    if(predData !== null && predData !== undefined){
      var preds = predData.results || predData || [];
      window.__RAW_PREDICTIONS = Array.isArray(preds) ? preds : [];
    } else {
      console.warn('[VEYRA] predictions.json fetch failed — pastram ' + (window.__RAW_PREDICTIONS||[]).length + ' meciuri anterioare');
    }
    APP_META = meta || {};
    BACKTEST_SUMMARY = backtestData || {};
    SIGNAL_AUDIT = signalAuditData || {};
    AI_MEMORY = aiMemoryData || {};
    TRAINING_MARKET_BASELINES = Array.isArray(trainingBaselinesData) ? trainingBaselinesData : (trainingBaselinesData.results || trainingBaselinesData || []);
    TRAINING_SCORING_SUMMARY = trainingSummaryData || {};
    ALL_LEAGUES = leaguesData.results || leaguesData || [];
    ALL_EVENTS = [];
    ALL_TEAMS = [];
    ALL_PLAYERS = [];
    HISTORY_ENGINE = [];
    RECOMMENDATION_LOG = [];
    RECOMMENDATION_JOURNAL = [];
    try { window.RECOMMENDATION_JOURNAL = RECOMMENDATION_JOURNAL; } catch(e){}
    hydrateLazyBootstrapCache();

    LAZY_DATA_READY.predictions = true;
    LAZY_DATA_READY.meta = true;
    LAZY_DATA_READY.leagues = true;
    LAZY_DATA_READY.backtest = true;
    LAZY_DATA_READY.signalAudit = true;
    LAZY_DATA_READY.aiMemory = true;
    LAZY_DATA_READY.trainingBaselines = true;
    LAZY_DATA_READY.trainingSummary = true;

    // Pre-populate ENRICHED_EVENT_CACHE din enriched.json (generat de fetch_enriched.py)
    var enrichedDict = enrichedFile.data || enrichedFile || {};
    var enrichedCount = 0;
    if(enrichedDict && typeof enrichedDict === 'object'){
      Object.keys(enrichedDict).forEach(function(eid){
        if(!ENRICHED_EVENT_CACHE[eid]){
          ENRICHED_EVENT_CACHE[eid] = enrichedDict[eid];
          enrichedCount++;
        }
      });
    }

    rerunPredictionPipeline(window.__RAW_PREDICTIONS || []).then(function(){
      BILETE = null;

      var storedToken = localStorage.getItem('bsd_token');
      if(storedToken) API_TOKEN = storedToken;
      else if(meta && meta.api_token) API_TOKEN = meta.api_token;

      renderAll();
      if(shouldShowLoader) hideLoader();

      var statusTime = getStatusDisplayTime();
      var statusMetrics = getStatusDisplayMetrics();
      var enrichLabel = enrichedCount > 0 ? (' • 🔬 ML5 ' + enrichedCount + ' meciuri') : '';
          });
  }).catch(function(err){
    if(shouldShowLoader) hideLoader();
    toast('Eroare la incarcarea datelor', 'err');
    console.error(err);
  });
}

// ============================================================
// LIVE TAB RENDERING
// ============================================================

// ============================================================
// RENDER DASHBOARD
// ============================================================

function renderTodayBest(){
  var container = $('today-best-grid');
  var badge = $('todaybest-count');
  if(!container) return;

  var now = new Date();
  var todayKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');

  function supportsLikelyScore(m, type){
    var ls = parseLikelyScore(m.mostLikelyScore);
    if(!ls) return true;
    if(type === 'over15') return ls.total >= 2;
    if(type === 'over25') return ls.total >= 3;
    if(type === 'btts') return ls.btts;
    if(type === 'homeWin') return ls.home > ls.away;
    if(type === 'draw') return ls.home === ls.away;
    if(type === 'awayWin') return ls.away > ls.home;
    return true;
  }

  function safeTopFilter(m, profile){
    if(!passesSelectionFilter(m) || !m.bestBet || m.dateKey !== todayKey) return false;

    var b = m.bestBet;
    var t = b.type;
    var odds = Number(b.odds || 0);
    var value = Number(b.value || 0);
    var adjProb = Number(b.adjProb || 0);
    var conf = Number(m.confidence || 0);
    var xgHome = Number(m.xgHome || 0);
    var xgAway = Number(m.xgAway || 0);
    var xgTotal = Number(m.xgTotal || 0);

    if(value < profile.minValue) return false;
    if(adjProb < profile.minAdjProb) return false;
    if(conf < profile.minConf) return false;
    if(odds < profile.minOdds || odds > profile.maxOdds) return false;
    if(!supportsLikelyScore(m, t)) return false;
    if(t === 'over35') return false;

    if(t === 'over15'){
      return m.probOver15 >= profile.minProbOver15 && xgTotal >= profile.minXgOver15;
    }

    if(t === 'over25'){
      return m.probOver25 >= profile.minProbOver25 && xgTotal >= profile.minXgOver25;
    }

    if(t === 'btts'){
      return m.probBtts >= profile.minProbBtts && xgHome >= profile.minXgBtts && xgAway >= profile.minXgBtts && conf >= profile.minConfBtts && odds <= profile.maxOddsBtts;
    }

    if(t === 'homeWin'){
      return m.predictedResult === 'H' && m.favorite === 'H' && (xgHome - xgAway) >= profile.minWinXgGap && m.probDraw <= profile.maxDrawProb;
    }

    if(t === 'awayWin'){
      return m.predictedResult === 'A' && m.favorite === 'A' && (xgAway - xgHome) >= profile.minWinXgGap && m.probDraw <= profile.maxDrawProb;
    }

    return false;
  }

  function rankTodaySafe(m){
    var b = m.bestBet;
    var typeBoost = b.type === 'under35' ? 6 : b.type === 'homeWin' || b.type === 'awayWin' ? 4 : b.type === 'over25' ? 2 : b.type === 'btts' ? 1 : 0;
    return (
      (b.adjProb * 0.55) +
      (m.confidence * 0.30) +
      ((Math.max(0, b.value) * 100) * 0.10) +
      (m.mlFlags && (m.mlFlags.winner || m.mlFlags.fav || m.mlFlags.o15 || m.mlFlags.o25 || m.mlFlags.btts) ? 4 : 0) +
      typeBoost
    );
  }

  var profiles = [
    {
      minValue: 0.01,
      minAdjProb: 74,
      minConf: 58,
      minOdds: 1.18,
      maxOdds: 1.72,
      minProbOver15: 80,
      minXgOver15: 2.30,
      minProbOver25: 64,
      minXgOver25: 2.80,
      minProbBtts: 62,
      minXgBtts: 0.95,
      minConfBtts: 60,
      maxOddsBtts: 1.78,
      minWinXgGap: 0.35,
      maxDrawProb: 27
    },
    {
      minValue: 0.008,
      minAdjProb: 72,
      minConf: 56,
      minOdds: 1.16,
      maxOdds: 1.78,
      minProbOver15: 78,
      minXgOver15: 2.20,
      minProbOver25: 62,
      minXgOver25: 2.70,
      minProbBtts: 60,
      minXgBtts: 0.92,
      minConfBtts: 58,
      maxOddsBtts: 1.75,
      minWinXgGap: 0.30,
      maxDrawProb: 28
    },
    {
      minValue: 0.005,
      minAdjProb: 70,
      minConf: 54,
      minOdds: 1.15,
      maxOdds: 1.82,
      minProbOver15: 76,
      minXgOver15: 2.10,
      minProbOver25: 60,
      minXgOver25: 2.60,
      minProbBtts: 59,
      minXgBtts: 0.90,
      minConfBtts: 58,
      maxOddsBtts: 1.72,
      minWinXgGap: 0.28,
      maxDrawProb: 29
    }
  ];

  var list = [];
  for(var pi = 0; pi < profiles.length; pi++){
    list = ALL_MATCHES.filter(function(m){
      return safeTopFilter(m, profiles[pi]);
    }).sort(function(a,b){
      return rankTodaySafe(b) - rankTodaySafe(a);
    }).slice(0,2);
    if(list.length) break;
  }

  if(badge) badge.textContent = list.length+' meciuri';
  if(list.length === 0){
    container.innerHTML = '<div class="empty-state">Nu am găsit 1-2 opțiuni suficient de sigure pentru ziua curentă.</div>';
    return;
  }

  container.innerHTML = list.map(function(m, i){
    var b = m.bestBet;
    var hLogo = logoImgHtml(teamLogoUrl(m.homeApiId), m.home, 18);
    var aLogo = logoImgHtml(teamLogoUrl(m.awayApiId), m.away, 18);
    var valStr = b.value >= 0 ? '+'+fmtPct(b.value*100) : fmtPct(b.value*100);
    var scoreStr = m.mostLikelyScore ? '<span class="score-badge" style="margin-left:6px;font-size:10px">⚽ '+m.mostLikelyScore+'</span>' : '';
    return '<div class="top-pick-card" style="border-color:rgba(34,197,94,0.35)">'+
      '<div class="tp-rank">#'+(i+1)+'</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div class="tp-badge tp-badge-safe">🟢 AZI</div>'+sourceChipHtmlForBet(b)+'</div>'+
      '<div class="tp-teams" style="display:flex;align-items:center;gap:6px">'+hLogo+' '+m.home+' vs '+m.away+' '+aLogo+'</div>'+
      '<div style="text-align:center;margin:6px 0">'+scoreStr+'</div>'+
      '<div class="tp-league">'+m.league+' • '+m.timeLabel+'</div>'+
      '<div class="tp-metrics">'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--grn)">'+valStr+'</div><div class="tp-metric-lbl">Value</div></div>'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--acc)">'+Number(m.confidence||0).toFixed(0)+'%</div><div class="tp-metric-lbl">AI Conf.</div></div>'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--yel)">'+b.odds.toFixed(2)+'</div><div class="tp-metric-lbl">Odds</div></div>'+
      '</div>'+
      '<div class="tp-rec">🎯 '+b.label+' @ '+b.odds.toFixed(2)+' | Șansă: '+fmtPct(b.adjProb)+'</div>'+
    '</div>';
  }).join('');
}

function renderTopPicks(){
  var container = $('top-picks-grid');
  var top = ALL_MATCHES.filter(passesSelectionFilter)
    .sort(function(a,b){
      var scoreA = (a.smartScore * 0.6) + (a.confidence * 0.4);
      var scoreB = (b.smartScore * 0.6) + (b.confidence * 0.4);
      return scoreB - scoreA;
    }).slice(0,5);
  updateSectionCount('top5', top.length);
  if(top.length === 0){
    container.innerHTML = '<div class="empty-state">Niciun pariu recomandat momentan.</div>';
    return;
  }
  container.innerHTML = top.map(function(m, i){
    var b = m.bestBet;
    var badgeClass = b.verdict === 'safe' ? 'tp-badge-safe' : 'tp-badge-mod';
    var badgeText = b.verdict === 'safe' ? '🟢 SAFE' : '🟡 MODERATE';
    var valStr = b.value >= 0 ? '+'+fmtPct(b.value*100) : fmtPct(b.value*100);
    var hXg = getXGClass(m.xgHome);
    var aXg = getXGClass(m.xgAway);
    var tXg = m.xgHome + m.xgAway;
    var hScore = ((m.smartScore * 0.6) + (m.confidence * 0.4)).toFixed(1);
    var hLogo = logoImgHtml(teamLogoUrl(m.homeApiId), m.home, 18);
    var aLogo = logoImgHtml(teamLogoUrl(m.awayApiId), m.away, 18);
    var scoreStr = m.mostLikelyScore ? '<span class="score-badge" style="margin-left:6px;font-size:10px">⚽ '+m.mostLikelyScore+'</span>' : '';

    return '<div class="top-pick-card">'+
      '<div class="tp-rank">#'+(i+1)+'</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div class="tp-badge '+badgeClass+'">'+badgeText+'</div>'+sourceChipHtmlForBet(b)+'</div>'+
      '<div class="tp-teams" style="display:flex;align-items:center;gap:6px">'+hLogo+' '+m.home+' vs '+m.away+' '+aLogo+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-bottom:4px;display:flex;justify-content:center;gap:10px">'+
        '<span style="color:'+hXg.color+'">H: '+m.xgHome.toFixed(2)+'</span>'+
        '<span>Σ '+tXg.toFixed(2)+'</span>'+
        '<span style="color:'+aXg.color+'">A: '+m.xgAway.toFixed(2)+'</span>'+
      '</div>'+
      (m.mostLikelyScore ? '<div style="text-align:center;margin-bottom:6px">'+scoreStr+'</div>' : '')+
      '<div class="tp-league">'+m.league+' • '+m.dateLabel+' '+m.timeLabel+'</div>'+
      '<div class="tp-metrics">'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--grn)">'+valStr+'</div><div class="tp-metric-lbl">Value</div></div>'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--acc)">'+Number(m.confidence||0).toFixed(0)+'%</div><div class="tp-metric-lbl">AI Conf.</div></div>'+
        '<div class="tp-metric"><div class="tp-metric-val" style="color:var(--pur)">'+hScore+'</div><div class="tp-metric-lbl">H-Score</div></div>'+
      '</div>'+
      '<div class="tp-rec" style="background:linear-gradient(90deg,rgba(59,130,246,0.1),rgba(168,85,247,0.1));border:1px solid rgba(168,85,247,0.2)">🎯 '+b.label+' @ '+b.odds.toFixed(2)+' | Șansă: '+fmtPct(b.adjProb)+'</div>'+
    '</div>';
  }).join('');
}

function buildMatchReasons(m){
  var reasons = [];
  if(m.analysisState && m.analysisState !== 'ELIGIBLE') reasons.push(getAnalysisStateMeta(m.analysisState).label.replace(/[✅⚠️🧠⛔🛰️ ]/g,''));
  if(m.bestBet && m.bestBet.edgePct != null) reasons.push('No-vig ' + (m.bestBet.edgePct >= 0 ? '+' : '') + m.bestBet.edgePct.toFixed(1) + 'pp');
  if(m.bestBet && m.bestBet.poissonAlert && m.bestBet.poissonDelta != null) reasons.push('Poisson ' + (m.bestBet.poissonDelta >= 0 ? '+' : '') + m.bestBet.poissonDelta.toFixed(1) + 'pp');
  if(m.bestBet && m.bestBet.value >= 0.03) reasons.push('EV+ ' + fmtPct(m.bestBet.value * 100));
  if(m.bestBet) reasons.push('sursă ' + sourceLabelFromBet(m.bestBet));

  if(m.confidence >= 60) reasons.push('AI confidence ' + Number(m.confidence||0).toFixed(0) + '%');
  if(m.xgTotal >= 2.6) reasons.push('xG total ' + m.xgTotal.toFixed(2));
  if(m.probOver25 >= 60) reasons.push('O2.5 ' + m.probOver25.toFixed(1) + '%');
  if(m.probUnder25 >= 56) reasons.push('U2.5 ' + m.probUnder25.toFixed(1) + '%');
  if(m.probUnder35 >= 68) reasons.push('U3.5 ' + m.probUnder35.toFixed(1) + '%');
  if(m.probBtts >= 58) reasons.push('BTTS ' + m.probBtts.toFixed(1) + '%');
  if(m.probBttsNo >= 58) reasons.push('NG ' + m.probBttsNo.toFixed(1) + '%');
  if(m.favoriteRecommend && m.favoriteProp) reasons.push('favorit ML ' + m.favoriteProp.toFixed(1) + '%');
  if(m.doubleChancePick) reasons.push(m.doubleChancePick.label + ' ' + m.doubleChancePick.prob.toFixed(1) + '%');
  if(m.mostLikelyScore) reasons.push('scor probabil ' + m.mostLikelyScore);
  return uniqueReasons(reasons).slice(0, 5);
}

function buildRecommendationReasons(m, b){
  if(!m || !b) return [];
  var reasons = [];
  var t = b.type;
  reasons.push('Șansă estimată ' + b.adjProb.toFixed(1) + '%');
  if(b.poissonAlert && b.poissonDelta != null){
    reasons.push('Poisson ' + (b.poissonDelta >= 0 ? '+' : '') + b.poissonDelta.toFixed(1) + 'pp vs API');
  }
  if(t === 'over15' || t === 'over25' || t === 'under25' || t === 'under35'){
    reasons.push('xG total ' + m.xgTotal.toFixed(2));
  } else if(t === 'btts'){
    reasons.push('xG H/A ' + m.xgHome.toFixed(2) + ' / ' + m.xgAway.toFixed(2));
  } else if(t === 'homeWin'){
    reasons.push('xG gap +' + Math.max(0, m.xgHome - m.xgAway).toFixed(2));
  } else if(t === 'awayWin'){
    reasons.push('xG gap +' + Math.max(0, m.xgAway - m.xgHome).toFixed(2));
  } else if(t === 'draw'){
    reasons.push('echilibru xG ' + Math.abs(m.xgHome - m.xgAway).toFixed(2));
  }
  if(m.mostLikelyScore) reasons.push('Scor probabil ' + m.mostLikelyScore);
  if(m.leagueTierLabel) reasons.push('Ligă ' + m.leagueTierLabel);
  reasons.push('sursă ' + sourceLabelFromBet(b));

  return uniqueReasons(reasons).slice(0, 5);
}
function poissonBadgeHtmlForBet(b){
  if(!b || !b.poissonAlert || b.poissonDelta == null) return '';
  var positive = Number(b.poissonDelta || 0) >= 0;
  return '<span class="card-reco-badge" style="color:'+(positive ? 'var(--grn)' : 'var(--red)')+';border-color:'+(positive ? 'rgba(34,197,94,.24)' : 'rgba(239,68,68,.24)')+'">Poisson '+(positive ? '+' : '')+Number(b.poissonDelta || 0).toFixed(1)+'pp</span>';
}
function renderHybridProbabilityBlock(meta){
  if(!meta) return '';
  var apiProb = Number(meta.apiProb);
  var poissonProb = Number(meta.poissonProb);
  var hybridProb = Number(meta.hybridProb);
  var delta = Number(meta.delta);
  if(!isFinite(apiProb) || !isFinite(poissonProb) || !isFinite(hybridProb) || !isFinite(delta)) return '';
  var deltaClass = Math.abs(delta) > 5 ? (delta > 0 ? 'delta-positive' : 'delta-negative') : 'delta-neutral';
  return '<div class="hybrid-prob-block">'+
    '<div class="hybrid-prob-head">'+
      '<div class="hybrid-prob-title">' + (meta.v2Used ? 'CatBoost v2 + Poisson + API' : 'Poisson vs API') + '</div>'+
      '<div class="hybrid-prob-live">' + (meta.v2Used ? '⚡ SmartBet v2 activ' : 'Hybrid model active') + '</div>'+
    '</div>'+
    '<div class="hybrid-prob-grid">'+
      '<div class="hybrid-prob-item"><div class="hybrid-prob-value">'+apiProb.toFixed(1)+'%</div><div class="hybrid-prob-label">API</div></div>'+
      '<div class="hybrid-prob-item"><div class="hybrid-prob-value">'+poissonProb.toFixed(1)+'%</div><div class="hybrid-prob-label">Poisson</div></div>'+
      '<div class="hybrid-prob-item"><div class="hybrid-prob-value">'+hybridProb.toFixed(1)+'%</div><div class="hybrid-prob-label">Hybrid</div></div>'+
      '<div class="hybrid-prob-item '+deltaClass+'"><div class="hybrid-prob-value">'+(delta >= 0 ? '+' : '')+delta.toFixed(1)+'pp</div><div class="hybrid-prob-label">Δ API vs P</div></div>'+
    '</div>'+
  '</div>';
}
function renderHybridProbabilityInline(meta){
  if(!meta) return '';
  var apiProb = Number(meta.apiProb);
  var poissonProb = Number(meta.poissonProb);
  var hybridProb = Number(meta.hybridProb);
  var delta = Number(meta.delta);
  if(!isFinite(apiProb) || !isFinite(poissonProb) || !isFinite(hybridProb) || !isFinite(delta)) return '';
  var deltaClass = Math.abs(delta) > 5 ? (delta > 0 ? 'delta-pos' : 'delta-neg') : 'delta-neutral';
  return '<div class="hybrid-prob-inline">API <strong>'+apiProb.toFixed(1)+'%</strong> • Poisson <strong>'+poissonProb.toFixed(1)+'%</strong> • Hybrid <strong>'+hybridProb.toFixed(1)+'%</strong> • Δ <span class="'+deltaClass+'">'+(delta >= 0 ? '+' : '')+delta.toFixed(1)+'pp</span></div>';
}

function renderSignalAudit(){
  var summary = $('audit-summary-grid');
  var list = $('signal-audit-table');
  var updated = $('audit-updated');
  if(!summary || !list) return;

  var audit = SIGNAL_AUDIT || {};
  var rows = Array.isArray(audit.rows) ? audit.rows.slice() : [];
  // V17 FIX: sortare dupa Kelly ajustat (stake sizing), nu Kelly brut.
  // Pariurile in sweet spot (odds 1.45-1.85, edge>=10, Poisson hybrid) urca automat in top.
  rows.sort(function(a,b){ return computeAdjustedKelly(b) - computeAdjustedKelly(a); });

  if(updated) updated.textContent = audit.updated_at ? ('Audit actualizat: ' + fmtDateTime(audit.updated_at)) : 'Audit: —';

  var health = (APP_META && APP_META.data_health) || {};
  var eligible = ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE'; });
  var apiCount = eligible.filter(function(m){ return m.bestBet && sourceTypeFromBet(m.bestBet) === 'api'; }).length;
  var heurCount = eligible.filter(function(m){ return m.bestBet && sourceTypeFromBet(m.bestBet) === 'heuristic'; }).length;
  var mixedCount = eligible.filter(function(m){ return m.bestBet && sourceTypeFromBet(m.bestBet) === 'mixed'; }).length;

  var cards = [
    {label:'Semnale auditate', value: rows.length, sub:'total selecții incluse în audit', color:'var(--acc)'},
    {label:'Kelly 1/4 mediu', value: fmtPct(Number(audit.avg_kelly_quarter_pct || 0)), sub:'miza recomandată la nivel Kelly 1/4', color:'var(--grn)'},
    {label:'Edge mediu', value: fmtSignedPct(Number(audit.avg_edge_pct || 0)), sub:'diferență medie model vs piață', color:'var(--yel)'},
    {label:'Value mediu', value: fmtSignedPct(Number(audit.avg_value_pct || 0)), sub:'valoare așteptată medie', color:'var(--pur)'},
    {label:'Heuristic / Mix', value: heurCount + (mixedCount ? ' +' + mixedCount + ' mix' : ''), sub:'selecții afișate din surse heuristic și mix', color:'var(--yel)'},
    {label:'Predicții stale scoase', value: Number(health.stale_predictions_removed || 0), sub:'eliminate pe criteriul de vechime', color:'var(--red)'}
  ];

  summary.innerHTML = cards.map(function(c){
    return '<div class="audit-card">'+
      '<div class="audit-card-label">'+c.label+'</div>'+
      '<div class="audit-card-value" style="color:'+c.color+'">'+c.value+'</div>'+
      '<div class="audit-card-sub">'+c.sub+'</div>'+
    '</div>';
  }).join('');

  if(!rows.length){
    list.innerHTML = '<div class="empty-state">signal_audit.json e gol sau nu a fost generat încă la ultimul fetch.</div>';
    renderAuditGenerators();
    renderAuditVisuals();
    return;
  }

  list.innerHTML = rows.map(function(r, idx){
    var reasonHtml = (r.reason_tags || []).map(function(tag){ return '<span class="audit-reason">'+tag+'</span>'; }).join('');
    var evDate = r.event_date ? (fmtDate(r.event_date) + ' • ' + fmtTime(r.event_date)) : '—';
    var age = r.age_hours != null ? ageBucketLabel(r.age_hours) : (r.created_at ? ageBucketLabel(hoursSince(r.created_at)) : '—');
    var valuePct = Number(r.value || 0) * 100;
    var fairOdds = r.fair_odds != null ? Number(r.fair_odds).toFixed(2) : '—';
    var hybridBlock = renderHybridProbabilityBlock({ apiProb:r.api_prob, poissonProb:r.poisson_prob, hybridProb:r.model_prob, delta:r.poisson_delta });
    return '<div class="audit-row">'+
      '<div class="audit-row-header">'+
        '<div class="audit-row-main">'+
          '<div class="audit-row-titleline">'+
            '<span class="audit-row-rank">#'+(idx+1)+'</span>'+
            '<div class="audit-row-teams">'+renderEventIdentity({ home:r.home, away:r.away, league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, home_api_id:r.home_api_id, away_api_id:r.away_api_id, league_api_id:r.league_api_id }, { logoSize:16, leagueSize:12, showLeague:false })+'</div>'+
          '</div>'+
          '<div class="audit-row-meta">'+renderLeagueBadge({ league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, league_api_id:r.league_api_id }, 12)+' • '+evDate+' • model '+((r.v2_signal || r.v2_recommended) ? '<span style="color:#10b981;font-weight:800">⚡V2</span>' : (r.model_version || '—'))+'</div>'+
        '</div>'+
        '<div class="audit-pick-box">'+
          '<div class="audit-pick-label">Pronostic</div>'+
          '<div class="audit-pick-value">'+(r.market || '—')+' @ '+Number(r.book_odds || 0).toFixed(2)+'</div>'+
          (r.odds_upgraded && r.best_odds_bookmaker ? '<div style="font-size:10px;color:var(--grn);margin-top:3px;font-weight:700">📈 Best @ '+r.best_odds_bookmaker+(r.odds_consensus && Number(r.odds_consensus) > 1.01 ? ' <span style=\"color:var(--muted);font-weight:400\">(cons. '+Number(r.odds_consensus).toFixed(2)+')</span>' : '')+'</div>' : '')+
        '</div>'+
      '</div>'+
      '<div class="audit-row-tags">'+sourceChipHtmlForAuditRow(r)+(r.poisson_alert && r.poisson_delta != null ? ('<span class="audit-badge" style="color:'+(Number(r.poisson_delta) >= 0 ? 'var(--grn)' : 'var(--red)')+'">Poisson '+(Number(r.poisson_delta) >= 0 ? '+' : '')+Number(r.poisson_delta).toFixed(1)+'pp</span>') : '')+(r.xgd_diff != null ? '<span class="audit-badge" style="color:'+(Number(r.xgd_diff) >= 0.2 ? 'var(--grn)' : Number(r.xgd_diff) <= -0.2 ? 'var(--red)' : 'var(--muted)')+'">xGd '+(Number(r.xgd_diff) >= 0 ? '+' : '')+Number(r.xgd_diff).toFixed(2)+'</span>' : '')+(r.xgd_diff != null ? '<span class="audit-badge" style="color:'+(Number(r.xgd_diff)>=0.2?'var(--grn)':Number(r.xgd_diff)<=-0.2?'var(--red)':'var(--muted)')+'">'+(Number(r.xgd_diff)>=0?'+':'')+Number(r.xgd_diff).toFixed(2)+'</span>' : '')+(r.ref_name && r.ref_avg_goals != null ? '<span class="audit-badge" style="color:'+(r.ref_is_high_goals ? 'var(--red)' : r.ref_avg_goals <= 2.2 ? 'var(--grn)' : 'var(--muted)')+'">'+'👨‍⚖️ '+r.ref_name.split(' ').pop()+' ⚽ '+Number(r.ref_avg_goals).toFixed(1)+(r.ref_avg_yellow != null ? ' 🟨 '+Number(r.ref_avg_yellow).toFixed(1) : '')+'</span>' : '')+'<span class="audit-badge">Kelly adj '+fmtPct(computeAdjustedKelly(r))+'</span><span class="audit-badge" style="color:var(--muted)">brut '+fmtPct(Number(r.kelly_quarter_pct || 0))+'</span><span class="audit-badge">Age '+age+'</span></div>'+
      hybridBlock+
      '<div class="audit-stat-grid">'+
        '<div class="audit-stat"><div class="audit-stat-label">Prob. ajustată</div><div class="audit-stat-value">'+fmtPct(Number(r.adjusted_prob || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Edge</div><div class="audit-stat-value">'+fmtSignedPct(Number(r.edge_pct || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Value</div><div class="audit-stat-value">'+fmtSignedPct(valuePct)+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Fair odds</div><div class="audit-stat-value">'+fairOdds+'</div></div>'+
      '</div>'+
      ((reasonHtml || fairOdds !== '—') ? '<div class="audit-row-foot">'+reasonHtml+'</div>' : '')+
    '</div>';
  }).join('');  renderAuditGenerators();
  renderAuditVisuals();
}


function getAuditProfile(type){
  if(type === 'safe') return { label:'🛡️ Audit Kelly Safe', minPicks:2, maxPicks:3, minKelly:4.2, minProb:71, minEdge:6.0, minOdd:1.18, maxOdd:1.55, targetMinOdds:1.70, targetMaxOdds:3.20, maxSameMarket:1 };
  if(type === 'balanced') return { label:'⚖️ Audit Kelly Echilibrat', minPicks:3, maxPicks:4, minKelly:3.0, minProb:66, minEdge:4.0, minOdd:1.18, maxOdd:1.68, targetMinOdds:2.40, targetMaxOdds:5.80, maxSameMarket:2 };
  return { label:'🚀 Audit Kelly Mega risc', minPicks:5, maxPicks:7, minKelly:1.6, minProb:60, minEdge:2.5, minOdd:1.18, maxOdd:1.78, targetMinOdds:6.00, targetMaxOdds:18.00, maxSameMarket:3 };
}

function getAuditRowEventKey(row){
  if(row && row.event_id != null) return 'e' + row.event_id;
  return [row.home || '—', row.away || '—', row.event_date || '—'].join('|');
}

function getAuditRowMarketKey(row){
  return row.market_key || row.market || 'misc';
}

function getAuditPool(){
  return (SIGNAL_AUDIT && SIGNAL_AUDIT.rows || []).filter(function(r){
    return r && (r.event_id != null || (r.home && r.away)) && Number(r.book_odds || 0) >= 1.10 && Number(r.adjusted_prob || 0) > 0;
  });
}

function rankAuditCandidate(row, type){
  // V17 FIX: folosim Kelly ajustat de stake sizing, nu cel brut.
  // Asta imping automat in sus pariurile cu edge solid + odds in sweet spot si in jos trap-urile.
  var kelly = computeAdjustedKelly(row);
  var prob = Number(row.adjusted_prob || 0);
  var edge = Number(row.edge_pct || 0);
  var odds = Number(row.book_odds || 0);
  var value = Number(row.value || 0) * 100;
  if(type === 'safe') return kelly * 1.35 + prob * 0.34 + edge * 1.15 + value * 0.22 - Math.max(0, odds - 1.45) * 18;
  if(type === 'balanced') return kelly * 1.25 + prob * 0.22 + edge * 1.05 + value * 0.30 + Math.min(odds, 1.65) * 5;
  return kelly * 1.10 + prob * 0.12 + edge * 0.95 + value * 0.28 + odds * 8;
}





function renderAIMemory(){
  var memory = AI_MEMORY || {};
  var updated = $('ai-memory-updated');
  var summary = $('ai-memory-summary-grid');
  var markets = $('ai-memory-market-grid');
  var good = $('ai-memory-patterns-good');
  var bad = $('ai-memory-patterns-bad');
  var picks = $('ai-memory-picks');
  if(!summary || !markets || !good || !bad || !picks) return;

  var data = memory.summary || {};
  if(updated) updated.textContent = memory.updated_at ? ('Memorie actualizată: ' + fmtDateTime(memory.updated_at)) : 'Memorie: —';

  var cards = [
    {label:'Exemple închise', value: Number(data.settled_bets || 0), sub:'baza validată pentru memorie', color:'var(--acc)'},
    {label:'Win rate memorie', value: fmtPct(Number(data.settled_winrate || 0)), sub:'rata de câștig a setului analizat', color:'var(--grn)'},
    {label:'ROI memorie', value: fmtSignedPct(Number(data.settled_roi || 0)), sub:'rentabilitate pe istoricul validat', color:'var(--yel)'},
    {label:'Selecții rescotate', value: Number(data.pending_scored || 0), sub:'selecții curente evaluate adaptiv', color:'var(--pur)'},
    {label:'Tipare pozitive', value: Number(data.positive_patterns || 0), sub:'patternuri cu impact favorabil', color:'var(--grn)'},
    {label:'Tipare de evitat', value: Number(data.negative_patterns || 0), sub:'patternuri cu impact negativ', color:'var(--red)'}
  ];
  summary.innerHTML = cards.map(function(c){
    return '<div class="audit-card">'+
      '<div class="audit-card-label">'+c.label+'</div>'+
      '<div class="audit-card-value" style="color:'+c.color+'">'+c.value+'</div>'+
      '<div class="audit-card-sub">'+c.sub+'</div>'+
    '</div>';
  }).join('');

  var marketRows = Array.isArray(memory.by_market) ? memory.by_market.slice(0, 8) : [];
  markets.innerHTML = marketRows.length ? marketRows.map(function(r){
    var roi = Number(r.roi || 0);
    var mem = Number(r.memory_score || 0);
    return '<div class="audit-card">'+
      '<div class="audit-card-label">'+(r.label || r.key || '—')+'</div>'+
      '<div class="audit-card-value" style="color:'+(mem >= 0 ? 'var(--grn)' : 'var(--red)')+'">'+(mem >= 0 ? '+' : '')+mem.toFixed(1)+'</div>'+
      '<div class="audit-card-sub">ROI '+(roi >= 0 ? '+' : '')+roi.toFixed(1)+'% • '+Number(r.raw_bets || 0)+' exemple • win '+fmtPct(Number(r.winrate || 0))+'</div>'+
    '</div>';
  }).join('') : '<div class="empty-state">Memoria încă nu are suficiente exemple închise pentru piețe. Se umple după ce se adună mai mult istoric.</div>';

  function renderPatternList(rows, positive){
    if(!rows || !rows.length) return '<div class="empty-state">Încă nu există suficiente pattern-uri validate aici.</div>';
    return rows.slice(0, 6).map(function(r){
      var mem = Number(r.memory_score || 0);
      var roi = Number(r.roi || 0);
      return '<div class="memory-pattern-item">'+
        '<div class="memory-pattern-top">'+
          '<div>'+
            '<div class="memory-pattern-title">'+(r.label || r.key || '—')+'</div>'+
            '<div class="memory-pattern-meta">'+Number(r.raw_bets || 0)+' exemple • ROI '+(roi >= 0 ? '+' : '')+roi.toFixed(1)+'% • win '+fmtPct(Number(r.winrate || 0))+'</div>'+
          '</div>'+
          '<div class="memory-pattern-score '+(positive ? 'positive' : 'negative')+'">'+(mem >= 0 ? '+' : '')+mem.toFixed(1)+'</div>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  good.innerHTML = renderPatternList(memory.top_patterns || [], true);
  bad.innerHTML = renderPatternList(memory.avoid_patterns || [], false);

  renderAiMemoryVisuals();

  var pickRows = Array.isArray(memory.adaptive_picks) ? memory.adaptive_picks : [];
  if(!pickRows.length){
    picks.innerHTML = '<div class="empty-state">Încă nu există selecții curente care să poată fi rescotate de AI Memory.</div>';
    return;
  }

  picks.innerHTML = pickRows.map(function(r, idx){
    var bonus = Number(r.memory_bonus || 0);
    var hybridBlock = renderHybridProbabilityBlock({ apiProb:r.api_prob, poissonProb:r.poisson_prob, hybridProb:r.model_prob, delta:r.poisson_delta });
    var reasonsHtml = (r.reasons || []).map(function(reason){
      return '<span class="audit-reason">'+reason.label+' • '+(Number(reason.impact || 0) >= 0 ? '+' : '')+Number(reason.impact || 0).toFixed(1)+' • ROI '+(Number(reason.roi || 0) >= 0 ? '+' : '')+Number(reason.roi || 0).toFixed(1)+'%</span>';
    }).join('');
    return '<div class="audit-row">'+
      '<div class="audit-row-header">'+
        '<div class="audit-row-main">'+
          '<div class="audit-row-titleline">'+
            '<span class="audit-row-rank">#'+(idx+1)+'</span>'+
            '<div class="audit-row-teams">'+renderEventIdentity({ home:r.home, away:r.away, league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, home_api_id:r.home_api_id, away_api_id:r.away_api_id, league_api_id:r.league_api_id }, { logoSize:16, leagueSize:12, showLeague:false })+'</div>'+
          '</div>'+
          '<div class="audit-row-meta">'+renderLeagueBadge({ league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, league_api_id:r.league_api_id }, 12)+' • '+(r.event_date ? (fmtDate(r.event_date)+' • '+fmtTime(r.event_date)) : '—')+' • '+(r.source || '—')+'</div>'+
        '</div>'+
        '<div class="audit-pick-box">'+
          '<div class="audit-pick-label">Pronostic</div>'+
          '<div class="audit-pick-value">'+(r.market || '—')+' @ '+Number(r.odds || 0).toFixed(2)+'</div>'+
          (r.odds_upgraded && r.best_odds_bookmaker ? '<div style="font-size:10px;color:var(--grn);margin-top:3px;font-weight:700">📈 Best @ '+r.best_odds_bookmaker+'</div>' : '')+
        '</div>'+
      '</div>'+
      '<div class="audit-row-tags"><span class="audit-badge" style="color:'+(bonus >= 0 ? 'var(--grn)' : 'var(--red)')+'">Mem '+(bonus >= 0 ? '+' : '')+bonus.toFixed(1)+'</span>'+(r.poisson_alert && r.poisson_delta != null ? ('<span class="audit-badge" style="color:'+(Number(r.poisson_delta) >= 0 ? 'var(--grn)' : 'var(--red)')+'">Poisson '+(Number(r.poisson_delta) >= 0 ? '+' : '')+Number(r.poisson_delta).toFixed(1)+'pp</span>') : '')+'<span class="audit-badge">Sursă '+(r.source || '—')+'</span></div>'+
      hybridBlock+
      '<div class="audit-stat-grid">'+
        '<div class="audit-stat"><div class="audit-stat-label">Prob. ajustată</div><div class="audit-stat-value">'+fmtPct(Number(r.adjusted_prob || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Edge</div><div class="audit-stat-value">'+fmtSignedPct(Number(r.edge_pct || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Scor bază</div><div class="audit-stat-value">'+Number(r.base_score || 0).toFixed(1)+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Scor adaptiv</div><div class="audit-stat-value">'+Number(r.adaptive_score || 0).toFixed(1)+'</div></div>'+
      '</div>'+
      '<div class="audit-row-foot"><span class="audit-reason">Value '+fmtSignedPct(Number(r.value || 0) * 100)+'</span>'+(reasonsHtml || '')+'</div>'+
    '</div>';
  }).join('');
}

function getAiMemoryProfile(type){
  if(type === 'safe') return { label:'🛡️ AI Memory Safe', minPicks:2, maxPicks:3, minBonus:1.0, minAdaptive:78, minProb:72, minOdd:1.18, maxOdd:1.55, targetMinOdds:1.70, targetMaxOdds:3.10, maxSameMarket:1 };
  if(type === 'balanced') return { label:'⚖️ AI Memory Echilibrat', minPicks:3, maxPicks:4, minBonus:0.0, minAdaptive:72, minProb:66, minOdd:1.18, maxOdd:1.65, targetMinOdds:2.40, targetMaxOdds:5.50, maxSameMarket:2 };
  return { label:'🚀 AI Memory Mega risc', minPicks:5, maxPicks:7, minBonus:-1.5, minAdaptive:68, minProb:60, minOdd:1.20, maxOdd:1.68, targetMinOdds:6.00, targetMaxOdds:18.00, maxSameMarket:3 };
}

function getAiMemoryPool(){
  return (AI_MEMORY && AI_MEMORY.adaptive_picks || []).filter(function(r){
    return r && r.event_id && Number(r.odds || 0) >= 1.10 && Number(r.adjusted_prob || 0) > 0;
  });
}

function rankAiMemoryCandidate(row, type){
  var adaptive = Number(row.adaptive_score || 0);
  var bonus = Number(row.memory_bonus || 0);
  var prob = Number(row.adjusted_prob || 0);
  var odds = Number(row.odds || 0);
  var value = Number(row.value || 0) * 100;
  if(type === 'safe') return adaptive * 0.45 + prob * 0.35 + bonus * 1.10 + value * 0.20 - Math.max(0, odds - 1.42) * 18;
  if(type === 'balanced') return adaptive * 0.55 + prob * 0.20 + bonus * 0.90 + value * 0.25 + Math.min(odds, 1.62) * 5;
  return adaptive * 0.55 + bonus * 0.80 + value * 0.20 + odds * 8;
}




function renderMlApiCenter(){
  var box = $('ml-api-summary');
  if(!box) return;
  var total = ALL_MATCHES.length || 0;
  var with1x2 = ALL_MATCHES.filter(function(m){ return m.probHome || m.probDraw || m.probAway; }).length;
  var withXg = ALL_MATCHES.filter(function(m){ return m.xgHome || m.xgAway; }).length;
  var withO25 = ALL_MATCHES.filter(function(m){ return m.probOver25; }).length;
  var withMeta = ALL_MATCHES.filter(function(m){ return m.modelVersion || m.createdAt; }).length;
  var versions = {};
  ALL_MATCHES.forEach(function(m){ if(m.modelVersion) versions[m.modelVersion] = (versions[m.modelVersion]||0)+1; });
  var versionLabel = Object.keys(versions).sort(function(a,b){ return versions[b]-versions[a]; })[0] || '—';
  var avgConf = total ? (ALL_MATCHES.reduce(function(acc,m){ return acc + (m.confidence||0); },0) / total) : 0;
  var newest = ALL_MATCHES.slice().sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); })[0];
  var updatedEl = $('ml-api-updated');
  if(updatedEl) updatedEl.textContent = newest && newest.createdAt ? fmtDateTime(newest.createdAt) : '—';
  var rows = [
    {label:'1X2 expus', value: total ? Math.round(with1x2*100/total)+'%' : '—', pct: total ? (with1x2*100/total) : 0, color:'var(--acc)'},
    {label:'xG disponibil', value: total ? Math.round(withXg*100/total)+'%' : '—', pct: total ? (withXg*100/total) : 0, color:'var(--cyan)'},
    {label:'Eligibile', value: ALL_MATCHES.filter(function(m){ return m.analysisState === "ELIGIBLE"; }).length, pct: total ? (ALL_MATCHES.filter(function(m){ return m.analysisState === "ELIGIBLE"; }).length*100/total) : 0, color:'var(--grn)'},
    {label:'Over 2.5 folosit', value: total ? Math.round(withO25*100/total)+'%' : '—', pct: total ? (withO25*100/total) : 0, color:'var(--yel)'},
    {label:'Metadata model', value: total ? Math.round(withMeta*100/total)+'%' : '—', pct: total ? (withMeta*100/total) : 0, color:'var(--pur)'},
    {label:'Model dominant', value: versionLabel, pct: 60, color:'var(--acc)'},
    {label:'Confidence mediu', value: avgConf ? avgConf.toFixed(1)+'%' : '—', pct: avgConf || 0, color:'var(--grn)'}
  ];
  box.innerHTML = '<div style="display:grid;grid-template-columns:1fr;gap:6px">'+rows.map(function(r){
    return '<div style="padding:8px 10px;border:1px solid var(--brd2);border-radius:10px;background:linear-gradient(180deg,rgba(20,30,55,.9),rgba(14,22,40,.9))">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;font-size:11px;margin-bottom:6px"><span style="color:var(--muted)">'+r.label+'</span><strong style="font-family:var(--mono);color:'+r.color+'">'+r.value+'</strong></div>'+
      '<div style="height:4px;background:rgba(255,255,255,.05);border-radius:999px;overflow:hidden"><div style="height:100%;width:'+Math.max(6, r.pct || 0)+'%;background:'+r.color+';border-radius:999px"></div></div>'+
    '</div>';
  }).join('')+'</div>';
}


function renderBacktest(){
  var box = $('backtest-summary');
  var updated = $('backtest-updated');
  if(!box) return;
  box.style.display = 'block';
  box.style.gridTemplateColumns = 'none';
  box.style.gap = '0';
  var bt = BACKTEST_SUMMARY || {};
  var MIN_MARKET_BETS = 10;
  var MIN_LEAGUE_BETS = 10;
  var overall = bt.overall || {};
  var health = (typeof APP_META !== 'undefined' && APP_META && APP_META.data_health) || {};

  var supportedHistoryMarkets = (BET_TYPES || []).map(function(b){ return b.label; });
  var historyCutoff = new Date(Date.now() - (21 * 86400000));
  var historyRows = (RECOMMENDATION_LOG || []).filter(function(r){
    if(!r || supportedHistoryMarkets.indexOf(r.market) === -1) return false;
    var loggedAt = new Date(r.logged_at || r.prediction_created_at || 0);
    if(!isFinite(loggedAt.getTime())) return false;
    return loggedAt >= historyCutoff;
  });

  function summarizeRealRows(rows, groupFn){
    var groups = {};
    (rows || []).forEach(function(r){
      var key = groupFn(r) || '—';
      if(!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.keys(groups).map(function(key){
      var list = groups[key];
      var settled = list.filter(function(r){ return r.status === 'win' || r.status === 'lose'; });
      var bets = settled.length;
      var wins = settled.filter(function(r){ return r.status === 'win' || r.won === true; }).length;
      var profit = settled.reduce(function(acc, r){
        var o = Number(r.odds || 0);
        var isWin = r.status === 'win' || r.won === true;
        return acc + (isWin ? (o > 1 ? (o - 1) : 0) : -1);
      }, 0);
      return {
        key: key,
        total: list.length,
        pending: list.length - bets,
        bets: bets,
        wins: wins,
        losses: bets - wins,
        roi: bets ? (profit * 100 / bets) : 0,
        winrate: bets ? (wins * 100 / bets) : 0,
        avgOdds: bets ? settled.reduce(function(acc, r){ return acc + Number(r.odds || 0); }, 0) / bets : 0,
        profit: profit
      };
    });
  }

  if(historyRows.length){
    var settledRows = historyRows.filter(function(r){ return r.status === 'win' || r.status === 'lose'; });
    var pendingRows = historyRows.filter(function(r){ return r.status !== 'win' && r.status !== 'lose'; });
    var engineBetsReal = settledRows.length;
    var engineWinsReal = settledRows.filter(function(r){ return r.status === 'win' || r.won === true; }).length;
    var engineProfitReal = settledRows.reduce(function(acc, r){
      var o = Number(r.odds || 0);
      var isWin = r.status === 'win' || r.won === true;
      return acc + (isWin ? (o > 1 ? (o - 1) : 0) : -1);
    }, 0);
    var engineRoiReal = engineBetsReal ? (engineProfitReal * 100 / engineBetsReal) : 0;
    var engineWinrateReal = engineBetsReal ? (engineWinsReal * 100 / engineBetsReal) : 0;
    var totalLoggedReal = historyRows.length;
    var sampleLabelReal = totalLoggedReal >= 120 ? 'Solid' : totalLoggedReal >= 60 ? 'Mediu' : 'Mic';

    var marketSummaryReal = summarizeRealRows(historyRows, function(r){ return r.market; });
    var leagueSummaryReal = summarizeRealRows(historyRows, function(r){ return r.league; });
    var sourceSummaryReal = summarizeRealRows(historyRows, function(r){
      if(r.source_api && r.source_heuristic) return 'ML + Heuristic';
      if(r.source_api) return 'ML/API';
      if(r.source_heuristic) return 'Heuristic';
      return 'Fără etichetă';
    });

    marketSummaryReal.sort(function(a,b){
      if((b.bets || 0) !== (a.bets || 0)) return (b.bets || 0) - (a.bets || 0);
      if((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
      return (b.roi || 0) - (a.roi || 0);
    });
    leagueSummaryReal.sort(function(a,b){
      if((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
      if((b.bets || 0) !== (a.bets || 0)) return (b.bets || 0) - (a.bets || 0);
      return (b.roi || 0) - (a.roi || 0);
    });
    sourceSummaryReal.sort(function(a,b){ return (b.total || 0) - (a.total || 0); });

    var bestMarketReal = marketSummaryReal[0] || null;
    var bestLeagueReal = leagueSummaryReal[0] || null;
    var bestSourceReal = sourceSummaryReal[0] || null;
    var latestHistoryUpdate = historyRows.slice().sort(function(a,b){ return new Date(b.logged_at || b.prediction_created_at || 0) - new Date(a.logged_at || a.prediction_created_at || 0); })[0];

    if(updated) updated.textContent = latestHistoryUpdate ? ('Jurnal real actualizat: ' + fmtDateTime(latestHistoryUpdate.logged_at || latestHistoryUpdate.prediction_created_at)) : 'Jurnal real: —';
    box.innerHTML = '';

    function makeMeta(detailParts){
      return detailParts.filter(Boolean).join(' • ');
    }

    function buildCard(card){
      var valueText = String(card.value == null ? '—' : card.value);
      var valueSize = valueText.length > 22 ? '12px' : valueText.length > 16 ? '13px' : valueText.length > 12 ? '15px' : '18px';
      return '<div style="min-height:96px;padding:9px;border:1px solid var(--brd2);border-radius:14px;background:linear-gradient(180deg,rgba(20,30,55,.94),rgba(14,22,40,.94));display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 24px rgba(0,0,0,.18)">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">'+
          '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">'+card.label+'</div>'+
          '<div style="width:42px;height:4px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;flex-shrink:0"><div style="height:100%;width:'+Math.max(8, Math.min(100, Number(card.pct || 0)))+'%;background:'+card.color+';border-radius:999px"></div></div>'+
        '</div>'+
        '<div style="font-size:'+valueSize+';font-weight:800;line-height:1.15;color:'+card.color+';'+(card.mono ? 'font-family:var(--mono);' : '')+'word-break:break-word">'+valueText+'</div>'+
        '<div style="margin-top:6px;font-size:10px;line-height:1.35;color:var(--txt)">'+(card.detail || '—')+'</div>'+
        '<div style="margin-top:6px;font-size:9px;line-height:1.35;color:var(--muted)">'+(card.legend || '')+'</div>'+
      '</div>';
    }

    var cardsReal = [
      {
        label:'Motor',
        value: totalLoggedReal,
        detail: makeMeta([engineWinsReal + '/' + engineBetsReal + ' win închise', 'sample ' + sampleLabelReal]),
        legend: makeMeta(['pending ' + pendingRows.length, engineBetsReal ? ('cotă medie ' + (settledRows.reduce(function(acc,r){ return acc + Number(r.odds || 0); }, 0) / engineBetsReal).toFixed(2)) : null]),
        pct: Math.min(100, (totalLoggedReal / 180) * 100),
        color:'var(--acc)',
        mono:true
      },
      {
        label:'ROI motor',
        value: engineBetsReal ? fmtSignedPct(engineRoiReal) : '—',
        detail: makeMeta(['profit ' + engineProfitReal.toFixed(2) + 'u', engineWinsReal + '/' + engineBetsReal + ' win']),
        legend: 'calculat doar din recomandările reale închise',
        pct: engineBetsReal ? Math.min(100, Math.abs(engineRoiReal) * 10) : 0,
        color: engineRoiReal >= 0 ? 'var(--grn)' : 'var(--red)',
        mono:true
      },
      {
        label:'Win rate',
        value: engineBetsReal ? fmtPct(engineWinrateReal) : '—',
        detail: makeMeta([engineWinsReal + ' câștigate', (engineBetsReal - engineWinsReal) + ' pierdute']),
        legend: 'doar meciurile închise din jurnalul real',
        pct: engineBetsReal ? engineWinrateReal : 0,
        color:'var(--grn)',
        mono:true
      },
      {
        label:'Perioadă analizată',
        value: '21 zile',
        detail: makeMeta([totalLoggedReal + ' logate', latestHistoryUpdate ? ('update ' + fmtDateTime(latestHistoryUpdate.logged_at || latestHistoryUpdate.prediction_created_at)) : null]),
        legend: 'pending ' + pendingRows.length + ' • istoric real, nu backtest',
        pct: Math.min(100, totalLoggedReal / 4),
        color:'var(--yel)'
      },
      {
        label:'Top piață',
        value: bestMarketReal ? bestMarketReal.key : '—',
        detail: bestMarketReal ? makeMeta([(bestMarketReal.bets ? ('ROI ' + fmtSignedPct(bestMarketReal.roi)) : 'fără închideri încă'), bestMarketReal.total + ' logate']) : 'Fără piață logată încă',
        legend: bestMarketReal ? makeMeta(['închise ' + bestMarketReal.bets, bestMarketReal.bets ? ('cotă medie ' + bestMarketReal.avgOdds.toFixed(2)) : 'doar pending']) : 'așteaptă primul batch real',
        pct: bestMarketReal ? Math.max(bestMarketReal.winrate || 0, Math.min(100, bestMarketReal.total * 4)) : 0,
        color:'var(--pur)'
      },
      {
        label:'Top ligă',
        value: bestLeagueReal ? bestLeagueReal.key : '—',
        detail: bestLeagueReal ? makeMeta([bestLeagueReal.total + ' logate', bestLeagueReal.bets ? ('ROI ' + fmtSignedPct(bestLeagueReal.roi)) : 'fără închideri încă']) : 'Fără ligă logată încă',
        legend: bestLeagueReal ? (bestLeagueReal.bets ? ('închise ' + bestLeagueReal.bets + ' • win rate ' + fmtPct(bestLeagueReal.winrate)) : 'doar pending până acum') : 'se umple automat din jurnal',
        pct: bestLeagueReal ? Math.max(bestLeagueReal.winrate || 0, Math.min(100, bestLeagueReal.total * 5)) : 0,
        color:'var(--cyan)'
      },
      {
        label:'Top sursă',
        value: bestSourceReal ? bestSourceReal.key : '—',
        detail: bestSourceReal ? makeMeta([bestSourceReal.total + ' logate', bestSourceReal.bets ? (bestSourceReal.wins + '/' + bestSourceReal.bets + ' win') : 'fără închideri încă']) : 'Nicio sursă logată încă',
        legend: bestSourceReal ? 'distribuția vine din jurnalul real salvat la emitere' : 'așteaptă primul batch real',
        pct: bestSourceReal ? Math.min(100, bestSourceReal.total * 5) : 0,
        color:'var(--acc)'
      },
      {
        label:'Health date',
        value: health.events_without_odds != null ? health.events_without_odds : '—',
        detail: (health.events_without_odds || 0) === 0 ? 'toate evenimentele au cote și dată' : makeMeta([(health.events_without_odds || 0) + ' evenimente fără cote/date', 'cu cât mai mic, cu atât mai bine']),
        legend: 'nu intră în top dacă lipsesc datele critice',
        pct: health.events_without_odds != null ? Math.max(8, 100 - Math.min(100, Number(health.events_without_odds) * 1.35)) : 0,
        color:'var(--muted)',
        mono:true
      },
      {
        label:'Vârstă predicții',
        value: health.max_prediction_age_hours != null ? ageBucketLabel(health.max_prediction_age_hours) : '—',
        detail: makeMeta([health.avg_prediction_age_hours != null ? ('medie ' + ageBucketLabel(health.avg_prediction_age_hours)) : null, health.stale_predictions_removed ? (health.stale_predictions_removed + ' stale scoase') : 'fără stale detectat']),
        legend: health.prediction_age_cap_hours ? ('cap activ ' + ageBucketLabel(health.prediction_age_cap_hours)) : 'fără cap de vârstă',
        pct: health.max_prediction_age_hours != null && health.prediction_age_cap_hours ? Math.max(8, 100 - Math.min(100, (Number(health.max_prediction_age_hours) / Number(health.prediction_age_cap_hours || 1)) * 100)) : 0,
        color:'var(--org)',
        mono:true
      }
    ];

    box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+cardsReal.map(buildCard).join('')+'</div>'+
      '<div style="margin-top:8px;font-size:9px;line-height:1.35;color:var(--muted);opacity:.92">'+
        '<strong style="color:var(--txt)">Legendă:</strong> panoul rapid folosește acum jurnalul real din ultimele 21 de zile; win/ROI se calculează doar din recomandările închise, iar pending rămâne separat.'+
      '</div>';
    return;
  }

  if(updated) updated.textContent = bt.updated_at ? ('Backtest actualizat: ' + fmtDateTime(bt.updated_at)) : 'Backtest: —';
  if(!bt.engine_bets){
    box.innerHTML = '<div class="empty-state" style="padding:10px">Nu există suficiente date istorice procesate încă.</div>';
    return;
  }

  var qualifiedMarkets = (bt.by_market || []).filter(function(x){
    return (x.bets || 0) >= MIN_MARKET_BETS && ['BTTS No','NG'].indexOf(String(x.key || x.label || '').trim()) === -1;
  }).sort(rankBacktestRows);
  var qualifiedLeagues = (bt.by_league || []).filter(function(x){ return (x.bets || 0) >= MIN_LEAGUE_BETS; }).sort(rankBacktestRows);

  var visibleStrategyKeys = {
    best_single: true,
    conservative: true,
    smart_ev: true,
    simple: true,
    over15: true,
    mix_combo: true,
    big_win: true,
    custom_combo: true,
    custom_single: true
  };
  var qualifiedStrategies = (bt.by_strategy || []).filter(function(x){
    return (x.bets || 0) >= 3 && !!visibleStrategyKeys[String(x.key || '').trim()];
  }).sort(rankBacktestRows);

  var bestMarket = qualifiedMarkets.length ? qualifiedMarkets[0] : null;
  var bestLeague = qualifiedLeagues.length ? qualifiedLeagues[0] : null;
  var bestStrategy = qualifiedStrategies.length ? qualifiedStrategies[0] : null;

  var engineWins = bt.engine_wins != null ? bt.engine_wins : (overall.wins || 0);
  var engineBets = bt.engine_bets || 0;
  var engineWinrate = bt.engine_winrate != null ? bt.engine_winrate : (overall.winrate || 0);
  var lookbackDays = bt.lookback_days || 0;
  var finishedPredictions = bt.finished_predictions || 0;
  var sampleLabel = engineBets >= 120 ? 'Solid' : engineBets >= 60 ? 'Mediu' : 'Mic';

  function makeMeta(detailParts){
    return detailParts.filter(Boolean).join(' • ');
  }

  function buildCard(card){
    var valueText = String(card.value == null ? '—' : card.value);
    var valueSize = valueText.length > 22 ? '12px' : valueText.length > 16 ? '13px' : valueText.length > 12 ? '15px' : '18px';
    return '<div style="min-height:96px;padding:9px;border:1px solid var(--brd2);border-radius:14px;background:linear-gradient(180deg,rgba(20,30,55,.94),rgba(14,22,40,.94));display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 8px 24px rgba(0,0,0,.18)">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">'+
        '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">'+card.label+'</div>'+
        '<div style="width:42px;height:4px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;flex-shrink:0"><div style="height:100%;width:'+Math.max(8, Math.min(100, Number(card.pct || 0)))+'%;background:'+card.color+';border-radius:999px"></div></div>'+
      '</div>'+
      '<div style="font-size:'+valueSize+';font-weight:800;line-height:1.15;color:'+card.color+';'+(card.mono ? 'font-family:var(--mono);' : '')+'word-break:break-word">'+valueText+'</div>'+
      '<div style="margin-top:6px;font-size:10px;line-height:1.35;color:var(--txt)">'+(card.detail || '—')+'</div>'+
      '<div style="margin-top:6px;font-size:9px;line-height:1.35;color:var(--muted)">'+(card.legend || '')+'</div>'+
    '</div>';
  }

  var cards = [
    {
      label:'Motor',
      value: engineBets,
      detail: makeMeta([engineWins + '/' + engineBets + ' win', 'sample ' + sampleLabel]),
      legend: makeMeta(['cotă medie ' + Number(bt.engine_avg_odds || overall.avg_odds || 0).toFixed(2), 'edge mediu ' + fmtSignedPct(Number(bt.engine_avg_edge || overall.avg_edge || 0))]),
      pct: Math.min(100, (engineBets / 180) * 100),
      color:'var(--acc)',
      mono:true
    },
    {
      label:'ROI motor',
      value: fmtSignedPct(Number(bt.engine_roi || 0)),
      detail: makeMeta(['profit ' + Number(bt.engine_profit || overall.profit || 0).toFixed(2) + 'u', engineWins + '/' + engineBets + ' win']),
      legend: 'backtest agregat pe motorul actual',
      pct: Math.min(100, Math.abs(Number(bt.engine_roi || 0)) * 10),
      color: Number(bt.engine_roi || 0) >= 0 ? 'var(--grn)' : 'var(--red)',
      mono:true
    },
    {
      label:'Win rate',
      value: fmtPct(Number(engineWinrate || 0)),
      detail: makeMeta([engineWins + ' câștigate', (engineBets - engineWins) + ' pierdute']),
      legend: 'raport win din pariurile recomandate și închise',
      pct: Number(engineWinrate || 0),
      color:'var(--grn)',
      mono:true
    },
    {
      label:'Perioadă analizată',
      value: lookbackDays ? ('' + lookbackDays + ' zile') : '—',
      detail: makeMeta([finishedPredictions + ' predicții închise', bt.updated_at ? ('update ' + fmtDateTime(bt.updated_at)) : null]),
      legend: 'toate valorile de mai sus folosesc aceeași fereastră',
      pct: Math.min(100, finishedPredictions / 4),
      color:'var(--yel)'
    },
    {
      label:'Top piață',
      value: bestMarket ? (bestMarket.label || bestMarket.key) : '—',
      detail: bestMarket ? makeMeta(['ROI ' + fmtSignedPct(Number(bestMarket.roi || 0)), 'backtest ' + (bestMarket.wins || 0) + '/' + (bestMarket.bets || 0) + ' win']) : 'Fără piață cu sample suficient',
      legend: bestMarket ? makeMeta(['win rate ' + fmtPct(Number(bestMarket.winrate || 0)), 'cotă medie ' + Number(bestMarket.avg_odds || 0).toFixed(2)]) : 'minim 10 recomandări',
      pct: bestMarket ? Number(bestMarket.winrate || 0) : 0,
      color:'var(--pur)'
    },
    {
      label:'Top ligă',
      value: bestLeague ? (bestLeague.label || bestLeague.key) : '—',
      detail: bestLeague ? makeMeta(['ROI ' + fmtSignedPct(Number(bestLeague.roi || 0)), 'backtest ' + (bestLeague.wins || 0) + '/' + (bestLeague.bets || 0) + ' win']) : 'Fără ligă cu sample suficient',
      legend: bestLeague ? ('minim ' + MIN_LEAGUE_BETS + ' recomandări în backtest') : 'minim 10 recomandări',
      pct: bestLeague ? Number(bestLeague.winrate || 0) : 0,
      color:'var(--cyan)'
    },
    {
      label:'Top strategie bilet',
      value: bestStrategy ? (bestStrategy.label || bestStrategy.key) : '—',
      detail: bestStrategy ? makeMeta(['ROI ' + fmtSignedPct(Number(bestStrategy.roi || 0)), 'backtest ' + (bestStrategy.wins || 0) + '/' + (bestStrategy.bets || 0) + ' win']) : 'Nicio strategie din secțiunea Bilete nu are sample suficient',
      legend: bestStrategy ? 'nu reprezintă biletele generate acum; sunt rezultate istorice din backtest' : 'exclud strategiile ascunse sau scoase din UI',
      pct: bestStrategy ? Number(bestStrategy.winrate || 0) : 0,
      color:'var(--acc)'
    },
    {
      label:'Health date',
      value: health.events_without_odds != null ? health.events_without_odds : '—',
      detail: (health.events_without_odds || 0) === 0 ? 'toate evenimentele au cote și dată' : makeMeta([(health.events_without_odds || 0) + ' evenimente fără cote/date', 'cu cât mai mic, cu atât mai bine']),
      legend: 'nu intră în top dacă lipsesc datele critice',
      pct: health.events_without_odds != null ? Math.max(8, 100 - Math.min(100, Number(health.events_without_odds) * 1.35)) : 0,
      color:'var(--muted)',
      mono:true
    },
    {
      label:'Vârstă predicții',
      value: health.max_prediction_age_hours != null ? ageBucketLabel(health.max_prediction_age_hours) : '—',
      detail: makeMeta([health.avg_prediction_age_hours != null ? ('medie ' + ageBucketLabel(health.avg_prediction_age_hours)) : null, health.stale_predictions_removed ? (health.stale_predictions_removed + ' stale scoase') : 'fără stale detectat']),
      legend: health.prediction_age_cap_hours ? ('cap activ ' + ageBucketLabel(health.prediction_age_cap_hours)) : 'fără cap de vârstă',
      pct: health.max_prediction_age_hours != null && health.prediction_age_cap_hours ? Math.max(8, 100 - Math.min(100, (Number(health.max_prediction_age_hours) / Number(health.prediction_age_cap_hours || 1)) * 100)) : 0,
      color:'var(--org)',
      mono:true
    }
  ];

  box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+cards.map(buildCard).join('')+'</div>'+
    '<div style="margin-top:8px;font-size:9px;line-height:1.35;color:var(--muted);opacity:.92">'+
      '<strong style="color:var(--txt)">Legendă:</strong> win/recomandate = câștigate din total recomandate în backtest; valorile nu sunt numărul de bilete generate acum în tabul Bilete/Tracking.'+
    '</div>';
} 

function buildMlRecommendTags(m){
  var tags = '';
  if(m.mlFlags.o15) tags += '<span class="rec-tag rec-tag-o15">O1.5</span>';
  if(m.mlFlags.btts) tags += '<span class="rec-tag rec-tag-btts">BTTS</span>';
  if(m.mlFlags.u35) tags += '<span class="rec-tag rec-tag-o35">U3.5</span>';
  if(m.mlFlags.fav) tags += '<span class="rec-tag rec-tag-fav">FAV</span>';
  return tags ? '<div class="rec-tags">'+tags+'</div>' : '';
}

function renderML(){
  var container = $('ml-grid');
  if(!container) return;
  var sortMode = $('ml-sort') ? $('ml-sort').value : 'prob';
  var ml = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return m.hasMlRec && matchTime > (now - 900000);
  });

  ml = ml.filter(function(m){
    return m.mlPicks.filter(function(p){ return p.label !== 'Over 1.5G'; }).length > 0;
  });

  ml.sort(function(a,b){
    var aTop = a.mlPicks.filter(function(p){ return p.label !== 'Over 1.5G'; })[0];
    var bTop = b.mlPicks.filter(function(p){ return p.label !== 'Over 1.5G'; })[0];
    if(sortMode === 'date') return new Date(a.date) - new Date(b.date);
    return (bTop ? bTop.prob : 0) - (aTop ? aTop.prob : 0);
  });

  updateSectionCount('ml', ml.length);
  if(ml.length === 0){ container.innerHTML = '<div class="empty-state">Nicio recomandare ML momentan.</div>'; return; }

  container.innerHTML = ml.map(function(m){
    var filteredPicks = m.mlPicks.filter(function(p){ return p.label !== 'Over 1.5G'; });
    if(filteredPicks.length === 0) return '';
    var topPick = filteredPicks[0];
    var hLogo = logoImgHtml(teamLogoUrl(m.homeApiId), m.home, 16);
    var aLogo = logoImgHtml(teamLogoUrl(m.awayApiId), m.away, 16);
    var scoreStr = m.mostLikelyScore ? ' <span class="score-badge" style="font-size:9px">⚽'+m.mostLikelyScore+'</span>' : '';

    return '<div class="ml-card">'+
      '<div class="ml-hdr">'+
        '<div class="ml-teams" style="display:flex;align-items:center;gap:5px">'+hLogo+m.home+' vs '+m.away+aLogo+'</div>'+
        '<div class="ml-conf">'+topPick.prob.toFixed(1)+'%</div>'+
      '</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'+
        '<span>'+m.league+' • '+m.dateLabel+'</span><span>'+m.timeLabel+'</span>'+scoreStr+
      '</div>'+
      buildMlRecommendTags(m)+
      '<div class="ml-picks" style="margin-top:6px">'+
        '<span class="ml-pick" style="background:rgba(59,130,246,0.15);color:var(--acc);font-size:11px;padding:4px 10px">🎯 '+topPick.label+'</span>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'+
        '<div style="font-size:9px;color:var(--muted)">AI: <b>'+Number(m.confidence||0).toFixed(0)+'%</b></div>'+
        '<div style="font-size:9px;color:var(--acc);font-weight:700">Prob: '+topPick.prob.toFixed(1)+'%</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderMLDC(){
  var container = $('ml-dc-grid');
  var list = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return m.doubleChancePick && matchTime > (now - 900000);
  }).sort(function(a,b){ return (b.doubleChancePick.prob||0) - (a.doubleChancePick.prob||0); });
  updateSectionCount('mldc', list.length);
  if(list.length === 0){ container.innerHTML = '<div class="empty-state">Nicio recomandare 1X/X2 momentan.</div>'; return; }
  container.innerHTML = list.map(function(m){
    var dc = m.doubleChancePick;
    var sideName = dc.side === 'home' ? m.home : m.away;
    return '<div class="ml-card" style="background:rgba(245,158,11,0.06);border-color:rgba(245,158,11,0.22)">'+
      '<div class="ml-hdr">'+
        '<div class="ml-teams">'+m.home+' vs '+m.away+'</div>'+
        '<div class="ml-conf" style="color:var(--yel)">'+dc.prob.toFixed(1)+'%</div>'+
      '</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'+
        '<span>'+m.league+' • '+m.dateLabel+'</span>'+
        '<span>'+(m.modelVersion||'CatBoost')+' • '+dc.strength+'</span>'+
      '</div>'+
      '<div class="ml-picks"><span class="ml-pick" style="background:rgba(245,158,11,0.15);color:var(--yel);font-size:11px;padding:4px 10px">🛡️ '+dc.label+'</span></div>'+
      '<div class="rec-tags" style="margin-top:8px">'+
        '<span class="rec-tag rec-tag-win">1: '+m.probHome.toFixed(1)+'%</span>'+
        '<span class="rec-tag rec-tag-btts">X: '+m.probDraw.toFixed(1)+'%</span>'+
        '<span class="rec-tag rec-tag-fav">2: '+m.probAway.toFixed(1)+'%</span>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);gap:8px;flex-wrap:wrap">'+
        '<div style="font-size:9px;color:var(--muted)">Susținut de <b>'+sideName+'</b> + egal</div>'+
        '<div style="font-size:9px;color:var(--muted)">Fair odds: <b>'+(dc.fairOdds ? dc.fairOdds.toFixed(2) : '—')+'</b></div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderML15(){
  var container = $('ml-15-grid');
  if(!container) return;
  var sortMode = $('ml15-sort') ? $('ml15-sort').value : 'prob';
  var ml15 = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return m.hasMlRec && m.mlPicks.some(function(p){ return p.label === 'Over 1.5G'; }) && matchTime > (now - 900000);
  });

  ml15.sort(function(a,b){
    var ao = a.mlPicks.find(function(p){ return p.label === 'Over 1.5G'; });
    var bo = b.mlPicks.find(function(p){ return p.label === 'Over 1.5G'; });
    if(sortMode === 'date') return new Date(a.date) - new Date(b.date);
    return (bo ? bo.prob : 0) - (ao ? ao.prob : 0);
  });

  updateSectionCount('ml15', ml15.length);
  if(ml15.length === 0){ container.innerHTML = '<div class="empty-state">Nicio recomandare +1.5G momentan.</div>'; return; }
  container.innerHTML = ml15.map(function(m){
    var tXg = m.xgHome + m.xgAway;
    var o15 = m.mlPicks.find(function(p){ return p.label === 'Over 1.5G'; });
    return '<div class="ml-card" style="background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.2)">'+
      '<div class="ml-hdr">'+
        '<div class="ml-teams">'+m.home+' vs '+m.away+'</div>'+
        '<div class="ml-conf" style="color:var(--grn)">'+o15.prob.toFixed(1)+'%</div>'+
      '</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">'+
        '<span>'+m.league+' • '+m.dateLabel+'</span>'+
        '<span style="font-weight:700;color:var(--cyan)">Σ xG: '+tXg.toFixed(2)+'</span>'+
      '</div>'+
      '<div class="ml-picks"><span class="ml-pick" style="background:rgba(34,197,94,0.15);color:var(--grn);font-size:11px;padding:4px 10px">🔥 Over 1.5G</span></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'+
        '<div style="font-size:9px;color:var(--muted)">Data: <b>'+m.timeLabel+'</b></div>'+
        '<div style="font-size:9px;color:var(--grn);font-weight:700">AI: '+Number(m.confidence||0).toFixed(0)+'%</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderML25(){
  var container = $('ml-25-grid');
  var ml25 = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return (m.mlFlags.o25 || (m.probOver25 && m.probOver25 > 56)) && matchTime > (now - 900000);
  }).sort(function(a,b){ return (b.probOver25||0) - (a.probOver25||0); });
  updateSectionCount('ml25', ml25.length);
  if(ml25.length === 0){ container.innerHTML = '<div class="empty-state">Nicio recomandare +2.5G momentan.</div>'; return; }
  container.innerHTML = ml25.map(function(m){
    var prob25 = m.probOver25 || 0;
    var odds25 = m.oddsOver25 || 0;
    var reasons = buildMatchReasons(m).map(function(r){ return '<span class="rec-tag rec-tag-o25">'+r+'</span>'; }).join('');
    return '<div class="ml-card" style="background:rgba(16,185,129,0.06);border-color:rgba(16,185,129,0.2)">'+
      '<div class="ml-hdr">'+
        '<div class="ml-teams">'+m.home+' vs '+m.away+'</div>'+
        '<div class="ml-conf" style="color:var(--val)">'+Number(m.confidence||0).toFixed(0)+'%</div>'+
      '</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'+
        '<span>'+m.league+' • '+m.dateLabel+' • '+(m.modelVersion||'CatBoost')+'</span>' +
        '<span style="font-weight:700;color:var(--val)">Σ xG: '+m.xgTotal.toFixed(2)+'</span>'+
      '</div>'+
      '<div class="ml-picks"><span class="ml-pick" style="background:rgba(16,185,129,0.15);color:var(--val);font-size:11px;padding:4px 10px">🎯 Over 2.5G</span></div>'+
      (reasons ? '<div class="rec-tags" style="margin-top:7px">'+reasons+'</div>' : '')+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);gap:8px;flex-wrap:wrap">'+
        '<div style="font-size:9px;color:var(--muted)">Prob: <b>'+prob25.toFixed(1)+'%</b>'+(odds25?' | Cotă: <b>'+odds25.toFixed(2)+'</b>':'')+'</div>'+
        '<div style="font-size:9px;color:var(--muted)">Gen: '+fmtDateTime(m.createdAt)+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

// Under 3.5G ML
function renderML35(){
  var container = $('ml-35-grid');
  if(!container) return;
  var sortMode = $('ml35-sort') ? $('ml35-sort').value : 'prob';
  var list = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return (m.mlFlags.u35 || (m.probUnder35 && m.probUnder35 >= 68)) && matchTime > (now - 900000);
  });
  list.sort(function(a,b){
    if(sortMode === 'date') return new Date(a.date) - new Date(b.date);
    return (b.probUnder35||0) - (a.probUnder35||0);
  });
  updateSectionCount('ml35', list.length);
  if(list.length === 0){ container.innerHTML = '<div class="empty-state">Nicio recomandare Under 3.5G momentan.</div>'; return; }
  container.innerHTML = list.map(function(m){
    var prob35 = m.probUnder35 || 0;
    var odds35 = m.oddsUnder35 || 0;
    var reasons = buildMatchReasons(m).map(function(r){ return '<span class="rec-tag rec-tag-o35">'+r+'</span>'; }).join('');
    return '<div class="ml-card" style="background:rgba(6,182,212,0.06);border-color:rgba(6,182,212,0.2)">'+
      '<div class="ml-hdr">'+
        '<div class="ml-teams">'+m.home+' vs '+m.away+'</div>'+
        '<div class="ml-conf" style="color:var(--cyan)">'+prob35.toFixed(1)+'%</div>'+
      '</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'+
        '<span>'+m.league+' • '+m.dateLabel+' • '+(m.modelVersion||'CatBoost')+'</span>' +
        '<span style="font-weight:700;color:var(--cyan)">Σ xG: '+m.xgTotal.toFixed(2)+'</span>'+
      '</div>'+
      '<div class="ml-picks"><span class="ml-pick" style="background:rgba(6,182,212,0.15);color:var(--cyan);font-size:11px;padding:4px 10px">🧊 Under 3.5G</span></div>'+
      (reasons ? '<div class="rec-tags" style="margin-top:7px">'+reasons+'</div>' : '')+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);gap:8px;flex-wrap:wrap">'+
        '<div style="font-size:9px;color:var(--muted)">Prob: <b>'+prob35.toFixed(1)+'%</b>'+(odds35?' | Cotă: <b>'+odds35.toFixed(2)+'</b>':'')+'</div>'+
        '<div style="font-size:9px;color:var(--muted)">Gen: '+fmtDateTime(m.createdAt)+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderTopSafe(){
  var container = $('topsafe-grid');
  var topSafe = ALL_MATCHES.filter(function(m){
    var matchTime = new Date(m.date).getTime();
    var now = new Date().getTime();
    return m.hasMlRec && matchTime > (now - 900000);
  }).sort(function(a,b){ return b.confidence - a.confidence; }).slice(0,3);
  updateSectionCount('topsafe', topSafe.length);
  if(topSafe.length === 0){ container.innerHTML = '<div class="empty-state">Nicio selectie ML sigura.</div>'; return; }
  container.innerHTML = topSafe.map(function(m, i){
    var topPick = m.mlPicks[0];
    if(!topPick) return '';
    var tXg = m.xgHome + m.xgAway;
    var confColor = m.confidence >= 60 ? 'var(--grn)' : (m.confidence >= 50 ? 'var(--yel)' : 'var(--acc)');
    var scoreStr = m.mostLikelyScore ? '<span class="score-badge" style="font-size:9px">⚽ '+m.mostLikelyScore+'</span>' : '';
    return '<div class="ml-card" style="background:rgba(34,197,94,0.08);border:2px solid rgba(34,197,94,0.3)">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
        '<span style="font-size:12px;font-weight:900;color:rgba(34,197,94,0.75)">#'+(i+1)+'</span>'+
        '<span style="color:'+confColor+';font-size:13px;font-weight:800">'+Number(m.confidence||0).toFixed(0)+'%</span>'+
      '</div>'+
      '<div class="ml-teams" style="font-weight:700;color:var(--txt);margin-bottom:8px">'+m.home+' vs '+m.away+'</div>'+
      '<div style="font-size:9px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'+
        '<span>'+m.league+' • '+m.dateLabel+'</span>'+
        '<span style="font-weight:700;color:var(--cyan)">Σ xG: '+tXg.toFixed(2)+'</span>'+
      '</div>'+
      (m.mostLikelyScore ? '<div style="margin-bottom:6px">'+scoreStr+'</div>' : '')+
      buildMlRecommendTags(m)+
      '<div class="ml-picks" style="margin-top:6px"><span class="ml-pick" style="background:rgba(34,197,94,0.15);color:var(--grn);font-size:11px;padding:4px 10px;font-weight:700">✓ '+topPick.label+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'+
        '<div style="font-size:9px;color:var(--muted)">Prob: <b>'+topPick.prob.toFixed(1)+'%</b></div>'+
        '<div style="font-size:9px;color:var(--grn);font-weight:700">ML top safe</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

// ============================================================
// RENDER MATCHES
// ============================================================
function setFilter(f, btn){
  clearMatchFocus();
  CURRENT_FILTER = f;
  document.querySelectorAll('.filter-btn,.mf-chip,.mx20-chip,.mx21-chip,.ba-market-chip').forEach(function(b){ b.classList.remove('active'); });
  if(btn && btn.classList) btn.classList.add('active');
  // Profilul "OK Pariere" trebuie sa arate cele mai curate intrari primele, nu doar cronologic.
  if(f === 'bet_ok' && $('sort-select')) $('sort-select').value = 'score';
  renderMatches();
}


function activateMatchFilterButton(filterKey){
  document.querySelectorAll('.filter-btn,.mf-chip,.mx20-chip,.mx21-chip,.ba-market-chip').forEach(function(b){ b.classList.remove('active'); });
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.filter-btn,.mf-chip,.mx20-chip,.mx21-chip,.ba-market-chip')); 
  var target = buttons.find(function(btn){
    return String(btn.getAttribute('onclick') || '').indexOf("setFilter('" + filterKey + "'") !== -1;
  });
  if(target) target.classList.add('active');
}

function openDashboardStream(type){
  clearMatchFocus();
  CURRENT_FILTER = type === 'with_odds' ? 'dashboard_with_odds' : ((type === 'all_predictions' || type === 'pro_active') ? 'all' : (type === 'value_active' ? 'value' : 'dashboard_ml_sync'));
  activateMatchFilterButton(type === 'value_active' ? 'value' : ((type === 'all_predictions' || type === 'pro_active') ? 'all' : ''));
  if($('league-filter')) $('league-filter').value = '';
  if($('match-date-filter')) $('match-date-filter').value = 'all';
  if($('match-market-filter')) $('match-market-filter').value = '';
  if($('match-verdict-filter')) $('match-verdict-filter').value = 'all';
  if($('match-pro-mode')) $('match-pro-mode').value = (type === 'pro_active' ? 'pro' : 'all');
  if($('match-min-prob')) $('match-min-prob').value = 0;
  if($('match-min-edge')) $('match-min-edge').value = 0;
  if($('sort-select')) $('sort-select').value = 'date';
  switchTab('meciuri');
  renderMatches();
  setTimeout(function(){
    var target = $('matches-container');
    if(target && typeof target.scrollIntoView === 'function'){
      target.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  }, 120);
}

function hasSyncedOdds(match){
  if(!match) return false;
  if(match.hasOdds === true || match.has_odds === true) return true;
  var fields = ['oddsHome','oddsDraw','oddsAway','oddsOver15','oddsUnder15','oddsOver25','oddsUnder25','oddsOver35','oddsUnder35','oddsBtts','oddsBttsNo'];
  return fields.some(function(key){ return Number(match[key] || 0) > 1.01; });
}

function resetMatchFilters(){
  clearMatchFocus();
  CURRENT_FILTER = 'all';
  document.querySelectorAll('.filter-btn,.mf-chip,.mx20-chip,.mx21-chip,.ba-market-chip').forEach(function(b){ b.classList.remove('active'); });
  activateMatchFilterButton('all');
  if($('league-filter')) $('league-filter').value = '';
  if($('match-date-filter')) $('match-date-filter').value = 'all';
  if($('match-market-filter')) $('match-market-filter').value = '';
  if($('match-verdict-filter')) $('match-verdict-filter').value = 'all';
  if($('match-pro-mode')) $('match-pro-mode').value = 'all';
  if($('match-min-prob')) $('match-min-prob').value = 0;
  if($('match-min-edge')) $('match-min-edge').value = 0;
  if($('sort-select')) $('sort-select').value = 'date';
  renderMatches();
}

function buildLeagueFilter(){
  var sel = $('league-filter');
  if(!sel) return;
  var leagues = {};
  ALL_MATCHES.forEach(function(m){ leagues[m.league] = true; });
  var opts = '<option value="">Toate Ligile</option>';
  Object.keys(leagues).sort().forEach(function(l){ opts += '<option value="'+l+'">'+l+'</option>'; });
  sel.innerHTML = opts;
}


var MATCH_ALERTS = JSON.parse(localStorage.getItem('bet_match_alerts_v16') || '[]');
var MATCH_FOCUS_KEY = '';
function clearMatchFocus(){ MATCH_FOCUS_KEY = ''; }
function updateTicketIndicators(){
  var count = BILETE && Array.isArray(BILETE.picks) ? BILETE.picks.length : 0;
  ['.tab[data-tab="bilete"]','.mobile-nav-btn[data-tab="bilete"]'].forEach(function(sel){
    var btn = document.querySelector(sel);
    if(!btn) return;
    var badge = btn.querySelector('.nav-ticket-badge');
    if(!count){ if(badge) badge.remove(); return; }
    if(!badge){ badge = document.createElement('span'); badge.className = 'nav-ticket-badge'; btn.appendChild(badge); }
    badge.textContent = count > 9 ? '9+' : String(count);
  });
}
function renderTicketQuickPeek(){
  var host = $('ticket-quickpeek');
  if(!host) return;
  var activeTab = getCurrentActiveTabName();
  var show = !!(BILETE && Array.isArray(BILETE.picks) && BILETE.picks.length && activeTab !== 'bilete');
  host.classList.toggle('show', show);
  if(!show){ host.innerHTML = ''; updateTicketIndicators(); return; }
  var picks = BILETE.picks.slice(0,3);
  var totalOdds = Number(BILETE.totalOdds || 1).toFixed(2);
  var combinedProb = Number(BILETE.combinedProb || computeConservativeCombinedProb(BILETE.picks)).toFixed(1);
  host.innerHTML = '<div class="ticket-quickpeek-head">'+
    '<div><div class="ticket-quickpeek-title">🎫 Bilet curent gata de verificat</div><div class="ticket-quickpeek-sub">Nu mai trebuie să schimbi pagina ca să vezi ce ai adăugat.</div></div>'+
    '<button class="btn" style="padding:8px 10px" onclick="switchTab(\'bilete\')">Deschide</button>'+
  '</div>'+
  '<div class="ticket-quickpeek-pills"><span class="ticket-quickpeek-pill">'+(BILETE.picks.length)+' selecții</span><span class="ticket-quickpeek-pill">Cotă '+totalOdds+'x</span><span class="ticket-quickpeek-pill">Prob. '+combinedProb+'%</span></div>'+
  '<div class="ticket-quickpeek-list">'+picks.map(function(match){ var bet = match.bestBet || match || {}; return '<div class="ticket-quickpeek-item"><strong>'+(match.home || '—')+' vs '+(match.away || '—')+'</strong><br>'+(bet.label || 'Selecție')+' @ '+Number(bet.odds || 0).toFixed(2)+'</div>'; }).join('')+(BILETE.picks.length > 3 ? '<div class="ticket-quickpeek-item">+'+(BILETE.picks.length - 3)+' selecții suplimentare</div>' : '')+'</div>'+
  '<div class="ticket-quickpeek-actions"><button class="btn btn-primary" onclick="switchTab(\'bilete\')" style="width:100%;justify-content:center">Vezi biletul complet</button><button class="btn" onclick="clearCurrentTicket()" style="padding:10px 12px">🗑️</button></div>';
  updateTicketIndicators();
}
function openDashboardOpportunity(key){
  if(!key) return;
  MATCH_FOCUS_KEY = key;
  if($('league-filter')) $('league-filter').value = '';
  if($('match-date-filter')) $('match-date-filter').value = 'all';
  if($('match-market-filter')) $('match-market-filter').value = '';
  if($('match-pro-mode')) $('match-pro-mode').value = 'all';
  if($('match-min-prob')) $('match-min-prob').value = 0;
  if($('match-min-edge')) $('match-min-edge').value = 0;
  if($('match-kickoff-filter')) $('match-kickoff-filter').value = 'all';
  if($('match-tier-filter')) $('match-tier-filter').value = 'all';
  if($('match-min-score')) $('match-min-score').value = 0;
  if($('sort-select')) $('sort-select').value = 'date';
  switchTab('meciuri');
  renderMatches();
  toast('Am deschis meciul selectat direct în lista de analiză', 'ok');
}
function getMatchCardKey(m){
  return String((m && (m.id || m.eventId || m.event_id)) || [m.home || '', m.away || '', m.dateKey || m.date || m.event_date || ''].join('_')).replace(/[^a-zA-Z0-9_-]/g,'_');
}
function findMatchByCardKey(key){
  return (ALL_MATCHES || []).find(function(m){ return getMatchCardKey(m) === key; }) || null;
}
function getMatchKickoffLabel(m){
  var raw = m && (m.event_date || m.eventDate || m.date || m.starts_at || m.kickoff || m.start_time || null);
  if(!raw) return 'Data indisponibilă';
  var d = new Date(raw);
  if(!isFinite(d.getTime())) return String(raw);
  return d.toLocaleDateString('ro-RO') + ' • ' + d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
}
function getMatchKickoffParts(m){
  var raw = m && (m.event_date || m.eventDate || m.date || m.starts_at || m.kickoff || m.start_time || null);
  if(!raw) return { dateLabel:'Data indisponibilă', timeLabel:'—' };
  var d = new Date(raw);
  if(!isFinite(d.getTime())) return { dateLabel:String(raw), timeLabel:'—' };
  return {
    dateLabel: d.toLocaleDateString('ro-RO', { weekday:'short', day:'2-digit', month:'2-digit' }).replace(/^./, function(ch){ return String(ch || '').toUpperCase(); }),
    timeLabel: d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })
  };
}
function getMatchKickoffCountdown(m){
  var raw = m && (m.event_date || m.eventDate || m.date || m.starts_at || m.kickoff || m.start_time || null);
  if(!raw) return 'fără countdown';
  var diff = new Date(raw).getTime() - Date.now();
  if(!isFinite(diff)) return 'fără countdown';
  if(diff <= 0) return 'în curs / aproape de start';
  var mins = Math.round(diff / 60000);
  if(mins < 60) return 'în ' + mins + 'm';
  var hrs = Math.floor(mins / 60);
  if(hrs < 24) return 'în ' + hrs + 'h';
  var days = Math.floor(hrs / 24);
  return 'în ' + days + 'z';
}
function toggleMatchAnalysisDetails(key){
  var box = $('match-extra-' + key);
  if(!box) return;
  box.classList.toggle('open');
}
function quickAddMatchToTicket(key, btn){
  var m = findMatchByCardKey(key);
  if(!m || !m.bestBet) return toast('Nu există o selecție activă pentru acest meci', 'err');
  var cloned = JSON.parse(JSON.stringify(m));
  BILETE = makeTicketPreview('single', '🧩 Bilet manual din card', [cloned], Number((cloned.bestBet || {}).odds || 1), 'Scăzut', 'Selecție trimisă manual din cardul de meci. O găsești în preview și în tabul Bilete.');
  BILETE.stake = getStakeForTicket('single');
  renderBilete();
  renderTicketQuickPeek();
  if(btn){
    var old = btn.innerHTML;
    btn.innerHTML = '✅ În bilet';
    btn.style.borderColor = 'rgba(34,197,94,.28)';
    btn.style.background = 'linear-gradient(135deg,rgba(34,197,94,.16),rgba(59,130,246,.12))';
    setTimeout(function(){ btn.innerHTML = old; btn.style.borderColor = ''; btn.style.background = ''; }, 1400);
  }
  toast('Selecția a fost adăugată în biletul curent', 'ok');
}
function toggleLiveAlert(key){
  var idx = MATCH_ALERTS.indexOf(key);
  if(idx >= 0){
    MATCH_ALERTS.splice(idx,1);
    localStorage.setItem('bet_match_alerts_v16', JSON.stringify(MATCH_ALERTS));
    toast('Alerta live a fost scoasă', 'ok');
    return;
  }
  MATCH_ALERTS.push(key);
  localStorage.setItem('bet_match_alerts_v16', JSON.stringify(MATCH_ALERTS));
  toast('Alerta live a fost salvată local pentru acest meci', 'ok');
}
function hasLiveAlert(key){ return MATCH_ALERTS.indexOf(key) >= 0; }

// Debounce pentru renderMatches — evită re-render la fiecare keystroke pe mobile
var _renderMatchesTimer = null;
function renderMatchesDebounced(){
  if(_renderMatchesTimer) clearTimeout(_renderMatchesTimer);
  _renderMatchesTimer = setTimeout(function(){ _renderMatchesTimer = null; renderMatches(); }, 120);
}

function renderMatches(){
  var container = $('matches-container');
  var sort = $('sort-select').value;
  var leagueF = $('league-filter') ? $('league-filter').value : '';
  var dateF = $('match-date-filter') ? $('match-date-filter').value : 'all';
  var marketF = $('match-market-filter') ? $('match-market-filter').value : '';
  var verdictF = $('match-verdict-filter') ? $('match-verdict-filter').value : 'all';
  var proMode = $('match-pro-mode') ? $('match-pro-mode').value : 'all';
  var minProb = $('match-min-prob') ? Number($('match-min-prob').value || 0) : 0;
  var minEdge = $('match-min-edge') ? Number($('match-min-edge').value || 0) : 0;
  var kickoffF = $('match-kickoff-filter') ? $('match-kickoff-filter').value : 'all';
  var tierF = $('match-tier-filter') ? $('match-tier-filter').value : 'all';
  var minScore = $('match-min-score') ? Number($('match-min-score').value || 0) : 0;
  document.querySelectorAll('.view-mode-btn,.mf-mode-btn,.mx20-mode-btn,.mx21-mode-btn,.ba-mode-btn').forEach(function(el){
    el.classList.toggle('active', el.getAttribute('data-mode') === MATCH_CARD_MODE);
  });
  var now = Date.now();
  var smartBetLookup = getSmartBetAnalysisLookup();
  // Pre-build validated event ID index (any market) for fallback matching
  // FIX: construiește set de event ID-uri motor direct din SIGNAL_AUDIT.rows (nu din lookup care polua cu nume echipe)
  var _motorEidSet = {};
  ((SIGNAL_AUDIT && SIGNAL_AUDIT.rows) || []).forEach(function(r){
    if(r && r.event_id != null && r.event_id !== '') _motorEidSet[String(r.event_id)] = true;
    if(r && r.eventId != null && r.eventId !== '') _motorEidSet[String(r.eventId)] = true;
  });

  var filterTypeMap = {
    'o15':['over15'], 'o25':['over25'], 'u35':['under35'], 'btts':['btts'],
    'dc':['dc1x','dcx2','dc12']
  };
  var marketLabelMap = {
    'Over 1.5G':'over15','Over 2.5G':'over25','Under 3.5G':'under35','BTTS':'btts',
    'Șansă Dublă 1X':'dc1x','Șansă Dublă X2':'dcx2','Șansă Dublă 12':'dc12'
  };
  function getActiveMarketBet(match, fallbackBet){
    var wanted = filterTypeMap[CURRENT_FILTER] || null;
    if(marketF && marketLabelMap[marketF]) wanted = [marketLabelMap[marketF]];
    if(!wanted || !wanted.length) return fallbackBet || null;
    if(fallbackBet && wanted.indexOf(fallbackBet.type) >= 0) return fallbackBet;
    if(Array.isArray(match.eligibleCandidates)){
      var found = match.eligibleCandidates.find(function(c){ return c && c.bestBet && wanted.indexOf(c.bestBet.type) >= 0; });
      if(found && found.bestBet) return found.bestBet;
    }
    return fallbackBet || null;
  }

  var filtered = ALL_MATCHES.filter(function(m){
    var b = m.bestBet || null;
    if(MATCH_FOCUS_KEY && getMatchCardKey(m) !== MATCH_FOCUS_KEY) return false;
    var isDashboardMlSync = CURRENT_FILTER === 'dashboard_ml_sync';
    var isDashboardWithOdds = CURRENT_FILTER === 'dashboard_with_odds';
    var isDashboardStream = isDashboardMlSync || isDashboardWithOdds;
    if(leagueF && m.league !== leagueF) return false;
    if(isDashboardMlSync){
      // show the full synced ML list, not only the currently displayable subset
    } else if(isDashboardWithOdds){
      if(!isDashboardStream && !isMatchStillDisplayable(m)) return false;
      if(!hasSyncedOdds(m)) return false;
    } else {
      if(CURRENT_FILTER === 'all' && m.analysisState !== 'ELIGIBLE') return false;
      if(CURRENT_FILTER === 'motor_validated'){
        // Motor: check pool by event_id direct din SIGNAL_AUDIT.rows (FIX: evită _validatedEids poluat cu team names)
        // Skip isMatchStillDisplayable so pool count matches Motor Unificat exactly
        var _allBets = b ? [b] : [];
        if(Array.isArray(m.eligibleCandidates)) m.eligibleCandidates.forEach(function(c){ if(c&&c.bestBet) _allBets.push(c.bestBet); });
        var _eid = String(m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:''));
        var _motorOk = (_eid && _motorEidSet[_eid]) ||
          _allBets.some(function(cb){ return getSmartBetStatusForMatch(m,cb,smartBetLookup).state==='validated'; });
        if(!_motorOk) return false;
      } else {
        // All other filters: respect displayability
        if(!isMatchStillDisplayable(m)) return false;
      }
      if(CURRENT_FILTER === 'safe' && !(m.analysisState === 'ELIGIBLE' && (m.verdict === 'safe' || m.riskTier === 'Safe'))) return false;
      if(CURRENT_FILTER === 'moderate' && !(m.analysisState === 'ELIGIBLE' && m.verdict === 'moderate')) return false;
      if(CURRENT_FILTER === 'value' && !(m.analysisState === 'ELIGIBLE' && (m.riskTier === 'Value' || (b && b.value >= 0.08 && Number(b.edgePct || 0) >= 3)))) return false;
      if(CURRENT_FILTER === 'balanced' && !(m.analysisState === 'ELIGIBLE' && (m.riskTier === 'Balanced' || m.riskTier === 'Safe' || m.riskTier === 'Value'))) return false;
      if(CURRENT_FILTER === 'bet_ok' && !isBettingCommonOkMatch(m, b)) return false;
      // Filtre pe piață: verificam in TOATE candidatii eligibili, nu doar bestBet
      // (altfel un meci cu Over 1.5 valid dar BTTS si mai bun nu mai apare la "Over 1.5")
      function hasEligibleType(match, t){
        if(match.analysisState !== 'ELIGIBLE') return false;
        if(match.bestBet && match.bestBet.type === t) return true;
        return Array.isArray(match.eligibleCandidates) && match.eligibleCandidates.some(function(c){ return c.bestBet && c.bestBet.type === t; });
      }
      if(CURRENT_FILTER === 'o15' && !hasEligibleType(m, 'over15')) return false;
      if(CURRENT_FILTER === 'issues' && !(m.analysisState !== 'ELIGIBLE')) return false;
      if(CURRENT_FILTER === 'btts' && !hasEligibleType(m, 'btts')) return false;
      if(CURRENT_FILTER === 'o25'){
        var _eid25 = String(m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:''));
        var _inAudit25 = _eid25 && ((SIGNAL_AUDIT && SIGNAL_AUDIT.rows)||[]).some(function(r){ return String(r.event_id||r.eventId||'')===_eid25 && (r.market_key==='over25'||r.market==='Over 2.5G'); });
        if(!hasEligibleType(m, 'over25') && !_inAudit25) return false;
        if(_inAudit25 && m.analysisState !== 'ELIGIBLE'){
          // Forțăm eligibilitate din signal_audit (ca Motor)
          return true;
        }
      }
      if(CURRENT_FILTER === 'u35' && !hasEligibleType(m, 'under35')) return false;
      if(CURRENT_FILTER === 'dc' && !(hasEligibleType(m, 'dc1x') || hasEligibleType(m, 'dcx2') || hasEligibleType(m, 'dc12'))) return false;
      if(!b && CURRENT_FILTER !== 'motor_validated' && CURRENT_FILTER !== 'o25') return false;
      // o25 fără bestBet: acceptăm dacă e în signal_audit
      if(!b && CURRENT_FILTER === 'o25'){
        var _eid25b = String(m.eventId!=null?m.eventId:(m.event_id!=null?m.event_id:''));
        var _inAudit25b = _eid25b && ((SIGNAL_AUDIT && SIGNAL_AUDIT.rows)||[]).some(function(r){ return String(r.event_id||r.eventId||'')===_eid25b && (r.market_key==='over25'||r.market==='Over 2.5G'); });
        if(!_inAudit25b) return false;
      }
    }

    if(dateF === 'today'){
      if(fmtDateKey(m.date) !== fmtDateKey(new Date().toISOString())) return false;
    } else if(dateF !== 'all'){
      var days = (new Date(m.date).getTime() - now) / 86400000;
      if(days < 0 || days > Number(dateF)) return false;
    }

    if(marketF){
      var matchesMarket = (b && b.label === marketF);
      if(!matchesMarket && Array.isArray(m.eligibleCandidates)){
        matchesMarket = m.eligibleCandidates.some(function(c){ return c.bestBet && c.bestBet.label === marketF; });
      }
      if(!matchesMarket) return false;
    }
    if(verdictF && verdictF !== 'all'){
      var verdictBet = getActiveMarketBet(m, b);
      var verdictMeta = verdictBet ? getBetVerdict(m, verdictBet) : null;
      if(!verdictMeta || verdictMeta.state !== verdictF) return false;
    }
    if(proMode === 'pro' && !(m.leagueTier !== 'avoid' && (b.adjProb || 0) >= 72 && (b.edgePct || -999) >= 1.5 && (b.value || 0) >= 0.01)) return false;
    if((b.adjProb || 0) < minProb) return false;
    if((b.edgePct != null ? b.edgePct : -999) < minEdge) return false;
    if((m.smartScore || 0) < minScore) return false;
    if(tierF !== 'all' && String(m.leagueTier || 'neutral') !== tierF) return false;
    if(kickoffF !== 'all'){
      var hrsToKick = getHoursToKickoff(m);
      if(hrsToKick == null || hrsToKick < 0 || hrsToKick > Number(kickoffF)) return false;
    }
    return true;
  });

  // Swap bestBet cu candidatul matchat de filtru, daca filtrul cere un tip specific
  // (altfel cardul arata bestBet original, chiar daca user a cerut Over 1.5)
  var wantedTypes = filterTypeMap[CURRENT_FILTER];
  // Also handle market dropdown
  if(marketF && marketLabelMap[marketF]) wantedTypes = [marketLabelMap[marketF]];

  function auditRowMatchesWantedType(row, types){
    if(!row || !types || !types.length) return false;
    var mk = String(row.market_key || row.marketKey || '').toLowerCase();
    var ml = String(row.market || row.label || '').toLowerCase();
    return types.some(function(t){
      if(t === 'over25') return mk === 'over25' || ml === 'over 2.5g' || ml === 'over 2.5' || ml === 'o2.5g' || ml === 'o2.5';
      if(t === 'over15') return mk === 'over15' || ml === 'over 1.5g' || ml === 'over 1.5' || ml === 'o1.5g' || ml === 'o1.5';
      if(t === 'under35') return mk === 'under35' || ml === 'under 3.5g' || ml === 'under 3.5' || ml === 'u3.5g' || ml === 'u3.5';
      if(t === 'btts') return mk === 'btts' || ml === 'btts';
      return mk === t;
    });
  }
  function auditRowForWantedType(match, types){
    var eid = String(match && (match.eventId != null ? match.eventId : (match.event_id != null ? match.event_id : '')) || '');
    if(!eid) return null;
    var rows = (SIGNAL_AUDIT && SIGNAL_AUDIT.rows) || [];
    for(var i=0;i<rows.length;i++){
      var r = rows[i] || {};
      var rid = String(r.event_id != null ? r.event_id : (r.eventId != null ? r.eventId : ''));
      if(rid === eid && auditRowMatchesWantedType(r, types)) return r;
    }
    return null;
  }
  function firstNum(){
    for(var i=0;i<arguments.length;i++){
      var n = Number(arguments[i]);
      if(isFinite(n) && n !== 0) return n;
    }
    return 0;
  }
  function auditRowToBestBet(row, wantedTypes, fallbackBet){
    var t = (wantedTypes && wantedTypes[0]) || String(row.market_key || row.marketKey || 'over25');
    var defaultLabel = t === 'over25' ? 'Over 2.5G' : (t === 'over15' ? 'Over 1.5G' : (t === 'under35' ? 'Under 3.5G' : (t === 'btts' ? 'BTTS' : 'Pronostic')));
    var prob = firstNum(row.adjusted_prob, row.adjProb, row.model_prob, row.prob, row.api_prob, row.confidence);
    var odds = firstNum(row.book_odds, row.odds, row.best_odds, row.base_odds, row.market_odds, row.fair_odds);
    var edge = firstNum(row.edge_pct, row.edgePct, row.edge_pp);
    var value = firstNum(row.value, row.value_pct);
    if(value > 1) value = value / 100;
    return Object.assign({}, fallbackBet || {}, {
      type: t,
      marketKey: t,
      label: row.market || row.label || defaultLabel,
      odds: odds || Number((fallbackBet || {}).odds || 0),
      baseOdds: odds || Number((fallbackBet || {}).baseOdds || 0),
      adjProb: prob || Number((fallbackBet || {}).adjProb || 0),
      prob: prob || Number((fallbackBet || {}).prob || 0),
      edgePct: edge,
      value: value,
      score: firstNum(row.score, row.smartScore, row.ticket_score, (fallbackBet || {}).score),
      verdict: row.verdict || (fallbackBet || {}).verdict || 'moderate',
      sourceApi: row.source_api !== false,
      sourceHeuristic: !!row.source_heuristic,
      oddsSource: row.odds_source || row.oddsSource || (odds ? 'STD' : ((fallbackBet || {}).oddsSource || 'STD')),
      fairOdds: row.fair_odds || ((prob > 0) ? (100 / prob) : (fallbackBet || {}).fairOdds)
    });
  }

  if(wantedTypes && wantedTypes.length){
    filtered = filtered.map(function(m){
      var auditRow = auditRowForWantedType(m, wantedTypes);
      if(m.bestBet && wantedTypes.indexOf(m.bestBet.type) >= 0) return m; // already matches
      var matching = Array.isArray(m.eligibleCandidates)
        ? m.eligibleCandidates.find(function(c){ return c.bestBet && wantedTypes.indexOf(c.bestBet.type) >= 0; })
        : null;
      if(matching && matching.bestBet){
        return Object.assign({}, m, {
          bestBet: Object.assign({}, matching.bestBet),
          smartScore: matching.ticketScore || matching.bestBet.score || m.smartScore,
          why: matching.why || m.why,
          verdict: matching.bestBet.verdict || m.verdict,
          analysisState: m.analysisState === 'ELIGIBLE' ? m.analysisState : 'ELIGIBLE'
        });
      }
      if(auditRow){
        var auditBet = auditRowToBestBet(auditRow, wantedTypes, m.bestBet || null);
        return Object.assign({}, m, {
          bestBet: auditBet,
          smartScore: auditBet.score || m.smartScore,
          why: auditRow.reason || auditRow.why || ('Semnal ' + (auditBet.label || 'piată') + ' validat de motor'),
          verdict: auditBet.verdict || m.verdict || 'moderate',
          analysisState: 'ELIGIBLE'
        });
      }
      return m;
    });
  }

  filtered = filtered.filter(function(m){
    var motorMeta = getSmartBetStatusForMatch(m, m.bestBet || null, smartBetLookup);
    if(motorMeta.state === 'blocked') return false;
    m._motorMeta = motorMeta;
    return true;
  });

  filtered.sort(function(a,b){
    var aBet = a.bestBet || a.rawBestBet || {value:-999,adjProb:0,odds:0,edgePct:-999};
    var bBet = b.bestBet || b.rawBestBet || {value:-999,adjProb:0,odds:0,edgePct:-999};
    if(sort === 'score'){
      // Verdict priority: PARIAZA(4-5) > RISC(2-3) > EVITA(0-1) > fara verdict
      var aV = a.bestBet ? getBetVerdict(a, a.bestBet) : null;
      var bV = b.bestBet ? getBetVerdict(b, b.bestBet) : null;
      var aVS = aV ? aV.score : -1;
      var bVS = bV ? bV.score : -1;
      // Grupeaza: bet(4-5)=2, risk(2-3)=1, avoid/no(0-1)=0
      var aGrp = aVS >= 4 ? 2 : aVS >= 2 ? 1 : 0;
      var bGrp = bVS >= 4 ? 2 : bVS >= 2 ? 1 : 0;
      if(bGrp !== aGrp) return bGrp - aGrp;
      return (b.smartScore || b.rawSmartScore || 0) - (a.smartScore || a.rawSmartScore || 0);
    }
    if(sort === 'value') return (bBet.value||0) - (aBet.value||0);
    if(sort === 'prob') return (bBet.adjProb||0) - (aBet.adjProb||0);
    if(sort === 'edge') return (bBet.edgePct||0) - (aBet.edgePct||0);
    if(sort === 'conf') return (b.confidence||0) - (a.confidence||0);
    return new Date(a.date) - new Date(b.date);
  });

  var fullCountText = MATCH_FOCUS_KEY ? ('Meci selectat din Dashboard • ' + filtered.length + ' rezultat') : (CURRENT_FILTER === 'dashboard_ml_sync' ? ('Lista ML sync • ' + filtered.length + ' meciuri') : (CURRENT_FILTER === 'dashboard_with_odds' ? ('Lista cu cote • ' + filtered.length + ' meciuri') : (CURRENT_FILTER === 'motor_validated' ? ('Validate Motor • ' + filtered.length + ' meciuri') : (CURRENT_FILTER === 'bet_ok' ? ('OK Pariere • ' + filtered.length + ' meciuri') : (filtered.length + ' meciuri')))));
  var compactCountText = MATCH_FOCUS_KEY ? (filtered.length + (filtered.length === 1 ? ' rezultat' : ' rezultate')) : (CURRENT_FILTER === 'bet_ok' ? (filtered.length + ' OK') : (CURRENT_FILTER === 'motor_validated' ? (filtered.length + ' validate') : (CURRENT_FILTER === 'dashboard_ml_sync' ? ('ML sync • ' + filtered.length) : (CURRENT_FILTER === 'dashboard_with_odds' ? ('Cu cote • ' + filtered.length) : (filtered.length + ' meciuri')))));
  var countEl = $('filter-count');
  if(countEl){
    countEl.textContent = (window.innerWidth <= 768 ? compactCountText : fullCountText);
    countEl.title = fullCountText;
  }
  // Sincronizăm contorul global imediat cu filtered.length (se va corecta mai jos cu _realCount)
  window.__VEYRA_MECIURI_DISPLAYED_COUNT = filtered.length;
  if(filtered.length === 0){
    container.innerHTML = '<div class="empty-state">Niciun meci găsit pentru filtrele selectate.<br/><button class="btn btn-primary" style="margin-top:10px" onclick="resetMatchFilters()">Resetează filtrele</button></div>';
    return;
  }

  function renderCard(m, displayIndex){
    var b = m.bestBet || null;
    var motorMeta = m._motorMeta || getSmartBetStatusForMatch(m, b, smartBetLookup);
    var state = getAnalysisStateMeta(m.analysisState);
    var verdictClass = m.analysisState === 'ELIGIBLE' ? m.verdict : 'avoid';
    var hLogo = logoImgHtml(teamLogoUrl(m.homeApiId), m.home, 38, '', { noFallback:true });
    var aLogo = logoImgHtml(teamLogoUrl(m.awayApiId), m.away, 38, '', { noFallback:true });
    var leagueLogo = m.leagueApiId ? logoImgHtml(leagueLogoUrl(m.leagueApiId), m.league, 14, '', { noFallback:true }) : '';
    var hLogoWrap = hLogo ? '<div class="m17-logo">'+hLogo+'</div>' : '';
    var aLogoWrap = aLogo ? '<div class="m17-logo">'+aLogo+'</div>' : '';
    var leagueLogoWrap = leagueLogo ? '<span class="m17-league-logo">'+leagueLogo+'</span>' : '';
    var reasons = b ? buildRecommendationReasons(m, b).map(function(r){ return '<span class="reason-pill">'+r+'</span>'; }).join('') : '';
    var recLabel = b ? b.label : 'Fără recomandare activă';
    var recOdd = b && b.odds ? Number(b.odds).toFixed(2) : null;
    var marketGapText = b && Number(b.marketGapPct || 0) > 0 ? ('+' + Number(b.marketGapPct || 0).toFixed(1) + '%') : null;
    var bestMarketLine = b && (Number(b.bookmakersCount || 0) > 0 || String(b.bestBookmaker || '').trim()) ? ('Best piață ' + Number(b.bestOdds || b.odds || 0).toFixed(2) + (b.bestBookmaker ? (' @ ' + htmlEsc(b.bestBookmaker)) : '') + (marketGapText ? (' • gap ' + marketGapText) : '') + (Number(b.bookmakersCount || 0) > 1 ? (' • ' + Number(b.bookmakersCount || 0) + ' case') : '')) : '';
    var compareBadge = bestMarketLine ? ('<span class="card-reco-badge" style="background:rgba(16,185,129,.10);border-color:rgba(16,185,129,.24);color:var(--grn)">📈 ' + bestMarketLine + '</span>') : '';
    var probBadge = b ? ('<span class="card-reco-badge">Șansă '+fmtPct(b.adjProb || 0)+'</span>') : '';
    var valueBadge = b && b.value != null ? ('<span class="card-reco-badge">Value '+((b.value>=0?'+':'') + fmtPct((b.value||0)*100))+'</span>') : '';
    var edgeBadge = b && b.edgePct != null ? ('<span class="card-reco-badge">Edge '+(b.edgePct >= 0 ? '+' : '')+fmtPct(b.edgePct)+'</span>') : '';
    var confBadge = b ? ('<span class="card-reco-badge">Confidence '+Number(m.confidence||0).toFixed(0)+'%</span>') : '';
    var tierBadge = b && m.leagueTierLabel ? ('<span class="card-reco-badge">'+m.leagueTierLabel+'</span>') : '';
    var poissonBadge = b ? poissonBadgeHtmlForBet(b) : '';
    var scoreBadge = m.mostLikelyScore ? ('<span class="mc-score-pill">scor probabil '+m.mostLikelyScore+'</span>') : '';
    var sourceBadge = b ? sourceChipHtmlForBet(b) : '';
    var oddsSourceMeta = b ? getOddsSourceMeta(b) : null;
    var oddsSourceBadge = oddsSourceMeta ? oddsSourceBadgeHtml(oddsSourceMeta) : '';
    var oddsCompareBlock = oddsSourceMeta ? renderOddsSourceCompareHtml(oddsSourceMeta) : '';
    var oddsInlineTag = oddsSourceMeta ? inlineOddsSourceTagHtml(oddsSourceMeta) : '';
    var ageBadge = m.createdAt ? ageBadgeHtml(m.createdAt) : '';
    var hybridBlock = b && b.probabilityEngine === 'hybrid' ? renderHybridProbabilityBlock({ apiProb:b.apiProb, poissonProb:b.poissonProb, hybridProb:b.prob, delta:b.poissonDelta }) : '';
    var hybridInline = b && b.probabilityEngine === 'hybrid' ? renderHybridProbabilityInline({ apiProb:b.apiProb, poissonProb:b.poissonProb, hybridProb:b.prob, delta:b.poissonDelta }) : '';
    // Alternate eligible markets (other than bestBet) — mini-pill showing all viable picks + probabilities
    var altMarketsHtml = '';
    if(Array.isArray(m.eligibleCandidates) && m.eligibleCandidates.length > 1 && b){
      var altPills = m.eligibleCandidates
        .filter(function(c){ return c.bestBet && c.bestBet.type !== b.type; })
        .slice(0, 4)
        .map(function(c){
          var cb = c.bestBet;
          var valClass = (cb.value || 0) >= 0.05 ? 'var(--grn)' : ((cb.value || 0) >= 0 ? 'var(--yel)' : 'var(--red)');
          return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:11px;white-space:nowrap">'+
            '<span style="font-weight:800;color:var(--txt)">'+(cb.label || '—')+'</span>'+
            '<span style="color:var(--muted);font-family:var(--mono)">@ '+Number(cb.odds || 0).toFixed(2)+'</span>'+
            '<span style="color:'+valClass+';font-family:var(--mono);font-weight:700">'+fmtPct(Number(cb.adjProb || 0))+'</span>'+
          '</span>';
        }).join('');
      if(altPills){
        altMarketsHtml = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)">'+
          '<div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;font-weight:700">Alte piețe eligibile</div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:6px">'+altPills+'</div>'+
        '</div>';
      }
    }
    var compactWhy = b ? ('<div class="match-why"><strong>De ce:</strong> ' + ((m.why && String(m.why).trim()) ? m.why : (m.rationale && String(m.rationale).trim()) ? m.rationale : buildRecommendationReasons(m, b).slice(0, 2).join(' • ')) + '</div>') : '';
    var catboostBadge = m.catboostSignal ? ('<span class="card-reco-badge" style="background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.35);color:var(--yel);font-weight:800">⚡ CB: '+m.catboostSignal+(m.catboostEvPct!=null?' • EV '+Number(m.catboostEvPct).toFixed(1)+'%':'')+'</span>') : '';

    // ─── Lineup Badge ───────────────────────────────────────────────────────
    var lineupBadge = '';
    var totalUnavail = (m.nUnavailHome || 0) + (m.nUnavailAway || 0);
    if(totalUnavail > 0 && m.lineupStatus){
      var homeU = m.nUnavailHome || 0;
      var awayU = m.nUnavailAway || 0;
      var lineupParts = [];
      if(homeU > 0) lineupParts.push(htmlEsc(m.homeTeam||'G')+': '+homeU+' lipsă');
      if(awayU > 0) lineupParts.push(htmlEsc(m.awayTeam||'O')+': '+awayU+' lipsă');
      var lineupColor = totalUnavail >= 3 ? 'var(--red)' : totalUnavail >= 1 ? '#f59e0b' : 'var(--muted)';
      var confirmedStr = m.lineupStatus === 'confirmed' ? ' ✓' : '';
      lineupBadge = '<span class="card-reco-badge" style="color:'+lineupColor+'">🤕 '+lineupParts.join(' | ')+confirmedStr+'</span>';
    } else if(m.lineupStatus === 'confirmed' && m.homeFormation && m.awayFormation) {
      lineupBadge = '<span class="card-reco-badge" style="color:var(--muted)">📋 '+htmlEsc(m.homeFormation)+' vs '+htmlEsc(m.awayFormation)+' ✓</span>';
    }
    // ────────────────────────────────────────────────────────────────────────

    // ─── Referee Badge ──────────────────────────────────────────────────────
    var refBadge = '';
    if(m.refName && m.refAvgGoals != null){
      var refColor = m.refIsHighGoals ? 'var(--red)' : (m.refAvgGoals <= 2.2 ? 'var(--grn)' : 'var(--muted)');
      var refYellowStr = m.refAvgYellow != null ? (' • 🟨 '+Number(m.refAvgYellow).toFixed(1)) : '';
      var refGoalStr = '⚽ '+Number(m.refAvgGoals).toFixed(1)+'g/meci';
      var refStrictStr = m.refIsStrict ? ' • strict' : '';
      var refTrendStr = ''; try { if(m.refYellowTrend != null){ var rt=Number(m.refYellowTrend||0); if(rt>=0.5) refTrendStr=' 📈'; else if(rt<=-0.5) refTrendStr=' 📉'; } } catch(e){}
      refBadge = '<span class="card-reco-badge" style="color:'+refColor+'" title="Arbitru: '+htmlEsc(m.refName)+(m.refMatches?' ('+m.refMatches+' meciuri)':'')+(m.refYellowTrend!=null?' trend:'+Number(m.refYellowTrend).toFixed(1):'')+'">👨‍⚖️ '+htmlEsc(m.refName.split(' ').pop())+' • '+refGoalStr+refYellowStr+refStrictStr+refTrendStr+'</span>';
    }
    // ─── Polymarket signal badge ─────────────────────────────────────────────
    var polyBadge = '';
    if(m.polymarketSignal && m.polymarketDivergence != null){
      var pdiv = Number(m.polymarketDivergence);
      var pabs = Math.abs(pdiv);
      var pcolor = pdiv > 0 ? 'var(--grn)' : 'var(--red)';
      var pmk = String(m.polymarketMarket || '').replace('_', ' ').toUpperCase();
      var psign = pdiv > 0 ? '+' : '';
      polyBadge = '<span class="card-reco-badge" style="background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.3);color:#818cf8" title="Polymarket diverge față de bookmakers cu '+psign+pdiv.toFixed(1)+'pp ('+pmk+')">💎 PM '+(pabs >= 10 ? '⚡' : '')+psign+pdiv.toFixed(1)+'pp</span>';
    }
    // ────────────────────────────────────────────────────────────────────────
    var motorBadge = motorMeta && motorMeta.state === 'validated' && !_btEdgeBad
      ? '<span class="card-reco-badge" style="background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.28);color:var(--grn)">Validat Motor' + (motorMeta.score != null ? ' • scor ' + Number(motorMeta.score || 0).toFixed(0) : '') + '</span>'
      : (motorMeta && motorMeta.state === 'validated' && _btEdgeBad
        ? '<span class="card-reco-badge" style="background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.30);color:#ef4444">⚠ Motor validat • edge neprofitabil</span>'
        : '');

    // --- ML5 ENRICHMENT BADGE & BREAKDOWN ---
    var ml5Badge = '';
    var ml5ContextBlock = '';
    if(m.isEnriched){
      ml5Badge = '<span class="card-reco-badge" style="background:rgba(139,92,246,.13);border-color:rgba(139,92,246,.35);color:#a78bfa;font-weight:800">🔬 ML5</span>';
      function formDots(fs){
        if(!fs) return '<span style="color:var(--muted)">—</span>';
        return String(fs).toUpperCase().split('').map(function(c){
          var col = c==='W'?'#22c55e':c==='D'?'#f59e0b':'#ef4444';
          return '<span style="color:'+col+';font-weight:900">'+c+'</span>';
        }).join(' ');
      }
      var homeFS = formDots(m.homeFormStr);
      var awayFS = formDots(m.awayFormStr);      var formHomeInline = homeFS
        ? '<div class="ml5-inline-form"><span class="ml5-inline-label">Gazde</span><span class="ml5-inline-seq">'+homeFS+'</span></div>' : '';
      var formAwayInline = awayFS
        ? '<div class="ml5-inline-form"><span class="ml5-inline-label">Oaspeți</span><span class="ml5-inline-seq">'+awayFS+'</span></div>' : '';
      var h2hMeta = m.h2hLabel
        ? '<span class="ml5-inline-meta-item">⚔️ '+htmlEsc(m.h2hLabel)+'</span>' : '';
      var coachMeta = (m.homeCoachName || m.awayCoachName)
        ? '<span class="ml5-inline-meta-item">🧠 '
            +(m.homeCoachName ? htmlEsc(m.homeCoachName) : '?')+' vs '
            +(m.awayCoachName ? htmlEsc(m.awayCoachName) : '?')
            +'</span>' : '';
      var factPills = '';
      if(b && b.ml5Factors){
        var fmap5 = {formFactor:'Formă',h2hFactor:'H2H',absenceFactor:'Absențe',tactFactor:'Tactici',refFactor:'Arbitru',ctxFactor:'Context'};
        Object.keys(fmap5).forEach(function(k){
          var v = Number(b.ml5Factors[k]||1);
          if(Math.abs(v-1) < 0.006) return;
          factPills += '<span class="ml5-inline-pill ' + (v > 1 ? 'up' : 'down') + '">'+(v>1?'↑':'↓')+' '+fmap5[k]+'</span>';
        });
      }
      if(formHomeInline||formAwayInline||h2hMeta||coachMeta||factPills){
        var _refMeta = '', _ctxMeta = '';
        if(m.isEnriched){
          var _eRef = (ENRICHED_EVENT_CACHE[String(m.eventId)] || {}).referee || null;
          if(_eRef && _eRef.avg_goals_per_match != null){
            var _rg = Number(_eRef.avg_goals_per_match).toFixed(1);
            var _ry = _eRef.avg_yellow_per_match != null ? ' · '+Number(_eRef.avg_yellow_per_match).toFixed(1)+'G/m' : '';
            var _rc = Number(_rg)>=3.0?'#f59e0b':Number(_rg)<=2.0?'#60a5fa':'var(--muted)';
            _refMeta = '<span class="ml5-inline-meta-item" style="color:'+_rc+'">Arb: '+htmlEsc(_eRef.name||'')+' '+_rg+'g/m'+_ry+'</span>';
          }
        }
        if(m.isDerby) _ctxMeta += '<span class="ml5-inline-meta-item" style="color:#f59e0b">Derby local</span>';
        if(m.weatherCode===3) _ctxMeta += '<span class="ml5-inline-meta-item" style="color:#60a5fa">Ploaie</span>';
        if(m.weatherCode===4) _ctxMeta += '<span class="ml5-inline-meta-item" style="color:#93c5fd">Ninsoare</span>';
        if(m.travelDistKm>2000) _ctxMeta += '<span class="ml5-inline-meta-item" style="color:#a78bfa">'+Math.round(m.travelDistKm)+'km</span>';
        if(m.pitchCondition>=2) _ctxMeta += '<span class="ml5-inline-meta-item" style="color:#6b7280">Teren degradat</span>';
        ml5ContextBlock = '<div class="ml5-inline-card">'
          +'<div class="ml5-inline-title">🔬 Context ML5</div>'
          +((formHomeInline || formAwayInline) ? '<div class="ml5-inline-forms">'+formHomeInline+formAwayInline+'</div>' : '')
          +((h2hMeta || coachMeta) ? '<div class="ml5-inline-meta">'+h2hMeta+coachMeta+'</div>' : '')
          +((_refMeta||_ctxMeta) ? '<div class="ml5-inline-meta">'+_refMeta+_ctxMeta+'</div>' : '')
          +(factPills?'<div class="ml5-inline-pills">'+factPills+'</div>':'')
          +'</div>';
      }
    }
    var predictionProbabilityHtml = b ? ('<div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:14px;background:linear-gradient(135deg,rgba(16,185,129,.10),rgba(59,130,246,.10));border:1px solid rgba(16,185,129,.18)"><div><div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Probabilitate pronostic</div><div style="font-size:24px;font-weight:900;line-height:1;color:var(--txt);margin-top:4px">'+fmtPct(Number(b.adjProb || 0))+'</div></div><div style="text-align:right"><div style="font-size:10px;color:var(--muted)">Cotă'+oddsInlineTag+'</div><div style="font-size:18px;font-weight:900;color:var(--acc);margin-top:4px">'+(recOdd ? '@ ' + recOdd : '—')+'</div></div></div>') : '';
    var m16ProbabilityHtml = b ? ('<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(59,130,246,.12));border:1px solid rgba(16,185,129,.18)"><div><div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Probabilitate pronostic</div><div style="font-size:28px;font-weight:900;line-height:1;margin-top:6px;color:var(--txt)">'+fmtPct(Number(b.adjProb || 0))+'</div></div><div style="text-align:right">'+(motorBadge || '')+'<div style="font-size:10px;color:var(--muted);margin-top:'+(motorBadge ? '8' : '0')+'px">Cotă'+oddsInlineTag+'</div><div style="font-size:20px;font-weight:900;color:var(--acc);margin-top:4px">'+(recOdd ? '@ ' + recOdd : '—')+'</div></div></div>') : '';
    var fairOdds = b && Number(b.adjProb || 0) > 0 ? (100 / Number(b.adjProb || 0)).toFixed(2) : '—';
    var compactRow = function(label, value, extraClass){
      return '<div class="analysis-compact-row'+(extraClass ? ' '+extraClass : '')+'"><span class="analysis-compact-label">'+label+'</span><span class="analysis-compact-value">'+value+'</span></div>';
    };
    var analysisMetricCards = b ? ('<div class="analysis-compact-list analysis-compact-list-metrics">'+
      compactRow('Probabilitate', fmtPct(Number(b.adjProb || 0)), 'accent-prob')+
      compactRow('Edge', (Number(b.edgePct || 0) >= 0 ? '+' : '')+Number(b.edgePct || 0).toFixed(1)+'pp', 'accent-edge')+
      compactRow('Value', (Number(b.value || 0) >= 0 ? '+' : '')+(Number(b.value || 0) * 100).toFixed(1)+'%', 'accent-value')+
      compactRow('Fair odds', fairOdds, 'accent-warn')+
      compactRow('Confidence', Number(m.confidence || 0).toFixed(0)+'%')+
      compactRow('xG total', Number(m.xgTotal || 0).toFixed(2))+
      compactRow('Kelly %', Number(b.kellyPct||0).toFixed(1)+'%', Number(b.kellyPct||0) > 0 ? 'accent-prob' : '')+
      (m.riskTier ? compactRow('Risk tier', m.riskTier, 'accent-edge') : '')+
    '</div>') : '';
    var simpleMetrics = '<div class="match-inline-row">'+
      '<span class="match-inline-chip">xG total '+Number(m.xgTotal || 0).toFixed(2)+'</span>'+
      '<span class="match-inline-chip">Confidence '+Number(m.confidence || 0).toFixed(0)+'%</span>'+
      (m.mostLikelyScore ? '<span class="match-inline-chip">Scor '+m.mostLikelyScore+'</span>' : '')+
      '</div>';
    var expertQuickContext = '<div class="analysis-compact-list analysis-compact-list-context">'+
      compactRow('xG gazde', Number(m.xgHome || 0).toFixed(2), 'compact-mini')+
      compactRow('xG oaspeți', Number(m.xgAway || 0).toFixed(2), 'compact-mini')+
      compactRow('xG total', Number(m.xgTotal || 0).toFixed(2), 'wide accent-edge')+
      compactRow('Confidence', Number(m.confidence || 0).toFixed(0)+'%', 'compact-mini')+
      (m.mostLikelyScore ? compactRow('Scor', m.mostLikelyScore, 'compact-mini') : '')+
    '</div>';
    var expertModelSummary = b && b.probabilityEngine === 'hybrid' ? ('<div class="analysis-compact-model">'+
      '<div class="analysis-compact-model-head"><span class="analysis-compact-model-title">Poisson vs API</span><span class="analysis-compact-model-chip">Hybrid model active</span></div>'+
      '<div class="analysis-compact-list analysis-compact-list-model">'+
        compactRow('API', Number(b.apiProb || 0).toFixed(1)+'%', 'compact-mini')+
        compactRow('Poisson', Number(b.poissonProb || 0).toFixed(1)+'%', 'compact-mini')+
        compactRow('Hybrid', Number(b.prob || 0).toFixed(1)+'%', 'compact-mini accent-prob')+
        compactRow('Δ API vs P', (Number(b.poissonDelta || 0) >= 0 ? '+' : '')+Number(b.poissonDelta || 0).toFixed(1)+'pp', Number(b.poissonDelta || 0) >= 0 ? 'compact-mini accent-prob' : 'compact-mini accent-warn')+
      '</div></div>') : '';
    var simpleSummary = b ? ('<div class="match-inline-summary"><span>Edge <strong>'+(Number(b.edgePct || 0) >= 0 ? '+' : '')+Number(b.edgePct || 0).toFixed(1)+'pp</strong></span><span>Value <strong>'+(Number(b.value || 0) >= 0 ? '+' : '')+(Number(b.value || 0) * 100).toFixed(1)+'%</strong></span>'+(Number(b.kellyPct||0)>0?'<span>Kelly <strong>'+Number(b.kellyPct||0).toFixed(1)+'%</strong></span>':'')+(m.riskTier&&m.riskTier!=='Avoid'?'<span class="summary-risk-tier" style="color:'+(m.riskTier==='Safe'?'var(--grn)':m.riskTier==='Value'?'var(--yel)':'var(--acc)')+'">'+m.riskTier+'</span>':'')+'</div>'+(b ? getBenchmarkRow(b.type || b.marketKey || '', Number(b.edgePct||0)) : '')) : '';
    var detailHero = '<div class="analysis-detail-hero">'+
      '<div class="analysis-detail-kicker">Analiză recomandare</div>'+
      '<div class="analysis-detail-pick-row">'+
        '<div class="analysis-detail-pick">'+recLabel+'</div>'+
        (recOdd ? '<div class="analysis-detail-odd">@ '+recOdd+'</div>' : '')+
      '</div>'+
      predictionProbabilityHtml+
    '</div>';
    var expertBadgeRow = '<div class="analysis-detail-chip-row">'+sourceBadge+oddsSourceBadge+compareBadge+motorBadge+catboostBadge+ml5Badge+refBadge+lineupBadge+edgeBadge+valueBadge+confBadge+tierBadge+poissonBadge+ageBadge+'</div>';
    var simpleBadgeRow = '<div class="analysis-detail-chip-row">'+sourceBadge+oddsSourceBadge+motorBadge+refBadge+lineupBadge+ageBadge+'</div>';

    // ─── Lineup Section ─────────────────────────────────────────────────────
    var lineupBlock = '';
    if(m.lineupStatus && m.lineupStatus !== 'unavailable'){
      var isConfirmed = m.lineupStatus === 'confirmed';
      var statusLabel = isConfirmed
        ? '<span style="color:var(--grn);font-weight:700">✓ Confirmat</span>'
        : '<span style="color:#f59e0b;font-weight:700">~ Predicted</span>';

      function renderUnavailList(players, teamName){
        if(!players || !players.length) return '<span style="color:var(--grn);font-size:11px">Toți disponibili</span>';
        return players.map(function(p){
          var statusIcon = p.status === 'injured' || p.status === 'injury' ? '🤕'
            : p.status === 'suspended' || p.status === 'red_card' ? '🟥'
            : p.status === 'doubtful' ? '⚠️' : '❓';
          var returnStr = p.return_date ? (' <span style="color:var(--muted);font-size:10px">ret. '+p.return_date+'</span>') : '';
          return '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:6px">'+
            '<span style="font-size:14px">'+statusIcon+'</span>'+
            '<span style="font-size:12px;font-weight:600;color:var(--txt)">'+htmlEsc(p.name||'—')+'</span>'+
            '<span style="font-size:10px;color:var(--muted);text-transform:capitalize">'+htmlEsc(p.status||'')+'</span>'+
            returnStr+
          '</div>';
        }).join('');
      }

      function renderFormationPill(formation, confidence){
        if(!formation) return '<span style="color:var(--muted)">—</span>';
        var confStr = confidence ? (' <span style="color:var(--muted);font-size:10px">'+Math.round(confidence*100)+'%</span>') : '';
        return '<span style="background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.3);color:#93c5fd;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700">'+htmlEsc(formation)+confStr+'</span>';
      }

      var homeFormPill = renderFormationPill(m.homeFormation, m.homeConfidence);
      var awayFormPill = renderFormationPill(m.awayFormation, m.awayConfidence);

      var homeUnavailHtml = renderUnavailList(m.homeUnavailable, m.homeTeam);
      var awayUnavailHtml = renderUnavailList(m.awayUnavailable, m.awayTeam);

      lineupBlock =
        '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin-top:12px">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
            '<span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Lineup</span>'+
            statusLabel+
          '</div>'+
          '<div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;justify-content:center">'+
            homeFormPill+
            '<span style="color:var(--muted);font-size:12px">vs</span>'+
            awayFormPill+
          '</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
            '<div>'+
              '<div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:6px;text-transform:uppercase">'+htmlEsc(m.homeTeam||'Gazde')+' — Lipsă</div>'+
              homeUnavailHtml+
            '</div>'+
            '<div>'+
              '<div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:6px;text-transform:uppercase">'+htmlEsc(m.awayTeam||'Oaspeți')+' — Lipsă</div>'+
              awayUnavailHtml+
            '</div>'+
          '</div>'+
        '</div>';
    }
    // ────────────────────────────────────────────────────────────────────────
    var xgMiniGrid = '<div class="ticket-mini-grid ticket-mini-grid-premium">'+
      '<div class="ticket-mini"><div class="v">'+Number(m.xgHome || 0).toFixed(2)+'</div><div class="l">xG gazde</div></div>'+
      '<div class="ticket-mini"><div class="v">'+Number(m.xgAway || 0).toFixed(2)+'</div><div class="l">xG oaspeți</div></div>'+
      '<div class="ticket-mini"><div class="v">'+Number(m.xgTotal || 0).toFixed(2)+'</div><div class="l">xG total</div></div>'+
    '</div>';
        // ─── Funfacts + Polymarket block (defensive) ────────────────────────────
    var funfactsBlock = '';
    var polyBlock = '';
    try {
      if(m.funfacts && Array.isArray(m.funfacts) && m.funfacts.length > 0){
        var ffItems = m.funfacts.map(function(f){ return '<div class="funfact-item">💡 '+htmlEsc(String(f||''))+'</div>'; }).join('');
        if(ffItems) funfactsBlock = '<div class="funfacts-block">'+ffItems+'</div>';
      }
      if(m.polymarketSignal && m.polymarketDivergence != null){
        var pdiv2 = Number(m.polymarketDivergence) || 0;
        var psign2 = pdiv2 > 0 ? '+' : '';
        var pdir = pdiv2 > 0 ? 'Polymarket mai optimist' : 'Polymarket mai pesimist';
        var pmk2 = String(m.polymarketMarket || '').replace('_',' ').toUpperCase();
        polyBlock = '<div style="border-left:3px solid #818cf8;padding:8px 10px;margin-top:8px;background:rgba(99,102,241,.07);border-radius:0 8px 8px 0"><span style="color:#818cf8;font-size:10px;font-weight:700">💎 Polymarket Signal</span><div style="font-size:12px;color:var(--c-text);margin-top:4px">'+pdir+': <strong style="color:'+(pdiv2>0?'var(--grn)':'var(--red)')+'">'+psign2+pdiv2.toFixed(1)+'pp</strong>'+(pmk2?' ('+pmk2+')':'')+' față de bookmakers</div></div>';
      }
    } catch(e) { funfactsBlock = ''; polyBlock = ''; }

    // Analiză internă (fără API) — din date enrichment existente
    var internalAnalysisBlock = '';
    if(b) {
      var _iv = getBetVerdict(m, b);
      if(_iv) {
        var _iState = _iv.state;
        var _iLabel = _iState === 'bet' ? '✅ Jucabil' : (_iState === 'watch' ? '⚠️ Cu atenție' : '⚠️ Prezintă risc');
        var _iColor = _iState === 'bet' ? '#22c55e' : (_iState === 'watch' ? '#f59e0b' : '#f97316');
        var _iReason = _iv.sub || '';
        var _iEdge = b.edgePct != null ? ((Number(b.edgePct) >= 0 ? '+' : '') + Number(b.edgePct).toFixed(1) + 'pp edge') : '';
        var _iProb = b.adjProb != null ? (Number(b.adjProb).toFixed(0) + '% prob') : '';
        var _iVal = b.value != null && Number(b.value) !== 0 ? ((Number(b.value) >= 0 ? '+' : '') + (Number(b.value) * 100).toFixed(1) + '% value') : '';
        var _iStats = [_iEdge, _iProb, _iVal].filter(Boolean).join(' • ');
        internalAnalysisBlock = '<div class="ai-preview-block">'
          + '<div class="ai-preview-label">🤖 Analiză internă</div>'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
          + '<span style="font-size:13px;font-weight:900;color:' + _iColor + '">' + _iLabel + '</span>'
          + (_iReason ? '<span style="font-size:11px;font-weight:600;color:' + _iColor + ';background:' + _iColor + '1A;padding:2px 8px;border-radius:20px">' + htmlEsc(_iReason) + '</span>' : '')
          + '</div>'
          + (_iStats ? '<div style="font-size:12px;color:var(--c-text-muted)">' + _iStats + '</div>' : '')
          + '</div>';
      }
    }

    var detailLowerFrame = (internalAnalysisBlock || altMarketsHtml || compactWhy || ml5ContextBlock || funfactsBlock || polyBlock || lineupBlock) ? '<div class="analysis-detail-lower-frame">'+
      (internalAnalysisBlock ? buildAnalysisSection('Analiză internă', internalAnalysisBlock, 'analysis-detail-preview-section') : '')+
      buildAnalysisSection('Piațe eligibile', altMarketsHtml, 'analysis-detail-alt-section')+
      buildAnalysisSection('', compactWhy, 'analysis-detail-why-section')+
      buildAnalysisSection('', ml5ContextBlock, 'analysis-detail-ml5-section')+
      (funfactsBlock ? buildAnalysisSection('Context pre-meci', funfactsBlock + polyBlock, 'analysis-detail-funfacts-section') : (polyBlock ? buildAnalysisSection('', polyBlock, 'analysis-detail-poly-section') : ''))+
      (lineupBlock ? buildAnalysisSection('', lineupBlock, 'analysis-detail-lineup-section') : '')+
    '</div>' : '';
    var expertInsightFrame = '<div class="analysis-detail-expert-overview-frame">'+
      buildAnalysisSection('Indicatori cheie', analysisMetricCards, 'analysis-detail-metrics-section')+
      buildAnalysisSection('Context rapid', expertQuickContext, 'analysis-detail-quick-section')+
    '</div>';
    var expertSupportFrame = (hybridBlock || reasons) ? '<div class="analysis-detail-expert-support-frame">'+
      (expertModelSummary ? buildAnalysisSection('Probabilități model', expertModelSummary, 'analysis-detail-model-section') : '')+
      (reasons ? buildAnalysisSection('Semnale cheie', '<div class="reason-list">'+reasons+'</div>', 'analysis-detail-reasons-section') : '')+
    '</div>' : '';
    var expertDetails = '<div class="analysis-detail-shell expert">'+
      detailHero+
      buildAnalysisSection('', expertBadgeRow, 'analysis-detail-chips-section')+
      (b ? buildAnalysisSection('', getVerdictBlock(m,b), 'analysis-detail-verdict-section') : '')+
      expertInsightFrame+
      expertSupportFrame+
      detailLowerFrame+
    '</div>';

    // SIMPLU: fara grila metrica tehnica, fara badges — doar esentialul
    var simpleOverviewFrame = '<div class="analysis-detail-overview-frame">'+
      buildAnalysisSection('', simpleBadgeRow, 'analysis-detail-chips-section')+
      buildAnalysisSection('Rezumat rapid', simpleSummary + simpleMetrics, 'analysis-detail-summary-section')+
    '</div>';
    var simpleLowerFrame = (internalAnalysisBlock || altMarketsHtml || compactWhy || ml5ContextBlock || funfactsBlock || polyBlock || lineupBlock) ? '<div class="analysis-detail-lower-frame">'+
      (internalAnalysisBlock ? buildAnalysisSection('Analiză internă', internalAnalysisBlock, 'analysis-detail-preview-section') : '')+
      buildAnalysisSection('Piațe eligibile', altMarketsHtml, 'analysis-detail-alt-section')+
      buildAnalysisSection('', compactWhy, 'analysis-detail-why-section')+
      buildAnalysisSection('', ml5ContextBlock, 'analysis-detail-ml5-section')+
      (funfactsBlock ? buildAnalysisSection('Context pre-meci', funfactsBlock + polyBlock, 'analysis-detail-funfacts-section') : (polyBlock ? buildAnalysisSection('', polyBlock, 'analysis-detail-poly-section') : ''))+
      (lineupBlock ? buildAnalysisSection('', lineupBlock, 'analysis-detail-lineup-section') : '')+
    '</div>' : '';
    var simpleDetails = '<div class="analysis-detail-shell simple">'+
      detailHero+
      simpleOverviewFrame+
      (b ? buildAnalysisSection('', getVerdictBlock(m,b), 'analysis-detail-verdict-section') : '')+
      simpleLowerFrame+
    '</div>';
    var detailBlock = MATCH_CARD_MODE === 'expert' ? expertDetails : simpleDetails;
    var key = getMatchCardKey(m);
    var homeProb = Math.max(0, Number(m.probHome || 0));
    var drawProb = Math.max(0, Number(m.probDraw || 0));
    var awayProb = Math.max(0, Number(m.probAway || 0));
    var totalMl = homeProb + drawProb + awayProb;
    if(totalMl > 0){
      homeProb = (homeProb * 100 / totalMl);
      drawProb = (drawProb * 100 / totalMl);
      awayProb = (awayProb * 100 / totalMl);
    }
    var fairOdds = b && Number(b.adjProb || 0) > 0 ? (100 / Number(b.adjProb || 0)).toFixed(2) : '—';
    var analysisMetricCards = b ? ('<div class="analysis-metric-grid">'+
      '<div class="analysis-metric prob"><div class="analysis-metric-k">Probabilitate</div><div class="analysis-metric-v">'+fmtPct(Number(b.adjProb || 0))+'</div><div class="analysis-metric-sub">estimarea finală folosită</div></div>'+
      '<div class="analysis-metric edge"><div class="analysis-metric-k">Edge</div><div class="analysis-metric-v">'+(Number(b.edgePct || 0) >= 0 ? '+' : '')+Number(b.edgePct || 0).toFixed(1)+'pp</div><div class="analysis-metric-sub">diferență față de piață</div></div>'+
      '<div class="analysis-metric value"><div class="analysis-metric-k">Value</div><div class="analysis-metric-v">'+(Number(b.value || 0) >= 0 ? '+' : '')+(Number(b.value || 0) * 100).toFixed(1)+'%</div><div class="analysis-metric-sub">valoare estimată</div></div>'+
      '<div class="analysis-metric warn"><div class="analysis-metric-k">Fair odds</div><div class="analysis-metric-v">'+fairOdds+'</div><div class="analysis-metric-sub">cota teoretică</div></div>'+
      '<div class="analysis-metric"><div class="analysis-metric-k">Confidence</div><div class="analysis-metric-v">'+Number(m.confidence || 0).toFixed(0)+'%</div><div class="analysis-metric-sub">încredere model</div></div>'+
      '<div class="analysis-metric"><div class="analysis-metric-k">xG total</div><div class="analysis-metric-v">'+Number(m.xgTotal || 0).toFixed(2)+'</div><div class="analysis-metric-sub">context ofensiv estimat</div></div>'+
      '<div class="analysis-metric"><div class="analysis-metric-k">Kelly %</div><div class="analysis-metric-v" style="color:'+(Number(b.kellyPct||0)>0?'var(--grn)':'var(--muted)')+'">'+Number(b.kellyPct||0).toFixed(1)+'%</div><div class="analysis-metric-sub">fracție recomandată</div></div>'+
      (m.riskTier ? '<div class="analysis-metric '+(m.riskTier==="Safe"?'prob':m.riskTier==="Value"?'value':m.riskTier==="Balanced"?'edge':'warn')+'"><div class="analysis-metric-k">Risk Tier</div><div class="analysis-metric-v">'+m.riskTier+'</div><div class="analysis-metric-sub">clasificare risc</div></div>' : '')+
      (bestMarketLine ? '<div class="analysis-metric value"><div class="analysis-metric-k">Best market</div><div class="analysis-metric-v">'+Number(b.odds || 0).toFixed(2)+'</div><div class="analysis-metric-sub">'+bestMarketLine+'</div></div>' : '')+
      (m.xgdDiff != null ? '<div class="analysis-metric '+(m.xgdDiff >= 0.2 ? 'prob' : m.xgdDiff <= -0.2 ? 'warn' : 'edge')+'"><div class="analysis-metric-k">xGd diff</div><div class="analysis-metric-v">'+(m.xgdDiff >= 0 ? '+' : '')+m.xgdDiff.toFixed(2)+'</div><div class="analysis-metric-sub">'+(m.xgdDiff >= 0.2 ? 'gazdă mai puternică' : m.xgdDiff <= -0.2 ? 'oaspeți mai puternici' : 'echilibrat')+'</div></div>' : '')+
      (m.homeMgrO25 != null ? '<div class="analysis-metric '+(m.homeMgrO25 >= 60 ? 'prob' : 'edge')+'"><div class="analysis-metric-k">Antrenor gazdă O2.5</div><div class="analysis-metric-v">'+m.homeMgrO25.toFixed(0)+'%</div><div class="analysis-metric-sub">% meciuri over 2.5</div></div>' : '')+
      (m.awayMgrO25 != null ? '<div class="analysis-metric '+(m.awayMgrO25 >= 60 ? 'prob' : 'edge')+'"><div class="analysis-metric-k">Antrenor oaspeți O2.5</div><div class="analysis-metric-v">'+m.awayMgrO25.toFixed(0)+'%</div><div class="analysis-metric-sub">% meciuri over 2.5</div></div>' : '')+
      (m.homeMgrBtts != null || m.awayMgrBtts != null ? '<div class="analysis-metric '+(( (m.homeMgrBtts||0) >= 55 && (m.awayMgrBtts||0) >= 55 ) ? 'prob' : 'edge')+'"><div class="analysis-metric-k">BTTS antrenori</div><div class="analysis-metric-v">'+(m.homeMgrBtts != null ? m.homeMgrBtts.toFixed(0)+'%' : '—')+' / '+(m.awayMgrBtts != null ? m.awayMgrBtts.toFixed(0)+'%' : '—')+'</div><div class="analysis-metric-sub">% BTTS gazdă / oaspeți</div></div>' : '')+
      (m.xgdDiff != null ? '<div class="analysis-metric '+(m.xgdDiff >= 0.2 ? 'prob' : m.xgdDiff <= -0.2 ? 'warn' : 'edge')+'"><div class="analysis-metric-k">xGd diff</div><div class="analysis-metric-v">'+(m.xgdDiff >= 0 ? '+' : '')+m.xgdDiff.toFixed(2)+'</div><div class="analysis-metric-sub">'+(m.xgdDiff >= 0.2 ? 'gazdă mai puternică' : m.xgdDiff <= -0.2 ? 'oaspeți mai puternici' : 'echilibrat')+'</div></div>' : '')+
      (m.homeMgrO25 != null ? '<div class="analysis-metric '+(m.homeMgrO25 >= 60 ? 'prob' : 'edge')+'"><div class="analysis-metric-k">Antrenor gazdă O2.5</div><div class="analysis-metric-v">'+m.homeMgrO25.toFixed(0)+'%</div><div class="analysis-metric-sub">% meciuri over 2.5</div></div>' : '')+
      (m.awayMgrO25 != null ? '<div class="analysis-metric '+(m.awayMgrO25 >= 60 ? 'prob' : 'edge')+'"><div class="analysis-metric-k">Antrenor oaspeți O2.5</div><div class="analysis-metric-v">'+m.awayMgrO25.toFixed(0)+'%</div><div class="analysis-metric-sub">% meciuri over 2.5</div></div>' : '')+
      (m.homeMgrBtts != null || m.awayMgrBtts != null ? '<div class="analysis-metric '+(( (m.homeMgrBtts||0) >= 55 && (m.awayMgrBtts||0) >= 55 ) ? 'prob' : 'edge')+'"><div class="analysis-metric-k">BTTS antrenori</div><div class="analysis-metric-v">'+(m.homeMgrBtts != null ? m.homeMgrBtts.toFixed(0)+'%' : '—')+' / '+(m.awayMgrBtts != null ? m.awayMgrBtts.toFixed(0)+'%' : '—')+'</div><div class="analysis-metric-sub">% BTTS gazdă / oaspeți</div></div>' : '')+
    '</div><div class="analysis-help-row"><button class="help-chip" onclick="showInlineHelp(\'matches-help-output\',\'edge\')">Edge</button><button class="help-chip" onclick="showInlineHelp(\'matches-help-output\',\'value\')">Value</button><button class="help-chip" onclick="showInlineHelp(\'matches-help-output\',\'fair_odds\')">Fair odds</button></div>') : '';
    var kickoffLabel = getMatchKickoffLabel(m);
    var countdown = getMatchKickoffCountdown(m);
    var kickoffParts = getMatchKickoffParts(m);
    var kickoffDateLabel = kickoffParts.dateLabel || kickoffLabel;
    var kickoffTimeLabel = kickoffParts.timeLabel || '—';
    var trend = Number(m.smartScore || 0) >= 88 ? '↑↑' : (Number(m.smartScore || 0) >= 75 ? '↑' : '→');
    var valueDetected = b && Number(b.value || 0) > 0.02;
    var shortWhy = ((m.why && String(m.why).trim()) ? String(m.why).trim() : buildRecommendationReasons(m, b || {}).slice(0,2).join(' • '));
    var infoLine = 'Scor probabil ' + (m.mostLikelyScore || '—') + ' • xG ' + Number(m.xgTotal || 0).toFixed(2) + ' • ' + (shortWhy || 'context statistic activ');
    var m17AdjProb = b ? Number(b.adjProb || 0) : 0;
    var m17Edge = b && b.edgePct != null ? Number(b.edgePct || 0) : null;
    var m17Value = b && b.value != null ? Number(b.value || 0) * 100 : null;
    var m17Kelly = b ? Number(b.kellyPct || 0) : 0;
    var m17RiskLabel = m.riskTier || (verdictClass === 'safe' ? 'Safe' : (verdictClass === 'moderate' ? 'Balanced' : 'Atenție'));
    var m17RiskClass = (String(m17RiskLabel).toLowerCase().indexOf('safe') >= 0 || verdictClass === 'safe') ? 'safe' : ((String(m17RiskLabel).toLowerCase().indexOf('value') >= 0 || verdictClass === 'moderate') ? 'value' : (verdictClass === 'avoid' ? 'avoid' : 'balanced'));
    var m17EdgeClass = m17Edge == null ? 'neutral' : (m17Edge >= 4 ? 'good' : (m17Edge >= 0 ? 'watch' : 'bad'));
    var m17ValueClass = m17Value == null ? 'neutral' : (m17Value >= 5 ? 'good' : (m17Value >= 0 ? 'watch' : 'bad'));
    var m17ProbClass = m17AdjProb >= 75 ? 'good' : (m17AdjProb >= 62 ? 'watch' : 'neutral');
    var m17MarketClass = b && b.consensusFlag ? String(b.consensusFlag || '').toLowerCase().replace(/[^a-z0-9_-]/g,'-') : 'no-data';
    var m17ConsensusText = '';
    if(b && b.consensusFlag){
      var m17ConsensusMap = {
        OK:'Consens OK', WEAK_CONSENSUS:'Edge slab', LOW_BOOKS:'Puțini bk',
        ISOLATED_ODDS:'Cotă izolată', AGAINST_MARKET:'Contra pieței', NO_DATA:'Fără piață'
      };
      m17ConsensusText = m17ConsensusMap[b.consensusFlag] || String(b.consensusFlag || 'Piață');
    }
    var m17CalibPill = '';
    if(m.bestBet && m.bestBet.league_calib_tier && m.bestBet.league_calib_tier !== 'neutral'){
      var calib = m.bestBet.league_calib_tier;
      var calibTxt = calib === 'high' ? 'Liga relaxată' : (calib === 'very_strict' ? 'Liga foarte strictă' : (calib === 'strict' ? 'Liga strictă' : 'Liga ajustată'));
      m17CalibPill = '<span class="m17-pill m17-calib">'+htmlEsc(calibTxt)+'</span>';
    }
    var m17ScorePill = m.mostLikelyScore ? '<span class="m17-pill">⚽ '+htmlEsc(m.mostLikelyScore)+'</span>' : '';
    var m17ConsensusPill = m17ConsensusText ? '<span class="m17-pill m17-consensus '+m17MarketClass+'">'+htmlEsc(m17ConsensusText)+'</span>' : '';
    var m17V2Pill = m.v2Recommended ? '<span class="m17-pill" style="background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.35);font-weight:700">⚡ V2</span>' : '';
    // Context v2: derby, vreme, deplasare
    var m17ContextPills = '';
    if(m.isDerby) m17ContextPills += '<span class="m17-pill" style="color:#f59e0b;border-color:rgba(245,158,11,.3)">Derby</span>';
    if(m.weatherCode===3) m17ContextPills += '<span class="m17-pill" style="color:#60a5fa;border-color:rgba(96,165,250,.3)">Ploaie</span>';
    if(m.weatherCode===4) m17ContextPills += '<span class="m17-pill" style="color:#93c5fd;border-color:rgba(147,197,253,.3)">Ninsoare</span>';
    if(m.travelDistKm>2000) m17ContextPills += '<span class="m17-pill" style="color:#a78bfa;border-color:rgba(167,139,250,.3)">'+Math.round(m.travelDistKm/100)/10+'k km</span>';
    if(m.pitchCondition>=2) m17ContextPills += '<span class="m17-pill" style="color:#6b7280;border-color:rgba(107,114,128,.3)">Teren</span>';
    var _cardVerdict = b ? getBetVerdict(m, b) : null;
    var m17VerdictPill = _cardVerdict ? '<span class="m17-pill" style="background:'+_cardVerdict.bg+';color:'+_cardVerdict.color+';border:1px solid '+_cardVerdict.border+';font-weight:800;font-size:10px">'+_cardVerdict.label+'</span>' : '';
    // Verdict PARIAZA/RISC/EVITA vizibil pe card (elimina contradictia cu detaliile)
    var m17Metrics = b ? ('<div class="m17-metric-strip">'+
      '<div class="m17-metric '+m17ProbClass+'"><span>Prob.</span><strong>'+fmtPct(m17AdjProb)+'</strong></div>'+
      '<div class="m17-metric '+m17EdgeClass+'"><span>Edge</span><strong>'+(m17Edge == null ? '—' : ((m17Edge >= 0 ? '+' : '')+m17Edge.toFixed(1)+'pp'))+'</strong></div>'+
      '<div class="m17-metric '+m17ValueClass+'"><span>Value</span><strong>'+(m17Value == null ? '—' : ((m17Value >= 0 ? '+' : '')+m17Value.toFixed(1)+'%'))+'</strong></div>'+
      '<div class="m17-metric neutral"><span>Fair</span><strong>'+fairOdds+'</strong></div>'+
    '</div>') : '<div class="m17-empty-reco">Nu există recomandare activă pentru filtrele curente.</div>';
    var m17KellyPill = b && m17Kelly > 0 ? '<span class="m17-pill m17-kelly">Kelly '+m17Kelly.toFixed(1)+'%</span>' : '';
    var m17WhyText = shortWhy || 'Context statistic activ';
    var m17MarketLine = bestMarketLine ? '<div class="m17-market-line">'+htmlEsc(bestMarketLine)+'</div>' : '';

    function m17InfoRow(label, cls, body){
      return body ? '<div class="m17-info-row '+cls+'"><span class="m17-info-label">'+label+'</span><div class="m17-info-chips">'+body+'</div></div>' : '';
    }
    var m17RiskPill = b ? '<span class="m17-pill m17-risk '+m17RiskClass+'">'+htmlEsc(m17RiskLabel)+'</span>' : '';
    var m17DecisionPills = b ? (m17RiskPill + m17VerdictPill + m17ConsensusPill) : '';
    var m17MarketPills = b ? (m17KellyPill + sourceBadge + oddsSourceBadge + compareBadge + m17MarketLine) : '';
    var m17EnginePills = b ? (motorBadge + catboostBadge + ml5Badge + refBadge + lineupBadge + polyBadge + ageBadge + m17ContextPills + m17V2Pill) : '';
    var m17GroupedRows = b ? (
      '<div class="m17-info-board">' +
        m17InfoRow('Decizie', 'm17-info-decision', m17DecisionPills) +
        m17InfoRow('Piață', 'm17-info-market', m17MarketPills) +
        m17InfoRow('Motor', 'm17-info-engine', m17EnginePills) +
      '</div>'
    ) : '';
    var m17IndexBadge = displayIndex ? ('<span class="m17-index-badge" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;padding:0 8px;border-radius:999px;background:linear-gradient(135deg,rgba(94,234,212,.18),rgba(15,23,42,.58));border:1px solid rgba(94,234,212,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 6px 18px rgba(34,211,238,.10);color:#d9fffa;font-size:12px;font-weight:900;letter-spacing:.02em;line-height:1;font-variant-numeric:tabular-nums;flex:0 0 auto;">#'+displayIndex+'</span>') : '';

    return '<div id="match-card-'+key+'" class="match-card match-card-v16 match-card-m17 '+verdictClass+' '+m17RiskClass+(MATCH_FOCUS_KEY === key ? ' match-card-focus' : '')+'">'+
      '<div class="card-gold-sweep" aria-hidden="true"></div>'+
      '<div class="m17-topline">'+
        '<div class="m17-top-left">'+
          '<div class="m17-league">'+leagueLogoWrap+'<span>'+htmlEsc(m.league || '—')+'</span></div>'+
          '<div class="m17-country-top">🌍 '+htmlEsc(m.country || '—')+'</div>'+
        '</div>'+
        '<div class="m17-time"><span class="m17-date">'+htmlEsc(kickoffDateLabel)+'</span><strong class="m17-hour">'+htmlEsc(kickoffTimeLabel)+'</strong><b class="m17-countdown">'+htmlEsc(countdown)+'</b></div>'+
      '</div>'+
      '<div class="m17-meta-row m17-meta-row-compact">'+
        m17IndexBadge+
        m17ScorePill+m17CalibPill+m17ContextPills+
      '</div>'+
      '<div class="m17-teams">'+
        '<div class="m17-team home">'+hLogoWrap+'<div class="m17-team-copy"><div class="m17-team-name">'+htmlEsc(m.home || '—')+'</div><div class="m17-team-prob">'+homeProb.toFixed(0)+'%</div></div></div>'+
        '<div class="m17-vs">VS</div>'+
        '<div class="m17-team away">'+aLogoWrap+'<div class="m17-team-copy"><div class="m17-team-name">'+htmlEsc(m.away || '—')+'</div><div class="m17-team-prob">'+awayProb.toFixed(0)+'%</div></div></div>'+ 
        '<div class="m17-ml-bar" aria-label="Probabilități 1X2"><span class="home" style="width:'+homeProb.toFixed(1)+'%"></span><span class="draw" style="width:'+drawProb.toFixed(1)+'%"></span><span class="away" style="width:'+awayProb.toFixed(1)+'%"></span></div>'+
        '<div class="m17-ml-note"><span>1: '+homeProb.toFixed(0)+'%</span><span>X: '+drawProb.toFixed(0)+'%</span><span>2: '+awayProb.toFixed(0)+'%</span></div>'+ 
      '</div>'+ 
      '<div class="m17-reco">'+
        '<div class="m17-reco-head"><div><div class="m17-reco-kicker">🎯 Recomandare</div><div class="m17-pick">'+htmlEsc(recLabel)+'</div></div><div class="m17-odd">'+(recOdd ? '@ '+recOdd : '—')+'</div></div>'+ 
        m17Metrics+
        m17GroupedRows+
      '</div>'+ 
      '<div class="m17-why"><span>De ce</span><strong>'+htmlEsc(m17WhyText)+'</strong></div>'+ 
      '<div class="m17-actions">'+
        '<button class="m17-btn" onclick="toggleMatchAnalysisDetails(&quot;'+key+'&quot;)">Detalii analiză</button>'+ 
      '</div>'+ 
      '<div class="m16-extra m17-extra'+(MATCH_FOCUS_KEY === key ? ' open' : '')+'" id="match-extra-'+key+'">'+detailBlock+(reasons ? '<div class="reason-list">'+reasons+'</div>' : '')+'</div>'+ 
    '</div>';
  }

  // ── Paginare progresivă ────────────────────────────────────
  MATCHES_FILTERED_CACHE = filtered;
  MATCHES_RENDERED_COUNT = 0;

  // Deconectează observerul anterior dacă există
  if(MATCHES_SCROLL_OBSERVER){ try{ MATCHES_SCROLL_OBSERVER.disconnect(); }catch(e){} MATCHES_SCROLL_OBSERVER = null; }

  function buildBatchHtml(startIdx, count){
    var slice = MATCHES_FILTERED_CACHE.slice(startIdx, startIdx + count);

    // Pas 1: pre-asignăm un număr sentinel (99000+idx) ca să fie truthy în renderCard
    // Astfel m17IndexBadge se generează, și îl vom înlocui cu numărul real după
    var SENTINEL_BASE = 99000;
    slice.forEach(function(m, idx){ if(m && typeof m === 'object') m._renderNumber = SENTINEL_BASE + idx; });

    // Pas 2: randăm cu sentinel — dacă aruncă, card-ul e gol și nu consumă număr
    var htmlArr = slice.map(function(m, idx){
      if(!m || typeof m !== 'object') return '';
      try { return renderCard(m, SENTINEL_BASE + idx) || ''; }
      catch(e){ console.error('[VEYRA] renderCard err:', m && m.home, '-', m && m.away, '|', e && e.message); return ''; }
    });

    // Pas 3: numerotare reală — incrementăm DOAR pentru carduri randate cu succes
    var globalNum = startIdx;
    htmlArr = htmlArr.map(function(html, idx){
      if(!html) return '';
      globalNum++;
      var sentinel = SENTINEL_BASE + idx;
      // Înlocuim sentinel-ul cu numărul real în badge
      var replaced = html.split('#' + sentinel).join('#' + globalNum);
      if(slice[idx] && typeof slice[idx] === 'object') slice[idx]._renderNumber = globalNum;
      return replaced;
    });

    if(sort === 'date'){
      var html = '';
      var groups = {};
      var groupOrder = [];
      slice.forEach(function(m, i){
        if(!m || !htmlArr[i]) return;
        var dk = m.dateLabel || 'unknown';
        if(!groups[dk]){ groups[dk] = []; groupOrder.push(dk); }
        groups[dk].push(htmlArr[i]);
      });
      groupOrder.forEach(function(date){
        var existingGroup = container.querySelector('[data-date-group="' + date + '"]');
        if(existingGroup && startIdx > 0){
          existingGroup.querySelector('.matches-grid').innerHTML += groups[date].join('');
        } else {
          var _dp = (date+'').match(/^(\w+)\s+(\d+)\s+(\w+)$/);
          var _weekdayMap = { LUN:'LUNI', MAR:'MARTI', MIE:'MIERCURI', JOI:'JOI', VIN:'VINERI', SAM:'SAMBATA', DUM:'DUMINICA' };
          var _weekdayShort = _dp ? ((_dp[1]||'').toUpperCase()) : '';
          var _weekdayFull = _weekdayMap[_weekdayShort] || _weekdayShort;
          var _monthFull = _dp ? ((_dp[3]||'').toUpperCase()) : '';
          var _dlHtml = _dp
            ? '<span class="dl-badge"><b>'+_monthFull+'</b><em>'+_dp[2]+'</em></span><span class="dl-weekday">'+_weekdayFull+' '+_dp[2]+' '+_monthFull+'</span>'
            : '<span class="dl-weekday">'+date+'</span>';
          html += '<div class="date-group" data-date-group="' + date + '"><div class="date-label">'+_dlHtml+'</div><div class="matches-grid">' + groups[date].join('') + '</div></div>';
        }
      });
      return html;
    }
    return htmlArr.join('');
  }

  // Render primul batch.
  // Guard anti-flicker: runtime-urile pot chema renderMatches() de mai multe ori cu aceleași date.
  // Dacă semnătura vizibilă este identică, nu rescriem DOM-ul; astfel nu repornim animațiile
  // cardurilor și nu resetăm poziția/observerul de scroll.
  var firstBatch = buildBatchHtml(0, MATCHES_PAGE_SIZE);
  var firstVisibleSig = MATCHES_FILTERED_CACHE.slice(0, MATCHES_PAGE_SIZE).map(function(m){
    var bb = m && (m.bestBet || m.rawBestBet || {});
    return [
      getMatchCardKey(m),
      m && (m.analysisState || ''),
      m && (m.riskTier || ''),
      m && (m.verdict || ''),
      bb && (bb.type || bb.label || ''),
      bb && Number(bb.odds || 0),
      bb && Number(bb.adjProb || bb.prob || 0),
      bb && Number(bb.edgePct || 0),
      bb && Number(bb.value || 0),
      m && Number(m.smartScore || 0)
    ].join('~');
  }).join('|');
  var renderSig = [
    sort, CURRENT_FILTER, MATCH_CARD_MODE, MATCH_FOCUS_KEY || '', leagueF || '', dateF || '', marketF || '', verdictF || '', proMode || '',
    minProb, minEdge, kickoffF || '', tierF || '', minScore, MATCHES_FILTERED_CACHE.length, firstVisibleSig
  ].join('::');
  if(container.getAttribute('data-ba-render-sig') === renderSig && container.querySelector('.match-card')){
    try{
      var _ec=container.querySelectorAll('.match-card').length;
      if(_ec>0 && _ec!==filtered.length){
        var _ecf=$('filter-count');
        if(_ecf){ var _ecl=CURRENT_FILTER==='motor_validated'?' validate':CURRENT_FILTER==='bet_ok'?' OK':' meciuri'; _ecf.textContent=_ec+_ecl; }
      }
      // Actualizăm și variabila globală citită de veyra_system_status.js → previne resetul la filtered.length
      if(_ec>0) window.__VEYRA_MECIURI_DISPLAYED_COUNT = _ec;
    }catch(_){}
    renderTicketQuickPeek();
    if(typeof renderDashboardMonitor === 'function') renderDashboardMonitor();
    return;
  }
  container.setAttribute('data-ba-render-sig', renderSig);
  if(sort === 'date'){
    container.innerHTML = firstBatch;
  } else {
    container.innerHTML = '<div class="matches-grid" id="matches-grid-inner">' + firstBatch + '</div>';
  }
  MATCHES_RENDERED_COUNT = Math.min(MATCHES_PAGE_SIZE, MATCHES_FILTERED_CACHE.length);

  // FIX: actualizăm contorul cu numărul REAL de carduri randate
  // (unele pot eșua silențios → count afișat = count vizibil)
  try {
    var _realCount = container.querySelectorAll('.match-card').length;
    if(_realCount > 0 && _realCount !== filtered.length){
      var _fc = $('filter-count');
      if(_fc){
        var _label = CURRENT_FILTER === 'motor_validated' ? ' validate' : CURRENT_FILTER === 'bet_ok' ? ' OK' : ' meciuri';
        _fc.textContent = _realCount + _label;
        _fc.title = _realCount + ' meciuri afișate (' + filtered.length + ' în total, ' + (filtered.length - _realCount) + ' cu eroare de randare)';
      }
    }
    // Sursa canonică pentru Dashboard Status — mereu reflectă ce vede userul în Meciuri
    if(_realCount > 0) window.__VEYRA_MECIURI_DISPLAYED_COUNT = _realCount;
  } catch(_e){}

  // Funcție pentru a adăuga batch-ul următor
  function appendNextBatch(){
    if(MATCHES_RENDERED_COUNT >= MATCHES_FILTERED_CACHE.length) return;
    var nextBatch = MATCHES_FILTERED_CACHE.slice(MATCHES_RENDERED_COUNT, MATCHES_RENDERED_COUNT + MATCHES_PAGE_SIZE);
    MATCHES_RENDERED_COUNT += nextBatch.length;

    if(sort === 'date'){
      var extra = buildBatchHtml(MATCHES_RENDERED_COUNT - nextBatch.length, nextBatch.length);
      if(extra){ var tmp = document.createElement('div'); tmp.innerHTML = extra; while(tmp.firstChild) container.appendChild(tmp.firstChild); }
    } else {
      var grid = container.querySelector('#matches-grid-inner');
      if(grid){ grid.innerHTML += nextBatch.map(function(m){ return renderCard(m, m && m._renderNumber); }).join(''); }
    }

    // Actualizează sau elimină sentinela
    var oldSentinel = container.querySelector('.matches-load-sentinel');
    if(oldSentinel) oldSentinel.remove();
    if(MATCHES_RENDERED_COUNT < MATCHES_FILTERED_CACHE.length) attachSentinel();
  }

  // Sentinelă IntersectionObserver pentru scroll infinit
  function attachSentinel(){
    var sentinel = document.createElement('div');
    sentinel.className = 'matches-load-sentinel';
    sentinel.style.cssText = 'height:1px;margin-top:20px';
    container.appendChild(sentinel);

    if(typeof IntersectionObserver !== 'undefined'){
      MATCHES_SCROLL_OBSERVER = new IntersectionObserver(function(entries){
        if(entries[0].isIntersecting){
          MATCHES_SCROLL_OBSERVER.disconnect();
          MATCHES_SCROLL_OBSERVER = null;
          appendNextBatch();
        }
      }, { rootMargin: '200px' });
      MATCHES_SCROLL_OBSERVER.observe(sentinel);
    } else {
      // Fallback fără IntersectionObserver
      sentinel.innerHTML = '<button class="btn btn-primary" style="width:100%;margin:12px 0;font-size:12px" onclick="appendNextBatch()">Încarcă mai multe (' + (MATCHES_FILTERED_CACHE.length - MATCHES_RENDERED_COUNT) + ' rămase)</button>';
      window.appendNextBatch = appendNextBatch;
    }
  }

  if(MATCHES_RENDERED_COUNT < MATCHES_FILTERED_CACHE.length) attachSentinel();
  // ── End paginare ───────────────────────────────────────────

  if(MATCH_FOCUS_KEY){
    setTimeout(function(){
      var node = $('match-card-' + MATCH_FOCUS_KEY);
      if(node && typeof node.scrollIntoView === 'function') node.scrollIntoView({behavior:'smooth', block:'center'});
    }, 60);
  }
  renderTicketQuickPeek();
  if(typeof renderDashboardMonitor === 'function') renderDashboardMonitor();
}

function parseLikelyScore(score){
  if(!score || typeof score !== 'string' || score.indexOf('-') === -1) return null;
  var p = score.split('-').map(function(x){ return parseInt(x, 10); });
  if(p.length !== 2 || isNaN(p[0]) || isNaN(p[1])) return null;
  return {
    home: p[0],
    away: p[1],
    total: p[0] + p[1],
    btts: p[0] > 0 && p[1] > 0
  };
}

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function uniqueReasons(arr){
  var out = [];
  (arr || []).forEach(function(x){
    if(x && out.indexOf(x) === -1) out.push(x);
  });
  return out;
}

function computeConservativeCombinedProb(picks){
  if(!picks || !picks.length) return 0;

  var base = 1;
  var leagues = {};
  var markets = {};

  picks.forEach(function(p){
    var prob = ((p.bestBet && p.bestBet.adjProb) ? p.bestBet.adjProb : 0) / 100;
    base *= prob;
    leagues[p.league] = (leagues[p.league] || 0) + 1;
    markets[p.bestBet.type] = (markets[p.bestBet.type] || 0) + 1;
  });

  var penalty = 1;
  penalty *= Math.pow(0.97, Math.max(0, picks.length - 1));

  Object.keys(leagues).forEach(function(lg){
    if(leagues[lg] > 1) penalty *= Math.pow(0.93, leagues[lg] - 1);
  });

  Object.keys(markets).forEach(function(mt){
    if(markets[mt] > 2) penalty *= Math.pow(0.95, markets[mt] - 2);
  });

  return +(base * penalty * 100).toFixed(1);
}

function marketFitAnalysis(m, type){
  var score = 0;
  var reasons = [];
  var ls = parseLikelyScore(m.mostLikelyScore);
  var xgHome = Number(m.xgHome || 0);
  var xgAway = Number(m.xgAway || 0);
  var xgTotal = Number(m.xgTotal || 0);
  var xgGap = Math.abs(xgHome - xgAway);

  if(type === 'over15'){
    if(m.probOver15 >= 82){ score += 10; reasons.push('Peste 1.5 foarte puternic'); }
    if(xgTotal >= 2.35){ score += 10; reasons.push('xG total bun'); }
    if(ls && ls.total >= 2){ score += 6; reasons.push('scor probabil ≥ 2 goluri'); }
    if(ls && ls.total < 2){ score -= 14; }
    if(m.mlFlags && m.mlFlags.o15){ score += 4; reasons.push('ML recomandă O1.5'); }
  }

  if(type === 'over25'){
    if(m.probOver25 >= 66){ score += 14; reasons.push('Peste 2.5 puternic'); }
    if(xgTotal >= 2.75){ score += 12; reasons.push('xG total ridicat'); }
    if(ls && ls.total >= 3){ score += 12; reasons.push('scor probabil ≥ 3 goluri'); }
    if(ls && ls.total < 3){ score -= 14; }
    if(m.mlFlags && m.mlFlags.o25){ score += 10; reasons.push('ML recomandă O2.5'); }
  }

  if(type === 'under25'){
    if(m.probUnder25 >= 56){ score += 13; reasons.push('Under 2.5 are suport'); }
    if(xgTotal <= 2.55){ score += 12; reasons.push('xG total temperat'); }
    if(ls && ls.total <= 2){ score += 12; reasons.push('scor probabil ≤ 2 goluri'); }
    if(ls && ls.total > 2){ score -= 14; }
  }

  if(type === 'under35'){
    if(m.probUnder35 >= 68){ score += 13; reasons.push('Under 3.5 solid'); }
    if(xgTotal <= 3.05){ score += 10; reasons.push('xG total controlat'); }
    if(ls && ls.total <= 3){ score += 12; reasons.push('scor probabil ≤ 3 goluri'); }
    if(ls && ls.total > 3){ score -= 16; }
  }

  if(type === 'btts'){
    if(m.probBtts >= 62){ score += 12; reasons.push('BTTS solid'); }
    if(xgHome >= 1.00 && xgAway >= 1.00){ score += 12; reasons.push('ambele echipe au xG bun'); }
    if(ls && ls.btts){ score += 10; reasons.push('scorul probabil susține BTTS'); }
    if(ls && !ls.btts){ score -= 16; }
    if(Math.abs(xgHome - xgAway) > 1.00){ score -= 10; reasons.push('dezechilibru ofensiv prea mare pentru BTTS'); }
    if(m.mlFlags && m.mlFlags.btts){ score += 6; reasons.push('ML recomandă BTTS'); }
  }

  if(type === 'homeWin'){
    if(m.predictedResult === 'H'){ score += 12; reasons.push('modelul dă gazdele'); }
    if(m.favorite === 'H'){ score += 10; reasons.push('gazdele sunt favorite'); }
    if(m.mlFlags && (m.mlFlags.winner || m.mlFlags.fav)){ score += 8; }
    if(xgHome - xgAway >= 0.35){ score += 10; reasons.push('avantaj xG gazde'); }
    if(xgGap < 0.20){ score -= 10; }
    if(m.probDraw >= 27){ score -= 12; reasons.push('risc de egal mare'); }
    if(ls && ls.home > ls.away){ score += 10; reasons.push('scor probabil pentru gazde'); }
    if(ls && ls.home <= ls.away){ score -= 12; }
  }

  if(type === 'draw'){
    if(m.probDraw >= 28){ score += 14; reasons.push('probabilitate de egal ridicată'); }
    if(xgGap <= 0.25){ score += 12; reasons.push('echipe echilibrate ca xG'); }
    if(ls && ls.home === ls.away){ score += 14; reasons.push('scor probabil de egal'); }
    if(ls && ls.home !== ls.away){ score -= 14; }
  }

  if(type === 'awayWin'){
    if(m.predictedResult === 'A'){ score += 12; reasons.push('modelul dă oaspeții'); }
    if(m.favorite === 'A'){ score += 10; reasons.push('oaspeții sunt favoriți'); }
    if(m.mlFlags && (m.mlFlags.winner || m.mlFlags.fav)){ score += 8; }
    if(xgAway - xgHome >= 0.35){ score += 10; reasons.push('avantaj xG oaspeți'); }
    if(xgGap < 0.20){ score -= 10; }
    if(m.probDraw >= 27){ score -= 12; reasons.push('risc de egal mare'); }
    if(ls && ls.away > ls.home){ score += 10; reasons.push('scor probabil pentru oaspeți'); }
    if(ls && ls.away <= ls.home){ score -= 12; }
  }

  if(type === 'dc1x'){
    // 1X = home win OR draw (avoid away win)
    if(m.probHome + m.probDraw >= 75){ score += 12; reasons.push('1X probabil'); }
    if(xgHome - xgAway >= 0.20){ score += 8; reasons.push('avantaj xG gazde'); }
    if(m.probAway >= 35){ score -= 12; reasons.push('risc deplasare'); }
    if(ls && ls.home >= ls.away){ score += 10; reasons.push('scor probabil favorabil 1X'); }
    if(ls && ls.away > ls.home){ score -= 14; }
  }

  if(type === 'dcx2'){
    // X2 = draw OR away win (avoid home win)
    if(m.probAway + m.probDraw >= 75){ score += 12; reasons.push('X2 probabil'); }
    if(xgAway - xgHome >= 0.20){ score += 8; reasons.push('avantaj xG oaspeți'); }
    if(m.probHome >= 35){ score -= 12; reasons.push('risc gazdele'); }
    if(ls && ls.away >= ls.home){ score += 10; reasons.push('scor probabil favorabil X2'); }
    if(ls && ls.home > ls.away){ score -= 14; }
  }

  if(type === 'dc12'){
    // 12 = home win OR away win (avoid draw)
    if(m.probHome + m.probAway >= 70){ score += 12; reasons.push('12 probabil'); }
    if(xgGap >= 0.30){ score += 8; reasons.push('dezechilibru xG (elimină egal)'); }
    if(m.probDraw >= 30){ score -= 14; reasons.push('risc egal mare'); }
    if(ls && ls.home !== ls.away){ score += 10; reasons.push('scor probabil ≠ egal'); }
    if(ls && ls.home === ls.away){ score -= 16; }
  }

  return { score: score, reasons: uniqueReasons(reasons) };
}

function isHardContradiction(m, type){
  var ls = parseLikelyScore(m.mostLikelyScore);
  if(!ls) return false;
  if(type === 'over15' && ls.total < 2) return true;
  if(type === 'under15' && ls.total >= 2) return true;
  if(type === 'over25' && ls.total < 3) return true;
  if(type === 'under25' && ls.total >= 3) return true;
    if(type === 'under35' && ls.total >= 4) return true;
  if(type === 'btts' && !ls.btts) return true;
  if(type === 'homeWin' && ls.home <= ls.away) return true;
  if(type === 'draw' && ls.home !== ls.away) return true;
  if(type === 'awayWin' && ls.away <= ls.home) return true;
  // Double Chance: contradicted only when likely_score is the OPPOSITE outcome
  // 1X (home or draw) contradicted by away win
  if(type === 'dc1x' && ls.away > ls.home) return true;
  // X2 (draw or away) contradicted by home win
  if(type === 'dcx2' && ls.home > ls.away) return true;
  // 12 (home or away) contradicted by draw
  if(type === 'dc12' && ls.home === ls.away) return true;
  return false;
}

function buildMarketCandidate(m, type){
  var b = getBetByType(m, type);
  if(!b) return null;
  if(isHardContradiction(m, type)) return null;
  if(b.value <= 0) return null;
  // Dead zone over25 @ 1.26-1.45 fără EV suficient
  if(type === 'over25' && oddsInRanges(b.odds, [[1.26,1.45]]) && (b.value || 0) < 0.03) return null;
  // Liga marcată Tier3-avoid: nu generăm selecții pentru ea (exceptând under35)
  if(m.leagueTier === 'avoid' && type !== 'under35') return null;
  var fit = marketFitAnalysis(m, type);
  var reasons = uniqueReasons((fit && fit.reasons) || []);
  var edgePct = Number(b.edgePct || 0);
  // Over 1.5 — praguri relaxate (xG 2.00, prob 72, value 0.02, edge 2) pentru a include mai multe evenimente
  if(type === 'over15' && isMarketDisabled('over15')) return null;
  if(type === 'over15' && (Number(b.adjProb || 0) < 72 || Number(m.probOver15 || 0) < 74 || Number(m.xgTotal || 0) < 2.00 || Number(b.odds || 0) < 1.20 || edgePct < getMarketMinEdge('over15') || Number(b.value || 0) < 0.02)) return null;
  if(type === 'over25' && isMarketDisabled('over25')) return null;
  if(type === 'over25'){
    var _edgeO25 = (b.edgePct != null) ? Number(b.edgePct) : null;
    var _edgeMinO25 = getMarketMinEdge('over25');
    // Dacă nu avem date de piață (edgePct=null), nu blocăm — lăsăm scorul să decidă
    var _edgeFailO25 = (_edgeO25 !== null) && (_edgeO25 < _edgeMinO25);
    if(Number(b.adjProb || 0) < 52 || Number(m.probOver25 || 0) < 50 || Number(m.xgTotal || 0) < 1.80 || Number(b.odds || 0) < 1.15 || _edgeFailO25 || Number(b.value || 0) < 0.01) return null;
  }
  if(type === 'under35' && isMarketDisabled('under35')) return null;
  if(type === 'under35'){
    var _u35EdgeMin = Math.max(getMarketMinEdge('under35'), 8.0);
    var _u35AdjProb = Number(b.adjProb || 0);
    var _u35ApiProb = Number(m.probUnder35 || 0);
    var _u35XgTotal = Number(m.xgTotal || 0);
    var _u35Odds = Number(b.odds || 0);
    var _u35Value = Number(b.value || 0);
    var _u35Likely = (typeof parseLikelyScore === 'function') ? parseLikelyScore(m.mostLikelyScore) : null;
    var _u35LikelyOk = !_u35Likely || Number(_u35Likely.total || 0) <= 3;
    if(
      edgePct < _u35EdgeMin ||
      _u35AdjProb < 70 ||
      _u35ApiProb < 66 ||
      _u35XgTotal <= 0 ||
      _u35XgTotal > 2.85 ||
      _u35Odds < 1.18 ||
      _u35Odds > 1.65 ||
      _u35Value < 0.02 ||
      !_u35LikelyOk
    ) return null;
  }
  if(type === 'btts' && (Number(b.adjProb || 0) < 62 || Number(m.probBtts || 0) < 62 || Number(m.xgHome || 0) < 1.00 || Number(m.xgAway || 0) < 1.00 || Math.abs(Number(m.xgHome || 0) - Number(m.xgAway || 0)) > 1.00 || edgePct < 3 || Number(b.value || 0) < 0.03)) return null;
  // DC 1X / X2 — safe bet, prob >=75%, value >=0.02, odds >=1.15 (sub 1.15 devine irelevant)
  if(type === 'dc1x' && (Number(b.adjProb || 0) < 75 || Number(b.odds || 0) < 1.15 || Number(b.value || 0) < 0.02)) return null;
  if(type === 'dcx2' && (Number(b.adjProb || 0) < 75 || Number(b.odds || 0) < 1.15 || Number(b.value || 0) < 0.02)) return null;
  // DC 12 (no draw) — cerem prob >=70, fiind mai riscant statistic
  if(type === 'dc12' && (Number(b.adjProb || 0) < 70 || Number(b.odds || 0) < 1.15 || Number(b.value || 0) < 0.02)) return null;
  // Home Win: favorit clar acasă (prob >=62, cota rezonabilă, value pozitiv)
  if(type === 'homeWin' && (Number(b.adjProb || 0) < 62 || Number(b.odds || 0) < 1.10 || Number(b.odds || 0) > 3.50 || Number(b.value || 0) < 0.01)) return null;

  // WEEKDAY: restrictiile hardcodate au fost eliminate (nu trebuie sa excludem un eveniment doar pe baza zilei).
  // Motorul de invatare continuu identifica pattern-uri toxice pe zile DACA apar din jurnal — doar acolo blocam.
  var kickoffDate = m.kickoff || m.date || m.event_date || '';
  var kickoffDay = -1;
  if(kickoffDate){
    try{ var __jd = new Date(kickoffDate).getDay(); if(__jd >= 0 && __jd <= 6) kickoffDay = __jd; }catch(e){}
  }
  // LEARNING: filtre dinamice — blocare edge toxic sau weekday toxic aparut din jurnal (min 12 pariuri, ROI <= -20%)
  try {
    if(typeof learningDisqualifiesEdge === 'function' && learningDisqualifiesEdge(type, edgePct)) return null;
    if(typeof learningDisqualifiesWeekday === 'function' && kickoffDay >= 0 && learningDisqualifiesWeekday(type, kickoffDay)) return null;
  } catch(e){}

  var confBoost = Math.min(6, (m.confidence || 0) * 0.06);

  var baseScore = 0;
  baseScore += (b.adjProb * 0.40);
  baseScore += (Math.max(0, edgePct) * 1.35);
  baseScore += (Math.max(0, b.value) * 100 * 0.18);
  // fit.score HTML are maxim ~35-48, Python are ~19-22 — scalăm la 0.55 pentru aliniere
  baseScore += Math.min(22, ((fit && fit.score) || 0) * 0.55);
  baseScore += confBoost;
  if(b.sourceApi) baseScore += 4;
  if(b.sourceHeuristic) baseScore += 2;
  if(b.odds >= 1.18 && b.odds <= 1.75) baseScore += 4;
  if(m.leagueTier === 'high') baseScore += 4;
  if(m.leagueTier === 'avoid') baseScore -= 8;
  if(b.odds > 2.20) baseScore -= 8;

  var trainingMeta = getTrainingBoostMeta(m, type, b);
  if(trainingMeta && isFinite(Number(trainingMeta.boost))){
    baseScore += Number(trainingMeta.boost || 0);
    if(trainingMeta.reason){
      if(Math.abs(Number(trainingMeta.boost || 0)) >= 3) reasons.unshift(trainingMeta.reason);
      else reasons.push(trainingMeta.reason);
    }
  }

  // LEARNING: aplica boost-ul/multiplicatorul din jurnal
  var learningMeta = { boost:0, multiplier:1.0, toxic:false, reasons:[] };
  try {
    if(typeof learningApplyToCandidate === 'function'){
      learningMeta = learningApplyToCandidate({
        marketKey: type,
        leagueName: String(m.league || '—'),
        odds: b.odds,
        edgePct: edgePct,
        score: b.score,
        probAdj: b.adjProb,
        weekdayIdx: kickoffDay
      }) || learningMeta;
    }
  } catch(e){}
  if(learningMeta.toxic){
    // V17 FIX: nu mai aruncam candidatul (walk-forward a aratat ca blocam winners).
    // Il marcam ca toxic pentru stake sizing si penalizare scor.
    baseScore -= 15;
  }
  if(learningMeta.boost){
    baseScore += Number(learningMeta.boost);
    var learnLabel = (learningMeta.boost >= 0 ? 'Motor invatare +' : 'Motor invatare ') + Number(learningMeta.boost).toFixed(1);
    if(Math.abs(learningMeta.boost) >= 3) reasons.unshift(learnLabel);
    else reasons.push(learnLabel);
    if(learningMeta.reasons && learningMeta.reasons.length){
      learningMeta.reasons.slice(0,2).forEach(function(r){ if(reasons.indexOf(r) < 0) reasons.push(r); });
    }
  }
  // Ajustare finala: multiplicator compozit
  if(learningMeta.multiplier && Math.abs(learningMeta.multiplier - 1.0) > 0.03){
    baseScore = baseScore * (0.85 + learningMeta.multiplier * 0.15); // blend 85% aditiv + 15% multiplicativ
  }

  // V17 FIX: influenteaza ranking cu stake multiplier (sweet-spot picks urca, trap picks coboara)
  var __stakeRow = {
    edge_pct: edgePct,
    odds: b.odds,
    poisson_delta: b.poissonDelta,
    adjusted_prob: b.adjProb,
    model_prob: b.apiProb,
    learningToxic: !!learningMeta.toxic
  };
  var __stakeMult = (typeof computeStakeMultiplier === 'function') ? computeStakeMultiplier(__stakeRow) : 1.0;
  // Amestec 70% scor curent + 30% multiplicativ pe stake mult (care e 0.25-1.30)
  baseScore = baseScore * (0.70 + __stakeMult * 0.30);

  var risk = 'MEDIU';
  if(b.adjProb >= 76 && edgePct >= 2 && (m.confidence || 0) >= 56) risk = 'LOW';
  else if(b.adjProb < 58 || b.odds > 2.10 || edgePct < 1) risk = 'HIGH';

  return Object.assign({}, m, {
    bestBet: Object.assign({}, b, {
      trainingBoost: Number(trainingMeta && trainingMeta.boost || 0),
      trainingEligibleLeague: !!(trainingMeta && trainingMeta.eligible),
      trainingLeagueRate: trainingMeta && trainingMeta.leagueRate != null ? Number(trainingMeta.leagueRate) : null,
      trainingGlobalRate: trainingMeta && trainingMeta.globalRate != null ? Number(trainingMeta.globalRate) : null,
      trainingDeltaVsGlobal: trainingMeta && trainingMeta.deltaVsGlobal != null ? Number(trainingMeta.deltaVsGlobal) : null,
      trainingMatches: Number(trainingMeta && trainingMeta.matches || 0),
      trainingReason: trainingMeta && trainingMeta.reason ? trainingMeta.reason : '',
      learningBoost: Number(learningMeta.boost || 0),
      learningMultiplier: Number(learningMeta.multiplier || 1.0),
      learningReasons: (learningMeta.reasons || []).slice(0, 3),
      learningToxic: !!learningMeta.toxic,
      stakeMultiplier: Number(__stakeMult.toFixed(2))
    }),
    ticketScore: Math.round(baseScore),
    ticketRisk: risk,
    why: uniqueReasons(reasons).slice(0, 3).join(' • '),
    proEligible: (m.leagueTier !== 'avoid') && (b.adjProb >= 72) && ((b.edgePct || 0) >= 1.5) && ((b.value || 0) >= 0.01)
  });
}

function getRelaxedProfile(profile, relax){
  return {
    allowedTypes: profile.allowedTypes.slice(),
    minAdjProb: profile.minAdjProb - (relax * 4),
    minValue: Math.max(0.005, profile.minValue - (relax * 0.01)),
    minConf: profile.minConf - (relax * 4),
    minOdd: profile.minOdd,
    maxOdd: profile.maxOdd + (relax * 0.15),
    minPicks: Math.max(1, profile.minPicks - (relax > 1 ? 1 : 0)),
    maxPicks: profile.maxPicks,
    targetMinOdds: profile.targetMinOdds,
    targetMaxOdds: profile.targetMaxOdds + (relax * 0.7),
    hardMaxOdds: profile.hardMaxOdds + (relax * 1.0),
    maxSameLeague: profile.maxSameLeague,
    maxSameMarket: profile.maxSameMarket
  };
}

function candidateAccepted(c, profile){
  if(!c || !c.bestBet) return false;
  if(profile.allowedTypes.indexOf(c.bestBet.type) === -1) return false;
  if(c.bestBet.adjProb < profile.minAdjProb) return false;
  if(c.bestBet.value < profile.minValue) return false;
  if(c.confidence < profile.minConf) return false;
  if(c.bestBet.odds < profile.minOdd || c.bestBet.odds > profile.maxOdd) return false;
  return true;
}

function collectCandidates(types, profile, relax){
  var rp = getRelaxedProfile(profile, relax);
  var list = [];

  ALL_MATCHES.forEach(function(m){
    if(!passesSelectionFilter(m)) return;

    types.forEach(function(t){
      var c = buildMarketCandidate(m, t);
      if(candidateAccepted(c, rp)) list.push(c);
    });
  });

  list.sort(function(a, b){
    if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
    if((b.bestBet.value || 0) !== (a.bestBet.value || 0)) return (b.bestBet.value || 0) - (a.bestBet.value || 0);
    return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
  });

  return { list: list, profile: rp };
}

function selectDiversifiedPicks(candidates, profile){
  var picks = [];
  var totalOdds = 1;
  var leagues = {};
  var markets = {};
  var events = {};

  for(var i = 0; i < candidates.length; i++){
    var c = candidates[i];
    if(!c || !c.bestBet) continue;
    if(events[c.eventId]) continue;

    var lgCount = leagues[c.league] || 0;
    var mkCount = markets[c.bestBet.type] || 0;

    if(lgCount >= profile.maxSameLeague) continue;
    if(mkCount >= profile.maxSameMarket) continue;

    var nextOdds = totalOdds * c.bestBet.odds;
    if(nextOdds > profile.hardMaxOdds) continue;

    picks.push(c);
    totalOdds = nextOdds;
    events[c.eventId] = true;
    leagues[c.league] = lgCount + 1;
    markets[c.bestBet.type] = mkCount + 1;

    var enoughCount = picks.length >= profile.minPicks;
    var enoughOdds = totalOdds >= profile.targetMinOdds;
    var shouldStop = totalOdds >= (profile.targetMaxOdds * 0.95) || picks.length >= profile.maxPicks;

    if(enoughCount && enoughOdds && shouldStop) break;
  }

  return { picks: picks, totalOdds: totalOdds };
}

function finalizeTicket(type, label, picks, totalOdds){
  if(!picks || !picks.length){
    BILETE = {
      picks: [],
      totalOdds: 1,
      generatedAt: new Date().toISOString(),
      error: 'Nu exista selectie EV+ suficient de buna pentru acest tip de bilet.'
    };
    renderBilete();
    toast('Nu exista selectie EV+ suficient de buna', 'warn');
    return;
  }

  var avgEdge = picks.reduce(function(acc, p){ return acc + (p.bestBet.value || 0); }, 0) / picks.length;
  var combinedProb = computeConservativeCombinedProb(picks);
  var riskLabel =
    type === 'profit_single' ? 'Scăzut+' :
    type === 'best_single' ? 'Scăzut' :
    type === 'simple' ? 'Scăzut' :
    type === 'over15' ? 'Mediu' :
    type === 'mix_combo' ? 'Mediu+' :
    'Ridicat';

  BILETE = {
    picks: picks,
    totalOdds: totalOdds,
    generatedAt: new Date().toISOString(),
    type: type,
    label: label,
    combinedProb: combinedProb,
    avgEdge: avgEdge,
    riskLabel: riskLabel,
    stake: getStakeForTicket(type)
  };

  renderBilete();
  toast(label + ' generat!', 'ok');
}

function generateConservativeTicket(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 72,
    minValue: 0.008,
    minConf: 48,
    minOdd: 1.12,
    maxOdd: 1.58,
    minPicks: 3,
    maxPicks: 5,
    targetMinOdds: 1.90,
    targetMaxOdds: 4.20,
    hardMaxOdds: 5.20,
    maxSameLeague: 1,
    maxSameMarket: 3
  };

  for(var relax = 0; relax <= 3; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    pack.list.sort(function(a,b){
      return (b.ticketScore || 0) - (a.ticketScore || 0);
    });
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= 3 && chosen.totalOdds >= 1.85){
      finalizeTicket('simple', '🧊 Bilet conservator', chosen.picks, chosen.totalOdds);
      if(BILETE) BILETE.riskLabel = 'Scăzut-mediu';
      renderBilete();
      return;
    }
  }

  finalizeTicket('simple', '🧊 Bilet conservator', [], 1);
}

function generateTicket(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 68,
    minValue: 0.015,
    minConf: 52,
    minOdd: 1.18,
    maxOdd: 1.95,
    minPicks: 2,
    maxPicks: 4,
    targetMinOdds: 1.65,
    targetMaxOdds: 3.20,
    hardMaxOdds: 3.80,
    maxSameLeague: 1,
    maxSameMarket: 2
  };

  for(var relax = 0; relax <= 2; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= pack.profile.minPicks && chosen.totalOdds >= pack.profile.targetMinOdds){
      finalizeTicket('simple', '🛡️ Bilet Smart EV', chosen.picks, chosen.totalOdds);
      return;
    }
  }

  finalizeTicket('simple', '🛡️ Bilet Smart EV', [], 1);
}


function toggleAdvancedGenerators(){
  var el = $('advanced-generators');
  if(!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

function toggleCustomBuilder(forceOpen){
  var el = $('custom-builder');
  if(!el) return;
  if(forceOpen) el.classList.add('show');
  else el.classList.toggle('show');
}

function applyCustomPreset(type){
  $('cust-format').value = type === 'safe' ? 'single' : 'combo';
  $('cust-stake').value = type === 'attack' ? 20 : type === 'balanced' ? 40 : 60;
  $('cust-target-odds').value = type === 'safe' ? '1.45' : type === 'balanced' ? '2.40' : '5.50';
  $('cust-picks').value = type === 'safe' ? 1 : type === 'balanced' ? 3 : 4;
  $('cust-risk').value = type === 'safe' ? 'low' : type === 'balanced' ? 'medium' : 'high';
  $('cust-mode').value = type === 'safe' ? 'strict' : type === 'balanced' ? 'flex' : 'optimize';
  $('cust-date-window').value = type === 'safe' ? 'today' : type === 'balanced' ? '7d' : '14d';

  $('cb-over15').checked = true;
  $('cb-over25').checked = type !== 'safe';
  $('cb-btts').checked = type !== 'safe';
  $('cb-under35').checked = true;
  $('cb-ai-only').checked = (type !== 'attack');
  $('cb-fav-only').checked = type === 'safe';
  $('cb-goals-only').checked = type === 'attack';
}

function getCustomAllowedTypes(){
  var types = [];
  if($('cb-over15').checked) types.push('over15');
  if($('cb-over25').checked) types.push('over25');
  if($('cb-btts').checked) types.push('btts');
  if($('cb-under35').checked) types.push('under35');
  if(!types.length) types = ['over15','over25','under35','btts'];
  return types;
}

function getCustomProfile(){
  var risk = $('cust-risk').value;
  var map = {
    low:    { minAdjProb: 72, minValue: 0.006, minConf: 46, minOdd: 1.08, maxOdd: 1.62, maxSameLeague: 1, maxSameMarket: 2 },
    medium: { minAdjProb: 68, minValue: 0.003, minConf: 44, minOdd: 1.08, maxOdd: 1.95, maxSameLeague: 1, maxSameMarket: 3 },
    high:   { minAdjProb: 64, minValue: 0.000, minConf: 40, minOdd: 1.08, maxOdd: 2.45, maxSameLeague: 2, maxSameMarket: 4 }
  };
  return map[risk] || map.medium;
}

function relaxedCustomProfile(base, relax){
  return {
    minAdjProb: base.minAdjProb - (relax * 3),
    minValue: Math.max(0, base.minValue - (relax * 0.004)),
    minConf: base.minConf - (relax * 3),
    minOdd: Math.max(1.05, base.minOdd - (relax * 0.03)),
    maxOdd: base.maxOdd + (relax * 0.18),
    maxSameLeague: base.maxSameLeague,
    maxSameMarket: base.maxSameMarket
  };
}

function isStrictCustomMode(){
  return $('cust-mode') && $('cust-mode').value === 'strict';
}

function isExplicitAiRecommended(c, type){
  if(!c || !c.mlFlags) return false;
  if(type === 'over15') return !!c.mlFlags.o15;
  if(type === 'over25') return !!c.mlFlags.o25;
  if(type === 'btts') return !!c.mlFlags.btts;
  if(type === 'homeWin') return !!((c.mlFlags.winner && c.predictedResult === 'H') || (c.mlFlags.fav && c.favorite === 'H' && c.predictedResult === 'H'));
  if(type === 'awayWin') return !!((c.mlFlags.winner && c.predictedResult === 'A') || (c.mlFlags.fav && c.favorite === 'A' && c.predictedResult === 'A'));
  return false;
}

function isHeuristicAiPass(c, type){
  if(!c || !c.bestBet) return false;
  if(type === 'over15') return !!(c.probOver15 >= 78 && c.bestBet.adjProb >= 72);
  if(type === 'over25') return !!(c.probOver25 >= 60 && c.bestBet.adjProb >= 68);
  if(type === 'btts') return !!(c.probBtts >= 57 && c.bestBet.adjProb >= 68);
  if(type === 'homeWin') return !!(c.favorite === 'H' && c.predictedResult === 'H' && c.bestBet.adjProb >= 72);
  if(type === 'draw') return !!(c.probDraw >= 28 && c.bestBet.adjProb >= 66);
  if(type === 'awayWin') return !!(c.favorite === 'A' && c.predictedResult === 'A' && c.bestBet.adjProb >= 72);
  if(type === 'under25') return !!(c.probUnder25 >= 56 && c.bestBet.adjProb >= 70);
  if(type === 'under35') return !!(c.probUnder35 >= 68 && c.bestBet.adjProb >= 74);
  return false;
}

function isFavoriteAlignedSelection(c, type){
  var aligned = !!(c && (c.favorite === 'H' || c.favorite === 'A') && c.predictedResult && c.favorite === c.predictedResult);
  if(!aligned) return false;
  if(type === 'homeWin') return c.favorite === 'H';
  if(type === 'awayWin') return c.favorite === 'A';
  return true;
}

function getCustomDateWindowDays(){
  var mode = $('cust-date-window') ? $('cust-date-window').value : '7d';
  if(mode === 'today') return 0;
  if(mode === '3d') return 3;
  if(mode === '7d') return 7;
  if(mode === '14d') return 14;
  if(mode === '30d') return 30;
  return 7;
}

function customDatePass(m){
  if(!m || !m.date) return false;
  var days = getCustomDateWindowDays();
  var now = new Date();
  var matchDate = new Date(m.date);
  if(days === 0) return m.dateKey === getCurrentDayKey();
  return matchDate.getTime() <= (now.getTime() + (days * 86400000));
}

function customCandidateFilter(c){
  if(!c || !c.bestBet) return false;

  var t = c.bestBet.type;
  var ls = parseLikelyScore(c.mostLikelyScore);
  var strictMode = isStrictCustomMode();

  if($('cb-goals-only').checked){
    if(['over15','over25','under25','under35','btts'].indexOf(t) === -1) return false;

    if(t === 'over15'){
      if(c.probOver15 < 72) return false;
      if(Number(c.xgTotal || 0) < 2.00) return false;
      if(ls && ls.total < 2) return false;
    }

    if(t === 'over25'){
      if(c.probOver25 < 57) return false;
      if(Number(c.xgTotal || 0) < 2.50) return false;
      if(ls && ls.total < 3) return false;
    }

    if(t === 'under25'){
      if(c.probUnder25 < 56) return false;
      if(Number(c.xgTotal || 0) > 2.60) return false;
      if(ls && ls.total > 2) return false;
    }

    if(t === 'under35'){
      if(c.probUnder35 < 68) return false;
      if(Number(c.xgTotal || 0) > 3.10) return false;
      if(ls && ls.total > 3) return false;
    }

    if(t === 'btts'){
      if(c.probBtts < 58) return false;
      if(Number(c.xgHome || 0) < 0.90 || Number(c.xgAway || 0) < 0.90) return false;
      if(ls && !ls.btts) return false;
    }

  }

  if($('cb-ai-only').checked){
    var aiPass = isExplicitAiRecommended(c, t);
    if(!aiPass && !strictMode) aiPass = isHeuristicAiPass(c, t);
    if(!aiPass && ['under25','under35','draw'].indexOf(t) !== -1){
      aiPass = c.bestBet.adjProb >= (t === 'draw' ? 66 : 72);
    }
    if(!aiPass) return false;
  }

  if($('cb-fav-only').checked){
    if(!isFavoriteAlignedSelection(c, t) && ['homeWin','awayWin'].indexOf(t) !== -1) return false;
  }

  return true;
}

function collectCustomCandidates(opts, relax){
  var profile = relaxedCustomProfile(getCustomProfile(), relax);
  var out = [];

  ALL_MATCHES.forEach(function(m){
    if(!passesSelectionFilter(m)) return;
    if(!customDatePass(m)) return;

    opts.allowedTypes.forEach(function(t){
      var c = buildMarketCandidate(m, t);
      if(!c || !c.bestBet) return;
      if(c.bestBet.adjProb < profile.minAdjProb) return;
      if(c.bestBet.value < profile.minValue) return;
      if(c.confidence < profile.minConf) return;
      if(c.bestBet.odds < profile.minOdd || c.bestBet.odds > profile.maxOdd) return;
      if(!customCandidateFilter(c)) return;
      out.push(c);
    });
  });

  out.sort(function(a,b){
    if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
    if((b.bestBet.value || 0) !== (a.bestBet.value || 0)) return (b.bestBet.value || 0) - (a.bestBet.value || 0);
    return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
  });

  return { list: out, profile: profile };
}

function getCustomTargetWindow(targetOdds, mode, relax){
  var pct = mode === 'strict' ? 0.08 : mode === 'flex' ? 0.16 : 0.28;
  var minAbs = mode === 'strict' ? 0.08 : mode === 'flex' ? 0.15 : 0.25;
  if(mode !== 'strict') pct += relax * 0.05;
  var delta = Math.max(minAbs, targetOdds * pct);
  return {
    min: Math.max(1.05, targetOdds - delta),
    max: targetOdds + delta,
    delta: delta
  };
}

function rankCustomComboState(state, targetOdds){
  var closenessPenalty = Math.abs(Math.log((state.totalOdds || 1) / Math.max(1.05, targetOdds))) * 90;
  return (
    (state.totalTicketScore || 0) +
    ((state.totalAdjProb || 0) / Math.max(1, state.picks.length) * 0.35) +
    ((state.totalValue || 0) * 100 * 0.28) -
    closenessPenalty
  );
}

function expandCustomComboState(state, candidate, profile){
  if(!state || !candidate || !candidate.bestBet) return null;
  if(state.events[candidate.eventId]) return null;

  var leagueCount = state.leagues[candidate.league] || 0;
  var marketCount = state.markets[candidate.bestBet.type] || 0;
  if(leagueCount >= profile.maxSameLeague) return null;
  if(marketCount >= profile.maxSameMarket) return null;

  var nextOdds = state.totalOdds * candidate.bestBet.odds;
  if(nextOdds > profile.hardMaxOdds) return null;

  var next = {
    picks: state.picks.concat([candidate]),
    totalOdds: nextOdds,
    totalTicketScore: state.totalTicketScore + (candidate.ticketScore || 0),
    totalAdjProb: state.totalAdjProb + (candidate.bestBet.adjProb || 0),
    totalValue: state.totalValue + (candidate.bestBet.value || 0),
    events: Object.assign({}, state.events),
    leagues: Object.assign({}, state.leagues),
    markets: Object.assign({}, state.markets)
  };

  next.events[candidate.eventId] = true;
  next.leagues[candidate.league] = leagueCount + 1;
  next.markets[candidate.bestBet.type] = marketCount + 1;
  next.rank = 0;
  return next;
}

function findBestCustomCombo(candidates, opts, profile, targetOdds, relax){
  if(!candidates || !candidates.length) return null;

  var mode = opts.mode || 'flex';
  var exactPicks = Math.max(1, profile.maxPicks || opts.picks || 1);
  var poolLimit = mode === 'strict' ? 60 : (mode === 'flex' ? 90 : 120);
  var beamWidth = mode === 'strict' ? 30 : (mode === 'flex' ? 45 : 60);
  var window = getCustomTargetWindow(targetOdds, mode, relax);
  var pool = candidates.slice(0, poolLimit);
  var beam = [{
    picks: [],
    totalOdds: 1,
    totalTicketScore: 0,
    totalAdjProb: 0,
    totalValue: 0,
    events: {},
    leagues: {},
    markets: {},
    rank: 0
  }];
  var finished = [];

  for(var depth = 0; depth < exactPicks; depth++){
    var nextBeam = [];

    for(var i = 0; i < beam.length; i++){
      for(var j = 0; j < pool.length; j++){
        var nextState = expandCustomComboState(beam[i], pool[j], profile);
        if(!nextState) continue;

        var picksLeft = exactPicks - nextState.picks.length;
        if(picksLeft === 0){
          if(nextState.totalOdds >= window.min && nextState.totalOdds <= window.max){
            nextState.rank = rankCustomComboState(nextState, targetOdds);
            finished.push(nextState);
          }
          continue;
        }

        var idealLegOdd = Math.pow(targetOdds / Math.max(1.01, nextState.totalOdds), 1 / picksLeft);
        var projectedPenalty = Math.abs(idealLegOdd - 1.30) * 12;
        nextState.rank = rankCustomComboState(nextState, targetOdds) - projectedPenalty;
        nextBeam.push(nextState);
      }
    }

    nextBeam.sort(function(a, b){ return b.rank - a.rank; });

    var deduped = [];
    var seen = {};
    for(var k = 0; k < nextBeam.length && deduped.length < beamWidth; k++){
      var state = nextBeam[k];
      var sig = state.picks.length + '|' + state.totalOdds.toFixed(3) + '|' + Object.keys(state.markets).sort().join('-');
      if(seen[sig]) continue;
      seen[sig] = true;
      deduped.push(state);
    }
    beam = deduped;
    if(!beam.length && !finished.length) break;
  }

  if(!finished.length) return null;
  finished.sort(function(a, b){ return b.rank - a.rank; });
  return {
    picks: finished[0].picks,
    totalOdds: finished[0].totalOdds
  };
}

function chooseCustomSingle(candidates, targetOdds){
  if(!candidates || !candidates.length) return null;
  var ranked = candidates.slice().sort(function(a,b){
    var aScore = (a.ticketScore || 0) - Math.abs((a.bestBet.odds || 0) - targetOdds) * 12;
    var bScore = (b.ticketScore || 0) - Math.abs((b.bestBet.odds || 0) - targetOdds) * 12;
    return bScore - aScore;
  });
  return ranked[0] || null;
}

function setCustomTicketMeta(stake, risk){
  if(!BILETE) return;
  BILETE.stake = Number(stake || 0);
  BILETE.riskLabel = risk === 'low' ? 'Scăzut' : risk === 'medium' ? 'Mediu' : 'Ridicat';
}




function setTicketError(msg){
  BILETE = {
    picks: [],
    totalOdds: 1,
    generatedAt: new Date().toISOString(),
    error: msg
  };
  renderBilete();
  toast(msg, 'warn');
}

function getCustomMaxReasonableOdds(opts){
  var profile = getCustomProfile();
  var legs = opts.format === 'single' ? 1 : Math.max(1, opts.picks);
  return Math.pow(profile.maxOdd, legs);
}

function validateCustomRequest(opts){
  var problems = [];
  var maxReasonable = getCustomMaxReasonableOdds(opts);

  if(opts.format === 'single' && opts.targetOdds > getCustomProfile().maxOdd + 0.6){
    problems.push('Pentru Single, cota dorită este prea mare pentru filtrele actuale.');
  }

  if(opts.format === 'combo' && opts.targetOdds > (maxReasonable * 1.10)){
    problems.push('Cota dorită este prea mare pentru numărul de evenimente și nivelul de risc ales.');
  }

  if(opts.allowedTypes.length === 0){
    problems.push('Selectează cel puțin un tip de piață.');
  }

  return problems;
}

function generateControlledComboTicket(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 74,
    minValue: 0.010,
    minConf: 50,
    minOdd: 1.18,
    maxOdd: 1.60,
    minPicks: 3,
    maxPicks: 4,
    targetMinOdds: 2.20,
    targetMaxOdds: 4.20,
    hardMaxOdds: 5.20,
    maxSameLeague: 1,
    maxSameMarket: 2
  };

  for(var relax = 0; relax <= 2; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= 3 && chosen.totalOdds >= 2.10){
      finalizeTicket('controlled_combo', '⚖️ Combo controlat', chosen.picks, chosen.totalOdds);
      if(BILETE) BILETE.riskLabel = 'Mediu';
      renderBilete();
      return;
    }
  }

  finalizeTicket('controlled_combo', '⚖️ Combo controlat', [], 1);
}

function parseLocaleNumber(value, fallback){
  var raw = String(value == null ? '' : value).trim().replace(',', '.');
  var n = Number(raw);
  return isFinite(n) ? n : fallback;
}

function collectCustomFallbackCandidates(opts){
  var base = getCustomProfile();
  var out = [];
  ALL_MATCHES.forEach(function(m){
    if(!passesSelectionFilter(m)) return;
    if(!customDatePass(m)) return;
    opts.allowedTypes.forEach(function(t){
      var c = buildMarketCandidate(m, t);
      if(!c || !c.bestBet) return;
      if(c.bestBet.adjProb < (base.minAdjProb - 8)) return;
      if(c.confidence < Math.max(36, base.minConf - 8)) return;
      if(c.bestBet.odds < Math.max(1.05, base.minOdd - 0.05) || c.bestBet.odds > (base.maxOdd + 0.35)) return;
      if($('cb-goals-only').checked && ['over15','over25','btts'].indexOf(t) === -1) return;
      if(t === 'over15' && (c.probOver15 < 70 || Number(c.xgTotal || 0) < 1.95)) return;
      if(t === 'over25' && (c.probOver25 < 55 || Number(c.xgTotal || 0) < 2.35)) return;
      if(t === 'btts' && (c.probBtts < 55 || Number(c.xgHome || 0) < 0.80 || Number(c.xgAway || 0) < 0.80)) return;
      out.push(c);
    });
  });
  out.sort(function(a,b){
    return (b.ticketScore || 0) - (a.ticketScore || 0);
  });
  return out;
}

function collectLargeVolumeFallback(opts){
  var out = [];
  ALL_MATCHES.forEach(function(m){
    if(!passesSelectionFilter(m)) return;
    if(!customDatePass(m)) return;
    opts.allowedTypes.forEach(function(t){
      var c = buildMarketCandidate(m, t);
      if(!c || !c.bestBet) return;
      if(t === 'over15' && c.probOver15 >= 78 && Number(c.xgTotal || 0) >= 2.20 && c.bestBet.adjProb >= 76 && Number(c.bestBet.edgePct || 0) >= 4 && c.bestBet.odds >= 1.25 && c.bestBet.odds <= 1.55) out.push(c);
      else if(t === 'over25' && c.probOver25 >= 55 && Number(c.xgTotal || 0) >= 2.35 && c.bestBet.odds >= 1.20 && c.bestBet.odds <= 2.20) out.push(c);
      else if(t === 'under35' && c.probUnder35 >= 64 && Number(c.xgTotal || 0) <= 3.20 && c.bestBet.odds >= 1.10 && c.bestBet.odds <= 1.65) out.push(c);
      else if(['homeWin','awayWin','btts'].indexOf(t) !== -1 && c.bestBet.adjProb >= 60) out.push(c);
    });
  });
  out.sort(function(a,b){
    if(a.date !== b.date) return new Date(a.date) - new Date(b.date);
    return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
  });
  var uniq = [];
  var seen = {};
  out.forEach(function(c){ if(!seen[c.eventId]){ seen[c.eventId]=true; uniq.push(c); } });
  return uniq;
}

function generateCustomTicket(){
  var opts = {
    stake: parseLocaleNumber($('cust-stake').value, 0),
    targetOdds: Math.max(1.05, parseLocaleNumber($('cust-target-odds').value, 1.50)),
    picks: Math.max(1, parseInt($('cust-picks').value || '1', 10)),
    format: $('cust-format').value,
    risk: $('cust-risk').value,
    mode: $('cust-mode').value,
    allowedTypes: getCustomAllowedTypes()
  };

  if(opts.format === 'single') opts.picks = 1;

  var problems = validateCustomRequest(opts);
  if(problems.length){
    setTicketError(problems[0]);
    return;
  }

  var maxRelax = opts.mode === 'strict' ? 0 : opts.mode === 'flex' ? 2 : 3;
  var currentPicks = opts.picks;
  var currentTargetOdds = opts.targetOdds;

  for(var relax = 0; relax <= maxRelax; relax++){
    var pack = collectCustomCandidates(opts, relax);

    if(opts.format !== 'single' && currentPicks > 10){
      var hvProfile = {
        minPicks: currentPicks,
        maxPicks: currentPicks,
        targetMinOdds: Math.max(1.20, currentTargetOdds * 0.70),
        targetMaxOdds: currentTargetOdds * 1.35,
        hardMaxOdds: currentTargetOdds * 1.70,
        maxSameLeague: Math.max(2, pack.profile.maxSameLeague),
        maxSameMarket: Math.max(5, pack.profile.maxSameMarket)
      };
      var hv = selectDiversifiedPicks(pack.list, hvProfile);
      if(hv.picks.length === currentPicks){
        finalizeTicket('custom_combo', '🎛️ Bilet personalizat', hv.picks, hv.totalOdds);
        setCustomTicketMeta(opts.stake, opts.risk);
        renderBilete();
        toast('Bilet volum mare generat!', 'ok');
        return;
      }
    }

    if(opts.format === 'single'){
      var single = chooseCustomSingle(pack.list, currentTargetOdds);
      if(single){
        finalizeTicket('custom_single', '🎛️ Bilet personalizat', [single], single.bestBet.odds);
        setCustomTicketMeta(opts.stake, opts.risk);
        renderBilete();
        toast('Bilet personalizat generat!', 'ok');
        return;
      }
      continue;
    }

    var marketSpreadNeed = Math.ceil(currentPicks / Math.max(1, opts.allowedTypes.length));
    var profile = {
      minPicks: currentPicks,
      maxPicks: currentPicks,
      targetMinOdds: Math.max(1.10, currentTargetOdds * 0.80),
      targetMaxOdds: currentTargetOdds * 1.18,
      hardMaxOdds: currentTargetOdds * 1.50,
      maxSameLeague: pack.profile.maxSameLeague,
      maxSameMarket: Math.max(pack.profile.maxSameMarket, marketSpreadNeed)
    };

    var chosen = findBestCustomCombo(pack.list, opts, profile, currentTargetOdds, relax);

    if(chosen && chosen.picks.length === currentPicks){
      finalizeTicket('custom_combo', '🎛️ Bilet personalizat', chosen.picks, chosen.totalOdds);
      setCustomTicketMeta(opts.stake, opts.risk);
      renderBilete();
      toast('Bilet personalizat generat!', 'ok');
      return;
    }

    if(opts.mode === 'optimize'){
      if(currentPicks > 2) currentPicks -= 1;
      if(currentTargetOdds > 2.0) currentTargetOdds = Math.max(2.0, currentTargetOdds * 0.72);
    }
  }

  if(currentPicks > 10){
    var volumeList = collectLargeVolumeFallback(opts);
    if(volumeList.length >= currentPicks){
      var picks = volumeList.slice(0, currentPicks);
      var totalOdds = picks.reduce(function(acc, item){ return acc * item.bestBet.odds; }, 1);
      finalizeTicket('custom_combo', '🎛️ Bilet personalizat (volum mare)', picks, totalOdds);
      setCustomTicketMeta(opts.stake, opts.risk);
      renderBilete();
      toast('Fallback volum mare activat', 'warn');
      return;
    }
  }

  var fallbackList = collectCustomFallbackCandidates(opts);
  if(fallbackList.length){
    if(opts.format === 'single'){
      var fallbackSingle = chooseCustomSingle(fallbackList, currentTargetOdds);
      if(fallbackSingle){
        finalizeTicket('custom_single', '🎛️ Bilet personalizat (fallback AI)', [fallbackSingle], fallbackSingle.bestBet.odds);
        setCustomTicketMeta(opts.stake, opts.risk);
        renderBilete();
        toast('Generatorul a folosit fallback inteligent', 'warn');
        return;
      }
    } else {
      var fallbackProfile = {
        minPicks: Math.max(1, Math.min(currentPicks, fallbackList.length)),
        maxPicks: Math.max(1, Math.min(currentPicks, fallbackList.length)),
        targetMinOdds: Math.max(1.20, currentTargetOdds * 0.65),
        targetMaxOdds: currentTargetOdds * 1.35,
        hardMaxOdds: currentTargetOdds * 1.65,
        maxSameLeague: Math.max(1, getCustomProfile().maxSameLeague),
        maxSameMarket: Math.max(2, getCustomProfile().maxSameMarket)
      };
      var fallbackCombo = findBestCustomCombo(fallbackList, opts, fallbackProfile, Math.max(1.20, currentTargetOdds * 0.82), 2);
      if(fallbackCombo && fallbackCombo.picks.length){
        finalizeTicket('custom_combo', '🎛️ Bilet personalizat (fallback AI)', fallbackCombo.picks, fallbackCombo.totalOdds);
        setCustomTicketMeta(opts.stake, opts.risk);
        renderBilete();
        toast('Generatorul a relaxat automat filtrele', 'warn');
        return;
      }
    }
  }

  setTicketError('Nu există combinație suficient de bună pentru setările alese. Redu cota dorită sau lasă modul pe Optimizează AI.');
}
function generateOver15Ticket(){
  var baseProfile = {
    allowedTypes: ['over15'],
    minAdjProb: 76,
    minValue: 0.010,
    minConf: 48,
    minOdd: 1.12,
    maxOdd: 1.40,
    minPicks: 5,
    maxPicks: 8,
    targetMinOdds: 2.80,
    targetMaxOdds: 7.80,
    hardMaxOdds: 10.50,
    maxSameLeague: 2,
    maxSameMarket: 99
  };

  for(var relax = 0; relax <= 2; relax++){
    var pack = collectCandidates(['over15'], baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= pack.profile.minPicks && chosen.totalOdds >= pack.profile.targetMinOdds){
      finalizeTicket('over15', '🔥 Bilet 1.5G EV+', chosen.picks, chosen.totalOdds);
      return;
    }
  }

  finalizeTicket('over15', '🔥 Bilet 1.5G EV+', [], 1);
}

function generateOver35Ticket(){
  setTicketError('Piața Over 3.5G a fost scoasă complet din aplicație.');
}

function generateMixTicket(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 70,
    minValue: 0.018,
    minConf: 54,
    minOdd: 1.20,
    maxOdd: 1.90,
    minPicks: 3,
    maxPicks: 5,
    targetMinOdds: 4.20,
    targetMaxOdds: 6.00,
    hardMaxOdds: 6.80,
    maxSameLeague: 1,
    maxSameMarket: 2
  };

  for(var relax = 0; relax <= 2; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= pack.profile.minPicks && chosen.totalOdds >= pack.profile.targetMinOdds){
      finalizeTicket('mix_combo', '🎯 Mix 70% / ~5.0', chosen.picks, chosen.totalOdds);
      return;
    }
  }

  finalizeTicket('mix_combo', '🎯 Mix 70% / ~5.0', [], 1);
}

function generateBestEventTicket(){
  var now = new Date();

  function makeDateKey(d){
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  var todayKey = makeDateKey(now);
  var tomorrowKey = makeDateKey(new Date(now.getTime() + 86400000));
  var types = ['over15','over25','under35','btts'];

  function collectBest(dateKeys, minAdjProb){
    var out = [];
    ALL_MATCHES.forEach(function(m){
      if(!passesSelectionFilter(m)) return;
      if(dateKeys.indexOf(m.dateKey) === -1) return;
      types.forEach(function(t){
        var c = buildMarketCandidate(m, t);
        if(!c || !c.bestBet) return;
        if(c.bestBet.adjProb < minAdjProb) return;
        if(c.bestBet.odds < 1.12 || c.bestBet.odds > 1.68) return;
        out.push(c);
      });
    });
    out.sort(function(a, b){
      if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
      return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
    });
    return out;
  }

  var candidates = collectBest([todayKey], 74);
  if(!candidates.length) candidates = collectBest([todayKey], 70);
  if(!candidates.length) candidates = collectBest([todayKey, tomorrowKey], 68);

  if(candidates.length){
    var picks = [candidates[0]];
    for(var i = 1; i < candidates.length; i++){
      var c = candidates[i];
      if(c.eventId === picks[0].eventId) continue;
      if((picks[0].bestBet.odds * c.bestBet.odds) > 3.20) continue;
      picks.push(c);
      break;
    }
    var totalOdds = picks.reduce(function(acc, item){ return acc * item.bestBet.odds; }, 1);
    finalizeTicket('best_single', '🎯 Biletul zilei', picks, totalOdds);
    if(BILETE) BILETE.riskLabel = picks.length === 1 ? 'Scăzut' : 'Scăzut-mediu';
    renderBilete();
    return;
  }

  finalizeTicket('best_single', '🎯 Biletul zilei', [], 1);
}

function generateProfitFocusTicket(){
  var now = new Date();

  function makeDateKey(d){
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function likelyScoreSupports(m, type){
    var ls = parseLikelyScore(m.mostLikelyScore);
    if(!ls) return true;
    if(type === 'over15') return ls.total >= 2;
    if(type === 'over25') return ls.total >= 3;
    if(type === 'btts') return ls.btts;
    if(type === 'homeWin') return ls.home > ls.away;
    if(type === 'awayWin') return ls.away > ls.home;
    return true;
  }

  function profitFilter(c){
    if(!c || !c.bestBet) return false;

    var t = c.bestBet.type;
    var odds = Number(c.bestBet.odds || 0);
    var value = Number(c.bestBet.value || 0);
    var adjProb = Number(c.bestBet.adjProb || 0);
    var conf = Number(c.confidence || 0);
    var xgHome = Number(c.xgHome || 0);
    var xgAway = Number(c.xgAway || 0);
    var xgTotal = Number(c.xgTotal || 0);

    if(odds < 1.22 || odds > 1.75) return false;
    if(value < 0.01) return false;
    if(adjProb < 72) return false;
    if(conf < 48) return false;
    if(!likelyScoreSupports(c, t)) return false;

    if(t === 'over15'){
      return c.probOver15 >= 75 && xgTotal >= 2.10;
    }

    if(t === 'over25'){
      return c.probOver25 >= 60 && xgTotal >= 2.60;
    }

    if(t === 'btts'){
      return c.probBtts >= 58 && xgHome >= 0.90 && xgAway >= 0.90;
    }

    if(t === 'under25'){
      return c.probUnder25 >= 56 && xgTotal <= 2.55;
    }

    if(t === 'under35'){
      return c.probUnder35 >= 68 && xgTotal <= 3.05;
    }

    if(t === 'homeWin'){
      return c.predictedResult === 'H' &&
             c.favorite === 'H' &&
             (xgHome - xgAway) >= 0.30 &&
             c.probDraw < 27;
    }

    if(t === 'draw'){
      return c.probDraw >= 28 &&
             Math.abs(xgHome - xgAway) <= 0.35 &&
             Math.abs(c.probHome - c.probAway) <= 10;
    }

    if(t === 'awayWin'){
      return c.predictedResult === 'A' &&
             c.favorite === 'A' &&
             (xgAway - xgHome) >= 0.30 &&
             c.probDraw < 27;
    }

    return false;
  }

  function rankProfitCandidate(c){
    var score = 0;
    score += (c.bestBet.adjProb * 0.46);
    score += (Math.max(0, c.bestBet.value) * 100 * 0.38);
    score += (c.confidence * 0.16);

    if(c.bestBet.type === 'under25' || c.bestBet.type === 'under35') score += 8;
    else if(c.bestBet.type === 'over25') score += 6;
    else if(c.bestBet.type === 'btts') score += 3;
    else if(c.bestBet.type === 'over15') score += 2;
    else score += 4;

    if(c.bestBet.odds >= 1.30 && c.bestBet.odds <= 1.60) score += 3;

    return score;
  }

  function collect(dateKeys, minAdjProb, minValue, minConf, minOdds, maxOdds){
    var types = ['over15','over25','under25','under35','btts'];
    var out = [];

    ALL_MATCHES.forEach(function(m){
      if(!passesSelectionFilter(m)) return;
      if(dateKeys.indexOf(m.dateKey) === -1) return;

      types.forEach(function(t){
        var c = buildMarketCandidate(m, t);
        if(!c || !c.bestBet) return;

        if(c.bestBet.adjProb < minAdjProb) return;
        if(c.bestBet.value < minValue) return;
        if(c.confidence < minConf) return;
        if(c.bestBet.odds < minOdds || c.bestBet.odds > maxOdds) return;
        if(!profitFilter(c)) return;

        c.ticketScore = Math.round(rankProfitCandidate(c));
        out.push(c);
      });
    });

    out.sort(function(a, b){
      if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
      if((b.bestBet.adjProb || 0) !== (a.bestBet.adjProb || 0)) return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
      return (b.bestBet.value || 0) - (a.bestBet.value || 0);
    });

    return out;
  }

  var todayKey = makeDateKey(now);
  var tomorrowKey = makeDateKey(new Date(now.getTime() + 86400000));

  var candidates = collect([todayKey], 72, 0.01, 48, 1.22, 1.75);
  if(!candidates.length) candidates = collect([todayKey], 70, 0.005, 45, 1.18, 1.85);
  if(!candidates.length) candidates = collect([todayKey, tomorrowKey], 70, 0.005, 45, 1.18, 1.85);

  if(candidates.length){
    finalizeTicket('profit_single', '📈 Profit Focus (Single)', [candidates[0]], candidates[0].bestBet.odds);
    return;
  }

  finalizeTicket('profit_single', '📈 Profit Focus (Single)', [], 1);
}

function generateBigWinTicket(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 70,
    minValue: 0.010,
    minConf: 48,
    minOdd: 1.20,
    maxOdd: 1.80,
    minPicks: 8,
    maxPicks: 12,
    targetMinOdds: 30.00,
    targetMaxOdds: 80.00,
    hardMaxOdds: 100.00,
    maxSameLeague: 2,
    maxSameMarket: 4
  };

  for(var relax = 0; relax <= 3; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= pack.profile.minPicks && chosen.totalOdds >= pack.profile.targetMinOdds){
      finalizeTicket('big_win', '🚀 Mega Big Win', chosen.picks, chosen.totalOdds);
      return;
    }
  }

  finalizeTicket('big_win', '🚀 Mega Big Win', [], 1);
}


function makeTicketPreview(type, label, picks, totalOdds, riskLabel, summary){
  picks = Array.isArray(picks) ? picks : [];
  var combinedProb = picks.length ? computeConservativeCombinedProb(picks) : 0;
  var avgEdge = picks.length ? (picks.reduce(function(acc, p){ return acc + Number((p.bestBet && p.bestBet.value) || 0); }, 0) / picks.length) : 0;
  return {
    type: type,
    label: label,
    picks: picks,
    totalOdds: totalOdds || 1,
    combinedProb: combinedProb,
    avgEdge: avgEdge,
    riskLabel: riskLabel || '—',
    summary: summary || '',
    isEmpty: !picks.length
  };
}

function buildSmartTicketPreview(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 68,
    minValue: 0.015,
    minConf: 52,
    minOdd: 1.18,
    maxOdd: 1.95,
    minPicks: 2,
    maxPicks: 4,
    targetMinOdds: 1.65,
    targetMaxOdds: 3.20,
    hardMaxOdds: 3.80,
    maxSameLeague: 1,
    maxSameMarket: 2
  };
  for(var relax = 0; relax <= 2; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= pack.profile.minPicks && chosen.totalOdds >= pack.profile.targetMinOdds){
      return makeTicketPreview('simple', '🛡️ Bilet Smart EV', chosen.picks, chosen.totalOdds, 'Scăzut-mediu', '2-4 selecții echilibrate, fără să forțeze cota de dragul show-ului.');
    }
  }
  return makeTicketPreview('simple', '🛡️ Bilet Smart EV', [], 1, '—', 'Nu are încă material suficient de curat.');
}

function buildConservativeTicketPreview(){
  var baseProfile = {
    allowedTypes: ['over15','over25','under35','btts'],
    minAdjProb: 72,
    minValue: 0.008,
    minConf: 48,
    minOdd: 1.12,
    maxOdd: 1.58,
    minPicks: 3,
    maxPicks: 5,
    targetMinOdds: 1.90,
    targetMaxOdds: 4.20,
    hardMaxOdds: 5.20,
    maxSameLeague: 1,
    maxSameMarket: 3
  };
  for(var relax = 0; relax <= 3; relax++){
    var pack = collectCandidates(baseProfile.allowedTypes, baseProfile, relax);
    pack.list.sort(function(a,b){
      return (b.ticketScore || 0) - (a.ticketScore || 0);
    });
    var chosen = selectDiversifiedPicks(pack.list, pack.profile);
    if(chosen.picks.length >= 3 && chosen.totalOdds >= 1.85){
      return makeTicketPreview('simple', '🧊 Bilet conservator', chosen.picks, chosen.totalOdds, 'Scăzut-mediu', 'Pentru zilele în care vrei structură curată și piețe robuste.');
    }
  }
  return makeTicketPreview('simple', '🧊 Bilet conservator', [], 1, '—', 'Momentan piața nu oferă 3-5 selecții suficient de curate.');
}

function buildBestEventTicketPreview(){
  var now = new Date();
  function makeDateKey(d){
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var todayKey = makeDateKey(now);
  var tomorrowKey = makeDateKey(new Date(now.getTime() + 86400000));
  var types = ['over15','over25','under35','btts'];

  function collectBest(dateKeys, minAdjProb){
    var out = [];
    ALL_MATCHES.forEach(function(m){
      if(!passesSelectionFilter(m)) return;
      if(dateKeys.indexOf(m.dateKey) === -1) return;
      types.forEach(function(t){
        var c = buildMarketCandidate(m, t);
        if(!c || !c.bestBet) return;
        if(c.bestBet.adjProb < minAdjProb) return;
        if(c.bestBet.odds < 1.12 || c.bestBet.odds > 1.68) return;
        out.push(c);
      });
    });
    out.sort(function(a, b){
      if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
      return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
    });
    return out;
  }

  var candidates = collectBest([todayKey], 74);
  if(!candidates.length) candidates = collectBest([todayKey], 70);
  if(!candidates.length) candidates = collectBest([todayKey, tomorrowKey], 68);

  if(candidates.length){
    var picks = [candidates[0]];
    for(var i = 1; i < candidates.length; i++){
      var c = candidates[i];
      if(c.eventId === picks[0].eventId) continue;
      if((picks[0].bestBet.odds * c.bestBet.odds) > 3.20) continue;
      picks.push(c);
      break;
    }
    return makeTicketPreview('best_single', '🎯 Biletul zilei', picks, picks.reduce(function(acc, item){ return acc * item.bestBet.odds; }, 1), picks.length === 1 ? 'Scăzut' : 'Scăzut-mediu', 'Primul buton pe care merită să-l apeși când vrei selecția cea mai clară.');
  }
  return makeTicketPreview('best_single', '🎯 Biletul zilei', [], 1, '—', 'Nu există încă o alegere destul de clară pentru formatul de azi.');
}

function buildProfitFocusTicketPreview(){
  var now = new Date();
  function makeDateKey(d){
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function likelyScoreSupports(m, type){
    var ls = parseLikelyScore(m.mostLikelyScore);
    if(!ls) return true;
    if(type === 'over15') return ls.total >= 2;
    if(type === 'over25') return ls.total >= 3;
    if(type === 'btts') return ls.btts;
    if(type === 'homeWin') return ls.home > ls.away;
    if(type === 'awayWin') return ls.away > ls.home;
    return true;
  }
  function profitFilter(c){
    if(!c || !c.bestBet) return false;
    var t = c.bestBet.type;
    var odds = Number(c.bestBet.odds || 0);
    var value = Number(c.bestBet.value || 0);
    var adjProb = Number(c.bestBet.adjProb || 0);
    var conf = Number(c.confidence || 0);
    var xgHome = Number(c.xgHome || 0);
    var xgAway = Number(c.xgAway || 0);
    var xgTotal = Number(c.xgTotal || 0);
    if(odds < 1.22 || odds > 1.75) return false;
    if(value < 0.01) return false;
    if(adjProb < 72) return false;
    if(conf < 48) return false;
    if(!likelyScoreSupports(c, t)) return false;
    if(t === 'over15') return c.probOver15 >= 79 && xgTotal >= 2.25 && c.bestBet.adjProb >= 76 && Number(c.bestBet.edgePct || 0) >= 4 && c.bestBet.odds >= 1.25;
    if(t === 'over25') return c.probOver25 >= 60 && xgTotal >= 2.60;
    if(t === 'btts') return c.probBtts >= 62 && xgHome >= 1.00 && xgAway >= 1.00 && c.bestBet.adjProb >= 62;
    if(t === 'under25') return c.probUnder25 >= 56 && xgTotal <= 2.55;
    if(t === 'under35') return c.probUnder35 >= 68 && xgTotal <= 3.05;
    if(t === 'homeWin') return c.predictedResult === 'H' && c.favorite === 'H' && (xgHome - xgAway) >= 0.30 && c.probDraw < 27;
    if(t === 'draw') return c.probDraw >= 28 && Math.abs(xgHome - xgAway) <= 0.35 && Math.abs(c.probHome - c.probAway) <= 10;
    if(t === 'awayWin') return c.predictedResult === 'A' && c.favorite === 'A' && (xgAway - xgHome) >= 0.30 && c.probDraw < 27;
    return false;
  }
  function rankProfitCandidate(c){
    var score = 0;
    score += (c.bestBet.adjProb * 0.46);
    score += (Math.max(0, c.bestBet.value) * 100 * 0.38);
    score += (c.confidence * 0.16);
    if(c.bestBet.type === 'under25' || c.bestBet.type === 'under35') score += 8;
    else if(c.bestBet.type === 'over25') score += 6;
    else if(c.bestBet.type === 'btts') score += 3;
    else if(c.bestBet.type === 'over15') score += 2;
    else score += 4;
    if(c.bestBet.odds >= 1.30 && c.bestBet.odds <= 1.60) score += 3;
    return score;
  }
  function collect(dateKeys, minAdjProb, minValue, minConf, minOdds, maxOdds){
    var types = ['over15','over25','under25','under35','btts'];
    var out = [];
    ALL_MATCHES.forEach(function(m){
      if(!passesSelectionFilter(m)) return;
      if(dateKeys.indexOf(m.dateKey) === -1) return;
      types.forEach(function(t){
        var c = buildMarketCandidate(m, t);
        if(!c || !c.bestBet) return;
        if(c.bestBet.adjProb < minAdjProb) return;
        if(c.bestBet.value < minValue) return;
        if(c.confidence < minConf) return;
        if(c.bestBet.odds < minOdds || c.bestBet.odds > maxOdds) return;
        if(!profitFilter(c)) return;
        c.ticketScore = Math.round(rankProfitCandidate(c));
        out.push(c);
      });
    });
    out.sort(function(a, b){
      if(b.ticketScore !== a.ticketScore) return b.ticketScore - a.ticketScore;
      if((b.bestBet.adjProb || 0) !== (a.bestBet.adjProb || 0)) return (b.bestBet.adjProb || 0) - (a.bestBet.adjProb || 0);
      return (b.bestBet.value || 0) - (a.bestBet.value || 0);
    });
    return out;
  }
  var todayKey = makeDateKey(now);
  var tomorrowKey = makeDateKey(new Date(now.getTime() + 86400000));
  var candidates = collect([todayKey], 72, 0.01, 48, 1.22, 1.75);
  if(!candidates.length) candidates = collect([todayKey], 70, 0.005, 45, 1.18, 1.85);
  if(!candidates.length) candidates = collect([todayKey, tomorrowKey], 70, 0.005, 45, 1.18, 1.85);
  if(candidates.length){
    return makeTicketPreview('profit_single', '📈 Profit Focus (Single)', [candidates[0]], candidates[0].bestBet.odds, 'Scăzut+', 'Single EV+ pentru cine preferă lovituri scurte, nu bilete încărcate.');
  }
  return makeTicketPreview('profit_single', '📈 Profit Focus (Single)', [], 1, '—', 'Momentan nu are un single suficient de curat.');
}

function rankPresetTicket(ticket){
  if(!ticket || !ticket.picks || !ticket.picks.length) return -999;
  var riskPenaltyMap = {'Scăzut':0,'Scăzut+':1,'Scăzut-mediu':3,'Mediu':6,'Mediu+':8,'Ridicat':12};
  var riskPenalty = riskPenaltyMap[ticket.riskLabel] != null ? riskPenaltyMap[ticket.riskLabel] : 5;
  return (ticket.combinedProb * 0.75) + (Math.max(0, ticket.avgEdge) * 100 * 0.45) + (ticket.picks.length === 1 ? 8 : ticket.picks.length === 2 ? 6 : 3) - riskPenalty;
}


function togglePresetRows(id, btn){
  var box = $(id);
  if(!box || !btn) return;
  var open = box.classList.toggle('open');
  btn.classList.toggle('open', open);
  var collapsed = btn.getAttribute('data-collapsed') || 'Detalii';
  var expanded = btn.getAttribute('data-expanded') || 'Ascunde';
  var label = btn.querySelector('.label');
  if(label) label.textContent = open ? expanded : collapsed;
}

function renderPresetTicketCards(targetId){
  var target = $(targetId);
  if(!target) return;
  var presets = getPresetTicketCards();
  presets.sort(function(a,b){ return (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0); });
  if(targetId === "ticket-lane-board") presets = presets.slice(0,3);
  target.innerHTML = presets.map(function(item, idx){
    var t = item.preview || {};
    var picks = t.picks || [];
    var markets = uniqueReasons(picks.map(function(p){ return p.bestBet && p.bestBet.label; }).filter(Boolean)).slice(0,3);
    var accent = item.accent || 'var(--acc)';
    var badgeClass = t.isEmpty ? 'muted' : (String(t.riskLabel || '').indexOf('Scăzut') === 0 ? 'good' : 'warn');
    var cardKey = targetId + '-' + idx;
    var firstRow = picks[0] ? ('<div class="focus-mini-item">'+
      '<div><div class="focus-mini-item-main">'+renderEventIdentity(picks[0], { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc((picks[0].dateLabel || '') + ((picks[0].timeLabel || '') ? (' ' + (picks[0].timeLabel || '')) : '')) })+'</div></div>'+
      '<div class="focus-mini-item-right">'+picks[0].bestBet.label+'<br>@ '+picks[0].bestBet.odds.toFixed(2)+'</div>'+
    '</div>') : '<div class="focus-mini-item"><div><div class="focus-mini-item-main">Nimic foarte curat acum</div><div class="focus-mini-item-sub">Generatorul rămâne disponibil, dar nu forțează selecții doar ca să umple ecranul.</div></div></div>';
    var extraRows = picks.slice(1).map(function(p){
      return '<div class="focus-mini-item">'+
        '<div><div class="focus-mini-item-main">'+renderEventIdentity(p, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc((p.dateLabel || '') + ((p.timeLabel || '') ? (' ' + (p.timeLabel || '')) : '')) })+'</div></div>'+
        '<div class="focus-mini-item-right">'+p.bestBet.label+'<br>@ '+p.bestBet.odds.toFixed(2)+'</div>'+
      '</div>';
    }).join('');
    var extraCount = Math.max(0, picks.length - 1);
    return '<div class="focus-card '+(item.recommended ? 'recommended' : '')+'" style="--focus-accent:'+accent+'">'+
      '<div class="focus-card-head">'+
        '<div><div class="focus-card-title">'+item.title+'</div><div class="focus-card-sub">'+(t.summary || 'Generator dedicat acestui format.')+'</div></div>'+
        '<div class="focus-card-side"><span class="focus-badge '+badgeClass+'">'+(t.isEmpty ? 'Așteptare' : (t.riskLabel || '—'))+'</span>'+
        '</div>'+
      '</div>'+
      '<div class="focus-card-metrics">'+
        '<div class="focus-metric"><div class="v">'+(picks.length || 0)+'</div><div class="l">Selecții</div></div>'+
        '<div class="focus-metric"><div class="v">'+((t.totalOdds || 1).toFixed(2))+'x</div><div class="l">Cotă</div></div>'+
        '<div class="focus-metric"><div class="v">'+(t.isEmpty ? '—' : (t.combinedProb || 0).toFixed(1)+'%')+'</div><div class="l">Prob. cons.</div></div>'+
      '</div>'+
      '<div class="focus-chip-row">'+(markets.length ? markets.map(function(m){ return '<span class="focus-chip">'+m+'</span>'; }).join('') : '<span class="focus-chip">fără selecții curate</span>')+'</div>'+
      '<div class="focus-mini-list">'+firstRow+(extraCount > 0 ? '<div class="focus-extra-rows" id="focus-extra-'+cardKey+'">'+extraRows+'</div>' : '')+'</div>'+
      (extraCount > 0 ? '<button class="focus-more-toggle" onclick="togglePresetRows(&#39;focus-extra-'+cardKey+'&#39;, this)" data-collapsed="Vezi mai mult" data-expanded="Ascunde"><span class="label">Vezi mai mult</span><strong>Total '+picks.length+'</strong></button>' : '')+
      '<div class="focus-footer">'+
        '<div class="focus-footer-note">'+(t.isEmpty ? 'Așteaptă date mai bune sau verifică Analiză.' : 'Edge mediu ' + (t.avgEdge >= 0 ? '+' : '') + ((t.avgEdge || 0) * 100).toFixed(1) + '%')+'</div>'+
        '<button class="btn '+(item.recommended ? 'btn-green' : 'btn-primary')+'" style="justify-content:center" onclick="'+item.action+'">'+item.btn+'</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderFocusMarketCard(){
  var target = $('focus-market-card');
  if(!target) return;

  var supportedHistoryMarkets = (BET_TYPES || []).map(function(b){ return b.label; });
  var historyCutoff = new Date(Date.now() - (21 * 86400000));
  var historyRows = (RECOMMENDATION_LOG || []).filter(function(r){
    if(!r || supportedHistoryMarkets.indexOf(r.market) === -1) return false;
    var loggedAt = new Date(r.logged_at || r.prediction_created_at || 0);
    if(!isFinite(loggedAt.getTime())) return false;
    return loggedAt >= historyCutoff;
  });

  function summarizeRows(rows){
    var groups = {};
    (rows || []).forEach(function(r){
      var key = r.market || '—';
      if(!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.keys(groups).map(function(key){
      var list = groups[key];
      var settled = list.filter(function(r){ return r.status === 'win' || r.status === 'lose'; });
      var bets = settled.length;
      var wins = settled.filter(function(r){ return r.status === 'win' || r.won === true; }).length;
      var profit = settled.reduce(function(acc, r){
        var o = Number(r.odds || 0);
        var isWin = r.status === 'win' || r.won === true;
        return acc + (isWin ? (o > 1 ? (o - 1) : 0) : -1);
      }, 0);
      return {
        key: key,
        total: list.length,
        pending: list.length - bets,
        bets: bets,
        wins: wins,
        roi: bets ? (profit * 100 / bets) : 0,
        winrate: bets ? (wins * 100 / bets) : 0,
        avgOdds: bets ? settled.reduce(function(acc, r){ return acc + Number(r.odds || 0); }, 0) / bets : 0
      };
    });
  }

  var rows = summarizeRows(historyRows).filter(function(item){ return item && item.bets > 0; });
  rows.sort(function(a,b){
    if((b.roi || 0) !== (a.roi || 0)) return (b.roi || 0) - (a.roi || 0);
    if((b.winrate || 0) !== (a.winrate || 0)) return (b.winrate || 0) - (a.winrate || 0);
    return (b.bets || 0) - (a.bets || 0);
  });

  var best = rows[0] || null;
  if(!best){
    target.innerHTML = '<div class="focus-side-title">📌 Top trend 21 zile</div>';
    return;
  }

  target.innerHTML = '<div class="focus-side-title">📌 Top trend 21 zile</div>'+
    '<div style="font-size:18px;font-weight:800;color:var(--txt);margin-bottom:10px">'+(best.key || '—')+'</div>'+
    '<div class="focus-side-metrics">'+
      '<div class="focus-metric"><div class="v">'+Number(best.winrate || 0).toFixed(1)+'%</div><div class="l">Win rate</div></div>'+
      '<div class="focus-metric"><div class="v">'+(Number(best.roi || 0) >= 0 ? '+' : '')+Number(best.roi || 0).toFixed(1)+'%</div><div class="l">ROI</div></div>'+
      '<div class="focus-metric"><div class="v">'+Number(best.avgOdds || 0).toFixed(2)+'</div><div class="l">Cotă medie</div></div>'+
      '<div class="focus-metric"><div class="v">'+Number(best.wins || 0)+'/'+Number(best.bets || 0)+'</div><div class="l">Win / jucate</div></div>'+
    '</div>'+
    '';
}

function renderFocusSinglesCard(){
  var target = $('focus-singles-card');
  if(!target) return;
  var list = ALL_MATCHES.filter(function(m){
    return passesSelectionFilter(m) && m.bestBet && Number(m.bestBet.odds || 0) >= 1.12 && Number(m.bestBet.odds || 0) <= 1.75;
  }).sort(function(a,b){
    var aScore = (a.smartScore || 0) * 0.65 + (a.confidence || 0) * 0.35;
    var bScore = (b.smartScore || 0) * 0.65 + (b.confidence || 0) * 0.35;
    return bScore - aScore;
  }).slice(0,3);
  if(!list.length){
    target.innerHTML = '<div class="focus-side-title">⚡ Singles rapide</div><div class="focus-side-sub">Nu există single-uri suficient de curate în intervalul util.</div>';
    return;
  }
  target.innerHTML = '<div class="focus-side-title">⚡ Singles rapide</div><div class="focus-side-sub">Trei opțiuni scurte pe care merită să le verifici înainte să intri în toate categoriile.</div>'+
    '<div class="focus-list">'+list.map(function(m){
      return '<div class="focus-list-row">'+
        '<div><strong>'+renderEventIdentity(m, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc((m.bestBet && m.bestBet.label ? m.bestBet.label : '—')) })+'</strong></div>'+
        '<b>@ '+(m.bestBet && m.bestBet.odds ? Number(m.bestBet.odds).toFixed(2) : '—')+'</b>'+
      '</div>';
    }).join('')+'</div>'+
    '<div class="focus-footer" style="margin-top:12px"><div class="focus-footer-note">Dacă vrei context complet, intră în Analiză pentru filtre și breakdown.</div><button class="btn btn-primary" onclick="switchTab(&#39;meciuri&#39;)">Deschide analiza</button></div>';
}

function renderFocusCenter(){
  renderPresetTicketCards('focus-ticket-grid');
  renderFocusMarketCard();
  renderFocusSinglesCard();
}

function renderTicketLaneBoard(){
  renderPresetTicketCards('ticket-lane-board');
}


function clearCurrentTicket(){
  BILETE = null;
  renderBilete();
}

function placeCurrentTicket(){
  if(!BILETE || BILETE.picks.length === 0) return;

  var stake = prompt('Introdu miza biletului (RON):', '50');
  if(stake === null) return;
  stake = parseFloat(String(stake).replace(',', '.'));
  if(!isFinite(stake) || stake <= 0){ toast('Miză invalidă', 'err'); return; }

  var ticket = {
    id: Date.now(),
    date: new Date().toLocaleDateString('ro-RO'),
    placedAt: new Date().toISOString(),
    picks: BILETE.picks.map(function(m){
      var b = m.bestBet || m;
      return {
        eventId: m.eventId || null,
        predictionId: m.id || null,
        eventDate: m.date || null,
        home: m.home,
        away: m.away,
        homeApiId: m.homeApiId || null,
        awayApiId: m.awayApiId || null,
        leagueApiId: m.leagueApiId || null,
        bet: b.label,
        marketType: b.type || inferMarketTypeFromLabel(b.label),
        odds: b.odds,
        prob: b.adjProb,
        league: m.league,
        dateLabel: m.dateLabel || '',
        timeLabel: m.timeLabel || '',
        score: m.mostLikelyScore || null,
        why: m.why || '',
        matchStatus: 'pending',
        result: 'pending'
      };
    }),
    totalOdds: BILETE.totalOdds,
    stake: stake,
    status: 'pending',
    profit: 0,
    type: 'generated',
    criteria: BILETE.label || 'Bilet generat',
    manualOverride: false,
    autoUpdatedAt: null,
    autoSettledOdds: null
  };

  TRACKING.unshift(ticket);
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  toast('Bilet inregistrat in tracking!', 'ok');
  BILETE = null;
  renderBilete();
  autoSyncTrackingStatuses();
  renderTracking();
  calcBankroll();
}


// ============================================================
// TRACKING
// ============================================================
function toggleExtraForm(){
  $('extra-form').classList.toggle('show');
  if($('extra-form').classList.contains('show')) $('ex-date').value = new Date().toISOString().split('T')[0];
}

function addExtraTicket(){
  var date=$('ex-date').value, picksCount=parseInt($('ex-picks').value), odds=parseFloat($('ex-odds').value), stake=parseFloat($('ex-stake').value);
  if(!date||isNaN(picksCount)||isNaN(odds)||isNaN(stake)){ toast('Completeaza toate campurile', 'err'); return; }
  var ticket = {id:Date.now(), date:new Date(date).toLocaleDateString('ro-RO'), placedAt:new Date().toISOString(), picks:Array(picksCount).fill({home:'Extra',away:'Match',bet:'Custom',odds:1,prob:0,matchStatus:'manual',result:'pending'}), totalOdds:odds, stake:stake, status:'pending', profit:0, type:'extra', criteria:'Bilet Extra', manualOverride:true, autoUpdatedAt:null, autoSettledOdds:null};
  TRACKING.unshift(ticket);
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking(); toggleExtraForm(); toast('Bilet extra adaugat!', 'ok');
}

function inferMarketTypeFromLabel(label){
  var txt = String(label || '').toLowerCase();
  if(!txt) return null;
  if(txt.indexOf('over 1.5') >= 0 || txt.indexOf('peste 1.5') >= 0 || txt === 'over15') return 'over15';
  if(txt.indexOf('over 2.5') >= 0 || txt.indexOf('peste 2.5') >= 0 || txt === 'over25') return 'over25';
  if(txt.indexOf('under 3.5') >= 0 || txt.indexOf('sub 3.5') >= 0 || txt === 'under35') return 'under35';
  if(txt.indexOf('btts') >= 0 || txt.indexOf('gg') >= 0 || txt.indexOf('ambele echipe') >= 0) return 'btts';
  return null;
}

function normalizeTicketEntityName(str){
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isFinishedEventStatus(status, period){
  var s = String(status || '').toLowerCase().trim();
  var p = String(period || '').toLowerCase().trim();
  return ['finished','ft','fulltime','full-time','completed','complete','after penalties','aet','after extra time'].indexOf(s) >= 0 ||
         ['ft','aet','pen'].indexOf(p) >= 0;
}

function isVoidEventStatus(status){
  var s = String(status || '').toLowerCase().trim();
  return ['cancelled','canceled','postponed','abandoned','suspended','void','awarded'].indexOf(s) >= 0;
}

function getNumericOrNull(v){
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function getScorePairFromSource(obj){
  if(!obj) return {homeScore:null, awayScore:null};
  var homeScore = getNumericOrNull(obj.home_score != null ? obj.home_score : obj.homeScore);
  var awayScore = getNumericOrNull(obj.away_score != null ? obj.away_score : obj.awayScore);
  return {homeScore:homeScore, awayScore:awayScore};
}

function evaluateMarketOutcome(marketType, homeScore, awayScore){
  if(homeScore == null || awayScore == null) return 'pending';
  var total = Number(homeScore) + Number(awayScore);
  if(marketType === 'over15') return total >= 2 ? 'win' : 'loss';
  if(marketType === 'over25') return total >= 3 ? 'win' : 'loss';
  if(marketType === 'under35') return total <= 3 ? 'win' : 'loss';
  if(marketType === 'btts') return (Number(homeScore) > 0 && Number(awayScore) > 0) ? 'win' : 'loss';
  return 'pending';
}

function getEventDateMs(obj){
  var raw = obj && (obj.event_date || obj.eventDate || obj.date || null);
  var ms = raw ? new Date(raw).getTime() : NaN;
  return isFinite(ms) ? ms : null;
}

function scoreEventCandidate(ev, pick){
  if(!ev || !pick) return -1;
  var score = 0;
  var pickEventId = pick.eventId || pick.event_id || null;
  if(pickEventId != null && String(ev.id) === String(pickEventId)) score += 1000;

  var evHome = normalizeTicketEntityName(ev.home_team || ev.home || '');
  var evAway = normalizeTicketEntityName(ev.away_team || ev.away || '');
  var pkHome = normalizeTicketEntityName(pick.home || '');
  var pkAway = normalizeTicketEntityName(pick.away || '');

  if(evHome && pkHome && evHome === pkHome) score += 100;
  if(evAway && pkAway && evAway === pkAway) score += 100;
  if(evHome && pkAway && evHome === pkAway) score -= 80;
  if(evAway && pkHome && evAway === pkHome) score -= 80;

  var evDateMs = getEventDateMs(ev);
  var pkDateMs = getEventDateMs(pick);
  if(evDateMs != null && pkDateMs != null){
    var diffHours = Math.abs(evDateMs - pkDateMs) / 36e5;
    if(diffHours <= 1) score += 40;
    else if(diffHours <= 6) score += 20;
    else if(diffHours <= 30) score += 8;
    else score -= Math.min(20, diffHours);
  }

  return score;
}

function findEventForStoredPick(pick){
  if(!pick) return null;
  var best = null;
  var bestScore = -Infinity;
  (ALL_EVENTS || []).forEach(function(ev){
    var sc = scoreEventCandidate(ev, pick);
    if(sc > bestScore){
      bestScore = sc;
      best = ev;
    }
  });
  return bestScore >= 120 ? best : null;
}

function scoreRecommendationLogCandidate(row, pick, marketType){
  if(!row || !pick) return -1;
  var score = 0;
  if(marketType && row.market_key === marketType) score += 60;
  var pickEventId = pick.eventId || pick.event_id || null;
  if(pickEventId != null && row.event_id != null && String(row.event_id) === String(pickEventId)) score += 1000;

  var rowHome = normalizeTicketEntityName(row.home || '');
  var rowAway = normalizeTicketEntityName(row.away || '');
  var pkHome = normalizeTicketEntityName(pick.home || '');
  var pkAway = normalizeTicketEntityName(pick.away || '');
  if(rowHome && pkHome && rowHome === pkHome) score += 100;
  if(rowAway && pkAway && rowAway === pkAway) score += 100;

  var rowDateMs = getEventDateMs({event_date: row.event_date});
  var pkDateMs = getEventDateMs(pick);
  if(rowDateMs != null && pkDateMs != null){
    var diffHours = Math.abs(rowDateMs - pkDateMs) / 36e5;
    if(diffHours <= 1) score += 40;
    else if(diffHours <= 6) score += 20;
    else if(diffHours <= 30) score += 8;
    else score -= Math.min(20, diffHours);
  }
  return score;
}

function findRecommendationLogForPick(pick, marketType){
  if(!pick) return null;
  var best = null;
  var bestScore = -Infinity;
  (RECOMMENDATION_LOG || []).forEach(function(row){
    var sc = scoreRecommendationLogCandidate(row, pick, marketType);
    if(sc > bestScore){
      bestScore = sc;
      best = row;
    }
  });
  return bestScore >= 180 ? best : null;
}

function getAutoSettlementForPick(pick){
  var marketType = pick.marketType || inferMarketTypeFromLabel(pick.bet || pick.market || '');
  var event = findEventForStoredPick(pick);
  if(event){
    var scorePair = getScorePairFromSource(event);
    var eventStatus = String(event.status || '').toLowerCase();
    if(isVoidEventStatus(event.status)){
      return {
        eventId: event.id || pick.eventId || null,
        eventDate: event.event_date || pick.eventDate || null,
        matchStatus: eventStatus || 'void',
        result: 'anulat',
        homeScore: scorePair.homeScore,
        awayScore: scorePair.awayScore,
        marketType: marketType,
        source: 'events'
      };
    }
    if(isFinishedEventStatus(event.status, event.period) || (scorePair.homeScore != null && scorePair.awayScore != null && eventStatus === 'finished')){
      return {
        eventId: event.id || pick.eventId || null,
        eventDate: event.event_date || pick.eventDate || null,
        matchStatus: 'finished',
        result: evaluateMarketOutcome(marketType, scorePair.homeScore, scorePair.awayScore),
        homeScore: scorePair.homeScore,
        awayScore: scorePair.awayScore,
        marketType: marketType,
        source: 'events'
      };
    }
    return {
      eventId: event.id || pick.eventId || null,
      eventDate: event.event_date || pick.eventDate || null,
      matchStatus: eventStatus || 'pending',
      result: 'pending',
      homeScore: scorePair.homeScore,
      awayScore: scorePair.awayScore,
      marketType: marketType,
      source: 'events'
    };
  }

  var row = findRecommendationLogForPick(pick, marketType);
  if(row){
    var rowScore = getScorePairFromSource(row);
    if(String(row.status || '').toLowerCase() === 'void'){
      return {
        eventId: row.event_id || pick.eventId || null,
        eventDate: row.event_date || pick.eventDate || null,
        matchStatus: 'void',
        result: 'anulat',
        homeScore: rowScore.homeScore,
        awayScore: rowScore.awayScore,
        marketType: marketType,
        source: 'log'
      };
    }
    if(row.won != null){
      return {
        eventId: row.event_id || pick.eventId || null,
        eventDate: row.event_date || pick.eventDate || null,
        matchStatus: 'finished',
        result: row.won ? 'win' : 'loss',
        homeScore: rowScore.homeScore,
        awayScore: rowScore.awayScore,
        marketType: marketType,
        source: 'log'
      };
    }
    if(rowScore.homeScore != null && rowScore.awayScore != null){
      return {
        eventId: row.event_id || pick.eventId || null,
        eventDate: row.event_date || pick.eventDate || null,
        matchStatus: 'finished',
        result: evaluateMarketOutcome(marketType, rowScore.homeScore, rowScore.awayScore),
        homeScore: rowScore.homeScore,
        awayScore: rowScore.awayScore,
        marketType: marketType,
        source: 'log'
      };
    }
  }

  return {
    eventId: pick.eventId || null,
    eventDate: pick.eventDate || null,
    matchStatus: pick.matchStatus || 'pending',
    result: pick.result || 'pending',
    homeScore: pick.homeScore != null ? pick.homeScore : null,
    awayScore: pick.awayScore != null ? pick.awayScore : null,
    marketType: marketType,
    source: null
  };
}

function applyAutoSettlementToPick(pick, settlement){
  if(!pick || !settlement) return false;
  var changed = false;
  function setField(key, val){
    if((pick[key] == null ? null : pick[key]) !== (val == null ? null : val)){
      pick[key] = val;
      changed = true;
    }
  }
  setField('eventId', settlement.eventId != null ? settlement.eventId : pick.eventId || null);
  setField('eventDate', settlement.eventDate != null ? settlement.eventDate : pick.eventDate || null);
  setField('marketType', settlement.marketType || pick.marketType || inferMarketTypeFromLabel(pick.bet || ''));
  setField('matchStatus', settlement.matchStatus || 'pending');
  setField('result', settlement.result || 'pending');
  setField('homeScore', settlement.homeScore != null ? settlement.homeScore : null);
  setField('awayScore', settlement.awayScore != null ? settlement.awayScore : null);
  setField('autoSource', settlement.source || null);
  return changed;
}

function computeAutoTicketSettlement(ticket){
  if(!ticket || !ticket.picks || !ticket.picks.length) return null;
  var results = ticket.picks.map(function(p){ return p.result || 'pending'; });
  var hasPending = results.some(function(r){ return r === 'pending' || !r; });
  var hasLoss = results.some(function(r){ return r === 'loss'; });
  var wins = results.filter(function(r){ return r === 'win'; }).length;
  var voids = results.filter(function(r){ return r === 'anulat'; }).length;

  if(hasLoss) return {status:'loss', profit:-(ticket.stake || 0), settledOdds:null};
  if(hasPending) return {status:'pending', profit:0, settledOdds:null};
  if(wins === 0 && voids > 0) return {status:'anulat', profit:0, settledOdds:1};

  var settledOdds = 1;
  ticket.picks.forEach(function(p){
    if((p.result || 'pending') === 'win'){
      var odd = Number(p.odds || 1);
      if(isFinite(odd) && odd > 1) settledOdds *= odd;
    }
  });
  settledOdds = +settledOdds.toFixed(4);
  return {status:'win', profit:+(((settledOdds - 1) * (ticket.stake || 0)).toFixed(2)), settledOdds:settledOdds};
}

function autoSyncTrackingStatuses(){
  if(!Array.isArray(TRACKING) || !TRACKING.length) return false;
  if((!ALL_EVENTS || !ALL_EVENTS.length) && (!RECOMMENDATION_LOG || !RECOMMENDATION_LOG.length)) return false;

  var changed = false;
  TRACKING.forEach(function(ticket){
    if(!ticket) return;
    if(ticket.manualOverride == null && ticket.type !== 'extra' && ticket.status && ticket.status !== 'pending' && !ticket.autoUpdatedAt){
      ticket.manualOverride = true;
      changed = true;
    }
    if(!Array.isArray(ticket.picks) || !ticket.picks.length) return;

    ticket.picks.forEach(function(pick){
      if(!pick) return;
      var settlement = getAutoSettlementForPick(pick);
      if(applyAutoSettlementToPick(pick, settlement)) changed = true;
    });

    if(ticket.type === 'extra' || ticket.manualOverride) return;

    var auto = computeAutoTicketSettlement(ticket);
    if(!auto) return;

    if(ticket.status !== auto.status){
      ticket.status = auto.status;
      changed = true;
    }
    if(Number(ticket.profit || 0) !== Number(auto.profit || 0)){
      ticket.profit = Number(auto.profit || 0);
      changed = true;
    }
    var nextOdds = auto.settledOdds != null ? Number(auto.settledOdds) : null;
    var curOdds = ticket.autoSettledOdds != null ? Number(ticket.autoSettledOdds) : null;
    if(curOdds !== nextOdds){
      ticket.autoSettledOdds = nextOdds;
      changed = true;
    }
    var nowIso = new Date().toISOString();
    if(ticket.autoUpdatedAt !== nowIso && auto.status !== 'pending'){
      ticket.autoUpdatedAt = nowIso;
      changed = true;
    }
  });

  if(changed) localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  return changed;
}

function getStatusBadgeHtml(t){
  if(t.status==='win') return '<span class="badge-win">WIN</span>';
  if(t.status==='loss') return '<span class="badge-loss">LOSS</span>';
  if(t.status==='co') return '<span style="background:rgba(245,158,11,.15);color:var(--yel);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">CO</span>';
  if(t.status==='anulat') return '<span style="background:rgba(100,116,139,.15);color:var(--muted);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">X</span>';
  return '<span class="badge-pending">PENDING</span>';
}

function getPickStatusBadgeHtml(result){
  if(result === 'win') return '<span class="badge-win" style="font-size:9px;padding:2px 7px">WIN</span>';
  if(result === 'loss') return '<span class="badge-loss" style="font-size:9px;padding:2px 7px">LOSE</span>';
  if(result === 'anulat') return '<span style="background:rgba(100,116,139,.15);color:var(--muted);padding:2px 7px;border-radius:20px;font-size:9px;font-weight:700">VOID</span>';
  return '<span class="badge-pending" style="font-size:9px;padding:2px 7px">PENDING</span>';
}

function getTrackingModeBadgeHtml(t){
  if(t.type === 'extra') return '<span style="background:rgba(168,85,247,.14);color:var(--pur);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">MANUAL</span>';
  if(t.manualOverride) return '<span style="background:rgba(245,158,11,.14);color:var(--yel);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">MANUAL</span>';
  return '<span style="background:rgba(59,130,246,.14);color:var(--acc);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">AUTO</span>';
}

function renderTracking(){
  var gen=TRACKING.filter(function(t){ return t.type!=='extra'; });
  var genTotal=gen.length, genWins=gen.filter(function(t){ return t.status==='win'; }).length;
  var genWinRate=genTotal>0?(genWins/genTotal*100):0;
  var genProfit=gen.reduce(function(acc,t){ return acc+t.profit; },0);
  var genStakes=gen.reduce(function(acc,t){ return acc+(t.stake||0); },0);
  var genRoi=genStakes>0?((genProfit/genStakes)*100):0;
  $('tr-total').textContent=genTotal;
  $('tr-winrate').textContent=fmtPct(genWinRate);
  $('tr-roi').textContent=(genRoi>=0?'+':'')+genRoi.toFixed(2)+'%';

  var extra=TRACKING.filter(function(t){ return t.type==='extra'; });
  var exTotal=extra.length, exWins=extra.filter(function(t){ return t.status==='win'; }).length;
  var exWinRate=exTotal>0?(exWins/exTotal*100):0;
  var exProfit=extra.reduce(function(acc,t){ return acc+t.profit; },0);
  var exStakes=extra.reduce(function(acc,t){ return acc+(t.stake||0); },0);
  var exRoi=exStakes>0?((exProfit/exStakes)*100):0;
  $('tr-extra-total').textContent=exTotal;
  $('tr-extra-winrate').textContent=fmtPct(exWinRate);
  $('tr-extra-roi').textContent=(exRoi>=0?'+':'')+exRoi.toFixed(2)+'%';

  var container=$('tracking-container');
  if(TRACKING.length===0){ container.innerHTML='<div class="empty-state">Niciun pariu inregistrat.</div>'; return; }

  container.innerHTML = TRACKING.map(function(t,i){
    var profitStr=t.profit>0?'<span style="color:var(--grn)">+'+t.profit.toFixed(2)+' RON</span>':t.profit<0?'<span style="color:var(--red)">'+t.profit.toFixed(2)+' RON</span>':'<span style="color:var(--muted)">—</span>';
    var typeBadge=t.type==='extra'?'<span style="color:var(--pur);font-weight:700">EXTRA</span>':(t.type==='cota2'?'<span style="color:var(--yel);font-weight:700">COTA2</span>':'<span style="color:var(--acc);font-weight:700">GEN</span>');
    var oddsNote = (t.status === 'win' && t.autoSettledOdds && Number(t.autoSettledOdds) !== Number(t.totalOdds || 0))
      ? ' • Cotă auto '+Number(t.autoSettledOdds).toFixed(2)+'x'
      : '';
    var syncNote = t.type !== 'extra' ? (t.manualOverride ? 'manual' : (t.autoUpdatedAt ? ('auto '+fmtDateTime(t.autoUpdatedAt)) : 'auto activ')) : 'manual';
    return '<div class="match-card" style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">'+
        '<div>'+
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+typeBadge+getStatusBadgeHtml(t)+getTrackingModeBadgeHtml(t)+'</div>'+
          '<div style="font-size:14px;font-weight:800;margin-top:6px">'+(t.criteria||'Bilet')+'</div>'+
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">'+t.date+' • '+(t.picks?t.picks.length:0)+' selecții • Cotă '+(t.totalOdds||1).toFixed(2)+'x'+oddsNote+' • Miză '+(t.stake||0).toFixed(2)+' RON</div>'+
          '<div style="font-size:10px;color:var(--muted);margin-top:4px">Sync: '+syncNote+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+profitStr+'</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">'+
        '<button onclick="markTicket('+i+',\'win\')" class="btn" style="background:rgba(34,197,94,.15);color:var(--grn);border:1px solid rgba(34,197,94,.3)">WIN</button>'+
        '<button onclick="markTicket('+i+',\'loss\')" class="btn" style="background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3)">LOSE</button>'+
        '<button onclick="cashOutTicket('+i+')" class="btn" style="background:rgba(245,158,11,.15);color:var(--yel);border:1px solid rgba(245,158,11,.3)">CO</button>'+
        '<button onclick="editTicketOdds('+i+')" class="btn" style="background:rgba(59,130,246,.15);color:var(--acc);border:1px solid rgba(59,130,246,.3)">Modifică cota</button>'+
        (t.type !== 'extra' ? '<button onclick="releaseTicketToAuto('+i+')" class="btn" style="background:rgba(99,102,241,.14);color:#c7d2fe;border:1px solid rgba(99,102,241,.3)">Auto</button>' : '')+
        '<button onclick="toggleTicketDetail('+i+')" class="btn" style="background:rgba(168,85,247,.15);color:var(--pur);border:1px solid rgba(168,85,247,.3)">'+(OPEN_TICKET_IDX===i?'Ascunde':'Vezi evenimente')+'</button>'+
        '<button onclick="deleteTicket('+i+')" class="btn" style="background:rgba(255,255,255,.05);color:var(--muted);border:1px solid var(--brd2)">Șterge</button>'+
      '</div>'+
      (OPEN_TICKET_IDX===i ? '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--brd2)">'+renderTicketDetail(i)+'</div>' : '')+
    '</div>';
  }).join('');
  calcBankroll();
  if($('tab-cota2') && $('tab-cota2').classList.contains('active')) renderCota2Section();
}

function markTicket(idx,status){
  var t=TRACKING[idx]; if(!t) return;
  var stake=t.stake||100;
  t.manualOverride = true;
  t.status=status;
  if(status==='win') t.profit=+(((t.totalOdds-1)*stake).toFixed(2));
  else if(status==='loss') t.profit=-stake;
  else t.profit=0;
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking(); toast('Bilet actualizat manual','ok');
}
function editTicketOdds(idx){
  var t = TRACKING[idx];
  var cur = t.totalOdds || 1;
  var val = prompt('Noua cotă totală:', cur);
  if(val === null) return;
  val = parseFloat(String(val).replace(',', '.'));
  if(!isFinite(val) || val <= 1){ toast('Cotă invalidă', 'err'); return; }
  t.totalOdds = val;
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  if(!t.manualOverride){
    autoSyncTrackingStatuses();
  }
  renderTracking();
  toast('Cota a fost actualizată', 'ok');
}
function cashOutTicket(idx){
  var t = TRACKING[idx];
  var val = prompt('Suma retrasă (cash out):', t.cashout || t.stake || 0);
  if(val === null) return;
  val = parseFloat(String(val).replace(',', '.'));
  if(!isFinite(val) || val < 0){ toast('Sumă invalidă', 'err'); return; }
  t.manualOverride = true;
  t.status = 'co';
  t.cashout = val;
  t.profit = +(val - (t.stake || 0)).toFixed(2);
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking();
  toast('Cash out salvat', 'ok');
}
function releaseTicketToAuto(idx){
  var t = TRACKING[idx];
  if(!t || t.type === 'extra') return;
  t.manualOverride = false;
  delete t.cashout;
  t.status = 'pending';
  t.profit = 0;
  autoSyncTrackingStatuses();
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking();
  toast('Bilet trecut pe sincronizare automată', 'ok');
}
function renderTicketDetail(idx){
  var t = TRACKING[idx];
  if(!t || !t.picks || !t.picks.length) return '<div style="font-size:11px;color:var(--muted)">Fără selecții disponibile.</div>';
  var html = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Evenimente bilet:</div>';
  html += t.picks.map(function(p, j){
    var actualScore = (p.homeScore != null && p.awayScore != null) ? (p.homeScore+'-'+p.awayScore) : null;
    var matchStateText = String(p.matchStatus || 'pending').toUpperCase();
    return '<div style="padding:8px 0;border-top:'+ (j===0?'0':'1px solid rgba(255,255,255,.06)') +'">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">'+
        '<div style="font-size:12px;font-weight:700">'+renderEventIdentity(p, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc((p.dateLabel || '') + ((p.timeLabel || '') ? (' ' + (p.timeLabel || '')) : '')) })+'</div>'+
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'+getPickStatusBadgeHtml(p.result || 'pending')+'<span style="font-size:9px;color:var(--muted)">'+matchStateText+'</span></div>'+
      '</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:2px">'+
        renderLeagueBadge(p, 12)+' • '+(p.bet||'—')+' @ '+((p.odds||0).toFixed ? p.odds.toFixed(2) : p.odds)+
      '</div>'+
      (p.score ? '<div style="font-size:10px;color:var(--pur)">Scor probabil: '+p.score+'</div>' : '')+
      (actualScore ? '<div style="font-size:10px;color:var(--grn)">Scor final: '+actualScore+'</div>' : '')+
      (p.why ? '<div style="font-size:10px;color:var(--acc)">'+p.why+'</div>' : '')+
    '</div>';
  }).join('');
  return html;
}
function toggleTicketDetail(idx){
  OPEN_TICKET_IDX = (OPEN_TICKET_IDX === idx ? null : idx);
  renderTracking();
}

function deleteTicket(idx){
  if(typeof idx !== 'number' || idx < 0 || idx >= TRACKING.length) return;
  TRACKING.splice(idx, 1);
  OPEN_TICKET_IDX = null;
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking();
  toast('Bilet șters', 'ok');
}
function clearHistory(){
  TRACKING = [];
  OPEN_TICKET_IDX = null;
  localStorage.setItem('bet_tracking', JSON.stringify(TRACKING));
  renderTracking();
  toast('Istoricul a fost șters', 'ok');
}
function exportHistory(){
  try {
    var payload = {
      exported_at: new Date().toISOString(),
      tickets: TRACKING
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bet_tracking_export.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Export realizat', 'ok');
  } catch(e){
    console.error(e);
    toast('Eroare la export', 'err');
  }
}

function renderMarketDistribution(){
  var target = $('market-distribution-table');
  if(!target) return;
  var summary = {};
  (BET_TYPES || []).forEach(function(bt){
    summary[bt.label] = {count:0, edge:0, score:0};
  });
  ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE' && m.bestBet; }).forEach(function(m){
    var key = m.bestBet.label || m.bestBet.type || '—';
    if(!summary[key]) summary[key] = {count:0, edge:0, score:0};
    summary[key].count += 1;
    summary[key].edge += Number(m.bestBet.edgePct || 0);
    summary[key].score += Number(m.bestBet.score || 0);
  });
  var rows = Object.keys(summary).sort(function(a,b){
    if(summary[b].count !== summary[a].count) return summary[b].count - summary[a].count;
    return a.localeCompare(b);
  });
  var html = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'+
    '<thead><tr style="color:var(--muted);text-transform:uppercase;font-size:10px"><th style="text-align:left;padding:8px;border-bottom:1px solid var(--brd)">Piață</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--brd)">Selecții</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--brd)">Edge mediu</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--brd)">Score mediu</th></tr></thead><tbody>';
  rows.forEach(function(name){
    var item = summary[name];
    var avgEdge = item.count ? item.edge / item.count : 0;
    var avgScore = item.count ? item.score / item.count : 0;
    html += '<tr>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-weight:700">'+name+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+item.count+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right;color:'+(avgEdge>=0?'var(--grn)':'var(--red)')+'">'+(avgEdge>=0?'+':'')+avgEdge.toFixed(1)+'%</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+avgScore.toFixed(1)+'</td>'+
    '</tr>';
  });
  html += '</tbody></table></div>';
  target.innerHTML = html;
}

function renderMarketPerformance(){
  var target = $('market-performance-table');
  if(!target) return;
  var cutoff = new Date(Date.now() - (21 * 86400000));
  var settledRows = getHistory21SettledRows(cutoff);
  var livePendingRows = getHistory21LivePendingRows();
  var rows = settledRows.concat(livePendingRows);
  var defs = [
    {key:'over15', label:'Over 1.5G'},
    {key:'over25', label:'Over 2.5G'},
    {key:'btts', label:'BTTS'},
    {key:'under35', label:'Under 3.5G'},
    {key:'safe', label:'Top analizate'},
    {key:'value', label:'Value'}
  ];
  var groups = defs.map(function(def){ return buildHistory21Group(def.label, def.key, rows.filter(function(r){ return historyRowMatchesCategory(r, def.key); })); }).filter(function(g){ return g.total > 0; });
  if(!groups.length){
    target.innerHTML = '<div class="empty-state">Nu există încă breakdown real pe ultimele 21 de zile.</div>';
    return;
  }
  var html = '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">'+
    '<thead><tr style="text-align:left;color:var(--muted)">'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08)">Categorie</th>'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">ROI</th>'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Win / jucate</th>'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Win rate</th>'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Cotă medie</th>'+
      '<th style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Pending</th>'+
    '</tr></thead><tbody>';
  groups.forEach(function(item){
    var roi = Number(item.roi || 0);
    var wr = Number(item.winrate || 0);
    html += '<tr>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-weight:700">'+(item.label || '—')+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right;color:'+(roi >= 0 ? 'var(--grn)' : 'var(--red)')+'">'+(roi>=0?'+':'')+roi.toFixed(1)+'%</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+Number(item.wins || 0)+'/'+Number(item.bets || 0)+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right;color:'+(wr >= 65 ? 'var(--grn)' : 'var(--txt)')+'">'+(item.bets ? wr.toFixed(1)+'%' : '—')+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+(item.bets ? item.avgOdds.toFixed(2) : '—')+'</td>'+
      '<td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+Number(item.pending || 0)+'</td>'+
    '</tr>';
  });
  html += '</tbody></table></div>';
  target.innerHTML = html;
}


function getHistoryEventName(r){
  if(r && r.home && r.away) return r.home + ' vs ' + r.away;
  var eventId = Number(r && r.event_id || 0);
  if(eventId){
    var match = (ALL_MATCHES || []).find(function(m){ return Number(m && m.eventId || 0) === eventId; });
    if(match && match.home && match.away) return match.home + ' vs ' + match.away;
    var ev = (ALL_EVENTS || []).find(function(e){ return Number(e && e.id || 0) === eventId; });
    if(ev && ev.home_team && ev.away_team) return ev.home_team + ' vs ' + ev.away_team;
  }
  return '';
}

function getHistory21Status(row){
  var raw = String(row && row.status || '').toLowerCase();
  if(raw === 'win') return 'win';
  if(raw === 'lose' || raw === 'loss') return 'lose';
  if(row && row.won === true) return 'win';
  if(row && row.won === false) return 'lose';
  var marketType = row ? (row.market_key || inferMarketTypeFromLabel(row.market || '')) : null;
  if(row && row.home_score != null && row.away_score != null && marketType){
    var evalStatus = evaluateMarketOutcome(marketType, Number(row.home_score), Number(row.away_score));
    if(evalStatus === 'win') return 'win';
    if(evalStatus === 'loss') return 'lose';
  }
  return 'pending';
}

function getHistory21RowKey(row){
  var marketType = row.market_key || inferMarketTypeFromLabel(row.market || '');
  var eventId = row.event_id != null ? row.event_id : (row.eventId != null ? row.eventId : null);
  if(eventId != null) return String(eventId) + '::' + String(marketType || row.market || '');
  return [
    normalizeTicketEntityName(row.home || ''),
    normalizeTicketEntityName(row.away || ''),
    String(row.event_date || row.date || ''),
    String(marketType || row.market || '')
  ].join('::');
}

function getHistory21SettledRows(cutoff){
  var supported = {};
  (BET_TYPES || []).forEach(function(b){
    supported[b.label] = true;
    supported[b.key] = true;
  });
  return (RECOMMENDATION_LOG || []).filter(function(r){
    if(!r) return false;
    var marketType = r.market_key || inferMarketTypeFromLabel(r.market || '');
    if(!(supported[r.market] || supported[marketType])) return false;
    var loggedAt = new Date(r.logged_at || r.prediction_created_at || 0);
    if(!isFinite(loggedAt.getTime()) || loggedAt < cutoff) return false;
    return getHistory21Status(r) !== 'pending';
  }).map(function(r){
    return Object.assign({}, r, {
      source: 'log',
      status: getHistory21Status(r),
      market_key: r.market_key || inferMarketTypeFromLabel(r.market || ''),
      event_id: r.event_id != null ? r.event_id : null
    });
  });
}



function renderJournal(){
  var target = $('ticket-journal');
  if(!target) return;
  if(!TICKET_JOURNAL || !TICKET_JOURNAL.length){
    target.innerHTML = '<div class="empty-state">Jurnalul este gol. Când găsești un bilet bun, îl pui aici și nu-l mai cauți ca pe șoseta dispărută.</div>';
    return;
  }
  target.innerHTML = TICKET_JOURNAL.slice(0, 20).map(function(t){
    var picksHtml = (t.picks || []).map(function(p){
      return '<div style="margin-top:6px;font-size:11px;color:var(--txt)"><strong>'+p.home+' vs '+p.away+'</strong> • '+p.bet+' @ '+Number(p.odds || 0).toFixed(2)+'</div>';
    }).join('');
    return '<div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
        '<div><div style="font-size:13px;font-weight:700">'+(t.criteria || t.label || 'Bilet')+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+new Date(t.createdAt).toLocaleString('ro-RO')+' • '+(t.picks ? t.picks.length : 0)+' selecții • risc '+(t.riskLabel || '—')+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:14px;font-weight:800;color:var(--grn)">'+Number(t.totalOdds || 1).toFixed(2)+'x</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+Number(t.stake || 0).toFixed(2)+' RON</div></div>'+
      '</div>'+
      + picksHtml +
    '</div>';
  }).join('');
}

function storeTicket(){
  if(!BILETE || !BILETE.picks || !BILETE.picks.length){
    toast('Generează mai întâi un bilet', 'err');
    return;
  }
  var entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    label: BILETE.label || 'Bilet generat',
    criteria: BILETE.label || 'Bilet generat',
    riskLabel: BILETE.riskLabel || '—',
    totalOdds: Number(BILETE.totalOdds || 1),
    combinedProb: Number(BILETE.combinedProb || computeConservativeCombinedProb(BILETE.picks) || 0),
    stake: Number(BILETE.stake || getStakeForTicket(BILETE.type) || 0),
    picks: BILETE.picks.map(function(m){
      var b = m.bestBet || m;
      return {
        home: m.home,
        away: m.away,
        bet: b.label || '',
        odds: Number(b.odds || 0),
        prob: Number(b.adjProb || b.prob || 0),
        edgePct: Number(b.edgePct || 0),
        score: Number(b.score || 0),
        league: m.league || '',
        date: m.date || ''
      };
    })
  };
  TICKET_JOURNAL.unshift(entry);
  localStorage.setItem('bet_ticket_journal', JSON.stringify(TICKET_JOURNAL));
  renderJournal();
  toast('Bilet salvat în jurnal', 'ok');
}

function clearJournal(){
  if(!TICKET_JOURNAL.length){
    toast('Jurnalul este deja gol', 'ok');
    return;
  }
  TICKET_JOURNAL = [];
  localStorage.setItem('bet_ticket_journal', JSON.stringify(TICKET_JOURNAL));
  renderJournal();
  toast('Jurnal șters', 'ok');
}

// ============================================================
// BANKROLL
// ============================================================



function getDayKeyWithOffset(offset){
  var d = new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() + Number(offset || 0));
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}













function summarizePerformanceRows(rows, keyFn){
  var map = {};
  (rows || []).forEach(function(row){
    var key = keyFn(row);
    if(!key) return;
    if(!map[key]) map[key] = {key:key,bets:0,wins:0,profit:0,sumOdds:0};
    map[key].bets += 1;
    if(row.won) map[key].wins += 1;
    map[key].profit += Number(row.profitUnit || 0);
    map[key].sumOdds += Number(row.odds || 0);
  });
  Object.keys(map).forEach(function(key){
    var item = map[key];
    item.losses = Math.max(0, item.bets - item.wins);
    item.avgOdds = item.bets ? item.sumOdds / item.bets : 0;
    item.winrate = item.bets ? (item.wins / item.bets * 100) : 0;
    item.roi = item.bets ? (item.profit / item.bets * 100) : 0;
    item.breakEven = item.avgOdds > 1.01 ? (100 / item.avgOdds) : 0;
    item.delta = item.winrate - item.breakEven;
    item.learnScore = Math.max(-12, Math.min(12, (item.roi * 0.38) + (item.delta * 0.55) + Math.min(item.bets, 18) * 0.10));
  });
  return map;
}
function mergePerformanceMaps(primary, secondary, secondaryWeight){
  primary = primary || {};
  secondary = secondary || {};
  var weight = Number(secondaryWeight || 1);
  var out = {};
  var keys = {};
  Object.keys(primary).forEach(function(k){ keys[k] = true; });
  Object.keys(secondary).forEach(function(k){ keys[k] = true; });
  Object.keys(keys).forEach(function(key){
    var a = primary[key] || {};
    var b = secondary[key] || {};
    var item = {
      key:key,
      bets:Number(a.bets || 0) + Number(b.bets || 0) * weight,
      wins:Number(a.wins || 0) + Number(b.wins || 0) * weight,
      profit:Number(a.profit || 0) + Number(b.profit || 0) * weight,
      sumOdds:(Number(a.avgOdds || 0) * Number(a.bets || 0)) + ((Number(b.avgOdds || 0) * Number(b.bets || 0)) * weight)
    };
    item.losses = Math.max(0, item.bets - item.wins);
    item.avgOdds = item.bets ? item.sumOdds / item.bets : 0;
    item.winrate = item.bets ? (item.wins / item.bets * 100) : 0;
    item.roi = item.bets ? (item.profit / item.bets * 100) : 0;
    item.breakEven = item.avgOdds > 1.01 ? (100 / item.avgOdds) : 0;
    item.delta = item.winrate - item.breakEven;
    item.learnScore = Math.max(-12, Math.min(12, (item.roi * 0.38) + (item.delta * 0.55) + Math.min(item.bets, 18) * 0.10));
    out[key] = item;
  });
  return out;
}
function summarizeTicketPerformance(tickets, keyFn){
  var map = {};
  (tickets || []).forEach(function(ticket){
    var key = keyFn(ticket);
    if(!key) return;
    if(!map[key]) map[key] = {key:key,bets:0,wins:0,profit:0,sumOdds:0,sumStake:0,sumLegs:0};
    var item = map[key];
    item.bets += 1;
    if(ticket.status === 'win') item.wins += 1;
    item.profit += getCota2TicketUnitProfit(ticket);
    item.sumOdds += Number(ticket.totalOdds || 0);
    item.sumStake += Number(ticket.stake || 0);
    item.sumLegs += getCota2Legs(ticket);
  });
  Object.keys(map).forEach(function(key){
    var item = map[key];
    item.avgOdds = item.bets ? item.sumOdds / item.bets : 0;
    item.avgLegs = item.bets ? item.sumLegs / item.bets : 0;
    item.winrate = item.bets ? (item.wins / item.bets * 100) : 0;
    item.roi = item.bets ? (item.profit / item.bets * 100) : 0;
    item.breakEven = item.avgOdds > 1.01 ? (100 / item.avgOdds) : 0;
    item.delta = item.winrate - item.breakEven;
    item.learnScore = Math.max(-12, Math.min(12, (item.roi * 0.45) + (item.delta * 0.50) + Math.min(item.bets, 12) * 0.18));
  });
  return map;
}











function buildTrackingEntryFromTicket(ticket, forcedType, stake){
  if(!ticket || !ticket.picks || !ticket.picks.length) return null;
  var finalStake = Number(stake != null ? stake : ticket.stake || 0);
  return {
    id: Date.now(),
    date: new Date().toLocaleDateString('ro-RO'),
    placedAt: new Date().toISOString(),
    picks: ticket.picks.map(function(m){
      var b = m.bestBet || m;
      return {
        eventId: m.eventId || m.event_id || null,
        predictionId: m.id || m.prediction_id || null,
        eventDate: m.date || m.event_date || null,
        home: m.home,
        away: m.away,
        bet: b.label || m.market || '—',
        marketType: b.type || cota2MarketKey(m),
        odds: Number(b.odds || m.odds || 0),
        prob: Number(b.adjProb || b.prob || m.prob || 0),
        league: m.league || '',
        dateLabel: m.dateLabel || '',
        timeLabel: m.timeLabel || '',
        score: m.mostLikelyScore || null,
        why: m.why || '',
        matchStatus: 'pending',
        result: 'pending'
      };
    }),
    totalOdds: Number(ticket.totalOdds || 1),
    stake: finalStake,
    status: 'pending',
    profit: 0,
    type: forcedType || 'generated',
    criteria: ticket.criteria || ticket.label || 'Bilet generat',
    manualOverride: false,
    autoUpdatedAt: null,
    autoSettledOdds: null,
    strategyMode: ticket.strategy || null,
    strategyFamily: forcedType || ticket.type || null
  };
}
function buildJournalEntryFromTicket(ticket){
  if(!ticket || !ticket.picks || !ticket.picks.length) return null;
  return {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    label: ticket.label || 'Bilet generat',
    criteria: ticket.criteria || ticket.label || 'Bilet generat',
    riskLabel: ticket.riskLabel || '—',
    totalOdds: Number(ticket.totalOdds || 1),
    combinedProb: Number(ticket.combinedProb || 0),
    stake: Number(ticket.stake || 0),
    strategy: ticket.strategy || null,
    type: ticket.type || null,
    picks: ticket.picks.map(function(m){
      var b = m.bestBet || m;
      return {
        home: m.home,
        away: m.away,
        bet: b.label || m.market || '',
        odds: Number(b.odds || m.odds || 0),
        prob: Number(b.adjProb || b.prob || m.prob || 0),
        edgePct: Number(b.edgePct || m.edge || 0),
        score: Number(m.score || (b.score || 0)),
        league: m.league || '',
        date: m.date || m.event_date || ''
      };
    })
  };
}










// ============================================================
// MOTOR MULTI-FACTOR v1 — renderML5Analysis()
// ============================================================
function renderML5Analysis(){
  var root = $('ml5-root');
  if(!root) return;

  var _now = Date.now();
  var enriched = (window.ALL_MATCHES||[]).filter(function(m){
    if(!m.isEnriched) return false;
    // Hide matches that started more than 2h ago (finished / in-play but API still "notstarted")
    if(m.date){ var _d=new Date(m.date); if(isFinite(_d.getTime()) && _d.getTime() < _now - 2*3600*1000) return false; }
    return true;
  });
  var total    = (window.ALL_MATCHES||[]).length;
  var coverage = total > 0 ? Math.round(enriched.length * 100 / total) : 0;
  var cacheCount = Object.keys(ENRICHED_EVENT_CACHE).length;

  // Header stats
  var headerHtml =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      ml5StatPill('🔬 Enriched', enriched.length + '/' + total, '#a78bfa') +
      ml5StatPill('📡 Cache', cacheCount + ' meciuri', 'var(--cyan)') +
      ml5StatPill('📊 Coverage', coverage + '%', coverage>=70?'var(--grn)':coverage>=40?'var(--yel)':'var(--red)') +
    '</div>';

  // Coverage bar
  var covBar =
    '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.08);margin-bottom:20px;overflow:hidden">' +
      '<div style="height:100%;width:'+coverage+'%;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:3px;transition:width .4s"></div>' +
    '</div>';

  // If no token - prompt
  var token = API_TOKEN || localStorage.getItem('bsd_token') || '';
  var tokenWarning = (!token && enriched.length === 0) ?
    '<div style="padding:14px 16px;border-radius:14px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.25);color:#fca5a5;font-size:12px;margin-bottom:16px">' +
      '⚠️ <strong>Token BSD lipsă.</strong> Introdu tokenul în Setări pentru a activa enrichment-ul live.' +
    '</div>' : '';

  // If no enriched matches - info + trigger button
  if(enriched.length === 0){
    var triggerBtn = token ?
      '<button class="btn btn-primary" style="margin-top:14px" onclick="enrichTopMatchesBackground().then(function(){ renderML5Analysis(); })">🔬 Pornește Enrichment Acum</button>'
      : '';
    root.innerHTML =
      '<div style="padding:0 4px">' +
        headerHtml + covBar + tokenWarning +
        '<div style="text-align:center;padding:40px 20px;color:var(--muted);font-size:13px">' +
          '<div style="font-size:32px;margin-bottom:12px">🔬</div>' +
          '<div style="font-weight:700;color:var(--txt);margin-bottom:8px">Motor ML5 pregătit</div>' +
          '<div style="font-size:12px;line-height:1.6">Datele de enrichment sunt generate automat la refresh.<br>Sau apasă butonul pentru fetch imediat.</div>' +
          triggerBtn +
        '</div>' +
      '</div>';
    return;
  }

  // Sort by ML5 score
  var sorted = enriched.slice().sort(function(a,b){
    return (b.smartScore||0) - (a.smartScore||0);
  });

  // Summary header
  var scoredMatches = sorted.filter(function(m){ return (m.smartScore||0) > 0; });
  var avgScore = scoredMatches.length > 0
    ? Math.round(scoredMatches.reduce(function(s,m){ return s+(m.smartScore||0); },0)/scoredMatches.length)
    : 0;
  var topPicks = sorted.filter(function(m){ return (m.smartScore||0) >= 80; }).length;
  var highConf = sorted.filter(function(m){
    return m.bestBet && m.bestBet.ml5Factors && Number(m.bestBet.ml5Factors.combined||1) >= 1.05;
  }).length;

  var summaryBar =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">' +
      ml5StatPill('⭐ Scor mediu', avgScore, 'var(--acc)') +
      ml5StatPill('🚀 Top Picks (≥80)', topPicks, 'var(--grn)') +
      ml5StatPill('✅ Factori pozitivi', highConf, '#a78bfa') +
    '</div>';

  // Factor distribution chart (quick visual)
  var factorCounts = {form:0, h2h:0, abs:0, tact:0};
  enriched.forEach(function(m){
    var f = m.bestBet && m.bestBet.ml5Factors;
    if(!f) return;
    if(Number(f.formFactor||1) > 1.02) factorCounts.form++;
    if(Number(f.h2hFactor||1) > 1.02) factorCounts.h2h++;
    if(Number(f.absenceFactor||1) < 0.98) factorCounts.abs++;
    if(Number(f.tactFactor||1) > 1.02) factorCounts.tact++;
  });
  var n = Math.max(1, enriched.length);
  var distHtml =
    '<div style="margin-bottom:20px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">' +
      '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Distribuție factori pozitivi</div>' +
      ml5FactorBar('Formă ↑', factorCounts.form, n, '#22c55e') +
      ml5FactorBar('H2H ↑',   factorCounts.h2h,  n, '#3b82f6') +
      ml5FactorBar('Absențe ↑ (echipa adversă)', factorCounts.abs, n, '#f59e0b') +
      ml5FactorBar('Tactici ↑',factorCounts.tact, n, '#a78bfa') +
    '</div>';

  // Cards per match
  var cardsHtml = sorted.map(function(m, idx){ return renderML5MatchCard(m, idx+1); }).join('');

  root.innerHTML =
    '<div style="padding:0 4px">' +
      headerHtml + covBar + tokenWarning +
      summaryBar + distHtml +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:10px">Top Picks ML5</div>' +
      cardsHtml +
    '</div>';
}

function ml5StatPill(label, value, color){
  return '<div style="flex:1;min-width:90px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">' +
    '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">'+label+'</div>' +
    '<div style="font-size:18px;font-weight:900;color:'+color+'">'+value+'</div>' +
  '</div>';
}

function ml5FactorBar(label, count, total, color){
  var pct = Math.round(count*100/total);
  return '<div style="margin-bottom:8px">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
      '<span style="font-size:11px;color:var(--txt)">'+label+'</span>' +
      '<span style="font-size:11px;color:'+color+';font-weight:700">'+count+' ('+pct+'%)</span>' +
    '</div>' +
    '<div style="height:5px;border-radius:3px;background:rgba(255,255,255,.08)">' +
      '<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:3px"></div>' +
    '</div>' +
  '</div>';
}

function renderML5MatchCard(m, cardIdx){
  var b = m.bestBet;
  if(!b) return '';
  var score = m.smartScore || 0;
  var scoreColor = score>=85?'#22c55e':score>=70?'var(--acc)':score>=55?'var(--yel)':'var(--muted)';
  var numBadge = cardIdx ? '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;border-radius:6px;background:rgba(255,255,255,.08);color:var(--muted);font-size:10px;font-weight:800;margin-right:7px;vertical-align:middle;flex-shrink:0">#'+cardIdx+'</span>' : '';

  // Form dots
  function fdots(fs){
    if(!fs) return '<span style="color:var(--muted);font-size:10px">—</span>';
    return String(fs).toUpperCase().split('').map(function(ch){
      var col = ch==='W'?'#22c55e':ch==='D'?'#f59e0b':'#ef4444';
      return '<span style="color:'+col+';font-weight:900;font-size:11px">'+ch+'</span>';
    }).join('<span style="color:var(--muted);font-size:9px"> </span>');
  }

  // Factor pills
  var factPills = '';
  if(b.ml5Factors){
    var fmap = {formFactor:'Formă',h2hFactor:'H2H',absenceFactor:'Absențe',tactFactor:'Tactici'};
    Object.keys(fmap).forEach(function(k){
      var v = Number(b.ml5Factors[k]||1);
      if(Math.abs(v-1)<0.006) return;
      var col = v>1?'#22c55e':'#ef4444';
      var arr = v>1?'↑':'↓';
      var pct = Math.round(Math.abs(v-1)*100);
      factPills += '<span style="font-size:10px;padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.07);color:'+col+';font-weight:700">'+arr+' '+fmap[k]+' '+pct+'%</span>';
    });
  }

  // Kelly display
  var kelly = b.ml5Kelly != null ? b.ml5Kelly : (b.kelly_quarter_pct || 0);
  var kellyColor = kelly>=2?'var(--grn)':kelly>=1?'var(--acc)':'var(--muted)';

  // Agreement
  var agr = b.ml5Agreement != null ? Math.round(b.ml5Agreement*100) : null;
  var agrColor = agr!=null ? (agr>=85?'var(--grn)':agr>=65?'var(--yel)':'var(--red)') : 'var(--muted)';

  return '<div style="margin-bottom:12px;padding:14px;border-radius:16px;background:#161d2e;border:1px solid rgba(139,92,246,.22)">' +
    // Header row: score + teams
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:800;color:var(--txt);display:flex;align-items:center;flex-wrap:wrap;gap:2px">'+numBadge+htmlEsc(m.home||'')+' vs '+htmlEsc(m.away||'')+'</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:2px">'+htmlEsc(m.league||'')+' · '+htmlEsc(m.dateLabel||'')+' '+htmlEsc(m.timeLabel||'')+'</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:22px;font-weight:900;color:'+scoreColor+';line-height:1">'+score+'</div>' +
        '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">ML5 Score</div>' +
      '</div>' +
    '</div>' +
    // Recommendation row
    '<div style="padding:10px 12px;border-radius:12px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.18);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<div>' +
        '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Pronostic</div>' +
        '<div style="font-size:13px;font-weight:800;color:var(--txt)">'+htmlEsc(b.label||'')+'</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:18px;font-weight:900;color:var(--acc)">@ '+(Number(b.odds||0)).toFixed(2)+'</div>' +
        '<div style="font-size:10px;color:var(--txt)">'+fmtPct(Number(b.adjProb||0))+'</div>' +
      '</div>' +
    '</div>' +
    // Metrics row
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      ml5Mini('Edge', (Number(b.edgePct||0)>=0?'+':'')+Number(b.edgePct||0).toFixed(1)+'pp', Number(b.edgePct||0)>=4?'var(--grn)':Number(b.edgePct||0)>=0?'var(--acc)':'var(--red)') +
      ml5Mini('Value', (Number(b.value||0)>=0?'+':'')+(Number(b.value||0)*100).toFixed(1)+'%', Number(b.value||0)>=0.03?'var(--grn)':Number(b.value||0)>=0?'var(--acc)':'var(--red)') +
      ml5Mini('Kelly ¼', kelly.toFixed(2)+'%', kellyColor) +
      (agr!=null ? ml5Mini('Acord piață', agr+'%', agrColor) : '') +
    '</div>' +
    // Form row
    ((m.homeFormStr||m.awayFormStr) ?
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">' +
        '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Gazde</div>'+fdots(m.homeFormStr)+'</div>' +
        '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">Oaspeți</div>'+fdots(m.awayFormStr)+'</div>' +
        (m.h2hLabel ? '<div><div style="font-size:9px;color:var(--muted);margin-bottom:2px">H2H</div><span style="font-size:11px;color:var(--txt)">⚔️ '+htmlEsc(m.h2hLabel)+'</span></div>' : '') +
      '</div>' : '') +
    // Factor pills
    (factPills ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + factPills + '</div>' : '') +
    // Coach
    ((m.homeCoachName||m.awayCoachName) ?
      '<div style="font-size:10px;color:var(--muted);margin-top:6px">🧠 ' +
        htmlEsc(m.homeCoachName||'?')+' vs '+htmlEsc(m.awayCoachName||'?') +
      '</div>' : '') +
  '</div>';
}

function ml5Mini(label, value, color){
  return '<div style="flex:1;min-width:60px;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)">' +
    '<div style="font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">'+label+'</div>' +
    '<div style="font-size:12px;font-weight:800;color:'+color+'">'+value+'</div>' +
  '</div>';
}
// ============================================================
// END renderML5Analysis
// ============================================================




var SECTION_STATE = {};
function toggleSection(id){
  var map={todaybest:['todaybest-body','todaybest-toggle'],top5:['top5-body','top5-toggle'],topsafe:['topsafe-body','topsafe-toggle'],ml:['ml-body','ml-toggle'],mldc:['mldc-body','mldc-toggle'],ml15:['ml15-body','ml15-toggle'],ml25:['ml25-body','ml25-toggle'],ml35:['ml35-body','ml35-toggle']};
  Object.keys(map).forEach(function(key){
    if(key !== id){
      SECTION_STATE[key] = false;
      var otherBody=$(map[key][0]), otherToggle=$(map[key][1]);
      if(otherBody) otherBody.classList.remove('open');
      if(otherToggle) otherToggle.classList.remove('open');
    }
  });
  SECTION_STATE[id]=!SECTION_STATE[id];
  var pair=map[id];
  if(!pair) return;
  var body=$(pair[0]), toggle=$(pair[1]);
  if(SECTION_STATE[id]){ body.classList.add('open'); toggle.classList.add('open'); }
  else{ body.classList.remove('open'); toggle.classList.remove('open'); }
}
function toggleMatchesHub(){
  var body = $('matches-hub-body');
  if(!body) return;
  body.classList.toggle('open');
}
function updateSectionCount(id,count){
  var map={todaybest:'todaybest-count',top5:'top5-count',topsafe:'topsafe-count',ml:'ml-count',mldc:'mldc-count',ml15:'ml15-count',ml25:'ml25-count',ml35:'ml35-count'};
  var el=$(map[id]);
  if(el) el.textContent=count+' meciuri';
}

// ============================================================
// RENDER ALL
// ============================================================

function applyOpenSections(){
  ['todaybest','top5'].forEach(function(id){
    var map={todaybest:['todaybest-body','todaybest-toggle'],top5:['top5-body','top5-toggle'],topsafe:['topsafe-body','topsafe-toggle'],ml:['ml-body','ml-toggle'],mldc:['mldc-body','mldc-toggle'],ml15:['ml15-body','ml15-toggle'],ml25:['ml25-body','ml25-toggle'],ml35:['ml35-body','ml35-toggle']};
    var pair=map[id];
    if(!pair) return;
    var body=$(pair[0]), toggle=$(pair[1]);
    if(body) body.classList.add('open');
    if(toggle) toggle.classList.add('open');
  });
}

function buildCollapsiblePair(headerId, bodyId){
  var header = $(headerId), body = $(bodyId);
  if(!header || !body) return null;
  var wrap = document.createElement('div');
  wrap.className = 'matches-dashboard-block';
  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function moveDashboardSectionsToMatches(){
  var target = $('matches-dashboard-sections');
  if(!target || target.dataset.moved === '1') return;

  var todayWrap = document.createElement('div');
  todayWrap.className = 'matches-dashboard-block';
  var todayHeader = document.querySelector('[onclick="toggleSection(\'todaybest\')"]');
  var todayBody = $('todaybest-body');
  if(todayHeader && todayBody){
    todayWrap.appendChild(todayHeader);
    todayWrap.appendChild(todayBody);
    target.appendChild(todayWrap);
  }

  [['top5-hdr','top5-body'],['ml15-hdr','ml15-body'],['ml-hdr','ml-body'],['ml35-hdr','ml35-body']].forEach(function(pair){
    var block = buildCollapsiblePair(pair[0], pair[1]);
    if(block) target.appendChild(block);
  });

  target.dataset.moved = '1';
}

function toggleDashboardInsights(){
  var body = $('dashboard-insights-body');
  if(!body) return;
  body.classList.toggle('open');
}
function arrangeDashboardLayout(){
  var dash = $('tab-dashboard');
  if(!dash) return;
  var focus = $('focus-shell');
  if(focus) focus.style.display = 'none';
  var shell = $('dashboard-insights-shell');
  if(shell) shell.style.display = 'none';
  var stats = $('dashboard-stats');
  var health = $('health-panel');
  var visual = $('dashboard-visual-panel');
  var market = $('market-performance-panel');
  var help = $('dashboard-help-panel');
  if(stats) stats.style.marginTop = '12px';
  [health, visual, market].forEach(function(el){
    if(el && el.parentNode !== dash) dash.appendChild(el);
    if(el) el.style.display = '';
  });
  if(help && help.parentNode !== dash) dash.appendChild(help);
}

function getCurrentDayKey(){
  var now = new Date();
  return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
}
function checkDailyRefresh(){
  var current = getCurrentDayKey();
  if(LAST_DAY_KEY && current !== LAST_DAY_KEY){
    LAST_DAY_KEY = current;
    renderMatches();
    toast('Top 2 pronosticuri ale zilei a fost actualizat pentru noua zi', 'ok');
  }
}

function getStatusDisplayMetrics(){
  var totalLocal = ALL_MATCHES.length;
  var eligibleLocal = ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE'; }).length;
  var apiMl = APP_META && APP_META.bsd_status && APP_META.bsd_status.ml_predictions_upcoming != null ? Number(APP_META.bsd_status.ml_predictions_upcoming) : null;
  var apiOdds = APP_META && APP_META.bsd_status && APP_META.bsd_status.with_odds != null ? Number(APP_META.bsd_status.with_odds) : null;
  var syncMl = APP_META && APP_META.header_sync && APP_META.header_sync.upcoming_predictions_count != null ? Number(APP_META.header_sync.upcoming_predictions_count) : null;
  var syncOdds = APP_META && APP_META.header_sync && APP_META.header_sync.with_odds_upcoming_count != null ? Number(APP_META.header_sync.with_odds_upcoming_count) : null;

  return {
    ml: apiMl != null && !isNaN(apiMl) ? apiMl : (syncMl != null && !isNaN(syncMl) ? syncMl : totalLocal),
    odds: apiOdds != null && !isNaN(apiOdds) ? apiOdds : (syncOdds != null && !isNaN(syncOdds) ? syncOdds : eligibleLocal)
  };
}

function getDataFreshnessHtml(){
  // Calculează vârsta datelor din build_status.json sau APP_META
  var ts = (BUILD_STATUS && BUILD_STATUS.updated_at) || (APP_META && APP_META.updated_at) || null;
  if(!ts) return '';
  var ageMs = Date.now() - new Date(ts).getTime();
  if(!isFinite(ageMs) || ageMs < 0) return '';
  var ageH = ageMs / 3600000;
  var color = ageH <= 6 ? '#22c55e' : (ageH <= 24 ? '#f59e0b' : '#ef4444');
  var label = ageH < 1 ? Math.round(ageH*60)+'m' : (ageH < 24 ? ageH.toFixed(1)+'h' : Math.round(ageH)+'h — date vechi');
  return ' <span style="color:'+color+';font-weight:700" title="Ultima actualizare date">● '+label+'</span>';
}
function getStatusDisplayTime(){
  var raw = (APP_META && APP_META.bsd_status && APP_META.bsd_status.fetched_at) || (APP_META && APP_META.updated_at) || null;
  if(!raw) return '';
  var dt = new Date(raw);
  if(!isFinite(dt.getTime())) return '';
  return dt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}


function getAddonStamp(obj){ var raw = obj && (obj.event_date || obj.eventDate || obj.date || obj.logged_at || obj.prediction_created_at || null); var ms = raw ? new Date(raw).getTime() : NaN; return isFinite(ms) ? ms : 0; }
function getHoursToKickoff(m){
  var raw = m && (m.event_date || m.eventDate || m.date || m.starts_at || m.kickoff || m.start_time || null);
  if(!raw) return null;
  var diff = (new Date(raw).getTime() - Date.now()) / 36e5;
  return isFinite(diff) ? diff : null;
}
function getRecentRows(days){
  var cutoff = new Date(Date.now() - days * 86400000);
  var settled = typeof getHistory21SettledRows === 'function' ? getHistory21SettledRows(cutoff).filter(function(r){ return getAddonStamp(r) >= cutoff.getTime(); }) : [];
  var pending = typeof getHistory21LivePendingRows === 'function' ? getHistory21LivePendingRows().filter(function(r){ return getAddonStamp(r) >= cutoff.getTime(); }) : [];
  var map = {}; settled.forEach(function(r){ map[getHistory21RowKey(r)] = r; }); pending.forEach(function(r){ map[getHistory21RowKey(r)] = r; });
  return Object.keys(map).map(function(k){ return map[k]; });
}
function heatColor(roi, bets){
  if(!bets) return 'rgba(255,255,255,.05)';
  if(roi >= 10) return 'rgba(34,197,94,.28)';
  if(roi >= 0) return 'rgba(59,130,246,.22)';
  if(roi >= -5) return 'rgba(245,158,11,.22)';
  return 'rgba(239,68,68,.24)';
}
function buildRadarSvg(metrics){
  var labels = metrics.map(function(m){ return m.label; });
  var values = metrics.map(function(m){ return Math.max(0, Math.min(100, Number(m.value || 0))); });
  var mobile = window.innerWidth < 640;
  var w = mobile ? 360 : 460, h = mobile ? 320 : 350, cx = mobile ? 180 : 230, cy = mobile ? 160 : 175, r = mobile ? 84 : 110, font = mobile ? 10 : 11, labelOffset = mobile ? 30 : 40;
  var rings = [25,50,75,100].map(function(p){ var rr=r*p/100; return '<circle cx="'+cx+'" cy="'+cy+'" r="'+rr+'" fill="none" stroke="rgba(255,255,255,.08)" />'; }).join('');
  var axes = values.map(function(v,i){ var a=(-Math.PI/2)+(Math.PI*2*i/values.length); var x=cx+Math.cos(a)*r; var y=cy+Math.sin(a)*r; var lx=cx+Math.cos(a)*(r+labelOffset); var ly=cy+Math.sin(a)*(r+labelOffset); return '<line x1="'+cx+'" y1="'+cy+'" x2="'+x.toFixed(2)+'" y2="'+y.toFixed(2)+'" stroke="rgba(255,255,255,.08)"/><text x="'+lx.toFixed(2)+'" y="'+ly.toFixed(2)+'" fill="rgba(255,255,255,.82)" font-size="'+font+'" text-anchor="middle">'+labels[i]+'</text>'; }).join('');
  var pts = values.map(function(v,i){ var a=(-Math.PI/2)+(Math.PI*2*i/values.length); var rr=r*v/100; return (cx+Math.cos(a)*rr).toFixed(2)+','+(cy+Math.sin(a)*rr).toFixed(2); }).join(' ');
  return '<svg viewBox="0 0 '+w+' '+h+'">'+rings+axes+'<polygon points="'+pts+'" fill="rgba(59,130,246,.20)" stroke="#60a5fa" stroke-width="3"></polygon></svg>';
}
function buildSankeySvg(nodes){
  if(window.innerWidth < 640){
    return '<div class="flow-mobile-list">'+nodes.map(function(n, idx){ return '<div class="flow-mobile-item"><div><div style="font-size:11px;color:var(--muted)">'+n.label+'</div><div style="font-size:22px;font-weight:900;color:var(--txt)">'+n.value+'</div></div>'+(idx < nodes.length-1 ? '<div class="flow-mobile-arrow">↓</div>' : '<div class="flow-mobile-arrow" style="opacity:.35">•</div>')+'</div>'; }).join('')+'</div>';
  }
  var w=720,h=220, y=60, boxW=120, boxH=54;
  var positions = [20,170,320,470,620];
  var links='';
  for(var i=0;i<nodes.length-1;i++){
    var x1=positions[i]+boxW, x2=positions[i+1], mid=(x1+x2)/2;
    links += '<path d="M '+x1+' '+(y+boxH/2)+' C '+mid+' '+(y+boxH/2)+', '+mid+' '+(y+boxH/2)+', '+x2+' '+(y+boxH/2)+'" fill="none" stroke="rgba(96,165,250,.35)" stroke-width="'+Math.max(10, nodes[i+1].value/4)+'" stroke-linecap="round" />';
  }
  var boxes = nodes.map(function(n, idx){ return '<g><rect x="'+positions[idx]+'" y="'+y+'" rx="16" ry="16" width="'+boxW+'" height="'+boxH+'" fill="rgba(18,28,50,.96)" stroke="rgba(255,255,255,.08)"/><text x="'+(positions[idx]+boxW/2)+'" y="'+(y+20)+'" fill="rgba(255,255,255,.72)" font-size="11" text-anchor="middle">'+n.label+'</text><text x="'+(positions[idx]+boxW/2)+'" y="'+(y+40)+'" fill="#fff" font-size="20" font-weight="800" text-anchor="middle">'+n.value+'</text></g>'; }).join('');
  return '<svg viewBox="0 0 '+w+' '+h+'">'+links+boxes+'</svg>';
}
function renderAdvancedCharts(){
  var rows30 = getRecentRows(30);
  var markets = ['Over 1.5G','Over 2.5G','Under 3.5G','BTTS'];
  var byLeague = {};
  rows30.forEach(function(r){ var lg=r.league||'—'; var mk=r.market||r.market_key||'—'; if(!byLeague[lg]) byLeague[lg]={}; if(!byLeague[lg][mk]) byLeague[lg][mk]={bets:0,wins:0,pending:0,profit:0}; var c=byLeague[lg][mk]; if(r.status==='pending'){ c.pending++; } else { c.bets++; if(r.status==='win') { c.wins++; c.profit += Math.max(0, Number(r.odds||0)-1); } else if(r.status==='lose'){ c.profit -= 1; } } });
  var leagues = Object.keys(byLeague).sort(function(a,b){ var at=0,bt=0; Object.keys(byLeague[a]||{}).forEach(function(k){ at += (byLeague[a][k].bets||0) + (byLeague[a][k].pending||0); }); Object.keys(byLeague[b]||{}).forEach(function(k){ bt += (byLeague[b][k].bets||0) + (byLeague[b][k].pending||0); }); return bt-at; }).slice(0,8);
  if($('advanced-heatmap')) $('advanced-heatmap').innerHTML = leagues.length ? (window.innerWidth < 640 ? ('<div class="heatmap-mobile-grid">'+leagues.map(function(lg){ return '<div class="heatmap-league-card"><div class="heatmap-league-title">'+lg+'</div><div class="heatmap-mini-grid">'+markets.map(function(m){ var c=((byLeague[lg]||{})[m])||{bets:0,pending:0,profit:0}; var roi=c.bets?(c.profit*100/c.bets):0; return '<div class="heat-cell" style="background:'+heatColor(roi,c.bets)+'"><div style="font-size:10px;color:rgba(255,255,255,.72);margin-bottom:4px">'+m+'</div>'+(c.bets?((roi>=0?'+':'')+roi.toFixed(1)+'%'):'—')+'<small>'+(c.bets?c.bets+' închise':'fără sample')+'</small></div>'; }).join('')+'</div></div>'; }).join('')+'</div>') : ('<div style="overflow:auto"><table class="heatmap-table"><thead><tr><th style="text-align:left;padding-left:4px">Ligă</th>'+markets.map(function(m){ return '<th>'+m+'</th>'; }).join('')+'</tr></thead><tbody>'+leagues.map(function(lg){ return '<tr><th style="text-align:left;padding:0 8px 0 4px;color:var(--txt);font-size:11px">'+lg+'</th>'+markets.map(function(m){ var c=((byLeague[lg]||{})[m])||{bets:0,pending:0,profit:0}; var roi=c.bets?(c.profit*100/c.bets):0; return '<td><div class="heat-cell" style="background:'+heatColor(roi,c.bets)+'">'+(c.bets?((roi>=0?'+':'')+roi.toFixed(1)+'%'):'—')+'<small>'+(c.bets?c.bets+' închise':'fără sample')+'</small></div></td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>')) : '<div class="empty-state">Nu există încă suficiente date pentru heatmap.</div>';
  var eligible = (ALL_MATCHES || []).filter(function(m){ return m.analysisState === 'ELIGIBLE'; });
  var confAvg = eligible.length ? eligible.reduce(function(a,m){ return a + Number(m.confidence || 0); },0)/eligible.length : 0;
  var edgeAvg = eligible.length ? eligible.reduce(function(a,m){ return a + Math.max(0, Number((m.bestBet||{}).edgePct || 0)); },0)/eligible.length : 0;
  var valueAvg = eligible.length ? eligible.reduce(function(a,m){ return a + Math.max(0, Number((m.bestBet||{}).value || 0)*100); },0)/eligible.length : 0;
  var proRate = eligible.length ? eligible.filter(isProActiveMatch).length * 100 / eligible.length : 0;
  var coverage = ALL_MATCHES.length ? eligible.length * 100 / ALL_MATCHES.length : 0;
  var settled30 = rows30.filter(function(r){ return r.status === 'win' || r.status === 'lose'; });
  var win30 = settled30.length ? settled30.filter(function(r){ return r.status === 'win'; }).length * 100 / settled30.length : 0;
  if($('advanced-radar')) $('advanced-radar').innerHTML = buildRadarSvg([
    {label:'Coverage', value:coverage}, {label:'Confidence', value:confAvg}, {label:'Edge', value:Math.min(100, edgeAvg*8)}, {label:'Value', value:Math.min(100, valueAvg*3)}, {label:'Pro rate', value:proRate}, {label:'Win30', value:win30}
  ]);
  var withOdds = (ALL_MATCHES || []).filter(function(m){ return (m.bestBet || {}).odds; }).length;
  var pro = eligible.filter(isProActiveMatch).length;
  var value = eligible.filter(function(m){ return Number((m.bestBet||{}).value || 0) >= 0.05; }).length;
  if($('advanced-sankey')) $('advanced-sankey').innerHTML = buildSankeySvg([
    {label:'Toate', value:ALL_MATCHES.length}, {label:'Cu cote', value:withOdds}, {label:'Eligibile', value:eligible.length}, {label:'PRO', value:pro}, {label:'Value', value:value}
  ]) + '<div class="sankey-legend"><span class="sankey-pill">Toate → pool brut</span><span class="sankey-pill">Cu cote → disponibile pe piață</span><span class="sankey-pill">PRO → filtru intern strict</span><span class="sankey-pill">Value → EV mai bun</span></div>';
}


function toggleMfAdvanced(btn){
  var panel = document.getElementById('mf-advanced');
  if(!panel) return;
  var isOpen = panel.style.display !== 'none';
  var nextOpen = !isOpen;
  panel.style.display = nextOpen ? 'block' : 'none';
  var controls = Array.prototype.slice.call(document.querySelectorAll('.mf-advanced-toggle,.mx20-filter-btn,.mx21-filter-btn,.ba-filter-control'));
  if(btn && controls.indexOf(btn) === -1) controls.push(btn);
  controls.forEach(function(control){
    control.classList.toggle('active', nextOpen);
    control.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    control.textContent = nextOpen ? 'Închide' : 'Filtre';
  });
}
function renderAll(){
  LAST_DAY_KEY = getCurrentDayKey();
  var total = ALL_MATCHES.length;
  var safe = ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE' && (m.verdict === 'safe' || m.riskTier === 'Safe'); }).length;
  var balanced = ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE' && m.riskTier === 'Balanced'; }).length;
  if($('st-balanced')) $('st-balanced').textContent = balanced;
  var value = ALL_MATCHES.filter(function(m){ return m.analysisState === 'ELIGIBLE' && m.bestBet && m.bestBet.value >= 0.05; }).length;
  var mlComplete = ALL_MATCHES.filter(function(m){ return m.createdAt && m.modelVersion && (m.probOver25 || m.probUnder25) && (m.xgTotal || m.xgHome || m.xgAway); }).length;

  var timeStr = getStatusDisplayTime();
  if(!timeStr){
    var now = new Date();
    timeStr = now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  }
  var statusMetrics = getStatusDisplayMetrics();
  var rawMl = statusMetrics.ml;
  var saCount = (SIGNAL_AUDIT && SIGNAL_AUDIT.count) ? String(SIGNAL_AUDIT.count) : '0';
  var saCountLabel = saCount + (saCount === '1' ? ' semnal top' : ' semnale top');
  var rawOdds = statusMetrics.odds;

  if($('st-total')) $('st-total').textContent = rawMl;
  if($('st-eligible')) $('st-eligible').textContent = rawOdds;
  if($('st-safe')) $('st-safe').textContent = safe;
  if($('st-value')) $('st-value').textContent = value;
  if($('st-mlcov')) $('st-mlcov').textContent = BACKTEST_SUMMARY && BACKTEST_SUMMARY.engine_bets ? ((BACKTEST_SUMMARY.engine_roi >= 0 ? '+' : '') + fmtPct(BACKTEST_SUMMARY.engine_roi || 0)) : (total ? Math.round(mlComplete*100/total)+'%' : '—');
  if($('hq-ml')) $('hq-ml').textContent = rawMl;
  if($('hq-odds')) $('hq-odds').textContent = rawOdds;
  if($('hq-safe')) $('hq-safe').textContent = safe;
  var enrichCount = Object.keys(ENRICHED_EVENT_CACHE).length;
  var enrichSuffix = enrichCount > 0 ? (' — 🔬 ML5 ' + enrichCount) : (ENRICHMENT_BATCH_RUNNING ? ' — 🔬 ML5 …' : '');
  var freshnessHtml = getDataFreshnessHtml();
  var sbEl = $('sb-text');
  if(sbEl){
    sbEl.innerHTML = rawMl+' ML predictions — '+rawOdds+' cu cote — '+saCountLabel+' — ora '+timeStr+enrichSuffix+freshnessHtml;
  }

  buildLeagueFilter();
  renderTicketQuickPeek();
  renderActiveTab(getCurrentActiveTabName(), { deferDashboardSecondary: getCurrentActiveTabName() === 'dashboard' });
  prefetchNonCriticalTabData();
}

window.addEventListener('DOMContentLoaded', function(){
  // Normalizare chei BANKROLL_SETTINGS — migrare de la versiunile vechi (cons/balanced/goals/safe/medium/risk → single/double/triple/contrarian)
  BANKROLL_SETTINGS = Object.assign({initial:1000, single:4, double:2.5, triple:1.5, contrarian:0.8}, BANKROLL_SETTINGS || {});
  if(BANKROLL_SETTINGS.single == null && BANKROLL_SETTINGS.cons     != null) BANKROLL_SETTINGS.single     = BANKROLL_SETTINGS.cons;
  if(BANKROLL_SETTINGS.single == null && BANKROLL_SETTINGS.safe     != null) BANKROLL_SETTINGS.single     = BANKROLL_SETTINGS.safe;
  if(BANKROLL_SETTINGS.double == null && BANKROLL_SETTINGS.balanced != null) BANKROLL_SETTINGS.double     = BANKROLL_SETTINGS.balanced;
  if(BANKROLL_SETTINGS.double == null && BANKROLL_SETTINGS.medium   != null) BANKROLL_SETTINGS.double     = BANKROLL_SETTINGS.medium;
  if(BANKROLL_SETTINGS.triple == null && BANKROLL_SETTINGS.goals    != null) BANKROLL_SETTINGS.triple     = BANKROLL_SETTINGS.goals;
  if(BANKROLL_SETTINGS.contrarian == null && BANKROLL_SETTINGS.risk != null) BANKROLL_SETTINGS.contrarian = BANKROLL_SETTINGS.risk;
  if($('bankroll-input'))  $('bankroll-input').value  = BANKROLL_SETTINGS.initial     || 1000;
  if($('bk-single-pct'))  $('bk-single-pct').value   = BANKROLL_SETTINGS.single      || 4;
  if($('bk-double-pct'))  $('bk-double-pct').value   = BANKROLL_SETTINGS.double      || 2.5;
  if($('bk-triple-pct'))  $('bk-triple-pct').value   = BANKROLL_SETTINGS.triple      || 1.5;
  if($('bk-contrarian-pct')) $('bk-contrarian-pct').value = BANKROLL_SETTINGS.contrarian || 0.8;
  renderJournal();
  // Try to restore token from localStorage
  var st=localStorage.getItem('bsd_token');
  if(st) API_TOKEN=st;
  moveDashboardSectionsToMatches();
  arrangeDashboardLayout();
  setMobileNavActive('dashboard');
  doRefresh();
  setInterval(checkDailyRefresh, 60000);
  setInterval(doRefresh, 1800000);
});
/* ===== Math Portfolio Override ===== */
function getActualBankrollValue(){
  var settings = Object.assign({initial:1000, single:4, double:2.5, triple:1.5, contrarian:0.8}, BANKROLL_SETTINGS || {});
  var initial = Number(settings.initial || 1000);
  var profit = (TRACKING || []).reduce(function(acc, t){ return acc + Number(t.profit || 0); }, 0);
  return Math.max(0, initial + profit);
}
function getMathPortfolioTypes(){
  return ['premium','double','triple','contrarian'];
}
function getMathPortfolioMeta(type, source){
  var sourceName = source === 'audit' ? 'Audit Kelly' : (source === 'aimemory' ? 'AI Memory' : 'Portfolio Daily');
  var metaMap = {
    premium: {
      icon:'🔥',
      label:'Single Premium',
      riskLabel:'Scăzut',
      summary:'1 selecție • scor 88-100 • edge > 10pp • cotă 1.70-2.40',
      empty:'Nu există acum un single premium care să respecte pragurile matematice.',
      priority:1
    },
    double: {
      icon:'✅',
      label:'Double Confirmed',
      riskLabel:'Scăzut-mediu',
      summary:'2 selecții • ambele >80 • necorelate • prob. compusă > 45%',
      empty:'Nu există 2 selecții necorelate suficient de curate pentru Double Confirmed.',
      priority:2
    },
    triple: {
      icon:'⚖️',
      label:'Triple Value',
      riskLabel:'Mediu',
      summary:'3 selecții • 75-85 • minim un value underdog • prob. compusă > 25%',
      empty:'Nu există acum un Triple Value suficient de curat sau bankroll-ul este sub prag.',
      priority:3
    },
    contrarian: {
      icon:'🎯',
      label:'Contrarian Shot',
      riskLabel:'Speculativ',
      summary:'2-3 selecții • preț agresiv • miza foarte mică • max 1/săptămână',
      empty:'Nu există acum un setup contrarian suficient de puternic.',
      priority:4
    }
  };
  var meta = metaMap[type] || metaMap.double;
  return Object.assign({sourceName:sourceName}, meta);
}
function getStakePctForTicket(type){
  var settings = Object.assign({initial:1000,single:4,double:2.5,triple:1.5,contrarian:0.8}, BANKROLL_SETTINGS || {});
  if(settings.single == null && settings.cons != null) settings.single = settings.cons;
  if(settings.double == null && settings.balanced != null) settings.double = settings.balanced;
  if(settings.triple == null && settings.goals != null) settings.triple = settings.goals;
  if(settings.contrarian == null && settings.risk != null) settings.contrarian = settings.risk;
  var map = {premium:'single', best_single:'single', profit_single:'single', single:'single', double:'double', cota2:'double', simple:'double', controlled_combo:'double', triple:'triple', over15:'triple', mix_combo:'triple', contrarian:'contrarian'};
  var key = map[type] || 'double';
  return Number(settings[key] || 0);
}
function getSuggestedStakeFromPct(type){
  var pct = getStakePctForTicket(type);
  return Math.max(1, +(getActualBankrollValue() * (pct / 100)).toFixed(2));
}
function impliedProbFromOdds(odds){
  var o = Number(odds || 0);
  return o > 1.01 ? (100 / o) : 0;
}
function getMarketCompareMap(source){
  if(!source || typeof source !== 'object') return {};
  // Nu folosim || {} ca fallback — {} gol e truthy și blochează lookup-ul nested
  var direct = source.market_best_odds || source.marketBestOdds || source.market_compare || source.marketCompare;
  if(direct && typeof direct === 'object' && !Array.isArray(direct) && Object.keys(direct).length) return direct;
  var event = source.event || source.rawEvent || null;
  if(event && typeof event === 'object'){
    var nested = event.market_best_odds || event.marketBestOdds || event.market_compare || event.marketCompare;
    if(nested && typeof nested === 'object' && !Array.isArray(nested) && Object.keys(nested).length) return nested;
  }
  return {};
}
function getMarketCompareInfo(source, marketKey, fallbackOdds){
  var map = getMarketCompareMap(source);
  var row = map && map[marketKey] ? map[marketKey] : null;
  var baseOdds = Number(fallbackOdds || 0);
  if(!row || typeof row !== 'object'){
    return { hasCompare:false, baseOdds:baseOdds, bestOdds:baseOdds > 1.01 ? baseOdds : 0, bestBookmaker:'', bookmakersCount:0, avgOdds:0, bestImpliedProb:baseOdds > 1.01 ? +(100 / baseOdds).toFixed(2) : null, avgImpliedProb:null, gapPct:0, activeSource:'STD', rowPresent:false };
  }
  var bestOdds = Number(row.best_odds != null ? row.best_odds : (row.bestOdds != null ? row.bestOdds : 0));
  if(!(bestOdds > 1.01)) bestOdds = baseOdds;
  var avgOdds = Number(row.avg_odds != null ? row.avg_odds : (row.avgOdds != null ? row.avgOdds : 0));
  var bookmakersCount = Number(row.bookmakers_count != null ? row.bookmakers_count : (row.bookmakersCount != null ? row.bookmakersCount : 0));
  var gapPct = (bestOdds > 1.01 && baseOdds > 1.01) ? +(((bestOdds / baseOdds) - 1) * 100).toFixed(2) : 0;
  return {
    hasCompare:!!(bookmakersCount > 0 || avgOdds > 1.01 || (bestOdds > 1.01 && bestOdds !== baseOdds) || String(row.best_bookmaker || row.bestBookmaker || '').trim()),
    baseOdds:baseOdds,
    bestOdds:bestOdds > 1.01 ? +bestOdds.toFixed(2) : 0,
    bestBookmaker:String(row.best_bookmaker || row.bestBookmaker || ''),
    bookmakersCount:bookmakersCount > 0 ? Math.round(bookmakersCount) : 0,
    avgOdds:avgOdds > 1.01 ? +avgOdds.toFixed(2) : 0,
    bestImpliedProb:row.best_implied_probability != null ? Number(row.best_implied_probability) : (bestOdds > 1.01 ? +(100 / bestOdds).toFixed(2) : null),
    avgImpliedProb:row.avg_implied_probability != null ? Number(row.avg_implied_probability) : (avgOdds > 1.01 ? +(100 / avgOdds).toFixed(2) : null),
    gapPct:gapPct,
    activeSource:(bestOdds > 1.01 ? 'BEST' : (avgOdds > 1.01 && !(baseOdds > 1.01) ? 'CMP' : 'STD')),
    rowPresent:true
  };
}
function clampMathScore(value){
  var v = Number(value || 0);
  if(!isFinite(v)) v = 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}
function getGenericEventKey(obj){
  if(!obj) return 'na';
  if(obj.eventKey) return obj.eventKey;
  if(obj.event_id != null) return 'e' + obj.event_id;
  if(obj.eventId != null) return 'e' + obj.eventId;
  return [obj.home || '—', obj.away || '—', obj.event_date || obj.date || '—'].join('|');
}
function countStrongMathMatches(pool){
  var seen = {};
  var count = 0;
  (pool || []).forEach(function(item){
    var score = Number(item.score != null ? item.score : item.portfolioScore || item.ticketScore || 0);
    if(score < 80) return;
    var key = getGenericEventKey(item);
    if(seen[key]) return;
    seen[key] = true;
    count += 1;
  });
  return count;
}
function isValueUnderdogCandidate(item){
  if(!item) return false;
  return Number(item.odds || item.displayOdds || 0) >= 2.0 &&
         Number(item.prob || 0) > impliedProbFromOdds(Number(item.odds || item.displayOdds || 0)) &&
         Number(item.value || 0) > 0;
}
function areRowsCorrelated(a, b){
  if(!a || !b) return false;
  var sameEvent = getGenericEventKey(a) === getGenericEventKey(b);
  if(sameEvent) return true;
  var sameLeague = String(a.league || '').trim().toLowerCase() === String(b.league || '').trim().toLowerCase();
  var sameMarket = String(a.marketKey || a.market_key || a.market || '').trim().toLowerCase() === String(b.marketKey || b.market_key || b.market || '').trim().toLowerCase();
  var ta = new Date(a.event_date || a.date || 0).getTime();
  var tb = new Date(b.event_date || b.date || 0).getTime();
  var sameWindow = isFinite(ta) && isFinite(tb) && Math.abs(ta - tb) <= (8 * 3600 * 1000);
  return (sameLeague && sameMarket) || (sameLeague && sameWindow);
}
function hasRecentContrarianTicket(){
  var cutoff = Date.now() - (4 * 86400000);
  return (TRACKING || []).some(function(t){
    var rawType = String((t && (t.type || t.criteria || t.ticketType || t.label)) || '').toLowerCase();
    if(rawType.indexOf('contrarian') === -1) return false;
    var when = new Date(t.placedAt || t.createdAt || t.generatedAt || t.date || 0).getTime();
    return isFinite(when) && when >= cutoff;
  });
}
function rankMathSelection(type, picks, totalOdds, combinedProb){
  var scoreSum = picks.reduce(function(acc, p){ return acc + Number(p.score || p.portfolioScore || p.ticketScore || 0); }, 0);
  var edgeSum = picks.reduce(function(acc, p){ return acc + Math.max(0, Number(p.edgeToPrice || p.edge || 0)); }, 0);
  var valueSum = picks.reduce(function(acc, p){ return acc + Math.max(0, Number(p.value || 0) * 100); }, 0);
  var targetMid = type === 'premium' ? 2.05 : type === 'double' ? 3.25 : type === 'triple' ? 6 : 9;
  var oddsPenalty = Math.abs(Number(totalOdds || 1) - targetMid) * 4.2;
  return scoreSum + (combinedProb * 0.55) + (edgeSum * 1.2) + (valueSum * 0.45) - oddsPenalty;
}
function makeMathTicketObject(type, source, picks, totalOdds, combinedProb, summary){
  var meta = getMathPortfolioMeta(type, source);
  var avgEdge = picks.length ? (picks.reduce(function(acc, p){ return acc + Number(p.value || 0); }, 0) / picks.length) : 0;
  var pct = getStakePctForTicket(type);
  return {
    type: type,
    label: meta.icon + ' ' + meta.label,
    criteria: meta.label,
    source: source,
    sourceName: meta.sourceName,
    picks: picks,
    totalOdds: Number(totalOdds || 1),
    combinedProb: Number(combinedProb || 0),
    avgEdge: Number(avgEdge || 0),
    riskLabel: meta.riskLabel,
    summary: summary || meta.summary,
    stakePct: pct,
    stake: getSuggestedStakeFromPct(type),
    generatedAt: new Date().toISOString(),
    priority: meta.priority,
    isEmpty: !picks.length
  };
}
function makeEmptyMathTicket(type, source, msg){
  var meta = getMathPortfolioMeta(type, source);
  var ticket = makeMathTicketObject(type, source, [], 1, 0, msg || meta.empty);
  ticket.error = msg || meta.empty;
  ticket.isEmpty = true;
  return ticket;
}
function buildPortfolioMarketCandidates(match){
  if(!match || !passesSelectionFilter(match)) return [];
  var marketTypes = ['over15','over25','under35','btts'];
  var out = [];
  marketTypes.forEach(function(type){
    var bet = getBetByType(match, type);
    if(!bet) return;
    if(isHardContradiction(match, type)) return;
    var odds = Number(bet.odds || 0);
    var prob = Number(bet.adjProb || 0);
    var value = Number(bet.value || 0);
    if(odds < 1.18 || odds > 3.40) return;
    if(prob <= 0 || value <= 0) return;
    var fit = marketFitAnalysis(match, type) || {score:0, reasons:[]};
    var edge = Number(bet.edgePct || 0);
    // edgeToPrice = edge no-vig (adjProb - noVigMarketProb), deja calculat corect în edgePct
    var edgeToPrice = edge;
    var score = 0;
    score += prob * 0.42;
    score += Math.max(0, edge) * 1.45;
    score += Math.max(0, edgeToPrice) * 1.05;
    score += Math.max(0, value) * 100 * 0.22;
    score += Number(match.confidence || 0) * 0.13;
    score += Number(fit.score || 0) * 0.55;
    if(bet.sourceApi) score += 3;
    if(bet.sourceHeuristic) score += 1.5;
    if(odds >= 1.70 && odds <= 2.40) score += 5;
    if(match.leagueTier === 'high') score += 3;
    if(match.leagueTier === 'avoid') score -= 6;
    if(type === 'btts' && Number(match.xgHome || 0) >= 0.95 && Number(match.xgAway || 0) >= 0.95) score += 4;
    if(type === 'under35' && Number(match.xgTotal || 0) <= 3.05) score += 4;
    if(type === 'over25' && Number(match.xgTotal || 0) >= 2.70) score += 4;
    if(type === 'over15' && Number(match.xgTotal || 0) >= 2.15) score += 3;
    score = clampMathScore(score);
    out.push(Object.assign({}, match, {
      source:'portfolio',
      eventKey: getGenericEventKey(match),
      marketKey: type,
      market: bet.label,
      displayMarket: bet.label,
      displayOdds: odds,
      odds: odds,
      prob: prob,
      value: value,
      edge: edge,
      edgeToPrice: edgeToPrice,
      score: score,
      portfolioScore: score,
      ticketScore: score,
      why: uniqueReasons((fit.reasons || []).concat([
        'Scor matematic ' + score,
        'Edge vs preț ' + fmtSignedPct(edgeToPrice),
        'Value ' + fmtSignedPct(value * 100)
      ])).slice(0, 4).join(' • '),
      bestBet: Object.assign({}, bet)
    }));
  });
  return out;
}
function getPortfolioMatchPool(){
  var pool = [];
  (ALL_MATCHES || []).forEach(function(match){
    buildPortfolioMarketCandidates(match).forEach(function(candidate){
      pool.push(candidate);
    });
  });
  pool.sort(function(a, b){
    if(Number(b.score || 0) !== Number(a.score || 0)) return Number(b.score || 0) - Number(a.score || 0);
    if(Number(b.edgeToPrice || 0) !== Number(a.edgeToPrice || 0)) return Number(b.edgeToPrice || 0) - Number(a.edgeToPrice || 0);
    return Number((b.bestBet && b.bestBet.value) || 0) - Number((a.bestBet && a.bestBet.value) || 0);
  });
  return pool;
}
function buildMathTicketPreviewFromPool(type, source, pool){
  var bankroll = getActualBankrollValue();
  var strongCount = countStrongMathMatches(pool);
  if(type !== 'premium' && strongCount < 2){
    return makeEmptyMathTicket(type, source, 'Disciplina > volum: astăzi nu există minim 2 meciuri diferite cu scor peste 80.');
  }
  if(type === 'premium'){
    var premiumList = (pool || []).filter(function(item){
      return Number(item.score || 0) >= 88 &&
             Number(item.prob || 0) >= 75 &&
             Number(item.odds || 0) >= 1.70 &&
             Number(item.odds || 0) <= 2.40 &&
             Math.max(Number(item.edge || 0), Number(item.edgeToPrice || 0)) > 10;
    });
    if(!premiumList.length) return makeEmptyMathTicket(type, source, 'Nu există acum un Single Premium valid pe pragurile scor + edge + preț.');
    return makeMathTicketObject(type, source, [premiumList[0]], premiumList[0].odds, premiumList[0].prob, 'Fără taxă de corelație: un singur pick premium, cu edge real față de preț.');
  }
  if(type === 'double'){
    var doublePool = (pool || []).filter(function(item){
      return Number(item.score || 0) >= 80 && Number(item.prob || 0) >= 62 && Number(item.odds || 0) >= 1.20 && Number(item.odds || 0) <= 2.30;
    }).slice(0, 18);
    var bestDouble = null;
    for(var i=0;i<doublePool.length;i++){
      for(var j=i+1;j<doublePool.length;j++){
        var a = doublePool[i], b = doublePool[j];
        if(areRowsCorrelated(a, b)) continue;
        var totalOdds = Number(a.odds || 1) * Number(b.odds || 1);
        var combinedProb = Number(a.prob || 0) * Number(b.prob || 0) / 100;
        if(totalOdds < 2.50 || totalOdds > 4.00) continue;
        if(combinedProb <= 45) continue;
        var rank = rankMathSelection(type, [a, b], totalOdds, combinedProb);
        if(!bestDouble || rank > bestDouble.rank) bestDouble = {picks:[a, b], totalOdds:totalOdds, combinedProb:combinedProb, rank:rank};
      }
    }
    if(!bestDouble) return makeEmptyMathTicket(type, source, 'Nu există 2 selecții necorelate care să treacă simultan pragurile de scor, probabilitate și cotă.');
    return makeMathTicketObject(type, source, bestDouble.picks, bestDouble.totalOdds, bestDouble.combinedProb, 'Double strict: exact 2 selecții necorelate, ambele validate matematic.');
  }
  if(type === 'triple'){
    var triplePool = (pool || []).filter(function(item){
      return Number(item.score || 0) >= 75 && Number(item.score || 0) <= 89 && Number(item.prob || 0) >= 52 && Number(item.odds || 0) >= 1.28 && Number(item.odds || 0) <= 3.20;
    }).slice(0, 18);
    var bestTriple = null;
    for(var i=0;i<triplePool.length;i++){
      for(var j=i+1;j<triplePool.length;j++){
        if(areRowsCorrelated(triplePool[i], triplePool[j])) continue;
        for(var k=j+1;k<triplePool.length;k++){
          var a = triplePool[i], b = triplePool[j], c = triplePool[k];
          if(areRowsCorrelated(a, c) || areRowsCorrelated(b, c)) continue;
          var picks = [a, b, c];
          if(!picks.some(isValueUnderdogCandidate)) continue;
          var totalOdds = picks.reduce(function(acc, item){ return acc * Number(item.odds || 1); }, 1);
          var combinedProb = picks.reduce(function(acc, item){ return acc * (Number(item.prob || 0) / 100); }, 1) * 100;
          if(totalOdds < 4.00 || totalOdds > 8.00) continue;
          if(combinedProb <= 25) continue;
          var rank = rankMathSelection(type, picks, totalOdds, combinedProb);
          if(!bestTriple || rank > bestTriple.rank) bestTriple = {picks:picks, totalOdds:totalOdds, combinedProb:combinedProb, rank:rank};
        }
      }
    }
    if(!bestTriple) return makeEmptyMathTicket(type, source, 'Nu există un Triple Value curat cu 3 selecții și minim un underdog value.');
    return makeMathTicketObject(type, source, bestTriple.picks, bestTriple.totalOdds, bestTriple.combinedProb, 'Triple controlat: 3 selecții, cu cel puțin un underdog care bate probabilitatea implicită din cotă.');
  }
  if(type === 'contrarian'){
    if(hasRecentContrarianTicket()) return makeEmptyMathTicket(type, source, 'Există deja un Contrarian Shot în ultimele 7 zile. Regula de frecvență îl blochează.');
    var contrarianPool = (pool || []).filter(function(item){
      return Number(item.score || 0) >= 67 &&
             Number(item.odds || 0) >= 1.70 &&
             Number(item.odds || 0) <= 3.80 &&
             Math.max(Number(item.edgeToPrice || 0), Number(item.edge || 0)) >= 3;
    }).slice(0, 16);
    var bestContrarian = null;
    for(var i=0;i<contrarianPool.length;i++){
      for(var j=i+1;j<contrarianPool.length;j++){
        var pair = [contrarianPool[i], contrarianPool[j]];
        if(areRowsCorrelated(pair[0], pair[1])) continue;
        var pairOdds = pair.reduce(function(acc, item){ return acc * Number(item.odds || 1); }, 1);
        var pairProb = pair.reduce(function(acc, item){ return acc * (Number(item.prob || 0) / 100); }, 1) * 100;
        if(pairOdds >= 5.5 && pairOdds <= 15 && pairProb >= 12 && pairProb <= 27){
          var pairRank = rankMathSelection(type, pair, pairOdds, pairProb);
          if(!bestContrarian || pairRank > bestContrarian.rank) bestContrarian = {picks:pair, totalOdds:pairOdds, combinedProb:pairProb, rank:pairRank};
        }
        for(var k=j+1;k<contrarianPool.length;k++){
          var tri = [contrarianPool[i], contrarianPool[j], contrarianPool[k]];
          if(areRowsCorrelated(tri[0], tri[2]) || areRowsCorrelated(tri[1], tri[2])) continue;
          var triOdds = tri.reduce(function(acc, item){ return acc * Number(item.odds || 1); }, 1);
          var triProb = tri.reduce(function(acc, item){ return acc * (Number(item.prob || 0) / 100); }, 1) * 100;
          if(triOdds < 5.5 || triOdds > 15 || triProb < 12 || triProb > 27) continue;
          var triRank = rankMathSelection(type, tri, triOdds, triProb);
          if(!bestContrarian || triRank > bestContrarian.rank) bestContrarian = {picks:tri, totalOdds:triOdds, combinedProb:triProb, rank:triRank};
        }
      }
    }
    if(!bestContrarian) return makeEmptyMathTicket(type, source, 'Nu există un setup contrarian valid în intervalul 5.50-15.00 și 12-27% probabilitate compusă.');
    return makeMathTicketObject(type, source, bestContrarian.picks, bestContrarian.totalOdds, bestContrarian.combinedProb, 'Setup contrarian: 2-3 selecții cu preț agresiv și miză mică, folosite rar.');
  }
  return makeEmptyMathTicket(type, source, 'Tip de bilet necunoscut.');
}
function buildPortfolioTicketPreview(type){
  return buildMathTicketPreviewFromPool(type, 'portfolio', getPortfolioMatchPool());
}
function applyPortfolioPreview(preview, silent){
  if(!preview || !preview.picks || !preview.picks.length){
    BILETE = {
      picks: [],
      totalOdds: 1,
      generatedAt: new Date().toISOString(),
      type: preview && preview.type ? preview.type : null,
      label: preview && preview.label ? preview.label : 'Bilet',
      criteria: preview && preview.criteria ? preview.criteria : '',
      error: preview && preview.error ? preview.error : 'Nu există selecții suficiente.'
    };
    renderBilete();
    if(!silent) toast(BILETE.error, 'warn');
    return preview;
  }
  BILETE = {
    picks: preview.picks,
    totalOdds: preview.totalOdds,
    generatedAt: new Date().toISOString(),
    type: preview.type,
    label: preview.label,
    criteria: preview.criteria,
    combinedProb: preview.combinedProb,
    avgEdge: preview.avgEdge,
    riskLabel: preview.riskLabel,
    summary: preview.summary,
    stakePct: preview.stakePct,
    stake: preview.stake
  };
  renderBilete();
  if(!silent) toast(preview.label + ' generat!', 'ok');
  return preview;
}
function generatePortfolioTicket(type, silent){
  return applyPortfolioPreview(buildPortfolioTicketPreview(type), silent);
}
function generateSinglePremiumTicket(){ return generatePortfolioTicket('premium'); }
function generateDoubleConfirmedTicket(){ return generatePortfolioTicket('double'); }
function generateTripleValueTicket(){ return generatePortfolioTicket('triple'); }
function generateContrarianShotTicket(){ return generatePortfolioTicket('contrarian'); }

function getAuditMathPool(){
  return ((SIGNAL_AUDIT && SIGNAL_AUDIT.rows) || []).filter(function(row){
    return row && (row.event_id != null || (row.home && row.away)) && Number(row.book_odds || 0) >= 1.10 && Number(row.adjusted_prob || 0) > 0;
  }).map(function(row){
    var odds = Number(row.book_odds || 0);
    var prob = Number(row.adjusted_prob || 0);
    var value = Number(row.value || 0);
    var edge = Number(row.edge_pct || 0);
    var kelly = Number(row.kelly_quarter_pct || 0);
    var rawScore = Number(row.score || 0);
    var score = rawScore > 0 ? rawScore : (prob * 0.48 + Math.max(0, edge) * 1.8 + Math.max(0, value) * 100 * 0.22 + Math.max(0, kelly) * 0.65);
    score = Math.max(score, prob * 0.40 + Math.max(0, edge) * 1.1);
    score = clampMathScore(score);
    return Object.assign({}, row, {
      source:'audit',
      eventKey:getGenericEventKey(row),
      marketKey:getAuditRowMarketKey(row),
      displayMarket: row.market || '—',
      displayOdds: odds,
      odds: odds,
      prob: prob,
      value: value,
      edge: edge,
      edgeToPrice: edge, // no-vig: edge_pct = adjProb - noVigMarketProb (deja corect)
      score: score,
      ticketScore: score
    });
  }).sort(function(a,b){
    if(Number(b.score || 0) !== Number(a.score || 0)) return Number(b.score || 0) - Number(a.score || 0);
    return Number(b.edgeToPrice || 0) - Number(a.edgeToPrice || 0);
  });
}
function generateAuditTicket(type, silent){
  AUDIT_TICKETS[type] = buildMathTicketPreviewFromPool(type, 'audit', getAuditMathPool());
  renderAuditTicket(type);
  if(!silent) toast(AUDIT_TICKETS[type].label + (AUDIT_TICKETS[type].picks && AUDIT_TICKETS[type].picks.length ? ' generat!' : ' indisponibil acum'), AUDIT_TICKETS[type].picks && AUDIT_TICKETS[type].picks.length ? 'ok' : 'warn');
}
function renderAuditTicket(type){
  var target = $('audit-ticket-' + type);
  if(!target) return;
  var ticket = AUDIT_TICKETS[type];
  if(!ticket || !ticket.picks || !ticket.picks.length){
    var msg = ticket && ticket.error ? ticket.error : 'Apasă pe Generează pentru auditul matematic.';
    target.innerHTML = '<div class="empty-state" style="padding:10px">' + msg + '</div>';
    return;
  }
  var html = '<div style="padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03)">'+
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
      '<div><div style="font-size:13px;font-weight:800;color:var(--txt)">'+ticket.label+'</div><div style="font-size:10px;color:var(--muted);margin-top:4px">'+ticket.picks.length+' selecții • '+ticket.summary+(ticket.generatedAt ? ' • '+fmtDateTime(ticket.generatedAt) : '')+'</div></div>'+
      '<div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--grn)">'+ticket.totalOdds.toFixed(2)+'x</div><div style="font-size:10px;color:var(--muted);margin-top:4px">Prob. compusă '+ticket.combinedProb.toFixed(1)+'% • stake '+ticket.stakePct.toFixed(1)+'%</div></div>'+
    '</div>';
  ticket.picks.forEach(function(row){
    var tags = (row.reason_tags || []).slice(0, 2).map(function(tag){ return '<span class="reason-pill">'+tag+'</span>'; }).join('');
    html += '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.06)">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><div style="font-size:12px;font-weight:700;color:var(--txt)">'+renderEventIdentity({ home:row.home, away:row.away, league:row.league, event_id:row.event_id, prediction_id:row.prediction_id, event_date:row.event_date, home_api_id:row.home_api_id, away_api_id:row.away_api_id, league_api_id:row.league_api_id }, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc(row.event_date ? (fmtDate(row.event_date)+' '+fmtTime(row.event_date)) : '—') })+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:12px;font-weight:800;color:var(--acc)">'+(row.displayMarket || row.market || '—')+' @ '+Number(row.displayOdds || row.odds || 0).toFixed(2)+'</div><div style="font-size:10px;color:var(--grn);margin-top:4px">Scor '+Number(row.score || 0).toFixed(0)+' • Edge '+fmtSignedPct(Number(row.edge || 0))+'</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="reason-pill">Prob '+fmtPct(Number(row.prob || 0))+'</span><span class="reason-pill">Kelly '+fmtPct(Number(row.kelly_quarter_pct || 0))+'</span><span class="reason-pill">Value '+fmtSignedPct(Number(row.value || 0) * 100)+'</span>'+(tags || '')+'</div>'+
    '</div>';
  });
  html += '</div>';
  target.innerHTML = html;
}

function getAiMemoryMathPool(){
  return ((AI_MEMORY && AI_MEMORY.adaptive_picks) || []).filter(function(row){
    return row && row.event_id && Number(row.odds || 0) >= 1.10 && Number(row.adjusted_prob || 0) > 0;
  }).map(function(row){
    var odds = Number(row.odds || 0);
    var prob = Number(row.adjusted_prob || 0);
    var value = Number(row.value || 0);
    var edge = Number(row.edge_pct || 0);
    var bonus = Number(row.memory_bonus || 0);
    var adaptive = Number(row.adaptive_score || 0);
    var score = Math.max(adaptive, prob * 0.44 + Math.max(0, edge) * 1.5 + Math.max(0, value) * 100 * 0.18 + Math.max(0, bonus) * 2.1);
    score = clampMathScore(score);
    return Object.assign({}, row, {
      source:'aimemory',
      eventKey:getGenericEventKey(row),
      marketKey:row.market_key || row.market || 'misc',
      displayMarket: row.market || '—',
      displayOdds: odds,
      odds: odds,
      prob: prob,
      value: value,
      edge: edge,
      edgeToPrice: edge, // no-vig: edge_pct = adjProb - noVigMarketProb (deja corect)
      score: score,
      ticketScore: score
    });
  }).sort(function(a,b){
    if(Number(b.score || 0) !== Number(a.score || 0)) return Number(b.score || 0) - Number(a.score || 0);
    return Number(b.memory_bonus || 0) - Number(a.memory_bonus || 0);
  });
}
function generateAiMemoryTicket(type, silent){
  AI_MEMORY_TICKETS[type] = buildMathTicketPreviewFromPool(type, 'aimemory', getAiMemoryMathPool());
  renderAiMemoryTicket(type);
  if(!silent) toast(AI_MEMORY_TICKETS[type].label + (AI_MEMORY_TICKETS[type].picks && AI_MEMORY_TICKETS[type].picks.length ? ' generat!' : ' indisponibil acum'), AI_MEMORY_TICKETS[type].picks && AI_MEMORY_TICKETS[type].picks.length ? 'ok' : 'warn');
}
function renderAiMemoryTicket(type){
  var target = $('ai-ticket-' + type);
  if(!target) return;
  var ticket = AI_MEMORY_TICKETS[type];
  if(!ticket || !ticket.picks || !ticket.picks.length){
    var msg = ticket && ticket.error ? ticket.error : 'Apasă pe Generează pentru filtrul AI Memory.';
    target.innerHTML = '<div class="empty-state" style="padding:10px">' + msg + '</div>';
    return;
  }
  var html = '<div style="padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03)">'+
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
      '<div><div style="font-size:13px;font-weight:800;color:var(--txt)">'+ticket.label+'</div><div style="font-size:10px;color:var(--muted);margin-top:4px">'+ticket.picks.length+' selecții • '+ticket.summary+(ticket.generatedAt ? ' • '+fmtDateTime(ticket.generatedAt) : '')+'</div></div>'+
      '<div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--grn)">'+ticket.totalOdds.toFixed(2)+'x</div><div style="font-size:10px;color:var(--muted);margin-top:4px">Prob. compusă '+ticket.combinedProb.toFixed(1)+'% • stake '+ticket.stakePct.toFixed(1)+'%</div></div>'+
    '</div>';
  ticket.picks.forEach(function(row){
    var reasons = (row.reasons || []).slice(0, 2).map(function(reason){ return '<span class="reason-pill">'+reason.label+' • '+(Number(reason.impact || 0) >= 0 ? '+' : '')+Number(reason.impact || 0).toFixed(1)+'</span>'; }).join('');
    html += '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.06)">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><div style="font-size:12px;font-weight:700;color:var(--txt)">'+renderEventIdentity({ home:row.home, away:row.away, league:row.league, event_id:row.event_id, prediction_id:row.prediction_id, event_date:row.event_date, home_api_id:row.home_api_id, away_api_id:row.away_api_id, league_api_id:row.league_api_id }, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc(row.event_date ? (fmtDate(row.event_date)+' '+fmtTime(row.event_date)) : '—') })+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:12px;font-weight:800;color:var(--acc)">'+(row.displayMarket || row.market || '—')+' @ '+Number(row.displayOdds || row.odds || 0).toFixed(2)+'</div><div style="font-size:10px;color:'+(Number(row.memory_bonus || 0) >= 0 ? 'var(--grn)' : 'var(--red)')+';margin-top:4px">Scor '+Number(row.score || 0).toFixed(0)+' • Mem '+(Number(row.memory_bonus || 0) >= 0 ? '+' : '')+Number(row.memory_bonus || 0).toFixed(1)+'</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="reason-pill">Prob '+fmtPct(Number(row.prob || 0))+'</span><span class="reason-pill">Value '+fmtSignedPct(Number(row.value || 0) * 100)+'</span><span class="reason-pill">Adapt '+Number(row.adaptive_score || 0).toFixed(1)+'</span>'+(reasons || '')+'</div>'+
    '</div>';
  });
  html += '</div>';
  target.innerHTML = html;
}

function normalizeTicketCategory(ticket){
  var raw = ((ticket && (ticket.criteria || ticket.label || ticket.type)) || '').toLowerCase();
  if(ticket && ticket.type === 'extra') return 'Extra';
  if(ticket && ticket.type === 'cota2') return 'Cota 2 Daily';
  if(raw.indexOf('cota 2') >= 0 || raw.indexOf('cota2') >= 0) return 'Cota 2 Daily';
  if(raw.indexOf('single premium') >= 0 || raw.indexOf('premium') >= 0) return 'Single Premium';
  if(raw.indexOf('double confirmed') >= 0 || raw.indexOf('double') >= 0) return 'Double Confirmed';
  if(raw.indexOf('triple value') >= 0 || raw.indexOf('triple') >= 0) return 'Triple Value';
  if(raw.indexOf('contrarian') >= 0) return 'Contrarian Shot';
  if(raw.indexOf('single') >= 0) return 'Single';
  return 'Generat';
}
function getBankrollCategoryForTicket(type){
  if(type === 'premium' || type === 'best_single' || type === 'profit_single' || type === 'single') return 'single';
  if(type === 'double' || type === 'simple' || type === 'controlled_combo') return 'double';
  if(type === 'triple' || type === 'over15' || type === 'mix_combo') return 'triple';
  if(type === 'contrarian') return 'contrarian';
  return 'double';
}
function getStakeForTicket(type){
  return Math.max(1, Math.round(getActualBankrollValue() * (getStakePctForTicket(type) / 100)));
}
function getPresetTicketCards(){
  var presets = [
    { key:'premium', title:'Single Premium', accent:'var(--grn)', action:'generateSinglePremiumTicket()', btn:'Generează', preview:buildPortfolioTicketPreview('premium') },
    { key:'double', title:'Double Confirmed', accent:'var(--acc)', action:'generateDoubleConfirmedTicket()', btn:'Generează', preview:buildPortfolioTicketPreview('double') },
    { key:'triple', title:'Triple Value', accent:'var(--pur)', action:'generateTripleValueTicket()', btn:'Generează', preview:buildPortfolioTicketPreview('triple') },
    { key:'contrarian', title:'Contrarian Shot', accent:'var(--red)', action:'generateContrarianShotTicket()', btn:'Generează', preview:buildPortfolioTicketPreview('contrarian') }
  ];
  var available = presets.filter(function(item){ return item.preview && item.preview.picks && item.preview.picks.length; }).sort(function(a, b){ return rankPresetTicket(b.preview) - rankPresetTicket(a.preview); });
  if(available.length) available[0].recommended = true;
  else if(presets[0]) presets[0].recommended = true;
  return presets;
}
function renderBilete(){
  var container = $('bilete-container');
  if(!container) return;

  // Weekday restrictions banner
  var _wdNow = new Date().getDay(); // 0=Sun,1=Mon...
  var _wdMon = (_wdNow === 0 ? 6 : _wdNow - 1); // convert to 0=Mon...6=Sun
  var _wdRestrictions = {'under35':[2,3,4,6],'over15':[0,3,4]};
  var _wdNames = ['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică'];
  var _wdBadMarkets = Object.keys(_wdRestrictions).filter(function(m){ return _wdRestrictions[m].indexOf(_wdMon) >= 0; });
  if(_wdBadMarkets.length > 0){
    var _wdBanner = container.previousElementSibling && container.previousElementSibling.classList && container.previousElementSibling.classList.contains('wd-banner');
    if(!_wdBanner){
      var _banner = document.createElement('div');
      _banner.className = 'wd-banner';
      _banner.style.cssText = 'margin-bottom:10px;padding:10px 14px;border-radius:12px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);font-size:12px;color:var(--yel);display:flex;align-items:center;gap:8px;';
      _banner.innerHTML = '⚠️ <strong>' + _wdNames[_wdMon] + '</strong>: engine-ul evită <strong>' + _wdBadMarkets.join(', ') + '</strong> azi (ROI negativ istoric în această zi)';
      container.parentNode && container.parentNode.insertBefore(_banner, container);
    }
  }

  if(!BILETE || !BILETE.picks || BILETE.picks.length === 0){
    var msg = (BILETE && BILETE.error) ? BILETE.error : 'Alege un generator și creează biletul dorit.';
    container.innerHTML = '<div class="ticket-empty-cta"><div class="ticket-empty-cta-title">Niciun bilet generat încă</div><div class="ticket-empty-cta-sub">'+msg+'</div></div>';
    updateTicketIndicators();
    renderTicketQuickPeek();
    return;
  }
  var picks = BILETE.picks;
  var totalOdds = Number(BILETE.totalOdds || 1);
  var combinedProb = Number(BILETE.combinedProb || computeConservativeCombinedProb(picks));
  var stakePct = Number(BILETE.stakePct != null ? BILETE.stakePct : getStakePctForTicket(BILETE.type));
  var stake = Number(BILETE.stake != null ? BILETE.stake : getSuggestedStakeFromPct(BILETE.type));
  var stakeText = stake > 0 ? (stake.toFixed(2) + ' RON') : 'manuală la plasare';
  if(stakePct > 0) stakeText += ' (' + stakePct.toFixed(1) + '% bankroll)';
  var avgEdgePct = Number(BILETE.avgEdge || 0) * 100;
  var category = normalizeTicketCategory(BILETE);
  var html = '<div class="bilet-card">'+
    '<div class="bilet-hdr">'+
      '<div><div class="bilet-title">'+(BILETE.label || '🎯 Bilet')+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+category+' • '+(BILETE.riskLabel || '—')+' • '+picks.length+' selecții</div></div>'+
      '<div class="bilet-cota" style="color:var(--grn)">'+totalOdds.toFixed(2)+'x</div>'+
    '</div>'+
    '<div class="ticket-mini-grid" style="margin-top:12px">'+
      '<div class="ticket-mini"><div class="v">'+combinedProb.toFixed(1)+'%</div><div class="l">Prob. conservatoare</div></div>'+
      '<div class="ticket-mini"><div class="v">'+stakeText+'</div><div class="l">Miză recomandată</div></div>'+
      '<div class="ticket-mini"><div class="v">'+(avgEdgePct >= 0 ? '+' : '')+avgEdgePct.toFixed(1)+'%</div><div class="l">Edge mediu</div></div>'+
    '</div>'+
    '<div class="bilet-meta">Biletul activ este compactat pe ideea <b>ce joc</b>, <b>de ce îl joc</b> și <b>ce risc îmi asum</b>. Pentru fiecare selecție vezi mai jos rezumatul scurt, nu tot zgomotul statistic.</div>';
  picks.forEach(function(match){
    var bet = match.bestBet || match;
    var reasonsArr = buildRecommendationReasons(match, bet);
    var shortWhy = (match.why && String(match.why).trim()) ? match.why : reasonsArr.slice(0, 2).join(' • ');
    var hybridBlock = bet && bet.probabilityEngine === 'hybrid' ? renderHybridProbabilityBlock({ apiProb:bet.apiProb, poissonProb:bet.poissonProb, hybridProb:bet.prob, delta:bet.poissonDelta }) : '';
    html += '<div class="bilet-row" style="display:block">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
        '<div class="bilet-match">'+
          '<div class="bilet-match-name">'+renderEventIdentity(match, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc((match.dateLabel || '') + ((match.timeLabel || '') ? (' ' + (match.timeLabel || '')) : '')), scoreBadgeHtml:(match.mostLikelyScore ? '<span class="score-badge" style="font-size:9px">⚽ '+htmlEsc(match.mostLikelyScore)+'</span>' : '') })+'</div>'+
          '<div class="bilet-match-info">&nbsp;</div>'+
        '</div>'+
        '<div class="bilet-pick">'+
          '<div class="bilet-pick-type">'+bet.label+' @ '+Number(bet.odds || 0).toFixed(2)+' '+sourceChipHtmlForBet(bet)+'</div>'+
          '<div class="bilet-pick-prob">Șansă '+fmtPct(Number(bet.adjProb || 0))+' • Confidence '+Number(match.confidence || 0).toFixed(0)+'%</div>'+
        '</div>'+
      '</div>'+
      '<div class="match-why" style="margin-top:10px"><strong>De ce:</strong> '+(shortWhy || 'setup valid conform filtrului selectat')+'</div>'+
      '<div class="ticket-mini-grid" style="margin-top:10px">'+
        '<div class="ticket-mini"><div class="v">'+Number(match.xgTotal || 0).toFixed(2)+'</div><div class="l">xG total</div></div>'+
        '<div class="ticket-mini"><div class="v">'+(Number(bet.value || 0) >= 0 ? '+' : '')+fmtPct(Number(bet.value || 0) * 100)+'</div><div class="l">Value</div></div>'+
        '<div class="ticket-mini"><div class="v">'+(Number(bet.edgePct || 0) >= 0 ? '+' : '')+fmtPct(Number(bet.edgePct || 0))+'</div><div class="l">Edge</div></div>'+
      '</div>'+
      hybridBlock+
    '</div>';
  });
  html += '<div style="margin-top:16px;display:grid;gap:10px">'+
    '<button onclick="storeTicket()" class="btn btn-primary" style="padding:12px 24px;font-size:14px;width:100%;justify-content:center">📌 PLASEAZĂ ÎN JURNAL</button>'+
    '<button onclick="placeCurrentTicket()" class="btn btn-green" style="padding:12px 24px;font-size:14px;width:100%;justify-content:center">✅ MARCHEAZĂ CA PLASAT</button>'+
    '<button onclick="clearCurrentTicket()" class="btn" style="padding:12px 24px;font-size:14px;width:100%;justify-content:center;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.24);color:var(--red)">🗑️ ȘTERGE BILETUL</button>'+
  '</div></div>';
  container.innerHTML = html;
  updateTicketIndicators();
  renderTicketQuickPeek();
}

function calcBankroll(){
  var initialBk = parseFloat(($('bankroll-input') && $('bankroll-input').value) || 1000) || 1000;
  var singlePct = parseFloat(($('bk-single-pct') && $('bk-single-pct').value) || 4) || 4;
  var doublePct = parseFloat(($('bk-double-pct') && $('bk-double-pct').value) || 2.5) || 2.5;
  var triplePct = parseFloat(($('bk-triple-pct') && $('bk-triple-pct').value) || 1.5) || 1.5;
  var contrarianPct = parseFloat(($('bk-contrarian-pct') && $('bk-contrarian-pct').value) || 0.8) || 0.8;
  BANKROLL_SETTINGS = Object.assign({initial:1000,single:4,double:2.5,triple:1.5,contrarian:0.8}, BANKROLL_SETTINGS || {}, {
    initial: initialBk,
    single: singlePct,
    double: doublePct,
    triple: triplePct,
    contrarian: contrarianPct
  });
  localStorage.setItem('bet_bankroll_settings', JSON.stringify(BANKROLL_SETTINGS));
  var totalProfit = (TRACKING || []).reduce(function(acc, item){ return acc + Number(item.profit || 0); }, 0);
  var actualBk = initialBk + totalProfit;
  if($('bk-actual-val')) $('bk-actual-val').textContent = actualBk.toFixed(2) + ' RON';
  if($('bk-profit-val')){
    $('bk-profit-val').textContent = (totalProfit >= 0 ? '+' : '') + totalProfit.toFixed(2) + ' RON';
    $('bk-profit-val').style.color = totalProfit >= 0 ? 'var(--grn)' : 'var(--red)';
  }
  var cards = [
    {label:'🔥 Single Premium', pct:singlePct, stake:actualBk * singlePct / 100, sub:'Scor > 88 și edge real > 10pp', color:'var(--grn)'},
    {label:'✅ Double Confirmed', pct:doublePct, stake:actualBk * doublePct / 100, sub:'2 selecții necorelate, ambele > 80', color:'var(--acc)'},
    {label:'⚖️ Triple Value', pct:triplePct, stake:actualBk * triplePct / 100, sub:'3 selecții cu minim un underdog value', color:'var(--pur)'},
    {label:'🎯 Contrarian Shot', pct:contrarianPct, stake:actualBk * contrarianPct / 100, sub:'0.5-1% și max 1 pe săptămână', color:'var(--red)'}
  ];
  if($('bk-grid')){
    $('bk-grid').innerHTML = cards.map(function(card){
      return '<div class="bk-item"><div class="bk-label">'+card.label+'</div><div class="bk-val" style="color:'+card.color+'">'+card.stake.toFixed(2)+' RON</div><div class="bk-sub">'+card.pct.toFixed(1)+'% din bankroll • '+card.sub+'</div></div>';
    }).join('');
  }
  renderBankrollTrend(initialBk);
}

window.addEventListener('DOMContentLoaded', function(){
  BANKROLL_SETTINGS = Object.assign({initial:1000,single:4,double:2.5,triple:1.5,contrarian:0.8}, BANKROLL_SETTINGS || {});
  if(BANKROLL_SETTINGS.single == null && BANKROLL_SETTINGS.cons != null) BANKROLL_SETTINGS.single = BANKROLL_SETTINGS.cons;
  if(BANKROLL_SETTINGS.double == null && BANKROLL_SETTINGS.balanced != null) BANKROLL_SETTINGS.double = BANKROLL_SETTINGS.balanced;
  if(BANKROLL_SETTINGS.triple == null && BANKROLL_SETTINGS.goals != null) BANKROLL_SETTINGS.triple = BANKROLL_SETTINGS.goals;
  if(BANKROLL_SETTINGS.contrarian == null && BANKROLL_SETTINGS.risk != null) BANKROLL_SETTINGS.contrarian = BANKROLL_SETTINGS.risk;
  if($('bankroll-input')) $('bankroll-input').value = BANKROLL_SETTINGS.initial || 1000;
  if($('bk-single-pct')) $('bk-single-pct').value = BANKROLL_SETTINGS.single || 4;
  if($('bk-double-pct')) $('bk-double-pct').value = BANKROLL_SETTINGS.double || 2.5;
  if($('bk-triple-pct')) $('bk-triple-pct').value = BANKROLL_SETTINGS.triple || 1.5;
  if($('bk-contrarian-pct')) $('bk-contrarian-pct').value = BANKROLL_SETTINGS.contrarian || 0.8;
  calcBankroll();
});

/* ===== History 21 categories override ===== */
function getHistory21LivePendingRows(){
  var DC_MARKETS = {dc1x:true, dcx2:true, dc12:true};
  return (ALL_MATCHES || []).filter(function(m){
    if(!m || !isMatchStillDisplayable(m) || m.analysisState !== 'ELIGIBLE' || !m.bestBet) return false;
    var mk = m.bestBet.type || inferMarketTypeFromLabel(m.bestBet.label || '');
    return !DC_MARKETS[mk];
  }).map(function(m){
    var b = m.bestBet || {};
    return {
      source: 'matches',
      status: 'pending',
      won: null,
      event_id: m.eventId != null ? m.eventId : null,
      eventId: m.eventId != null ? m.eventId : null,
      prediction_id: m.id != null ? m.id : null,
      home: m.home,
      away: m.away,
      league: m.league,
      event_date: m.date,
      date: m.date,
      market: b.label || '—',
      market_key: b.type || inferMarketTypeFromLabel(b.label || ''),
      odds: Number(b.odds || 0),
      adjusted_prob: Number(b.adjProb || 0),
      edge_pct: Number(b.edgePct || 0),
      value: Number(b.value || 0),
      verdict: m.verdict || b.verdict || null,
      score: Number(m.smartScore || b.score || 0),
      model_version: m.modelVersion || null,
      most_likely_score: m.mostLikelyScore || null,
      logged_at: null,
      prediction_created_at: m.createdAt || null,
      home_score: null,
      away_score: null
    };
  });
}
function getHistory21CategoryDefs(rows){
  var defs = [
    {key:'all',            label:'Toate'},
    {key:'motor_validated',label:'🧠 Motor'},
    {key:'safe',           label:'⭐ Top'},
    {key:'over15',         label:'🔥 O1.5'},
    {key:'over25',         label:'📈 O2.5'},
    {key:'btts',           label:'🤝 BTTS'},
    {key:'under35',        label:'🧊 U3.5'},
    {key:'value',          label:'💰 Value'}
  ];
  var known = {};
  defs.forEach(function(def){ known[def.key] = true; });
  var BLACKLISTED_MARKETS = {'under25':true,'dc1x':true,'dcx2':true,'dc12':true};
  var extra = {};
  (rows || []).forEach(function(row){
    var mk = row.market_key || inferMarketTypeFromLabel(row.market || '');
    var label = row.market || mk || '';
    if(!mk || known[mk] || extra[mk] || BLACKLISTED_MARKETS[mk]) return;
    extra[mk] = {key:mk, label:label};
  });
  Object.keys(extra).forEach(function(k){ defs.push(extra[k]); });
  return defs;
}
function historyRowMatchesCategory(row, categoryKey){
  var mk = row.market_key || inferMarketTypeFromLabel(row.market || '');
  if(categoryKey === 'all') return true;
  // Motor: cross-reference with actual getSmartBetAnalysis pool by event_id
  // Falls back to score>=75 proxy if pool not available
  if(categoryKey === 'motor_validated'){
    if(typeof getSmartBetAnalysis === 'function'){
      try{
        if(!window.__motorPoolEids__){
          var _pool = getSmartBetAnalysis().pool || [];
          window.__motorPoolEids__ = {};
          _pool.forEach(function(r){ if(r.event_id!=null) window.__motorPoolEids__[String(r.event_id)]=1; });
          // Invalidate cache after 60s so it refreshes with data
          setTimeout(function(){ window.__motorPoolEids__=null; }, 60000);
        }
        var _rowEid = String(row.event_id!=null?row.event_id:(row.eventId!=null?row.eventId:''));
        if(_rowEid && window.__motorPoolEids__[_rowEid]) return true;
      }catch(e){}
    }
    return Number(row.score || 0) >= 75 || row.motor_validated === true || row.smartbet_validated === true;
  }
  if(categoryKey === 'safe') return String(row.verdict || '').toLowerCase() === 'safe' || Number(row.score || 0) >= 80;
  if(categoryKey === 'value') return Number(row.value || 0) >= 0.05;
  return mk === categoryKey;
}
function buildHistory21Group(label, key, rows){
  var list = (rows || []).slice().sort(function(a,b){
    return new Date(b.event_date || b.logged_at || b.prediction_created_at || 0) - new Date(a.event_date || a.logged_at || a.prediction_created_at || 0);
  });
  var settled = list.filter(function(r){ return r.source === 'log' && (r.status === 'win' || r.status === 'lose'); });
  var pending = list.filter(function(r){ return r.status === 'pending'; });
  var bets = settled.length;
  var wins = settled.filter(function(r){ return r.status === 'win'; }).length;
  var profit = settled.reduce(function(acc, r){
    var o = Number(r.odds || 0);
    return acc + (r.status === 'win' ? (o > 1 ? (o - 1) : 0) : -1);
  }, 0);
  return {
    market: key,
    label: label,
    total: list.length,
    bets: bets,
    wins: wins,
    pending: pending.length,
    losses: bets - wins,
    winrate: bets ? (wins * 100 / bets) : 0,
    roi: bets ? (profit * 100 / bets) : 0,
    avgOdds: bets ? settled.reduce(function(acc,r){ return acc + Number(r.odds || 0); }, 0) / bets : 0,
    list: list
  };
}
function getHistory21BreakEven(summaryRow){
  return summaryRow && summaryRow.avgOdds ? (100 / Number(summaryRow.avgOdds || 0)) : 0;
}
function getHistory21CardVisual(summaryRow){
  var bets = Number(summaryRow.bets || 0);
  var roi = Number(summaryRow.roi || 0);
  var be = getHistory21BreakEven(summaryRow);
  var delta = bets ? (Number(summaryRow.winrate || 0) - be) : 0;
  var color = !bets ? 'var(--muted)' : (roi >= 0 ? 'var(--grn)' : 'var(--red)');
  return {
    big: bets ? ((roi >= 0 ? '+' : '') + roi.toFixed(1) + '%') : '—',
    color: color,
    sub: bets ? (summaryRow.wins + '/' + bets + ' win • BE ' + be.toFixed(1) + '% • Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'pp') : 'fără meciuri închise încă'
  };
}

/* ===== Daily Portfolio exact generator ===== */
var DAILY_PORTFOLIO = [];
var DAILY_PORTFOLIO_BEST_IDX = 0;
var LAST_DAILY_PORTFOLIO_ERRORS = [];
var DAILY_PORTFOLIO_LAST_ATTEMPTED = false;
function getDailyPortfolioCandidate(type){
  var strict = buildPortfolioTicketPreview(type);
  if(strict && strict.picks && strict.picks.length){
    strict.dailyMode = 'strict';
    return strict;
  }
  var relaxed = buildRelaxedMathTicketPreviewFromPool(type, 'portfolio', getPortfolioMatchPool());
  if(relaxed && relaxed.picks && relaxed.picks.length){
    relaxed.dailyMode = 'relaxed';
    relaxed.summary = (relaxed.summary || '') + ' • fallback Daily relaxat';
    return relaxed;
  }
  return strict || relaxed || null;
}
function buildDailyBestAvailableFallback(){
  var pool = getPortfolioMatchPool();
  if(!Array.isArray(pool) || !pool.length) return null;
  var list = pool.filter(function(item){
    return Number(item.prob || 0) >= 58 && Number(item.odds || 0) >= 1.18 && Number(item.odds || 0) <= 2.40;
  }).sort(function(a,b){
    if(Number(b.prob || 0) !== Number(a.prob || 0)) return Number(b.prob || 0) - Number(a.prob || 0);
    return Number(b.score || 0) - Number(a.score || 0);
  });
  if(!list.length) return null;
  var best = list[0];
  var t = makeMathTicketObject('premium', 'portfolio', [best], Number(best.odds || 1), Number(best.prob || 0), 'Fallback Daily: cel mai bun single disponibil azi, chiar dacă nu a trecut toate pragurile premium.');
  t.label = '⭐ Daily Best Available';
  t.dailyMode = 'fallback';
  t.priority = 1;
  return t;
}
function generateDailyPortfolioTickets(){
  var bankroll = getActualBankrollValue();
  var tickets = [];
  DAILY_PORTFOLIO_LAST_ATTEMPTED = true;
  var premium = getDailyPortfolioCandidate('premium');
  var strong = getDailyPortfolioCandidate('double');
  var value = getDailyPortfolioCandidate('triple');
  LAST_DAILY_PORTFOLIO_ERRORS = [premium && premium.error, strong && strong.error, value && value.error].filter(Boolean);
  if(premium && premium.picks && premium.picks.length){
    premium.priority = 1;
    premium.portfolioType = 'SINGLE_PREMIUM';
    premium.stake = +(bankroll * 0.04).toFixed(2);
    premium.stakePct = 4;
    tickets.push(premium);
  }
  if(strong && strong.picks && strong.picks.length){
    strong.priority = 2;
    strong.portfolioType = 'DOUBLE_CONFIRMED';
    strong.stake = +(bankroll * 0.025).toFixed(2);
    strong.stakePct = 2.5;
    tickets.push(strong);
  }
  if(value && value.picks && value.picks.length){
    value.priority = 3;
    value.portfolioType = 'TRIPLE_VALUE';
    value.stake = +(bankroll * 0.015).toFixed(2);
    value.stakePct = 1.5;
    tickets.push(value);
  }
  if(!tickets.length){
    var fallback = buildDailyBestAvailableFallback();
    if(fallback && fallback.picks && fallback.picks.length){
      fallback.stake = +(bankroll * 0.02).toFixed(2);
      fallback.stakePct = 2;
      tickets.push(fallback);
      LAST_DAILY_PORTFOLIO_ERRORS.unshift('Niciun bilet complet nu a trecut strict/relaxat, dar am încărcat cel mai bun single disponibil azi.');
    }
  }
  DAILY_PORTFOLIO = tickets.sort(function(a,b){ return Number(a.priority || 99) - Number(b.priority || 99); });
  DAILY_PORTFOLIO_BEST_IDX = 0;
  if(DAILY_PORTFOLIO.length){
    DAILY_PORTFOLIO.forEach(function(t, idx){ if(Number(t.combinedProb || 0) > Number(DAILY_PORTFOLIO[DAILY_PORTFOLIO_BEST_IDX].combinedProb || 0)) DAILY_PORTFOLIO_BEST_IDX = idx; });
    applyPortfolioPreview(DAILY_PORTFOLIO[DAILY_PORTFOLIO_BEST_IDX], true);
  }
  renderDailyPortfolio();
  if(typeof updateGeneratorStatusBadges === 'function') updateGeneratorStatusBadges();
  if(DAILY_PORTFOLIO.length){
    toast('Portfolio Daily generat: ' + DAILY_PORTFOLIO.length + ' bilete • recomandarea #1 a fost încărcată în biletul principal', 'ok');
  } else {
    toast((LAST_DAILY_PORTFOLIO_ERRORS[0] || 'Nu există setup-uri suficiente pentru Portfolio Daily.'), 'warn');
  }
}
function handleGenerateDailyPortfolio(btn){
  setButtonBusy(btn, true, '📦 Generează Portfolio Daily', 'Se generează...');
  setTimeout(function(){
    try {
      generateDailyPortfolioTickets();
    } catch(err){
      console.error('Portfolio Daily runtime error:', err);
      renderDailyPortfolioRuntimeError(err);
      toast('Portfolio Daily a întâlnit o eroare internă.', 'warn');
    } finally {
      setButtonBusy(btn, false, '📦 Generează Portfolio Daily', 'Se generează...');
    }
  }, 120);
}
function openDailyPortfolioTicket(idx){
  var ticket = DAILY_PORTFOLIO[idx];
  if(!ticket) return;
  applyPortfolioPreview(ticket, true);
  toast(ticket.label + ' încărcat în panoul principal.', 'ok');
}
function renderDailyPortfolio(){
  var target = $('daily-portfolio-output');
  if(!target) return;
  if(!DAILY_PORTFOLIO || !DAILY_PORTFOLIO.length){
    if(DAILY_PORTFOLIO_LAST_ATTEMPTED && LAST_DAILY_PORTFOLIO_ERRORS.length){
      target.innerHTML = '<div class="bilet-card" style="margin-bottom:0"><div style="font-size:14px;font-weight:800;color:var(--yel);margin-bottom:8px">Portfolio Daily nu a găsit bilete complete</div><div style="font-size:11px;color:var(--muted);margin-bottom:10px">Am rulat generatorul, dar nici Single / Double / Triple nu au trecut filtrele finale.</div>'+LAST_DAILY_PORTFOLIO_ERRORS.slice(0,3).map(function(msg){ return '<div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:var(--txt)">• '+msg+'</div>'; }).join('')+'</div>';
    } else {
      target.innerHTML = '<div class="empty-state" style="padding:12px">Apasă pe <strong>Generează Portfolio Daily</strong> ca să primești automat portofoliul zilei. Dacă nu există setup-uri valide, secțiunea îți va afișa explicit de ce.</div>';
    }
    return;
  }
  var bestTicket = DAILY_PORTFOLIO[DAILY_PORTFOLIO_BEST_IDX] || DAILY_PORTFOLIO[0];
  var bestCard = bestTicket ? '<div class="bilet-card" style="margin-bottom:0;border-color:rgba(34,197,94,.22);background:linear-gradient(180deg,rgba(18,32,28,.96),rgba(12,20,18,.96))"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:16px;font-weight:900;color:var(--grn)">⭐ Recomandarea #1 a zilei</div><div style="font-size:12px;color:var(--txt);margin-top:4px">'+bestTicket.label+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">aleasă după probabilitatea de reușită dintre biletele generate azi</div><div style="font-size:10px;color:var(--muted);margin-top:6px">Mod Daily: '+(bestTicket.dailyMode === 'relaxed' ? 'fallback relaxat' : 'strict')+'</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:900;color:var(--grn)">'+Number(bestTicket.combinedProb || 0).toFixed(1)+'%</div><div style="font-size:10px;color:var(--muted);margin-top:4px">Prob. compusă</div></div></div><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><div style="font-size:11px;color:var(--muted)">Cotă '+Number(bestTicket.totalOdds || 1).toFixed(2)+'x • Stake '+Number(bestTicket.stake || 0).toFixed(2)+' RON</div><button class="btn btn-green" onclick="openDailyPortfolioTicket('+DAILY_PORTFOLIO_BEST_IDX+')">Deschide recomandarea #1</button></div></div>' : '';
  target.innerHTML = bestCard + DAILY_PORTFOLIO.map(function(ticket, idx){
    var picksHtml = (ticket.picks || []).map(function(p){
      var bet = p.bestBet || p;
      return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,.06)"><div><div style="font-size:12px;font-weight:700;color:var(--txt)">'+p.home+' vs '+p.away+'</div><div style="font-size:10px;color:var(--muted);margin-top:3px">'+(p.league || '—')+' • '+(p.dateLabel || '')+' '+(p.timeLabel || '')+'</div></div><div style="text-align:right;font-size:11px;color:var(--acc);font-weight:700">'+bet.label+' @ '+Number(bet.odds || 0).toFixed(2)+'</div></div>';
    }).join('');
    return '<div class="bilet-card" style="margin-bottom:0">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><div style="font-size:15px;font-weight:800">#'+ticket.priority+' • '+ticket.label+'</div><div style="font-size:11px;color:var(--muted);margin-top:4px">'+(ticket.summary || 'Portfolio Daily')+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--grn)">'+Number(ticket.totalOdds || 1).toFixed(2)+'x</div><div style="font-size:10px;color:var(--muted);margin-top:4px">Stake '+Number(ticket.stake || 0).toFixed(2)+' RON • '+Number(ticket.stakePct || 0).toFixed(1)+'%</div></div>'+
      '</div>'+
      '<div class="ticket-mini-grid" style="margin-top:12px">'+
        '<div class="ticket-mini"><div class="v">'+(ticket.picks ? ticket.picks.length : 0)+'</div><div class="l">Selecții</div></div>'+
        '<div class="ticket-mini"><div class="v">'+Number(ticket.combinedProb || 0).toFixed(1)+'%</div><div class="l">Prob. compusă</div></div>'+
        '<div class="ticket-mini"><div class="v">'+((Number(ticket.avgEdge || 0) * 100).toFixed(1))+'%</div><div class="l">Edge mediu</div></div>'+
      '</div>'+
      '<div style="margin-top:12px">'+picksHtml+'</div>'+
      '<div style="margin-top:12px;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="openDailyPortfolioTicket('+idx+')">Deschide în biletul principal</button></div>'+
    '</div>';
  }).join('');
}
window.addEventListener('DOMContentLoaded', function(){
  renderDailyPortfolio();
  try { renderDashboardMonitor(); } catch(err){}
});

function renderDailyPortfolioRuntimeError(err){
  var target = $('daily-portfolio-output');
  var msg = err && err.message ? err.message : String(err || 'Eroare necunoscută');
  if(target){
    target.innerHTML = '<div class="bilet-card" style="margin-bottom:0;border-color:rgba(239,68,68,.22)"><div style="font-size:14px;font-weight:800;color:var(--red);margin-bottom:8px">Eroare internă la Portfolio Daily</div><div style="font-size:11px;color:var(--muted);margin-bottom:10px">Butonul a fost apăsat, dar generatorul a fost întrerupt de o eroare JS. Mai jos vezi mesajul brut.</div><div style="padding:10px;border-radius:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);font-size:11px;color:var(--txt);word-break:break-word">'+msg.replace(/</g,'&lt;')+'</div></div>';
  }
}

/* ===== Generator availability + relaxed mode ===== */
function buildRelaxedMathTicketPreviewFromPool(type, source, pool){
  pool = Array.isArray(pool) ? pool.slice() : [];
  if(!pool.length) return makeEmptyMathTicket(type, source, 'Nu există date populate în pool pentru acest generator.');

  function makeTicket(picks, totalOdds, combinedProb, summary){
    var t = makeMathTicketObject(type, source, picks, totalOdds, combinedProb, summary + ' • mod relaxat');
    t.relaxed = true;
    return t;
  }

  if(type === 'premium'){
    var premium = pool.filter(function(item){
      return Number(item.score || 0) >= 84 && Number(item.prob || 0) >= 72 && Number(item.odds || 0) >= 1.40 && Number(item.odds || 0) <= 2.10 && Math.max(Number(item.edge || 0), Number(item.edgeToPrice || 0)) > 7;
    });
    if(!premium.length) return makeEmptyMathTicket(type, source, 'Nici măcar pe praguri relaxate nu există un single premium suficient de curat.');
    premium.sort(function(a,b){ if(Number(b.score||0)!==Number(a.score||0)) return Number(b.score||0)-Number(a.score||0); return Number(a.odds||0)-Number(b.odds||0); });
    return makeTicket([premium[0]], premium[0].odds, premium[0].prob, 'Single premium cu praguri relaxate');
  }

  if(type === 'double'){
    var strict = buildMathTicketPreviewFromPool(type, source, pool);
    var strictSig = strict && strict.picks && strict.picks.length ? strict.picks.map(function(p){ return String(p.eventId || p.event_id || (p.home + '|' + p.away + '|' + (p.marketKey || p.market || ''))); }).sort().join('::') : '';
    var strictOdds = strict && strict.totalOdds ? Number(strict.totalOdds || 0) : 0;
    var list = pool.filter(function(item){
      return Number(item.score || 0) >= 74 && Number(item.prob || 0) >= 56 && Number(item.odds || 0) >= 1.16 && Number(item.odds || 0) <= 2.55;
    }).slice(0, 22);
    var candidates = [];
    for(var i=0;i<list.length;i++){
      for(var j=i+1;j<list.length;j++){
        var a = list[i], b = list[j];
        if(areRowsCorrelated(a, b)) continue;
        var totalOdds = Number(a.odds || 1) * Number(b.odds || 1);
        var combinedProb = Number(a.prob || 0) * Number(b.prob || 0) / 100;
        if(totalOdds < 2.25 || totalOdds > 4.60) continue;
        if(combinedProb <= 36) continue;
        var rank = rankMathSelection(type, [a, b], totalOdds, combinedProb);
        candidates.push({picks:[a,b], totalOdds:totalOdds, combinedProb:combinedProb, rank:rank});
      }
    }
    if(!candidates.length) return makeEmptyMathTicket(type, source, 'Nu există double valid nici pe praguri relaxate.');
    candidates.sort(function(x, y){ return y.rank - x.rank; });
    var best = candidates[0];
    for(var c=0;c<candidates.length;c++){
      var sig = candidates[c].picks.map(function(p){ return String(p.eventId || p.event_id || (p.home + '|' + p.away + '|' + (p.marketKey || p.market || ''))); }).sort().join('::');
      var lowerOdds = !strictOdds || Number(candidates[c].totalOdds || 0) < strictOdds;
      if((!strictSig || sig !== strictSig) && lowerOdds){ best = candidates[c]; break; }
    }
    if(strictOdds && Number(best.totalOdds || 0) >= strictOdds){
      for(var c2=0;c2<candidates.length;c2++){
        if(Number(candidates[c2].totalOdds || 0) < strictOdds){ best = candidates[c2]; break; }
      }
    }
    return makeTicket(best.picks, best.totalOdds, best.combinedProb, 'Double confirmed cu praguri relaxate');
  }

  if(type === 'triple'){
    var list = pool.filter(function(item){
      return Number(item.score || 0) >= 70 && Number(item.prob || 0) >= 48 && Number(item.odds || 0) >= 1.22 && Number(item.odds || 0) <= 3.30;
    }).slice(0, 20);
    var best = null;
    for(var i=0;i<list.length;i++){
      for(var j=i+1;j<list.length;j++){
        if(areRowsCorrelated(list[i], list[j])) continue;
        for(var k=j+1;k<list.length;k++){
          var a = list[i], b = list[j], c = list[k];
          if(areRowsCorrelated(a, c) || areRowsCorrelated(b, c)) continue;
          var picks = [a,b,c];
          var totalOdds = picks.reduce(function(acc, item){ return acc * Number(item.odds || 1); }, 1);
          var combinedProb = picks.reduce(function(acc, item){ return acc * (Number(item.prob || 0) / 100); }, 1) * 100;
          if(totalOdds < 3.30 || totalOdds > 6.80) continue;
          if(combinedProb <= 20) continue;
          var rank = rankMathSelection(type, picks, totalOdds, combinedProb);
          if(!best || rank > best.rank) best = {picks:picks, totalOdds:totalOdds, combinedProb:combinedProb, rank:rank};
        }
      }
    }
    if(!best) return makeEmptyMathTicket(type, source, 'Nu există triple suficient de bun nici pe praguri relaxate.');
    return makeTicket(best.picks, best.totalOdds, best.combinedProb, 'Triple value cu praguri relaxate');
  }

  if(type === 'contrarian'){
    var list = pool.filter(function(item){
      return Number(item.score || 0) >= 62 && Number(item.odds || 0) >= 1.62 && Number(item.odds || 0) <= 4.10 && Math.max(Number(item.edgeToPrice || 0), Number(item.edge || 0)) >= 2;
    }).slice(0, 18);
    var best = null;
    for(var i=0;i<list.length;i++){
      for(var j=i+1;j<list.length;j++){
        var pair = [list[i], list[j]];
        if(areRowsCorrelated(pair[0], pair[1])) continue;
        var pairOdds = pair.reduce(function(acc, item){ return acc * Number(item.odds || 1); }, 1);
        var pairProb = pair.reduce(function(acc, item){ return acc * (Number(item.prob || 0) / 100); }, 1) * 100;
        if(pairOdds >= 4.8 && pairOdds <= 15.5 && pairProb >= 10 && pairProb <= 28){
          var pairRank = rankMathSelection(type, pair, pairOdds, pairProb);
          if(!best || pairRank > best.rank) best = {picks:pair, totalOdds:pairOdds, combinedProb:pairProb, rank:pairRank};
        }
      }
    }
    if(!best) return makeEmptyMathTicket(type, source, 'Nu există contrarian valid nici pe praguri relaxate. În pool-ul curent nu există suficient preț agresiv necorelat.');
    return makeTicket(best.picks, best.totalOdds, best.combinedProb, 'Contrarian cu praguri relaxate');
  }

  return makeEmptyMathTicket(type, source, 'Tip necunoscut.');
}
function getGeneratorAvailability(source, type){
  var pool = getSourcePoolForGenerator(source);
  if(!pool.length) return {count:0, text:'Nu există date populate în pool.', klass:'warn'};
  var count = 0;
  if(type === 'premium') count = pool.filter(function(item){ return Number(item.score || 0) >= 88; }).length;
  else if(type === 'double') count = pool.filter(function(item){ return Number(item.score || 0) >= 80; }).length;
  else if(type === 'triple') count = pool.filter(function(item){ return Number(item.score || 0) >= 70 && Number(item.score || 0) < 90; }).length;
  else if(type === 'contrarian') count = pool.filter(function(item){ return Number(item.score || 0) >= 62 && Math.max(Number(item.edgeToPrice || 0), Number(item.edge || 0)) >= 2; }).length;
  var label = type === 'premium' ? 'candidați premium' : type === 'double' ? 'candidați strong' : type === 'triple' ? 'candidați value' : 'candidați contrarian';
  return {
    count: count,
    text: count ? ('Candidați inițiali: ' + count + ' ' + label) : ('0 ' + label + ' pe pragurile actuale'),
    klass: count ? 'ok' : 'warn'
  };
}
function generateAuditTicketVariant(type, relaxed, silent){
  AUDIT_TICKETS[type] = relaxed ? buildRelaxedMathTicketPreviewFromPool(type, 'audit', getAuditMathPool()) : buildMathTicketPreviewFromPool(type, 'audit', getAuditMathPool());
  renderAuditTicket(type);
  if(!silent) toast(AUDIT_TICKETS[type].label + ((AUDIT_TICKETS[type].picks && AUDIT_TICKETS[type].picks.length) ? (relaxed ? ' generat (relaxat)!' : ' generat!') : ' indisponibil acum'), AUDIT_TICKETS[type].picks && AUDIT_TICKETS[type].picks.length ? 'ok' : 'warn');
}
function generateAiMemoryTicketVariant(type, relaxed, silent){
  AI_MEMORY_TICKETS[type] = relaxed ? buildRelaxedMathTicketPreviewFromPool(type, 'aimemory', getAiMemoryMathPool()) : buildMathTicketPreviewFromPool(type, 'aimemory', getAiMemoryMathPool());
  renderAiMemoryTicket(type);
  if(!silent) toast(AI_MEMORY_TICKETS[type].label + ((AI_MEMORY_TICKETS[type].picks && AI_MEMORY_TICKETS[type].picks.length) ? (relaxed ? ' generat (relaxat)!' : ' generat!') : ' indisponibil acum'), AI_MEMORY_TICKETS[type].picks && AI_MEMORY_TICKETS[type].picks.length ? 'ok' : 'warn');
}
function handleGenerateAuditTicketRelaxed(type, btn){
  setButtonBusy(btn, true, 'Relaxat', 'Se generează...');
  setTimeout(function(){
    generateAuditTicketVariant(type, true, false);
    setButtonBusy(btn, false, 'Relaxat', 'Se generează...');
    updateGeneratorStatusBadges();
  }, 120);
}
function handleGenerateAiMemoryTicketRelaxed(type, btn){
  setButtonBusy(btn, true, 'Relaxat', 'Se generează...');
  setTimeout(function(){
    generateAiMemoryTicketVariant(type, true, false);
    setButtonBusy(btn, false, 'Relaxat', 'Se generează...');
    updateGeneratorStatusBadges();
  }, 120);
}
function renderAuditGenerators(){
  enhanceGeneratorCards();
  getMathPortfolioTypes().forEach(function(type){
    if(AUDIT_TICKETS[type]) renderAuditTicket(type);
  });
  updateGeneratorStatusBadges();
}
function renderAiMemoryGenerators(){
  enhanceGeneratorCards();
  getMathPortfolioTypes().forEach(function(type){
    if(AI_MEMORY_TICKETS[type]) renderAiMemoryTicket(type);
  });
  updateGeneratorStatusBadges();
}
window.addEventListener('DOMContentLoaded', function(){
  enhanceGeneratorCards();
  setTimeout(updateGeneratorStatusBadges, 200);
});


/* ===== Portfolio generators inline status ===== */
var PORTFOLIO_TICKETS = window.PORTFOLIO_TICKETS || {premium:null, double:null, triple:null, contrarian:null};
window.PORTFOLIO_TICKETS = PORTFOLIO_TICKETS;

function getSourcePoolForGenerator(source){
  if(source === 'audit') return typeof getAuditMathPool === 'function' ? getAuditMathPool() : [];
  if(source === 'aimemory') return typeof getAiMemoryMathPool === 'function' ? getAiMemoryMathPool() : [];
  if(source === 'portfolio') return typeof getPortfolioMatchPool === 'function' ? getPortfolioMatchPool() : [];
  return [];
}
function generatePortfolioTicketVariant(type, relaxed, silent){
  var preview = relaxed ? buildRelaxedMathTicketPreviewFromPool(type, 'portfolio', getPortfolioMatchPool()) : buildPortfolioTicketPreview(type);
  if(preview){ preview.relaxed = !!relaxed; PORTFOLIO_TICKETS[type] = preview; }
  applyPortfolioPreview(preview, !!silent);
  updateGeneratorStatusBadges();
  if(!silent && preview && preview.picks && preview.picks.length) toast((preview.label || type) + (relaxed ? ' generat (relaxat)!' : ' generat!'), 'ok');
  else if(!silent && preview && preview.error) toast(preview.error, 'warn');
  return preview;
}
function handleGeneratePortfolioTicket(type, btn){
  setButtonBusy(btn, true, 'Generează', 'Se generează...');
  setTimeout(function(){
    generatePortfolioTicketVariant(type, false, false);
    setButtonBusy(btn, false, 'Generează', 'Se generează...');
    updateGeneratorStatusBadges();
  }, 120);
}
function handleGeneratePortfolioTicketRelaxed(type, btn){
  setButtonBusy(btn, true, 'Relaxat', 'Se generează...');
  setTimeout(function(){
    generatePortfolioTicketVariant(type, true, false);
    setButtonBusy(btn, false, 'Relaxat', 'Se generează...');
    updateGeneratorStatusBadges();
  }, 120);
}

function enhanceGeneratorCards(){
  document.querySelectorAll('.memory-generator-card').forEach(function(card){
    if(card.dataset.relaxedEnhanced === '1') return;
    var status = card.querySelector('.generator-status');
    var primaryBtn = card.querySelector('button.btn');
    if(!status || !primaryBtn) return;
    var type = '';
    var mode = '';
    if(status.id.indexOf('audit-status-') === 0){ type = status.id.replace('audit-status-', ''); mode = 'audit'; }
    else if(status.id.indexOf('aimemory-status-') === 0){ type = status.id.replace('aimemory-status-', ''); mode = 'aimemory'; }
    else if(status.id.indexOf('portfolio-status-') === 0){ type = status.id.replace('portfolio-status-', ''); mode = 'portfolio'; }
    else return;
    var row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 110px';
    row.style.gap = '8px';
    row.style.marginBottom = '8px';
    primaryBtn.parentNode.insertBefore(row, primaryBtn);
    row.appendChild(primaryBtn);
    primaryBtn.style.width = '100%';
    var relaxedBtn = document.createElement('button');
    relaxedBtn.className = 'btn';
    relaxedBtn.textContent = 'Relaxat';
    relaxedBtn.style.width = '100%';
    relaxedBtn.style.justifyContent = 'center';
    relaxedBtn.style.background = 'rgba(255,255,255,.06)';
    relaxedBtn.style.border = '1px solid rgba(255,255,255,.12)';
    relaxedBtn.style.color = 'var(--txt)';
    relaxedBtn.onclick = function(){
      if(mode === 'audit') handleGenerateAuditTicketRelaxed(type, relaxedBtn);
      else if(mode === 'aimemory') handleGenerateAiMemoryTicketRelaxed(type, relaxedBtn);
      else handleGeneratePortfolioTicketRelaxed(type, relaxedBtn);
    };
    row.appendChild(relaxedBtn);
    card.dataset.relaxedEnhanced = '1';
  });
}

function updateGeneratorStatusBadges(){
  ['premium','double','triple','contrarian'].forEach(function(type){
    var auditInfo = getGeneratorAvailability('audit', type);
    var auditTicket = AUDIT_TICKETS[type];
    if(auditTicket && auditTicket.picks && auditTicket.picks.length) setGeneratorStatus('audit-status-' + type, 'Pool: ' + auditInfo.count + ' • ultima generare ' + fmtDateTime(auditTicket.generatedAt || new Date().toISOString()) + (auditTicket.relaxed ? ' • relaxat' : ''), 'ok');
    else setGeneratorStatus('audit-status-' + type, auditInfo.text, auditInfo.klass);

    var aiInfo = getGeneratorAvailability('aimemory', type);
    var aiTicket = AI_MEMORY_TICKETS[type];
    if(aiTicket && aiTicket.picks && aiTicket.picks.length) setGeneratorStatus('aimemory-status-' + type, 'Pool: ' + aiInfo.count + ' • ultima generare ' + fmtDateTime(aiTicket.generatedAt || new Date().toISOString()) + (aiTicket.relaxed ? ' • relaxat' : ''), 'ok');
    else setGeneratorStatus('aimemory-status-' + type, aiInfo.text, aiInfo.klass);

    var portfolioInfo = getGeneratorAvailability('portfolio', type);
    var portfolioTicket = PORTFOLIO_TICKETS[type];
    if(portfolioTicket && portfolioTicket.picks && portfolioTicket.picks.length) setGeneratorStatus('portfolio-status-' + type, 'Pool: ' + portfolioInfo.count + ' • ultima generare ' + fmtDateTime(portfolioTicket.generatedAt || new Date().toISOString()) + (portfolioTicket.relaxed ? ' • relaxat' : ''), 'ok');
    else setGeneratorStatus('portfolio-status-' + type, portfolioInfo.text, portfolioInfo.klass);
  });
}

var _origGeneratePortfolioTicket = window.generatePortfolioTicket;
window.generatePortfolioTicket = function(type, silent){
  var out = _origGeneratePortfolioTicket(type, silent);
  if(out) PORTFOLIO_TICKETS[type] = Object.assign({}, out, { relaxed:false, generatedAt:(out.generatedAt || new Date().toISOString()) });
  updateGeneratorStatusBadges();
  return out;
};
var _origGenerateDailyPortfolioTickets = window.generateDailyPortfolioTickets;
window.generateDailyPortfolioTickets = function(){
  var out = _origGenerateDailyPortfolioTickets();
  try { updateGeneratorStatusBadges(); } catch(err){ console.error('Generator badges update failed:', err); }
  return out;
};


/* ===== SMARTBET ENGINE (fusion Audit Kelly + AI Memory) ===== */
var SMARTBET_TICKETS = window.SMARTBET_TICKETS || {safe:null, hybrid:null, value:null};
window.SMARTBET_TICKETS = SMARTBET_TICKETS;
var SMARTBET_LAST_ANALYSIS = null;

function normalizeSmartBetMarketKey(raw){
  var key = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if(key.indexOf('over15') >= 0) return 'over15';
  if(key.indexOf('over25') >= 0) return 'over25';
  if(key.indexOf('under35') >= 0) return 'under35';
  if(key.indexOf('btts') >= 0 || key.indexOf('gg') >= 0) return 'btts';
  if(key === '1x' || key === 'x2' || key === '12' || key.indexOf('doublechance') >= 0) return key || 'doublechance';
  return key || 'misc';
}
function normalizeSmartBetSource(row){
  if(!row) return 'unknown';
  if(row.source) return String(row.source).toLowerCase();
  if(row.source_api && row.source_heuristic) return 'mixed';
  if(row.source_api) return 'api';
  if(row.source_heuristic) return 'heuristic';
  return 'unknown';
}

function normalizeSmartBetMatchBetKey(bet){
  if(!bet) return '';
  var rawType = String(bet.type || '').toLowerCase();
  if(rawType === 'dc1x') return '1x';
  if(rawType === 'dcx2') return 'x2';
  if(rawType === 'dc12') return '12';
  var rawLabel = String(bet.label || '').toLowerCase();
  if(rawLabel.indexOf('1x') >= 0) return '1x';
  if(rawLabel.indexOf('x2') >= 0) return 'x2';
  if(rawLabel === '12' || rawLabel.indexOf(' 12') >= 0) return '12';
  return normalizeSmartBetMarketKey(bet.marketKey || bet.market_key || bet.market || bet.label || bet.type || '');
}
function getSmartBetAnalysisLookup(){
  var analysis = (typeof getSmartBetAnalysis === 'function') ? getSmartBetAnalysis() : {pool:[], blocked:[]};
  var lookup = { validated:{}, blocked:{} };
  function keysFromRow(row, explicitMarketKey){
    if(!row) return [];
    var marketKey = normalizeSmartBetMarketKey(explicitMarketKey || row.marketKey || row.market_key || row.market);
    if(!marketKey) return [];
    var keys = [];
    var eventId = row.event_id != null ? row.event_id : (row.eventId != null ? row.eventId : null);
    if(eventId != null && eventId !== '') keys.push(String(eventId) + '|' + marketKey);
    var dateKey = String(row.event_date || row.date || '').slice(0,10);
    keys.push([String(row.home || '').toLowerCase(), String(row.away || '').toLowerCase(), dateKey, marketKey].join('|'));
    return keys;
  }
  (analysis.pool || []).forEach(function(row){
    keysFromRow(row).forEach(function(k){ lookup.validated[k] = row; });
  });
  (analysis.blocked || []).forEach(function(entry){
    if(!entry || !entry.row) return;
    keysFromRow(entry.row, entry.marketKey).forEach(function(k){ lookup.blocked[k] = entry; });
  });
  return lookup;
}
function getSmartBetStatusForMatch(match, bet, lookup){
  if(!match || !bet) return { state:'neutral', row:null, reason:null, score:null };
  var marketKey = normalizeSmartBetMatchBetKey(bet);
  if(['over15','over25','under35','btts','1x','x2','12','doublechance'].indexOf(marketKey) < 0){
    return { state:'neutral', row:null, reason:null, score:null };
  }
  var keys = [];
  var eventId = match.eventId != null ? match.eventId : (match.event_id != null ? match.event_id : null);
  if(eventId != null && eventId !== '') keys.push(String(eventId) + '|' + marketKey);
  var dateKey = String(match.event_date || match.date || '').slice(0,10);
  keys.push([String(match.home || '').toLowerCase(), String(match.away || '').toLowerCase(), dateKey, marketKey].join('|'));
  var bag = lookup || getSmartBetAnalysisLookup();
  for(var i=0;i<keys.length;i++){
    if(bag.validated[keys[i]]){
      var row = bag.validated[keys[i]];
      return {
        state:'validated',
        row:row,
        reason:row.confirmationLabel || '',
        score:(typeof calcUnifiedScore === 'function') ? calcUnifiedScore(row) : Number(row.smartScore || row.score || 0)
      };
    }
  }
  for(var j=0;j<keys.length;j++){
    if(bag.blocked[keys[j]]){
      var blocked = bag.blocked[keys[j]];
      return {
        state:'blocked',
        row:blocked.row || null,
        reason:(blocked.reason && (blocked.reason.label || blocked.reason.key)) || 'Pattern negativ',
        score:null
      };
    }
  }
  return { state:'neutral', row:null, reason:'', score:null };
}
function smartBetSupportedMarket(row){
  var key = normalizeSmartBetMarketKey(row && (row.market_key || row.market));
  return ['over15','over25','under35','btts','1x','x2','12','doublechance'].indexOf(key) >= 0;
}
function getSmartBetAdaptiveMap(){
  var map = {};
  ((AI_MEMORY && AI_MEMORY.adaptive_picks) || []).forEach(function(p){
    if(!p) return;
    var marketKey = normalizeSmartBetMarketKey(p.market_key || p.market);
    var key1 = String(p.event_id || '') + '|' + marketKey;
    var key2 = [String(p.home || '').toLowerCase(), String(p.away || '').toLowerCase(), marketKey].join('|');
    map[key1] = p;
    map[key2] = p;
  });
  return map;
}
function getSmartBetPatternMaps(){
  var out = { top:{}, avoid:{} };
  ['top','avoid'].forEach(function(bucket){
    var src = bucket === 'top' ? ((AI_MEMORY && AI_MEMORY.top_patterns) || []) : ((AI_MEMORY && AI_MEMORY.avoid_patterns) || []);
    src.forEach(function(p){
      if(!p || !p.kind || !p.key) return;
      if(!out[bucket][p.kind]) out[bucket][p.kind] = {};
      out[bucket][p.kind][p.key] = p;
    });
  });
  return out;
}
function getSmartBetPatternKeys(row){
  var marketKey = normalizeSmartBetMarketKey(row.market_key || row.market);
  var league = String(row.league || '').trim();
  var source = normalizeSmartBetSource(row);
  return {
    market: marketKey,
    market_league: marketKey + '|' + league,
    market_source: marketKey + '|' + source
  };
}
function getSmartBetPatternMatchInfo(row, patternMaps){
  var keys = getSmartBetPatternKeys(row);
  var positive = [];
  var avoid = [];
  ['market_league','market','market_source'].forEach(function(kind){
    if(patternMaps.top[kind] && patternMaps.top[kind][keys[kind]]) positive.push(patternMaps.top[kind][keys[kind]]);
    // Avoid pattern requires >= 8 bets to block (pattern negativ cu sample mic e nesigur)
    var avoidCandidate = patternMaps.avoid[kind] && patternMaps.avoid[kind][keys[kind]];
    if(avoidCandidate && Number(avoidCandidate.raw_bets || 0) >= 8) avoid.push(avoidCandidate);
  });
  positive.sort(function(a,b){ return Number(b.memory_score || 0) - Number(a.memory_score || 0); });
  avoid.sort(function(a,b){ return Number(a.memory_score || 0) - Number(b.memory_score || 0); });
  return { positive:positive, avoid:avoid };
}
function getSmartBetAnalysis(){
  var auditRows = ((SIGNAL_AUDIT && SIGNAL_AUDIT.rows) || []).slice();

  // SmartBet v2: îmbogățim auditRows cu edge_pp și score din ev_signals_v2
  var v2idx = window.__SBV2_SIGNALS_INDEX__ || {};
  var mktKeyMap = {
    'Over 1.5G':'over15','Over 2.5G':'over25','BTTS Yes':'btts',
    'Under 3.5G':'under35','Home Win':'homeWin','Away Win':'awayWin','Draw':'draw',
    'over15':'over15','over25':'over25','btts':'btts','under35':'under35',
    'homeWin':'homeWin','awayWin':'awayWin','draw':'draw'
  };
  if(Object.keys(v2idx).length > 0) {
    auditRows = auditRows.map(function(row){
      if(!row || !row.event_id) return row;
      var mk = mktKeyMap[row.market_key || row.market] || (row.market_key || row.market || '');
      var sig = v2idx[String(row.event_id) + '|' + mk];
      if(!sig) return row;
      // Îmbunătățim: edge_pct = max(existent, v2 edge), score boost dacă v2 score e mai mare
      var newEdge = Math.max(Number(row.edge_pct || 0), Number(sig.edge_pp || 0));
      var v2score = Number(sig.score || 0);
      var curScore= Number(row.score || 0);
      var newScore= v2score > curScore ? Math.round(curScore * 0.6 + v2score * 0.4) : curScore;
      return Object.assign({}, row, {
        edge_pct:  +newEdge.toFixed(2),
        score:     newScore,
        v2_signal: sig,
        v2_edge:   sig.edge_pp,
        v2_ev:     sig.ev_pct,
        v2_kelly:  sig.kelly_pct,
        v2_prob:   sig.model_prob,
      });
    });
  }
  var adaptiveMap = getSmartBetAdaptiveMap();
  var patternMaps = getSmartBetPatternMaps();
  var policy = getSmartBetEnginePolicy();
  var thresholds = getSmartBetModeThresholds(policy.mode);
  var pool = [];
  var blocked = [];
  var adaptiveConfirmed = 0;
  var patternConfirmed = 0;

  auditRows.forEach(function(row){
    if(!row || !smartBetSupportedMarket(row)) return;
    if(Number(row.edge_pct || 0) <= 0 || Number(row.value || 0) <= 0) return;
    if(Number(row.book_odds || 0) < Number(thresholds.oddsMin || 1.20)) return;

    var marketKey = normalizeSmartBetMarketKey(row.market_key || row.market);
    var adaptive = adaptiveMap[String(row.event_id || '') + '|' + marketKey] ||
                   adaptiveMap[[String(row.home || '').toLowerCase(), String(row.away || '').toLowerCase(), marketKey].join('|')] ||
                   null;
    var patternInfo = getSmartBetPatternMatchInfo(row, patternMaps);
    var bestPositive = patternInfo.positive[0] || null;
    var worstNegative = patternInfo.avoid[0] || null;
    var directAdaptive = !!adaptive;
    var patternOnly = !directAdaptive && !!bestPositive;

    // Blocarea negativă depinde acum de modul motorului:
    // STRICT blochează agresiv, BALANCED doar pattern-urile clar toxice, OFF nu blochează.
    var blockedByMemory = false;
    if(!directAdaptive && !!worstNegative && thresholds.blockNegative){
      var negBets = Number(worstNegative.raw_bets || 0);
      var negRoi = Number(worstNegative.roi || 0);
      var negScore = Number(worstNegative.memory_score || 0);
      blockedByMemory = negBets >= Number(thresholds.minNegPatternBets || 999) &&
        negRoi <= Number(thresholds.minNegPatternRoi || 0) &&
        negScore <= -2;
    }

    if(blockedByMemory){
      blocked.push({
        row: row,
        reason: worstNegative,
        marketKey: marketKey
      });
      return;
    }

    // v7 Profit Edition: highEdge și highScore mai stricte
    var highQualityFallback = !directAdaptive && !patternOnly &&
      Number(row.adjusted_prob || 0) >= Number(thresholds.highProb || 80) &&
      Number(row.kelly_quarter_pct || 0) >= Number(thresholds.highKelly || 2) &&
      Number(row.edge_pct || 0) >= Number(thresholds.highEdge || 8) &&
      Number(row.score || 0) >= Number(thresholds.highScore || 82);

    // signalStrong ELIMINAT în v7 — era responsabil pentru picks fără confirmare AI Memory.
    // Cu ROI 0.34% pe 1085 bets, calea fără confirmare nu adaugă valoare profitabilă.
    var signalStrong = false;

    if(!directAdaptive && !patternOnly && !highQualityFallback) return;

    var probAdj = Number(row.adjusted_prob || 0);
    var kellyPct = Number(row.kelly_quarter_pct || 0);
    var edgePct = Number(row.edge_pct || 0);
    if(directAdaptive){
      if(probAdj < Number(thresholds.directProb || 72) || edgePct < Number(thresholds.directEdge || 6)) return;
    } else if(highQualityFallback){
      if(probAdj < Number(thresholds.highProb || 80) || kellyPct < Number(thresholds.highKelly || 2) || edgePct < Number(thresholds.highEdge || 8)) return;
    } else {
      // patternOnly — v7: min 6 bets confirmate (era 3-4)
      if(probAdj < Number(thresholds.patternProb || 76) || kellyPct <= Number(thresholds.patternKelly || 1.0) || edgePct < Number(thresholds.patternEdge || 7)) return;
      if(bestPositive && Number(bestPositive.raw_bets || 0) < 6) return;
    }

    var memoryBonus = directAdaptive ? Number(adaptive.memory_bonus || 0) : Number(bestPositive && bestPositive.memory_score || 0);
    var adaptiveScore = directAdaptive ? Number(adaptive.adaptive_score || 0) :
      Math.max(60, Math.min(88, probAdj + Number(bestPositive && bestPositive.memory_score || 0) * 1.2));
    // Market bonus bazat pe istoricul jurnalului (conservator)
    var marketBonusSmartBet = marketKey === 'btts' ? 4 : (marketKey === 'over15' ? 1 : 0);
    var __learn = { boost:0, multiplier:1.0, toxic:false, reasons:[] };
    try {
      if(typeof learningApplyToCandidate === 'function'){
        var __wdIdx = -1;
        try { var __d = new Date(row.event_date || row.date || ''); var __di = __d.getDay(); if(__di >= 0 && __di <= 6) __wdIdx = __di; } catch(e){}
        __learn = learningApplyToCandidate({
          marketKey: marketKey,
          leagueName: String(row.league || '—'),
          odds: Number(row.book_odds || 0),
          edgePct: edgePct,
          score: Number(row.score || 0),
          probAdj: probAdj,
          weekdayIdx: __wdIdx
        }) || __learn;
      }
    } catch(e){}
    var __toxicFlag = false;
    if(__learn.toxic){ __toxicFlag = true; }

    // v7 Scoring: EDGE dominant (factor 1.2 → era 0.55), Kelly ridicat (factor 1.5 → era 0.70)
    var smartScore = (
      Number(row.score || 0) * 0.40 +
      Math.min(100, adaptiveScore) * 0.22 +
      Number(row.adjusted_prob || 0) * 0.12 +
      Math.max(0, Number(row.edge_pct || 0)) * 1.20 +        // EDGE KING: factor 1.2 (era 0.55)
      Math.max(0, Number(row.kelly_quarter_pct || 0)) * 1.50 + // Kelly important: 1.5 (era 0.70)
      Math.max(0, memoryBonus) * 0.85 +
      Math.max(0, Number(row.poisson_delta || 0)) * 0.15 +
      Math.max(0, Number(bestPositive && bestPositive.roi || 0)) * 0.04 +
      marketBonusSmartBet +
      Number(__learn.boost || 0)
    );
    if(__learn.multiplier && Math.abs(__learn.multiplier - 1.0) > 0.03){
      smartScore = smartScore * (0.80 + __learn.multiplier * 0.20);
    }
    if(__toxicFlag) smartScore -= 18;
    if(patternOnly) smartScore -= 8;
    smartScore = clampMathScore(smartScore);

    var confirmLabels = [];
    if(directAdaptive) confirmLabels.push('AI direct');
    if(bestPositive) confirmLabels.push(bestPositive.label);
    if(__learn.boost && Math.abs(__learn.boost) >= 1) confirmLabels.push('Motor ' + (__learn.boost >= 0 ? '+' : '') + __learn.boost.toFixed(1));
    var reasons = [];
    reasons.push('Kelly 1/4 ' + fmtPct(Number(row.kelly_quarter_pct || 0)));
    reasons.push('Edge ' + fmtSignedPct(Number(row.edge_pct || 0)));
    if(bestPositive) reasons.push('Pattern ' + bestPositive.label);
    if(directAdaptive && adaptive.reasons && adaptive.reasons.length){
      adaptive.reasons.slice(0,2).forEach(function(r){ reasons.push(r.label + ' ' + (Number(r.impact || 0) >= 0 ? '+' : '') + Number(r.impact || 0).toFixed(1)); });
    }
    if(__learn.reasons && __learn.reasons.length){
      __learn.reasons.slice(0,2).forEach(function(r){ if(reasons.indexOf(r) < 0) reasons.push(r); });
    }

    pool.push(Object.assign({}, row, {
      source:'smartbet',
      eventKey:getGenericEventKey(row),
      marketKey: marketKey,
      displayMarket: row.market || '—',
      displayOdds: Number(row.book_odds || 0),
      odds: Number(row.book_odds || 0),
      prob: Number(row.adjusted_prob || 0),
      value: Number(row.value || 0),
      edge: Number(row.edge_pct || 0),
      edgeToPrice: Number(row.edge_pct || 0), // no-vig: adjProb - noVigMarketProb (precomputat corect)
      smartScore: smartScore,
      score: smartScore,
      ticketScore: smartScore,
      adaptiveScore: adaptiveScore,
      memoryBonus: memoryBonus,
      directAdaptive: directAdaptive,
      patternOnly: patternOnly,
      signalStrong: signalStrong || false,
      bestPositivePattern: bestPositive,
      positivePatterns: patternInfo.positive,
      confirmationLabel: confirmLabels.join(' • ') || 'Pattern confirmat',
      reasonsSmart: reasons.slice(0,5),
      aiReasons: adaptive && adaptive.reasons ? adaptive.reasons.slice(0,3) : [],
      mostLikelyScore: directAdaptive ? adaptive.most_likely_score : null,
      learningBoost: Number(__learn.boost || 0),
      learningMultiplier: Number(__learn.multiplier || 1.0),
      learningReasons: (__learn.reasons || []).slice(0, 3),
      learningToxic: __toxicFlag
    }));
    if(directAdaptive) adaptiveConfirmed += 1;
    if(patternOnly || bestPositive) patternConfirmed += 1;
  });

  pool.sort(function(a,b){
    if(Number(b.smartScore || 0) !== Number(a.smartScore || 0)) return Number(b.smartScore || 0) - Number(a.smartScore || 0);
    if(Number(b.edge || 0) !== Number(a.edge || 0)) return Number(b.edge || 0) - Number(a.edge || 0);
    return Number(b.value || 0) - Number(a.value || 0);
  });

  var topPositive = (((AI_MEMORY && AI_MEMORY.top_patterns) || []).filter(function(p){
    var key = normalizeSmartBetMarketKey(String(p && p.key || '').split('|')[0]);
    return ['over15','over25','under35','btts','1x','x2','12','doublechance'].indexOf(key) >= 0;
  }).sort(function(a,b){
    if(Number(b.memory_score || 0) !== Number(a.memory_score || 0)) return Number(b.memory_score || 0) - Number(a.memory_score || 0);
    return Number(b.roi || 0) - Number(a.roi || 0);
  })).slice(0,6);

  var avoidPatterns = (((AI_MEMORY && AI_MEMORY.avoid_patterns) || []).filter(function(p){
    var key = normalizeSmartBetMarketKey(String(p && p.key || '').split('|')[0]);
    return ['over15','over25','under35','btts','1x','x2','12','doublechance'].indexOf(key) >= 0;
  }).sort(function(a,b){
    if(Number(a.memory_score || 0) !== Number(b.memory_score || 0)) return Number(a.memory_score || 0) - Number(b.memory_score || 0);
    return Number(a.roi || 0) - Number(b.roi || 0);
  })).slice(0,6);

  SMARTBET_LAST_ANALYSIS = {
    pool: pool,
    blocked: blocked,
    adaptiveConfirmed: adaptiveConfirmed,
    patternConfirmed: patternConfirmed,
    topPositive: topPositive,
    avoidPatterns: avoidPatterns,
    policy: policy,
    thresholds: thresholds
  };
  return SMARTBET_LAST_ANALYSIS;
}
function getSmartBetStakePct(type){
  var settings = Object.assign({cons:2, balanced:4, goals:3}, BANKROLL_SETTINGS || {});
  if(type === 'safe') return Number(settings.cons || 2);
  if(type === 'hybrid') return Number(settings.balanced || 4);
  return Math.max(0.8, Number(settings.goals || 3) * 0.6);
}
function getSmartBetProfile(type, relaxed){
  var map = {
    safe:   {icon:'🛡️', label:'SafeBet',   minPicks:2, maxPicks:3, minScore:81, minProb:67, minOdd:1.20, maxOdd:1.62, targetMinOdds:1.90, targetMaxOdds:3.90, maxSameMarket:1, minBonus:0},
    hybrid: {icon:'⚖️', label:'HybridBet', minPicks:3, maxPicks:4, minScore:75, minProb:60, minOdd:1.20, maxOdd:1.82, targetMinOdds:3.00, targetMaxOdds:6.50, maxSameMarket:2, minBonus:-1},
    value:  {icon:'🚀', label:'ValueBet',  minPicks:2, maxPicks:4, minScore:71, minProb:55, minOdd:1.28, maxOdd:2.25, targetMinOdds:3.40, targetMaxOdds:8.80, maxSameMarket:2, minBonus:-2}
  };
  var p = Object.assign({}, map[type] || map.hybrid);
  if(relaxed){
    p.minScore -= 4;
    p.minProb -= 4;
    p.maxOdd += 0.18;
    p.minBonus -= 1.5;
    p.targetMaxOdds += (type === 'value' ? 1.8 : 0.9);
  }
  return p;
}
function getSmartBetRank(type, picks, totalOdds, combinedProb){
  var scoreAvg = picks.length ? picks.reduce(function(acc,p){ return acc + Number(p.smartScore || p.score || 0); },0) / picks.length : 0;
  var edgeAvg = picks.length ? picks.reduce(function(acc,p){ return acc + Number(p.edge || 0); },0) / picks.length : 0;
  var valueSum = picks.reduce(function(acc,p){ return acc + Number(p.value || 0) * 100; },0);
  var memAvg = picks.length ? picks.reduce(function(acc,p){ return acc + Number(p.memoryBonus || 0); },0) / picks.length : 0;
  var targetMid = type === 'safe' ? 2.8 : type === 'hybrid' ? 4.5 : 6.4;
  var oddsPenalty = Math.abs(Number(totalOdds || 1) - targetMid) * (type === 'safe' ? 5.0 : 3.8);
  return scoreAvg * 1.35 + combinedProb * 0.55 + edgeAvg * 1.10 + valueSum * (type === 'value' ? 0.55 : 0.32) + memAvg * 2.4 - oddsPenalty;
}
function buildSmartBetTicket(type, relaxed){
  var analysis = SMARTBET_LAST_ANALYSIS || getSmartBetAnalysis();
  var profile = getSmartBetProfile(type, relaxed);
  var pool = (analysis.pool || []).filter(function(item){
    return Number(item.smartScore || 0) >= profile.minScore &&
           Number(item.prob || 0) >= profile.minProb &&
           Number(item.odds || 0) >= profile.minOdd &&
           Number(item.odds || 0) <= profile.maxOdd &&
           Number(item.memoryBonus || 0) >= profile.minBonus;
  }).slice(0, 14);

  if(pool.length < profile.minPicks){
    return {
      type:type, relaxed:!!relaxed, label:profile.icon + ' ' + profile.label, picks:[], totalOdds:1, combinedProb:0,
      summary:'Pool prea mic pentru ' + profile.label,
      stakePct:getSmartBetStakePct(type), stake:getSuggestedStakeFromPct(type === 'safe' ? 'premium' : (type === 'hybrid' ? 'double' : 'triple')),
      generatedAt:new Date().toISOString(),
      error:'Nu există suficiente selecții validate pentru ' + profile.label + (relaxed ? ' (relaxat).' : '.')
    };
  }

  var best = null;
  function walk(start, chosen){
    if(chosen.length >= profile.minPicks){
      var totalOdds = chosen.reduce(function(acc,p){ return acc * Number(p.odds || 1); },1);
      var combinedProb = chosen.reduce(function(acc,p){ return acc * Number(p.prob || 0) / 100; }, 1) * 100;
      if(totalOdds >= profile.targetMinOdds && totalOdds <= profile.targetMaxOdds){
        var rank = getSmartBetRank(type, chosen, totalOdds, combinedProb);
        if(!best || rank > best.rank){
          best = { picks: chosen.slice(), totalOdds: totalOdds, combinedProb: combinedProb, rank: rank };
        }
      }
    }
    if(chosen.length === profile.maxPicks) return;
    for(var i=start;i<pool.length;i++){
      var item = pool[i];
      var correlated = chosen.some(function(existing){ return areRowsCorrelated(existing, item); });
      if(correlated) continue;
      var sameMarketCount = chosen.filter(function(existing){ return String(existing.marketKey || '') === String(item.marketKey || ''); }).length;
      if(sameMarketCount >= profile.maxSameMarket) continue;
      chosen.push(item);
      walk(i + 1, chosen);
      chosen.pop();
    }
  }
  walk(0, []);

  if(!best){
    return {
      type:type, relaxed:!!relaxed, label:profile.icon + ' ' + profile.label, picks:[], totalOdds:1, combinedProb:0,
      summary:'Nu există combinație curată pe pragurile curente.',
      stakePct:getSmartBetStakePct(type), stake:getSuggestedStakeFromPct(type === 'safe' ? 'premium' : (type === 'hybrid' ? 'double' : 'triple')),
      generatedAt:new Date().toISOString(),
      error:'Nu există combinație necorelată care să păstreze pragurile SmartBet pentru ' + profile.label + (relaxed ? ' (relaxat).' : '.')
    };
  }

  var stakePct = getSmartBetStakePct(type);
  return {
    type:type,
    relaxed:!!relaxed,
    label:profile.icon + ' ' + profile.label,
    picks:best.picks,
    totalOdds:Number(best.totalOdds || 1),
    combinedProb:Number(best.combinedProb || 0),
    summary:(type === 'safe' ? '2-3 selecții cu accent pe probabilitate și confirmare istorică.' : (type === 'hybrid' ? 'Combo echilibrat între edge, value și pattern-uri pozitive.' : 'Selecții validate de ambele motoare, dar cu potențial de preț superior.')),
    stakePct:stakePct,
    stake:+(getActualBankrollValue() * stakePct / 100).toFixed(2),
    generatedAt:new Date().toISOString()
  };
}
function renderSmartBetTicket(type){
  var target = $('smartbet-ticket-' + type);
  if(!target) return;
  var ticket = SMARTBET_TICKETS[type];
  if(!ticket || !ticket.picks || !ticket.picks.length){
    var msg = ticket && ticket.error ? ticket.error : 'Apasă pe Generează pentru a construi biletul SmartBet.';
    target.innerHTML = '<div class="empty-state" style="padding:10px">' + msg + '</div>';
    return;
  }
  var html = '<div style="padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03)">'+
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
      '<div><div style="font-size:13px;font-weight:800;color:var(--txt)">'+ticket.label+(ticket.relaxed ? ' • Relaxat' : '')+'</div><div style="font-size:10px;color:var(--muted);margin-top:4px">'+ticket.picks.length+' selecții • '+ticket.summary+(ticket.generatedAt ? ' • '+fmtDateTime(ticket.generatedAt) : '')+'</div></div>'+
      '<div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--grn)">'+ticket.totalOdds.toFixed(2)+'x</div><div style="font-size:10px;color:var(--muted);margin-top:4px">Prob. compusă '+ticket.combinedProb.toFixed(1)+'% • stake '+ticket.stakePct.toFixed(1)+'%</div></div>'+
    '</div>';
  ticket.picks.forEach(function(row){
    var tags = (row.reasonsSmart || []).slice(0, 3).map(function(tag){ return '<span class="reason-pill">'+tag+'</span>'; }).join('');
    html += '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.06)">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><div style="font-size:12px;font-weight:700;color:var(--txt)">'+renderEventIdentity({ home:row.home, away:row.away, league:row.league, event_id:row.event_id, prediction_id:row.prediction_id, event_date:row.event_date, home_api_id:row.home_api_id, away_api_id:row.away_api_id, league_api_id:row.league_api_id }, { logoSize:16, leagueSize:12, secondaryHtml:htmlEsc(row.event_date ? (fmtDate(row.event_date)+' '+fmtTime(row.event_date)) : '—') })+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:12px;font-weight:800;color:var(--acc)">'+(row.displayMarket || row.market || '—')+' @ '+Number(row.displayOdds || row.odds || 0).toFixed(2)+'</div><div style="font-size:10px;color:'+(Number(row.memoryBonus || 0) >= 0 ? 'var(--grn)' : 'var(--red)')+';margin-top:4px">Smart '+Number(row.smartScore || 0).toFixed(0)+' • Mem '+(Number(row.memoryBonus || 0) >= 0 ? '+' : '')+Number(row.memoryBonus || 0).toFixed(1)+'</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><span class="reason-pill">Prob '+fmtPct(Number(row.prob || 0))+'</span><span class="reason-pill">Edge '+fmtSignedPct(Number(row.edge || 0))+'</span><span class="reason-pill">Value '+fmtSignedPct(Number(row.value || 0) * 100)+'</span><span class="reason-pill">Adaptive '+Number(row.adaptiveScore || 0).toFixed(0)+'</span>'+(tags || '')+'</div>'+
    '</div>';
  });
  html += '</div>';
  target.innerHTML = html;
}
function renderSmartBetGenerators(){
  ['safe','hybrid','value'].forEach(function(type){
    if(SMARTBET_TICKETS[type]) renderSmartBetTicket(type);
    var ticket = SMARTBET_TICKETS[type];
    var poolCount = SMARTBET_LAST_ANALYSIS && SMARTBET_LAST_ANALYSIS.pool ? SMARTBET_LAST_ANALYSIS.pool.length : 0;
    if(ticket && ticket.picks && ticket.picks.length) setGeneratorStatus('smartbet-status-' + type, 'Pool: ' + poolCount + ' • ultima generare ' + fmtDateTime(ticket.generatedAt || new Date().toISOString()) + (ticket.relaxed ? ' • relaxat' : ''), 'ok');
    else if(ticket && ticket.error) setGeneratorStatus('smartbet-status-' + type, ticket.error, 'warn');
    else setGeneratorStatus('smartbet-status-' + type, 'Pool curent: ' + poolCount + ' selecții validate.', poolCount ? 'ok' : 'warn');
  });
}
function handleGenerateSmartBetTicket(type, btn, relaxed){
  setButtonBusy(btn, true, relaxed ? 'Relaxat' : 'Generează', 'Se generează...');
  setTimeout(function(){
    SMARTBET_TICKETS[type] = buildSmartBetTicket(type, !!relaxed);
    renderSmartBetGenerators();
    setButtonBusy(btn, false, relaxed ? 'Relaxat' : 'Generează', 'Se generează...');
    var ticket = SMARTBET_TICKETS[type];
    if(ticket && ticket.picks && ticket.picks.length) toast(ticket.label + (relaxed ? ' generat (relaxat)!' : ' generat!'), 'ok');
    else if(ticket && ticket.error) toast(ticket.error, 'warn');
  }, 120);
}

var _smartbetSwitchTab = window.switchTab;
window.switchTab = function(name){
  _smartbetSwitchTab(name);
  if(name === 'smartbet'){
    var activeSection = (window._smartLearnSection || 'predictii');
    if(activeSection === 'predictii'){ try{ renderUnifiedEngine(); }catch(e){} }
    if(activeSection === 'arhiva'){ try{ renderArchivePanel(); }catch(e){} }
    if(activeSection === 'audit'){ try{ renderSmartBet(); renderSignalAudit(); renderAuditGenerators(); }catch(e){} }
    if(activeSection === 'aimemory'){ try{ renderAIMemory(); }catch(e){} }
    if(activeSection === 'smartbet'){ try{ renderSmartBet(); }catch(e){} }
    if(activeSection === 'performanta'){ try{ renderPerformantaVerdict(); }catch(e){} }
  }
};

var _smartbetRenderAll = window.renderAll;
window.renderAll = function(){
  var out = _smartbetRenderAll();
  try {
    var smartTab = document.getElementById('tab-smartbet');
    if(smartTab && smartTab.classList.contains('active')){
      renderSmartBet();
      if((window._smartLearnSection||'predictii')==='predictii') renderUnifiedEngine();
    }
  } catch(err){ console.error('SmartBet renderAll failed:', err); }
  return out;
};
/* ===== SMARTBET UI COMPACT + HISTORY OVERRIDES ===== */
var SMARTBET_VIEW = window.SMARTBET_VIEW || 'live';
var SMARTBET_HISTORY_RANGE = window.SMARTBET_HISTORY_RANGE || '30d';

function smartBetMarketLabel(key, row){
  var k = normalizeSmartBetMarketKey(key || (row && (row.market_key || row.market)));
  if(k === 'over15') return 'Over 1.5G';
  if(k === 'over25') return 'Over 2.5G';
  if(k === 'under35') return 'Under 3.5G';
  if(k === 'btts') return 'BTTS';
  if(k === '1x') return '1X';
  if(k === 'x2') return 'X2';
  if(k === '12') return '12';
  if(k === 'doublechance') return 'Double Chance';
  return row && row.market ? row.market : (key || '—');
}
function smartBetSafeCell(value, color){
  return '<div style="padding:8px 10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.03)"><div style="font-size:10px;color:var(--muted);margin-bottom:3px">'+value.label+'</div><div style="font-size:15px;font-weight:800;color:'+(color || 'var(--txt)')+'">'+value.value+'</div><div style="font-size:9px;color:var(--muted);margin-top:3px;line-height:1.35">'+value.sub+'</div></div>';
}
function setSmartBetView(view){
  SMARTBET_VIEW = view === 'history' ? 'history' : 'live';
  var live = $('smartbet-live-section');
  var history = $('smartbet-history-section');
  if(live) live.style.display = SMARTBET_VIEW === 'live' ? '' : 'none';
  if(history) history.style.display = SMARTBET_VIEW === 'history' ? '' : 'none';

  var liveBtn = $('smartbet-view-live-btn');
  var histBtn = $('smartbet-view-history-btn');
  [liveBtn, histBtn].forEach(function(btn){
    if(!btn) return;
    btn.style.background = 'rgba(255,255,255,.04)';
    btn.style.border = '1px solid rgba(255,255,255,.10)';
    btn.style.color = 'var(--txt)';
  });
  if(liveBtn && SMARTBET_VIEW === 'live'){
    liveBtn.style.background = 'rgba(59,130,246,.14)';
    liveBtn.style.border = '1px solid rgba(59,130,246,.28)';
    liveBtn.style.color = 'var(--acc)';
  }
  if(histBtn && SMARTBET_VIEW === 'history'){
    histBtn.style.background = 'rgba(168,85,247,.14)';
    histBtn.style.border = '1px solid rgba(168,85,247,.28)';
    histBtn.style.color = 'var(--pur)';
  }
  if(SMARTBET_VIEW === 'history') renderSmartBetHistory();
}
function getSmartBetHistoryCutoff(){
  if(SMARTBET_HISTORY_RANGE === 'all') return null;
  var daysMap = {'7d':7,'30d':30,'90d':90,'180d':180,'365d':365};
  var days = daysMap[SMARTBET_HISTORY_RANGE] || 30;
  return new Date(Date.now() - days * 86400000);
}
function buildSmartBetHistoryBaseRows(){
  var rows = [];
  (HISTORY_ENGINE || []).forEach(function(r){
    if(!r || !smartBetSupportedMarket(r)) return;
    if(Number(r.adjusted_prob || 0) < 74 || Number(r.edge_pct || 0) < 4) return;
    rows.push({
      source:'history_engine',
      marketKey:normalizeSmartBetMarketKey(r.market_key || r.market),
      market:smartBetMarketLabel(r.market_key || r.market, r),
      event_id:r.event_id,
      home:r.home || '',
      away:r.away || '',
      league:r.league || '',
      event_date:r.date || r.event_date || r.created_at || '',
      created_at:r.created_at || r.date || '',
      odds:Number(r.odds || 0),
      adjusted_prob:Number(r.adjusted_prob || 0),
      edge_pct:Number(r.edge_pct || 0),
      score:Number(r.score || 0),
      value:Number(r.value || 0),
      status:r.won === true ? 'win' : (r.won === false ? 'lose' : 'pending'),
      home_score:r.home_score,
      away_score:r.away_score
    });
  });
  (RECOMMENDATION_LOG || []).forEach(function(r){
    if(!r || !smartBetSupportedMarket(r)) return;
    if(String(r.status || '').toLowerCase() !== 'pending') return;
    if(Number(r.adjusted_prob || 0) < 74 || Number(r.edge_pct || 0) < 4) return;
    rows.push({
      source:'recommendation_log',
      marketKey:normalizeSmartBetMarketKey(r.market_key || r.market),
      market:smartBetMarketLabel(r.market_key || r.market, r),
      event_id:r.event_id,
      home:r.home || '',
      away:r.away || '',
      league:r.league || '',
      event_date:r.event_date || '',
      created_at:r.logged_at || r.prediction_created_at || '',
      odds:Number(r.odds || 0),
      adjusted_prob:Number(r.adjusted_prob || 0),
      edge_pct:Number(r.edge_pct || 0),
      score:Number(r.score || 0),
      value:Number(r.value || 0),
      status:'pending',
      home_score:r.home_score,
      away_score:r.away_score
    });
  });
  var dedup = {};
  rows.forEach(function(r){
    var key = [r.event_id || '', r.marketKey || '', r.status, r.created_at || r.event_date || ''].join('|');
    dedup[key] = r;
  });
  return Object.keys(dedup).map(function(k){ return dedup[k]; }).sort(function(a,b){
    return new Date(b.created_at || b.event_date || 0).getTime() - new Date(a.created_at || a.event_date || 0).getTime();
  });
}
function getSmartBetHistoryEntryKey(row){
  if(!row) return 'na';
  if(row.event_id != null) return String(row.event_id) + '|' + normalizeSmartBetMarketKey(row.marketKey || row.market_key || row.market);
  return [String(row.home || '').toLowerCase(), String(row.away || '').toLowerCase(), row.event_date || row.date || '', normalizeSmartBetMarketKey(row.marketKey || row.market_key || row.market)].join('|');
}
function loadSmartBetHistoryJournal(){
  try{
    var raw = localStorage.getItem(SMARTBET_HISTORY_STORAGE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(err){ return []; }
}
function saveSmartBetHistoryJournal(rows){
  try{ localStorage.setItem(SMARTBET_HISTORY_STORAGE_KEY, JSON.stringify(rows || [])); }catch(err){}
}
function getSmartBetOutcomeFromSources(entry){
  var marketKey = normalizeSmartBetMarketKey(entry.marketKey || entry.market);
  var hit = (HISTORY_ENGINE || []).find(function(r){
    return normalizeSmartBetMarketKey(r.market_key || r.market) === marketKey &&
      ((entry.event_id != null && r.event_id != null && Number(r.event_id) === Number(entry.event_id)) ||
       (String(r.league || '').toLowerCase() === String(entry.league || '').toLowerCase() &&
        String(r.market || '').toLowerCase() === String(entry.market || '').toLowerCase() &&
        String(r.date || r.event_date || '').slice(0,10) === String(entry.event_date || '').slice(0,10)));
  });
  if(hit && hit.won != null){
    return {
      status: hit.won ? 'win' : 'lose',
      settled_at: hit.date || hit.created_at || new Date().toISOString(),
      home_score: hit.home_score,
      away_score: hit.away_score
    };
  }
  var logHit = (RECOMMENDATION_LOG || []).find(function(r){
    return normalizeSmartBetMarketKey(r.market_key || r.market) === marketKey &&
      ((entry.event_id != null && r.event_id != null && Number(r.event_id) === Number(entry.event_id)) ||
       (String(r.home || '').toLowerCase() === String(entry.home || '').toLowerCase() &&
        String(r.away || '').toLowerCase() === String(entry.away || '').toLowerCase() &&
        String(r.event_date || '').slice(0,10) === String(entry.event_date || '').slice(0,10)));
  });
  if(logHit && logHit.status && String(logHit.status).toLowerCase() !== 'pending'){
    return {
      status: String(logHit.status).toLowerCase(),
      settled_at: logHit.logged_at || logHit.prediction_created_at || new Date().toISOString(),
      home_score: logHit.home_score,
      away_score: logHit.away_score
    };
  }
  return null;
}
function syncSmartBetHistoryJournal(pool){
  var journal = loadSmartBetHistoryJournal();
  var map = {};
  journal.forEach(function(entry){ map[getSmartBetHistoryEntryKey(entry)] = entry; });

  (pool || []).forEach(function(row){
    var eventTime = new Date(row.event_date || 0).getTime();
    if(isFinite(eventTime) && eventTime < new Date().setHours(0,0,0,0)) return;
    var key = getSmartBetHistoryEntryKey(row);
    if(!map[key]){
      map[key] = {
        event_id: row.event_id,
        home: row.home || '',
        away: row.away || '',
        league: row.league || '',
        event_date: row.event_date || '',
        market: smartBetMarketLabel(row.marketKey, row),
        marketKey: normalizeSmartBetMarketKey(row.marketKey || row.market),
        odds: Number(row.displayOdds || row.odds || 0),
        adjusted_prob: Number(row.prob || row.adjusted_prob || 0),
        edge_pct: Number(row.edge || row.edge_pct || 0),
        score: Number(row.smartScore || row.score || 0),
        smart_score: Number(row.smartScore || row.score || 0),
        logged_at: new Date().toISOString(),
        status: 'pending',
        result_label: ''
      };
    }else if(map[key].status === 'pending'){
      map[key].odds = Number(row.displayOdds || row.odds || map[key].odds || 0);
      map[key].adjusted_prob = Number(row.prob || row.adjusted_prob || map[key].adjusted_prob || 0);
      map[key].edge_pct = Number(row.edge || row.edge_pct || map[key].edge_pct || 0);
      map[key].score = Number(row.smartScore || row.score || map[key].score || 0);
      map[key].smart_score = Number(row.smartScore || row.score || map[key].smart_score || 0);
    }
  });

  var out = Object.keys(map).map(function(k){
    var entry = map[k];
    if(entry.status === 'pending'){
      var outcome = getSmartBetOutcomeFromSources(entry);
      if(outcome){
        entry.status = outcome.status;
        entry.settled_at = outcome.settled_at;
        entry.home_score = outcome.home_score;
        entry.away_score = outcome.away_score;
      }
    }
    return entry;
  }).sort(function(a,b){
    return new Date(b.logged_at || 0).getTime() - new Date(a.logged_at || 0).getTime();
  });

  saveSmartBetHistoryJournal(out);
  return out;
}
function getSmartBetHistoryRows(){
  var cutoff = getSmartBetHistoryCutoff();
  return loadSmartBetHistoryJournal().filter(function(r){
    var when = new Date(r.logged_at || 0);
    return !cutoff || (isFinite(when.getTime()) && when >= cutoff);
  });
}
function renderSmartBetPatternLists(analysis){
  var good = $('smartbet-patterns-good');
  var bad = $('smartbet-patterns-bad');
  function buildTable(list, positive){
    if(!list || !list.length) return '<div class="empty-state" style="padding:10px">Nicio intrare disponibilă.</div>';
    var color = positive ? 'var(--grn)' : 'var(--red)';
    return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:280px">'+
      '<thead><tr style="color:var(--muted);text-align:left">'+
        '<th style="padding:0 0 8px 0;font-weight:600">Pattern</th>'+
        '<th style="padding:0 6px 8px 6px;font-weight:600">Score</th>'+
        '<th style="padding:0 6px 8px 6px;font-weight:600">ROI</th>'+
        '<th style="padding:0 0 8px 6px;font-weight:600">Meciuri</th>'+
      '</tr></thead>'+
      '<tbody>'+list.map(function(p){
        return '<tr style="border-top:1px solid rgba(255,255,255,.06)">'+
          '<td style="padding:8px 6px 8px 0;color:var(--txt);font-weight:600">'+(p.label || '—')+'</td>'+
          '<td style="padding:8px 6px;color:'+color+';font-family:var(--mono)">'+Number(p.memory_score || 0).toFixed(0)+'</td>'+
          '<td style="padding:8px 6px;color:'+(Number(p.roi || 0) >= 0 ? 'var(--grn)' : 'var(--red)')+'">'+fmtSignedPct(Number(p.roi || 0))+'</td>'+
          '<td style="padding:8px 0 8px 6px;color:var(--txt)">'+(p.raw_bets || 0)+'</td>'+
        '</tr>';
      }).join('')+'</tbody></table></div>';
  }
  if(good) good.innerHTML = buildTable(analysis.topPositive || [], true);
  if(bad) bad.innerHTML = buildTable(analysis.avoidPatterns || [], false);
}
function renderSmartBet(){
  var summary = $('smartbet-summary-grid');
  var list = $('smartbet-list');
  var updated = $('smartbet-updated');
  var meta = $('smartbet-list-meta');
  if(!summary || !list) return;

  var analysis = getSmartBetAnalysis();
  var pool = analysis.pool || [];
  var blocked = analysis.blocked || [];
  syncSmartBetHistoryJournal(pool);

  if(updated){
    var ts = (AI_MEMORY && AI_MEMORY.updated_at) || (SIGNAL_AUDIT && SIGNAL_AUDIT.updated_at) || (APP_META && APP_META.updated_at) || '';
    updated.textContent = ts ? ('SmartBet actualizat: ' + fmtDateTime(ts)) : 'SmartBet: —';
  }
  var policy = analysis.policy || getSmartBetEnginePolicy();
  if(meta) meta.textContent = policy.label + ' • ' + pool.length + ' validate';

  var avgScore = pool.length ? (pool.reduce(function(acc,row){ return acc + Number(row.smartScore || 0); },0) / pool.length) : 0;
  var avgEdge = pool.length ? (pool.reduce(function(acc,row){ return acc + Number(row.edge || 0); },0) / pool.length) : 0;
  var avgValue = pool.length ? (pool.reduce(function(acc,row){ return acc + Number(row.value || 0) * 100; },0) / pool.length) : 0;
  var avgProb = pool.length ? (pool.reduce(function(acc,row){ return acc + Number(row.prob || 0); },0) / pool.length) : 0;

  var cards = [
    {label:'Mod activ', value:policy.label, sub:policy.reason, color:(policy.state==='positive'?'var(--grn)':policy.state==='harmful'?'var(--red)':'var(--yel)')},
    {label:'Validate', value:String(pool.length), sub:'trecute prin filtrul curent', color:'var(--acc)'},
    {label:'Smart score', value:pool.length ? avgScore.toFixed(1) : '—', sub:'media scorului final', color:'var(--pur)'},
    {label:'Prob. medie', value:pool.length ? fmtPct(avgProb) : '—', sub:'probabilitate ajustată medie', color:'var(--grn)'},
    {label:'Edge mediu', value:pool.length ? fmtSignedPct(avgEdge) : '—', sub:'avantaj model vs piață', color:'var(--yel)'},
    {label:'Value mediu', value:pool.length ? fmtSignedPct(avgValue) : '—', sub:'EV mediu rămas în pool', color:'var(--cyan)'}
  ];
  summary.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">'+
    cards.map(function(card){ return smartBetSafeCell(card, card.color); }).join('')+
  '</div>';

  if(!pool.length){
    list.innerHTML = '<div class="empty-state">În acest refresh nu există selecții care să treacă simultan filtrul Audit Kelly și validarea AI Memory.</div>';
    renderSmartBetPatternLists(analysis);
    setSmartBetView(SMARTBET_VIEW || 'live');
    return;
  }

  list.innerHTML = pool.map(function(r, idx){
    var valuePct = Number(r.value || 0) * 100;
    return '<div class="audit-row" style="margin-bottom:10px">'+
      '<div class="audit-row-header">'+
        '<div class="audit-row-main">'+
          '<div class="audit-row-titleline"><span class="audit-row-rank">#'+(idx+1)+'</span><div class="audit-row-teams">'+renderEventIdentity({ home:r.home, away:r.away, league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, home_api_id:r.home_api_id, away_api_id:r.away_api_id, league_api_id:r.league_api_id }, { logoSize:16, leagueSize:12, showLeague:false })+'</div></div>'+
          '<div class="audit-row-meta">'+renderLeagueBadge({ league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, league_api_id:r.league_api_id }, 12)+' • '+(r.event_date ? (fmtDate(r.event_date)+' • '+fmtTime(r.event_date)) : '—')+' • '+(r.directAdaptive ? 'AI direct' : (r.signalStrong ? 'Semnal audit' : 'Pattern confirmat'))+'</div>'+
        '</div>'+
        '<div class="audit-pick-box">'+
          '<div class="audit-pick-label">SmartBet pick</div>'+
          '<div class="audit-pick-value">'+smartBetMarketLabel(r.marketKey, r)+' @ '+Number(r.displayOdds || 0).toFixed(2)+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="audit-row-tags">'+
        '<span class="audit-badge" style="color:var(--pur)">Smart '+Number(r.smartScore || 0).toFixed(0)+'</span>'+
        '<span class="audit-badge" style="color:'+(Number(r.memoryBonus || 0) >= 0 ? 'var(--grn)' : 'var(--red)')+'">Mem '+(Number(r.memoryBonus || 0) >= 0 ? '+' : '')+Number(r.memoryBonus || 0).toFixed(1)+'</span>'+
        '<span class="audit-badge">Kelly '+fmtPct(Number(r.kelly_quarter_pct || 0))+'</span>'+
      '</div>'+
      '<div class="audit-stat-grid">'+
        '<div class="audit-stat"><div class="audit-stat-label">Prob. ajustată</div><div class="audit-stat-value">'+fmtPct(Number(r.prob || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Edge</div><div class="audit-stat-value">'+fmtSignedPct(Number(r.edge || 0))+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Value</div><div class="audit-stat-value">'+fmtSignedPct(valuePct)+'</div></div>'+
        '<div class="audit-stat"><div class="audit-stat-label">Adaptive</div><div class="audit-stat-value">'+Number(r.adaptiveScore || 0).toFixed(0)+'</div></div>'+
      '</div>'+
    '</div>';
  }).join('');

  renderSmartBetPatternLists(analysis);
  setSmartBetView(SMARTBET_VIEW || 'live');
  setSmartBetHistoryRange(SMARTBET_HISTORY_RANGE || '30d');
}
function setSmartBetHistoryRange(range){
  SMARTBET_HISTORY_RANGE = range || '30d';
  ['7d','30d','90d','180d','365d','all'].forEach(function(key){
    var el = $('smartbet-range-' + key);
    if(!el) return;
    el.style.background = 'rgba(255,255,255,.04)';
    el.style.border = '1px solid rgba(255,255,255,.10)';
    el.style.color = 'var(--txt)';
    if(key === SMARTBET_HISTORY_RANGE){
      el.style.background = 'rgba(168,85,247,.14)';
      el.style.border = '1px solid rgba(168,85,247,.28)';
      el.style.color = 'var(--pur)';
    }
  });
  renderSmartBetHistory();
}
function renderSmartBetHistory(){
  var root = $('smartbet-history-root');
  if(!root) return;
  var rows = getSmartBetHistoryRows();
  if(!rows.length){
    root.innerHTML = '<div class="empty-state">Istoricul SmartBet pornește de azi înainte. Deocamdată nu există intrări salvate pe intervalul selectat.</div>';
    return;
  }

  var byMarket = {};
  rows.forEach(function(r){
    var k = r.marketKey || 'misc';
    if(!byMarket[k]) byMarket[k] = {market:k, label:smartBetMarketLabel(k, r), list:[], pending:0, settled:0, wins:0, profit:0};
    byMarket[k].list.push(r);
    if(r.status === 'pending') byMarket[k].pending += 1;
    else {
      byMarket[k].settled += 1;
      byMarket[k].wins += r.status === 'win' ? 1 : 0;
      byMarket[k].profit += r.status === 'win' ? (Number(r.odds || 0) - 1) : -1;
    }
  });
  var groups = Object.keys(byMarket).map(function(k){
    var g = byMarket[k];
    g.roi = g.settled ? (g.profit / g.settled) * 100 : 0;
    g.winrate = g.settled ? (g.wins / g.settled) * 100 : 0;
    return g;
  }).sort(function(a,b){ return a.label.localeCompare(b.label); });

  var rangeLabelMap = {'7d':'7 zile','30d':'30 zile','90d':'3 luni','180d':'6 luni','365d':'1 an','all':'Total'};
  var rangeLabel = rangeLabelMap[SMARTBET_HISTORY_RANGE] || '30 zile';

  if(!SMARTBET_HISTORY_ACTIVE_MARKET) SMARTBET_HISTORY_ACTIVE_MARKET = 'all';
  if(SMARTBET_HISTORY_ACTIVE_MARKET !== 'all' && groups.every(function(g){ return g.market !== SMARTBET_HISTORY_ACTIVE_MARKET; })) SMARTBET_HISTORY_ACTIVE_MARKET = 'all';

  var settled = rows.filter(function(r){ return r.status !== 'pending'; });
  var pending = rows.filter(function(r){ return r.status === 'pending'; });
  var bets = settled.length;
  var wins = settled.filter(function(r){ return r.status === 'win'; }).length;
  var profit = settled.reduce(function(acc,r){ return acc + (r.status === 'win' ? (Number(r.odds || 0) - 1) : -1); }, 0);
  var roi = bets ? (profit / bets) * 100 : 0;
  var winrate = bets ? (wins / bets) * 100 : 0;
  var avgOdds = bets ? (settled.reduce(function(acc,r){ return acc + Number(r.odds || 0); },0) / bets) : 0;

  var cards = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px">'+
    smartBetSafeCell({label:'ROI', value:bets ? ((roi >= 0 ? '+' : '') + roi.toFixed(1)+'%') : '—', sub:'din meciurile închise'}, bets ? (roi >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--muted)')+
    smartBetSafeCell({label:'Win rate', value:bets ? winrate.toFixed(1)+'%' : '—', sub:'câștigate / jucate'}, 'var(--acc)')+
    smartBetSafeCell({label:'Meciuri', value:String(bets), sub:'închise în interval'}, 'var(--txt)')+
    smartBetSafeCell({label:'Pending', value:String(pending.length), sub:'în așteptare'}, 'var(--yel)')+
    smartBetSafeCell({label:'Profit unit', value:bets ? (profit >= 0 ? '+' : '') + profit.toFixed(2) : '—', sub:'miza 1 unit / pick'}, profit >= 0 ? 'var(--grn)' : 'var(--red)')+
    smartBetSafeCell({label:'Cota medie', value:bets ? avgOdds.toFixed(2) : '—', sub:'pe meciurile închise'}, 'var(--pur)')+
  '</div>';

  var allGroup = {
    market:'all',
    label:'TOATE',
    list:rows.slice(),
    pending:pending.length,
    settled:bets,
    wins:wins,
    profit:profit,
    roi:roi,
    winrate:winrate
  };

  var displayGroups = [allGroup].concat(groups);

  var marketButtons = '<div class="history-card-grid" style="margin-bottom:12px">'+displayGroups.map(function(g){
    var active = SMARTBET_HISTORY_ACTIVE_MARKET === g.market;
    var roiText = g.settled ? ((g.roi >= 0 ? '+' : '') + g.roi.toFixed(1)+'%') : '—';
    return '<button class="history-summary-card'+(active ? ' active' : '')+'" onclick="setSmartBetHistoryMarket(&quot;'+g.market+'&quot;)">'+
      '<div class="history-summary-top">'+
        '<div><div class="history-summary-label">'+g.label+'</div><div class="history-summary-note">'+rangeLabel+'</div></div>'+
        '<div class="history-summary-roi" style="color:'+(g.settled ? (g.roi >= 0 ? 'var(--grn)' : 'var(--red)') : 'var(--muted)')+'">'+roiText+'</div>'+
      '</div>'+
      '<div class="history-metric-row">'+
        '<div class="history-metric"><div class="k">Win rate</div><div class="v">'+(g.settled ? g.winrate.toFixed(1)+'%' : '—')+'</div></div>'+
        '<div class="history-metric"><div class="k">Win / jucate</div><div class="v">'+(g.wins || 0)+'/'+(g.settled || 0)+'</div></div>'+
        '<div class="history-metric"><div class="k">Pending</div><div class="v">'+(g.pending || 0)+'</div></div>'+
        '<div class="history-metric"><div class="k">Total</div><div class="v">'+(g.list ? g.list.length : 0)+'</div></div>'+
      '</div>'+
    '</button>';
  }).join('')+'</div>';

  var current = SMARTBET_HISTORY_ACTIVE_MARKET === 'all'
    ? allGroup
    : (groups.find(function(g){ return g.market === SMARTBET_HISTORY_ACTIVE_MARKET; }) || allGroup);
  var rowsHtml = current.list.length ? current.list.map(function(r){
    var color = r.status === 'win' ? 'var(--grn)' : (r.status === 'lose' ? 'var(--red)' : 'var(--yel)');
    var label = r.status === 'win' ? 'WIN' : (r.status === 'lose' ? 'LOSE' : 'PENDING');
    return '<div class="history-row">'+
      '<div class="history-row-head">'+
        '<div>'+
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div class="history-row-title">'+renderEventIdentity({ home:r.home, away:r.away, league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, home_api_id:r.home_api_id, away_api_id:r.away_api_id, league_api_id:r.league_api_id }, { logoSize:16, leagueSize:12, showLeague:false })+'</div><span style="font-size:10px;color:var(--acc);border:1px solid rgba(59,130,246,.22);padding:2px 7px;border-radius:999px;background:rgba(59,130,246,.10)">'+(r.market || '—')+'</span></div>'+
          '<div class="history-row-sub">'+renderLeagueBadge({ league:r.league, event_id:r.event_id, prediction_id:r.prediction_id, event_date:r.event_date, league_api_id:r.league_api_id }, 12)+'</div>'+
          '<div class="history-row-meta">Logat '+fmtDateTime(r.logged_at || '')+' • Meci '+(r.event_date ? fmtDateTime(r.event_date) : '—')+' • '+Number(r.odds || 0).toFixed(2)+'</div>'+
          '<div class="history-row-meta">Prob. ajustată '+Number(r.adjusted_prob || 0).toFixed(1)+'% • Edge '+(Number(r.edge_pct || 0) >= 0 ? '+' : '')+Number(r.edge_pct || 0).toFixed(1)+'% • Smart '+Number(r.smart_score || r.score || 0).toFixed(1)+'</div>'+
          '<div class="history-row-meta">'+((r.home_score != null && r.away_score != null) ? ('Scor final ' + r.home_score + '-' + r.away_score) : 'În așteptare / neînchis încă')+'</div>'+
        '</div>'+
        '<div class="history-status-pill" style="background:'+(r.status === 'win' ? 'rgba(34,197,94,.12)' : (r.status === 'lose' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)'))+';border:1px solid rgba(255,255,255,.08);color:'+color+'">'+label+'</div>'+
      '</div>'+
    '</div>';
  }).join('') : '<div class="empty-state" style="margin-top:8px">Nu există încă evenimente pentru categoria selectată.</div>';

  root.innerHTML = cards + marketButtons + '<div class="history-detail-card">'+rowsHtml+'</div>';
}
function setSmartBetHistoryMarket(market){
  SMARTBET_HISTORY_ACTIVE_MARKET = market;
  renderSmartBetHistory();
}



var ONBOARDING_STATE_KEY = 'bet_onboarding_state_v16';
var ONBOARDING_STEP = 0;
function getOnboardingState(){ try{ return JSON.parse(localStorage.getItem(ONBOARDING_STATE_KEY) || '{}'); }catch(err){ return {}; } }
function saveOnboardingState(state){ localStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state || {})); }
function getOnboardingSteps(){
  return [
    {title:'Bine ai venit în BetAnalytics Pro', sub:'Wizard-ul te ajută să înțelegi rapid ce vezi în aplicație și să pornești direct util.', body:function(){ return '<div class="onboarding-panel"><div class="onboarding-panel-title">Ce rezolvi aici</div><div class="onboarding-list"><div class="onboarding-item">📊 vezi meciuri analizate și recomandări clare<small>Meciuri, score, edge, value și fair odds.</small></div><div class="onboarding-item">🎫 generezi bilete și le urmărești în jurnal<small>Single, combo, manual din card și tracking.</small></div><div class="onboarding-item">🧠 folosești glosarul rapid când termenii devin prea tehnici<small>Edge, value, fair odds, xG și confidence.</small></div></div></div>'; }},
    {title:'Cum citești un card de meci', sub:'Cardul nou este gândit să-ți dea verdictul fără să te îngroape în text.', body:function(){ return '<div class="onboarding-panel"><div class="onboarding-panel-title">Ordinea corectă de citire</div><div class="onboarding-list"><div class="onboarding-item">1. UITĂ-TE LA RECOMANDARE<small>Piața, cota și scorul general.</small></div><div class="onboarding-item">2. UITĂ-TE LA PROBABILITATE + EDGE<small>Acolo vezi dacă pariul are logică matematică.</small></div><div class="onboarding-item">3. UITĂ-TE LA VALUE ȘI CONTEXT<small>Trend, scor probabil, xG și motivul principal.</small></div></div></div>'; }},
    {title:'Cum generezi un bilet', sub:'Poți folosi generatoarele sau poți construi unul manual direct din cardurile de meci.', body:function(){ return '<div class="onboarding-panel"><div class="onboarding-panel-title">2 fluxuri rapide</div><div class="onboarding-list"><div class="onboarding-item">🎯 Din tabul Bilete<small>Folosești generatoarele sau constructorul personalizat.</small></div><div class="onboarding-item">🧩 Dintr-un card de meci<small>Butonul „Adaugă în bilet” îl trimite instant în preview-ul activ.</small></div></div></div>'; }},
    {title:'Setări rapide inițiale', sub:'Alege stilul de joc și preferințele de bază. Le aplic imediat în filtre.', body:function(){ return '<div class="onboarding-panel"><div class="onboarding-panel-title">Profil & preferințe</div><div class="onboarding-form"><div><label>Profil</label><select id="ob-profile"><option value="safe">Safe</option><option value="balanced" selected>Balanced</option><option value="aggressive">Aggressive</option></select></div><div><label>Piață preferată</label><select id="ob-market"><option value="">Fără preferință</option><option value="Over 1.5G">Over 1.5G</option><option value="Under 3.5G">Under 3.5G</option><option value="BTTS">BTTS</option></select></div><div><label>Probabilitate minimă %</label><input id="ob-minprob" type="number" min="0" max="100" step="1" value="72"></div></div></div>'; }}
  ];
}
function renderOnboarding(){
  var steps = getOnboardingSteps();
  var step = steps[ONBOARDING_STEP] || steps[0];
  if($('onboarding-step-label')) $('onboarding-step-label').textContent = 'Pas ' + (ONBOARDING_STEP + 1) + ' / ' + steps.length;
  if($('onboarding-title')) $('onboarding-title').textContent = step.title;
  if($('onboarding-sub')) $('onboarding-sub').textContent = step.sub;
  if($('onboarding-body')) $('onboarding-body').innerHTML = step.body();
  if($('onboarding-progress')) $('onboarding-progress').innerHTML = steps.map(function(_, idx){ return '<div class="onboarding-dot'+(idx <= ONBOARDING_STEP ? ' active' : '')+'"></div>'; }).join('');
  if($('onboarding-back-btn')) $('onboarding-back-btn').style.visibility = ONBOARDING_STEP === 0 ? 'hidden' : 'visible';
  if($('onboarding-next-btn')) $('onboarding-next-btn').style.display = ONBOARDING_STEP === steps.length - 1 ? 'none' : 'inline-flex';
  if($('onboarding-finish-btn')) $('onboarding-finish-btn').style.display = ONBOARDING_STEP === steps.length - 1 ? 'inline-flex' : 'none';
}
function openOnboarding(force){
  var state = getOnboardingState();
  if(state.completed && !force) return;
  ONBOARDING_STEP = 0;
  var overlay = $('onboarding-overlay');
  if(overlay) overlay.classList.add('show');
  renderOnboarding();
}
function closeOnboarding(){ var overlay = $('onboarding-overlay'); if(overlay) overlay.classList.remove('show'); }
function nextOnboarding(){ var steps = getOnboardingSteps(); ONBOARDING_STEP = Math.min(steps.length - 1, ONBOARDING_STEP + 1); renderOnboarding(); }
function prevOnboarding(){ ONBOARDING_STEP = Math.max(0, ONBOARDING_STEP - 1); renderOnboarding(); }
function skipOnboarding(){ saveOnboardingState({completed:true, skippedAt:new Date().toISOString()}); closeOnboarding(); }
function applyOnboardingPrefs(){
  var profile = $('ob-profile') ? $('ob-profile').value : 'balanced';
  var market = $('ob-market') ? $('ob-market').value : '';
  var minProb = $('ob-minprob') ? Number($('ob-minprob').value || 72) : 72;
  if($('match-market-filter')) $('match-market-filter').value = market;
  if($('match-min-prob')) $('match-min-prob').value = minProb;
  if(profile === 'safe'){ if($('match-min-edge')) $('match-min-edge').value = 4; if($('match-min-score')) $('match-min-score').value = 82; if($('match-pro-mode')) $('match-pro-mode').value = 'pro'; }
  if(profile === 'balanced'){ if($('match-min-edge')) $('match-min-edge').value = 2; if($('match-min-score')) $('match-min-score').value = 76; }
  if(profile === 'aggressive'){ if($('match-min-edge')) $('match-min-edge').value = 0; if($('match-min-score')) $('match-min-score').value = 68; }
  try{ renderMatches(); }catch(err){}
}
function finishOnboarding(){ applyOnboardingPrefs(); saveOnboardingState({completed:true, completedAt:new Date().toISOString()}); closeOnboarding(); toast('Onboarding finalizat', 'ok'); switchTab('dashboard'); }
window.addEventListener('DOMContentLoaded', function(){ setTimeout(function(){ var state = getOnboardingState(); if(!state.completed) openOnboarding(false); }, 500); });

/* ===== Inline script block 2 ===== */
window.__FULL_HISTORY_LAZY_ASSETS__ = [
    './assets/full-history.js?v=20260418',
    './assets/full-history-hotfix.js?v=20260420hotfix2'
  ];

/* ===== Inline script block 3 ===== */
(function() {
'use strict';

/* ── 1. NUMBER COUNTER ANIMATION ─────────────────── */
function animateCount(el, target, duration) {
  if (!el || el._counting) return;
  var start = 0;
  var isFloat = String(target).includes('.');
  var decimals = isFloat ? (String(target).split('.')[1] || '').length : 0;
  var prefix = '', suffix = '';
  var raw = el.textContent.trim();
  // Detect suffix/prefix (%, ROI, etc.)
  var numMatch = raw.match(/([^0-9\.\-]*)([0-9\.\-]+)([^0-9]*)/);
  if (numMatch) { prefix = numMatch[1]; suffix = numMatch[3]; }
  el._counting = true;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    var current = start + (target - start) * ease;
    el.textContent = prefix + (isFloat ? current.toFixed(decimals) : Math.round(current)) + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else { el._counting = false; }
  }
  requestAnimationFrame(step);
}

function triggerCounters(root) {
  var els = (root || document).querySelectorAll(
    '.modern-kpi-value, .stat-num, .track-num, .bilet-cota, ' +
    '.history-summary-roi, .monitor-value, .modern-kpi-value'
  );
  els.forEach(function(el) {
    var txt = el.textContent.replace(/[^0-9\.\-]/g, '');
    var val = parseFloat(txt);
    if (!isNaN(val) && Math.abs(val) > 0) {
      el.style.animation = 'numberPop 0.4s ease forwards';
      animateCount(el, val, 900);
    }
  });
}

/* ── 2. CARD STAGGER ON TAB SWITCH ───────────────── */
var _origSwitch = window.switchTab;
window.switchTab = function(tabId) {
  if (_origSwitch) _origSwitch(tabId);
  setTimeout(function() {
    var content = document.getElementById('tab-' + tabId);
    if (!content) return;
    var cards = content.querySelectorAll(
      '.match-card, .bilet-card, .modern-kpi, .monitor-card, ' +
      '.stat-card, .track-stat, .audit-row, .memory-pattern-item, ' +
      '.match-card-v16, .history-summary-card, .cota2-panel'
    );
    cards.forEach(function(card, i) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(14px)';
      card.style.transition = 'none';
      setTimeout(function() {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 40 + i * 35);
    });
    triggerCounters(content);
  }, 80);
};

/* ── 3. SPARKLINES ON KPI CARDS ──────────────────── */
function addSparklines() {
  var kpis = document.querySelectorAll('.modern-kpi');
  kpis.forEach(function(kpi) {
    if (kpi.querySelector('.sparkline-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'sparkline-wrap';
    wrap.style.cssText = 'margin-top:10px;opacity:.7;';
    var bars = Math.floor(Math.random() * 3) + 7;
    var trend = Math.random() > 0.35; // 65% positive trend
    for (var i = 0; i < bars; i++) {
      var bar = document.createElement('div');
      bar.className = 'sparkline-bar' + ((!trend && i < bars * 0.4) ? ' negative' : '');
      var pct = 20 + Math.random() * 80;
      if (trend) pct = Math.min(100, 20 + (i / bars) * 60 + Math.random() * 25);
      bar.style.cssText = 'height:' + Math.round(pct) + '%;flex:1;transition:height 0.6s ease ' + (i * 0.06) + 's';
      wrap.appendChild(bar);
    }
    kpi.appendChild(wrap);
  });
}

/* ── 4. PROGRESS BAR ENTRANCE ────────────────────── */
function animateBars() {
  document.querySelectorAll('.mc-conf-bar-fill, .monitor-flow-fill, .visual-bar-fill').forEach(function(bar) {
    var w = bar.style.width;
    bar.style.width = '0';
    setTimeout(function() { bar.style.width = w; }, 200);
  });
}

/* ── 5. GLOW COLORS ON NUMBERS ───────────────────── */
function applyNumberGlows() {
  document.querySelectorAll('.modern-kpi-value, .bilet-cota, .live-score').forEach(function(el) {
    var txt = el.textContent;
    var val = parseFloat(txt.replace(/[^0-9\.\-]/g,''));
    if (!isNaN(val)) {
      if (txt.includes('%') && val > 50) el.classList.add('glow-green');
      else if (txt.includes('%') && val < 30) el.classList.add('glow-red');
    }
  });
  // Bilet odds
  document.querySelectorAll('.bilet-cota').forEach(function(el) {
    var val = parseFloat(el.textContent);
    if (val >= 3) el.classList.add('glow-amber');
    else if (val >= 1.8) el.classList.add('glow-teal');
  });
}

/* ── 6. GRADIENT BORDER ON WINNER CARDS ──────────── */
function applyGradientBorders() {
  document.querySelectorAll('.match-card-v16').forEach(function(card) {
    var prob = card.querySelector('.m16-team-prob');
    if (prob) {
      var val = parseFloat(prob.textContent);
      if (val >= 70) card.classList.add('gradient-border');
    }
  });
}

/* ── 7. TYPING EFFECT ON LOADER ──────────────────── */
var loaderSub = document.getElementById('loader-sub');
if (loaderSub) {
  var msgs = ['Conectare la API Bzzoiro...', 'Se calculează EV+...', 'Se aplică Poisson...', 'Se rulează Kelly...', 'Gata!'];
  var mi = 0;
  var loaderTimer = setInterval(function() {
    if (mi < msgs.length - 1) { mi++; if(loaderSub) loaderSub.textContent = msgs[mi]; }
    else clearInterval(loaderTimer);
  }, 900);
}

/* ── 8. INIT ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  // Initial animation
  setTimeout(function() {
    triggerCounters();
    addSparklines();
    animateBars();
    applyNumberGlows();
  }, 500);

  // Re-run after data loads (observe DOM changes)
  if (window.MutationObserver) {
    var observerTarget = document.getElementById('tab-dashboard') || document.getElementById('dashboard-grid') || document.body;
    var observerRuns = 0;
    var observerTimer = null;
    var observer = new MutationObserver(function(mutations) {
      var hasCards = mutations.some(function(m) {
        return Array.from(m.addedNodes).some(function(n) {
          return n.nodeType === 1 && (
            n.classList && (n.classList.contains('modern-kpi') || n.classList.contains('match-card-v16') || n.classList.contains('match-card'))
          );
        });
      });
      if (!hasCards) return;
      if (observerTimer) clearTimeout(observerTimer);
      observerTimer = setTimeout(function() {
        triggerCounters(observerTarget);
        addSparklines();
        animateBars();
        applyNumberGlows();
        applyGradientBorders();
        observerRuns += 1;
        if (observerRuns >= 2) observer.disconnect();
      }, 180);
    });
    observer.observe(observerTarget, { childList: true, subtree: true });
    setTimeout(function(){ try { observer.disconnect(); } catch(e){} }, 8000);
  }
});

})();

// ===== SmartBet Learning Engine — sub-nav switcher =====
window._smartLearnSection = 'audit';
function switchSmartLearnSection(section){
  window._smartLearnSection = section;
  ['predictii','invatare','arhiva','audit','aimemory','smartbet'].forEach(function(s){
    var sec = document.getElementById('smartlearn-section-' + s);
    var btn = document.getElementById('slt-' + s);
    if(sec) sec.style.display = (s === section) ? '' : 'none';
    if(btn) btn.classList.toggle('active', s === section);
  });
  if(section === 'predictii'){
    try{ renderUnifiedEngine(); }catch(e){console.warn(e);}
  }
  if(section === 'invatare'){
    try{ renderLearningEngine(); }catch(e){console.warn(e);}
  }
  if(section === 'arhiva'){
    try{ renderArchivePanel(); }catch(e){console.warn(e);}
    ensureArchiveSummaryData().then(function(){
      if(window._smartLearnSection !== 'arhiva') return;
      try{ renderArchivePanel(); }catch(e){ console.warn(e); }
    }).catch(function(err){
      console.warn('[ArchiveSummary] refresh failed', err);
    });
  }
  // backward compat — never shown but keep rendering for data
  if(section === 'audit'){ switchSmartLearnSection('predictii'); return; }
  if(section === 'aimemory'){ switchSmartLearnSection('predictii'); return; }
  window.scrollTo({top:0,behavior:'auto'});
}

/* ===== UNIFIED PREDICTION ENGINE ===== */
function calcUnifiedScore(row){
  var smart = Math.min(100, Math.max(0, Number(row.smartScore || 0)));
  var adaptive = Math.min(100, Math.max(0, Number(row.adaptiveScore || row.prob || 0)));
  var bonus = Math.max(0, Number(row.memoryBonus || 0)) * 4;
  var kellyBoost = Number(row.kelly_qtr || row.kelly || 0) > 3 ? 4 : (Number(row.kelly_qtr || row.kelly || 0) > 1.5 ? 2 : 0);
  var base = Math.min(100, Math.round(smart * 0.45 + adaptive * 0.40 + bonus + kellyBoost));

  // SmartBet Fusion v2: boost dacă avem WFV AUC validat pentru piața aceasta
  try {
    var v2pack = window.__SBV2_MODEL_PACK__ || (window.__SBV2__ && window.__SBV2__.modelPack);
    if(v2pack && v2pack.markets) {
      var mkt = row.market || row.bet_type || '';
      // mapare market → cheie v2
      var mktMap = {'over15':'over15','over25':'over25','under35':'under35',
                    'btts':'btts','home_win':'home_win','away_win':'away_win','draw':'draw',
                    'Over 1.5G':'over15','Over 2.5G':'over25','BTTS Yes':'btts'};
      var v2key = mktMap[mkt] || mkt.toLowerCase().replace(/[^a-z0-9]/g,'_');
      var v2m   = v2pack.markets[v2key];
      if(v2m && v2m.wfv_avg_auc) {
        var auc  = Number(v2m.wfv_avg_auc);
        var ece  = Number(v2m.test_ece || 0.05);
        // Bonus proporțional cu calitatea modelului: AUC 0.67 → +5, AUC 0.70 → +8
        var v2boost = Math.round(Math.max(0, (auc - 0.55) / 0.15 * 10) * (1 - ece * 5));
        base = Math.min(100, base + v2boost);
      }
    }
  } catch(e){}

  return base;
}

function unifiedScoreColor(score){
  if(score >= 85) return 'var(--grn)';
  if(score >= 70) return 'var(--acc)';
  if(score >= 58) return 'var(--yel)';
  return 'var(--red)';
}

function unifiedScoreLabel(score){
  if(score >= 85) return '🟢 Maxim';
  if(score >= 70) return '🔵 Ridicat';
  if(score >= 58) return '🟡 Moderat';
  return '🔴 Slab';
}

function renderUnifiedEngine(){
  var summary = document.getElementById('unified-summary-grid');
  var list = document.getElementById('unified-picks-list');
  var updated = document.getElementById('unified-updated');
  var meta = document.getElementById('unified-list-meta');
  if(!summary || !list) return;

  // Injectare SmartBet v2 model info în header dacă e disponibil
  (function(){
    var v2pack = window.__SBV2_MODEL_PACK__ || null;
    var v2info = document.getElementById('unified-v2-badge');
    if(!v2info) {
      v2info = document.createElement('div');
      v2info.id = 'unified-v2-badge';
      if(summary && summary.parentNode) summary.parentNode.insertBefore(v2info, summary);
    }
    if(v2pack && v2pack.version === 'smartbet-fusion-v2') {
      var mkts   = v2pack.markets || {};
      var aucs   = Object.values(mkts).map(function(m){ return m.wfv_avg_auc; }).filter(Boolean);
      var avgAUC = aucs.length ? (aucs.reduce(function(a,b){return a+b;},0)/aucs.length).toFixed(3) : '—';
      var featN  = v2pack.feature_count || '—';
      var mktsN  = Object.keys(mkts).length;
      var upd    = v2pack.updated_at ? v2pack.updated_at.slice(0,10) : '—';
      v2info.innerHTML =
        '<div style="margin-bottom:10px;padding:10px 14px;border-radius:14px;' +
        'background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(16,185,129,.08));' +
        'border:1px solid rgba(99,102,241,.25);display:flex;flex-wrap:wrap;gap:10px;align-items:center">' +
          '<span style="font-size:13px;font-weight:900;color:var(--acc)">⚡ SmartBet Fusion v2</span>' +
          '<span style="font-size:11px;color:var(--muted)">CatBoost calibrat</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--grn)">WFV AUC ' + avgAUC + '</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--cyan)">' + featN + ' features</span>' +
          '<span style="font-size:12px;font-weight:700;color:var(--pur)">' + mktsN + ' piețe</span>' +
          '<span style="font-size:11px;color:var(--muted);margin-left:auto">' + upd + '</span>' +
        '</div>';
    } else {
      v2info.innerHTML = '';
    }
  })();

  var analysis = getSmartBetAnalysis ? getSmartBetAnalysis() : {pool:[],blocked:[]};
  var pool = (analysis.pool || []).map(function(row){
    return Object.assign({}, row, {_unifiedScore: calcUnifiedScore(row)});
  }).sort(function(a,b){ return b._unifiedScore - a._unifiedScore; });
  var blocked = analysis.blocked || [];

  if(updated){
    var ts = (typeof AI_MEMORY !== 'undefined' && AI_MEMORY && AI_MEMORY.updated_at) ||
             (typeof SIGNAL_AUDIT !== 'undefined' && SIGNAL_AUDIT && SIGNAL_AUDIT.updated_at) ||
             (typeof APP_META !== 'undefined' && APP_META && APP_META.updated_at) || '';
    updated.textContent = ts ? ('Actualizat: ' + (typeof fmtDateTime === 'function' ? fmtDateTime(ts) : ts)) : '—';
  }
  if(meta) meta.textContent = pool.length + ' predicții validate';

  // Sursă unică de adevăr — citită de hybrid_adaptive_runtime și full-history
  window.__UNIFIED_POOL_COUNT__ = pool.length;

  var avgScore = pool.length ? Math.round(pool.reduce(function(a,r){ return a + r._unifiedScore; },0) / pool.length) : 0;
  var avgProb = pool.length ? pool.reduce(function(a,r){ return a + Number(r.prob||0); },0) / pool.length : 0;
  var avgEdge = pool.length ? pool.reduce(function(a,r){ return a + Number(r.edge||0); },0) / pool.length : 0;
  var topCount = pool.filter(function(r){ return r._unifiedScore >= 85; }).length;

  summary.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">' +
    [
      {label:'Predicții validate', value: String(pool.length), sub:'trecute prin 3 filtre', color:'var(--acc)'},
      {label:'Scor Unificat mediu', value: pool.length ? avgScore : '—', sub:'0-100, combină toate sursele', color:'var(--pur)'},
      {label:'Top acuratețe ≥85', value: String(topCount), sub:'cele mai sigure selecții', color:'var(--grn)'},
      {label:'Probabilitate medie', value: pool.length ? (typeof fmtPct==='function' ? fmtPct(avgProb) : avgProb.toFixed(1)+'%') : '—', sub:'probabilitate ajustată medie', color:'var(--cyan)'},
      {label:'Edge mediu', value: pool.length ? (typeof fmtSignedPct==='function' ? fmtSignedPct(avgEdge) : (avgEdge>=0?'+':'')+avgEdge.toFixed(1)+'%') : '—', sub:'avantaj model vs piață', color:'var(--yel)'},
    ].map(function(c){
      return '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
        '<div style="font-size:11px;color:var(--muted);font-weight:700">'+c.label+'</div>' +
        '<div style="font-size:22px;font-weight:900;margin-top:6px;color:'+c.color+'">'+c.value+'</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.35">'+c.sub+'</div>' +
        '</div>';
    }).join('') + '</div>';

  if(!pool.length){
    list.innerHTML = '<div class="empty-state">Nicio predicție nu trece simultan filtrul Kelly, AI Memory și SmartBet în acest refresh. Revino după actualizarea datelor.</div>';
    return;
  }

  list.innerHTML = pool.map(function(r, idx){
    var score = r._unifiedScore;
    var scoreColor = unifiedScoreColor(score);
    var scoreLabel = unifiedScoreLabel(score);
    var kellyStr = r.kelly_qtr ? Number(r.kelly_qtr).toFixed(1)+'%' : (r.kelly ? Number(r.kelly).toFixed(1)+'%' : '—');
    var probStr = r.prob ? (typeof fmtPct==='function' ? fmtPct(r.prob) : Number(r.prob).toFixed(1)+'%') : '—';
    var edgeStr = r.edge != null ? ((Number(r.edge)>=0?'+':'')+Number(r.edge).toFixed(1)+'%') : '—';
    var marketLabel = typeof smartBetMarketLabel==='function' ? smartBetMarketLabel(r.marketKey, r) : (r.marketKey || r.market || '—');
    var odds = Number(r.displayOdds || r.odds || 0);
    var patternCount = (r.patternKeys && r.patternKeys.length) || 0;
    var memBonus = Number(r.memoryBonus || 0);
    return '<div style="margin-bottom:10px;padding:12px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-left:3px solid '+scoreColor+'">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">' +
            '<span style="font-size:11px;font-weight:900;color:var(--muted);opacity:.7">#'+(idx+1)+'</span>' +
            '<span style="font-size:13px;font-weight:800;color:var(--txt)">'+(r.home||'—')+' vs '+(r.away||'—')+'</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">'+(r.league||'—')+' • '+(r.event_date?(typeof fmtDate==='function'?fmtDate(r.event_date)+' '+fmtTime(r.event_date):r.event_date):'—')+'</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.07);color:var(--txt)">'+marketLabel+' @ '+odds.toFixed(2)+'</span>' +
            '<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.05);color:var(--muted)">Kelly '+kellyStr+'</span>' +
            '<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.05);color:var(--muted)">Prob '+probStr+'</span>' +
            '<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.05);color:var(--muted)">Edge '+edgeStr+'</span>' +
            (patternCount>0?'<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(16,185,129,.1);color:var(--grn)">'+patternCount+' pattern'+(patternCount>1?'s':'')+' confirmat'+(patternCount>1?'e':'')+'</span>':'') +
            (r.signalStrong?'<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(234,179,8,.1);color:var(--yel)">📊 Semnal audit</span>':'') +
            (memBonus>0?'<span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(99,102,241,.1);color:#a5b4fc">bonus +'+memBonus.toFixed(1)+'</span>':'') +
          '</div>' +
        '</div>' +
        '<div style="text-align:center;min-width:58px;padding:8px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)">' +
          '<div style="font-size:24px;font-weight:900;color:'+scoreColor+';line-height:1">'+score+'</div>' +
          '<div style="font-size:9px;color:var(--muted);margin-top:4px;font-weight:700">SCOR</div>' +
          '<div style="font-size:9px;margin-top:2px;color:'+scoreColor+'">'+scoreLabel.split(' ')[0]+'</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

var UNIFIED_TICKETS = {safe:null, balanced:null, value:null};
function generateUnifiedTicket(type){
  // use existing SmartBet ticket builder under the hood
  if(typeof buildSmartBetTicket === 'function'){
    UNIFIED_TICKETS[type] = buildSmartBetTicket(type, false);
    if(!UNIFIED_TICKETS[type] || !(UNIFIED_TICKETS[type].picks||[]).length){
      UNIFIED_TICKETS[type] = buildSmartBetTicket(type, true); // relaxed
    }
  }
  renderUnifiedTicket(type);
}

function renderUnifiedTicket(type){
  var out = document.getElementById('unified-ticket-output');
  if(!out) return;
  var ticket = UNIFIED_TICKETS[type];
  if(!ticket){
    // try to show last available
    ticket = UNIFIED_TICKETS.safe || UNIFIED_TICKETS.balanced || UNIFIED_TICKETS.value;
  }
  if(!ticket || !(ticket.picks||[]).length){
    out.innerHTML = '<div class="empty-state" style="font-size:12px">Apasă pe un buton pentru a genera biletul.</div>';
    return;
  }
  var picks = ticket.picks || [];
  var totalOdds = picks.reduce(function(a,p){ return a * Number(p.displayOdds||p.odds||1); }, 1);
  var labelColor = type==='safe' ? 'var(--grn)' : (type==='balanced' ? '#a5b4fc' : 'var(--yel)');
  out.innerHTML = '<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)">' +
    '<div style="font-size:13px;font-weight:800;color:'+labelColor+';margin-bottom:10px">'+ticket.label+'</div>' +
    picks.map(function(p){
      var marketLabel = typeof smartBetMarketLabel==='function' ? smartBetMarketLabel(p.marketKey,p) : (p.marketKey||p.market||'—');
      return '<div style="margin-bottom:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">' +
        '<div style="font-size:12px;font-weight:700;color:var(--txt)">'+(p.home||'—')+' vs '+(p.away||'—')+'</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+marketLabel+' @ '+Number(p.displayOdds||p.odds||0).toFixed(2)+'</div>' +
        '</div>';
    }).join('') +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)">' +
      '<span style="font-size:11px;color:var(--muted)">'+picks.length+' selecții</span>' +
      '<span style="font-size:14px;font-weight:900;color:'+labelColor+'">@ '+totalOdds.toFixed(2)+'</span>' +
    '</div>' +
  '</div>';
}

/* ===== ARCHIVE PANEL (combined 3 historic sources) ===== */
function renderArchivePanel(){
  var cards = document.getElementById('archive-summary-cards');
  var impact = document.getElementById('archive-learning-impact');
  if(!cards) return;

  var summary = ARCHIVE_SUMMARY_STATE || {};
  var summaryLoaded = !!summary.loaded;
  var mem = summary.aiMemory || ((typeof AI_MEMORY!=='undefined' && AI_MEMORY) ? AI_MEMORY : {});
  var memSum = mem.summary || {};
  var fullMeta = summary.fullMeta || ((typeof W!=='undefined' && W.FULL_HISTORY_META) ? W.FULL_HISTORY_META : (window.FULL_HISTORY_META || {}));
  var apiSum = summary.apiSummary || ((typeof W!=='undefined' && W.API_HISTORY_SUMMARY) ? W.API_HISTORY_SUMMARY : (window.API_HISTORY_SUMMARY || {}));
  var apiEventsSum = summary.apiEventsSummary || ((typeof W!=='undefined' && W.API_EVENTS_HISTORY_SUMMARY) ? W.API_EVENTS_HISTORY_SUMMARY : (window.API_EVENTS_HISTORY_SUMMARY || {}));
  var apiValid = apiSum.valid || {};
  var trainSum = summary.trainSum || ((typeof W!=='undefined' && W.TRAINING_DATASET_SUMMARY) ? W.TRAINING_DATASET_SUMMARY : (window.TRAINING_DATASET_SUMMARY || {}));
  var trainModel = summary.trainModel || ((typeof W!=='undefined' && W.TRAINING_MODEL_SUMMARY) ? W.TRAINING_MODEL_SUMMARY : (window.TRAINING_MODEL_SUMMARY || {}));
  var baselines = summary.baselines || ((typeof TRAINING_MARKET_BASELINES!=='undefined' && TRAINING_MARKET_BASELINES) ? TRAINING_MARKET_BASELINES : (window.TRAINING_MARKET_BASELINES || []));

  if(!summaryLoaded && ARCHIVE_SUMMARY_LOADING){
    renderArchiveSummarySkeleton();
    return;
  }

  function fmtN(v){ var n=Number(v); return Number.isFinite(n) ? n.toLocaleString('ro-RO') : '—'; }
  function firstFinite(){
    for(var i=0; i<arguments.length; i++){
      var n = Number(arguments[i]);
      if(Number.isFinite(n)) return n;
    }
    return 0;
  }
  function countReadyMarkets(){
    if(Array.isArray(trainModel.markets) && trainModel.markets.length){
      return trainModel.markets.filter(function(m){ return m && (m.ready === true || Number(m.rows || 0) > 0); }).length;
    }
    if(Array.isArray(trainSum.markets_ready) && trainSum.markets_ready.length) return trainSum.markets_ready.length;
    return 0;
  }

  var apiIndexedMatches = firstFinite(
    apiEventsSum && apiEventsSum.total_events_counted,
    apiEventsSum && apiEventsSum.total_matches,
    apiSum && apiSum.events_summary && apiSum.events_summary.total_events_counted,
    apiSum && apiSum.valid && apiSum.valid.total_events
  );
  var calibratedMarketsCount = countReadyMarkets();

  var hasSummaryData = !!(summaryLoaded || Number(fullMeta.journal_rows || 0) || Number((apiValid||{}).leagues_total || 0) || Number((trainSum||{}).rows_total || 0) || (baselines || []).length || Number((memSum||{}).settled_bets || 0));
  if(!hasSummaryData){
    renderArchiveSummarySkeleton();
    return;
  }

  var cardData = [
    {
      emoji:'📋', title:'Jurnal Aplicație',
      value: fmtN(fullMeta.journal_rows || 0) + ' înregistrări',
      sub: fmtN(fullMeta.history_rows||0) + ' cu rezultat • ' + fmtN(fullMeta.lookback_days||0) + ' zile',
      role:'Istoricul biletelor generate — sursa principală pentru calculul ROI și pattern-urile de win/loss.',
      color:'rgba(16,185,129,.15)', border:'rgba(16,185,129,.25)'
    },
    {
      emoji:'🌐', title:'Baza Istorică API',
      value: fmtN(apiValid.leagues_total||0) + ' ligi • ' + fmtN(apiValid.seasons_total||0) + ' sezoane',
      sub: fmtN(apiIndexedMatches) + ' meciuri indexate',
      role:'Datele brute din BSD API — calibrează probabilitățile și ajustează cotele fair pe fiecare piață.',
      color:'rgba(99,102,241,.12)', border:'rgba(99,102,241,.25)'
    },
    (function(){
      var v2pack = window.__SBV2_MODEL_PACK__ || ARCHIVE_SUMMARY_STATE.modelPackV2 || null;
      var v2meta = window.__SBV2_META__       || ARCHIVE_SUMMARY_STATE.sbMetaV2   || null;
      var v2sys  = v2meta && v2meta.system ? v2meta.system : null;
      if(v2pack && v2pack.version === 'smartbet-fusion-v2') {
        var mkts    = v2pack.markets || {};
        var aucs    = Object.values(mkts).map(function(m){ return m.wfv_avg_auc; }).filter(Boolean);
        var avgAUC  = aucs.length ? (aucs.reduce(function(a,b){return a+b;},0)/aucs.length).toFixed(3) : '—';
        var featN   = v2pack.feature_count || (v2sys && v2sys.feature_count) || '—';
        var trainN  = v2sys ? v2sys.training_rows : (trainSum.rows_total||0);
        var updDate = v2pack.updated_at ? v2pack.updated_at.slice(0,10) : '—';
        return {
          emoji:'🤖', title:'Model AI + Patterns',
          value: fmtN(trainN) + ' rows antrenament',
          sub: fmtN(Object.keys(mkts).length) + ' piețe CatBoost • ' + featN + ' features • WFV AUC avg ' + avgAUC,
          role:'SmartBet Fusion v2 — CatBoost calibrat pe ' + fmtN(trainN) + ' meciuri reale, ' + fmtN(featN) + ' features, walk-forward validation, actualizat ' + updDate + '.',
          color:'rgba(245,158,11,.10)', border:'rgba(245,158,11,.22)'
        };
      }
      return {
        emoji:'🤖', title:'Model AI + Patterns',
        value: fmtN(trainSum.rows_total||0) + ' rows antrenament',
        sub: fmtN((trainModel.rows_eligible_min5||trainSum.rows_ready)||0) + ' ready • ' + fmtN(calibratedMarketsCount) + ' piețe calibrate',
        role:'Modelul statistic și pattern-urile învățate — ajustează scorul fiecărui pick cu bonus/penalizare din memorie.',
        color:'rgba(245,158,11,.10)', border:'rgba(245,158,11,.22)'
      };
    })()
  ];

  cards.innerHTML = cardData.map(function(c){
    return '<div style="padding:14px;border-radius:16px;background:'+c.color+';border:1px solid '+c.border+'">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:20px">'+c.emoji+'</span>' +
        '<div style="font-size:13px;font-weight:800;color:var(--txt)">'+c.title+'</div>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:900;color:var(--txt);margin-bottom:4px">'+c.value+'</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">'+c.sub+'</div>' +
      '<div style="font-size:11px;line-height:1.55;color:var(--muted);padding-top:8px;border-top:1px solid rgba(255,255,255,.07)"><b style="color:var(--txt)">Rol în motor:</b> '+c.role+'</div>' +
    '</div>';
  }).join('');

  if(impact){
    var adaptivePicks = Array.isArray(mem.adaptive_picks) ? mem.adaptive_picks.length : firstFinite(memSum.pending_scored, memSum.adaptive_picks_journal_adjusted);
    var posPatterns = firstFinite(
      memSum.positive_patterns,
      Array.isArray(mem.positive_patterns) ? mem.positive_patterns.length : undefined,
      Array.isArray(mem.top_patterns) ? mem.top_patterns.length : undefined
    );
    var negPatterns = firstFinite(
      memSum.negative_patterns,
      Array.isArray(mem.negative_patterns) ? mem.negative_patterns.length : undefined,
      Array.isArray(mem.avoid_patterns) ? mem.avoid_patterns.length : undefined
    );
    var settledROI = Number(memSum.settled_roi||0);
    impact.innerHTML = '<div style="padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)">' +
      '<div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">⚡ Impact direct al arhivei asupra motorului</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">' +
        ['Picks adaptive: '+adaptivePicks, 'Patterns pozitive: '+posPatterns, 'Patterns negative: '+negPatterns,
         'ROI validat: '+(settledROI>=0?'+':'')+settledROI.toFixed(2)+'%',
         'Piețe calibrate: '+fmtN(calibratedMarketsCount),
         'Settled bets: '+fmtN(memSum.settled_bets||0)
        ].map(function(txt){
          return '<div style="padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);font-size:12px;font-weight:700;color:var(--txt)">'+txt+'</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }
}

// Expose on window so full-history.js can call after data loads
window.renderArchivePanel = renderArchivePanel;
window.renderUnifiedEngine = renderUnifiedEngine;

// Auto-render unified engine only if SmartBet is the initial active tab
document.addEventListener('DOMContentLoaded', function(){
  var smartTab = document.getElementById('tab-smartbet');
  if(!(smartTab && smartTab.classList.contains('active'))) return;
  var checkInterval = setInterval(function(){
    if(typeof getSmartBetAnalysis === 'function' && typeof AI_MEMORY !== 'undefined'){
      clearInterval(checkInterval);
      try { renderUnifiedEngine(); } catch(e){}
    }
  }, 500);
  setTimeout(function(){ clearInterval(checkInterval); }, 8000);
});

// Dashboard renderers dezactivate — conținut va fi construit manual ulterior.
(function(){
  'use strict';
  window.__BA_DASHBOARD_REMOVED = true;
  var names = [
    'renderModernDashboard','renderDashboardTab','renderDashboard','renderDashboardStats',
    'renderDashboardVisuals','renderDashboardMonitor','renderTodayBest','renderTopPicks',
    'renderTopSafe','renderFocusPanel','renderMarketPerformance','renderBacktestSummary'
  ];
  names.forEach(function(name){
    try { window[name] = function(){ return null; }; } catch(e) {}
  });
})();

