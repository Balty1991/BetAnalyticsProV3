// Final guard: keep the 21-day ruler on Dashboard aligned with Istoric 21 / Toate.
(function(){
  'use strict';
  if(window.__baDashboardHistory21RulerSync)return;
  window.__baDashboardHistory21RulerSync=1;
  var DAY=86400000;
  var DOW=['Dum','Lun','Mar','Mie','Joi','Vin','Sam'];
  var MON=['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
  function n(v){return Number(v||0)}
  function unit(v){var x=n(v);return(x>=0?'+':'')+x.toFixed(1)+'u'}
  function fmt(v){try{return Math.round(n(v)).toLocaleString('ro-RO')}catch(e){return String(Math.round(n(v)))}}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function sod(d){var x=new Date(d||Date.now());x.setHours(0,0,0,0);return x}
  function dayKey(d){var x=sod(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
  function offDay(i){var d=sod(new Date());d.setDate(d.getDate()-i);return d}
  function dayLabel(d){return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]}
  function stamp(r){var raw=r&&(r.logged_at||r.prediction_created_at||r.event_date||r.eventDate||r.match_date||r.date||r.kickoff||r.start_time);var t=raw?new Date(raw).getTime():NaN;return isFinite(t)?t:0}
  function status(r){
    if(!r)return'';
    var s=String(r.status||r.result||r.outcome||'').toLowerCase().trim();
    if(s==='w'||s==='win'||s==='won'||s==='hit'||s==='success')return'win';
    if(s==='l'||s==='loss'||s==='lost'||s==='lose'||s==='lose'||s==='miss'||s==='failed'||s==='fail')return'lose';
    if(r.won===true||r.is_win===true||r.isWon===true)return'win';
    if(r.won===false||r.is_win===false||r.isWon===false)return'lose';
    return s==='pending'?'pending':'';
  }
  function profitOf(r){var o=n(r&&r.odds||r&&r.book_odds||r&&r.final_odds||r&&r.baseOdds||r&&r.market_odds);return status(r)==='win'?(o>1?o-1:0):-1}
  function rowKey(r){
    try{if(typeof window.getHistory21RowKey==='function')return window.getHistory21RowKey(r)}catch(e){}
    return [(r&&r.event_id!=null?r.event_id:''),(r&&r.market_key)||(r&&r.market)||'',String((r&&r.logged_at)||(r&&r.prediction_created_at)||(r&&r.event_date)||(r&&r.date)||'')].join('::');
  }
  function rows(){
    var cutoff=new Date(Date.now()-21*DAY),map={};
    if(typeof window.getHistory21SettledRows==='function'){
      try{(window.getHistory21SettledRows(cutoff)||[]).forEach(function(r){if(r)map[rowKey(r)]=r})}catch(e){}
    }
    if(typeof window.getHistory21LivePendingRows==='function'){
      try{(window.getHistory21LivePendingRows()||[]).forEach(function(r){if(r)map[rowKey(r)]=r})}catch(e){}
    }
    var out=Object.keys(map).map(function(k){return map[k]});
    if(out.length)return out;
    var src=Array.isArray(window.RECOMMENDATION_LOG)?window.RECOMMENDATION_LOG:[];
    src.forEach(function(r){if(r&&stamp(r)>=cutoff.getTime())map[rowKey(r)]=r});
    return Object.keys(map).map(function(k){return map[k]});
  }
  function settled(){return rows().filter(function(r){var s=status(r);return r&&(!r.source||r.source==='log')&&(s==='win'||s==='lose')})}
  function totalStats(){var list=settled(),wins=0,profit=0;list.forEach(function(r){if(status(r)==='win')wins++;profit+=profitOf(r)});return{bets:list.length,wins:wins,losses:Math.max(0,list.length-wins),profit:profit}}
  function dayStats(){
    var days=[],map={};
    for(var i=20;i>=0;i--){var d=offDay(i),k=dayKey(d);days.push(map[k]={date:d,rows:[]})}
    settled().forEach(function(r){var k=dayKey(new Date(stamp(r)));if(map[k])map[k].rows.push(r)});
    return days.map(function(d){var wins=0,profit=0,total=d.rows.length;d.rows.forEach(function(r){if(status(r)==='win')wins++;profit+=profitOf(r)});return{date:d.date,total:total,wins:wins,losses:Math.max(0,total-wins),profit:profit}});
  }
  function patchRuler(){
    var ruler=document.querySelector('.ba-21-ruler');
    if(!ruler)return;
    var s=totalStats(),data=dayStats(),max=1;
    data.forEach(function(d){max=Math.max(max,Math.abs(d.profit))});
    ruler.setAttribute('data-history21-ruler-sync','1');
    ruler.innerHTML='<div class="ba-21-ruler-head"><span>riglă 21 zile</span><span class="'+(s.profit>=0?'ba-21-total-pos':'ba-21-total-neg')+'">'+unit(s.profit)+' • '+fmt(s.wins)+'W / '+fmt(s.losses)+'L</span></div><div class="ba-21-ruler-grid">'+data.map(function(d,i){var p=d.profit,h=Math.max(3,Math.min(21,Math.abs(p)*21/max)),cl=p>0?'ba-21-up':(p<0?'ba-21-down':'ba-21-flat');return'<span class="ba-21-day" title="'+esc(dayLabel(d.date)+' • '+unit(p)+' • W '+d.wins+' / L '+d.losses)+'"><i class="ba-21-bar '+cl+'" style="'+(p?'height:'+h.toFixed(0)+'px':'')+'"></i><em class="ba-21-label">'+(i%5===0||i===20?d.date.getDate():'')+'</em></span>'}).join('')+'</div>';
  }
  function boot(){patchRuler();[80,250,700,1500,3000,6000,10000].forEach(function(t){setTimeout(patchRuler,t)});setInterval(patchRuler,350)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
