/**
 * clv_tracker_runtime.js — BetAnalytics Pro V3
 * =============================================
 * Injectează tab-ul "CLV Tracker" în UI-ul existent.
 * Încarcă data/clv_tracker.json și afișează:
 *   - Diagnosis card (semnal principal)
 *   - KPI row: Avg CLV, CLV+ Rate, ROI, Win Rate
 *   - CLV Buckets chart (bar)
 *   - Per-market breakdown table
 *   - EV vs CLV correlation panel
 *   - Rolling 30d / 90d trend
 *   - Picks table (filtrabilă)
 *
 * Versiune: 2026-04-29
 */

(function () {
  "use strict";

  const CLV_DATA_URL = "./data/clv_tracker.json";
  const TAB_ID       = "clv-tracker";
  const TAB_LABEL    = "📈 CLV";
  const INJECT_AFTER = "backtest"; // id-ul tab-ului după care se injectează

  /* ── injectare tab ──────────────────────────────────────────────────────── */

  function injectTab() {
    const tabBar = document.querySelector(".tab-bar, .tabs, nav[role='tablist'], [data-tabs]");
    if (!tabBar) return false;

    // Evităm duplicat
    if (document.getElementById(`tab-btn-${TAB_ID}`)) return true;

    const btn = document.createElement("button");
    btn.id        = `tab-btn-${TAB_ID}`;
    btn.className = "tab-btn";
    btn.dataset.tab = TAB_ID;
    btn.textContent = TAB_LABEL;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");

    // Găsim poziția de inserție
    const backtest = tabBar.querySelector(`[data-tab="${INJECT_AFTER}"]`);
    if (backtest && backtest.nextSibling) {
      tabBar.insertBefore(btn, backtest.nextSibling);
    } else {
      tabBar.appendChild(btn);
    }

    btn.addEventListener("click", () => showCLVTab());
    return true;
  }

  function injectPanel() {
    const container = document.querySelector(".tab-content, .panels, main, #app, #content");
    if (!container) return false;
    if (document.getElementById(`panel-${TAB_ID}`)) return true;

    const panel = document.createElement("div");
    panel.id        = `panel-${TAB_ID}`;
    panel.className = "tab-panel clv-panel";
    panel.setAttribute("role", "tabpanel");
    panel.style.display = "none";
    panel.innerHTML = `<div class="clv-loading">
      <span class="spinner"></span> Se încarcă datele CLV…
    </div>`;

    container.appendChild(panel);
    return true;
  }

  /* ── afișare tab ────────────────────────────────────────────────────────── */

  function showCLVTab() {
    // Ascundem toate panourile
    document.querySelectorAll(".tab-panel").forEach(p => (p.style.display = "none"));
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });

    const panel = document.getElementById(`panel-${TAB_ID}`);
    const btn   = document.getElementById(`tab-btn-${TAB_ID}`);
    if (!panel || !btn) return;

    panel.style.display = "block";
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    // Încărcăm datele la prima vizitare
    if (!panel.dataset.loaded) {
      loadCLVData(panel);
    }
  }

  /* ── încărcare date ─────────────────────────────────────────────────────── */

  async function loadCLVData(panel) {
    try {
      const resp = await fetch(`${CLV_DATA_URL}?v=${Date.now()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      renderCLV(panel, data);
      panel.dataset.loaded = "1";
    } catch (err) {
      panel.innerHTML = `<div class="clv-error">
        <p>⚠️ Nu s-au putut încărca datele CLV.</p>
        <p class="hint">${err.message}</p>
        <p class="hint">Asigurați-vă că <code>build_clv_tracker.py</code> a fost rulat.</p>
      </div>`;
    }
  }

  /* ── render principal ───────────────────────────────────────────────────── */

  function renderCLV(panel, data) {
    const s   = data.summary    || {};
    const diag = data.diagnosis  || {};
    const bm  = data.by_market  || {};
    const bkt = data.clv_buckets || {};
    const r30 = data.rolling_30d || {};
    const r90 = data.rolling_90d || {};
    const evc = data.ev_correlation || {};
    const picks = data.picks || [];

    panel.innerHTML = `
      ${renderStyles()}
      <div class="clv-root">
        <h2 class="clv-title">
          Closing Line Value (CLV)
          <span class="clv-updated">Actualizat: ${fmtDate(data.updated_at)}</span>
        </h2>

        ${renderDiagnosis(diag)}
        ${renderKPIs(s, r30)}
        ${renderBuckets(bkt)}
        ${renderByMarket(bm)}
        ${renderEVCorrelation(evc)}
        ${renderRolling(r30, r90)}
        ${renderPicksTable(picks)}
      </div>
    `;

    // Activăm filtrele tabelului
    hookTableFilters(panel);
  }

  /* ── componente UI ──────────────────────────────────────────────────────── */

  function renderDiagnosis(diag) {
    const signalClass = {
      CLV_POSITIVE_ROI_POSITIVE: "diag-great",
      CLV_POSITIVE_ROI_NEGATIVE: "diag-ok",
      CLV_NEGATIVE_ROI_POSITIVE: "diag-warn",
      CLV_NEGATIVE_ROI_NEGATIVE: "diag-bad",
      INSUFFICIENT_DATA:         "diag-info",
      NO_DATA:                   "diag-info",
    }[diag.signal] || "diag-info";

    const confidence = {high:"✅ Înaltă", medium:"⚠️ Medie", low:"🔵 Scăzută"}[diag.confidence] || "";

    return `
      <div class="clv-card ${signalClass}">
        <div class="diag-signal">${diag.signal || "—"}</div>
        <p class="diag-text">${diag.interpretation || "—"}</p>
        <p class="diag-action"><strong>Acțiune:</strong> ${diag.action || "—"}</p>
        <div class="diag-meta">
          <span>Încredere: ${confidence}</span>
          <span>Trend: ${diag.rolling_trend || "—"}</span>
        </div>
      </div>
    `;
  }

  function renderKPIs(s, r30) {
    const kpis = [
      {
        label: "Avg CLV",
        value: fmtSign(s.avg_clv_pct, 2) + "%",
        sub:   `Median: ${fmtSign(s.median_clv_pct, 2)}%`,
        cls:   (s.avg_clv_pct || 0) >= 0 ? "kpi-good" : "kpi-bad",
      },
      {
        label: "CLV+ Rate",
        value: fmtPct(s.clv_positive_rate),
        sub:   `${s.clv_positive_n || 0} / ${s.total_picks || 0} pick-uri`,
        cls:   (s.clv_positive_rate || 0) >= 0.5 ? "kpi-good" : "kpi-neutral",
      },
      {
        label: "ROI Flat",
        value: fmtSign(s.roi_flat_pct, 2) + "%",
        sub:   `${s.total_picks || 0} pick-uri settle-ate`,
        cls:   (s.roi_flat_pct || 0) >= 0 ? "kpi-good" : "kpi-bad",
      },
      {
        label: "Win Rate",
        value: fmtNum(s.win_rate_pct, 1) + "%",
        sub:   `CLV+ câștig: ${fmtSign(s.avg_clv_wins, 2)}% | CLV- câștig: ${fmtSign(s.avg_clv_losses, 2)}%`,
        cls:   "kpi-neutral",
      },
      {
        label: "CLV 30 zile",
        value: r30.avg_clv_pct != null ? fmtSign(r30.avg_clv_pct, 2) + "%" : "N/A",
        sub:   r30.n ? `${r30.n} pick-uri | ROI: ${fmtSign(r30.roi_flat_pct, 2)}%` : "Insuficient",
        cls:   (r30.avg_clv_pct || 0) >= 0 ? "kpi-good" : "kpi-bad",
      },
    ];

    return `
      <div class="kpi-row">
        ${kpis.map(k => `
          <div class="kpi-card ${k.cls}">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.value}</div>
            <div class="kpi-sub">${k.sub}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderBuckets(bkt) {
    const order = ["clv_strong_pos","clv_mild_pos","clv_neutral","clv_mild_neg","clv_strong_neg"];
    const labels = {
      clv_strong_pos: "CLV ≥+5%",
      clv_mild_pos:   "CLV 0–5%",
      clv_neutral:    "CLV -1–0%",
      clv_mild_neg:   "CLV -5– -1%",
      clv_strong_neg: "CLV ≤-5%",
    };
    const colors = {
      clv_strong_pos: "#22c55e",
      clv_mild_pos:   "#86efac",
      clv_neutral:    "#94a3b8",
      clv_mild_neg:   "#fca5a5",
      clv_strong_neg: "#ef4444",
    };

    const rows = order.map(k => {
      const b = bkt[k] || {};
      const n = b.n || 0;
      return {k, label: labels[k], n, wr: b.win_rate||0, roi: b.roi_pct||0, clv: b.avg_clv||0, color: colors[k]};
    });

    const maxN = Math.max(...rows.map(r => r.n), 1);

    return `
      <div class="clv-card">
        <h3 class="card-title">CLV Buckets — ROI & Win Rate per segment</h3>
        <table class="clv-table bucket-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Pick-uri</th>
              <th>Win Rate</th>
              <th>ROI Flat</th>
              <th>CLV mediu</th>
              <th>Volum</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><span class="bucket-dot" style="background:${r.color}"></span>${r.label}</td>
                <td class="num">${r.n}</td>
                <td class="num">${r.n ? fmtNum(r.wr, 1) + "%" : "—"}</td>
                <td class="num ${r.roi >= 0 ? "pos" : "neg"}">${r.n ? fmtSign(r.roi, 2) + "%" : "—"}</td>
                <td class="num ${r.clv >= 0 ? "pos" : "neg"}">${r.n ? fmtSign(r.clv, 2) + "%" : "—"}</td>
                <td>
                  <div class="bar-bg">
                    <div class="bar-fill" style="width:${r.n ? Math.round(r.n/maxN*100) : 0}%;background:${r.color}"></div>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="card-note">💡 Dacă CLV+ → ROI+ corelat: modelul bate piața real. Dacă nu corelează: varianță sau date insuficiente.</p>
      </div>
    `;
  }

  function renderByMarket(bm) {
    const markets = Object.entries(bm).sort((a, b) => Math.abs(b[1].avg_clv_pct) - Math.abs(a[1].avg_clv_pct));
    if (!markets.length) return "";

    return `
      <div class="clv-card">
        <h3 class="card-title">CLV per piață</h3>
        <table class="clv-table">
          <thead>
            <tr>
              <th>Piață</th>
              <th>N</th>
              <th>Avg CLV</th>
              <th>CLV+ %</th>
              <th>Win Rate</th>
              <th>ROI Flat</th>
              <th>Avg EV la pariu</th>
            </tr>
          </thead>
          <tbody>
            ${markets.map(([mk, s]) => `
              <tr>
                <td class="market-cell">${mk}</td>
                <td class="num">${s.n}</td>
                <td class="num ${s.avg_clv_pct >= 0 ? "pos" : "neg"}">${fmtSign(s.avg_clv_pct, 2)}%</td>
                <td class="num">${fmtPct(s.clv_positive_rate)}</td>
                <td class="num">${fmtNum(s.win_rate_pct, 1)}%</td>
                <td class="num ${s.roi_flat_pct >= 0 ? "pos" : "neg"}">${fmtSign(s.roi_flat_pct, 2)}%</td>
                <td class="num ${(s.avg_ev_at_pick||0) >= 0 ? "pos" : "neg"}">${fmtSign(s.avg_ev_at_pick, 2)}%</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEVCorrelation(evc) {
    const ep = evc.ev_positive_picks || {};
    const en = evc.ev_negative_picks || {};
    const warn = evc.divergence_warning;

    return `
      <div class="clv-card ${warn ? "diag-warn" : ""}">
        <h3 class="card-title">Corelație EV vs CLV</h3>
        ${warn ? `<div class="warn-banner">⚠️ Divergență detectată: Pick-uri cu EV+ au CLV negativ constant. Modelul poate supraestima edge-ul.</div>` : ""}
        <div class="two-col">
          <div class="corr-box ${(ep.avg_clv||0) >= 0 ? "box-green" : "box-red"}">
            <div class="box-label">Pick-uri cu EV+</div>
            <div class="box-n">N = ${ep.n || 0}</div>
            <div class="box-val">CLV mediu: <strong>${ep.avg_clv != null ? fmtSign(ep.avg_clv, 2) + "%" : "—"}</strong></div>
            <div class="box-sub">CLV+ rate: ${fmtPct(ep.clv_positive_rate)}</div>
          </div>
          <div class="corr-box ${(en.avg_clv||0) >= 0 ? "box-green" : "box-red"}">
            <div class="box-label">Pick-uri cu EV≤0</div>
            <div class="box-n">N = ${en.n || 0}</div>
            <div class="box-val">CLV mediu: <strong>${en.avg_clv != null ? fmtSign(en.avg_clv, 2) + "%" : "—"}</strong></div>
            <div class="box-sub">CLV+ rate: ${fmtPct(en.clv_positive_rate)}</div>
          </div>
        </div>
        <p class="card-note">
          Pick-urile cu EV+ ar trebui să aibă CLV mai mare decât cele fără EV+. Dacă nu e cazul,
          recalibrează sursa de probabilitate.
        </p>
      </div>
    `;
  }

  function renderRolling(r30, r90) {
    return `
      <div class="clv-card">
        <h3 class="card-title">Trend CLV — rolling</h3>
        <div class="rolling-grid">
          ${renderRollingBox("Ultimele 30 zile", r30)}
          ${renderRollingBox("Ultimele 90 zile", r90)}
        </div>
      </div>
    `;
  }

  function renderRollingBox(label, r) {
    if (!r || !r.n) return `<div class="rolling-box"><div class="rolling-label">${label}</div><div class="rolling-na">Date insuficiente</div></div>`;
    return `
      <div class="rolling-box">
        <div class="rolling-label">${label}</div>
        <div class="rolling-stat">
          <span class="rs-label">Avg CLV</span>
          <span class="rs-val ${(r.avg_clv_pct||0) >= 0 ? "pos" : "neg"}">${fmtSign(r.avg_clv_pct, 2)}%</span>
        </div>
        <div class="rolling-stat">
          <span class="rs-label">Win Rate</span>
          <span class="rs-val">${fmtNum(r.win_rate_pct, 1)}%</span>
        </div>
        <div class="rolling-stat">
          <span class="rs-label">ROI Flat</span>
          <span class="rs-val ${(r.roi_flat_pct||0) >= 0 ? "pos" : "neg"}">${fmtSign(r.roi_flat_pct, 2)}%</span>
        </div>
        <div class="rolling-stat">
          <span class="rs-label">N pick-uri</span>
          <span class="rs-val">${r.n}</span>
        </div>
      </div>
    `;
  }

  function renderPicksTable(picks) {
    if (!picks.length) return "";
    const recent = picks.slice(0, 200); // paginate from JS

    return `
      <div class="clv-card picks-card">
        <h3 class="card-title">Pick-uri individuale (${picks.length} total)
          <span class="picks-filters">
            <select id="clv-filter-market" class="clv-select">
              <option value="">Toate piețele</option>
              ${[...new Set(picks.map(p => p.market))].sort().map(m => `<option value="${m}">${m}</option>`).join("")}
            </select>
            <select id="clv-filter-result" class="clv-select">
              <option value="">Toate</option>
              <option value="win">Câștig</option>
              <option value="lose">Pierdere</option>
            </select>
            <select id="clv-filter-clv" class="clv-select">
              <option value="">Orice CLV</option>
              <option value="pos">CLV+</option>
              <option value="neg">CLV-</option>
            </select>
          </span>
        </h3>
        <div class="picks-table-wrap">
          <table class="clv-table picks-table" id="clv-picks-table" data-all='${JSON.stringify(recent)}'>
            <thead>
              <tr>
                <th>Data</th>
                <th>Meci</th>
                <th>Piață</th>
                <th>Cotă pick</th>
                <th>Cotă closing</th>
                <th>CLV%</th>
                <th>EV pick%</th>
                <th>Rezultat</th>
              </tr>
            </thead>
            <tbody id="clv-picks-tbody">
              ${renderPicksRows(recent)}
            </tbody>
          </table>
        </div>
        ${picks.length > 200 ? `<p class="card-note">Afișate primele 200 din ${picks.length}. Filtrează pentru mai multă precizie.</p>` : ""}
      </div>
    `;
  }

  function renderPicksRows(picks) {
    return picks.map(p => `
      <tr>
        <td class="date-cell">${p.date || "—"}</td>
        <td class="match-cell" title="${p.home} vs ${p.away} (${p.league})">${short(p.home)} — ${short(p.away)}</td>
        <td class="market-cell">${p.market}</td>
        <td class="num">${fmtNum(p.picked_odds, 2)}</td>
        <td class="num">${fmtNum(p.closing_odds, 2)}</td>
        <td class="num ${p.clv_pct >= 0 ? "pos" : "neg"}">${fmtSign(p.clv_pct, 2)}%</td>
        <td class="num ${(p.ev_at_pick_pct||0) >= 0 ? "pos" : "neg"}">${p.ev_at_pick_pct != null ? fmtSign(p.ev_at_pick_pct, 2) + "%" : "—"}</td>
        <td class="result-cell ${p.won ? "win" : "lose"}">${p.won ? "✅" : "❌"}</td>
      </tr>
    `).join("");
  }

  /* ── filtre tabel ───────────────────────────────────────────────────────── */

  function hookTableFilters(panel) {
    const tableEl = panel.querySelector("#clv-picks-table");
    if (!tableEl) return;

    const allData = JSON.parse(tableEl.dataset.all || "[]");

    function applyFilters() {
      const mk  = panel.querySelector("#clv-filter-market")?.value || "";
      const res = panel.querySelector("#clv-filter-result")?.value || "";
      const clv = panel.querySelector("#clv-filter-clv")?.value   || "";

      let filtered = allData;
      if (mk)  filtered = filtered.filter(p => p.market === mk);
      if (res) filtered = filtered.filter(p => p.status === res || (res === "win" && p.won) || (res === "lose" && !p.won));
      if (clv === "pos") filtered = filtered.filter(p => p.clv_pct >= 0);
      if (clv === "neg") filtered = filtered.filter(p => p.clv_pct < 0);

      const tbody = panel.querySelector("#clv-picks-tbody");
      if (tbody) tbody.innerHTML = renderPicksRows(filtered.slice(0, 200));
    }

    ["#clv-filter-market","#clv-filter-result","#clv-filter-clv"].forEach(sel => {
      panel.querySelector(sel)?.addEventListener("change", applyFilters);
    });
  }

  /* ── stiluri ────────────────────────────────────────────────────────────── */

  function renderStyles() {
    if (document.getElementById("clv-styles")) return "";
    return `<style id="clv-styles">
      .clv-root { padding: 16px; font-family: inherit; max-width: 1200px; }
      .clv-title { font-size: 1.4rem; font-weight: 700; margin: 0 0 16px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
      .clv-updated { font-size: .75rem; font-weight: 400; color: #64748b; }
      .clv-card { background: var(--card-bg, #1e293b); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--border, #334155); }
      .card-title { font-size: 1rem; font-weight: 600; margin: 0 0 12px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .card-note { font-size: .78rem; color: #94a3b8; margin: 10px 0 0; }

      /* Diagnosis */
      .diag-signal { font-size: .7rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 6px; opacity: .8; }
      .diag-text { margin: 0 0 8px; font-size: .95rem; }
      .diag-action { margin: 0 0 10px; font-size: .88rem; }
      .diag-meta { display: flex; gap: 16px; font-size: .78rem; color: #94a3b8; }
      .diag-great { border-left: 4px solid #22c55e; background: rgba(34,197,94,.08); }
      .diag-ok    { border-left: 4px solid #f59e0b; background: rgba(245,158,11,.08); }
      .diag-warn  { border-left: 4px solid #f97316; background: rgba(249,115,22,.08); }
      .diag-bad   { border-left: 4px solid #ef4444; background: rgba(239,68,68,.08); }
      .diag-info  { border-left: 4px solid #3b82f6; background: rgba(59,130,246,.08); }

      /* KPIs */
      .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
      .kpi-card { flex: 1; min-width: 140px; background: var(--card-bg, #1e293b); border: 1px solid var(--border, #334155); border-radius: 10px; padding: 12px; }
      .kpi-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; margin-bottom: 4px; }
      .kpi-value { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; }
      .kpi-sub { font-size: .72rem; color: #64748b; }
      .kpi-good  .kpi-value { color: #22c55e; }
      .kpi-bad   .kpi-value { color: #ef4444; }
      .kpi-neutral .kpi-value { color: #f8fafc; }

      /* Table */
      .clv-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
      .clv-table th { text-align: left; padding: 8px 6px; border-bottom: 1px solid #334155; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; }
      .clv-table td { padding: 7px 6px; border-bottom: 1px solid rgba(51,65,85,.5); }
      .clv-table tr:last-child td { border-bottom: none; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .pos { color: #22c55e; font-weight: 600; }
      .neg { color: #ef4444; font-weight: 600; }

      /* Buckets */
      .bucket-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .bar-bg { background: rgba(255,255,255,.06); border-radius: 4px; height: 8px; min-width: 60px; }
      .bar-fill { height: 8px; border-radius: 4px; transition: width .3s; }

      /* Correlation */
      .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
      .corr-box { border-radius: 8px; padding: 14px; text-align: center; }
      .box-green { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); }
      .box-red   { background: rgba(239,68,68,.1);  border: 1px solid rgba(239,68,68,.3); }
      .box-label { font-size: .8rem; font-weight: 600; margin-bottom: 4px; color: #94a3b8; }
      .box-n     { font-size: .75rem; color: #64748b; margin-bottom: 6px; }
      .box-val   { font-size: 1.1rem; }
      .box-sub   { font-size: .75rem; color: #94a3b8; margin-top: 4px; }
      .warn-banner { background: rgba(249,115,22,.15); border: 1px solid rgba(249,115,22,.4); border-radius: 6px; padding: 8px 12px; font-size: .85rem; margin-bottom: 12px; }

      /* Rolling */
      .rolling-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .rolling-box { background: rgba(255,255,255,.03); border-radius: 8px; padding: 12px; border: 1px solid #334155; }
      .rolling-label { font-weight: 600; margin-bottom: 10px; color: #cbd5e1; }
      .rolling-stat { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(51,65,85,.5); }
      .rolling-stat:last-child { border-bottom: none; }
      .rs-label { font-size: .8rem; color: #94a3b8; }
      .rs-val { font-size: .85rem; font-weight: 600; }
      .rolling-na { color: #64748b; font-size: .85rem; }

      /* Picks table */
      .picks-card { overflow: hidden; }
      .picks-table-wrap { overflow-x: auto; max-height: 400px; overflow-y: auto; }
      .picks-filters { display: flex; gap: 8px; flex-wrap: wrap; }
      .clv-select { background: var(--input-bg, #0f172a); border: 1px solid #334155; border-radius: 6px; padding: 4px 8px; font-size: .78rem; color: inherit; }
      .date-cell { font-size: .8rem; white-space: nowrap; color: #94a3b8; }
      .market-cell { font-weight: 600; font-size: .82rem; }
      .match-cell { font-size: .8rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .result-cell { text-align: center; }
      .result-cell.win  { color: #22c55e; }
      .result-cell.lose { color: #ef4444; }

      /* Loading / Error */
      .clv-loading { text-align: center; padding: 48px; color: #94a3b8; }
      .clv-error   { text-align: center; padding: 48px; color: #ef4444; }
      .clv-error .hint { font-size: .82rem; color: #94a3b8; }
      .spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin .7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 640px) {
        .kpi-row { flex-direction: column; }
        .two-col, .rolling-grid { grid-template-columns: 1fr; }
        .clv-title { font-size: 1.1rem; }
      }
    </style>`;
  }

  /* ── formatare ──────────────────────────────────────────────────────────── */

  function fmtNum(v, dec = 2) {
    if (v == null) return "—";
    return Number(v).toFixed(dec);
  }
  function fmtSign(v, dec = 2) {
    if (v == null) return "—";
    const n = Number(v);
    return (n >= 0 ? "+" : "") + n.toFixed(dec);
  }
  function fmtPct(v) {
    if (v == null) return "—";
    return (Number(v) * 100).toFixed(1) + "%";
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("ro-RO", {dateStyle:"short", timeStyle:"short"}); }
    catch { return iso.slice(0, 16); }
  }
  function short(s, max = 14) {
    if (!s) return "—";
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  /* ── inițializare ───────────────────────────────────────────────────────── */

  function init() {
    if (!injectTab()) return;
    injectPanel();
    console.log("[CLV Tracker] Inițializat cu succes.");
  }

  // Așteptăm DOM-ul
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // DOM gata, încercăm imediat; dacă tab bar-ul e generat dinamic, reîncercăm
    const ok = init();
    if (!ok) {
      let attempts = 0;
      const iv = setInterval(() => {
        if (++attempts > 20 || init()) clearInterval(iv);
      }, 300);
    }
  }
})();
