/**
 * display_snapshot.js
 * Saves MATCHES_FILTERED_CACHE to localStorage every time renderMatches() runs.
 * Keys: veyra_display_snapshot (current), veyra_display_history (last 50)
 * API: getDisplaySnapshot(), getDisplayHistory(), exportDisplaySnapshot()
 */
(function () {
  'use strict';

  var SNAPSHOT_KEY = 'veyra_display_snapshot';
  var HISTORY_KEY  = 'veyra_display_history';
  var MAX_HISTORY  = 50;

  function buildSnapshot() {
    var preds = Array.isArray(window.MATCHES_FILTERED_CACHE) ? window.MATCHES_FILTERED_CACHE : [];
    return {
      savedAt:  new Date().toISOString(),
      filter:   window.CURRENT_FILTER   || 'all',
      viewMode: window.MATCH_CARD_MODE  || 'simple',
      count:    preds.length,
      matches:  preds.map(function (m) {
        if (!m) return null;
        var _b    = m.bestBet;
        var _bet  = _b && typeof _b === 'object' ? (_b.type  || '') : (_b || '');
        var _odds = _b && typeof _b === 'object' ? (_b.bestOdds || _b.odds || null) : null;
        return {
          eventId:       m.eventId       || m.event_id   || '',
          home:          m.home          || m.homeTeam   || '',
          away:          m.away          || m.awayTeam   || '',
          league:        m.league        || m.leagueName || '',
          country:       m.country       || '',
          eventDate:     m.date          || m.eventDate  || m.event_date || '',
          bestBet:       _bet,
          smartScore:    m.smartScore    || 0,
          odds:          _odds,
          analysisState: m.analysisState || '',
          verdict:       m.verdict       || '',
          isTop:         !!(m.isTop      || m.top),
          isBetOk:       !!(m.isBetOk    || m.bet_ok)
        };
      }).filter(Boolean)
    };
  }

  function saveSnapshot() {
    try {
      var snap = buildSnapshot();
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));

      var history = [];
      try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) {}
      if (!Array.isArray(history)) history = [];
      history.unshift(snap);
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* silent */ }
  }

  function hookRenderMatches() {
    if (window.__displaySnapshotHooked) return;
    if (typeof window.renderMatches !== 'function') return;
    window.__displaySnapshotHooked = true;
    var orig = window.renderMatches;
    window.renderMatches = function () {
      var r = orig.apply(this, arguments);
      setTimeout(saveSnapshot, 150);
      return r;
    };
  }

  /* ---------- Public API ---------- */

  window.getDisplaySnapshot = function () {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)); } catch (e) { return null; }
  };

  window.getDisplayHistory = function () {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  };

  window.exportDisplaySnapshot = function () {
    var snap = window.getDisplaySnapshot();
    if (!snap) { console.warn('[VEYRA] No display snapshot found.'); return; }
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'veyra_display_' + snap.savedAt.slice(0, 16).replace(/[T:]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.exportDisplayHistory = function () {
    var hist = window.getDisplayHistory();
    if (!hist.length) { console.warn('[VEYRA] No display history found.'); return; }
    var blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'veyra_display_history_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---------- Boot ---------- */

  function boot() {
    hookRenderMatches();
    var attempts = 0;
    var iv = setInterval(function () {
      hookRenderMatches();
      attempts++;
      if (window.__displaySnapshotHooked || attempts > 30) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
