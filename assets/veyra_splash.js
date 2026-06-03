/**
 * VEYRA — Splash Screen v2
 * Logo transparent via mix-blend-mode:screen + efecte WOW.
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
      transition: opacity 0.75s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #vs-overlay.vs-hide { opacity: 0; pointer-events: none; }

    /* ── canvas particles ── */
    #vs-canvas {
      position: absolute;
      inset: 0;
      width: 100%; height: 100%;
    }

    /* ── pulsing radial glow ── */
    .vs-blob {
      position: absolute;
      top: 50%; left: 50%;
      width: 560px; height: 560px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle,
        rgba(43,229,197,.14) 0%,
        rgba(43,229,197,.06) 35%,
        transparent 70%);
      animation: vs-blob-pulse 2.2s ease-in-out infinite alternate;
    }
    @keyframes vs-blob-pulse {
      from { transform: translate(-50%,-50%) scale(.75); opacity: .5; }
      to   { transform: translate(-50%,-50%) scale(1.3);  opacity: 1; }
    }

    /* ── horizontal scanline ── */
    .vs-scan {
      position: absolute;
      left: 0; right: 0; height: 140px;
      background: linear-gradient(to bottom,
        transparent 0%,
        rgba(43,229,197,.025) 40%,
        rgba(43,229,197,.07)  50%,
        rgba(43,229,197,.025) 60%,
        transparent 100%);
      animation: vs-scan-move 1.9s linear infinite;
      pointer-events: none;
    }
    @keyframes vs-scan-move {
      from { top: -140px; }
      to   { top: 100vh; }
    }

    /* ── background H-grid ── */
    .vs-grid {
      position: absolute;
      inset: 0;
      background-image:
        repeating-linear-gradient(0deg, rgba(43,229,197,.028) 0px, transparent 1px, transparent 44px),
        repeating-linear-gradient(90deg, rgba(43,229,197,.018) 0px, transparent 1px, transparent 80px);
      opacity: 0;
      animation: vs-xfade .9s ease .25s forwards;
    }

    /* ── radar rings ── */
    .vs-rings { position: absolute; top: 50%; left: 50%; pointer-events: none; }
    .vs-ring {
      position: absolute;
      border-radius: 50%;
      transform: translate(-50%,-50%) scale(0);
      animation: vs-ring-out 2.8s ease-out infinite;
    }
    .vs-ring:nth-child(1) { width:180px;height:180px; border:1.5px solid rgba(43,229,197,.55); animation-delay:0.0s; }
    .vs-ring:nth-child(2) { width:320px;height:320px; border:1px   solid rgba(43,229,197,.35); animation-delay:0.6s; }
    .vs-ring:nth-child(3) { width:460px;height:460px; border:1px   solid rgba(43,229,197,.2);  animation-delay:1.2s; }
    .vs-ring:nth-child(4) { width:600px;height:600px; border:1px   solid rgba(43,229,197,.1);  animation-delay:1.8s; }
    @keyframes vs-ring-out {
      0%   { opacity:.9; transform:translate(-50%,-50%) scale(.04); }
      100% { opacity:0;  transform:translate(-50%,-50%) scale(1); }
    }

    /* ── subtle crosshair ── */
    .vs-xhair {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      width: 100vw; height: 100vh;
      pointer-events: none;
      opacity: 0;
      animation: vs-xfade .6s ease .15s forwards;
    }
    .vs-xhair::before, .vs-xhair::after {
      content:'';
      position: absolute;
      background: rgba(43,229,197,.07);
    }
    .vs-xhair::before { width:1px; height:100%; left:50%; }
    .vs-xhair::after  { height:1px; width:100%; top:50%; }

    /* ── corner brackets ── */
    .vs-corner {
      position: absolute;
      width: 30px; height: 30px;
      opacity: 0;
    }
    .vs-corner.tl { top:calc(50% - 200px); left:calc(50% - 170px);
      border-top:2px solid rgba(43,229,197,.8); border-left:2px solid rgba(43,229,197,.8);
      animation: vs-c-tl .45s cubic-bezier(.16,1,.3,1) .28s forwards; }
    .vs-corner.tr { top:calc(50% - 200px); right:calc(50% - 170px);
      border-top:2px solid rgba(43,229,197,.8); border-right:2px solid rgba(43,229,197,.8);
      animation: vs-c-tr .45s cubic-bezier(.16,1,.3,1) .28s forwards; }
    .vs-corner.bl { bottom:calc(50% - 200px); left:calc(50% - 170px);
      border-bottom:2px solid rgba(43,229,197,.8); border-left:2px solid rgba(43,229,197,.8);
      animation: vs-c-bl .45s cubic-bezier(.16,1,.3,1) .28s forwards; }
    .vs-corner.br { bottom:calc(50% - 200px); right:calc(50% - 170px);
      border-bottom:2px solid rgba(43,229,197,.8); border-right:2px solid rgba(43,229,197,.8);
      animation: vs-c-br .45s cubic-bezier(.16,1,.3,1) .28s forwards; }
    @keyframes vs-c-tl { from{opacity:0;transform:translate( 18px, 18px)} to{opacity:1;transform:translate(0,0)} }
    @keyframes vs-c-tr { from{opacity:0;transform:translate(-18px, 18px)} to{opacity:1;transform:translate(0,0)} }
    @keyframes vs-c-bl { from{opacity:0;transform:translate( 18px,-18px)} to{opacity:1;transform:translate(0,0)} }
    @keyframes vs-c-br { from{opacity:0;transform:translate(-18px,-18px)} to{opacity:1;transform:translate(0,0)} }

    /* ── logo: mix-blend-mode:screen removes dark bg ── */
    .vs-logo-wrap {
      position: relative;
      z-index: 2;
      opacity: 0;
      animation: vs-logo-in 1.05s cubic-bezier(.16,1,.3,1) .18s forwards;
    }
    @keyframes vs-logo-in {
      0%   { opacity:0; transform:scale(.62) translateY(24px); filter:blur(14px); }
      55%  { opacity:1; filter:blur(.5px); }
      100% { opacity:1; transform:scale(1) translateY(0); filter:blur(0); }
    }
    .vs-logo-wrap img {
      width: min(290px, 70vw);
      display: block;
      mix-blend-mode: screen;
      animation:
        vs-glow-pulse 2s ease-in-out 1.3s infinite alternate,
        vs-glitch     6s linear       1.6s infinite;
    }
    @keyframes vs-glow-pulse {
      from { filter:drop-shadow(0 0 22px rgba(43,229,197,.55)) drop-shadow(0 0 55px rgba(43,229,197,.22)); }
      to   { filter:drop-shadow(0 0 42px rgba(43,229,197,.85)) drop-shadow(0 0 95px rgba(43,229,197,.38)) drop-shadow(0 0 150px rgba(43,229,197,.15)); }
    }
    @keyframes vs-glitch {
      0%,91%,100% { clip-path:none; transform:none; filter:drop-shadow(0 0 30px rgba(43,229,197,.65)); }
      92% { clip-path:inset(18% 0 52% 0); transform:translateX(-5px);
            filter:drop-shadow(-5px 0 rgba(255,30,90,.8)) drop-shadow(0 0 20px rgba(43,229,197,.4)); }
      93% { clip-path:inset(50% 0 18% 0); transform:translateX( 5px);
            filter:drop-shadow( 5px 0 rgba(0,255,200,.8)) drop-shadow(0 0 20px rgba(43,229,197,.4)); }
      94% { clip-path:none; transform:none; }
      95% { clip-path:inset(28% 0 42% 0); transform:translateX(-3px); }
      96% { clip-path:none; transform:none; }
    }

    /* ── tagline ── */
    .vs-tagline {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px; font-weight: 700;
      letter-spacing: .24em; text-transform: uppercase;
      color: rgba(43,229,197,.6);
      margin-top: 18px;
      position: relative; z-index: 2;
      opacity: 0;
      animation: vs-fade-up .55s ease 1.1s forwards;
    }

    /* ── progress bar ── */
    .vs-bar-wrap {
      position: relative; z-index: 2;
      width: min(210px, 56vw); height: 2px;
      background: rgba(255,255,255,.05);
      border-radius: 2px;
      margin-top: 30px; overflow: hidden;
      opacity: 0;
      animation: vs-fade-up .4s ease 1.2s forwards;
    }
    .vs-bar-fill {
      height: 100%; width: 0%;
      border-radius: 2px;
      background: linear-gradient(90deg, #2BE5C5, #7FFFD4, #2BE5C5);
      background-size: 300% 100%;
      animation:
        vs-bar-grow    2.1s cubic-bezier(.4,0,.2,1) 1.2s forwards,
        vs-bar-shimmer 1s   linear                  1.2s infinite;
    }
    @keyframes vs-bar-grow    { from{width:0%} to{width:100%} }
    @keyframes vs-bar-shimmer { from{background-position:300% 0} to{background-position:-300% 0} }

    /* ── dots ── */
    .vs-dots {
      display:flex; gap:7px;
      margin-top:13px;
      position:relative; z-index:2;
      opacity:0;
      animation: vs-fade-up .4s ease 1.4s forwards;
    }
    .vs-dots span {
      width:4px; height:4px;
      border-radius:50%;
      background:rgba(43,229,197,.7);
      animation: vs-dot 1.05s ease-in-out infinite;
    }
    .vs-dots span:nth-child(2){animation-delay:.16s}
    .vs-dots span:nth-child(3){animation-delay:.32s}
    @keyframes vs-dot {
      0%,80%,100%{opacity:.2;transform:scale(.75)}
      40%        {opacity:1; transform:scale(1.4)}
    }

    @keyframes vs-fade-up  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes vs-xfade    { from{opacity:0} to{opacity:1} }
  `;

  var styleEl = document.createElement('style');
  styleEl.id = 'vs-style';
  styleEl.textContent = CSS;

  var overlay = document.createElement('div');
  overlay.id = 'vs-overlay';
  overlay.innerHTML =
    '<canvas id="vs-canvas"></canvas>' +
    '<div class="vs-blob"></div>' +
    '<div class="vs-grid"></div>' +
    '<div class="vs-scan"></div>' +
    '<div class="vs-rings">' +
      '<div class="vs-ring"></div><div class="vs-ring"></div>' +
      '<div class="vs-ring"></div><div class="vs-ring"></div>' +
    '</div>' +
    '<div class="vs-xhair"></div>' +
    '<div class="vs-corner tl"></div><div class="vs-corner tr"></div>' +
    '<div class="vs-corner bl"></div><div class="vs-corner br"></div>' +
    '<div class="vs-logo-wrap">' +
      '<img src="./veyra-logo.png" alt="VEYRA" ' +
           'onerror="this.onerror=null;this.src=\'./icon-512.png\'">' +
    '</div>' +
    '<div class="vs-tagline">Sports Analytics &nbsp;·&nbsp; AI Predictions</div>' +
    '<div class="vs-bar-wrap"><div class="vs-bar-fill"></div></div>' +
    '<div class="vs-dots"><span></span><span></span><span></span></div>';

  /* ── canvas neural particle system ── */
  function startParticles(canvas) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width  = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var cx = W / 2, cy = H / 2;
    var particles = [];
    var N = 90;

    for (var i = 0; i < N; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 10 + Math.random() * 60;
      var sp = .25 + Math.random() * 1.1;
      particles.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: Math.cos(a) * sp * (.5 + Math.random()),
        vy: Math.sin(a) * sp * (.5 + Math.random()),
        sz: .6 + Math.random() * 1.8,
        al: .3 + Math.random() * .7,
        fade: .002 + Math.random() * .004,
        hue: 168 + Math.random() * 24
      });
    }

    var raf;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < N; i++) {
        var p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.al -= p.fade;
        if (p.al <= 0) {
          var a = Math.random() * Math.PI * 2;
          var r = 8 + Math.random() * 40;
          var sp = .25 + Math.random() * 1.1;
          p.x = cx + Math.cos(a) * r;
          p.y = cy + Math.sin(a) * r;
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp;
          p.al = .4 + Math.random() * .6;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, 6.283);
        ctx.fillStyle = 'hsla(' + p.hue + ',82%,72%,' + p.al + ')';
        ctx.fill();

        for (var j = i + 1; j < N; j++) {
          var q = particles[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx*dx + dy*dy;
          if (d2 < 5800) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = 'rgba(43,229,197,' + ((1 - d2/5800) * .13) + ')';
            ctx.lineWidth = .6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return function () { cancelAnimationFrame(raf); };
  }

  function mount() {
    document.head.appendChild(styleEl);
    document.body.insertBefore(overlay, document.body.firstChild);

    var cancel = null;
    setTimeout(function () {
      var c = document.getElementById('vs-canvas');
      if (c) cancel = startParticles(c);
    }, 40);

    setTimeout(function () {
      overlay.classList.add('vs-hide');
      setTimeout(function () {
        if (cancel) cancel();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      }, 800);
    }, 3400);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
