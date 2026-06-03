/**
 * VEYRA — Splash "SIGNAL LOCK" v7
 * Zero canvas, pure CSS GPU-accelerated.
 * Logo: mix-blend-mode:screen → dark bg disappears, full quality preserved.
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
      transition:opacity .85s cubic-bezier(.4,0,.15,1);
      contain:strict;
    }
    #vs.out{opacity:0;pointer-events:none}

    /* CRT scanlines */
    #vs::before{
      content:'';position:absolute;inset:0;pointer-events:none;z-index:10;
      background:repeating-linear-gradient(
        0deg, transparent 0px, transparent 3px,
        rgba(0,0,0,.05) 3px, rgba(0,0,0,.05) 4px
      );
    }

    /* radial ambient glow */
    .sl-glow{
      position:absolute;top:50%;left:50%;
      width:80vmax;height:80vmax;
      transform:translate(-50%,-50%);border-radius:50%;
      background:radial-gradient(circle,
        rgba(43,229,197,.09) 0%,
        rgba(43,229,197,.03) 30%,
        rgba(245,166,35,.02) 55%,
        transparent 70%);
      animation:sl-glow-p 3.6s ease-in-out infinite alternate;
      will-change:transform,opacity;
    }
    @keyframes sl-glow-p{
      from{transform:translate(-50%,-50%) scale(.82);opacity:.5}
      to  {transform:translate(-50%,-50%) scale(1.18);opacity:1}
    }

    /* ── targeting lines (N S E W) ── */
    .sl-line{position:absolute;background:linear-gradient(var(--d),rgba(43,229,197,0),rgba(43,229,197,.55))}
    .sl-line::after{
      content:'';position:absolute;border-radius:50%;
      width:5px;height:5px;background:#2BE5C5;
      box-shadow:0 0 8px #2BE5C5,0 0 20px rgba(43,229,197,.6);
    }
    .sl-n{--d:to bottom;left:50%;top:0;width:1px;height:0;transform:translateX(-50%);
      animation:sl-n-g 1s cubic-bezier(.16,1,.3,1) .15s forwards}
    .sl-n::after{bottom:-2px;left:50%;transform:translateX(-50%)}
    @keyframes sl-n-g{from{height:0}to{height:calc(50% - 190px)}}

    .sl-s{--d:to top;left:50%;bottom:0;width:1px;height:0;transform:translateX(-50%);
      animation:sl-s-g 1s cubic-bezier(.16,1,.3,1) .15s forwards}
    .sl-s::after{top:-2px;left:50%;transform:translateX(-50%)}
    @keyframes sl-s-g{from{height:0}to{height:calc(50% - 215px)}}

    .sl-e{--d:to left;right:0;top:50%;height:1px;width:0;transform:translateY(-50%);
      animation:sl-e-g 1s cubic-bezier(.16,1,.3,1) .28s forwards}
    .sl-e::after{left:-2px;top:50%;transform:translateY(-50%)}
    @keyframes sl-e-g{from{width:0}to{width:calc(50% - 190px)}}

    .sl-w{--d:to right;left:0;top:50%;height:1px;width:0;transform:translateY(-50%);
      animation:sl-w-g 1s cubic-bezier(.16,1,.3,1) .28s forwards}
    .sl-w::after{right:-2px;top:50%;transform:translateY(-50%)}
    @keyframes sl-w-g{from{width:0}to{width:calc(50% - 190px)}}

    /* ── outer ring + orbiting dot ── */
    .sl-ring{
      position:absolute;top:50%;left:50%;
      width:min(430px,96vw);height:min(430px,96vw);
      border-radius:50%;
      border:1px solid rgba(43,229,197,.13);
      transform:translate(-50%,-50%);
      animation:sl-spin 22s linear .4s infinite;
      will-change:transform;
    }
    .sl-ring::after{
      content:'';position:absolute;
      top:-4px;left:50%;transform:translateX(-50%);
      width:8px;height:8px;border-radius:50%;
      background:#2BE5C5;
      box-shadow:0 0 10px #2BE5C5,0 0 30px rgba(43,229,197,.7);
    }
    @keyframes sl-spin{
      from{transform:translate(-50%,-50%) rotate(0)}
      to  {transform:translate(-50%,-50%) rotate(360deg)}
    }

    /* inner dashed ring — counter-rotation */
    .sl-ring2{
      position:absolute;top:50%;left:50%;
      width:min(260px,62vw);height:min(260px,62vw);
      border-radius:50%;
      border:1px dashed rgba(43,229,197,.09);
      transform:translate(-50%,-50%);
      animation:sl-spin2 15s linear .4s infinite;
      will-change:transform;
    }
    @keyframes sl-spin2{
      from{transform:translate(-50%,-50%) rotate(0)}
      to  {transform:translate(-50%,-50%) rotate(-360deg)}
    }

    /* gold accent ring — slow pulse rotation */
    .sl-ring3{
      position:absolute;top:50%;left:50%;
      width:min(340px,80vw);height:min(340px,80vw);
      border-radius:50%;
      border:1px solid rgba(245,166,35,.07);
      transform:translate(-50%,-50%);
      animation:sl-spin 34s linear .4s infinite reverse;
      will-change:transform;
    }
    .sl-ring3::after{
      content:'';position:absolute;
      bottom:-3px;left:50%;transform:translateX(-50%);
      width:6px;height:6px;border-radius:50%;
      background:#F5A623;
      box-shadow:0 0 8px #F5A623,0 0 22px rgba(245,166,35,.65);
    }

    /* ── pulse rings ── */
    .sl-pr{
      position:absolute;top:50%;left:50%;
      border-radius:50%;transform:translate(-50%,-50%) scale(0);
      animation:sl-pr-out 3.2s ease-out infinite;
      will-change:transform,opacity;
    }
    .sl-pr:nth-child(1){width:180px;height:180px;border:1px solid rgba(43,229,197,.5);animation-delay:.0s}
    .sl-pr:nth-child(2){width:320px;height:320px;border:1px solid rgba(43,229,197,.28);animation-delay:.9s}
    .sl-pr:nth-child(3){width:490px;height:490px;border:.5px solid rgba(43,229,197,.14);animation-delay:1.8s}
    @keyframes sl-pr-out{
      0%  {opacity:.9;transform:translate(-50%,-50%) scale(.02)}
      100%{opacity:0; transform:translate(-50%,-50%) scale(1)}
    }

    /* ── energy flash on reveal ── */
    .sl-flash{
      position:absolute;top:50%;left:50%;
      width:8px;height:8px;border-radius:50%;
      transform:translate(-50%,-50%);
      animation:sl-flash-go .7s ease-out .2s forwards;
      opacity:0;
    }
    @keyframes sl-flash-go{
      0%  {opacity:1;transform:translate(-50%,-50%) scale(1);
           box-shadow:0 0 0 4px rgba(43,229,197,.9),0 0 50px rgba(43,229,197,.6),0 0 80px rgba(245,166,35,.3)}
      100%{opacity:0;transform:translate(-50%,-50%) scale(70);
           box-shadow:0 0 0 1px rgba(43,229,197,0),0 0 80px rgba(43,229,197,0)}
    }

    /* ── HUD corner brackets ── */
    .sl-c{position:absolute;width:32px;height:32px;opacity:0}
    .sl-c.tl{top:clamp(70px,13%,155px);left:clamp(12px,4vw,50px);
      border-top:1.5px solid rgba(43,229,197,.7);border-left:1.5px solid rgba(43,229,197,.7);
      animation:sl-c-tl .4s ease .2s forwards}
    .sl-c.tr{top:clamp(70px,13%,155px);right:clamp(12px,4vw,50px);
      border-top:1.5px solid rgba(43,229,197,.7);border-right:1.5px solid rgba(43,229,197,.7);
      animation:sl-c-tr .4s ease .2s forwards}
    .sl-c.bl{bottom:clamp(70px,13%,155px);left:clamp(12px,4vw,50px);
      border-bottom:1.5px solid rgba(245,166,35,.6);border-left:1.5px solid rgba(245,166,35,.6);
      animation:sl-c-bl .4s ease .2s forwards}
    .sl-c.br{bottom:clamp(70px,13%,155px);right:clamp(12px,4vw,50px);
      border-bottom:1.5px solid rgba(245,166,35,.6);border-right:1.5px solid rgba(245,166,35,.6);
      animation:sl-c-br .4s ease .2s forwards}
    @keyframes sl-c-tl{from{opacity:0;transform:translate(14px,14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-tr{from{opacity:0;transform:translate(-14px,14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-bl{from{opacity:0;transform:translate(14px,-14px)}to{opacity:1;transform:none}}
    @keyframes sl-c-br{from{opacity:0;transform:translate(-14px,-14px)}to{opacity:1;transform:none}}

    /* ── logo ── */
    .sl-logo{
      position:relative;z-index:5;opacity:0;
      animation:sl-logo-in 1.1s cubic-bezier(.16,1,.3,1) .15s forwards;
    }
    @keyframes sl-logo-in{
      0%  {opacity:0;transform:scale(.6);filter:blur(18px) brightness(3)}
      40% {opacity:1;filter:blur(.5px) brightness(1.8)}
      100%{opacity:1;transform:scale(1);filter:blur(0) brightness(1)}
    }
    .sl-logo img{
      width:min(360px,90vw);display:block;
      mix-blend-mode:screen;
      will-change:filter;
      animation:
        sl-glow-l 2.8s ease-in-out 1.3s infinite alternate,
        sl-glitch  10s  linear     2.5s infinite;
    }
    @keyframes sl-glow-l{
      from{filter:drop-shadow(0 0 18px rgba(43,229,197,.6)) drop-shadow(0 0 50px rgba(43,229,197,.24))}
      to  {filter:drop-shadow(0 0 42px rgba(43,229,197,.95)) drop-shadow(0 0 90px rgba(43,229,197,.42)) drop-shadow(0 0 12px rgba(245,166,35,.35))}
    }
    @keyframes sl-glitch{
      0%,91%,100%{clip-path:none;transform:none}
      92%{clip-path:inset(20% 0 54% 0);transform:translateX(-6px);filter:drop-shadow(-6px 0 rgba(255,20,70,.9))}
      93%{clip-path:inset(54% 0 18% 0);transform:translateX( 6px);filter:drop-shadow( 6px 0 rgba(0,255,175,.9))}
      94%{clip-path:none;transform:none}
    }

    /* ── arc SVG progress ── */
    .sl-arc-wrap{
      position:relative;z-index:5;
      width:60px;height:60px;
      margin-top:18px;opacity:0;
      animation:sl-fi .4s ease 1.1s forwards;
    }
    .sl-arc-wrap svg{width:100%;height:100%;overflow:visible}
    .sl-arc-track{fill:none;stroke:rgba(43,229,197,.1);stroke-width:2.5}
    .sl-arc-fill{
      fill:none;stroke:url(#sl-grad);stroke-width:2.5;
      stroke-linecap:round;
      stroke-dasharray:163;stroke-dashoffset:163;
      transform-origin:center;transform:rotate(-90deg);
      animation:sl-arc-go 2.2s cubic-bezier(.4,0,.2,1) 1.1s forwards;
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
      letter-spacing:.18em;text-transform:uppercase;
      color:rgba(43,229,197,.5);
      margin-top:10px;position:relative;z-index:5;
      white-space:nowrap;overflow:hidden;width:0;
      border-right:1px solid rgba(43,229,197,.6);
      opacity:0;
    }
    .sl-status.go{
      opacity:1;
      animation:sl-tw 1.4s steps(19,end) 1.15s forwards,
                sl-cur .65s step-end 1.15s 5;
    }
    @keyframes sl-tw {from{width:0}to{width:12.5em}}
    @keyframes sl-cur{50%{border-color:transparent}}

    /* ── HUD data text ── */
    .sl-hud{
      position:absolute;z-index:5;
      font-family:'Courier New',monospace;
      font-size:8px;font-weight:700;
      letter-spacing:.1em;text-transform:uppercase;
      color:rgba(43,229,197,.32);line-height:1.9;
      opacity:0;animation:sl-fi .5s ease 1.6s forwards;
    }
    .sl-hud.tl{top:clamp(86px,14%,165px);left:clamp(16px,5vw,58px)}
    .sl-hud.br{bottom:clamp(86px,14%,165px);right:clamp(16px,5vw,58px);text-align:right;
      color:rgba(245,166,35,.38)}

    /* ── "SIGNAL LOCKED" label ── */
    .sl-locked{
      position:absolute;top:calc(50% + 200px);left:50%;
      transform:translateX(-50%);
      font-family:'Courier New',monospace;font-size:8px;font-weight:700;
      letter-spacing:.3em;text-transform:uppercase;
      color:rgba(43,229,197,.0);
      white-space:nowrap;z-index:5;
      animation:sl-locked-in .5s ease 2.5s forwards;
    }
    @keyframes sl-locked-in{
      0% {color:rgba(43,229,197,.0);text-shadow:none}
      30%{color:rgba(43,229,197,.85);text-shadow:0 0 12px rgba(43,229,197,.7),0 0 30px rgba(43,229,197,.3)}
      100%{color:rgba(43,229,197,.38);text-shadow:0 0 5px rgba(43,229,197,.3)}
    }

    @keyframes sl-fi{from{opacity:0}to{opacity:1}}
  `;

  var sEl = document.createElement('style');
  sEl.textContent = CSS;

  var svgDefs = '<svg style="position:absolute;width:0;height:0"><defs>' +
    '<linearGradient id="sl-grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" stop-color="#2BE5C5"/>' +
    '<stop offset="60%" stop-color="#7FFFEC"/>' +
    '<stop offset="100%" stop-color="#F5A623"/>' +
    '</linearGradient></defs></svg>';

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    svgDefs +
    '<div class="sl-glow"></div>' +
    '<div class="sl-pr"></div><div class="sl-pr"></div><div class="sl-pr"></div>' +
    '<div class="sl-ring"></div>' +
    '<div class="sl-ring2"></div>' +
    '<div class="sl-ring3"></div>' +
    '<div class="sl-line sl-n"></div>' +
    '<div class="sl-line sl-s"></div>' +
    '<div class="sl-line sl-e"></div>' +
    '<div class="sl-line sl-w"></div>' +
    '<div class="sl-flash"></div>' +
    '<div class="sl-c tl"></div><div class="sl-c tr"></div>' +
    '<div class="sl-c bl"></div><div class="sl-c br"></div>' +
    '<div class="sl-hud tl">VEYRA&nbsp;AI&nbsp;v2.4<br>ENGINE&nbsp;·&nbsp;ONLINE<br>ML5&nbsp;·&nbsp;READY</div>' +
    '<div class="sl-hud br" id="sl-hud-br">847&nbsp;MODELS<br>SYNC&nbsp;·&nbsp;0%<br>STREAM&nbsp;·&nbsp;LIVE</div>' +
    '<div class="sl-logo"><img src="./assets/veyra-logo4.png" alt="VEYRA" onerror="this.onerror=null;this.src=\'./assets/veyra-icon.svg\'"></div>' +
    '<div class="sl-arc-wrap">' +
      '<svg viewBox="0 0 56 56">' +
        '<circle class="sl-arc-track" cx="28" cy="28" r="26"/>' +
        '<circle class="sl-arc-fill"  cx="28" cy="28" r="26"/>' +
      '</svg>' +
      '<div class="sl-arc-pct" id="sl-pct">0%</div>' +
    '</div>' +
    '<div class="sl-status" id="sl-status">Signal&nbsp;Lock&nbsp;Acquired</div>' +
    '<div class="sl-locked">◈&nbsp;SIGNAL&nbsp;LOCKED&nbsp;◈</div>';

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    setTimeout(function () {
      var s = document.getElementById('sl-status');
      if (s) s.classList.add('go');
    }, 60);

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

    setTimeout(function () {
      ov.classList.add('out');
      setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (sEl.parentNode) sEl.parentNode.removeChild(sEl);
      }, 900);
    }, 3700);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
