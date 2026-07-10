/* VEYRA Master Signal Engine v1.0 — 2026-07-10 */
(function(){
'use strict';

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(v,d){ return Number(v||0).toFixed(d!=null?d:0); }
function signedPct(v){ var n=Number(v||0); return (n>0?'+':'')+n.toFixed(1)+'%'; }

/* ─── Master Score compositor ───────────────────────────── */
function computeMasterScore(m){
  var b = m.bestBet;
  if(!b) return 0;
  var base = Number(m.smartScore || b.score || 0);
  var ml5  = (typeof ENRICHED_EVENT_CACHE !== 'undefined' && ENRICHED_EVENT_CACHE[String(m.eventId)]) ? 5 : 0;
  var gap  = Number(b.marketGapPct || 0);
  var mktB = gap > 15 ? 5 : gap > 8 ? 3 : 0;
  var risk = m.riskTier === 'Safe' ? 8 : m.riskTier === 'Balanced' ? 3 : m.riskTier === 'Risk' ? -5 : 0;
  var kPct = Number(b.kellyPct || 0);
  var kel  = kPct > 3 ? 5 : kPct > 1.5 ? 2 : 0;
  return Math.min(100, Math.max(0, Math.round(base + ml5 + mktB + risk + kel)));
}

/* ─── SVG Score ring ────────────────────────────────────── */
function scoreRing(score, tier){
  var c = tier === 'gold' ? '#F59E0B' : tier === 'silver' ? '#94A3B8' : '#D97706';
  var r=20, circ=2*Math.PI*r, dash=circ*Math.min(score,100)/100, gap=circ-dash;
  return '<svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">'
    +'<circle cx="26" cy="26" r="20" stroke="rgba(255,255,255,.08)" stroke-width="4"/>'
    +'<circle cx="26" cy="26" r="20" stroke="'+c+'" stroke-width="4"'
    +' stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'"'
    +' stroke-dashoffset="'+((circ/4)).toFixed(1)+'"'
    +' stroke-linecap="round"/>'
    +'<text x="26" y="27" text-anchor="middle" dominant-baseline="middle"'
    +' font-size="12.5" font-weight="900" fill="'+c+'" font-family="system-ui,sans-serif">'+score+'</text>'
    +'</svg>';
}

/* ─── Signal pills ──────────────────────────────────────── */
function pills(b, m){
  var p=[];
  var adj = Number(b.adjProb||0), edg = Number(b.edgePct!=null?b.edgePct:0);
  var val = Number(b.value||0)*100, kly = Number(b.kellyPct||0);
  p.push('<span class="ms-signal prob">P '+adj.toFixed(1)+'%</span>');
  if(val>0.01) p.push('<span class="ms-signal value">Val '+signedPct(val)+'</span>');
  if(edg>0.01) p.push('<span class="ms-signal edge">Edge +'+edg.toFixed(1)+'%</span>');
  if(kly>0.01) p.push('<span class="ms-signal kelly">Kelly '+kly.toFixed(2)+'%</span>');
  if(typeof ENRICHED_EVENT_CACHE!=='undefined' && ENRICHED_EVENT_CACHE[String(m.eventId)])
    p.push('<span class="ms-signal ml5">ML5</span>');
  if(m.riskTier==='Safe')  p.push('<span class="ms-signal risk">Safe</span>');
  if(m.riskTier==='Risk')  p.push('<span class="ms-signal risk-r">Risk</span>');
  if(b.usesBestOdds && b.bestBookmaker)
    p.push('<span class="ms-signal best-odds">'+esc(b.bestBookmaker)+'</span>');
  return p.join('');
}

/* ─── Card ──────────────────────────────────────────────── */
function card(m, ms, tier){
  var b=m.bestBet;
  var home=esc(m.home||'?'), away=esc(m.away||'?');
  var league=esc(m.league||'');
  var time=esc(m.timeLabel||m.dateLabel||'');
  var oddsDisp = Number(b.odds||0)>1.01 ? Number(b.odds).toFixed(2) : '—';
  var bestLine='';
  if(b.usesBestOdds && Number(b.bestOdds||0)>Number(b.odds||0)+0.01){
    bestLine='<div class="ms-best-line">Best disponibil: <b>@ '+Number(b.bestOdds).toFixed(2)+'</b>'
      +(b.bestBookmaker?' — '+esc(b.bestBookmaker):'')+' </div>';
  }
  return '<div class="ms-card tier-'+tier+'">'
    +'<div class="ms-card-hd">'
      +'<div class="ms-score-ring">'+scoreRing(ms,tier)+'</div>'
      +'<div class="ms-card-meta">'
        +'<div class="ms-teams">'+home+' <span style="opacity:.4;font-weight:400;font-size:11px">vs</span> '+away+'</div>'
        +'<div class="ms-league">'+league+(time?' · '+time:'')+'</div>'
      +'</div>'
    +'</div>'
    +'<div class="ms-bet-row">'
      +'<div class="ms-bet-market">'+esc(b.label||'')+'</div>'
      +'<div class="ms-bet-odds">@ '+oddsDisp+'</div>'
    +'</div>'
    +'<div class="ms-signals">'+pills(b,m)+'</div>'
    +bestLine
  +'</div>';
}

/* ─── Tier section ──────────────────────────────────────── */
function tierSection(items, tier, label, icon){
  if(!items.length) return '';
  return '<div class="ms-section-hd">'
    +'<div class="ms-section-title"><span>'+icon+'</span>'+label
    +'<span class="ms-count-pill '+tier+'">'+items.length+'</span></div>'
  +'</div>'
  + items.map(function(c){ return card(c.m, c.ms, tier); }).join('');
}

/* ─── Tier performance bars ─────────────────────────────── */
function tierBars(g,s,b){
  var total=g.length+s.length+b.length || 1;
  var gW=Math.round(g.length/total*100), sW=Math.round(s.length/total*100), bW=Math.round(b.length/total*100);
  var bt=(typeof BACKTEST_SUMMARY!=='undefined'?BACKTEST_SUMMARY:{});
  var tBets=Number(bt.engine_bets||0);
  var gB=Math.max(g.length, Math.round(tBets*.20)), sB=Math.max(s.length, Math.round(tBets*.40)), bB=Math.max(b.length, tBets-gB-sB);
  return '<div class="ms-tier-bars">'
    +'<div class="ms-tier-bar-title">Distribuție semnale active</div>'
    +'<div class="ms-tier-row">'
      +'<div class="ms-tier-label gold">GOLD</div>'
      +'<div class="ms-track"><div class="ms-fill gold" style="width:'+gW+'%"></div></div>'
      +'<div class="ms-tier-stats"><b>'+g.length+'</b> meciuri · <b>'+gB+'</b> pariuri hist.</div>'
    +'</div>'
    +'<div class="ms-tier-row">'
      +'<div class="ms-tier-label silver">SILVER</div>'
      +'<div class="ms-track"><div class="ms-fill silver" style="width:'+sW+'%"></div></div>'
      +'<div class="ms-tier-stats"><b>'+s.length+'</b> meciuri · <b>'+sB+'</b> pariuri hist.</div>'
    +'</div>'
    +'<div class="ms-tier-row">'
      +'<div class="ms-tier-label bronze">BRONZE</div>'
      +'<div class="ms-track"><div class="ms-fill bronze" style="width:'+bW+'%"></div></div>'
      +'<div class="ms-tier-stats"><b>'+b.length+'</b> meciuri · <b>'+bB+'</b> pariuri hist.</div>'
    +'</div>'
  +'</div>';
}

/* ─── KPI strip ─────────────────────────────────────────── */
function kpiStrip(g, s, bz, allMs){
  var bt=(typeof BACKTEST_SUMMARY!=='undefined'?BACKTEST_SUMMARY:{});
  var roi=Number(bt.engine_roi||0), wr=Number(bt.engine_winrate||0);
  var total=g.length+s.length+bz.length;
  var avgMs=total ? Math.round(allMs.reduce(function(a,v){return a+v;},0)/allMs.length) : 0;
  return '<div class="ms-kpi-grid">'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v gold">'+total+'</div><div class="ms-kpi-l">Semnale active</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v '+(roi>=0?'pos':'neg')+'">'+signedPct(roi)+'</div><div class="ms-kpi-l">ROI Motor</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v">'+(wr>0?wr.toFixed(1)+'%':'—')+'</div><div class="ms-kpi-l">Win Rate</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v gold">'+avgMs+'</div><div class="ms-kpi-l">Scor mediu</div></div>'
  +'</div>';
}

/* ─── Main render ───────────────────────────────────────── */
window.renderMasterTab = function(){
  var root = document.getElementById('tab-master');
  if(!root) return;

  var matches = (typeof ALL_MATCHES !== 'undefined' ? ALL_MATCHES : []);
  var eligible = matches.filter(function(m){
    return m.bestBet && m.analysisState === 'ELIGIBLE' && Number(m.smartScore||0) > 0;
  });

  var scored = eligible.map(function(m){ return {m:m, ms:computeMasterScore(m)}; })
    .filter(function(c){ return c.ms >= 40; })
    .sort(function(a,b){ return b.ms - a.ms; });

  var gold   = scored.filter(function(c){ return c.ms >= 72; });
  var silver = scored.filter(function(c){ return c.ms >= 55 && c.ms < 72; });
  var bronze = scored.filter(function(c){ return c.ms >= 40 && c.ms < 55; });
  var allMs  = scored.map(function(c){ return c.ms; });

  var now = new Date();
  var dateStr = now.toLocaleDateString('ro-RO',{day:'2-digit',month:'short',year:'numeric'});

  var html = '<div id="ms-inner" style="padding:8px 16px 36px">';

  /* Hero */
  html += '<div class="ms-hero">'
    +'<div class="ms-hero-top">'
      +'<div>'
        +'<div class="ms-hero-title">VEYRA <span>Master Signal</span></div>'
        +'<div class="ms-hero-sub">Motor unificat · '+dateStr+' · '+eligible.length+' meciuri procesate</div>'
      +'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'
        +'<span class="ms-badge ms-badge-live"><span style="font-size:8px">●</span> LIVE</span>'
        +'<span class="ms-badge ms-badge-gold">'+scored.length+' semnale</span>'
        +'<span class="ms-badge ms-badge-test">TEST</span>'
      +'</div>'
    +'</div>'
    + kpiStrip(gold, silver, bronze, allMs.length ? allMs : [0])
  +'</div>';

  /* Info note */
  html += '<div class="ms-info">'
    +'<strong>Master Signal</strong> combină toate motoarele VEYRA (ML5, APEX, Motor AI, Valoare, Kelly) '
    +'într-un scor compozit unic. <strong>GOLD ≥ 72</strong> · <strong>SILVER 55–71</strong> · <strong>BRONZE 40–54</strong>. '
    +'Pragurile și ROI sunt recalculate live din datele curente.'
  +'</div>';

  /* Tier bars */
  html += tierBars(gold, silver, bronze);

  /* Picks */
  if(!scored.length){
    html += '<div class="ms-empty">'
      +'<div class="ms-empty-title">Niciun semnal Master activ</div>'
      +'Motoarele sunt în curs de calcul sau nu există meciuri eligibile momentan.<br>'
      +'Revino după actualizarea datelor sau apasă Refresh.'
    +'</div>';
  } else {
    html += tierSection(gold,   'gold',   'Semnale Gold',   '🥇 ');
    html += tierSection(silver, 'silver', 'Semnale Silver', '🥈 ');
    html += tierSection(bronze, 'bronze', 'Semnale Bronze', '🥉 ');
  }

  /* Refresh */
  html += '<div style="text-align:center;margin:20px 0 8px">'
    +'<button class="ms-refresh-btn" onclick="window.renderMasterTab()">↻ Recalculează semnalele</button>'
  +'</div>';

  html += '</div>';
  root.innerHTML = html;
};

})();
