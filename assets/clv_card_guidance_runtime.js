// BetAnalytics Pro - CLV guidance badges on Meciuri cards
// Non-filtering: only adds visual guidance from data/clv_tracker.json.
(function(){
  'use strict';
  if (window.__baClvCardGuidanceV2) return;
  window.__baClvCardGuidanceV2 = true;

  var clvMap = null;
  var loading = false;

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
    if (document.getElementById('ba-clv-guidance-style')) return;
    var css = [
      '.ba-clv-guidance{display:flex!important;gap:8px;align-items:flex-start;margin:10px 0!important;padding:9px 11px!important;border-radius:14px;border:1px solid rgba(255,255,255,.12);font-size:12px;line-height:1.35;background:rgba(15,23,42,.82);box-shadow:0 8px 20px rgba(0,0,0,.18)}',
      '.ba-clv-guidance b{font-size:12px;font-weight:900}.ba-clv-guidance small{display:block;font-size:10px;color:rgba(190,202,220,.95);margin-top:2px}',
      '.ba-clv-good{border-color:rgba(34,197,94,.42);background:rgba(34,197,94,.10)}.ba-clv-good b{color:#22c55e}',
      '.ba-clv-warn{border-color:rgba(249,115,22,.44);background:rgba(249,115,22,.12)}.ba-clv-warn b{color:#fb923c}',
      '.ba-clv-caution{border-color:rgba(245,158,11,.44);background:rgba(245,158,11,.11)}.ba-clv-caution b{color:#f59e0b}',
      '.ba-clv-bad{border-color:rgba(239,68,68,.46);background:rgba(239,68,68,.12)}.ba-clv-bad b{color:#ef4444}',
      '.ba-clv-info{border-color:rgba(59,130,246,.38);background:rgba(59,130,246,.10)}.ba-clv-info b{color:#60a5fa}',
      '.ba-clv-floating-debug{position:fixed;left:10px;bottom:76px;z-index:9999;padding:7px 10px;border-radius:12px;background:rgba(15,23,42,.92);border:1px solid rgba(43,229,197,.35);color:#2BE5C5;font:11px monospace}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'ba-clv-guidance-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function label(row){
    var v = String(row.verdict || '');
    if (v === 'PROFITABIL_CONFIRMAT') return ['🟢','CLV confirmat'];
    if (v === 'CLV_BUN_ROI_SLAB') return ['🟠','Recovery strict'];
    if (v === 'ROI_BUN_CLV_SLAB') return ['🟡','ROI bun, CLV slab'];
    if (v === 'RECALIBRARE_NECESARA') return ['🔴','CLV slab'];
    if (v === 'SAMPLE_MIC') return ['🔵','Sample mic'];
    var sev = String(row.severity || 'info');
    return [sev === 'good' ? '🟢' : sev === 'bad' ? '🔴' : sev === 'warn' ? '🟠' : sev === 'caution' ? '🟡' : '🔵', row.label || 'Ghid CLV'];
  }

  function pct(v){
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function makeBadge(row){
    var pair = label(row);
    var sev = 'ba-clv-' + (row.severity || 'info');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ' + sev;
    box.title = row.action || '';
    var adj = Number(row.edge_adjustment_pp || 0);
    box.innerHTML = '<div>' + pair[0] + '</div><div><b>' + pair[1] + '</b><small>CLV ' + pct(row.avg_clv_pct) + ' · ROI ' + pct(row.roi_flat_pct) + ' · N=' + (row.n || 0) + (adj > 0 ? ' · edge +' + adj.toFixed(1) + 'pp' : '') + '</small></div>';
    return box;
  }

  function add(el, row){
    if (!el || !row || el.querySelector('.ba-clv-guidance')) return;
    var box = makeBadge(row);
    var target = el.querySelector('.card-reco-badges,.badges,.tags,.chips,[class*=badge],[class*=chip]');
    if (target && target.parentNode) target.parentNode.insertBefore(box, target.nextSibling);
    else {
      var risk = Array.prototype.find.call(el.children || [], function(c){ return /RISC|PARIAZ|EVIT/.test(c.textContent || ''); });
      if (risk && risk.parentNode === el) el.insertBefore(box, risk);
      else el.insertBefore(box, el.firstChild);
    }
  }

  function findRecoContainers(root){
    var all = Array.prototype.slice.call(root.querySelectorAll('div,article,section,li'));
    var list = [];
    all.forEach(function(el){
      if (!el || el.querySelector('.ba-clv-guidance')) return;
      var t = (el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
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

    var boxes = findRecoContainers(root);
    boxes.forEach(function(item){
      var mk = marketKey(item.text);
      var row = clvMap[mk];
      if (row) add(item.el, row);
    });

    // Fallback: if a detailed card has the market title as a standalone heading, attach to the closest useful parent.
    Array.prototype.forEach.call(root.querySelectorAll('*'), function(el){
      if (el.querySelector && el.querySelector('.ba-clv-guidance')) return;
      var t = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (!/^(BTTS|Over 1[\.,]5G?|Over 2[\.,]5G?|Under 3[\.,]5G?)$/i.test(t)) return;
      var mk = marketKey(t), row = clvMap[mk];
      if (!row) return;
      var p = el.parentElement;
      for (var i=0; p && i<5; i++, p=p.parentElement){
        var pt = (p.innerText || p.textContent || '').replace(/\s+/g,' ').trim();
        if (pt.length > 100 && pt.length < 2600 && /Edge|Value|Probabilitate|Cota|Cotă|RISC/i.test(pt)) { add(p,row); break; }
      }
    });
  }

  function run(){ load().then(function(){ scan(); setTimeout(scan, 200); setTimeout(scan, 800); setTimeout(scan, 1800); }); }
  function hook(){
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidanceV2) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); run(); return r; };
      window.renderMatches.__baClvGuidanceV2 = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidanceV2) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') run(); return r; };
      window.switchTab.__baClvGuidanceV2 = true;
    }
  }
  function boot(){
    hook(); run();
    var tab = document.getElementById('tab-meciuri') || document.body;
    if (tab && !tab.__baClvObserverV2) {
      var mo = new MutationObserver(function(){ run(); });
      mo.observe(tab,{childList:true,subtree:true,characterData:true});
      tab.__baClvObserverV2 = mo;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [300,1000,2500,5000,9000,15000].forEach(function(t){ setTimeout(boot, t); });
})();
