(function(){
  'use strict';

  /*
   * VEYRA Apex Engine Bridge v1.0
   * Inlocuieste TruthGuard cu noul Apex Neural Engine.
   */

  if (window.__VEYRA_APEX_BRIDGE__) return;
  window.__VEYRA_APEX_BRIDGE__ = true;

  /* Block old engines */
  window.__VEYRA_TRUTHGUARD_V7_RUNTIME__ = true;
  window.__VEYRA_TRUTHGUARD_V6_RUNTIME__ = true;
  window.__VEYRA_TRUTHGUARD_V6_BRIDGE__  = true;
  window.__VEYRA_TRUTHGUARD_V6_LOADING__ = false;
  window.__SUPREME_ENGINE_V5_RENDERED__  = true;

  function loadApex(){
    if (window.__VEYRA_APEX_ENGINE__ || window.__VEYRA_APEX_LOADING__) return;
    window.__VEYRA_APEX_LOADING__ = true;
    try {
      var s = document.createElement('script');
      s.defer = true;
      s.src = './assets/veyra_apex_engine.js?v=20260604lgt2';
      s.onload = function(){ window.__VEYRA_APEX_LOADING__ = false; };
      s.onerror = function(){ window.__VEYRA_APEX_LOADING__ = false; };
      document.head.appendChild(s);
      if (!document.querySelector('link[href*="veyra_apex_theme"]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = './assets/veyra_apex_theme.css?v=20260516apex3';
        document.head.appendChild(l);
      }
    } catch(e) { window.__VEYRA_APEX_LOADING__ = false; }
  }

  function cleanOld(){
    try { document.querySelectorAll('#v5-supreme-engine').forEach(function(el){ el.remove(); }); } catch(e) {}
  }

  function boot(){
    cleanOld();
    loadApex();
    setTimeout(cleanOld, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', boot);

  document.addEventListener('click', function(ev){
    var c = String((ev.target && ev.target.className) || '');
    var t = String((ev.target && ev.target.textContent) || '');
    if (c.indexOf('more-card-btn') >= 0 || t.indexOf('Motor de Predic') >= 0 ||
        c.indexOf('sheet-btn') >= 0 || c.indexOf('tab') >= 0) {
      setTimeout(function(){
        if (window.__VEYRA_APEX_ENGINE__ && typeof window.renderUnifiedEngine === 'function') {
          window.renderUnifiedEngine();
        }
      }, 300);
    }
  }, true);
})();
