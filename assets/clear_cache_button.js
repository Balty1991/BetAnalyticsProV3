/**
 * BetAnalytics Pro — Clear Cache Button
 * =====================================
 * Buton flotant in colt dreapta-jos care, la apasare:
 *   1. Dezinregistreaza toate Service Workers (sw.js, etc.)
 *   2. Goleste Cache Storage API (toate cache-urile versionate)
 *   3. Sterge cheile de localStorage cu prefix de cache (pastreaza setarile)
 *   4. Reincarca pagina cu cache-bypass (?_cb=timestamp)
 *
 * Adaugare in index.html, inainte de </body>:
 *   <script defer src="./assets/clear_cache_button.js?v=20260427clear1"></script>
 *
 * Self-contained: niciun import, nu modifica UI-ul existent, nu intra in conflict
 * cu app.js, pro_command_center.js sau alte scripturi.
 */
(function () {
  'use strict';
  if (window.__baClearCacheReady) return;
  window.__baClearCacheReady = true;

  // Chei de localStorage care NU se sterg (setari user, jurnale, bilete)
  var PROTECTED_KEYS = [
    'ba_settings',
    'ba_bankroll',
    'ba_user_preferences',
    'ba_journal_local',
    'ba_tickets',
    'ba_kelly_config',
  ];

  var STYLES = [
    '.ba-cache-fab{',
    '  position:fixed;right:14px;bottom:78px;z-index:9999;',
    '  width:46px;height:46px;border:1px solid rgba(255,255,255,.18);',
    '  background:rgba(20,28,45,.92);color:#e2e8f0;border-radius:50%;',
    '  display:flex;align-items:center;justify-content:center;',
    '  box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer;',
    '  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
    '  font-family:system-ui,-apple-system,sans-serif;font-size:20px;',
    '  transition:transform .15s ease,background .15s ease;',
    '  -webkit-tap-highlight-color:transparent;',
    '}',
    '.ba-cache-fab:hover,.ba-cache-fab:focus{',
    '  transform:scale(1.06);background:rgba(40,52,75,.96);',
    '  outline:none;border-color:rgba(255,255,255,.28);',
    '}',
    '.ba-cache-fab:active{transform:scale(.94)}',
    '.ba-cache-fab[data-busy="1"]{opacity:.7;pointer-events:none}',
    '.ba-cache-toast{',
    '  position:fixed;left:50%;bottom:140px;transform:translateX(-50%);',
    '  background:#0f172a;color:#e2e8f0;padding:10px 16px;',
    '  border:1px solid rgba(255,255,255,.18);border-radius:10px;',
    '  z-index:10000;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.5);',
    '  max-width:80vw;text-align:center;line-height:1.4;',
    '  font-family:system-ui,-apple-system,sans-serif;',
    '}',
    '@media (max-width:480px){',
    '  .ba-cache-fab{right:10px;bottom:90px;width:42px;height:42px;font-size:18px}',
    '}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('ba-cache-styles')) return;
    var style = document.createElement('style');
    style.id = 'ba-cache-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function showToast(message, durationMs) {
    var t = document.createElement('div');
    t.className = 'ba-cache-toast';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function () {
      try { t.remove(); } catch (e) { /* ignore */ }
    }, durationMs || 1800);
  }

  function unregisterServiceWorkers() {
    if (!('serviceWorker' in navigator)) return Promise.resolve([]);
    return navigator.serviceWorker.getRegistrations()
      .then(function (regs) {
        return Promise.all(regs.map(function (r) {
          return r.unregister().catch(function (e) { return 'sw:' + e.message; });
        }));
      })
      .catch(function (e) { return ['sw:' + e.message]; });
  }

  function clearCacheStorage() {
    if (!('caches' in window)) return Promise.resolve([]);
    return caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return caches.delete(k).catch(function (e) { return 'cache:' + e.message; });
        }));
      })
      .catch(function (e) { return ['caches:' + e.message]; });
  }

  function clearLocalStorageCache() {
    try {
      if (!window.localStorage) return [];
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && PROTECTED_KEYS.indexOf(k) === -1 &&
            (k.indexOf('ba_cache_') === 0 || k.indexOf('cache_') === 0)) {
          keys.push(k);
        }
      }
      keys.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });
      return keys;
    } catch (e) {
      return ['ls:' + (e && e.message || 'unknown')];
    }
  }

  function reloadWithBypass() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('_cb', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      try { window.location.reload(true); } catch (_) { window.location.reload(); }
    }
  }

  function handleClick(btn) {
    var ok = window.confirm(
      'Curata cache-ul aplicatiei si reincarca?\n\n' +
      'Setarile, biletele si jurnalul tau sunt pastrate.'
    );
    if (!ok) return;

    btn.dataset.busy = '1';
    btn.textContent = '...';

    Promise.all([unregisterServiceWorkers(), clearCacheStorage()])
      .then(function () {
        var lsCleared = clearLocalStorageCache();
        showToast(
          'Cache curatat. Reincarc...' +
          (lsCleared && lsCleared.length ? ' (' + lsCleared.length + ' chei)' : ''),
          1200
        );
        setTimeout(reloadWithBypass, 800);
      })
      .catch(function (e) {
        showToast('Eroare: ' + (e && e.message || 'necunoscuta') + '. Reincarc...', 1500);
        setTimeout(reloadWithBypass, 1200);
      });
  }

  function mount() {
    injectStyles();
    if (document.getElementById('ba-cache-fab')) return;
    var btn = document.createElement('button');
    btn.id = 'ba-cache-fab';
    btn.className = 'ba-cache-fab';
    btn.type = 'button';
    btn.title = 'Curata cache si reincarca';
    btn.setAttribute('aria-label', 'Curata cache si reincarca aplicatia');
    btn.textContent = '\u21bb'; // ↻ refresh symbol
    btn.addEventListener('click', function () { handleClick(btn); });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
