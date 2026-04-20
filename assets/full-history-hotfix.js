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
  if(W.__smartbetLearningAnalysisPatched) return;
  if(typeof W.getSmartBetAnalysis!=='function') return;
  const oldGetSmartBetAnalysis = W.getSmartBetAnalysis;

  W.getSmartBetAnalysis = function(){
    const analysis = oldGetSmartBetAnalysis();
    if(!analysis || !arr(W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.rows).length) return analysis;
    if(arr(analysis.pool).length >= 8) return analysis;
    if(typeof W.smartBetSupportedMarket!=='function') return analysis;

    const adaptiveMap = typeof W.getSmartBetAdaptiveMap==='function' ? W.getSmartBetAdaptiveMap() : {};
    const patternMaps = typeof W.getSmartBetPatternMaps==='function' ? W.getSmartBetPatternMaps() : {positive:[],avoid:[]};
    const existing = {};
    arr(analysis.pool).forEach(r=>{ existing[String(r.event_id || '') + '|' + String(r.marketKey || '')] = 1; });
    const extras = [];

    arr(W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.rows).forEach(function(row){
      if(!row || !W.smartBetSupportedMarket(row)) return;
      if(n(row.edge_pct || 0) <= 0 || n(row.value || 0) <= 0 || n(row.book_odds || 0) < 1.20) return;

      const marketKey = typeof W.normalizeSmartBetMarketKey==='function' ? W.normalizeSmartBetMarketKey(row.market_key || row.market) : norm(row.market_key || row.market);
      const eventKey = String(row.event_id || '') + '|' + marketKey;
      if(existing[eventKey]) return;

      const adaptive = adaptiveMap[eventKey] || adaptiveMap[[String(row.home || '').toLowerCase(), String(row.away || '').toLowerCase(), marketKey].join('|')] || null;
      const patternInfo = typeof W.getSmartBetPatternMatchInfo==='function' ? W.getSmartBetPatternMatchInfo(row, patternMaps) : {positive:[],avoid:[]};
      const bestPositive = arr(patternInfo.positive)[0] || null;
      const worstNegative = arr(patternInfo.avoid)[0] || null;
      const directAdaptive = !!adaptive;
      const probAdj = n(row.adjusted_prob || 0);
      const edgePct = n(row.edge_pct || 0);
      const kellyPct = n(row.kelly_quarter_pct || 0);
      const learningState = adaptive && adaptive.learning_state ? adaptive.learning_state : 'stable';
      const journalBonus = adaptive && adaptive.journal_memory_bonus != null ? n(adaptive.journal_memory_bonus) : 0;

      if(!directAdaptive && worstNegative && n(worstNegative.memory_score || 0) <= -6 && n(worstNegative.raw_bets || 0) >= 8) return;

      let allow = false;
      let relaxPenalty = 0;
      let note = 'learning relax';
      if(directAdaptive){
        if(probAdj >= 64 && edgePct >= 2.2 && (learningState !== 'cautious' || edgePct >= 4.5)){
          allow = true;
          relaxPenalty = probAdj < 68 ? 7 : 3;
          note = 'AI direct relaxat';
        }
      } else if(bestPositive){
        if(n(bestPositive.memory_score || 0) >= 10 && probAdj >= 69 && edgePct >= 3.2){
          allow = true;
          relaxPenalty = 10;
          note = 'pattern jurnal puternic';
        } else if(n(bestPositive.memory_score || 0) >= 7 && probAdj >= 72 && edgePct >= 4 && kellyPct >= 0.35){
          allow = true;
          relaxPenalty = 8;
          note = 'pattern jurnal relaxat';
        }
      }
      if(!allow) return;

      const memoryBonus = directAdaptive ? n(adaptive.memory_bonus || 0) : n(bestPositive && bestPositive.memory_score || 0);
      const adaptiveScore = directAdaptive ? n(adaptive.adaptive_score || 0) : Math.max(58, Math.min(86, probAdj + n(bestPositive && bestPositive.memory_score || 0) * 1.1 + journalBonus * 0.7));
      const marketBonusSmartBet = marketKey === 'btts' ? 6 : (marketKey === 'over15' ? 2 : (marketKey === 'under35' ? 0 : (marketKey === 'over25' ? -3 : 0)));
      let smartScore = (
        n(row.score || 0) * 0.48 +
        Math.min(100, adaptiveScore) * 0.26 +
        n(row.adjusted_prob || 0) * 0.14 +
        Math.max(0, n(row.edge_pct || 0)) * 0.55 +
        Math.max(0, n(row.kelly_quarter_pct || 0)) * 0.70 +
        Math.max(0, memoryBonus) * 0.80 +
        Math.max(0, n(row.poisson_delta || 0)) * 0.18 +
        Math.max(0, n(bestPositive && bestPositive.roi || 0)) * 0.05 +
        marketBonusSmartBet -
        relaxPenalty +
        Math.max(-2, Math.min(4, journalBonus * 0.35))
      );
      smartScore = typeof W.clampMathScore==='function' ? W.clampMathScore(smartScore) : Math.max(0, Math.min(100, smartScore));

      const reasons = [];
      reasons.push('Kelly 1/4 ' + fmtPctSafe(kellyPct));
      reasons.push('Edge ' + fmtSignedPctSafe(edgePct));
      reasons.push(note);
      if(bestPositive) reasons.push('Pattern ' + bestPositive.label);
      if(directAdaptive && arr(adaptive.reasons).length){
        adaptive.reasons.slice(0,2).forEach(function(r){ reasons.push((r.label || 'motiv') + ' ' + (n(r.impact || 0) >= 0 ? '+' : '') + n(r.impact || 0).toFixed(1)); });
      }

      extras.push(Object.assign({}, row, {
        source:'smartbet',
        eventKey:typeof W.getGenericEventKey==='function' ? W.getGenericEventKey(row) : eventKey,
        marketKey: marketKey,
        displayMarket: row.market || '—',
        displayOdds: n(row.book_odds || 0),
        odds: n(row.book_odds || 0),
        prob: n(row.adjusted_prob || 0),
        value: n(row.value || 0),
        edge: edgePct,
        edgeToPrice: typeof W.impliedProbFromOdds==='function' ? +(n(row.adjusted_prob || 0) - W.impliedProbFromOdds(n(row.book_odds || 0))).toFixed(2) : 0,
        smartScore: smartScore,
        score: smartScore,
        ticketScore: smartScore,
        adaptiveScore: adaptiveScore,
        memoryBonus: memoryBonus,
        directAdaptive: directAdaptive,
        patternOnly: !directAdaptive,
        bestPositivePattern: bestPositive,
        positivePatterns: patternInfo.positive,
        confirmationLabel: note,
        reasonsSmart: reasons.slice(0,5),
        aiReasons: adaptive && adaptive.reasons ? adaptive.reasons.slice(0,3) : [],
        mostLikelyScore: directAdaptive ? adaptive.most_likely_score : null,
        expandedByLearning: true,
        relaxationNote: note
      }));
    });

    extras.sort((a,b)=>{
      if(n(b.smartScore || 0) !== n(a.smartScore || 0)) return n(b.smartScore || 0) - n(a.smartScore || 0);
      if(n(b.edge || 0) !== n(a.edge || 0)) return n(b.edge || 0) - n(a.edge || 0);
      return n(b.value || 0) - n(a.value || 0);
    });

    const targetMin = 8;
    const limit = Math.max(0, targetMin - arr(analysis.pool).length);
    const selectedExtras = extras.slice(0, limit);
    if(selectedExtras.length){
      analysis.pool = arr(analysis.pool).concat(selectedExtras).sort((a,b)=>{
        if(n(b.smartScore || 0) !== n(a.smartScore || 0)) return n(b.smartScore || 0) - n(a.smartScore || 0);
        if(n(b.edge || 0) !== n(a.edge || 0)) return n(b.edge || 0) - n(a.edge || 0);
        return n(b.value || 0) - n(a.value || 0);
      });
      analysis.learningExpanded = selectedExtras.length;
    } else {
      analysis.learningExpanded = 0;
    }
    return analysis;
  };

  W.__smartbetLearningAnalysisPatched = 1;
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
    var adaptiveMap = typeof W.getSmartBetAdaptiveMap==='function' ? W.getSmartBetAdaptiveMap() : {};
    var aiSummary = (W.AI_MEMORY && W.AI_MEMORY.summary) || {};
    var journalLearning = (W.AI_MEMORY && W.AI_MEMORY.journal_learning) || {};

    if(typeof W.syncSmartBetHistoryJournal==='function') W.syncSmartBetHistoryJournal(pool);

    if(updated){
      var ts = (W.AI_MEMORY && W.AI_MEMORY.updated_at) || (W.SIGNAL_AUDIT && W.SIGNAL_AUDIT.updated_at) || (W.APP_META && W.APP_META.updated_at) || '';
      updated.textContent = ts ? ('SmartBet actualizat: ' + (typeof W.fmtDateTime==='function' ? W.fmtDateTime(ts) : ts)) : 'SmartBet: —';
    }
    if(meta) meta.textContent = pool.length + ' validate • ' + blocked.length + ' blocate • ' + (journalLearning.rows_settled || aiSummary.journal_rows_settled || 0) + ' rows jurnal' + (analysis.learningExpanded ? (' • +' + analysis.learningExpanded + ' extinse') : '');

    var avgScore = pool.length ? (pool.reduce((acc,row)=>acc + n(row.smartScore || 0),0) / pool.length) : 0;
    var avgEdge = pool.length ? (pool.reduce((acc,row)=>acc + n(row.edge || 0),0) / pool.length) : 0;
    var avgProb = pool.length ? (pool.reduce((acc,row)=>acc + n(row.prob || 0),0) / pool.length) : 0;

    var cards = [
      {label:'Validate', value:String(pool.length), sub:'trecute prin audit + memorie', color:'var(--acc)'},
      {label:'Blocate', value:String(blocked.length), sub:'respinse de pattern negativ', color:'var(--red)'},
      {label:'Smart score', value:pool.length ? avgScore.toFixed(1) : '—', sub:'media scorului final', color:'var(--pur)'},
      {label:'Prob. medie', value:pool.length ? fmtPctSafe(avgProb) : '—', sub:'probabilitate ajustată medie', color:'var(--grn)'},
      {label:'Rows jurnal', value:String(journalLearning.rows_settled || aiSummary.journal_rows_settled || 0), sub:'istoric real folosit la learning', color:'var(--cyan)'},
      {label:'Pattern-uri', value:(journalLearning.positive_patterns || 0)+' / '+(journalLearning.negative_patterns || 0), sub:'pozitive / negative din jurnal', color:'var(--yel)'},
      {label:'Edge mediu', value:pool.length ? fmtSignedPctSafe(avgEdge) : '—', sub:'avantaj model vs piață', color:'var(--yel)'},
      {label:'Extinse', value:String(analysis.learningExpanded || 0), sub:'adăugate de motorul adaptiv', color:'var(--acc)'}
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
      var journalMem = adaptive.journal_memory_bonus != null ? n(adaptive.journal_memory_bonus) : 0;
      var totalMem = adaptive.memory_bonus != null ? n(adaptive.memory_bonus) : n(r.memoryBonus || 0);
      var adaptiveScore = adaptive.adaptive_score != null ? n(adaptive.adaptive_score) : n(r.adaptiveScore || 0);
      var learningState = adaptive.learning_state || (journalMem >= 2.5 ? 'accelerating' : (journalMem <= -2.5 ? 'cautious' : 'stable'));
      var learningColor = learningState === 'accelerating' ? 'var(--grn)' : (learningState === 'cautious' ? 'var(--red)' : 'var(--acc)');
      var valuePct = n(r.value || 0) * 100;
      var reasons = arr(adaptive.reasons || r.aiReasons || []).slice(0,4);
      var reasonHtml = reasons.length ? '<div style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">'+reasons.map(function(rr){ return '<div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px"><span style="color:var(--txt);font-weight:700">'+esc(rr.label || 'motiv')+'</span>' + (rr.impact!=null ? ' • <span style="color:'+(n(rr.impact)>=0?'var(--grn)':'var(--red)')+'">'+(n(rr.impact)>=0?'+':'')+n(rr.impact).toFixed(2)+'</span>' : '') + (rr.bets!=null ? ' • '+esc(String(rr.bets))+' beturi' : '') + (rr.roi!=null ? ' • ROI '+fmtSignedPctSafe(rr.roi) : '') + '</div>'; }).join('') + '</div>' : '';
      return '<div class="audit-row" style="margin-bottom:10px">'+
        '<div class="audit-row-header">'+
          '<div class="audit-row-main">'+
            '<div class="audit-row-titleline"><span class="audit-row-rank">#'+(idx+1)+'</span><div class="audit-row-teams">'+esc(r.home || '—')+' vs '+esc(r.away || '—')+'</div></div>'+
            '<div class="audit-row-meta">'+esc(r.league || '—')+' • '+(r.event_date ? (fmtDateSafe(r.event_date)+' • '+fmtTimeSafe(r.event_date)) : '—')+' • '+esc(r.expandedByLearning ? 'learning expand' : (r.directAdaptive ? 'AI direct + jurnal' : 'Pattern confirmat + jurnal'))+'</div>'+
          '</div>'+
          '<div class="audit-pick-box">'+
            '<div class="audit-pick-label">SmartBet pick</div>'+
            '<div class="audit-pick-value">'+(typeof W.smartBetMarketLabel==='function'?W.smartBetMarketLabel(r.marketKey, r):esc(r.marketKey || '—'))+' @ '+n(r.displayOdds || 0).toFixed(2)+'</div>'+
          '</div>'+
        '</div>'+
        '<div class="audit-row-tags">'+
          '<span class="audit-badge" style="color:var(--pur)">Smart '+n(r.smartScore || 0).toFixed(0)+'</span>'+
          '<span class="audit-badge" style="color:'+(totalMem >= 0 ? 'var(--grn)' : 'var(--red)')+'">Mem '+(totalMem >= 0 ? '+' : '')+totalMem.toFixed(1)+'</span>'+
          '<span class="audit-badge" style="color:'+(journalMem >= 0 ? 'var(--grn)' : 'var(--red)')+'">Journal '+(journalMem >= 0 ? '+' : '')+journalMem.toFixed(1)+'</span>'+
          '<span class="audit-badge" style="color:'+learningColor+'">'+esc(learningState)+'</span>'+
          +(r.expandedByLearning ? '<span class="audit-badge" style="color:var(--acc)">relax</span>' : '')+
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

function run(){
  runApiHistoryCleanup();
  patchSmartBetAnalysis();
  patchSmartBet();
}

function boot(){
  loadSkipped().finally(()=>{
    run();
    if(typeof W.switchTab==='function'&&!W.__fhHotfixSwitch){
      const old=W.switchTab;
      W.switchTab=function(name){
        const out=old.apply(this,arguments);
        setTimeout(run,0);
        setTimeout(run,300);
        setTimeout(run,900);
        return out;
      };
      W.__fhHotfixSwitch=1;
    }
    if(typeof W.doRefresh==='function'&&!W.__fhHotfixRefresh){
      const old=W.doRefresh;
      W.doRefresh=async function(){
        const out=await old.apply(this,arguments);
        setTimeout(run,0);
        setTimeout(run,400);
        setTimeout(run,1000);
        return out;
      };
      W.__fhHotfixRefresh=1;
    }
    const mo=new MutationObserver(()=>run());
    mo.observe(document.body,{childList:true,subtree:true});
  });
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
