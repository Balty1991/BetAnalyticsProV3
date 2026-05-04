(()=>{
const W=window;
const $=id=>document.getElementById(id);
const arr=v=>Array.isArray(v)?v:[];
const norm=s=>String(s||'').toLowerCase().trim();
const num=s=>{const m=String(s||'').match(/-?\d+(?:\.\d+)?/g);return m&&m.length?Number(m[m.length-1]):0;};
const n=v=>Number(v||0);
const esc=s=>String(s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
const fmtPctSafe=v=>typeof W.fmtPct==='function'?W.fmtPct(n(v)):(n(v).toFixed(2)+'%');
const fmtSignedPctSafe=v=>typeof W.fmtSignedPct==='function'?W.fmtSignedPct(n(v)):(`${n(v)>=0?'+':''}${n(v).toFixed(2)}%`);
const fmtDateSafe=v=>typeof W.fmtDate==='function'?W.fmtDate(v):String(v||'').slice(0,10);
const fmtTimeSafe=v=>typeof W.fmtTime==='function'?W.fmtTime(v):'';
let skipped=[];

async function loadSkipped(){
  const paths=['./data/api_events_history_skipped_no_data.json','data/api_events_history_skipped_no_data.json','/BetAnalyticsProV3/data/api_events_history_skipped_no_data.json'];
  for(const p of paths){
    try{
      const r=await fetch(p+'?v=20260420hotfix2',{cache:'no-store'});
      if(r.ok){ skipped=arr(await r.json()); return; }
    }catch(e){}
  }
  const summaryPaths=['./data/api_events_history_summary.json','data/api_events_history_summary.json','/BetAnalyticsProV3/data/api_events_history_summary.json'];
  for(const p of summaryPaths){
    try{
      const r=await fetch(p+'?v=20260420hotfix2',{cache:'no-store'});
      if(r.ok){
        const json=await r.json();
        skipped=arr(json && json.skipped_no_data_preview);
        return;
      }
    }catch(e){}
  }
}

function isSkippedText(text){
  const t=norm(text);
  return skipped.some(x=>t.includes(norm(x.league)) && t.includes(norm(x.season_name)));
}

function runApiHistoryCleanup(){
  const tab=$('tab-apihistory');
  if(!tab) return;
  tab.querySelectorAll('table tbody').forEach(tbody=>{
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      const tds=tr.querySelectorAll('td');
      if(tds.length<6) return;
      const events=num(tds[4]&&tds[4].textContent);
      const sample=num(tds[5]&&tds[5].textContent);
      if(events<=0 || sample<=0) tr.remove();
    });
  });
  if(skipped.length){
    [...tab.querySelectorAll('div')].forEach(el=>{
      const style=String(el.getAttribute('style')||'');
      if(style.indexOf('245,158,11')===-1) return;
      if(isSkippedText(el.textContent||'')) el.remove();
    });
  }
}

function patchSmartBetAnalysis(){
  if(W.__smartbetRoiPatchApplied) return;
  if(typeof W.getSmartBetAnalysis!=='function') return;
  const oldGet = W.getSmartBetAnalysis;

  W.getSmartBetAnalysis = function(){
    const analysis = oldGet();
    if(!analysis || !arr(analysis.pool).length) return analysis;
    const adaptiveMap = typeof W.getSmartBetAdaptiveMap==='function' ? W.getSmartBetAdaptiveMap() : {};
    const originalBlocked = arr(analysis.blocked).slice();
    const pool = [];
    let hardBlocked = 0;

    arr(analysis.pool).forEach(function(r){
      const key1 = String(r.event_id || '') + '|' + String(r.marketKey || '');
      const key2 = [String(r.home || '').toLowerCase(), String(r.away || '').toLowerCase(), String(r.marketKey || '')].join('|');
      const adaptive = adaptiveMap[key1] || adaptiveMap[key2] || {};
      const journalMem = adaptive.journal_memory_bonus != null ? n(adaptive.journal_memory_bonus) : 0;
      const learningState = adaptive.learning_state || (journalMem >= 2.5 ? 'accelerating' : (journalMem <= -2.5 ? 'cautious' : 'stable'));
      const patternRoi = n(r.bestPositivePattern && r.bestPositivePattern.roi || 0);
      const patternSample = n(r.bestPositivePattern && r.bestPositivePattern.raw_bets || 0);
      const valuePct = n(r.value || 0) * 100;
      const roiPriority = n(r.smartScore || 0)
        + Math.max(0, journalMem) * 1.6
        + Math.max(0, patternRoi) * 0.14
        + Math.max(0, n(r.edge || 0)) * 0.45
        + Math.max(0, valuePct) * 0.28
        - Math.max(0, -journalMem) * 2.1
        - (learningState === 'cautious' ? 8 : 0)
        - ((patternRoi < -10 && patternSample >= 5) ? 6 : 0);

      const shouldBlock =
        (learningState === 'cautious' && journalMem <= -2.5 && n(r.edge || 0) < 6) ||
        (!r.directAdaptive && patternRoi < -10 && patternSample >= 5) ||
        (n(r.memoryBonus || 0) <= -6 && n(r.edge || 0) < 7);

      if(shouldBlock){
        hardBlocked += 1;
        originalBlocked.push({ row:r, reason:{ label:'ROI-first prune', memory_score:journalMem, roi:patternRoi, raw_bets:patternSample }, marketKey:r.marketKey });
        return;
      }

      pool.push(Object.assign({}, r, {
        roiPriority: +roiPriority.toFixed(2),
        journalMemoryBonus: journalMem,
        learningState: learningState,
      }));
    });

    pool.sort((a,b)=>{
      if(n(b.roiPriority||0) !== n(a.roiPriority||0)) return n(b.roiPriority||0) - n(a.roiPriority||0);
      if(n(b.smartScore||0) !== n(a.smartScore||0)) return n(b.smartScore||0) - n(a.smartScore||0);
      return n(b.edge||0) - n(a.edge||0);
    });

    const diversified = [];
    const perMarket = {};
    let diversificationPruned = 0;
    pool.forEach(function(r){
      const mk = String(r.marketKey || 'na');
      const cap = mk === 'btts' || mk === 'over25' ? 2 : 3;
      if(perMarket[mk] >= cap && pool.length > 5){
        diversificationPruned += 1;
        return;
      }
      diversified.push(r);
      perMarket[mk] = (perMarket[mk] || 0) + 1;
    });

    analysis.pool = diversified;
    analysis.blocked = originalBlocked;
    analysis.roiFocus = {
      hardBlocked: hardBlocked,
      diversificationPruned: diversificationPruned,
      kept: diversified.length,
    };
    return analysis;
  };

  W.__smartbetRoiPatchApplied = 1;
}

function patchSmartBet(){
  if(W.__smartbetLearningPatchApplied) return;
  if(typeof W.renderSmartBet!=='function' || typeof W.getSmartBetAnalysis!=='function') return;

  W.renderSmartBet = function(){
    var summary = $('smartbet-summary-grid');
    var list = $('smartbet-list');
    var updated = $('smartbet-updated');
    var meta = $('smartbet-list-meta');
    if(!summary || !list) return;

    var analysis = W.getSmartBetAnalysis();
    var pool = analysis.pool || [];
    var blocked = analysis.blocked || [];
    var roiFocus = analysis.roiFocus || {};
    var adaptiveMap = typeof W.getSmartBetAdaptiveMap==='function' ? W.getSmartBetAdaptiveMap() : {};
    var aiSummary = (W.AI_MEMORY && W.AI_MEMORY.summary) || {};
    var journalLearning = (W.AI_MEMORY && W.AI_MEMORY.journal_learning) || {};

    if(typeof W.syncSmartBetHistoryJournal==='function') W.syncSmartBetHistoryJournal(pool);

    if(updated){
      var ts = (W.AI_MEMORY && W.AI_MEMORY.updated_at) || (W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.updated_at) || (W.APP_META && W.APP_META.updated_at) || '';
      updated.textContent = ts ? ('SmartBet actualizat: ' + (typeof W.fmtDateTime==='function' ? W.fmtDateTime(ts) : ts)) : 'SmartBet: —';
    }
    if(meta) meta.textContent = pool.length + ' validate • ' + blocked.length + ' blocate • ' + (journalLearning.rows_settled || aiSummary.journal_rows_settled || 0) + ' rows jurnal • prune ROI ' + (n(roiFocus.hardBlocked||0) + n(roiFocus.diversificationPruned||0));

    var avgScore = pool.length ? (pool.reduce((acc,row)=>acc + n(row.smartScore || 0),0) / pool.length) : 0;
    var avgEdge = pool.length ? (pool.reduce((acc,row)=>acc + n(row.edge || 0),0) / pool.length) : 0;
    var avgValue = pool.length ? (pool.reduce((acc,row)=>acc + n(row.value || 0) * 100,0) / pool.length) : 0;
    var avgProb = pool.length ? (pool.reduce((acc,row)=>acc + n(row.prob || 0),0) / pool.length) : 0;

    var cards = [
      {label:'Validate', value:String(pool.length), sub:'trecute prin audit + memorie', color:'var(--acc)'},
      {label:'Blocate', value:String(blocked.length), sub:'respinse de pattern negativ / ROI', color:'var(--red)'},
      {label:'Smart score', value:pool.length ? avgScore.toFixed(1) : '—', sub:'media scorului final', color:'var(--pur)'},
      {label:'Prob. medie', value:pool.length ? fmtPctSafe(avgProb) : '—', sub:'probabilitate ajustată medie', color:'var(--grn)'},
      {label:'Rows jurnal', value:String(journalLearning.rows_settled || aiSummary.journal_rows_settled || 0), sub:'istoric real folosit la learning', color:'var(--cyan)'},
      {label:'Pattern-uri', value:(journalLearning.positive_patterns || 0)+' / '+(journalLearning.negative_patterns || 0), sub:'pozitive / negative din jurnal', color:'var(--yel)'},
      {label:'Edge mediu', value:pool.length ? fmtSignedPctSafe(avgEdge) : '—', sub:'avantaj model vs piață', color:'var(--yel)'},
      {label:'Value mediu', value:pool.length ? fmtSignedPctSafe(avgValue) : '—', sub:'EV mediu rămas în pool', color:'var(--cyan)'}
    ];
    summary.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">'+ cards.map(card=>typeof W.smartBetSafeCell==='function'?W.smartBetSafeCell(card, card.color):('<div style="padding:8px 10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.03)"><div style="font-size:10px;color:var(--muted);margin-bottom:3px">'+esc(card.label)+'</div><div style="font-size:15px;font-weight:800;color:'+card.color+'">'+esc(card.value)+'</div><div style="font-size:9px;color:var(--muted);margin-top:3px;line-height:1.35">'+esc(card.sub)+'</div></div>')).join('') + '</div>';

    if(!pool.length){
      list.innerHTML = '<div class="empty-state">În acest refresh nu există selecții care să treacă simultan filtrul Audit Kelly și validarea AI Memory.</div>';
      if(typeof W.renderSmartBetPatternLists==='function') W.renderSmartBetPatternLists(analysis);
      if(typeof W.setSmartBetView==='function') W.setSmartBetView(W.SMARTBET_VIEW || 'live');
      return;
    }

    list.innerHTML = pool.map(function(r, idx){
      var key1 = String(r.event_id || '') + '|' + (r.marketKey || '');
      var key2 = [String(r.home || '').toLowerCase(), String(r.away || '').toLowerCase(), (r.marketKey || '')].join('|');
      var adaptive = adaptiveMap[key1] || adaptiveMap[key2] || {};
      var baseMem = adaptive.base_memory_bonus != null ? n(adaptive.base_memory_bonus) : n(r.memoryBonus || 0);
      var journalMem = adaptive.journal_memory_bonus != null ? n(adaptive.journal_memory_bonus) : n(r.journalMemoryBonus || 0);
      var totalMem = adaptive.memory_bonus != null ? n(adaptive.memory_bonus) : n(r.memoryBonus || 0);
      var adaptiveScore = adaptive.adaptive_score != null ? n(adaptive.adaptive_score) : n(r.adaptiveScore || 0);
      var learningState = adaptive.learning_state || r.learningState || (journalMem >= 2.5 ? 'accelerating' : (journalMem <= -2.5 ? 'cautious' : 'stable'));
      var learningColor = learningState === 'accelerating' ? 'var(--grn)' : (learningState === 'cautious' ? 'var(--red)' : 'var(--acc)');
      var valuePct = n(r.value || 0) * 100;
      var reasons = arr(adaptive.reasons || r.aiReasons || []).slice(0,4);
      var reasonHtml = reasons.length ? '<div style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">'+reasons.map(function(rr){ return '<div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px"><span style="color:var(--txt);font-weight:700">'+esc(rr.label || 'motiv')+'</span>' + (rr.impact!=null ? ' • <span style="color:'+(n(rr.impact)>=0?'var(--grn)':'var(--red)')+'">'+(n(rr.impact)>=0?'+':'')+n(rr.impact).toFixed(2)+'</span>' : '') + (rr.bets!=null ? ' • '+esc(String(rr.bets))+' beturi' : '') + (rr.roi!=null ? ' • ROI '+fmtSignedPctSafe(rr.roi) : '') + '</div>'; }).join('') + '</div>' : '';
      return '<div class="audit-row" style="margin-bottom:10px">'+
        '<div class="audit-row-header">'+
          '<div class="audit-row-main">'+
            '<div class="audit-row-titleline"><span class="audit-row-rank">#'+(idx+1)+'</span><div class="audit-row-teams">'+esc(r.home || '—')+' vs '+esc(r.away || '—')+'</div></div>'+
            '<div class="audit-row-meta">'+esc(r.league || '—')+' • '+(r.event_date ? (fmtDateSafe(r.event_date)+' • '+fmtTimeSafe(r.event_date)) : '—')+' • '+esc(r.directAdaptive ? 'AI direct + jurnal' : 'Pattern confirmat + jurnal')+'</div>'+
          '</div>'+
          '<div class="audit-pick-box">'+
            '<div class="audit-pick-label">SmartBet pick</div>'+
            '<div class="audit-pick-value">'+(typeof W.smartBetMarketLabel==='function'?W.smartBetMarketLabel(r.marketKey, r):esc(r.marketKey || '—'))+' @ '+n(r.displayOdds || 0).toFixed(2)+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="audit-row-tags">'+
          '<span class="audit-badge" style="color:var(--pur)">Smart '+n(r.smartScore || 0).toFixed(0)+'</span>'+
          '<span class="audit-badge" style="color:'+(n(r.roiPriority || 0) >= 0 ? 'var(--grn)' : 'var(--red)')+'">ROI '+n(r.roiPriority || 0).toFixed(1)+'</span>'+
          '<span class="audit-badge" style="color:'+(totalMem >= 0 ? 'var(--grn)' : 'var(--red)')+'">Mem '+(totalMem >= 0 ? '+' : '')+totalMem.toFixed(1)+'</span>'+
          '<span class="audit-badge" style="color:'+(journalMem >= 0 ? 'var(--grn)' : 'var(--red)')+'">Journal '+(journalMem >= 0 ? '+' : '')+journalMem.toFixed(1)+'</span>'+
          '<span class="audit-badge" style="color:'+learningColor+'">'+esc(learningState)+'</span>'+
        '</div>'+
        '<div class="audit-stat-grid">'+
          '<div class="audit-stat"><div class="audit-stat-label">Prob. ajustată</div><div class="audit-stat-value">'+fmtPctSafe(n(r.prob || 0))+'</div></div>'+
          '<div class="audit-stat"><div class="audit-stat-label">Edge</div><div class="audit-stat-value">'+fmtSignedPctSafe(n(r.edge || 0))+'</div></div>'+
          '<div class="audit-stat"><div class="audit-stat-label">Value</div><div class="audit-stat-value">'+fmtSignedPctSafe(valuePct)+'</div></div>'+
          '<div class="audit-stat"><div class="audit-stat-label">Adaptive</div><div class="audit-stat-value">'+adaptiveScore.toFixed(0)+'</div></div>'+
          '<div class="audit-stat"><div class="audit-stat-label">Base mem</div><div class="audit-stat-value">'+(baseMem >= 0 ? '+' : '')+baseMem.toFixed(1)+'</div></div>'+
          '<div class="audit-stat"><div class="audit-stat-label">Journal mem</div><div class="audit-stat-value">'+(journalMem >= 0 ? '+' : '')+journalMem.toFixed(1)+'</div></div>'+
        '</div>'+
        + reasonHtml +
      '</div>';
    }).join('');

    if(typeof W.renderSmartBetPatternLists==='function') W.renderSmartBetPatternLists(analysis);
    if(typeof W.setSmartBetView==='function') W.setSmartBetView(W.SMARTBET_VIEW || 'live');
    if(typeof W.setSmartBetHistoryRange==='function') W.setSmartBetHistoryRange(W.SMARTBET_HISTORY_RANGE || '30d');
  };

  W.__smartbetLearningPatchApplied = 1;
}

