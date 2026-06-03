/**
 * VEYRA Splash — "SCAN" v10
 * O linie de lumină coboară și dezvăluie logo-ul rând cu rând.
 * Zero canvas, pur CSS, performant pe orice mobil.
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    /* ── overlay ─────────────────────────────────────────────── */
    #vs {
      position: fixed; inset: 0; z-index: 999999;
      background: #00040f;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      overflow: hidden;
      transition: opacity 1s cubic-bezier(.4,0,.2,1);
    }
    #vs.out { opacity: 0; pointer-events: none }

    /* "pornire ecran" flash la start */
    #vs::before {
      content: ''; position: absolute; inset: 0;
      pointer-events: none; z-index: 30;
      background: rgba(43,229,197,.12);
      animation: vs-poweron .35s ease-out 0s forwards;
    }
    @keyframes vs-poweron { 0%{opacity:1} 100%{opacity:0} }

    /* vigneta radială */
    #vs::after {
      content: ''; position: absolute; inset: 0;
      pointer-events: none; z-index: 20;
      background: radial-gradient(ellipse at center,
        transparent 22%, rgba(0,2,10,.65) 100%);
    }

    /* glow ambiental respirator */
    .vs-glow {
      position: absolute; top:50%; left:50%;
      width: 80vmax; height: 80vmax;
      transform: translate(-50%,-50%); border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle,
        rgba(43,229,197,.07) 0%,
        rgba(43,229,197,.02) 40%,
        transparent 65%);
      animation: vs-breathe 4s ease-in-out .5s infinite alternate;
    }
    @keyframes vs-breathe {
      from { transform:translate(-50%,-50%) scale(.85); opacity:.5 }
      to   { transform:translate(-50%,-50%) scale(1.15); opacity:1 }
    }

    /* ── stage ────────────────────────────────────────────────── */
    .vs-stage {
      position: relative;
      width: min(340px,86vw); height: min(340px,86vw);
      display: flex; align-items: center; justify-content: center;
      z-index: 5;
    }

    /* ── wrapper scan — overflow hidden ────────────────────────── */
    .vs-wrap {
      position: relative;
      width: min(310px,80vw); height: min(310px,80vw);
      overflow: hidden;
      /* gradient de "activare" al fundalului sync cu scanul */
    }

    /* logo — dezvăluit prin clip-path sincron cu linia de scan */
    .vs-img {
      width: 100%; height: 100%; display: block;
      clip-path: inset(0 0 100% 0);
      animation:
        vs-reveal  1.25s linear       .28s both,
        vs-flash   .45s ease-out      1.55s both,
        vs-pulse   3.2s ease-in-out   2.1s  infinite alternate;
      will-change: filter, clip-path;
    }
    @keyframes vs-reveal {
      from { clip-path: inset(0 0 100% 0) }
      to   { clip-path: inset(0 0 0% 0)   }
    }
    @keyframes vs-flash {
      0%   { filter: drop-shadow(0 0 8px  rgba(43,229,197,.3)) brightness(1)   }
      35%  { filter: drop-shadow(0 0 40px rgba(43,229,197,.9)) brightness(1.7) }
      100% { filter: drop-shadow(0 0 22px rgba(43,229,197,.55)) brightness(1)  }
    }
    @keyframes vs-pulse {
      from { filter: drop-shadow(0 0 16px rgba(43,229,197,.4)) drop-shadow(0 0 45px rgba(43,229,197,.18)) }
      to   { filter: drop-shadow(0 0 34px rgba(43,229,197,.85)) drop-shadow(0 0 80px rgba(43,229,197,.35)) drop-shadow(0 2px 8px rgba(245,166,35,.2)) }
    }

    /* linia de scan — lumina care coboară */
    .vs-scan {
      position: absolute;
      left: -8%; right: -8%;
      height: 48px;
      top: -48px;
      pointer-events: none; z-index: 10;
      background: linear-gradient(to bottom,
        transparent                   0%,
        rgba(43,229,197,.03)          30%,
        rgba(43,229,197,.12)          60%,
        rgba(255,255,255,.85)         90%,
        rgba(43,229,197,.2)          100%
      );
      /* linie strălucitoare la capătul de jos */
      border-bottom: 1px solid rgba(43,229,197,.9);
      box-shadow:
        0 2px 18px rgba(43,229,197,.8),
        0 4px 50px rgba(43,229,197,.35),
        0 0  80px rgba(43,229,197,.15);
      animation: vs-scan-move 1.25s linear .28s forwards;
    }
    @keyframes vs-scan-move {
      from { top: -48px  }
      to   { top: 100%   }
    }

    /* ── corner ticks ──────────────────────────────────────────── */
    .vs-c {
      position: absolute; width: 16px; height: 16px;
      opacity: 0; animation: vs-fi .3s ease 1.58s forwards;
    }
    .vs-c.tl { top:-1px;    left:-1px;    border-top:  1.5px solid rgba(43,229,197,.65); border-left: 1.5px solid rgba(43,229,197,.65) }
    .vs-c.tr { top:-1px;    right:-1px;   border-top:  1.5px solid rgba(43,229,197,.65); border-right:1.5px solid rgba(43,229,197,.65) }
    .vs-c.bl { bottom:-1px; left:-1px;    border-bottom:1.5px solid rgba(245,166,35,.55); border-left: 1.5px solid rgba(245,166,35,.55) }
    .vs-c.br { bottom:-1px; right:-1px;   border-bottom:1.5px solid rgba(245,166,35,.55); border-right:1.5px solid rgba(245,166,35,.55) }

    /* ── bloc info ────────────────────────────────────────────── */
    .vs-info {
      position: relative; z-index: 5;
      display: flex; flex-direction: column;
      align-items: center; gap: 8px;
      margin-top: 18px;
    }

    /* procent */
    .vs-pct {
      font-family: 'Courier New', monospace;
      font-size: 14px; font-weight: 700;
      color: #2BE5C5; letter-spacing: .06em;
      opacity: 0; animation: vs-fi .4s ease .3s forwards;
    }

    /* tagline — apare după scan */
    .vs-tag {
      font-family: 'Courier New', monospace;
      font-size: 7.5px; font-weight: 700;
      letter-spacing: .26em; text-transform: uppercase;
      color: rgba(43,229,197,.28); white-space: nowrap;
      opacity: 0; animation: vs-fi .6s ease 2s forwards;
    }

    /* bara de jos — creste sync cu scanul */
    .vs-bar {
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(to right,
        transparent 0%,
        rgba(43,229,197,.4)  20%,
        rgba(43,229,197,.7)  50%,
        rgba(245,166,35,.5)  80%,
        transparent 100%);
      transform: scaleX(0); transform-origin: center;
      animation: vs-bar 1.55s cubic-bezier(.4,0,.2,1) .28s forwards;
    }
    @keyframes vs-bar { from{transform:scaleX(0)} to{transform:scaleX(1)} }

    /* linii orizontale laterale — apar după scan */
    .vs-hl, .vs-hr {
      position: absolute; top: 50%; height: 1px;
      transform: translateY(-50%); z-index: 2;
      opacity: 0; animation: vs-fi .7s ease 1.7s forwards;
    }
    .vs-hl {
      right: calc(50% + min(168px,43vw)); left: 0;
      background: linear-gradient(to left, rgba(43,229,197,.2), transparent 75%);
    }
    .vs-hr {
      left:  calc(50% + min(168px,43vw)); right: 0;
      background: linear-gradient(to right, rgba(43,229,197,.2), transparent 75%);
    }

    @keyframes vs-fi { from{opacity:0} to{opacity:1} }
  `;

  var sEl = document.createElement('style');
  sEl.textContent = CSS;

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    '<div class="vs-glow"></div>' +
    '<div class="vs-hl"></div>' +
    '<div class="vs-hr"></div>' +
    '<div class="vs-stage">' +
      '<div class="vs-c tl"></div>' +
      '<div class="vs-c tr"></div>' +
      '<div class="vs-c bl"></div>' +
      '<div class="vs-c br"></div>' +
      '<div class="vs-wrap">' +
        '<img class="vs-img" src="./assets/veyra-logo4.png" alt="VEYRA"' +
          ' onerror="this.onerror=null;this.src=\'./assets/veyra-icon.svg\'">' +
        '<div class="vs-scan"></div>' +
      '</div>' +
    '</div>' +
    '<div class="vs-info">' +
      '<div class="vs-pct" id="vs-pct">0%</div>' +
      '<div class="vs-tag">Sports Analytics · AI Predictions</div>' +
    '</div>' +
    '<div class="vs-bar"></div>';

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    /* counter progres — se termină când scan-ul se termină */
    setTimeout(function () {
      var el = document.getElementById('vs-pct');
      var n = 0;
      var iv = setInterval(function () {
        n = Math.min(100, n + 3 + Math.floor(Math.random() * 7));
        if (el) el.textContent = n + '%';
        if (n >= 100) clearInterval(iv);
      }, 36);
    }, 280);

    /* fade out */
    setTimeout(function () {
      ov.classList.add('out');
      setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (sEl.parentNode) sEl.parentNode.removeChild(sEl);
      }, 1050);
    }, 3700);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
