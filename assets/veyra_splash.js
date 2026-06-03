/**
 * VEYRA — Splash Screen v4  CINEMATIC
 */
(function () {
  'use strict';
  if (window.__veyraSplashDone) return;
  window.__veyraSplashDone = true;

  var CSS = `
    *{box-sizing:border-box}
    #vs{
      position:fixed;inset:0;z-index:999999;
      background:#04060E;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      overflow:hidden;
      transition:opacity .9s cubic-bezier(.4,0,.15,1);
    }
    #vs.vs-out{opacity:0;pointer-events:none}

    /* canvas */
    #vs-c{position:absolute;inset:0;width:100%;height:100%}

    /* aurora shift */
    .vs-aurora{
      position:absolute;inset:0;pointer-events:none;
      animation:vs-aurora 6s ease-in-out infinite alternate;
    }
    @keyframes vs-aurora{
      0%  {background:radial-gradient(ellipse 80% 60% at 35% 40%,rgba(43,229,197,.09) 0%,rgba(80,60,220,.06) 50%,transparent 75%)}
      50% {background:radial-gradient(ellipse 90% 70% at 65% 55%,rgba(43,229,197,.11) 0%,rgba(120,60,255,.07) 50%,transparent 75%)}
      100%{background:radial-gradient(ellipse 70% 80% at 50% 30%,rgba(80,60,220,.09) 0%,rgba(43,229,197,.06) 50%,transparent 75%)}
    }

    /* vignette */
    .vs-vig{
      position:absolute;inset:0;pointer-events:none;
      background:radial-gradient(ellipse at center,transparent 35%,rgba(3,5,12,.65) 68%,rgba(2,3,8,.95) 100%)
    }

    /* grid */
    .vs-grid{
      position:absolute;inset:0;opacity:0;
      background-image:
        repeating-linear-gradient(0deg,  rgba(43,229,197,.02) 0px,transparent 1px,transparent 50px),
        repeating-linear-gradient(90deg, rgba(43,229,197,.015) 0px,transparent 1px,transparent 85px);
      animation:vs-fi .9s ease .15s forwards;
    }

    /* flat rings */
    .vs-rings{position:absolute;top:50%;left:50%;pointer-events:none}
    .vs-r{
      position:absolute;border-radius:50%;
      transform:translate(-50%,-50%) scale(0);
      animation:vs-ro 3.2s ease-out infinite;
    }
    .vs-r:nth-child(1){width:150px;height:150px;border:1.5px solid rgba(43,229,197,.65);animation-delay:.0s}
    .vs-r:nth-child(2){width:280px;height:280px;border:1px   solid rgba(43,229,197,.4); animation-delay:.6s}
    .vs-r:nth-child(3){width:420px;height:420px;border:1px   solid rgba(43,229,197,.25);animation-delay:1.2s}
    .vs-r:nth-child(4){width:560px;height:560px;border:.5px  solid rgba(43,229,197,.14);animation-delay:1.8s}
    .vs-r:nth-child(5){width:700px;height:700px;border:.5px  solid rgba(43,229,197,.07);animation-delay:2.4s}
    @keyframes vs-ro{
      0%  {opacity:.95;transform:translate(-50%,-50%) scale(.03)}
      100%{opacity:0;  transform:translate(-50%,-50%) scale(1)}
    }

    /* 3-D orbit rings */
    .vs-orbit-wrap{
      position:absolute;top:50%;left:50%;
      perspective:550px;perspective-origin:50% 50%;
    }
    .vs-orb{
      position:absolute;border-radius:50%;
      transform-style:preserve-3d;
    }
    .vs-orb1{
      width:360px;height:360px;
      border:1.5px solid rgba(43,229,197,.32);
      transform:translate(-50%,-50%) rotateX(76deg);
      animation:vs-orb-s1 10s linear .4s infinite;
    }
    .vs-orb2{
      width:260px;height:260px;
      border:1px solid rgba(100,180,255,.25);
      transform:translate(-50%,-50%) rotateX(76deg) rotateZ(40deg);
      animation:vs-orb-s2 16s linear .4s infinite;
    }
    /* glowing bead on orbit 1 */
    .vs-orb1::after{
      content:'';position:absolute;
      width:7px;height:7px;border-radius:50%;
      background:#2BE5C5;
      box-shadow:0 0 8px #2BE5C5,0 0 20px rgba(43,229,197,.7);
      top:-3.5px;left:calc(50% - 3.5px);
    }
    /* glowing bead on orbit 2 */
    .vs-orb2::after{
      content:'';position:absolute;
      width:5px;height:5px;border-radius:50%;
      background:#64B4FF;
      box-shadow:0 0 6px #64B4FF,0 0 14px rgba(100,180,255,.6);
      top:-2.5px;left:calc(50% - 2.5px);
    }
    @keyframes vs-orb-s1{from{transform:translate(-50%,-50%) rotateX(76deg) rotateZ(0deg)}  to{transform:translate(-50%,-50%) rotateX(76deg) rotateZ(360deg)}}
    @keyframes vs-orb-s2{from{transform:translate(-50%,-50%) rotateX(76deg) rotateZ(40deg)} to{transform:translate(-50%,-50%) rotateX(76deg) rotateZ(400deg)}}

    /* rotating reticle */
    .vs-reticle{
      position:absolute;top:50%;left:50%;
      width:130px;height:130px;
      border:1px solid rgba(43,229,197,.18);
      border-radius:50%;
      transform:translate(-50%,-50%);
      animation:vs-ret-spin 20s linear .3s infinite;
      opacity:0;
    }
    .vs-reticle::before,.vs-reticle::after{content:'';position:absolute;background:rgba(43,229,197,.25)}
    .vs-reticle::before{width:100%;height:1px;top:50%;left:0}
    .vs-reticle::after {width:1px;height:100%;top:0;left:50%}
    .vs-reticle.vs-show{animation:vs-ret-spin 20s linear .3s infinite,vs-fi .4s ease .3s forwards}
    @keyframes vs-ret-spin{from{transform:translate(-50%,-50%) rotate(0)}to{transform:translate(-50%,-50%) rotate(360deg)}}

    /* energy burst on logo reveal */
    .vs-burst{
      position:absolute;top:50%;left:50%;
      width:6px;height:6px;border-radius:50%;
      transform:translate(-50%,-50%);
      animation:vs-burst-go .7s ease-out .28s forwards;
      opacity:0;
    }
    @keyframes vs-burst-go{
      0%  {opacity:.9;transform:translate(-50%,-50%) scale(1);
           box-shadow:0 0 0 3px rgba(43,229,197,.9),0 0 30px rgba(43,229,197,.6)}
      100%{opacity:0;transform:translate(-50%,-50%) scale(55);
           box-shadow:0 0 0 1px rgba(43,229,197,0),0 0 80px rgba(43,229,197,0)}
    }

    /* second burst, delayed */
    .vs-burst2{
      position:absolute;top:50%;left:50%;
      width:4px;height:4px;border-radius:50%;
      transform:translate(-50%,-50%);
      animation:vs-burst-go2 .6s ease-out .55s forwards;
      opacity:0;
    }
    @keyframes vs-burst-go2{
      0%  {opacity:.7;transform:translate(-50%,-50%) scale(1);
           box-shadow:0 0 0 2px rgba(120,180,255,.8)}
      100%{opacity:0;transform:translate(-50%,-50%) scale(45);
           box-shadow:0 0 0 1px rgba(120,180,255,0)}
    }

    /* scan lines */
    .vs-scan1,.vs-scan2{position:absolute;left:0;right:0;pointer-events:none}
    .vs-scan1{
      height:110px;
      background:linear-gradient(to bottom,transparent 0%,rgba(43,229,197,.025) 40%,rgba(43,229,197,.06) 50%,rgba(43,229,197,.025) 60%,transparent 100%);
      animation:vs-scan 2.1s linear infinite;
    }
    .vs-scan2{
      height:55px;
      background:linear-gradient(to bottom,transparent 0%,rgba(43,229,197,.012) 50%,transparent 100%);
      animation:vs-scan 3.6s linear .9s infinite;
    }
    @keyframes vs-scan{from{top:-130px}to{top:100vh}}

    /* HUD corners */
    .vs-hud-corner{position:absolute;width:36px;height:36px;opacity:0}
    .vs-hud-corner.tl{top:calc(50% - 220px);left:calc(50% - 200px);border-top:2px solid #2BE5C5;border-left:2px solid #2BE5C5;animation:vs-c-tl .45s cubic-bezier(.16,1,.3,1) .18s forwards}
    .vs-hud-corner.tr{top:calc(50% - 220px);right:calc(50% - 200px);border-top:2px solid #2BE5C5;border-right:2px solid #2BE5C5;animation:vs-c-tr .45s cubic-bezier(.16,1,.3,1) .18s forwards}
    .vs-hud-corner.bl{bottom:calc(50% - 220px);left:calc(50% - 200px);border-bottom:2px solid #2BE5C5;border-left:2px solid #2BE5C5;animation:vs-c-bl .45s cubic-bezier(.16,1,.3,1) .18s forwards}
    .vs-hud-corner.br{bottom:calc(50% - 220px);right:calc(50% - 200px);border-bottom:2px solid #2BE5C5;border-right:2px solid #2BE5C5;animation:vs-c-br .45s cubic-bezier(.16,1,.3,1) .18s forwards}
    @keyframes vs-c-tl{from{opacity:0;transform:translate( 20px, 20px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-tr{from{opacity:0;transform:translate(-20px, 20px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-bl{from{opacity:0;transform:translate( 20px,-20px)}to{opacity:1;transform:translate(0,0)}}
    @keyframes vs-c-br{from{opacity:0;transform:translate(-20px,-20px)}to{opacity:1;transform:translate(0,0)}}
    /* extra tick marks */
    .vs-hud-corner::before,.vs-hud-corner::after{content:'';position:absolute;background:#2BE5C5}
    .vs-hud-corner.tl::before{width:1px;height:10px;left:-1px;top:12px}
    .vs-hud-corner.tl::after{height:1px;width:10px;top:-1px;left:12px}
    .vs-hud-corner.tr::before{width:1px;height:10px;right:-1px;top:12px}
    .vs-hud-corner.tr::after{height:1px;width:10px;top:-1px;right:12px}
    .vs-hud-corner.bl::before{width:1px;height:10px;left:-1px;bottom:12px}
    .vs-hud-corner.bl::after{height:1px;width:10px;bottom:-1px;left:12px}
    .vs-hud-corner.br::before{width:1px;height:10px;right:-1px;bottom:12px}
    .vs-hud-corner.br::after{height:1px;width:10px;bottom:-1px;right:12px}

    /* HUD data labels */
    .vs-hud-data{
      position:absolute;
      font-family:'Courier New',monospace;font-size:9px;font-weight:700;
      letter-spacing:.1em;text-transform:uppercase;color:rgba(43,229,197,.4);
      line-height:1.7;opacity:0;
      animation:vs-fi .5s ease 1.4s forwards;
    }
    .vs-hud-data.tl{top:calc(50% - 210px);left:calc(50% - 190px)}
    .vs-hud-data.br{bottom:calc(50% - 210px);right:calc(50% - 190px);text-align:right}

    /* logo */
    .vs-logo{
      position:relative;z-index:3;opacity:0;
      animation:vs-logo-in 1.1s cubic-bezier(.16,1,.3,1) .22s forwards;
    }
    @keyframes vs-logo-in{
      0%  {opacity:0;transform:scale(.58) translateY(30px);filter:blur(18px) brightness(2.5)}
      40% {opacity:1;filter:blur(2px) brightness(1.8)}
      100%{opacity:1;transform:scale(1) translateY(0);filter:blur(0) brightness(1)}
    }
    .vs-logo img{
      width:min(295px,71vw);display:block;
      animation:vs-lglow 2.3s ease-in-out 1.3s infinite alternate,vs-glitch 7s linear 2s infinite;
    }
    @keyframes vs-lglow{
      from{filter:drop-shadow(0 0 18px rgba(43,229,197,.55)) drop-shadow(0 0 50px rgba(43,229,197,.22))}
      to  {filter:drop-shadow(0 0 40px rgba(43,229,197,.9)) drop-shadow(0 0 95px rgba(43,229,197,.42)) drop-shadow(0 0 160px rgba(43,229,197,.18))}
    }
    @keyframes vs-glitch{
      0%,89%,100%{clip-path:none;transform:none}
      90%{clip-path:inset(18% 0 54% 0);transform:translateX(-7px);filter:drop-shadow(-7px 0 rgba(255,20,70,.9))}
      91%{clip-path:inset(54% 0 16% 0);transform:translateX( 7px);filter:drop-shadow( 7px 0 rgba(0,255,185,.9))}
      92%{clip-path:none;transform:none}
      93%{clip-path:inset(32% 0 40% 0);transform:translateX(-3px)}
      94%{clip-path:none;transform:none}
    }

    /* holographic shimmer strip */
    .vs-holo{
      position:absolute;inset:0;border-radius:4px;z-index:4;pointer-events:none;
      background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.06) 50%,transparent 70%);
      background-size:250% 100%;
      animation:vs-holo-move 2.8s linear 1.5s infinite;
      opacity:0;animation-fill-mode:both;
    }
    @keyframes vs-holo-move{
      0%  {opacity:0;background-position:200% 0}
      10% {opacity:1}
      90% {opacity:.6}
      100%{opacity:0;background-position:-200% 0}
    }

    /* status typewriter */
    .vs-status{
      font-family:'Courier New',monospace;font-size:10px;font-weight:700;
      letter-spacing:.15em;text-transform:uppercase;
      color:rgba(43,229,197,.55);
      margin-top:20px;position:relative;z-index:3;
      white-space:nowrap;overflow:hidden;width:0;
      border-right:1px solid rgba(43,229,197,.7);
      opacity:0;
    }
    .vs-status.go{
      opacity:1;
      animation:vs-type 1.5s steps(23,end) 1.1s forwards,
                vs-cur .7s step-end 1.1s 4;
    }
    @keyframes vs-type{from{width:0}to{width:14.5em}}
    @keyframes vs-cur{50%{border-color:transparent}}

    /* progress */
    .vs-bar{
      position:relative;z-index:3;
      width:min(220px,58vw);height:2px;
      background:rgba(255,255,255,.05);border-radius:2px;
      margin-top:26px;overflow:hidden;opacity:0;
      animation:vs-fu .4s ease 1.15s forwards;
    }
    .vs-bar-f{
      height:100%;width:0%;border-radius:2px;
      background:linear-gradient(90deg,rgba(43,229,197,.4) 0%,#2BE5C5 45%,#9FFFEF 55%,rgba(43,229,197,.4) 100%);
      background-size:300% 100%;
      animation:vs-bg 2.2s cubic-bezier(.4,0,.2,1) 1.15s forwards,
                vs-bs 1.1s linear 1.15s infinite;
    }
    @keyframes vs-bg{from{width:0}to{width:100%}}
    @keyframes vs-bs{from{background-position:300% 0}to{background-position:-300% 0}}

    /* dots */
    .vs-dots{display:flex;gap:7px;margin-top:13px;position:relative;z-index:3;opacity:0;animation:vs-fu .4s ease 1.35s forwards}
    .vs-dots span{width:4px;height:4px;border-radius:50%;background:rgba(43,229,197,.65);animation:vs-dot 1.1s ease-in-out infinite}
    .vs-dots span:nth-child(2){animation-delay:.17s}
    .vs-dots span:nth-child(3){animation-delay:.34s}
    @keyframes vs-dot{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1.4)}}

    @keyframes vs-fi {from{opacity:0}to{opacity:1}}
    @keyframes vs-fu {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  `;

  var sEl = document.createElement('style');
  sEl.id = 'vs-sty';
  sEl.textContent = CSS;

  var ov = document.createElement('div');
  ov.id = 'vs';
  ov.innerHTML =
    '<canvas id="vs-c"></canvas>'+
    '<div class="vs-aurora"></div>'+
    '<div class="vs-vig"></div>'+
    '<div class="vs-grid"></div>'+
    '<div class="vs-scan1"></div>'+
    '<div class="vs-scan2"></div>'+
    '<div class="vs-rings">'+
      '<div class="vs-r"></div><div class="vs-r"></div>'+
      '<div class="vs-r"></div><div class="vs-r"></div><div class="vs-r"></div>'+
    '</div>'+
    '<div class="vs-orbit-wrap">'+
      '<div class="vs-orb vs-orb1"></div>'+
      '<div class="vs-orb vs-orb2"></div>'+
    '</div>'+
    '<div class="vs-reticle vs-show"></div>'+
    '<div class="vs-burst"></div>'+
    '<div class="vs-burst2"></div>'+
    '<div class="vs-hud-corner tl"></div><div class="vs-hud-corner tr"></div>'+
    '<div class="vs-hud-corner bl"></div><div class="vs-hud-corner br"></div>'+
    '<div class="vs-hud-data tl">VEYRA&nbsp;AI&nbsp;v2.4.1<br>ENGINE&nbsp;·&nbsp;ONLINE<br>ML5&nbsp;·&nbsp;READY</div>'+
    '<div class="vs-hud-data br">847&nbsp;MODELS<br>ACC&nbsp;·&nbsp;94.2%<br>LIVE&nbsp;·&nbsp;ACTIVE</div>'+
    '<div class="vs-logo" style="position:relative">'+
      '<img src="./veyra-logo.png" alt="VEYRA" onerror="this.onerror=null;this.src=\'./icon-512.png\'">'+
      '<div class="vs-holo"></div>'+
    '</div>'+
    '<div class="vs-status">Initializing&nbsp;AI&nbsp;Engine...</div>'+
    '<div class="vs-bar"><div class="vs-bar-f"></div></div>'+
    '<div class="vs-dots"><span></span><span></span><span></span></div>';

  /* ── canvas: burst particles + neural lines + arc lightning ── */
  function startCanvas(cv) {
    var ctx = cv.getContext('2d');
    var W = cv.width = window.innerWidth;
    var H = cv.height = window.innerHeight;
    var cx = W/2, cy = H/2;
    var t0 = Date.now();
    var N = 130;
    var pts = [];

    for (var i = 0; i < N; i++) {
      var ang = (i / N) * 6.283 + Math.random() * .25;
      var sp  = 1.8 + Math.random() * 4.5;
      pts.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        fr: .964 + Math.random() * .018,
        sz: .7  + Math.random() * 1.9,
        al: 0,
        mAl: .3 + Math.random() * .7,
        fi: .025 + Math.random() * .04,
        fd: .0014 + Math.random() * .0028,
        h:  166 + Math.random() * 30
      });
    }

    /* arc lightning state */
    var arcs = [], lastArc = 0;

    var raf;
    function tick() {
      var now = Date.now(), dt = now - t0;
      ctx.clearRect(0, 0, W, H);

      /* particles */
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        p.vx *= p.fr; p.vy *= p.fr;
        p.x += p.vx;  p.y += p.vy;
        p.al = p.al < p.mAl ? p.al + p.fi : p.al - p.fd;

        if (p.al <= 0) {
          var a = Math.random() * 6.283, d = 6 + Math.random() * 38;
          var s = 1 + Math.random() * 2.2;
          p.x = cx + Math.cos(a)*d; p.y = cy + Math.sin(a)*d;
          p.vx = Math.cos(a)*s; p.vy = Math.sin(a)*s;
          p.al = 0; p.fr = .97 + Math.random() * .015;
        }
        if (p.al > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.sz, 0, 6.283);
          ctx.fillStyle = 'hsla('+p.h+',84%,74%,'+Math.max(0,p.al)+')';
          ctx.fill();
        }
      }

      /* neural connections */
      for (var i = 0; i < N; i++) {
        if (pts[i].al < .08) continue;
        for (var j = i+1; j < N; j++) {
          if (pts[j].al < .08) continue;
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          var d2 = dx*dx + dy*dy;
          if (d2 < 5800) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = 'rgba(43,229,197,'+((1-d2/5800)*Math.min(pts[i].al,pts[j].al)*.28)+')';
            ctx.lineWidth = .5; ctx.stroke();
          }
        }
      }

      /* arc lightning every ~1.4s after 700ms */
      if (dt > 700 && now - lastArc > 1400) {
        lastArc = now;
        var p1 = pts[Math.floor(Math.random()*N)];
        var p2 = pts[Math.floor(Math.random()*N)];
        arcs.push({p1:p1, p2:p2, born:now, segs:5+Math.floor(Math.random()*4)});
      }
      for (var k = arcs.length-1; k >= 0; k--) {
        var arc = arcs[k];
        var age = (now - arc.born) / 250;
        if (age >= 1) { arcs.splice(k,1); continue; }
        var al = (1-age) * .8;
        /* draw jagged arc with multiple segments */
        var pts2 = [{x:arc.p1.x, y:arc.p1.y}];
        var ex = arc.p2.x, ey = arc.p2.y;
        for (var s = 1; s < arc.segs; s++) {
          var frac = s / arc.segs;
          pts2.push({
            x: arc.p1.x + (ex - arc.p1.x)*frac + (Math.random()-.5)*60,
            y: arc.p1.y + (ey - arc.p1.y)*frac + (Math.random()-.5)*60
          });
        }
        pts2.push({x:ex, y:ey});
        ctx.beginPath();
        ctx.moveTo(pts2[0].x, pts2[0].y);
        for (var s = 1; s < pts2.length; s++) ctx.lineTo(pts2[s].x, pts2[s].y);
        ctx.strokeStyle = 'rgba(43,229,197,'+al+')';
        ctx.lineWidth = .9; ctx.stroke();
        /* glow layer */
        ctx.strokeStyle = 'rgba(43,229,197,'+(al*.35)+')';
        ctx.lineWidth = 3; ctx.stroke();
      }

      raf = requestAnimationFrame(tick);
    }
    tick();
    return function(){ cancelAnimationFrame(raf); };
  }

  function mount() {
    document.head.appendChild(sEl);
    document.body.insertBefore(ov, document.body.firstChild);

    /* typewriter */
    setTimeout(function(){
      var s = ov.querySelector('.vs-status');
      if (s) s.classList.add('go');
    }, 60);

    /* canvas */
    var stop = null;
    setTimeout(function(){
      var c = document.getElementById('vs-c');
      if (c) stop = startCanvas(c);
    }, 30);

    /* animated HUD counters */
    setTimeout(function(){
      var br = ov.querySelector('.vs-hud-data.br');
      if (!br) return;
      var pct = 0;
      var iv = setInterval(function(){
        pct = Math.min(100, pct + 3 + Math.floor(Math.random()*6));
        br.innerHTML = '847&nbsp;MODELS<br>ACC&nbsp;·&nbsp;' + (88 + Math.floor(pct/17)) + '.' + (pct % 10) + '%<br>SYS&nbsp;·&nbsp;' + pct + '%';
        if (pct >= 100) clearInterval(iv);
      }, 60);
    }, 1500);

    /* fade out */
    setTimeout(function(){
      ov.classList.add('vs-out');
      setTimeout(function(){
        if (stop) stop();
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (sEl.parentNode) sEl.parentNode.removeChild(sEl);
      }, 950);
    }, 3600);
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
