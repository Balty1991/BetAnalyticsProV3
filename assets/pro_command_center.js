/*
 * VEYRA Pro Command Center runtime
 * Safe restore: acest fișier există pentru că workflow-ul Fetch VEYRA Data
 * îl caută la pasul de commit/push.
 *
 * Nu modifică logica aplicației și nu schimbă UI-ul.
 * Scop: să nu mai pice workflow-ul cu:
 * fatal: pathspec 'assets/pro_command_center.js' did not match any files
 */

(function () {
  'use strict';

  var state = {
    name: 'VEYRA Pro Command Center',
    version: '2026-05-10-safe-restore',
    enabled: false,
    restored: true
  };

  window.VEYRA_PRO_COMMAND_CENTER = window.VEYRA_PRO_COMMAND_CENTER || state;
  window.VEYRA_PRO_COMMAND_CENTER.restored = true;
  window.VEYRA_PRO_COMMAND_CENTER.enabled = false;
  window.VEYRA_PRO_COMMAND_CENTER.version = state.version;

  function markReady() {
    try {
      document.documentElement.setAttribute('data-veyra-pro-command-center', 'restored');
    } catch (err) {
      // Nu lăsăm acest fișier să afecteze aplicația principală.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markReady, { once: true });
  } else {
    markReady();
  }
})();
