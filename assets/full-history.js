(function(){
window.RECOMMENDATION_JOURNAL=Array.isArray(window.RECOMMENDATION_JOURNAL)?window.RECOMMENDATION_JOURNAL:[];
window.API_HISTORY_SUMMARY=window.API_HISTORY_SUMMARY||null;
window.API_HISTORY_LEAGUES=Array.isArray(window.API_HISTORY_LEAGUES)?window.API_HISTORY_LEAGUES:[];
window.FULL_HISTORY_RANGE=window.FULL_HISTORY_RANGE||'total';
window.FULL_HISTORY_MARKET=window.FULL_HISTORY_MARKET||'';

async function fetchJsonFallback(paths,fallback){
 for(var i=0;i<paths.length;i++){
  try{
   if(typeof getJson==='function') return await getJson(paths[i],fallback);
   var res=await fetch(paths[i],{cache:'no-store'});
   if(!res.ok) continue;
   return await res.json();
  }catch(e){}
 }
 return fallback;
}

async function loadExtraHistoryData(){
 try{var d=await fetchJsonFallback(['./data/recommendation_journal.json','data/recommendation_journal.json','/BetAnalyticsProV3/data/recommendation_journal.json','/data/recommendation_journal.json'],[]);window.RECOMMENDATION_JOURNAL=Array.isArray(d)?d:(d&&d.results)||[];}catch(e){}
 try{window.API_HISTORY_SUMMARY=await fetchJsonFallback(['./data/api_history_summary.json','data/api_history_summary.json','/BetAnalyticsProV3/data/api_history_summary.json','/data/api_history_summary.json'],null);}catch(e){window.API_HISTORY_SUMMARY=null;}
 try{var l=await fetchJsonFallback(['./data/api_history_leagues.json','data/api_history_leagues.json','/BetAnalyticsProV3/data/api_history_leagues.json','/data/api_history_leagues.json'],[]);window.API_HISTORY_LEAGUES=Array.isArray(l)?l:(l&&l.results)||[];}catch(e){window.API_HISTORY_LEAGUES=[];}
}

function patch(){
 if(typeof window.doRefresh==='function'&&!window.__fh_refresh){
  var o=window.doRefresh;window.doRefresh=async function(){
   var r=await o.apply(this,arguments);
   await loadExtraHistoryData();
   try{ensureUI();if($('tab-istoricfull')&&$('tab-istoricfull').classList.contains('active'))renderFullHistory();if($('tab-apihistory')&&$('tab-apihistory').classList.contains('active'))renderApiHistory();}catch(e){}
   return r
  };window.__fh_refresh=1;
 }
 if(typeof window.switchTab==='function'&&!window.__fh_tab){var s=window.switchTab;window.switchTab=function(n){var r=s.apply(this,arguments);if(n==='istoricfull')setTimeout(renderFullHistory,0);if(n==='apihistory')setTimeout(renderApiHistory,0);return r};window.__fh_tab=1;}
 if(typeof window.renderAll==='function'&&!window.__fh_render){var a=window.renderAll;window.renderAll=function(){var r=a.apply(this,arguments);try{ensureUI();}catch(e){}return r};window.__fh_render=1;}
 ensureUI();
 loadExtraHistoryData().then(function(){try{if($('tab-apihistory')&&$('tab-apihistory').classList.contains('active'))renderApiHistory();if($('tab-istoricfull')&&$('tab-istoricfull').classList.contains('active'))renderFullHistory();}catch(e){}});
}

function norm(x,src){if(!x)return null;return {journal_id:x.journal_id||null,source_kind:x.source_kind||x.source||src||'archive',status:x.status||getHistory21Status(x),won:x.won,event_id:x.event_id,prediction_id:x.prediction_id,home:x.home||'',away:x.away||'',league:x.league||'',event_date:x.event_date||x.date||'',date:x.event_date||x.date||'',market:x.market||inferMarketTypeFromLabel(x.market||''),market_key:x.market_key||inferMarketTypeFromLabel(x.market||''),odds:Number(x.odds||x.book_odds||0),adjusted_prob:Number(x.adjusted_prob||x.prob||0),edge_pct:Number(x.edge_pct||x.edge||0),value:Number(x.value||0),score:Number(x.score||0),logged_at:x.first_logged_at||x.logged_at||x.created_at||x.prediction_created_at||x.event_date||x.date||null,prediction_created_at:x.prediction_created_at||x.created_at||null,home_score:x.home_score!=null?Number(x.home_score):null,away_score:x.away_score!=null?Number(x.away_score):null,snapshot_count:Number(x.snapshot_count||1),opening_odds:x.opening_odds!=null?Number(x.opening_odds):null,previous_odds:x.previous_odds!=null?Number(x.previous_odds):null,line_movement_pct:Number(x.line_movement_pct||0),from_open_pct:Number(x.from_open_pct||0)};}
function rows(){var a=[];(window.RECOMMENDATION_JOURNAL||[]).forEach(function(x){var n=norm(x,'journal_live');if(n)a.push(n)});if(!a.length){(window.RECOMMENDATION_LOG||[]).forEach(function(x){var n=norm(x,'recommendation_log');if(n)a.push(n)});(window.HISTORY_ENGINE||[]).forEach(function(x){var n=norm(x,'api_backfill');if(n)a.push(n)});}return a.sort(function(x,y){return new Date(y.logged_at||y.event_date||0)-new Date(x.logged_at||x.event_date||0)});}
function filterRange(list){if(window.FULL_HISTORY_RANGE==='total')return list;var days=window.FULL_HISTORY_RANGE==='week'?7:window.FULL_HISTORY_RANGE==='month'?30:365;var c=Date.now()-days*86400000;return list.filter(function(x){var t=new Date(x.logged_at||x.event_date||0).getTime();return isFinite(t)&&t>=c});}
function labelRange(){return window.FULL_HISTORY_RANGE==='week'?'7 zile':window.FULL_HISTORY_RANGE==='month'?'30 zile':window.FULL_HISTORY_RANGE==='year'?'12 luni':'total';}
function sum(range,list){return buildHistory21Group(labelRange(),range,list);}
function chip(src){src=String(src||'').toLowerCase();if(src.indexOf('api_backfill')>=0)return 'API';if(src.indexOf('journal')>=0)return 'JURNAL';if(src.indexOf('match')>=0)return 'LIVE';return 'ARHIVA';}
function safe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function ensureUI(){
 if(!$('tab-istoricfull')){var main=document.querySelector('.main');if(main){var d=document.createElement('div');d.className='tab-content';d.id='tab-istoricfull';d.innerHTML='<div class="section"><div class="sec-title">Istoric total</div><div id="fh-top" style="margin-top:10px"></div><div id="fh-root" style="margin-top:10px"></div></div>';var ref=$('tab-istoric21');if(ref&&ref.nextSibling)main.insertBefore(d,ref.nextSibling);else main.appendChild(d);}}
 if(!$('tab-apihistory')){var main2=document.querySelector('.main');if(main2){var d2=document.createElement('div');d2.className='tab-content';d2.id='tab-apihistory';d2.innerHTML='<div class="section"><div class="sec-title">Istoric API total</div><div id="apih-top" style="margin-top:10px"></div><div id="apih-root" style="margin-top:10px"></div></div>';var ref2=$('tab-istoricfull')||$('tab-istoric21');if(ref2&&ref2.nextSibling)main2.insertBefore(d2,ref2.nextSibling);else main2.appendChild(d2);}}
 var g=document.querySelector('.desktop-more-panel .more-grid');if(g&&!g.querySelector('[data-more-card="istoricfull"]')){var b=document.createElement('button');b.className='more-card-btn';b.setAttribute('data-more-card','istoricfull');b.setAttribute('onclick',"switchTab('istoricfull')");b.innerHTML='<span class="more-card-title">Istoric total</span><span class="more-card-sub">Arhiva completa</span>';g.appendChild(b);}if(g&&!g.querySelector('[data-more-card="apihistory"]')){var b2=document.createElement('button');b2.className='more-card-btn';b2.setAttribute('data-more-card','apihistory');b2.setAttribute('onclick',"switchTab('apihistory')");b2.innerHTML='<span class="more-card-title">Istoric API total</span><span class="more-card-sub">Catalog sezoane si acoperire API</span>';g.appendChild(b2);}
 var m=$('mobile-sheet');if(m&&!m.querySelector('[data-sheet-btn="istoricfull"]')){var x=document.createElement('button');x.className='mobile-sheet-btn';x.setAttribute('data-sheet-btn','istoricfull');x.setAttribute('onclick',"switchTab('istoricfull');closeMobileMore()");x.innerHTML='<span class="sheet-btn-title">Istoric total</span>';m.appendChild(x);}if(m&&!m.querySelector('[data-sheet-btn="apihistory"]')){var x2=document.createElement('button');x2.className='mobile-sheet-btn';x2.setAttribute('data-sheet-btn','apihistory');x2.setAttribute('onclick',"switchTab('apihistory');closeMobileMore()");x2.innerHTML='<span class="sheet-btn-title">Istoric API total</span>';m.appendChild(x2);}
}

window.setFullHistoryRange=function(r){window.FULL_HISTORY_RANGE=r||'total';renderFullHistory();};
window.setFullHistoryMarket=function(m){window.FULL_HISTORY_MARKET=m||'';renderFullHistory();};
window.renderFullHistory=function(){ensureUI();var top=$('fh-top'),root=$('fh-root');if(!top||!root)return;var all=rows();if(!all.length){root.innerHTML='<div class="empty-state">Nu exista date.</div>';return;}var ranges=['week','month','year','total'];top.innerHTML=ranges.map(function(r){var old=window.FULL_HISTORY_RANGE;window.FULL_HISTORY_RANGE=r;var s=sum(r,filterRange(all));window.FULL_HISTORY_RANGE=old;var active=window.FULL_HISTORY_RANGE===r;return '<button class="filter-chip '+(active?'on':'')+'" onclick="setFullHistoryRange(\''+r+'\')">'+(r==='week'?'7 zile':r==='month'?'30 zile':r==='year'?'12 luni':'total')+' • '+s.wins+'/'+s.bets+'</button>'}).join(' ');
 var rr=filterRange(all);var defs=getHistory21CategoryDefs(rr);var groups=defs.map(function(d){return buildHistory21Group(d.label,d.key,rr.filter(function(x){return historyRowMatchesCategory(x,d.key)}));}).filter(function(x){return x.total>0});if(!groups.length){root.innerHTML='<div class="empty-state">Nu exista date pe interval.</div>';return;}if(!window.FULL_HISTORY_MARKET||groups.every(function(g){return g.market!==window.FULL_HISTORY_MARKET;}))window.FULL_HISTORY_MARKET=groups[0].market;var head='<div style="display:grid;gap:8px">'+groups.map(function(g){return '<button class="filter-chip '+(window.FULL_HISTORY_MARKET===g.market?'on':'')+'" onclick="setFullHistoryMarket(\''+safe(g.market)+'\')">'+safe(g.label)+' '+g.wins+'/'+g.bets+' ROI '+(g.bets?g.roi.toFixed(1):'0')+'%</button>'}).join('')+'</div>';var cur=groups.find(function(g){return g.market===window.FULL_HISTORY_MARKET;})||groups[0];var body=cur.list.map(function(r){var st=(r.status||getHistory21Status(r)||'pending').toUpperCase();return '<div class="list-item" style="margin-top:8px"><div style="font-weight:700">'+safe(getHistoryEventName(r)||((r.home||'')+' vs '+(r.away||'')))+'</div><div style="font-size:12px;color:var(--muted)">'+safe(r.league)+' • '+safe(r.market)+' @ '+Number(r.odds||0).toFixed(2)+' • '+chip(r.source_kind)+'</div><div style="font-size:12px;color:var(--muted)">Prob '+Number(r.adjusted_prob||0).toFixed(1)+'% • Edge '+Number(r.edge_pct||0).toFixed(1)+' • Value '+(Number(r.value||0)*100).toFixed(1)+'%</div><div style="font-size:12px">'+st+(r.home_score!=null&&r.away_score!=null?' • scor '+r.home_score+'-'+r.away_score:'')+'</div></div>';}).join('');root.innerHTML=head+body;};
window.renderApiHistory=function(){ensureUI();var top=$('apih-top'),root=$('apih-root');if(!top||!root)return;var s=window.API_HISTORY_SUMMARY||{};var valid=s.valid||{};var raw=s.raw||{};var leagues=Array.isArray(window.API_HISTORY_LEAGUES)?window.API_HISTORY_LEAGUES:[];if(!Object.keys(s).length&&!leagues.length){root.innerHTML='<div class="empty-state">Nu exista inca date API history.</div>';return;}top.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">'+
 '<div class="metric"><div class="label">Sezoane valide</div><div class="value">'+Number(valid.seasons_total||leagues.reduce(function(a,x){return a+Number(x.seasons_count||0)},0)).toLocaleString('ro-RO')+'</div></div>'+
 '<div class="metric"><div class="label">Ligi valide</div><div class="value">'+Number(valid.leagues_total||leagues.length).toLocaleString('ro-RO')+'</div></div>'+
 '<div class="metric"><div class="label">Start valid</div><div class="value">'+safe(valid.coverage_start_year||'—')+'</div></div>'+
 '<div class="metric"><div class="label">End valid</div><div class="value">'+safe(valid.coverage_end_year||'—')+'</div></div>'+
 '<div class="metric"><div class="label">Raw sezoane</div><div class="value">'+Number(raw.seasons_total||0).toLocaleString('ro-RO')+'</div></div>'+
 '<div class="metric"><div class="label">Anomalii</div><div class="value">'+Number(s.anomalies_total||0).toLocaleString('ro-RO')+'</div></div>'+
 '</div><div style="font-size:12px;color:var(--muted);margin-top:10px">Catalog normalizat din /api/seasons/. Sezoanele viitoare sau suspecte sunt mutate în anomalii, iar lista de mai jos arată doar istoricul valid pentru lucru și training.</div>';
 var cards=leagues.slice(0,34).map(function(r){return '<div class="list-item" style="margin-top:8px"><div style="font-weight:800">'+safe(r.league)+'</div><div style="font-size:12px;color:var(--muted)">Sezoane '+Number(r.seasons_count||0)+' • ani '+safe(r.first_year)+' → '+safe(r.last_year)+'</div><div style="font-size:12px;color:var(--muted)">Ultim sezon valid '+safe(r.latest_season_name||'—')+' • ID '+safe(r.latest_season_id||'—')+'</div></div>';}).join('');root.innerHTML=cards||'<div class="empty-state">Nu exista ligi istorice.</div>';};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch);else patch();
})();
