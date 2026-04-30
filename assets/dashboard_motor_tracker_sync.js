// Dashboard Motor sync + safe cleanup + polished Meciuri controls.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSyncV7)return;
  window.__baDashboardMotorTrackerSyncV7=1;

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

  function addCss(){
    if(document.getElementById('ba-cleanup-css-v7'))return;
    var st=document.createElement('style');
    st.id='ba-cleanup-css-v7';
    st.textContent=[
      '#ba-match-probar,#matches-help-panel,.ba-user-hidden,.ba-user-empty{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#tab-meciuri .ba-matches-controls{padding:16px!important;border-radius:28px!important;background:radial-gradient(circle at 0 0,rgba(43,229,197,.10),transparent 34%),linear-gradient(180deg,rgba(15,24,45,.96),rgba(8,13,26,.98))!important;border:1px solid rgba(74,93,135,.42)!important;box-shadow:0 18px 46px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.04)!important}',
      '#tab-meciuri .ba-matches-controls .matches-card-head,#tab-meciuri .ba-matches-controls .mf-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:0 0 12px!important;padding:0 2px 10px!important;border-bottom:1px solid rgba(255,255,255,.07)!important}',
      '#tab-meciuri .ba-matches-controls .matches-card-title,#tab-meciuri .ba-matches-controls .mf-title{font-size:21px!important;font-weight:950!important;letter-spacing:-.04em!important;color:var(--txt)!important}',
      '#tab-meciuri .ba-matches-controls .filter-count,#tab-meciuri .ba-matches-controls #filter-count{margin-left:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:30px!important;padding:5px 13px!important;border-radius:999px!important;background:rgba(43,229,197,.10)!important;border:1px solid rgba(43,229,197,.32)!important;color:var(--acc)!important;font-size:12px!important;font-weight:900!important;font-family:var(--mono)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important}',
      '#tab-meciuri .ba-controls-premium{display:grid!important;grid-template-columns:1fr!important;gap:11px!important;margin-top:6px!important}',
      '#tab-meciuri .ba-mode-group{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;padding:5px!important;border-radius:20px!important;background:rgba(255,255,255,.035)!important;border:1px solid rgba(255,255,255,.075)!important}',
      '#tab-meciuri .ba-mode-btn{min-height:42px!important;border-radius:16px!important;border:1px solid transparent!important;background:transparent!important;color:var(--muted)!important;font-size:14px!important;font-weight:850!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;box-shadow:none!important}',
      '#tab-meciuri .ba-mode-btn.active,#tab-meciuri .ba-mode-btn[aria-pressed="true"]{background:linear-gradient(135deg,rgba(43,229,197,.22),rgba(59,130,246,.14))!important;border-color:rgba(43,229,197,.38)!important;color:var(--acc)!important;box-shadow:0 10px 22px rgba(43,229,197,.10),inset 0 1px 0 rgba(255,255,255,.08)!important}',
      '#tab-meciuri .ba-market-group{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;padding:10px!important;border-radius:22px!important;background:rgba(2,6,23,.24)!important;border:1px solid rgba(255,255,255,.065)!important}',
      '#tab-meciuri .ba-market-chip{min-height:42px!important;border-radius:16px!important;padding:0 10px!important;border:1px solid rgba(119,141,180,.28)!important;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))!important;color:#dbe7f5!important;font-size:13px!important;font-weight:900!important;letter-spacing:-.01em!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;white-space:nowrap!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important}',
      '#tab-meciuri .ba-market-chip.active,#tab-meciuri .ba-market-chip[aria-pressed="true"]{background:linear-gradient(135deg,rgba(43,229,197,.20),rgba(59,130,246,.13))!important;border-color:rgba(43,229,197,.58)!important;color:var(--acc)!important;box-shadow:0 0 0 1px rgba(43,229,197,.12),0 12px 28px rgba(43,229,197,.10)!important}',
      '#tab-meciuri .ba-tools-group{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;align-items:center!important;margin-top:1px!important}',
      '#tab-meciuri .ba-tools-group select,#tab-meciuri .ba-tools-group .sort-select,#tab-meciuri .ba-time-control{width:100%!important;min-height:46px!important;border-radius:18px!important;padding:0 16px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(119,141,180,.24)!important;color:var(--txt)!important;font-size:14px!important;font-weight:850!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)!important}',
      '#tab-meciuri .ba-filter-control{min-width:124px!important;min-height:46px!important;border-radius:18px!important;padding:0 14px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(119,141,180,.24)!important;color:#dbe7f5!important;font-size:14px!important;font-weight:900!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important}',
      '#tab-meciuri .matches-filter-toolbar,#tab-meciuri .filter-bar{gap:0!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      '@media(max-width:430px){#tab-meciuri .ba-matches-controls{padding:13px!important;border-radius:24px!important}#tab-meciuri .ba-market-group{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;padding:8px!important}#tab-meciuri .ba-market-chip{min-height:39px!important;font-size:12px!important;padding:0 7px!important}#tab-meciuri .ba-mode-btn{min-height:39px!important;font-size:13px!important}#tab-meciuri .ba-tools-group{grid-template-columns:1fr 116px!important;gap:8px!important}#tab-meciuri .ba-filter-control{min-width:116px!important}#tab-meciuri .ba-matches-controls .matches-card-title,#tab-meciuri .ba-matches-controls .mf-title{font-size:19px!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function smartBetRows(){
    try{if(Date.now()-lastJournalSync>5000&&typeof window.getSmartBetAnalysis==='function'&&typeof window.syncSmartBetHistoryJournal==='function'){lastJournalSync=Date.now();var a=window.getSmartBetAnalysis()||{};window.syncSmartBetHistoryJournal(a.pool||[])}}catch(e){}
    try{if(typeof window.getSmartBetHistoryRows==='function')return window.getSmartBetHistoryRows()||[]}catch(e){}
    try{if(typeof window.loadSmartBetHistoryJournal==='function')return window.loadSmartBetHistoryJournal()||[]}catch(e){}
    return [];
  }
  function fallbackSummary(){var p=window.PREDICTION_TYPE_HISTORY||{},s=p&&p.summary;if(!s||typeof s!=='object')return null;var tracked=num(s.tracked),settled=num(s.settled),wins=num(s.wins),losses=num(s.losses),pending=num(s.pending);if(!tracked&&!settled&&!wins&&!losses&&!pending)return null;return{tracked:tracked,settled:settled,wins:wins,losses:losses,pending:pending,roi:num(s.roi),winrate:num(s.winrate)}}
  function trackerSummary(){var rows=smartBetRows();if(rows&&rows.length){var wins=0,losses=0,pending=0,profit=0;rows.forEach(function(r){var s=statusOf(r);if(s==='win'){wins++;profit+=profitOf(r)}else if(s==='lose'){losses++;profit+=profitOf(r)}else pending++});var settled=wins+losses;return{tracked:rows.length,settled:settled,wins:wins,losses:losses,pending:pending,profit:profit,roi:settled?profit*100/settled:0,winrate:settled?wins*100/settled:0}}return fallbackSummary()}
  window.baValidatedTrackerSummary=trackerSummary;

  function tableBody(){return document.querySelector('.dash-cat-table tbody')}
  function findMotorRow(body){var rows=[].slice.call((body||document).querySelectorAll('.dash-cat-row,tr'));for(var i=0;i<rows.length;i++){var first=rows[i].children&&rows[i].children[0];var t=(first&&first.textContent||'').toLowerCase();if(t.indexOf('motor')>=0)return rows[i]}return null}
  function ensureMotorRow(body){var r=findMotorRow(body);if(r)return r;r=document.createElement('tr');r.className='dash-cat-row';r.innerHTML='<td class="dash-cat-name">🧠 Motor</td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val"></td><td class="dash-cat-val dash-cat-pending"></td>';body.insertBefore(r,body.firstChild);return r}
  function patchDashboard(s){var body=tableBody();if(!s||!body)return;var row=ensureMotorRow(body),c=row.children;if(!c||c.length<5)return;row.classList.remove('ba-profit-row','ba-loss-row');if(s.roi>0)row.classList.add('ba-profit-row');else if(s.roi<0)row.classList.add('ba-loss-row');c[0].textContent='🧠 Motor';c[1].textContent=pct(s.roi,2);c[1].style.color=tone(s.roi);c[2].textContent=s.settled?wr(s.winrate):'—';c[2].style.color=s.settled?winTone(s.winrate):'var(--muted)';c[3].textContent=fmt(s.wins)+'/'+fmt(s.settled);c[4].textContent=s.pending?fmt(s.pending):'—'}

  function removeNode(id){var e=document.getElementById(id);if(e&&e.parentNode)e.parentNode.removeChild(e)}
  function cleanupMeciuri(){removeNode('ba-match-probar');removeNode('matches-help-panel');removeNode('ba-matches-motor-sync');[].slice.call(document.querySelectorAll('#tab-meciuri .mf-chip,.mf-chip')).forEach(function(btn){var txt=(btn.textContent||'').toLowerCase(),on=String(btn.getAttribute('onclick')||'');if(on.indexOf('motor_validated')>=0||txt.indexOf('motor')>=0){if(btn.classList&&btn.classList.contains('active')){try{window.CURRENT_FILTER='all'}catch(e){}try{if(typeof window.renderMatches==='function')window.renderMatches()}catch(e){}}if(btn.parentNode)btn.parentNode.removeChild(btn)}})}
  function cleanupIstoric21(){var tab=document.getElementById('tab-istoric21');if(!tab)return;var targets={'SANSA DUBLA':1,'OVER 2.5G':1,'OVER 2.5':1,'VALIDATE MOTOR':1};[].slice.call(tab.querySelectorAll('.history-summary-card')).forEach(function(card){var label=norm((card.querySelector('.history-summary-label')||card).textContent||'');if(targets[label])card.classList.add('ba-user-hidden');else card.classList.remove('ba-user-hidden')});var active=document.querySelector('#tab-istoric21 .history-summary-card.active.ba-user-hidden');if(active){var first=[].slice.call(tab.querySelectorAll('.history-summary-card')).find(function(c){return !c.classList.contains('ba-user-hidden')});if(first){try{first.click()}catch(e){}}}}

  function findControlsRoot(){var tab=document.getElementById('tab-meciuri');if(!tab)return null;return tab.querySelector('.matches-section-card')||tab.querySelector('.mf-card')||null}
  function byText(root,predicate){return [].slice.call(root.querySelectorAll('button')).filter(function(b){return predicate(norm(b.textContent||''),b)})}
  function compactEmptyParent(nodes){nodes.forEach(function(n){var p=n&&n.parentElement;if(p&&p!==n.closest('.ba-controls-premium')&&p.children.length===0)p.classList.add('ba-user-empty')})}
  function polishMeciuriControls(){
    var root=findControlsRoot();if(!root)return;root.classList.add('ba-matches-controls');
    var mode=byText(root,function(t){return t==='SIMPLU'||t==='EXPERT'});
    var market=byText(root,function(t){return ['TOATE','TOP','O1.5','BTTS','U3.5','VALUE'].indexOf(t)>=0});
    var tools=byText(root,function(t){return t.indexOf('FILTRE')>=0||t==='ORA'});
    var select=root.querySelector('select.sort-select,select.league-filter-select,select');
    if(!mode.length&&!market.length&&!tools.length&&!select)return;
    var host=root.querySelector('.ba-controls-premium');
    if(!host){host=document.createElement('div');host.className='ba-controls-premium';var head=root.querySelector('.matches-card-head,.mf-header');if(head)head.insertAdjacentElement('afterend',host);else root.insertBefore(host,root.firstChild)}
    var modeGroup=host.querySelector('.ba-mode-group')||document.createElement('div');modeGroup.className='ba-mode-group';
    var marketGroup=host.querySelector('.ba-market-group')||document.createElement('div');marketGroup.className='ba-market-group';
    var toolsGroup=host.querySelector('.ba-tools-group')||document.createElement('div');toolsGroup.className='ba-tools-group';
    if(!modeGroup.parentNode)host.appendChild(modeGroup);if(!marketGroup.parentNode)host.appendChild(marketGroup);if(!toolsGroup.parentNode)host.appendChild(toolsGroup);
    mode.forEach(function(b){b.classList.add('ba-mode-btn');modeGroup.appendChild(b)});
    market.forEach(function(b){b.classList.add('ba-market-chip');marketGroup.appendChild(b)});
    if(select){select.classList.add('ba-time-control');toolsGroup.appendChild(select)}
    tools.forEach(function(b){if(norm(b.textContent||'')==='ORA')b.classList.add('ba-time-control');else b.classList.add('ba-filter-control');toolsGroup.appendChild(b)});
    compactEmptyParent(mode.concat(market).concat(tools));
  }

  function patch(){addCss();cleanupMeciuri();cleanupIstoric21();polishMeciuriControls();var s=trackerSummary();if(s)patchDashboard(s)}
  function boot(){patch();[100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,700);try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,50)}).observe(document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
