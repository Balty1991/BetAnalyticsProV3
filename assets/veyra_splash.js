/**
 * VEYRA Splash — "VECTOR" v9
 * Efecte adaptate geometriei logo-ului:
 *  - Două linii diagonale la 50° oglindesc unghiurile brațelor V
 *  - Flash auriu la vârful V (centrul imaginii)
 *  - Inel extern sincronic cu cercul interior al logo-ului
 *  - Background #00040f = exact culoarea logo-ului → blending nativ perfect
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    #vs {
      position:fixed; inset:0; z-index:999999;
      background:#00040f;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      overflow:hidden;
      transition: opacity 1s cubic-bezier(.4,0,.2,1);
    }
    #vs.out { opacity:0; pointer-events:none }

    /* vigneta radială → focusează ochiul pe centru */
    #vs::after {
      content:''; position:absolute; inset:0;
      pointer-events:none; z-index:20;
      background: radial-gradient(ellipse at center,
        transparent 25%, rgba(0,2,10,.6) 100%);
    }

    /* respira glow ambiental */
    .vv-glow {
      position:absolute; top:50%; left:50%;
      width:75vmax; height:75vmax;
      transform:translate(-50%,-50%); border-radius:50%;
      background: radial-gradient(circle,
        rgba(43,229,197,.07) 0%, rgba(43,229,197,.02) 38%, transparent 60%);
      animation: vv-breathe 3.8s ease-in-out infinite alternate;
      pointer-events:none;
    }
    @keyframes vv-breathe {
      from { transform:translate(-50%,-50%) scale(.88); opacity:.55 }
      to   { transform:translate(-50%,-50%) scale(1.12); opacity:1  }
    }

    /* ── brațele V — linii diagonale la 50° ── */
    /* Brațul stâng: pornește din centru spre stânga-sus */
    .vv-arm-l {
      position:absolute; top:50%; right:50%;
      height:1.5px; width:0;
      transform-origin: right center;
      transform: rotate(-50deg);
      background: linear-gradient(to left,
        rgba(43,229,197,.9) 0%, rgba(43,229,197,.4) 60%, transparent 100%);
      filter: drop-shadow(0 0 4px rgba(43,229,197,.7));
      animation:
        vv-arm-grow .5s cubic-bezier(.16,1,.3,1) .05s forwards,
        vv-arm-dim  .6s ease-in  .9s forwards;
      z-index:6;
    }
    /* Brațul drept: oglindă */
    .vv-arm-r {
      position:absolute; top:50%; left:50%;
      height:1.5px; width:0;
      transform-origin: left center;
      transform: rotate(-50deg);
      background: linear-gradient(to right,
        rgba(43,229,197,.9) 0%, rgba(43,229,197,.4) 60%, transparent 100%);
      filter: drop-shadow(0 0 4px rgba(43,229,197,.7));
      animation:
        vv-arm-grow .5s cubic-bezier(.16,1,.3,1) .05s forwards,
        vv-arm-dim  .6s ease-in  .9s forwards;
      z-index:6;
    }
    @keyframes vv-arm-grow {
      from { width:0 }
      to   { width: min(52vw, 210px) }
    }
    @keyframes vv-arm-dim {
      from { opacity:1 }
      to   { opacity:.1 }
    }

    /* ── flash auriu la vârful V (≈ centrul imaginii) ── */
    .vv-tip {
      position:absolute; top:50%; left:50%;
      width:6px; height:6px; border-radius:50%;
      transform:translate(-50%,-50%);
      background:#F5A623;
      opacity:0;
      animation: vv-tip-flash .55s ease-out .52s forwards;
      z-index:7;
    }
    @keyframes vv-tip-flash {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(1);
             box-shadow: 0 0 12px #F5A623, 0 0 40px rgba(245,166,35,.8), 0 0 90px rgba(245,166,35,.4) }
      100% { opacity:0; transform:translate(-50%,-50%) scale(12);
             box-shadow: 0 0 4px rgba(245,166,35,0) }
    }

    /* ── stage ── */
    .vv-stage {
      position:relative;
      width:min(420px,95vw); height:min(420px,95vw);
      display:flex; align-items:center; justify-content:center;
      z-index:5;
    }

    /* inel exterior — se "încarcă" clockwise (urma arcului de progres) */
    .vv-ring-svg {
      position:absolute; inset:0; overflow:visible;
      pointer-events:none; z-index:1;
    }
    .vv-rt {
      fill:none; stroke:rgba(43,229,197,.06); stroke-width:.6
    }
    .vv-rf {
      fill:none; stroke:url(#vv-grad); stroke-width:1.2;
      stroke-linecap:round;
      stroke-dasharray:295; stroke-dashoffset:295;
      transform-origin:50% 50%; transform:rotate(-90deg);
      animation: vv-charge 2.5s cubic-bezier(.4,0,.2,1) .3s forwards;
    }
    @keyframes vv-charge {
      from { stroke-dashoffset:295 }
      to   { stroke-dashoffset:0   }
    }
    /* puls inel după ce se încarcă */
    .vv-rt-pulse {
      fill:none; stroke:rgba(43,229,197,0); stroke-width:3;
      animation: vv-ring-pulse 2.8s ease-in-out 2.85s infinite alternate;
    }
    @keyframes vv-ring-pulse {
      from { stroke:rgba(43,229,197,0)   }
      to   { stroke:rgba(43,229,197,.06) }
    }

    /* inel interior static — oglindă cu cercul logo-ului */
    .vv-inner-ring {
      position:absolute;
      width:min(230px,57vw); height:min(230px,57vw);
      border-radius:50%;
      border:1px solid rgba(43,229,197,.08);
      animation: vv-inner-spin 25s linear .3s infinite;
      will-change:transform; pointer-events:none; z-index:2;
    }
    @keyframes vv-inner-spin {
      from { transform:rotate(0) }
      to   { transform:rotate(360deg) }
    }

    /* punct orbital cyan */
    .vv-dot {
      position:absolute; inset:0; border-radius:50%;
      animation: vv-orbit 7.5s linear .3s infinite;
      will-change:transform; pointer-events:none; z-index:4;
    }
    .vv-dot::after {
      content:''; position:absolute;
      top:2px; left:50%; transform:translateX(-50%);
      width:7px; height:7px; border-radius:50%;
      background:#2BE5C5;
      box-shadow: 0 0 9px #2BE5C5, 0 0 26px rgba(43,229,197,.7), 0 0 55px rgba(43,229,197,.28);
    }
    @keyframes vv-orbit {
      from { transform:rotate(-90deg) }
      to   { transform:rotate(270deg) }
    }

    /* punct orbital auriu (contra-rotație, inel interior) */
    .vv-dot2 {
      position:absolute;
      width:min(230px,57vw); height:min(230px,57vw);
      animation: vv-orbit2 12s linear .3s infinite;
      will-change:transform; pointer-events:none; z-index:4;
    }
    .vv-dot2::after {
      content:''; position:absolute;
      top:0; left:50%; transform:translate(-50%,-50%);
      width:5px; height:5px; border-radius:50%;
      background:#F5A623;
      box-shadow: 0 0 7px #F5A623, 0 0 20px rgba(245,166,35,.7);
    }
    @keyframes vv-orbit2 {
      from { transform:rotate(180deg) }
      to   { transform:rotate(-180deg) }
    }

    /* logo */
    .vv-logo {
      position:relative; z-index:3; opacity:0;
      animation: vv-logo-in 1s cubic-bezier(.16,1,.3,1) .28s forwards;
    }
    .vv-logo img {
      width:min(310px,80vw); display:block;
      will-change:filter;
      animation: vv-glow-l 3.5s ease-in-out 1.5s infinite alternate;
    }
    @keyframes vv-logo-in {
      0%   { opacity:0; transform:scale(.86) }
      100% { opacity:1; transform:scale(1)   }
    }
    @keyframes vv-glow-l {
      from {
        filter:
          drop-shadow(0 0 14px rgba(43,229,197,.35))
          drop-shadow(0 0 38px rgba(43,229,197,.14))
      }
      to   {
        filter:
          drop-shadow(0 0 30px rgba(43,229,197,.85))
          drop-shadow(0 0 70px rgba(43,229,197,.3))
          drop-shadow(0 3px 9px rgba(245,166,35,.24))
      }
    }

    /* linii orizontale accent (apar după logo) */
    .vv-hl, .vv-hr {
      position:absolute; top:50%; height:1px;
      transform:translateY(-50%); z-index:2;
      opacity:0; animation: vv-fi .8s ease 1.9s forwards;
    }
    .vv-hl {
      right:calc(50% + min(205px,44vw)); left:0;
      background: linear-gradient(to left, rgba(43,229,197,.22), transparent 80%);
    }
    .vv-hr {
      left:calc(50% + min(205px,44vw)); right:0;
      background: linear-gradient(to right, rgba(43,229,197,.22), transparent 80%);
    }

    /* bloc info */
    .vv-info {
      display:flex; flex-direction:column; align-items:center;
      gap:8px; margin-top:6px; z-index:5; position:relative;
    }
    .vv-pct {
      font-family:'Courier New',monospace; font-size:14px; font-weight:700;
      color:#2BE5C5; letter-spacing:.06em;
      opacity:0; animation: vv-fi .45s ease .3s forwards;
    }
    .vv-tag {
      font-family:'Courier New',monospace; font-size:7.5px; font-weight:700;
      letter-spacing:.25em; text-transform:uppercase;
      color:rgba(43,229,197,.26); white-space:nowrap;
      opacity:0; animation: vv-fi .7s ease 2.1s forwards;
    }

    /* bara de progres jos */
    .vv-bar {
      position:absolute; bottom:0; left:0; right:0; height:2px;
      background: linear-gradient(to right,
        transparent 0%,
        rgba(43,229,197,.45) 22%,
        rgba(43,229,197,.7)  50%,
        rgba(245,166,35,.55) 78%,
        transparent 100%);
      transform:scaleX(0); transform-origin:center;
      animation: vv-bar 2.5s cubic-bezier(.4,0,.2,1) .3s forwards;
    }
    @keyframes vv-bar { from{transform:scaleX(0)} to{transform:scaleX(1)} }

    @keyframes vv-fi { from{opacity:0} to{opacity:1} }
  `;

  var sEl = document.createElement('style');
  sEl.textContent = CSS;

  var svgDefs = '<svg style="position:absolute;width:0;height:0"><defs>' +
    '<linearGradient id="vv-grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%"   stop-color="#2BE5C5"/>' +
    '<stop offset="50%"  stop-color="#7FFFEC"/>' +
    '<stop offset="100%" stop-color="#F5A623"/>' +
    '</linearGradient></defs></svg>';

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    svgDefs +
    '<div class="vv-glow"></div>' +
    '<div class="vv-arm-l"></div>' +
    '<div class="vv-arm-r"></div>' +
    '<div class="vv-tip"></div>' +
    '<div class="vv-hl"></div>' +
    '<div class="vv-hr"></div>' +
    '<div class="vv-stage">' +
      '<svg class="vv-ring-svg" viewBox="0 0 100 100">' +
        '<circle class="vv-rt"       cx="50" cy="50" r="47"/>' +
        '<circle class="vv-rt-pulse" cx="50" cy="50" r="47"/>' +
        '<circle class="vv-rf"       cx="50" cy="50" r="47"/>' +
      '</svg>' +
      '<div class="vv-inner-ring"></div>' +
      '<div class="vv-dot"></div>' +
      '<div class="vv-dot2"></div>' +
      '<div class="vv-logo">' +
        '<img src="./assets/veyra-logo4.png" alt="VEYRA"' +
          ' onerror="this.onerror=null;this.src=\'./assets/veyra-icon.svg\'">' +
      '</div>' +
    '</div>' +
    '<div class="vv-info">' +
      '<div class="vv-pct" id="vv-pct">0%</div>' +
      '<div class="vv-tag">Sports Analytics · AI Predictions</div>' +
    '</div>' +
    '<div class="vv-bar"></div>';

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    /* counter progres */
    setTimeout(function () {
      var el = document.getElementById('vv-pct');
      var n = 0;
      var iv = setInterval(function () {
        n = Math.min(100, n + 2 + Math.floor(Math.random() * 6));
        if (el) el.textContent = n + '%';
        if (n >= 100) clearInterval(iv);
      }, 38);
    }, 300);

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
