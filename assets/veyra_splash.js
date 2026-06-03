/**
 * VEYRA — Splash "SIGNAL LOCK" by Claude
 * Design original: zero canvas, pur CSS (GPU-accelerated).
 * Performant pe orice mobil mid-range.
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    #vs{
      position:fixed;inset:0;z-index:999999;
      background:#050810;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      overflow:hidden;
      transition:opacity .75s cubic-bezier(.4,0,.15,1);
      contain:strict;
    }
    #vs.out{opacity:0;pointer-events:none}

    /* CRT scanline overlay — static, gratis */
    #vs::before{
      content:'';position:absolute;inset:0;pointer-events:none;z-index:10;
      background:repeating-linear-gradient(
        0deg, transparent 0px, transparent 3px,
        rgba(0,0,0,.06) 3px, rgba(0,0,0,.06) 4px
      );
    }

    /* puls central */
    .sl-glow{
      position:absolute;top:50%;left:50%;
      width:72vmax;height:72vmax;
      transform:translate(-50%,-50%);border-radius:50%;
      background:radial-gradient(circle,
        rgba(43,229,197,.11) 0%,rgba(43,229,197,.04) 32%,transparent 65%);
      animation:sl-glow-p 3.2s ease-in-out infinite alternate;
      will-change:transform,opacity;
    }
    @keyframes sl-glow-p{
      from{transform:translate(-50%,-50%) scale(.8);opacity:.5}
      to  {transform:translate(-50%,-50%) scale(1.15);opacity:1}
    }

    /* ── linii de targeting (N S E W) ── */
    .sl-line{position:absolute;background:linear-gradient(var(--d),rgba(43,229,197,0),rgba(43,229,197,.6))}
    .sl-line::after{
      content:'';position:absolute;border-radius:50%;
      width:5px;height:5px;background:#2BE5C5;
      box-shadow:0 0 8px #2BE5C5,0 0 18px rgba(43,229,197,.6);
    }
    /* Nord */
    .sl-n{
      --d:to bottom;
      left:50%;top:0;width:1px;height:0;transform:translateX(-50%);
      animation:sl-n-g .95s cubic-bezier(.16,1,.3,1) .18s forwards;
    }
    .sl-n::after{bottom:-2px;left:50%;transform:translateX(-50%)}
    @keyframes sl-n-g{from{height:0}to{height:calc(50% - 175px)}}

    /* Sud */
    .sl-s{
      --d:to top;
      left:50%;bottom:0;width:1px;height:0;transform:translateX(-50%);
      animation:sl-s-g .95s cubic-bezier(.16,1,.3,1) .18s forwards;
    }
    .sl-s::after{top:-2px;left:50%;transform:translateX(-50%)}
    @keyframes sl-s-g{from{height:0}to{height:calc(50% - 210px)}}

    /* Est */
    .sl-e{
      --d:to left;
      right:0;top:50%;height:1px;width:0;transform:translateY(-50%);
      animation:sl-e-g .95s cubic-bezier(.16,1,.3,1) .32s forwards;
    }
    .sl-e::after{left:-2px;top:50%;transform:translateY(-50%)}
    @keyframes sl-e-g{from{width:0}to{width:calc(50% - 175px)}}

    /* Vest */
    .sl-w{
      --d:to right;
      left:0;top:50%;height:1px;width:0;transform:translateY(-50%);
      animation:sl-w-g .95s cubic-bezier(.16,1,.3,1) .32s forwards;
    }
    .sl-w::after{right:-2px;top:50%;transform:translateY(-50%)}
    @keyframes sl-w-g{from{width:0}to{width:calc(50% - 175px)}}

    /* ── ring orbital simplu (1 element, GPU) ── */
    .sl-ring{
      position:absolute;top:50%;left:50%;
      width:min(400px,95vw);height:min(400px,95vw);
      border-radius:50%;
      border:1px solid rgba(43,229,197,.16);
      transform:translate(-50%,-50%);
      animation:sl-spin 20s linear .4s infinite;
      will-change:transform;
    }
    .sl-ring::after{
      content:'';position:absolute;
      top:-4px;left:50%;transform:translateX(-50%);
      width:8px;height:8px;border-radius:50%;
      background:#2BE5C5;
      box-shadow:0 0 10px #2BE5C5,0 0 28px rgba(43,229,197,.7);
    }
    @keyframes sl-spin{
      from{transform:translate(-50%,-50%) rotate(0)}
      to  {transform:translate(-50%,-50%) rotate(360deg)}
    }

    /* ring interior — contra-rotație, efect 3D iluzoriu */
    .sl-ring2{
      position:absolute;top:50%;left:50%;
      width:min(240px,58vw);height:min(240px,58vw);
      border-radius:50%;
      border:1px dashed rgba(43,229,197,.10);
      transform:translate(-50%,-50%);
      animation:sl-spin2 14s linear .4s infinite;
      will-change:transform;
    }
    @keyframes sl-spin2{
      from{transform:translate(-50%,-50%) rotate(0)}
      to  {transform:translate(-50%,-50%) rotate(-360deg)}
    }

    /* ── pulse rings (3, CSS only) ── */
    .sl-pr{
      position:absolute;top:50%;left:50%;
      border-radius:50%;transform:translate(-50%,-50%) scale(0);
      animation:sl-pr-out 3s ease-out infinite;
      will-change:transform,opacity;
    }
    .sl-pr:nth-child(1){width:170px;height:170px;border:1px solid rgba(43,229,197,.55);animation-delay:.0s}
    .sl-pr:nth-child(2){width:310px;height:310px;border:1px solid rgba(43,229,197,.32);animation-delay:.8s}
    .sl-pr:nth-child(3){width:470px;height:470px;border:.5px solid rgba(43,229,197,.16);animation-delay:1.6s}
    @keyframes sl-pr-out{
      0%  {opacity:.9;transform:translate(-50%,-50%) scale(.03)}
      100%{opacity:0; transform:translate(-50%,-50%) scale(1)}
    }

    /* ── flash de reveal la logo ── */
    .sl-flash{
      position:absolute;top:50%;left:50%;
      width:8px;height:8px;border-radius:50%;
      transform:translate(-50%,-50%);
      animation:sl-flash-go .65s ease-out .22s forwards;
      opacity:0;
    }
    @keyframes sl-flash-go{
      0%  {opacity:1;transform:translate(-50%,-50%) scale(1);
           box-shadow:0 0 0 4px rgba(43,229,197,.95),0 0 40px rgba(43,229,197,.7)}
      100%{opacity:0;transform:translate(-50%,-50%) scale(60);
           box-shadow:0 0 0 1px rgba(43,229,197,0),0 0 80px rgba(43,229,197,0)}
    }

    /* ── HUD corners ── */
    .sl-c{position:absolute;width:30px;height:30px;opacity:0}
    .sl-c.tl{top:clamp(70px,13%,155px);left:clamp(12px,4vw,50px);border-top:1.5px solid rgba(43,229,197,.75);border-left:1.5px solid rgba(43,229,197,.75);animation:sl-c-tl .4s ease .22s forwards}
    .sl-c.tr{top:clamp(70px,13%,155px);right:clamp(12px,4vw,50px);border-top:1.5px solid rgba(43,229,197,.75);border-right:1.5px solid rgba(43,229,197,.75);animation:sl-c-tr .4s ease .22s forwards}
    .sl-c.bl{bottom:clamp(70px,13%,155px);left:clamp(12px,4vw,50px);border-bottom:1.5px solid rgba(43,229,197,.75);border-left:1.5px solid rgba(43,229,197,.75);animation:sl-c-bl .4s ease .22s forwards}
    .sl-c.br{bottom:clamp(70px,13%,155px);right:clamp(12px,4vw,50px);border-bottom:1.5px solid rgba(43,229,197,.75);border-right:1.5px solid rgba(43,229,197,.75);animation:sl-c-br .4s ease .22s forwards}
    @keyframes sl-c-tl{from{opacity:0;transform:translate(14px,14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-tr{from{opacity:0;transform:translate(-14px,14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-bl{from{opacity:0;transform:translate(14px,-14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-br{from{opacity:0;transform:translate(-14px,-14px)}to{opacity:1;transform:none}}

    /* ── logo ── */
    .sl-logo{
      position:relative;z-index:5;opacity:0;
      animation:sl-logo-in 1s cubic-bezier(.16,1,.3,1) .18s forwards;
    }
    @keyframes sl-logo-in{
      0%  {opacity:0;transform:scale(.65);filter:blur(14px) brightness(2.5)}
      45% {opacity:1;filter:blur(.5px) brightness(1.6)}
      100%{opacity:1;transform:scale(1);filter:blur(0) brightness(1)}
    }
    .sl-logo img{
      width:min(320px,83vw);display:block;
      will-change:filter;
      animation:
        sl-glow-l 2.4s ease-in-out 1.2s infinite alternate,
        sl-glitch  9s  linear       2.2s infinite;
    }
    @keyframes sl-glow-l{
      from{filter:drop-shadow(0 0 20px rgba(43,229,197,.65)) drop-shadow(0 0 55px rgba(43,229,197,.28))}
      to  {filter:drop-shadow(0 0 44px rgba(43,229,197,1))   drop-shadow(0 0 105px rgba(43,229,197,.48)) brightness(1.1)}
    }
    @keyframes sl-glitch{
      0%,90%,100%{clip-path:none;transform:none}
      91%{clip-path:inset(18% 0 56% 0);transform:translateX(-7px);filter:drop-shadow(-7px 0 rgba(255,20,70,.95))}
      92%{clip-path:inset(56% 0 16% 0);transform:translateX( 7px);filter:drop-shadow( 7px 0 rgba(0,255,175,.95))}
      93%{clip-path:none;transform:none}
    }

    /* ── arc SVG progress ── */
    .sl-arc-wrap{
      position:relative;z-index:5;
      width:58px;height:58px;
      margin-top:22px;opacity:0;
      animation:sl-fi .4s ease 1.08s forwards;
    }
    .sl-arc-wrap svg{width:100%;height:100%;overflow:visible}
    .sl-arc-track{fill:none;stroke:rgba(43,229,197,.12);stroke-width:2.5}
    .sl-arc-fill {
      fill:none;stroke:url(#sl-grad);stroke-width:2.5;
      stroke-linecap:round;
      stroke-dasharray:163;stroke-dashoffset:163;
      transform-origin:center;transform:rotate(-90deg);
      animation:sl-arc-go 2.1s cubic-bezier(.4,0,.2,1) 1.08s forwards;
    }
    @keyframes sl-arc-go{from{stroke-dashoffset:163}to{stroke-dashoffset:0}}
    .sl-arc-pct{
      position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%);
      font-family:'Courier New',monospace;
      font-size:11px;font-weight:700;color:#2BE5C5;
      text-align:center;line-height:1;pointer-events:none;
    }

    /* ── typewriter status ── */
    .sl-status{
      font-family:'Courier New',monospace;
      font-size:9.5px;font-weight:700;
      letter-spacing:.17em;text-transform:uppercase;
      color:rgba(43,229,197,.52);
      margin-top:10px;position:relative;z-index:5;
      white-space:nowrap;overflow:hidden;width:0;
      border-right:1px solid rgba(43,229,197,.65);
      opacity:0;
    }
    .sl-status.go{
      opacity:1;
      animation:sl-tw 1.4s steps(19,end) 1.1s forwards,
                sl-cur .65s step-end 1.1s 5;
    }
    @keyframes sl-tw {from{width:0}to{width:12.5em}}
    @keyframes sl-cur{50%{border-color:transparent}}

    /* ── HUD data text ── */
    .sl-hud{
      position:absolute;z-index:5;
      font-family:'Courier New',monospace;
      font-size:8px;font-weight:700;
      letter-spacing:.1em;text-transform:uppercase;
      color:rgba(43,229,197,.35);line-height:1.85;
      opacity:0;animation:sl-fi .5s ease 1.5s forwards;
    }
    .sl-hud.tl{top:clamp(86px,14%,165px);left:clamp(16px,5vw,58px)}
    .sl-hud.br{bottom:clamp(86px,14%,165px);right:clamp(16px,5vw,58px);text-align:right}

    /* ── "SIGNAL LOCKED" text care apare o singură dată ── */
    .sl-locked{
      position:absolute;top:calc(50% + 185px);left:50%;
      transform:translateX(-50%);
      font-family:'Courier New',monospace;font-size:8px;font-weight:700;
      letter-spacing:.28em;text-transform:uppercase;
      color:rgba(43,229,197,.0);
      white-space:nowrap;z-index:5;
      animation:sl-locked-in .5s ease 2.4s forwards;
    }
    @keyframes sl-locked-in{
      0% {color:rgba(43,229,197,.0);text-shadow:none}
      30%{color:rgba(43,229,197,.8);text-shadow:0 0 10px rgba(43,229,197,.7)}
      100%{color:rgba(43,229,197,.35);text-shadow:0 0 4px rgba(43,229,197,.3)}
    }

    @keyframes sl-fi{from{opacity:0}to{opacity:1}}
  `;

  var sEl = document.createElement('style');
  sEl.textContent = CSS;

  /* SVG gradient definit inline */
  var svgDefs = '<svg style="position:absolute;width:0;height:0"><defs>' +
    '<linearGradient id="sl-grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" stop-color="#2BE5C5"/>' +
    '<stop offset="100%" stop-color="#7FFFEC"/>' +
    '</linearGradient></defs></svg>';

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    svgDefs +
    '<div class="sl-glow"></div>' +
    /* pulse rings */
    '<div class="sl-pr"></div><div class="sl-pr"></div><div class="sl-pr"></div>' +
    /* rings */
    '<div class="sl-ring"></div>' +
    '<div class="sl-ring2"></div>' +
    /* targeting lines */
    '<div class="sl-line sl-n"></div>' +
    '<div class="sl-line sl-s"></div>' +
    '<div class="sl-line sl-e"></div>' +
    '<div class="sl-line sl-w"></div>' +
    /* flash */
    '<div class="sl-flash"></div>' +
    /* corners */
    '<div class="sl-c tl"></div><div class="sl-c tr"></div>' +
    '<div class="sl-c bl"></div><div class="sl-c br"></div>' +
    /* HUD data */
    '<div class="sl-hud tl">VEYRA&nbsp;AI&nbsp;v2.4<br>ENGINE&nbsp;·&nbsp;ONLINE<br>ML5&nbsp;·&nbsp;READY</div>' +
    '<div class="sl-hud br" id="sl-hud-br">847&nbsp;MODELS<br>SYNC&nbsp;·&nbsp;0%<br>STREAM&nbsp;·&nbsp;LIVE</div>' +
    /* logo */
    '<div class="sl-logo"><img src="./veyra-logo.png" alt="VEYRA" onerror="this.onerror=null;this.src=\'./icon-512.png\'"></div>' +
    /* arc progress */
    '<div class="sl-arc-wrap">' +
      '<svg viewBox="0 0 56 56">' +
        '<circle class="sl-arc-track" cx="28" cy="28" r="26"/>' +
        '<circle class="sl-arc-fill"  cx="28" cy="28" r="26"/>' +
      '</svg>' +
      '<div class="sl-arc-pct" id="sl-pct">0%</div>' +
    '</div>' +
    /* status text */
    '<div class="sl-status" id="sl-status">Signal&nbsp;Lock&nbsp;Acquired</div>' +
    /* signal locked label */
    '<div class="sl-locked">◈&nbsp;SIGNAL&nbsp;LOCKED&nbsp;◈</div>';

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    /* typewriter */
    setTimeout(function () {
      var s = document.getElementById('sl-status');
      if (s) s.classList.add('go');
    }, 60);

    /* arc counter — lightweight setInterval */
    setTimeout(function () {
      var pctEl = document.getElementById('sl-pct');
      var hudBr = document.getElementById('sl-hud-br');
      var n = 0;
      var iv = setInterval(function () {
        n = Math.min(100, n + 2 + Math.floor(Math.random() * 5));
        if (pctEl) pctEl.textContent = n + '%';
        if (hudBr) hudBr.innerHTML = '847&nbsp;MODELS<br>SYNC&nbsp;·&nbsp;' + n + '%<br>STREAM&nbsp;·&nbsp;LIVE';
        if (n >= 100) clearInterval(iv);
      }, 42);
    }, 1100);

    /* fade out */
    setTimeout(function () {
      ov.classList.add('out');
      setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (sEl.parentNode) sEl.parentNode.removeChild(sEl);
      }, 800);
    }, 3600);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
