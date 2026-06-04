// ==========================================================
// VEYRA — Nav Visibility Fix v2
// Pe desktop: meniu sticky sus. Pe mobil: bara de jos MEREU jos.
// ==========================================================
(function(){
  var root = document.documentElement;
  var body = document.body;
  var raf  = 0;

  function px(n){ return Math.max(0, Math.ceil(Number(n) || 0)) + 'px'; }
  function setI(el, prop, val){
    if(!el) return;
    try{ el.style.setProperty(prop, val, 'important'); }catch(e){}
  }

  function updateNav(){
    raf  = 0;
    body = document.body;
    if(!body) return;

    var header = document.querySelector('.header');
    var tabs   = document.querySelector('nav.tabs') || document.querySelector('.tabs');
    var mnav   = document.getElementById('mobile-nav') || document.querySelector('.mobile-nav');
    var desktop = window.matchMedia && window.matchMedia('(min-width: 769px)').matches;

    // ── Înălțime header ──────────────────────────────────
    var headerH = header ? (header.getBoundingClientRect().height || 92) : 92;
    root.style.setProperty('--veyra-header-h', px(headerH));

    // ── Ștergem clasele care forțează meniu sus ──────────
    body.classList.remove('veyra-force-top-menu');
    body.classList.remove('veyra-bottom-nav-blocked');

    // ── Tabs (nav.tabs) ───────────────────────────────────
    if(tabs){
      setI(tabs, 'top',      px(headerH));
      setI(tabs, 'z-index',  '29990');
      if(desktop){
        setI(tabs, 'display',    'flex');
        setI(tabs, 'position',   'sticky');
        setI(tabs, 'visibility', 'visible');
        setI(tabs, 'opacity',    '1');
      } else {
        // Pe mobil ascundem nav.tabs — bara mobilă de jos e suficientă
        setI(tabs, 'display', 'none');
      }
      var tabsH = tabs.getBoundingClientRect().height || 0;
      root.style.setProperty('--veyra-tabs-h',        px(desktop ? tabsH : 0));
      root.style.setProperty('--veyra-nav-panel-top', px(headerH + (desktop ? tabsH : 0)));
    }

    // ── Mobile nav: mereu jos, mereu vizibil ─────────────
    if(mnav && !desktop){
      var lt = body.classList.contains('theme-light');
      setI(mnav, 'display',          'flex');
      setI(mnav, 'position',         'fixed');
      setI(mnav, 'z-index',          '9999');
      setI(mnav, 'justify-content',  'space-around');
      setI(mnav, 'align-items',      'stretch');
      setI(mnav, 'visibility',       'visible');
      setI(mnav, 'opacity',          '1');
      setI(mnav, 'pointer-events',   'auto');
      if(lt){
        /* Light mode: bară plată albă */
        setI(mnav, 'bottom',         '0px');
        setI(mnav, 'left',           '0px');
        setI(mnav, 'right',          '0px');
        setI(mnav, 'background',     '#FFFFFF');
        setI(mnav, 'border',         'none');
        setI(mnav, 'border-top',     '1px solid #E4ECF7');
        setI(mnav, 'box-shadow',     '0 -1px 8px rgba(0,0,0,.05)');
        setI(mnav, 'border-radius',  '0px');
        setI(mnav, 'padding',        '4px 8px');
      } else {
        /* Dark mode: pilă flotantă originală */
        setI(mnav, 'bottom',         '12px');
        setI(mnav, 'left',           '12px');
        setI(mnav, 'right',          '12px');
        setI(mnav, 'background',     'rgba(8,11,22,.92)');
        setI(mnav, 'border',         '1px solid rgba(43,229,197,.15)');
        setI(mnav, 'box-shadow',     '0 14px 40px rgba(0,0,0,.55)');
        setI(mnav, 'border-radius',  '22px');
        setI(mnav, 'padding',        '6px');
      }
    } else if(mnav && desktop){
      setI(mnav, 'display', 'none');
    }
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(updateNav);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule, {once:true});
  } else { schedule(); }

  window.addEventListener('load',              schedule);
  window.addEventListener('resize',            schedule);
  window.addEventListener('orientationchange', function(){ setTimeout(schedule,80); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', schedule);
  }

  // Bătăi regulate — câștigăm orice race condition cu scripturi vechi
  [50,150,400,900,1600,2600,3600,5000].forEach(function(t){ setTimeout(schedule, t); });
  setInterval(schedule, 1500);
})();
