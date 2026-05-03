// BetAnalyticsProV3 — Meciuri mobile cleanup runtime
// Removes the injected PRO bar, Motor filter chip and per-match "Adaugă la bilet" buttons.
(function(){
  'use strict';
  if(window.__baMeciuriMobileCleanupV1) return;
  window.__baMeciuriMobileCleanupV1 = true;

  function addStyle(){
    if(document.getElementById('ba-meciuri-cleanup-css-v1')) return;
    var s = document.createElement('style');
    s.id = 'ba-meciuri-cleanup-css-v1';
    s.textContent = [
      '#ba-match-probar{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#tab-meciuri .ba-motor-chip-hidden{display:none!important}',
      '#tab-meciuri .ba-ticket-btn-hidden{display:none!important}',
      '#tab-meciuri .m17-actions{grid-template-columns:1fr!important}',
      '#tab-meciuri .m17-actions:empty{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function norm(txt){
    try{
      return String(txt || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }catch(e){
      return String(txt || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }

  function removeNode(el){
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }

  function isMotorButton(btn){
    var text = norm(btn.textContent || '');
    var onclick = String(btn.getAttribute('onclick') || '').toLowerCase();
    return onclick.indexOf('motor_validated') >= 0 || text === 'motor' || text.indexOf(' motor') >= 0;
  }

  function isTicketButton(btn){
    var text = norm(btn.textContent || '');
    var onclick = String(btn.getAttribute('onclick') || '').toLowerCase();
    return onclick.indexOf('quickaddmatchtoticket') >= 0 || text.indexOf('adauga la bilet') >= 0 || text.indexOf('adauga pe bilet') >= 0;
  }

  function cleanup(){
    addStyle();
    removeNode(document.getElementById('ba-match-probar'));

    var tab = document.getElementById('tab-meciuri');
    if(!tab) return;

    Array.prototype.slice.call(tab.querySelectorAll('button')).forEach(function(btn){
      if(isMotorButton(btn)){
        btn.classList.add('ba-motor-chip-hidden');
        removeNode(btn);
        return;
      }
      if(isTicketButton(btn)){
        btn.classList.add('ba-ticket-btn-hidden');
        removeNode(btn);
      }
    });
  }

  function boot(){
    cleanup();
    [80, 200, 500, 1000, 1800, 3200, 6000].forEach(function(delay){ setTimeout(cleanup, delay); });
    setInterval(cleanup, 1200);
    try{
      new MutationObserver(function(){
        clearTimeout(window.__baMeciuriCleanupTimer);
        window.__baMeciuriCleanupTimer = setTimeout(cleanup, 30);
      }).observe(document.documentElement, {childList:true, subtree:true});
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
