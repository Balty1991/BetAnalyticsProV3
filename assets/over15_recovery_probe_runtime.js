// BetAnalytics Pro - Over 1.5 recovery probe runtime
// Keeps Over 1.5 eligible after none_profitable, but only with strict probe filters.
(function(){
  'use strict';
  if(window.__baOver15RecoveryProbeV1) return;
  window.__baOver15RecoveryProbeV1 = 1;

  var G = (typeof globalThis !== 'undefined') ? globalThis : window;

  function thresholds(){
    try{
      return (G.MODEL_BENCHMARKS && G.MODEL_BENCHMARKS.dynamic_thresholds) || {};
    }catch(e){ return {}; }
  }

  function isProbeMarket(marketKey){
    var t = thresholds()[marketKey];
    return !!(t && t.probe_mode === true);
  }

  function strictOver15ProbePass(match, candidate){
    if(!candidate || !candidate.bestBet) return false;
    var b = candidate.bestBet;
    var edge = Number(b.edgePct || 0);
    var adjProb = Number(b.adjProb || 0);
    var rawProb = Number((match && match.probOver15) || candidate.probOver15 || 0);
    var xgTotal = Number((match && match.xgTotal) || candidate.xgTotal || 0);
    var value = Number(b.value || 0);
    var odds = Number(b.odds || 0);

    return edge >= 15 && adjProb >= 76 && rawProb >= 78 && xgTotal >= 2.20 && value >= 0.03 && odds >= 1.20;
  }

  function install(){
    var installed = false;

    if(typeof G.isMarketDisabled === 'function' && !G.isMarketDisabled.__baOver15RecoveryProbe){
      var originalDisabled = G.isMarketDisabled;
      G.isMarketDisabled = function(marketKey){
        if(isProbeMarket(marketKey)) return false;
        return originalDisabled.apply(this, arguments);
      };
      G.isMarketDisabled.__baOver15RecoveryProbe = true;
      installed = true;
    }

    if(typeof G.buildMarketCandidate === 'function' && !G.buildMarketCandidate.__baOver15RecoveryProbe){
      var originalBuild = G.buildMarketCandidate;
      var originalDisabledFn = G.isMarketDisabled;

      G.buildMarketCandidate = function(match, type){
        // Scope disabled checks to the candidate market. Older app.js versions had
        // unscoped checks that could make one disabled market block all markets.
        var savedDisabled = G.isMarketDisabled;
        if(typeof originalDisabledFn === 'function'){
          G.isMarketDisabled = function(marketKey){
            if(marketKey !== type) return false;
            if(isProbeMarket(marketKey)) return false;
            return originalDisabledFn.apply(this, arguments);
          };
        }

        var candidate;
        try{
          candidate = originalBuild.apply(this, arguments);
        } finally {
          G.isMarketDisabled = savedDisabled;
        }

        if(type === 'over15' && isProbeMarket('over15')){
          if(!strictOver15ProbePass(match, candidate)) return null;
          try{
            candidate.bestBet.recoveryProbe = true;
            candidate.why = ('Recovery probe O1.5' + (candidate.why ? ' • ' + candidate.why : '')).slice(0, 140);
          }catch(e){}
        }
        return candidate;
      };
      G.buildMarketCandidate.__baOver15RecoveryProbe = true;
      installed = true;
    }

    if(installed){
      try{ if(typeof G.syncRecommendationEngine === 'function') G.syncRecommendationEngine(); }catch(e){}
      try{
        var tab = document.getElementById('tab-meciuri');
        if(typeof G.renderMatches === 'function' && tab && tab.classList.contains('active')) G.renderMatches();
      }catch(e){}
      try{ if(typeof G.updateHeaderStatus === 'function') G.updateHeaderStatus(); }catch(e){}
    }
    return installed;
  }

  function boot(){ install(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){ setTimeout(boot, t); });
})();
