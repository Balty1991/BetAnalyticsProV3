// BetAnalytics Pro - CLV guidance badges on Meciuri cards
// Non-filtering: only adds visual guidance from data/clv_tracker.json.
(function(){
  'use strict';
  if (window.__baClvCardGuidanceV1) return;
  window.__baClvCardGuidanceV1 = true;

  var clvMap = null;
  var loading = false;

  function marketKey(s){
    s = String(s || '').toLowerCase();
    if (/over\s*1[\.,]5|peste\s*1[\.,]5|\bo1[\.,]5|1[\.,]5g|over15/.test(s)) return 'over15';
    if (/over\s*2[\.,]5|peste\s*2[\.,]5|\bo2[\.,]5|2[\.,]5g|over25/.test(s)) return 'over25';
    if (/under\s*3[\.,]5|sub\s*3[\.,]5|\bu3[\.,]5|3[\.,]5g|under35/.test(s)) return 'under35';
    if (/\bbtts\b|ambele\s+marcheaz/.test(s)) return 'btts';
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
    return fetch('./data/clv_tracker.json?v=' + Date.now())
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(d){ clvMap = buildMap(d || {}); return clvMap; })
      .catch(function(){ clvMap = {}; return clvMap; })
      .finally(function(){ loading = false; });
  }

  function style(){
    if (document.getElementById('ba-clv-guidance-style')) return;
    var css = [
      '.ba-clv-guidance{display:flex;gap:7px;align-items:flex-start;margin:8px 0;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.1);font-size:11px;line-height:1.35;background:rgba(15,23,42,.72)}',
      '.ba-clv-guidance b{font-size:11px;font-weight:800}.ba-clv-guidance small{display:block;font-size:10px;color:rgba(148,163,184,.95);margin-top:2px}',
      '.ba-clv-good{border-color:rgba(34,197,94,.36);background:rgba(34,197,94,.08)}.ba-clv-good b{color:#22c55e}',
      '.ba-clv-warn{border-color:rgba(249,115,22,.36);background:rgba(249,115,22,.09)}.ba-clv-warn b{color:#fb923c}',
      '.ba-clv-caution{border-color:rgba(245,158,11,.36);background:rgba(245,158,11,.08)}.ba-clv-caution b{color:#f59e0b}',
      '.ba-clv-bad{border-color:rgba(239,68,68,.38);background:rgba(239,68,68,.09)}.ba-clv-bad b{color:#ef4444}',
      '.ba-clv-info{border-color:rgba(59,130,246,.32);background:rgba(59,130,246,.08)}.ba-clv-info b{color:#60a5fa}'
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

  function goodCard(el){
    if (!el || el.querySelector('.ba-clv-guidance')) return false;
    var c = String(el.className || '').toLowerCase();
    if (!(c.indexOf('card') >= 0 || c.indexOf('match') >= 0 || c.indexOf('pick') >= 0)) return false;
    if (el.querySelectorAll('[class*=card],[class*=match-card]').length > 4) return false;
    var t = (el.innerText || el.textContent || '').trim();
    return t.length >= 45 && t.length < 3500 && /(edge|value|prob|cot|peste|sub|btts|ambele|over|under|xg)/i.test(t);
  }

  function add(el, row){
    var pair = label(row);
    var sev = 'ba-clv-' + (row.severity || 'info');
    var box = document.createElement('div');
    box.className = 'ba-clv-guidance ' + sev;
    box.title = row.action || '';
    var adj = Number(row.edge_adjustment_pp || 0);
    box.innerHTML = '<div>' + pair[0] + '</div><div><b>' + pair[1] + '</b><small>CLV ' + pct(row.avg_clv_pct) + ' · ROI ' + pct(row.roi_flat_pct) + ' · N=' + (row.n || 0) + (adj > 0 ? ' · edge +' + adj.toFixed(1) + 'pp' : '') + '</small></div>';
    var target = el.querySelector('.card-reco-badges,.badges,.tags,.chips');
    if (target) target.appendChild(box);
    else el.insertBefore(box, el.firstChild);
  }

  function scan(){
    if (!clvMap) return;
    style();
    var root = document.getElementById('tab-meciuri') || document.body;
    var cards = root.querySelectorAll('.match-card,.ml-card,.pick-card,.event-card,.prediction-card,.card,[class*=match-card],[class*=pick-card],[class*=prediction-card]');
    Array.prototype.forEach.call(cards, function(el){
      if (!goodCard(el)) return;
      var mk = marketKey((el.getAttribute('data-market') || '') + ' ' + (el.getAttribute('data-type') || '') + ' ' + (el.innerText || el.textContent || ''));
      var row = clvMap[mk];
      if (row) add(el, row);
    });
  }

  function run(){ load().then(function(){ scan(); setTimeout(scan, 300); setTimeout(scan, 1000); }); }
  function hook(){
    if (typeof window.renderMatches === 'function' && !window.renderMatches.__baClvGuidance) {
      var oldRender = window.renderMatches;
      window.renderMatches = function(){ var r = oldRender.apply(this, arguments); run(); return r; };
      window.renderMatches.__baClvGuidance = true;
    }
    if (typeof window.switchTab === 'function' && !window.switchTab.__baClvGuidance) {
      var oldSwitch = window.switchTab;
      window.switchTab = function(name){ var r = oldSwitch.apply(this, arguments); if (name === 'meciuri') run(); return r; };
      window.switchTab.__baClvGuidance = true;
    }
  }
  function boot(){ hook(); run(); var tab = document.getElementById('tab-meciuri'); if (tab && !tab.__baClvObserver) { var mo = new MutationObserver(run); mo.observe(tab,{childList:true,subtree:true}); tab.__baClvObserver = mo; } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [500,1500,3000,6000,10000].forEach(function(t){ setTimeout(boot, t); });
})();
