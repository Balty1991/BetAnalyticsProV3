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

// Cache sesiune: evită re-fetch la switch între tab-uri
const _L={};
function px(key,paths,fb){
  if(_L[key]) return Promise.resolve(W[key]);
  _L[key]=true;
  return j(paths,fb).then(d=>{W[key]=d;return d;});
}

// Loaders paraleli per tab — fiecare descarcă DOAR ce are nevoie
function loadIstoric(){
  return Promise.all([
    px('RECOMMENDATION_JOURNAL',['./data/recommendation_journal.json','data/recommendation_journal.json','/BetAnalyticsProV3/data/recommendation_journal.json'],[]),
    px('FULL_HISTORY_META',['./data/full_history_meta.json','data/full_history_meta.json','/BetAnalyticsProV3/data/full_history_meta.json'],null),
    px('META',['./data/meta.json','data/meta.json','/BetAnalyticsProV3/data/meta.json'],null)
  ]);
}
function loadApiHistory(){
  return Promise.all([
    px('API_HISTORY_SUMMARY',['./data/api_history_summary.json','data/api_history_summary.json','/BetAnalyticsProV3/data/api_history_summary.json'],null),
    px('API_HISTORY_LEAGUES',['./data/api_history_leagues.json','data/api_history_leagues.json','/BetAnalyticsProV3/data/api_history_leagues.json'],[]),
    px('API_EVENTS_HISTORY_SUMMARY',['./data/api_events_history_summary.json','data/api_events_history_summary.json','/BetAnalyticsProV3/data/api_events_history_summary.json'],null),
    px('API_SEASONS_HISTORY',['./data/api_seasons_history.json','data/api_seasons_history.json','/BetAnalyticsProV3/data/api_seasons_history.json'],[]),
    px('API_EVENTS_HISTORY_INDEX',['./data/api_events_history_index.json','data/api_events_history_index.json','/BetAnalyticsProV3/data/api_events_history_index.json'],[])
  ]);
}
function loadTrainingLab(){
  return Promise.all([
    px('TRAINING_DATASET_SUMMARY',['./data/training_dataset_summary.json','data/training_dataset_summary.json','/BetAnalyticsProV3/data/training_dataset_summary.json'],null),
    px('TRAINING_INSIGHTS_SUMMARY',['./data/training_insights_summary.json','data/training_insights_summary.json','/BetAnalyticsProV3/data/training_insights_summary.json'],null),
    px('TRAINING_MATCHES',['./data/training_matches.json','data/training_matches.json','/BetAnalyticsProV3/data/training_matches.json'],[]),
    px('TRAINING_MARKET_BASELINES',['./data/training_market_baselines.json','data/training_market_baselines.json','/BetAnalyticsProV3/data/training_market_baselines.json'],[]),
    px('TRAINING_DATASET_FAILURES',['./data/training_dataset_failures.json','data/training_dataset_failures.json','/BetAnalyticsProV3/data/training_dataset_failures.json'],[]),
    px('TRAINING_FEATURE_SUMMARY',['./data/training_feature_summary.json','data/training_feature_summary.json','/BetAnalyticsProV3/data/training_feature_summary.json'],null),
    px('TRAINING_SCORING_SUMMARY',['./data/training_scoring_summary.json','data/training_scoring_summary.json','/BetAnalyticsProV3/data/training_scoring_summary.json'],null),
    px('TRAINING_MODEL_SUMMARY',['./data/training_model_summary.json','data/training_model_summary.json','/BetAnalyticsProV3/data/training_model_summary.json'],null),
    px('AI_MEMORY',['./data/ai_memory.json','data/ai_memory.json','/BetAnalyticsProV3/data/ai_memory.json'],null)
  ]);
}

