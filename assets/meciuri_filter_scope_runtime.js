// BetAnalytics Pro - Meciuri filter scope hotfix
// Fix: a disabled market in dynamic_thresholds must not disable every other market.
(function(){
  'use strict';
  if(window.__baMarketDisabledScopeHotfixV1)return;
  window.__baMarketDisabledScopeHotfixV1=1;
  var G = (typeof globalThis !== 'undefined') ? globalThis : window;

  function install(){
    if(typeof G.buildMarketCandidate !== 'function' || typeof G.isMarketDisabled !== 'function') return false;
    if(G.buildMarketCandidate.__baMarketDisabledScopeHotfix) return true;

    var originalBuild = G.buildMarketCandidate;
    var originalDisabled = G.isMarketDisabled;

    G.buildMarketCandidate = function(m, type){
      // Respect disabled only for the market currently being evaluated.
      if(originalDisabled && originalDisabled(type)) return null;

      // Prevent legacy app.js checks like isMarketDisabled('over15') from aborting btts/u35/o25.
      var saved = G.isMarketDisabled;
      G.isMarketDisabled = function(){ return false; };
      try{
        return originalBuild.apply(this, arguments);
      } finally {
        G.isMarketDisabled = saved;
      }
    };
    G.buildMarketCandidate.__baMarketDisabledScopeHotfix = true;

    try{ if(typeof G.syncRecommendationEngine === 'function') G.syncRecommendationEngine(); }catch(e){}
    try{
      var tab = document.getElementById('tab-meciuri');
      if(typeof G.renderMatches === 'function' && tab && tab.classList.contains('active')) G.renderMatches();
    }catch(e){}
    try{ if(typeof G.updateHeaderStatus === 'function') G.updateHeaderStatus(); }catch(e){}
    return true;
  }

  function boot(){ install(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){ setTimeout(boot, t); });
})();
