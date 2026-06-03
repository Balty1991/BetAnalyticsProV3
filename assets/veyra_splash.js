/**
 * VEYRA — Splash Screen v3
 * Logo transparent PNG + efecte futuriste profesionale.
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    #vs-overlay {
      position: fixed; inset: 0; z-index: 999999;
      background: #070B14;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      overflow: hidden;
      transition: opacity .8s cubic-bezier(.4,0,.2,1);
    }
    #vs-overlay.vs-hide { opacity: 0; pointer-events: none; }

    /* canvas */
    #vs-canvas { position:absolute; inset:0; width:100%; height:100%; }

    /* vignette */
    .vs-vignette {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse at center,
        transparent 38%, rgba(4,6,12,.6) 70%, rgba(4,6,12,.92) 100%);
    }

    /* radial glow */
    .vs-blob {
      position: absolute; top:50%; left:50%;
      width: 600px; height: 600px; border-radius: 50%;
      transform: translate(-50%,-50%);
      background: radial-gradient(circle,
        rgba(43,229,197,.10) 0%, rgba(43,229,197,.04) 40%, transparent 70%);
      animation: vs-blob-pulse 2.5s ease-in-out infinite alternate;
    }
    @keyframes vs-blob-pulse {
      from { transform:translate(-50%,-50%) scale(.7);  opacity:.5; }
      to   { transform:translate(-50%,-50%) scale(1.25); opacity:1; }
    }

    /* grid */
    .vs-grid {
      position: absolute; inset: 0; opacity: 0;
      background-image:
        repeating-linear-gradient(0deg,  rgba(43,229,197,.022) 0px, transparent 1px, transparent 48px),
        repeating-linear-gradient(90deg, rgba(43,229,197,.015) 0px, transparent 1px, transparent 80px);
      animation: vs-xfade .8s ease .2s forwards;
    }

    /* scan lines — two at different speeds */
    .vs-scan1, .vs-scan2 {
      position: absolute; left:0; right:0; pointer-events: none;
    }
    .vs-scan1 {
      height: 120px;
      background: linear-gradient(to bottom,
        transparent 0%, rgba(43,229,197,.03) 40%, rgba(43,229,197,.065) 50%,
        rgba(43,229,197,.03) 60%, transparent 100%);
      animation: vs-scan 2.0s linear infinite;
    }
    .vs-scan2 {
      height: 60px;
      background: linear-gradient(to bottom,
        transparent 0%, rgba(43,229,197,.015) 50%, transparent 100%);
      animation: vs-scan 3.3s linear .7s infinite;
    }
    @keyframes vs-scan { from{top:-130px} to{top:100vh} }

    /* radar rings */
    .vs-rings { position:absolute; top:50%; left:50%; pointer-events:none; }
    .vs-ring {
      position: absolute; border-radius: 50%;
      transform: translate(-50%,-50%) scale(0);
      animation: vs-ring-out 3s ease-out infinite;
    }
    .vs-ring:nth-child(1){width:160px;height:160px;border:1.5px solid rgba(43,229,197,.6); animation-delay:.0s;}
    .vs-ring:nth-child(2){width:290px;height:290px;border:1px   solid rgba(43,229,197,.38);animation-delay:.65s;}
    .vs-ring:nth-child(3){width:430px;height:430px;border:1px   solid rgba(43,229,197,.22);animation-delay:1.3s;}
    .vs-ring:nth-child(4){width:570px;height:570px;border:.5px  solid rgba(43,229,197,.12);animation-delay:1.95s;}
    .vs-ring:nth-child(5){width:710px;height:710px;border:.5px  solid rgba(43,229,197,.06);animation-delay:2.6s;}
    @keyframes vs-ring-out {
      0%  {opacity:.9; transform:translate(-50%,-50%) scale(.03);}
      100%{opacity:0;  transform:translate(-50%,-50%) scale(1);}
    }

    /* HUD crosshair */
    .vs-xhair {
      position:absolute; top:50%; left:50%;
      width:100vw; height:100vh;
      transform:translate(-50%,-50%);
      pointer-events:none; opacity:0;
      animation: vs-xfade .5s ease .1s forwards;
    }
    .vs-xhair::before,.vs-xhair::after{
      content:''; position:absolute; background:rgba(43,229,197,.055);
    }
    .vs-xhair::before{width:1px;height:100%;left:50%;}
    .vs-xhair::after {height:1px;width:100%;top:50%;}

    /* corner brackets — slide in from outside */
    .vs-corner { position:absolute; width:34px; height:34px; opacity:0; }
    .vs-corner.tl{top:calc(50% - 210px);left:calc(50% - 185px);
      border-top:2px solid #2BE5C5;border-left:2px solid #2BE5C5;
      animation:vs-c-tl .5s cubic-bezier(.16,1,.3,1) .22s forwards;}
    .vs-corner.tr{top:calc(50% - 210px);right:calc(50% - 185px);
      border-top:2px solid #2BE5C5;border-right:2px solid #2BE5C5;
      animation:vs-c-tr .5s cubic-bezier(.16,1,.3,1) .22s forwards;}
    .vs-corner.bl{bottom:calc(50% - 210px);left:calc(50% - 185px);
      border-bottom:2px solid #2BE5C5;border-left:2px solid #2BE5C5;
      animation:vs-c-bl .5s cubic-bezier(.16,1,.3,1) .22s forwards;}
    .vs-corner.br{bottom:calc(50% - 210px);right:calc(50% - 185px);
      border-bottom:2px solid #2BE5C5;border-right:2px solid #2BE5C5;
      animation:vs-c-br .5s cubic-bezier(.16,1,.3,1) .22s forwards;}
    @keyframes vs-c-tl{from{opacity:0;transform:translate( 22px, 22px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-tr{from{opacity:0;transform:translate(-22px, 22px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-bl{from{opacity:0;transform:translate( 22px,-22px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-br{from{opacity:0;transform:translate(-22px,-22px)}to{opacity:1;transform:translate(0,0)}}

    /* HUD tick marks on corners */
    .vs-corner::before, .vs-corner::after {
      content:''; position:absolute; background:#2BE5C5;
    }
    .vs-corner.tl::before{width:1px;height:8px;left:-1px;top:10px;}
    .vs-corner.tl::after {height:1px;width:8px;top:-1px;left:10px;}
    .vs-corner.tr::before{width:1px;height:8px;right:-1px;top:10px;}
    .vs-corner.tr::after {height:1px;width:8px;top:-1px;right:10px;}
    .vs-corner.bl::before{width:1px;height:8px;left:-1px;bottom:10px;}
    .vs-corner.bl::after {height:1px;width:8px;bottom:-1px;left:10px;}
    .vs-corner.br::before{width:1px;height:8px;right:-1px;bottom:10px;}
    .vs-corner.br::after {height:1px;width:8px;bottom:-1px;right:10px;}

    /* logo entrance */
    .vs-logo-wrap {
      position:relative; z-index:2;
      opacity:0;
      animation: vs-logo-in 1.1s cubic-bezier(.16,1,.3,1) .15s forwards;
    }
    @keyframes vs-logo-in {
      0%  {opacity:0;transform:scale(.6) translateY(28px);filter:blur(16px);}
      50% {opacity:1;filter:blur(1px);}
      100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0);}
    }
    .vs-logo-wrap img {
      width: min(300px, 72vw);
      display: block;
      /* No mix-blend-mode — logo is transparent PNG */
      filter:
        drop-shadow(0 0 20px rgba(43,229,197,.55))
        drop-shadow(0 0 55px rgba(43,229,197,.25))
        drop-shadow(0 0 100px rgba(43,229,197,.12));
      animation:
        vs-glow 2.2s ease-in-out 1.3s infinite alternate,
        vs-glitch 7s linear 1.8s infinite;
    }
    @keyframes vs-glow {
      from{filter:drop-shadow(0 0 18px rgba(43,229,197,.5)) drop-shadow(0 0 50px rgba(43,229,197,.2));}
      to  {filter:drop-shadow(0 0 38px rgba(43,229,197,.85)) drop-shadow(0 0 90px rgba(43,229,197,.38)) drop-shadow(0 0 140px rgba(43,229,197,.15));}
    }
    @keyframes vs-glitch {
      0%,90%,100%{clip-path:none;transform:none;}
      91%{clip-path:inset(20% 0 50% 0);transform:translateX(-6px);
          filter:drop-shadow(-6px 0 rgba(255,30,80,.85)) drop-shadow(0 0 20px rgba(43,229,197,.3));}
      92%{clip-path:inset(52% 0 18% 0);transform:translateX( 6px);
          filter:drop-shadow( 6px 0 rgba(0,255,190,.85)) drop-shadow(0 0 20px rgba(43,229,197,.3));}
      93%{clip-path:none;transform:none;}
      94%{clip-path:inset(33% 0 38% 0);transform:translateX(-3px);}
      95%{clip-path:none;transform:none;}
    }

    /* status line — typewriter */
    .vs-status {
      font-family: 'Courier New', monospace;
      font-size: 10px; font-weight: 700;
      letter-spacing: .15em; text-transform: uppercase;
      color: rgba(43,229,197,.5);
      margin-top: 22px;
      position: relative; z-index: 2;
      opacity: 0;
      animation: vs-fade-up .4s ease 1.05s forwards;
      overflow: hidden; white-space: nowrap;
      border-right: 1px solid rgba(43,229,197,.6);
      width: 0;
    }
    .vs-status.vs-typed {
      width: auto;
      animation:
        vs-fade-up   .4s ease 1.05s forwards,
        vs-typewrite 1.4s steps(22,end) 1.1s forwards,
        vs-blink     .75s step-end 1.1s 3;
    }
    @keyframes vs-typewrite { from{width:0} to{width:13.5em} }
    @keyframes vs-blink { 50%{border-color:transparent} }

    /* progress bar */
    .vs-bar-wrap {
      position:relative; z-index:2;
      width:min(220px,58vw); height:2px;
      background:rgba(255,255,255,.05); border-radius:2px;
      margin-top:28px; overflow:hidden; opacity:0;
      animation: vs-fade-up .4s ease 1.15s forwards;
    }
    .vs-bar-fill {
      height:100%; width:0%; border-radius:2px;
      background: linear-gradient(90deg,
        rgba(43,229,197,.4) 0%, #2BE5C5 45%, #7FFFD4 55%, rgba(43,229,197,.4) 100%);
      background-size:300% 100%;
      animation:
        vs-bar-grow    2.15s cubic-bezier(.4,0,.2,1) 1.15s forwards,
        vs-bar-shimmer 1.1s  linear                  1.15s infinite;
    }
    @keyframes vs-bar-grow   {from{width:0%}to{width:100%}}
    @keyframes vs-bar-shimmer{from{background-position:300% 0}to{background-position:-300% 0}}

    /* loading dots */
    .vs-dots {
      display:flex; gap:7px; margin-top:14px;
      position:relative; z-index:2; opacity:0;
      animation: vs-fade-up .4s ease 1.35s forwards;
    }
    .vs-dots span {
      width:4px; height:4px; border-radius:50%;
      background:rgba(43,229,197,.65);
      animation:vs-dot 1.1s ease-in-out infinite;
    }
    .vs-dots span:nth-child(2){animation-delay:.18s;}
    .vs-dots span:nth-child(3){animation-delay:.36s;}
    @keyframes vs-dot{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1.4)}}

    @keyframes vs-fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes vs-xfade  {from{opacity:0}to{opacity:1}}
  `;

  var styleEl = document.createElement('style');
  styleEl.id = 'vs-style';
  styleEl.textContent = CSS;

  var overlay = document.createElement('div');
  overlay.id = 'vs-overlay';
  overlay.innerHTML =
    '<canvas id="vs-canvas"></canvas>' +
    '<div class="vs-vignette"></div>' +
    '<div class="vs-blob"></div>' +
    '<div class="vs-grid"></div>' +
    '<div class="vs-scan1"></div>' +
    '<div class="vs-scan2"></div>' +
    '<div class="vs-rings">' +
      '<div class="vs-ring"></div><div class="vs-ring"></div>' +
      '<div class="vs-ring"></div><div class="vs-ring"></div>' +
      '<div class="vs-ring"></div>' +
    '</div>' +
    '<div class="vs-xhair"></div>' +
    '<div class="vs-corner tl"></div><div class="vs-corner tr"></div>' +
    '<div class="vs-corner bl"></div><div class="vs-corner br"></div>' +
    '<div class="vs-logo-wrap">' +
      '<img src="./veyra-logo.png" alt="VEYRA" ' +
           'onerror="this.onerror=null;this.src=\'./icon-512.png\'">' +
    '</div>' +
    '<div class="vs-status">Initializing AI Engine...</div>' +
    '<div class="vs-bar-wrap"><div class="vs-bar-fill"></div></div>' +
    '<div class="vs-dots"><span></span><span></span><span></span></div>';

  /* ── particle neural network ── */
  function startParticles(canvas) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width  = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var cx = W / 2, cy = H / 2;
    var N = 100;
    var pts = [];

    for (var i = 0; i < N; i++) {
      var a = Math.random() * 6.283;
      var d = 8 + Math.random() * 55;
      var sp = .2 + Math.random() * 1.0;
      pts.push({
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
        vx: Math.cos(a) * sp * (.4 + Math.random()),
        vy: Math.sin(a) * sp * (.4 + Math.random()),
        sz: .5 + Math.random() * 1.6,
        al: .25 + Math.random() * .75,
        fade: .0018 + Math.random() * .0035,
        h: 168 + Math.random() * 28
      });
    }

    var raf;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy; p.al -= p.fade;
        if (p.al <= 0) {
          var a = Math.random() * 6.283, d = 6 + Math.random() * 35;
          var sp = .2 + Math.random() * 1.0;
          p.x = cx + Math.cos(a)*d; p.y = cy + Math.sin(a)*d;
          p.vx = Math.cos(a)*sp; p.vy = Math.sin(a)*sp;
          p.al = .35 + Math.random() * .65;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, 6.283);
        ctx.fillStyle = 'hsla('+p.h+',82%,74%,'+p.al+')';
        ctx.fill();

        for (var j = i+1; j < N; j++) {
          var q = pts[j];
          var dx = p.x-q.x, dy = p.y-q.y, d2 = dx*dx+dy*dy;
          if (d2 < 6400) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = 'rgba(43,229,197,'+(( 1-d2/6400)*.12)+')';
            ctx.lineWidth = .5; ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return function(){ cancelAnimationFrame(raf); };
  }

  function mount() {
    document.head.appendChild(styleEl);
    document.body.insertBefore(overlay, document.body.firstChild);

    // typewriter on status
    setTimeout(function(){
      var s = overlay.querySelector('.vs-status');
      if (s) s.classList.add('vs-typed');
    }, 50);

    var cancel = null;
    setTimeout(function(){
      var c = document.getElementById('vs-canvas');
      if (c) cancel = startParticles(c);
    }, 40);

    setTimeout(function(){
      overlay.classList.add('vs-hide');
      setTimeout(function(){
        if (cancel) cancel();
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      }, 850);
    }, 3500);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
