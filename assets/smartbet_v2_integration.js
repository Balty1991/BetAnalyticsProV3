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

// ─── State global v2 ────────────────────────────────────────────────────────
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

// ─── SmartBet Score v2 ──────────────────────────────────────────────────────
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

// ─── No-vig + Edge ──────────────────────────────────────────────────────────
/**
 * Calculează probabilitățile no-vig (elimină vig-ul bookmakerului).
 * @param  {number[]} oddsList - [odds1, odds2, ...] (valori > 1.01)
 * @returns {number[]} probabilități fair (sumă = 1), sau null per element invalid
 */
function noVigProbs(oddsList) {
  const valid = oddsList.map(o => (o && o > 1.01) ? 1.0 / o : null);
  const sum   = valid.reduce((acc, v) => acc + (v ?? 0), 0);
  if (sum < 0.5) return oddsList.map(() => null);
  return valid.map(v => v === null ? null : Math.round(v / sum * 1e6) / 1e6);
}

/**
 * Edge față de piață (no-vig).
 * @returns {number|null} edge în pp (pozitiv = avantaj față de bookmaker)
 */
function calcEdgeVsNoVig(modelProb, noVigProb) {
  if (!modelProb || !noVigProb) return null;
  return Math.round((modelProb - noVigProb) * 10000) / 100;  // în pp, 2 zecimale
}

/**
 * Expected Value % = (P * (odds-1) - (1-P)) * 100
 * @returns {number|null} EV%, pozitiv = value bet
 */
function calcEV(modelProb, decimalOdds) {
  if (!modelProb || !decimalOdds || decimalOdds < 1.01) return null;
  return Math.round((modelProb * (decimalOdds - 1) - (1 - modelProb)) * 10000) / 100;
}

/**
 * Kelly fractionat (Quarter Kelly).
 * @returns {number} % din bankroll (0-8%)
 */
function calcKelly(modelProb, decimalOdds, fraction = 0.25) {
  if (!modelProb || !decimalOdds || decimalOdds < 1.01) return 0;
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const k = (modelProb * b - q) / b;
  const capped = Math.max(0, Math.min(k, 0.08 / fraction));
  return Math.round(capped * fraction * 10000) / 100;  // % bankroll
}

// ─── Semnal label ────────────────────────────────────────────────────────────
function getSignalLabel(score) {
  if (score >= 85) return { label: 'STRONG BUY', color: '#1a7a3c', emoji: '🔥' };
  if (score >= 70) return { label: 'BUY',         color: '#28a745', emoji: '✅' };
  if (score >= 60) return { label: 'WATCH',        color: '#ffc107', emoji: '👀' };
  if (score >= 50) return { label: 'WEAK',         color: '#fd7e14', emoji: '⚠️'  };
  return               { label: 'SKIP',         color: '#dc3545', emoji: '❌' };
}

// ─── EV Signals getter ──────────────────────────────────────────────────────
/**
 * Returnează semnalele EV+ pre-calculate pentru azi.
 * Sortate descrescător după SmartBet Score.
 */
function getEVSignals(minScore = 0, maxResults = 50) {
  const signals = window.__SBV2__?.evSignals?.signals ?? [];
  return signals
    .filter(s => (s.score ?? 0) >= minScore)
    .slice(0, maxResults);
}

/**
 * Returnează SHAP top features pentru o piață.
 */
function getSHAPFeatures(marketKey, topN = 10) {
  const shap = window.__SBV2__?.shapGlobal?.markets?.[marketKey];
  if (!shap) return [];
  return (shap.top_features ?? []).slice(0, topN);
}

/**
 * Returnează baseline-ul de ligă.
 */
function getLeagueBaseline(leagueName) {
  return window.__SBV2__?.baselines?.[leagueName] ?? null;
}

// ─── Compatibilitate backward v1 ─────────────────────────────────────────────
/**
 * Drop-in replacement pentru calcSmartScore v1.
 * Acceptă aceleași argumente dar folosește logica v2.
 */
function calcSmartScore(marketKey, prob, odds, edgeVsBookmaker) {
  // Calculăm no-vig dacă avem odds
  let edgePP = edgeVsBookmaker ?? 0;
  if (odds && prob) {
    const nvArr = noVigProbs([odds, 1 / (1 - (1/odds - 0) + 0.02)]);  // aproximare
    const nvP   = nvArr[0];
    edgePP = nvP ? calcEdgeVsNoVig(prob, nvP) ?? 0 : 0;
  }
  return calcSmartScoreV2(marketKey, prob, edgePP);
}

// ─── Debug / info ────────────────────────────────────────────────────────────
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

// ─── Auto-init ───────────────────────────────────────────────────────────────
// Inițializare automată la DOMContentLoaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadSmartBetV2().then(() => {
      if (typeof window.onSmartBetV2Loaded === 'function') {
        window.onSmartBetV2Loaded(window.__SBV2__);
      }
    });
  });
}

// Export pentru module systems (dacă există)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadSmartBetV2, calcSmartScoreV2, calcSmartScore,
    noVigProbs, calcEdgeVsNoVig, calcEV, calcKelly,
    getSignalLabel, getEVSignals, getSHAPFeatures,
    getLeagueBaseline, printV2Status,
  };
}
