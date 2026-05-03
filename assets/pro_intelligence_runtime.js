// BetAnalyticsProV3 — Meciuri direct repo cleanup + compact layout
(function(){
  'use strict';
  if(window.__baMeciuriRepoCompactV28) return;
  window.__baMeciuriRepoCompactV28 = true;

  function $(id){ return document.getElementById(id); }
  function removeNode(el){ if(el && el.parentNode) el.parentNode.removeChild(el); }
  function norm(value){
    try{ return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g,' ').trim().toLowerCase(); }
    catch(e){ return String(value || '').replace(/\s+/g,' ').trim().toLowerCase(); }
  }

  function addStyle(){
    if($('ba-meciuri-repo-compact-css-v28')) return;
    var s = document.createElement('style');
    s.id = 'ba-meciuri-repo-compact-css-v28';
    s.textContent = [
      '#ba-match-probar{display:none!important;visibility:hidden!important;height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}',
      '#ba-pro-v22-toast,.ba-pro-toast,#procc-floating-proof,.procc-floating-proof{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}',
      '#tab-meciuri .ba-motor-chip-hidden,#tab-meciuri .ba-ticket-btn-hidden{display:none!important}',
      '#tab-meciuri button[onclick*="motor_validated"]{display:none!important}',
      '#tab-meciuri .m17-actions{grid-template-columns:1fr!important}',
      '#tab-meciuri .m17-actions:empty{display:none!important}',

      'body #tab-meciuri .mf-card{position:static!important;margin:12px 0 10px!important;padding:12px!important;border-radius:24px!important;overflow:hidden!important;background:radial-gradient(circle at 0 0,rgba(43,229,197,.12),transparent 36%),linear-gradient(180deg,rgba(13,22,38,.98),rgba(7,11,21,.98))!important;border:1px solid rgba(99,129,179,.24)!important;box-shadow:0 14px 36px rgba(0,0,0,.26)!important}',
      'body #tab-meciuri .mf-card:before{display:none!important}',
      'body #tab-meciuri .mf-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:0 0 10px!important;padding:0 0 10px!important;border-bottom:1px solid rgba(255,255,255,.08)!important}',
      'body #tab-meciuri .mf-title-row{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}',
      'body #tab-meciuri .mf-icon{width:34px!important;height:34px!important;font-size:18px!important;border-radius:14px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.09)!important}',
      'body #tab-meciuri .mf-title{font-size:24px!important;line-height:1!important;font-weight:950!important;letter-spacing:-.05em!important;color:#f8fafc!important}',
      'body #tab-meciuri .mf-count{margin-left:auto!important;min-height:34px!important;padding:0 13px!important;border-radius:999px!important;font-size:13px!important;font-weight:900!important;color:#67f5da!important;background:rgba(43,229,197,.10)!important;border:1px solid rgba(43,229,197,.32)!important;white-space:nowrap!important}',

      'body #tab-meciuri .mf-mode-toggle{display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;width:100%!important;height:48px!important;margin:0 0 8px!important;padding:4px!important;border-radius:20px!important;background:rgba(2,6,23,.56)!important;border:1px solid rgba(255,255,255,.08)!important}',
      'body #tab-meciuri .mf-mode-btn{height:40px!important;min-height:40px!important;padding:0 10px!important;border-radius:16px!important;font-size:14px!important;font-weight:900!important;color:rgba(203,213,225,.72)!important;background:transparent!important;border:0!important;box-shadow:none!important}',
      'body #tab-meciuri .mf-mode-btn.active{color:#92fff0!important;background:linear-gradient(135deg,rgba(43,229,197,.28),rgba(59,130,246,.18))!important;border:1px solid rgba(43,229,197,.40)!important;box-shadow:0 8px 22px rgba(43,229,197,.12)!important}',

      'body #tab-meciuri .mf-chips-scroll{display:flex!important;flex-wrap:nowrap!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch!important;scrollbar-width:none!important;margin:0 -4px 8px!important;padding:0 4px 4px!important;border:0!important;background:transparent!important}',
      'body #tab-meciuri .mf-chips-scroll::-webkit-scrollbar{display:none!important}',
      'body #tab-meciuri .mf-chip{flex:0 0 auto!important;min-width:0!important;height:36px!important;min-height:36px!important;padding:0 13px!important;border-radius:999px!important;font-size:12px!important;font-weight:900!important;white-space:nowrap!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(148,163,184,.16)!important;color:rgba(226,232,240,.86)!important;box-shadow:none!important}',
      'body #tab-meciuri .mf-chip.active{color:#06111f!important;background:linear-gradient(135deg,#2be5c5,#60a5fa)!important;border-color:transparent!important;box-shadow:0 8px 20px rgba(43,229,197,.18)!important}',

      'body #tab-meciuri .mf-sort-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      'body #tab-meciuri .mf-select,body #tab-meciuri .mf-advanced-toggle{height:42px!important;min-height:42px!important;border-radius:17px!important;padding:0 14px!important;font-size:13px!important;font-weight:900!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(148,163,184,.16)!important;color:#e5eef9!important;box-shadow:none!important}',
      'body #tab-meciuri .mf-select{width:100%!important}',
      'body #tab-meciuri .mf-advanced-toggle{min-width:104px!important;white-space:nowrap!important}',
      'body #tab-meciuri .mf-advanced{max-height:58vh!important;overflow:auto!important;border-radius:18px!important;margin-top:10px!important}',

      '@media(max-width:768px){body #tab-meciuri .mf-card{padding:10px!important;border-radius:22px!important;margin:10px 0 8px!important}body #tab-meciuri .mf-header{margin-bottom:8px!important;padding-bottom:8px!important}body #tab-meciuri .mf-icon{width:31px!important;height:31px!important;font-size:16px!important;border-radius:13px!important}body #tab-meciuri .mf-title{font-size:22px!important}body #tab-meciuri .mf-count{min-height:31px!important;padding:0 11px!important;font-size:12px!important}body #tab-meciuri .mf-mode-toggle{height:43px!important;border-radius:18px!important;margin-bottom:8px!important}body #tab-meciuri .mf-mode-btn{height:35px!important;min-height:35px!important;font-size:13px!important;border-radius:14px!important}body #tab-meciuri .mf-chip{height:33px!important;min-height:33px!important;padding:0 11px!important;font-size:11.5px!important}body #tab-meciuri .mf-select,body #tab-meciuri .mf-advanced-toggle{height:39px!important;min-height:39px!important;font-size:12px!important;border-radius:16px!important}body #tab-meciuri .mf-advanced-toggle{min-width:96px!important}}',
      '@media(max-width:420px){body #tab-meciuri .mf-title{font-size:20px!important}body #tab-meciuri .mf-count{font-size:11px!important;padding:0 10px!important}body #tab-meciuri .mf-sort-row{grid-template-columns:minmax(0,1fr) 92px!important}body #tab-meciuri .mf-advanced-toggle{min-width:92px!important;padding:0 8px!important}}'
    ].join('\n');
    document.head.appendChild(s);
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
      if(isMotorButton(btn) || isTicketButton(btn)) removeNode(btn);
    });
  }

  function boot(){
    cleanupMeciuri();
    [50,120,250,500,900,1500,2600,4200,7000].forEach(function(ms){ setTimeout(cleanupMeciuri, ms); });
    setInterval(cleanupMeciuri, 1000);
    try{
      new MutationObserver(function(){
        clearTimeout(window.__baMeciuriRepoCompactTimer);
        window.__baMeciuriRepoCompactTimer = setTimeout(cleanupMeciuri, 25);
      }).observe(document.documentElement,{childList:true,subtree:true});
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
