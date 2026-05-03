// BetAnalyticsProV3 — PRO runtime trimmed for Meciuri mobile cleanup
// Keeps the page clean: no injected Meciuri PRO panel, no Motor chip, no add-to-ticket buttons.
(function(){
  'use strict';
  if(window.__baProIntelligenceRuntimeMeciuriCleanV1) return;
  window.__baProIntelligenceRuntimeMeciuriCleanV1 = true;

  function $(id){ return document.getElementById(id); }

  function addStyle(){
    if($('ba-meciuri-clean-runtime-css')) return;
    var s = document.createElement('style');
    s.id = 'ba-meciuri-clean-runtime-css';
    s.textContent = [
      '#ba-match-probar{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#tab-meciuri .ba-motor-chip-hidden{display:none!important}',
      '#tab-meciuri .ba-ticket-btn-hidden{display:none!important}',
      '#tab-meciuri .m17-actions{grid-template-columns:1fr!important}',
      '#tab-meciuri .m17-actions:empty{display:none!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function norm(value){
    try{
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }catch(e){
      return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }

  function removeNode(el){
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }

  function isInMeciuri(el){
    var tab = $('tab-meciuri');
    return !!(tab && el && tab.contains(el));
  }

  function isMotorButton(btn){
    var text = norm(btn && btn.textContent);
    var onclick = String((btn && btn.getAttribute('onclick')) || '').toLowerCase();
    return onclick.indexOf('motor_validated') >= 0 || text === 'motor' || text.indexOf(' motor') >= 0;
  }

  function isTicketButton(btn){
    var text = norm(btn && btn.textContent);
    var onclick = String((btn && btn.getAttribute('onclick')) || '').toLowerCase();
    return onclick.indexOf('quickaddmatchtoticket') >= 0 || text.indexOf('adauga la bilet') >= 0 || text.indexOf('adauga pe bilet') >= 0;
  }

  function cleanupMeciuri(){
    addStyle();

    removeNode($('ba-match-probar'));
    removeNode($('ba-pro-v22-toast'));

    var tab = $('tab-meciuri');
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
    cleanupMeciuri();
    [80, 200, 500, 1000, 1800, 3200, 6000].forEach(function(ms){
      setTimeout(cleanupMeciuri, ms);
    });
    setInterval(cleanupMeciuri, 1200);
    try{
      new MutationObserver(function(){
        clearTimeout(window.__baMeciuriCleanTimer);
        window.__baMeciuriCleanTimer = setTimeout(cleanupMeciuri, 30);
      }).observe(document.documentElement, {childList:true, subtree:true});
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
