// BetAnalytics Pro runtime compatibility patch.
// Keeps Dashboard Performance in the original video layout; no duplicate mini cards, no hidden KPI cards.
(function(){
  'use strict';
  if(window.__baApiHistoryLabelRuntimeV17)return;
  window.__baApiHistoryLabelRuntimeV17=1;
  function cleanupPerformance(){
    document.querySelectorAll('.dashboard-v16-performance').forEach(function(card){
      card.querySelectorAll('.ba-perf-mini-row,.ba-21-ruler').forEach(function(el){if(el&&el.parentNode)el.parentNode.removeChild(el)});
      card.querySelectorAll('.dashboard-v16-perf-stats,.dashboard-v16-stat-card').forEach(function(el){el.style.removeProperty('display')});
    });
  }
  function addCss(){
    if(document.getElementById('ba-runtime-v17-video-css'))return;
    ['ba-runtime-v16-css','ba-runtime-v15-css','ba-runtime-v14-css','ba-runtime-v13-css','ba-runtime-v12-css','ba-runtime-v11-css','ba-runtime-v10-css','ba-runtime-v9-css'].forEach(function(id){var o=document.getElementById(id);if(o)o.remove()});
    var s=document.createElement('style');
    s.id='ba-runtime-v17-video-css';
    s.textContent='.dashboard-v16-performance .dashboard-v16-perf-stats{display:grid!important}.dashboard-v16-performance .dashboard-v16-stat-card{display:block!important}.dashboard-v16-performance .ba-perf-mini-row,.dashboard-v16-performance .ba-21-ruler{display:none!important}.ba-profit-row{box-shadow:inset 3px 0 0 rgba(34,197,94,.65)!important}.ba-loss-row{box-shadow:inset 3px 0 0 rgba(239,68,68,.65)!important}.ba-profit-row .dash-cat-name{color:var(--grn)!important}.ba-loss-row .dash-cat-name{color:var(--red)!important}';
    document.head.appendChild(s);
  }
  function boot(){addCss();cleanupPerformance();[100,300,700,1400,2800,5000,9000].forEach(function(t){setTimeout(cleanupPerformance,t)});setInterval(cleanupPerformance,3000);try{new MutationObserver(function(){clearTimeout(window.__baV17t);window.__baV17t=setTimeout(cleanupPerformance,80)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
