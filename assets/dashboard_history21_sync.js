// Dashboard performance sync: use exactly the same merged rows as Istoric 21.
(function(){
  'use strict';
  if(window.__baDashboardHistory21Sync)return;
  window.__baDashboardHistory21Sync=1;
  var DAY=86400000;
  function n(v){return Number(v||0)}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function pct(v){var x=n(v);return(x>=0?'+':'')+x.toFixed(1)+'%'}
  function unit(v){var x=n(v);return(x>=0?'+':'')+x.toFixed(1)+'u'}
  function tone(v){return n(v)>0?'var(--grn)':(n(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return n(v)>=65?'var(--grn)':(n(v)<50?'var(--red)':'var(--txt)')}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function stamp(r){var raw=r&&(r.event_date||r.eventDate||r.match_date||r.date||r.logged_at||r.prediction_created_at||r.kickoff||r.start_time);var t=raw?new Date(raw).getTime():NaN;return isFinite(t)?t:0}
  function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9.]/g,'')}
  function marketKey(r){var m=norm(r&&(r.market_key||r.marketKey||r.market||r.bet||r.pick||r.prediction||r.type||''));
    if(m.indexOf('over15')>=0||m.indexOf('over1.5')>=0||m.indexOf('peste1.5')>=0)return'over15';
    if(m.indexOf('over25')>=0||m.indexOf('over2.5')>=0||m.indexOf('peste2.5')>=0)return'over25';
    if(m.indexOf('under35')>=0||m.indexOf('under3.5')>=0||m.indexOf('sub3.5')>=0)return'under35';
    if(m.indexOf('under25')>=0||m.indexOf('under2.5')>=0||m.indexOf('sub2.5')>=0)return'under25';
    if(m.indexOf('btts')>=0||m==='gg'||m.indexOf('bothteamstoscore')>=0)return'btts';
    return m;
  }
  function rowKey(r){
    try{if(typeof window.getHistory21RowKey==='function')return window.getHistory21RowKey(r)}catch(e){}
    var eventId=(r&&(r.event_id!=null?r.event_id:r.eventId))||'';
    return eventId+'::'+marketKey(r)+'::'+String(r&&(r.event_date||r.date||r.logged_at||''));
  }
  function resultStatus(r){
    if(!r)return'';
    var s=String(r.status||r.result||r.outcome||'').toLowerCase().trim();
    if(s==='w'||s==='win'||s==='won'||s==='hit'||s==='success')return'win';
    if(s==='l'||s==='loss'||s==='lost'||s==='lose'||s==='miss'||s==='failed'||s==='fail')return'loss';
    if(r.won===true||r.is_win===true||r.isWon===true)return'win';
    if(r.won===false||r.is_win===false||r.isWon===false)return'loss';
    return'';
  }
  function isPending(r){return !resultStatus(r)&&String(r&&r.status||'').toLowerCase().trim()==='pending'}
  function fallbackRows(){
    var src=Array.isArray(window.RECOMMENDATION_LOG)?window.RECOMMENDATION_LOG:[];
    var cut=Date.now()-21*DAY,seen={},out=[];
    src.forEach(function(r){if(!r||stamp(r)<cut)return;var k=rowKey(r);if(seen[k])return;seen[k]=1;out.push(r)});
    return out;
  }
  function rows21(){
    if(typeof window.getHistory21SettledRows==='function'&&typeof window.getHistory21LivePendingRows==='function'){
      try{
        var cutoff=new Date(Date.now()-21*DAY),merged={};
        (window.getHistory21SettledRows(cutoff)||[]).forEach(function(r){if(r)merged[rowKey(r)]=r});
        (window.getHistory21LivePendingRows()||[]).forEach(function(r){if(r)merged[rowKey(r)]=r});
        var out=Object.keys(merged).map(function(k){return merged[k]});
        if(out.length)return out;
      }catch(e){}
    }
    return fallbackRows();
  }
  function settledRows(){return rows21().filter(function(r){return resultStatus(r)&&(!r.source||r.source==='log')})}
  function profitOf(r){var o=n(r&&r.odds||r&&r.book_odds||r&&r.final_odds||r&&r.baseOdds||r&&r.market_odds);return resultStatus(r)==='win'?(o>1?o-1:0):-1}
  function calc(rows){var total=rows.length,wins=0,profit=0;rows.forEach(function(r){if(resultStatus(r)==='win')wins++;profit+=profitOf(r)});return{total:total,wins:wins,losses:Math.max(0,total-wins),profit:profit,roi:total?profit*100/total:0,winrate:total?wins*100/total:0}}
  function summary(){
    var all=rows21();
    if(typeof window.buildHistory21Group==='function'&&typeof window.historyRowMatchesCategory==='function'){
      try{
        var g=window.buildHistory21Group('Toate','all',all.filter(function(r){return window.historyRowMatchesCategory(r,'all')}));
        return{total:n(g.bets),wins:n(g.wins),losses:n(g.losses),pending:n(g.pending),profit:n(g.roi)*n(g.bets)/100,roi:n(g.roi),winrate:n(g.winrate)};
      }catch(e){}
    }
    var s=calc(settledRows());s.pending=all.filter(isPending).length;return s;
  }
  function matchCat(r,k){
    if(typeof window.historyRowMatchesCategory==='function'){try{return window.historyRowMatchesCategory(r,k)}catch(e){}}
    var m=marketKey(r);if(k==='safe')return n(r&&r.score)>=80||String(r&&r.verdict||'').toLowerCase()==='safe';if(k==='value')return n(r&&r.value)>=0.05;return m===k;
  }
  function group(k,label){
    var all=rows21();
    if(typeof window.buildHistory21Group==='function'){
      try{var g=window.buildHistory21Group(label,k,all.filter(function(r){return matchCat(r,k)}));return{key:k,label:label,total:n(g.bets),wins:n(g.wins),losses:n(g.losses),pending:n(g.pending),roi:n(g.roi),winrate:n(g.winrate)}}catch(e){}
    }
    var set=all.filter(function(r){return resultStatus(r)&&(!r.source||r.source==='log')&&matchCat(r,k)}),pending=all.filter(function(r){return isPending(r)&&matchCat(r,k)}),s=calc(set);s.key=k;s.label=label;s.pending=pending.length;return s;
  }
  function groups(){return[['over15','Over 1.5G'],['under35','Under 3.5G'],['btts','BTTS'],['safe','Top analizate'],['value','Value']].map(function(d){return group(d[0],d[1])}).filter(function(g){return g.total||g.pending})}
  function findPerfCard(){var nodes=[].slice.call(document.querySelectorAll('div,section'));for(var i=0;i<nodes.length;i++){var t=(nodes[i].textContent||'').replace(/\s+/g,' ');if(t.indexOf('PERFORMANȚA TA')>=0||t.indexOf('PERFORMANTA TA')>=0)return nodes[i].closest('.section,.panel,.visual-card,.dashboard-v16-performance')||nodes[i]}return null}
  function findChart(card){if(!card)return null;var el=card.querySelector('.dashboard-v16-chart, .ba-canon-chart');if(el)return el.classList&&el.classList.contains('ba-canon-chart')?el.parentElement:el;var svg=card.querySelector('svg');return svg?(svg.parentElement||svg):null}
  function renderChart(anchor){var rows=settledRows().slice().sort(function(a,b){return stamp(a)-stamp(b)});if(!anchor||!rows.length)return;var vals=[0],p=0;rows.forEach(function(r){p+=profitOf(r);vals.push(p)});var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);if(min===max){min-=1;max+=1}var w=700,h=180,pad=18,ph=h-34,pw=w-36;var pts=vals.map(function(v,i){return{x:pad+pw*i/Math.max(1,vals.length-1),y:12+(max-v)*ph/(max-min)}});var path=pts.map(function(pt,i){return(i?'L':'M')+pt.x.toFixed(1)+','+pt.y.toFixed(1)}).join(' '),last=pts[pts.length-1];anchor.innerHTML='<svg class="ba-canon-chart" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><defs><linearGradient id="baCanonLineSync" x1="0" x2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs><line x1="18" y1="45" x2="682" y2="45" stroke="rgba(255,255,255,.07)" stroke-dasharray="5 6"/><line x1="18" y1="90" x2="682" y2="90" stroke="rgba(255,255,255,.07)" stroke-dasharray="5 6"/><line x1="18" y1="135" x2="682" y2="135" stroke="rgba(255,255,255,.07)" stroke-dasharray="5 6"/><path d="'+path+'" fill="none" stroke="url(#baCanonLineSync)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="'+last.x.toFixed(1)+'" cy="'+last.y.toFixed(1)+'" r="5" fill="'+(p>=0?'#34d399':'#fb7185')+'"/></svg>'}
  function patchHeader(card,s){[].slice.call(card.querySelectorAll('span,div')).forEach(function(el){var t=(el.textContent||'').replace(/\s+/g,' ').trim();if(/^\d+\s*închise\s*•\s*\d+\s*pending$/i.test(t))el.textContent=fmt(s.total)+' închise • '+fmt(s.pending)+' pending'})}
  function patchMini(card,after,s){patchHeader(card,s);['ROI','WIN','PROFIT UNIT'].forEach(function(lbl){[].slice.call(card.querySelectorAll('div,span,b,strong')).forEach(function(el){if((el.textContent||'').trim().toUpperCase()===lbl){var p=el.parentElement;if(p){p.classList.add('ba-perf-metric-patched');p.style.display='none'}}})});var row=card.querySelector('.ba-perf-mini-row');if(!row){row=document.createElement('div');row.className='ba-perf-mini-row';(after||card).insertAdjacentElement('afterend',row)}row.setAttribute('data-history21-sync','1');row.innerHTML='<div class="ba-perf-mini"><span class="ba-perf-mini-label">ROI</span><b class="ba-perf-mini-value" style="color:'+tone(s.roi)+'">'+pct(s.roi)+'</b><em class="ba-perf-mini-desc">21 zile • '+fmt(s.total)+' închise</em></div><div class="ba-perf-mini"><span class="ba-perf-mini-label">WIN</span><b class="ba-perf-mini-value" style="color:'+winTone(s.winrate)+'">'+n(s.winrate).toFixed(1)+'%</b><em class="ba-perf-mini-desc">'+fmt(s.wins)+'W / '+fmt(s.losses)+'L</em></div><div class="ba-perf-mini"><span class="ba-perf-mini-label">PROFIT</span><b class="ba-perf-mini-value" style="color:'+tone(s.profit)+'">'+unit(s.profit)+'</b><em class="ba-perf-mini-desc">pending '+fmt(s.pending)+'</em></div>'}
  function patchCats(){var body=document.querySelector('.dash-cat-table tbody');if(!body)return;body.innerHTML=groups().map(function(g){var cls=g.roi>0?'ba-profit-row':(g.roi<0?'ba-loss-row':'');return'<tr class="dash-cat-row '+cls+'"><td class="dash-cat-name">'+esc(g.label)+'</td><td class="dash-cat-val" style="color:'+tone(g.roi)+'">'+pct(g.roi)+'</td><td class="dash-cat-val" style="color:'+winTone(g.winrate)+'">'+(g.total?n(g.winrate).toFixed(0)+'%':'—')+'</td><td class="dash-cat-val">'+fmt(g.wins)+'/'+fmt(g.total)+'</td><td class="dash-cat-val dash-cat-pending">'+(g.pending?fmt(g.pending):'—')+'</td></tr>'}).join('')}
  function patch(){var card=findPerfCard();if(!card)return;var s=summary(),chart=findChart(card);if(chart)renderChart(chart);var anchor=card.querySelector('.ba-21-ruler')||chart||card.querySelector('.dashboard-v16-chart-wrap')||card;patchMini(card,anchor,s);patchCats()}
  function boot(){patch();[80,250,700,1500,3000,6000,10000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,700);try{new MutationObserver(function(){clearTimeout(window.__baDashHist21SyncT);window.__baDashHist21SyncT=setTimeout(patch,40)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
