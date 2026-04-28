// BetAnalytics Pro runtime bridge — video exact mode.
// The visual renderer is owned by dashboard_history21_sync.js. This file only removes old conflicting video-restore styles.
(function(){
  'use strict';
  if(window.__baApiHistoryLabelRuntimeVideoExact)return;
  window.__baApiHistoryLabelRuntimeVideoExact=1;
  function cleanup(){
    ['ba-runtime-v17-video-css','ba-dashboard-video-restore-css'].forEach(function(id){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.removeChild(el)});
  }
  function boot(){cleanup();setTimeout(cleanup,100);setTimeout(cleanup,800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
