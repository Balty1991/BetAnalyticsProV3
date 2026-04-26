// Logic safety patch for BetAnalytics Pro scoring
// Fixes: source multiplier dead-code order, SmartScore scale alignment, toxic double penalty.
(function(){
  'use strict';
  if(window.__baLogicSafetyPatchLoaded) return;
  window.__baLogicSafetyPatchLoaded = true;

  var PATCH_FLAG = '__baLogicSafetyPatched';
  var attempts = 0;

  function fnSource(fn){
    try { return Function.prototype.toString.call(fn); } catch(e){ return ''; }
  }
  function clampScore(v){
    var n = Number(v || 0);
    if(!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }
  function replaceGlobalFunction(name, replacementFactory){
    try{
      var original = window[name];
      if(typeof original !== 'function' || original[PATCH_FLAG]) return false;
      var replacement = replacementFactory(original, fnSource(original));
      if(typeof replacement !== 'function') return false;
      replacement[PATCH_FLAG] = true;
      replacement.__baOriginal = original;
      window[name] = replacement;
      return true;
    }catch(e){ return false; }
  }
  function patchFunctionSource(name, transformer){
    try{
      var original = window[name];
      if(typeof original !== 'function' || original[PATCH_FLAG]) return false;
      var src = fnSource(original);
      var next = transformer(src);
      if(!next || next === src) return false;
      var patched = (new Function('return (' + next + ');'))();
      if(typeof patched !== 'function') return false;
      patched[PATCH_FLAG] = true;
      patched.__baOriginal = original;
      window[name] = patched;
      return true;
    }catch(e){ return false; }
  }

  function fixDeadCodeSource(src){
    var out = src;
    // Exact/simple form: if(fromOpenPct < -3) ... else if(fromOpenPct < -5) ...
    out = out.replace(
      /if\s*\(\s*fromOpenPct\s*<\s*-3\s*\)\s*sourceMult\s*\*=\s*0\.75\s*;\s*else\s*if\s*\(\s*fromOpenPct\s*<\s*-5\s*\)\s*sourceMult\s*\*=\s*0\.55\s*;/g,
      'if(fromOpenPct < -5) sourceMult *= 0.55; else if(fromOpenPct < -3) sourceMult *= 0.75;'
    );
    // Braced form.
    out = out.replace(
      /if\s*\(\s*fromOpenPct\s*<\s*-3\s*\)\s*\{\s*sourceMult\s*\*=\s*0\.75\s*;\s*\}\s*else\s*if\s*\(\s*fromOpenPct\s*<\s*-5\s*\)\s*\{\s*sourceMult\s*\*=\s*0\.55\s*;\s*\}/g,
      'if(fromOpenPct < -5){ sourceMult *= 0.55; } else if(fromOpenPct < -3){ sourceMult *= 0.75; }'
    );
    return out;
  }

  function patchDeadCodeOrder(){
    var patched = 0;
    Object.keys(window).forEach(function(k){
      try{
        var fn = window[k];
        if(typeof fn !== 'function' || fn[PATCH_FLAG]) return;
        var src = fnSource(fn);
        if(src.indexOf('fromOpenPct') < 0 || src.indexOf('sourceMult') < 0) return;
        if(src.indexOf('fromOpenPct < -3') < 0 || src.indexOf('fromOpenPct < -5') < 0) return;
        if(patchFunctionSource(k, fixDeadCodeSource)) patched += 1;
      }catch(e){}
    });
    return patched;
  }

  function patchSmartScoreScales(){
    var changed = 0;
    // V17 function had theoretical max 98. Normalize it to the same 0-100 range as ML5.
    changed += replaceGlobalFunction('calcSmartScore', function(original, src){
      var looksV17 = /probScore/.test(src) && /edgeScore/.test(src) && (/min\s*\(\s*58/.test(src) || /Math\.min\s*\(\s*58/.test(src));
      if(!looksV17) return null;
      return function(){
        var score = original.apply(this, arguments);
        return Math.round(clampScore(Number(score || 0) * (100 / 98)) * 10) / 10;
      };
    }) ? 1 : 0;

    // ML5 is already designed for 0-100; enforce clamp only so sorting is stable.
    changed += replaceGlobalFunction('calcSmartScoreML5', function(original, src){
      var looksML5 = /probScore/.test(src) && /edgeScore/.test(src) && (/min\s*\(\s*55/.test(src) || /Math\.min\s*\(\s*55/.test(src));
      if(!looksML5) return null;
      return function(){
        var score = original.apply(this, arguments);
        return Math.round(clampScore(score) * 10) / 10;
      };
    }) ? 1 : 0;
    return changed;
  }

  function patchToxicDoublePenalty(){
    var changed = 0;
    // Toxicity is already reflected in computeStakeMultiplier. Keep the raw function for diagnostics,
    // but stop the extra baseScore -15 path from firing when it is global.
    changed += replaceGlobalFunction('learningDisqualifiesEdge', function(original){
      window.learningDisqualifiesEdgeRaw = original;
      return function(){ return false; };
    }) ? 1 : 0;

    // If the score function itself contains a local learningDisqualifiesEdge penalty, neutralize the explicit -15.
    Object.keys(window).forEach(function(k){
      try{
        var fn = window[k];
        if(typeof fn !== 'function' || fn[PATCH_FLAG]) return;
        var src = fnSource(fn);
        if(src.indexOf('learningDisqualifiesEdge') < 0 || src.indexOf('baseScore') < 0 || src.indexOf('-15') < 0) return;
        var next = src
          .replace(/if\s*\(([^)]*learningDisqualifiesEdge[^)]*)\)\s*baseScore\s*-?=\s*15\s*;/g, 'if($1) baseScore += 0;')
          .replace(/if\s*\(([^)]*learningDisqualifiesEdge[^)]*)\)\s*\{\s*baseScore\s*-?=\s*15\s*;\s*\}/g, 'if($1){ baseScore += 0; }')
          .replace(/baseScore\s*=\s*baseScore\s*-\s*15\s*;/g, 'baseScore = baseScore;');
        if(next !== src && patchFunctionSource(k, function(){ return next; })) changed += 1;
      }catch(e){}
    });
    return changed;
  }

  function patchAll(){
    attempts += 1;
    var fixed = 0;
    fixed += patchDeadCodeOrder();
    fixed += patchSmartScoreScales();
    fixed += patchToxicDoublePenalty();
    window.__baLogicSafetyPatchStatus = {
      attempts: attempts,
      patched_items: fixed,
      updated_at: new Date().toISOString(),
      fixes: ['fromOpenPct order', 'SmartScore 0-100 alignment', 'toxic double-penalty guard']
    };
    return fixed;
  }

  function boot(){
    patchAll();
    setTimeout(patchAll, 800);
    setTimeout(patchAll, 1800);
    setTimeout(patchAll, 4200);
    setInterval(function(){ if(attempts < 20) patchAll(); }, 5000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
