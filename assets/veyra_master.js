/* VEYRA Master Signal Engine v2.0 — 2026-07-10 */
(function(){
'use strict';

/* ─── Utilities ─────────────────────────────────────────── */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(v,d){ return Number(v||0).toFixed(d!=null?d:0); }
function pct(v){ return (Number(v||0)>0?'+':'')+Number(v||0).toFixed(1)+'%'; }
function fmtROI(v){ var n=Number(v||0); return (n>=0?'+':'')+n.toFixed(1)+'%'; }
function bt(){ return (typeof BACKTEST_SUMMARY!=='undefined' ? BACKTEST_SUMMARY : {}); }
function btRows(key){ var d=bt(); return Array.isArray(d[key])?d[key]:[]; }

/* ─── Master Score ──────────────────────────────────────── */
function masterScore(m){
  var b=m.bestBet; if(!b) return 0;
  var base=Number(m.smartScore||b.score||0);
  var ml5=(typeof ENRICHED_EVENT_CACHE!=='undefined'&&ENRICHED_EVENT_CACHE[String(m.eventId)])?5:0;
  var gap=Number(b.marketGapPct||0);
  var mkt=gap>15?5:gap>8?3:0;
  var risk=m.riskTier==='Safe'?8:m.riskTier==='Balanced'?3:m.riskTier==='Risk'?-5:0;
  var k=Number(b.kellyPct||0); var kel=k>3?5:k>1.5?2:0;
  return Math.min(100,Math.max(0,Math.round(base+ml5+mkt+risk+kel)));
}

/* ─── Market ROI lookup ─────────────────────────────────── */
var MKEY_MAP={
  over15:'Over 1.5G',over25:'Over 2.5G',over35:'Over 3.5G',
  under35:'Under 3.5G',under25:'Under 2.5G',under15:'Under 1.5G',
  btts:'BTTS',homeWin:'1 (Acasă)',awayWin:'2 (Oaspete)',draw:'X (Egal)',
  dc1x:'DC 1X',dcx2:'DC X2',dc12:'DC 12'
};
function marketROI(betType){
  var label=MKEY_MAP[betType]||betType;
  var rows=btRows('by_market');
  var row=rows.filter(function(r){ return (r.key||r.label||'').toLowerCase().indexOf((label||'').toLowerCase())!==-1||(r.label||'').toLowerCase().indexOf((label||'').toLowerCase())!==-1; })[0];
  return row||null;
}
function confBucket(adjProb){
  var rows=btRows('by_conf_bucket');
  return rows.filter(function(r){
    var lbl=String(r.label||r.key||'');
    var parts=lbl.replace(/[^0-9\-+]/g,' ').trim().split(/\s+/);
    if(parts.length>=2){ var lo=Number(parts[0]),hi=Number(parts[1]); return adjProb>=lo&&adjProb<=(hi||999); }
    return false;
  })[0]||null;
}
function edgeBucket(edgePct){
  var rows=btRows('by_edge_bucket');
  return rows.filter(function(r){
    var lbl=String(r.label||r.key||'');
    if(!edgePct||edgePct<=0) return false;
    var parts=lbl.replace(/[^0-9\-+.pp]/g,' ').trim().split(/\s+/);
    if(parts.length>=2){ var lo=Number(parts[0]),hi=Number(parts[1]);
      return edgePct>=lo&&(isNaN(hi)||edgePct<=hi);
    }
    return false;
  })[0]||null;
}

/* ─── SVG Ring ──────────────────────────────────────────── */
function ring(score,tier){
  var c=tier==='gold'?'#F59E0B':tier==='silver'?'#94A3B8':'#D97706';
  var r=20,ci=2*Math.PI*r,d=ci*Math.min(score,100)/100,g=ci-d;
  return '<svg viewBox="0 0 52 52" fill="none">'
    +'<circle cx="26" cy="26" r="20" stroke="rgba(255,255,255,.08)" stroke-width="4"/>'
    +'<circle cx="26" cy="26" r="20" stroke="'+c+'" stroke-width="4"'
    +' stroke-dasharray="'+d.toFixed(1)+' '+g.toFixed(1)+'"'
    +' stroke-dashoffset="'+((ci/4)).toFixed(1)+'"'
    +' stroke-linecap="round"/>'
    +'<text x="26" y="27" text-anchor="middle" dominant-baseline="middle"'
    +' font-size="12.5" font-weight="900" fill="'+c+'" font-family="system-ui,sans-serif">'+score+'</text>'
    +'</svg>';
}

/* ─── Signal pills ──────────────────────────────────────── */
function pills(b,m){
  var p=[], adj=Number(b.adjProb||0), edg=Number(b.edgePct!=null?b.edgePct:0);
  var val=Number(b.value||0)*100, kly=Number(b.kellyPct||0);
  p.push('<span class="ms-signal prob">P '+adj.toFixed(1)+'%</span>');
  if(val>0.01) p.push('<span class="ms-signal value">Val '+pct(val)+'</span>');
  if(edg>0.01) p.push('<span class="ms-signal edge">Edge +'+edg.toFixed(1)+'%</span>');
  if(kly>0.01) p.push('<span class="ms-signal kelly">Kelly '+kly.toFixed(2)+'%</span>');
  /* Market ROI pill */
  var mrow=marketROI(b.type||'');
  if(mrow&&Number(mrow.bets||0)>=5){
    var roi=Number(mrow.roi||0);
    var cls=roi>5?'pos':roi>0?'value':'neg';
    if(cls==='pos') p.push('<span class="ms-signal ml5" style="color:#10D07E;background:rgba(16,208,126,.09);border-color:rgba(16,208,126,.25)">ROI '+fmtROI(roi)+'</span>');
    else if(cls==='value') p.push('<span class="ms-signal edge">ROI '+fmtROI(roi)+'</span>');
  }
  if(typeof ENRICHED_EVENT_CACHE!=='undefined'&&ENRICHED_EVENT_CACHE[String(m.eventId)])
    p.push('<span class="ms-signal ml5">ML5</span>');
  if(m.riskTier==='Safe')  p.push('<span class="ms-signal risk">Safe</span>');
  if(m.riskTier==='Risk')  p.push('<span class="ms-signal risk-r">Risk</span>');
  if(b.usesBestOdds&&b.bestBookmaker)
    p.push('<span class="ms-signal best-odds">'+esc(b.bestBookmaker)+'</span>');
  return p.join('');
}

/* ─── Pick card ─────────────────────────────────────────── */
function card(m,ms,tier){
  var b=m.bestBet;
  var oddsDisp=Number(b.odds||0)>1.01?Number(b.odds).toFixed(2):'—';
  var bestLine='';
  if(b.usesBestOdds&&Number(b.bestOdds||0)>Number(b.odds||0)+0.01)
    bestLine='<div class="ms-best-line">Best: <b>@ '+Number(b.bestOdds).toFixed(2)+'</b>'+(b.bestBookmaker?' — '+esc(b.bestBookmaker):'')+' </div>';
  return '<div class="ms-card tier-'+tier+'">'
    +'<div class="ms-card-hd">'
      +'<div class="ms-score-ring">'+ring(ms,tier)+'</div>'
      +'<div class="ms-card-meta">'
        +'<div class="ms-teams">'+esc(m.home||'?')+' <span style="opacity:.4;font-weight:400;font-size:11px">vs</span> '+esc(m.away||'?')+'</div>'
        +'<div class="ms-league">'+esc(m.league||'')+(m.timeLabel?' · '+esc(m.timeLabel):'')+'</div>'
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

/* ─── Statistics block ──────────────────────────────────── */
function statsBlock(){
  var d=bt();
  var byMkt=btRows('by_market').filter(function(r){ return Number(r.bets||0)>=5; })
    .sort(function(a,b){ return Number(b.roi||0)-Number(a.roi||0); }).slice(0,6);
  var byStrat=btRows('by_strategy').filter(function(r){ return Number(r.bets||0)>=3; })
    .sort(function(a,b){ return Number(b.roi||0)-Number(a.roi||0); }).slice(0,4);
  var byConf=btRows('by_conf_bucket').filter(function(r){ return Number(r.bets||0)>=3; })
    .sort(function(a,b){ return Number(b.roi||0)-Number(a.roi||0); });

  var html='<div style="margin-bottom:16px">';

  /* ── Engines stats row ── */
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  var eng=[
    ['Motor','avg odds','engine_avg_odds',2],
    ['Avg edge','%','engine_avg_edge',1],
    ['Best run','W','engine_best_run',0],
    ['Worst run','L','engine_worst_run',0],
  ];
  eng.forEach(function(e){
    var val=Number(d[e[2]]||0);
    html+='<div style="flex:1;min-width:70px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:8px 10px;text-align:center">'
      +'<div style="font-size:14px;font-weight:900;font-variant-numeric:tabular-nums;color:var(--txt,#F0F4FB)">'+val.toFixed(e[3])+e[1]+'</div>'
      +'<div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted,#6B7B97);margin-top:4px">'+e[0]+'</div>'
    +'</div>';
  });
  html+='</div>';

  /* ── By market table ── */
  if(byMkt.length){
    html+='<div class="ms-tier-bars">';
    html+='<div class="ms-tier-bar-title">Performanță per piață (minim 5 pariuri)</div>';
    var maxAbsROI=Math.max.apply(null, byMkt.map(function(r){ return Math.abs(Number(r.roi||0)); }))||1;
    byMkt.forEach(function(r){
      var roi=Number(r.roi||0), wr=Number(r.winrate||0), bets=Number(r.bets||0);
      var barW=Math.round(Math.abs(roi)/maxAbsROI*100);
      var barColor=roi>5?'linear-gradient(90deg,#10D07E,#34D399)':roi>0?'linear-gradient(90deg,#F0A830,#FCD34D)':'linear-gradient(90deg,#EF4444,#F87171)';
      html+='<div class="ms-tier-row">'
        +'<div class="ms-tier-label" style="width:70px;font-size:9px;color:var(--muted)">'+esc(r.label||r.key||'')+'</div>'
        +'<div class="ms-track"><div class="ms-fill" style="width:'+barW+'%;background:'+barColor+'"></div></div>'
        +'<div class="ms-tier-stats"><b style="color:'+(roi>0?'#10D07E':'#EF4444')+'">'+fmtROI(roi)+'</b> · '+wr.toFixed(0)+'% WR · <b>'+bets+'</b></div>'
      +'</div>';
    });
    html+='</div>';
  }

  /* ── By strategy ── */
  if(byStrat.length){
    html+='<div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;margin-bottom:12px">';
    html+='<div class="ms-tier-bar-title">Top strategii (ROI)</div>';
    html+='<div style="display:flex;flex-direction:column;gap:6px">';
    byStrat.forEach(function(r){
      var roi=Number(r.roi||0), wr=Number(r.winrate||0);
      html+='<div style="display:flex;justify-content:space-between;align-items:center;font-size:10.5px">'
        +'<span style="color:var(--muted)">'+esc(r.label||r.key||'')+'</span>'
        +'<span style="font-family:var(--mono,monospace);font-weight:700;color:'+(roi>0?'#10D07E':'#EF4444')+'">'+fmtROI(roi)+' · '+wr.toFixed(0)+'% WR · '+r.bets+'p</span>'
      +'</div>';
    });
    html+='</div></div>';
  }

  /* ── By confidence ── */
  if(byConf.length){
    html+='<div style="background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px">';
    html+='<div class="ms-tier-bar-title">ROI per nivel de încredere</div>';
    html+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
    byConf.forEach(function(r){
      var roi=Number(r.roi||0);
      html+='<div style="flex:1;min-width:60px;text-align:center;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.06)">'
        +'<div style="font-size:11px;font-weight:900;color:'+(roi>0?'#10D07E':'#EF4444')+'">'+fmtROI(roi)+'</div>'
        +'<div style="font-size:8.5px;color:var(--muted);margin-top:2px">'+esc(r.label||r.key||'')+'</div>'
      +'</div>';
    });
    html+='</div></div>';
  }

  html+='</div>';
  return html;
}

/* ─── Tier section ──────────────────────────────────────── */
function tierSection(items,tier,label,icon){
  if(!items.length) return '';
  return '<div class="ms-section-hd">'
    +'<div class="ms-section-title"><span>'+icon+'</span>'+label
    +'<span class="ms-count-pill '+tier+'">'+items.length+'</span></div>'
  +'</div>'
  +items.map(function(c){ return card(c.m,c.ms,tier); }).join('');
}

/* ─── Tier distribution bars ────────────────────────────── */
function tierBars(g,s,b){
  var total=g.length+s.length+b.length||1;
  var gW=Math.round(g.length/total*100),sW=Math.round(s.length/total*100),bW=Math.round(b.length/total*100);
  return '<div class="ms-tier-bars">'
    +'<div class="ms-tier-bar-title">Distribuție semnale live</div>'
    +'<div class="ms-tier-row"><div class="ms-tier-label gold">GOLD</div><div class="ms-track"><div class="ms-fill gold" style="width:'+gW+'%"></div></div><div class="ms-tier-stats"><b>'+g.length+'</b> meciuri</div></div>'
    +'<div class="ms-tier-row"><div class="ms-tier-label silver">SILVER</div><div class="ms-track"><div class="ms-fill silver" style="width:'+sW+'%"></div></div><div class="ms-tier-stats"><b>'+s.length+'</b> meciuri</div></div>'
    +'<div class="ms-tier-row"><div class="ms-tier-label bronze">BRONZE</div><div class="ms-track"><div class="ms-fill bronze" style="width:'+bW+'%"></div></div><div class="ms-tier-stats"><b>'+b.length+'</b> meciuri</div></div>'
  +'</div>';
}

/* ─── KPI strip ─────────────────────────────────────────── */
function kpiStrip(g,s,b,allMs){
  var d=bt();
  var roi=Number(d.engine_roi||0),wr=Number(d.engine_winrate||0);
  var total=g.length+s.length+b.length;
  var avg=total?Math.round(allMs.reduce(function(a,v){return a+v;},0)/allMs.length):0;
  return '<div class="ms-kpi-grid">'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v gold">'+total+'</div><div class="ms-kpi-l">Semnale active</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v '+(roi>=0?'pos':'neg')+'">'+fmtROI(roi)+'</div><div class="ms-kpi-l">ROI Motor</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v">'+(wr>0?wr.toFixed(1)+'%':'—')+'</div><div class="ms-kpi-l">Win Rate</div></div>'
    +'<div class="ms-kpi-card"><div class="ms-kpi-v gold">'+avg+'</div><div class="ms-kpi-l">Scor mediu</div></div>'
  +'</div>';
}

/* ─── Main ──────────────────────────────────────────────── */
window.renderMasterTab = function(){
  var root=document.getElementById('tab-master');
  if(!root) return;

  var matches=(typeof ALL_MATCHES!=='undefined'?ALL_MATCHES:[]);
  var elig=matches.filter(function(m){ return m.bestBet&&m.analysisState==='ELIGIBLE'&&Number(m.smartScore||0)>0; });
  var scored=elig.map(function(m){ return {m:m,ms:masterScore(m)}; })
    .filter(function(c){ return c.ms>=40; })
    .sort(function(a,b){ return b.ms-a.ms; });

  var gold=scored.filter(function(c){ return c.ms>=72; });
  var silver=scored.filter(function(c){ return c.ms>=55&&c.ms<72; });
  var bronze=scored.filter(function(c){ return c.ms>=40&&c.ms<55; });
  var allMs=scored.map(function(c){ return c.ms; });

  var now=new Date();
  var dateStr=now.toLocaleDateString('ro-RO',{day:'2-digit',month:'short',year:'numeric'});
  var d=bt();

  var html='<div id="ms-inner" style="padding:8px 16px 40px">';

  /* Hero */
  html+='<div class="ms-hero">'
    +'<div class="ms-hero-top"><div>'
      +'<div class="ms-hero-title">VEYRA <span>Master Signal</span></div>'
      +'<div class="ms-hero-sub">Motor unificat · '+dateStr+' · '+elig.length+' meciuri procesate</div>'
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'
      +'<span class="ms-badge ms-badge-live"><span style="font-size:8px">●</span> LIVE</span>'
      +'<span class="ms-badge ms-badge-gold">'+scored.length+' semnale</span>'
      +'<span class="ms-badge ms-badge-test">TEST</span>'
    +'</div></div>'
    +kpiStrip(gold,silver,bronze,allMs.length?allMs:[0])
  +'</div>';

  /* Info */
  html+='<div class="ms-info">'
    +'<strong>Master Signal</strong> unifică ML5, APEX, Motor AI, Valoare și Kelly într-un scor 0–100. '
    +'<strong>GOLD ≥72</strong> · <strong>SILVER 55–71</strong> · <strong>BRONZE 40–54</strong>. '
    +'Pilulele de ROI pe fiecare card arată performanța istorică reală a acelei piețe.'
  +'</div>';

  /* Stats from BACKTEST_SUMMARY */
  if(d&&(d.engine_bets||btRows('by_market').length)){
    html+='<div class="ms-section-hd"><div class="ms-section-title"><span>📊 </span>Statistici Istorice</div></div>';
    html+=statsBlock();
  }

  /* Distribution */
  html+=tierBars(gold,silver,bronze);

  /* Picks */
  if(!scored.length){
    html+='<div class="ms-empty"><div class="ms-empty-title">Niciun semnal Master activ</div>Motoarele calculează sau nu există meciuri eligibile.<br>Revino după actualizarea datelor sau apasă Refresh.</div>';
  } else {
    html+=tierSection(gold,'gold','Semnale Gold','🥇 ');
    html+=tierSection(silver,'silver','Semnale Silver','🥈 ');
    html+=tierSection(bronze,'bronze','Semnale Bronze','🥉 ');
  }

  html+='<div style="text-align:center;margin:20px 0 8px">'
    +'<button class="ms-refresh-btn" onclick="window.renderMasterTab()">↻ Recalculează</button>'
  +'</div></div>';
  root.innerHTML=html;
};

})();
