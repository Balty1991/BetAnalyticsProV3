// BetAnalytics Pro - CLV market guidance on Meciuri cards
// Non-filtering: only adds visual guidance from data/clv_tracker.json.
(function(){
  'use strict';
  if (window.__baClvCardGuidanceV3) return;
  window.__baClvCardGuidanceV3 = true;

  var clvMap = null;
  var loading = false;

  function cleanText(el){
    return (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function marketKey(s){
    s = String(s || '').toLowerCase();
    if (/\bbtts\b|ambele\s+marcheaz/.test(s)) return 'btts';
    if (/over\s*1[\.,]5|peste\s*1[\.,]5|\bo1[\.,]5|1[\.,]5g|over15/.test(s)) return 'over15';
    if (/over\s*2[\.,]5|peste\s*2[\.,]5|\bo2[\.,]5|2[\.,]5g|over25/.test(s)) return 'over25';
    if (/under\s*3[\.,]5|sub\s*3[\.,]5|\bu3[\.,]5|3[\.,]5g|under35/.test(s)) return 'under35';
    if (/home[_\s-]*win|victorie\s+gazd/.test(s)) return 'home_win';
    if (/away[_\s-]*win|victorie\s+oaspe/.test(s)) return 'away_win';
    if (/\bdraw\b|\begal\b/.test(s)) return 'draw';
    return String(s || '').trim();
  }

  function marketLabel(key){
    return ({over15:'O1.5', over25:'O2.5', under35:'U3.5', btts:'BTTS', home_win:'Home', away_win:'Away', draw:'Draw'})[key] || String(key || '').toUpperCase();
  }

  function buildMap(data){
    var map = {};
    var by = (data && data.by_market) || {};
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
    return fetch('./data/clv_tracker.json?v=' + Date.now(), {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){ clvMap = buildMap(d || {}); return clvMap; })
      .catch(function(){ clvMap = {}; return clvMap; })
      .finally(function(){ loading = false; });
  }

  function style(){
    if (document.getElementById('ba-clv-guidance-style-v3')) return;
    var css = [
      '.ba-clv-guidance{display:block!important;margin:10px 0 12px!important;padding:10px 12px!important;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(11,18,32,.78);box-shadow:0 10px 24px rgba(0,0,0,.18);font-family:var(--font-sans,system-ui,sans-serif)}',
      '.ba-clv-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.ba-clv-left{display:flex;align-items:center;gap:8px;min-width:0}.ba-clv-ico{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.08);font-size:13px;flex:0 0 auto}.ba-clv-title{font-size:13px;font-weight:900;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-clv-kicker{font:700 9px var(--mono,monospace);letter-spacing:.13em;text-transform:uppercase;color:rgba(148,163,184,.95)}',
      '.ba-clv-pill{padding:4px 7px;border-radius:999px;font:800 10px var(--mono,monospace);background:rgba(255,255,255,.07);color:rgba(226,232,240,.9);white-space:nowrap}',
      '.ba-clv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:6px 0 7px}.ba-clv-metric{padding:6px 7px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.055)}.ba-clv-metric span{display:block;font:700 8px var(--mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:rgba(148,163,184,.92);margin-bottom:2px}.ba-clv-metric b{display:block;font-size:12px;font-weight:900;color:#f8fafc}',
      '.ba-clv-action{font-size:11px;line-height:1.35;color:rgba(203,213,225,.95);padding-top:6px;border-top:1px solid rgba(255,255,255,.07)}',
      '.ba-clv-good{border-color:rgba(34,197,94,.42);background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(11,18,32,.78))}.ba-clv-good .ba-clv-title,.ba-clv-good .ba-clv-action b{color:#22c55e}',
      '.ba-clv-warn{border-color:rgba(249,115,22,.44);background:linear-gradient(135deg,rgba(249,115,22,.13),rgba(11,18,32,.78))}.ba-clv-warn .ba-clv-title,.ba-clv-warn .ba-clv-action b{color:#fb923c}',
      '.ba-clv-caution{border-color:rgba(245,158,11,.44);background:linear-gradient(135deg,rgba(245,158,11,.12),rgba(11,18,32,.78))}.ba-clv-caution .ba-clv-title,.ba-clv-caution .ba-clv-action b{color:#f59e0b}',
      '.ba-clv-bad{border-color:rgba(239,68,68,.46);background:linear-gradient(135deg,rgba(239,68,68,.12),rgba(11,18,32,.78))}.ba-clv-bad .ba-clv-title,.ba-clv-bad .ba-clv-action b{color:#f87171}',
      '.ba-clv-info{border-color:rgba(59,130,246,.38);background:linear-gradient(135deg,rgba(59,130,246,.11),rgba(11,18,32,.78))}.ba-clv-info .ba-clv-title,.ba-clv-info .ba-clv-action b{color:#60a5fa}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'ba-clv-guidance-style-v3';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function pct(v){
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function profile(row){
    var v = String(row.verdict || '');
    if (v === 'PROFITABIL_CONFIRMAT') return {icon:'✓', title:'Piață CLV confirmată', sev:'good', action:'Semnal istoric sănătos. Stake normal, fără relaxare de prag.'};
    if (v === 'CLV_BUN_ROI_SLAB') return {icon:'↻', title:'Piață în recovery', sev:'warn', action:'CLV bun, dar ROI slab. Joacă doar selecții foarte curate.'};
    if (v === 'ROI_BUN_CLV_SLAB') return {icon:'!', title:'Profit neconfirmat de CLV', sev:'caution', action:'ROI bun, dar piața nu confirmă. Nu crește stake-ul.'};
    if (v === 'RECALIBRARE_NECESARA') return {icon:'!', title:'Piață CLV slabă', sev:'bad', action:'Istoric fragil. Stake redus și cere edge mai mare.'};
    if (v === 'SAMPLE_MIC') return {icon:'i', title:'Sample insuficient', sev:'info', action:'Prea puține pick-uri settle-ate. Nu trage concluzii ferme.'};
    var sev = String(row.severity || 'info');
    return {icon: sev === 'good' ? '✓' : sev === 'bad' ? '!' : sev === 'warn' ? '↻' : sev === 'caution' ? '!' : 'i', title: row.label || 'Ghid piață CLV', sev:sev, action: row.action || 'Indicator istoric de piață.'};
  }

  function makeBadge(row, mk){
    var p = profile(row);
    var sev = 'ba-clv-' + (p.sev || row.severity || 'info');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ' + sev;
    box.title = row.action || p.action || '';
    var adj = Number(row.edge_adjustment_pp || 0);
    var action = p.action || row.action || '';
    if (adj > 0) action += ' Prag recomandat: edge +' + adj.toFixed(1) + 'pp.';
    box.innerHTML = ''+
      '<div class="ba-clv-head">'+
        '<div class="ba-clv-left"><div class="ba-clv-ico">'+p.icon+'</div><div><div class="ba-clv-kicker">Indicator piață</div><div class="ba-clv-title">'+p.title+'</div></div></div>'+
        '<div class="ba-clv-pill">'+marketLabel(mk)+'</div>'+
      '</div>'+
      '<div class="ba-clv-grid">'+
        '<div class="ba-clv-metric"><span>CLV med</span><b>'+pct(row.avg_clv_pct)+'</b></div>'+
        '<div class="ba-clv-metric"><span>ROI piață</span><b>'+pct(row.roi_flat_pct)+'</b></div>'+
        '<div class="ba-clv-metric"><span>Sample</span><b>N='+(row.n || 0)+'</b></div>'+
      '</div>'+
      '<div class="ba-clv-action"><b>Ghid:</b> '+action+'</div>';
    return box;
  }

  function findMarketTitle(container, mk){
    var re = mk === 'btts' ? /^(BTTS)$/i : mk === 'under35' ? /^Under\s*3[\.,]5G?$/i : mk === 'over25' ? /^Over\s*2[\.,]5G?$/i : mk === 'over15' ? /^Over\s*1[\.,]5G?$/i : null;
    if (!re) return null;
    var nodes = Array.prototype.slice.call(container.querySelectorAll('*'));
    for (var i=0;i<nodes.length;i++){
      var t = cleanText(nodes[i]);
      if (!re.test(t)) continue;
      var row = nodes[i].parentElement;
      for (var j=0; row && j<3; j++, row=row.parentElement){
        if (row.parentElement === container || (row.parentElement && container.contains(row.parentElement))) {
          var rt = cleanText(row);
          if (rt.length <= 180 && (rt.indexOf(t) >= 0)) return row;
        }
      }
      return nodes[i];
    }
    return null;
  }

  function add(container, row, mk){
    if (!container || !row || container.querySelector('.ba-clv-guidance')) return;
    var box = makeBadge(row, mk);
    var anchor = findMarketTitle(container, mk);
    if (anchor && anchor.parentNode && container.contains(anchor)) {
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      return;
    }
    var prob = Array.prototype.find.call(container.children || [], function(c){ return /PROBABILITATE PRONOSTIC|Probabilitate pronostic/i.test(cleanText(c)); });
    if (prob && prob.parentNode === container) container.insertBefore(box, prob);
    else container.insertBefore(box, container.firstChild);
  }

  function findRecoContainers(root){
    var all = Array.prototype.slice.call(root.querySelectorAll('div,article,section,li'));
    var list = [];
    all.forEach(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return;
      var t = cleanText(el);
      if (t.length < 80 || t.length > 2600) return;
      if (!/(RECOMANDARE PRINCIPALĂ|PRONOSTIC RECOMANDAT|RECOMANDARE PRINCIPALA|Pronostic recomandat|Probabilitate pronostic)/i.test(t)) return;
      if (!/(BTTS|Over|Under|Peste|Sub|Ambele)/i.test(t)) return;
      list.push({el:el, len:t.length, text:t});
    });
    list.sort(function(a,b){ return a.len - b.len; });
    return list;
  }

  function scan(){
    if (!clvMap) return;
    style();
    var root = document.getElementById('tab-meciuri') || document.body;

    findRecoContainers(root).forEach(function(item){
      var mk = marketKey(item.text);
      var row = clvMap[mk];
      if (row) add(item.el, row, mk);
    });

    Array.prototype.forEach.call(root.querySelectorAll('*'), function(el){
      if (el.querySelector && el.querySelector('.ba-clv-guidance')) return;
      var t = cleanText(el);
      if (!/^(BTTS|Over 1[\.,]5G?|Over 2[\.,]5G?|Under 3[\.,]5G?)$/i.test(t)) return;
      var mk = marketKey(t), row = clvMap[mk];
      if (!row) return;
      var p = el.parentElement;
      for (var i=0; p && i<5; i++, p=p.parentElement){
        var pt = cleanText(p);
        if (pt.length > 100 && pt.length < 2600 && /Edge|Value|Probabilitate|Cota|Cotă|RISC|PARIAZ/i.test(pt)) { add(p,row,mk); break; }
      }
    });
  }

  function run(){ load().then(function(){ scan(); setTimeout(scan, 200); setTimeout(scan, 800); setTimeout(scan, 1800); }); }
  function hook(){
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidanceV3) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); run(); return r; };
      window.renderMatches.__baClvGuidanceV3 = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidanceV3) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') run(); return r; };
      window.switchTab.__baClvGuidanceV3 = true;
    }
  }
  function boot(){
    hook(); run();
    var tab = document.getElementById('tab-meciuri') || document.body;
    if (tab && !tab.__baClvObserverV3) {
      var mo = new MutationObserver(function(){ run(); });
      mo.observe(tab,{childList:true,subtree:true,characterData:true});
      tab.__baClvObserverV3 = mo;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [300,1000,2500,5000,9000,15000].forEach(function(t){ setTimeout(boot, t); });
})();
