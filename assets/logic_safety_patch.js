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

// ML5 odds guard: do not show model/fallback odds as if they were exact market odds.
// It patches the ML5 cards after render, using exact market odds when present in raw data,
// otherwise it hides suspicious odds and derived EV metrics instead of showing false value.
(function(){
  'use strict';
  if(window.__baMl5OddsGuardV1) return;
  window.__baMl5OddsGuardV1 = true;

  var RUNS = 0, timer = null;
  var MAX_DEPTH = 6;
  var ODDS_FIELDS = /^(book_?odds|bookOdds|baseOdds|stdOdds|marketOdds|best_?odds|bestOdds|avgMarketOdds|avg_?market_?odds|price|odd|odds)$/i;
  var BAD_NUM_FIELDS = /prob|probability|score|edge|value_pct|kelly|rank|count|season|minute|goals|home_score|away_score|timestamp|date|id/i;
  var TEXT_FIELDS = /^(market|market_key|marketKey|name|label|title|type|key|selection|outcome|value|handicap|line|specifier|group|description)$/i;

  function clean(s){ return String(s == null ? '' : s).replace(/\s+/g,' ').trim(); }
  function norm(s){
    try{ s = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch(e){ s = String(s || ''); }
    return s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function num(v){
    if(typeof v === 'string') v = v.replace(',', '.');
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function isOdds(n){ n = num(n); return n > 1.01 && n < 40; }
  function leafText(el){ return clean(el && (el.innerText || el.textContent)); }

  function marketKey(s){
    s = String(s || '').toLowerCase().replace(',', '.');
    if(/\bbtts\b|both\s*teams|ambele\s+marcheaz|gg\b/.test(s)) return 'btts';
    if(/(?:over|peste|\bo)\s*1\.?5|1\.?5\s*g|over15|o15/.test(s)) return 'over15';
    if(/(?:under|sub|\bu)\s*1\.?5|under15|u15/.test(s)) return 'under15';
    if(/(?:over|peste|\bo)\s*2\.?5|2\.?5\s*g|over25|o25/.test(s)) return 'over25';
    if(/(?:under|sub|\bu)\s*2\.?5|under25|u25/.test(s)) return 'under25';
    if(/(?:over|peste|\bo)\s*3\.?5|over35|o35/.test(s)) return 'over35';
    if(/(?:under|sub|\bu)\s*3\.?5|3\.?5\s*g|under35|u35/.test(s)) return 'under35';
    return '';
  }
  function exactMarketText(txt, key){
    txt = String(txt || '').toLowerCase().replace(',', '.');
    if(key === 'btts') return /\bbtts\b|both\s*teams.*(yes|score)|ambele\s+marcheaz.*(da|yes)|gg\b/.test(txt) && !/\bno\b|\bnu\b/.test(txt);
    if(key === 'over15') return /(?:over|peste|\bo)\s*1\.?5|1\.?5\s*g|over15|o15/.test(txt);
    if(key === 'under15') return /(?:under|sub|\bu)\s*1\.?5|under15|u15/.test(txt);
    if(key === 'over25') return /(?:over|peste|\bo)\s*2\.?5|2\.?5\s*g|over25|o25/.test(txt);
    if(key === 'under25') return /(?:under|sub|\bu)\s*2\.?5|under25|u25/.test(txt);
    if(key === 'over35') return /(?:over|peste|\bo)\s*3\.?5|over35|o35/.test(txt);
    if(key === 'under35') return /(?:under|sub|\bu)\s*3\.?5|3\.?5\s*g|under35|u35/.test(txt);
    return false;
  }
  function keyHintsMarket(k, key){ return exactMarketText(String(k || '').replace(/[_-]/g,' '), key); }

  function collectText(obj, depth, maxLen){
    var out = [];
    function walk(x, d){
      if(!x || d > depth || out.join(' ').length > maxLen) return;
      if(typeof x === 'string'){ if(x.length < 180) out.push(x); return; }
      if(typeof x !== 'object') return;
      if(Array.isArray(x)){ for(var i=0;i<Math.min(x.length,35);i++) walk(x[i], d+1); return; }
      Object.keys(x).forEach(function(k){
        if(TEXT_FIELDS.test(k) || /home|away|team|league|country|match|fixture|event/i.test(k)) walk(x[k], d+1);
      });
    }
    walk(obj, 0);
    return clean(out.join(' '));
  }
  function objTeamsText(o){
    return collectText(o, 4, 1600);
  }
  function matchObject(o, home, away){
    if(!o || !home || !away) return false;
    var txt = norm(objTeamsText(o));
    var h = norm(home), a = norm(away);
    if(!h || !a || !txt) return false;
    var hShort = h.split(' ').slice(0,2).join(' '), aShort = a.split(' ').slice(0,2).join(' ');
    return (txt.indexOf(h) >= 0 || (hShort.length > 3 && txt.indexOf(hShort) >= 0)) &&
           (txt.indexOf(a) >= 0 || (aShort.length > 3 && txt.indexOf(aShort) >= 0));
  }
  function sourceObjects(){
    var arr = [];
    function add(x){ if(!x) return; if(Array.isArray(x)) x.forEach(add); else if(typeof x === 'object') arr.push(x); }
    try{ add(window.ALL_MATCHES); }catch(e){}
    try{ add(window.ALL_EVENTS); }catch(e){}
    try{ add(window.RECOMMENDATION_LOG); }catch(e){}
    try{ add(window.RECOMMENDATION_JOURNAL); }catch(e){}
    try{ if(window.SIGNAL_AUDIT) add(window.SIGNAL_AUDIT.rows); }catch(e){}
    try{ if(window.AI_MEMORY) add(window.AI_MEMORY.adaptive_picks); }catch(e){}
    try{ if(window.ENRICHED_EVENT_CACHE) Object.keys(window.ENRICHED_EVENT_CACHE).forEach(function(k){ add(window.ENRICHED_EVENT_CACHE[k]); }); }catch(e){}
    return arr;
  }

  function addCandidate(list, odd, trust, path, ctx){
    odd = num(odd);
    if(!isOdds(odd)) return;
    list.push({odds:+odd.toFixed(2), trust:trust, path:path || '', ctx:ctx || ''});
  }
  function candidateTrust(field, ctx){
    field = String(field || ''); ctx = String(ctx || '').toLowerCase();
    if(/book_?odds|bookOdds|baseOdds|stdOdds|marketOdds/i.test(field)) return 120;
    if(/best_?odds|bestOdds/i.test(field)) return 110;
    if(/avgMarketOdds|avg_?market/i.test(field)) return 95;
    if(/\bbookmaker|sportsbook|bet365|betano|superbet|pinnacle|bsd|market|odds/i.test(ctx)) return 85;
    if(/price|odd|odds/i.test(field)) return 70;
    return 40;
  }
  function extractOddsFromObject(obj, key){
    var list = [];
    var seen = new WeakSet();
    function siblingText(o){
      if(!o || typeof o !== 'object') return '';
      var parts = [];
      Object.keys(o).forEach(function(k){
        var v = o[k];
        if(TEXT_FIELDS.test(k) && (typeof v === 'string' || typeof v === 'number')) parts.push(k + ' ' + v);
      });
      return parts.join(' ');
    }
    function walk(x, d, path, ctx){
      if(!x || d > MAX_DEPTH) return;
      if(typeof x !== 'object') return;
      if(seen.has(x)) return;
      seen.add(x);
      var local = clean((ctx || '') + ' ' + siblingText(x) + ' ' + path);
      if(Array.isArray(x)){
        for(var i=0;i<Math.min(x.length,80);i++) walk(x[i], d+1, path + ' item', local);
        return;
      }
      Object.keys(x).forEach(function(k){
        var v = x[k], p = path + ' ' + k, keyText = String(k || '').replace(/[_-]/g,' '), ctx2 = clean(local + ' ' + keyText);
        if((typeof v === 'number' || typeof v === 'string') && isOdds(v)){
          var exact = exactMarketText(ctx2, key) || keyHintsMarket(k, key);
          if(exact && ODDS_FIELDS.test(k) && !BAD_NUM_FIELDS.test(k)) addCandidate(list, v, candidateTrust(k, ctx2), p, ctx2);
          if(keyHintsMarket(k, key) && !BAD_NUM_FIELDS.test(k)) addCandidate(list, v, 100, p, ctx2);
        }
        if(v && typeof v === 'object') walk(v, d+1, p, ctx2);
      });
    }
    walk(obj, 0, '', '');
    list.sort(function(a,b){ return b.trust - a.trust || a.odds - b.odds; });
    return list;
  }
  function findExactOdds(home, away, key){
    var objects = sourceObjects().filter(function(o){ return matchObject(o, home, away); });
    var candidates = [];
    objects.forEach(function(o){
      extractOddsFromObject(o, key).forEach(function(c){ candidates.push(c); });
    });
    candidates = candidates.filter(function(c){ return c && isOdds(c.odds); });
    candidates.sort(function(a,b){ return b.trust - a.trust || a.odds - b.odds; });
    return candidates[0] || null;
  }

  function parseCard(card){
    var t = leafText(card);
    var tm = t.match(/([A-ZĂÂÎȘȚ0-9][^\n@]{2,90}?\s+vs\s+[^\n@]{2,90}?)(?:\s+\d+\s+ML5 SCORE|\s+[A-Z][a-z]+\s*League|\s+PRONOSTIC|\n|$)/i) ||
             t.match(/([A-ZĂÂÎȘȚ0-9][A-Za-zÀ-ž0-9 .'-]{1,70}\s+vs\s+[A-ZĂÂÎȘȚ0-9][A-Za-zÀ-ž0-9 .'-]{1,70})/);
    var teams = tm ? clean(tm[1]) : '';
    var parts = teams.split(/\s+vs\s+/i);
    var mm = t.match(/PRONOSTIC\s+((?:Under|Over|Peste|Sub)\s*\d[\.,]5\s*G?|BTTS)/i);
    var market = mm ? clean(mm[1]) : '';
    var key = marketKey(market);
    var om = t.match(/@\s*([0-9]+(?:[\.,][0-9]+)?)/);
    var currentOdds = om ? num(om[1]) : 0;
    var pm = t.match(/@\s*[0-9]+(?:[\.,][0-9]+)?\s*([0-9]{1,2}(?:[\.,][0-9]+)?)%/) || t.match(/PRONOSTIC[\s\S]{0,120}?([0-9]{1,2}(?:[\.,][0-9]+)?)%/i);
    var prob = pm ? num(pm[1]) : 0;
    return {home:parts[0] || '', away:parts[1] || '', teams:teams, market:market, key:key, odds:currentOdds, prob:prob};
  }
  function isSuspicious(info){
    if(!info || !info.key || !info.odds || !info.prob) return false;
    var p = info.prob / 100, ev = (p * info.odds - 1) * 100;
    if(ev > 35) return true;
    if(info.prob >= 70 && info.odds >= 2.0) return true;
    if(info.key === 'over15' && info.prob >= 75 && info.odds >= 1.35) return true;
    if(info.key === 'under35' && info.prob >= 70 && info.odds >= 1.80) return true;
    return false;
  }
  function leaves(root){
    return Array.prototype.slice.call(root.querySelectorAll('*')).filter(function(el){ return !el.children.length; });
  }
  function setOdds(card, value, exact){
    var ls = leaves(card);
    var el = ls.find(function(n){ return /^@\s*[0-9]+(?:[\.,][0-9]+)?/.test(leafText(n)); });
    if(el){
      el.textContent = value ? ('@ ' + value.toFixed(2)) : '@ —';
      el.title = exact ? 'Cotă exactă din piață' : 'Cotă exactă lipsă — valoarea veche a fost ascunsă';
    }
  }
  function setMetric(card, labelRe, value, color){
    var ls = leaves(card), labelIdx = -1;
    for(var i=0;i<ls.length;i++){
      if(labelRe.test(leafText(ls[i]))){ labelIdx = i; break; }
    }
    if(labelIdx < 0) return;
    var parent = ls[labelIdx].parentElement || card;
    var pls = leaves(parent);
    var idx = pls.indexOf(ls[labelIdx]);
    var target = pls[idx + 1] || pls.find(function(n){ return /[+\-−]?[0-9]/.test(leafText(n)); });
    if(target){ target.textContent = value; if(color) target.style.color = color; }
  }
  function addBadge(card, text, tone){
    if(card.querySelector('.ba-ml5-odds-guard-badge')) return;
    var b = document.createElement('div');
    b.className = 'ba-ml5-odds-guard-badge';
    b.textContent = text;
    b.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin:2px 0 0;padding:4px 8px;border-radius:999px;font:800 10px var(--mono,monospace);letter-spacing:.01em;border:1px solid '+(tone==='bad'?'rgba(251,113,133,.30)':'rgba(83,243,211,.28)')+';color:'+(tone==='bad'?'#fb7185':'#53f3d3')+';background:'+(tone==='bad'?'rgba(251,113,133,.08)':'rgba(83,243,211,.08)')+';width:max-content;max-width:100%';
    var first = card.firstElementChild;
    if(first && first.parentNode === card) first.insertAdjacentElement('afterend', b); else card.insertBefore(b, card.firstChild);
  }
  function patchScore(card){
    var ls = leaves(card);
    for(var i=0;i<ls.length;i++){
      var txt = leafText(ls[i]);
      if(/^\d{3,}$/.test(txt)){
        var next = ls[i+1] ? leafText(ls[i+1]) : '';
        if(/ML5 SCORE/i.test(next)){
          var n = Math.min(100, Math.max(0, Math.round(num(txt))));
          if(String(n) !== txt) ls[i].textContent = String(n);
        }
      }
    }
  }
  function patchCard(card){
    if(!card || card.__baMl5OddsGuardSeen) return;
    var info = parseCard(card);
    patchScore(card);
    if(!info.home || !info.away || !info.key || !info.odds) return;
    var exact = findExactOdds(info.home, info.away, info.key);
    if(exact && exact.odds && Math.abs(exact.odds - info.odds) > 0.009){
      var odds = exact.odds, p = info.prob ? info.prob/100 : 0;
      setOdds(card, odds, true);
      if(p > 0){
        var edge = info.prob - (100 / odds);
        var value = (p * odds - 1) * 100;
        var kelly = odds > 1 ? Math.max(0, ((p * odds - 1) / (odds - 1)) / 4 * 100) : 0;
        setMetric(card, /^EDGE$/i, (edge >= 0 ? '+' : '') + edge.toFixed(1) + 'pp', edge >= 0 ? '#4ade80' : '#fb7185');
        setMetric(card, /^VALUE$/i, (value >= 0 ? '+' : '') + value.toFixed(1) + '%', value >= 0 ? '#4ade80' : '#fb7185');
        setMetric(card, /^KELLY/i, kelly.toFixed(2) + '%', kelly > 0 ? '#c4b5fd' : '#93a4bf');
        setMetric(card, /^FAIR$/i, (1 / p).toFixed(2), '#d7e3f7');
      }
      addBadge(card, 'cotă piață corectată', 'ok');
      card.__baMl5OddsGuardSeen = true;
      return;
    }
    if(isSuspicious(info)){
      setOdds(card, 0, false);
      setMetric(card, /^EDGE$/i, '—', '#93a4bf');
      setMetric(card, /^VALUE$/i, '—', '#93a4bf');
      setMetric(card, /^KELLY/i, '—', '#93a4bf');
      addBadge(card, 'cotă exactă lipsă', 'bad');
      card.__baMl5OddsGuardSeen = true;
    }
  }
  function cards(){
    var root = document.getElementById('ml5-root') || document.getElementById('tab-ml5');
    if(!root) return [];
    var all = Array.prototype.slice.call(root.querySelectorAll('div'));
    return all.filter(function(el){
      var t = leafText(el);
      return /ML5 SCORE/i.test(t) && /PRONOSTIC/i.test(t) && /@\s*[0-9]/.test(t) && !Array.prototype.some.call(el.children, function(ch){
        var ct = leafText(ch);
        return /ML5 SCORE/i.test(ct) && /PRONOSTIC/i.test(ct) && /@\s*[0-9]/.test(ct);
      });
    });
  }
  function run(){
    RUNS += 1;
    try{ cards().forEach(patchCard); }catch(e){}
    window.__baMl5OddsGuardStatus = {runs:RUNS, updated_at:new Date().toISOString()};
  }
  function schedule(){
    if(timer) clearTimeout(timer);
    timer = setTimeout(function(){ timer = null; run(); }, 120);
  }
  function hookFunction(name){
    try{
      var fn = window[name];
      if(typeof fn !== 'function' || fn.__baMl5OddsGuardHook) return;
      window[name] = function(){ var r = fn.apply(this, arguments); schedule(); setTimeout(schedule, 450); setTimeout(schedule, 1200); return r; };
      window[name].__baMl5OddsGuardHook = true;
    }catch(e){}
  }
  function boot(){
    ['renderML5','renderML5Tab','renderActiveTab','switchTab','renderMoreTab'].forEach(hookFunction);
    schedule();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  [500,1200,2400,4200,8000,14000].forEach(function(t){ setTimeout(boot, t); });
  try{ new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
})();
