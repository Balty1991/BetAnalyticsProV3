// BetAnalyticsProV3 lean runtime guard
// Dashboard is intentionally blank; keep active tabs functional and stop legacy hidden loaders.
(function(){
  'use strict';
  if (window.__baLeanRuntimeGuardV1) return;
  window.__baLeanRuntimeGuardV1 = true;
  window.__BA_DASHBOARD_BLANK = true;

  var originalSetInterval = window.setInterval ? window.setInterval.bind(window) : null;
  if (originalSetInterval) {
    window.setInterval = function(fn, delay) {
      var ms = Number(delay || 0);
      var name = '';
      try { name = String((fn && fn.name) || ''); } catch(e) {}
      var src = '';
      try { src = String(fn || ''); } catch(e) {}

      // Legacy daily dashboard refresh: it rendered Top 2 / Dashboard blocks every day.
      if (ms === 60000 && (name === 'checkDailyRefresh' || src.indexOf('checkDailyRefresh') >= 0)) {
        console.info('[BA] skipped legacy checkDailyRefresh interval');
        return 0;
      }
      // Keep app data auto-refresh active. doRefresh must remain active; external cron cadence is 30 minutes.

      return originalSetInterval.apply(this, arguments);
    };
  }

  function neutralizeDashboardOnly(){
    if (!window.__BA_DASHBOARD_BLANK) return;
    try {
      var dash = document.getElementById('tab-dashboard');
      if (dash) dash.setAttribute('data-dashboard-blank', '1');
    } catch(e) {}
  }

  function loadTruthGuardV6Patch(){
    if (window.__VEYRA_TRUTHGUARD_V6_LOADER__) return;
    window.__VEYRA_TRUTHGUARD_V6_LOADER__ = true;
    try {
      var s = document.createElement('script');
      s.defer = true;
      s.src = './assets/truthguard_v6_runtime_patch.js?v=20260512truthguardv6';
      document.head.appendChild(s);
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      neutralizeDashboardOnly();
      loadTruthGuardV6Patch();
    });
  } else {
    neutralizeDashboardOnly();
    loadTruthGuardV6Patch();
  }
})();
