// Dashboard Motor row sync: mirror the validated-predictions tracker into Dashboard category table.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSync)return;
  window.__baDashboardMotorTrackerSync=1;

  function n(v){return Number(v||0)}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function tone(v){return n(v)>0?'var(--grn)':(n(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return n(v)>=65?'var(--grn)':(n(v)<50?'var(--red)':'var(--txt)')}
  function pct(v){var x=n(v);return(x>=0?'+':'')+x.toFixed(2)+'%'}
  function wr(v){return n(v).toFixed(1)+'%'}

  function trackerSummary(){
    var payload=window.PREDICTION_TYPE_HISTORY||{};
    var s=payload&&payload.summary;
    if(!s||typeof s!=='object')return null;
    var tracked=n(s.tracked),settled=n(s.settled),wins=n(s.wins),losses=n(s.losses),pending=n(s.pending);
    if(!tracked&&!settled&&!wins&&!losses&&!pending)return null;
    return{tracked:tracked,settled:settled,wins:wins,losses:losses,pending:pending,roi:n(s.roi),winrate:n(s.winrate)};
  }

  function tableBody(){return document.querySelector('.dash-cat-table tbody')}
  function findMotorRow(body){
    var rows=[].slice.call((body||document).querySelectorAll('.dash-cat-row, tr'));
    for(var i=0;i<rows.length;i++){
      var first=rows[i].children&&rows[i].children[0];
      var txt=(first&&first.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(txt.indexOf('motor')>=0)return rows[i];
    }
    return null;
  }

  function ensureRow(body){
    var row=findMotorRow(body);
    if(row)return row;
    row=document.createElement('tr');
    row.className='dash-cat-row';
    row.innerHTML='<td class="dash-cat-name">🧠 Motor</td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val dash-cat-pending"></td>';
    body.insertBefore(row,body.firstChild);
    return row;
  }

  function patch(){
    var s=trackerSummary(),body=tableBody();
    if(!s||!body)return;
    var row=ensureRow(body),cells=row.children;
    if(!cells||cells.length<5)return;
    row.classList.remove('ba-profit-row','ba-loss-row');
    if(s.roi>0)row.classList.add('ba-profit-row');
    else if(s.roi<0)row.classList.add('ba-loss-row');
    cells[0].textContent='🧠 Motor';
    cells[1].textContent=pct(s.roi);
    cells[1].style.color=tone(s.roi);
    cells[2].textContent=s.settled?wr(s.winrate):'—';
    cells[2].style.color=s.settled?winTone(s.winrate):'var(--muted)';
    cells[3].textContent=fmt(s.wins)+'/'+fmt(s.settled);
    cells[4].textContent=s.pending?fmt(s.pending):'—';
    row.setAttribute('data-ba-motor-tracker-key',[s.tracked,s.settled,s.wins,s.losses,s.pending,s.roi,s.winrate].join('|'));
  }

  function boot(){
    patch();
    [100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});
    setInterval(patch,400);
    try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,40)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true})}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
