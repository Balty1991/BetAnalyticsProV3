// Runtime UI patches for BetAnalytics Pro
(function(){
  'use strict';

  var DAY_MS = 86400000;
  var DAYS = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
  var MONTHS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var RAW_LOG = [];
  var RAW_HIST = [];
  window.__baSevenDayIndexSelected = window.__baSevenDayIndexSelected || 'd1';
  window.__baSevenDayIndexRuntimeVersion = 5;

  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function fmtInt(n){try{return Math.round(Number(n)||0).toLocaleString('ro-RO')}catch(e){return String(Math.round(Number(n)||0))}}
  function signed(n,suf){var x=Number(n||0);return (x>=0?'+':'')+x.toFixed(1)+(suf||'')}
  function sod(d){var x=new Date(d||Date.now());x.setHours(0,0,0,0);return x}
  function dayKey(d){var x=sod(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
  function dateOffset(n){var d=sod(new Date());d.setDate(d.getDate()-n);return d}
  function stamp(r){var raw=r&&(r.event_date||r.eventDate||r.match_date||r.date||r.kickoff||r.start_time||r.event_time||r.logged_at||r.prediction_created_at);var t=raw?new Date(raw).getTime():NaN;return isFinite(t)?t:0}
  function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9.]/g,'')}
  function marketKey(r){
    var m=norm(r&&(r.market_key||r.market||r.bet||r.pick||r.prediction||r.type||''));
    if(m.indexOf('over15')>=0||m.indexOf('over1.5')>=0||m.indexOf('peste1.5')>=0)return 'over15';
    if(m.indexOf('over25')>=0||m.indexOf('over2.5')>=0||m.indexOf('peste2.5')>=0)return 'over25';
    if(m.indexOf('under35')>=0||m.indexOf('under3.5')>=0||m.indexOf('sub3.5')>=0)return 'under35';
    if(m.indexOf('under25')>=0||m.indexOf('under2.5')>=0||m.indexOf('sub2.5')>=0)return 'under25';
    if(m.indexOf('btts')>=0||m==='gg'||m.indexOf('bothteamstoscore')>=0)return 'btts';
    if(m.indexOf('homewin')>=0||m==='1')return 'homeWin';
    if(m.indexOf('awaywin')>=0||m==='2')return 'awayWin';
    if(m==='x'||m.indexOf('draw')>=0)return 'draw';
    return m;
  }
  function labelFor(k){return ({over15:'Over 1.5G',over25:'Over 2.5G',under35:'Under 3.5G',under25:'Under 2.5G',btts:'BTTS',safe:'Top analizate',value:'Value'})[k]||k}
  function boolRes(v){
    if(v===null||v===undefined||v==='')return '';
    if(v===true||v===1||v==='1')return 'win';
    if(v===false||v===0||v==='0')return 'loss';
    var s=String(v).toLowerCase().trim();
    if(['true','yes','y','won','win','w','hit','success','passed','profit'].indexOf(s)>=0)return 'win';
    if(['false','no','n','lost','loss','lose','l','miss','failed','fail','red'].indexOf(s)>=0)return 'loss';
    return '';
  }
  function scoreStatus(r){
    if(!r)return '';
    var hs=Number(r.home_score!=null?r.home_score:(r.homeScore!=null?r.homeScore:r.score_home));
    var as=Number(r.away_score!=null?r.away_score:(r.awayScore!=null?r.awayScore:r.score_away));
    if(!isFinite(hs)||!isFinite(as))return '';
    var t=hs+as,k=marketKey(r),ok=null;
    if(k==='under35')ok=t<3.5;else if(k==='under25')ok=t<2.5;else if(k==='over15')ok=t>1.5;else if(k==='over25')ok=t>2.5;else if(k==='btts')ok=hs>0&&as>0;else if(k==='homeWin')ok=hs>as;else if(k==='awayWin')ok=as>hs;else if(k==='draw')ok=hs===as;
    return ok===null?'':(ok?'win':'loss');
  }
  function statusOf(r){
    if(!r)return '';
    var b=boolRes(r.won); if(b)return b;
    b=boolRes(r.is_win); if(b)return b;
    b=boolRes(r.isWon); if(b)return b;
    b=boolRes(r.success); if(b)return b;
    b=boolRes(r.hit); if(b)return b;
    b=scoreStatus(r); if(b)return b;
    var s=String(r.status||r.result||r.outcome||r.final_status||'').toLowerCase().trim();
    if(!s||s==='pending'||s==='open'||s==='void'||s==='push')return '';
    if(s==='w'||s==='win'||s==='won'||s.indexOf('win')>=0||s.indexOf('won')>=0||s.indexOf('hit')>=0)return 'win';
    if(s==='l'||s==='loss'||s==='lost'||s==='lose'||s.indexOf('loss')>=0||s.indexOf('lost')>=0||s.indexOf('lose')>=0||s.indexOf('miss')>=0||s.indexOf('fail')>=0)return 'loss';
    return '';
  }
  function isPending(r){
    if(!r||!stamp(r)||statusOf(r))return false;
    var s=String(r.status||'').toLowerCase().trim();
    return s==='pending'||s==='open'||r.won==null;
  }
  function rowKey(r){var t=stamp(r);return (r&&r.prediction_id!=null?'p:'+r.prediction_id:(r&&r.log_id!=null?'l:'+r.log_id:'e:'+(r.event_id||r.fixture_id||'')+'|'+marketKey(r)+'|'+(t?dayKey(new Date(t)):'')))}
  function fetchJson(path,force){return fetch(path+(force?'?t='+Date.now():''),{cache:force?'no-store':'default'}).then(function(r){return r.ok?r.json():[]}).catch(function(){return []})}
  function loadRaw(force){return Promise.all([fetchJson('data/recommendation_log.json',force),fetchJson('data/history_engine.json',force),fetchJson('data/api_events_history_summary.json',force)]).then(function(x){RAW_LOG=Array.isArray(x[0])?x[0]:[];RAW_HIST=Array.isArray(x[1])?x[1]:[];patchAll();patchApiLabel(x[2]);})}
  function rawRows(){
    var pools=[RAW_LOG,window.RECOMMENDATION_LOG,RAW_HIST,window.HISTORY_ENGINE],seen={},out=[];
    pools.forEach(function(p){if(!Array.isArray(p))return;p.forEach(function(r){if(!r||!stamp(r))return;var k=rowKey(r)||('i:'+out.length);if(seen[k])return;seen[k]=1;out.push(r)})});
    return out;
  }
  function rowsSince(daysBack, includeFuture){
    var cut=Date.now()-daysBack*DAY_MS, now=Date.now()+DAY_MS*365;
    return rawRows().filter(function(r){var t=stamp(r);return t>=cut&&(includeFuture||t<=now)});
  }
  function matchCat(r,k){var mk=marketKey(r);if(k==='safe')return Number(r.score||0)>=80||String(r.verdict||'').toLowerCase()==='safe';if(k==='value')return Number(r.value||0)>=0.05;return mk===k}
  function buildGroup(label,k,rows){
    var settled=rows.filter(function(r){return statusOf(r)&&matchCat(r,k)}), pending=rows.filter(function(r){return isPending(r)&&matchCat(r,k)});
    var wins=settled.filter(function(r){return statusOf(r)==='win'}).length;
    var profit=settled.reduce(function(a,r){var o=Number(r.odds||r.book_odds||r.final_odds||r.baseOdds||r.market_odds||0);return a+(statusOf(r)==='win'?(o>1?o-1:0):-1)},0);
    var oddsSum=settled.reduce(function(a,r){return a+Number(r.odds||r.book_odds||r.final_odds||r.baseOdds||r.market_odds||0)},0);
    return {key:k,label:label,bets:settled.length,wins:wins,losses:Math.max(0,settled.length-wins),pending:pending.length,roi:settled.length?profit*100/settled.length:0,profit:profit,winrate:settled.length?wins*100/settled.length:0,avgOdds:settled.length?oddsSum/settled.length:0};
  }
  function getGroups(){var rows=rowsSince(21,true);var defs=[['Over 1.5G','over15'],['Under 3.5G','under35'],['BTTS','btts'],['Top analizate','safe'],['Value','value']];return defs.map(function(d){return buildGroup(d[0],d[1],rows)}).filter(function(g){return g.bets||g.pending})}
  function textColor(v){return Number(v)>0?'var(--grn)':(Number(v)<0?'var(--red)':'var(--txt)')}
  function winColor(v){return Number(v)>=65?'var(--grn)':(Number(v)<50?'var(--red)':'var(--txt)')}

  function addCss(){
    if(document.getElementById('ba-runtime-v5-css'))return;
    ['ba-seven-day-index-css','ba-seven-day-index-css-v4'].forEach(function(id){var old=document.getElementById(id);if(old)old.remove()});
    var s=document.createElement('style');s.id='ba-runtime-v5-css';
    s.textContent=[
      '.dash-yday-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap!important}.dash-yday-head-note{font-family:var(--mono)!important;font-size:9px!important;font-weight:700!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important}',
      '.dash-yday-date-row{display:flex!important;gap:7px!important;overflow-x:auto!important;scrollbar-width:none!important;padding:9px 0 10px!important;margin:2px 0 0!important;-webkit-overflow-scrolling:touch!important}.dash-yday-date-row::-webkit-scrollbar{display:none!important}',
      '.dash-yday-date-btn{flex:0 0 auto!important;min-width:74px!important;border:1px solid rgba(255,255,255,.075)!important;background:rgba(255,255,255,.035)!important;color:var(--muted)!important;border-radius:999px!important;padding:7px 10px!important;font-family:var(--mono)!important;font-size:9px!important;font-weight:900!important;letter-spacing:.06em!important;text-transform:uppercase!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;white-space:nowrap!important}.dash-yday-date-btn span{font-family:var(--font-sans,system-ui)!important;font-size:10px!important;font-weight:900!important;letter-spacing:0!important;color:var(--txt)!important;opacity:.9!important}.dash-yday-date-btn.active{border-color:rgba(43,229,197,.45)!important;background:linear-gradient(135deg,rgba(43,229,197,.17),rgba(59,130,246,.08))!important;color:var(--acc)!important;box-shadow:0 0 0 1px rgba(43,229,197,.08) inset!important}.dash-yday-date-btn.total{min-width:108px!important}',
      '.dash-yday-index{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin:0 0 8px!important}.dash-yday-index-item{min-width:0!important;padding:8px 9px!important;border-radius:13px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018))!important;border:1px solid rgba(255,255,255,.075)!important;display:grid!important;gap:3px!important}.dash-yday-index-k{font-family:var(--mono)!important;font-size:8.5px!important;font-weight:800!important;letter-spacing:.10em!important;text-transform:uppercase!important;color:var(--muted)!important;white-space:nowrap!important}.dash-yday-index-v{font-family:var(--font-display,var(--font-sans,system-ui))!important;font-feature-settings:"tnum" 1!important;font-size:15px!important;font-weight:900!important;line-height:1!important;color:var(--txt);white-space:nowrap!important}.dash-yday-index-win .dash-yday-index-v{color:var(--grn)!important}.dash-yday-index-loss .dash-yday-index-v{color:var(--red)!important}',
      '.dash-yday-more{flex:0 0 auto!important;padding:9px 12px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.08)!important;color:var(--muted)!important;background:rgba(255,255,255,.03)!important;font-family:var(--mono)!important;font-size:9px!important;font-weight:800!important}.dash-yday-pill em{font-style:normal!important;color:var(--muted)!important;margin-left:4px!important}',
      '.ba-profit-row{box-shadow:inset 3px 0 0 rgba(34,197,94,.65)!important}.ba-loss-row{box-shadow:inset 3px 0 0 rgba(239,68,68,.65)!important}.ba-profit-row .dash-cat-name{color:var(--grn)!important}.ba-loss-row .dash-cat-name{color:var(--red)!important}',
      '@media(max-width:420px){.dash-yday-index{grid-template-columns:repeat(2,minmax(0,1fr))!important}.dash-yday-head-note{width:100%!important}.dash-yday-date-btn{min-width:68px!important;padding:7px 9px!important}}'
    ].join('');document.head.appendChild(s);
  }

  function patchApiLabel(summary){
    var box=document.querySelector('#hybrid-main-copy'); if(!box)return;
    var total=Number(summary&&summary.total_events_counted||58033);
    var active=Number((((window.ADAPTIVE_PREDICTIONS||{}).summary)||{}).api_history_active_matches||(((window.AI_MEMORY||{}).summary)||{}).api_history_matches||0)||total;
    box.innerHTML=(box.innerHTML||'').replace(/📊 API History \([^)]+\)/g,'📊 API History ('+fmtInt(total)+' total • '+fmtInt(active)+' active în motor)');
  }

  function patchCatTables(){
    var groups=getGroups(); if(!groups.length)return;
    var rows=groups.map(function(g){var roi=Number(g.roi||0),wr=Number(g.winrate||0),cls=roi>0?'ba-profit-row':(roi<0?'ba-loss-row':'');return '<tr class="dash-cat-row '+cls+'"><td class="dash-cat-name">'+esc(g.label)+'</td><td class="dash-cat-val" style="color:'+textColor(roi)+'">'+signed(roi,'%')+'</td><td class="dash-cat-val" style="color:'+winColor(wr)+'">'+(g.bets?wr.toFixed(0)+'%':'—')+'</td><td class="dash-cat-val">'+fmtInt(g.wins)+'/'+fmtInt(g.bets)+'</td><td class="dash-cat-val dash-cat-pending">'+(g.pending?fmtInt(g.pending):'—')+'</td></tr>'}).join('');
    document.querySelectorAll('.dash-cat-table tbody').forEach(function(tb){tb.innerHTML=rows});
    var perf=document.getElementById('market-performance-table');
    if(perf){perf.innerHTML='<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="text-align:left;color:var(--muted)"><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">Categorie</th><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">ROI</th><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Win / jucate</th><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Win rate</th><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Cotă medie</th><th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right">Pending</th></tr></thead><tbody>'+groups.map(function(g){var roi=Number(g.roi||0),wr=Number(g.winrate||0);return '<tr><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-weight:700;color:'+textColor(roi)+'">'+esc(g.label)+'</td><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right;color:'+textColor(roi)+'">'+signed(roi,'%')+'</td><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+fmtInt(g.wins)+'/'+fmtInt(g.bets)+'</td><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right;color:'+winColor(wr)+'">'+(g.bets?wr.toFixed(1)+'%':'—')+'</td><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+(g.bets?Number(g.avgOdds||0).toFixed(2):'—')+'</td><td style="padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">'+fmtInt(g.pending)+'</td></tr>'}).join('')+'</tbody></table></div>'}
  }

  function availableFor(k){
    var arr=Array.isArray(window.ALL_MATCHES)?window.ALL_MATCHES:[];
    var cnt=0; arr.forEach(function(m){var b=(m&&m.bestBet)||{}; if(marketKey({market_key:b.type,market:b.label||b.market})===k)cnt++});
    return cnt;
  }
  function patchReco(){
    var card=document.querySelector('.dashboard-v16-reco'); if(!card)return;
    var groups=getGroups().filter(function(g){return ['safe','value'].indexOf(g.key)<0&&g.bets>=10}); if(!groups.length)return;
    groups.sort(function(a,b){if((b.roi>0)!==(a.roi>0))return (b.roi>0?1:-1);return Number(b.roi)-Number(a.roi)});
    var best=groups[0], bad=groups.filter(function(g){return Number(g.roi)<0}).sort(function(a,b){return a.roi-b.roi});
    var main=card.querySelector('.dashboard-v16-reco-main'), sub=card.querySelector('.dashboard-v16-reco-sub'), pills=card.querySelector('.dashboard-v16-reco-pills');
    var good=Number(best.roi)>=0;
    if(main)main.innerHTML=good?'Bazat pe istoricul recent actualizat, cea mai profitabilă piață este „'+esc(best.label)+'”.':'Momentan nu există piață clar profitabilă în istoricul recent.';
    if(sub){var avail=availableFor(best.key)||best.pending;sub.innerHTML=fmtInt(avail)+' meciuri în pool-ul curent pentru această piață • ROI <span style="color:'+textColor(best.roi)+';font-weight:800">'+signed(best.roi,'%')+'</span> • win '+Number(best.winrate||0).toFixed(1)+'% • '+fmtInt(best.wins)+'/'+fmtInt(best.bets)+' închise.';}
    if(pills){
      var base=[].slice.call(pills.querySelectorAll('.dashboard-v16-reco-pill')).filter(function(p){var t=(p.textContent||'');return /ML sync|Cu cote|Pool eligibil/i.test(t)}).slice(0,3).map(function(p){return '<span class="dashboard-v16-reco-pill">'+esc(p.textContent.trim())+'</span>'}).join('');
      var goodP=groups.filter(function(g){return g.roi>0}).slice(0,2).map(function(g){return '<span class="dashboard-v16-reco-pill" style="background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.25);color:var(--grn)">✓ '+esc(g.label)+' '+signed(g.roi,'%')+'</span>'}).join('');
      var badP=bad.slice(0,2).map(function(g){return '<span class="dashboard-v16-reco-pill" style="background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.22);color:var(--red)">✗ '+esc(g.label)+' '+signed(g.roi,'%')+'</span>'}).join('');
      pills.innerHTML=base+goodP+badP;
    }
  }

  function buildDays(rows){var days=[],map={};for(var i=1;i<=7;i++){var d=dateOffset(i),k=dayKey(d),lab=i===1?'Ieri':DAYS[d.getDay()]+' '+d.getDate()+' '+MONTHS[d.getMonth()];days.push(map[k]={key:k,offset:i,label:lab,title:lab,rows:[]})}rows.forEach(function(r){var k=dayKey(new Date(stamp(r)));if(map[k])map[k].rows.push(r)});days.forEach(function(d){d.rows.sort(function(a,b){return stamp(b)-stamp(a)})});return days}
  function calc(rows){var total=rows.length,w=rows.filter(function(r){return statusOf(r)==='win'}).length,p=rows.reduce(function(a,r){var o=Number(r.odds||r.book_odds||r.final_odds||r.baseOdds||r.market_odds||0);return a+(statusOf(r)==='win'?(o>1?o-1:0):-1)},0);return {total:total,wins:w,losses:Math.max(0,total-w),winrate:total?w*100/total:0,roi:total?p*100/total:null}}
  function selectedDay(days){var s=window.__baSevenDayIndexSelected||'d1';if(/^d\d+$/.test(s))return days[Math.max(0,Math.min(6,Number(s.slice(1))-1))]||days[0];return days.filter(function(d){return d.key===s})[0]||days[0]}
  function selectedRows(days){return (window.__baSevenDayIndexSelected||'d1')==='total'?days.reduce(function(a,d){return a.concat(d.rows)},[]):selectedDay(days).rows}
  function selectedTitle(days){return (window.__baSevenDayIndexSelected||'d1')==='total'?'Total 7 zile':selectedDay(days).title}
  function teamName(r,side){if(side==='home')return r.home||r.home_team||r.homeName||r.team_home||'—';return r.away||r.away_team||r.awayName||r.team_away||'—'}
  function pill(r){var st=statusOf(r),cls=st==='win'?'dash-yday-w':'dash-yday-l',b=st==='win'?'W':'L';return '<span class="dash-yday-pill '+cls+'"><b>'+b+'</b><span>'+esc(teamName(r,'home'))+' vs '+esc(teamName(r,'away'))+'</span><em>'+esc(r.market||r.bet||r.pick||'')+'</em></span>'}
  function patchSeven(){
    var strip=document.querySelector('.dash-yday-strip'); if(!strip)return;
    if(!strip.__baV5Click){strip.__baV5Click=1;strip.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('.dash-yday-date-btn'):null;if(!b)return;e.preventDefault();e.stopPropagation();window.__baSevenDayIndexSelected=b.getAttribute('data-ba-yday-key')||'d1';setTimeout(patchAll,0)},true)}
    var rows=rowsSince(21,true).filter(function(r){return !!statusOf(r)}),days=buildDays(rows); if(!days.reduce(function(a,d){return a+d.rows.length},0))return;
    var box=strip.querySelector('.dash-yday-index'); if(!box){box=document.createElement('div');box.className='dash-yday-index';strip.insertBefore(box,strip.querySelector('.dash-yday-scroll')||null)}
    var ctr=strip.querySelector('.dash-yday-date-row'); if(!ctr){ctr=document.createElement('div');ctr.className='dash-yday-date-row';strip.insertBefore(ctr,box)}
    var sel=window.__baSevenDayIndexSelected||'d1';ctr.innerHTML=days.map(function(d){var key=d.offset===1?'d1':d.key,act=sel===key||sel===d.key||sel==='d'+d.offset;return '<button type="button" class="dash-yday-date-btn '+(act?'active':'')+'" data-ba-yday-key="'+esc(key)+'">'+esc(d.label)+' <span>'+fmtInt(d.rows.length)+'</span></button>'}).join('')+'<button type="button" class="dash-yday-date-btn total '+(sel==='total'?'active':'')+'" data-ba-yday-key="total">TOTAL 7 ZILE <span>'+fmtInt(days.reduce(function(a,d){return a+d.rows.length},0))+'</span></button>';
    var data=selectedRows(days),s=calc(data),head=strip.querySelector('.dash-yday-head'); if(head)head.innerHTML='<span>📅 '+esc(selectedTitle(days))+' · '+fmtInt(s.total)+' finalizate</span><span class="dash-yday-head-note">index 1u / recomandare</span>';
    box.innerHTML='<span class="dash-yday-index-item dash-yday-index-win"><span class="dash-yday-index-k">WIN</span><span class="dash-yday-index-v">'+fmtInt(s.wins)+'</span></span><span class="dash-yday-index-item dash-yday-index-loss"><span class="dash-yday-index-k">LOSS</span><span class="dash-yday-index-v">'+fmtInt(s.losses)+'</span></span><span class="dash-yday-index-item"><span class="dash-yday-index-k">Winrate</span><span class="dash-yday-index-v" style="color:'+winColor(s.winrate)+'">'+s.winrate.toFixed(1)+'%</span></span><span class="dash-yday-index-item"><span class="dash-yday-index-k">ROI</span><span class="dash-yday-index-v" style="color:'+textColor(s.roi)+'">'+(s.roi==null?'—':signed(s.roi,'%'))+'</span></span>';
    var sc=strip.querySelector('.dash-yday-scroll'); if(!sc){sc=document.createElement('div');sc.className='dash-yday-scroll';strip.appendChild(sc)}var sorted=data.slice().sort(function(a,b){return stamp(b)-stamp(a)}),lim=sel==='total'?80:sorted.length;sc.innerHTML=sorted.slice(0,lim).map(pill).join('')+(sorted.length>lim?'<span class="dash-yday-more">+'+fmtInt(sorted.length-lim)+' meciuri</span>':'');
  }
  function patchAll(){addCss();patchSeven();patchCatTables();patchReco()}
  function boot(){loadRaw(false);patchAll();[250,700,1400,2800,5000,9000].forEach(function(ms){setTimeout(patchAll,ms)});setInterval(patchAll,2500);var btn=document.getElementById('btn-refresh');if(btn&&!btn.__baV5Raw){btn.__baV5Raw=1;btn.addEventListener('click',function(){loadRaw(true);setTimeout(patchAll,1600);setTimeout(patchAll,4200)})}try{new MutationObserver(function(){clearTimeout(window.__baV5Tick);window.__baV5Tick=setTimeout(patchAll,80)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
