// ═══════════════════════════════════════════════════════════════════════
// Historic Meciuri Tracker  —  BetAnalytics Pro V21+
//
// Pending-urile se preiau DIRECT din ALL_MATCHES cu EXACT aceeasi logica
// ca filtrele din tab-ul Meciuri (inclusiv eligibleCandidates pentru
// o15/btts/u35, riskTier pentru safe/value).
//
// Settled = din RECOMMENDATION_LOG (approximare categorie via market_key)
// Pending = din ALL_MATCHES (logica exacta Meciuri, per categorie)
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__batHistoricTrackerV5) return;
  window.__batHistoricTrackerV5 = true;

  /* ────────────────────────────────────────────────────────────────────
     CATEGORII
  ──────────────────────────────────────────────────────────────────── */
  var CATS = [
    { key:'all',   label:'Toate',    accent:'rgba(59,130,246,.85)' },
    { key:'safe',  label:'\u2B50 Top',    accent:'rgba(34,197,94,.9)'   },
    { key:'o15',   label:'\uD83D\uDD25 O1.5',   accent:'rgba(249,115,22,.9)'  },
    { key:'btts',  label:'\uD83E\uDD1D BTTS',   accent:'rgba(168,85,247,.9)'  },
    { key:'u35',   label:'\uD83E\uDDCA U3.5',   accent:'rgba(6,182,212,.9)'   },
    { key:'value', label:'\uD83D\uDCB0 Value',  accent:'rgba(245,158,11,.9)'  }
  ];

  var MKT_NICE = {
    over15:'O1.5G',over25:'O2.5G',under35:'U3.5G',under25:'U2.5G',btts:'BTTS',
    'Over 1.5G':'O1.5G','Over 2.5G':'O2.5G','Under 3.5G':'U3.5G','Under 2.5G':'U2.5G'
  };

  var ML = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie',
            'Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
  var MS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  var DR = ['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];

  /* ────────────────────────────────────────────────────────────────────
     STATE
  ──────────────────────────────────────────────────────────────────── */
  var _ini = new Date();
  var S = {
    mode:       'days7',
    selDay:     0,
    weeksMonth: { y:_ini.getFullYear(), m:_ini.getMonth() },
    selWeekIdx: -1,
    month:      { y:_ini.getFullYear(), m:_ini.getMonth() },
    year:       _ini.getFullYear(),
    view:       'grid',
    cat:        null
  };

  /* ────────────────────────────────────────────────────────────────────
     HELPERS
  ──────────────────────────────────────────────────────────────────── */
  function nv(v){ return Number(v)||0; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];}); }
  function pct(v){ var x=nv(v);return(x>=0?'+':'')+x.toFixed(1)+'%'; }
  function rcol(v,ok){ return ok?(nv(v)>0?'var(--grn)':(nv(v)<0?'var(--red)':'var(--muted)')):'var(--muted)'; }
  function wcol(v){ return nv(v)>=65?'var(--grn)':(nv(v)>=50?'var(--yel)':'var(--red)'); }
  function getCat(k){ return CATS.find(function(c){return c.key===k;})||CATS[0]; }
  function pad2(x){ return String(x).padStart(2,'0'); }
  function fmtDM(d){ return pad2(d.getDate())+'/'+pad2(d.getMonth()+1); }

  /* ────────────────────────────────────────────────────────────────────
     CALENDAR WEEK HELPERS  (Luni = prima zi a saptamanii)
  ──────────────────────────────────────────────────────────────────── */
  function weekMonday(d){
    var x=new Date(d);x.setHours(0,0,0,0);
    var dow=x.getDay();x.setDate(x.getDate()-(dow===0?6:dow-1));return x;
  }
  function getWeeksForMonth(y,m){
    var first=new Date(y,m,1),last=new Date(y,m+1,0);
    var cur=weekMonday(first),weeks=[];
    while(cur<=last){
      var wEnd=new Date(cur);wEnd.setDate(cur.getDate()+6);wEnd.setHours(23,59,59,999);
      weeks.push({startDate:new Date(cur),endDate:new Date(wEnd),s:cur.getTime(),e:wEnd.getTime()});
      cur=new Date(cur);cur.setDate(cur.getDate()+7);
    }
    return weeks;
  }
  function currentWeekIdx(weeks){
    var now=Date.now();
    for(var i=0;i<weeks.length;i++) if(now>=weeks[i].s&&now<=weeks[i].e) return i;
    return weeks.length-1;
  }
  function isCurrentWeek(w){ var now=Date.now();return now>=w.s&&now<=w.e; }

  /* ────────────────────────────────────────────────────────────────────
     BOUNDS
  ──────────────────────────────────────────────────────────────────── */
  function dayBounds(idx){
    var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-idx);
    var e=new Date(d);e.setHours(23,59,59,999);
    return{s:d.getTime(),e:e.getTime(),date:new Date(d)};
  }
  function activeWeekBounds(){
    var weeks=getWeeksForMonth(S.weeksMonth.y,S.weeksMonth.m);
    var idx=S.selWeekIdx>=0&&S.selWeekIdx<weeks.length?S.selWeekIdx:currentWeekIdx(weeks);
    return weeks[idx]||weeks[weeks.length-1];
  }
  function bounds(){
    if(S.mode==='days7') return dayBounds(S.selDay);
    if(S.mode==='weeks') return activeWeekBounds();
    if(S.mode==='month') return{s:new Date(S.month.y,S.month.m,1,0,0,0,0).getTime(),e:new Date(S.month.y,S.month.m+1,0,23,59,59,999).getTime()};
    if(S.mode==='year')  return{s:new Date(S.year,0,1,0,0,0,0).getTime(),e:new Date(S.year,11,31,23,59,59,999).getTime()};
    return dayBounds(0);
  }
  function eventTs(r){
    var raw=r.event_date||r.date||r.logged_at||r.prediction_created_at||null;
    if(!raw)return 0;var t=new Date(raw).getTime();return isFinite(t)?t:0;
  }
  function inPeriod(r){var t=eventTs(r);if(!t)return false;var b=bounds();return t>=b.s&&t<=b.e;}

  /* ────────────────────────────────────────────────────────────────────
     PERIOD LABEL
  ──────────────────────────────────────────────────────────────────── */
  function periodLabel(){
    if(S.mode==='days7'){var db=dayBounds(S.selDay),d=db.date;return d.getDate()+' '+MS[d.getMonth()]+' '+d.getFullYear();}
    if(S.mode==='weeks'){var wb=activeWeekBounds();return fmtDM(wb.startDate)+' \u2013 '+fmtDM(wb.endDate);}
    if(S.mode==='month')return ML[S.month.m]+' '+S.month.y;
    if(S.mode==='year') return 'Anul '+S.year;
    return '';
  }

  /* ════════════════════════════════════════════════════════════════════
     DATE — SETTLED (RECOMMENDATION_LOG, aproximare categorie)
  ═══════════════════════════════════════════════════════════════════ */
  var SUPP={over15:1,over25:1,btts:1,under35:1,under25:1};
  var DC_MKTS={dc1x:1,dcx2:1,dc12:1};

  function normSt(r){
    var st=String(r.status||r.result||'').toLowerCase().trim();
    if(st==='win'||st==='won'||r.won===true) return 'win';
    if(st==='lose'||st==='loss'||st==='lost'||r.won===false) return 'lose';
    if(r.home_score!=null&&r.away_score!=null&&r.market_key&&typeof window.evaluateMarketOutcome==='function'){
      var ev=window.evaluateMarketOutcome(r.market_key,nv(r.home_score),nv(r.away_score));
      if(ev==='win')return'win';if(ev==='loss')return'lose';
    }
    return 'pending';
  }

  function getSettled(){
    return (window.RECOMMENDATION_LOG||[]).filter(function(r){
      if(!r||!SUPP[r.market_key])return false;
      var st=normSt(r);return st==='win'||st==='lose';
    }).map(function(r){return Object.assign({},r,{_st:normSt(r),source:'log'});});
  }

  // Categorie pentru randul settled din RECOMMENDATION_LOG
  // Daca randul are eligible_categories (nou format) → clasificare exacta
  // Daca nu → fallback la aproximare (intrari vechi din log)
  function settledRowMatchesCat(r, key) {
    if (key === 'all') return true;
    // Format nou: eligible_categories salvate la momentul logarii
    var cats = r.eligible_categories;
    if (Array.isArray(cats) && cats.length > 0) return cats.indexOf(key) >= 0;
    // Fallback pentru intrari vechi fara eligible_categories
    var mk = r.market_key || '';
    if (key === 'safe')  return String(r.verdict || '').toLowerCase() === 'safe' || r.risk_tier === 'Safe' || nv(r.score) >= 80;
    if (key === 'o15')   return mk === 'over15';
    if (key === 'btts')  return mk === 'btts';
    if (key === 'u35')   return mk === 'under35';
    if (key === 'value') return r.risk_tier === 'Value' || (nv(r.value) >= 0.08 && nv(r.edge_pct) >= 3);
    return false;
  }

  /* ════════════════════════════════════════════════════════════════════
     DATE — PENDING (ALL_MATCHES, logica EXACTA Meciuri)
  ═══════════════════════════════════════════════════════════════════ */

  // Verifica daca meciul are tipul t in bestBet SAU in eligibleCandidates
  function matchHasEligType(m,t){
    if(!m.bestBet)return false;
    if(m.bestBet.type===t)return true;
    return Array.isArray(m.eligibleCandidates)&&m.eligibleCandidates.some(function(c){
      return c.bestBet&&c.bestBet.type===t;
    });
  }

  // Filtru per categorie — identic cu renderMatches() din app.js
  function matchInCat(m,catKey){
    if(!m||m.analysisState!=='ELIGIBLE'||!m.bestBet)return false;
    var b=m.bestBet;
    if(DC_MKTS[b.type||''])return false;
    if(catKey==='all')   return true;
    if(catKey==='safe')  return m.verdict==='safe'||m.riskTier==='Safe';
    if(catKey==='o15')   return matchHasEligType(m,'over15');
    if(catKey==='btts')  return matchHasEligType(m,'btts');
    if(catKey==='u35')   return matchHasEligType(m,'under35');
    if(catKey==='value') return m.riskTier==='Value'||(nv(b.value)>=0.08&&nv(b.edgePct)>=3);
    return false;
  }

  // Returneaza randuri pending pentru o categorie specifica (din ALL_MATCHES)
  function getPendingForCat(catKey){
    if(!window.ALL_MATCHES||!window.ALL_MATCHES.length)return[];
    var isDisp=typeof window.isMatchStillDisplayable==='function'
      ?window.isMatchStillDisplayable:function(){return true;};

    return (window.ALL_MATCHES||[]).filter(function(m){
      if(!isDisp(m))return false;
      return matchInCat(m,catKey);
    }).map(function(m){
      var b=m.bestBet||{};
      // Pentru categorii de piata, gaseste candidatul potrivit daca bestBet nu e tipul dorit
      var mktKey=b.type||'';
      var mktLabel=b.label||'';
      var mktOdds=nv(b.odds);
      var mktProb=nv(b.adjProb);
      var mktEdge=nv(b.edgePct);

      var typeMap={o15:'over15',btts:'btts',u35:'under35'};
      var wantedType=typeMap[catKey];
      if(wantedType&&mktKey!==wantedType&&Array.isArray(m.eligibleCandidates)){
        var cand=m.eligibleCandidates.find(function(c){return c.bestBet&&c.bestBet.type===wantedType;});
        if(cand&&cand.bestBet){
          mktKey=cand.bestBet.type||mktKey;
          mktLabel=cand.bestBet.label||mktLabel;
          mktOdds=nv(cand.bestBet.odds)||mktOdds;
          mktProb=nv(cand.bestBet.adjProb)||mktProb;
          mktEdge=nv(cand.bestBet.edgePct)||mktEdge;
        }
      }
      return{
        _st:'pending',source:'live',
        event_id:m.eventId!=null?m.eventId:m.id,
        home:m.home,away:m.away,league:m.league,
        event_date:m.date||m.event_date,
        market_key:mktKey,market:mktLabel,
        odds:mktOdds,adjusted_prob:mktProb,edge_pct:mktEdge,
        value:nv(b.value),verdict:m.verdict||'',
        score:nv(m.smartScore),riskTier:m.riskTier||''
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     ROWS FOR CATEGORY  (settled + pending corecte, dedup)
  ═══════════════════════════════════════════════════════════════════ */
  var _settledCache=null, _settledTs=0;
  function getCachedSettled(){
    if(_settledCache&&Date.now()-_settledTs<10000)return _settledCache;
    _settledCache=getSettled(); _settledTs=Date.now(); return _settledCache;
  }

  function getRowsForCat(catKey){
    var settled=getCachedSettled().filter(function(r){
      return inPeriod(r)&&settledRowMatchesCat(r,catKey);
    });
    // Pending: exact din ALL_MATCHES, filtrate si de inPeriod
    var pending=getPendingForCat(catKey).filter(inPeriod);
    // Dedup: daca un pending are si settled (rezolvat intre timp), pastreaza settled
    var sk={};
    settled.forEach(function(r){sk[String(r.event_id||'')+'::'+r.market_key]=1;});
    pending=pending.filter(function(r){
      return!sk[String(r.event_id||'')+'::'+r.market_key];
    });
    return settled.concat(pending);
  }

  /* ════════════════════════════════════════════════════════════════════
     STATS
  ═══════════════════════════════════════════════════════════════════ */
  function calcStats(rows){
    var s=rows.filter(function(r){return r._st==='win'||r._st==='lose';});
    var p=rows.filter(function(r){return r._st==='pending';});
    var w=s.filter(function(r){return r._st==='win';}).length;
    var profit=s.reduce(function(acc,r){var o=nv(r.odds);return acc+(r._st==='win'?(o>1?o-1:0):-1);},0);
    var eSum=s.reduce(function(acc,r){return acc+nv(r.edge_pct);},0);
    var BE=s.length?s.reduce(function(a,r){return a+(nv(r.odds)>1?100/nv(r.odds):50);},0)/s.length:0;
    return{
      total:rows.length,settled:s.length,wins:w,losses:s.length-w,pending:p.length,
      winrate:s.length?w*100/s.length:0,
      roi:s.length?profit*100/s.length:0,
      avgEdge:s.length?eSum/s.length:0,
      profit:profit,breakEven:BE,
      delta:s.length?(w*100/s.length)-BE:0
    };
  }

  /* ════════════════════════════════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════════════════════════════ */
  function injectCss(){
    if(document.getElementById('bat-hist-v5-css'))return;
    var css=[
      '.bh-wrap{padding:2px 0 12px}',
      '.bh-mbar{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}',
      '.bh-mbtn{padding:7px 13px;border-radius:12px;font-size:12px;font-weight:700',
               ';border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.035)',
               ';color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-mbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      /* 7 zile */
      '.bh-days{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}',
      '.bh-daybtn{display:flex;flex-direction:column;align-items:center;gap:1px',
                 ';padding:7px 8px;border-radius:12px;min-width:38px',
                 ';border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)',
                 ';color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-dlbl{font-size:9px;font-weight:700;opacity:.7}',
      '.bh-dnum{font-size:17px;font-weight:900;line-height:1}',
      '.bh-dmo{font-size:9px;opacity:.65}',
      '.bh-daybtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      '.bh-daybtn.on .bh-dnum{color:var(--acc)}',
      /* saptamani */
      '.bh-wm-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.bh-wm-lbl{font-size:11px;color:var(--muted);font-weight:600}',
      '.bh-sel{padding:7px 12px;border-radius:10px;font-size:12px;font-weight:600',
              ';border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03)',
              ';color:var(--txt);cursor:pointer;max-width:200px}',
      '.bh-weeks{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
      '.bh-wkbtn{padding:6px 10px;border-radius:11px;font-size:11px;font-weight:700',
                ';border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)',
                ';color:var(--muted);cursor:pointer;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;gap:5px}',
      '.bh-wkbtn.on{background:rgba(43,229,197,.13);border-color:rgba(43,229,197,.4);color:var(--acc)}',
      '.bh-wkbtn.current{border-color:rgba(245,158,11,.35);color:var(--yel)}',
      '.bh-wkbtn.current.on{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.5)}',
      '.bh-wk-pend{font-size:9px;opacity:.7}',
      /* luna/an */
      '.bh-sub{margin-bottom:10px}',
      /* summary */
      '.bh-sum{padding:14px;border-radius:18px;margin-bottom:12px',
              ';background:linear-gradient(135deg,rgba(43,229,197,.07),rgba(59,130,246,.05))',
              ';border:1px solid rgba(43,229,197,.2);box-shadow:0 8px 24px rgba(0,0,0,.12)}',
      '.bh-stitle{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.bh-ptag{font-size:9px;padding:2px 6px;border-radius:5px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);color:var(--yel);font-weight:700}',
      '.bh-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.bh-kcard{padding:10px 8px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);text-align:center}',
      '.bh-kval{font-size:20px;font-weight:900;line-height:1;margin-bottom:3px}',
      '.bh-klbl{font-size:9px;color:var(--muted);font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase}',
      /* grid */
      '.bh-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:4px}',
      '.bh-card{padding:13px 11px 10px;border-radius:15px;cursor:pointer',
               ';background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07)',
               ';position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent}',
      '.bh-card:active{opacity:.82}',
      '.bh-card-name{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:5px}',
      '.bh-card-roi{font-size:22px;font-weight:900;line-height:1;margin-bottom:5px}',
      '.bh-card-meta{font-size:10px;color:var(--muted);line-height:1.55}',
      '.bh-card-arr{position:absolute;top:11px;right:11px;font-size:16px;opacity:.35;color:var(--txt)}',
      '.bh-card-bar{height:3px;border-radius:2px;margin-top:9px;opacity:.45}',
      /* drill-down */
      '.bh-ddh{display:flex;align-items:center;gap:10px;margin-bottom:11px',
              ';padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.025)',
              ';border:1px solid rgba(255,255,255,.08)}',
      '.bh-back{padding:7px 11px;border-radius:10px;font-size:12px;font-weight:700',
               ';border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)',
               ';color:var(--txt);cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.bh-ddtitle{font-size:14px;font-weight:900;color:var(--txt)}',
      '.bh-ddper{font-size:10px;color:var(--muted);font-family:var(--mono)}',
      '.bh-pills{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}',
      '.bh-pill{padding:5px 9px;border-radius:9px;font-size:11px;font-weight:700',
               ';background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07)}',
      '.bh-dayg{margin-bottom:14px}',
      '.bh-daylbl{font-size:9px;font-family:var(--mono);color:var(--muted);letter-spacing:.06em;text-transform:uppercase',
                 ';padding:5px 0 5px;border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:7px}',
      '.bh-row{display:flex;align-items:flex-start;gap:9px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}',
      '.bh-row:last-child{border-bottom:none}',
      '.bh-badge{width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;margin-top:1px}',
      '.bh-bw{background:rgba(34,197,94,.18);color:var(--grn);border:1px solid rgba(34,197,94,.28)}',
      '.bh-bl{background:rgba(239,68,68,.14);color:var(--red);border:1px solid rgba(239,68,68,.22)}',
      '.bh-bp{background:rgba(245,158,11,.12);color:var(--yel);border:1px solid rgba(245,158,11,.28)}',
      '.bh-main{flex:1;min-width:0}',
      '.bh-teams{font-size:12px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bh-meta{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}',
      '.bh-odds{font-size:11px;font-weight:700;color:var(--txt);flex-shrink:0;margin-top:2px}',
      '.bh-sc{color:var(--acc);font-size:10px;font-family:var(--mono);font-weight:700}',
      '.bh-pend-row{border-left:2px solid rgba(245,158,11,.45);padding-left:7px;opacity:.85}',
      '.bh-empty{text-align:center;padding:36px 16px}',
      '.bh-eico{font-size:34px;margin-bottom:8px}',
      '.bh-etxt{font-size:12px;color:var(--muted);line-height:1.6}',
      '.bh-note{font-size:10px;color:var(--muted);line-height:1.5;padding:9px 11px;border-radius:10px',
               ';background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);margin-bottom:10px}',
      '@media(max-width:360px){.bh-grid{grid-template-columns:1fr}.bh-kval{font-size:17px}',
                              '.bh-days{gap:4px}.bh-daybtn{min-width:34px;padding:6px 6px}}'
    ].join('');
    var s=document.createElement('style');s.id='bat-hist-v5-css';s.textContent=css;
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════════════
     PERIOD BAR
  ═══════════════════════════════════════════════════════════════════ */
  function renderPeriodBar(){
    var h='<div class="bh-mbar">'+
      mb('days7','7 Zile')+mb('weeks','Saptamani')+mb('month','Luna')+mb('year','Anual')+
    '</div>';

    if(S.mode==='days7'){
      h+='<div class="bh-days">';
      for(var di=0;di<7;di++){
        var db=dayBounds(di),d=db.date;
        var top=di===0?'Azi':(di===1?'Ieri':DR[d.getDay()]);
        h+='<button class="bh-daybtn'+(S.selDay===di?' on':'')+'" onclick="window.batH.day('+di+')">'+
             '<span class="bh-dlbl">'+top+'</span>'+
             '<span class="bh-dnum">'+d.getDate()+'</span>'+
             '<span class="bh-dmo">'+MS[d.getMonth()]+'</span>'+
           '</button>';
      }
      h+='</div>';
    }

    if(S.mode==='weeks'){
      var mopts=getMonthOpts().map(function(o){
        var sel=(S.weeksMonth.y===o.y&&S.weeksMonth.m===o.m)?' selected':'';
        return'<option value="'+o.y+'-'+o.m+'"'+sel+'>'+ML[o.m]+' '+o.y+'</option>';
      }).join('');
      h+='<div class="bh-wm-row"><span class="bh-wm-lbl">Luna:</span>'+
           '<select class="bh-sel" onchange="window.batH.setWeeksMonth(this.value)">'+mopts+'</select></div>';
      var weeks=getWeeksForMonth(S.weeksMonth.y,S.weeksMonth.m);
      var activeIdx=S.selWeekIdx>=0&&S.selWeekIdx<weeks.length?S.selWeekIdx:currentWeekIdx(weeks);
      h+='<div class="bh-weeks">';
      weeks.forEach(function(w,i){
        var isNow=isCurrentWeek(w);
        var on=i===activeIdx?' on':'';var cur=isNow?' current':'';
        h+='<button class="bh-wkbtn'+on+cur+'" onclick="window.batH.week('+i+')">'+
             fmtDM(w.startDate)+' \u2013 '+fmtDM(w.endDate)+
             (isNow?'<span class="bh-wk-pend">\u23F3</span>':'')+
           '</button>';
      });
      h+='</div>';
    }

    if(S.mode==='month'){
      var mo2=getMonthOpts().map(function(o){
        var sel=(S.month.y===o.y&&S.month.m===o.m)?' selected':'';
        return'<option value="'+o.y+'-'+o.m+'"'+sel+'>'+ML[o.m]+' '+o.y+'</option>';
      }).join('');
      h+='<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setMonth(this.value)">'+mo2+'</select></div>';
    }

    if(S.mode==='year'){
      var now=new Date(),yopts='';
      for(var yi=0;yi<4;yi++){var yr=now.getFullYear()-yi;yopts+='<option value="'+yr+'"'+(S.year===yr?' selected':'')+'>'+yr+'</option>';}
      h+='<div class="bh-sub"><select class="bh-sel" onchange="window.batH.setYear(this.value)">'+yopts+'</select></div>';
    }

    return h;
    function mb(mode,lbl){return'<button class="bh-mbtn'+(S.mode===mode?' on':'')+'" onclick="window.batH.mode(\''+mode+'\')">'+lbl+'</button>';}
  }

  function getMonthOpts(){
    var now=new Date(),opts=[];
    for(var i=0;i<24;i++){var d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push({y:d.getFullYear(),m:d.getMonth()});}
    return opts;
  }

  /* ════════════════════════════════════════════════════════════════════
     SUMMARY CARD
  ═══════════════════════════════════════════════════════════════════ */
  function renderSummary(){
    var rows=getRowsForCat('all');
    var s=calcStats(rows);
    var nd=s.settled===0;
    var isCurWk=S.mode==='weeks'&&isCurrentWeek(activeWeekBounds());
    return'<div class="bh-sum">'+
      '<div class="bh-stitle">Toate \u00B7 <span style="color:var(--acc)">'+esc(periodLabel())+'</span>'+
        (isCurWk?'<span class="bh-ptag">\u23F3 Sapt. in curs</span>':'')+
        (s.pending>0?'<span class="bh-ptag">+'+s.pending+' a\u015Fteapt\u0103</span>':'')+
      '</div>'+
      '<div class="bh-kpi">'+
        kc(nd?'\u2014':pct(s.roi),     rcol(s.roi,!nd),'ROI')+
        kc(nd?'\u2014':s.winrate.toFixed(0)+'%',nd?'var(--muted)':wcol(s.winrate),'Win Rate')+
        kc(nd?'\u2014':s.wins+'/'+s.settled,'var(--txt)','W / Jucate')+
      '</div>'+
    '</div>';
  }
  function kc(val,col,lbl){return'<div class="bh-kcard"><div class="bh-kval" style="color:'+col+'">'+val+'</div><div class="bh-klbl">'+lbl+'</div></div>';}

  /* ════════════════════════════════════════════════════════════════════
     CATEGORY GRID
  ═══════════════════════════════════════════════════════════════════ */
  function renderGrid(){
    var cards=CATS.filter(function(c){return c.key!=='all';}).map(function(cat){
      var rows=getRowsForCat(cat.key);
      var s=calcStats(rows);
      var nd=s.settled===0;
      var rCol=rcol(s.roi,!nd);
      var bCol=nd?'rgba(255,255,255,.06)':(s.roi>=0?'rgba(34,197,94,.22)':'rgba(239,68,68,.18)');
      var barW=nd?'15':Math.min(100,Math.max(10,Math.abs(s.winrate))).toFixed(0);
      return'<div class="bh-card" onclick="window.batH.drill(\''+cat.key+'\')" style="border-color:'+bCol+'">'+
        '<div class="bh-card-arr">\u203A</div>'+
        '<div class="bh-card-name">'+esc(cat.label)+'</div>'+
        '<div class="bh-card-roi" style="color:'+rCol+'">'+(nd?'\u2014':pct(s.roi))+'</div>'+
        '<div class="bh-card-meta">'+
          'WR: <b style="color:'+(nd?'var(--muted)':wcol(s.winrate))+'">'+(nd?'\u2014':s.winrate.toFixed(0)+'%')+'</b>'+
          ' \u00B7 '+(nd?'\u2014':s.wins+'/'+s.settled+' W')+
          (s.pending>0?' <span style="color:var(--yel);opacity:.85">+'+s.pending+'\u23F3</span>':'')+
          '<br>Edge: <b style="color:'+(nd?'var(--muted)':'var(--cyan)')+'">'+(nd?'\u2014':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%')+'</b>'+
          (s.settled>0?' \u00B7 \u0394<b style="color:'+(s.delta>=0?'var(--grn)':'var(--red)')+'">'+(s.delta>=0?'+':'')+s.delta.toFixed(1)+'pp</b>':'')+
        '</div>'+
        '<div class="bh-card-bar" style="background:'+cat.accent+';width:'+barW+'%"></div>'+
      '</div>';
    });
    return'<div class="bh-grid">'+cards.join('')+'</div>';
  }

  /* ════════════════════════════════════════════════════════════════════
     DRILL-DOWN
  ═══════════════════════════════════════════════════════════════════ */
  function renderDrilldown(){
    var cat=getCat(S.cat);
    var rows=getRowsForCat(S.cat);
    // Pending la sfarsit, in cadrul fiecarei zile
    rows.sort(function(a,b){
      if(a._st==='pending'&&b._st!=='pending')return 1;
      if(a._st!=='pending'&&b._st==='pending')return-1;
      return eventTs(b)-eventTs(a);
    });
    var s=calcStats(rows);var nd=s.settled===0;

    var hdr='<div class="bh-ddh">'+
      '<button class="bh-back" onclick="window.batH.back()">\u2190 \xCEnapoi</button>'+
      '<div><div class="bh-ddtitle">'+esc(cat.label)+'</div>'+
      '<div class="bh-ddper">'+esc(periodLabel())+'</div></div>'+
    '</div>';

    var pills='<div class="bh-pills">'+
      pl('ROI: '+(nd?'\u2014':pct(s.roi)),rcol(s.roi,!nd))+
      pl('WR: '+(nd?'\u2014':s.winrate.toFixed(0)+'%'),nd?'var(--muted)':wcol(s.winrate))+
      pl('W/J: '+(nd?'\u2014':s.wins+'/'+s.settled),'var(--txt)')+
      pl('Edge: '+(nd?'\u2014':(s.avgEdge>=0?'+':'')+s.avgEdge.toFixed(1)+'%'),'var(--cyan)')+
      (s.pending>0?pl('\u23F3 '+s.pending+' a\u015Fteapt\u0103','var(--yel)'):'')+
    '</div>';

    if(!rows.length) return hdr+pills+'<div class="bh-empty"><div class="bh-eico">\uD83D\uDD0D</div>'+
      '<div class="bh-etxt">Niciun meci \xEEn <b>'+esc(periodLabel())+'</b><br>pentru <b>'+esc(cat.label)+'</b></div></div>';

    var dayMap={},dayOrder=[];
    rows.forEach(function(r){
      var t=eventTs(r);if(!t)return;
      var d=new Date(t);
      var k=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
      if(!dayMap[k]){dayMap[k]={date:d,rows:[]};dayOrder.push(k);}
      dayMap[k].rows.push(r);
    });

    var groups=dayOrder.map(function(k){
      var day=dayMap[k],d=day.date;
      var lbl=DR[d.getDay()]+', '+d.getDate()+' '+MS[d.getMonth()]+' '+d.getFullYear();
      var mhtml=day.rows.map(function(r){
        var st=r._st;
        var isPend=st==='pending';
        var bcls=st==='win'?'bh-bw':(st==='lose'?'bh-bl':'bh-bp');
        var btxt=st==='win'?'W':(st==='lose'?'L':'\u23F3');
        var mkt=MKT_NICE[r.market_key]||MKT_NICE[r.market]||r.market_key||r.market||'\u2014';
        var sc=(r.home_score!=null&&r.away_score!=null)?
          ' <span class="bh-sc">['+r.home_score+'-'+r.away_score+']</span>':'';
        var prob=nv(r.adjusted_prob||r.api_prob||r.model_prob);
        var edge=nv(r.edge_pct);
        var kickoff='';
        if(isPend&&(r.event_date||r.date)){
          try{var kd=new Date(r.event_date||r.date);if(isFinite(kd))kickoff=' \u00B7 '+kd.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});}catch(e){}
        }
        var mp=[esc(mkt),esc(r.league||'\u2014')];
        if(prob>0)mp.push(prob.toFixed(0)+'% prob');
        if(edge>0)mp.push('edge +'+edge.toFixed(1)+'%');
        return'<div class="bh-row'+(isPend?' bh-pend-row':'')+'">'+
          '<div class="bh-badge '+bcls+'">'+btxt+'</div>'+
          '<div class="bh-main">'+
            '<div class="bh-teams">'+esc(r.home||'?')+' vs '+esc(r.away||'?')+sc+'</div>'+
            '<div class="bh-meta">'+mp.join(' \u00B7 ')+esc(kickoff)+'</div>'+
          '</div>'+
          '<div class="bh-odds">@'+(nv(r.odds)>1?nv(r.odds).toFixed(2):'\u2014')+'</div>'+
        '</div>';
      }).join('');
      return'<div class="bh-dayg"><div class="bh-daylbl">'+esc(lbl)+'</div>'+mhtml+'</div>';
    }).join('');

    return hdr+pills+groups;
  }

  function pl(txt,col){return'<div class="bh-pill" style="color:'+col+'">'+txt+'</div>';}

  /* ════════════════════════════════════════════════════════════════════
     MAIN RENDER
  ═══════════════════════════════════════════════════════════════════ */
  var _last='';
  function render(){
    var root=document.getElementById('history21-root');
    if(!root)return;
    injectCss();
    _settledCache=null; // refresh settled cache
    var html;
    if(S.view==='drilldown'&&S.cat){
      html='<div class="bh-wrap">'+renderPeriodBar()+renderDrilldown()+'</div>';
    }else{
      html='<div class="bh-wrap">'+
        renderPeriodBar()+
        '<div class="bh-note">\uD83D\uDCCC Date din recomandarile reale ale motorului \u2014 identice cu filtrele din Meciuri.</div>'+
        renderSummary()+
        renderGrid()+
      '</div>';
    }
    if(html!==_last){root.innerHTML=html;_last=html;}
  }

  /* ════════════════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════════════ */
  window.batH={
    mode:function(m){
      S.mode=m;S.view='grid';S.cat=null;
      if(m==='days7')S.selDay=0;
      if(m==='weeks')S.selWeekIdx=-1;
      if(m==='month'){var now=new Date();S.month={y:now.getFullYear(),m:now.getMonth()};}
      if(m==='year') S.year=new Date().getFullYear();
      _last='';render();
    },
    day:  function(i){S.selDay=i;_last='';render();},
    week: function(i){S.selWeekIdx=i;_last='';render();},
    setWeeksMonth:function(v){var p=v.split('-');S.weeksMonth={y:parseInt(p[0]),m:parseInt(p[1])};S.selWeekIdx=-1;_last='';render();},
    setMonth:function(v){var p=v.split('-');S.month={y:parseInt(p[0]),m:parseInt(p[1])};_last='';render();},
    setYear: function(v){S.year=parseInt(v);_last='';render();},
    drill:function(k){
      S.cat=k;S.view='drilldown';_last='';render();
      var r=document.getElementById('history21-root');
      if(r&&r.scrollIntoView)r.scrollIntoView({behavior:'smooth',block:'start'});
    },
    back:function(){S.view='grid';S.cat=null;_last='';render();}
  };

  /* ════════════════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════════════ */
  function boot(){
    render();
    [300,900,2500,5000,12000].forEach(function(t){setTimeout(render,t);});
    setInterval(render,45000);
    window.renderHistory21=function(){_last='';render();};
    var orig=window.switchTab;
    if(typeof orig==='function'){
      window.switchTab=function(name){
        orig.apply(this,arguments);
        if(name==='istoric21'||name==='istoric'){_last='';setTimeout(render,80);setTimeout(render,600);}
      };
    }
    try{
      var root=document.getElementById('history21-root');
      if(root)new MutationObserver(function(){
        if(!root.querySelector('.bh-wrap')){_last='';render();}
      }).observe(root,{childList:true});
    }catch(e){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();

})();