function patchHistory21Sections(){
  if(W.__history21SectionsPatchApplied) return;
  const oldInfer = typeof W.inferMarketTypeFromLabel==='function' ? W.inferMarketTypeFromLabel : null;
  const oldEvaluate = typeof W.evaluateMarketOutcome==='function' ? W.evaluateMarketOutcome : null;

  W.inferMarketTypeFromLabel = function(label){
    const raw = String(label || '').toLowerCase();
    const txt = (raw.normalize ? raw.normalize('NFD').replace(/[̀-ͯ]/g,'') : raw).replace(/\s+/g,' ').trim();
    if(txt.indexOf('sansa dubla') >= 0 || txt.indexOf('double chance') >= 0){
      if(txt.indexOf('1x') >= 0) return 'dc1x';
      if(txt.indexOf('x2') >= 0) return 'dcx2';
      if(/(^|\s)12($|\s)/.test(txt)) return 'dc12';
      return 'dc';
    }
    if(txt === 'dc1x' || txt === '1x') return 'dc1x';
    if(txt === 'dcx2' || txt === 'x2') return 'dcx2';
    if(txt === 'dc12' || txt === '12') return 'dc12';
    return oldInfer ? oldInfer(label) : null;
  };

  W.evaluateMarketOutcome = function(marketType, homeScore, awayScore){
    if(homeScore == null || awayScore == null) return 'pending';
    const mk = String(marketType || '').toLowerCase();
    if(mk === 'dc1x' || mk === '1x') return Number(homeScore) >= Number(awayScore) ? 'win' : 'loss';
    if(mk === 'dcx2' || mk === 'x2') return Number(awayScore) >= Number(homeScore) ? 'win' : 'loss';
    if(mk === 'dc12' || mk === '12') return Number(homeScore) !== Number(awayScore) ? 'win' : 'loss';
    return oldEvaluate ? oldEvaluate.apply(this, arguments) : 'pending';
  };

  function getHistory21MarketKey(row){
    const direct = String(row && (row.market_key || row.marketKey) || '').toLowerCase().trim();
    if(direct) return direct;
    return typeof W.inferMarketTypeFromLabel==='function' ? W.inferMarketTypeFromLabel(row && (row.market || row.label || '')) : null;
  }

  W.getHistory21MotorState = function(row){
    if(!row || typeof W.getSmartBetStatusForMatch!=='function') return { state:'neutral', row:null, reason:null, score:null };
    const marketKey = getHistory21MarketKey(row) || '';
    const match = {
      eventId: row.event_id != null ? row.event_id : (row.eventId != null ? row.eventId : null),
      event_date: row.event_date || row.date || row.logged_at || row.prediction_created_at || '',
      date: row.event_date || row.date || row.logged_at || row.prediction_created_at || '',
      home: row.home || '',
      away: row.away || ''
    };
    const bet = {
      type: marketKey,
      label: row.market || row.label || '',
      marketKey: marketKey,
      market_key: marketKey,
      market: row.market || row.label || ''
    };
    return W.getSmartBetStatusForMatch(match, bet);
  };

  W.getHistory21CategoryDefs = function(rows){
    const defs = [
      {key:'all', label:'Toate'},
      {key:'motor_validated', label:'Validate Motor'},
      {key:'safe', label:'Top analizate'},
      {key:'over15', label:'Over 1.5G'},
      {key:'over25', label:'Over 2.5G'},
      {key:'btts', label:'BTTS'},
      {key:'under35', label:'Under 3.5G'},
      {key:'dc', label:'Șansă Dublă'},
      {key:'value', label:'Value'}
    ];
    const known = {};
    defs.forEach(def=>{ known[def.key] = true; });
    const extra = {};
    arr(rows).forEach(function(row){
      const mk = getHistory21MarketKey(row);
      const label = row && (row.market || row.label || mk || '');
      if(!mk || known[mk] || extra[mk]) return;
      extra[mk] = { key:mk, label:label };
    });
    Object.keys(extra).forEach(key=>defs.push(extra[key]));
    return defs;
  };

  W.historyRowMatchesCategory = function(row, categoryKey){
    const mk = String(getHistory21MarketKey(row) || '').toLowerCase();
    if(categoryKey === 'all') return true;
    if(categoryKey === 'motor_validated') return W.getHistory21MotorState(row).state === 'validated';
    if(categoryKey === 'safe') return String(row && row.verdict || '').toLowerCase() === 'safe' || n(row && row.score || 0) >= 80;
    if(categoryKey === 'value') return n(row && row.value || 0) >= 0.05;
    if(categoryKey === 'dc') return ['dc','dc1x','dcx2','dc12','1x','x2','12','doublechance'].indexOf(mk) >= 0;
    return mk === categoryKey;
  };

  W.__history21SectionsPatchApplied = 1;
}

