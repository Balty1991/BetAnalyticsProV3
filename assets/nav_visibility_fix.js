// ==========================================================
// VEYRA — Nav Visibility Fix v2
// Pe desktop: meniu sticky sus. Pe mobil: bara de jos mereu.
// ==========================================================
(function(){
  var root = document.documentElement;
  var body = document.body;
  var raf = 0;

  function px(n){ return Math.max(0, Math.ceil(Number(n) || 0)) + 'px'; }

  function setImportant(el, prop, val){
    if(!el) return;
    try{ el.style.setProperty(prop, val, 'important'); }catch(e){}
  }

  function updateNav(){
    raf = 0;
    body = document.body;
    if(!body) return;

    var header = document.querySelector('.header');
    var tabs   = document.querySelector('nav.tabs') || document.querySelector('.tabs');
    var mnav   = document.getElementById('mobile-nav') || document.querySelector('.mobile-nav');

    var headerH = header ? (header.getBoundingClientRect().height || 92) : 92;
    root.style.setProperty('--veyra-header-h', px(headerH));

    // ── Pe MOBIL: bara de jos rămâne mereu jos, nu se mută sus ──
    var desktopLayout = window.matchMedia && window.matchMedia('(min-width: 769px)').matches;

    // Ștergem clasele care forțează meniul sus — nu le aplicăm niciodată pe mobil
    body.classList.remove('veyra-force-top-menu');
    body.classList.remove('veyra-bottom-nav-blocked');

    // Pe desktop: activăm meniul de sus
    if(desktopLayout){
      body.classList.add('veyra-force-top-menu');
    }

    if(tabs){
      setImportant(tabs, 'top', px(headerH));
      setImportant(tabs, 'z-index', '29990');
      if(desktopLayout){
        setImportant(tabs, 'display', 'flex');
        setImportant(tabs, 'position', 'sticky');
        setImportant(tabs, 'visibility', 'visible');
        setImportant(tabs, 'opacity', '1');
      }
      var tabsH = tabs.getBoundingClientRect().height || 56;
      root.style.setProperty('--veyra-tabs-h', px(tabsH));
      root.style.setProperty('--veyra-nav-panel-top', px(headerH + tabsH));
    } else {
      root.style.setProperty('--veyra-tabs-h', '56px');
      root.style.setProperty('--veyra-nav-panel-top', px(headerH + 56));
    }

    // Pe mobil: bara de jos vizibilă și fixată jos
    if(mnav && !desktopLayout){
      setImportant(mnav, 'display',         'flex');
      setImportant(mnav, 'position',        'fixed');
      setImportant(mnav, 'bottom',          '12px');
      setImportant(mnav, 'left',            '12px');
      setImportant(mnav, 'right',           '12px');
      setImportant(mnav, 'z-index',         '9999');
      setImportant(mnav, 'background',      'rgba(8,11,22,.92)');
      setImportant(mnav, 'border-radius',   '22px');
      setImportant(mnav, 'padding',         '6px');
      setImportant(mnav, 'justify-content', 'space-around');
      setImportant(mnav, 'align-items',     'stretch');
      setImportant(mnav, 'visibility',      'visible');
      setImportant(mnav, 'opacity',         '1');
    }
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(updateNav);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule, {once:true});
  } else {
    schedule();
  }

  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', function(){ setTimeout(schedule,60); setTimeout(schedule,360); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', schedule);
  }

  [50,150,350,800,1500,2500,3500,5000].forEach(function(t){ setTimeout(schedule, t); });
  setInterval(schedule, 2000);
})();
