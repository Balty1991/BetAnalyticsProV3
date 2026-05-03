// BetAnalytics Pro - CLV market guidance on Meciuri cards
// V5: mobile-first, compact, non-contradictory guidance.
(function(){
  'use strict';
  if (window.__baClvCardGuidanceV5) return;
  window.__baClvCardGuidanceV5 = true;

  try {
    var oldTab = document.getElementById('tab-meciuri') || document.body;
    ['__baClvObserverV2','__baClvObserverV3'].forEach(function(k){
      if (oldTab && oldTab[k] && typeof oldTab[k].disconnect === 'function') oldTab[k].disconnect();
      if (oldTab) oldTab[k] = null;
    });
  } catch(e) {}

  var clvMap = null;
  var loading = false;
  var lastScan = 0;
  var scanTimer = null;

  function cleanText(el){ return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim(); }
  function isMeciuriActive(){
    var tab = document.getElementById('tab-meciuri');
    return !!(tab && tab.classList && tab.classList.contains('active'));
  }
  function marketKey(s){
    s = String(s || '').toLowerCase();
    if (/\bbtts\b|ambele\s+marcheaz/.test(s)) return 'btts';
    if (/over\s*1[\.,]5|peste\s*1[\.,]5|\bo1[\.,]5|1[\.,]5g|over15/.test(s)) return 'over15';
    if (/over\s*2[\.,]5|peste\s*2[\.,]5|\bo2[\.,]5|2[\.,]5g|over25/.test(s)) return 'over25';
    if (/under\s*3[\.,]5|sub\s*3[\.,]5|\bu3[\.,]5|3[\.,]5g|under35/.test(s)) return 'under35';
    return String(s || '').trim();
  }
  function marketLabel(key){ return ({over15:'Over 1.5', over25:'Over 2.5', under35:'Under 3.5', btts:'BTTS'})[key] || String(key || '').toUpperCase(); }
  function pct(v){ var n = Number(v); return isFinite(n) ? ((n >= 0 ? '+' : '') + n.toFixed(2) + '%') : '—'; }
  function ppm(v){ var n = Number(v); return isFinite(n) ? ((n >= 0 ? '+' : '') + n.toFixed(1) + 'pp') : '—'; }

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
    return fetch('./data/clv_tracker.json?fresh=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){ clvMap = buildMap(d || {}); return clvMap; })
      .catch(function(){ clvMap = {}; return clvMap; })
      .finally(function(){ loading = false; });
  }

  function style(){
    if (document.getElementById('ba-clv-guidance-style-v5')) return;
    var css = [
      '.ba-clv-guidance{display:block!important;margin:10px 0 12px!important;padding:10px 12px!important;border-radius:16px;border:1px solid rgba(255,255,255,.11);background:linear-gradient(180deg,rgba(17,24,39,.82),rgba(9,14,26,.78));box-shadow:0 8px 18px rgba(0,0,0,.15);font-family:var(--font-sans,system-ui,sans-serif);pointer-events:none}',
      '.ba-clv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.ba-clv-kicker{font:800 9px var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:rgba(148,163,184,.95)}.ba-clv-note{font-size:10px;color:rgba(203,213,225,.72);text-align:right}',
      '.ba-clv-status{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.ba-clv-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);font:800 10px var(--mono,monospace);letter-spacing:.02em;color:#e5edf9;white-space:nowrap}',
      '.ba-clv-pill-pick-bet{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.22);color:#86efac}.ba-clv-pill-pick-risk{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.22);color:#fcd34d}.ba-clv-pill-pick-avoid{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.22);color:#fca5a5}.ba-clv-pill-pick-neutral{background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.2);color:#cbd5e1}',
      '.ba-clv-pill-market-good{background:rgba(34,197,94,.10);border-color:rgba(34,197,94,.2);color:#86efac}.ba-clv-pill-market-warn{background:rgba(249,115,22,.12);border-color:rgba(249,115,22,.22);color:#fdba74}.ba-clv-pill-market-caution{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.22);color:#fde68a}.ba-clv-pill-market-bad{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.22);color:#fca5a5}.ba-clv-pill-market-info{background:rgba(59,130,246,.10);border-color:rgba(59,130,246,.2);color:#93c5fd}',
      '.ba-clv-title{font-size:14px;line-height:1.2;font-weight:900;letter-spacing:-.02em;color:#f8fafc;margin-bottom:5px}.ba-clv-sub{font-size:11px;line-height:1.45;color:rgba(226,232,240,.82);margin-bottom:8px}',
      '.ba-clv-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}.ba-clv-metric{padding:7px 8px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05)}.ba-clv-metric span{display:block;font:700 8px var(--mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:rgba(148,163,184,.92);margin-bottom:2px}.ba-clv-metric b{display:block;font-size:13px;line-height:1.15;font-weight:900;color:#f8fafc}',
      '.ba-clv-footer{padding-top:7px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;line-height:1.45;color:rgba(226,232,240,.94)}.ba-clv-footer b{font-weight:900}',
      '.ba-clv-good{border-color:rgba(34,197,94,.32)}.ba-clv-warn{border-color:rgba(249,115,22,.34)}.ba-clv-caution{border-color:rgba(245,158,11,.34)}.ba-clv-bad{border-color:rgba(239,68,68,.34)}.ba-clv-info{border-color:rgba(59,130,246,.30)}'
    ].join('');
    var el = document.createElement('style'); el.id = 'ba-clv-guidance-style-v5'; el.textContent = css; document.head.appendChild(el);
  }

  function pickState(container){
    var t = cleanText(container).toUpperCase();
    if (/\bPARIAZA\b|\bPARIAZĂ\b/.test(t)) return {kind:'bet', label:'Pick: PARIAZĂ'};
    if (/\bEVITA\b|\bEVITĂ\b/.test(t)) return {kind:'avoid', label:'Pick: EVITĂ'};
    if (/\bRISC\b/.test(t)) return {kind:'risk', label:'Pick: RISC'};
    return {kind:'neutral', label:'Pick: Model'};
  }

  function profile(row){
    var v = String(row.verdict || '');
    if (v === 'PROFITABIL_CONFIRMAT') return {sev:'good', marketLabel:'Piață confirmată', headline:'Selecție susținută și de istoric', summary:'CLV și ROI confirmă că piața a fost sănătoasă. Mesajul CLV susține verdictul pick-ului, nu îl contrazice.'};
    if (v === 'CLV_BUN_ROI_SLAB') return {sev:'warn', marketLabel:'Piață în recovery', headline:'Context mixt, dar constructiv', summary:'Closing line-ul arată mai bine decât ROI-ul istoric. Merită doar selecțiile foarte curate, fără miză agresivă.'};
    if (v === 'ROI_BUN_CLV_SLAB') return {sev:'caution', marketLabel:'Piață neconfirmată', headline:'Profit istoric, dar fără confirmare CLV', summary:'Piața a produs profit, însă closing line-ul nu confirmă pe termen lung. Pick-ul poate rămâne bun, dar miza rămâne moderată.'};
    if (v === 'RECALIBRARE_NECESARA') return {sev:'bad', marketLabel:'Piață fragilă', headline:'Selecție validă doar cu prudență', summary:'CLV descrie istoricul pieței, nu anulează verdictul pick-ului. Când piața e fragilă, joacă doar cu edge mare și miză redusă.'};
    if (v === 'SAMPLE_MIC') return {sev:'info', marketLabel:'Sample limitat', headline:'Context încă neclar', summary:'Sunt prea puține pick-uri settle-ate pentru o concluzie puternică. Ia CLV-ul ca reper secundar.'};
    var sev = String(row.severity || 'info');
    return {sev:sev, marketLabel:'Context piață', headline:row.label || 'Context de piață CLV', summary:row.action || 'Indicator istoric de piață.'};
  }

  function combinedTitle(pick, p){
    if (pick.kind === 'bet' && p.sev === 'good') return 'PARIAZĂ · piața confirmă selecția';
    if (pick.kind === 'bet' && (p.sev === 'caution' || p.sev === 'warn')) return 'PARIAZĂ · dar cu miză moderată';
    if (pick.kind === 'bet' && p.sev === 'bad') return 'PARIAZĂ · însă piața cere prudență';
    if (pick.kind === 'risk' && p.sev === 'good') return 'RISC · dar piața este sănătoasă';
    if (pick.kind === 'risk' && (p.sev === 'caution' || p.sev === 'warn' || p.sev === 'bad')) return 'RISC · plus context de piață slab';
    if (pick.kind === 'avoid') return 'EVITĂ · contextul nu ajută';
    return p.headline;
  }

  function combinedSummary(pick, p, row, mk){
    var edgeAdj = Number(row.edge_adjustment_pp || 0);
    var market = marketLabel(mk);
    if (pick.kind === 'bet' && p.sev === 'bad') return 'Modelul aprobă selecția curentă, dar istoricul pentru ' + market + ' este fragil. Citește acest card ca limită de miză, nu ca anulare a pick-ului.' + (edgeAdj > 0 ? ' Prag util: edge ' + ppm(edgeAdj) + '.' : '');
    if (pick.kind === 'bet' && (p.sev === 'caution' || p.sev === 'warn')) return 'Pick-ul rămâne jucabil, însă contextul de piață nu justifică o miză agresivă. CLV-ul te ajută să dimensionezi miza.' + (edgeAdj > 0 ? ' Prag util: edge ' + ppm(edgeAdj) + '.' : '');
    if (pick.kind === 'risk' && (p.sev === 'bad' || p.sev === 'caution')) return 'Aici și pick-ul, și piața cer disciplină. Cel mai prudent este stake mic sau skip, în funcție de toleranța ta la risc.' + (edgeAdj > 0 ? ' Prag util: edge ' + ppm(edgeAdj) + '.' : '');
    if (pick.kind === 'risk' && p.sev === 'good') return 'Pick-ul este la limită, dar piața are istoric sănătos. CLV-ul nu contrazice semnalul, doar îl pune în context.';
    if (pick.kind === 'avoid') return 'Semnalul pick-ului este deja slab. Indicatorul de piață nu schimbă verdictul, doar îl explică.';
    return p.summary + (edgeAdj > 0 ? ' Prag util: edge ' + ppm(edgeAdj) + '.' : '');
  }

  function makeBadge(row, mk, pick){
    var p = profile(row), sev = 'ba-clv-' + (p.sev || row.severity || 'info');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ' + sev;
    box.innerHTML = ''+
      '<div class="ba-clv-top">'+
        '<div class="ba-clv-kicker">Context piață · '+marketLabel(mk)+'</div>'+
        '<div class="ba-clv-note">CLV explică piața, nu schimbă singur pick-ul</div>'+
      '</div>'+
      '<div class="ba-clv-status">'+
        '<span class="ba-clv-pill ba-clv-pill-pick-'+pick.kind+'">'+pick.label+'</span>'+
        '<span class="ba-clv-pill ba-clv-pill-market-'+p.sev+'">Piață: '+p.marketLabel+'</span>'+
      '</div>'+
      '<div class="ba-clv-title">'+combinedTitle(pick, p)+'</div>'+
      '<div class="ba-clv-sub">'+p.summary+'</div>'+
      '<div class="ba-clv-metrics">'+
        '<div class="ba-clv-metric"><span>CLV med</span><b>'+pct(row.avg_clv_pct)+'</b></div>'+
        '<div class="ba-clv-metric"><span>ROI piață</span><b>'+pct(row.roi_flat_pct)+'</b></div>'+
        '<div class="ba-clv-metric"><span>Sample</span><b>N='+(row.n || 0)+'</b></div>'+
      '</div>'+
      '<div class="ba-clv-footer"><b>Interpretare:</b> '+combinedSummary(pick, p, row, mk)+'</div>';
    return box;
  }

  function findRecoHeader(container){
    return Array.prototype.find.call(container.querySelectorAll('*'), function(n){
      var t = cleanText(n);
      return /^(RECOMANDARE PRINCIPALĂ|PRONOSTIC RECOMANDAT|RECOMANDARE PRINCIPALA)$/i.test(t);
    }) || null;
  }

  function add(container, row, mk){
    if (!container || !row || container.querySelector('.ba-clv-guidance')) return;
    var box = makeBadge(row, mk, pickState(container));
    var header = findRecoHeader(container);
    if (header && header.parentNode && container.contains(header)) {
      header.parentNode.insertBefore(box, header.nextSibling);
      return;
    }
    var marketTitle = Array.prototype.find.call(container.querySelectorAll('*'), function(n){
      var t = cleanText(n);
      return mk === 'btts' ? /^BTTS$/i.test(t) : mk === 'under35' ? /^Under\s*3[\.,]5G?$/i.test(t) : mk === 'over25' ? /^Over\s*2[\.,]5G?$/i.test(t) : mk === 'over15' ? /^Over\s*1[\.,]5G?$/i.test(t) : false;
    });
    if (marketTitle && marketTitle.parentNode && container.contains(marketTitle)) marketTitle.parentNode.insertBefore(box, marketTitle);
    else container.insertBefore(box, container.firstChild);
  }

  function findRecoContainers(root){
    var nodes = Array.prototype.slice.call(root.querySelectorAll('div,article,section,li'));
    var out = [];
    nodes.forEach(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return;
      var t = cleanText(el);
      if (t.length < 80 || t.length > 1800) return;
      if (!/(RECOMANDARE PRINCIPALĂ|PRONOSTIC RECOMANDAT|RECOMANDARE PRINCIPALA|Probabilitate pronostic)/i.test(t)) return;
      if (!/(BTTS|Over|Under|Peste|Sub|Ambele)/i.test(t)) return;
      out.push({el:el, len:t.length, text:t});
    });
    out.sort(function(a,b){return a.len-b.len});
    return out.slice(0, 24);
  }

  function scan(){
    if (!clvMap || !isMeciuriActive()) return;
    var now = Date.now();
    if (now - lastScan < 700) return;
    lastScan = now;
    style();
    var root = document.getElementById('tab-meciuri');
    if (!root) return;
    findRecoContainers(root).forEach(function(item){
      var mk = marketKey(item.text), row = clvMap[mk];
      if (row) add(item.el, row, mk);
    });
  }
  function schedule(){
    if (scanTimer) return;
    scanTimer = setTimeout(function(){ scanTimer = null; load().then(scan); }, 250);
  }
  function hook(){
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidanceV5) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); schedule(); setTimeout(schedule, 900); return r; };
      window.renderMatches.__baClvGuidanceV5 = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidanceV5) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') { schedule(); setTimeout(schedule, 900); } return r; };
      window.switchTab.__baClvGuidanceV5 = true;
    }
  }
  function boot(){ hook(); if (isMeciuriActive()) { schedule(); setTimeout(schedule, 1200); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [1200, 4000].forEach(function(t){ setTimeout(boot, t); });
})();
