// BetAnalytics Pro - Meciuri filter repair runtime v2
// Purpose: keep native selects/buttons responsive on mobile and trigger app-level filtering only.
// This version intentionally does NOT hide cards at DOM level, because the main renderMatches()
// already owns filtering and card swapping.
(function(){
  'use strict';
  if(window.__baMeciuriFilterRepairV2) return;
  window.__baMeciuriFilterRepairV2 = true;

  var G = (typeof globalThis !== 'undefined') ? globalThis : window;
  var timer = 0;
  function $(id){ return document.getElementById(id); }
  function tab(){ return $('tab-meciuri'); }

  function addCss(){
    if(document.getElementById('ba-meciuri-filter-repair-v2-css')) return;
    var s = document.createElement('style');
    s.id = 'ba-meciuri-filter-repair-v2-css';
    s.textContent = [
      '#tab-meciuri select,#tab-meciuri input,#tab-meciuri button{pointer-events:auto!important;touch-action:manipulation!important}',
      '#tab-meciuri .ba-filter-hidden{display:initial!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureMarketOptions(){
    var sel = $('match-market-filter');
    if(!sel || sel.__baMarketOptionsV2) return;
    var hasO25 = Array.prototype.some.call(sel.options || [], function(o){ return o.value === 'Over 2.5G'; });
    if(!hasO25){
      var o = document.createElement('option');
      o.value = 'Over 2.5G';
      o.textContent = 'Over 2.5G';
      var u35 = Array.prototype.find.call(sel.options || [], function(x){ return x.value === 'Under 3.5G'; });
      sel.insertBefore(o, u35 || null);
    }
    sel.__baMarketOptionsV2 = true;
  }

  function normalizeControlValues(){
    var date = $('match-date-filter');
    if(date){
      if(date.value === '' || date.value === 'toate') date.value = 'all';
      if(date.value === '24h') date.value = '1';
      if(date.value === '48h') date.value = '2';
      if(date.value === '7d') date.value = '7';
    }
    var kickoff = $('match-kickoff-filter');
    if(kickoff){
      if(kickoff.value === '' || kickoff.value === 'oricand') kickoff.value = 'all';
      if(/h$/.test(kickoff.value)) kickoff.value = kickoff.value.replace(/h$/, '');
    }
    var verdict = $('match-verdict-filter');
    if(verdict){
      if(verdict.value === '' || verdict.value === 'toate' || verdict.value === 'verdict') verdict.value = 'all';
      if(verdict.value === 'pariaza') verdict.value = 'bet';
      if(verdict.value === 'risc') verdict.value = 'risk';
      if(verdict.value === 'evita') verdict.value = 'avoid';
    }
    var pro = $('match-pro-mode');
    if(pro && (pro.value === '' || pro.value === 'toate')) pro.value = 'all';
    var tier = $('match-tier-filter');
    if(tier && (tier.value === '' || tier.value === 'toate')) tier.value = 'all';
    document.querySelectorAll('#tab-meciuri .ba-filter-hidden').forEach(function(el){ el.classList.remove('ba-filter-hidden'); });
  }

  function forceRender(){
    if(timer) clearTimeout(timer);
    timer = setTimeout(function(){
      timer = 0;
      normalizeControlValues();
      var container = $('matches-container');
      if(container) container.removeAttribute('data-ba-render-sig');
      try{
        if(typeof G.renderMatches === 'function') G.renderMatches();
      }catch(e){
        try{ console.warn('[MeciuriFilterRepairV2] render failed', e); }catch(_e){}
      }
    }, 40);
  }

  function install(){
    addCss();
    ensureMarketOptions();
    normalizeControlValues();
    var root = tab();
    if(!root || root.__baFilterRepairV2Installed) return;
    root.__baFilterRepairV2Installed = true;
    root.addEventListener('change', function(ev){
      var el = ev.target;
      if(el && /^(SELECT|INPUT)$/i.test(el.tagName || '')) forceRender();
    }, true);
    root.addEventListener('input', function(ev){
      var el = ev.target;
      if(el && /^(INPUT|SELECT)$/i.test(el.tagName || '')) forceRender();
    }, true);
    root.addEventListener('click', function(ev){
      var el = ev.target;
      if(el && (el.closest && el.closest('.mx21-chip,.mx21-mode-btn,.mx21-filter-btn,.filter-btn,.mf-chip,.ba-market-chip'))) setTimeout(forceRender, 80);
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  [100,300,800,1600,3000,6000].forEach(function(t){ setTimeout(install, t); });
})();
