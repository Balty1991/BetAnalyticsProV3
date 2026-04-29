/**
 * clv_tracker_runtime.js — BetAnalytics Pro V3
 * =============================================
 * Injectează tab-ul CLV Tracker în structura reală a aplicației.
 * Folosește switchTab('clv') și id="tab-clv" — exact ca celelalte tab-uri.
 * Apare în panoul "Mai mult" (desktop-more-panel).
 *
 * Versiune: 2026-04-29-v2
 */

(function () {
  "use strict";

  var CLV_DATA_URL = "./data/clv_tracker.json";
  var TAB_NAME     = "clv";
  var TAB_ID       = "tab-clv";
  var injected     = false;
  var dataLoaded   = false;

  /* ── injectare în DOM ───────────────────────────────────────────────────── */

  function inject() {
    if (injected) return;

    // 1. Panoul tab-content (unde se afișează conținutul tabului)
    if (!document.getElementById(TAB_ID)) {
      var panel = document.createElement("div");
      panel.className = "tab-content";
      panel.id        = TAB_ID;
      panel.innerHTML = renderLoadingHTML();
      var lastTab = Array.from(document.querySelectorAll(".tab-content")).pop();
      if (lastTab && lastTab.parentNode) {
        lastTab.parentNode.insertBefore(panel, lastTab.nextSibling);
      } else {
        document.body.appendChild(panel);
      }
    }

    // 2. Buton în "Mai mult" (desktop-more-panel)
    var morePanel = document.getElementById("desktop-more-panel");
    if (morePanel && !document.getElementById("more-btn-clv")) {
      var btn = document.createElement("button");
      btn.id        = "more-btn-clv";
      btn.className = "more-card-btn";
      btn.setAttribute("onclick", "switchTab('clv');closeDesktopMore()");
      btn.innerHTML  = "<span class=\"more-card-title\">📈 CLV Tracker</span>" +
                       "<span class=\"more-card-sub\">Closing Line Value — verifică dacă modelul bate piața real.</span>";
      morePanel.appendChild(btn);
    }

    // 3. Hook pe switchTab pentru a încărca datele la prima deschidere
    hookSwitchTab();

    injected = true;
    console.log("[CLV] Injectat cu succes.");
  }

  function hookSwitchTab() {
    if (typeof window.switchTab !== "function") return;
    var original = window.switchTab;
    window.switchTab = function (name) {
      original.apply(this, arguments);
      if (name === TAB_NAME && !dataLoaded) {
        dataLoaded = true;
        setTimeout(loadCLVData, 80);
      }
    };
  }

  /* ── încărcare date ─────────────────────────────────────────────────────── */

  function loadCLVData() {
    var panel = document.getElementById(TAB_ID);
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
    var s    = data.summary      || {};
    var diag = data.diagnosis    || {};
    var bm   = data.by_market    || {};
    var bkt  = data.clv_buckets  || {};
    var r30  = data.rolling_30d  || {};
    var r90  = data.rolling_90d  || {};
    var evc  = data.ev_correlation || {};
    var picks = data.picks       || [];

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
      CLV_POSITIVE_ROI_POSITIVE: "diag-great",
      CLV_POSITIVE_ROI_NEGATIVE: "diag-ok",
      CLV_NEGATIVE_ROI_POSITIVE: "diag-warn",
      CLV_NEGATIVE_ROI_NEGATIVE: "diag-bad",
      INSUFFICIENT_DATA:         "diag-info",
      NO_DATA:                   "diag-info",
    }[diag.signal] || "diag-info";

    var conf = {high:"✅ Înaltă", medium:"⚠️ Medie", low:"🔵 Scăzută"}[diag.confidence] || "";

    return "<div class=\"clv-card " + cls + "\">" +
      "<div class=\"diag-signal\">" + (diag.signal || "—") + "</div>" +
      "<p class=\"diag-text\">" + (diag.interpretation || "—") + "</p>" +
      "<p class=\"diag-action\"><strong>Acțiune:</strong> " + (diag.action || "—") + "</p>" +
      "<div class=\"diag-meta\">" +
        "<span>Încredere: " + conf + "</span>" +
        "<span>Trend: " + (diag.rolling_trend || "—") + "</span>" +
      "</div>" +
    "</div>";
  }

  function renderKPIs(s, r30) {
    var kpis = [
      { label:"Avg CLV",    value: fmtSign(s.avg_clv_pct, 2) + "%",
        sub: "Median: " + fmtSign(s.median_clv_pct, 2) + "%",
        good: (s.avg_clv_pct || 0) >= 0 },
      { label:"CLV+ Rate",  value: fmtPct(s.clv_positive_rate),
        sub: (s.clv_positive_n || 0) + " / " + (s.total_picks || 0) + " pick-uri",
        good: (s.clv_positive_rate || 0) >= 0.5 },
      { label:"ROI Flat",   value: fmtSign(s.roi_flat_pct, 2) + "%",
        sub: (s.total_picks || 0) + " settle-ate",
        good: (s.roi_flat_pct || 0) >= 0 },
      { label:"Win Rate",   value: fmtNum(s.win_rate_pct, 1) + "%",
        sub: "CLV+ câștig: " + fmtSign(s.avg_clv_wins, 2) + "% | CLV- câștig: " + fmtSign(s.avg_clv_losses, 2) + "%",
        good: null },
      { label:"CLV 30 zile", value: r30.avg_clv_pct != null ? fmtSign(r30.avg_clv_pct, 2) + "%" : "N/A",
        sub: r30.n ? r30.n + " pick-uri | ROI: " + fmtSign(r30.roi_flat_pct, 2) + "%" : "Insuficient",
        good: (r30.avg_clv_pct || 0) >= 0 },
    ];

    var html = "<div class=\"kpi-row\">";
    kpis.forEach(function (k) {
      var cls = k.good === null ? "" : (k.good ? "kpi-good" : "kpi-bad");
      html += "<div class=\"kpi-card " + cls + "\">" +
        "<div class=\"kpi-label\">" + k.label + "</div>" +
        "<div class=\"kpi-value\">" + k.value + "</div>" +
        "<div class=\"kpi-sub\">" + k.sub + "</div>" +
      "</div>";
    });
    return html + "</div>";
  }

  function renderBuckets(bkt) {
    var order = ["clv_strong_pos","clv_mild_pos","clv_neutral","clv_mild_neg","clv_strong_neg"];
    var labels = { clv_strong_pos:"CLV ≥+5%", clv_mild_pos:"CLV 0–5%", clv_neutral:"CLV -1–0%", clv_mild_neg:"CLV -5– -1%", clv_strong_neg:"CLV ≤-5%" };
    var colors = { clv_strong_pos:"#22c55e", clv_mild_pos:"#86efac", clv_neutral:"#94a3b8", clv_mild_neg:"#fca5a5", clv_strong_neg:"#ef4444" };

    var rows = order.map(function (k) {
      var b = bkt[k] || {};
      return { k:k, label:labels[k], n:b.n||0, wr:b.win_rate||0, roi:b.roi_pct||0, clv:b.avg_clv||0, color:colors[k] };
    });
    var maxN = Math.max.apply(null, rows.map(function(r){ return r.n; }).concat([1]));

    var html = "<div class=\"clv-card\"><h3 class=\"clv-section-title\">CLV Buckets — ROI & Win Rate per segment</h3>" +
      "<table class=\"clv-table\"><thead><tr>" +
        "<th>Segment</th><th>N</th><th>Win Rate</th><th>ROI Flat</th><th>CLV mediu</th><th>Volum</th>" +
      "</tr></thead><tbody>";

    rows.forEach(function (r) {
      html += "<tr>" +
        "<td><span class=\"bdot\" style=\"background:" + r.color + "\"></span>" + r.label + "</td>" +
        "<td class=\"num\">" + r.n + "</td>" +
        "<td class=\"num\">" + (r.n ? fmtNum(r.wr,1)+"%" : "—") + "</td>" +
        "<td class=\"num " + (r.roi>=0?"pos":"neg") + "\">" + (r.n ? fmtSign(r.roi,2)+"%" : "—") + "</td>" +
        "<td class=\"num " + (r.clv>=0?"pos":"neg") + "\">" + (r.n ? fmtSign(r.clv,2)+"%" : "—") + "</td>" +
        "<td><div class=\"bar-bg\"><div class=\"bar-fill\" style=\"width:" + (r.n?Math.round(r.n/maxN*100):0) + "%;background:" + r.color + "\"></div></div></td>" +
      "</tr>";
    });
    return html + "</tbody></table><p class=\"clv-note\">💡 CLV+ → ROI+ corelat = edge real. Fără corelație = varianță.</p></div>";
  }

  function renderByMarket(bm) {
    var markets = Object.entries(bm).sort(function(a,b){ return Math.abs(b[1].avg_clv_pct)-Math.abs(a[1].avg_clv_pct); });
    if (!markets.length) return "";

    var html = "<div class=\"clv-card\"><h3 class=\"clv-section-title\">CLV per piață</h3>" +
      "<table class=\"clv-table\"><thead><tr>" +
        "<th>Piață</th><th>N</th><th>Avg CLV</th><th>CLV+%</th><th>Win Rate</th><th>ROI Flat</th>" +
      "</tr></thead><tbody>";

    markets.forEach(function(m) {
      var mk = m[0]; var s = m[1];
      html += "<tr>" +
        "<td class=\"mk\">" + mk + "</td>" +
        "<td class=\"num\">" + s.n + "</td>" +
        "<td class=\"num " + (s.avg_clv_pct>=0?"pos":"neg") + "\">" + fmtSign(s.avg_clv_pct,2) + "%</td>" +
        "<td class=\"num\">" + fmtPct(s.clv_positive_rate) + "</td>" +
        "<td class=\"num\">" + fmtNum(s.win_rate_pct,1) + "%</td>" +
        "<td class=\"num " + (s.roi_flat_pct>=0?"pos":"neg") + "\">" + fmtSign(s.roi_flat_pct,2) + "%</td>" +
      "</tr>";
    });
    return html + "</tbody></table></div>";
  }

  function renderEVCorrelation(evc) {
    var ep = evc.ev_positive_picks || {};
    var en = evc.ev_negative_picks || {};
    var warn = evc.divergence_warning;

    var warnHtml = warn
      ? "<div class=\"warn-banner\">⚠️ Divergență: Pick-uri cu EV+ au CLV negativ constant. Modelul poate supraestima edge-ul.</div>"
      : "";

    return "<div class=\"clv-card" + (warn?" diag-warn":"") + "\">" +
      "<h3 class=\"clv-section-title\">Corelație EV vs CLV</h3>" +
      warnHtml +
      "<div class=\"two-col\">" +
        "<div class=\"corr-box " + ((ep.avg_clv||0)>=0?"box-green":"box-red") + "\">" +
          "<div class=\"box-lbl\">Pick-uri cu EV+</div>" +
          "<div class=\"box-n\">N = " + (ep.n||0) + "</div>" +
          "<div class=\"box-val\">CLV mediu: <strong>" + (ep.avg_clv!=null?fmtSign(ep.avg_clv,2)+"%":"—") + "</strong></div>" +
          "<div class=\"box-sub\">CLV+ rate: " + fmtPct(ep.clv_positive_rate) + "</div>" +
        "</div>" +
        "<div class=\"corr-box " + ((en.avg_clv||0)>=0?"box-green":"box-red") + "\">" +
          "<div class=\"box-lbl\">Pick-uri cu EV≤0</div>" +
          "<div class=\"box-n\">N = " + (en.n||0) + "</div>" +
          "<div class=\"box-val\">CLV mediu: <strong>" + (en.avg_clv!=null?fmtSign(en.avg_clv,2)+"%":"—") + "</strong></div>" +
          "<div class=\"box-sub\">CLV+ rate: " + fmtPct(en.clv_positive_rate) + "</div>" +
        "</div>" +
      "</div>" +
      "<p class=\"clv-note\">EV+ ar trebui să aibă CLV mai mare decât EV−. Dacă nu, recalibrează probabilitățile.</p>" +
    "</div>";
  }

  function renderRolling(r30, r90) {
    return "<div class=\"clv-card\"><h3 class=\"clv-section-title\">Trend CLV — rolling</h3>" +
      "<div class=\"rolling-grid\">" +
        renderRollingBox("Ultimele 30 zile", r30) +
        renderRollingBox("Ultimele 90 zile", r90) +
      "</div></div>";
  }

  function renderRollingBox(label, r) {
    if (!r || !r.n) return "<div class=\"rolling-box\"><div class=\"rb-label\">" + label + "</div><div class=\"rb-na\">Date insuficiente</div></div>";
    return "<div class=\"rolling-box\">" +
      "<div class=\"rb-label\">" + label + "</div>" +
      "<div class=\"rb-row\"><span class=\"rb-k\">Avg CLV</span><span class=\"rb-v " + ((r.avg_clv_pct||0)>=0?"pos":"neg") + "\">" + fmtSign(r.avg_clv_pct,2) + "%</span></div>" +
      "<div class=\"rb-row\"><span class=\"rb-k\">Win Rate</span><span class=\"rb-v\">" + fmtNum(r.win_rate_pct,1) + "%</span></div>" +
      "<div class=\"rb-row\"><span class=\"rb-k\">ROI Flat</span><span class=\"rb-v " + ((r.roi_flat_pct||0)>=0?"pos":"neg") + "\">" + fmtSign(r.roi_flat_pct,2) + "%</span></div>" +
      "<div class=\"rb-row\"><span class=\"rb-k\">N pick-uri</span><span class=\"rb-v\">" + r.n + "</span></div>" +
    "</div>";
  }

  function renderPicksTable(picks) {
    if (!picks.length) return "";
    var markets = picks.map(function(p){ return p.market; }).filter(function(v,i,a){ return a.indexOf(v)===i; }).sort();

    var html = "<div class=\"clv-card\">" +
      "<h3 class=\"clv-section-title\">Pick-uri individuale (" + picks.length + " total)" +
        "<span class=\"picks-filters\">" +
          "<select id=\"clv-f-market\" class=\"clv-sel\"><option value=\"\">Toate piețele</option>" +
            markets.map(function(m){ return "<option value=\""+m+"\">"+m+"</option>"; }).join("") +
          "</select>" +
          "<select id=\"clv-f-result\" class=\"clv-sel\"><option value=\"\">Toate</option><option value=\"win\">Câștig</option><option value=\"lose\">Pierdere</option></select>" +
          "<select id=\"clv-f-clv\" class=\"clv-sel\"><option value=\"\">Orice CLV</option><option value=\"pos\">CLV+</option><option value=\"neg\">CLV-</option></select>" +
        "</span>" +
      "</h3>" +
      "<div class=\"picks-wrap\">" +
        "<table class=\"clv-table\">" +
          "<thead><tr><th>Data</th><th>Meci</th><th>Piață</th><th>Cotă pick</th><th>Cotă closing</th><th>CLV%</th><th>EV%</th><th>Rez.</th></tr></thead>" +
          "<tbody id=\"clv-picks-body\">" + renderRows(picks.slice(0, 200)) + "</tbody>" +
        "</table>" +
      "</div>" +
      (picks.length > 200 ? "<p class=\"clv-note\">Afișate 200 din " + picks.length + ". Folosește filtrele.</p>" : "") +
    "</div>";

    window.__clvAllPicks = picks.slice(0, 200);
    return html;
  }

  function renderRows(picks) {
    return picks.map(function(p) {
      return "<tr>" +
        "<td class=\"dt\">" + (p.date||"—") + "</td>" +
        "<td class=\"mt\" title=\"" + p.home + " vs " + p.away + " (" + p.league + ")\">" + short(p.home,13) + " — " + short(p.away,13) + "</td>" +
        "<td class=\"mk\">" + p.market + "</td>" +
        "<td class=\"num\">" + fmtNum(p.picked_odds,2) + "</td>" +
        "<td class=\"num\">" + fmtNum(p.closing_odds,2) + "</td>" +
        "<td class=\"num " + (p.clv_pct>=0?"pos":"neg") + "\">" + fmtSign(p.clv_pct,2) + "%</td>" +
        "<td class=\"num " + ((p.ev_at_pick_pct||0)>=0?"pos":"neg") + "\">" + (p.ev_at_pick_pct!=null?fmtSign(p.ev_at_pick_pct,2)+"%":"—") + "</td>" +
        "<td class=\"rc " + (p.won?"win":"lose") + "\">" + (p.won?"✅":"❌") + "</td>" +
      "</tr>";
    }).join("");
  }

  function hookFilters() {
    ["clv-f-market","clv-f-result","clv-f-clv"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyFilters);
    });
  }

  function applyFilters() {
    var mk  = (document.getElementById("clv-f-market")||{}).value || "";
    var res = (document.getElementById("clv-f-result")||{}).value || "";
    var clv = (document.getElementById("clv-f-clv")||{}).value   || "";
    var all = window.__clvAllPicks || [];

    var f = all;
    if (mk)  f = f.filter(function(p){ return p.market===mk; });
    if (res) f = f.filter(function(p){ return res==="win"?p.won:!p.won; });
    if (clv==="pos") f = f.filter(function(p){ return p.clv_pct>=0; });
    if (clv==="neg") f = f.filter(function(p){ return p.clv_pct<0; });

    var tbody = document.getElementById("clv-picks-body");
    if (tbody) tbody.innerHTML = renderRows(f);
  }

  /* ── stiluri ────────────────────────────────────────────────────────────── */

  function renderStyles() {
    if (document.getElementById("clv-styles")) return "";
    return "<style id=\"clv-styles\">" +
      ".clv-root{padding:14px;max-width:900px;margin:0 auto;font-family:inherit}" +
      ".clv-header{margin-bottom:14px}" +
      ".clv-title{font-size:1.25rem;font-weight:700;margin:0 0 4px}" +
      ".clv-updated{font-size:.72rem;color:var(--muted,#64748b)}" +
      ".clv-card{background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:16px;padding:14px;margin-bottom:14px}" +
      ".clv-section-title{font-size:.95rem;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".clv-note{font-size:.75rem;color:var(--muted,#64748b);margin:10px 0 0}" +
      ".diag-signal{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.75;margin-bottom:5px}" +
      ".diag-text{margin:0 0 7px;font-size:.9rem;line-height:1.5}" +
      ".diag-action{margin:0 0 8px;font-size:.85rem}" +
      ".diag-meta{display:flex;gap:14px;font-size:.75rem;color:var(--muted,#64748b)}" +
      ".diag-great{border-left:4px solid #22c55e;background:rgba(34,197,94,.07)}" +
      ".diag-ok{border-left:4px solid #f59e0b;background:rgba(245,158,11,.07)}" +
      ".diag-warn{border-left:4px solid #f97316;background:rgba(249,115,22,.07)}" +
      ".diag-bad{border-left:4px solid #ef4444;background:rgba(239,68,68,.07)}" +
      ".diag-info{border-left:4px solid #3b82f6;background:rgba(59,130,246,.07)}" +
      ".kpi-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}" +
      ".kpi-card{flex:1;min-width:120px;background:var(--card,#0E1424);border:1px solid var(--brd,#1e293b);border-radius:12px;padding:10px}" +
      ".kpi-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b);margin-bottom:3px}" +
      ".kpi-value{font-size:1.3rem;font-weight:700;margin-bottom:3px}" +
      ".kpi-sub{font-size:.68rem;color:var(--muted,#64748b)}" +
      ".kpi-good .kpi-value{color:#22c55e}" +
      ".kpi-bad  .kpi-value{color:#ef4444}" +
      ".clv-table{width:100%;border-collapse:collapse;font-size:.82rem}" +
      ".clv-table th{text-align:left;padding:7px 5px;border-bottom:1px solid var(--brd,#1e293b);font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#64748b)}" +
      ".clv-table td{padding:6px 5px;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".clv-table tr:last-child td{border-bottom:none}" +
      ".num{text-align:right;font-variant-numeric:tabular-nums}" +
      ".pos{color:#22c55e;font-weight:600}" +
      ".neg{color:#ef4444;font-weight:600}" +
      ".bdot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}" +
      ".bar-bg{background:rgba(255,255,255,.06);border-radius:3px;height:7px;min-width:50px}" +
      ".bar-fill{height:7px;border-radius:3px}" +
      ".two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}" +
      ".corr-box{border-radius:8px;padding:12px;text-align:center}" +
      ".box-green{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25)}" +
      ".box-red{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25)}" +
      ".box-lbl{font-size:.75rem;font-weight:600;color:var(--muted,#94a3b8);margin-bottom:3px}" +
      ".box-n{font-size:.7rem;color:var(--muted,#64748b);margin-bottom:5px}" +
      ".box-val{font-size:1rem}" +
      ".box-sub{font-size:.7rem;color:var(--muted,#94a3b8);margin-top:3px}" +
      ".warn-banner{background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.35);border-radius:6px;padding:7px 10px;font-size:.82rem;margin-bottom:10px}" +
      ".rolling-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      ".rolling-box{background:rgba(255,255,255,.02);border-radius:8px;padding:11px;border:1px solid var(--brd,#1e293b)}" +
      ".rb-label{font-weight:600;margin-bottom:8px;font-size:.85rem;color:#cbd5e1}" +
      ".rb-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(30,41,59,.5)}" +
      ".rb-row:last-child{border-bottom:none}" +
      ".rb-k{font-size:.75rem;color:var(--muted,#94a3b8)}" +
      ".rb-v{font-size:.8rem;font-weight:600}" +
      ".rb-na{color:var(--muted,#64748b);font-size:.82rem}" +
      ".picks-wrap{overflow-x:auto;max-height:380px;overflow-y:auto}" +
      ".picks-filters{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}" +
      ".clv-sel{background:var(--card,#0f172a);border:1px solid var(--brd,#1e293b);border-radius:6px;padding:3px 7px;font-size:.75rem;color:inherit}" +
      ".dt{font-size:.75rem;white-space:nowrap;color:var(--muted,#94a3b8)}" +
      ".mt{font-size:.75rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".mk{font-weight:600;font-size:.78rem}" +
      ".rc{text-align:center}" +
      ".rc.win{color:#22c55e}" +
      ".rc.lose{color:#ef4444}" +
      ".clv-loading,.clv-error{text-align:center;padding:48px;color:var(--muted,#94a3b8)}" +
      ".clv-error{color:#ef4444}" +
      ".clv-hint{font-size:.8rem;color:var(--muted,#94a3b8);margin-top:6px}" +
      ".clv-spinner{display:inline-block;width:22px;height:22px;border:3px solid #1e293b;border-top-color:#3b82f6;border-radius:50%;animation:clvspin .7s linear infinite;margin-bottom:8px}" +
      "@keyframes clvspin{to{transform:rotate(360deg)}}" +
      "@media(max-width:560px){.kpi-row{flex-direction:column}.two-col,.rolling-grid{grid-template-columns:1fr}.clv-title{font-size:1.05rem}}" +
    "</style>";
  }

  function renderLoadingHTML() {
    return "<div class=\"clv-loading\"><div class=\"clv-spinner\"></div><br>Se încarcă datele CLV…</div>";
  }

  function renderError(msg) {
    return "<div class=\"clv-error\">⚠️ Nu s-au putut încărca datele CLV.<div class=\"clv-hint\">" + msg + "</div><div class=\"clv-hint\">Asigurați-vă că <code>build_clv_tracker.py</code> a fost rulat.</div></div>";
  }

  /* ── formatare ──────────────────────────────────────────────────────────── */

  function fmtNum(v, d) { if (v==null) return "—"; return Number(v).toFixed(d||2); }
  function fmtSign(v, d) { if (v==null) return "—"; var n=Number(v); return (n>=0?"+":"")+n.toFixed(d||2); }
  function fmtPct(v) { if (v==null) return "—"; return (Number(v)*100).toFixed(1)+"%"; }
  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("ro-RO",{dateStyle:"short",timeStyle:"short"}); }
    catch(e) { return iso.slice(0,16); }
  }
  function short(s, max) { if(!s) return "—"; max=max||14; return s.length>max?s.slice(0,max-1)+"…":s; }

  /* ── inițializare ───────────────────────────────────────────────────────── */

  function tryInject() {
    inject();
    if (!injected) {
      var attempts = 0;
      var iv = setInterval(function () {
        inject();
        if (injected || ++attempts > 30) clearInterval(iv);
      }, 200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInject);
  } else {
    tryInject();
  }

})();
