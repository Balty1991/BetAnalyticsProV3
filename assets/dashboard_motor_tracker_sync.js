// Dashboard Motor sync + cleanup + premium Meciuri controls.
(function(){
  'use strict';
  if(window.__baDashboardMotorTrackerSyncV8)return;
  window.__baDashboardMotorTrackerSyncV8=1;

  var lastJournalSync=0;
  function num(v){v=Number(v||0);return isFinite(v)?v:0}
  function fmt(v){try{return Math.round(num(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(num(v)))}}
  function pct(v,d){var x=num(v);return(x>=0?'+':'')+x.toFixed(d==null?2:d)+'%'}
  function wr(v){return num(v).toFixed(1)+'%'}
  function tone(v){return num(v)>0?'var(--grn)':(num(v)<0?'var(--red)':'var(--txt)')}
  function winTone(v){return num(v)>=65?'var(--grn)':(num(v)<50?'var(--red)':'var(--txt)')}
  function txt(v){try{return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}catch(e){return String(v||'').replace(/\s+/g,' ').trim()}}
  function up(v){return txt(v).toUpperCase()}
  function statusOf(r){var s=String((r&&r.status)||(r&&r.result)||(r&&r.outcome)||'').toLowerCase();if(s==='won'||s==='w'||s==='win')return'win';if(s==='lost'||s==='loss'||s==='l'||s==='lose')return'lose';return'pending'}
  function profitOf(r){var o=num((r&&r.odds)||(r&&r.displayOdds)||(r&&r.book_odds));return statusOf(r)==='win'?(o>1?o-1:0):-1}

  function addCss(){
    if(document.getElementById('ba-cleanup-css-v8'))return;
    var st=document.createElement('style');
    st.id='ba-cleanup-css-v8';
    st.textContent=[
      '#ba-match-probar,#matches-help-panel,.ba-user-hidden,.ba-user-empty{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#tab-meciuri .ba-matches-controls{margin:0 0 18px!important;padding:16px!important;border-radius:28px!important;background:radial-gradient(ellipse at 0% 0%,rgba(43,229,197,.13),transparent 50%),radial-gradient(ellipse at 100% 100%,rgba(96,165,250,.09),transparent 50%),linear-gradient(180deg,rgba(14,22,44,.98) 0%,rgba(8,12,26,.98) 100%)!important;border:1px solid rgba(78,99,145,.48)!important;box-shadow:0 20px 52px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.05)!important;overflow:hidden!important}',
      '#tab-meciuri .ba-match-head-premium{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:0 0 14px!important;padding:0 2px 13px!important;border-bottom:1px solid rgba(255,255,255,.07)!important}',
      '#tab-meciuri .ba-match-title-premium{display:flex!important;align-items:center!important;gap:9px!important;font-size:18px!important;font-weight:950!important;letter-spacing:-.04em!important;color:#ecf5ff!important}',
      '#tab-meciuri .ba-match-count-premium,#tab-meciuri .ba-matches-controls #filter-count{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:4px 12px!important;border-radius:999px!important;background:rgba(43,229,197,.12)!important;border:1px solid rgba(43,229,197,.32)!important;color:var(--acc)!important;font-size:11px!important;font-weight:950!important;font-family:var(--mono)!important;letter-spacing:.01em!important}',
      '#tab-meciuri .ba-controls-premium{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}',
      '#tab-meciuri .ba-mode-group{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important;padding:5px!important;border-radius:22px!important;background:rgba(0,0,0,.28)!important;border:1px solid rgba(255,255,255,.08)!important}',
      '#tab-meciuri .ba-mode-btn{min-height:46px!important;border-radius:17px!important;border:1px solid transparent!important;background:transparent!important;color:rgba(155,175,210,.75)!important;font-size:14px!important;font-weight:900!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;cursor:pointer!important;transition:all .2s ease!important;box-shadow:none!important}',
      '#tab-meciuri .ba-mode-btn:hover:not(.active){color:rgba(220,235,255,.85)!important;background:rgba(255,255,255,.04)!important}',
      '#tab-meciuri .ba-mode-btn.active,#tab-meciuri .ba-mode-btn[aria-selected="true"],#tab-meciuri .ba-mode-btn[aria-pressed="true"]{background:linear-gradient(135deg,rgba(43,229,197,.28) 0%,rgba(59,130,246,.18) 100%)!important;border-color:rgba(43,229,197,.52)!important;color:#62f6df!important;box-shadow:0 8px 22px rgba(43,229,197,.14),inset 0 1px 0 rgba(255,255,255,.09)!important}',
      '#tab-meciuri .ba-market-group{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;padding:10px!important;border-radius:22px!important;background:rgba(0,0,0,.22)!important;border:1px solid rgba(255,255,255,.065)!important}',
      '#tab-meciuri .ba-market-chip{min-height:48px!important;border-radius:16px!important;padding:0 8px!important;border:1px solid rgba(110,135,175,.28)!important;background:linear-gradient(180deg,rgba(255,255,255,.065) 0%,rgba(255,255,255,.025) 100%)!important;color:rgba(210,225,248,.85)!important;font-size:13px!important;font-weight:900!important;letter-spacing:-.01em!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;white-space:nowrap!important;cursor:pointer!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)!important;transition:all .18s ease!important}',
      '#tab-meciuri .ba-market-chip:hover:not(.active){border-color:rgba(43,229,197,.35)!important;color:#d4f0ff!important;background:linear-gradient(180deg,rgba(43,229,197,.07) 0%,rgba(43,229,197,.02) 100%)!important}',
      '#tab-meciuri .ba-market-chip.active,#tab-meciuri .ba-market-chip[aria-selected="true"],#tab-meciuri .ba-market-chip[aria-pressed="true"]{background:linear-gradient(135deg,rgba(43,229,197,.26) 0%,rgba(59,130,246,.16) 100%)!important;border-color:rgba(43,229,197,.62)!important;color:#65f8e2!important;box-shadow:0 0 0 1px rgba(43,229,197,.12),0 10px 28px rgba(43,229,197,.13)!important}',
      '#tab-meciuri .ba-tools-group{display:grid!important;grid-template-columns:minmax(0,1fr) 130px!important;gap:10px!important;align-items:center!important}',
      '#tab-meciuri .ba-time-control,#tab-meciuri .ba-tools-group select,#tab-meciuri .ba-tools-group .sort-select{width:100%!important;min-height:50px!important;border-radius:18px!important;padding:0 16px!important;background:rgba(255,255,255,.05)!important;border:1px solid rgba(110,135,175,.28)!important;color:#d8e8ff!important;font-size:14px!important;font-weight:800!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important;appearance:auto!important}',
      '#tab-meciuri .ba-filter-control{min-width:130px!important;min-height:50px!important;border-radius:18px!important;padding:0 16px!important;background:rgba(255,255,255,.05)!important;border:1px solid rgba(110,135,175,.28)!important;color:#d8e8ff!important;font-size:14px!important;font-weight:900!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;cursor:pointer!important;transition:all .18s ease!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important}',
      '#tab-meciuri .ba-filter-control:hover{border-color:rgba(43,229,197,.4)!important;color:#fff!important;background:rgba(43,229,197,.06)!important}',
      '#tab-meciuri .ba-matches-controls .matches-card-head,#tab-meciuri .ba-matches-controls .mf-header,#tab-meciuri .ba-matches-controls .mf-chips-scroll,#tab-meciuri .ba-matches-controls .mf-sort-row,#tab-meciuri .ba-matches-controls .matches-filter-toolbar,#tab-meciuri .ba-matches-controls .filter-bar{display:none!important}',
      '@media(max-width:430px){#tab-meciuri .ba-matches-controls{padding:13px!important;border-radius:24px!important}#tab-meciuri .ba-match-title-premium{font-size:17px!important}#tab-meciuri .ba-market-group{gap:7px!important;padding:8px!important}#tab-meciuri .ba-market-chip{min-height:44px!important;font-size:12px!important;padding:0 6px!important}#tab-meciuri .ba-mode-btn{min-height:42px!important;font-size:13px!important}#tab-meciuri .ba-tools-group{grid-template-columns:1fr 116px!important}#tab-meciuri .ba-time-control,#tab-meciuri .ba-tools-group select{min-height:46px!important}#tab-meciuri .ba-filter-control{min-width:116px!important;min-height:46px!important}}'
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
  function cleanupMeciuri(){
    removeNode('ba-match-probar');removeNode('matches-help-panel');removeNode('ba-matches-motor-sync');
    [].slice.call(document.querySelectorAll('#tab-meciuri .mf-chip,.mf-chip')).forEach(function(btn){
      var t=(btn.textContent||'').toLowerCase(),on=String(btn.getAttribute('onclick')||'');
      if(on.indexOf('motor_validated')>=0||t.indexOf('motor')>=0){
        if(btn.classList&&btn.classList.contains('active')){try{window.CURRENT_FILTER='all'}catch(e){}try{if(typeof window.renderMatches==='function')window.renderMatches()}catch(e){}}
        if(btn.parentNode)btn.parentNode.removeChild(btn);
      }
    });
  }
  function cleanupIstoric21(){
    var tab=document.getElementById('tab-istoric21');if(!tab)return;
    var targets={'SANSA DUBLA':1,'VALIDATE MOTOR':1};
    [].slice.call(tab.querySelectorAll('.history-summary-card')).forEach(function(card){
      var label=up((card.querySelector('.history-summary-label')||card).textContent||'');
      if(targets[label])card.classList.add('ba-user-hidden');else card.classList.remove('ba-user-hidden');
    });
    var active=document.querySelector('#tab-istoric21 .history-summary-card.active.ba-user-hidden');
    if(active){var first=[].slice.call(tab.querySelectorAll('.history-summary-card')).find(function(c){return !c.classList.contains('ba-user-hidden')});if(first){try{first.click()}catch(e){}}}
  }

  /* ─── FIX: cleanText strips emoji before matching; controlButtons
     guards against help-chip buttons and anything inside a match card ─── */
  function cleanText(b){
    return up(b.textContent||'').replace(/[^\w.\s%-]/g,'').replace(/\s+/g,' ').trim();
  }
  function controlButtons(tab){
    return [].slice.call(tab.querySelectorAll('button')).filter(function(b){
      if(b.classList.contains('help-chip'))   return false;
      if(b.classList.contains('reason-pill')) return false;
      var inCard=(function(el){
        while(el&&el!==tab){
          if(el.classList&&(el.classList.contains('match-card')||el.classList.contains('match-card-v16')||el.classList.contains('m16-extra')))return true;
          el=el.parentElement;
        }
        return false;
      })(b);
      if(inCard)return false;
      var t=cleanText(b);
      return ['SIMPLU','EXPERT','TOATE','TOP','O1.5','O2.5','BTTS','U3.5','VALUE'].indexOf(t)>=0||t.indexOf('FILTRE')>=0;
    });
  }

  function commonRoot(nodes,tab){if(!nodes.length)return null;var p=nodes[0].parentElement;while(p&&p!==tab&&p!==document.body){var ok=nodes.every(function(n){return p.contains(n)});if(ok)return p;p=p.parentElement}return null}
  function nearestCard(node,tab){var n=node;while(n&&n!==tab&&n!==document.body){var text=up(n.textContent||'');if(text.indexOf('MECIURI')>=0&&text.indexOf('SIMPLU')>=0)return n;n=n.parentElement}return null}

  function polishMeciuriControls(){
    var tab=document.getElementById('tab-meciuri');if(!tab)return;
    var buttons=controlButtons(tab);
    var select=tab.querySelector('select.mf-select,select#sort-select');
    if(!buttons.length&&!select)return;
    var base=commonRoot(buttons.concat(select?[select]:[]),tab)||nearestCard(buttons[0]||select,tab)||tab.querySelector('.section,.card,div');
    if(!base)return;
    var root=nearestCard(base,tab)||base;
    root.classList.add('ba-matches-controls');
    var count=document.getElementById('filter-count')||root.querySelector('.filter-count');
    var head=root.querySelector('.ba-match-head-premium');
    if(!head){head=document.createElement('div');head.className='ba-match-head-premium';root.insertBefore(head,root.firstChild)}
    var countText=count?txt(count.textContent):'';
    head.innerHTML='<div class="ba-match-title-premium">⚽ Meciuri</div><div class="ba-match-count-premium">'+(countText||'—')+'</div>';
    if(count)count.classList.add('ba-user-hidden');
    var host=root.querySelector('.ba-controls-premium');
    if(!host){host=document.createElement('div');host.className='ba-controls-premium';head.insertAdjacentElement('afterend',host)}
    var modeGroup=host.querySelector('.ba-mode-group')||document.createElement('div');
    var marketGroup=host.querySelector('.ba-market-group')||document.createElement('div');
    var toolsGroup=host.querySelector('.ba-tools-group')||document.createElement('div');
    modeGroup.className='ba-mode-group';marketGroup.className='ba-market-group';toolsGroup.className='ba-tools-group';
    if(!modeGroup.parentNode)host.appendChild(modeGroup);
    if(!marketGroup.parentNode)host.appendChild(marketGroup);
    if(!toolsGroup.parentNode)host.appendChild(toolsGroup);
    /* FIX: check parentNode before appending — prevents duplicate moves */
    buttons.forEach(function(b){
      var t=cleanText(b);
      if(t==='SIMPLU'||t==='EXPERT'){
        b.classList.add('ba-mode-btn');
        if(b.parentNode!==modeGroup)modeGroup.appendChild(b);
      }else if(['TOATE','TOP','O1.5','O2.5','BTTS','U3.5','VALUE'].indexOf(t)>=0){
        b.classList.add('ba-market-chip');
        if(b.parentNode!==marketGroup)marketGroup.appendChild(b);
      }else if(t.indexOf('FILTRE')>=0){
        b.classList.add('ba-filter-control');
        if(b.parentNode!==toolsGroup)toolsGroup.appendChild(b);
      }
    });
    if(select){select.classList.add('ba-time-control');if(select.parentNode!==toolsGroup)toolsGroup.insertBefore(select,toolsGroup.firstChild)}
    try{
      var mode=window.MATCH_CARD_MODE||localStorage.getItem('bet_match_card_mode')||'simple';
      [].slice.call(modeGroup.querySelectorAll('.ba-mode-btn')).forEach(function(el){
        el.classList.toggle('active',cleanText(el)===mode.toUpperCase());
      });
    }catch(e){}
    [].slice.call(root.children).forEach(function(ch){
      if(ch===head||ch===host)return;
      var t=up(ch.textContent||'');
      if(t&&t.indexOf('MECIURI')>=0&&(t.indexOf('SIMPLU')>=0||t.indexOf('EXPERT')>=0))ch.classList.add('ba-user-empty');
    });
  }

  function patch(){addCss();cleanupMeciuri();cleanupIstoric21();polishMeciuriControls();var s=trackerSummary();if(s)patchDashboard(s)}
  function boot(){patch();[100,350,800,1600,3200,5200,9000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,600);try{new MutationObserver(function(){clearTimeout(window.__baMotorTrackerSyncT);window.__baMotorTrackerSyncT=setTimeout(patch,45)}).observe(document.body,{childList:true,subtree:true,characterData:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
