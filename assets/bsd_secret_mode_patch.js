(function(){
  'use strict';

  // BetAnalyticsProV3 rule:
  // BSD_TOKEN lives only in GitHub Actions secrets. The public GitHub Pages UI
  // must not require, expose or request the token in the browser.
  window.BA_USE_GITHUB_ACTIONS_BSD_SECRET = true;

  var WARNING_RE = /(Token BSD lips[ăa]|Introdu tokenul\s+în\s+Set[ăa]ri|enrichment-ul live)/i;

  function hideTokenWarnings(root){
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('div,section,article,p,span');
    nodes.forEach(function(el){
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if(!text || text.length > 420 || !WARNING_RE.test(text)) return;

      // Hide the smallest warning container, not the whole ML5 dashboard.
      var target = el;
      var parent = el.parentElement;
      while(parent && parent !== document.body){
        var pText = (parent.textContent || '').replace(/\s+/g, ' ').trim();
        if(pText.length > 520 || !WARNING_RE.test(pText)) break;
        target = parent;
        parent = parent.parentElement;
      }
      target.style.display = 'none';
      target.setAttribute('data-ba-hidden-token-warning', '1');
    });
  }

  function boot(){
    hideTokenWarnings(document);
    try{
      new MutationObserver(function(mutations){
        mutations.forEach(function(m){
          if(m.addedNodes){
            m.addedNodes.forEach(function(n){
              if(n && n.nodeType === 1) hideTokenWarnings(n);
            });
          }
        });
      }).observe(document.body, {childList:true, subtree:true});
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
