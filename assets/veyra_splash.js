/**
 * VEYRA Splash — "APEX" v8
 * Zero canvas, pure CSS. Background matches logo exactly → seamless blend.
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    #vs{
      position:fixed;inset:0;z-index:999999;
      background:#00040f;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      overflow:hidden;
      transition:opacity 1s cubic-bezier(.4,0,.2,1);
    }
    #vs.out{opacity:0;pointer-events:none}

    /* dark vignette — focuses eye on center */
    #vs::after{
      content:'';position:absolute;inset:0;pointer-events:none;z-index:20;
      background:radial-gradient(ellipse at center,
        transparent 28%, rgba(0,2,10,.55) 100%);
    }

    /* subtle cyan ambient light */
    .va-glow{
      position:absolute;top:50%;left:50%;pointer-events:none;
      width:80vmax;height:80vmax;
      transform:translate(-50%,-50%);border-radius:50%;
      background:radial-gradient(circle,
        rgba(43,229,197,.065) 0%,
        rgba(43,229,197,.02)  35%,
        transparent 62%);
      animation:va-breathe 4s ease-in-out infinite alternate;
    }
    @keyframes va-breathe{
      from{opacity:.6;transform:translate(-50%,-50%) scale(.92)}
      to  {opacity:1; transform:translate(-50%,-50%) scale(1.08)}
    }

    /* ── stage: fixed square so ring + logo align perfectly ── */
    .va-stage{
      position:relative;
      width:min(450px,95vw);height:min(450px,95vw);
      display:flex;align-items:center;justify-content:center;
      z-index:5;
    }

    /* ring SVG fills stage */
    .va-ring-svg{
      position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:1;
    }
    .va-rt{fill:none;stroke:rgba(43,229,197,.07);stroke-width:.7}
    .va-rf{
      fill:none;stroke:url(#va-grad);stroke-width:1.3;
      stroke-linecap:round;
      stroke-dasharray:295;stroke-dashoffset:295;
      transform-origin:50% 50%;transform:rotate(-90deg);
      animation:va-charge 2.6s cubic-bezier(.4,0,.2,1) .25s forwards;
    }
    @keyframes va-charge{
      from{stroke-dashoffset:295}
      to  {stroke-dashoffset:0}
    }

    /* ring glow pulse after charge */
    .va-rt-glow{
      fill:none;
      stroke:rgba(43,229,197,.0);stroke-width:3;
      animation:va-ring-glow 2.5s ease-in-out 2.9s infinite alternate;
    }
    @keyframes va-ring-glow{
      from{stroke:rgba(43,229,197,.0)}
      to  {stroke:rgba(43,229,197,.07)}
    }

    /* orbiting dot */
    .va-dot{
      position:absolute;inset:0;border-radius:50%;
      animation:va-orbit 7s linear .25s infinite;
      will-change:transform;pointer-events:none;z-index:4;
    }
    .va-dot::after{
      content:'';position:absolute;
      top:2px;left:50%;transform:translateX(-50%);
      width:7px;height:7px;border-radius:50%;
      background:#2BE5C5;
      box-shadow:0 0 9px #2BE5C5,0 0 24px rgba(43,229,197,.75),0 0 50px rgba(43,229,197,.3);
    }
    @keyframes va-orbit{
      from{transform:rotate(-90deg)}
      to  {transform:rotate(270deg)}
    }

    /* gold counter-dot on inner orbit */
    .va-dot2{
      position:absolute;
      width:min(280px,70vw);height:min(280px,70vw);
      border-radius:50%;
      animation:va-orbit2 11s linear .25s infinite;
      will-change:transform;pointer-events:none;z-index:4;
    }
    .va-dot2::after{
      content:'';position:absolute;
      top:0;left:50%;transform:translate(-50%,-50%);
      width:5px;height:5px;border-radius:50%;
      background:#F5A623;
      box-shadow:0 0 7px #F5A623,0 0 18px rgba(245,166,35,.7);
    }
    @keyframes va-orbit2{
      from{transform:rotate(90deg)}
      to  {transform:rotate(-270deg)}
    }

    /* logo */
    .va-logo{
      position:relative;z-index:3;
      opacity:0;
      animation:va-logo-in 1s cubic-bezier(.16,1,.3,1) 0s forwards;
    }
    .va-logo img{
      width:min(310px,80vw);display:block;
      animation:va-glow-l 3.2s ease-in-out 1.6s infinite alternate;
      will-change:filter;
    }
    @keyframes va-logo-in{
      0%  {opacity:0;transform:scale(.84) translateY(12px)}
      100%{opacity:1;transform:scale(1)   translateY(0)}
    }
    @keyframes va-glow-l{
      from{filter:
        drop-shadow(0 0 14px rgba(43,229,197,.38))
        drop-shadow(0 0 40px rgba(43,229,197,.16))}
      to  {filter:
        drop-shadow(0 0 32px rgba(43,229,197,.82))
        drop-shadow(0 0 75px rgba(43,229,197,.32))
        drop-shadow(0 3px 10px rgba(245,166,35,.22))}
    }

    /* ── horizontal accent lines ── */
    .va-hl,.va-hr{
      position:absolute;top:50%;height:1px;
      transform:translateY(-50%);z-index:2;
    }
    .va-hl{
      right:calc(50% + min(218px,46vw));left:0;
      background:linear-gradient(to left,rgba(43,229,197,.26),transparent 80%);
      opacity:0;animation:va-fi .8s ease 1.8s forwards;
    }
    .va-hr{
      left:calc(50% + min(218px,46vw));right:0;
      background:linear-gradient(to right,rgba(43,229,197,.26),transparent 80%);
      opacity:0;animation:va-fi .8s ease 1.8s forwards;
    }

    /* ── info block below stage ── */
    .va-info{
      display:flex;flex-direction:column;align-items:center;
      gap:8px;margin-top:8px;z-index:5;position:relative;
    }
    .va-pct{
      font-family:'Courier New',monospace;font-size:14px;font-weight:700;
      color:#2BE5C5;letter-spacing:.06em;
      opacity:0;animation:va-fi .5s ease .28s forwards;
    }
    .va-tag{
      font-family:'Courier New',monospace;font-size:7.5px;font-weight:700;
      letter-spacing:.26em;text-transform:uppercase;
      color:rgba(43,229,197,.26);white-space:nowrap;
      opacity:0;animation:va-fi .7s ease 2s forwards;
    }

    /* bottom progress bar */
    .va-bar{
      position:absolute;bottom:0;left:0;right:0;height:2px;
      background:linear-gradient(to right,
        transparent 0%,
        rgba(43,229,197,.5) 25%,
        rgba(43,229,197,.7) 50%,
        rgba(245,166,35,.55) 75%,
        transparent 100%);
      transform:scaleX(0);transform-origin:center;
      animation:va-bar 2.6s cubic-bezier(.4,0,.2,1) .25s forwards;
    }
    @keyframes va-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}

    @keyframes va-fi{from{opacity:0}to{opacity:1}}
  `;

  var sEl = document.createElement('style');
  sEl.textContent = CSS;

  var svgDefs = '<svg style="position:absolute;width:0;height:0"><defs>' +
    '<linearGradient id="va-grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%"   stop-color="#2BE5C5"/>' +
    '<stop offset="55%"  stop-color="#7FFFEC"/>' +
    '<stop offset="100%" stop-color="#F5A623"/>' +
    '</linearGradient></defs></svg>';

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    svgDefs +
    '<div class="va-glow"></div>' +
    '<div class="va-hl"></div>' +
    '<div class="va-hr"></div>' +
    '<div class="va-stage">' +
      '<svg class="va-ring-svg" viewBox="0 0 100 100">' +
        '<circle class="va-rt"      cx="50" cy="50" r="47"/>' +
        '<circle class="va-rt-glow" cx="50" cy="50" r="47"/>' +
        '<circle class="va-rf"      cx="50" cy="50" r="47"/>' +
      '</svg>' +
      '<div class="va-dot"></div>' +
      '<div class="va-dot2"></div>' +
      '<div class="va-logo"><img src="./assets/veyra-logo4.png" alt="VEYRA" onerror="this.onerror=null;this.src=\'./assets/veyra-icon.svg\'"></div>' +
    '</div>' +
    '<div class="va-info">' +
      '<div class="va-pct" id="va-pct">0%</div>' +
      '<div class="va-tag">Sports Analytics · AI Predictions</div>' +
    '</div>' +
    '<div class="va-bar"></div>';

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    /* percentage counter */
    setTimeout(function () {
      var el = document.getElementById('va-pct');
      var n = 0;
      var iv = setInterval(function () {
        n = Math.min(100, n + 2 + Math.floor(Math.random() * 6));
        if (el) el.textContent = n + '%';
        if (n >= 100) clearInterval(iv);
      }, 40);
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