function refreshHistory21View(){
  if(typeof W.renderHistory21!=='function') return;
  try{ W.renderHistory21(); }catch(err){ console.error('History21 patch refresh failed:', err); }
}

function run(){
  runApiHistoryCleanup();
  patchSmartBetAnalysis();
  patchSmartBet();
  patchHistory21Sections();
}

function boot(){
  loadSkipped().finally(()=>{
    run();
    setTimeout(refreshHistory21View, 60);
    setTimeout(refreshHistory21View, 320);
    if(typeof W.switchTab==='function'&&!W.__fhHotfixSwitch){
      const old=W.switchTab;
      W.switchTab=function(name){
        const out=old.apply(this,arguments);
        setTimeout(run,0);
        setTimeout(run,300);
        setTimeout(run,900);
        setTimeout(refreshHistory21View,80);
        setTimeout(refreshHistory21View,360);
        setTimeout(refreshHistory21View,980);
        return out;
      };
      W.__fhHotfixSwitch=1;
    }
    if(typeof W.doRefresh==='function'&&!W.__fhHotfixRefresh){
      const old=W.doRefresh;
      W.doRefresh=async function(){
        const isManual = arguments && arguments[0] === true;
        const out=await old.apply(this,arguments);
        if(isManual || Date.now() < Number(W.__BA_MANUAL_SOFT_REFRESH_UNTIL||0)){
          return out;
        }
        setTimeout(run,0);
        setTimeout(run,400);
        setTimeout(run,1000);
        setTimeout(refreshHistory21View,120);
        setTimeout(refreshHistory21View,520);
        setTimeout(refreshHistory21View,1120);
        return out;
      };
      W.__fhHotfixRefresh=1;
    }
    let __fhHotfixMoT=null;
    const mo=new MutationObserver(()=>{ clearTimeout(__fhHotfixMoT); __fhHotfixMoT=setTimeout(run,120); });
    mo.observe(document.body,{childList:true,subtree:true});
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
