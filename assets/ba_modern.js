/**
 * BetAnalytics Pro — Modern Enhancement Layer
 * ===========================================
 * JavaScript minim care:
 *   1. Citeste data/build_status.json
 *   2. Monteaza un banner de status la inceputul body cu semafor freshness
 *   3. Reimprospateaza la fiecare 5 minute si la visibilitychange (revine in tab)
 *
 * NU modifica DOM-ul existent al cardurilor sau filtrelor, NU intra in conflict
 * cu app.js sau pro_command_center.js. Daca build_status.json lipseste, scriptul
 * tace si nu afiseaza nimic.
 *
 * Adaugare in index.html, inainte de </body>:
 *   <script defer src="./assets/ba_modern.js?v=20260427mod1"></script>
 */
(function () {
  'use strict';
  if (window.__bamModernReady) return;
  window.__bamModernReady = true;

  var STATUS_URL = './data/build_status.json';
  var REFRESH_MS = 5 * 60 * 1000; // 5 minute
  var BANNER_ID = 'bam-status-banner';
  var refreshTimer = null;

  function fmtAge(hours) {
    if (hours == null) return 'necunoscut';
    if (hours < 1) {
      var mins = Math.max(1, Math.round(hours * 60));
      return mins + ' min';
    }
    if (hours < 24) {
      return Math.round(hours * 10) / 10 + 'h';
    }
    return Math.round(hours / 24) + 'z';
  }

  function pickFreshAge(freshness) {
    if (!freshness || typeof freshness !== 'object') return null;
    var candidates = [
      freshness.predictions_age_hours,
      freshness.pro_intelligence_age_hours,
      freshness.events_age_hours,
    ].filter(function (x) { return typeof x === 'number'; });
    if (!candidates.length) return null;
    return Math.min.apply(null, candidates);
  }

  function buildBannerHTML(status) {
    var tone = status.freshness_tone || 'unknown';
    var age = pickFreshAge(status.freshness);
    var ageText = fmtAge(age);
    var matches = (status.counts && status.counts.matches) || 0;
    var preds = (status.counts && status.counts.predictions) || 0;
    var qScore = (status.quality && status.quality.model_quality_score);
    var qGrade = (status.quality && status.quality.model_quality_grade) || '-';
    var hasErr = !!(status.errors && status.errors.length);
    var hasWarn = !!(status.warnings && status.warnings.length);

    var leftLabel;
    if (hasErr) {
      leftLabel = 'Date <strong>cu erori</strong> (' + status.errors.length + ')';
      tone = 'bad';
    } else if (tone === 'good') {
      leftLabel = 'Date actualizate acum <strong>' + ageText + '</strong>';
    } else if (tone === 'warn') {
      leftLabel = 'Date <strong>' + ageText + '</strong> (>6h)';
    } else if (tone === 'bad') {
      leftLabel = 'Date <strong>vechi</strong> (' + ageText + ')';
    } else {
      leftLabel = 'Status necunoscut';
    }

    var pills = [
      '<span class="bam-status-pill" title="Meciuri">Meciuri <strong>' + matches + '</strong></span>',
      '<span class="bam-status-pill" title="Predictii">Predictii <strong>' + preds + '</strong></span>',
    ];
    if (qScore != null) {
      pills.push(
        '<span class="bam-status-pill" title="Scor calitate model">Scor <strong>' +
        Math.round(qScore) + '</strong> <em style="opacity:.7;font-style:normal">' + qGrade + '</em></span>'
      );
    }
    if (hasWarn && !hasErr) {
      pills.push(
        '<span class="bam-status-pill" title="' +
        escapeAttr((status.warnings || []).join('; ')) +
        '" style="color:var(--bam-status-warn);border-color:rgba(245,158,11,.3)">' +
        status.warnings.length + ' warn</span>'
      );
    }

    return [
      '<div class="bam-status-left">',
      '  <span class="bam-status-dot" data-tone="' + tone + '" aria-hidden="true"></span>',
      '  <span class="bam-status-text">' + leftLabel + '</span>',
      '</div>',
      '<div class="bam-status-right">',
      pills.join(''),
      '</div>',
    ].join('');
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ensureBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.className = 'bam-status-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    // Inserare ca prim copil al body, inaintea oricarui continut existent
    if (document.body.firstChild) {
      document.body.insertBefore(el, document.body.firstChild);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }

  function renderBanner(status) {
    var el = ensureBanner();
    el.innerHTML = buildBannerHTML(status);
    // Daca utilizatorul a inchis bannerul, respectam
    if (el.dataset.dismissed === '1') {
      el.style.display = 'none';
    }
  }

  function fetchStatus() {
    // Cache-busting cu timestamp ca sa luam intotdeauna ultima versiune
    var url = STATUS_URL + '?_=' + Date.now();
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function refresh() {
    fetchStatus()
      .then(function (status) { renderBanner(status); })
      .catch(function (err) {
        // Silent: daca fisierul lipseste, nu deranjam UI-ul
        if (window.console && console.debug) {
          console.debug('[ba_modern] status fetch:', err.message);
        }
      });
  }

  function startRefreshTimer() {
    stopRefreshTimer();
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  function stopRefreshTimer() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      refresh();
      startRefreshTimer();
    } else {
      stopRefreshTimer();
    }
  }

  function init() {
    refresh();
    startRefreshTimer();
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
