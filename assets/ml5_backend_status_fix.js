// ML5 backend/cache status fix.
// GitHub Actions owns BSD_TOKEN; browser reads data/enriched.json only.
(function(){
  'use strict';
  if(window.__baMl5BackendStatusFixV1) return;
  window.__baMl5BackendStatusFixV1 = true;

  var TOKEN_RE = /(Token\s+BSD\s+lips[ăa]|Introdu\s+tokenul\s+în\s+Set[ăa]ri|enrichment-ul\s+live)/i;

  function text(el){
    return String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  }

  function getStats(){
    var body = text(document.body);
    var m = body.match(/ENRICHED\s+(\d+)\s*\/\s*(\d+)/i);
    var c = body.match(/CACHE\s+(\d+)\s*meciuri/i);
    var enriched = m ? Number(m[1] || 0) : 0;
    var total = m ? Number(m[2] || 0) : 0;
    var cache = c ? Number(c[1] || 0) : 0;
    return { enriched: enriched, total: total, cache: cache, complete: total > 0 && enriched >= total && cache >= total };
  }

  function patchWarning(){
    var st = getStats();
    if(!st.cache && !st.enriched) return;

    var nodes = Array.prototype.slice.call(document.querySelectorAll('div,section,article,p,span'));
    nodes.forEach(function(el){
      var t = text(el);
      if(!t || t.length > 500 || !TOKEN_RE.test(t)) return;

      var box = el;
      var p = el.parentElement;
      while(p && p !== document.body){
        var pt = text(p);
        if(!TOKEN_RE.test(pt) || pt.length > 650) break;
        box = p;
        p = p.parentElement;
      }

      if(st.complete){
        box.innerHTML = '✅ <strong>Cache ML5 complet.</strong> Datele vin din <strong>GitHub Actions</strong>; tokenul BSD nu se folosește în browser.';
        box.style.background = 'rgba(34,197,94,.08)';
        box.style.borderColor = 'rgba(34,197,94,.26)';
        box.style.color = '#86efac';
      }else{
        box.innerHTML = 'ℹ️ <strong>Cache ML5 parțial.</strong> Rulează workflow-ul GitHub Actions pentru actualizare.';
        box.style.background = 'rgba(245,158,11,.08)';
        box.style.borderColor = 'rgba(245,158,11,.28)';
        box.style.color = '#facc15';
      }
      box.setAttribute('data-ba-ml5-backend-status-fixed','1');
    });
  }

  function run(){
    try { patchWarning(); } catch(e) {}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  [100, 300, 700, 1500, 3000, 6000, 10000].forEach(function(ms){ setTimeout(run, ms); });
  try { new MutationObserver(function(){ setTimeout(run, 30); }).observe(document.documentElement, {childList:true, subtree:true, characterData:true}); } catch(e) {}
})();
