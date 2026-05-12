(function(){
  'use strict';

  /*
   * VEYRA TruthGuard v6 canonical bridge
   *
   * index.html already loads this file. The old version rendered Supreme v5 and
   * capped the visible list at 10 cards, while the raw pool could contain 32+
   * signals. This bridge disables the old Supreme v5 UI renderer and loads the
   * TruthGuard v6 renderer as the single source of truth.
   */

  if (window.__VEYRA_TRUTHGUARD_V6_BRIDGE__) return;
  window.__VEYRA_TRUTHGUARD_V6_BRIDGE__ = true;

  function loadTruthGuard(){
    if (window.__VEYRA_TRUTHGUARD_V6_RUNTIME__ || window.__VEYRA_TRUTHGUARD_V6_LOADING__) {
      return;
    }
    window.__VEYRA_TRUTHGUARD_V6_LOADING__ = true;

    try {
      var s = document.createElement('script');
      s.defer = true;
      s.src = './assets/truthguard_v6_runtime_patch.js?v=20260512tg6_consistency_fix';
      s.onload = function(){
        window.__VEYRA_TRUTHGUARD_V6_LOADING__ = false;
      };
      s.onerror = function(){
        window.__VEYRA_TRUTHGUARD_V6_LOADING__ = false;
        console.warn('[VEYRA] TruthGuard v6 runtime file missing: assets/truthguard_v6_runtime_patch.js');
      };
      document.head.appendChild(s);
    } catch(e) {
      window.__VEYRA_TRUTHGUARD_V6_LOADING__ = false;
    }
  }

  function cleanOldV5(){
    try {
      document.querySelectorAll('#v5-supreme-engine').forEach(function(el){
        el.remove();
      });
    } catch(e) {}
  }

  function boot(){
    cleanOldV5();
    loadTruthGuard();
    setTimeout(cleanOldV5, 600);
    setTimeout(cleanOldV5, 1400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', boot);

  document.addEventListener('click', function(ev){
    var c = String((ev.target && ev.target.className) || '');
    if (c.indexOf('smartlearn-tab') >= 0 || c.indexOf('more-card-btn') >= 0 || c.indexOf('tab') >= 0) {
      setTimeout(boot, 250);
    }
  }, true);
})();
