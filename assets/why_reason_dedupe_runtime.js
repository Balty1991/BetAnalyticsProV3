// BetAnalytics Pro: dedupe repeated recommendation reasons in both compact and details cards.
(function(){
  'use strict';
  if(window.__baWhyReasonDedupeSmallCardV1)return;
  window.__baWhyReasonDedupeSmallCardV1=1;

  function normText(s){
    return String(s||'')
      .replace(/&bull;|&#8226;|&#x2022;/gi,' • ')
      .replace(/&middot;|&#183;|&#xB7;/gi,' • ')
      .replace(/&nbsp;/gi,' ')
      .replace(/\u00a0/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function cleanReason(raw){
    raw=normText(raw).replace(/^De\s*ce[:\s]*/i,'').trim();
    if(!raw)return '';

    var out=[];
    var seen={};
    raw.split(/\s*(?:•|·|\||;|,)\s*/g).forEach(function(part){
      part=normText(part).replace(/^De\s*ce[:\s]*/i,'').trim();
      if(!part)return;

      var key=part.toLowerCase()
        .replace(/[.,:!?]+$/g,'')
        .replace(/\s+/g,' ')
        .trim();

      var rec=key.match(/recovery\s+probe\s+([a-z0-9.]+)/i);
      if(rec)key='recovery probe '+rec[1];

      if(seen[key])return;
      seen[key]=1;
      out.push(part);
    });

    return out.slice(0,3).join(' • ');
  }

  function cleanTextNode(node){
    var txt=node.nodeValue||'';
    if(!/recovery\s+probe/i.test(txt))return;
    var cleaned=cleanReason(txt);
    if(cleaned&&normText(txt)!==cleaned)node.nodeValue=cleaned;
  }

  function cleanElement(el){
    if(!el)return;
    var txt=el.textContent||'';
    if(!/recovery\s+probe/i.test(txt))return;

    // Pentru cardul compact: textul motivelor este de obicei într-un text node separat.
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);
    var nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(cleanTextNode);

    // Pentru container-ele care au doar textul de motiv, rescriem complet.
    var after=el.textContent||'';
    if(/recovery\s+probe/i.test(after)){
      var cleaned=cleanReason(after);
      var simpleChildren=[].slice.call(el.children||[]).filter(function(c){return !/^(BR|STRONG)$/i.test(c.tagName||'');});
      if(cleaned&&simpleChildren.length===0){
        if(/^\s*De\s*ce/i.test(after))el.innerHTML='<strong>De ce:</strong> '+cleaned;
        else el.textContent=cleaned;
      }
    }
  }

  function apply(){
    document.querySelectorAll('.match-why,.card-why,.why-box,.why,.reason,.reasons,.match-card,.match-card-pro,.fixture-card').forEach(cleanElement);
  }

  var raf=0;
  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(function(){raf=0;apply();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  window.addEventListener('load',schedule);
  document.addEventListener('click',function(){setTimeout(schedule,40);},true);
  document.addEventListener('change',function(){setTimeout(schedule,40);},true);
  try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
  var n=0,t=setInterval(function(){apply();n++;if(n>=50)clearInterval(t);},300);
})();