async function load(){
  // Prioritizăm tab-ul activ, restul se încarcă în background
  const activeId=(document.querySelector('.tab-content.active')||{}).id||'';
  if(activeId==='tab-istoricfull'){
    await loadIstoric();
    Promise.all([loadApiHistory(),loadTrainingLab()]).catch(()=>{});
  } else if(activeId==='tab-apihistory'){
    await loadApiHistory();
    Promise.all([loadIstoric(),loadTrainingLab()]).catch(()=>{});
  } else if(activeId==='tab-traininglab'){
    await loadTrainingLab();
    Promise.all([loadIstoric(),loadApiHistory()]).catch(()=>{});
  } else {
    await loadIstoric();
    Promise.all([loadApiHistory(),loadTrainingLab()]).catch(()=>{});
  }
}

function cardKeyTitle(title){
  title=(title||'').toLowerCase();
  if(title.includes('smartbet')) return 'smartbet';
  if(title.includes('istoric api')) return 'apihistory';
  if(title.includes('ai training')) return 'traininglab';
  if(title.includes('istoric total')) return 'istoricfull';
  if(title.includes('motor de predicții') || title.includes('predicții unificat')) return 'smartbet';
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
  // tabs exist (accessible via switchTab from the archive panel) but are NOT added to menus
  // they are accessed only from the "Baza de Invatare" section inside the unified engine
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
  if(W.API_HISTORY_LEAGUE_FILTER!=='all'&&!leagues.includes(W.API_HISTORY_LEAGUE_FILTER)) W.API_HISTORY_LEAGUE_FILTER='all';
  const years=[...new Set(rows.filter(r=>W.API_HISTORY_LEAGUE_FILTER==='all'||r.league===W.API_HISTORY_LEAGUE_FILTER).map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a);
  if(W.API_HISTORY_YEAR_FILTER!=='all'&&!years.map(String).includes(String(W.API_HISTORY_YEAR_FILTER))) W.API_HISTORY_YEAR_FILTER='all';
  const filtered=rows.filter(r=>(W.API_HISTORY_LEAGUE_FILTER==='all'||r.league===W.API_HISTORY_LEAGUE_FILTER)&&(W.API_HISTORY_YEAR_FILTER==='all'||String(r.year)===String(W.API_HISTORY_YEAR_FILTER)));
  const view=W.API_HISTORY_VIEW==='indexed'?filtered.filter(r=>r.indexed):W.API_HISTORY_VIEW==='gaps'?filtered.filter(r=>r.valid&&!r.indexed):filtered;
  const valid=filtered.filter(r=>r.valid), indexed=filtered.filter(r=>r.indexed), gaps=filtered.filter(r=>r.valid&&!r.indexed);
  const totEvents=indexed.reduce((a,r)=>a+r.events,0), cov=valid.length?indexed.length/valid.length*100:0;
  const failures=arr(ev.failed_seasons_preview||ev.fetch_failures);
  const yrMin=validSum.coverage_start_year||Math.min(...years,0)||0;
  const yrMax=validSum.coverage_end_year||Math.max(...years,0)||0;
  top.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      ${card('Sezoane brute',fmt(rawSum.seasons_total||rows.length),rawSum.coverage_start_year&&rawSum.coverage_end_year?`${fmt(rawSum.coverage_start_year)} → ${fmt(rawSum.coverage_end_year)}`:'')}
      ${card('Sezoane valide',fmt(valid.length||validSum.seasons_total||0),`${fmt(validSum.leagues_total||leagues.length)} ligi`)}
      ${card('Sezoane indexate',fmt(indexed.length||ev.seasons_indexed||0),`${fmt(gaps.length)} gap-uri în filtrul curent`)}
      ${card('Coverage',valid.length?pct(cov,2):'—',yrMin&&yrMax?`${fmt(yrMin)} → ${fmt(yrMax)}`:'')}
      ${card('Meciuri numărate',fmt(totEvents||ev.total_events_counted||0),`lookback index: ${fmt(ev.season_lookback_years||0)} ani`)}
      ${card('Ultimul sync',timeFmt(ev.updated_at||sum.updated_at),freshness(ev.updated_at||sum.updated_at))}
    </div>
    <div style="margin-top:10px;display:grid;gap:8px">
      ${row(chip(W.API_HISTORY_VIEW==='all','Toate','setApiHistoryView','all')+chip(W.API_HISTORY_VIEW==='indexed','Indexate','setApiHistoryView','indexed')+chip(W.API_HISTORY_VIEW==='gaps','Gap-uri','setApiHistoryView','gaps'))}
      ${row(chip(W.API_HISTORY_LEAGUE_FILTER==='all','Toate ligile','setApiHistoryLeague','all')+leagues.map(l=>chip(W.API_HISTORY_LEAGUE_FILTER===l,esc(l),'setApiHistoryLeague',l)).join(''))}
      ${row(chip(W.API_HISTORY_YEAR_FILTER==='all','Toți anii','setApiHistoryYear','all')+years.map(y=>chip(String(W.API_HISTORY_YEAR_FILTER)===String(y),y,'setApiHistoryYear',y)).join(''))}
    </div>
    <div style="margin-top:10px">${infoBox('Ce înseamnă această secțiune',`Aici verifici dacă arhiva brută BSD este chiar integrată, nu doar dacă există un card în meniu. Semne bune: număr mare de sezoane valide, coverage mare între valide și indexate, meciuri numărate și timestamp recent.`, cov>=80?'green':cov>=50?'blue':'amber')}</div>
  `;

  const leagueTable=leagueMeta.slice().sort((a,b)=>(num(b.seasons_count)-num(a.seasons_count))||(num(b.last_year)-num(a.last_year))).slice(0,12).map(r=>`<tr><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:700">${esc(r.league)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.seasons_count)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.first_year)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.last_year)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${esc(r.latest_season_name||'—')}</td></tr>`).join('')||'<tr><td colspan="5" style="padding:12px">Nu există meta pe ligi.</td></tr>';
  const seasonTable=view.slice(0,80).map(r=>`<tr><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:700">${esc(r.league)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${esc(r.season)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${r.year?fmt(r.year):'—'}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${r.indexed?'da':'nu'}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.events)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.sample)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${dateFmt(r.start)} → ${dateFmt(r.end)}</td></tr>`).join('')||'<tr><td colspan="7" style="padding:12px">Nu există rânduri pentru filtrul ales.</td></tr>';
  const gapCards=(gaps.slice(0,8).map(r=>infoBox(`${esc(r.league)} • ${esc(r.season||r.year||'sezon')}`,`Valid: <b>${r.valid?'da':'nu'}</b> • Indexat: <b>${r.indexed?'da':'nu'}</b>${r.anoms&&r.anoms.length?`<br>Motive: ${esc(r.anoms.join(', '))}`:''}`,'amber')).join(''))||infoBox('Nu există gap-uri în filtrul curent','Pentru filtrul activ, toate sezoanele valide par indexate.','green');
  const failCards=(failures.slice(0,6).map(f=>infoBox(esc(f.league||f.season_name||f.season_id||'Season'),esc(f.error||'eroare necunoscută'),'amber')).join(''))||'';

  root.innerHTML=`
    ${section('Coverage pe ligi','Top ligi după numărul de sezoane istorice disponibile.',tableWrap(`<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:620px"><thead><tr style="text-align:left;color:var(--muted)"><th style="${th}">Ligă</th><th style="${th}">Sezoane</th><th style="${th}">Primul an</th><th style="${th}">Ultimul an</th><th style="${th}">Ultimul sezon</th></tr></thead><tbody>${leagueTable}</tbody></table>`))}
    ${section('Sezoane filtrate','Afișez maximum 80 rânduri pentru filtrul activ. Pe mobil tabelul se glisează orizontal.',tableWrap(`<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px"><thead><tr style="text-align:left;color:var(--muted)"><th style="${th}">Ligă</th><th style="${th}">Sezon</th><th style="${th}">An</th><th style="${th}">Indexat</th><th style="${th}">Meciuri</th><th style="${th}">Sample</th><th style="${th}">Interval</th></tr></thead><tbody>${seasonTable}</tbody></table>`)+`<div style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5">Afișez primele ${fmt(Math.min(view.length,80))} din ${fmt(view.length)} sezoane filtrate.</div>`)}
    ${section('Gap-uri și probleme vizibile','Exact aici vezi unde încă nu ai demonstrat integrarea completă. Dacă există sezoane valide fără indexare, AI-ul nu învață din ele.',`<div style="display:grid;gap:8px">${gapCards}${failCards?`<div style="margin-top:4px"></div>${failCards}`:''}</div>`)}
  `;
}

function renderTraining(){
  ensure();
  const top=$('tr-top'), root=$('tr-root');
  if(!top||!root) return;
  const rows=arr(W.TRAINING_MATCHES), base=arr(W.TRAINING_MARKET_BASELINES), sum=obj(W.TRAINING_DATASET_SUMMARY), ins=obj(W.TRAINING_INSIGHTS_SUMMARY), fails=arr(W.TRAINING_DATASET_FAILURES), feat=obj(W.TRAINING_FEATURE_SUMMARY), scoreSum=obj(W.TRAINING_SCORING_SUMMARY), model=obj(W.TRAINING_MODEL_SUMMARY), memory=obj(W.AI_MEMORY), memSum=obj(memory.summary), meta=obj(W.META);
  if(!rows.length&&!Object.keys(sum).length&&!Object.keys(model).length){root.innerHTML='<div class="empty-state">Nu există date pentru AI Training Lab.</div>'; return;}
  const miss=rows.filter(r=>!(r.date||r.event_date||r.eventDate)).length;
  const finals=['finished','ft','full_time','fulltime','full-time','completed','complete','closed','ended','final','aet','after_extra_time','after_extra','penalties','penalty_shootout'];
  const nonFinal=rows.filter(r=>r.status&&!finals.includes(String(r.status).toLowerCase())).length;
  const ids={}, exact={}; let h=0,d=0,a=0,b=0,o15=0,o25=0,u35=0;
  rows.forEach(r=>{ if(r.event_id!=null) ids[r.event_id]=(ids[r.event_id]||0)+1; const ek=[r.event_id,r.date,r.league,r.home_team,r.away_team,r.home_score,r.away_score].join('|'); exact[ek]=(exact[ek]||0)+1; h+=num(r.home_win); d+=num(r.draw); a+=num(r.away_win); b+=num(r.btts_yes); o15+=num(r.over_15); o25+=num(r.over_25); u35+=num(r.under_35); });
  const dup=Object.values(ids).reduce((s,v)=>s+(v>1?v-1:0),0);
  const exDup=Object.values(exact).reduce((s,v)=>s+(v>1?v-1:0),0);
  const low=base.filter(r=>num(r.matches)<120).length;
  const readyMarkets=arr(model.markets).filter(x=>x&&x.ready).length||arr(sum.markets_ready).length;
  const readiness=Math.max(0,100-(miss?35:0)-(nonFinal?20:0)-(dup?15:0)-(exDup?8:0)-(low?Math.min(10,low):0));
  const pipeline=`Dataset ${timeFmt(sum.updated_at)} • Features ${timeFmt(feat.updated_at)} • Model ${timeFmt(model.updated_at)} • AI Memory ${timeFmt(memory.updated_at||meta.started_at)}`;
  top.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
      ${card('Rows dataset',fmt(rows.length||sum.rows_total||0),`${fmt(sum.seasons_loaded||0)} sezoane încărcate`)}
      ${card('Rows ready min5',fmt(feat.eligible_min_history_5||model.rows_eligible_min5||0),feat.rows_with_features_min5_pct?`${pct(feat.rows_with_features_min5_pct,2)} acoperire`:'')}
      ${card('Ligi scoring',fmt(scoreSum.leagues_total_eligible||0),`${fmt(scoreSum.leagues_total_raw||0)} brute`)}
      ${card('Piețe model ready',fmt(readyMarkets),`${fmt(arr(model.markets).length)} piețe evaluate`)}
      ${card('AI Memory settled',fmt(memSum.settled_bets||0),`ROI ${pct(memSum.settled_roi||0,2)} • WR ${pct(memSum.settled_winrate||0,2)}`)}
      ${card('Adaptive picks',fmt(memSum.pending_scored||arr(memory.adaptive_picks).length),readiness>=85?'pipeline bun pentru învățare':readiness>=65?'pipeline mediu':'pipeline încă murdar')}
    </div>
    <div style="margin-top:10px">${infoBox('Pipeline end-to-end',`Ca să poți spune că AI Memory învață serios, nu ajunge să existe doar ecranul. Trebuie să fie populate succesiv datasetul, features, scoring, modelul și memoria adaptivă. <br><b>${pipeline}</b>`, readiness>=85?'green':readiness>=65?'blue':'amber')}</div>
  `;
  const rate=(x,n)=>n?pct(x/n*100,2):'—';
  const marketTable=arr(model.markets).map(r=>`<tr><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:700">${esc(r.market)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.rows)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.avg_prob,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.actual_rate,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${num(r.brier).toFixed(4)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.hit_rate_50,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${r.ready?'da':'nu'}</td></tr>`).join('')||'<tr><td colspan="7" style="padding:12px">Nu există sumar de model.</td></tr>';
  const baselineTable=base.slice().sort((x,y)=>num(y.matches)-num(x.matches)).slice(0,12).map(r=>`<tr><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:700">${esc(r.league)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${fmt(r.matches)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${num(r.avg_goals).toFixed(3)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.over_15_rate,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.over_25_rate,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.under_35_rate,2)}</td><td style="padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.06)">${pct(r.btts_yes_rate,2)}</td></tr>`).join('')||'<tr><td colspan="7" style="padding:12px">Nu există baseline-uri.</td></tr>';
  const topInsights=arr(ins.top_insights).slice(0,6).map(r=>mini(r.market||'Piață',`${esc(r.league||'—')} • ${pct(r.strength,2)}`,`${fmt(r.matches||0)} meciuri • ${esc(r.reason||'fără motiv')}`)).join('')||mini('Insights','Fără insights','workflow-ul trebuie să populeze training_insights_summary.json');
  const posPatterns=arr(memory.top_patterns).slice(0,5).map(r=>infoBox(esc(r.label||'pattern'),`WR ${pct(r.winrate||0,2)} • ROI ${pct(r.roi||0,2)} • ${fmt(r.raw_bets||0)} beturi`, 'green')).join('')||'';
  const negPatterns=arr(memory.avoid_patterns).slice(0,5).map(r=>infoBox(esc(r.label||'pattern'),`WR ${pct(r.winrate||0,2)} • ROI ${pct(r.roi||0,2)} • ${fmt(r.raw_bets||0)} beturi`, 'red')).join('')||'';
  const adaptivePreview=arr(memory.adaptive_picks).slice(0,6).map(r=>`<div class="list-item" style="margin-top:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div><div style="font-weight:700">${esc(r.home||'')} vs ${esc(r.away||'')}</div><div style="font-size:12px;color:var(--muted)">${esc(r.league||'')} • ${esc(r.market||'')} @ ${num(r.odds).toFixed(2)}</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:800;color:var(--acc)">Adapt ${num(r.adaptive_score).toFixed(1)}</div><div style="font-size:11px;color:${num(r.memory_bonus)>=0?'var(--grn)':'var(--red)'};margin-top:4px">Mem ${num(r.memory_bonus)>=0?'+':''}${num(r.memory_bonus).toFixed(1)}</div></div></div><div style="font-size:11px;color:var(--muted);margin-top:6px">Prob adj ${pct(r.adjusted_prob||0,2)} • Edge ${pct(r.edge_pct||0,2)} • ${dateFmt(r.event_date)}</div></div>`).join('')||'<div class="empty-state">Încă nu există adaptive picks în memoria curentă.</div>';
  root.innerHTML=`
    ${section('Calitatea datasetului','Aici verifici dacă pipeline-ul de training este suficient de curat pentru a alimenta modele și memorie, nu doar dacă există fișiere.',`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">${card('Rows fără dată',fmt(miss),miss?'split temporal blocat':'ok')}${card('Rows non-final',fmt(nonFinal),nonFinal?'live/cancel în dataset':'ok')}${card('Duplicate event_id',fmt(dup),dup?'necesită dedupe':'ok')}${card('Duplicate exacte',fmt(exDup),exDup?'verifică pipeline':'ok')}${card('1X2',`${rate(h,rows.length)} / ${rate(d,rows.length)} / ${rate(a,rows.length)}`,'1 / X / 2')}${card('BTTS / O2.5 / U3.5',`${rate(b,rows.length)} / ${rate(o25,rows.length)} / ${rate(u35,rows.length)}`)}${card('Readiness',fmt(readiness),readiness>=85?'gata pentru learning':readiness>=65?'util, dar încă murdar':'mai trebuie curățat')}</div>`)}
    ${section('Model summary','Aici se vede dacă există evaluare reală pe piețe, nu doar heuristică.',tableWrap(`<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px"><thead><tr style="text-align:left;color:var(--muted)"><th style="${th}">Piață</th><th style="${th}">Rows</th><th style="${th}">Prob. medie</th><th style="${th}">Rată reală</th><th style="${th}">Brier</th><th style="${th}">Hit rate 50</th><th style="${th}">Ready</th></tr></thead><tbody>${marketTable}</tbody></table>`)+`<div style="font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5">Versiune model: <b>${esc(model.version||'—')}</b>. Feature basis: ${esc(arr(model.feature_basis).slice(0,8).join(', '))}${arr(model.feature_basis).length>8?'…':''}</div>`)}
    ${section('Baseline-uri pe ligi','Primele ligi după volum în warehouse-ul de training.',tableWrap(`<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px"><thead><tr style="text-align:left;color:var(--muted)"><th style="${th}">Ligă</th><th style="${th}">Meciuri</th><th style="${th}">Goluri medii</th><th style="${th}">O1.5</th><th style="${th}">O2.5</th><th style="${th}">U3.5</th><th style="${th}">BTTS</th></tr></thead><tbody>${baselineTable}</tbody></table>`))}
    ${section('Top insights din training','Pattern-uri care ies din scoring și pot susține sau penaliza viitoarele recomandări.',`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">${topInsights}</div>`)}
    ${section('AI Memory – pattern-uri utile vs. pattern-uri de evitat','Aici începe partea de memorie adaptivă: ce trebuie împins și ce trebuie blocat.',`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px"><div>${mini('Memory version',esc(memory.version||'—'))}${mini('Patterns pozitive',fmt(memSum.positive_patterns||0))}${mini('Patterns negative',fmt(memSum.negative_patterns||0))}</div><div>${mini('Settled',fmt(memSum.settled_bets||0),`wins ${fmt(memSum.settled_wins||0)} / losses ${fmt(memSum.settled_losses||0)}`)}${mini('Winrate',pct(memSum.settled_winrate||0,2))}${mini('ROI',pct(memSum.settled_roi||0,2))}</div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:12px">${posPatterns||infoBox('Fără pattern-uri pozitive','Nu există încă destule exemple.', 'amber')}${negPatterns||infoBox('Fără pattern-uri negative','Nu există încă destule exemple pentru blocaje.', 'blue')}</div>`)}
    ${section('Adaptive picks curente','Selecțiile care primesc rescoring din memorie și pot fi folosite de SmartBet Engine.',adaptivePreview)}
    ${fails.length?section('Eșecuri în dataset','Preview din sezoanele care au picat la build.',`<div style="display:grid;gap:8px">${fails.slice(0,6).map(f=>infoBox(esc(f.league||f.season_name||f.season_id||'Season'),esc(f.error||'eroare necunoscută'),'amber')).join('')}</div>`):''}
  `;
}

function rerender(){
  try{
    ensure();
    decorateMoreCards();
    if($('tab-istoricfull')?.classList.contains('active')) renderFull();
    if($('tab-apihistory')?.classList.contains('active')) renderApi();
    if($('tab-traininglab')?.classList.contains('active')) renderTraining();
  }catch(e){console.error(e);}
}

function boot(){
  ensure();
  if(typeof W.switchTab==='function'&&!W.__fhFixTab){
    const old=W.switchTab;
    W.switchTab=function(name){
      const r=old.apply(this,arguments);
      if(name==='istoricfull'){
        // Dacă datele sunt deja încărcate → render imediat; altfel așteptăm
        if(_L.RECOMMENDATION_JOURNAL) setTimeout(renderFull,0);
        else loadIstoric().then(()=>{ if(($('tab-istoricfull')||{}).classList&&$('tab-istoricfull').classList.contains('active')) renderFull(); }).catch(()=>{});
      }
      if(name==='apihistory'){
        if(_L.API_HISTORY_SUMMARY) setTimeout(renderApi,0);
        else loadApiHistory().then(()=>{ if(($('tab-apihistory')||{}).classList&&$('tab-apihistory').classList.contains('active')) renderApi(); }).catch(()=>{});
      }
      if(name==='traininglab'){
        if(_L.TRAINING_DATASET_SUMMARY) setTimeout(renderTraining,0);
        else loadTrainingLab().then(()=>{ if(($('tab-traininglab')||{}).classList&&$('tab-traininglab').classList.contains('active')) renderTraining(); }).catch(()=>{});
      }
      setTimeout(decorateMoreCards,0);
      if(name==='smartbet') setTimeout(()=>{ if(typeof W.renderArchivePanel==='function') W.renderArchivePanel(); },100);
      return r;
    };
    W.__fhFixTab=1;
  }
  if(typeof W.doRefresh==='function'&&!W.__fhFixRefresh){
    const old=W.doRefresh;
    W.doRefresh=async function(){
      const r=await old.apply(this,arguments);
      await load();
      rerender();
      return r;
    };
    W.__fhFixRefresh=1;
  }
  load().then(()=>{
    decorateMoreCards();
    // Render explicit pentru tab-ul activ după ce datele s-au încărcat
    const _aid=(document.querySelector('.tab-content.active')||{}).id||'';
    if(_aid==='tab-istoricfull') renderFull();
    else if(_aid==='tab-apihistory') renderApi();
    else if(_aid==='tab-traininglab') renderTraining();
    else rerender();
    W.RECOMMENDATION_JOURNAL = W.RECOMMENDATION_JOURNAL || [];
    if(typeof W.renderArchivePanel === 'function') setTimeout(W.renderArchivePanel, 200);
  });
}

W.setFullHistoryRange=v=>{W.FULL_HISTORY_RANGE=v||'total'; renderFull();};
W.setApiHistoryLeague=v=>{W.API_HISTORY_LEAGUE_FILTER=v||'all'; W.API_HISTORY_YEAR_FILTER='all'; renderApi();};
W.setApiHistoryYear=v=>{W.API_HISTORY_YEAR_FILTER=v||'all'; renderApi();};
W.setApiHistoryView=v=>{W.API_HISTORY_VIEW=v||'all'; renderApi();};

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
