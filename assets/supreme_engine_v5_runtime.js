(function(){
  'use strict';
  var STATE = {loaded:false, pack:null, ev:null, ai:null, updatedAt:0};
  var DATA_TTL = 90 * 1000;
  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function num(v,d){ var n=Number(v||0); return isFinite(n)?n.toFixed(d==null?1:d):'0'; }
  function pct(v){ var n=Number(v||0); if(n<=1 && n>0) n*=100; return num(n,1)+'%'; }
  function plus(v,d){ var n=Number(v||0); return (n>=0?'+':'')+n.toFixed(d==null?1:d); }
  function safeFetch(url, fallback){ return fetch(url + (url.indexOf('?')>-1?'&':'?') + 'v=' + Date.now(), {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(url); return r.json(); }).catch(function(){ return fallback; }); }
  function loadData(){
    if(STATE.loaded && Date.now()-STATE.updatedAt < DATA_TTL) return Promise.resolve(STATE);
    return Promise.all([
      safeFetch('./data/model_pack_v2.json', {}),
      safeFetch('./data/ev_signals_v2.json', {}),
      safeFetch('./data/ai_memory.json', {})
    ]).then(function(res){ STATE.pack=res[0]||{}; STATE.ev=res[1]||{}; STATE.ai=res[2]||{}; STATE.loaded=true; STATE.updatedAt=Date.now(); return STATE; });
  }
  function avg(arr, fn){ arr=arr||[]; if(!arr.length) return 0; return arr.reduce(function(a,x){return a+Number(fn?fn(x):x||0);},0)/arr.length; }
  function fmtDateTime(iso){ try{ var d=new Date(iso); return d.toLocaleDateString('ro-RO')+' '+d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return '—'; } }
  function marketLabel(s){ return s.market_label || ({over15:'Over 1.5G',over25:'Over 2.5G',under35:'Under 3.5G',btts:'BTTS Yes',home_win:'Home Win',away_win:'Away Win',draw:'Draw'}[s.market]||s.market||'—'); }
  function qualityCounts(markets){ var out={A:0,B:0,C:0}; Object.keys(markets||{}).forEach(function(k){ var q=String(markets[k].quality_gate||'C').toUpperCase(); out[q]=(out[q]||0)+1; }); return out; }
  function buildVipCombo(signals){
    var pool=(signals||[]).filter(function(s){
      var odds=Number(s.odds||0), score=Number(s.score||0), prob=Number(s.adjusted_prob || s.final_prob*100 || 0);
      var risk=Number(s.lineup_risk||0)+Number(s.context_risk||0);
      var q=String(s.quality_gate||'').toUpperCase();
      return odds>=1.10 && odds<=1.55 && score>=68 && prob>=60 && risk<=0.36 && (q==='A'||q==='B'||!q);
    }).sort(function(a,b){ return Number(b.score||0)-Number(a.score||0); }).slice(0,12);
    var best=null;
    function correlated(a,b){ return String(a.event_id||'') && String(a.event_id||'')===String(b.event_id||''); }
    function rank(chosen, odds){
      var prob=chosen.reduce(function(acc,s){ return acc*(Number(s.adjusted_prob||0)/100 || Number(s.final_prob||0) || .55); },1)*100;
      var score=avg(chosen,function(s){return s.score||0;});
      var agr=avg(chosen,function(s){return (s.agreement||0)*100;});
      return prob*1.6 + score*.8 + agr*.35 - Math.abs(odds-1.40)*80;
    }
    function walk(start, chosen){
      if(chosen.length){
        var odds=chosen.reduce(function(a,s){ return a*Number(s.odds||1); },1);
        if(odds>=1.30 && odds<=1.50){ var r=rank(chosen, odds); if(!best || r>best.rank) best={picks:chosen.slice(), odds:odds, rank:r}; }
      }
      if(chosen.length>=3) return;
      for(var i=start;i<pool.length;i++){
        if(chosen.some(function(x){return correlated(x,pool[i]);})) continue;
        var nextOdds=chosen.concat([pool[i]]).reduce(function(a,s){ return a*Number(s.odds||1); },1);
        if(nextOdds>1.55) continue;
        chosen.push(pool[i]); walk(i+1, chosen); chosen.pop();
      }
    }
    walk(0, []); return best;
  }
  function signalCard(s, idx){
    var risk=Number(s.lineup_risk||0)+Number(s.context_risk||0);
    var riskTxt = risk<=0.16?'LOW':(risk<=0.32?'MED':'HIGH');
    var agree = Number(s.agreement||0)*100;
    return '<div class="v5-signal">'+
      '<div class="v5-signal-top"><div><div class="v5-match">#'+(idx+1)+' '+esc(s.home||'—')+' vs '+esc(s.away||'—')+'</div><div class="v5-meta">'+esc(s.league||'—')+' • '+esc(s.date||'—')+' • '+esc(s.signal||'WATCH')+'</div></div><div class="v5-score">'+num(s.score,0)+'<small>SCOR</small></div></div>'+
      '<div class="v5-chipline">'+
      '<span class="v5-chip good">'+esc(marketLabel(s))+' @ '+num(s.odds,2)+'</span>'+
      '<span class="v5-chip blue">Prob '+pct(s.adjusted_prob||s.final_prob)+'</span>'+
      '<span class="v5-chip gold">Edge '+plus(s.edge_pp,1)+'pp</span>'+
      '<span class="v5-chip violet">EV '+plus(s.ev_pct,1)+'%</span>'+
      '<span class="v5-chip">Acord '+num(agree,0)+'%</span>'+
      '<span class="v5-chip">Reliability '+pct(s.reliability)+'</span>'+
      '<span class="v5-chip '+(riskTxt==='LOW'?'good':riskTxt==='MED'?'gold':'')+'">Risk '+riskTxt+'</span>'+
      '<span class="v5-chip">Gate '+esc(s.quality_gate||'—')+'</span>'+
      (s.polymarket_prob ? '<span class="v5-chip">Polymarket '+pct(s.polymarket_prob)+'</span>' : '')+
      (s.bookmakers_count ? '<span class="v5-chip">'+esc(s.bookmakers_count)+' bookies</span>' : '')+
      '</div></div>';
  }
  function renderHtml(data){
    var pack=data.pack||{}, ev=data.ev||{}, ai=data.ai||{};
    var markets=pack.markets||{}, signals=(ev.signals||[]).slice().sort(function(a,b){return Number(b.score||0)-Number(a.score||0);});
    var q=qualityCounts(markets), marketKeys=Object.keys(markets), avgAuc=avg(marketKeys,function(k){return markets[k].wfv_avg_auc||markets[k].test_auc||0;});
    var avgEce=avg(marketKeys,function(k){return markets[k].test_ece||0;});
    var summary=ev.supreme_summary||{};
    var elite=summary.elite_count!=null?summary.elite_count:signals.filter(function(s){return Number(s.score||0)>=82;}).length;
    var combo=buildVipCombo(signals);
    var top=signals.slice(0,5);
    var version=ev.display_name || 'VEYRA Supreme Engine v5';
    var engine=ev.engine_version || pack.version || 'standby';
    var html='<div class="v5-supreme-card" id="v5-supreme-engine">'+
      '<div class="v5-head"><div><div class="v5-title">🧠 '+esc(version)+'</div><div class="v5-sub">Cockpit multi-source: CatBoost calibrat, BSD API v2, piață no-vig, odds comparison, Poisson, Polymarket, AI Memory și Risk Shield.</div></div><div class="v5-badge">'+esc(engine).replace(/-/g,' ')+'</div></div>'+
      '<div class="v5-grid">'+
        '<div class="v5-kpi"><div class="v5-kpi-label">Semnale v5</div><div class="v5-kpi-value cyan">'+Number(ev.signals_count||signals.length||0)+'</div><div class="v5-kpi-note">din predict_current.py</div></div>'+
        '<div class="v5-kpi"><div class="v5-kpi-label">Elite A+</div><div class="v5-kpi-value green">'+elite+'</div><div class="v5-kpi-note">scor ≥82</div></div>'+
        '<div class="v5-kpi"><div class="v5-kpi-label">Gates A/B/C</div><div class="v5-kpi-value gold">'+(q.A||0)+'/'+(q.B||0)+'/'+(q.C||0)+'</div><div class="v5-kpi-note">calitate piețe</div></div>'+
        '<div class="v5-kpi"><div class="v5-kpi-label">WFV / ECE</div><div class="v5-kpi-value violet">'+num(avgAuc,3)+'</div><div class="v5-kpi-note">ECE mediu '+num(avgEce,3)+'</div></div>'+
      '</div>'+
      '<div class="v5-source-matrix">'+
        '<div class="v5-source"><span>CatBoost ML</span><i class="v5-dot"></i></div><div class="v5-source"><span>BSD API v2</span><i class="v5-dot"></i></div><div class="v5-source"><span>Market odds</span><i class="v5-dot"></i></div><div class="v5-source"><span>Poisson xG</span><i class="v5-dot"></i></div><div class="v5-source"><span>Polymarket</span><i class="v5-dot warn"></i></div><div class="v5-source"><span>AI Memory</span><i class="v5-dot"></i></div><div class="v5-source"><span>Lineup shield</span><i class="v5-dot warn"></i></div><div class="v5-source"><span>Context shield</span><i class="v5-dot warn"></i></div>'+
      '</div>';
    if(combo){
      html += '<div class="v5-section-title">🏆 VIP Combo Optimizer</div><div class="v5-vip-box"><div class="v5-vip-title">Cotă totală '+num(combo.odds,2)+' • '+combo.picks.length+' eveniment'+(combo.picks.length>1?'e':'')+'</div><div class="v5-vip-line">Țintă 1.30–1.50, ales după probabilitate compusă, scor, acord surse și risc controlat.</div><div class="v5-chipline">'+combo.picks.map(function(p){return '<span class="v5-chip good">'+esc(p.home)+' vs '+esc(p.away)+' • '+esc(marketLabel(p))+' @ '+num(p.odds,2)+'</span>';}).join('')+'</div></div>';
    } else {
      html += '<div class="v5-section-title">🏆 VIP Combo Optimizer</div><div class="v5-empty">Nu există încă o combinație v5 în intervalul 1.30–1.50. Rulează Fetch VEYRA Data după enrichment sau așteaptă meciuri cu scor/odds potrivite.</div>';
    }
    html += '<div class="v5-section-title">⚡ Supreme Signals</div>';
    if(top.length){ html += '<div class="v5-signal-list">'+top.map(signalCard).join('')+'</div>'; }
    else { html += '<div class="v5-empty">Motorul este instalat, dar ev_signals_v2.json nu are semnale active. Full ML Pipeline antrenează modelul; Fetch VEYRA Data populează semnalele live.</div>'; }
    html += '<div class="v5-sub" style="margin-top:12px">Ultima actualizare: '+esc(ev.updated_at?fmtDateTime(ev.updated_at):(pack.updated_at?fmtDateTime(pack.updated_at):'—'))+' • AI Memory settled: '+esc(ai.settled_count || ai.total_settled || '—')+'</div></div>';
    return html;
  }
  function findMotorAnchor(){
    var nodes=document.querySelectorAll('h1,h2,h3,h4,div,section,article');
    for(var i=0;i<nodes.length;i++){
      var t=(nodes[i].textContent||'').trim();
      if(t.indexOf('Motor Unificat de Predicții')>=0 || t.indexOf('Motor Unificat de Predictii')>=0){
        var n=nodes[i];
        for(var step=0; step<4 && n.parentElement; step++){
          if((n.className&&String(n.className).match(/card|panel|section|box|wrap/i)) || n.offsetHeight>90) break;
          n=n.parentElement;
        }
        return n;
      }
    }
    return null;
  }
  function inject(){
    var anchor=findMotorAnchor();
    if(!anchor) return;
    loadData().then(function(data){
      var existing=$('v5-supreme-engine');
      var html=renderHtml(data);
      if(existing){ existing.outerHTML=html; return; }
      anchor.insertAdjacentHTML('afterend', html);
    });
  }
  var throttle=null;
  function schedule(){ clearTimeout(throttle); throttle=setTimeout(inject, 250); }
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('load', schedule);
  document.addEventListener('click', function(){ setTimeout(schedule, 220); }, true);
  new MutationObserver(function(){ schedule(); }).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(function(){ STATE.loaded=false; schedule(); }, 120000);
})();
