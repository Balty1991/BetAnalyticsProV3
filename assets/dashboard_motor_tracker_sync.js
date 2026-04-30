// Dashboard Motor sync + safe cleanup for Meciuri and Istoric 21.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSyncV6)return;
  window.__baDashboardMotorTrackerSyncV6=1;

  var lastJournalSync=0;
  function num(v){v=Number(v||0);return isFinite(v)?v:0}
  function fmt(v){try{return Math.round(num(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(num(v)))}}
  function pct(v,d){var x=num(v);return(x>=0?'+':'')+x.toFixed(d==null?2:d)+'%'}
  function wr(v){return num(v).toFixed(1)+'%'}
  function tone(v){return num(v)>0?'var(--grn)':(num(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return num(v)>=65?'var(--grn)':(num(v)<50?'var(--red)':'var(--txt)')}
  function norm(v){try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}catch(e){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}}
  function statusOf(r){var s=String((r&&r.status)||(r&&r.result)||(r&&r.outcome)||'').toLowerCase();if(s==='won'||s==='w'||s==='win')return'win';if(s==='lost'||s==='loss'||s==='l'||s==='lose')return'lose';return'pending'}
  function profitOf(r){var o=num((r&&r.odds)||(r&&r.displayOdds)||(r&&r.book_odds));return statusOf(r)==='win'?(o>1?o-1:0):-1}

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

  function fallbackSummary(){
    var p=window.PREDICTION_TYPE_HISTORY||{},s=p&&p.summary;
    if(!s||typeof s!=='object')return null;
    var tracked=num(s.tracked),settled=num(s.settled),wins=num(s.wins),losses=num(s.losses),pending=num(s.pending);
    if(!tracked&&!settled&&!wins&&!losses&&!pending)return null;
    return{tracked:tracked,settled:settled,wins:wins,losses:losses,pending:pending,roi:num(s.roi),winrate:num(s.winrate)};
  }

  function trackerSummary(){
    var rows=smartBetRows();
    if(rows&&rows.length){
      var wins=0,losses=0,pending=0,profit=0;
      rows.forEach(function(r){var s=statusOf(r);if(s==='win'){wins++;profit+=profitOf(r)}else if(s==='lose'){losses++;profit+=profitOf(r)}else pending++});
      var settled=wins+losses;
      return{tracked:rows.length,settled:settled,wins:wins,losses:losses,pending:pending,profit:profit,roi:settled?profit*100/settled:0,winrate:settled?wins*100/settled:0};
    }
    return fallbackSummary();
  }
  window.baValidatedTrackerSummary=trackerSummary;

  function tableBody(){return document.querySelector('.dash-cat-table tbody')}
  function findMotorRow(body){
    var rows=[].slice.call((body||document).querySelectorAll('.dash-cat-row,tr'));
    for(var i=0;i<rows.length;i++){var first=rows[i].children&&rows[i].children[0];var t=(first&&first.textContent||'').toLowerCase();if(t.indexOf('motor')>=0)return rows[i]}
    return null;
  }
  function ensureMotorRow(body){
    var r=findMotorRow(body);if(r)return r;
    r=document.createElement('tr');r.className='dash-cat-row';
    r.innerHTML='<td class="dash-cat-name">🧠 Motor</td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val dash-cat-pending"></td>';
    body.insertBefore(r,body.firstChild);return r;
  }
  function patchDashboard(s){
    var body=tableBody();if(!s||!body)return;
    var row=ensureMotorRow(body),c=row.children;if(!c||c.length<5)return;
    row.classList.remove('ba-profit-row','ba-loss-row');if(s.roi>0)row.classList.add('ba-profit-row');else if(s.roi<0)row.classList.add('ba-loss-row');
    c[0].textContent='🧠 Motor';c[1].textContent=pct(s.roi,2);c[1].style.color=tone(s.roi);
    c[2].textContent=s.settled?wr(s.winrate):'—';c[2].style.color=s.settled?winTone(s.winrate):'var(--muted)';
    c[3].textContent=fmt(s.wins)+'/'+fmt(s.settled);c[4].textContent=s.pending?fmt(s.pending):'—';
  }

  function addCss(){
    if(document.getElementById('ba-cleanup-css-v6'))return;
    var st=document.createElement('style');st.id='ba-cleanup-css-v6';
    st.textContent='#ba-match-probar,#matches-help-panel,.ba-user-hidden{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}';
    document.head.appendChild(st);
  }
  function removeNode(id){var e=document.getElementById(id);if(e&&e.parentNode)e.parentNode.removeChild(e)}

  function cleanupMeciuri(){
    addCss();removeNode('ba-match-probar');removeNode('matches-help-panel');removeNode('ba-matches-motor-sync');
    [].slice.call(document.querySelectorAll('#tab-meciuri .mf-chip,.mf-chip')).forEach(function(btn){
      var txt=(btn.textContent||'').toLowerCase(),on=String(btn.getAttribute('onclick')||'');
      if(on.indexOf('motor_validated')>=0||txt.indexOf('motor')>=0){
        if(btn.classList&&btn.classList.contains('active')){try{window.CURRENT_FILTER='all'}catch(e){}try{if(typeof window.renderMatches==='function')window.renderMatches()}catch(e){}}
        if(btn.parentNode)btn.parentNode.removeChild(btn);
      }
    });
  }

  function cleanupIstoric21(){
    addCss();
    var tab=document.getElementById('tab-istoric21');if(!tab)return;
    var targets={'SANSA DUBLA':1,'OVER 2.5G':1,'OVER 2.5':1,'VALIDATE MOTOR':1};
    [].slice.call(tab.querySelectorAll('.history-summary-card')).forEach(function(card){
      var label=norm((card.querySelector('.history-summary-label')||card).textContent||'');
      if(targets[label])card.classList.add('ba-user-hidden');else card.classList.remove('ba-user-hidden');
    });
    var active=document.querySelector('#tab-istoric21 .history-summary-card.active.ba-user-hidden');
    if(active){
      var first=[].slice.call(tab.querySelectorAll('.history-summary-card')).find(function(c){return !c.classList.contains('ba-user-hidden')});
      if(first){try{first.click()}catch(e){}}
    }
  }

  function patch(){cleanupMeciuri();cleanupIstoric21();var s=trackerSummary();if(s)patchDashboard(s)}
  function boot(){patch();[100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,700);try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,50)}).observe(document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
