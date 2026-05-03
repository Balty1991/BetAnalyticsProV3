/**
 * smartbet_v2_integration.js
 * ===========================
 * Patch de integrare SmartBet Fusion v2 în BetAnalytics Pro Aurora.
 *
 * Copiază/include acest fișier în index.html sau importă-l în app.js.
 * Înlocuiește calcSmartScore și loadModelPack cu versiunile v2.
 *
 * JSON-uri noi necesare (generate de train_engine_v2.py + export_app.py):
 *   data/model_pack_v2.json
 *   data/ev_signals_v2.json
 *   data/shap_global_v2.json
 *   data/smartbet_meta_v2.json
 *   data/league_baselines_compact.json
 */

// ─── State global v2 ─────────────────────────────────────────────────────────
window.__SBV2__ = {
  modelPack:    null,
  evSignals:    null,
  shapGlobal:   null,
  meta:         null,
  baselines:    null,
  loaded:       false,
};

// ─── Loader ──────────────────────────────────────────────────────────────────
async function loadSmartBetV2() {
  const base  = '';   // relativ la root GitHub Pages
  const files = [
    ['modelPack',  'data/model_pack_v2.json'],
    ['evSignals',  'data/ev_signals_v2.json'],
    ['shapGlobal', 'data/shap_global_v2.json'],
    ['meta',       'data/smartbet_meta_v2.json'],
    ['baselines',  'data/league_baselines_compact.json'],
  ];

  const results = await Promise.allSettled(
    files.map(([, path]) =>
      fetch(`${base}${path}?v=${Date.now()}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );

  files.forEach(([key], i) => {
    window.__SBV2__[key] = results[i].value ?? null;
  });

  window.__SBV2__.loaded = true;

  const meta = window.__SBV2__.meta;
  if (meta?.system?.avg_wfv_auc) {
    console.log(
      `[SmartBet v2] Loaded | WFV AUC avg: ${meta.system.avg_wfv_auc} | ` +
      `Features: ${meta.system.feature_count} | ` +
      `Training rows: ${(meta.system.training_rows || 0).toLocaleString()}`
    );
  }

  return window.__SBV2__;
}

// ─── SmartBet Score v2 ───────────────────────────────────────────────────────
/**
 * Calculează SmartBet Score v2 (0-100) pentru o predicție.
 *
 * @param {string} marketKey  - 'over25', 'home_win', 'btts', etc.
 * @param {number} modelProb  - Probabilitate model 0-1
 * @param {number} edgePP     - Edge față de no-vig în pp (poate fi negativ)
 * @returns {number} scor 0-100
 */
function calcSmartScoreV2(marketKey, modelProb, edgePP) {
  if (!modelProb || modelProb <= 0) return 0;

  const pack    = window.__SBV2__?.modelPack;
  const markets = pack?.markets ?? {};
  const mm      = markets[marketKey] ?? {};

  const wfvAUC  = mm.wfv_avg_auc ?? 0.55;
  const ece     = mm.test_ece     ?? 0.05;

  // Normalizare 0-100
  const probNorm = Math.min(100, Math.max(0, (modelProb - 0.50) / 0.30 * 100));
  const edgeNorm = Math.min(100, Math.max(0, (edgePP || 0) / 15.0 * 100));
  const aucNorm  = Math.min(100, Math.max(0, (wfvAUC - 0.50) / 0.20 * 100));
  const eceNorm  = Math.min(100, Math.max(0, (1.0 - ece / 0.10) * 100));

  const score = (
    0.40 * probNorm +
    0.30 * edgeNorm +
    0.20 * aucNorm  +
    0.10 * eceNorm
  );
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

// ─── No-vig + Edge ───────────────────────────────────────────────────────────
function noVigProbs(oddsList) {
  const valid = oddsList.map(o => (o && o > 1.01) ? 1.0 / o : null);
  const sum   = valid.reduce((acc, v) => acc + (v ?? 0), 0);
  if (sum < 0.5) return oddsList.map(() => null);
  return valid.map(v => v === null ? null : Math.round(v / sum * 1e6) / 1e6);
}

function calcEdgeVsNoVig(modelProb, noVigProb) {
  if (!modelProb || !noVigProb) return null;
  return Math.round((modelProb - noVigProb) * 10000) / 100;
}

function calcEV(modelProb, decimalOdds) {
  if (!modelProb || !decimalOdds || decimalOdds < 1.01) return null;
  return Math.round((modelProb * (decimalOdds - 1) - (1 - modelProb)) * 10000) / 100;
}

function calcKelly(modelProb, decimalOdds, fraction = 0.25) {
  if (!modelProb || !decimalOdds || decimalOdds < 1.01) return 0;
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const k = (modelProb * b - q) / b;
  const capped = Math.max(0, Math.min(k, 0.08 / fraction));
  return Math.round(capped * fraction * 10000) / 100;
}

function getSignalLabel(score) {
  if (score >= 85) return { label: 'STRONG BUY', color: '#1a7a3c', emoji: '🔥' };
  if (score >= 70) return { label: 'BUY',         color: '#28a745', emoji: '✅' };
  if (score >= 60) return { label: 'WATCH',        color: '#ffc107', emoji: '👀' };
  if (score >= 50) return { label: 'WEAK',         color: '#fd7e14', emoji: '⚠️'  };
  return               { label: 'SKIP',         color: '#dc3545', emoji: '❌' };
}

function getEVSignals(minScore = 0, maxResults = 50) {
  const signals = window.__SBV2__?.evSignals?.signals ?? [];
  return signals.filter(s => (s.score ?? 0) >= minScore).slice(0, maxResults);
}

function getSHAPFeatures(marketKey, topN = 10) {
  const shap = window.__SBV2__?.shapGlobal?.markets?.[marketKey];
  if (!shap) return [];
  return (shap.top_features ?? []).slice(0, topN);
}

function getLeagueBaseline(leagueName) {
  return window.__SBV2__?.baselines?.[leagueName] ?? null;
}

function calcSmartScore(marketKey, prob, odds, edgeVsBookmaker) {
  let edgePP = edgeVsBookmaker ?? 0;
  if (odds && prob) {
    const nvArr = noVigProbs([odds, 1 / (1 - (1/odds - 0) + 0.02)]);
    const nvP   = nvArr[0];
    edgePP = nvP ? calcEdgeVsNoVig(prob, nvP) ?? 0 : 0;
  }
  return calcSmartScoreV2(marketKey, prob, edgePP);
}

function printV2Status() {
  const meta = window.__SBV2__?.meta;
  if (!meta) { console.log('[SmartBet v2] Nu este încărcat.'); return; }
  const sys = meta.system ?? {};
  console.table({
    'Versiune':        meta.version,
    'Actualizat':      meta.updated_at?.slice(0, 10),
    'Meciuri antrenare': (sys.training_rows ?? 0).toLocaleString(),
    'Features':        sys.feature_count,
    'WFV AUC avg':     sys.avg_wfv_auc,
    'Test ECE avg':    sys.avg_test_ece,
    'Ligi':            sys.warehouse_leagues,
    'Modele':          sys.models_trained,
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadSmartBetV2().then(() => {
      if (typeof window.onSmartBetV2Loaded === 'function') {
        window.onSmartBetV2Loaded(window.__SBV2__);
      }
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadSmartBetV2, calcSmartScoreV2, calcSmartScore,
    noVigProbs, calcEdgeVsNoVig, calcEV, calcKelly,
    getSignalLabel, getEVSignals, getSHAPFeatures,
    getLeagueBaseline, printV2Status,
  };
}

// BetAnalytics Pro - Over 1.5 recovery probe runtime
(function(){
  'use strict';
  if(window.__baOver15RecoveryProbeV1) return;
  window.__baOver15RecoveryProbeV1 = 1;
  var G = (typeof globalThis !== 'undefined') ? globalThis : window;

  function thresholds(){
    try { return (G.MODEL_BENCHMARKS && G.MODEL_BENCHMARKS.dynamic_thresholds) || {}; }
    catch(e){ return {}; }
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
        var savedDisabled = G.isMarketDisabled;
        if(typeof originalDisabledFn === 'function'){
          G.isMarketDisabled = function(marketKey){
            if(marketKey !== type) return false;
            if(isProbeMarket(marketKey)) return false;
            return originalDisabledFn.apply(this, arguments);
          };
        }
        var candidate;
        try { candidate = originalBuild.apply(this, arguments); }
        finally { G.isMarketDisabled = savedDisabled; }
        if(type === 'over15' && isProbeMarket('over15')){
          if(!strictOver15ProbePass(match, candidate)) return null;
          try {
            candidate.bestBet.recoveryProbe = true;
            candidate.why = ('Recovery probe O1.5' + (candidate.why ? ' • ' + candidate.why : '')).slice(0, 140);
          } catch(e){}
        }
        return candidate;
      };
      G.buildMarketCandidate.__baOver15RecoveryProbe = true;
      installed = true;
    }
    if(installed){
      try { if(typeof G.syncRecommendationEngine === 'function') G.syncRecommendationEngine(); } catch(e){}
      try {
        var tab = document.getElementById('tab-meciuri');
        if(typeof G.renderMatches === 'function' && tab && tab.classList.contains('active')) G.renderMatches();
      } catch(e){}
      try { if(typeof G.updateHeaderStatus === 'function') G.updateHeaderStatus(); } catch(e){}
    }
    return installed;
  }
  function boot(){ install(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [100,300,700,1200,2500,5000,9000].forEach(function(t){ setTimeout(boot, t); });
})();

// BetAnalytics Pro - load CLV guidance badges on match cards
(function(){
  'use strict';
  if(window.__baClvGuidanceLoaderV1) return;
  window.__baClvGuidanceLoaderV1 = true;
  function load(){
    if(document.getElementById('ba-clv-card-guidance-runtime')) return;
    var s = document.createElement('script');
    s.id = 'ba-clv-card-guidance-runtime';
    s.defer = true;
    s.src = './assets/clv_card_guidance_runtime.js?v=' + Date.now();
    document.head.appendChild(s);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
