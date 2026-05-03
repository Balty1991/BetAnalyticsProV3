// BetAnalytics Pro - CLV market guidance on Meciuri cards
// V6: ultra-compact mobile guidance. Non-filtering, non-blocking.
(function(){
  'use strict';
  if (window.__baClvCardGuidanceV6) return;
  window.__baClvCardGuidanceV6 = true;

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
    return fetch('./data/clv_tracker.json?fresh=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){ clvMap = buildMap(d || {}); return clvMap; })
      .catch(function(){ clvMap = {}; return clvMap; })
      .finally(function(){ loading = false; });
  }

  function style(){
    if (document.getElementById('ba-clv-guidance-style-v6')) return;
    var css = [
      '.ba-clv-guidance{display:block!important;margin:7px 0 9px!important;padding:8px 9px!important;border-radius:13px;border:1px solid rgba(255,255,255,.10);background:rgba(12,18,31,.78);box-shadow:0 6px 14px rgba(0,0,0,.13);font-family:var(--font-sans,system-ui,sans-serif);pointer-events:none}',
      '.ba-clv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.ba-clv-main{min-width:0;flex:1}.ba-clv-title{font-size:12px;line-height:1.18;font-weight:900;color:#f8fafc;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-clv-sub{margin-top:3px;font-size:10px;line-height:1.25;color:rgba(203,213,225,.86);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-clv-side{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:0 0 auto}',
      '.ba-clv-chip{display:inline-flex;align-items:center;justify-content:center;min-width:42px;padding:3px 6px;border-radius:999px;font:900 9px var(--mono,monospace);letter-spacing:.02em;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.055);color:#e5edf9;white-space:nowrap}.ba-clv-market{font:900 9px var(--mono,monospace);letter-spacing:.08em;color:rgba(148,163,184,.98)}',
      '.ba-clv-meta{display:flex;gap:6px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.06);font:800 9px var(--mono,monospace);color:rgba(203,213,225,.88);white-space:nowrap;overflow:hidden}.ba-clv-meta span{display:inline-flex;align-items:center;gap:2px}.ba-clv-meta b{font-weight:900;color:#f8fafc}',
      '.ba-clv-good{border-color:rgba(34,197,94,.28);background:linear-gradient(135deg,rgba(34,197,94,.09),rgba(12,18,31,.78))}.ba-clv-good .ba-clv-chip{color:#86efac;border-color:rgba(34,197,94,.24);background:rgba(34,197,94,.11)}',
      '.ba-clv-warn{border-color:rgba(249,115,22,.30);background:linear-gradient(135deg,rgba(249,115,22,.10),rgba(12,18,31,.78))}.ba-clv-warn .ba-clv-chip{color:#fdba74;border-color:rgba(249,115,22,.25);background:rgba(249,115,22,.12)}',
      '.ba-clv-caution{border-color:rgba(245,158,11,.30);background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(12,18,31,.78))}.ba-clv-caution .ba-clv-chip{color:#fde68a;border-color:rgba(245,158,11,.25);background:rgba(245,158,11,.12)}',
      '.ba-clv-bad{border-color:rgba(239,68,68,.30);background:linear-gradient(135deg,rgba(239,68,68,.09),rgba(12,18,31,.78))}.ba-clv-bad .ba-clv-chip{color:#fca5a5;border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.10)}',
      '.ba-clv-info{border-color:rgba(59,130,246,.26);background:linear-gradient(135deg,rgba(59,130,246,.09),rgba(12,18,31,.78))}.ba-clv-info .ba-clv-chip{color:#93c5fd;border-color:rgba(59,130,246,.22);background:rgba(59,130,246,.10)}',
      '@media(max-width:420px){.ba-clv-title{font-size:11.5px}.ba-clv-sub{font-size:9.5px}.ba-clv-meta{gap:5px;font-size:8.5px}.ba-clv-chip{min-width:38px;padding:3px 5px}}'
    ].join('');
    var el = document.createElement('style'); el.id = 'ba-clv-guidance-style-v6'; el.textContent = css; document.head.appendChild(el);
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
    if (pick.kind === 'risk' && prof.sev === 'bad') return 'RISC · mai bine skip/stake mic';
    if (pick.kind === 'risk') return 'RISC · stake mic';
    if (pick.kind === 'avoid') return 'EVITĂ · context secundar';
    return 'Context piață · ' + prof.label;
  }
  function subFor(pick, prof){
    if (pick.kind === 'bet' && prof.sev === 'bad') return 'Pick valid, dar CLV cere prudență.';
    if (pick.kind === 'bet' && (prof.sev === 'caution' || prof.sev === 'warn')) return 'Pick jucabil; CLV limitează miza.';
    if (pick.kind === 'risk' && (prof.sev === 'bad' || prof.sev === 'caution' || prof.sev === 'warn')) return 'Pick + piață cer disciplină.';
    if (pick.kind === 'risk') return 'Pick la limită; verifică stake-ul.';
    if (pick.kind === 'avoid') return 'CLV nu schimbă verdictul.';
    return 'CLV este context de miză, nu anulare pick.';
  }

  function makeBadge(row, mk, pick){
    var prof = profile(row);
    var adj = Number(row.edge_adjustment_pp || 0);
    var meta = 'CLV <b>' + pct(row.avg_clv_pct) + '</b> · ROI <b>' + pct(row.roi_flat_pct) + '</b> · N=<b>' + (row.n || 0) + '</b>' + (adj > 0 ? ' · edge ' + pp(adj) : '');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ba-clv-' + prof.sev;
    box.innerHTML = ''+
      '<div class="ba-clv-row">'+
        '<div class="ba-clv-main">'+
          '<div class="ba-clv-title">'+titleFor(pick, prof)+'</div>'+
          '<div class="ba-clv-sub">'+subFor(pick, prof)+'</div>'+
        '</div>'+
        '<div class="ba-clv-side"><span class="ba-clv-chip">'+pick.label+'</span><span class="ba-clv-market">'+marketLabel(mk)+' · '+prof.label+'</span></div>'+
      '</div>'+
      '<div class="ba-clv-meta"><span>'+meta+'</span></div>';
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
    } else {
      container.insertBefore(box, container.firstChild);
    }
  }
  function findRecoContainers(root){
    var nodes = Array.prototype.slice.call(root.querySelectorAll('div,article,section,li'));
    var out = [];
    nodes.forEach(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return;
      var t = cleanText(el);
      if (t.length < 80 || t.length > 1600) return;
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
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidanceV6) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); schedule(); setTimeout(schedule, 900); return r; };
      window.renderMatches.__baClvGuidanceV6 = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidanceV6) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') { schedule(); setTimeout(schedule, 900); } return r; };
      window.switchTab.__baClvGuidanceV6 = true;
    }
  }
  function boot(){ hook(); if (isMeciuriActive()) { schedule(); setTimeout(schedule, 1200); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [1200, 4000].forEach(function(t){ setTimeout(boot, t); });
})();
