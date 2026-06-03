/**
 * VEYRA — Splash Screen
 * Afișează sigla animată 3.5s la fiecare deschidere a aplicației.
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    #vs-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: #06080F;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: opacity 0.7s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #vs-overlay.vs-hide {
      opacity: 0;
      pointer-events: none;
    }

    /* scan line */
    .vs-scan {
      position: absolute;
      left: 0; right: 0;
      height: 180px;
      background: linear-gradient(
        to bottom,
        transparent 0%,
        rgba(43, 229, 197, 0.03) 40%,
        rgba(43, 229, 197, 0.07) 50%,
        rgba(43, 229, 197, 0.03) 60%,
        transparent 100%
      );
      animation: vs-scan-move 2.2s linear infinite;
      pointer-events: none;
    }
    @keyframes vs-scan-move {
      from { top: -180px; }
      to   { top: 100vh; }
    }

    /* rings */
    .vs-rings {
      position: absolute;
      top: 50%;
      left: 50%;
    }
    .vs-ring {
      position: absolute;
      border-radius: 50%;
      border: 1px solid rgba(43, 229, 197, 0.25);
      transform: translate(-50%, -50%) scale(0);
      animation: vs-ring-out 3s ease-out infinite;
    }
    .vs-ring:nth-child(1) { width: 240px; height: 240px; animation-delay: 0.0s; }
    .vs-ring:nth-child(2) { width: 380px; height: 380px; animation-delay: 0.7s; }
    .vs-ring:nth-child(3) { width: 520px; height: 520px; animation-delay: 1.4s; }
    @keyframes vs-ring-out {
      0%   { opacity: 0.7; transform: translate(-50%, -50%) scale(0.15); }
      100% { opacity: 0;   transform: translate(-50%, -50%) scale(1); }
    }

    /* corner accents */
    .vs-corner {
      position: absolute;
      width: 28px;
      height: 28px;
      opacity: 0;
      animation: vs-fade-in 0.5s ease 0.4s forwards;
    }
    .vs-corner.tl { top: 22%; left: calc(50% - 150px); border-top: 2px solid rgba(43,229,197,.5); border-left: 2px solid rgba(43,229,197,.5); }
    .vs-corner.tr { top: 22%; right: calc(50% - 150px); border-top: 2px solid rgba(43,229,197,.5); border-right: 2px solid rgba(43,229,197,.5); }
    .vs-corner.bl { bottom: 22%; left: calc(50% - 150px); border-bottom: 2px solid rgba(43,229,197,.5); border-left: 2px solid rgba(43,229,197,.5); }
    .vs-corner.br { bottom: 22%; right: calc(50% - 150px); border-bottom: 2px solid rgba(43,229,197,.5); border-right: 2px solid rgba(43,229,197,.5); }

    /* logo */
    .vs-logo-wrap {
      position: relative;
      z-index: 2;
      opacity: 0;
      animation: vs-logo-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
    }
    @keyframes vs-logo-in {
      0%   { opacity: 0; transform: scale(0.72) translateY(12px); filter: blur(6px); }
      60%  { opacity: 1; filter: blur(0); }
      100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
    }
    .vs-logo-wrap img {
      width: min(300px, 72vw);
      display: block;
      filter: drop-shadow(0 0 28px rgba(43, 229, 197, 0.45))
              drop-shadow(0 0 60px rgba(43, 229, 197, 0.18));
      animation: vs-logo-glow 2s ease-in-out 1.2s infinite alternate;
    }
    @keyframes vs-logo-glow {
      from { filter: drop-shadow(0 0 28px rgba(43,229,197,.45)) drop-shadow(0 0 60px rgba(43,229,197,.18)); }
      to   { filter: drop-shadow(0 0 38px rgba(43,229,197,.65)) drop-shadow(0 0 80px rgba(43,229,197,.28)); }
    }

    /* tagline */
    .vs-tagline {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(43, 229, 197, 0.55);
      margin-top: 24px;
      position: relative;
      z-index: 2;
      opacity: 0;
      animation: vs-fade-in 0.6s ease 1.0s forwards;
    }

    /* loading bar */
    .vs-bar-wrap {
      position: relative;
      z-index: 2;
      width: min(200px, 55vw);
      height: 2px;
      background: rgba(255,255,255,.06);
      border-radius: 2px;
      margin-top: 36px;
      overflow: hidden;
      opacity: 0;
      animation: vs-fade-in 0.4s ease 1.1s forwards;
    }
    .vs-bar-fill {
      height: 100%;
      width: 0%;
      border-radius: 2px;
      background: linear-gradient(90deg, rgba(43,229,197,.5), #2BE5C5, rgba(43,229,197,.5));
      background-size: 200% 100%;
      animation: vs-bar-grow 2.2s cubic-bezier(0.4,0,0.2,1) 1.1s forwards,
                 vs-bar-shimmer 1.2s linear 1.1s infinite;
    }
    @keyframes vs-bar-grow {
      from { width: 0%; }
      to   { width: 100%; }
    }
    @keyframes vs-bar-shimmer {
      from { background-position: 200% 0; }
      to   { background-position: -200% 0; }
    }

    /* dots */
    .vs-dots {
      display: flex;
      gap: 7px;
      margin-top: 16px;
      position: relative;
      z-index: 2;
      opacity: 0;
      animation: vs-fade-in 0.4s ease 1.3s forwards;
    }
    .vs-dots span {
      width: 4px; height: 4px;
      border-radius: 50%;
      background: rgba(43, 229, 197, 0.6);
      animation: vs-dot-bounce 1.1s ease-in-out infinite;
    }
    .vs-dots span:nth-child(2) { animation-delay: 0.18s; }
    .vs-dots span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes vs-dot-bounce {
      0%, 80%, 100% { opacity: 0.25; transform: scale(0.75); }
      40%            { opacity: 1;    transform: scale(1.3); }
    }

    @keyframes vs-fade-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;

  var styleEl = document.createElement('style');
  styleEl.id = 'vs-style';
  styleEl.textContent = CSS;

  var overlay = document.createElement('div');
  overlay.id = 'vs-overlay';
  overlay.innerHTML =
    '<div class="vs-scan"></div>' +
    '<div class="vs-rings">' +
      '<div class="vs-ring"></div>' +
      '<div class="vs-ring"></div>' +
      '<div class="vs-ring"></div>' +
    '</div>' +
    '<div class="vs-corner tl"></div>' +
    '<div class="vs-corner tr"></div>' +
    '<div class="vs-corner bl"></div>' +
    '<div class="vs-corner br"></div>' +
    '<div class="vs-logo-wrap">' +
      '<img src="./veyra-logo.png" alt="VEYRA" ' +
           'onerror="this.onerror=null;this.src=\'./icon-512.png\'">' +
    '</div>' +
    '<div class="vs-tagline">Sports Analytics &nbsp;·&nbsp; AI Predictions</div>' +
    '<div class="vs-bar-wrap"><div class="vs-bar-fill"></div></div>' +
    '<div class="vs-dots"><span></span><span></span><span></span></div>';

  function mount() {
    document.head.appendChild(styleEl);
    document.body.insertBefore(overlay, document.body.firstChild);

    setTimeout(function () {
      overlay.classList.add('vs-hide');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      }, 750);
    }, 3400);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
