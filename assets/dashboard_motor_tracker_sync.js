// Dashboard Motor tracker sync + Meciuri/Istoric 21 cleanup.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSyncV5)return;
  window.__baDashboardMotorTrackerSyncV5=1;

  var lastJournalSync=0;
  function n(v){return Number(v||0)}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function tone(v){return n(v)>0?'var(--grn)':(n(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return n(v)>=65?'var(--grn)':(n(v)<50?'var(--red)':'var(--txt)')}
  function pct(v,d){var x=n(v);return(x>=0?'+':'')+x.toFixed(d==null?2:d)+'%'}
  function wr(v){return n(v).toFixed(1)+'%'}
  function statusOf(r){var s=String((r&&r.status)||(r&&r.result)||(r&&r.outcome)||'').toLowerCase();if(s==='won'||s==='w'||s==='win')return'win';if(s==='lost'||s==='loss'||s==='l'||s==='lose')return'lose';return'pending'}
  function profitOf(r){var o=n((r&&r.odds)||(r&&r.displayOdds)||(r&&r.book_odds));return statusOf(r)==='win'?(o>1?o-1:0):-1}
  function normTxt(v){try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()}catch(e){return String(v||'').toUpperCase().replace(/\s+/g,' ').trim()}}

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

  function addCleanupCss(){
    if(document.getElementById('ba-cleanup-css-v5'))return;
    var st=document.createElement('style');
    st.id='ba-cleanup-css-v5';
    st.textContent='#ba-match-probar,#matches-help-panel{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}.ba-hidden-by-user{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}';
    document.head.appendChild(st);
  }

  function removeNode(id){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.removeChild(el)}
  function removeMotorChip(){
    var chips=[].slice.call(document.querySelectorAll('#tab-meciuri .mf-chip,.mf-chip'));
    chips.forEach(function(btn){
      var txt=(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      var on=String(btn.getAttribute('onclick')||'');
      if(on.indexOf('motor_validated')>=0||txt.indexOf('motor')>=0){
        var wasActive=btn.classList&&btn.classList.contains('active');
        if(wasActive){
          try{window.CURRENT_FILTER='all'}catch(e){}
          var all=chips.find(function(b){return String(b.getAttribute('onclick')||'').indexOf("setFilter('all'")>=0||String(b.getAttribute('onclick')||'').indexOf('setFilter(\"all\"')>=0});
          if(all&&all.classList)all.classList.add('active');
          try{if(typeof window.renderMatches==='function')window.renderMatches()}catch(e){}
        }
        if(btn.parentNode)btn.parentNode.removeChild(btn);
      }
    });
  }

  function cleanupMeciuri(){
    addCleanupCss();
    removeNode('ba-match-probar');
    removeNode('matches-help-panel');
    removeNode('ba-matches-motor-sync');
    var oldStyle=document.getElementById('ba-motor-tracker-sync-css');
    if(oldStyle&&oldStyle.parentNode)oldStyle.parentNode.removeChild(oldStyle);
    removeMotorChip();
  }

  function hideHistoryCardFromTitle(el){
    var node=el, best=null;
    for(var depth=0;node&&depth<8;depth++,node=node.parentElement){
      if(node.id==='tab-istoric21'||node.id==='main-content'||node.tagName==='BODY')break;
      var tx=normTxt(node.textContent||'');
      var cls=String(node.className||'');
      if((tx.indexOf('WIN RATE')>=0&&tx.indexOf('PENDING')>=0&&tx.indexOf('WIN / JUCATE')>=0)||/card|panel|section|market|history/i.test(cls))best=node;
    }
    if(best)best.classList.add('ba-hidden-by-user');
  }

  function cleanupIstoric21(){
    addCleanupCss();
    var tab=document.getElementById('tab-istoric21');
    if(!tab)return;
    var targets=['SANSA DUBLA','OVER 2.5G','OVER 2.5','VALIDATE MOTOR'];
    [].slice.call(tab.querySelectorAll('div,h1,h2,h3,h4,span,strong')).forEach(function(el){
      var tx=normTxt(el.textContent||'');
      if(!tx||tx.length>70)return;
      for(var i=0;i<targets.length;i++){
        if(tx===targets[i]||tx.indexOf(targets[i])===0){hideHistoryCardFromTitle(el);break;}
      }
    });
  }

  function patch(){
    cleanupMeciuri();
    cleanupIstoric21();
    var s=trackerSummary();
    if(s)patchDashboard(s);
  }

  function boot(){
    patch();
    [100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});
    setInterval(patch,700);
    try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,50)}).observe(document.body,{childList:true,subtree:true})}catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
