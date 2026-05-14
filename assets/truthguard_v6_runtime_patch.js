/**
 * VEYRA TruthGuard Engine v7 — Profitable Precision Edition
 * ============================================================
 * Rebuild complet față de v6:
 *   - Edge este metrica principală (28 pts) — cel mai bun proxy CLV
 *   - minEdge ridicat la niveluri profitabile: over15/under35 5.5pp, btts/over25 6.5pp, 1X2 8-10pp
 *   - Acțiuni recalibrate: PAREAZĂ ≥85 (0 blocaje), RISC CONTROLAT ≥76 (≤1 blocaj)
 *   - Eliminat RISC CONTROLAT cu 3 blocaje — nu mai intră în pool
 *   - Integrat context flags GAP 1: derby, vreme, teren, deplasare
 *   - Integrat H2H signals GAP 3: draw_rate, btts_rate, avg_goals ±6 pts
 *   - Integrat v2_ml_prob GAP 2: confirmare CatBoost v2 ±8 pts
 *   - Pool limitat la 8 picks, max 2 per piață
 *   - UI redesigned: edge proeminent, warning 0-stricte, ROI estimat
 */
(function(){
  'use strict';
  if(window.__VEYRA_TRUTHGUARD_V7_RUNTIME__) return;
  window.__VEYRA_TRUTHGUARD_V7_RUNTIME__ = true;
  window.__VEYRA_TRUTHGUARD_V6_RUNTIME__ = true; // compatibilitate

  var TTL            = 90000;
  var RENDER_DELAY   = 420;
  var MAX_POOL       = 8;
  var MAX_PER_MKT    = 2;
  var MIN_WATCH      = 68;   // era 58
  var MAX_RISK       = 0.38; // era 0.52
  var SC_PARAZA      = 85;   // era 82
  var SC_RISC        = 76;   // era 72
  var MAX_BLK_RISC   = 1;    // era 3
  var MAX_BLK_WATCH  = 2;    // era 5

  var RULES = {
    over15:   {minP:0.76, minE:5.5, minEV:1.2, odds:[1.20,1.65], lbl:'Over 1.5G'},
    under35:  {minP:0.73, minE:5.5, minEV:1.2, odds:[1.18,1.65], lbl:'Under 3.5G'},
    btts:     {minP:0.60, minE:6.5, minEV:1.5, odds:[1.45,2.20], lbl:'BTTS Yes'},
    over25:   {minP:0.62, minE:6.5, minEV:1.5, odds:[1.50,2.30], lbl:'Over 2.5G'},
    home_win: {minP:0.58, minE:8.0, minEV:2.0, odds:[1.30,2.90], lbl:'Home Win'},
    away_win: {minP:0.50, minE:9.0, minEV:2.5, odds:[1.40,3.50], lbl:'Away Win'},
    draw:     {minP:0.35, minE:10.0,minEV:3.0, odds:[2.80,4.50], lbl:'Draw'}
  };
  var GOAL_MKTS = {over15:1,under35:1,btts:1,over25:1};

  var STATE = {ev:null,ai:null,loadedAt:0,rendering:false};
  var _timer = null;

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function f(v,d){ var n=Number(v); return isFinite(n)?n:(d==null?0:d); }
  function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
  function norm(v,lo,hi){ if(hi<=lo)return 0; return clamp((v-lo)/(hi-lo),0,1); }
  function pct(v,d){ var n=f(v); if(n>0&&n<=1)n*=100; return n.toFixed(d==null?1:d)+'%'; }
  function num(v,d){ return f(v).toFixed(d==null?1:d); }
  function plus(v,d){ var n=f(v); return (n>=0?'+':'')+n.toFixed(d==null?1:d); }
  function fmtDT(iso){
    try{
      if(!iso) return '—';
      var d=new Date(iso);
      if(isNaN(d.getTime())) return String(iso).slice(0,16);
      return d.toLocaleDateString('ro-RO')+' '+d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
    }catch(e){return '—';}
  }
  function stdDev(arr){
    if(!arr||arr.length<=1)return 0.10;
    var m=arr.reduce(function(a,b){return a+b;},0)/arr.length;
    return Math.sqrt(arr.reduce(function(a,b){var d=b-m;return a+d*d;},0)/arr.length);
  }

  function fetchJson(url,fb){
    return fetch(url+(url.indexOf('?')>=0?'&':'?')+'v='+Date.now(),{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error(url);return r.json();})
      .catch(function(){return fb;});
  }
  function loadData(){
    if(STATE.ev&&Date.now()-STATE.loadedAt<TTL)return Promise.resolve(STATE);
    return Promise.all([
      fetchJson('./data/ev_signals_v2.json',{}),
      fetchJson('./data/ai_memory.json',{})
    ]).then(function(res){
      STATE.ev=res[0]||{};
      STATE.ai=res[1]||{};
      STATE.loadedAt=Date.now();
      return STATE;
    });
  }

  function mktKey(s){
    var r=String(s.market_key||s.market||s.market_label||'').toLowerCase().replace(/\s+/g,'');
    if(r.indexOf('over1.5')>=0||r.indexOf('over15')>=0) return 'over15';
    if(r.indexOf('over2.5')>=0||r.indexOf('over25')>=0) return 'over25';
    if(r.indexOf('under3.5')>=0||r.indexOf('under35')>=0) return 'under35';
    if(r.indexOf('btts')>=0||r.indexOf('bothtea')>=0) return 'btts';
    if(r.indexOf('home')>=0||r==='1'||r==='homewin') return 'home_win';
    if(r.indexOf('away')>=0||r==='2'||r==='awaywin') return 'away_win';
    if(r.indexOf('draw')>=0||r==='x') return 'draw';
    return r||'unknown';
  }
  function mktLbl(s){ var k=mktKey(s); return s.market_label||(RULES[k]&&RULES[k].lbl)||s.market||s.market_key||'—'; }

  function normP(v){ var n=f(v,NaN); if(!isFinite(n)||n<=0)return null; if(n>1)n=n/100; return clamp(n,0,1); }
  function collectP(s){
    var keys=['adjusted_prob','final_prob','model_prob','probability','api_prob','bsd_prob',
              'poisson_prob','polymarket_prob','nv_prob','catboost_prob','stats_profile_prob'];
    if(s.v2_ml_prob!=null) keys.push('v2_ml_prob'); // GAP 2
    var out=[];
    keys.forEach(function(k){var p=normP(s[k]);if(p!=null&&p>0.05&&p<0.98)out.push(p);});
    if(out.length<2){var sc=f(s.score||s.supreme_score||s.adaptive_score,0);if(sc>=55)out.push(clamp(sc/115,0.45,0.88));}
    return out;
  }

  // GAP 1: context penalty
  function ctxPenalty(s,mk){
    var pen=0;
    var derby=!!(s.is_local_derby||s.derby);
    var neutral=!!(s.is_neutral_ground||s.neutral_ground);
    var travel=f(s.travel_distance_km||s.travel_km,0);
    var wx=s.weather&&typeof s.weather==='object'?s.weather:{};
    var wxDesc=String(wx.description||s.weather_desc||'').toLowerCase();
    var badWx=!!(wxDesc.match(/rain|snow|storm|fog|wind|heavy/));
    var pitch=f(s.pitch_condition,0);
    var is1x2=!!(mk==='home_win'||mk==='away_win'||mk==='draw');
    var isGoal=!!(GOAL_MKTS[mk]);
    if(derby){
      if(is1x2) pen+=0.15;
      if(isGoal) pen-=0.04;
    }
    if(neutral&&mk==='home_win') pen+=0.12;
    if(travel>=700&&mk==='away_win') pen+=0.10;
    if(badWx&&isGoal&&(mk==='over15'||mk==='over25'||mk==='btts')) pen+=0.12;
    if(badWx&&mk==='under35') pen-=0.04;
    if(pitch>=3&&(mk==='over25'||mk==='btts')) pen+=0.08;
    return clamp(pen,0,0.40);
  }

  // GAP 3: H2H bonus
  function h2hScore(s,mk){
    var n=f(s.h2h_matches||s.h2h_total_matches,0);
    if(n<5) return 0;
    var dr=f(s.h2h_draw_rate,NaN), br=f(s.h2h_btts_rate,NaN);
    var ag=f(s.h2h_avg_goals,NaN), hw=f(s.h2h_home_win_rate,NaN), aw=f(s.h2h_away_win_rate,NaN);
    var b=0;
    if(mk==='draw'&&isFinite(dr)){ b+=dr>=0.40?5:dr<=0.15?-4:0; }
    else if(mk==='btts'&&isFinite(br)){ b+=br>=0.60?4:br<=0.25?-4:0; }
    else if((mk==='over15'||mk==='over25')&&isFinite(ag)){ b+=ag>=3.0?4:ag<=1.8?-5:0; }
    else if(mk==='under35'&&isFinite(ag)){ b+=ag<=2.2?4:ag>=3.2?-4:0; }
    else if(mk==='home_win'&&isFinite(hw)){ b+=hw>=0.65?4:hw<=0.20?-4:0; }
    else if(mk==='away_win'&&isFinite(aw)){ b+=aw>=0.55?4:aw<=0.15?-4:0; }
    return clamp(b,-6,6);
  }

  // GAP 2: v2 ML confirmation
  function v2Score(s,implied){
    var v2p=normP(s.v2_ml_prob);
    if(v2p==null) return 0;
    var diff=(v2p-implied)*100;
    if(diff>=3) return 6;
    if(diff>=-1) return 2;
    if(diff<-5) return -8;
    return -2;
  }

  function scoreSignal(raw){
    var s=Object.assign({},raw||{});
    var mk=mktKey(s);
    var rule=RULES[mk]||{minP:0.62,minE:6.0,minEV:1.5,odds:[1.12,3.80],lbl:mktLbl(s)};
    var odds=f(s.odds||s.book_odds||s.active_odds||s.best_odds,0);
    var probs=collectP(s);
    var p=normP(s.adjusted_prob)||normP(s.final_prob)||normP(s.model_prob)||
          (probs.length?probs.reduce(function(a,b){return a+b;},0)/probs.length:0);
    var implied=odds>1.01?(1/odds):0;
    var edge=f(s.edge_pp,NaN); if(!isFinite(edge))edge=f(s.edge_pct,NaN); if(!isFinite(edge))edge=(p-implied)*100;
    var ev=f(s.ev_pct,NaN); if(!isFinite(ev))ev=odds>1.01?((p*odds)-1)*100:-99;
    var kelly=f(s.kelly_pct,NaN);
    if(!isFinite(kelly)&&odds>1.01){var b=odds-1;kelly=Math.max(0,((p*b-(1-p))/b)*0.25*100);}
    var agreement=normP(s.agreement)||clamp(1-(stdDev(probs)/0.14),0.20,0.96);
    var q=String(s.quality_gate||'').toUpperCase();
    var base=q==='A'?1.00:q==='B'?0.82:q==='C'?0.56:0.68;
    var rel=normP(s.reliability)||0.70;
    var srcB=clamp(probs.length/4,0.35,1);
    var quality=clamp(base*0.45+rel*0.35+srcB*0.20,0,1);
    var ctxPen=ctxPenalty(s,mk);
    var risk=clamp(f(s.lineup_risk,0.08)+f(s.context_risk,0.05)+f(s.player_availability_risk||s.playerRisk,0.05)+ctxPen,0,0.85);
    var disp=f(s.odds_dispersion,0);
    if(String(s.risk_tier||'').toUpperCase()==='HIGH')risk+=0.16;
    if(odds&&(odds<rule.odds[0]||odds>rule.odds[1]))risk+=0.12;
    if(disp>0.10)risk+=Math.min(0.12,disp);
    risk=clamp(risk,0,0.85);

    var h2hB=h2hScore(s,mk);
    var v2B=v2Score(s,implied);

    // ── Scoring v7: EDGE KING ──────────────────────────────────────────────────
    var score=0;
    score += 28 * norm(edge, rule.minE-2, rule.minE+10);   // edge — CLV proxy
    score += 20 * norm(p, rule.minP, rule.minP+0.14);      // probabilitate
    score += 14 * norm(ev, rule.minEV, rule.minEV+7);      // expected value
    score += 12 * norm(kelly, 0.5, 4.0);                   // kelly sizing
    score += 12 * agreement;                               // consens surse
    score +=  8 * quality;                                 // calitate date
    score +=  4 * clamp(rel,0,1);                         // fiabilitate model
    score +=  2 * norm(f(s.score||s.supreme_score||s.adaptive_score,70),72,92);
    score -= 26 * risk;                                    // penalizare risc
    score += h2hB;                                         // GAP 3
    score += v2B;                                          // GAP 2
    score=clamp(score,0,100);

    var blocks=[];
    if(!odds||odds<=1.01) blocks.push('fără cotă validă');
    if(p<rule.minP) blocks.push('prob. sub prag ('+pct(p)+'<'+pct(rule.minP)+')');
    if(edge<rule.minE) blocks.push('edge insuficient ('+plus(edge)+'pp < min '+num(rule.minE)+'pp)');
    if(ev<rule.minEV) blocks.push('EV insuficient ('+plus(ev,1)+'%<'+num(rule.minEV)+'%)');
    if(agreement<0.55) blocks.push('consens slab ('+pct(agreement,0)+')');
    if(quality<0.50) blocks.push('calitate date slabă');
    if(risk>MAX_RISK) blocks.push('risc ridicat ('+pct(risk,0)+')');
    if(odds&&(odds<rule.odds[0]||odds>rule.odds[1])) blocks.push('cotă afara ferestrei');
    if((s.is_local_derby||s.derby)&&(mk==='home_win'||mk==='away_win')) blocks.push('derby local — 1X2 impredictibil');
    if(h2hB<=-4) blocks.push('H2H contraindică piața');

    var strictOk=blocks.length===0&&score>=SC_PARAZA;
    var fatal=(!odds||odds<=1.01)||ev<-0.5||risk>0.62||quality<0.40||p<(rule.minP-0.14);
    var riskCtrl=!strictOk&&!fatal&&score>=SC_RISC&&blocks.length<=MAX_BLK_RISC;
    var watchOk=!strictOk&&!riskCtrl&&!fatal&&score>=MIN_WATCH&&blocks.length<=MAX_BLK_WATCH;
    var action=strictOk?'PAREAZĂ':(riskCtrl?'RISC CONTROLAT':(watchOk?'WATCHLIST':'EVITĂ'));
    var tier=score>=92&&strictOk?'A+':score>=86&&strictOk?'A':score>=78?'B':score>=62?'C':'D';
    var projRoi=Math.max(0,edge*0.32-0.4);

    s.market_key=mk; s.market_label=mktLbl(s); s.odds=odds;
    s.truth_prob=p; s.truth_edge=edge; s.truth_ev=ev; s.truth_kelly=kelly;
    s.truth_score=Math.round(score*10)/10; s.truth_agreement=agreement;
    s.truth_quality=quality; s.truth_risk=risk; s.truth_tier=tier;
    s.truth_action=action; s.truth_strict=strictOk;
    s.truth_blocks=blocks; s.truth_sources=probs.length;
    s.truth_proj_roi=projRoi; s.truth_h2h=h2hB; s.truth_v2=v2B;
    s.truth_derby=!!(s.is_local_derby||s.derby);
    s.truth_bwx=!!(String((s.weather&&s.weather.description)||s.weather_desc||'').toLowerCase().match(/rain|snow|storm|fog|wind/));
    return s;
  }

  function rawSignals(ev,ai){
    if(ev&&ev.signals&&Array.isArray(ev.signals)) return ev.signals;
    if(ev&&ev.truthguard_v6&&Array.isArray(ev.truthguard_v6.signals)) return ev.truthguard_v6.signals;
    if(ai&&Array.isArray(ai.adaptive_picks)) return ai.adaptive_picks;
    return [];
  }

  function prepareSignals(data){
    var raw=rawSignals(data.ev||{},data.ai||{}).map(scoreSignal);

    // FIX: deduplicate by event_id + market_key — același meci+piață apărea de 2 ori
    var deduped={};
    raw.forEach(function(s){
      var key=String(s.event_id||s.id||'')+'__'+String(s.market_key||s.market||'');
      if(!deduped[key]||f(s.truth_score)>f(deduped[key].truth_score)) deduped[key]=s;
    });
    var list=Object.values(deduped).sort(function(a,b){return f(b.truth_score)-f(a.truth_score);});
    var strict=list.filter(function(s){return s.truth_action==='PAREAZĂ';});
    var riskCtrl=list.filter(function(s){return s.truth_action==='RISC CONTROLAT';});
    var watch=list.filter(function(s){return s.truth_action==='WATCHLIST';});
    var avoided=list.filter(function(s){return s.truth_action==='EVITĂ';});
    var byMkt={}, finalList=[];
    strict.concat(riskCtrl).concat(watch).forEach(function(s){
      var mk=s.market_key||'x';
      if(!byMkt[mk])byMkt[mk]=0;
      if(byMkt[mk]>=MAX_PER_MKT||finalList.length>=MAX_POOL)return;
      byMkt[mk]++;finalList.push(s);
    });
    var avgEdge=finalList.length?finalList.reduce(function(a,s){return a+f(s.truth_edge);},0)/finalList.length:0;
    var avgRoi=finalList.length?finalList.reduce(function(a,s){return a+f(s.truth_proj_roi);},0)/finalList.length:0;
    return {all:list,finalList:finalList,strict:strict,riskCtrl:riskCtrl,watch:watch,avoided:avoided,avgEdge:avgEdge,avgRoi:avgRoi};
  }

  function signalCard(s,idx){
    var isS=s.truth_action==='PAREAZĂ', isR=s.truth_action==='RISC CONTROLAT', isW=s.truth_action==='WATCHLIST';
    var cls='tg7-card'+(isS?' tg7-good':(isR?' tg7-warn':(isW?' tg7-watch':'')));
    var ac=isS?'var(--grn)':isR?'var(--yel)':isW?'#60a5fa':'var(--red)';
    var ec=s.truth_edge>=9?'#47FFD8':s.truth_edge>=6?'#A7FFC0':s.truth_edge>=4?'#F6C960':'#FF9E7D';
    var blk=(s.truth_blocks||[]).slice(0,2).map(esc).join(' • ');

    // ── Context chips ─────────────────────────────────────────────────────
    var ctxC='';
    if(s.truth_derby) ctxC+='<span class="tg7-chip tg7-wyarn">🔥 Derby</span>';
    if(s.truth_bwx)   ctxC+='<span class="tg7-chip tg7-wyarn">🌧️ Vreme</span>';
    if(s.truth_h2h>=4)   ctxC+='<span class="tg7-chip tg7-wok">H2H ✓</span>';
    if(s.truth_h2h<=-4)  ctxC+='<span class="tg7-chip tg7-wbad">H2H ✗</span>';
    if(s.truth_v2>=5)    ctxC+='<span class="tg7-chip tg7-wok">v2 ML ✓</span>';
    if(s.truth_v2<=-6)   ctxC+='<span class="tg7-chip tg7-wbad">v2 ML ✗</span>';
    // Line movement (bani sharp)
    var mvBal=f(s.movement_balance,NaN);
    if(isFinite(mvBal)&&Math.abs(mvBal)>=3){
      ctxC+='<span class="tg7-chip '+(mvBal>0?'tg7-wok':'tg7-wyarn')+'">'+(mvBal>0?'📈':'📉')+(Math.abs(mvBal)>=8?' Sharp':' Mișcare')+' '+plus(mvBal,0)+'</span>';
    }
    // Model dominant din blend
    var blendW=(s.blend&&s.blend.weights)||{};
    var topMk='',topMw=0;
    var mnames={'catboost':'CatBoost','api':'BSD API','poisson':'Poisson','stats_profile':'Stats','market':'Market'};
    Object.keys(blendW).forEach(function(k){var w=f(blendW[k],0);if(w>topMw){topMw=w;topMk=k;}});
    if(topMk&&topMw>=0.35) ctxC+='<span class="tg7-chip" title="Model dominant">'+esc(mnames[topMk]||topMk)+' '+(topMw*100).toFixed(0)+'%</span>';
    // Data quality
    var dq=f(s.data_quality_score,NaN);
    if(isFinite(dq)&&dq>=80) ctxC+='<span class="tg7-chip '+(dq>=90?'tg7-wok':'')+'">Q '+dq.toFixed(0)+'</span>';
    // Tactic (pressing / defensive line)
    var tactB=f(s.tactical_match_bonus,NaN);
    if(isFinite(tactB)&&Math.abs(tactB)>=0.3) ctxC+='<span class="tg7-chip '+(tactB>0?'tg7-wok':'tg7-wyarn')+'" title="Pressing/linie defensivă">⚙️ '+(tactB>0?'+':'')+tactB.toFixed(1)+'</span>';
    // News risk
    var nRisk=f(s.news_risk_score,NaN);
    if(isFinite(nRisk)&&nRisk>=0.30) ctxC+='<span class="tg7-chip tg7-wyarn" title="Știri risc pre-meci">📰 '+pct(nRisk,0)+'</span>';

    // ── Forma echipelor (WWDLL) ──────────────────────────────────────────
    var hForm=String(s.home_form_string||s.home_form||'');
    var aForm=String(s.away_form_string||s.away_form||'');
    var formRow='';
    if(hForm||aForm){
      function _fStr(str,lbl){
        if(!str) return '';
        var cells=str.slice(0,5).split('').map(function(c){
          var col=c==='W'?'#47FFD8':c==='D'?'#F6C960':'#FF7D7D';
          return '<b style="color:'+col+'">'+c+'</b>';
        }).join(' ');
        return '<span style="color:#8B98AF;font-size:10px;margin-right:3px">'+esc(lbl)+'</span>'+cells;
      }
      formRow='<div class="tg7-form-row">'+
        _fStr(hForm,s.home||'H')+
        (hForm&&aForm?'<span style="color:#4A5568;margin:0 6px">·</span>':'')+
        _fStr(aForm,s.away||'A')+
      '</div>';
    }

    return ''+
      '<div class="'+cls+'">'+
        '<div class="tg7-ctop">'+
          '<div class="tg7-cleft">'+
            '<span class="tg7-cidx">#'+(idx+1)+'</span>'+
            '<div>'+
              '<div class="tg7-cmatch">'+esc(s.home||'—')+' <span class="tg7-cvs">vs</span> '+esc(s.away||'—')+'</div>'+
              '<div class="tg7-cmeta">'+esc(s.league||'—')+' · '+esc(fmtDT(s.date||s.event_date))+'</div>'+
            '</div>'+
          '</div>'+
          '<div class="tg7-cscore"><div class="tg7-csnum">'+num(s.truth_score,0)+'</div><div class="tg7-cstier">'+esc(s.truth_tier)+'</div></div>'+
        '</div>'+
        formRow+
        '<div class="tg7-cbar">'+
          '<div class="tg7-cbarrow">'+
            '<span class="tg7-cmkt">'+esc(s.market_label)+' @ '+num(s.odds,2)+'</span>'+
            '<span class="tg7-cedge" style="color:'+ec+'">Edge '+plus(s.truth_edge,1)+'pp</span>'+
            '<span class="tg7-cact" style="color:'+ac+';border-color:'+ac+'">'+esc(s.truth_action)+'</span>'+
          '</div>'+
        '</div>'+
        '<div class="tg7-cchips">'+
          '<span class="tg7-chip">Prob '+pct(s.truth_prob)+'</span>'+
          '<span class="tg7-chip">EV '+plus(s.truth_ev,1)+'%</span>'+
          '<span class="tg7-chip">Kelly¼ '+pct(s.truth_kelly,1)+'</span>'+
          '<span class="tg7-chip">Consens '+pct(s.truth_agreement,0)+'</span>'+
          '<span class="tg7-chip '+(s.truth_risk<=0.22?'tg7-wok':s.truth_risk<=0.38?'tg7-wyarn':'tg7-wbad')+'">Risc '+pct(s.truth_risk,0)+'</span>'+
          '<span class="tg7-chip">ROI est. +'+num(s.truth_proj_roi,1)+'%</span>'+
          ctxC+
        '</div>'+
        (blk?
          '<div class="tg7-cblk">⚠️ '+blk+'</div>':
          '<div class="tg7-cblk tg7-cok">✅ Zero blocaje — toate criteriile trecute</div>'
        )+
      '</div>';
  }

  function renderSummary(data,p){
    var strict=p.strict||[], rk=p.riskCtrl||[], watch=p.watch||[], av=p.avoided||[];
    var validated=strict.length+rk.length;
    var upd=(data.ev&&(data.ev.updated_at||data.ev.generated_at))||(data.ai&&data.ai.updated_at)||'';
    var warn=strict.length===0&&validated>0?
      '<div class="tg7-warn0">⚠️ Nicio selecție strict curată azi. Picks-urile sunt RISC CONTROLAT — stake redus sau aștepți mâine.</div>':'';
    var edgeCol=p.avgEdge>=7?'#47FFD8':p.avgEdge>=5?'#F6C960':'#FF9E7D';
    return ''+
      '<div class="tg7-shell" id="veyra-truthguard-v7">'+
        '<div class="tg7-glow"></div>'+
        '<div class="tg7-head">'+
          '<div>'+
            '<div class="tg7-title">🧠 VEYRA TruthGuard Engine v7</div>'+
            '<div class="tg7-sub">Profit Edition: Edge-first, praguri ridicate, context GAP1 + H2H GAP3 + v2 ML GAP2. Doar picks cu edge real profitabil.</div>'+
          '</div>'+
          '<div class="tg7-badge">TRUTHGUARD v7</div>'+
        '</div>'+
        warn+
        '<div class="tg7-kpis">'+
          '<div class="tg7-kpi"><b>'+p.finalList.length+'</b><span>AFIȘATE</span><small>din '+p.all.length+' brute</small></div>'+
          '<div class="tg7-kpi"><b>'+validated+'</b><span>VALIDATE</span><small>'+strict.length+' stricte · '+rk.length+' risc</small></div>'+
          '<div class="tg7-kpi"><b>'+av.length+'</b><span>EVITATE</span><small>'+watch.length+' watchlist</small></div>'+
          '<div class="tg7-kpi" style="'+(p.avgEdge>=7?'border-color:rgba(43,229,197,.35)':p.avgEdge>=5?'border-color:rgba(246,201,96,.30)':'')+'">'+
            '<b style="color:'+edgeCol+'">'+(p.avgEdge>0?plus(p.avgEdge.toFixed(1))+'pp':'—')+'</b>'+
            '<span>EDGE ø</span>'+
            '<small>ROI est. +'+(p.avgRoi>0?p.avgRoi.toFixed(1):'0.0')+'%</small>'+
          '</div>'+
        '</div>'+
        '<div class="tg7-matrix"><span>CatBoost</span><span>BSD API v2</span><span>No-vig</span><span>Poisson/xG</span><span>AI Memory</span><span>Derby+H2H+v2ML</span></div>'+
        '<div class="tg7-upd">Actualizat: '+esc(fmtDT(upd))+'</div>'+
      '</div>';
  }

  function injectCss(){
    if($('veyra-tg7-css'))return;
    var s=document.createElement('style');s.id='veyra-tg7-css';
    s.textContent=
      '.tg7-shell{position:relative;border:1px solid rgba(43,229,197,.28);border-radius:22px;padding:16px;background:radial-gradient(circle at 10% 0,rgba(43,229,197,.14),transparent 32%),linear-gradient(145deg,rgba(6,11,22,.97),rgba(9,14,26,.93));box-shadow:0 0 0 1px rgba(255,255,255,.032)inset,0 20px 60px rgba(0,0,0,.30);overflow:hidden}'+
      '.tg7-glow{position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#2BE5C5 0%,#F6C960 50%,#8B5CF6 100%)}'+
      '.tg7-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}'+
      '.tg7-title{font-size:19px;line-height:1.05;font-weight:950;color:#fff;letter-spacing:-.04em}'+
      '.tg7-sub{margin-top:7px;font-size:11px;line-height:1.45;color:#8D9DB8}'+
      '.tg7-badge{flex:0 0 auto;border:1px solid rgba(43,229,197,.38);border-radius:999px;padding:7px 10px;color:#7FFFE8;background:rgba(43,229,197,.10);font-size:10px;font-weight:900;text-transform:uppercase;white-space:nowrap}'+
      '.tg7-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}'+
      '.tg7-kpi{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(5,9,18,.72);padding:12px}'+
      '.tg7-kpi b{display:block;color:#47FFD8;font-size:24px;line-height:1;font-weight:950}'+
      '.tg7-kpi span{display:block;color:#D4DFF5;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-top:7px}'+
      '.tg7-kpi small{display:block;color:#8B98AF;font-size:10px;margin-top:3px}'+
      '.tg7-matrix{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:12px}'+
      '.tg7-matrix span{border:1px solid rgba(43,229,197,.10);border-radius:999px;padding:7px 10px;background:rgba(255,255,255,.03);font-size:10px;color:#A8B8D0;font-weight:800}'+
      '.tg7-upd{margin-top:10px;color:#687380;font:10px var(--mono,monospace)}'+
      '.tg7-warn0{margin-top:12px;padding:9px 11px;border-radius:12px;background:rgba(246,201,96,.07);border:1px solid rgba(246,201,96,.25);font-size:11px;color:#F6C960;line-height:1.45}'+
      '.tg7-list{display:grid;gap:10px;margin-top:12px}'+
      '.tg7-card{border:1px solid rgba(255,255,255,.09);border-radius:18px;background:linear-gradient(145deg,rgba(8,14,27,.97),rgba(6,10,21,.93));padding:13px;box-shadow:0 10px 30px rgba(0,0,0,.22)}'+
      '.tg7-good{border-color:rgba(43,229,197,.32);background:linear-gradient(145deg,rgba(8,20,18,.97),rgba(6,10,21,.93))}'+
      '.tg7-warn{border-color:rgba(246,201,96,.32)}'+
      '.tg7-watch{border-color:rgba(96,165,250,.22)}'+
      '.tg7-ctop{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}'+
      '.tg7-cleft{display:flex;align-items:flex-start;gap:8px}'+
      '.tg7-cidx{min-width:26px;font-size:11px;font-weight:900;color:#6B7A94;padding-top:2px}'+
      '.tg7-cmatch{font-size:14px;font-weight:950;color:#EEF4FF;line-height:1.2}'+
      '.tg7-cvs{color:#6B7A94;font-weight:600}'+
      '.tg7-cmeta{font-size:10px;color:#7D8DA6;margin-top:3px}'+
      '.tg7-cscore{min-width:52px;text-align:center;flex:0 0 auto}'+
      '.tg7-csnum{color:#47FFD8;font-size:26px;line-height:1;font-weight:950}'+
      '.tg7-cstier{color:#F6C960;font-size:10px;margin-top:2px;font-weight:900}'+
      '.tg7-cbar{margin-top:11px;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.065)}'+
      '.tg7-cbarrow{display:flex;align-items:center;gap:9px;flex-wrap:wrap}'+
      '.tg7-cmkt{background:rgba(43,229,197,.10);border:1px solid rgba(43,229,197,.22);border-radius:999px;padding:5px 9px;font-size:11px;color:#7FFFE8;font-weight:900;white-space:nowrap}'+
      '.tg7-cedge{font-size:16px;font-weight:950;letter-spacing:-.02em;margin-left:auto}'+
      '.tg7-cact{border:1px solid;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;white-space:nowrap}'+
      '.tg7-cchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}'+
      '.tg7-chip{border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.03);font-size:10px;color:#B4C4D8;font-weight:800}'+
      '.tg7-wok{color:#47FFD8;border-color:rgba(43,229,197,.22);background:rgba(43,229,197,.07)}'+
      '.tg7-wyarn{color:#F6C960;border-color:rgba(246,201,96,.22)}'+
      '.tg7-wbad{color:#FF7D7D;border-color:rgba(255,100,100,.22)}'+
      '.tg7-cblk{margin-top:8px;font-size:10px;color:#8B98AF;line-height:1.35;padding:6px 9px;border-radius:9px;background:rgba(255,100,100,.04)}'+
      '.tg7-cok{color:#47FFD8;background:rgba(43,229,197,.04)}'+
      '.tg7-form-row{display:flex;align-items:center;gap:4px;margin-top:9px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.025);font-size:11px;flex-wrap:wrap}'+
      '.tg7-form-team{display:flex;align-items:center;gap:4px}'+
      '.tg7-empty{border:1px dashed rgba(255,255,255,.12);border-radius:16px;padding:20px;text-align:center;color:#94A3B8;font-size:12px;background:rgba(255,255,255,.025);line-height:1.55}';
    document.head.appendChild(s);
  }

  function updateMoreMenu(prep){
    // Stocăm prep global pentru retry-uri — app.js suprascrie cardul la re-render
    window.__TG7_PREP__ = prep;
    function _doUpdate(){
      document.querySelectorAll('.more-card-btn').forEach(function(btn){
        var title=btn.querySelector('.more-card-title');
        var sub=btn.querySelector('.more-card-sub');
        var text=title?String(title.textContent||''):'';
        if(!(text.indexOf('Motor de Predic')>=0||text.indexOf('VEYRA')>=0||text.indexOf('TruthGuard')>=0||text.indexOf('Supreme')>=0)) return;
        if(title) title.textContent='🧠 VEYRA TruthGuard Engine v7';
        if(sub){
          var v=(prep.strict||[]).length+(prep.riskCtrl||[]).length;
          var et=prep.avgEdge>0?(' · Edge ø '+plus(prep.avgEdge.toFixed(1))+'pp'):'';
          sub.innerHTML='<span style="color:var(--acc);font-weight:900">'+prep.finalList.length+' afișate</span>'+
            ' · '+v+' validate ('+((prep.strict||[]).length)+' stricte)'+et+
            (prep.avgRoi>0?' · ROI est. +'+prep.avgRoi.toFixed(1)+'%':'');
        }
      });
    }
    _doUpdate();
    setTimeout(_doUpdate, 600);
    setTimeout(_doUpdate, 1800);
    // MutationObserver: re-aplică la fiecare re-render al more-menu
    try{
      var moreRoot=document.querySelector('.more-menu-list,.more-cards,.more-section,[class*="more-card"]');
      if(moreRoot&&!moreRoot.__tg7obs){
        moreRoot.__tg7obs=true;
        new MutationObserver(function(){ setTimeout(_doUpdate,80); }).observe(moreRoot,{childList:true,subtree:true});
      }
    }catch(e){}
  }

  function render(){
    if(STATE.rendering)return;
    var summaryEl=$('unified-summary-grid');
    var listEl=$('unified-picks-list');
    var metaEl=$('unified-list-meta');
    var updEl=$('unified-updated');
    if(!summaryEl||!listEl)return;
    STATE.rendering=true;
    injectCss();
    loadData().then(function(data){
      var prep=prepareSignals(data);
      summaryEl.innerHTML=renderSummary(data,prep);
      if(prep.finalList.length){
        listEl.innerHTML='<div class="tg7-list">'+prep.finalList.map(signalCard).join('')+'</div>';
      }else{
        listEl.innerHTML='<div class="tg7-empty">TruthGuard v7 nu a găsit selecții cu edge profitabil (≥5.5pp) azi.<br><b>0 selecții = 0 pierderi.</b> Revino când apar meciuri cu valoare reală.</div>';
      }
      var s=prep.strict||[],r=prep.riskCtrl||[];
      if(metaEl)metaEl.textContent=(s.length+r.length)+' validate ('+s.length+' stricte) · '+prep.finalList.length+' afișate · '+prep.all.length+' scanate';
      if(updEl)updEl.textContent='Actualizat: '+fmtDT((data.ev&&data.ev.updated_at)||(data.ai&&data.ai.updated_at)||'');
      var root=$('smartlearn-section-predictii');
      if(root){
        var tEl=root.querySelector('.section div[style*="font-size:16px"]');
        if(tEl)tEl.textContent='🧠 VEYRA TruthGuard Engine v7';
        var lS=listEl&&listEl.closest?listEl.closest('.section'):null;
        if(lS){var h=lS.querySelector('div[style*="font-size:13px"]');if(h)h.textContent='🏆 Predicții afișate — TruthGuard v7';}
      }
      updateMoreMenu(prep);
    }).catch(function(e){console.warn('[TG v7]',e);})
      .finally(function(){setTimeout(function(){STATE.rendering=false;},140);});
  }

  function schedule(){clearTimeout(_timer);_timer=setTimeout(render,RENDER_DELAY);}

  document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('load',schedule);
  document.addEventListener('click',function(ev){
    var c=String((ev.target&&ev.target.className)||'');
    if(c.indexOf('smartlearn-tab')>=0||c.indexOf('more-card-btn')>=0||c.indexOf('tab')>=0)setTimeout(schedule,350);
  },true);
  try{
    var ot=setInterval(function(){var t=$('tab-smartbet');if(!t)return;clearInterval(ot);new MutationObserver(function(){schedule();}).observe(t,{childList:true,subtree:true});},500);
  }catch(e){}
  setInterval(function(){STATE.ev=null;schedule();},120000);
})();
