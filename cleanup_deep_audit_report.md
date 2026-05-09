# Deep cleanup audit

## Current tab map
- Containers: clv, dashboard, istoric21, meciuri, ml5, performanta, piramida, smartbet
- Reachable: apihistory, clv, dashboard, istoric21, istoricfull, meciuri, ml5, more, performanta, piramida, smartbet, traininglab
- Orphan containers: none
- Reachable without container: apihistory, istoricfull, traininglab

## Pattern hits
### cota2_leftovers
- `manifest.json`
  - L51: `"url": "index.html?v=aurora#cota2",`
- `tools/deep_cleanup_audit_once.py`
  - L12: `'cota2_leftovers': ['cota2', 'Cota 2', 'COTA2'],`
  - L70: `if hits['cota2_leftovers']:`
- `assets/platform_theme_unifier.css`
  - L24: `#tab-cota2,`
  - L71: `#tab-cota2 div[style*="background"],`
- `assets/app.css`
  - L1099: `.cota2-panel{background:linear-gradient(180deg,rgba(14,22,40,.94),rgba(9,15,28,.98));border:1px solid rgba(84,119,255,.18);border-radius:18px;padding:16px;margin-bottom:14px;box-sh`
  - L1100: `.cota2-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}`
  - L1101: `.cota2-note{font-size:11px;color:var(--muted);line-height:1.6}`
  - L1102: `.cota2-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:10px;font-weight:800;border:1px solid rgba(255,255,255,.08);background:rgb`
  - L1103: `.cota2-alt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}`
- `assets/app.js`
  - L1113: `if(name === 'cota2'){`
  - L1114: `markTabRendered('cota2');`
  - L9636: `var typeBadge=t.type==='extra'?'<span style="color:var(--pur);font-weight:700">EXTRA</span>':(t.type==='cota2'?'<span style="color:var(--yel);font-weight:700">COTA2</span>':'<span `
  - L9664: `if($('tab-cota2') && $('tab-cota2').classList.contains('active')) renderCota2Section();`
  - L10130: `marketType: b.type || cota2MarketKey(m),`
- `data/app.js`
  - L41: `var COTA2_SETTINGS = sanitizeCota2Settings(JSON.parse(localStorage.getItem('bet_cota2_settings') || '{}'));`
  - L42: `var COTA2_TICKET = JSON.parse(localStorage.getItem('bet_cota2_latest') || 'null');`
  - L1128: `if(name === 'cota2'){`
  - L1130: `markTabRendered('cota2');`
  - L9408: `var typeBadge=t.type==='extra'?'<span style="color:var(--pur);font-weight:700">EXTRA</span>':(t.type==='cota2'?'<span style="color:var(--yel);font-weight:700">COTA2</span>':'<span `

### dashboard_leftovers
- `tools/deep_cleanup_audit_once.py`
  - L13: `'dashboard_leftovers': ['renderModernDashboard', 'renderDashboardTab', 'renderDashboardVisuals', 'renderTodayBest', 'Top 2 pronosticuri', 'dashboard-modern-shell'],`
- `assets/dashboard_display_hotfix.js`
  - L170: `var target = document.getElementById("dashboard-modern-shell");`
- `assets/app.css`
  - L805: `#tab-dashboard > :not(#dashboard-modern-shell){display:none!important}`
  - L806: `#dashboard-modern-shell{display:grid;gap:14px}`
  - L924: `#dashboard-modern-shell,.dashboard-v16-shell,.dashboard-v16-topbar,.dashboard-v16-greeting,.dashboard-v16-section,.dashboard-v16-performance,.dashboard-v16-reco,.dashboard-v16-char`
  - L925: `#dashboard-modern-shell,.dashboard-v16-shell{width:100%;overflow-x:hidden}`
  - L3601: `#dashboard-modern-shell { margin-top: 4px !important; }`
- `assets/app.js`
  - L503: `function renderModernDashboard(){`
  - L13745: `'renderModernDashboard','renderDashboardTab','renderDashboard','renderDashboardStats',`
- `assets/dashboard_history21_exact_ui.js`
  - L78: `function boot(){patch();[80,250,600,1200,2500,5000,9000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,250);try{new MutationObserver(function(){clearTimeout(window.__`
