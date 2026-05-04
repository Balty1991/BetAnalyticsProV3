(function(){
  if(window.__baLightGreyRuntime)return;
  window.__baLightGreyRuntime=1;
  function add(){
    if(document.getElementById('ba-light-grey-css'))return;
    var s=document.createElement('style');
    s.id='ba-light-grey-css';
    s.textContent='html[data-theme="light"] body{background:#dfe7ec!important;color:#172033!important}html[data-theme="light"] .header{background:#dfe7ec!important}html[data-theme="light"] .logo-title,html[data-theme="light"] .logo-title *{background:none!important;-webkit-text-fill-color:#087f73!important;color:#087f73!important;opacity:1!important}html[data-theme="light"] .match-card,html[data-theme="light"] .match-card-pro,html[data-theme="light"] .fixture-card{background:linear-gradient(180deg,#e6eef3,#d0dde6)!important;color:#172033!important;border-color:rgba(15,186,166,.35)!important}html[data-theme="light"] .section,html[data-theme="light"] .panel,html[data-theme="light"] .card,html[data-theme="light"] .tab-content,html[data-theme="light"] .more-card-btn{background:linear-gradient(180deg,#e8eff3,#dae4eb)!important;color:#172033!important}html[data-theme="light"] .mobile-nav,html[data-theme="light"] .tabs{background:#e2eaef!important}html[data-theme="light"] .match-team,html[data-theme="light"] .team-name,html[data-theme="light"] .league-name,html[data-theme="light"] h1,html[data-theme="light"] h2,html[data-theme="light"] h3{color:#172033!important;-webkit-text-fill-color:#172033!important}html[data-theme="light"] .match-why,html[data-theme="light"] .more-card-sub,html[data-theme="light"] .mc-league,html[data-theme="light"] .mc-time{color:#5c6b7e!important;opacity:1!important}';
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
  window.addEventListener('load',add);
})();
