// Dashboard + Meciuri Motor sync: mirror validated-predictions tracker stats.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSync)return;
  window.__baDashboardMotorTrackerSync=1;

  var lastJournalSync=0;
  function n(v){return Number(v||0)}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function tone(v){return n(v)>0?'var(--grn)':(n(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return n(v)>=65?'var(--grn)':(n(v)<50?'var(--red)':'var(--txt)')}
  function pct(v,d){var x=n(v);return(x>=0?'+':'')+x.toFixed(d==null?2:d)+'%'}
  function wr(v){return n(v).toFixed(1)+'%'}
  function statusOf(r){var s=String((r&&r.status)||(r&&r.result)||(r&&r.outcome)||'').toLowerCase();if(s==='won'||s==='w'||s==='win')return'win';if(s==='lost'||s==='loss'||s==='l'||s==='lose')return'lose';return'pending'}
  function profitOf(r){var o=n((r&&r.odds)||(r&&r.displayOdds)||(r&&r.book_odds));return statusOf(r)==='win'?(o>1?o-1:0):-1}

  function fallbackPayloadSummary(){
    var payload=window.PREDICTION_TYPE_HISTORY||{};
    var s=payload&&payload.summary;
    if(!s||typeof s!=='object')return null;
    var tracked=n(s.tracked),settled=n(s.settled),wins=n(s.wins),losses=n(s.losses),pending=n(s.pending);
    if(!tracked&&!settled&&!wins&&!losses&&!pending)return null;
    return{tracked:tracked,settled:settled,wins:wins,losses:losses,pending:pending,roi:n(s.roi),winrate:n(s.winrate)};
  }

  function smartBetRows(){
    try{
      if(Date.now()-lastJournalSync>5000 && typeof window.getSmartBetAnalysis==='function' && typeof window.syncSmartBetHistoryJournal==='function'){
        lastJournalSync=Date.now();
        var a=window.getSmartBetAnalysis()||{};
        window.syncSmartBetHistoryJournal(a.pool||[]);
      }
    }catch(e){}
    try{if(typeof window.getSmartBetHistoryRows==='function')return window.getSmartBetHistoryRows()||[]}catch(e){}
    try{if(typeof window.loadSmartBetHistoryJournal==='function')return window.loadSmartBetHistoryJournal()||[]}catch(e){}
    return [];
  }

  function trackerSummary(){
    var rows=smartBetRows();
    if(rows&&rows.length){
      var wins=0,losses=0,pending=0,profit=0;
      rows.forEach(function(r){
        var s=statusOf(r);
        if(s==='win'){wins++;profit+=profitOf(r)}
        else if(s==='lose'){losses++;profit+=profitOf(r)}
        else pending++;
      });
      var settled=wins+losses;
      return{tracked:rows.length,settled:settled,wins:wins,losses:losses,pending:pending,profit:profit,roi:settled?profit*100/settled:0,winrate:settled?wins*100/settled:0};
    }
    return fallbackPayloadSummary();
  }
  window.baValidatedTrackerSummary=trackerSummary;

  function addCss(){
    if(document.getElementById('ba-motor-tracker-sync-css'))return;
    var s=document.createElement('style');
    s.id='ba-motor-tracker-sync-css';
    s.textContent='.ba-chip-metric{margin-left:5px;padding:1px 6px;border-radius:999px;background:rgba(43,229,197,.12);border:1px solid rgba(43,229,197,.25);font-size:10px;font-family:var(--mono);color:var(--acc)}.ba-matches-motor-panel{margin:10px 0 12px;padding:12px;border-radius:18px;background:linear-gradient(135deg,rgba(43,229,197,.08),rgba(59,130,246,.045));border:1px solid rgba(43,229,197,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.ba-matches-motor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px}.ba-matches-motor-title{font-size:13px;font-weight:900;color:var(--txt);letter-spacing:-.02em}.ba-matches-motor-sub{font-size:10px;color:var(--muted);line-height:1.35;margin-top:2px}.ba-matches-motor-roi{font-size:17px;font-weight:950;font-family:var(--mono);white-space:nowrap}.ba-matches-motor-grid{display:flex;gap:7px;flex-wrap:wrap}.ba-matches-motor-pill{display:inline-flex;align-items:baseline;gap:5px;padding:7px 9px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:11px;color:var(--muted)}.ba-matches-motor-pill b{font-size:13px;color:var(--acc);font-family:var(--mono)}.ba-matches-motor-pill.win b,.ba-matches-motor-pill.wr b{color:var(--grn)}.ba-matches-motor-pill.loss b{color:var(--red)}.ba-matches-motor-pill.pending b{color:var(--yel)}@media(max-width:420px){.ba-matches-motor-panel{padding:10px}.ba-matches-motor-roi{font-size:15px}.ba-matches-motor-pill{padding:6px 8px;font-size:10px}.ba-matches-motor-pill b{font-size:12px}}';
    document.head.appendChild(s);
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

  function patchDashboard(s){
    var body=tableBody();
    if(!s||!body)return;
    var row=ensureRow(body),cells=row.children;
    if(!cells||cells.length<5)return;
    row.classList.remove('ba-profit-row','ba-loss-row');
    if(s.roi>0)row.classList.add('ba-profit-row');
    else if(s.roi<0)row.classList.add('ba-loss-row');
    cells[0].textContent='🧠 Motor';
    cells[1].textContent=pct(s.roi,2);
    cells[1].style.color=tone(s.roi);
    cells[2].textContent=s.settled?wr(s.winrate):'—';
    cells[2].style.color=s.settled?winTone(s.winrate):'var(--muted)';
    cells[3].textContent=fmt(s.wins)+'/'+fmt(s.settled);
    cells[4].textContent=s.pending?fmt(s.pending):'—';
    row.setAttribute('data-ba-motor-tracker-key',[s.tracked,s.settled,s.wins,s.losses,s.pending,s.roi,s.winrate].join('|'));
  }

  function findMotorChip(){
    var chips=[].slice.call(document.querySelectorAll('#tab-meciuri .mf-chip,.mf-chip'));
    return chips.find(function(btn){return String(btn.getAttribute('onclick')||'').indexOf("motor_validated")>=0})||null;
  }

  function patchMatches(s){
    if(!s)return;
    var card=document.querySelector('#tab-meciuri .mf-card');
    if(!card)return;
    var chip=findMotorChip();
    if(chip){
      var chipHtml='🧠 Motor <span class="ba-chip-metric">'+fmt(s.tracked)+'</span>';
      if(chip.getAttribute('data-ba-motor-chip')!==chipHtml){chip.innerHTML=chipHtml;chip.setAttribute('data-ba-motor-chip',chipHtml)}
      chip.title='Tracker predicții validate: '+fmt(s.tracked)+' urmărite, '+fmt(s.settled)+' settled, '+fmt(s.wins)+'W/'+fmt(s.losses)+'L, '+fmt(s.pending)+' pending, ROI '+pct(s.roi,2)+', WR '+wr(s.winrate);
    }
    var host=document.getElementById('ba-matches-motor-sync');
    if(!host){
      host=document.createElement('div');
      host.id='ba-matches-motor-sync';
      host.className='ba-matches-motor-panel';
      var anchor=card.querySelector('.mf-chips-scroll')||card.querySelector('.mf-header');
      if(anchor&&anchor.parentNode)anchor.insertAdjacentElement('afterend',host);
      else card.insertBefore(host,card.firstChild);
    }
    var html='<div class="ba-matches-motor-head"><div><div class="ba-matches-motor-title">🎯 Tracker predicții validate</div><div class="ba-matches-motor-sub">sincronizat cu Motorul validat: settled, pending, ROI și WR</div></div><div class="ba-matches-motor-roi" style="color:'+tone(s.roi)+'">'+pct(s.roi,2)+' ROI</div></div><div class="ba-matches-motor-grid"><span class="ba-matches-motor-pill"><b>'+fmt(s.tracked)+'</b> urmărite</span><span class="ba-matches-motor-pill"><b>'+fmt(s.settled)+'</b> settled</span><span class="ba-matches-motor-pill win"><b>'+fmt(s.wins)+'</b> W</span><span class="ba-matches-motor-pill loss"><b>'+fmt(s.losses)+'</b> L</span><span class="ba-matches-motor-pill pending"><b>'+fmt(s.pending)+'</b> pending</span><span class="ba-matches-motor-pill wr"><b>'+wr(s.winrate)+'</b> WR</span></div>';
    if(host.getAttribute('data-ba-motor-panel')!==html){host.setAttribute('data-ba-motor-panel',html);host.innerHTML=html}
    var fc=document.getElementById('filter-count');
    if(fc&&window.CURRENT_FILTER==='motor_validated')fc.textContent='Motor validat • '+fmt(s.tracked)+' urmărite • '+fmt(s.settled)+' settled • '+pct(s.roi,2)+' ROI';
  }

  function patch(){
    addCss();
    var s=trackerSummary();
    if(!s)return;
    patchDashboard(s);
    patchMatches(s);
  }

  function boot(){
    patch();
    [100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});
    setInterval(patch,800);
    try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,50)}).observe(document.body,{childList:true,subtree:true})}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
