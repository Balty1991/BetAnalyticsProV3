// BetAnalytics Pro: theme switch disabled safely.
(function(){
  'use strict';
  if(window.__baThemeSwitchNoopV2)return;
  window.__baThemeSwitchNoopV2=true;

  function addCss(){
    if(document.getElementById('ba-theme-switch-disabled-css'))return;
    var s=document.createElement('style');
    s.id='ba-theme-switch-disabled-css';
    s.textContent='#ba-theme-toggle,.ba-theme-toggle{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    document.head.appendChild(s);
  }

  function cleanupOnce(){
    try{localStorage.removeItem('ba-theme-mode-v1');}catch(e){}
    try{document.documentElement.removeAttribute('data-theme');}catch(e){}
    document.querySelectorAll('#ba-theme-toggle,.ba-theme-toggle').forEach(function(el){
      if(el&&el.parentNode)el.parentNode.removeChild(el);
    });
  }

  function boot(){addCss();cleanupOnce();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
})();
