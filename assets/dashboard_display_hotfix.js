(function () {
  "use strict";

  if (window.__baDashboardDisplayFix) return;
  window.__baDashboardDisplayFix = true;

  function text(value) {
    return String(value == null ? "" : value);
  }

  function esc(value) {
    var div = document.createElement("div");
    div.textContent = text(value);
    return div.innerHTML;
  }

  function sameLocalDay(value) {
    if (!value) return false;
    var date = new Date(value);
    var now = new Date();
    return isFinite(date.getTime()) &&
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  function allMatches() {
    return Array.isArray(window.ALL_MATCHES) ? window.ALL_MATCHES : [];
  }

  function eligibleMatches() {
    return allMatches().filter(function (match) {
      try {
        return typeof window.passesSelectionFilter === "function"
          ? window.passesSelectionFilter(match)
          : true;
      } catch (err) {
        return true;
      }
    });
  }

  function isProActive(match) {
    try {
      return typeof window.isProActiveMatch === "function"
        ? window.isProActiveMatch(match)
        : false;
    } catch (err) {
      return false;
    }
  }

  function hasOdds(match) {
    var bet = match && match.bestBet ? match.bestBet : {};
    return !!(match && (
      match.analysisState === "ELIGIBLE" ||
      Number(bet.odds || bet.displayOdds || 0) > 1.01
    ));
  }

  function hasValue(match) {
    var bet = match && match.bestBet ? match.bestBet : {};
    return Number(bet.edgePct || 0) >= 5 || Number(bet.value || 0) >= 0.05;
  }

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 12) return "Bună dimineața";
    if (hour < 18) return "Bună ziua";
    return "Bună seara";
  }

  function metrics() {
    var matches = eligibleMatches();
    var status = {};
    try {
      if (typeof window.getStatusDisplayMetrics === "function") {
        status = window.getStatusDisplayMetrics() || {};
      }
    } catch (err) {}

    var tracking = Array.isArray(window.TRACKING) ? window.TRACKING : [];
    var syncTime = "";
    try {
      if (typeof window.getStatusDisplayTime === "function") {
        syncTime = window.getStatusDisplayTime() || "";
      }
    } catch (err2) {}

    return {
      matches: matches,
      ml: Number(status.ml || matches.length || 0),
      odds: Number(status.odds || matches.filter(hasOdds).length || 0),
      pro: matches.filter(isProActive).length,
      value: matches.filter(hasValue).length,
      today: matches.filter(function (match) {
        return sameLocalDay(match.event_date || match.eventDate || match.date);
      }).length || matches.length,
      openTracking: tracking.filter(function (item) {
        return item && item.status === "pending";
      }).length,
      syncTime: syncTime
    };
  }

  function actionButton(action, labelHtml) {
    return "<button class=\"dashboard-v16-quick-btn\" type=\"button\" data-dfix-action=\"" +
      action + "\">" + labelHtml + "</button>";
  }

  function buildHeaderHtml() {
    var metric = metrics();
    return "" +
      "<div class=\"dashboard-v16-topbar ba-dfix-node\">" +
        "<div class=\"dashboard-v16-brand\">" +
          "<div class=\"dashboard-v16-logo\">⚡</div>" +
          "<div class=\"dashboard-v16-brand-text\">" +
            "<div class=\"dashboard-v16-brand-title\">BetAnalytics Pro</div>" +
            "<div class=\"dashboard-v16-brand-sub\">PRO V21 Intelligence" +
              (metric.syncTime ? " • sync " + esc(metric.syncTime) : " • sync activ") +
            "</div>" +
          "</div>" +
        "</div>" +
        "<div class=\"dashboard-v16-header-actions\">" +
          "<button class=\"dashboard-v16-icon-btn\" type=\"button\" data-dfix-action=\"tracking\" aria-label=\"Tracking bilete\">🎫<span class=\"dashboard-v16-badge\">" + metric.openTracking + "</span></button>" +
          "<button class=\"dashboard-v16-pro-btn\" type=\"button\" data-dfix-action=\"pro\">Vezi meciuri</button>" +
        "</div>" +
      "</div>" +

      "<div class=\"dashboard-v16-greeting ba-dfix-node\">" +
        "<div>" +
          "<div class=\"dashboard-v16-greeting-title\">" + esc(greeting()) + "</div>" +
          "<div class=\"dashboard-v16-greeting-sub\">" + metric.today + " meciuri disponibile azi • " +
            metric.matches.length + " eligibile în pool • " + metric.pro + " pro active</div>" +
        "</div>" +
        "<div class=\"dashboard-v16-mini-pills\">" +
          "<span class=\"dashboard-v16-mini-pill live\">Live</span>" +
          "<span class=\"dashboard-v16-mini-pill update\">ML " + metric.ml + "</span>" +
          "<span class=\"dashboard-v16-mini-pill\">Cote " + metric.odds + "</span>" +
        "</div>" +
      "</div>" +

      "<div class=\"dashboard-v16-section ba-dfix-node\">" +
        "<div class=\"dashboard-v16-section-head\">" +
          "<div>" +
            "<div class=\"dashboard-v16-section-title\">🚀 Acces rapid</div>" +
            "<div class=\"dashboard-v16-section-sub\">Panoul principal a fost reașezat corect: cardurile de acțiune, oportunitățile și performanța stau într-un singur shell stabil.</div>" +
          "</div>" +
        "</div>" +
        "<div class=\"dashboard-v16-quick-grid\">" +
          actionButton("all", "<div class=\"dashboard-v16-quick-k\">" + metric.ml + " predicții ML</div><div class=\"dashboard-v16-quick-s\">Toate meciurile modelate</div>") +
          actionButton("odds", "<div class=\"dashboard-v16-quick-k\">" + metric.odds + " cu cote BSD</div><div class=\"dashboard-v16-quick-s\">Doar selecții cu preț disponibil</div>") +
          actionButton("pro", "<div class=\"dashboard-v16-quick-k\">" + metric.pro + " Pro Active</div><div class=\"dashboard-v16-quick-s\">Setup-uri validate pentru analiză</div>") +
          actionButton("value", "<div class=\"dashboard-v16-quick-k\">" + metric.value + " value</div><div class=\"dashboard-v16-quick-s\">Edge pozitiv în pool-ul curent</div>") +
        "</div>" +
      "</div>";
  }

  function getShell(target) {
    var existing = target.querySelector(":scope > .dashboard-v16-shell");
    if (existing) return existing;

    var shell = document.createElement("div");
    shell.className = "dashboard-v16-shell";
    target.insertBefore(shell, target.firstChild);
    return shell;
  }

  function patchDisplay() {
    var target = document.getElementById("dashboard-modern-shell");
    if (!target) return;

    var hasDashboardCards =
      target.querySelector(".dashboard-v16-section") ||
      target.querySelector(".dashboard-v16-performance") ||
      target.querySelector(".dashboard-v16-reco");

    if (!hasDashboardCards) return;

    var shell = getShell(target);

    Array.prototype.slice.call(target.children).forEach(function (child) {
      if (child === shell || !child.classList) return;
      if (
        child.classList.contains("dashboard-v16-section") ||
        child.classList.contains("dashboard-v16-performance") ||
        child.classList.contains("dashboard-v16-reco")
      ) {
        shell.appendChild(child);
      }
    });

    var oldNodes = shell.querySelectorAll(".ba-dfix-node");
    Array.prototype.forEach.call(oldNodes, function (node) {
      node.remove();
    });

    shell.insertAdjacentHTML("afterbegin", buildHeaderHtml());
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-dfix-action]");
    if (!button) return;

    var action = button.getAttribute("data-dfix-action");
    if (action === "refresh" && typeof window.doRefresh === "function") {
      window.doRefresh(true);
      return;
    }
    if (action === "tracking" && typeof window.switchTab === "function") {
      window.switchTab("tracking");
      return;
    }
    if (typeof window.openDashboardStream === "function") {
      if (action === "odds") window.openDashboardStream("with_odds");
      else if (action === "pro") window.openDashboardStream("pro_active");
      else if (action === "value") window.openDashboardStream("value_active");
      else window.openDashboardStream("all_predictions");
    }
  });

  function start() {
    patchDisplay();
    [120, 350, 800, 1600, 3200, 6000].forEach(function (delay) {
      setTimeout(patchDisplay, delay);
    });
    setInterval(patchDisplay, 3000);

    try {
      new MutationObserver(function () {
        clearTimeout(window.__baDashboardDisplayFixTimer);
        window.__baDashboardDisplayFixTimer = setTimeout(patchDisplay, 80);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
