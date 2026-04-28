// Dashboard Performance semantic colors: ROI/profit red or green, WIN by threshold, table rows by situation.
(function(){
  'use strict';
  if(window.__baPerformanceColorRuntime)return;
  window.__baPerformanceColorRuntime=1;
  var GREEN='#34d399', RED='#fb7185', YELLOW='#f59e0b', MUTED='var(--muted,#8b98ad)', TEXT='var(--txt,#f8fafc)';
  function num(txt){var m=String(txt||'').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):0}
  function colorBySign(v){return v>0?GREEN:(v<0?RED:TEXT)}
  function colorByWin(v){return v>=65?GREEN:(v>=50?YELLOW:RED)}
  function set(el,color){if(!el)return;el.style.setProperty('color',color,'important');el.style.setProperty('text-shadow','0 0 18px '+(color===GREEN?'rgba(52,211,153,.20)':color===RED?'rgba(251,113,133,.18)':color===YELLOW?'rgba(245,158,11,.16)':'transparent'),'important')}
  function softBorder(card,color){if(!card)return;card.style.setProperty('border-color',color===GREEN?'rgba(52,211,153,.28)':color===RED?'rgba(251,113,133,.28)':color===YELLOW?'rgba(245,158,11,.25)':'rgba(255,255,255,.075)','important');card.style.setProperty('background',color===GREEN?'linear-gradient(180deg,rgba(52,211,153,.055),rgba(255,255,255,.025))':color===RED?'linear-gradient(180deg,rgba(251,113,133,.055),rgba(255,255,255,.025))':color===YELLOW?'linear-gradient(180deg,rgba(245,158,11,.052),rgba(255,255,255,.025))':'rgba(255,255,255,.025)','important')}
  function colorKpis(){
    document.querySelectorAll('.dashboard-v16-performance .dashboard-v16-stat-card').forEach(function(card){
      var k=(card.querySelector('.dashboard-v16-stat-k')||{}).textContent||'';
      var v=card.querySelector('.dashboard-v16-stat-v');
      var sub=card.querySelector('.dashboard-v16-stat-sub');
      var key=k.trim().toUpperCase();
      var x=num(v&&v.textContent);
      var c=key.indexOf('WIN')>=0?colorByWin(x):colorBySign(x);
      set(v,c);softBorder(card,c);
      if(sub){
        sub.style.setProperty('color',MUTED,'important');
        var raw=(sub.textContent||'').trim();
        if(/\d+W\s*\/\s*\d+L/i.test(raw)){
          sub.innerHTML=raw.replace(/(\d+)W/i,'<span class="ba-win-text">$1W</span>').replace(/(\d+)L/i,'<span class="ba-loss-text">$1L</span>');
        }else if(/pending\s+\d+/i.test(raw)){
          sub.innerHTML=raw.replace(/(pending\s+)(\d+)/i,'<span style="color:'+MUTED+'">$1</span><span class="ba-pending-text">$2</span>');
        }else if(/închise/i.test(raw)){
          sub.innerHTML=raw.replace(/(\d+)\s+închise/i,'<span class="ba-closed-text">$1 închise</span>');
        }
      }
    });
  }
  function colorTable(){
    document.querySelectorAll('.dashboard-v16-performance .dash-cat-table tbody tr').forEach(function(row){
      var cells=row.children;if(!cells||cells.length<5)return;
      var roi=num(cells[1].textContent), wr=num(cells[2].textContent), pend=num(cells[4].textContent);
      var rc=colorBySign(roi), wc=colorByWin(wr);
      row.classList.toggle('ba-loss-row',roi<0);row.classList.toggle('ba-profit-row',roi>0);
      set(cells[0],rc);set(cells[1],rc);set(cells[2],wc);
      cells[3].style.setProperty('color',TEXT,'important');
      cells[4].style.setProperty('color',pend>0?YELLOW:MUTED,'important');
      row.style.setProperty('box-shadow','inset 4px 0 0 '+(roi>0?'rgba(52,211,153,.78)':roi<0?'rgba(251,113,133,.78)':'rgba(148,163,184,.35)'),'important');
    });
  }
  function colorRuler(){
    document.querySelectorAll('.ba-21-ruler-head span:last-child').forEach(function(el){set(el,colorBySign(num(el.textContent)))});
    document.querySelectorAll('.ba-21-up').forEach(function(el){el.style.setProperty('background',GREEN,'important')});
    document.querySelectorAll('.ba-21-down').forEach(function(el){el.style.setProperty('background',RED,'important')});
  }
  function addCss(){
    if(document.getElementById('ba-performance-color-css'))return;
    var s=document.createElement('style');s.id='ba-performance-color-css';
    s.textContent='.ba-win-text{color:'+GREEN+'!important;font-weight:900!important}.ba-loss-text{color:'+RED+'!important;font-weight:900!important}.ba-pending-text{color:'+YELLOW+'!important;font-weight:900!important}.ba-closed-text{color:var(--txt,#f8fafc)!important;font-weight:800!important}.dashboard-v16-stat-v{font-variant-numeric:tabular-nums!important}.dash-cat-table td{transition:color .18s ease,box-shadow .18s ease!important}';
    document.head.appendChild(s);
  }
  function apply(){addCss();colorKpis();colorTable();colorRuler()}
  function boot(){apply();[100,350,900,1700,3000,6000].forEach(function(t){setTimeout(apply,t)});setInterval(apply,1200);try{new MutationObserver(function(){clearTimeout(window.__baPerformanceColorT);window.__baPerformanceColorT=setTimeout(apply,40)}).observe(document.getElementById('dashboard-modern-shell')||document.body,{childList:true,subtree:true,characterData:true})}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
