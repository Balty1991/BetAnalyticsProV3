/**
 * clv_tracker_runtime.js — V6
 * ===========================
 * Sursa de date: cele 3 storages din stats_meciuri.js (pick-uri salvate manual)
 *   - veyra_monitor_v4       = Meciuri picks salvate manual
 *   - veyra_apex_monitor_v2  = APEX picks salvate manual
 *   - veyra_ml5_monitor_v2   = ML5 picks salvate manual
 * CLV (from_open_pct) e obtinut prin match cu RECOMMENDATION_LOG acolo unde exista.
 * Structura entry: { home, away, bestBet(market), odds, eventDate, status:'win'/'loss'/'pending' }
 */

(function () {
  "use strict";

  var MECIURI_KEY = "veyra_monitor_v4";
  var APEX_KEY    = "veyra_apex_monitor_v2";
  var ML5_KEY     = "veyra_ml5_monitor_v2";
  var RESET_KEY   = "veyra_stats_start_date";

  /* ── hook pe switchTab ──────────────────────────────────────────────────── */

  function hookSwitchTab() {
    if (typeof window.switchTab !== "function") { setTimeout(hookSwitchTab, 150); return; }
    var original = window.switchTab;
    window.switchTab = function (name) {
      original.apply(this, arguments);
      if (name === "clv") setTimeout(renderCLVTab, 80);
    };
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */

  function getStartDate() {
    try { return localStorage.getItem(RESET_KEY) || null; } catch(e) { return null; }
  }

  function afterStart(dateStr) {
    var start = getStartDate();
    if (!start) return true;
    return (dateStr || "").slice(0, 10) >= start.slice(0, 10);
  }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce(function(s, v){ return s + v; }, 0) / arr.length;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function(a,b){ return a-b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
  }

  /* ── incarcare picks din toate 3 surse ─────────────────────────────────── */

  function loadAllPicks() {
    function loadObj(key) {
      try {
        var raw = JSON.parse(localStorage.getItem(key) || "{}");
        if (raw && typeof raw === "object" && !Array.isArray(raw)) return Object.keys(raw).map(function(k){ return raw[k]; }).filter(Boolean);
        if (Array.isArray(raw)) return raw;
        return [];
      } catch(e) { return []; }
    }

    function wonFromStatus(s) {
      if (s === "win"  || s === "won")  return true;
      if (s === "loss" || s === "lost") return false;
      return null;
    }

    function toUnified(src, arr) {
      return arr.filter(function(e) {
        return afterStart((e.eventDate || e.event_date || e.savedAt || "").slice(0,10));
      }).map(function(e) {
        return {
          source: src,
          date:   (e.eventDate || e.event_date || e.savedAt || "").slice(0,10),
          home:   String(e.home || "").trim(),
          away:   String(e.away || "").trim(),
          market: String(e.bestBet || e.marketKey || e.market || "unknown"),
          odds:   Number(e.odds || e.cota || 0) || 0,
          won:    wonFromStatus(e.status || ""),
          from_open_pct: null,
          edge_pct: null
        };
      });
    }

    return toUnified("apex",    loadObj(MECIURI_KEY))
      .concat(toUnified("apex",   loadObj(APEX_KEY)))
      .concat(toUnified("ml5",    loadObj(ML5_KEY)));
  }

  /* ── imbogatie cu CLV din RECOMMENDATION_LOG ────────────────────────────── */

  function enrichWithCLV(picks) {
    var log = Array.isArray(window.RECOMMENDATION_LOG) ? window.RECOMMENDATION_LOG : [];
    if (!log.length) return picks;

    var lookup = {};
    log.forEach(function(r) {
      if (r.from_open_pct == null) return;
      var d  = (r.date || r.event_date || "").slice(0,10);
      var mkt = norm(r.market_key || r.market || "");
      var key = norm(r.home) + "|" + norm(r.away) + "|" + d + "|" + mkt;
      if (!lookup[key]) lookup[key] = r;
    });

    return picks.map(function(p) {
      var key = norm(p.home) + "|" + norm(p.away) + "|" + p.date + "|" + norm(p.market || "");
      var match = lookup[key];
      if (match) {
        p.from_open_pct = match.from_open_pct;
        if (p.edge_pct == null && match.edge_pct != null) p.edge_pct = match.edge_pct;
      }
      return p;
    });
  }

  /* ── build data ─────────────────────────────────────────────────────────── */

  function buildData() {
    var all     = enrichWithCLV(loadAllPicks());
    var settled = all.filter(function(e){ return e.won !== null; });
    var pending = all.filter(function(e){ return e.won === null; });

    if (!all.length) return null;

    var wins = settled.filter(function(e){ return e.won === true; });
    var roiSum = 0;
    settled.forEach(function(e){ roiSum += e.won ? (e.odds - 1) : -1; });
    var roi_flat_pct   = settled.length ? roiSum / settled.length * 100 : 0;
    var win_rate_pct   = settled.length ? wins.length / settled.length * 100 : 0;

    // CLV subset
    var clvE   = settled.filter(function(e){ return e.from_open_pct != null; });
    var clvPcts = clvE.map(function(e){ return e.from_open_pct; });
    var avg_clv_pct    = clvE.length ? avg(clvPcts) : null;
    var median_clv_pct = clvE.length ? median(clvPcts) : null;
    var clv_positive_n = clvPcts.filter(function(v){ return v >= 0; }).length;
    var clv_positive_rate = clvE.length ? clv_positive_n / clvE.length : null;
    var clvWins = clvE.filter(function(e){ return e.won === true; });
    var avg_clv_wins = clvWins.length ? avg(clvWins.map(function(e){ return e.from_open_pct; })) : null;

    // By source
    var sources = ["apex","claude","ml5"];
    var srcLabels = { apex:"APEX", claude:"Claude", ml5:"ML5" };
    var bySource = {};
    sources.forEach(function(s){ bySource[s] = { n:0, wins:0, roiS:0 }; });
    settled.forEach(function(e) {
      var b = bySource[e.source] || (bySource[e.source] = { n:0, wins:0, roiS:0 });
      b.n++;
      if (e.won) { b.wins++; b.roiS += e.odds - 1; }
      else b.roiS -= 1;
    });

    // By market
    var bmMap = {};
    settled.forEach(function(e) {
      var k = e.market || "unknown";
      if (!bmMap[k]) bmMap[k] = { n:0, wins:0, roiS:0, clvS:0, clvN:0 };
      bmMap[k].n++;
      if (e.won) { bmMap[k].wins++; bmMap[k].roiS += e.odds - 1; }
      else bmMap[k].roiS -= 1;
      if (e.from_open_pct != null) { bmMap[k].clvS += e.from_open_pct; bmMap[k].clvN++; }
    });
    var by_market = {};
    Object.keys(bmMap).forEach(function(k) {
      var m = bmMap[k];
      by_market[k] = {
        n:   m.n,
        avg_clv_pct:       m.clvN ? m.clvS / m.clvN : null,
        clv_positive_rate: m.clvN ? m.clvS / m.clvN >= 0 ? 1 : 0 : null,
        win_rate_pct:      m.wins / m.n * 100,
        roi_flat_pct:      m.roiS / m.n * 100
      };
    });

    // CLV buckets
    var bktFn = {
      clv_strong_pos: function(v){ return v >= 5; },
      clv_mild_pos:   function(v){ return v >= 0 && v < 5; },
      clv_neutral:    function(v){ return v >= -1 && v < 0; },
      clv_mild_neg:   function(v){ return v >= -5 && v < -1; },
      clv_strong_neg: function(v){ return v < -5; }
    };
    var bktMap = {};
    Object.keys(bktFn).forEach(function(k){ bktMap[k] = { n:0, wins:0, roiS:0, clvS:0 }; });
    clvE.forEach(function(e) {
      var c = e.from_open_pct;
      Object.keys(bktFn).forEach(function(k){
        if (bktFn[k](c)) {
          bktMap[k].n++;
          bktMap[k].clvS += c;
          if (e.won) { bktMap[k].wins++; bktMap[k].roiS += e.odds - 1; }
          else bktMap[k].roiS -= 1;
        }
      });
    });
    var clv_buckets = {};
    Object.keys(bktMap).forEach(function(k) {
      var b = bktMap[k];
      if (!b.n) return;
      clv_buckets[k] = { n:b.n, win_rate:b.wins/b.n*100, roi_pct:b.roiS/b.n*100, avg_clv:b.clvS/b.n };
    });

    // Rolling stats
    function rollingStats(ents, days) {
      var cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
      var sub = ents.filter(function(e){ return e.date >= cutoff; });
      if (!sub.length) return { n:0 };
      var clvSub = sub.filter(function(e){ return e.from_open_pct != null; });
      var rs = 0;
      sub.forEach(function(e){ rs += e.won ? (e.odds-1) : -1; });
      return {
        n:             sub.length,
        avg_clv_pct:   clvSub.length ? avg(clvSub.map(function(e){ return e.from_open_pct; })) : null,
        win_rate_pct:  sub.filter(function(e){ return e.won; }).length / sub.length * 100,
        roi_flat_pct:  rs / sub.length * 100
      };
    }

    // Diagnosis
    var signal = "INSUFFICIENT_DATA";
    if (clvE.length >= 5 && avg_clv_pct != null) {
      signal = avg_clv_pct >= 0 && roi_flat_pct >= 0 ? "CLV_POSITIVE_ROI_POSITIVE"
        : avg_clv_pct >= 0 ? "CLV_POSITIVE_ROI_NEGATIVE"
        : roi_flat_pct >= 0 ? "CLV_NEGATIVE_ROI_POSITIVE"
        : "CLV_NEGATIVE_ROI_NEGATIVE";
    } else if (settled.length >= 5) {
      signal = roi_flat_pct >= 0 ? "ROI_POSITIVE" : "ROI_NEGATIVE";
    }
    var interps = {
      CLV_POSITIVE_ROI_POSITIVE: "Selectezi cote mai bune decat linia initiala si ai ROI pozitiv. Edge real.",
      CLV_POSITIVE_ROI_NEGATIVE: "Cote bune vs linie, dar ROI negativ. Posibil variance pe esantion mic.",
      CLV_NEGATIVE_ROI_POSITIVE: "ROI pozitiv dar cotele s-au scurtat. Verifica daca e noroc sau sistem.",
      CLV_NEGATIVE_ROI_NEGATIVE: "Cote scurtate si ROI negativ. Revizuieste criteriile de selectie.",
      ROI_POSITIVE: "ROI pozitiv pe picks salvate. Date CLV insuficiente pentru analiza completa.",
      ROI_NEGATIVE: "ROI negativ. Continua sa salvezi picks pentru o analiza mai concludenta.",
      INSUFFICIENT_DATA: "Date insuficiente. Salveaza picks din APEX, Claude si ML5 pentru analiza."
    };
    var actions = {
      CLV_POSITIVE_ROI_POSITIVE: "Continua strategia actuala.",
      CLV_POSITIVE_ROI_NEGATIVE: "Continua, reevalueaza dupa 30+ picks.",
      CLV_NEGATIVE_ROI_POSITIVE: "Analizeaza daca ROI+ e sustenabil fara CLV+.",
      CLV_NEGATIVE_ROI_NEGATIVE: "Evita pietele cu CLV constant negativ.",
      ROI_POSITIVE: "Bun inceput — continua sa salvezi picks pentru istoric.",
      ROI_NEGATIVE: "Revizuieste selectiile sau asteapta mai mult volum.",
      INSUFFICIENT_DATA: "Apasa Salveaza pe pick-urile APEX, Claude si ML5."
    };

    // Picks list for table (recent first)
    var picks = all.slice().sort(function(a,b){ return b.date.localeCompare(a.date); })
      .slice(0, 200)
      .map(function(e) {
        return {
          date:           e.date,
          home:           e.home,
          away:           e.away,
          source:         e.source,
          market:         e.market,
          picked_odds:    e.odds,
          clv_pct:        e.from_open_pct,
          ev_at_pick_pct: e.edge_pct,
          won:            e.won,
          pending:        e.won === null
        };
      });

    var startD = getStartDate();
    var note = all.length + " pick-uri salvate (" + pending.length + " in asteptare, " + settled.length + " decontate)";
    if (startD) note += " · din " + startD.slice(0,10);
    if (clvE.length) note += " · " + clvE.length + " cu CLV";

    return {
      summary: {
        total:              all.length,
        settled:            settled.length,
        pending:            pending.length,
        win_rate_pct:       win_rate_pct,
        roi_flat_pct:       roi_flat_pct,
        avg_clv_pct:        avg_clv_pct,
        median_clv_pct:     median_clv_pct,
        clv_positive_rate:  clv_positive_rate,
        clv_positive_n:     clv_positive_n,
        avg_clv_wins:       avg_clv_wins,
        total_picks:        clvE.length,
        clv_available:      clvE.length
      },
      by_source: bySource,
      by_market: by_market,
      clv_buckets: clv_buckets,
      rolling_30d: rollingStats(settled, 30),
      rolling_90d: rollingStats(settled, 90),
      diagnosis: {
        signal:         signal,
        interpretation: interps[signal],
        action:         actions[signal],
        confidence:     settled.length >= 30 ? "high" : settled.length >= 10 ? "medium" : "low"
      },
      picks:       picks,
      updated_at:  new Date().toISOString(),
      _note:       note
    };
  }

  /* ── render ─────────────────────────────────────────────────────────────── */

  function renderCLVTab() {
    var panel = document.getElementById("tab-clv");
    if (!panel) return;

    var data = buildData();
    if (!data) {
      var startD = getStartDate();
      panel.innerHTML = renderStyles() +
        "<div style=\"text-align:center;padding:50px 20px;color:var(--muted,#64748b)\">" +
        "<div style=\"font-size:15px;font-weight:700;margin-bottom:8px\">Nu exista pick-uri salvate" +
        (startD ? " din " + startD.slice(0,10) : "") + "</div>" +
        "<div style=\"font-size:12px\">Salveaza picks din APEX, Claude AI si ML5 pentru tracking.</div>" +
        "</div>";
      return;
    }

    panel.innerHTML = renderStyles() + renderMain(data);
    hookFilters(data.picks);
  }

  function renderMain(data) {
    var s = data.summary;
    return "<div class=\"clv-root\">" +
      "<div class=\"clv-header\">" +
        "<h2 class=\"clv-title\">Performanta Picks</h2>" +
        "<span class=\"clv-updated\">" + data._note + "</span>" +
      "</div>" +
      renderDiagnosis(data.diagnosis) +
      renderOverall(s) +
      renderBySource(data.by_source) +
      (s.clv_available >= 3 ? renderCLVSection(s, data.clv_buckets) : "") +
      renderByMarket(data.by_market) +
      renderRolling(data.rolling_30d, data.rolling_90d) +
      renderPicksTable(data.picks) +
    "</div>";
  }

  function renderDiagnosis(diag) {
    var cls = {
      CLV_POSITIVE_ROI_POSITIVE:"diag-great", CLV_POSITIVE_ROI_NEGATIVE:"diag-ok",
      CLV_NEGATIVE_ROI_POSITIVE:"diag-warn", CLV_NEGATIVE_ROI_NEGATIVE:"diag-bad",
      ROI_POSITIVE:"diag-great", ROI_NEGATIVE:"diag-bad",
      INSUFFICIENT_DATA:"diag-info"
    }[diag.signal] || "diag-info";
    var conf = {high:"Inalta",medium:"Medie",low:"Scazuta"}[diag.confidence] || "";
    return "<div class=\"clv-card " + cls + "\">" +
      "<div class=\"diag-signal\">" + diag.signal + "</div>" +
      "<p class=\"diag-text\">" + diag.interpretation + "</p>" +
      "<p class=\"diag-action\"><strong>Actiune:</strong> " + diag.action + "</p>" +
      "<div class=\"diag-meta\"><span>Incredere: " + conf + "</span></div>" +
    "</div>";
  }

  function renderOverall(s) {
    var kpis = [
      { label:"Total picks",   value:s.total,     sub:s.settled+" decontate",   good:null },
      { label:"Win Rate",      value:s.settled?fmtNum(s.win_rate_pct,1)+"%":"—",  sub:s.settled+" settle-ate",  good:s.settled?(s.win_rate_pct||0)>=55:null },
      { label:"ROI Flat",      value:s.settled?fmtSign(s.roi_flat_pct,1)+"%":"—", sub:"pe "+s.settled+" picks", good:s.settled?(s.roi_flat_pct||0)>=0:null },
      { label:"In asteptare",  value:s.pending,   sub:"pending",                  good:null },
      { label:"CLV disponibil",value:s.clv_available>0?s.clv_available+" picks":"—", sub:"din APEX matchat",  good:null }
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

  function renderBySource(bySource) {
    var srcMeta = {
      apex:   { label:"APEX (Motor AI)", color:"#818cf8" },
      claude: { label:"Claude AI",       color:"#2BE5C5" },
      ml5:    { label:"ML5",             color:"#22c55e" }
    };
    var html = "<div class=\"clv-card\"><h3 class=\"clv-st\">Performanta per sursa</h3>" +
      "<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:9px\">";
    ["apex","claude","ml5"].forEach(function(k) {
      var m = srcMeta[k]; var b = bySource[k] || { n:0, wins:0, roiS:0 };
      var wr  = b.n ? Math.round(b.wins/b.n*100) : 0;
      var roi = b.n ? Math.round(b.roiS/b.n*100) : 0;
      html += "<div style=\"background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px;text-align:center\">" +
        "<div style=\"font-size:10px;font-weight:800;color:" + m.color + ";margin-bottom:5px\">" + m.label + "</div>" +
        "<div style=\"font-size:17px;font-weight:900;color:" + m.color + "\">" + (b.n ? wr+"%" : "—") + "</div>" +
        "<div style=\"font-size:9px;color:var(--muted)\">" + b.n + " picks</div>" +
        (b.n ? "<div style=\"font-size:10px;font-weight:700;color:" + (roi>=0?"#22c55e":"#ef4444") + ";margin-top:3px\">" + (roi>=0?"+":"") + roi + "% ROI</div>" : "") +
      "</div>";
    });
    return html + "</div></div>";
  }

  function renderCLVSection(s, clv_buckets) {
    var order  = ["clv_strong_pos","clv_mild_pos","clv_neutral","clv_mild_neg","clv_strong_neg"];
    var labels = {clv_strong_pos:"CLV >=+5%",clv_mild_pos:"CLV 0-5%",clv_neutral:"CLV -1-0%",clv_mild_neg:"CLV -5--1%",clv_strong_neg:"CLV <=-5%"};
    var colors = {clv_strong_pos:"#22c55e",clv_mild_pos:"#86efac",clv_neutral:"#94a3b8",clv_mild_neg:"#fca5a5",clv_strong_neg:"#ef4444"};
    var rows   = order.map(function(k){ var b=clv_buckets[k]||{}; return {k:k,label:labels[k],n:b.n||0,wr:b.win_rate||0,roi:b.roi_pct||0,clv:b.avg_clv||0,color:colors[k]}; });
    var maxN   = Math.max.apply(null, rows.map(function(r){ return r.n; }).concat([1]));

    var kpiHtml = "<div class=\"kpi-row\">" +
      "<div class=\"kpi-card "+(s.avg_clv_pct!=null&&s.avg_clv_pct>=0?"kpi-good":"kpi-bad")+"\">" +
        "<div class=\"kpi-lbl\">Avg CLV</div>" +
        "<div class=\"kpi-val\">" + (s.avg_clv_pct!=null?fmtSign(s.avg_clv_pct,2)+"%":"—") + "</div>" +
        "<div class=\"kpi-sub\">" + s.clv_available + " picks cu date</div></div>" +
      "<div class=\"kpi-card "+(s.clv_positive_rate!=null&&s.clv_positive_rate>=0.5?"kpi-good":"kpi-bad")+"\">" +
        "<div class=\"kpi-lbl\">CLV+ Rate</div>" +
        "<div class=\"kpi-val\">" + (s.clv_positive_rate!=null?fmtPct(s.clv_positive_rate):"—") + "</div>" +
        "<div class=\"kpi-sub\">" + s.clv_positive_n + " / " + s.clv_available + "</div></div>" +
    "</div>";

    var bktHtml = "<div class=\"clv-card\"><h3 class=\"clv-st\">CLV Buckets (picks APEX matchate)</h3>" +
      kpiHtml +
      "<table class=\"clv-tbl\"><thead><tr><th>Segment</th><th>N</th><th>Win%</th><th>ROI</th><th>CLV med</th><th>Vol</th></tr></thead><tbody>";
    rows.forEach(function(r){
      bktHtml += "<tr><td><span class=\"bdot\" style=\"background:"+r.color+"\"></span>"+r.label+"</td>" +
        "<td class=\"tr\">"+r.n+"</td>" +
        "<td class=\"tr\">"+(r.n?fmtNum(r.wr,1)+"%":"—")+"</td>" +
        "<td class=\"tr "+(r.roi>=0?"pos":"neg")+"\">"+(r.n?fmtSign(r.roi,2)+"%":"—")+"</td>" +
        "<td class=\"tr "+(r.clv>=0?"pos":"neg")+"\">"+(r.n?fmtSign(r.clv,2)+"%":"—")+"</td>" +
        "<td><div class=\"bar-bg\"><div class=\"bar-f\" style=\"width:"+(r.n?Math.round(r.n/maxN*100):0)+"%;background:"+r.color+"\"></div></div></td></tr>";
    });
    return bktHtml + "</tbody></table><p class=\"clv-note\">CLV calculat prin match cu RECOMMENDATION_LOG (cota pick vs cota initiala piata).</p></div>";
  }

  function renderByMarket(bm) {
    var markets = Object.keys(bm).sort(function(a,b){ return bm[b].n - bm[a].n; });
    if (!markets.length) return "";
    var html = "<div class=\"clv-card\"><h3 class=\"clv-st\">Performanta per piata</h3>" +
      "<table class=\"clv-tbl\"><thead><tr><th>Piata</th><th>N</th><th>Win%</th><th>ROI</th></tr></thead><tbody>";
    markets.forEach(function(k) {
      var s = bm[k];
      html += "<tr><td class=\"mk\">"+k+"</td><td class=\"tr\">"+s.n+"</td>" +
        "<td class=\"tr\">"+fmtNum(s.win_rate_pct,1)+"%</td>" +
        "<td class=\"tr "+(s.roi_flat_pct>=0?"pos":"neg")+"\">"+fmtSign(s.roi_flat_pct,2)+"%</td></tr>";
    });
    return html + "</tbody></table></div>";
  }

  function renderRolling(r30, r90) {
    return "<div class=\"clv-card\"><h3 class=\"clv-st\">Trend rolling</h3>" +
      "<div class=\"rolling-g\">" + rBox("Ultimele 30 zile",r30) + rBox("Ultimele 90 zile",r90) + "</div></div>";
  }

  function rBox(label, r) {
    if (!r || !r.n) return "<div class=\"rbox\"><div class=\"rbox-lbl\">"+label+"</div><div class=\"rbox-na\">Date insuficiente</div></div>";
    return "<div class=\"rbox\"><div class=\"rbox-lbl\">"+label+"</div>" +
      (r.avg_clv_pct!=null?"<div class=\"rrow\"><span class=\"rk\">Avg CLV</span><span class=\"rv "+((r.avg_clv_pct||0)>=0?"pos":"neg")+"\">"+fmtSign(r.avg_clv_pct,2)+"%</span></div>":"") +
      "<div class=\"rrow\"><span class=\"rk\">Win Rate</span><span class=\"rv\">"+fmtNum(r.win_rate_pct,1)+"%</span></div>" +
      "<div class=\"rrow\"><span class=\"rk\">ROI Flat</span><span class=\"rv "+((r.roi_flat_pct||0)>=0?"pos":"neg")+"\">"+fmtSign(r.roi_flat_pct,2)+"%</span></div>" +
      "<div class=\"rrow\"><span class=\"rk\">N picks</span><span class=\"rv\">"+r.n+"</span></div></div>";
  }

  function renderPicksTable(picks) {
    if (!picks.length) return "";
    window.__clvAllPicks = picks;
    var mks = picks.map(function(p){ return p.market; })
      .filter(function(v,i,a){ return a.indexOf(v)===i; }).sort();
    return "<div class=\"clv-card\">" +
      "<h3 class=\"clv-st\">Picks individuale ("+picks.length+")" +
        "<span class=\"p-filters\">" +
          "<select id=\"clf-s\" class=\"clv-sel\"><option value=\"\">Toate sursele</option>" +
            "<option value=\"apex\">APEX</option><option value=\"claude\">Claude</option><option value=\"ml5\">ML5</option></select>" +
          "<select id=\"clf-m\" class=\"clv-sel\"><option value=\"\">Toate pietele</option>" +
            mks.map(function(m){ return "<option value=\""+m+"\">"+m+"</option>"; }).join("")+"</select>" +
          "<select id=\"clf-r\" class=\"clv-sel\"><option value=\"\">Toate</option>" +
            "<option value=\"win\">Win</option><option value=\"lose\">Pierdere</option>" +
            "<option value=\"pending\">Pending</option></select>" +
        "</span></h3>" +
      "<div class=\"picks-wrap\"><table class=\"clv-tbl\">" +
        "<thead><tr><th>Data</th><th>Meci</th><th>Sursa</th><th>Piata</th><th>Cota</th><th>CLV%</th><th>EV%</th><th>Rez</th></tr></thead>" +
        "<tbody id=\"clv-pb\">" + renderRows(picks) + "</tbody>" +
      "</table></div></div>";
  }

  var SRC_COL = { apex:"#818cf8", claude:"#2BE5C5", ml5:"#22c55e" };

  function renderRows(picks) {
    return picks.map(function(p){
      var rez = p.pending ? "<span style=\"color:#f59e0b;font-weight:700\">?</span>" :
        p.won ? "<span style=\"color:#22c55e;font-weight:700\">W</span>" :
                "<span style=\"color:#ef4444;font-weight:700\">X</span>";
      return "<tr>" +
        "<td class=\"dt\">"+(p.date||"—")+"</td>" +
        "<td class=\"mt\">"+short(p.home,10)+"—"+short(p.away,10)+"</td>" +
        "<td><span style=\"font-size:.65rem;font-weight:700;color:"+(SRC_COL[p.source]||"#94a3b8")+"\">"+String(p.source||"").toUpperCase()+"</span></td>" +
        "<td class=\"mk\">"+p.market+"</td>" +
        "<td class=\"tr\">"+fmtNum(p.picked_odds,2)+"</td>" +
        "<td class=\"tr "+(p.clv_pct!=null?(p.clv_pct>=0?"pos":"neg"):"")+"\">"+(p.clv_pct!=null?fmtSign(p.clv_pct,2)+"%":"—")+"</td>" +
        "<td class=\"tr "+((p.ev_at_pick_pct||0)>=0?"pos":"neg")+"\">"+(p.ev_at_pick_pct!=null?fmtSign(p.ev_at_pick_pct,1)+"%":"—")+"</td>" +
        "<td class=\"rc\">" + rez + "</td></tr>";
    }).join("");
  }

  function hookFilters(allPicks) {
    window.__clvAllPicks = allPicks;
    ["clf-s","clf-m","clf-r"].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyFilters);
    });
  }

  function applyFilters() {
    var src = (document.getElementById("clf-s")||{}).value||"";
    var mk  = (document.getElementById("clf-m")||{}).value||"";
    var res = (document.getElementById("clf-r")||{}).value||"";
    var f   = window.__clvAllPicks||[];
    if (src) f = f.filter(function(p){ return p.source===src; });
    if (mk)  f = f.filter(function(p){ return p.market===mk; });
    if (res==="win")     f = f.filter(function(p){ return p.won===true; });
    if (res==="lose")    f = f.filter(function(p){ return p.won===false; });
    if (res==="pending") f = f.filter(function(p){ return p.pending; });
    var tb = document.getElementById("clv-pb");
    if (tb) tb.innerHTML = renderRows(f);
  }

  /* ── stiluri ────────────────────────────────────────────────────────────── */

  function renderStyles() {
    if (!document.getElementById("clv-styles")) {
      var s = document.createElement("style");
      s.id = "clv-styles";
      s.textContent =
      ".clv-root{padding:14px;max-width:900px;margin:0 auto}" +
      ".clv-header{margin-bottom:14px}" +
      ".clv-title{font-size:1.1rem;font-weight:700;margin:0 0 3px}" +
      ".clv-updated{font-size:.7rem;color:var(--muted,#64748b)}" +
      ".clv-card{background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:16px;padding:14px;margin-bottom:14px}" +
      ".clv-st{font-size:.92rem;font-weight:600;margin:0 0 11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".clv-note{font-size:.73rem;color:var(--muted,#64748b);margin:8px 0 0}" +
      ".diag-signal{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.7;margin-bottom:4px}" +
      ".diag-text{margin:0 0 6px;font-size:.88rem;line-height:1.5}" +
      ".diag-action{margin:0 0 7px;font-size:.83rem}" +
      ".diag-meta{font-size:.73rem;color:var(--muted,#64748b)}" +
      ".diag-great{border-left:4px solid #22c55e;background:rgba(34,197,94,.07)}" +
      ".diag-ok{border-left:4px solid #f59e0b;background:rgba(245,158,11,.07)}" +
      ".diag-warn{border-left:4px solid #f97316;background:rgba(249,115,22,.07)}" +
      ".diag-bad{border-left:4px solid #ef4444;background:rgba(239,68,68,.07)}" +
      ".diag-info{border-left:4px solid #3b82f6;background:rgba(59,130,246,.07)}" +
      ".kpi-row{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}" +
      ".kpi-card{flex:1;min-width:100px;background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:12px;padding:10px}" +
      ".kpi-lbl{font-size:.65rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b);margin-bottom:3px}" +
      ".kpi-val{font-size:1.2rem;font-weight:700;margin-bottom:2px}" +
      ".kpi-sub{font-size:.65rem;color:var(--muted,#64748b)}" +
      ".kpi-good .kpi-val{color:#22c55e}.kpi-bad .kpi-val{color:#ef4444}" +
      ".clv-tbl{width:100%;border-collapse:collapse;font-size:.8rem}" +
      ".clv-tbl th{text-align:left;padding:6px 4px;border-bottom:1px solid var(--brd,#1e293b);font-size:.67rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b)}" +
      ".clv-tbl td{padding:5px 4px;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".clv-tbl tr:last-child td{border-bottom:none}" +
      ".tr{text-align:right;font-variant-numeric:tabular-nums}" +
      ".pos{color:#22c55e;font-weight:600}.neg{color:#ef4444;font-weight:600}" +
      ".bdot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}" +
      ".bar-bg{background:rgba(255,255,255,.06);border-radius:3px;height:6px;min-width:40px}" +
      ".bar-f{height:6px;border-radius:3px}" +
      ".rolling-g{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
      ".rbox{background:rgba(255,255,255,.02);border-radius:8px;padding:10px;border:1px solid var(--brd,#1e293b)}" +
      ".rbox-lbl{font-weight:600;margin-bottom:7px;font-size:.82rem;color:#cbd5e1}" +
      ".rrow{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".rrow:last-child{border-bottom:none}" +
      ".rk{font-size:.73rem;color:var(--muted,#94a3b8)}.rv{font-size:.78rem;font-weight:600}" +
      ".rbox-na{color:var(--muted,#64748b);font-size:.8rem}" +
      ".picks-wrap{overflow-x:auto;max-height:360px;overflow-y:auto}" +
      ".p-filters{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}" +
      ".clv-sel{background:var(--card,#0f172a);border:1px solid var(--brd,#1e293b);border-radius:6px;padding:3px 6px;font-size:.72rem;color:inherit}" +
      ".dt{font-size:.72rem;white-space:nowrap;color:var(--muted,#94a3b8)}" +
      ".mt{font-size:.72rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".mk{font-weight:600;font-size:.76rem}.rc{text-align:center}" +
      "@media(max-width:520px){.kpi-row{flex-direction:column}.rolling-g{grid-template-columns:1fr}}";
      document.head.appendChild(s);
    }
    return "";
  }

  /* ── formatare ──────────────────────────────────────────────────────────── */

  function fmtNum(v,d){ if(v==null)return"—"; return Number(v).toFixed(d||2); }
  function fmtSign(v,d){ if(v==null)return"—"; var n=Number(v); return(n>=0?"+":"")+n.toFixed(d||2); }
  function fmtPct(v){ if(v==null)return"—"; return(Number(v)*100).toFixed(1)+"%"; }
  function short(s,max){ if(!s)return"—"; max=max||13; return s.length>max?s.slice(0,max-1)+"…":s; }

  hookSwitchTab();

})();