- `assets/dashboard_history21_sync.js`
  - L44: `function boot(){patch();[80,250,700,1500,3000,6000,10000].forEach(function(t){setTimeout(patch,t)});setInterval(patch,1200);try{new MutationObserver(function(){clearTimeout(window.`
- `data/app.js`
  - L466: `renderModernDashboard();`
  - L507: `function renderModernDashboard(){`
  - L1043: `renderModernDashboard();`

### removed_tab_leftovers
- `index.html`
  - L549: `<!-- end tab-charts -->`
- `tools/deep_cleanup_audit_once.py`
  - L14: `'removed_tab_leftovers': ['tab-tracking', 'tab-bankroll', 'tab-charts', "switchTab('tracking')", "switchTab('bankroll')", "switchTab('charts')"],`

### missing_container_switches
- `index.html`
  - L214: `<button class="btn btn-ghost" style="font-size:11px;padding:7px 12px" onclick="switchTab('apihistory')">🌐 Baza API →</button>`
- `tools/deep_cleanup_audit_once.py`
  - L15: `'missing_container_switches': ["switchTab('apihistory')", "switchTab('istoricfull')", "switchTab('traininglab')"],`

### legacy_full_history
- `build_full_history.py`
  - L25: `FULL_HISTORY_SCRIPT_TAG = '<script src="./assets/full-history-hotfix.js?v=20260420hotfix1"></script>'`
  - L26: `FULL_HISTORY_SCRIPT_MARKER = 'assets/full-history-hotfix.js?v=20260420hotfix1'`
- `index.html`
  - L594: `<script src="./assets/full-history-hotfix.js?v=20260420hotfix1"></script>`
- `tools/deep_cleanup_audit_once.py`
  - L16: `'legacy_full_history': ['ensureFullHistoryAssets', 'full-history.js', 'full-history-hotfix.js'],`
- `assets/app.js`
  - L1139: `ensureFullHistoryAssets().catch(function(err){ console.warn('[Prefetch] fullHistory failed', err); });`
  - L1145: `ensureFullHistoryAssets().then(function(){`
  - L5019: `function ensureFullHistoryAssets(){`
- `data/app.js`
  - L1155: `ensureFullHistoryAssets().catch(function(err){ console.warn('[Prefetch] fullHistory failed', err); });`
  - L1161: `ensureFullHistoryAssets().then(function(){`
  - L4983: `function ensureFullHistoryAssets(){`

## Large files over 250 KB
- `data/features_v2.json` — 51.56 MB
- `data/training_features.json` — 11.92 MB
- `data/predictions.json` — 4.01 MB
- `data/events.json` — 3.29 MB
- `data/training_matches.json` — 3.26 MB
- `data/recommendation_journal.json` — 1.1 MB
- `data/recommendation_log.json` — 0.92 MB
- `data/app.js` — 0.72 MB
- `assets/app.js` — 0.7 MB
- `data/clv_tracker.json` — 0.57 MB
- `data/lineups_today.json` — 0.52 MB
- `data/warehouse/events_season_243.json` — 0.46 MB
- `data/warehouse/events_season_159.json` — 0.45 MB
- `models/catboost_home_win.cbm` — 0.39 MB
- `data/warehouse/events_season_29.json` — 0.38 MB
- `assets/app.css` — 0.32 MB
- `data/referee_stats.json` — 0.31 MB
- `data/warehouse/events_season_318.json` — 0.31 MB
- `data/warehouse/events_season_337.json` — 0.29 MB
- `models/catboost_btts.cbm` — 0.28 MB
- `data/warehouse/events_season_358.json` — 0.28 MB
- `data/warehouse/events_season_268.json` — 0.27 MB
- `data/warehouse/events_season_294.json` — 0.27 MB
- `data/warehouse/events_season_374.json` — 0.25 MB
- `data/warehouse/events_season_279.json` — 0.24 MB

## Suggested next steps
- Review and remove remaining Cota 2 leftovers if they are not only historical notes.
- Remove references to deleted tab containers tracking/bankroll/charts if only legacy render code remains.
- Fix or remove buttons that call tabs without containers: apihistory, istoricfull, traininglab
- Review remaining Dashboard render functions/strings; delete only if no active tab uses them.
- Review full-history hotfix/runtime after checking Istoric and Baza de Invatare dependencies.
