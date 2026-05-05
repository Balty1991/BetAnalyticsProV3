// BetAnalytics Pro - Meciuri filter repair runtime
// Fixes advanced filter controls and applies a safe DOM-level filter fallback.
(function(){
  'use strict';
  if(window.__baMeciuriFilterRepairV1) return;
  window.__baMeciuriFilterRepairV1 = true;

  var G = (typeof globalThis !== 'undefined') ? globalThis : window;
  var raf = 0;

  function norm(s){
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ')
      .trim();
  }
  function tab(){ return document.getElementById('tab-meciuri'); }
  function addCss(){
    if(document.getElementById('ba-meciuri-filter-repair-css')) return;
    var s = document.createElement('style');
    s.id = 'ba-meciuri-filter-repair-css';
    s.textContent = '.ba-filter-hidden{display:none!important}.ba-filter-repaired select,.ba-filter-repaired input{touch-action:manipulation!important;pointer-events:auto!important}';
    document.head.appendChild(s);
  }
  function opt(select, value, label){
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.appendChild(o);
  }
  function getLabelText(el){
    var bits = [];
    if(el.id){
      var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if(lab) bits.push(lab.textContent || '');
    }
    var p = el.parentElement;
    for(var i=0; p && i<3; i++, p=p.parentElement){
      var direct = [];
      Array.prototype.forEach.call(p.childNodes || [], function(n){
        if(n.nodeType === 3) direct.push(n.textContent || '');
        else if(n !== el && n.nodeType === 1 && /^(label|span|div|small)$/i.test(n.tagName || '')) direct.push(n.textContent || '');
      });
      bits.push(direct.join(' '));
    }
    return norm(bits.join(' '));
  }
  function fieldFor(el){
    if(el.__baFilterField) return el.__baFilterField;
    var txt = getLabelText(el);
    var idc = norm((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || ''));
    var all = txt + ' ' + idc;
    var f = '';
    if(all.indexOf('toate ligile') >= 0 || /\bliga\b/.test(all)) f = 'league';
    else if(all.indexOf('perioada') >= 0 || all.indexOf('data') >= 0) f = 'period';
    else if(all.indexOf('piata') >= 0 || all.indexOf('market') >= 0) f = 'market';
    else if(all.indexOf('filtru pro') >= 0 || all.indexOf('verdict') >= 0) f = 'verdict';
    else if(all.indexOf('min prob') >= 0 || all.indexOf('prob') >= 0) f = 'minProb';
    else if(all.indexOf('min edge') >= 0 || /\bedge\b/.test(all)) f = 'minEdge';
    else if(all.indexOf('kickoff') >= 0 || all.indexOf('oricand') >= 0) f = 'kickoff';
    else if(all.indexOf('liga confidence') >= 0 || all.indexOf('confidence') >= 0) f = 'confidence';
    else if(all.indexOf('smart score') >= 0) f = 'smartScore';
    el.__baFilterField = f;
    return f;
  }
  function clearOptions(sel){ while(sel.options && sel.options.length) sel.remove(0); }
  function uniqueLeagues(){
    var out = [], seen = {};
    (Array.isArray(G.ALL_MATCHES) ? G.ALL_MATCHES : []).forEach(function(m){
      var v = String((m && (m.league || m.leagueName || m.competition)) || '').trim();
      if(!v) return;
      var k = norm(v);
      if(seen[k]) return;
      seen[k] = true;
      out.push(v);
    });
    out.sort(function(a,b){ return a.localeCompare(b, 'ro'); });
    return out;
  }
  function hydrateSelect(sel){
    if(!sel || sel.__baHydrated) return;
    var f = fieldFor(sel);
    if(!f) return;
    var current = sel.value;
    var labels = Array.prototype.map.call(sel.options || [], function(o){ return norm(o.textContent || o.value); });
    var weak = !labels.length || (labels.length === 1 && /^(toate|toate ligile|toate pietele|oricand|verdict|ora)$/.test(labels[0] || ''));
    if(!weak){ sel.__baHydrated = true; return; }
    clearOptions(sel);
    if(f === 'league'){
      opt(sel, '', 'Toate Ligile');
      uniqueLeagues().forEach(function(v){ opt(sel, v, v); });
    }else if(f === 'period'){
      opt(sel, '', 'Toate'); opt(sel, 'today', 'Azi'); opt(sel, '24h', 'Următoarele 24h'); opt(sel, '48h', 'Următoarele 48h'); opt(sel, '7d', '7 zile');
    }else if(f === 'market'){
      opt(sel, '', 'Toate piețele'); opt(sel, 'over15', 'O1.5'); opt(sel, 'over25', 'O2.5'); opt(sel, 'btts', 'BTTS'); opt(sel, 'under35', 'U3.5'); opt(sel, 'value', 'Value');
    }else if(f === 'verdict'){
      opt(sel, '', 'Toate'); opt(sel, 'pariaza', '✅ Pariază'); opt(sel, 'risc', '⚠️ Risc'); opt(sel, 'evita', '❌ Evită');
    }else if(f === 'kickoff'){
      opt(sel, '', 'Oricând'); opt(sel, '2h', 'Max 2h'); opt(sel, '6h', 'Max 6h'); opt(sel, '12h', 'Max 12h'); opt(sel, '24h', 'Max 24h'); opt(sel, '48h', 'Max 48h');
    }else if(f === 'confidence'){
      opt(sel, '', 'Toate'); opt(sel, 'high', 'Ridicată'); opt(sel, 'medium', 'Medie'); opt(sel, 'low', 'Scăzută');
    }
    if(current && Array.prototype.some.call(sel.options, function(o){ return o.value === current; })) sel.value = current;
    sel.__baHydrated = true;
  }
  function valueIsEmpty(v){
    var x = norm(v);
    return !x || /^(toate|toate ligile|toate pietele|oricand|verdict|ora)$/.test(x);
  }
  function controls(){
    var root = tab();
    if(!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll('select,input'));
  }
  function state(){
    var st = {};
    controls().forEach(function(el){
      var f = fieldFor(el);
      if(!f) return;
      var v = (el.type === 'number' || el.tagName === 'INPUT') ? el.value : el.value;
      if(valueIsEmpty(v)) return;
      if((f === 'minProb' || f === 'minEdge' || f === 'smartScore') && Number(v || 0) <= 0) return;
      st[f] = v;
    });
    return st;
  }
  function hasActive(st){ return Object.keys(st || {}).length > 0; }
  function cards(){
    var root = tab();
    if(!root) return [];
    var list = Array.prototype.slice.call(root.querySelectorAll('.match-card,.match-card-pro,.meci-card,[data-match-id]'));
    if(list.length) return list;
    return Array.prototype.slice.call(root.querySelectorAll('div')).filter(function(el){
      var t = norm(el.textContent || '');
      return t.indexOf('recomandare') >= 0 && t.indexOf('detalii analiza') >= 0;
    }).filter(function(el){
      return !el.parentElement || norm(el.parentElement.textContent || '').indexOf('recomandare') < 0 || (el.parentElement.textContent || '').length > (el.textContent || '').length + 800;
    });
  }
  function numberAfter(text, label){
    var re = new RegExp(label + '[^0-9+\-]{0,20}([+\-]?\\d+(?:[.,]\\d+)?)', 'i');
    var m = String(text || '').match(re);
    return m ? Number(String(m[1]).replace(',', '.')) : null;
  }
  function kickoffHours(text){
    var s = norm(text);
    if(s.indexOf('in curs') >= 0 || s.indexOf('aproape de start') >= 0) return 0;
    var m = s.match(/\bin\s*(\d+)\s*h/);
    if(m) return Number(m[1]);
    m = s.match(/\bin\s*(\d+)\s*z/);
    if(m) return Number(m[1]) * 24;
    m = s.match(/\bin\s*(\d+)\s*m/);
    if(m) return Number(m[1]) / 60;
    return null;
  }
  function marketOk(text, wanted){
    var t = norm(text), w = norm(wanted);
    if(!w) return true;
    if(w.indexOf('over15') >= 0 || w.indexOf('o1.5') >= 0) return /\b(over|peste|o)\s*1[.,]5/.test(t);
    if(w.indexOf('over25') >= 0 || w.indexOf('o2.5') >= 0) return /\b(over|peste|o)\s*2[.,]5/.test(t);
    if(w.indexOf('btts') >= 0) return t.indexOf('btts') >= 0;
    if(w.indexOf('under35') >= 0 || w.indexOf('u3.5') >= 0) return /\b(under|sub|u)\s*3[.,]5/.test(t);
    if(w.indexOf('value') >= 0) return t.indexOf('value') >= 0;
    return t.indexOf(w) >= 0;
  }
  function verdictOk(text, wanted){
    var t = norm(text), w = norm(wanted);
    if(!w) return true;
    if(w.indexOf('pariaza') >= 0) return t.indexOf('pariaza') >= 0 || t.indexOf('eligible') >= 0;
    if(w.indexOf('risc') >= 0) return t.indexOf('risc') >= 0;
    if(w.indexOf('evita') >= 0) return t.indexOf('evita') >= 0;
    return true;
  }
  function cardPass(card, st){
    var text = card.textContent || '';
    var t = norm(text);
    if(st.league && t.indexOf(norm(st.league)) < 0) return false;
    if(st.market && !marketOk(text, st.market)) return false;
    if(st.verdict && !verdictOk(text, st.verdict)) return false;
    if(st.minProb){ var p = numberAfter(text, 'prob'); if(p != null && p < Number(st.minProb)) return false; }
    if(st.minEdge){ var e = numberAfter(text, 'edge'); if(e != null && e < Number(st.minEdge)) return false; }
    if(st.smartScore){ var ss = numberAfter(text, 'smart\s*score'); if(ss != null && ss < Number(st.smartScore)) return false; }
    if(st.kickoff){ var kh = kickoffHours(text), mx = Number(String(st.kickoff).replace(/[^0-9.]/g,'')); if(mx && kh != null && kh > mx) return false; }
    if(st.period){
      var per = norm(st.period), kh2 = kickoffHours(text);
      if(per === 'today'){
        // If the visible card says tomorrow / Joi / Mie etc., do not keep it.
        if(/\b(maine|mie|joi|vin|sam|dum)\b/.test(t)) return false;
      }else if(per === '24h' && kh2 != null && kh2 > 24) return false;
      else if(per === '48h' && kh2 != null && kh2 > 48) return false;
      else if(per === '7d' && kh2 != null && kh2 > 168) return false;
    }
    return true;
  }
  function updateCount(visible){
    var root = tab();
    if(!root) return;
    var targets = Array.prototype.slice.call(root.querySelectorAll('button,span,div')).filter(function(el){
      var txt = (el.textContent || '').trim();
      return /^\d+\s+meciuri$/i.test(txt);
    });
    if(!targets.length) return;
    targets.sort(function(a,b){ return (a.textContent || '').length - (b.textContent || '').length; });
    targets[0].textContent = visible + ' meciuri';
  }
  function applyDomFilter(){
    addCss();
    controls().forEach(function(el){ hydrateSelect(el); });
    var st = state();
    var list = cards();
    if(!list.length) return;
    var active = hasActive(st), visible = 0;
    list.forEach(function(card){
      var ok = !active || cardPass(card, st);
      card.classList.toggle('ba-filter-hidden', !ok);
      if(ok) visible++;
    });
    if(active) updateCount(visible);
  }
  function scheduleApply(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      setTimeout(applyDomFilter, 40);
    });
  }
  function installListeners(){
    var root = tab();
    if(!root || root.__baFilterRepairInstalled) return;
    root.__baFilterRepairInstalled = true;
    root.classList.add('ba-filter-repaired');
    root.addEventListener('change', function(ev){
      var el = ev.target;
      if(!el || !/^(SELECT|INPUT)$/i.test(el.tagName || '')) return;
      setTimeout(function(){
        try{ if(typeof G.renderMatches === 'function') G.renderMatches(); }catch(e){}
        scheduleApply();
      }, 30);
    }, true);
    root.addEventListener('input', function(ev){
      var el = ev.target;
      if(!el || !/^(INPUT)$/i.test(el.tagName || '')) return;
      scheduleApply();
    }, true);
    root.addEventListener('click', function(){ setTimeout(scheduleApply, 120); }, true);
  }
  function boot(){
    addCss();
    installListeners();
    controls().forEach(hydrateSelect);
    scheduleApply();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  [100,300,800,1600,3000,6000].forEach(function(t){ setTimeout(boot, t); });
  try{ new MutationObserver(function(){ setTimeout(boot, 30); }).observe(document.documentElement, {childList:true, subtree:true}); }catch(e){}
})();
