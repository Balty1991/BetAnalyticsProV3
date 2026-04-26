// Dashboard exact UI: show the same KPI set as Istoric 21 / TOATE.
(function(){
  'use strict';
  if(window.__baDashboardHistory21ExactUi)return;
  window.__baDashboardHistory21ExactUi=1;
  var DAY=86400000;
  function n(v){return Number(v||0)}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function pct(v){var x=n(v);return(x>=0?'+':'')+x.toFixed(1)+'%'}
  function tone(v){return n(v)>0?'var(--grn)':(n(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return n(v)>=65?'var(--grn)':(n(v)<50?'var(--red)':'var(--txt)')}
  function rowKey(r){try{if(typeof window.getHistory21RowKey==='function')return window.getHistory21RowKey(r)}catch(e){}var mk=(r&&r.market_key)||(r&&r.market)||'';var id=(r&&r.event_id!=null?r.event_id:(r&&r.eventId!=null?r.eventId:''));return String(id)+'::'+String(mk)+'::'+String((r&&r.event_date)||(r&&r.date)||'')}
  function statusOf(r){try{if(typeof window.getHistory21Status==='function')return window.getHistory21Status(r)}catch(e){}var s=String(r&&r.status||'').toLowerCase();if(s==='win'||s==='w'||s==='won')return'win';if(s==='lose'||s==='loss'||s==='lost'||s==='l')return'lose';if(r&&r.won===true)return'win';if(r&&r.won===false)return'lose';return'pending'}
  function fallbackGroup(){
    var src=Array.isArray(window.RECOMMENDATION_LOG)?window.RECOMMENDATION_LOG:[];
    var cutoff=Date.now()-21*DAY,wins=0,bets=0,pending=0,profit=0,oddsSum=0,seen={};
    src.forEach(function(r){
      var t=new Date((r&&r.logged_at)||(r&&r.prediction_created_at)||0).getTime();
      if(!r||!isFinite(t)||t<cutoff)return;
      var k=rowKey(r);if(seen[k])return;seen[k]=1;
      var st=statusOf(r),o=n(r.odds||r.book_odds||r.final_odds||r.baseOdds||r.market_odds);
      if(st==='pending'){pending++;return}
      if(st!=='win'&&st!=='lose')return;
      bets++;oddsSum+=o;if(st==='win'){wins++;profit+=(o>1?o-1:0)}else profit-=1;
    });
    var avgOdds=bets?oddsSum/bets:0,be=avgOdds>1?100/avgOdds:0,wr=bets?wins*100/bets:0;
    return{bets:bets,wins:wins,losses:Math.max(0,bets-wins),pending:pending,roi:bets?profit*100/bets:0,winrate:wr,avgOdds:avgOdds,delta:bets?wr-be:0};
  }
  function exactGroup(){
    try{
      if(typeof window.getHistory21SettledRows==='function'&&typeof window.getHistory21LivePendingRows==='function'&&typeof window.buildHistory21Group==='function'&&typeof window.historyRowMatchesCategory==='function'){
        var cutoff=new Date(Date.now()-21*DAY),map={};
        (window.getHistory21SettledRows(cutoff)||[]).forEach(function(r){if(r)map[rowKey(r)]=r});
        (window.getHistory21LivePendingRows()||[]).forEach(function(r){if(r)map[rowKey(r)]=r});
        var rows=Object.keys(map).map(function(k){return map[k]});
        var g=window.buildHistory21Group('Toate','all',rows.filter(function(r){return window.historyRowMatchesCategory(r,'all')}));
        var be=n(g.avgOdds)>1?100/n(g.avgOdds):0;
        return{bets:n(g.bets),wins:n(g.wins),losses:n(g.losses),pending:n(g.pending),roi:n(g.roi),winrate:n(g.winrate),avgOdds:n(g.avgOdds),delta:n(g.bets)?n(g.winrate)-be:0};
      }
    }catch(e){}
    return fallbackGroup();
  }
  function findPerfCard(){var nodes=[].slice.call(document.querySelectorAll('div,section'));for(var i=0;i<nodes.length;i++){var t=(nodes[i].textContent||'').replace(/\s+/g,' ');if(t.indexOf('PERFORMANȚA TA')>=0||t.indexOf('PERFORMANTA TA')>=0)return nodes[i].closest('.dashboard-v16-performance,.section,.panel,.visual-card')||nodes[i]}return null}
  function addCss(){
    if(document.getElementById('ba-exact-history21-ui-css'))return;
    var s=document.createElement('style');
    s.id='ba-exact-history21-ui-css';
    s.textContent='.ba-perf-mini-row[data-exact-history21="1"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.ba-perf-mini-row[data-exact-history21="1"] .ba-perf-mini-value{font-size:19px!important}.ba-history21-exact-note{font-family:var(--mono)!important;font-size:7.5px!important;color:var(--muted)!important;margin:4px 0 0!important}@media(min-width:760px){.ba-perf-mini-row[data-exact-history21="1"]{grid-template-columns:repeat(4,minmax(0,1fr))!important}}';
    document.head.appendChild(s);
  }
  function patchHeader(card,g){
    [].slice.call(card.querySelectorAll('span,div')).forEach(function(el){
      var t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(/^\d+\s*închise\s*•\s*\d+\s*pending$/i.test(t))el.textContent=fmt(g.bets)+' închise • '+fmt(g.pending)+' pending';
    });
  }
  function patchRuler(card,g){
    var r=card.querySelector('.ba-21-ruler');
    if(!r)return;
    var head=r.querySelector('.ba-21-ruler-head');
    if(head){
      var spans=head.querySelectorAll('span');
      if(spans[1]){spans[1].className=g.roi>=0?'ba-21-total-pos':'ba-21-total-neg';spans[1].textContent='ROI '+pct(g.roi)+' • '+fmt(g.wins)+'W / '+fmt(g.losses)+'L'}
    }
  }
  function patchMini(card,g){
    var row=card.querySelector('.ba-perf-mini-row');
    if(!row){
      row=document.createElement('div');
      row.className='ba-perf-mini-row';
      var anchor=card.querySelector('.ba-21-ruler')||card.querySelector('.ba-canon-chart')||card;
      anchor.insertAdjacentElement('afterend',row);
    }
    row.setAttribute('data-exact-history21','1');
    row.innerHTML='<div class="ba-perf-mini"><span class="ba-perf-mini-label">ROI</span><b class="ba-perf-mini-value" style="color:'+tone(g.roi)+'">'+pct(g.roi)+'</b><em class="ba-perf-mini-desc">21 zile • '+fmt(g.bets)+' închise</em></div>'+ '<div class="ba-perf-mini"><span class="ba-perf-mini-label">WIN RATE</span><b class="ba-perf-mini-value" style="color:'+winTone(g.winrate)+'">'+n(g.winrate).toFixed(1)+'%</b><em class="ba-perf-mini-desc">aceeași valoare ca Istoric 21</em></div>'+ '<div class="ba-perf-mini"><span class="ba-perf-mini-label">WIN / JUCATE</span><b class="ba-perf-mini-value">'+fmt(g.wins)+'/'+fmt(g.bets)+'</b><em class="ba-perf-mini-desc">loss '+fmt(g.losses)+'</em></div>'+ '<div class="ba-perf-mini"><span class="ba-perf-mini-label">PENDING</span><b class="ba-perf-mini-value">'+fmt(g.pending)+'</b><em class="ba-perf-mini-desc">Δ BE '+(g.delta>=0?'+':'')+n(g.delta).toFixed(1)+'pp</em></div>';
  }
  function patch(){addCss();var card=findPerfCard();if(!card)return;var g=exactGroup();patchHeader(card,g);patchRuler(card,g);patchMini(card,g)}
  function boot(){patch();[80,250,600,1200,2500,5000,9000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,250);try{new MutationObserver(function(){clearTimeout(window.__baExactHist21UiT);window.__baExactHist21UiT=setTimeout(patch,20)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true,characterData:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
