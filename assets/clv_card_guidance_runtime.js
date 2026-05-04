// BetAnalytics Pro - CLV guidance on Meciuri cards
// V10 ultra compact: CLV guidance stays inside Detalii analiză, compressed for mobile.
(function(){
  'use strict';

  // Prevent old experimental compact-card runtimes from taking over the match card again.
  window.__baMatchesUiUpgradeV1 = true;
  window.__baMatchesUiUpgradeV2 = true;
  window.__baMatchesUiUpgradeV3 = true;
  window.__baCompactRecoV8 = true;

  if (window.__baClvCardGuidanceV10DetailsUltraCompact) return;
  window.__baClvCardGuidanceV10DetailsUltraCompact = true;

  var clvMap = null;
  var loading = false;
  var lastScan = 0;
  var scanTimer = null;
  var cleanupRuns = 0;

  function cleanText(el){ return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function isMeciuriActive(){
    var tab = document.getElementById('tab-meciuri');
    return !!(tab && tab.classList && tab.classList.contains('active'));
  }

  function cleanupExperimentalCards(){
    cleanupRuns += 1;
    try {
      document.body.classList.remove('ba-matches-upgrade','ba-simple-mode','ba-expert-mode','ba-compact-reco-on');
      ['ba-matches-ui-upgrade-style','ba-matches-ui-upgrade-style-v2','ba-matches-ui-upgrade-style-v3','ba-compact-reco-style-v8','ba-emergency-mobile-card-css'].forEach(function(id){
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      document.querySelectorAll('.ba-card-compact,.ba-pro-reco-card').forEach(function(el){
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      document.querySelectorAll('.ba-reco-original-hidden,.ba-reco-side-hidden').forEach(function(el){
        el.classList.remove('ba-reco-original-hidden','ba-reco-side-hidden');
        el.style.display = '';
        el.style.visibility = '';
        el.style.opacity = '';
      });
    } catch(e) {}
  }

  function marketKey(s){
    s = String(s || '').toLowerCase();
    if (/\bbtts\b|ambele\s+marcheaz/.test(s)) return 'btts';
    if (/over\s*1[\.,]5|peste\s*1[\.,]5|\bo1[\.,]5|1[\.,]5g|over15/.test(s)) return 'over15';
    if (/over\s*2[\.,]5|peste\s*2[\.,]5|\bo2[\.,]5|2[\.,]5g|over25/.test(s)) return 'over25';
    if (/under\s*3[\.,]5|sub\s*3[\.,]5|\bu3[\.,]5|3[\.,]5g|under35/.test(s)) return 'under35';
    return String(s || '').trim();
  }
  function marketLabel(key){ return ({over15:'O1.5', over25:'O2.5', under35:'U3.5', btts:'BTTS'})[key] || String(key || '').toUpperCase(); }
  function pct(v){ var n = Number(v); return isFinite(n) ? ((n >= 0 ? '+' : '') + n.toFixed(1) + '%') : '—'; }
  function pp(v){ var n = Number(v); return isFinite(n) ? ((n >= 0 ? '+' : '') + n.toFixed(1) + 'pp') : ''; }

  function buildMap(data){
    var map = {}, by = (data && data.by_market) || {};
    Object.keys(by).forEach(function(k){ map[marketKey(k)] = Object.assign({market:k}, by[k]); });
    ((data && data.market_actions) || []).forEach(function(r){
      var k = marketKey(r.market);
      if (k) map[k] = Object.assign({}, map[k] || {}, r);
    });
    window.__BA_CLV_MARKET_GUIDANCE = map;
    return map;
  }
  function load(){
    if (clvMap || loading) return Promise.resolve(clvMap || {});
    loading = true;
    return fetch('./data/clv_tracker.json?v=20260504refreshdeep1', {cache:'default'})
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){ clvMap = buildMap(d || {}); return clvMap; })
      .catch(function(){ clvMap = {}; return clvMap; })
      .finally(function(){ loading = false; });
  }

  function style(){
    if (document.getElementById('ba-clv-guidance-style-v10')) return;
    var css = [
      '.ba-clv-guidance{display:block!important;margin:0!important;padding:4px 6px!important;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:rgba(12,18,31,.66);box-shadow:none;font-family:var(--font-sans,system-ui,sans-serif);pointer-events:none}',
      '.analysis-detail-shell>.ba-clv-guidance{margin:0!important}.m16-extra>.ba-clv-guidance,.m17-extra>.ba-clv-guidance{margin:0 0 8px!important}',
      '.ba-clv-top{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:2px}.ba-clv-title{font-size:9.5px;line-height:1.12;font-weight:900;color:#f8fafc;letter-spacing:-.01em;min-width:0;flex:1}.ba-clv-chip{display:inline-flex;align-items:center;justify-content:center;padding:1.5px 5px;border-radius:999px;font:900 7.5px var(--mono,monospace);letter-spacing:.02em;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.055);color:#e5edf9;white-space:nowrap;flex:0 0 auto}',
      '.ba-clv-context{font-size:8.5px;line-height:1.15;color:rgba(203,213,225,.88);margin-bottom:3px}.ba-clv-context b{font-weight:900;color:#f8fafc}',
      '.ba-clv-meta{display:flex;flex-wrap:wrap;gap:2px 5px;align-items:center;padding-top:3px;border-top:1px solid rgba(255,255,255,.06);font:800 7.8px var(--mono,monospace);color:rgba(203,213,225,.90)}.ba-clv-meta span{display:inline-flex;align-items:center;gap:2px}.ba-clv-meta b{font-weight:900;color:#f8fafc}',
      '.ba-clv-good{border-color:rgba(34,197,94,.28);background:linear-gradient(135deg,rgba(34,197,94,.09),rgba(12,18,31,.78))}.ba-clv-good .ba-clv-chip{color:#86efac;border-color:rgba(34,197,94,.24);background:rgba(34,197,94,.11)}',
      '.ba-clv-warn{border-color:rgba(249,115,22,.30);background:linear-gradient(135deg,rgba(249,115,22,.10),rgba(12,18,31,.78))}.ba-clv-warn .ba-clv-chip{color:#fdba74;border-color:rgba(249,115,22,.25);background:rgba(249,115,22,.12)}',
      '.ba-clv-caution{border-color:rgba(245,158,11,.30);background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(12,18,31,.78))}.ba-clv-caution .ba-clv-chip{color:#fde68a;border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.12)}',
      '.ba-clv-bad{border-color:rgba(239,68,68,.30);background:linear-gradient(135deg,rgba(239,68,68,.09),rgba(12,18,31,.78))}.ba-clv-bad .ba-clv-chip{color:#fca5a5;border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.10)}',
      '.ba-clv-info{border-color:rgba(59,130,246,.26);background:linear-gradient(135deg,rgba(59,130,246,.09),rgba(12,18,31,.78))}.ba-clv-info .ba-clv-chip{color:#93c5fd;border-color:rgba(59,130,246,.22);background:rgba(59,130,246,.10)}',
      '@media(max-width:420px){.ba-clv-title{font-size:9px}.ba-clv-context{font-size:8px}.ba-clv-meta{font-size:7.4px;gap:2px 4px}.ba-clv-chip{padding:1.5px 5px;font-size:7px}}'
    ].join('');
    var el = document.createElement('style'); el.id = 'ba-clv-guidance-style-v10'; el.textContent = css; document.head.appendChild(el);
  }

  function pickState(container){
    var t = cleanText(container).toUpperCase();
    if (/\bPARIAZA\b|\bPARIAZĂ\b/.test(t)) return {kind:'bet', label:'PARIAZĂ'};
    if (/\bEVITA\b|\bEVITĂ\b/.test(t)) return {kind:'avoid', label:'EVITĂ'};
    if (/\bRISC\b/.test(t)) return {kind:'risk', label:'RISC'};
    return {kind:'neutral', label:'MODEL'};
  }
  function profile(row){
    var v = String(row.verdict || '');
    if (v === 'PROFITABIL_CONFIRMAT') return {sev:'good', label:'piață confirmată'};
    if (v === 'CLV_BUN_ROI_SLAB') return {sev:'warn', label:'recovery'};
    if (v === 'ROI_BUN_CLV_SLAB') return {sev:'caution', label:'piață neconfirmată'};
    if (v === 'RECALIBRARE_NECESARA') return {sev:'bad', label:'piață fragilă'};
    if (v === 'SAMPLE_MIC') return {sev:'info', label:'sample mic'};
    return {sev:String(row.severity || 'info'), label:row.label || 'context piață'};
  }
  function titleFor(pick, prof){
    if (pick.kind === 'bet' && prof.sev === 'good') return 'PARIAZĂ · piață confirmată';
    if (pick.kind === 'bet' && (prof.sev === 'caution' || prof.sev === 'warn')) return 'PARIAZĂ · miză moderată';
    if (pick.kind === 'bet' && prof.sev === 'bad') return 'PARIAZĂ · stake redus';
    if (pick.kind === 'risk' && prof.sev === 'good') return 'RISC · piața ajută';
    if (pick.kind === 'risk' && prof.sev === 'bad') return 'RISC · skip/stake mic';
    if (pick.kind === 'risk') return 'RISC · stake mic';
    if (pick.kind === 'avoid') return 'EVITĂ · context secundar';
    return 'Ghid miză · ' + prof.label;
  }
  function subFor(pick, prof){
    if (pick.kind === 'bet' && prof.sev === 'bad') return 'Pick valid, dar CLV cere prudență.';
    if (pick.kind === 'bet' && (prof.sev === 'caution' || prof.sev === 'warn')) return 'Pick jucabil; CLV limitează miza.';
    if (pick.kind === 'risk' && (prof.sev === 'bad' || prof.sev === 'caution' || prof.sev === 'warn')) return 'Pick + piață cer disciplină.';
    if (pick.kind === 'risk') return 'Pick la limită; verifică stake-ul.';
    if (pick.kind === 'avoid') return 'CLV nu schimbă verdictul.';
    return 'Context de miză, nu anulare pick.';
  }

  function makeBadge(row, mk, pick){
    var prof = profile(row);
    var adj = Number(row.edge_adjustment_pp || 0);
    var meta = '<span>CLV <b>' + pct(row.avg_clv_pct) + '</b></span><span>ROI <b>' + pct(row.roi_flat_pct) + '</b></span><span>N=<b>' + (row.n || 0) + '</b></span>' + (adj > 0 ? '<span>edge <b>' + pp(adj) + '</b></span>' : '');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ba-clv-details ba-clv-' + prof.sev;
    box.innerHTML = ''+
      '<div class="ba-clv-top">'+
        '<div class="ba-clv-title">'+titleFor(pick, prof)+'</div>'+
        '<span class="ba-clv-chip">'+pick.label+'</span>'+
      '</div>'+
      '<div class="ba-clv-context"><b>'+marketLabel(mk)+'</b> · '+prof.label+' · '+subFor(pick, prof)+'</div>'+
      '<div class="ba-clv-meta">'+meta+'</div>';
    return box;
  }
  function findRecoHeader(container){
    return Array.prototype.find.call(container.querySelectorAll('*'), function(n){
      var t = cleanText(n);
      return /^(RECOMANDARE PRINCIPALĂ|PRONOSTIC RECOMANDAT|RECOMANDARE PRINCIPALA)$/i.test(t);
    }) || null;
  }
  function isInsideExpandedDetails(el){
    return !!(el && el.closest && el.closest('.m16-extra,.m17-extra,.analysis-detail-shell,.analysis-detail-hero,.analysis-detail-section'));
  }
  function removeOutsideDetails(){
    try {
      document.querySelectorAll('.ba-clv-guidance').forEach(function(el){
        if (!isInsideExpandedDetails(el) && el.parentNode) el.parentNode.removeChild(el);
      });
    } catch(e) {}
  }
  function marketFromContainer(container, fallbackText){
    if (!container) return marketKey(fallbackText || '');
    var pick = container.querySelector('.analysis-detail-pick,.m17-pick,.card-reco-pick,.m16-reco-main');
    var txt = pick ? cleanText(pick) : '';
    return marketKey(txt || fallbackText || cleanText(container));
  }
  function add(container, row, mk){
    if (!container || !row || container.querySelector('.ba-clv-guidance')) return;
    var box = makeBadge(row, mk, pickState(container));
    if (container.classList && container.classList.contains('analysis-detail-shell')) {
      var overview = container.querySelector(':scope > .analysis-detail-overview-frame');
      if (overview) {
        overview.insertBefore(box, overview.firstChild);
        return;
      }
      var hero = container.querySelector(':scope > .analysis-detail-hero');
      if (hero && hero.parentNode === container) hero.insertAdjacentElement('afterend', box);
      else container.insertBefore(box, container.firstChild);
      return;
    }
    var hero2 = container.querySelector('.analysis-detail-shell');
    if (hero2) { add(hero2, row, mk); return; }
    var header = findRecoHeader(container);
    if (header && header.parentNode && container.contains(header)) {
      header.parentNode.insertBefore(box, header.nextSibling);
    } else {
      container.insertBefore(box, container.firstChild);
    }
  }
  function findRecoContainers(root){
    // Inject guidance only in opened Detalii analiză blocks, not in the main match card.
    var shells = Array.prototype.slice.call(root.querySelectorAll('.m17-extra.open .analysis-detail-shell,.m16-extra.open .analysis-detail-shell')).filter(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return false;
      var t = cleanText(el);
      return /(BTTS|Over|Under|Peste|Sub|Ambele|O1\.5|O2\.5|U3\.5)/i.test(t);
    }).map(function(el){ return {el:el, len:cleanText(el).length, text:cleanText(el)}; });
    if (shells.length) return shells.slice(0,24);
    var extras = Array.prototype.slice.call(root.querySelectorAll('.m17-extra.open,.m16-extra.open')).filter(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return false;
      var t = cleanText(el);
      return /(RECOMANDARE|PRONOSTIC RECOMANDAT|Probabilitate pronostic)/i.test(t) && /(BTTS|Over|Under|Peste|Sub|Ambele|O1\.5|O2\.5|U3\.5)/i.test(t);
    }).map(function(el){ return {el:el, len:cleanText(el).length, text:cleanText(el)}; });
    return extras.slice(0,24);
  }
  function scan(){
    cleanupExperimentalCards();
    removeOutsideDetails();
    if (!clvMap || !isMeciuriActive()) return;
    var now = Date.now();
    if (now - lastScan < 700) return;
    lastScan = now;
    style();
    var root = document.getElementById('tab-meciuri');
    if (!root) return;
    findRecoContainers(root).forEach(function(item){
      var mk = marketFromContainer(item.el, item.text), row = clvMap[mk];
      if (row) add(item.el, row, mk);
    });
  }
  function schedule(){
    if (scanTimer) return;
    scanTimer = setTimeout(function(){ scanTimer = null; load().then(scan); }, 250);
  }
  function hook(){
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidanceV10DetailsUltraCompact) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); schedule(); setTimeout(schedule, 900); return r; };
      window.renderMatches.__baClvGuidanceV10DetailsUltraCompact = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidanceV10DetailsUltraCompact) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') { schedule(); setTimeout(schedule, 900); } return r; };
      window.switchTab.__baClvGuidanceV10DetailsUltraCompact = true;
    }
    if (typeof window.toggleMatchAnalysisDetails === 'function' && !window.toggleMatchAnalysisDetails.__baClvGuidanceV9DetailsOnly) {
      var oldToggle = window.toggleMatchAnalysisDetails;
      window.toggleMatchAnalysisDetails = function(){ var r = oldToggle.apply(this, arguments); schedule(); setTimeout(schedule, 350); setTimeout(schedule, 900); return r; };
      window.toggleMatchAnalysisDetails.__baClvGuidanceV9DetailsOnly = true;
    }
  }
  function boot(){ cleanupExperimentalCards(); hook(); removeOutsideDetails(); if (isMeciuriActive()) { schedule(); setTimeout(schedule, 1200); } }
  if (!window.__baClvGuidanceDetailsClickHook) {
    window.__baClvGuidanceDetailsClickHook = true;
    document.addEventListener('click', function(ev){
      var t = cleanText(ev && ev.target);
      if (/Detalii\s+analiz/i.test(t)) { setTimeout(schedule, 120); setTimeout(schedule, 550); }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [250, 800, 1200, 2400, 4000, 7000, 12000, 20000].forEach(function(t){ setTimeout(boot, t); });
  var cleanupTimer = setInterval(function(){ cleanupExperimentalCards(); if (cleanupRuns > 50) clearInterval(cleanupTimer); }, 1000);
})();
