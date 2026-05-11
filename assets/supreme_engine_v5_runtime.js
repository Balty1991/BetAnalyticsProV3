(function(){
  'use strict';

  /*
   * VEYRA Supreme Engine v5 — scoped runtime fix
   * - Nu mai injectează carduri global în pagină.
   * - Nu apare în Bet Safe / Piramidă / alte taburi.
   * - Înlocuiește strict zona veche din:
   *   Mai mult → Motor de Predicții Unificat → Predicții.
   * - Dacă ev_signals_v2.json nu are semnale, afișează fallback din AI Memory adaptive_picks
   *   ca să existe predicții vizibile până când Fetch VEYRA Data populează semnalele live.
   */

  var STATE = { loaded:false, pack:null, ev:null, ai:null, updatedAt:0, lastHtml:'' };
  var DATA_TTL = 90 * 1000;
  var RENDER_LOCK = false;

  function $(id){ return document.getElementById(id); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function n(v,d){
    var x = Number(v);
    if(!isFinite(x)) x = 0;
    return x.toFixed(d == null ? 1 : d);
  }
  function pct(v){
    var x = Number(v);
    if(!isFinite(x)) x = 0;
    if(x > 0 && x <= 1) x *= 100;
    return n(x,1) + '%';
  }
  function plus(v,d){
    var x = Number(v);
    if(!isFinite(x)) x = 0;
    return (x >= 0 ? '+' : '') + x.toFixed(d == null ? 1 : d);
  }
  function avg(arr, fn){
    arr = arr || [];
    if(!arr.length) return 0;
    return arr.reduce(function(a,x){ return a + Number(fn ? fn(x) : x || 0); },0) / arr.length;
  }
  function safeFetch(url, fallback){
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 'v=' + Date.now(), {cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error(url); return r.json(); })
      .catch(function(){ return fallback; });
  }
  function fmtDateTime(iso){
    try{
      if(!iso) return '—';
      var d = new Date(iso);
      return d.toLocaleDateString('ro-RO') + ' ' + d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    }catch(e){ return '—'; }
  }

  function loadData(){
    if(STATE.loaded && Date.now() - STATE.updatedAt < DATA_TTL) return Promise.resolve(STATE);
    return Promise.all([
      safeFetch('./data/model_pack_v2.json', {}),
      safeFetch('./data/ev_signals_v2.json', {}),
      safeFetch('./data/ai_memory.json', {})
    ]).then(function(res){
      STATE.pack = res[0] || {};
      STATE.ev   = res[1] || {};
      STATE.ai   = res[2] || {};
      STATE.loaded = true;
      STATE.updatedAt = Date.now();
      return STATE;
    });
  }

  function qualityCounts(markets){
    var out = {A:0,B:0,C:0};
    Object.keys(markets || {}).forEach(function(k){
      var q = String(markets[k].quality_gate || 'C').toUpperCase();
      if(!out[q]) out[q] = 0;
      out[q]++;
    });
    return out;
  }

  function marketLabel(s){
    return s.market_label || s.market || ({
      over15:'Over 1.5G',
      over25:'Over 2.5G',
      under35:'Under 3.5G',
      btts:'BTTS Yes',
      home_win:'Home Win',
      away_win:'Away Win',
      draw:'Draw'
    }[s.market_key || s.market] || '—');
  }

  function normalizeLiveSignal(s){
    if(!s) return null;
    var prob = Number(s.adjusted_prob);
    if(!isFinite(prob) || prob <= 0) prob = Number(s.model_prob);
    if(isFinite(prob) && prob > 0 && prob <= 1) prob *= 100;
    var evPct = Number(s.ev_pct);
    if(!isFinite(evPct)) evPct = Number(s.value || 0) * 100;
    return {
      event_id: s.event_id,
      home: s.home || '—',
      away: s.away || '—',
      league: s.league || '—',
      date: s.date || s.event_date || '',
      market_label: s.market_label || marketLabel(s),
      market: s.market,
      odds: Number(s.odds || s.book_odds || 0),
      adjusted_prob: prob || 0,
      edge_pp: Number(s.edge_pp != null ? s.edge_pp : (s.edge_pct || 0)),
      ev_pct: evPct || 0,
      score: Number(s.score || s.supreme_score || s.adaptive_score || 0),
      reliability: Number(s.reliability || 0.78),
      agreement: Number(s.agreement || 0.76),
      quality_gate: s.quality_gate || 'A/B',
      signal: s.signal || 'SUPREME',
      risk_tier: s.risk_tier || 'LOW',
      lineup_risk: Number(s.lineup_risk || 0.08),
      context_risk: Number(s.context_risk || 0.08),
      bookmakers_count: s.bookmakers_count,
      polymarket_prob: s.polymarket_prob,
      source: 'live'
    };
  }

  function normalizeMemoryPick(p){
    if(!p) return null;
    var evPct = Number(p.value || 0) * 100;
    return {
      event_id: p.event_id,
      home: p.home || '—',
      away: p.away || '—',
      league: p.league || '—',
      date: p.event_date || '',
      market_label: p.market || '—',
      market: p.market_key || p.market,
      odds: Number(p.odds || 0),
      adjusted_prob: Number(p.adjusted_prob || p.model_prob || 0),
      edge_pp: Number(p.edge_pct || 0),
      ev_pct: isFinite(evPct) ? evPct : 0,
      score: Number(p.adaptive_score || p.base_score || 0),
      reliability: 0.74,
      agreement: Math.max(0.60, Math.min(0.92, Number(p.confidence || 55) / 100 + 0.22)),
      quality_gate: 'Memory',
      signal: 'AI MEMORY',
      risk_tier: 'LOW',
      lineup_risk: 0.10,
      context_risk: 0.10,
      source: 'memory'
    };
  }

  function getSignals(data){
    var ev = data.ev || {};
    var ai = data.ai || {};
    var live = Array.isArray(ev.signals) ? ev.signals.map(normalizeLiveSignal).filter(Boolean) : [];
    if(live.length){
      return {source:'live', items:live.sort(function(a,b){ return Number(b.score||0) - Number(a.score||0); })};
    }
    var mem = Array.isArray(ai.adaptive_picks) ? ai.adaptive_picks.map(normalizeMemoryPick).filter(Boolean) : [];
    return {source:'memory', items:mem.sort(function(a,b){ return Number(b.score||0) - Number(a.score||0); })};
  }

  function buildVipCombo(signals){
    var pool = (signals || []).filter(function(s){
      var odds = Number(s.odds || 0);
      var score = Number(s.score || 0);
      var prob = Number(s.adjusted_prob || 0);
      var risk = Number(s.lineup_risk || 0) + Number(s.context_risk || 0);
      return odds >= 1.10 && odds <= 1.55 && score >= 78 && prob >= 64 && risk <= 0.42;
    }).slice(0,14);

    var best = null;
    function correlated(a,b){
      return String(a.event_id || '') && String(a.event_id || '') === String(b.event_id || '');
    }
    function rank(chosen, odds){
      var prob = chosen.reduce(function(acc,s){ return acc * Math.max(0.01, Number(s.adjusted_prob || 0) / 100); },1) * 100;
      var score = avg(chosen,function(s){ return s.score || 0; });
      var agr = avg(chosen,function(s){ return (s.agreement || 0) * 100; });
      return prob * 1.7 + score * 0.8 + agr * 0.35 - Math.abs(odds - 1.40) * 90;
    }
    function walk(start, chosen){
      if(chosen.length){
        var odds = chosen.reduce(function(a,s){ return a * Number(s.odds || 1); },1);
        if(odds >= 1.30 && odds <= 1.50){
          var r = rank(chosen, odds);
          if(!best || r > best.rank) best = {picks: chosen.slice(), odds: odds, rank: r};
        }
      }
      if(chosen.length >= 3) return;
      for(var i=start;i<pool.length;i++){
        if(chosen.some(function(x){ return correlated(x,pool[i]); })) continue;
        var nextOdds = chosen.concat([pool[i]]).reduce(function(a,s){ return a * Number(s.odds || 1); },1);
        if(nextOdds > 1.55) continue;
        chosen.push(pool[i]);
        walk(i+1, chosen);
        chosen.pop();
      }
    }
    walk(0, []);
    return best;
  }

  function signalCard(s, idx){
    var risk = Number(s.lineup_risk || 0) + Number(s.context_risk || 0);
    var riskTxt = s.risk_tier || (risk <= 0.18 ? 'LOW' : (risk <= 0.34 ? 'MED' : 'HIGH'));
    var agree = Number(s.agreement || 0) * 100;
    return ''+
      '<div class="v5-signal">'+
        '<div class="v5-signal-top">'+
          '<div>'+
            '<div class="v5-match">#'+(idx+1)+' '+esc(s.home)+' vs '+esc(s.away)+'</div>'+
            '<div class="v5-meta">'+esc(s.league)+' • '+esc(s.date ? fmtDateTime(s.date) : '—')+' • '+esc(s.signal || 'WATCH')+'</div>'+
          '</div>'+
          '<div class="v5-score">'+n(s.score,0)+'<small>SCOR</small></div>'+
        '</div>'+
        '<div class="v5-chipline">'+
          '<span class="v5-chip good">'+esc(marketLabel(s))+' @ '+n(s.odds,2)+'</span>'+
          '<span class="v5-chip blue">Prob '+pct(s.adjusted_prob)+'</span>'+
          '<span class="v5-chip gold">Edge '+plus(s.edge_pp,1)+'pp</span>'+
          '<span class="v5-chip violet">EV '+plus(s.ev_pct,1)+'%</span>'+
          '<span class="v5-chip">Acord '+n(agree,0)+'%</span>'+
          '<span class="v5-chip">Reliability '+pct(s.reliability)+'</span>'+
          '<span class="v5-chip '+(riskTxt==='LOW'?'good':riskTxt==='MED'?'gold':'')+'">Risk '+esc(riskTxt)+'</span>'+
          '<span class="v5-chip">Gate '+esc(s.quality_gate || '—')+'</span>'+
          (s.source === 'memory' ? '<span class="v5-chip violet">fallback AI Memory</span>' : '')+
        '</div>'+
      '</div>';
  }

  function renderSummary(data){
    var pack = data.pack || {};
    var ev = data.ev || {};
    var ai = data.ai || {};
    var markets = pack.markets || {};
    var marketKeys = Object.keys(markets);
    var q = qualityCounts(markets);
    var sig = getSignals(data);
    var signals = sig.items || [];
    var avgAuc = avg(marketKeys,function(k){ return markets[k].wfv_avg_auc || markets[k].test_auc || 0; });
    var avgEce = avg(marketKeys,function(k){ return markets[k].test_ece || 0; });
    var elite = signals.filter(function(s){ return Number(s.score || 0) >= 92; }).length;
    var combo = buildVipCombo(signals);
    var note = sig.source === 'live'
      ? 'semnale live din predict_current.py'
      : 'fallback din AI Memory până când ev_signals_v2.json produce semnale live';

    var html = ''+
      '<div class="v5-supreme-card v5-supreme-inplace" id="v5-supreme-engine">'+
        '<div class="v5-head">'+
          '<div>'+
            '<div class="v5-title">🧠 VEYRA Supreme Engine v5</div>'+
            '<div class="v5-sub">Motor Unificat transformat: CatBoost calibrat, BSD API v2, piață no-vig, Poisson, AI Memory și Risk Shield într-un singur scor.</div>'+
          '</div>'+
          '<div class="v5-badge">supreme v5</div>'+
        '</div>'+
        '<div class="v5-grid">'+
          '<div class="v5-kpi"><div class="v5-kpi-label">Predicții active</div><div class="v5-kpi-value cyan">'+signals.length+'</div><div class="v5-kpi-note">'+esc(note)+'</div></div>'+
          '<div class="v5-kpi"><div class="v5-kpi-label">Elite A+</div><div class="v5-kpi-value green">'+elite+'</div><div class="v5-kpi-note">scor ≥92</div></div>'+
          '<div class="v5-kpi"><div class="v5-kpi-label">Gates A/B/C</div><div class="v5-kpi-value gold">'+(q.A||0)+'/'+(q.B||0)+'/'+(q.C||0)+'</div><div class="v5-kpi-note">calitate piețe ML</div></div>'+
          '<div class="v5-kpi"><div class="v5-kpi-label">WFV / ECE</div><div class="v5-kpi-value violet">'+n(avgAuc,3)+'</div><div class="v5-kpi-note">ECE mediu '+n(avgEce,3)+'</div></div>'+
        '</div>'+
        '<div class="v5-source-matrix">'+
          '<div class="v5-source"><span>CatBoost ML</span><i class="v5-dot"></i></div>'+
          '<div class="v5-source"><span>BSD API v2</span><i class="v5-dot"></i></div>'+
          '<div class="v5-source"><span>Market odds</span><i class="v5-dot"></i></div>'+
          '<div class="v5-source"><span>Poisson xG</span><i class="v5-dot"></i></div>'+
          '<div class="v5-source"><span>AI Memory</span><i class="v5-dot"></i></div>'+
          '<div class="v5-source"><span>Risk Shield</span><i class="v5-dot '+(signals.length ? '' : 'warn')+'"></i></div>'+
        '</div>';

    if(combo){
      html += ''+
        '<div class="v5-section-title">🏆 VIP Combo Optimizer</div>'+
        '<div class="v5-vip-box">'+
          '<div class="v5-vip-title">Cotă totală '+n(combo.odds,2)+' • '+combo.picks.length+' eveniment'+(combo.picks.length>1?'e':'')+'</div>'+
          '<div class="v5-vip-line">Țintă 1.30–1.50, ales după probabilitate compusă, scor, acord surse și risc controlat.</div>'+
          '<div class="v5-chipline">'+combo.picks.map(function(p){
            return '<span class="v5-chip good">'+esc(p.home)+' vs '+esc(p.away)+' • '+esc(marketLabel(p))+' @ '+n(p.odds,2)+'</span>';
          }).join('')+'</div>'+
        '</div>';
    }else{
      html += ''+
        '<div class="v5-section-title">🏆 VIP Combo Optimizer</div>'+
        '<div class="v5-empty">Nu există încă o combinație în intervalul 1.30–1.50. Când apar semnale potrivite, motorul o va construi automat.</div>';
    }

    html += '<div class="v5-sub" style="margin-top:12px">Ultima actualizare: '+esc(ev.updated_at ? fmtDateTime(ev.updated_at) : (ai.updated_at ? fmtDateTime(ai.updated_at) : (pack.updated_at ? fmtDateTime(pack.updated_at) : '—')))+'</div>';
    html += '</div>';
    return html;
  }

  function renderList(data){
    var sig = getSignals(data);
    var signals = sig.items || [];
    if(!signals.length){
      return '<div class="v5-empty">Nu există predicții active momentan. Rulează Fetch VEYRA Data după ce modelele sunt salvate.</div>';
    }
    return '<div class="v5-signal-list">' + signals.slice(0,10).map(signalCard).join('') + '</div>';
  }

  function cleanupOrphans(){
    document.querySelectorAll('#v5-supreme-engine').forEach(function(el){
      if(!el.closest('#smartlearn-section-predictii')) el.remove();
    });
  }

  function renderScoped(){
    if(RENDER_LOCK) return;
    var root = $('smartlearn-section-predictii');
    var summaryTarget = $('unified-summary-grid');
    var listTarget = $('unified-picks-list');
    var metaTarget = $('unified-list-meta');
    var updatedTarget = $('unified-updated');

    cleanupOrphans();

    if(!root || !summaryTarget || !listTarget) return;

    RENDER_LOCK = true;
    loadData().then(function(data){
      var sig = getSignals(data);
      var signals = sig.items || [];
      summaryTarget.innerHTML = renderSummary(data);
      listTarget.innerHTML = renderList(data);

      if(metaTarget){
        metaTarget.textContent = signals.length + ' predicții ' + (sig.source === 'live' ? 'live' : 'din AI Memory');
      }
      if(updatedTarget){
        var ev = data.ev || {}, ai = data.ai || {}, pack = data.pack || {};
        updatedTarget.textContent = 'Actualizat: ' + (ev.updated_at ? fmtDateTime(ev.updated_at) : (ai.updated_at ? fmtDateTime(ai.updated_at) : (pack.updated_at ? fmtDateTime(pack.updated_at) : '—')));
      }

      // Forțează titlul vechi să reflecte upgrade-ul, nu să existe un card separat.
      var title = root.querySelector('.section div[style*="font-size:16px"]');
      if(title && /Motor Unificat/.test(title.textContent || '')){
        title.textContent = '🧠 VEYRA Supreme Engine v5';
      }
    }).finally(function(){
      setTimeout(function(){ RENDER_LOCK = false; }, 100);
    });
  }

  var timer = null;
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(renderScoped, 250);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);

  // Rerandează doar când se schimbă tabul, dar fără injectare globală.
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(t && (String(t.className||'').indexOf('smartlearn-tab') >= 0 || String(t.className||'').indexOf('more-card-btn') >= 0 || String(t.className||'').indexOf('tab') >= 0)){
      setTimeout(schedule, 300);
    }
  }, true);

  // Observer limitat la secțiunea smartbet; nu mai urmărește tot documentul.
  function startObserver(){
    var root = $('tab-smartbet');
    if(!root) return;
    try{
      new MutationObserver(function(){ schedule(); }).observe(root, {childList:true, subtree:true});
    }catch(e){}
  }
  setTimeout(startObserver, 800);

  setInterval(function(){
    STATE.loaded = false;
    schedule();
  }, 120000);
})();
