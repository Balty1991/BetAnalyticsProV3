// BetAnalytics Pro: theme switch disabled / rollback helper
(function(){
  'use strict';
  if(window.__baThemeSwitchDisabledV1)return;
  window.__baThemeSwitchDisabledV1=true;

  function cleanup(){
    try{localStorage.removeItem('ba-theme-mode-v1');}catch(e){}
    try{document.documentElement.removeAttribute('data-theme');}catch(e){}
    try{
      var meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content','#06080F');
    }catch(e){}
    document.querySelectorAll('#ba-theme-toggle,.ba-theme-toggle,#ba-theme-switch-css,#ba-light-grey-css,#ba-light-grey-polish-css').forEach(function(el){
      if(el&&el.parentNode)el.parentNode.removeChild(el);
    });
  }

  function addHideCss(){
    if(document.getElementById('ba-theme-switch-disabled-css'))return;
    var s=document.createElement('style');
    s.id='ba-theme-switch-disabled-css';
    s.textContent='#ba-theme-toggle,.ba-theme-toggle{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    document.head.appendChild(s);
  }

  function boot(){addHideCss();cleanup();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',boot);
  document.addEventListener('click',function(){setTimeout(cleanup,0);},true);
  try{new MutationObserver(cleanup).observe(document.documentElement,{childList:true,subtree:true,attributes:true});}catch(e){}
  [50,150,400,900,1500,3000,6000].forEach(function(t){setTimeout(boot,t);});
})();
