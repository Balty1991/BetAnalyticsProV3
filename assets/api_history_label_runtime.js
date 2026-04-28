// BetAnalytics Pro runtime bridge — video exact mode + semantic colors.
// The visual renderer is owned by dashboard_history21_sync.js. This file removes old conflicting styles and loads the color runtime.
(function(){
  'use strict';
  if(window.__baApiHistoryLabelRuntimeVideoExactColor)return;
  window.__baApiHistoryLabelRuntimeVideoExactColor=1;
  function cleanup(){
    ['ba-runtime-v17-video-css','ba-dashboard-video-restore-css'].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.removeChild(el)});
  }
  function loadColors(){
    if(document.getElementById('performance-color-runtime-script')||document.querySelector('script[src*="performance_color_runtime.js"]'))return;
    var s=document.createElement('script');
    s.id='performance-color-runtime-script';
    s.src='assets/performance_color_runtime.js?v=20260428color1';
    s.defer=true;
    document.head.appendChild(s);
  }
  function boot(){cleanup();loadColors();setTimeout(cleanup,100);setTimeout(loadColors,150);setTimeout(cleanup,800);setTimeout(loadColors,900);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
