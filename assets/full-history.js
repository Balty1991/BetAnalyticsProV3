(()=>{
const W=window,$=id=>document.getElementById(id);
const num=v=>{v=Number(v);return Number.isFinite(v)?v:0};
const esc=s=>String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
const fmt=v=>num(v).toLocaleString('ro-RO');
const pct=(v,d=1)=>`${num(v).toFixed(d)}%`;
const VER='20260419fix4';
const dateOk=v=>{const d=new Date(v);return Number.isFinite(+d)};
const dateFmt=v=>dateOk(v)?new Date(v).toLocaleDateString('ro-RO'):'—';
const timeFmt=v=>dateOk(v)?new Date(v).toLocaleString('ro-RO',{dateStyle:'short',timeStyle:'short'}):'—';
const ageHours=v=>dateOk(v)?Math.max(0,(Date.now()-new Date(v).getTime())/36e5):null;
const freshness=v=>{const h=ageHours(v); if(h==null) return 'fără timestamp'; if(h<1) return 'actualizat recent'; if(h<6) return `${h.toFixed(1)}h în urmă`; if(h<24) return `${Math.round(h)}h în urmă`; return `${Math.round(h/24)} zile în urmă`;};
const arr=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const card=(k,v,s='')=>`<div style="padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)"><div style="font-size:11px;color:var(--muted);font-weight:700;line-height:1.25">${k}</div><div style="font-size:24px;font-weight:900;margin-top:8px;line-height:1.1">${v}</div>${s?`<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4">${s}</div>`:''}</div>`;
const mini=(k,v,s='')=>`<div style="padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)"><div style="font-size:10px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.04em">${k}</div><div style="font-size:15px;font-weight:800;margin-top:6px">${v}</div>${s?`<div style="font-size:11px;color:var(--muted);margin-top:5px;line-height:1.45">${s}</div>`:''}</div>`;
const infoBox=(title,body,tone='blue')=>{const map={blue:['rgba(96,165,250,.12)','rgba(96,165,250,.18)'],amber:['rgba(245,158,11,.10)','rgba(245,158,11,.18)'],green:['rgba(16,185,129,.10)','rgba(16,185,129,.18)'],red:['rgba(239,68,68,.10)','rgba(239,68,68,.18)']};const [bg,br]=map[tone]||map.blue;return `<div style="padding:12px 14px;border-radius:14px;background:${bg};border:1px solid ${br}"><div style="font-size:12px;font-weight:800;color:var(--txt)">${title}</div><div style="font-size:11px;line-height:1.55;color:var(--muted);margin-top:6px">${body}</div></div>`};
const chip=(on,label,fn,arg)=>`<button class="filter-chip ${on?'on':''}" style="padding:7px 10px;font-size:11px;line-height:1.15;white-space:nowrap;flex:0 0 auto" onclick="${fn}('${String(arg).replace(/'/g,"\\'")}')">${label}</button>`;
const row=html=>`<div style="display:flex;gap:8px;overflow:auto hidden;white-space:nowrap;padding:2px 0 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none">${html}</div>`;
const tableWrap=html=>`<div style="overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)">${html}</div>`;
const section=(title,sub,body)=>`<div style="margin-top:12px;padding:12px;border-radius:16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:14px;font-weight:800;color:var(--txt)">${title}</div>${sub?`<div style="font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5">${sub}</div>`:''}</div></div><div style="margin-top:10px">${body}</div></div>`;
const th='padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;background:#0f1730;z-index:1';

W.RECOMMENDATION_JOURNAL=arr(W.RECOMMENDATION_JOURNAL);
W.API_HISTORY_SUMMARY=W.API_HISTORY_SUMMARY||null;
W.API_HISTORY_LEAGUES=arr(W.API_HISTORY_LEAGUES);
W.API_EVENTS_HISTORY_SUMMARY=W.API_EVENTS_HISTORY_SUMMARY||null;
W.API_SEASONS_HISTORY=arr(W.API_SEASONS_HISTORY);
W.API_EVENTS_HISTORY_INDEX=arr(W.API_EVENTS_HISTORY_INDEX);
W.TRAINING_DATASET_SUMMARY=W.TRAINING_DATASET_SUMMARY||null;
W.TRAINING_INSIGHTS_SUMMARY=W.TRAINING_INSIGHTS_SUMMARY||null;
W.TRAINING_MATCHES=arr(W.TRAINING_MATCHES);
W.TRAINING_MARKET_BASELINES=arr(W.TRAINING_MARKET_BASELINES);
W.TRAINING_DATASET_FAILURES=arr(W.TRAINING_DATASET_FAILURES);
W.TRAINING_FEATURE_SUMMARY=W.TRAINING_FEATURE_SUMMARY||null;
W.TRAINING_SCORING_SUMMARY=W.TRAINING_SCORING_SUMMARY||null;
W.TRAINING_MODEL_SUMMARY=W.TRAINING_MODEL_SUMMARY||null;
W.AI_MEMORY=W.AI_MEMORY||null;
W.FULL_HISTORY_META=W.FULL_HISTORY_META||null;
W.META=W.META||null;
W.FULL_HISTORY_RANGE=W.FULL_HISTORY_RANGE||'total';
W.API_HISTORY_LEAGUE_FILTER=W.API_HISTORY_LEAGUE_FILTER||'all';
W.API_HISTORY_YEAR_FILTER=W.API_HISTORY_YEAR_FILTER||'all';
W.API_HISTORY_VIEW=W.API_HISTORY_VIEW||'all';

async function j(paths,fb){
  for(const p of paths){
    try{
      const r=await fetch(`${p}${p.includes('?')?'&':'?'}v=${VER}`,{cache:'no-store'});
      if(r.ok) return await r.json();
    }catch{}
  }
  return fb;
}

async function load(){
  W.RECOMMENDATION_JOURNAL=await j(['./data/recommendation_journal.json','data/recommendation_journal.json','/BetAnalyticsProV3/data/recommendation_journal.json'],[]);
  W.API_HISTORY_SUMMARY=await j(['./data/api_history_summary.json','data/api_history_summary.json','/BetAnalyticsProV3/data/api_history_summary.json'],null);
  W.API_HISTORY_LEAGUES=await j(['./data/api_history_leagues.json','data/api_history_leagues.json','/BetAnalyticsProV3/data/api_history_leagues.json'],[]);
  W.API_EVENTS_HISTORY_SUMMARY=await j(['./data/api_events_history_summary.json','data/api_events_history_summary.json','/BetAnalyticsProV3/data/api_events_history_summary.json'],null);
  W.API_SEASONS_HISTORY=await j(['./data/api_seasons_history.json','data/api_seasons_history.json','/BetAnalyticsProV3/data/api_seasons_history.json'],[]);
  W.API_EVENTS_HISTORY_INDEX=await j(['./data/api_events_history_index.json','data/api_events_history_index.json','/BetAnalyticsProV3/data/api_events_history_index.json'],[]);
  W.TRAINING_DATASET_SUMMARY=await j(['./data/training_dataset_summary.json','data/training_dataset_summary.json','/BetAnalyticsProV3/data/training_dataset_summary.json'],null);
  W.TRAINING_INSIGHTS_SUMMARY=await j(['./data/training_insights_summary.json','data/training_insights_summary.json','/BetAnalyticsProV3/data/training_insights_summary.json'],null);
  W.TRAINING_MATCHES=await j(['./data/training_matches.json','data/training_matches.json','/BetAnalyticsProV3/data/training_matches.json'],[]);
  W.TRAINING_MARKET_BASELINES=await j(['./data/training_market_baselines.json','data/training_market_baselines.json','/BetAnalyticsProV3/data/training_market_baselines.json'],[]);
  W.TRAINING_DATASET_FAILURES=await j(['./data/training_dataset_failures.json','data/training_dataset_failures.json','/BetAnalyticsProV3/data/training_dataset_failures.json'],[]);
  W.TRAINING_FEATURE_SUMMARY=await j(['./data/training_feature_summary.json','data/training_feature_summary.json','/BetAnalyticsProV3/data/training_feature_summary.json'],null);
  W.TRAINING_SCORING_SUMMARY=await j(['./data/training_scoring_summary.json','data/training_scoring_summary.json','/BetAnalyticsProV3/data/training_scoring_summary.json'],null);
  W.TRAINING_MODEL_SUMMARY=await j(['./data/training_model_summary.json','data/training_model_summary.json','/BetAnalyticsProV3/data/training_model_summary.json'],null);
  W.AI_MEMORY=await j(['./data/ai_memory.json','data/ai_memory.json','/BetAnalyticsProV3/data/ai_memory.json'],null);
  W.FULL_HISTORY_META=await j(['./data/full_history_meta.json','data/full_history_meta.json','/BetAnalyticsProV3/data/full_history_meta.json'],null);
  W.META=await j(['./data/meta.json','data/meta.json','/BetAnalyticsProV3/data/meta.json'],null);
}

function cardKeyTitle(title){
  title=(title||'').toLowerCase();
  if(title.includes('smartbet')) return 'smartbet';
  if(title.includes('istoric api')) return 'apihistory';
  if(title.includes('ai training')) return 'traininglab';
  if(title.includes('istoric total')) return 'istoricfull';
  return null;
}

function summarizeCard(key){
  const hist=obj(W.FULL_HISTORY_META), histRows=obj(hist.preprocess), api=obj(W.API_HISTORY_SUMMARY), apiValid=obj(api.valid), apiEv=obj(W.API_EVENTS_HISTORY_SUMMARY), tr=obj(W.TRAINING_DATASET_SUMMARY), feat=obj(W.TRAINING_FEATURE_SUMMARY), model=obj(W.TRAINING_MODEL_SUMMARY), memory=obj(W.AI_MEMORY), memSum=obj(memory.summary);
  if(key==='istoricfull') return `${fmt(hist.journal_rows||W.RECOMMENDATION_JOURNAL.length)} jurnal • ${fmt(hist.history_rows||0)} rezultate • ${fmt(hist.lookback_days||0)} zile`;
  if(key==='apihistory') return `${fmt(apiValid.leagues_total||W.API_HISTORY_LEAGUES.length)} ligi • ${fmt(apiValid.seasons_total||W.API_SEASONS_HISTORY.length)} sezoane • ${fmt(apiEv.total_events_counted||0)} meciuri`;
  if(key==='traininglab') return `${fmt(tr.rows_total||W.TRAINING_MATCHES.length)} rows • ${fmt(feat.eligible_min_history_5||model.rows_eligible_min5||0)} ready • ${fmt(arr(model.markets).filter(x=>x&&x.ready).length||arr(tr.markets_ready).length)} piețe`;
  if(key==='smartbet') return `${fmt(memSum.pending_scored||0)} adaptive picks • ${fmt(memSum.settled_bets||0)} settled • ROI ${pct(memSum.settled_roi||0,2)}`;
  return '';
}

function decorateMoreCards(){
  document.querySelectorAll('.desktop-more-panel .more-card-btn, #mobile-sheet .mobile-sheet-btn').forEach(btn=>{
    const titleEl=btn.querySelector('.more-card-title, .sheet-btn-title');
    const subEl=btn.querySelector('.more-card-sub, .sheet-btn-sub');
    const key=cardKeyTitle(titleEl&&titleEl.textContent);
    if(!key||!subEl) return;
    const summary=summarizeCard(key);
    if(!summary) return;
    const base=subEl.dataset.baseText||subEl.textContent||'';
    subEl.dataset.baseText=base;
    subEl.innerHTML=`${esc(base)}<br><span style="color:var(--acc)">${esc(summary)}</span>`;
  });
}

function ensure(){
  const main=document.querySelector('.main');
  if(!main) return;
  const make=(id,title,prefix)=>{
    if($(id)) return;
    const d=document.createElement('div');
    d.className='tab-content';
    d.id=id;
    d.innerHTML=`<div class="section"><div class="sec-title">${title}</div><div id="${prefix}-top" style="margin-top:10px"></div><div id="${prefix}-root" style="margin-top:10px"></div></div>`;
    main.appendChild(d);
  };
  make('tab-istoricfull','Istoric total','fh');
  make('tab-apihistory','Istoric API total','apih');
  make('tab-traininglab','AI Training Lab','tr');
  const grid=document.querySelector('.desktop-more-panel .more-grid');
  [['istoricfull','Istoric total','Arhiva completă'],['apihistory','Istoric API total','Catalog sezoane și coverage'],['traininglab','AI Training Lab','Dataset, model și audit']].forEach(([k,t,s])=>{
    if(grid&&!grid.querySelector(`[data-more-card="${k}"]`)){
      const b=document.createElement('button');
      b.className='more-card-btn';
      b.dataset.moreCard=k;
      b.setAttribute('onclick',`switchTab('${k}')`);
      b.innerHTML=`<span class="more-card-title">${t}</span><span class="more-card-sub">${s}</span>`;
      grid.appendChild(b);
    }
  });
  const sheet=$('mobile-sheet');
  [['istoricfull','Istoric total','Arhiva completă'],['apihistory','Istoric API total','Coverage, sezoane și gap-uri'],['traininglab','AI Training Lab','Dataset, model și memorie']].forEach(([k,t,s])=>{
    if(sheet&&!sheet.querySelector(`[data-sheet-btn="${k}"]`)){
      const b=document.createElement('button');
      b.className='mobile-sheet-btn';
      b.dataset.sheetBtn=k;
      b.setAttribute('onclick',`switchTab('${k}');closeMobileMore()`);
      b.innerHTML=`<span class="sheet-btn-title">${t}</span><small class="sheet-btn-sub">${s}</small>`;
      sheet.appendChild(b);
    }
  });
  decorateMoreCards();
}

function histRows(){
  return arr(W.RECOMMENDATION_JOURNAL).map(x=>({
    home:x.home||'',away:x.away||'',league:x.league||'',market:x.market||'',
    odds:num(x.odds||x.book_odds),status:(x.status||'').toLowerCase(),
    date:x.event_date||x.date||x.logged_at||'',hs:x.home_score,as:x.away_score
  })).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
}

function filterHist(rows){
  if(W.FULL_HISTORY_RANGE==='total') return rows;
  const days=W.FULL_HISTORY_RANGE==='week'?7:W.FULL_HISTORY_RANGE==='month'?30:365;
  const cut=Date.now()-days*864e5;
  return rows.filter(r=>new Date(r.date||0).getTime()>=cut);
}

function renderFull(){
  ensure();
  const top=$('fh-top'), root=$('fh-root');
  if(!top||!root) return;
  const rows=filterHist(histRows());
  const meta=obj(W.FULL_HISTORY_META), prep=obj(meta.preprocess);
  const rs=['week','month','year','total'];
  const note=infoBox('Stare jurnal intern',`Acesta este istoricul aplicației tale, separat de istoricul brut BSD. Ultima reconstrucție: <b>${timeFmt(meta.updated_at)}</b>. Preprocesare: ${fmt(prep.input_count||0)} intrări brute → ${fmt(prep.kept_count||rows.length)} păstrate. Duplicate eliminate: ${fmt(prep.duplicate_removed||0)}.`, 'green');
  top.innerHTML=`${row(rs.map(r=>chip(W.FULL_HISTORY_RANGE===r,{week:'7 zile',month:'30 zile',year:'12 luni',total:'total'}[r],'setFullHistoryRange',r)).join(''))}<div style="margin-top:10px">${note}</div>`;
  if(!rows.length){root.innerHTML='<div class="empty-state">Nu există date.</div>'; return;}
  let w=0,l=0,p=0,pending=0;
  rows.forEach(r=>{if(r.status==='won'||r.status==='win'){w++;p+=Math.max(0,r.odds-1)}else if(r.status==='lost'){l++;p-=1}else pending++;});
  const latest=rows.find(r=>r.date);
  const recent=rows.slice(0,80).map(r=>`<div class="list-item" style="margin-top:8px"><div style="font-weight:700">${esc((r.home&&r.away)?`${r.home} vs ${r.away}`:'Meci')}</div><div style="font-size:12px;color:var(--muted)">${esc(r.league)} • ${esc(r.market)} @ ${num(r.odds).toFixed(2)}</div><div style="font-size:12px;color:var(--muted)">${dateFmt(r.date)}${r.hs!=null&&r.as!=null?` • scor ${r.hs}-${r.as}`:''}${r.status?` • ${esc(r.status)}`:''}</div></div>`).join('');
  root.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
      ${card('Meciuri vizibile',fmt(rows.length),W.FULL_HISTORY_RANGE==='total'?'toată arhiva afișată':'filtru temporal activ')}
      ${card('Bilete închise',fmt(w+l),`${fmt(pending)} încă în așteptare`)}
      ${card('Win rate',w+l?pct(w/(w+l)*100,2):'—',`${fmt(w)} win / ${fmt(l)} loss`)}
      ${card('ROI simplificat',w+l?pct(p/(w+l)*100,2):'—','estimare pe 1 unitate flat')}
      ${card('Jurnal total',fmt(meta.journal_rows||W.RECOMMENDATION_JOURNAL.length),`${fmt(meta.history_rows||0)} în istoric închis`)}
      ${card('Ultimul meci logat',latest&&latest.date?dateFmt(latest.date):'—',latest&&latest.date?freshness(latest.date):'')}
    </div>
    ${section('Calitatea arhivei interne','Acest bloc te ajută să separi jurnalul aplicației de warehouse-ul istoric brut din API.',`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">${mini('Lookback',fmt(meta.lookback_days||0)+' zile')}${mini('Input brut',fmt(prep.input_count||0))}${mini('Păstrate',fmt(prep.kept_count||rows.length))}${mini('Stale eliminate',fmt(prep.stale_removed||0))}${mini('Duplicate eliminate',fmt(prep.duplicate_removed||0))}${mini('Max age ore',fmt(prep.max_age_hours||0))}</div>`)}
    ${section('Ultimele rânduri din jurnal','Afișez maximum 80 intrări, cele mai noi primele.',recent)}
  `;
}

function apiRows(){
  const idx={};
  arr(W.API_EVENTS_HISTORY_INDEX).forEach(x=>idx[String(x.season_id)]=x);
  const rows=[];
  const seen=new Set();
  arr(W.API_SEASONS_HISTORY).forEach(x=>{
    if(!x) return;
    seen.add(String(x.id));
    const z=idx[String(x.id)]||null;
    rows.push({
      season_id:x.id,league:x.league||'',season:x.name||'',year:num(x.year),
      valid:x.is_valid_historical!==false,indexed:!!z,events:z?num(z.events_count):0,
      sample:z?num(z.sample_count):0,start:x.start_date||'',end:x.end_date||'',
      anoms:arr(x.anomaly_reasons)
    });
  });
  arr(W.API_EVENTS_HISTORY_INDEX).forEach(x=>{
    if(seen.has(String(x.season_id))) return;
    rows.push({
      season_id:x.season_id,league:x.league||'',season:x.season_name||'',year:num(x.year),
      valid:true,indexed:true,events:num(x.events_count),sample:num(x.sample_count),
      start:x.start_date||'',end:x.end_date||'',anoms:[]
    });
  });
  return rows.sort((a,b)=>b.year-a.year||Number(b.indexed)-Number(a.indexed)||String(a.league).localeCompare(String(b.league),'ro'));
}

function renderApi(){
  ensure();
  const top=$('apih-top'), root=$('apih-root');
  if(!top||!root) return;
  const rows=apiRows(), sum=obj(W.API_HISTORY_SUMMARY), validSum=obj(sum.valid), rawSum=obj(sum.raw), ev=obj(W.API_EVENTS_HISTORY_SUMMARY), leagueMeta=arr(W.API_HISTORY_LEAGUES);
  if(!rows.length&&!Object.keys(sum).length&&!Object.keys(ev).length){root.innerHTML='<div class="empty-state">Nu există date API history.</div>'; return;}
  const leagues=[...new Set(rows.map(r=>r.league).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ro'));
  if
