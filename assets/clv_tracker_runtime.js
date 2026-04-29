/**
 * clv_tracker_runtime.js — BetAnalytics Pro V3
 * =============================================
 * Încarcă și randează datele CLV în #tab-clv.
 * Panoul și butoanele sunt deja în index.html.
 * Versiune: 2026-04-29-v3
 */

(function () {
  "use strict";

  var CLV_DATA_URL = "./data/clv_tracker.json";
  var dataLoaded   = false;

  /* ── hook pe switchTab ──────────────────────────────────────────────────── */

  function hookSwitchTab() {
    if (typeof window.switchTab !== "function") {
      setTimeout(hookSwitchTab, 150);
      return;
    }
    var original = window.switchTab;
    window.switchTab = function (name) {
      original.apply(this, arguments);
      if (name === "clv" && !dataLoaded) {
        dataLoaded = true;
        setTimeout(loadCLVData, 100);
      }
    };
  }

  /* ── încărcare date ─────────────────────────────────────────────────────── */

  function loadCLVData() {
    var panel = document.getElementById("tab-clv");
    if (!panel) return;

    fetch(CLV_DATA_URL + "?v=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        panel.innerHTML = renderStyles() + renderCLV(data);
        hookFilters();
      })
      .catch(function (err) {
        panel.innerHTML = renderStyles() + renderError(err.message);
      });
  }

  /* ── render principal ───────────────────────────────────────────────────── */

  function renderCLV(data) {
    var s    = data.summary        || {};
    var diag = data.diagnosis      || {};
    var bm   = data.by_market      || {};
    var bkt  = data.clv_buckets    || {};
    var r30  = data.rolling_30d    || {};
    var r90  = data.rolling_90d    || {};
    var evc  = data.ev_correlation || {};
    var picks = data.picks         || [];

    return "<div class=\"clv-root\">" +
      "<div class=\"clv-header\">" +
        "<h2 class=\"clv-title\">📈 CLV Tracker — Closing Line Value</h2>" +
        "<span class=\"clv-updated\">Actualizat: " + fmtDate(data.updated_at) + "</span>" +
      "</div>" +
      renderDiagnosis(diag) +
      renderKPIs(s, r30) +
      renderBuckets(bkt) +
      renderByMarket(bm) +
      renderEVCorrelation(evc) +
      renderRolling(r30, r90) +
      renderPicksTable(picks) +
    "</div>";
  }

  /* ── componente ─────────────────────────────────────────────────────────── */

  function renderDiagnosis(diag) {
    var cls = {
      CLV_POSITIVE_ROI_POSITIVE:"diag-great",
      CLV_POSITIVE_ROI_NEGATIVE:"diag-ok",
      CLV_NEGATIVE_ROI_POSITIVE:"diag-warn",
      CLV_NEGATIVE_ROI_NEGATIVE:"diag-bad",
      INSUFFICIENT_DATA:"diag-info",
      NO_DATA:"diag-info"
    }[diag.signal] || "diag-info";

    var conf = {high:"✅ Înaltă",medium:"⚠️ Medie",low:"🔵 Scăzută"}[diag.confidence] || "";
    return "<div class=\"clv-card " + cls + "\">" +
      "<div class=\"diag-signal\">" + (diag.signal||"—") + "</div>" +
      "<p class=\"diag-text\">" + (diag.interpretation||"—") + "</p>" +
      "<p class=\"diag-action\"><strong>Acțiune:</strong> " + (diag.action||"—") + "</p>" +
      "<div class=\"diag-meta\"><span>Încredere: " + conf + "</span><span>Trend: " + (diag.rolling_trend||"—") + "</span></div>" +
    "</div>";
  }

  function renderKPIs(s, r30) {
    var kpis = [
      {label:"Avg CLV",    value:fmtSign(s.avg_clv_pct,2)+"%",    sub:"Median: "+fmtSign(s.median_clv_pct,2)+"%",           good:(s.avg_clv_pct||0)>=0},
      {label:"CLV+ Rate",  value:fmtPct(s.clv_positive_rate),      sub:(s.clv_positive_n||0)+" / "+(s.total_picks||0),       good:(s.clv_positive_rate||0)>=0.5},
      {label:"ROI Flat",   value:fmtSign(s.roi_flat_pct,2)+"%",    sub:(s.total_picks||0)+" settle-ate",                    good:(s.roi_flat_pct||0)>=0},
      {label:"Win Rate",   value:fmtNum(s.win_rate_pct,1)+"%",     sub:"CLV+ câștig: "+fmtSign(s.avg_clv_wins,2)+"%",       good:null},
      {label:"CLV 30 zile",value:r30.avg_clv_pct!=null?fmtSign(r30.avg_clv_pct,2)+"%":"N/A",
                            sub:r30.n?r30.n+" pick-uri | ROI: "+fmtSign(r30.roi_flat_pct,2)+"%":"Insuficient",              good:(r30.avg_clv_pct||0)>=0},
    ];
    var html = "<div class=\"kpi-row\">";
    kpis.forEach(function(k){
      html += "<div class=\"kpi-card "+(k.good===null?"":(k.good?"kpi-good":"kpi-bad"))+"\">" +
        "<div class=\"kpi-lbl\">" + k.label + "</div>" +
        "<div class=\"kpi-val\">" + k.value + "</div>" +
        "<div class=\"kpi-sub\">" + k.sub + "</div></div>";
    });
    return html + "</div>";
  }

  function renderBuckets(bkt) {
    var order  = ["clv_strong_pos","clv_mild_pos","clv_neutral","clv_mild_neg","clv_strong_neg"];
    var labels = {clv_strong_pos:"CLV ≥+5%",clv_mild_pos:"CLV 0–5%",clv_neutral:"CLV -1–0%",clv_mild_neg:"CLV -5– -1%",clv_strong_neg:"CLV ≤-5%"};
    var colors = {clv_strong_pos:"#22c55e",clv_mild_pos:"#86efac",clv_neutral:"#94a3b8",clv_mild_neg:"#fca5a5",clv_strong_neg:"#ef4444"};
    var rows = order.map(function(k){ var b=bkt[k]||{}; return {k:k,label:labels[k],n:b.n||0,wr:b.win_rate||0,roi:b.roi_pct||0,clv:b.avg_clv||0,color:colors[k]}; });
    var maxN = Math.max.apply(null,rows.map(function(r){return r.n;}).concat([1]));

    var html = "<div class=\"clv-card\"><h3 class=\"clv-st\">CLV Buckets — ROI & Win Rate per segment</h3>" +
      "<table class=\"clv-tbl\"><thead><tr><th>Segment</th><th>N</th><th>Win Rate</th><th>ROI</th><th>CLV med</th><th>Vol</th></tr></thead><tbody>";
    rows.forEach(function(r){
      html += "<tr><td><span class=\"bdot\" style=\"background:"+r.color+"\"></span>"+r.label+"</td>" +
        "<td class=\"tr\">"+r.n+"</td>" +
        "<td class=\"tr\">"+(r.n?fmtNum(r.wr,1)+"%":"—")+"</td>" +
        "<td class=\"tr "+(r.roi>=0?"pos":"neg")+"\">"+(r.n?fmtSign(r.roi,2)+"%":"—")+"</td>" +
        "<td class=\"tr "+(r.clv>=0?"pos":"neg")+"\">"+(r.n?fmtSign(r.clv,2)+"%":"—")+"</td>" +
        "<td><div class=\"bar-bg\"><div class=\"bar-f\" style=\"width:"+(r.n?Math.round(r.n/maxN*100):0)+"%;background:"+r.color+"\"></div></div></td></tr>";
    });
    return html + "</tbody></table><p class=\"clv-note\">💡 CLV+ → ROI+ corelat = edge real.</p></div>";
  }

  function renderByMarket(bm) {
    var markets = Object.entries(bm).sort(function(a,b){return Math.abs(b[1].avg_clv_pct)-Math.abs(a[1].avg_clv_pct);});
    if (!markets.length) return "";
    var html = "<div class=\"clv-card\"><h3 class=\"clv-st\">CLV per piață</h3>" +
      "<table class=\"clv-tbl\"><thead><tr><th>Piață</th><th>N</th><th>Avg CLV</th><th>CLV+%</th><th>Win Rate</th><th>ROI</th></tr></thead><tbody>";
    markets.forEach(function(m){
      var k=m[0]; var s=m[1];
      html += "<tr><td class=\"mk\">"+k+"</td><td class=\"tr\">"+s.n+"</td>" +
        "<td class=\"tr "+(s.avg_clv_pct>=0?"pos":"neg")+"\">"+fmtSign(s.avg_clv_pct,2)+"%</td>" +
        "<td class=\"tr\">"+fmtPct(s.clv_positive_rate)+"</td>" +
        "<td class=\"tr\">"+fmtNum(s.win_rate_pct,1)+"%</td>" +
        "<td class=\"tr "+(s.roi_flat_pct>=0?"pos":"neg")+"\">"+fmtSign(s.roi_flat_pct,2)+"%</td></tr>";
    });
    return html + "</tbody></table></div>";
  }

  function renderEVCorrelation(evc) {
    var ep=evc.ev_positive_picks||{}, en=evc.ev_negative_picks||{}, warn=evc.divergence_warning;
    return "<div class=\"clv-card"+(warn?" diag-warn":"")+"\">" +
      "<h3 class=\"clv-st\">Corelație EV vs CLV</h3>" +
      (warn?"<div class=\"warn-b\">⚠️ Divergență: EV+ dar CLV negativ constant. Modelul supraestimează edge-ul.</div>":"") +
      "<div class=\"two-col\">" +
        "<div class=\"corr-box "+((ep.avg_clv||0)>=0?"box-g":"box-r")+"\">" +
          "<div class=\"box-lbl\">Pick-uri EV+</div><div class=\"box-n\">N = "+(ep.n||0)+"</div>" +
          "<div class=\"box-val\">CLV: <strong>"+(ep.avg_clv!=null?fmtSign(ep.avg_clv,2)+"%":"—")+"</strong></div>" +
          "<div class=\"box-sub\">CLV+ rate: "+fmtPct(ep.clv_positive_rate)+"</div>" +
        "</div>" +
        "<div class=\"corr-box "+((en.avg_clv||0)>=0?"box-g":"box-r")+"\">" +
          "<div class=\"box-lbl\">Pick-uri EV≤0</div><div class=\"box-n\">N = "+(en.n||0)+"</div>" +
          "<div class=\"box-val\">CLV: <strong>"+(en.avg_clv!=null?fmtSign(en.avg_clv,2)+"%":"—")+"</strong></div>" +
          "<div class=\"box-sub\">CLV+ rate: "+fmtPct(en.clv_positive_rate)+"</div>" +
        "</div>" +
      "</div>" +
      "<p class=\"clv-note\">EV+ ar trebui să aibă CLV mai mare decât EV−. Dacă nu, recalibrează probabilitățile.</p></div>";
  }

  function renderRolling(r30, r90) {
    return "<div class=\"clv-card\"><h3 class=\"clv-st\">Trend CLV — rolling</h3>" +
      "<div class=\"rolling-g\">" + rBox("Ultimele 30 zile",r30) + rBox("Ultimele 90 zile",r90) + "</div></div>";
  }

  function rBox(label, r) {
    if (!r||!r.n) return "<div class=\"rbox\"><div class=\"rbox-lbl\">"+label+"</div><div class=\"rbox-na\">Date insuficiente</div></div>";
    return "<div class=\"rbox\"><div class=\"rbox-lbl\">"+label+"</div>" +
      "<div class=\"rrow\"><span class=\"rk\">Avg CLV</span><span class=\"rv "+((r.avg_clv_pct||0)>=0?"pos":"neg")+"\">"+fmtSign(r.avg_clv_pct,2)+"%</span></div>" +
      "<div class=\"rrow\"><span class=\"rk\">Win Rate</span><span class=\"rv\">"+fmtNum(r.win_rate_pct,1)+"%</span></div>" +
      "<div class=\"rrow\"><span class=\"rk\">ROI Flat</span><span class=\"rv "+((r.roi_flat_pct||0)>=0?"pos":"neg")+"\">"+fmtSign(r.roi_flat_pct,2)+"%</span></div>" +
      "<div class=\"rrow\"><span class=\"rk\">N pick-uri</span><span class=\"rv\">"+r.n+"</span></div></div>";
  }

  function renderPicksTable(picks) {
    if (!picks.length) return "";
    window.__clvAllPicks = picks.slice(0,200);
    var mks = picks.map(function(p){return p.market;}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort();
    return "<div class=\"clv-card\">" +
      "<h3 class=\"clv-st\">Pick-uri individuale ("+picks.length+" total)" +
        "<span class=\"p-filters\">" +
          "<select id=\"clf-m\" class=\"clv-sel\"><option value=\"\">Toate piețele</option>" +
            mks.map(function(m){return "<option value=\""+m+"\">"+m+"</option>";}).join("")+"</select>" +
          "<select id=\"clf-r\" class=\"clv-sel\"><option value=\"\">Toate</option><option value=\"win\">Câștig</option><option value=\"lose\">Pierdere</option></select>" +
          "<select id=\"clf-c\" class=\"clv-sel\"><option value=\"\">Orice CLV</option><option value=\"pos\">CLV+</option><option value=\"neg\">CLV−</option></select>" +
        "</span></h3>" +
      "<div class=\"picks-wrap\"><table class=\"clv-tbl\">" +
        "<thead><tr><th>Data</th><th>Meci</th><th>Piață</th><th>Pick</th><th>Closing</th><th>CLV%</th><th>EV%</th><th>Rez</th></tr></thead>" +
        "<tbody id=\"clv-pb\">"+renderRows(picks.slice(0,200))+"</tbody>" +
      "</table></div>" +
      (picks.length>200?"<p class=\"clv-note\">Afișate 200 din "+picks.length+". Filtrează.</p>":"") +
    "</div>";
  }

  function renderRows(picks) {
    return picks.map(function(p){
      return "<tr>" +
        "<td class=\"dt\">"+(p.date||"—")+"</td>" +
        "<td class=\"mt\" title=\""+p.home+" vs "+p.away+"\">"+short(p.home,12)+" — "+short(p.away,12)+"</td>" +
        "<td class=\"mk\">"+p.market+"</td>" +
        "<td class=\"tr\">"+fmtNum(p.picked_odds,2)+"</td>" +
        "<td class=\"tr\">"+fmtNum(p.closing_odds,2)+"</td>" +
        "<td class=\"tr "+(p.clv_pct>=0?"pos":"neg")+"\">"+fmtSign(p.clv_pct,2)+"%</td>" +
        "<td class=\"tr "+((p.ev_at_pick_pct||0)>=0?"pos":"neg")+"\">"+(p.ev_at_pick_pct!=null?fmtSign(p.ev_at_pick_pct,2)+"%":"—")+"</td>" +
        "<td class=\"rc "+(p.won?"win":"lose")+"\">"+(p.won?"✅":"❌")+"</td></tr>";
    }).join("");
  }

  function hookFilters() {
    ["clf-m","clf-r","clf-c"].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.addEventListener("change", applyFilters);
    });
  }

  function applyFilters() {
    var mk=(document.getElementById("clf-m")||{}).value||"";
    var res=(document.getElementById("clf-r")||{}).value||"";
    var clv=(document.getElementById("clf-c")||{}).value||"";
    var f=window.__clvAllPicks||[];
    if(mk)  f=f.filter(function(p){return p.market===mk;});
    if(res) f=f.filter(function(p){return res==="win"?p.won:!p.won;});
    if(clv==="pos") f=f.filter(function(p){return p.clv_pct>=0;});
    if(clv==="neg") f=f.filter(function(p){return p.clv_pct<0;});
    var tb=document.getElementById("clv-pb");
    if(tb) tb.innerHTML=renderRows(f);
  }

  /* ── stiluri ────────────────────────────────────────────────────────────── */

  function renderStyles() {
    if (document.getElementById("clv-styles")) return "";
    return "<style id=\"clv-styles\">" +
      "@keyframes clvspin{to{transform:rotate(360deg)}}" +
      ".clv-root{padding:14px;max-width:900px;margin:0 auto}" +
      ".clv-header{margin-bottom:14px}" +
      ".clv-title{font-size:1.2rem;font-weight:700;margin:0 0 3px}" +
      ".clv-updated{font-size:.7rem;color:var(--muted,#64748b)}" +
      ".clv-card{background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:16px;padding:14px;margin-bottom:14px}" +
      ".clv-st{font-size:.92rem;font-weight:600;margin:0 0 11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".clv-note{font-size:.73rem;color:var(--muted,#64748b);margin:8px 0 0}" +
      ".diag-signal{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-bottom:4px}" +
      ".diag-text{margin:0 0 6px;font-size:.88rem;line-height:1.5}" +
      ".diag-action{margin:0 0 7px;font-size:.83rem}" +
      ".diag-meta{display:flex;gap:12px;font-size:.73rem;color:var(--muted,#64748b)}" +
      ".diag-great{border-left:4px solid #22c55e;background:rgba(34,197,94,.07)}" +
      ".diag-ok{border-left:4px solid #f59e0b;background:rgba(245,158,11,.07)}" +
      ".diag-warn{border-left:4px solid #f97316;background:rgba(249,115,22,.07)}" +
      ".diag-bad{border-left:4px solid #ef4444;background:rgba(239,68,68,.07)}" +
      ".diag-info{border-left:4px solid #3b82f6;background:rgba(59,130,246,.07)}" +
      ".kpi-row{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}" +
      ".kpi-card{flex:1;min-width:110px;background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:12px;padding:10px}" +
      ".kpi-lbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b);margin-bottom:3px}" +
      ".kpi-val{font-size:1.25rem;font-weight:700;margin-bottom:2px}" +
      ".kpi-sub{font-size:.65rem;color:var(--muted,#64748b)}" +
      ".kpi-good .kpi-val{color:#22c55e}" +
      ".kpi-bad  .kpi-val{color:#ef4444}" +
      ".clv-tbl{width:100%;border-collapse:collapse;font-size:.8rem}" +
      ".clv-tbl th{text-align:left;padding:6px 4px;border-bottom:1px solid var(--brd,#1e293b);font-size:.67rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b)}" +
      ".clv-tbl td{padding:5px 4px;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".clv-tbl tr:last-child td{border-bottom:none}" +
      ".tr{text-align:right;font-variant-numeric:tabular-nums}" +
      ".pos{color:#22c55e;font-weight:600}" +
      ".neg{color:#ef4444;font-weight:600}" +
      ".bdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}" +
      ".bar-bg{background:rgba(255,255,255,.06);border-radius:3px;height:6px;min-width:40px}" +
      ".bar-f{height:6px;border-radius:3px}" +
      ".two-col{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:7px}" +
      ".corr-box{border-radius:8px;padding:11px;text-align:center}" +
      ".box-g{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25)}" +
      ".box-r{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25)}" +
      ".box-lbl{font-size:.72rem;font-weight:600;color:var(--muted,#94a3b8);margin-bottom:2px}" +
      ".box-n{font-size:.68rem;color:var(--muted,#64748b);margin-bottom:4px}" +
      ".box-val{font-size:.95rem}" +
      ".box-sub{font-size:.68rem;color:var(--muted,#94a3b8);margin-top:2px}" +
      ".warn-b{background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.35);border-radius:6px;padding:7px 10px;font-size:.8rem;margin-bottom:10px}" +
      ".rolling-g{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
      ".rbox{background:rgba(255,255,255,.02);border-radius:8px;padding:10px;border:1px solid var(--brd,#1e293b)}" +
      ".rbox-lbl{font-weight:600;margin-bottom:7px;font-size:.82rem;color:#cbd5e1}" +
      ".rrow{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".rrow:last-child{border-bottom:none}" +
      ".rk{font-size:.73rem;color:var(--muted,#94a3b8)}" +
      ".rv{font-size:.78rem;font-weight:600}" +
      ".rbox-na{color:var(--muted,#64748b);font-size:.8rem}" +
      ".picks-wrap{overflow-x:auto;max-height:360px;overflow-y:auto}" +
      ".p-filters{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}" +
      ".clv-sel{background:var(--card,#0f172a);border:1px solid var(--brd,#1e293b);border-radius:6px;padding:3px 6px;font-size:.72rem;color:inherit}" +
      ".dt{font-size:.72rem;white-space:nowrap;color:var(--muted,#94a3b8)}" +
      ".mt{font-size:.72rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".mk{font-weight:600;font-size:.76rem}" +
      ".rc{text-align:center}" +
      ".rc.win{color:#22c55e}" +
      ".rc.lose{color:#ef4444}" +
      ".clv-err{text-align:center;padding:40px;color:#ef4444}" +
      ".clv-ehint{font-size:.78rem;color:var(--muted,#94a3b8);margin-top:5px}" +
      "@media(max-width:520px){.kpi-row{flex-direction:column}.two-col,.rolling-g{grid-template-columns:1fr}}" +
    "</style>";
  }

  function renderError(msg) {
    return "<div class=\"clv-err\">⚠️ Nu s-au putut încărca datele CLV." +
      "<div class=\"clv-ehint\">" + msg + "</div>" +
      "<div class=\"clv-ehint\">Rulați <code>build_clv_tracker.py</code> mai întâi.</div></div>";
  }

  /* ── formatare ──────────────────────────────────────────────────────────── */

  function fmtNum(v,d){if(v==null)return"—";return Number(v).toFixed(d||2);}
  function fmtSign(v,d){if(v==null)return"—";var n=Number(v);return(n>=0?"+":"")+n.toFixed(d||2);}
  function fmtPct(v){if(v==null)return"—";return(Number(v)*100).toFixed(1)+"%";}
  function fmtDate(iso){if(!iso)return"—";try{return new Date(iso).toLocaleString("ro-RO",{dateStyle:"short",timeStyle:"short"});}catch(e){return iso.slice(0,16);}}
  function short(s,max){if(!s)return"—";max=max||13;return s.length>max?s.slice(0,max-1)+"…":s;}

  /* ── start ──────────────────────────────────────────────────────────────── */

  hookSwitchTab();

})();
