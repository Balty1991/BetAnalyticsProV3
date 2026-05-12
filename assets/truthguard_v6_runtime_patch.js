(function(){
  'use strict';
  if (window.__VEYRA_TRUTHGUARD_V6_RUNTIME__) return;
  window.__VEYRA_TRUTHGUARD_V6_RUNTIME__ = true;

  var STATE = { ev:null, ai:null, pack:null, loadedAt:0, rendering:false };
  var TTL = 90 * 1000;
  var RENDER_DELAY = 420;
  var timer = null;

  var MARKET_RULES = {
    home_win:{minProb:0.50,minEdge:3.8,minEv:0.8,odds:[1.28,3.20],label:'Home Win'},
    draw:{minProb:0.32,minEdge:6.0,minEv:1.5,odds:[2.60,4.80],label:'Draw'},
    away_win:{minProb:0.42,minEdge:4.5,minEv:1.0,odds:[1.35,3.80],label:'Away Win'},
    btts:{minProb:0.57,minEdge:4.2,minEv:0.8,odds:[1.45,2.35],label:'BTTS Yes'},
    over15:{minProb:0.73,minEdge:2.6,minEv:0.35,odds:[1.14,1.58],label:'Over 1.5G'},
    over25:{minProb:0.58,minEdge:4.0,minEv:0.8,odds:[1.50,2.45],label:'Over 2.5G'},
    under35:{minProb:0.70,minEdge:2.6,minEv:0.35,odds:[1.14,1.62],label:'Under 3.5G'}
  };

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function f(v,d){ var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
  function norm(v,lo,hi){ if(hi <= lo) return 0; return clamp((v-lo)/(hi-lo),0,1); }
  function pct(v,d){ var n=f(v); if(n > 0 && n <= 1) n *= 100; return n.toFixed(d == null ? 1 : d) + '%'; }
  function num(v,d){ return f(v).toFixed(d == null ? 1 : d); }
  function plus(v,d){ var n=f(v); return (n>=0?'+':'') + n.toFixed(d == null ? 1 : d); }

  function fetchJson(url, fallback){
    return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error(url); return r.json(); })
      .catch(function(){ return fallback; });
  }

  function loadData(){
    if(STATE.ev && Date.now() - STATE.loadedAt < TTL) return Promise.resolve(STATE);
    return Promise.all([
      fetchJson('./data/ev_signals_v2.json', {}),
      fetchJson('./data/ai_memory.json', {}),
      fetchJson('./data/model_pack_v2.json', {})
    ]).then(function(res){
      STATE.ev = res[0] || {};
      STATE.ai = res[1] || {};
      STATE.pack = res[2] || {};
      STATE.loadedAt = Date.now();
      return STATE;
    });
  }

  function marketKey(s){
    var raw = String(s.market_key || s.market || s.market_label || '').toLowerCase();
    if(raw.indexOf('over 1.5') >= 0 || raw.indexOf('over15') >= 0 || raw.indexOf('o1.5') >= 0) return 'over15';
    if(raw.indexOf('over 2.5') >= 0 || raw.indexOf('over25') >= 0 || raw.indexOf('o2.5') >= 0) return 'over25';
    if(raw.indexOf('under 3.5') >= 0 || raw.indexOf('under35') >= 0 || raw.indexOf('u3.5') >= 0) return 'under35';
    if(raw.indexOf('btts') >= 0 || raw.indexOf('both') >= 0) return 'btts';
    if(raw.indexOf('home') >= 0 || raw.indexOf('1') === 0) return 'home_win';
    if(raw.indexOf('away') >= 0 || raw.indexOf('2') === 0) return 'away_win';
    if(raw.indexOf('draw') >= 0 || raw === 'x') return 'draw';
    return raw || 'unknown';
  }

  function marketLabel(s){
    var mk = marketKey(s);
    return s.market_label || (MARKET_RULES[mk] && MARKET_RULES[mk].label) || s.market || s.market_key || '—';
  }

  function normalizeProb(v){
    var n = f(v, NaN);
    if(!isFinite(n) || n <= 0) return null;
    if(n > 1) n = n / 100;
    return clamp(n,0,1);
  }

  function collectSourceProbabilities(s){
    var keys = ['adjusted_prob','model_prob','probability','api_prob','api_probability','bsd_prob','poisson_prob','polymarket_prob','memory_prob'];
    var out = [];
    keys.forEach(function(k){
      var p = normalizeProb(s[k]);
      if(p != null && p > 0.05 && p < 0.98) out.push(p);
    });
    // Fallback: scorul vechi nu este probabilitate, dar poate ancora ușor dacă nu avem alte surse.
    if(out.length < 2){
      var oldScore = f(s.score || s.supreme_score || s.adaptive_score, 0);
      if(oldScore >= 55) out.push(clamp(oldScore / 115, 0.45, 0.88));
    }
    return out;
  }

  function std(values){
    if(!values || values.length <= 1) return 0.10;
    var m = values.reduce(function(a,b){return a+b;},0) / values.length;
    var v = values.reduce(function(a,b){ var d=b-m; return a+d*d; },0) / values.length;
    return Math.sqrt(v);
  }

  function fmtDateTime(iso){
    try{
      if(!iso) return '—';
      var d = new Date(iso);
      if(String(d) === 'Invalid Date') return String(iso).slice(0,16);
      return d.toLocaleDateString('ro-RO') + ' ' + d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    }catch(e){ return '—'; }
  }

  function evidenceQuality(s, srcCount){
    var q = String(s.quality_gate || '').toUpperCase();
    var base = q === 'A' ? 1.00 : q === 'B' ? 0.82 : q === 'C' ? 0.56 : 0.68;
    var rel = normalizeProb(s.reliability) || 0.70;
    var sourceBoost = clamp(srcCount / 4, 0.35, 1);
    return clamp(base * 0.45 + rel * 0.35 + sourceBoost * 0.20, 0, 1);
  }

  function scoreSignal(raw){
    var s = Object.assign({}, raw || {});
    var mk = marketKey(s);
    var rule = MARKET_RULES[mk] || {minProb:0.62,minEdge:4.0,minEv:0.8,odds:[1.12,3.80],label:marketLabel(s)};
    var odds = f(s.odds || s.book_odds || s.active_odds || s.best_odds, 0);
    var probs = collectSourceProbabilities(s);
    var p = normalizeProb(s.adjusted_prob) || normalizeProb(s.model_prob) || (probs.length ? probs.reduce(function(a,b){return a+b;},0)/probs.length : 0);
    var implied = odds > 1.01 ? (1 / odds) : 0;
    var edge = f(s.edge_pp, NaN);
    if(!isFinite(edge)) edge = f(s.edge_pct, NaN);
    if(!isFinite(edge)) edge = (p - implied) * 100;
    var ev = f(s.ev_pct, NaN);
    if(!isFinite(ev)) ev = odds > 1.01 ? ((p * odds) - 1) * 100 : -99;
    var kelly = f(s.kelly_pct, NaN);
    if(!isFinite(kelly) && odds > 1.01){
      var b = odds - 1;
      kelly = Math.max(0, ((p * b - (1-p)) / b) * 0.25 * 100);
    }
    var agreement = normalizeProb(s.agreement) || clamp(1 - (std(probs) / 0.14), 0.20, 0.96);
    var quality = evidenceQuality(s, probs.length);
    var risk = clamp(f(s.lineup_risk,0.10) + f(s.context_risk,0.08), 0, 0.80);
    var dispersion = f(s.odds_dispersion,0);
    if(String(s.risk_tier || '').toUpperCase() === 'HIGH') risk += 0.16;
    if(odds && (odds < rule.odds[0] || odds > rule.odds[1])) risk += 0.10;
    if(dispersion > 0.10) risk += Math.min(0.12, dispersion);
    risk = clamp(risk,0,0.80);

    var score = 0;
    score += 24 * norm(p, rule.minProb - 0.04, rule.minProb + 0.16);
    score += 18 * norm(edge, rule.minEdge - 1.5, rule.minEdge + 10);
    score += 14 * norm(ev, rule.minEv - 0.5, rule.minEv + 6.5);
    score += 14 * agreement;
    score += 12 * quality;
    score += 8 * clamp((normalizeProb(s.reliability) || 0.70),0,1);
    score += 5 * norm(kelly, 0.20, 2.80);
    score += 5 * norm(f(s.score || s.supreme_score || s.adaptive_score,70), 72, 92);
    score -= 22 * risk;
    score = clamp(score, 0, 100);

    var blocks = [];
    if(!odds || odds <= 1.01) blocks.push('fără cotă validă');
    if(p < rule.minProb) blocks.push('probabilitate sub prag');
    if(edge < rule.minEdge) blocks.push('edge insuficient');
    if(ev < rule.minEv) blocks.push('EV insuficient');
    if(agreement < 0.58) blocks.push('consens slab între surse');
    if(quality < 0.52) blocks.push('calitate date slabă');
    if(risk > 0.42) blocks.push('risc contextual ridicat');
    if(odds && (odds < rule.odds[0] || odds > rule.odds[1])) blocks.push('cotă în afara ferestrei safe');

    var strict = blocks.length === 0 && score >= 82;
    var action = strict ? 'PAREAZĂ' : (score >= 74 && blocks.length <= 2 ? 'RISC CONTROLAT' : 'EVITĂ');
    var tier = score >= 92 && strict ? 'A+' : score >= 86 && strict ? 'A' : score >= 78 ? 'B' : 'C';

    s.market_key = mk;
    s.market_label = marketLabel(s);
    s.odds = odds;
    s.truth_prob = p;
    s.truth_edge = edge;
    s.truth_ev = ev;
    s.truth_score = Math.round(score * 10) / 10;
    s.truth_agreement = agreement;
    s.truth_quality = quality;
    s.truth_risk = risk;
    s.truth_tier = tier;
    s.truth_action = action;
    s.truth_strict = strict;
    s.truth_blocks = blocks;
    s.truth_sources = probs.length;
    return s;
  }

  function rawSignals(ev, ai){
    if(ev && ev.truthguard_v6 && Array.isArray(ev.truthguard_v6.signals)) return ev.truthguard_v6.signals;
    if(ev && Array.isArray(ev.truthguard_signals)) return ev.truthguard_signals;
    if(ev && Array.isArray(ev.signals)) return ev.signals;
    if(ai && Array.isArray(ai.adaptive_picks)) return ai.adaptive_picks;
    return [];
  }

  function prepareSignals(data){
    var list = rawSignals(data.ev || {}, data.ai || {})
      .map(scoreSignal)
      .sort(function(a,b){ return f(b.truth_score) - f(a.truth_score); });
    var finalList = list.filter(function(s){ return s.truth_action !== 'EVITĂ'; });
    // Motorul de acuratețe nu trebuie să arunce 32 de pick-uri brute: păstrează doar semnalele cu calitate reală.
    var strict = list.filter(function(s){ return s.truth_strict; });
    if(strict.length) finalList = strict.concat(finalList.filter(function(s){ return !s.truth_strict; })).slice(0,12);
    else finalList = finalList.slice(0,8);
    return { all:list, finalList:finalList };
  }

  function signalCard(s, idx){
    var cls = s.truth_strict ? 'tg6-card tg6-card-good' : (s.truth_action === 'RISC CONTROLAT' ? 'tg6-card tg6-card-watch' : 'tg6-card');
    var blocks = (s.truth_blocks || []).slice(0,3).map(esc).join(' • ');
    return ''+
      '<div class="'+cls+'">'+
        '<div class="tg6-top">'+
          '<div class="tg6-match-wrap">'+
            '<div class="tg6-match">#'+(idx+1)+' '+esc(s.home || '—')+' vs '+esc(s.away || '—')+'</div>'+
            '<div class="tg6-meta">'+esc(s.league || '—')+' • '+esc(fmtDateTime(s.date || s.event_date))+'</div>'+
          '</div>'+
          '<div class="tg6-score">'+num(s.truth_score,0)+'<small>'+esc(s.truth_tier)+'</small></div>'+
        '</div>'+
        '<div class="tg6-chipline">'+
          '<span class="tg6-chip tg6-primary">'+esc(s.market_label)+' @ '+num(s.odds,2)+'</span>'+
          '<span class="tg6-chip">Prob '+pct(s.truth_prob)+'</span>'+
          '<span class="tg6-chip">Edge '+plus(s.truth_edge,1)+'pp</span>'+
          '<span class="tg6-chip">EV '+plus(s.truth_ev,1)+'%</span>'+
          '<span class="tg6-chip">Consens '+pct(s.truth_agreement,0)+'</span>'+
          '<span class="tg6-chip">Surse '+esc(s.truth_sources)+'</span>'+
          '<span class="tg6-chip '+(s.truth_risk<=0.22?'tg6-good':s.truth_risk<=0.42?'tg6-warn':'tg6-bad')+'">Risk '+pct(s.truth_risk,0)+'</span>'+
          '<span class="tg6-chip '+(s.truth_action==='PAREAZĂ'?'tg6-good':s.truth_action==='RISC CONTROLAT'?'tg6-warn':'tg6-bad')+'">'+esc(s.truth_action)+'</span>'+
        '</div>'+
        (blocks ? '<div class="tg6-reason">Blocaje: '+blocks+'</div>' : '<div class="tg6-reason tg6-ok">Validat strict: probabilitate + edge + EV + consens + risc trecute prin TruthGuard.</div>')+
      '</div>';
  }

  function avg(arr, fn){ if(!arr.length) return 0; return arr.reduce(function(a,x){ return a + f(fn(x)); },0) / arr.length; }

  function renderSummary(data, prepared){
    var list = prepared.all;
    var finalList = prepared.finalList;
    var strict = list.filter(function(s){ return s.truth_strict; });
    var elite = strict.filter(function(s){ return s.truth_score >= 92; });
    var avoided = list.filter(function(s){ return s.truth_action === 'EVITĂ'; });
    var avgConsensus = avg(finalList.length ? finalList : list, function(s){ return s.truth_agreement * 100; });
    var updated = (data.ev && (data.ev.updated_at || data.ev.generated_at)) || (data.ai && data.ai.updated_at) || '';

    return ''+
      '<div class="tg6-shell" id="veyra-truthguard-v6">'+
        '<div class="tg6-head">'+
          '<div>'+ 
            '<div class="tg6-title">🧠 VEYRA TruthGuard Engine v6</div>'+ 
            '<div class="tg6-sub">Precision Governor peste Supreme v5: consens multi-sursă, EV real, risc lineup/context, piață și memorie AI. Afișează doar ce trece filtrele stricte.</div>'+ 
          '</div>'+ 
          '<div class="tg6-badge">truthguard v6</div>'+ 
        '</div>'+ 
        '<div class="tg6-kpis">'+
          '<div class="tg6-kpi"><b>'+finalList.length+'</b><span>final picks</span><small>din '+list.length+' brute</small></div>'+ 
          '<div class="tg6-kpi"><b>'+elite.length+'</b><span>Elite A+</span><small>scor ≥92</small></div>'+ 
          '<div class="tg6-kpi"><b>'+avoided.length+'</b><span>evitate</span><small>capcane filtrate</small></div>'+ 
          '<div class="tg6-kpi"><b>'+num(avgConsensus,0)+'%</b><span>consens</span><small>medie surse</small></div>'+ 
        '</div>'+ 
        '<div class="tg6-matrix">'+
          '<span>CatBoost calibrat</span><span>BSD API v2</span><span>No-vig market</span><span>Poisson/xG</span><span>AI Memory</span><span>Risk Shield</span>'+ 
        '</div>'+ 
        '<div class="tg6-updated">Actualizat: '+esc(fmtDateTime(updated))+'</div>'+ 
      '</div>';
  }

  function updateMoreMenu(prepared){
    document.querySelectorAll('.more-card-btn').forEach(function(btn){
      var title = btn.querySelector('.more-card-title');
      var sub = btn.querySelector('.more-card-sub');
      var text = title ? String(title.textContent || '') : '';
      if(text.indexOf('Motor de Predicții Unificat') >= 0 || text.indexOf('VEYRA Supreme') >= 0 || text.indexOf('TruthGuard') >= 0){
        if(title) title.textContent = '🧠 VEYRA TruthGuard Engine v6';
        if(sub) sub.innerHTML = '<span style="color:var(--acc);font-weight:900">'+prepared.finalList.length+' final picks</span> • '+prepared.all.length+' brute scanate • '+prepared.all.filter(function(s){return s.truth_action==='EVITĂ';}).length+' evitate';
      }
    });
  }

  function injectCss(){
    if($('veyra-truthguard-v6-css')) return;
    var css = document.createElement('style');
    css.id = 'veyra-truthguard-v6-css';
    css.textContent = ''+
      '.tg6-shell{position:relative;border:1px solid rgba(43,229,197,.24);border-radius:22px;padding:16px;background:radial-gradient(circle at 10% 0,rgba(43,229,197,.16),transparent 34%),linear-gradient(145deg,rgba(7,12,23,.96),rgba(11,17,31,.92));box-shadow:0 0 0 1px rgba(255,255,255,.035) inset,0 20px 60px rgba(0,0,0,.28);overflow:hidden}'+
      '.tg6-shell:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#2BE5C5,#F6C960,#8B5CF6)}'+
      '.tg6-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.tg6-title{font-size:20px;line-height:1.05;font-weight:950;color:#fff;letter-spacing:-.04em}.tg6-sub{margin-top:8px;font-size:12px;line-height:1.45;color:#A7B4CA}.tg6-badge{flex:0 0 auto;border:1px solid rgba(43,229,197,.35);border-radius:999px;padding:8px 10px;color:#7FFFE8;background:rgba(43,229,197,.10);font-size:11px;font-weight:900;text-transform:uppercase}.tg6-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.tg6-kpi{border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(6,10,20,.72);padding:12px}.tg6-kpi b{display:block;color:#47FFD8;font-size:26px;line-height:1;font-weight:950}.tg6-kpi span{display:block;color:#EEF4FF;font-size:11px;font-weight:900;text-transform:uppercase;margin-top:8px}.tg6-kpi small{display:block;color:#8B98AF;font-size:11px;margin-top:4px}.tg6-matrix{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.tg6-matrix span{border:1px solid rgba(43,229,197,.12);border-radius:999px;padding:8px 10px;background:rgba(255,255,255,.035);font-size:11px;color:#B9C5D8;font-weight:800}.tg6-updated{margin-top:12px;color:#7D8CA6;font:10px var(--mono,monospace)}'+
      '.tg6-list{display:grid;gap:10px}.tg6-card{border:1px solid rgba(255,255,255,.09);border-radius:18px;background:linear-gradient(145deg,rgba(10,16,29,.96),rgba(8,12,23,.92));padding:12px;box-shadow:0 12px 36px rgba(0,0,0,.20)}.tg6-card-good{border-color:rgba(43,229,197,.28)}.tg6-card-watch{border-color:rgba(246,201,96,.28)}.tg6-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tg6-match{font-size:14px;font-weight:950;color:#fff;line-height:1.2}.tg6-meta{font-size:10px;color:#8592A9;margin-top:4px}.tg6-score{min-width:54px;text-align:center;color:#46FFD7;font-size:25px;line-height:1;font-weight:950}.tg6-score small{display:block;color:#F6C960;font-size:10px;margin-top:3px}.tg6-chipline{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.tg6-chip{border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:6px 8px;background:rgba(255,255,255,.035);font-size:10px;color:#BFD0E7;font-weight:800}.tg6-primary{color:#7FFFE8;border-color:rgba(43,229,197,.25);background:rgba(43,229,197,.08)}.tg6-good{color:#63F596}.tg6-warn{color:#F6C960}.tg6-bad{color:#FF7D7D}.tg6-reason{margin-top:9px;font-size:10px;color:#8B98AF;line-height:1.35}.tg6-ok{color:#7FFFE8}.tg6-empty{border:1px dashed rgba(255,255,255,.12);border-radius:16px;padding:18px;text-align:center;color:#94A3B8;font-size:12px;background:rgba(255,255,255,.025)}';
    document.head.appendChild(css);
  }

  function render(){
    if(STATE.rendering) return;
    var root = $('smartlearn-section-predictii');
    var summary = $('unified-summary-grid');
    var list = $('unified-picks-list');
    var meta = $('unified-list-meta');
    var updated = $('unified-updated');
    if(!root || !summary || !list) return;
    STATE.rendering = true;
    injectCss();
    loadData().then(function(data){
      var prepared = prepareSignals(data);
      summary.innerHTML = renderSummary(data, prepared);
      if(prepared.finalList.length){
        list.innerHTML = '<div class="tg6-list">' + prepared.finalList.map(signalCard).join('') + '</div>';
      }else{
        list.innerHTML = '<div class="tg6-empty">TruthGuard v6 nu a găsit încă semnale suficient de curate. Asta este intenționat: când datele nu trec probabilitate + edge + EV + risc, motorul preferă să nu recomande.</div>';
      }
      if(meta) meta.textContent = prepared.finalList.length + ' finale validate • ' + prepared.all.length + ' scanate';
      if(updated) updated.textContent = 'Actualizat: ' + fmtDateTime((data.ev && data.ev.updated_at) || (data.ai && data.ai.updated_at) || '');
      var title = root.querySelector('.section div[style*="font-size:16px"]');
      if(title) title.textContent = '🧠 VEYRA TruthGuard Engine v6';
      updateMoreMenu(prepared);
    }).finally(function(){
      setTimeout(function(){ STATE.rendering = false; }, 140);
    });
  }

  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(render, RENDER_DELAY);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  document.addEventListener('click', function(ev){
    var c = String((ev.target && ev.target.className) || '');
    if(c.indexOf('smartlearn-tab') >= 0 || c.indexOf('more-card-btn') >= 0 || c.indexOf('tab') >= 0) setTimeout(schedule, 350);
  }, true);

  try{
    var obsTimer = setInterval(function(){
      var target = $('tab-smartbet');
      if(!target) return;
      clearInterval(obsTimer);
      new MutationObserver(function(){ schedule(); }).observe(target, {childList:true,subtree:true});
    }, 500);
  }catch(e){}

  setInterval(function(){ STATE.ev = null; schedule(); }, 120000);
})();
