// Concise Hybrid Adaptive Engine copy override
(function(){
  'use strict';
  if(window.__hybridCopyRuntimeLoaded) return;
  window.__hybridCopyRuntimeLoaded = true;

  function q(sel, root){ return (root || document).querySelector(sel); }
  function qa(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function text(el){ return (el && el.textContent || '').replace(/\s+/g,' ').trim(); }

  function compactUnifiedCopy(){
    var grid = q('#unified-summary-grid') || q('#smartbet-summary-grid') || q('#unified-engine-summary');
    if(!grid) return;
    var card = grid.closest ? (grid.closest('.card,.panel,.section,.engine-card') || grid.parentNode) : grid.parentNode;
    if(!card) return;

    qa('p,div,span', card).forEach(function(el){
      var t = text(el);
      if(t.indexOf('Kelly Discipline') >= 0 && t.indexOf('SmartBet Fusion') >= 0 && el.id !== 'hybrid-main-copy'){
        el.style.display = 'none';
      }
      if(el.id === 'unified-hybrid-logic-line') el.style.display = 'none';
    });

    var copy = q('#hybrid-main-copy', card);
    var badge = q('#unified-hybrid-badge', card);
    var anchor = badge || grid;
    if(!copy && anchor && anchor.parentNode){
      copy = document.createElement('div');
      copy.id = 'hybrid-main-copy';
      copy.style.cssText = 'margin:10px 0 10px 0;padding:12px 14px;border-radius:16px;background:rgba(20,184,166,.075);border:1px solid rgba(45,212,191,.18);font-size:12px;line-height:1.45;color:var(--muted)';
      anchor.parentNode.insertBefore(copy, anchor);
    }
    if(copy){
      copy.innerHTML = '<b style="display:block;color:var(--grn);font-size:14px;margin-bottom:5px">🤖 Motor Unificat – Hybrid Adaptive Engine</b>' +
        '<span>SmartScore combină API History, Jurnal cu decay 90 zile, AI Memory și Kelly Discipline într-un scor actualizat continuu.</span>';
    }
  }

  function compactLearningCopy(){
    var candidates = qa('.card,.panel,.section,.engine-card,section,div');
    var card = null;
    for(var i=0;i<candidates.length;i++){
      var t = text(candidates[i]);
      if(t.indexOf('Motor de Învățare Continuă') >= 0 || t.indexOf('Motor de Invatare Continua') >= 0 || t.indexOf('Motor Învățare') >= 0){
        card = candidates[i];
        break;
      }
    }
    if(!card || q('#hybrid-learning-copy', card)) return;
    var box = document.createElement('div');
    box.id = 'hybrid-learning-copy';
    box.style.cssText = 'margin:10px 0 12px 0;padding:11px 13px;border-radius:14px;background:rgba(20,184,166,.07);border:1px solid rgba(45,212,191,.16);font-size:12px;line-height:1.45;color:var(--muted)';
    box.innerHTML = '<b style="color:var(--grn)">Hybrid Learning:</b> învață din API History + Jurnal real și ajustează SmartScore prin decay 90 zile și pattern-uri AI Memory.';
    card.insertBefore(box, card.children[1] || null);
  }

  function apply(){ compactUnifiedCopy(); compactLearningCopy(); }
  window.applyHybridCopyRuntime = apply;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  setTimeout(apply, 1200);
  setTimeout(apply, 3000);
  setInterval(apply, 5000);
})();
