// ==========================================================
// VEYRA — Nav Visibility Fix
// Menține meniul peste fundal/carduri și mută navigarea sus când
// bara mobilă de jos este acoperită de browser sau în mod desktop.
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

  function isMobileUA(){
    return /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgA|OPR\//i.test(navigator.userAgent || '');
  }

  function updateNav(){
    raf = 0;
    body = document.body;
    if(!body) return;

    var header = document.querySelector('.header');
    var tabs = document.querySelector('nav.tabs') || document.querySelector('.tabs');
    var mobileNav = document.getElementById('mobile-nav') || document.querySelector('.mobile-nav');

    var headerH = header ? (header.getBoundingClientRect().height || 92) : 92;
    root.style.setProperty('--veyra-header-h', px(headerH));

    var desktopLayout = window.matchMedia && window.matchMedia('(min-width: 769px)').matches;
    var mobileAgent = isMobileUA();
    var vvH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var layoutH = window.innerHeight || vvH;
    var browserUiCutsViewport = !!(window.visualViewport && (layoutH - vvH > 28));

    var bottomBlocked = false;
    if(mobileNav){
      var cs = window.getComputedStyle(mobileNav);
      if(cs.display !== 'none' && cs.visibility !== 'hidden'){
        var r = mobileNav.getBoundingClientRect();
        bottomBlocked = (r.bottom > vvH - 4) || (r.top >= vvH - 8) || (r.height < 24);
      }
    }

    // Pe telefon în „desktop site”, CSS poate ascunde bara mobilă și bara top poate fi acoperită.
    // Pe telefon normal, activăm top-menu doar dacă bara de jos intră sub UI-ul browserului.
    var forceTop = desktopLayout || (mobileAgent && (bottomBlocked || browserUiCutsViewport));

    body.classList.toggle('veyra-force-top-menu', !!forceTop);
    body.classList.toggle('veyra-bottom-nav-blocked', !!(mobileAgent && (bottomBlocked || browserUiCutsViewport)));

    if(tabs){
      setImportant(tabs, 'top', px(headerH));
      setImportant(tabs, 'z-index', '29990');
      if(forceTop || desktopLayout){
        setImportant(tabs, 'display', 'flex');
        setImportant(tabs, 'position', 'sticky');
        setImportant(tabs, 'visibility', 'visible');
        setImportant(tabs, 'opacity', '1');
      }
      var tabsH = tabs.getBoundingClientRect().height || 56;
      root.style.setProperty('--veyra-tabs-h', px(tabsH));
      root.style.setProperty('--veyra-nav-panel-top', px(headerH + tabsH));
    }else{
      root.style.setProperty('--veyra-tabs-h', '56px');
      root.style.setProperty('--veyra-nav-panel-top', px(headerH + 56));
    }

    if(mobileNav && forceTop){
      setImportant(mobileNav, 'display', 'none');
      setImportant(mobileNav, 'visibility', 'hidden');
      setImportant(mobileNav, 'pointer-events', 'none');
    }
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(updateNav);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule, {once:true});
  }else{
    schedule();
  }

  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', function(){ setTimeout(schedule, 60); setTimeout(schedule, 360); });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }

  // Câștigă peste scriptul vechi care setează display/z-index cu inline !important la câteva timeout-uri.
  [50,150,350,800,1500,2500,3500,5000].forEach(function(t){ setTimeout(schedule, t); });
  setInterval(schedule, 2000);
})();
